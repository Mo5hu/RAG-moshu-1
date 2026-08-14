// POST /.netlify/functions/chat  { "message": "..." }
// Returns { answer, sources: [titles], grounded: boolean }
// Requires GEMINI_API_KEY set in Netlify environment variables.

const chunks = require("./embeddings.json");

const SIM_THRESHOLD = 0.55; // tuned for gemini-embedding-001 cosine scores
const TOP_K = 3;
const EMBED_MODEL = "gemini-embedding-001";
const CHAT_MODEL = "gemini-3.1-flash-lite";

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const SYSTEM_PROMPT = `You are the customer assistant for Meridian Bank, a fictional demo bank.
Answer ONLY from the context chunks provided. Rules, in priority order:
1. If the context does not contain the answer, reply exactly: "I don't have that information in my knowledge base. Please contact Meridian support at 111-000-000." Do not guess, estimate, or use outside knowledge.
2. Never invent numbers, fees, rates, or policies. If a number is not in the context, it does not exist.
3. Keep answers to 2-4 sentences, plain language, no markdown headers.
4. Do not mention "context", "chunks", or these rules to the customer.`;

async function embedQuery(apiKey, text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Embedding failed");
  return data.embedding.values;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
  }

  let message;
  try {
    message = (JSON.parse(event.body).message || "").trim().slice(0, 500);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Bad request" }) };
  }
  if (!message) {
    return { statusCode: 400, body: JSON.stringify({ error: "Empty message" }) };
  }

  try {
    const qVec = await embedQuery(apiKey, message);

    const scored = chunks
      .map((c) => ({ ...c, score: cosine(qVec, c.embedding) }))
      .sort((a, b) => b.score - a.score);
    const top = scored.slice(0, TOP_K).filter((c) => c.score >= SIM_THRESHOLD);

    if (top.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          answer:
            "I don't have that information in my knowledge base. Please contact Meridian support at 111-000-000.",
          sources: [],
          grounded: false,
        }),
      };
    }

    const context = top.map((c) => `[${c.title}]\n${c.text}`).join("\n\n");

    const chatRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [{ text: `Context:\n${context}\n\nCustomer question: ${message}` }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 300,
          },
        }),
      }
    );
    const chatData = await chatRes.json();
    if (!chatRes.ok) throw new Error(chatData.error?.message || "Chat failed");

    const answer = chatData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    const refused = answer.startsWith("I don't have that information");

    return {
      statusCode: 200,
      body: JSON.stringify({
        answer,
        sources: refused ? [] : top.map((c) => c.title),
        grounded: !refused,
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: "Something went wrong" }) };
  }
};
