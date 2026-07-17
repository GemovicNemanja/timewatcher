import type { CSSProperties } from "react";
import { trueScaleImageWidth } from "../lib/true-scale";
import type { Watch } from "../types";

type Props = {
  watch: Watch;
  loading?: "eager" | "lazy";
};

export function WatchImage({ watch, loading = "lazy" }: Props) {
  const style = { "--watch-image-width": `${trueScaleImageWidth(watch)}px` } as CSSProperties;
  return (
    <img
      className="watch-image"
      src={watch.image.src}
      width={watch.image.w}
      height={watch.image.h}
      alt={`${watch.brand} ${watch.model}`}
      loading={loading}
      decoding="async"
      style={style}
    />
  );
}
