import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";

export type LocalSecrets = {
  anthropic?: { api_key?: string; model?: string };
  openai?: { api_key?: string; embedding_model?: string };
  cloudflare?: { account_id?: string; api_token?: string };
  search?: { cache_ttl_seconds?: number };
};

export async function loadLocalSecrets(root: string): Promise<LocalSecrets> {
  const file = process.env.TIMEWATCHER_SECRETS_FILE
    ? resolve(process.env.TIMEWATCHER_SECRETS_FILE)
    : resolve(root, "secrets.yaml");
  return readFile(file, "utf8")
    .then((value) => parse(value) as LocalSecrets)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return {};
      throw error;
    });
}

export function secretValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && !trimmed.includes("replace-me") ? trimmed : undefined;
}
