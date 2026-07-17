import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { DEFAULT_RERANK_MODEL } from "../src/lib/constants";
import type { Watch } from "../src/types";
import { loadLocalSecrets, secretValue } from "./shared/secrets";

type SourceWatch = Watch & { art?: Record<string, unknown> };
type BatchState = {
  batchId: string;
  createdAt: string;
  model: string;
  requests: Array<{ customId: string; watchId: string; contentHash: string }>;
};

const root = resolve(import.meta.dirname, "..");
const cacheDirectory = resolve(root, "catalog-cache");
const descriptionCache = resolve(cacheDirectory, "descriptions");
const latestBatchPath = resolve(cacheDirectory, "batches/latest.json");
const generatedPath = resolve(root, "data/generated-descriptions.json");
const source = {
  watches: JSON.parse(await readFile(resolve(root, "src/data/catalog.json"), "utf8")) as SourceWatch[]
};
const secrets = await loadLocalSecrets(root);
const apiKey = process.env.ANTHROPIC_API_KEY ?? secretValue(secrets.anthropic?.api_key);
const model = process.env.ANTHROPIC_MODEL ?? secretValue(secrets.anthropic?.model) ?? DEFAULT_RERANK_MODEL;
const command = process.argv[2] ?? "help";

const SYSTEM_PROMPT = `You write the style layer for a high-quality watch search index. Your prose must bridge visible design and hard specifications to the natural language a person uses when they do not know watch terminology. Describe concrete visible details before interpreting them. Distinguish a quiet object from a flashy one, a formal object from a rugged one, and authentic historical cues from generic retro decoration. Explain how the watch wears, including whether its diameter, lug span, thickness, and visual mass make it compact, balanced, broad, or bulky. Discuss likely clothing and occasions without treating gender as a sizing rule. A wedding can range from black tie to a relaxed outdoor ceremony, so say which version fits. Do not claim that automatic is inherently better than quartz. Do not treat a higher price as higher quality. Do not call a water-resistance number a literal safe diving depth. Never invent a visible feature that the image does not show or a specification that was not supplied.

Use natural search concepts where justified: understated, bold, dressy, sporty, field, diver, pilot, integrated bracelet, minimalist, ornate, vintage-feeling, modern, jewellery-like, tool-like, office, wedding, black tie, weekend, outdoors, travel, small wrist, average wrist, large wrist, cuff-friendly, durable, and delicate. These terms are examples, not a checklist. Be concrete and opinionated. A useful entry can say that a watch is wrong for an occasion or request. Do not flatten every watch into versatile luxury. Do not lead with the brand history, movement architecture, reference number, price, or a list of measurements. Specs are indexed separately and should appear only as evidence for how the object wears or where it can be used. Do not use markdown, headings, bullets, slogans, or sales copy. Do not address the reader directly more than once. Write one cohesive paragraph of 150–200 words in clear international English. Return only that paragraph.`;

function requireKey(): string {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required. Add it to secrets.yaml or the environment.");
  return apiKey;
}

async function anthropic(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`https://api.anthropic.com${path}`, {
    ...init,
    headers: {
      "anthropic-version": "2023-06-01",
      "x-api-key": requireKey(),
      "content-type": "application/json",
      ...init?.headers
    }
  });
  if (!response.ok) throw new Error(`Anthropic API failed (${response.status}): ${await response.text()}`);
  return response;
}

async function contentHash(watch: SourceWatch, image: Buffer): Promise<string> {
  return createHash("sha256")
    .update(image)
    .update(JSON.stringify(watch.specs))
    .update(JSON.stringify(watch.sourceSpecifications ?? []))
    .digest("hex");
}

