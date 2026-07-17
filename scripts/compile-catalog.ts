import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";
import type {
  CatalogFactField,
  CatalogProvenance
} from "../src/lib/catalog-validation";
import type { CrystalType, MovementType, Watch } from "../src/types";

type SourceWatch = Omit<Watch, "image"> & {
  art?: Record<string, unknown>;
};

type ImportProvenance = {
  catalogUrl: string;
  manufacturerUrl: string | null;
  imageSourceUrl: string;
  retrievedAt: string;
  sourceProperties: Record<string, string>;
  missingFields: string[];
};

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, "data/watches.yaml");
const importedPath = resolve(root, "data/imported-watches.json");
const importedProvenancePath = resolve(root, "data/imported-watches.provenance.json");
const outputPath = resolve(root, "src/data/catalog.json");
const catalogProvenancePath = resolve(root, "data/catalog-provenance.json");
const generatedDescriptionsPath = resolve(root, "data/generated-descriptions.json");

function assertNumber(value: unknown, field: string, nullable = false): asserts value is number | null {
  if (nullable && value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number${nullable ? " or null" : ""}.`);
  }
}

function validateWatches(watches: unknown, label: string): SourceWatch[] {
  if (!Array.isArray(watches) || watches.length < 4) {
    throw new Error(`${label} must contain at least four watches.`);
  }
  const seen = new Set<string>();
  const references = new Set<string>();
  const movementTypes = new Set<MovementType>([
    "automatic",
    "hand-wound",
    "quartz",
    "solar",
    "spring-drive",
    "unknown"
  ]);
  const crystals = new Set<CrystalType>(["sapphire", "mineral", "acrylic", "unknown"]);

  for (const raw of watches) {
    if (!raw || typeof raw !== "object") throw new Error("Every watch must be an object.");
    const watch = raw as SourceWatch;
    for (const key of ["id", "brand", "model", "reference", "styleDescription"] as const) {
      if (typeof watch[key] !== "string" || watch[key].trim() === "") {
        throw new Error(`${watch.id ?? "Watch"}.${key} must be a non-empty string.`);
      }
    }
    if (seen.has(watch.id)) throw new Error(`Duplicate watch id: ${watch.id}`);
    seen.add(watch.id);
    const normalizedReference = `${watch.brand}:${watch.reference}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (references.has(normalizedReference)) {
      throw new Error(`Duplicate brand/reference: ${watch.brand} ${watch.reference}`);
    }
    references.add(normalizedReference);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(watch.id)) {
      throw new Error(`${watch.id}: id must be a lowercase kebab-case slug.`);
    }
    assertNumber(watch.price.retail, `${watch.id}.price.retail`, true);
    assertNumber(watch.price.preOwnedLow, `${watch.id}.price.preOwnedLow`, true);
    assertNumber(watch.price.preOwnedHigh, `${watch.id}.price.preOwnedHigh`, true);
    if (watch.price.preOwnedLow !== null && watch.price.preOwnedHigh !== null && watch.price.preOwnedLow > watch.price.preOwnedHigh) {
      throw new Error(`${watch.id}: pre-owned price range is inverted.`);
    }
    const specs = watch.specs;
    for (const key of [
      "caseDiameterMm",
      "thicknessMm",
      "lugToLugMm",
      "lugWidthMm",
      "waterResistanceM",
      "yearReleased"
    ] as const) {
      assertNumber(specs[key], `${watch.id}.specs.${key}`, true);
    }
    assertNumber(specs.powerReserveH, `${watch.id}.specs.powerReserveH`, true);
    if (specs.caseWidthMm !== undefined) assertNumber(specs.caseWidthMm, `${watch.id}.specs.caseWidthMm`, true);
    if (!movementTypes.has(specs.movementType)) throw new Error(`${watch.id}: invalid movement type.`);
    if (!crystals.has(specs.crystal)) throw new Error(`${watch.id}: invalid crystal type.`);
  }

  return watches as SourceWatch[];
}

function trimDescription(value: string): string {
  const words = value.trim().split(/\s+/);
  return words.length <= 240 ? value.trim() : `${words.slice(0, 240).join(" ").replace(/[,:;]$/, "")}…`;
}

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sourceKey(properties: Record<string, string>, aliases: string[]): string | undefined {
  const entries = Object.keys(properties).map((key) => [normalizedKey(key), key] as const);
  for (const alias of aliases.map(normalizedKey)) {
    const exact = entries.find(([key]) => key === alias);
    if (exact) return exact[1];
  }
  for (const alias of aliases.map(normalizedKey)) {
    if (!alias.includes(" ")) continue;
    const partial = entries.find(([key]) => key.includes(alias));
    if (partial) return partial[1];
  }
  return undefined;
}

const fieldAliases: Partial<Record<CatalogFactField, string[]>> = {
  "specs.caseDiameterMm": ["case diameter", "case size", "diameter", "size"],
  "specs.caseWidthMm": ["case width", "width"],
  "specs.thicknessMm": ["case thickness", "thickness", "case height"],
  "specs.lugToLugMm": ["lug to lug", "lug-to-lug", "case length"],
  "specs.lugWidthMm": ["lug width", "interhorn width", "strap width"],
  "specs.movementType": ["movement winding", "movement type", "movement", "calibre type", "caliber type", "calibre mechanism", "caliber mechanism"],
  "specs.caliber": ["movement calibre", "movement caliber", "calibre", "caliber"],
  "specs.powerReserveH": ["movement autonomy", "power reserve", "running time"],
  "specs.waterResistanceM": ["case water resistance", "water resistance", "waterproofness"],
  "specs.crystal": ["case crystal", "crystal", "glass"],
  "specs.yearReleased": ["year released", "release year", "introduction year", "launch year"]
};

