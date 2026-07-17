import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import type { CrystalType, MovementType, Watch } from "../src/types";

export type ImportedMovementType = Exclude<MovementType, "unknown">;
export type ImportedCrystalType = Exclude<CrystalType, "unknown">;
export type ImportedImage = Watch["image"];

/**
 * Honest import boundary. Fields omitted by a manufacturer remain null here;
 * the application schema can decide how to display them without silently
 * converting "not published" into a made-up measurement.
 */
export type ImportedWatch = Watch;

const DEFAULT_BASE_URL = "https://www.caratandcaliber.com";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; TimeWatcherLocalDemo/1.0; catalog import)";

export type CatalogueCard = {
  detailUrl: string;
  brand: string | null;
  model: string | null;
  reference: string | null;
  collection: string | null;
  caseDiameterMm: number | null;
  retailPrice: number | null;
  imageUrl: string | null;
};

export type RawProduct = {
  sourceUrl: string;
  officialSourceUrl: string | null;
  brand: string;
  name: string;
  reference: string;
  category: string | null;
  description: string;
  imageUrls: string[];
  retailPrice: number | null;
  priceCurrency: string | null;
  properties: Record<string, string>;
};

export type ImportProvenance = {
  catalogUrl: string;
  manufacturerUrl: string | null;
  imageSourceUrl: string;
  retrievedAt: string;
  sourceProperties: Record<string, string>;
  missingFields: string[];
};

export type NormalizationResult =
  | { ok: true; watch: ImportedWatch; provenance: ImportProvenance }
  | { ok: false; missingRequiredFields: string[] };

type JsonLdProduct = {
  "@type"?: string | string[];
  name?: unknown;
  brand?: unknown;
  sku?: unknown;
  mpn?: unknown;
  category?: unknown;
  image?: unknown;
  description?: unknown;
  url?: unknown;
  offers?: unknown;
  additionalProperty?: unknown;
};

type NormalizeOptions = {
  requireCompleteCore?: boolean;
  image?: ImportedImage;
  retrievedAt?: string;
};

