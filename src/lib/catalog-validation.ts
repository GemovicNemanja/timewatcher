import type { Watch } from "../types";

export const REQUIRED_FACT_FIELDS = [
  "brand",
  "model",
  "reference",
  "price.retail",
  "price.preOwnedLow",
  "price.preOwnedHigh",
  "specs.caseDiameterMm",
  "specs.thicknessMm",
  "specs.lugToLugMm",
  "specs.lugWidthMm",
  "specs.movementType",
  "specs.caliber",
  "specs.powerReserveH",
  "specs.waterResistanceM",
  "specs.crystal",
  "specs.yearReleased"
] as const;

export type CatalogFactField =
  | (typeof REQUIRED_FACT_FIELDS)[number]
  | "specs.caseWidthMm";

export type CatalogSourceCitation = {
  url: string;
  retrievedAt: string;
  /** Original source properties, preserved before normalization. */
  raw: Record<string, string | number | boolean | null>;
  /** Catalog field -> key in `raw`; this makes every normalization auditable. */
  fields: Partial<Record<CatalogFactField, string>>;
  note?: string;
};

export type WatchProvenance = {
  sources: CatalogSourceCitation[];
  image: {
    kind:
      | "manufacturer-product-photo"
      | "licensed-product-photo"
      | "public-domain-product-photo";
    sourceUrl: string;
    sourcePageUrl: string;
    retrievedAt: string;
    sha256: string;
    usage: "local-demo-reference" | "licensed" | "public-domain" | "permission-granted";
  };
  description: {
    method: "human-authored" | "anthropic-vision" | "source-derived";
    sourceUrls: string[];
  };
};

export type CatalogProvenance = {
  version: 1;
  watches: Record<string, WatchProvenance>;
};

export type LocalImageInspection = {
  exists: boolean;
  byteLength: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  hasTransparency: boolean;
  sha256: string;
};

export type CatalogValidationIssue = {
  code: string;
  message: string;
  watchId?: string;
  field?: string;
};

export type CatalogValidationOptions = {
  currentYear?: number;
  minimumWatches?: number;
};

const PLACEHOLDER_PATTERN = /(?:^|[-_/.])(placeholder|fallback|mock|sample|dummy|generated|illustration|example)(?:[-_/.]|$)/i;
const EMPTY_TEXT_PATTERN = /^(?:unknown|n\/?a|none|null|tbd|todo|-+)$/i;
const MOVEMENT_TYPES = new Set(["automatic", "hand-wound", "quartz", "solar", "spring-drive", "unknown"]);
const CRYSTAL_TYPES = new Set(["sapphire", "mineral", "acrylic", "unknown"]);

function issue(
  issues: CatalogValidationIssue[],
  code: string,
  message: string,
  watchId?: string,
  field?: string
): void {
  issues.push({ code, message, watchId, field });
}

function isUsefulText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !EMPTY_TEXT_PATTERN.test(value.trim());
}

function isPlausibleNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isHttpsSource(value: unknown): value is string {
  if (typeof value !== "string" || PLACEHOLDER_PATTERN.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.length > 0 &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1" &&
      url.hostname !== "0.0.0.0"
    );
  } catch {
    return false;
  }
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.includes("T") && Number.isFinite(Date.parse(value));
}

function catalogValueForField(watch: Watch, field: CatalogFactField): unknown {
  const [group, key] = field.split(".");
  if (!key) return watch[group as "brand" | "model" | "reference"];
  if (group === "price") return watch.price[key as keyof Watch["price"]];
  return watch.specs[key as keyof Watch["specs"]];
}

function validateRange(
  issues: CatalogValidationIssue[],
  watchId: string,
  field: string,
  value: unknown,
  minimum: number,
  maximum: number
): void {
  if (!isPlausibleNumber(value, minimum, maximum)) {
    issue(
      issues,
      "implausible-number",
      `${field} must be a finite number between ${minimum} and ${maximum}.`,
      watchId,
      field
    );
  }
}

function validateNullableRange(
  issues: CatalogValidationIssue[],
  watchId: string,
  field: string,
  value: unknown,
  minimum: number,
  maximum: number
): void {
  if (value === null) return;
  validateRange(issues, watchId, field, value, minimum, maximum);
}

