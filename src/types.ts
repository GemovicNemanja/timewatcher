export type MovementType =
  | "automatic"
  | "hand-wound"
  | "quartz"
  | "solar"
  | "spring-drive";

export type CrystalType = "sapphire" | "mineral" | "acrylic";

export type Watch = {
  id: string;
  brand: string;
  model: string;
  reference: string;
  price: {
    retail: number | null;
    preOwnedLow: number;
    preOwnedHigh: number;
  };
  image: {
    src: string;
    w: number;
    h: number;
    alphaBbox: [number, number, number, number];
  };
  specs: {
    caseDiameterMm: number;
    caseWidthMm?: number;
    thicknessMm: number;
    lugToLugMm: number;
    lugWidthMm: number;
    movementType: MovementType;
    caliber: string;
    powerReserveH: number | null;
    waterResistanceM: number;
    crystal: CrystalType;
    yearReleased: number;
  };
  styleDescription: string;
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
