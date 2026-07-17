import { PX_PER_MM } from "./constants";
import type { Watch } from "../types";

export function trueScaleImageWidth(watch: Watch): number {
  const caseWidthMm = watch.specs.caseWidthMm ?? watch.specs.caseDiameterMm ?? 40;
  const [left, , right] = watch.image.alphaBbox;
  const visibleWidth = Math.max(1, right - left);
  return caseWidthMm * PX_PER_MM * (watch.image.w / visibleWidth);
}
