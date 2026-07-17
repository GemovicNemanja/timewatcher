import {
  normalizeProduct,
  parseCataloguePage,
  parseCatalogueTotalPages,
  parseMeasurement,
  parseProductPage,
  spreadPageNumbers,
  type RawProduct
} from "../scripts/import-demo-catalog";

const productJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      name: "Rolex Submariner Date watch: Oystersteel",
      brand: { "@type": "Brand", name: "Rolex" },
      sku: "m126610ln-0001",
      category: "watch",
      image: [
        "https://media.rolex.example/catalogue/upright/m126610ln-0001.png",
        "https://media.rolex.example/catalogue/dial/m126610ln-0001.png"
      ],
      description: "Official product description.",
      url: "https://catalog.example/rolex/submariner",
      offers: { "@type": "Offer", priceCurrency: "USD", price: "11350" },
      additionalProperty: [
        { "@type": "PropertyValue", name: "collection", value: "Submariner" },
        { "@type": "PropertyValue", name: "case crystal", value: "Scratch-resistant sapphire" },
        { "@type": "PropertyValue", name: "case diameter", value: "41 mm" },
        { "@type": "PropertyValue", name: "movement calibre", value: "3235, Manufacture Rolex" },
        { "@type": "PropertyValue", name: "movement winding", value: "Self-winding via Perpetual rotor" },
        { "@type": "PropertyValue", name: "movement autonomy", value: "Approximately 70 hours" },
        { "@type": "PropertyValue", name: "case water resistance", value: "300 metres / 1,000 feet" }
      ]
    }
  ]
};

function productHtml(): string {
  return `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite" })}</script>
    <script type="application/ld+json">${JSON.stringify(productJsonLd)}</script>
    </head><body>
      <a href="https://www.rolex.com/en-us/watches/submariner/m126610ln-0001">Official source</a>
      <a href="https://www.getjewelops.com/">Provider</a>
    </body></html>`;
}

describe("Carat & Caliber demo catalog importer", () => {
  it("extracts rendered catalog cards without parsing duplicate Next payload text", () => {
    const html = `
      <a class="pcard" href="/rolex/submariner-m126610ln0001">
        <div class="pcard-img"><img src="https://media.example/watch.png" alt="Watch"><span class="pcard-ref">m126610ln-0001</span></div>
        <div class="pcard-body"><span class="bn">Rolex &amp; Co</span><div class="pcard-model">Submariner Date</div>
        <div class="pcard-spec">Submariner · 41 MM</div><span class="pcard-price">$$11,350 USD</span></div>
      </a>
      <a href="/brands/rolex">not a product card</a>`;

    expect(parseCataloguePage(html, "https://catalog.example")).toEqual([
      {
        detailUrl: "https://catalog.example/rolex/submariner-m126610ln0001",
        brand: "Rolex & Co",
        model: "Submariner Date",
        reference: "m126610ln-0001",
        collection: "Submariner",
        caseDiameterMm: 41,
        retailPrice: 11_350,
        imageUrl: "https://media.example/watch.png"
      }
    ]);
  });

  it("discovers pagination and samples the full catalog breadth deterministically", () => {
    expect(parseCatalogueTotalPages("<span>1<!-- --> / <!-- -->215</span>")).toBe(215);
    expect(parseCatalogueTotalPages('{"children":[1," / ",336]}')).toBe(336);
    expect(spreadPageNumbers(1, 215, 8)).toEqual([1, 108, 54, 162, 27, 135, 81, 189]);
    expect(new Set(spreadPageNumbers(1, 215, 60)).size).toBe(60);
  });

  it("extracts Product JSON-LD, all official properties, and official source URL", () => {
    const product = parseProductPage(productHtml(), "https://catalog.example/rolex/submariner");

    expect(product.brand).toBe("Rolex");
    expect(product.reference).toBe("m126610ln-0001");
    expect(product.retailPrice).toBe(11_350);
    expect(product.priceCurrency).toBe("USD");
    expect(product.imageUrls).toHaveLength(2);
    expect(product.officialSourceUrl).toBe(
      "https://www.rolex.com/en-us/watches/submariner/m126610ln-0001"
    );
    expect(product.properties).toMatchObject({
      "case diameter": "41 mm",
      "movement calibre": "3235, Manufacture Rolex",
      "case water resistance": "300 metres / 1,000 feet"
    });
  });

  it("normalizes published values while leaving unpublished values null", () => {
    const product = parseProductPage(productHtml(), "https://catalog.example/rolex/submariner");
    const result = normalizeProduct(product, { retrievedAt: "2026-07-17T00:00:00.000Z" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.watch).toMatchObject({
      id: "rolex-submariner-m126610ln-0001",
      brand: "Rolex",
      reference: "m126610ln-0001",
      price: {
        retail: 11_350,
        preOwnedLow: null,
        preOwnedHigh: null
      },
      specs: {
        caseDiameterMm: 41,
        thicknessMm: null,
        lugToLugMm: null,
        lugWidthMm: null,
        movementType: "automatic",
        caliber: "3235, Manufacture Rolex",
        powerReserveH: 70,
        waterResistanceM: 300,
        crystal: "sapphire",
        yearReleased: null
      }
    });
    expect(result.watch.image.kind).toBe("photo");
    expect(result.watch.sourceSpecifications).toContainEqual({
      name: "movement autonomy",
      value: "Approximately 70 hours"
    });
    expect(result.watch.provenance?.manufacturerUrl).toBe(
      "https://www.rolex.com/en-us/watches/submariner/m126610ln-0001"
    );
    expect(result.provenance.missingFields).toEqual(expect.arrayContaining([
      "specs.thicknessMm",
      "specs.lugToLugMm",
      "specs.lugWidthMm",
      "specs.yearReleased",
      "price.preOwnedLow",
      "price.preOwnedHigh"
    ]));
  });

  it("can reject incomplete core specs without manufacturing fallback data", () => {
    const product = parseProductPage(productHtml(), "https://catalog.example/rolex/submariner");
    const result = normalizeProduct(product, { requireCompleteCore: true });
    expect(result).toEqual({
      ok: false,
      missingRequiredFields: expect.arrayContaining([
        "specs.thicknessMm",
        "specs.lugToLugMm",
        "specs.lugWidthMm",
        "specs.yearReleased"
      ])
    });
  });

  it("does not confuse calibre dimensions with case dimensions", () => {
    const product = parseProductPage(productHtml(), "https://catalog.example/rolex/submariner");
    product.properties = {
      ...product.properties,
      "calibre mechanism": "Quartz",
      "calibre thickness": "2.3 mm",
      "calibre diameter": "15.2 mm"
    };
    delete product.properties["movement winding"];
    const result = normalizeProduct(product);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.watch.specs.movementType).toBe("quartz");
    expect(result.watch.specs.thicknessMm).toBeNull();
    expect(result.watch.specs.caseDiameterMm).toBe(41);
  });

  it("normalizes common metric and imperial case measurements", () => {
    expect(parseMeasurement("41 mm")).toBe(41);
    expect(parseMeasurement("4.1 cm")).toBe(41);
    expect(parseMeasurement('1.5 inches')).toBeCloseTo(38.1);
    expect(parseMeasurement("not published")).toBeNull();
  });

  it("rejects products without a real image URL", () => {
    const withoutImage: RawProduct = {
      ...parseProductPage(productHtml(), "https://catalog.example/rolex/submariner"),
      imageUrls: []
    };
    expect(normalizeProduct(withoutImage)).toEqual({
      ok: false,
      missingRequiredFields: ["image.src"]
    });
  });
});
