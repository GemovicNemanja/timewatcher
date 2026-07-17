import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { parse } from "yaml";
import type { Watch } from "../src/types";

type Art = {
  case?: "round" | "rectangle" | "square" | "tonneau";
  dial?: string;
  accent?: string;
  strap?: "bracelet" | "leather" | "canvas" | "resin";
  bezel?: boolean;
  numerals?: "baton" | "dot" | "arabic" | "roman" | "digital";
};

type Source = Watch & { art?: Art };
const root = resolve(import.meta.dirname, "..");
const yamlPath = resolve(root, "data/watches.yaml");
const catalogPath = resolve(root, "src/data/catalog.json");
const sourceDirectory = resolve(root, "assets/source-watches");
const suppliedImageDirectory = resolve(root, "assets/watch-images");
const outputDirectory = resolve(root, "public/images/watches");

const escapeXml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function markers(kind: Art["numerals"], color: string): string {
  if (kind === "digital") {
    return `<rect x="310" y="335" width="180" height="78" rx="7" fill="#a7b3a5" stroke="#252a2c" stroke-width="8"/><text x="400" y="388" fill="#202827" font-size="42" font-family="ui-monospace,monospace" text-anchor="middle">10:08</text>`;
  }
  const roman = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
  return Array.from({ length: 12 }, (_, index) => {
    const angle = (index * 30 - 90) * (Math.PI / 180);
    const x = 400 + Math.cos(angle) * 132;
    const y = 380 + Math.sin(angle) * 132;
    if (kind === "arabic" || kind === "roman") {
      const label = kind === "roman" ? roman[index] : String(index === 0 ? 12 : index);
      return `<text x="${x.toFixed(1)}" y="${(y + 7).toFixed(1)}" fill="${color}" font-size="${kind === "roman" ? 20 : 24}" font-family="Arial,sans-serif" font-weight="600" text-anchor="middle">${label}</text>`;
    }
    if (kind === "dot") return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${index % 3 === 0 ? 10 : 7}" fill="${color}"/>`;
    return `<rect x="${(x - 4).toFixed(1)}" y="${(y - 13).toFixed(1)}" width="8" height="26" rx="3" fill="${color}" transform="rotate(${index * 30} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }).join("");
}

function svgFor(watch: Source): string {
  const art = watch.art ?? {};
  const shape = art.case ?? "round";
  const dial = art.dial ?? "#17191d";
  const accent = art.accent ?? "#f1f3f4";
  const strapFill =
    art.strap === "leather" ? "#3c241c" : art.strap === "canvas" ? "#59634b" : art.strap === "resin" ? "#181b1f" : "url(#steel)";
  const strapWidth = shape === "rectangle" ? 150 : shape === "square" ? 230 : 176;
  const caseMarkup = shape === "round"
    ? `<circle cx="400" cy="380" r="190" fill="url(#steel)" stroke="#858c94" stroke-width="5"/>${art.bezel ? `<circle cx="400" cy="380" r="173" fill="#171a1e" stroke="#3c4249" stroke-width="4"/><circle cx="400" cy="380" r="139" fill="${dial}"/>` : `<circle cx="400" cy="380" r="168" fill="${dial}" stroke="#d9dde1" stroke-width="5"/>`}`
    : shape === "rectangle"
      ? `<rect x="275" y="220" width="250" height="320" rx="24" fill="url(#steel)" stroke="#858c94" stroke-width="5"/><rect x="295" y="240" width="210" height="280" rx="12" fill="${dial}" stroke="#d9dde1" stroke-width="4"/>`
      : shape === "square"
        ? `<rect x="210" y="190" width="380" height="380" rx="70" fill="#171a1e" stroke="#32373d" stroke-width="16"/><rect x="260" y="245" width="280" height="270" rx="34" fill="#282d31" stroke="#636a70" stroke-width="6"/>`
        : `<path d="M245 230 Q400 185 555 230 L525 530 Q400 575 275 530 Z" fill="url(#steel)" stroke="#858c94" stroke-width="5"/><circle cx="400" cy="380" r="142" fill="${dial}" stroke="#d9dde1" stroke-width="4"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs><linearGradient id="steel" x1="0" x2="1"><stop offset="0" stop-color="#868d93"/><stop offset="0.22" stop-color="#f3f5f6"/><stop offset="0.5" stop-color="#a4abb1"/><stop offset="0.78" stop-color="#f6f7f8"/><stop offset="1" stop-color="#777e85"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="9" flood-opacity=".18"/></filter></defs>
  <g filter="url(#shadow)">
    <rect x="${400 - strapWidth / 2}" y="18" width="${strapWidth}" height="744" rx="${art.strap === "resin" ? 42 : 24}" fill="${strapFill}" stroke="#666d73" stroke-width="3"/>
    ${art.strap === "bracelet" ? Array.from({ length: 12 }, (_, index) => `<path d="M${400 - strapWidth / 2} ${45 + index * 60} H${400 + strapWidth / 2}" stroke="#777e84" stroke-width="3"/><path d="M365 ${20 + index * 60} V${75 + index * 60}" stroke="#edf0f2" stroke-width="2"/>`).join("") : ""}
    ${caseMarkup}
    ${markers(art.numerals, accent)}
    ${art.numerals !== "digital" ? `<g stroke="${accent}" stroke-linecap="round"><path d="M400 380 L355 315" stroke-width="13"/><path d="M400 380 L473 348" stroke-width="9"/><path d="M400 380 L430 480" stroke="#c24b45" stroke-width="3"/></g><circle cx="400" cy="380" r="11" fill="${accent}"/>` : ""}
    <text x="400" y="${shape === "rectangle" ? 310 : 292}" fill="${accent}" font-size="15" font-family="Arial,sans-serif" font-weight="700" letter-spacing="2" text-anchor="middle">${escapeXml(watch.brand.toUpperCase())}</text>
    <text x="400" y="${shape === "rectangle" ? 468 : 460}" fill="${accent}" opacity=".82" font-size="12" font-family="Arial,sans-serif" text-anchor="middle">${escapeXml(watch.model)}</text>
  </g>
</svg>`;
}

async function alphaBoundingBox(image: Buffer): Promise<[number, number, number, number]> {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = 0;
  let bottom = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha > 8) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      }
    }
  }
  if (right <= left || bottom <= top) throw new Error("Image has no visible pixels.");
  return [left, top, right, bottom];
}

await mkdir(sourceDirectory, { recursive: true });
await mkdir(suppliedImageDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });
const source = parse(await readFile(yamlPath, "utf8")) as { watches: Source[] };
const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as Watch[];
const byId = new Map(catalog.map((watch) => [watch.id, watch]));
let suppliedCount = 0;

async function suppliedImage(id: string): Promise<{ bytes: Buffer; path: string } | null> {
  for (const extension of ["png", "webp", "avif"] as const) {
    const path = resolve(suppliedImageDirectory, `${id}.${extension}`);
    const bytes = await readFile(path).catch(() => null);
    if (!bytes) continue;
    const metadata = await sharp(bytes).metadata();
    if (!metadata.hasAlpha) {
      throw new Error(`${path} has no alpha channel. Supply a transparent-background soldier shot.`);
    }
    return { bytes, path };
  }
  return null;
}

for (const watch of source.watches) {
  const outputPath = resolve(outputDirectory, `${watch.id}.avif`);
  const supplied = await suppliedImage(watch.id);
  let input: Buffer;
  if (supplied) {
    input = supplied.bytes;
    suppliedCount += 1;
  } else {
    const svg = svgFor(watch);
    const svgPath = resolve(sourceDirectory, `${watch.id}.svg`);
    await writeFile(svgPath, svg);
    input = Buffer.from(svg);
  }
  const image = await sharp(input)
    .resize({ width: 800, height: 800, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .avif({ quality: 72, effort: 6 })
    .toBuffer();
  await writeFile(outputPath, image);
  const bbox = await alphaBoundingBox(image);
  const entry = byId.get(watch.id);
  if (!entry) throw new Error(`Compile the catalog before images: ${watch.id} is missing.`);
  entry.image = { src: `/images/watches/${watch.id}.avif`, w: 800, h: 800, alphaBbox: bbox };
  console.log(`Built ${watch.id}.avif (${Math.round(image.byteLength / 1024)}KB, ${supplied ? "supplied photo" : "illustration fallback"})`);
}

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
if (suppliedCount < source.watches.length) {
  console.warn(`${source.watches.length - suppliedCount} watch(es) use illustration fallbacks. Add licensed transparent images under assets/watch-images/ for photographic results.`);
}