function validateWatchFacts(
  watch: Watch,
  issues: CatalogValidationIssue[],
  currentYear: number
): void {
  const id = watch.id;
  for (const [field, value] of [
    ["id", watch.id],
    ["brand", watch.brand],
    ["model", watch.model],
    ["reference", watch.reference]
  ] as const) {
    if (!isUsefulText(value)) {
      issue(issues, "missing-field", `${field} must contain a real value.`, id, field);
    }
  }
  if (watch.specs?.caliber !== null && !isUsefulText(watch.specs?.caliber)) {
    issue(
      issues,
      "missing-field",
      "specs.caliber must contain a real value or be explicitly null.",
      id,
      "specs.caliber"
    );
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    issue(issues, "invalid-id", "id must be a lowercase kebab-case slug.", id, "id");
  }

  const descriptionWords = isUsefulText(watch.styleDescription)
    ? watch.styleDescription.trim().split(/\s+/).length
    : 0;
  if (descriptionWords < 40 || descriptionWords > 260) {
    issue(
      issues,
      "invalid-description",
      "styleDescription must be substantive prose between 40 and 260 words.",
      id,
      "styleDescription"
    );
  }

  if (watch.price?.retail !== null) {
    validateRange(issues, id, "price.retail", watch.price?.retail, 1, 10_000_000);
  }
  if (watch.price?.preOwnedLow !== null) {
    validateRange(issues, id, "price.preOwnedLow", watch.price?.preOwnedLow, 1, 10_000_000);
  }
  if (watch.price?.preOwnedHigh !== null) {
    validateRange(issues, id, "price.preOwnedHigh", watch.price?.preOwnedHigh, 1, 10_000_000);
  }
  if (
    typeof watch.price?.preOwnedLow === "number" &&
    typeof watch.price?.preOwnedHigh === "number" &&
    watch.price.preOwnedLow > watch.price.preOwnedHigh
  ) {
    issue(
      issues,
      "inverted-price-range",
      "price.preOwnedLow cannot exceed price.preOwnedHigh.",
      id,
      "price"
    );
  }

  const specs = watch.specs;
  validateNullableRange(issues, id, "specs.caseDiameterMm", specs?.caseDiameterMm, 10, 70);
  if (specs?.caseWidthMm !== undefined) {
    validateNullableRange(issues, id, "specs.caseWidthMm", specs.caseWidthMm, 8, 70);
  }
  validateNullableRange(issues, id, "specs.thicknessMm", specs?.thicknessMm, 2, 35);
  validateNullableRange(issues, id, "specs.lugToLugMm", specs?.lugToLugMm, 15, 90);
  validateNullableRange(issues, id, "specs.lugWidthMm", specs?.lugWidthMm, 5, 40);
  validateNullableRange(issues, id, "specs.waterResistanceM", specs?.waterResistanceM, 0, 12_000);
  validateNullableRange(issues, id, "specs.yearReleased", specs?.yearReleased, 1800, currentYear + 1);

  if (!MOVEMENT_TYPES.has(specs?.movementType)) {
    issue(issues, "invalid-enum", "specs.movementType is not supported.", id, "specs.movementType");
  }
  if (!CRYSTAL_TYPES.has(specs?.crystal)) {
    issue(issues, "invalid-enum", "specs.crystal is not supported.", id, "specs.crystal");
  }

  if (!Array.isArray(watch.sourceSpecifications) || watch.sourceSpecifications.length === 0) {
    issue(
      issues,
      "missing-raw-specifications",
      "Original source specifications must be preserved alongside normalized fields.",
      id,
      "sourceSpecifications"
    );
  } else {
    for (const rawSpec of watch.sourceSpecifications) {
      if (!isUsefulText(rawSpec?.name) || !isUsefulText(rawSpec?.value)) {
        issue(
          issues,
          "invalid-raw-specification",
          "Every preserved source specification needs its original name and value.",
          id,
          "sourceSpecifications"
        );
      }
    }
  }
  if (specs?.powerReserveH !== null) {
    validateRange(issues, id, "specs.powerReserveH", specs?.powerReserveH, 1, 10_000);
  }

  if (
    typeof specs?.thicknessMm === "number" &&
    typeof specs?.lugToLugMm === "number" &&
    specs.thicknessMm >= specs.lugToLugMm
  ) {
    issue(
      issues,
      "implausible-proportions",
      "Thickness must be less than lug-to-lug length.",
      id,
      "specs"
    );
  }
  const image = watch.image;
  if (image?.kind !== "photo") {
    issue(
      issues,
      "non-photo-image",
      "image.kind must be photo; generated illustrations and fallbacks are rejected.",
      id,
      "image.kind"
    );
  }

  if (
    !isUsefulText(image?.src) ||
    !image.src.startsWith("/images/watches/") ||
    !image.src.endsWith(".avif") ||
    PLACEHOLDER_PATTERN.test(image.src)
  ) {
    issue(
      issues,
      "invalid-image-path",
      "image.src must point to a non-placeholder local AVIF under /images/watches/.",
      id,
      "image.src"
    );
  }
  const expectedImageName = `${id}.avif`;
  if (isUsefulText(image?.src) && image.src.split("/").at(-1) !== expectedImageName) {
    issue(
      issues,
      "mismatched-image-id",
      `image.src must end in ${expectedImageName}.`,
      id,
      "image.src"
    );
  }
  validateRange(issues, id, "image.w", image?.w, 400, 4096);
  validateRange(issues, id, "image.h", image?.h, 400, 4096);
  const bbox = image?.alphaBbox;
  if (
    !Array.isArray(bbox) ||
    bbox.length !== 4 ||
    !bbox.every((value) => Number.isFinite(value)) ||
    bbox[0] < 0 ||
    bbox[1] < 0 ||
    bbox[2] <= bbox[0] ||
    bbox[3] <= bbox[1] ||
    bbox[2] > image.w ||
    bbox[3] > image.h
  ) {
    issue(
      issues,
      "invalid-alpha-bbox",
      "image.alphaBbox must be a valid visible-pixel box inside the image.",
      id,
      "image.alphaBbox"
    );
  }
}

