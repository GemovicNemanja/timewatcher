import catalog from "../src/data/catalog.json";
import { toggleComparison } from "../src/lib/compare";
import { specDefinitions, winnerIds } from "../src/lib/specs";
import type { Watch } from "../src/types";

const watches = catalog as Watch[];

describe("comparison rules", () => {
  it("rejects a fifth watch without dropping an existing selection", () => {
    const selected = watches.slice(0, 4).map((watch) => watch.id);
    const result = toggleComparison(selected, watches[4].id);
    expect(result).toEqual({ ids: selected, limited: true });
  });

  it("removes an already-selected watch", () => {
    const selected = watches.slice(0, 3).map((watch) => watch.id);
    expect(toggleComparison(selected, selected[1])).toEqual({
      ids: [selected[0], selected[2]],
      limited: false
    });
  });

  it("badges every tie and never badges price, case size, or movement", () => {
    const reserve = specDefinitions.find((definition) => definition.key === "powerReserve")!;
    const tied = winnerIds(reserve, [watches[0], watches[1]]);
    expect(tied).toEqual(new Set([watches[0].id, watches[1].id]));
    for (const key of ["price", "case", "movement"]) {
      const definition = specDefinitions.find((item) => item.key === key)!;
      expect(definition.compare).toBeUndefined();
      expect(winnerIds(definition, watches.slice(0, 3)).size).toBe(0);
    }
  });

  it("does not badge with fewer than two watches", () => {
    const thickness = specDefinitions.find((definition) => definition.key === "thickness")!;
    expect(winnerIds(thickness, watches.slice(0, 1)).size).toBe(0);
  });
});
