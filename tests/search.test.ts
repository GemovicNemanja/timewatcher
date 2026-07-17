import catalog from "../src/data/catalog.json";
import { catalogHealth, createSearchStream, extractQueryConstraints } from "../functions/lib/search";
import { dialColorConstraintTier } from "../src/lib/visual-search";
import type { Watch } from "../src/types";
import type { SearchStreamEvent } from "../src/types";

async function readEvents(stream: ReadableStream<Uint8Array>): Promise<SearchStreamEvent[]> {
  const text = await new Response(stream).text();
  return text.trim().split("\n").map((line) => JSON.parse(line) as SearchStreamEvent);
}

describe("search function", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://api.openai.com/v1/embeddings") {
        return new Response(JSON.stringify({ data: [{ index: 0, embedding: Array(768).fill(1) }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      throw new Error(`Unexpected test request: ${url}`);
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("has an aligned bundled catalog", () => {
    const health = catalogHealth();
    expect(health.watches).toBeGreaterThanOrEqual(300);
    expect(health.embeddings).toBe(health.watches);
    expect(health).toMatchObject({ dimensions: 768, valid: true });
  });

  it("returns exactly four recall-only results without an Anthropic key", async () => {
    const events = await readEvents(await createSearchStream("rugged field watch", { OPENAI_API_KEY: "test-key" }));
    expect(events[0]).toEqual({ type: "meta", mode: "recall-only" });
    expect(events.filter((event) => event.type === "result")).toHaveLength(4);
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("applies explicit price and movement constraints before keyless recall", async () => {
    expect(extractQueryConstraints("automatic watch under $5,000")).toEqual({
      maxRetail: 5000,
      maxCaseMm: null,
      movementType: "automatic",
      dialColors: []
    });
    const events = await readEvents(await createSearchStream("automatic watch under $5,000", { OPENAI_API_KEY: "test-key" }));
    const watches = catalog as Watch[];
    const results = events.filter((event) => event.type === "result");
    expect(results).toHaveLength(4);
    for (const event of results) {
      if (event.type !== "result") continue;
      const watch = watches.find((candidate) => candidate.id === event.result.id)!;
      expect(watch.price.retail).not.toBeNull();
      expect(watch.price.retail!).toBeLessThanOrEqual(5000);
      expect(watch.specs.movementType).toBe("automatic");
    }
  });

  it("does not turn negated automatic language into a movement constraint", () => {
    expect(extractQueryConstraints("doesn't need to be automatic, under 38mm")).toEqual({
      maxRetail: null,
      maxCaseMm: 38,
      movementType: null,
      dialColors: []
    });
  });

  it("never backfills known blue dials when four verified cream dials exist", async () => {
    const events = await readEvents(await createSearchStream(
      "vintage-feeling field watch with a cream dial",
      { OPENAI_API_KEY: "test-key" }
    ));
    const watches = catalog as Watch[];
    const results = events.filter((event) => event.type === "result");
    expect(results).toHaveLength(4);
    for (const event of results) {
      if (event.type !== "result") continue;
      const watch = watches.find((candidate) => candidate.id === event.result.id)!;
      const dial = watch.sourceSpecifications?.find(({ name }) =>
        /^(?:dial color|dialhue)$/i.test(name)
      )?.value;
      expect(dial).toMatch(/beige|ivoire/i);
    }
  });

  it("restores verified matches ahead of an adversarial Claude order and attaches every candidate image", async () => {
    let rerankBody: Record<string, any> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === "https://api.openai.com/v1/embeddings") {
        return new Response(JSON.stringify({ data: [{ index: 0, embedding: Array(768).fill(1) }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url === "https://api.anthropic.com/v1/messages") {
        rerankBody = JSON.parse(String(init?.body)) as Record<string, any>;
        const allowed = rerankBody.output_config.format.schema.properties.results.items.properties.id.enum as string[];
        const watches = catalog as Watch[];
        const unknownIds = allowed.filter((id) =>
          dialColorConstraintTier(watches.find((watch) => watch.id === id)!, ["brown"]) === 1
        ).slice(0, 4);
        const json = JSON.stringify({
          results: unknownIds.map((id) => ({ id, reason: "Claude deliberately preferred an unverified dial." }))
        });
        const event = JSON.stringify({
          type: "content_block_delta",
          delta: { type: "text_delta", text: json }
        });
        return new Response(`data: ${event}\n\n`, { status: 200 });
      }
      throw new Error(`Unexpected test request: ${url}`);
    }));

    const events = await readEvents(await createSearchStream("brown dial adversarial verification", {
      OPENAI_API_KEY: "test-key",
      ANTHROPIC_API_KEY: "test-anthropic-key",
      ASSETS: { fetch: async () => new Response(new Uint8Array([1, 2, 3])) },
      SEARCH_CACHE_TTL_SECONDS: "0"
    }));
    const watches = catalog as Watch[];
    const results = events.filter((event): event is Extract<SearchStreamEvent, { type: "result" }> => event.type === "result");
    expect(results).toHaveLength(4);
    expect(results.slice(0, 2).every(({ result }) =>
      dialColorConstraintTier(watches.find((watch) => watch.id === result.id)!, ["brown"]) === 0
    )).toBe(true);
    const content = rerankBody!.messages[0].content as Array<{ type: string }>;
    const allowed = rerankBody!.output_config.format.schema.properties.results.items.properties.id.enum as string[];
    expect(content.filter(({ type }) => type === "image")).toHaveLength(allowed.length);
  });
});