async function submit() {
  await mkdir(descriptionCache, { recursive: true });
  await mkdir(resolve(cacheDirectory, "batches"), { recursive: true });
  const force = process.argv.includes("--force");
  const generated = await readFile(generatedPath, "utf8")
    .then((value) => JSON.parse(value) as Record<string, string>)
    .catch(() => ({} as Record<string, string>));
  const requests: BatchState["requests"] = [];
  const payloadRequests: Array<Record<string, unknown>> = [];

  for (const watch of source.watches) {
    if (!force && watch.styleDescription?.trim()) continue;
    const avif = await readFile(resolve(root, "public/images/watches", `${watch.id}.avif`));
    const hash = await contentHash(watch, avif);
    const cachePath = resolve(descriptionCache, `${hash}.json`);
    const cached = await readFile(cachePath, "utf8").then((value) => JSON.parse(value) as { description: string }).catch(() => null);
    if (cached) {
      generated[watch.id] = cached.description;
      continue;
    }
    const webp = await sharp(avif).webp({ quality: 82, effort: 5 }).toBuffer();
    const customId = `w_${hash.slice(0, 32)}`;
    requests.push({ customId, watchId: watch.id, contentHash: hash });
    payloadRequests.push({
      custom_id: customId,
      params: {
        model,
        max_tokens: 1000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/webp", data: webp.toString("base64") } },
            { type: "text", text: `Watch data:\n${JSON.stringify({ brand: watch.brand, model: watch.model, reference: watch.reference, specs: watch.specs, sourceSpecifications: watch.sourceSpecifications })}\n\nDescribe this watch for the search index.` }
          ]
        }]
      }
    });
  }

  await writeFile(generatedPath, `${JSON.stringify(generated, null, 2)}\n`);
  if (payloadRequests.length === 0) {
    console.log("Nothing to submit. Existing descriptions or content-hash cache cover every watch. Use --force to regenerate hand-written entries.");
    return;
  }
  const response = await anthropic("/v1/messages/batches", { method: "POST", body: JSON.stringify({ requests: payloadRequests }) });
  const batch = await response.json() as { id: string };
  const state: BatchState = { batchId: batch.id, createdAt: new Date().toISOString(), model, requests };
  await writeFile(latestBatchPath, `${JSON.stringify(state, null, 2)}\n`);
  console.log(`Submitted ${requests.length} watches as batch ${batch.id}. Run \"npm run catalog:descriptions -- status\" to check it.`);
}

async function loadState(): Promise<BatchState> {
  return JSON.parse(await readFile(latestBatchPath, "utf8")) as BatchState;
}

async function status() {
  const state = await loadState();
  const response = await anthropic(`/v1/messages/batches/${state.batchId}`);
  const batch = await response.json() as { id: string; processing_status: string; request_counts: Record<string, number> };
  console.log(JSON.stringify({ id: batch.id, status: batch.processing_status, counts: batch.request_counts }, null, 2));
}

async function collect() {
  const state = await loadState();
  const statusResponse = await anthropic(`/v1/messages/batches/${state.batchId}`);
  const batch = await statusResponse.json() as { processing_status: string };
  if (batch.processing_status !== "ended") throw new Error(`Batch is ${batch.processing_status}; wait until it has ended.`);
  const response = await anthropic(`/v1/messages/batches/${state.batchId}/results`, { headers: { accept: "application/x-jsonlines" } });
  const lines = (await response.text()).split("\n").filter(Boolean);
  const byCustomId = new Map(state.requests.map((request) => [request.customId, request]));
  const generated = await readFile(generatedPath, "utf8")
    .then((value) => JSON.parse(value) as Record<string, string>)
    .catch(() => ({} as Record<string, string>));
  let collected = 0;
  for (const line of lines) {
    const item = JSON.parse(line) as {
      custom_id: string;
      result: { type: string; message?: { content?: Array<{ type: string; text?: string }> } };
    };
    const request = byCustomId.get(item.custom_id);
    if (!request || item.result.type !== "succeeded") continue;
    const description = item.result.message?.content?.find((block) => block.type === "text")?.text?.trim();
    if (!description) continue;
    generated[request.watchId] = description;
    await writeFile(resolve(descriptionCache, `${request.contentHash}.json`), `${JSON.stringify({ watchId: request.watchId, description }, null, 2)}\n`);
    collected += 1;
  }
  await writeFile(generatedPath, `${JSON.stringify(generated, null, 2)}\n`);
  console.log(`Collected ${collected}/${state.requests.length} descriptions by custom_id. Run catalog:compile and catalog:embeddings next.`);
}

if (command === "submit") await submit();
else if (command === "status") await status();
else if (command === "collect") await collect();
else {
  console.log("Usage: npm run catalog:descriptions -- <submit|status|collect> [--force]");
  console.log("submit skips hand-written descriptions unless --force is supplied and always reuses the content-hash cache.");
}