function validateProvenance(
  watch: Watch,
  provenance: WatchProvenance | undefined,
  inspection: LocalImageInspection | undefined,
  issues: CatalogValidationIssue[]
): void {
  const id = watch.id;
  if (!provenance) {
    issue(
      issues,
      "missing-provenance",
      "Every watch requires field and image provenance.",
      id
    );
    return;
  }

  if (!Array.isArray(provenance.sources) || provenance.sources.length === 0) {
    issue(issues, "missing-sources", "At least one factual source is required.", id, "sources");
  }

  const coveredFields = new Set<CatalogFactField>();
  const knownFields = new Set<CatalogFactField>([
    ...REQUIRED_FACT_FIELDS,
    "specs.caseWidthMm"
  ]);
  for (const source of provenance.sources ?? []) {
    if (!isHttpsSource(source.url)) {
      issue(issues, "invalid-source-url", "Fact sources must use a real HTTPS URL.", id, "sources.url");
    }
    if (!isIsoTimestamp(source.retrievedAt)) {
      issue(issues, "invalid-retrieved-at", "Fact sources need an ISO retrieval timestamp.", id, "sources.retrievedAt");
    }
    if (
      !source.raw ||
      typeof source.raw !== "object" ||
      Array.isArray(source.raw) ||
      Object.keys(source.raw).length === 0
    ) {
      issue(
        issues,
        "missing-raw-source",
        "Each citation must preserve its original source properties.",
        id,
        "sources.raw"
      );
      continue;
    }
    for (const [field, rawKey] of Object.entries(source.fields ?? {})) {
      if (!knownFields.has(field as CatalogFactField)) {
        issue(
          issues,
          "unknown-source-field",
          `Citation maps an unsupported catalog field: ${field}.`,
          id,
          field
        );
        continue;
      }
      if (
        typeof rawKey !== "string" ||
        rawKey.length === 0 ||
        !Object.prototype.hasOwnProperty.call(source.raw, rawKey)
      ) {
        issue(
          issues,
          "missing-raw-property",
          `${field} must map to a preserved raw source property.`,
          id,
          field
        );
        continue;
      }
      const rawValue = source.raw[rawKey];
      if (typeof rawValue === "string" && !isUsefulText(rawValue)) {
        issue(
          issues,
          "placeholder-raw-value",
          `${field} maps to a placeholder rather than a source value; use null for unknown.`,
          id,
          field
        );
        continue;
      }
      const catalogValue = catalogValueForField(watch, field as CatalogFactField);
      if (catalogValue !== null && catalogValue !== undefined && rawValue === null) {
        issue(
          issues,
          "fabricated-value",
          `${field} has a catalog value although its mapped raw source property is null.`,
          id,
          field
        );
        continue;
      }
      if (
        typeof catalogValue === "number" &&
        typeof rawValue !== "number" &&
        !(typeof rawValue === "string" && /\d/.test(rawValue))
      ) {
        issue(
          issues,
          "unsubstantiated-number",
          `${field} is numeric but its raw source property contains no number.`,
          id,
          field
        );
        continue;
      }
      coveredFields.add(field as CatalogFactField);
    }
  }

  const requiredFields: CatalogFactField[] = REQUIRED_FACT_FIELDS.filter((field) => {
    const value = catalogValueForField(watch, field);
    return value !== null && value !== undefined && value !== "unknown";
  });
  if (watch.specs.caseWidthMm !== undefined && watch.specs.caseWidthMm !== null) {
    requiredFields.push("specs.caseWidthMm");
  }
  for (const field of requiredFields) {
    if (!coveredFields.has(field)) {
      issue(
        issues,
        "unsourced-field",
        `${field} is not covered by a source citation.`,
        id,
        field
      );
    }
  }

  const image = provenance.image;
  if (!image || ![
    "manufacturer-product-photo",
    "licensed-product-photo",
    "public-domain-product-photo"
  ].includes(image.kind)) {
    issue(
      issues,
      "unverified-image-kind",
      "Image provenance must identify a real product-photo source; illustrations are rejected.",
      id,
      "image.kind"
    );
  }
  if (!isHttpsSource(image?.sourceUrl) || !isHttpsSource(image?.sourcePageUrl)) {
    issue(
      issues,
      "invalid-image-source",
      "Image asset and source-page URLs must be real HTTPS URLs.",
      id,
      "image"
    );
  }
  if (!isIsoTimestamp(image?.retrievedAt)) {
    issue(issues, "invalid-retrieved-at", "Image provenance needs an ISO retrieval timestamp.", id, "image.retrievedAt");
  }
  if (!/^[a-f0-9]{64}$/i.test(image?.sha256 ?? "")) {
    issue(issues, "invalid-image-hash", "Image provenance needs a SHA-256 digest.", id, "image.sha256");
  }

  const description = provenance.description;
  if (!description || !["human-authored", "anthropic-vision", "source-derived"].includes(description.method)) {
    issue(
      issues,
      "invalid-description-provenance",
      "styleDescription must declare how it was produced.",
      id,
      "description.method"
    );
  }
  if (
    !Array.isArray(description?.sourceUrls) ||
    description.sourceUrls.length === 0 ||
    description.sourceUrls.some((url) => !isHttpsSource(url))
  ) {
    issue(
      issues,
      "invalid-description-sources",
      "styleDescription needs at least one real HTTPS source URL.",
      id,
      "description.sourceUrls"
    );
  }

  if (!inspection?.exists) {
    issue(issues, "missing-local-image", "The catalog image file does not exist.", id, "image.src");
    return;
  }
  if (inspection.byteLength < 5_000) {
    issue(
      issues,
      "suspicious-image-file",
      "The local image is too small to be an adequate product photo.",
      id,
      "image.src"
    );
  }
  if (inspection.width !== watch.image.w || inspection.height !== watch.image.h) {
    issue(
      issues,
      "image-dimension-mismatch",
      "Catalog image dimensions do not match the local asset.",
      id,
      "image"
    );
  }
  if (!inspection.hasAlpha || !inspection.hasTransparency) {
    issue(
      issues,
      "non-transparent-image",
      "Product photos must have real transparency for true-scale rendering.",
      id,
      "image.src"
    );
  }
  if (inspection.sha256.toLowerCase() !== (image?.sha256 ?? "").toLowerCase()) {
    issue(
      issues,
      "image-hash-mismatch",
      "The local photo does not match its provenance digest.",
      id,
      "image.sha256"
    );
  }
}

