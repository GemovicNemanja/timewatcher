import {
  cosineWithQuantized,
  decodeEmbeddingFile,
  encodeEmbeddingFile,
  quantizeVector
} from "../src/lib/embeddings";
import { localEmbedding } from "../src/lib/local-embedding";

describe("embedding catalog", () => {
  it("encodes and decodes the versioned int8 binary format", () => {
    const vectors = [[1, 0, -1], [0.25, 0.5, 0.75]];
    const encoded = encodeEmbeddingFile(vectors);
    const decoded = decodeEmbeddingFile(encoded);
    expect(decoded.count).toBe(2);
    expect(decoded.dimensions).toBe(3);
    expect([...decoded.vectors[0]]).toEqual([...quantizeVector(vectors[0])]);
  });

  it("scores aligned vectors above opposed vectors", () => {
    expect(cosineWithQuantized([1, 0], new Int8Array([127, 0]))).toBeCloseTo(1);
    expect(cosineWithQuantized([1, 0], new Int8Array([-127, 0]))).toBeCloseTo(-1);
  });

  it("produces deterministic, normalized local fallback embeddings", () => {
    const first = localEmbedding("understated wedding watch", 768);
    const second = localEmbedding("understated wedding watch", 768);
    expect(first).toEqual(second);
    expect(Math.hypot(...first)).toBeCloseTo(1);
  });
});
