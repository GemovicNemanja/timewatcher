import type { MovementType, Watch } from "../types";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

export function formatMoney(value: number | null): string {
  return value === null ? "Price on request" : money.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatMovement(type: MovementType): string {
  const labels: Record<MovementType, string> = {
    automatic: "Automatic",
    "hand-wound": "Hand-wound",
    quartz: "Quartz",
    solar: "Solar",
    "spring-drive": "Spring Drive",
    unknown: "Unknown"
  };
  return labels[type];
}

export function watchSummary(watch: Watch): string {
  const width = watch.specs.caseWidthMm ?? watch.specs.caseDiameterMm;
  const parts = [
    width === null ? null : `${formatNumber(width)}mm`,
    watch.specs.movementType === "unknown" ? null : formatMovement(watch.specs.movementType),
    watch.specs.waterResistanceM === null ? null : `${watch.specs.waterResistanceM}m`
  ].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" · ") : watch.reference;
}
