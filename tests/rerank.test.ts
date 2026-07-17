import { ResultObjectParser, structuredOutputFormat } from "../functions/lib/rerank";

describe("streamed structured reranking", () => {
  it("emits complete result objects across arbitrary chunks", () => {
    const parser = new ResultObjectParser();
    expect(parser.push('{"results":[{"id":"a","rea')).toEqual([]);
    expect(parser.push('son":"quiet {dial}"},{"id":"b","reason":"rugged"}]}')).toEqual([
      { id: "a", reason: "quiet {dial}" },
      { id: "b", reason: "rugged" }
    ]);
  });

  it("constrains IDs and the result count in the API schema", () => {
    const format = structuredOutputFormat(["a", "b", "c", "d"]);
    const results = format.schema.properties.results;
    expect(results.minItems).toBe(4);
    expect(results.maxItems).toBe(4);
    expect(results.items.properties.id.enum).toEqual(["a", "b", "c", "d"]);
  });
});
