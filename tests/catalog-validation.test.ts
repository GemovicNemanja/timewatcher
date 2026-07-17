import {
  REQUIRED_FACT_FIELDS,
  validateCatalogQuality,
  type CatalogProvenance,
  type LocalImageInspection
} from "../src/lib/catalog-validation";
import type { Watch } from "../src/types";

const hash = "a".repeat(64);

function makeWatch(id = "acme-watch-ref-1", reference = "REF.1"): Watch {
  return {
    id,
    brand: "Acme",
    model: "Field Watch",
    reference,
    price: { retail: 1_000, preOwnedLow: 600, preOwnedHigh: 800 },
    image: {
      src: `/images/watches/${id}.avif`,
      w: 800,
      h: 800,
      alphaBbox: [220, 20, 580, 780],
      kind: "photo"
    },
    specs: {
      caseDiameterMm: 38,
      thicknessMm: 10,
      lugToLugMm: 46,
      lugWidthMm: 20,
      movementType: "automatic",
      caliber: "Acme 100",
      powerReserveH: 70,
      waterResistanceM: 100,
      crystal: "sapphire",
      yearReleased: 2024
    },
    styleDescription: Array.from(
      { length: 60 },
      (_, index) => `descriptive${index}`
    ).join(" "),
    sourceSpecifications: [
      { name: "case diameter", value: "38 mm" },
      { name: "movement autonomy", value: "70 hours" }
    ]
  };
}

function makeProvenance(watches: Watch[]): CatalogProvenance {
  const sourceValue = (watch: Watch, field: (typeof REQUIRED_FACT_FIELDS)[number]) => {
    const [group, key] = field.split(".");
    if (!key) return watch[group as "brand" | "model" | "reference"];
    if (group === "price") return watch.price[key as keyof Watch["price"]] ?? null;
    return watch.specs[key as keyof Watch["specs"]] ?? null;
  };

  return {
    version: 1,
    watches: Object.fromEntries(
      watches.map((watch) => [
        watch.id,
        {
          sources: [
            {
              url: `https://manufacturer.invalid/watches/${watch.reference}`,
              retrievedAt: "2026-07-17T12:00:00.000Z",
              raw: Object.fromEntries(
                REQUIRED_FACT_FIELDS.map((field) => [field, sourceValue(watch, field)])
              ),
              fields: Object.fromEntries(REQUIRED_FACT_FIELDS.map((field) => [field, field]))
            }
          ],
          image: {
            kind: "manufacturer-product-photo" as const,
            sourceUrl: `https://manufacturer.invalid/images/${watch.reference}.png`,
            sourcePageUrl: `https://manufacturer.invalid/watches/${watch.reference}`,
            retrievedAt: "2026-07-17T12:00:00.000Z",
            sha256: hash,
            usage: "local-demo-reference" as const
          },
          description: {
            method: "source-derived" as const,
            sourceUrls: [`https://manufacturer.invalid/watches/${watch.reference}`]
          }
        }
      ])
    )
  };
}

function makeInspections(watches: Watch[]): Map<string, LocalImageInspection> {
  return new Map(
    watches.map((watch, index) => [
      watch.id,
      {
        exists: true,
        byteLength: 50_000,
        width: 800,
        height: 800,
        hasAlpha: true,
        hasTransparency: true,
        sha256: index === 0 ? hash : `${index.toString(16)}`.padStart(64, "b").slice(-64)
      }
    ])
  );
}

describe("catalog quality validation", () => {
  it("accepts complete, sourced facts with a verified local product photo", () => {
    const watches = [makeWatch()];
    expect(
      validateCatalogQuality(watches, makeProvenance(watches), makeInspections(watches), {
        minimumWatches: 1,
        currentYear: 2026
      })
    ).toEqual([]);
  });

  it("rejects placeholder imagery, missing source coverage, and an altered local file", () => {
    const watches = [makeWatch()];
    const provenance = makeProvenance(watches);
    provenance.watches[watches[0].id].image.sourceUrl =
      "https://manufacturer.invalid/images/placeholder.png";
    provenance.watches[watches[0].id].sources[0].fields = {
      brand: "brand",
      model: "model"
    };
    const inspections = makeInspections(watches);
    inspections.get(watches[0].id)!.sha256 = "f".repeat(64);

    const codes = validateCatalogQuality(watches, provenance, inspections, {
      minimumWatches: 1,
      currentYear: 2026
    }).map((item) => item.code);

    expect(codes).toContain("invalid-image-source");
    expect(codes).toContain("unsourced-field");
    expect(codes).toContain("image-hash-mismatch");
  });

  it("rejects normalized duplicate references and implausible specifications", () => {
    const first = makeWatch("acme-watch-ref-1", "REF. 1");
    const second = makeWatch("acme-watch-ref-1-variant", "ref-1");
    second.specs.thicknessMm = 100;
    const watches = [first, second];
    const provenance = makeProvenance(watches);
    provenance.watches[second.id].image.sha256 = "b".repeat(64);

    const codes = validateCatalogQuality(watches, provenance, makeInspections(watches), {
      minimumWatches: 2,
      currentYear: 2026
    }).map((item) => item.code);

    expect(codes).toContain("duplicate-reference");
    expect(codes).toContain("implausible-number");
    expect(codes).toContain("implausible-proportions");
  });

  it("accepts an explicitly null unknown numeric spec when the raw source records it", () => {
    const watch = makeWatch();
    (watch.specs as unknown as { thicknessMm: number | null }).thicknessMm = null;
    const provenance = makeProvenance([watch]);
    provenance.watches[watch.id].sources[0].raw["specs.thicknessMm"] = null;

    const issues = validateCatalogQuality(
      [watch],
      provenance,
      makeInspections([watch]),
      { minimumWatches: 1, currentYear: 2026 }
    );

    expect(issues).toEqual([]);
  });

  it("accepts visible unknowns without demanding fabricated provenance", () => {
    const watch = makeWatch();
    watch.price.preOwnedLow = null;
    watch.price.preOwnedHigh = null;
    watch.specs.caliber = null;
    watch.specs.movementType = "unknown";
    watch.specs.crystal = "unknown";
    const provenance = makeProvenance([watch]);
    provenance.watches[watch.id].sources[0].fields = {
      brand: "brand",
      model: "model",
      reference: "reference",
      "price.retail": "price.retail",
      "specs.caseDiameterMm": "specs.caseDiameterMm",
      "specs.thicknessMm": "specs.thicknessMm",
      "specs.lugToLugMm": "specs.lugToLugMm",
      "specs.lugWidthMm": "specs.lugWidthMm",
      "specs.powerReserveH": "specs.powerReserveH",
      "specs.waterResistanceM": "specs.waterResistanceM",
      "specs.yearReleased": "specs.yearReleased"
    };

    expect(
      validateCatalogQuality([watch], provenance, makeInspections([watch]), {
        minimumWatches: 1,
        currentYear: 2026
      })
    ).toEqual([]);
  });
});
