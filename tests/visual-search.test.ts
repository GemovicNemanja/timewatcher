import catalogJson from "../src/data/catalog.json";
import {
  dialColorConstraintTier,
  dialColorEvidence,
  extractVisualQueryConstraints,
  watchSearchDocument
} from "../src/lib/visual-search";
import type { Watch } from "../src/types";

const catalog = catalogJson as Watch[];
const byId = new Map(catalog.map((watch) => [watch.id, watch]));

describe("visual search constraints", () => {
  it.each([
    ["vintage field watch with a cream dial", ["cream"]],
    ["cream dial with a black strap", ["cream"]],
    ["cream dial, blue bezel", ["cream"]],
    ["silver dial with blue hands", ["silver"]],
    ["blue strap with blue dial", ["blue"]],
    ["cream leather strap with a black dial", ["black"]],
    ["cream dials", ["cream"]],
    ["cream colored softly grained sunburst finished vintage inspired dial", ["cream"]],
    ["not blue or green dial", []],
    ["anything but a cream dial", []],
    ["cream strap on a field watch", []]
  ])("scopes colours to the dial in %s", (query, dialColors) => {
    expect(extractVisualQueryConstraints(query).dialColors).toEqual(dialColors);
  });

  it("recognizes the four catalog watches with verified warm-neutral dials", () => {
    const warmIds = catalog
      .filter((watch) => dialColorConstraintTier(watch, ["cream"]) === 0)
      .map((watch) => watch.id)
      .sort();
    expect(warmIds).toEqual([
      "breitling-superocean-heritage-u10340e31a1a1",
      "hamilton-khaki-navy-h77525553",
      "patek-philippe-complications-5396r-016",
      "patek-philippe-complications-5524g-010"
    ]);
  });

  it("does not mistake beige accents, counters, or straps for a cream dial", () => {
    const greyWithBeigeCounters = byId.get("audemars-piguet-royal-oak-26450or-oo-1356or-01-b")!;
    const beigeStrap = byId.get("iwc-pilot-iw328106")!;
    expect(dialColorEvidence(greyWithBeigeCounters).families).toEqual(["grey"]);
    expect(dialColorConstraintTier(greyWithBeigeCounters, ["cream"])).toBe(2);
    expect(dialColorEvidence(beigeStrap).families).toEqual(["brown"]);
    expect(dialColorConstraintTier(beigeStrap, ["cream"])).toBe(2);
  });

  it("keeps component-only dial copy unknown and understands source-language colours", () => {
    expect(dialColorEvidence(byId.get("audemars-piguet-royal-oak-15407st-oo-1220st-02")!).families).toEqual([]);
    expect(dialColorEvidence(byId.get("patek-philippe-complications-5905r-010")!).families).toEqual(["blue"]);
    expect(dialColorEvidence(byId.get("patek-philippe-complications-5924g-001")!).families).toEqual(["blue", "grey"]);
    expect(dialColorEvidence(byId.get("patek-philippe-complications-5249r-001")!).families).toEqual(["brown"]);
    expect(dialColorEvidence(byId.get("patek-philippe-complications-5924g-010")!).families).toEqual(["green"]);
    expect(dialColorEvidence(byId.get("iwc-ingenieur-iw328903")!).families).toEqual(["blue"]);
  });

  it("includes normalized and manufacturer specifications in embedding documents", () => {
    const watch = byId.get("hamilton-khaki-navy-h77525553")!;
    const document = watchSearchDocument(watch);
    expect(document).toContain("normalized dial color: cream");
    expect(document).toContain("dial color: Beige");
    expect(document).toContain(`movementType: ${watch.specs.movementType}`);
    expect(document).toContain(watch.reference);
  });
});
