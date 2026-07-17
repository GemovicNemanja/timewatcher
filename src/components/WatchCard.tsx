import { formatMoney, watchSummary } from "../lib/format";
import type { Watch } from "../types";
import { WatchImage } from "./WatchImage";

type Props = {
  watch: Watch;
  reason?: string;
  selected: boolean;
  onOpen: (watch: Watch) => void;
  onToggleCompare: (watch: Watch) => void;
};

export function WatchCard({ watch, reason, selected, onOpen, onToggleCompare }: Props) {
  return (
    <article className="watch-card">
      <button
        className={`compare-toggle${selected ? " is-selected" : ""}`}
        type="button"
        aria-label={`${selected ? "Remove" : "Add"} ${watch.brand} ${watch.model} ${selected ? "from" : "to"} comparison`}
        aria-pressed={selected}
        onClick={() => onToggleCompare(watch)}
      >
        {selected ? "✓" : "+"}
      </button>
      <button
        className="card-detail-target"
        type="button"
        aria-label={`View details for ${watch.brand} ${watch.model}`}
        onClick={() => onOpen(watch)}
      >
        <span className="card-media">
          <WatchImage watch={watch} />
        </span>
        <span className="card-copy">
          <span className="watch-brand">{watch.brand}</span>
          <span className="watch-model">{watch.model}</span>
          <span className="watch-summary numeric">{watchSummary(watch)}</span>
          <span className="watch-price numeric">{formatMoney(watch.price.retail)}</span>
          {reason ? <span className="match-reason">{reason}</span> : null}
        </span>
      </button>
    </article>
  );
}