async function buildProvenance(
  catalog: Watch[],
  imported: Record<string, ImportProvenance>
): Promise<CatalogProvenance> {
  const watches: CatalogProvenance["watches"] = {};
  for (const watch of catalog) {
    const source = imported[watch.id];
    if (!source) throw new Error(`Missing import provenance for ${watch.id}.`);
    const raw: Record<string, string | number | boolean | null> = {
      "$brand": watch.brand,
      "$model": watch.model,
      "$reference": watch.reference,
      "$retail": watch.price.retail,
      ...source.sourceProperties
    };
    const fields: Partial<Record<CatalogFactField, string>> = {
      brand: "$brand",
      model: "$model",
      reference: "$reference"
    };
    if (watch.price.retail !== null) fields["price.retail"] = "$retail";
    for (const [field, aliases] of Object.entries(fieldAliases) as Array<[CatalogFactField, string[]]>) {
      const [group, key] = field.split(".");
      const value = group === "specs" ? watch.specs[key as keyof Watch["specs"]] : undefined;
      if (value === null || value === undefined || value === "unknown") continue;
      const keyInSource = sourceKey(source.sourceProperties, aliases);
      if (!keyInSource) throw new Error(`${watch.id}: could not trace ${field} to a raw source property.`);
      fields[field] = keyInSource;
    }
    const imagePath = resolve(root, "public", watch.image.src.replace(/^\/+/, ""));
    const imageHash = createHash("sha256").update(await readFile(imagePath)).digest("hex");
    watches[watch.id] = {
      sources: [{
        url: source.catalogUrl,
        retrievedAt: source.retrievedAt,
        raw,
        fields,
        note: "Normalized from Product JSON-LD and preserved manufacturer properties. Unpublished values remain null."
      }],
      image: {
        kind: "manufacturer-product-photo",
        sourceUrl: source.imageSourceUrl,
        sourcePageUrl: source.manufacturerUrl ?? source.catalogUrl,
        retrievedAt: source.retrievedAt,
        sha256: imageHash,
        usage: "local-demo-reference"
      },
      description: {
        method: "source-derived",
        sourceUrls: [source.catalogUrl, source.manufacturerUrl].filter((url): url is string => Boolean(url))
      }
    };
  }
  return { version: 1, watches };
}

async function withoutDuplicatePhotos(watches: Watch[]): Promise<Watch[]> {
  const hashes = new Map<string, string>();
  const unique: Watch[] = [];
  for (const watch of watches) {
    const imagePath = resolve(root, "public", watch.image.src.replace(/^\/+/, ""));
    const image = await readFile(imagePath).catch(() => null);
    if (!image) {
      console.warn(`Dropped ${watch.id}: its imported photo is not present in the pruned local image set.`);
      continue;
    }
    const hash = createHash("sha256").update(image).digest("hex");
    const prior = hashes.get(hash);
    if (prior) {
      console.warn(`Dropped ${watch.id}: source reused the product photo for ${prior}.`);
      continue;
    }
    hashes.set(hash, watch.id);
    unique.push(watch);
  }
  return unique;
}

const importedWatches = await readFile(importedPath, "utf8")
  .then((value) => JSON.parse(value) as unknown[])
  .catch(() => null);
const generatedDescriptions = await readFile(generatedDescriptionsPath, "utf8")
  .then((value) => JSON.parse(value) as Record<string, string>)
  .catch(() => ({} as Record<string, string>));

let catalog: Watch[];
if (importedWatches) {
  const normalized = validateWatches(importedWatches, "data/imported-watches.json").map((watch) => ({
    ...(watch as Watch),
    styleDescription: trimDescription(generatedDescriptions[watch.id] ?? watch.styleDescription)
  }));
  if (normalized.some((watch) => watch.image.kind !== "photo")) {
    throw new Error("Imported catalog contains a non-photo image.");
  }
  catalog = await withoutDuplicatePhotos(normalized);
  const importedProvenance = JSON.parse(await readFile(importedProvenancePath, "utf8")) as Record<string, ImportProvenance>;
  const provenance = await buildProvenance(catalog, importedProvenance);
  await writeFile(catalogProvenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
} else {
  const yaml = parse(await readFile(sourcePath, "utf8")) as { watches?: unknown };
  const sourceWatches = validateWatches(yaml.watches, "data/watches.yaml");
  const existing = await readFile(outputPath, "utf8")
    .then((value) => JSON.parse(value) as Watch[])
    .catch(() => [] as Watch[]);
  const existingImages = new Map(existing.map((watch) => [watch.id, watch.image]));
  catalog = sourceWatches.map(({ art: _art, ...watch }) => ({
    ...watch,
    styleDescription: generatedDescriptions[watch.id] ?? watch.styleDescription,
    image: existingImages.get(watch.id) ?? {
      src: `/images/watches/${watch.id}.avif`,
      w: 800,
      h: 800,
      alphaBbox: [210, 20, 590, 780],
      kind: "illustration"
    }
  }));
}

await mkdir(resolve(root, "src/data"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Compiled ${catalog.length} watches to ${outputPath}`);
