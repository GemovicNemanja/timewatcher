import { formatMoney, formatMovement, formatNumber } from "./format";
import type { Watch } from "../types";

export type SpecDef = {
  key: string;
  label: string;
  shortLabel?: string;
  info?: string;
  format: (watch: Watch) => string;
  compare?: {
    value: (watch: Watch) => number | null;
    direction: "higher" | "lower";
    superlative: string;
  };
};

export const specDefinitions: SpecDef[] = [
  {
    key: "price",
    label: "Price",
    format: (watch) => formatMoney(watch.price.retail)
  },
  {
    key: "case",
    label: "Case diameter",
    shortLabel: "Case",
    info: "How wide the watch face is, not counting the crown. Most wrists suit 36–42mm — but lug-to-lug matters more.",
    format: (watch) => {
      const value = watch.specs.caseWidthMm ?? watch.specs.caseDiameterMm;
      return value === null ? "—" : `${formatNumber(value)}mm`;
    }
  },
  {
    key: "thickness",
    label: "Thickness",
    shortLabel: "Thickness",
    info: "How far it stands off your wrist. Under 12mm slides under a shirt cuff. Over 14mm won't.",
    format: (watch) => watch.specs.thicknessMm === null ? "—" : `${formatNumber(watch.specs.thicknessMm)}mm`,
    compare: {
      value: (watch) => watch.specs.thicknessMm,
      direction: "lower",
      superlative: "Thinnest"
    }
  },
  {
    key: "lugToLug",
    label: "Lug-to-lug",
    shortLabel: "Lug-to-lug",
    info: "Tip-to-tip length, and the number that actually decides fit. If it's wider than your wrist, the watch overhangs and looks wrong no matter what the diameter says.",
    format: (watch) => watch.specs.lugToLugMm === null ? "—" : `${formatNumber(watch.specs.lugToLugMm)}mm`
  },
  {
    key: "movement",
    label: "Movement",
    info: "Automatic winds itself from your wrist's motion. Hand-wound needs winding daily. Quartz runs on a battery — and is more accurate than either.",
    format: (watch) => {
      const movement = formatMovement(watch.specs.movementType);
      return watch.specs.caliber ? `${movement} · ${watch.specs.caliber}` : movement === "Unknown" ? "—" : movement;
    }
  },
  {
    key: "powerReserve",
    label: "Power reserve",
    shortLabel: "Reserve",
    info: "How long it keeps running after you take it off. Under 48h means it stops over a weekend and needs resetting Monday.",
    format: (watch) =>
      watch.specs.powerReserveH === null ? "—" : `${watch.specs.powerReserveH}h`,
    compare: {
      value: (watch) => watch.specs.powerReserveH,
      direction: "higher",
      superlative: "Longest"
    }
  },
  {
    key: "waterResistance",
    label: "Water resistance",
    shortLabel: "Water",
    info: "Not literal depth. 30m: splashes. 50m: swimming. 100m: snorkelling. 200m+: actual diving.",
    format: (watch) => watch.specs.waterResistanceM === null ? "—" : `${watch.specs.waterResistanceM}m`,
    compare: {
      value: (watch) => watch.specs.waterResistanceM,
      direction: "higher",
      superlative: "Deepest"
    }
  },
  {
    key: "crystal",
    label: "Crystal",
    info: "The glass. Sapphire is nearly unscratchable. Mineral scratches. Acrylic scratches if you look at it, but polishes out with toothpaste.",
    format: (watch) => watch.specs.crystal === "unknown"
      ? "—"
      : watch.specs.crystal[0].toUpperCase() + watch.specs.crystal.slice(1)
  },
  {
    key: "lugWidth",
    label: "Lug width",
    info: "The strap width — decides which straps fit. 20mm is the most common, so straps are cheap and everywhere.",
    format: (watch) => watch.specs.lugWidthMm === null ? "—" : `${formatNumber(watch.specs.lugWidthMm)}mm`
  }
];

export function winnerIds(definition: SpecDef, watches: Watch[]): Set<string> {
  if (!definition.compare || watches.length < 2) return new Set();
  const measured = watches
    .map((watch) => ({ watch, value: definition.compare!.value(watch) }))
    .filter((item): item is { watch: Watch; value: number } => item.value !== null);
  if (measured.length < 2) return new Set();
  const values = measured.map(({ value }) => value);
  const winningValue =
    definition.compare.direction === "higher" ? Math.max(...values) : Math.min(...values);
  return new Set(
    measured.filter(({ value }) => value === winningValue).map(({ watch }) => watch.id)
  );
}
