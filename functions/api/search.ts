import { catalogHealth, createSearchStream, type SearchEnv } from "../lib/search";

const streamHeaders = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

export const onRequestGet: PagesFunction<SearchEnv> = async () => json({ ok: true, catalog: catalogHealth() });

export const onRequestOptions: PagesFunction<SearchEnv> = async () => new Response(null, {
  status: 204,
  headers: { allow: "GET, POST, OPTIONS" }
});

export const onRequestPost: PagesFunction<SearchEnv> = async ({ request, env }) => {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) return json({ error: "Request body is too large." }, 413);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ error: "Expected an application/json request." }, 415);
  }
  let query: unknown;
  try {
    ({ query } = await request.json() as { query?: unknown });
  } catch {
    return json({ error: "Request body is not valid JSON." }, 400);
  }
  if (typeof query !== "string") return json({ error: "query must be a string." }, 400);
  const normalized = query.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 280) {
    return json({ error: "query must contain 2–280 characters." }, 400);
  }
  try {
    const stream = await createSearchStream(normalized, env, request.signal);
    return new Response(stream, { headers: streamHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search configuration failed.";
    return json({ error: message }, /missing|mismatch/i.test(message) ? 503 : 502);
  }
};
