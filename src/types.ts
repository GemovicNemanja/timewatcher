export type MovementType =
  | "automatic"
  | "hand-wound"
  | "quartz"
  | "solar"
  | "spring-drive"
  | "unknown";

export type CrystalType = "sapphire" | "mineral" | "acrylic" | "unknown";

export type WatchProvenance = {
  catalogUrl: string;
  manufacturerUrl: string | null;
  imageSourceUrl: string;
  retrievedAt: string;
};

export type SourceSpecification = {
  name: string;
  value: string;
};

export type Watch = {
  id: string;
  brand: string;
  model: string;
  reference: string;
  price: {
    retail: number | null;
    preOwnedLow: number | null;
    preOwnedHigh: number | null;
  };
  image: {
    src: string;
    w: number;
    h: number;
    alphaBbox: [number, number, number, number];
    kind?: "photo" | "illustration";
  };
  specs: {
    caseDiameterMm: number | null;
    caseWidthMm?: number | null;
    thicknessMm: number | null;
    lugToLugMm: number | null;
    lugWidthMm: number | null;
    movementType: MovementType;
    caliber: string | null;
    powerReserveH: number | null;
    waterResistanceM: number | null;
    crystal: CrystalType;
    yearReleased: number | null;
  };
  styleDescription: string;
  sourceSpecifications?: SourceSpecification[];
  provenance?: WatchProvenance;
};

export type SearchResult = {
  id: string;
  reason: string;
};

export type SearchStreamEvent =
  | { type: "meta"; mode: "semantic-rerank" | "recall-only" | "local-demo" }
  | { type: "result"; result: SearchResult }
  | { type: "done" }
  | { type: "error"; message: string; code?: string };

export type EmbeddingManifest = {
  version: 1;
  provider: "openai" | "local-hash";
  model: string;
  dimensions: number;
  count: number;
  ids: string[];
  contentHash: string;
  generatedAt: string;
  quantization: "symmetric-int8";
};