type CliOptions = {
  limit: number;
  startPage: number;
  maxPages: number;
  pageStep: number | null;
  spreadPages: boolean;
  concurrency: number;
  outputPath: string;
  provenancePath: string;
  imageDirectory: string;
  baseUrl: string;
  noImages: boolean;
  dryRun: boolean;
  strict: boolean;
};

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    laquo: "«",
    ldquo: "“",
    lt: "<",
    nbsp: " ",
    quot: '"',
    raquo: "»",
    rdquo: "”"
  };
  return value.replace(/&(#x?[\da-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function textContent(markup: string): string {
  return decodeHtml(markup.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attributes(markup: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of markup.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    result[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? "");
  }
  return result;
}

function classText(markup: string, className: string): string | null {
  const expression = new RegExp(
    `<(?:div|span)[^>]*class=(?:"[^"]*\\b${className}\\b[^"]*"|'[^']*\\b${className}\\b[^']*')[^>]*>([\\s\\S]*?)<\\/(?:div|span)>`,
    "i"
  );
  const match = expression.exec(markup);
  return match ? textContent(match[1]) : null;
}

export function parseMeasurement(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.replaceAll(",", ".");
  const match = normalized.match(/(-?\d+(?:\.\d+)?)\s*(mm|cm|in(?:ch(?:es)?)?|["″])/i);
  if (!match) return null;
  const number = Number.parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(number)) return null;
  if (unit === "cm") return number * 10;
  if (unit !== "mm") return number * 25.4;
  return number;
}

function parseMoney(value: string | null | undefined): number | null {
  if (!value || /(?:^|\s)[—-](?:\s|$)/.test(value)) return null;
  const match = value.replaceAll(",", "").match(/(?:USD\s*)?\$+\s*(\d+(?:\.\d+)?)/i)
    ?? value.replaceAll(",", "").match(/(\d+(?:\.\d+)?)\s*USD/i);
  if (!match) return null;
  const number = Number.parseFloat(match[1]);
  return Number.isFinite(number) ? number : null;
}

export function parseCataloguePage(
  html: string,
  baseUrl = DEFAULT_BASE_URL
): CatalogueCard[] {
  const cards: CatalogueCard[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const anchorAttributes = attributes(match[1]);
    if (!anchorAttributes.class?.split(/\s+/).includes("pcard")) continue;
    if (!anchorAttributes.href) continue;
    const detailUrl = new URL(anchorAttributes.href, baseUrl).toString();
    if (seen.has(detailUrl)) continue;
    seen.add(detailUrl);

    const body = match[2];
    const imageTag = body.match(/<img\b([^>]*)>/i);
    const imageAttributes = imageTag ? attributes(imageTag[1]) : {};
    const spec = classText(body, "pcard-spec");
    const specParts = spec?.split("·").map((part) => part.trim()) ?? [];
    cards.push({
      detailUrl,
      brand: classText(body, "bn"),
      model: classText(body, "pcard-model"),
      reference: classText(body, "pcard-ref"),
      collection: specParts[0] || null,
      caseDiameterMm: parseMeasurement(specParts.slice(1).join(" ")),
      retailPrice: parseMoney(classText(body, "pcard-price")),
      imageUrl: imageAttributes.src || null
    });
  }

  return cards;
}

export function parseCatalogueTotalPages(html: string): number | null {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const rendered = withoutComments.match(/\b\d+\s*\/\s*(\d+)\b/);
  if (rendered) return Number.parseInt(rendered[1], 10);
  const nextPayload = html.match(/"children"\s*:\s*\[\s*\d+\s*,\s*" \/ "\s*,\s*(\d+)\s*\]/);
  return nextPayload ? Number.parseInt(nextPayload[1], 10) : null;
}

function vanDerCorput(index: number): number {
  let value = 0;
  let denominator = 1;
  let remaining = index;
  while (remaining > 0) {
    denominator *= 2;
    value += (remaining % 2) / denominator;
    remaining = Math.floor(remaining / 2);
  }
  return value;
}

/** Deterministic low-discrepancy order: beginning, middle, quarters, eighths… */
export function spreadPageNumbers(startPage: number, totalPages: number, count: number): number[] {
  if (startPage < 1 || totalPages < startPage || count < 1) return [];
  const available = totalPages - startPage + 1;
  const wanted = Math.min(count, available);
  const pages: number[] = [];
  const seen = new Set<number>();
  let index = 0;
  while (pages.length < wanted) {
    const page = startPage + Math.min(available - 1, Math.floor(vanDerCorput(index) * available));
    index += 1;
    if (seen.has(page)) continue;
    seen.add(page);
    pages.push(page);
  }
  return pages;
}

function jsonLdNodes(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(jsonLdNodes);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const own = record["@type"] ? [value] : [];
  return [...own, ...jsonLdNodes(record["@graph"]), ...jsonLdNodes(record.mainEntity)];
}

function hasType(value: JsonLdProduct, wanted: string): boolean {
  const type = value["@type"];
  return Array.isArray(type) ? type.includes(wanted) : type === wanted;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? decodeHtml(value.trim()) : null;
}

function brandName(value: unknown): string | null {
  if (typeof value === "string") return stringValue(value);
  if (!value || typeof value !== "object") return null;
  return stringValue((value as Record<string, unknown>).name);
}

function imageUrls(value: unknown): string[] {
  const candidates = Array.isArray(value) ? value : [value];
  const urls = candidates.flatMap((candidate) => {
    if (typeof candidate === "string") return [candidate];
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    return [record.url, record.contentUrl].flatMap((url) => stringValue(url) ?? []);
  });
  return [...new Set(urls)];
}

function offerDetails(value: unknown): { price: number | null; currency: string | null } {
  const offers = Array.isArray(value) ? value : [value];
  for (const offer of offers) {
    if (!offer || typeof offer !== "object") continue;
    const record = offer as Record<string, unknown>;
    const rawPrice = typeof record.price === "number" ? record.price : Number.parseFloat(String(record.price));
    if (!Number.isFinite(rawPrice)) continue;
    return { price: rawPrice, currency: stringValue(record.priceCurrency) };
  }
  return { price: null, currency: null };
}

function productProperties(value: unknown): Record<string, string> {
  const properties: Record<string, string> = {};
  if (!Array.isArray(value)) return properties;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const name = stringValue(record.name)?.toLowerCase().replace(/\s+/g, " ");
    const propertyValue = stringValue(record.value);
    if (name && propertyValue) properties[name] = propertyValue;
  }
  return properties;
}

function findOfficialSourceUrl(html: string, sourceUrl: string): string | null {
  const sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, "");
  for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
    const href = attributes(match[1]).href;
    if (!href?.startsWith("http")) continue;
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    const host = url.hostname.replace(/^www\./, "");
    if (
      host === sourceHost
      || host.endsWith("caratandcaliber.com")
      || host.endsWith("getjewelops.com")
      || host.endsWith("itshco.com")
      || host.endsWith("googletagmanager.com")
      || /(?:cloudinary|dynamicmedia|images?|media|static|cdn)\./i.test(host)
    ) {
      continue;
    }
    return url.toString();
  }
  return null;
}

export function parseProductPage(html: string, pageUrl: string): RawProduct {
  const parsed: unknown[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      parsed.push(JSON.parse(match[1]));
    } catch {
      // Ignore unrelated malformed structured-data blocks and keep looking.
    }
  }
  const product = parsed
    .flatMap(jsonLdNodes)
    .find((candidate): candidate is JsonLdProduct => (
      Boolean(candidate)
      && typeof candidate === "object"
      && hasType(candidate as JsonLdProduct, "Product")
    ));
  if (!product) throw new Error(`No Product JSON-LD found at ${pageUrl}.`);

  const brand = brandName(product.brand);
  const name = stringValue(product.name);
  const reference = stringValue(product.sku) ?? stringValue(product.mpn);
  if (!brand || !name || !reference) {
    throw new Error(`Product JSON-LD at ${pageUrl} is missing brand, name, or reference.`);
  }
  const offers = offerDetails(product.offers);
  return {
    sourceUrl: stringValue(product.url) ?? pageUrl,
    officialSourceUrl: findOfficialSourceUrl(html, pageUrl),
    brand,
    name,
    reference,
    category: stringValue(product.category),
    description: stringValue(product.description) ?? "",
    imageUrls: imageUrls(product.image),
    retailPrice: offers.price,
    priceCurrency: offers.currency,
    properties: productProperties(product.additionalProperty)
  };
}

function normalizedPropertyKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function property(
  properties: Record<string, string>,
  aliases: string[]
): string | null {
  const entries = Object.entries(properties).map(([key, value]) => [normalizedPropertyKey(key), value] as const);
  for (const alias of aliases.map(normalizedPropertyKey)) {
    const exact = entries.find(([key]) => key === alias);
    if (exact) return exact[1];
  }
  for (const alias of aliases.map(normalizedPropertyKey)) {
    // A generic one-word alias such as "thickness" must not turn a published
    // "calibre thickness" into a case measurement.
    if (!alias.includes(" ")) continue;
    const partial = entries.find(([key]) => key.includes(alias));
    if (partial) return partial[1];
  }
  return null;
}

function parseHours(value: string | null): number | null {
  if (!value) return null;
  const days = value.match(/(\d+(?:[.,]\d+)?)\s*days?/i);
  if (days) return Number.parseFloat(days[1].replace(",", ".")) * 24;
  const hours = value.match(/(\d+(?:[.,]\d+)?)\s*(?:hours?|hrs?|h\b)/i);
  return hours ? Number.parseFloat(hours[1].replace(",", ".")) : null;
}

function parseWaterResistance(value: string | null): number | null {
  if (!value) return null;
  const metres = value.match(/(\d+(?:[.,]\d+)?)\s*(?:m(?:et(?:er|re)s?)?\b)/i);
  if (metres) return Number.parseFloat(metres[1].replace(",", "."));
  const bar = value.match(/(\d+(?:[.,]\d+)?)\s*bar\b/i);
  if (bar) return Number.parseFloat(bar[1].replace(",", ".")) * 10;
  const atm = value.match(/(\d+(?:[.,]\d+)?)\s*atm\b/i);
  if (atm) return Number.parseFloat(atm[1].replace(",", ".")) * 10;
  const feet = value.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:feet|ft\b)/i);
  if (feet) return Math.round(Number.parseFloat(feet[1].replaceAll(",", "")) / 3.28084);
  return null;
}

