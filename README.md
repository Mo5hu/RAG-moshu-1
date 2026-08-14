# Meridian Bank Grounded Assistant (RAG demo)

Banking FAQ assistant with grounded answers, visible sources, and a hard refusal on out-of-scope questions. No database, no vector store: embeddings live in a JSON file bundled with one Netlify function.

## Run order

1. **Install nothing.** Plain Node 18+ and the Netlify CLI are all you need.

2. **Generate embeddings** (re-run whenever `kb.json` changes):
   ```
   node scripts/embed.js
   ```
   Requires `GEMINI_API_KEY` in `.env`. Writes `netlify/functions/embeddings.json`.

3. **Test locally:**
   ```
   npm i -g netlify-cli   # if not installed
   netlify dev
   ```
   Set `GEMINI_API_KEY` in a local `.env` (free key from [Google AI Studio](https://aistudio.google.com/apikey)).

4. **Deploy:**
   ```
   netlify deploy --prod
   ```
   Then in the Netlify dashboard: Site settings, Environment variables, add `GEMINI_API_KEY`.

## The three demo prompts (for the Loom)

1. "What does the Horizon credit card cost per year?" — normal grounded answer with source chips
2. "Am I eligible for a personal loan on a 55,000 salary?" — answer assembled across two chunks
3. "What is your CEO's salary?" — on-camera refusal: "out of scope" state, no invented answer

## How the grounding works (one sentence for the Loom)

The query is embedded, matched against the knowledge base by cosine similarity, and if no chunk clears the relevance threshold the function refuses before the model is even asked; when chunks do match, the model is instructed to answer only from them and every reply shows its source titles.

## Costs

`gemini-embedding-001` for retrieval and `gemini-2.0-flash` for answers: free-tier limits apply on Google AI Studio.
