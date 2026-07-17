import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "yaml";
import type { CrystalType, MovementType, Watch } from "../src/types";

type SourceWatch = Omit<Watch, "image"> & {
  art?: Record<string, unknown>;
};

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, "data/watches.yaml");
const outputPath = resolve(root, "src/data/catalog.json");
const generatedDescriptionsPath = resolve(root, "data/generated-descriptions.json");

function assertNumber(value: unknown, field: string, nullable = false): asserts value is number | null {
  if (nullable && value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number${nullable ? " or null" : ""}.`);
  }
}

function validate(source: unknown): SourceWatch[] {
  if (!source || typeof source !== "object" || !("watches" in source)) {
    throw new Error("data/watches.yaml must contain a watches array.");
  }
  const watches = (source as { watches: unknown }).watches;
  if (!Array.isArray(watches) || watches.length < 4) {
    throw new Error("The catalog needs at least four watches.");
  }
  const seen = new Set<string>();
  const movementTypes = new Set<MovementType>([
    "automatic",
    "hand-wound",
    "quartz",
    "solar",
    "spring-drive"
  ]);
  const crystals = new Set<CrystalType>(["sapphire", "mineral", "acrylic"]);

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
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(watch.id)) {
      throw new Error(`${watch.id}: id must be a lowercase kebab-case slug.`);
    }
    assertNumber(watch.price.retail, `${watch.id}.price.retail`, true);
    assertNumber(watch.price.preOwnedLow, `${watch.id}.price.preOwnedLow`);
    assertNumber(watch.price.preOwnedHigh, `${watch.id}.price.preOwnedHigh`);
    if (watch.price.preOwnedLow > watch.price.preOwnedHigh) {
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
      assertNumber(specs[key], `${watch.id}.specs.${key}`);
    }
    assertNumber(specs.powerReserveH, `${watch.id}.specs.powerReserveH`, true);
    if (specs.caseWidthMm !== undefined) assertNumber(specs.caseWidthMm, `${watch.id}.specs.caseWidthMm`);
    if (!movementTypes.has(specs.movementType)) throw new Error(`${watch.id}: invalid movement type.`);
    if (!crystals.has(specs.crystal)) throw new Error(`${watch.id}: invalid crystal type.`);
  }

  return watches as SourceWatch[];
}

const yaml = await readFile(sourcePath, "utf8");
const sourceWatches = validate(parse(yaml));
const generatedDescriptions = await readFile(generatedDescriptionsPath, "utf8")
  .then((value) => JSON.parse(value) as Record<string, string>)
  .catch(() => ({} as Record<string, string>));
const existing = await readFile(outputPath, "utf8")
  .then((value) => JSON.parse(value) as Watch[])
  .catch(() => [] as Watch[]);
const existingImages = new Map(existing.map((watch) => [watch.id, watch.image]));

const catalog: Watch[] = sourceWatches.map(({ art: _art, ...watch }) => ({
  ...watch,
  styleDescription: generatedDescriptions[watch.id] ?? watch.styleDescription,
  image: existingImages.get(watch.id) ?? {
    src: `/images/watches/${watch.id}.avif`,
    w: 800,
    h: 800,
    alphaBbox: [210, 20, 590, 780]
  }
}));

await mkdir(resolve(root, "src/data"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Compiled ${catalog.length} watches to ${outputPath}`);