function movementType(value: string | null): ImportedMovementType | null {
  if (!value) return null;
  if (/spring\s*drive/i.test(value)) return "spring-drive";
  if (/solar|eco[- ]?drive|light[- ]?powered/i.test(value)) return "solar";
  if (/quartz|battery/i.test(value)) return "quartz";
  if (/manual|hand[- ]?wound|hand winding|mechanical winding/i.test(value)) return "hand-wound";
  if (/automatic|self[- ]?winding|perpetual rotor/i.test(value)) return "automatic";
  return null;
}

function crystalType(value: string | null): ImportedCrystalType | null {
  if (!value) return null;
  if (/sapphire/i.test(value)) return "sapphire";
  if (/mineral|hardlex/i.test(value)) return "mineral";
  if (/acrylic|plexi|hesalite/i.test(value)) return "acrylic";
  return null;
}

function parseYear(value: string | null): number | null {
  const match = value?.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 110)
    .replace(/-$/g, "");
}

function conciseModel(product: RawProduct): string {
  const brandPrefix = new RegExp(`^${product.brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i");
  const withoutBrand = product.name.replace(brandPrefix, "");
  return withoutBrand
    .replace(/\s+watch:\s+/i, " — ")
    .replace(/\s+-\s+[^-]+$/i, "")
    .trim();
}

function styleDescription(product: RawProduct, specs: ImportedWatch["specs"]): string {
  const collection = property(product.properties, ["collection"]);
  const caseMaterial = property(product.properties, ["case material", "case composition"]);
  const dial = property(product.properties, ["dial details", "dial color", "dial colour", "dial"]);
  const bracelet = property(product.properties, ["bracelet material", "strap material", "bracelet strap"]);
  const functions = property(product.properties, ["movement functions", "functions", "complications"]);
  const opening = product.description.replace(/\s+/g, " ").trim();
  const facts = [
    collection ? `It belongs to the ${collection} collection.` : null,
    caseMaterial ? `The case is described as ${caseMaterial}.` : null,
    dial ? `The dial specification is ${dial}.` : null,
    bracelet ? `It is supplied on ${bracelet}.` : null,
    specs.caseDiameterMm === null ? null : `Its case is ${specs.caseDiameterMm} mm in diameter.`,
    specs.movementType === null
      ? null
      : `The published movement type is ${specs.movementType.replace("-", " ")}${specs.caliber ? `, calibre ${specs.caliber}` : ""}${specs.powerReserveH ? `, with about ${specs.powerReserveH} hours of reserve` : ""}.`,
    specs.waterResistanceM === null ? null : `Water resistance is rated to ${specs.waterResistanceM} metres.`,
    specs.crystal === null ? null : `The crystal is ${specs.crystal}.`,
    functions ? `Listed functions include ${functions}.` : null
  ].filter((value): value is string => Boolean(value));
  return [opening, ...facts].join(" ").replace(/\s+/g, " ").trim();
}

export function normalizeProduct(
  product: RawProduct,
  options: NormalizeOptions = {}
): NormalizationResult {
  const diameter = parseMeasurement(property(product.properties, [
    "case diameter",
    "case size",
    "diameter"
  ]));
  const winding = property(product.properties, [
    "movement winding",
    "movement type",
    "movement",
    "calibre mechanism",
    "caliber mechanism",
    "calibre type",
    "caliber type"
  ]);
  const type = movementType(winding);
  const crystal = crystalType(property(product.properties, ["case crystal", "crystal", "glass"]));
  const waterResistance = parseWaterResistance(property(product.properties, [
    "case water resistance",
    "water resistance",
    "waterproofness"
  ]));

  const exactThickness = parseMeasurement(property(product.properties, [
    "case thickness",
    "thickness",
    "case height"
  ]));
  const exactLugToLug = parseMeasurement(property(product.properties, [
    "lug to lug",
    "lug-to-lug",
    "case length"
  ]));
  const exactLugWidth = parseMeasurement(property(product.properties, [
    "lug width",
    "interhorn width",
    "strap width"
  ]));
  const exactYear = parseYear(property(product.properties, [
    "year released",
    "release year",
    "introduction year",
    "launch year"
  ]));

  const calibre = property(product.properties, [
    "movement calibre",
    "movement caliber",
    "calibre",
    "caliber"
  ]);
  const caseWidth = parseMeasurement(property(product.properties, ["case width", "width"]));
  const powerReserve = parseHours(property(product.properties, [
    "movement autonomy",
    "power reserve",
    "running time"
  ]));
  const collection = property(product.properties, ["collection"]);
  const id = slugify(`${product.brand}-${collection ?? conciseModel(product)}-${product.reference}`);
  const image = options.image ?? {
    kind: "photo" as const,
    src: product.imageUrls[0] ?? "",
    w: 800,
    h: 800,
    alphaBbox: [0, 0, 800, 800] as [number, number, number, number]
  };
  if (!image.src) return { ok: false, missingRequiredFields: ["image.src"] };
  const specs: ImportedWatch["specs"] = {
    caseDiameterMm: diameter,
    caseWidthMm: caseWidth,
    thicknessMm: exactThickness,
    lugToLugMm: exactLugToLug,
    lugWidthMm: exactLugWidth,
    movementType: type ?? "unknown",
    caliber: calibre,
    powerReserveH: powerReserve,
    waterResistanceM: waterResistance,
    crystal: crystal ?? "unknown",
    yearReleased: exactYear
  };
  const missingFields = [
    ...Object.entries(specs)
      .filter(([, value]) => value === null)
      .map(([key]) => `specs.${key}`),
    ...(!type ? ["specs.movementType"] : []),
    ...(!crystal ? ["specs.crystal"] : []),
    ...(product.retailPrice === null ? ["price.retail"] : []),
    "price.preOwnedLow",
    "price.preOwnedHigh"
  ];
  if (options.requireCompleteCore && missingFields.some((field) => field.startsWith("specs."))) {
    return { ok: false, missingRequiredFields: missingFields };
  }
  const provenance: ImportProvenance = {
    catalogUrl: product.sourceUrl,
    manufacturerUrl: product.officialSourceUrl,
    imageSourceUrl: product.imageUrls[0],
    retrievedAt: options.retrievedAt ?? new Date().toISOString(),
    sourceProperties: product.properties,
    missingFields
  };
  const watch: ImportedWatch = {
    id,
    brand: product.brand,
    model: conciseModel(product),
    reference: product.reference,
    price: {
      retail: product.retailPrice,
      preOwnedLow: null,
      preOwnedHigh: null
    },
    image,
    specs,
    styleDescription: styleDescription(product, specs),
    sourceSpecifications: Object.entries(product.properties).map(([name, value]) => ({ name, value })),
    provenance: {
      catalogUrl: provenance.catalogUrl,
      manufacturerUrl: provenance.manufacturerUrl,
      imageSourceUrl: provenance.imageSourceUrl,
      retrievedAt: provenance.retrievedAt
    }
  };
  return {
    ok: true,
    watch,
    provenance
  };
}

async function fetchText(url: string, attempts = 3): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, {
        headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": DEFAULT_USER_AGENT },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 600));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Failed to fetch ${url}: ${String(lastError)}`);
}

