import catalogJson from "../../src/data/catalog.json";
import { EMBEDDINGS_BASE64, EMBEDDINGS_MANIFEST } from "../../src/data/embeddings.generated";
import { DEFAULT_EMBEDDING_MODEL, DEFAULT_RERANK_MODEL, SEARCH_RESULT_COUNT, SHORTLIST_COUNT } from "../../src/lib/constants";
import { base64ToBytes, cosineWithQuantized, decodeEmbeddingFile } from "../../src/lib/embeddings";
import { formatMoney, formatMovement } from "../../src/lib/format";
import { localEmbedding } from "../../src/lib/local-embedding";
import type { SearchResult, SearchStreamEvent, Watch } from "../../src/types";
import {
  anthropicTextDeltas,
  candidatePayload,
  RERANK_SYSTEM_PROMPT,
  ResultObjectParser,
  structuredOutputFormat
} from "./rerank";

export type SearchEnv = {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_EMBEDDING_MODEL?: string;
  SEARCH_CACHE_TTL_SECONDS?: string;
};

type SearchMode = "semantic-rerank" | "recall-only" | "local-demo";
type CachedSearch = { expires: number; results: SearchResult[]; mode: SearchMode };

const catalog = catalogJson as Watch[];
const watchById = new Map(catalog.map((watch) => [watch.id, watch]));
const decoded = decodeEmbeddingFile(base64ToBytes(EMBEDDINGS_BASE64), EMBEDDINGS_MANIFEST);
const embeddingById = new Map(
  EMBEDDINGS_MANIFEST.ids.map((id, index) => [id, decoded.vectors[index]])
);
const resultCache = new Map<string, CachedSearch>();

function ndjson(event: SearchStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

function resultReason(watch: Watch, query: string): string {
  const width = watch.specs.caseWidthMm ?? watch.specs.caseDiameterMm;
  const budget = /under|below|budget|affordable|value/i.test(query) && watch.price.retail !== null
    ? `${formatMoney(watch.price.retail)} retail, `
    : "";
  return `${budget}${width}mm, ${formatMovement(watch.specs.movementType).toLowerCase()}, and ${watch.specs.waterResistanceM}m water resistance make it a strong style-and-fit match.`;
}

function immediateStream(mode: SearchMode, results: SearchResult[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(ndjson({ type: "meta", mode }));
      results.forEach((result) => controller.enqueue(ndjson({ type: "result", result })));
      controller.enqueue(ndjson({ type: "done" }));
      controller.close();
    }
  });
}

async function embedQuery(query: string, env: SearchEnv): Promise<number[]> {
  if (EMBEDDINGS_MANIFEST.provider === "local-hash") {
    return localEmbedding(query, EMBEDDINGS_MANIFEST.dimensions);
  }
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing for this production embedding catalog.");
  }
  const model = env.OPENAI_EMBEDDING_MODEL || EMBEDDINGS_MANIFEST.model || DEFAULT_EMBEDDING_MODEL;
  if (model !== EMBEDDINGS_MANIFEST.model) {
    throw new Error(`Embedding model mismatch: catalog uses ${EMBEDDINGS_MANIFEST.model}, runtime is configured for ${model}.`);
  }
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: query,
      dimensions: EMBEDDINGS_MANIFEST.dimensions,
      encoding_format: "float"
    })
  });
  if (!response.ok) throw new Error(`Query embedding failed (${response.status}).`);
  const payload = await response.json() as { data?: Array<{ embedding?: number[] }> };
  const vector = payload.data?.[0]?.embedding;
  if (!vector || vector.length !== EMBEDDINGS_MANIFEST.dimensions) {
    throw new Error("Query embedding returned an unexpected shape.");
  }
  return vector;
}

