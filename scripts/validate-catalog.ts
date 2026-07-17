import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import sharp from "sharp";
import {
  validateCatalogQuality,
  type CatalogProvenance,
  type LocalImageInspection
} from "../src/lib/catalog-validation";
import type { Watch } from "../src/types";

const root = resolve(import.meta.dirname, "..");
const catalogPath = resolve(root, process.argv[2] ?? "src/data/catalog.json");
const provenancePath = resolve(root, process.argv[3] ?? "data/catalog-provenance.json");
const publicDirectory = resolve(root, "public");

const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as Watch[];
const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as CatalogProvenance;
const inspections = new Map<string, LocalImageInspection>();
const rerankImageIssues: string[] = [];

for (const watch of catalog) {
  const rerankPath = resolve(publicDirectory, "images", "rerank", `${watch.id}.webp`);
  const rerankBytes = await readFile(rerankPath).catch(() => null);
  if (!rerankBytes) {
    rerankImageIssues.push(`${watch.id}: missing Claude vision thumbnail`);
  } else {
    const rerankMetadata = await sharp(rerankBytes).metadata();
    if (rerankMetadata.format !== "webp" || rerankMetadata.width !== 280 || rerankMetadata.height !== 280) {
      rerankImageIssues.push(`${watch.id}: vision thumbnail must be a 280×280 WebP`);
    }
  }

  const localPath = resolve(publicDirectory, watch.image.src.replace(/^\/+/, ""));
  const relativePath = relative(publicDirectory, localPath);
  if (relativePath.startsWith(`..${sep}`) || relativePath === "..") {
    inspections.set(watch.id, {
      exists: false,
      byteLength: 0,
      width: 0,
      height: 0,
      hasAlpha: false,
      hasTransparency: false,
      sha256: ""
    });
    continue;
  }

  const bytes = await readFile(localPath).catch(() => null);
  if (!bytes) {
    inspections.set(watch.id, {
      exists: false,
      byteLength: 0,
      width: 0,
      height: 0,
      hasAlpha: false,
      hasTransparency: false,
      sha256: ""
    });
    continue;
  }

  const image = sharp(bytes);
  const [metadata, stats] = await Promise.all([image.metadata(), image.ensureAlpha().stats()]);
  const alpha = stats.channels[3];
  inspections.set(watch.id, {
    exists: true,
    byteLength: bytes.byteLength,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    hasAlpha: metadata.hasAlpha ?? false,
    hasTransparency: Boolean(alpha && alpha.min < 250),
    sha256: createHash("sha256").update(bytes).digest("hex")
  });
}

const minimumWatches = Number.parseInt(process.env.CATALOG_MIN_WATCHES ?? "300", 10);
const issues = validateCatalogQuality(catalog, provenance, inspections, { minimumWatches });

if (issues.length > 0 || rerankImageIssues.length > 0) {
  for (const item of issues) {
    const location = [item.watchId, item.field].filter(Boolean).join(" · ");
    console.error(`${item.code}${location ? ` [${location}]` : ""}: ${item.message}`);
  }
  for (const issue of rerankImageIssues) console.error(`RERANK_IMAGE: ${issue}`);
  console.error(`Catalog validation failed with ${issues.length + rerankImageIssues.length} issue(s).`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${catalog.length} watches: complete facts, cited sources, and real local photos.`);
}