async function fetchBytes(url: string, attempts = 3): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(url, {
        headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,*/*", "User-Agent": DEFAULT_USER_AGENT },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) throw new Error(`unexpected content type ${contentType}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 800));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Failed to fetch image ${url}: ${String(lastError)}`);
}

function cornerBackground(data: Buffer, width: number, height: number, channels: number): [number, number, number] | null {
  if (channels < 3) return null;
  const positions = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  const colors = positions.map(([x, y]) => {
    const offset = (y * width + x) * channels;
    return [data[offset], data[offset + 1], data[offset + 2]] as [number, number, number];
  });
  const average = colors.reduce<[number, number, number]>(
    (sum, color) => [sum[0] + color[0] / 4, sum[1] + color[1] / 4, sum[2] + color[2] / 4],
    [0, 0, 0]
  );
  const variance = Math.max(...colors.map((color) => Math.hypot(
    color[0] - average[0], color[1] - average[1], color[2] - average[2]
  )));
  const brightness = (average[0] + average[1] + average[2]) / 3;
  return variance <= 40 && brightness >= 220 ? average.map(Math.round) as [number, number, number] : null;
}

function makeWhiteEdgeTransparent(
  source: Buffer,
  width: number,
  height: number,
  channels: number
): Buffer {
  const output = Buffer.from(source);
  const background = cornerBackground(output, width, height, channels);
  if (!background || channels !== 4) return output;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let read = 0;
  let write = 0;
  const add = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    queue[write++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    add(y * width);
    add(y * width + width - 1);
  }
  while (read < write) {
    const index = queue[read++];
    const offset = index * 4;
    const distance = Math.hypot(
      output[offset] - background[0],
      output[offset + 1] - background[1],
      output[offset + 2] - background[2]
    );
    if (distance > 48) continue;
    output[offset + 3] = 0;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) add(index - 1);
    if (x + 1 < width) add(index + 1);
    if (y > 0) add(index - width);
    if (y + 1 < height) add(index + width);
  }
  return output;
}

function alphaBoundingBox(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): [number, number, number, number] {
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * channels + 3] <= 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  if (right <= left || bottom <= top) throw new Error("Downloaded image has no visible pixels.");
  return [left, top, right, bottom];
}

export async function prepareWatchImage(
  bytes: Buffer,
  outputPath: string
): Promise<ImportedImage> {
  const decoded = await sharp(bytes)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const transparent = makeWhiteEdgeTransparent(
    decoded.data,
    decoded.info.width,
    decoded.info.height,
    decoded.info.channels
  );
  const sourceBox = alphaBoundingBox(
    transparent,
    decoded.info.width,
    decoded.info.height,
    decoded.info.channels
  );
  const extracted = await sharp(transparent, { raw: decoded.info })
    .extract({
      left: sourceBox[0],
      top: sourceBox[1],
      width: sourceBox[2] - sourceBox[0],
      height: sourceBox[3] - sourceBox[1]
    })
    .resize({ width: 760, height: 760, fit: "inside", withoutEnlargement: false })
    .toBuffer({ resolveWithObject: true });
  const left = Math.floor((800 - extracted.info.width) / 2);
  const top = Math.floor((800 - extracted.info.height) / 2);
  const canvas = await sharp({
    create: { width: 800, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: extracted.data, raw: extracted.info, left, top }])
    .avif({ quality: 74, effort: 5 })
    .toBuffer();
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, canvas);
  const finalRaw = await sharp(canvas).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bbox = alphaBoundingBox(finalRaw.data, finalRaw.info.width, finalRaw.info.height, finalRaw.info.channels);
  return {
    kind: "photo",
    src: `/images/watches/${basename(outputPath)}`,
    w: 800,
    h: 800,
    alphaBbox: bbox
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function positiveInteger(value: string | undefined, name: string): number {
  const number = Number.parseInt(value ?? "", 10);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${name} must be a positive integer.`);
  return number;
}

function parseCli(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unknown positional argument: ${arg}`);
    if (["--no-images", "--dry-run", "--strict", "--sequential"].includes(arg)) {
      flags.add(arg);
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} needs a value.`);
    values.set(arg, value);
    index += 1;
  }
  const root = resolve(import.meta.dirname, "..");
  const limit = values.has("--limit") ? positiveInteger(values.get("--limit"), "--limit") : 400;
  if (limit > 500) throw new Error("--limit cannot exceed 500 for this local-demo importer.");
  return {
    limit,
    startPage: values.has("--start-page") ? positiveInteger(values.get("--start-page"), "--start-page") : 1,
    maxPages: values.has("--max-pages") ? positiveInteger(values.get("--max-pages"), "--max-pages") : 60,
    pageStep: values.has("--page-step") ? positiveInteger(values.get("--page-step"), "--page-step") : null,
    spreadPages: !flags.has("--sequential") && !values.has("--page-step"),
    concurrency: values.has("--concurrency") ? positiveInteger(values.get("--concurrency"), "--concurrency") : 6,
    outputPath: resolve(root, values.get("--output") ?? "data/imported-watches.json"),
    provenancePath: resolve(root, values.get("--provenance-output") ?? "data/imported-watches.provenance.json"),
    imageDirectory: resolve(root, values.get("--image-dir") ?? "public/images/watches"),
    baseUrl: values.get("--base-url") ?? DEFAULT_BASE_URL,
    noImages: flags.has("--no-images"),
    dryRun: flags.has("--dry-run"),
    strict: flags.has("--strict")
  };
}

async function runImport(options: CliOptions): Promise<void> {
  const watches: ImportedWatch[] = [];
  const provenance: Record<string, ImportProvenance> = {};
  const rejected: Record<string, number> = {};
  const seen = new Set<string>();
  const pageCache = new Map<number, string>();

  const firstListUrl = options.startPage === 1
    ? new URL("/watches", options.baseUrl).toString()
    : new URL(`/?cat=watch&page=${options.startPage}`, options.baseUrl).toString();
  const firstHtml = await fetchText(firstListUrl);
  pageCache.set(options.startPage, firstHtml);
  const discoveredTotal = parseCatalogueTotalPages(firstHtml);
  const pageNumbers = options.spreadPages && discoveredTotal
    ? spreadPageNumbers(options.startPage, discoveredTotal, options.maxPages)
    : Array.from(
      { length: options.maxPages },
      (_, index) => options.startPage + index * (options.pageStep ?? 1)
    ).filter((page) => discoveredTotal === null || page <= discoveredTotal);
  console.log(
    options.spreadPages && discoveredTotal
      ? `Sampling ${pageNumbers.length} pages across ${options.startPage}–${discoveredTotal}: ${pageNumbers.join(", ")}`
      : `Sampling pages: ${pageNumbers.join(", ")}`
  );

  for (const page of pageNumbers) {
    if (watches.length >= options.limit) break;
    const listUrl = page === 1
      ? new URL("/watches", options.baseUrl).toString()
      : new URL(`/?cat=watch&page=${page}`, options.baseUrl).toString();
    console.log(`Catalog page ${page}: ${listUrl}`);
    const html = pageCache.get(page) ?? await fetchText(listUrl);
    const cards = parseCataloguePage(html, options.baseUrl)
      .filter((card) => !seen.has(card.detailUrl));
    for (const card of cards) seen.add(card.detailUrl);
    if (cards.length === 0) {
      console.warn(`No product cards found on page ${page}; stopping.`);
      break;
    }

    const remaining = options.limit - watches.length;
    const batch = cards.slice(0, Math.max(remaining * 2, remaining));
    const results = await mapPool(batch, options.concurrency, async (card) => {
      try {
        const html = await fetchText(card.detailUrl);
        const product = parseProductPage(html, card.detailUrl);
        let result = normalizeProduct(product, {
          requireCompleteCore: options.strict
        });
        if (!result.ok) return result;
        if (!options.noImages) {
          const bytes = await fetchBytes(result.provenance.imageSourceUrl);
          const outputPath = resolve(options.imageDirectory, `${result.watch.id}.avif`);
          const image = await prepareWatchImage(bytes, outputPath);
          result = normalizeProduct(product, {
            requireCompleteCore: options.strict,
            image,
            retrievedAt: result.provenance.retrievedAt
          });
        }
        return result;
      } catch (error) {
        console.warn(`Skipped ${card.detailUrl}: ${error instanceof Error ? error.message : String(error)}`);
        return { ok: false, missingRequiredFields: ["fetch-or-parse-error"] } as const;
      }
    });

    for (const result of results) {
      if (!result.ok) {
        for (const field of result.missingRequiredFields) rejected[field] = (rejected[field] ?? 0) + 1;
        continue;
      }
      if (watches.some((watch) => watch.id === result.watch.id)) continue;
      watches.push(result.watch);
      provenance[result.watch.id] = result.provenance;
      console.log(`  ${watches.length}/${options.limit} ${result.watch.brand} ${result.watch.model}`);
      if (watches.length >= options.limit) break;
    }
  }

  const rejectionSummary = Object.entries(rejected).sort((left, right) => right[1] - left[1]);
  console.log(`Accepted ${watches.length} watches; rejected field counts: ${JSON.stringify(rejectionSummary)}`);
  if (watches.length < options.limit) {
    throw new Error(`Only collected ${watches.length} of ${options.limit} requested watches. Increase --max-pages or inspect the rejection summary.`);
  }
  if (options.dryRun) return;
  await mkdir(resolve(options.outputPath, ".."), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(watches, null, 2)}\n`);
  await mkdir(resolve(options.provenancePath, ".."), { recursive: true });
  await writeFile(options.provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(`Wrote ${watches.length} watches to ${options.outputPath}`);
  console.log(`Wrote source and estimate metadata to ${options.provenancePath}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  runImport(parseCli(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
