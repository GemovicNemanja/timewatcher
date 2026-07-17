import type { Watch } from "../types";

export type ScoredWatch = { watch: Watch; score: number };

export function watchFamilyKey(watch: Watch): string {
  const collection = watch.sourceSpecifications?.find((specification) =>
    /^(collection|family|product line)$/i.test(specification.name.trim())
  )?.value;
  const family = collection
    ?? watch.model.split(/\s+[—|]\s+|\s+Ref\.?\s*/i)[0]
    ?? watch.model;
  return `${watch.brand}:${family}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function diversifyRanked(
  ranked: ScoredWatch[],
  limit: number,
  familyLimit: number,
  brandLimit: number
): ScoredWatch[] {
  const selected: ScoredWatch[] = [];
  const selectedIds = new Set<string>();
  const familyCounts = new Map<string, number>();
  const brandCounts = new Map<string, number>();

  for (const item of ranked) {
    const family = watchFamilyKey(item.watch);
    const brand = item.watch.brand.toLowerCase();
    if ((familyCounts.get(family) ?? 0) >= familyLimit) continue;
    if ((brandCounts.get(brand) ?? 0) >= brandLimit) continue;
    selected.push(item);
    selectedIds.add(item.watch.id);
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
    brandCounts.set(brand, (brandCounts.get(brand) ?? 0) + 1);
    if (selected.length >= limit) return selected;
  }

  for (const item of ranked) {
    if (selectedIds.has(item.watch.id)) continue;
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}
