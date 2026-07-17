import type { EmbeddingManifest } from "../types";

const MAGIC = "TWEMB01\0";
const HEADER_BYTES = 20;

export function quantizeVector(vector: number[]): Int8Array {
  const max = Math.max(...vector.map((value) => Math.abs(value)), Number.EPSILON);
  const scale = 127 / max;
  return Int8Array.from(vector, (value) => Math.max(-127, Math.min(127, Math.round(value * scale))));
}

export function encodeEmbeddingFile(vectors: number[][]): Uint8Array {
  if (vectors.length === 0) throw new Error("At least one embedding is required.");
  const dimensions = vectors[0].length;
  if (dimensions === 0 || vectors.some((vector) => vector.length !== dimensions)) {
    throw new Error("All embeddings must have the same non-zero dimension.");
  }
  const output = new Uint8Array(HEADER_BYTES + vectors.length * dimensions);
  const view = new DataView(output.buffer);
  for (let index = 0; index < MAGIC.length; index += 1) output[index] = MAGIC.charCodeAt(index);
  view.setUint32(8, 1, true);
  view.setUint32(12, dimensions, true);
  view.setUint32(16, vectors.length, true);
  vectors.forEach((vector, index) => {
    output.set(new Uint8Array(quantizeVector(vector).buffer), HEADER_BYTES + index * dimensions);
  });
  return output;
}

export function decodeEmbeddingFile(
  bytes: Uint8Array,
  manifest?: EmbeddingManifest
): { dimensions: number; count: number; vectors: Int8Array[] } {
  if (bytes.byteLength < HEADER_BYTES) throw new Error("Embedding file is truncated.");
  const magic = String.fromCharCode(...bytes.slice(0, 8));
  if (magic !== MAGIC) throw new Error("Embedding file has an invalid signature.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(8, true);
  const dimensions = view.getUint32(12, true);
  const count = view.getUint32(16, true);
  if (version !== 1) throw new Error(`Unsupported embedding version: ${version}`);
  if (bytes.byteLength !== HEADER_BYTES + count * dimensions) {
    throw new Error("Embedding file length does not match its header.");
  }
  if (manifest && (manifest.dimensions !== dimensions || manifest.count !== count)) {
    throw new Error("Embedding file and manifest do not match.");
  }
  const vectors = Array.from({ length: count }, (_, index) => {
    const start = HEADER_BYTES + index * dimensions;
    return new Int8Array(bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + start + dimensions));
  });
  return { dimensions, count, vectors };
}

export function cosineWithQuantized(query: number[], candidate: Int8Array): number {
  if (query.length !== candidate.length) throw new Error("Embedding dimension mismatch.");
  let dot = 0;
  let queryNorm = 0;
  let candidateNorm = 0;
  for (let index = 0; index < query.length; index += 1) {
    dot += query[index] * candidate[index];
    queryNorm += query[index] ** 2;
    candidateNorm += candidate[index] ** 2;
  }
  const denominator = Math.sqrt(queryNorm) * Math.sqrt(candidateNorm);
  return denominator === 0 ? 0 : dot / denominator;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
