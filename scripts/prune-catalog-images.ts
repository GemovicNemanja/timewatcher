import { readdir, unlink } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { Watch } from "../src/types";
import { readFile } from "node:fs/promises";

const root = resolve(import.meta.dirname, "..");
const imageDirectory = resolve(root, "public/images/watches");
const catalog = JSON.parse(
  await readFile(resolve(root, "src/data/catalog.json"), "utf8")
) as Watch[];
const referenced = new Set(catalog.map((watch) => basename(watch.image.src)));
const files = (await readdir(imageDirectory))
  .filter((file) => file.endsWith(".avif"))
  .sort();
const unreferenced = files.filter((file) => !referenced.has(file));

if (!process.argv.includes("--apply")) {
  console.log(`${unreferenced.length} unreferenced AVIF file(s):`);
  unreferenced.forEach((file) => console.log(`  ${file}`));
  console.log("Re-run with --apply to remove exactly these files.");
} else {
  for (const file of unreferenced) {
    await unlink(resolve(imageDirectory, file));
  }
  console.log(`Removed ${unreferenced.length} unreferenced AVIF file(s); ${referenced.size} catalog photos remain.`);
}
