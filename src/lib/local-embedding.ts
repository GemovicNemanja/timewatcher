const TOKEN_PATTERN = /[a-z0-9]+(?:[-'][a-z0-9]+)*/g;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "i",
  "in",
  "is",
  "it",
  "like",
  "of",
  "on",
  "or",
  "something",
  "that",
  "the",
  "this",
  "to",
  "with"
]);

const EXPANSIONS: Record<string, string[]> = {
  wedding: ["formal", "dress", "understated", "shirt", "cuff", "elegant"],
  rugged: ["durable", "field", "diver", "tool", "outdoors", "tough"],
  vintage: ["heritage", "retro", "cream", "domed", "traditional"],
  small: ["compact", "slender", "36mm", "37mm", "38mm"],
  understated: ["quiet", "minimal", "subtle", "dress", "clean"],
  flashy: ["gold", "bright", "polished", "jewelry", "bold"],
  sporty: ["sport", "bracelet", "waterproof", "casual"],
  cheap: ["affordable", "budget", "value"],
  cream: ["ivory", "warm", "off-white", "vintage"],
  waterproof: ["water", "diver", "swimming", "resistance"]
};

function hash(value: string, seed: number): number {
  let output = seed >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    output ^= value.charCodeAt(i);
    output = Math.imul(output, 16777619);
  }
  return output >>> 0;
}

function tokens(text: string): string[] {
  const base = text.toLowerCase().match(TOKEN_PATTERN) ?? [];
  const filtered = base.filter((token) => !STOP_WORDS.has(token));
  return filtered.flatMap((token) => [token, ...(EXPANSIONS[token] ?? [])]);
}

export function localEmbedding(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const words = tokens(text);
  for (let index = 0; index < words.length; index += 1) {
    const token = words[index];
    const bucket = hash(token, 2166136261) % dimensions;
    const sign = (hash(token, 3339675911) & 1) === 0 ? 1 : -1;
    vector[bucket] += sign;

    if (index > 0) {
      const bigram = `${words[index - 1]}_${token}`;
      const bigramBucket = hash(bigram, 2166136261) % dimensions;
      const bigramSign = (hash(bigram, 3339675911) & 1) === 0 ? 1 : -1;
      vector[bigramBucket] += bigramSign * 0.5;
    }
  }

  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => value / norm);
}
