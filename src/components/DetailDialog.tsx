import { useEffect, useRef, useState } from "react";
import { formatMoney } from "../lib/format";
import { specDefinitions } from "../lib/specs";
import type { Watch } from "../types";
import { WatchImage } from "./WatchImage";

type Props = {
  watch: Watch | null;
  selected: boolean;
  onClose: () => void;
  onToggleCompare: (watch: Watch) => void;
};

type MoreInfoDialogProps = {
  watch: Watch;
  onClose: () => void;
};

function closeDialog(dialog: HTMLDialogElement | null, onFallbackClose: () => void) {
  if (!dialog) return;
  if (typeof dialog.close === "function") {
    dialog.close();
    return;
  }
  dialog.removeAttribute("open");
  onFallbackClose();
}

function MoreInfoDialog({ watch, onClose }: MoreInfoDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal more-info-modal"
      aria-labelledby="more-info-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) closeDialog(ref.current, onClose);
      }}
    >
      <div className="modal-shell more-info-shell">
        <div className="more-info-heading">
          <div>
            <span className="watch-brand">{watch.brand}</span>
            <h2 id="more-info-title">More information</h2>
            <p className="reference">{watch.model} · {watch.reference}</p>
          </div>
          <button className="modal-close" type="button" aria-label="Close more information" onClick={() => closeDialog(ref.current, onClose)}>
            ×
          </button>
        </div>
        <section className="detail-specs source-specs" aria-labelledby="source-specification-title">
          <h3 id="source-specification-title"><span>All official specifications</span></h3>
          <dl>
            {watch.sourceSpecifications?.map((specification) => (
              <div className="detail-spec-row" key={`${specification.name}:${specification.value}`}>
                <dt>{specification.name}</dt>
                <dd>{specification.value}</dd>
              </div>
            ))}
          </dl>
          {watch.provenance ? (
            <p className="source-note">
              Data and imagery retrieved {new Date(watch.provenance.retrievedAt).toLocaleDateString("en-US")} ·{" "}
              <a href={watch.provenance.catalogUrl} target="_blank" rel="noreferrer">View source ↗</a>
              {watch.provenance.manufacturerUrl ? (
                <> · <a href={watch.provenance.manufacturerUrl} target="_blank" rel="noreferrer">Manufacturer ↗</a></>
              ) : null}
            </p>
          ) : null}
        </section>
      </div>
    </dialog>
  );
}

export function DetailDialog({ watch, selected, onClose, onToggleCompare }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [moreInfoOpen, setMoreInfoOpen] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (watch && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    if (!watch && dialog.open) closeDialog(dialog, () => undefined);
  }, [watch]);

  useEffect(() => {
    setMoreInfoOpen(false);
  }, [watch?.id]);

  const specRows = specDefinitions.filter((definition) => definition.key !== "price");
  const preOwnedPrice = watch?.price.preOwnedLow === null && watch.price.preOwnedHigh === null
    ? "Not available"
    : watch?.price.preOwnedLow === watch?.price.preOwnedHigh
      ? formatMoney(watch?.price.preOwnedLow ?? null)
      : `${formatMoney(watch?.price.preOwnedLow ?? null)} – ${formatMoney(watch?.price.preOwnedHigh ?? null)}`;

  return (
    <>
      <dialog
        ref={ref}
        className="modal detail-modal"
        aria-labelledby="detail-title"
        onClose={() => {
          setMoreInfoOpen(false);
          onClose();
        }}
        onClick={(event) => {
          if (event.target === ref.current) closeDialog(ref.current, () => {
            setMoreInfoOpen(false);
            onClose();
          });
        }}
      >
        {watch ? (
          <div className="modal-shell detail-shell">
            <button className="modal-close" type="button" aria-label="Close details" onClick={() => closeDialog(ref.current, () => {
              setMoreInfoOpen(false);
              onClose();
            })}>
              ×
            </button>
            <div className="detail-media">
              <WatchImage watch={watch} loading="eager" />
            </div>
            <div className="detail-content">
              <div className="detail-heading">
                <span className="watch-brand">{watch.brand}</span>
                <h2 id="detail-title">{watch.model}</h2>
                <p className="reference">{watch.reference}</p>
                <div className="detail-price-block numeric">
                  <p><strong>{formatMoney(watch.price.retail)}</strong><span>new / retail</span></p>
                  <p><strong>{preOwnedPrice}</strong><span>pre-owned</span></p>
                </div>
              </div>
              <p className="style-description">{watch.styleDescription}</p>
              <section className="detail-specs" aria-labelledby="specification-title">
                <h3 id="specification-title"><span>Specifications</span></h3>
                <dl>
                  {specRows.map((definition) => (
                    <div className="detail-spec-row" key={definition.key}>
                      <dt>{definition.label}</dt>
                      <dd className="numeric">{definition.format(watch)}</dd>
                    </div>
                  ))}
                  <div className="detail-spec-row">
                    <dt>Released</dt>
                    <dd className="numeric">{watch.specs.yearReleased ?? "—"}</dd>
                  </div>
                </dl>
              </section>
              <div className="detail-actions">
                {watch.sourceSpecifications && watch.sourceSpecifications.length > 0 ? (
                  <button className="secondary-button more-info-button" type="button" aria-haspopup="dialog" onClick={() => setMoreInfoOpen(true)}>
                    More info <span aria-hidden="true">→</span>
                  </button>
                ) : null}
                <button className="primary-button detail-compare" type="button" onClick={() => onToggleCompare(watch)}>
                  {selected ? "✓ Added to compare" : "+ Add to compare"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </dialog>
      {watch && moreInfoOpen ? <MoreInfoDialog watch={watch} onClose={() => setMoreInfoOpen(false)} /> : null}
    </>
  );
}
