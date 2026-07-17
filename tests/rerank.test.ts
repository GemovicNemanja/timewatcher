import catalogJson from "../src/data/catalog.json";
import {
  candidatePayload,
  rerankUserContent,
  ResultObjectParser,
  structuredOutputFormat
} from "../functions/lib/rerank";
import type { Watch } from "../src/types";

describe("streamed structured reranking", () => {
  it("emits complete result objects across arbitrary chunks", () => {
    const parser = new ResultObjectParser();
    expect(parser.push('{"results":[{"id":"a","rea')).toEqual([]);
    expect(parser.push('son":"quiet {dial}"},{"id":"b","reason":"rugged"}]}')).toEqual([
      { id: "a", reason: "quiet {dial}" },
      { id: "b", reason: "rugged" }
    ]);
  });

  it("constrains IDs and uses Anthropic-compatible array bounds", () => {
    const format = structuredOutputFormat(["a", "b", "c", "d"]);
    const results = format.schema.properties.results;
    expect(results.minItems).toBe(1);
    expect("maxItems" in results).toBe(false);
    expect(results.items.properties.id.enum).toEqual(["a", "b", "c", "d"]);
  });

  it("sends Claude the complete normalized and manufacturer record", () => {
    const watch = (catalogJson as Watch[]).find(({ id }) => id === "hamilton-khaki-navy-h77525553")!;
    expect(candidatePayload(watch)).toMatchObject({
      id: watch.id,
      reference: watch.reference,
      price: watch.price,
      specs: watch.specs,
      sourceSpecifications: watch.sourceSpecifications,
      provenance: watch.provenance,
      dialColorEvidence: { families: ["cream"] }
    });
  });

  it("places each candidate photo immediately before its matching record", () => {
    const watch = (catalogJson as Watch[])[0];
    const content = rerankUserContent("cream dial", [watch], [{
      id: watch.id,
      mediaType: "image/webp",
      data: "d2VicA=="
    }]);
    expect(content.map(({ type }) => type)).toEqual(["text", "image", "text"]);
    expect(content[1]).toMatchObject({
      source: { type: "base64", media_type: "image/webp", data: "d2VicA==" }
    });
    expect(content[2].text).toContain(`Candidate ${watch.id}`);
    expect(content[2].text).toContain(watch.reference);
  });
});
