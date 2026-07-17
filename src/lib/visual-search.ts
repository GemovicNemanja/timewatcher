import type { Watch } from "../types";

export type DialColorFamily =
  | "cream"
  | "white"
  | "silver"
  | "grey"
  | "black"
  | "blue"
  | "green"
  | "red"
  | "brown"
  | "gold"
  | "pink"
  | "purple"
  | "orange"
  | "yellow";

export type VisualQueryConstraints = {
  dialColors: DialColorFamily[];
};

export type DialColorEvidence = {
  families: DialColorFamily[];
  sources: string[];
};

const colorPatterns: Array<{ family: DialColorFamily; pattern: RegExp }> = [
  { family: "cream", pattern: /\b(?:cream|ivory|ivoire|beige|ecru|off[-\s]?white|parchment|eggshell)\b/i },
  { family: "white", pattern: /\b(?:white|blanc|porcelain)\b/i },
  { family: "silver", pattern: /\b(?:silver|silvery|argent(?:e|é)?)\b/i },
  { family: "grey", pattern: /\b(?:grey|gray|gris|anthracite|slate)\b/i },
  { family: "black", pattern: /\b(?:black|noir|onyx)\b/i },
  { family: "blue", pattern: /\b(?:blue|bleu|navy|azure|aqua|turquoise)\b/i },
  { family: "green", pattern: /\b(?:green|vert|olive|khaki|kaki|emerald)\b/i },
  { family: "red", pattern: /\b(?:red|burgundy|bordeaux|crimson)\b/i },
  { family: "brown", pattern: /\b(?:brown|brun|chocolate|tobacco|bronze)\b/i },
  { family: "gold", pattern: /\b(?:(?:yellow|pink|rose|sand)\s+gold|gold|golden|gilt|champagne)\b/i },
  { family: "pink", pattern: /\b(?:pink|rose)\b/i },
  { family: "purple", pattern: /\b(?:purple|violet|lavender)\b/i },
  { family: "orange", pattern: /\b(?:orange|coral)\b/i },
  { family: "yellow", pattern: /\b(?:yellow|mustard)\b/i }
];

type ColorMention = { family: DialColorFamily; index: number; length: number };

function colorMentions(text: string): ColorMention[] {
  return colorPatterns
    .flatMap(({ family, pattern }) => {
      const globalPattern = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
      return [...text.matchAll(globalPattern)].map((match) => ({
        family,
        index: match.index,
        length: match[0].length
      }));
    })
    .sort((left, right) => left.index - right.index);
}

function uniqueFamilies(mentions: Array<{ family: DialColorFamily }>): DialColorFamily[] {
  return [...new Set(mentions.map(({ family }) => family))];
}

function isNegated(text: string, index: number): boolean {
  let clause = text.slice(Math.max(0, index - 64), index).split(/[,.;]/).at(-1) ?? "";
  if (/\banything\s+but\b/i.test(clause)) return true;
  const contrast = [...clause.matchAll(/\b(?:but|instead|rather)\b/gi)].at(-1);
  if (contrast?.index !== undefined) clause = clause.slice(contrast.index + contrast[0].length);
  return /\b(?:not|no|without|avoid|avoiding|excluding|exclude)\b/i.test(clause);
}

export function extractVisualQueryConstraints(query: string): VisualQueryConstraints {
  const dialTerms = [...query.matchAll(/\b(?:dials?|watch\s+faces?|faces?)\b/gi)]
    .map((match) => ({ index: match.index, length: match[0].length }));
  if (dialTerms.length === 0) return { dialColors: [] };
  const nonDialComponents = "bezel|case|hands?|indices|markers?|numerals?|accents?|subdials?|counters?|strap|bracelet|band|leather|rubber|canvas";
  const componentWords = new RegExp(`\\b(?:${nonDialComponents})\\b`, "i");
  const relevantMentions = colorMentions(query).filter(({ index, length }) => {
    if (isNegated(query, index)) return false;
    const before = query.slice(Math.max(0, index - 28), index);
    const after = query.slice(index + length, index + length + 28);
    if (new RegExp(`\\b(?:${nonDialComponents})\\s+(?:is\\s+|in\\s+|of\\s+)$`, "i").test(before)) {
      return false;
    }
    if (new RegExp(`^\\s*(?:[-–—]?\\s*colou?red\\s+)?(?:${nonDialComponents})\\b`, "i").test(after)) {
      return false;
    }
    return dialTerms.some((dial) => {
      const start = Math.min(index, dial.index);
      const end = Math.max(index + length, dial.index + dial.length);
      if (end - start > 100) return false;
      return !componentWords.test(query.slice(start, end));
    });
  });
  return {
    dialColors: uniqueFamilies(relevantMentions)
  };
}