function shortlist(queryEmbedding: number[]): Watch[] {
  return catalog
    .map((watch) => {
      const embedding = embeddingById.get(watch.id);
      if (!embedding) throw new Error(`Missing catalog embedding: ${watch.id}`);
      return { watch, score: cosineWithQuantized(queryEmbedding, embedding) };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.min(SHORTLIST_COUNT, catalog.length))
    .map(({ watch }) => watch);
}

async function cacheKey(query: string): Promise<string> {
  const bytes = new TextEncoder().encode(query.trim().toLowerCase().replace(/\s+/g, " "));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function putCache(key: string, value: CachedSearch) {
  resultCache.set(key, value);
  if (resultCache.size > 200) resultCache.delete(resultCache.keys().next().value as string);
}

export async function createSearchStream(query: string, env: SearchEnv, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const key = await cacheKey(query);
  const cached = resultCache.get(key);
  if (cached && cached.expires > Date.now()) return immediateStream(cached.mode, cached.results);

  const queryEmbedding = await embedQuery(query, env);
  const candidates = shortlist(queryEmbedding);
  if (!env.ANTHROPIC_API_KEY) {
    const results = candidates.slice(0, SEARCH_RESULT_COUNT).map((watch) => ({ id: watch.id, reason: resultReason(watch, query) }));
    putCache(key, { expires: Date.now() + 60_000, results, mode: "recall-only" });
    return immediateStream("recall-only", results);
  }

  const ttl = Math.max(0, Number(env.SEARCH_CACHE_TTL_SECONDS ?? 3600)) * 1000;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(ndjson({ type: "meta", mode: "semantic-rerank" }));
      const emitted: SearchResult[] = [];
      const allowedIds = new Set(candidates.map((watch) => watch.id));
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          signal,
          headers: {
            "anthropic-version": "2023-06-01",
            "x-api-key": env.ANTHROPIC_API_KEY!,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: env.ANTHROPIC_MODEL || DEFAULT_RERANK_MODEL,
            max_tokens: 2048,
            stream: true,
            thinking: { type: "adaptive" },
            output_config: {
              effort: "low",
              format: structuredOutputFormat([...allowedIds])
            },
            system: [{
              type: "text",
              text: RERANK_SYSTEM_PROMPT,
              cache_control: { type: "ephemeral", ttl: "1h" }
            }],
            messages: [{
              role: "user",
              content: `User query (verbatim):\n${query}\n\nCandidates:\n${JSON.stringify(candidates.map(candidatePayload))}`
            }]
          })
        });
        if (!response.ok) throw new Error(`Reranking failed (${response.status}): ${await response.text()}`);
        const parser = new ResultObjectParser();
        for await (const text of anthropicTextDeltas(response)) {
          for (const result of parser.push(text)) {
            const reason = typeof result.reason === "string" ? result.reason.trim() : "";
            if (!allowedIds.has(result.id) || !reason || emitted.some((item) => item.id === result.id)) continue;
            const validated = { id: result.id, reason };
            emitted.push(validated);
            controller.enqueue(ndjson({ type: "result", result: validated }));
          }
        }
        for (const watch of candidates) {
          if (emitted.length >= SEARCH_RESULT_COUNT) break;
          if (emitted.some((result) => result.id === watch.id)) continue;
          const fallback = { id: watch.id, reason: resultReason(watch, query) };
          emitted.push(fallback);
          controller.enqueue(ndjson({ type: "result", result: fallback }));
        }
        const finalResults = emitted.slice(0, SEARCH_RESULT_COUNT);
        if (ttl > 0) putCache(key, { expires: Date.now() + ttl, results: finalResults, mode: "semantic-rerank" });
        controller.enqueue(ndjson({ type: "done" }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Search failed.";
        controller.enqueue(ndjson({ type: "error", message, code: "RERANK_FAILED" }));
      } finally {
        controller.close();
      }
    }
  });
}

export function catalogHealth() {
  return {
    watches: catalog.length,
    embeddings: decoded.count,
    dimensions: decoded.dimensions,
    provider: EMBEDDINGS_MANIFEST.provider,
    model: EMBEDDINGS_MANIFEST.model,
    valid: catalog.length === decoded.count && EMBEDDINGS_MANIFEST.ids.every((id) => watchById.has(id))
  };
}
