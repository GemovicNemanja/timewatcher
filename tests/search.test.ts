import { catalogHealth, createSearchStream } from "../functions/lib/search";
import type { SearchStreamEvent } from "../src/types";

async function readEvents(stream: ReadableStream<Uint8Array>): Promise<SearchStreamEvent[]> {
  const text = await new Response(stream).text();
  return text.trim().split("\n").map((line) => JSON.parse(line) as SearchStreamEvent);
}

describe("search function", () => {
  it("has an aligned bundled catalog", () => {
    expect(catalogHealth()).toMatchObject({ watches: 12, embeddings: 12, dimensions: 768, valid: true });
  });

  it("returns exactly four recall-only results without provider secrets", async () => {
    const events = await readEvents(await createSearchStream("rugged field watch", {}));
    expect(events[0]).toEqual({ type: "meta", mode: "recall-only" });
    expect(events.filter((event) => event.type === "result")).toHaveLength(4);
    expect(events.at(-1)).toEqual({ type: "done" });
  });
});
