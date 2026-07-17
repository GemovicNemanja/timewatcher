import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_COMPARE } from "../lib/constants";
import { specDefinitions, winnerIds } from "../lib/specs";
import type { Watch } from "../types";
import { InfoTooltip } from "./InfoTooltip";
import { WatchImage } from "./WatchImage";

type Props = {
  open: boolean;
  watches: Watch[];
  catalog: Watch[];
  onClose: () => void;
  onAdd: (watch: Watch) => void;
  onRemove: (id: string) => void;
};

export function CompareDialog({ open, watches, catalog, onClose, onAdd, onRemove }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPickerOpen(false);
      setFilter("");
    }
  }, [open]);

  const selectedIds = useMemo(() => new Set(watches.map((watch) => watch.id)), [watches]);
  const available = catalog.filter((watch) => {
    if (selectedIds.has(watch.id)) return false;
    const needle = filter.trim().toLowerCase();
    return !needle || `${watch.brand} ${watch.model} ${watch.reference}`.toLowerCase().includes(needle);
  });
  const showAdd = watches.length < MAX_COMPARE;
  const tableColumns = watches.length + (showAdd ? 1 : 0);

  return (
    <dialog
      ref={ref}
      className="modal compare-modal"
      aria-labelledby="compare-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) ref.current.close();
      }}
    >
      <div className="modal-shell compare-shell">
        <div className="compare-title-row">
          <h2 id="compare-title">Compare</h2>
          <button className="modal-close" type="button" aria-label="Close comparison" onClick={() => ref.current?.close()}>
            ×
          </button>
        </div>
        <p className="compare-intro">Numbers line up. The ⓘ notes explain what they mean on a wrist.</p>
        <div className="compare-scroll">
          <table className="compare-table" style={{ "--compare-columns": tableColumns } as React.CSSProperties}>
            <thead>
              <tr>
                <th scope="col"><span className="visually-hidden">Specification</span></th>
                {watches.map((watch) => (
                  <th scope="col" key={watch.id}>
                    <div className="compare-watch">
                      <div className="compare-media"><WatchImage watch={watch} /></div>
                      <span className="watch-brand">{watch.brand}</span>
                      <strong>{watch.model}</strong>
                      <button type="button" onClick={() => onRemove(watch.id)} aria-label={`Remove ${watch.brand} ${watch.model}`}>
                        Remove ×
                      </button>
                    </div>
                  </th>
                ))}
                {showAdd ? (
                  <th scope="col" className="add-column">
                    <button className="add-watch-button" type="button" onClick={() => setPickerOpen((value) => !value)} aria-expanded={pickerOpen}>
                      <span>+</span> Add watch
                    </button>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {specDefinitions.map((definition) => {
                const winners = winnerIds(definition, watches);
                return (
                  <tr key={definition.key}>
                    <th scope="row">
                      <span>{definition.shortLabel ?? definition.label}</span>
                      {definition.info ? <InfoTooltip label={definition.label}>{definition.info}</InfoTooltip> : null}
                    </th>
                    {watches.map((watch) => {
                      const winner = winners.has(watch.id);
                      return (
                        <td key={watch.id} className="numeric">
                          <span>{definition.format(watch)}</span>
                          {winner ? <span className="best-badge">◆ {definition.compare?.superlative}</span> : null}
                        </td>
                      );
                    })}
                    {showAdd ? <td aria-hidden="true"></td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pickerOpen && showAdd ? (
          <section className="watch-picker" aria-label="Add another watch">
            <div className="picker-heading">
              <strong>Add a watch</strong>
              <input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter by brand or model"
                aria-label="Filter watches"
              />
            </div>
            <div className="picker-list">
              {available.map((watch) => (
                <button key={watch.id} type="button" onClick={() => { onAdd(watch); setPickerOpen(false); }}>
                  <span><small>{watch.brand}</small><strong>{watch.model}</strong></span>
                  <span aria-hidden="true">+</span>
                </button>
              ))}
              {available.length === 0 ? <p>No matching watches remain.</p> : null}
            </div>
          </section>
        ) : null}
      </div>
    </dialog>
  );
}