function dialSpecifications(watch: Watch) {
  return (watch.sourceSpecifications ?? []).filter(({ name }) => {
    const normalized = name.trim().toLowerCase();
    return /^(?:dial|dial colou?r|overview dial colou?r|dialhue|case dial description)$/.test(normalized);
  });
}

function primaryDialText(name: string, value: string): string {
  if (/(?:colou?r|hue)/i.test(name)) return value;
  const throughDial = value.match(/^(.{0,100}?\bdial\b)/i)?.[1];
  if (throughDial) return throughDial;
  const component = /\b(?:bezel|hands?|indices|markers?|numerals?|subdials?|counters?)\b/i.exec(value);
  if (!component?.index) return component ? "" : value;
  const beforeComponent = value.slice(0, component.index);
  if (component.index < 40 && !/[,;.]/.test(beforeComponent)) return "";
  return beforeComponent;
}

export function dialColorEvidence(watch: Watch): DialColorEvidence {
  const specifications = dialSpecifications(watch);
  const explicitColorSpecifications = specifications.filter(({ name }) => /(?:colou?r|hue)/i.test(name));
  const preferred = explicitColorSpecifications.length > 0 ? explicitColorSpecifications : specifications;
  const evidence: Array<{ family: DialColorFamily; source: string }> = [];

  for (const specification of preferred) {
    const mentions = colorMentions(primaryDialText(specification.name, specification.value));
    if (mentions.length === 0) continue;
    const compoundColor = /\b(?:bleu-gris|blue[- ]gr[ae]y|white silver-plated)\b/i.test(specification.value);
    const selected = compoundColor
      ? [...new Set(mentions.map(({ family }) => family))]
      : [mentions[0].family];
    selected.forEach((family) => evidence.push({
      family,
      source: `${specification.name}: ${specification.value}`
    }));
  }

  return {
    families: [...new Set(evidence.map(({ family }) => family))],
    sources: [...new Set(evidence.map(({ source }) => source))]
  };
}

export function dialColorConstraintTier(watch: Watch, requested: DialColorFamily[]): 0 | 1 | 2 {
  if (requested.length === 0) return 0;
  const evidence = dialColorEvidence(watch);
  if (evidence.families.length === 0) return 1;
  return evidence.families.some((family) => requested.includes(family)) ? 0 : 2;
}

export function queryNeedsVision(query: string): boolean {
  return /\b(?:dial|face|bezel|hands?|indices|markers?|numerals?|strap|bracelet|colour|color|finish|texture|cream|ivory|beige|minimalist|ornate|flashy|understated|vintage|retro)\b/i.test(query);
}

export function watchSearchDocument(watch: Watch): string {
  const dial = dialColorEvidence(watch);
  const normalizedSpecs = Object.entries(watch.specs)
    .filter(([, value]) => value !== null && value !== "unknown")
    .map(([name, value]) => `${name}: ${value}`)
    .join("; ");
  const officialSpecs = (watch.sourceSpecifications ?? [])
    .map(({ name, value }) => `${name}: ${value}`)
    .join("; ");
  return [
    `${watch.brand} ${watch.model} ${watch.reference}`,
    watch.styleDescription,
    dial.families.length > 0 ? `normalized dial color: ${dial.families.join(", ")}` : "",
    normalizedSpecs,
    officialSpecs
  ].filter(Boolean).join("\n");
}
