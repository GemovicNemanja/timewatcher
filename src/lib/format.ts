import type { MovementType, Watch } from "../types";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

export function formatMoney(value: number | null): string {
  return value === null ? "Price on request" : money.format(value);
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatMovement(type: MovementType): string {
  const labels: Record<MovementType, string> = {
    automatic: "Automatic",
    "hand-wound": "Hand-wound",
    quartz: "Quartz",
    solar: "Solar",
    "spring-drive": "Spring Drive"
  };
  return labels[type];
}

export function watchSummary(watch: Watch): string {
  const width = watch.specs.caseWidthMm ?? watch.specs.caseDiameterMm;
  return `${formatNumber(width)}mm · ${formatMovement(watch.specs.movementType)} · ${watch.specs.waterResistanceM}m`;
}
