import catalog from "../src/data/catalog.json";
import { diversifyRanked, watchFamilyKey } from "../src/lib/diversity";
import type { Watch } from "../src/types";

const watches = catalog as Watch[];

describe("catalog result diversity", () => {
  it("uses preserved collection data as a stable family key", () => {
    const watch = watches.find((candidate) => candidate.sourceSpecifications?.some((specification) => specification.name === "collection"));
    expect(watch).toBeDefined();
    expect(watchFamilyKey(watch!)).toContain(watch!.brand.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  });

  it("caps repeated families and brands when alternatives exist", () => {
    const ranked = watches.slice(0, 120).map((watch, index) => ({ watch, score: 120 - index }));
    const selected = diversifyRanked(ranked, 12, 2, 4);
    const brands = selected.reduce<Record<string, number>>((counts, item) => {
      counts[item.watch.brand] = (counts[item.watch.brand] ?? 0) + 1;
      return counts;
    }, {});
    expect(selected).toHaveLength(12);
    expect(Math.max(...Object.values(brands))).toBeLessThanOrEqual(4);
  });
});
