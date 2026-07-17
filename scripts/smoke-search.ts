import { createSearchStream, type SearchEnv } from "../functions/lib/search";
import type { SearchStreamEvent } from "../src/types";
import { loadLocalSecrets, secretValue } from "./shared/secrets";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const secrets = await loadLocalSecrets(root);
const env: SearchEnv = {
  ANTHROPIC_API_KEY: secretValue(secrets.anthropic?.api_key),
  ANTHROPIC_MODEL: secretValue(secrets.anthropic?.model),
  OPENAI_API_KEY: secretValue(secrets.openai?.api_key),
  OPENAI_EMBEDDING_MODEL: secretValue(secrets.openai?.embedding_model),
  SEARCH_CACHE_TTL_SECONDS: "0",
  ASSETS: {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (!/^\/images\/rerank\/[a-z0-9-]+\.webp$/.test(pathname)) return new Response(null, { status: 404 });
      const bytes = await readFile(resolve(root, "public", pathname.replace(/^\/+/, ""))).catch(() => null);
      return bytes
        ? new Response(new Uint8Array(bytes), { headers: { "content-type": "image/webp" } })
        : new Response(null, { status: 404 });
    }
  }
};

if (!env.ANTHROPIC_API_KEY || !env.OPENAI_API_KEY) {
  throw new Error("Both anthropic.api_key and openai.api_key are required in secrets.yaml for this smoke test.");
}

const query = process.argv.slice(2).join(" ").trim()
  || "understated automatic watch for a wedding under $5,000";
const text = await new Response(await createSearchStream(query, env)).text();
const events = text.trim().split("\n").map((line) => JSON.parse(line) as SearchStreamEvent);
const error = events.find((event) => event.type === "error");
if (error?.type === "error") throw new Error(error.message);
const meta = events.find((event) => event.type === "meta");
const results = events.filter((event): event is Extract<SearchStreamEvent, { type: "result" }> => event.type === "result");
if (meta?.type !== "meta" || meta.mode !== "semantic-rerank") {
  throw new Error(`Expected semantic-rerank mode, received ${meta?.type === "meta" ? meta.mode : "no meta event"}.`);
}
if (results.length !== 4 || new Set(results.map((event) => event.result.id)).size !== 4) {
  throw new Error(`Expected exactly four unique results, received ${results.length}.`);
}
if (events.at(-1)?.type !== "done") throw new Error("Search stream did not finish with a done event.");

console.log(JSON.stringify({
  ok: true,
  mode: meta.mode,
  query,
  results: results.map((event) => event.result)
}, null, 2));
