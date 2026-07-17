import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadLocalSecrets, secretValue } from "./shared/secrets";

const root = resolve(import.meta.dirname, "..");
const secrets = await loadLocalSecrets(root);
const values: Record<string, string | undefined> = {
  ANTHROPIC_API_KEY: secretValue(secrets.anthropic?.api_key),
  ANTHROPIC_MODEL: secretValue(secrets.anthropic?.model) ?? "claude-opus-4-8",
  OPENAI_API_KEY: secretValue(secrets.openai?.api_key),
  OPENAI_EMBEDDING_MODEL: secretValue(secrets.openai?.embedding_model) ?? "text-embedding-3-small",
  SEARCH_CACHE_TTL_SECONDS: String(secrets.search?.cache_ttl_seconds ?? 3600)
};

for (const [key, value] of Object.entries(values)) {
  if (value?.includes("\n") || value?.includes("\r")) throw new Error(`${key} cannot contain a newline.`);
}

const lines = Object.entries(values)
  .filter((entry): entry is [string, string] => Boolean(entry[1]))
  .map(([key, value]) => `${key}=${value}`);
await writeFile(resolve(root, ".dev.vars"), `${lines.join("\n")}\n`, { mode: 0o600 });
console.log(`Wrote ${lines.length} local Worker variables to .dev.vars (mode 0600).`);
if (!values.ANTHROPIC_API_KEY) console.warn("ANTHROPIC_API_KEY is missing; runtime search will use recall-only mode.");
if (!values.OPENAI_API_KEY) console.warn("OPENAI_API_KEY is missing; only a local-hash catalog can be queried.");