export function validateCatalogQuality(
  watches: Watch[],
  provenance: CatalogProvenance,
  images: ReadonlyMap<string, LocalImageInspection>,
  options: CatalogValidationOptions = {}
): CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = [];
  const currentYear = options.currentYear ?? new Date().getUTCFullYear();
  const minimumWatches = options.minimumWatches ?? 4;

  if (!Array.isArray(watches) || watches.length < minimumWatches) {
    issue(
      issues,
      "catalog-too-small",
      `Catalog must contain at least ${minimumWatches} watches.`
    );
    return issues;
  }
  if (provenance?.version !== 1 || !provenance.watches || typeof provenance.watches !== "object") {
    issue(issues, "invalid-provenance", "Provenance must use the version 1 object schema.");
    return issues;
  }

  const ids = new Set<string>();
  const references = new Map<string, string>();
  const imageHashes = new Map<string, string>();

  for (const watch of watches) {
    if (ids.has(watch.id)) {
      issue(issues, "duplicate-id", `Duplicate watch id: ${watch.id}`, watch.id, "id");
    }
    ids.add(watch.id);

    const normalizedReference = `${watch.brand}:${watch.reference}`.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
    const priorReference = references.get(normalizedReference);
    if (priorReference) {
      issue(
        issues,
        "duplicate-reference",
        `${watch.brand} ${watch.reference} duplicates ${priorReference}.`,
        watch.id,
        "reference"
      );
    } else {
      references.set(normalizedReference, watch.id);
    }

    validateWatchFacts(watch, issues, currentYear);
    const inspection = images.get(watch.id);
    validateProvenance(watch, provenance.watches[watch.id], inspection, issues);

    if (inspection?.exists && inspection.sha256) {
      const priorImage = imageHashes.get(inspection.sha256);
      if (priorImage) {
        issue(
          issues,
          "duplicate-image",
          `Local photo is byte-identical to ${priorImage}; each reference needs its own product shot.`,
          watch.id,
          "image.src"
        );
      } else {
        imageHashes.set(inspection.sha256, watch.id);
      }
    }
  }

  for (const provenanceId of Object.keys(provenance.watches)) {
    if (!ids.has(provenanceId)) {
      issue(
        issues,
        "orphaned-provenance",
        `Provenance exists for a watch outside the catalog: ${provenanceId}`,
        provenanceId
      );
    }
  }

  return issues;
}
