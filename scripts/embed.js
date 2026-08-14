// Run once (and re-run whenever kb.json changes):
//   node scripts/embed.js
// Writes netlify/functions/embeddings.json so the serverless function can
// bundle it with no database or vector store.

const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^(GEMINI_API_KEY|OPENAI_API_KEY)=(.*)$/);
    if (m && !process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = m[2].trim();
  }
}

const KB_PATH = path.join(__dirname, "..", "kb.json");
const OUT_PATH = path.join(__dirname, "..", "netlify", "functions", "embeddings.json");
const EMBED_MODEL = "gemini-embedding-001";

async function embedText(apiKey, text) {
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

  if (!res.ok) {
    throw new Error(`Embedding request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.embedding.values;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Set GEMINI_API_KEY in .env before running.");
    process.exit(1);
  }

  const kb = JSON.parse(fs.readFileSync(KB_PATH, "utf8"));
  const out = [];

  for (const chunk of kb) {
    const text = `${chunk.title}\n${chunk.text}`;
    const embedding = await embedText(apiKey, text);
    out.push({ title: chunk.title, text: chunk.text, embedding });
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out));
  console.log(`Wrote ${out.length} chunks to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
