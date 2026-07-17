import { useEffect, useMemo, useRef, useState } from "react";
import catalogJson from "../data/catalog.json";
import { toggleComparison } from "../lib/compare";
import { EXAMPLE_QUERIES, MAX_COMPARE, SEARCH_RESULT_COUNT } from "../lib/constants";
import { diversifyRanked } from "../lib/diversity";
import type { SearchResult, SearchStreamEvent, Watch } from "../types";
import { CompareDialog } from "./CompareDialog";
import { DetailDialog } from "./DetailDialog";
import { WatchCard } from "./WatchCard";

const catalog = catalogJson as Watch[];
const initialWatches = catalog.filter((watch, index, watches) =>
  watches.findIndex((candidate) => candidate.brand === watch.brand) === index
).slice(0, SEARCH_RESULT_COUNT);

function tokenise(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function localDemoSearch(query: string): SearchResult[] {
  const queryTokens = tokenise(query);
  const priceMatch = query.match(/(?:under|below|less than|max(?:imum)?|up to)\s*\$?([\d,]+)/i);
  const maxPrice = priceMatch ? Number(priceMatch[1].replaceAll(",", "")) : null;
  const negatedFlashy = /(?:nothing|not|isn't|isnt|avoid)\s+(?:too\s+)?flashy/i.test(query);
  const ranked = catalog
    .map((watch, index) => {
      const haystack = `${watch.brand} ${watch.model} ${watch.styleDescription}`.toLowerCase();
      const overlap = queryTokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
      let score = overlap * 4 - index * 0.01;
      if (maxPrice !== null) score += watch.price.retail !== null && watch.price.retail <= maxPrice ? 12 : -30;
      if (negatedFlashy && /(flashy|conspicuous|status signal|announce itself)/.test(watch.styleDescription.toLowerCase())) score -= 15;
      return { watch, score };
    })
    .sort((a, b) => b.score - a.score);
  return diversifyRanked(ranked, SEARCH_RESULT_COUNT, 2, 2)
    .map(({ watch }) => ({
      id: watch.id,
      reason: `A close catalog match for “${query.length > 72 ? `${query.slice(0, 69)}…` : query}”, based on its style, fit, and practical specs.`
    }));
}

async function streamSearch(
  query: string,
  signal: AbortSignal,
  onEvent: (event: SearchStreamEvent) => void
): Promise<void> {
  const response = await fetch("/api/search", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/x-ndjson" },
    body: JSON.stringify({ query }),
    signal
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Search failed (${response.status}).`);
  }
  if (!response.body) throw new Error("This browser cannot read a streamed response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as SearchStreamEvent);
    }
    if (done) break;
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as SearchStreamEvent);
}

export default function TimeWatcherApp() {
  const [input, setInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>(
    initialWatches.map((watch) => ({ id: watch.id, reason: "" }))
  );
  const [searchMode, setSearchMode] = useState("curated");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailWatch, setDetailWatch] = useState<Watch | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [limitMessage, setLimitMessage] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("timewatcher:compare") ?? "[]") as unknown;
      if (Array.isArray(stored)) {
        const validIds = stored.filter((id): id is string => typeof id === "string" && catalog.some((watch) => watch.id === id));
        setCompareIds(validIds.slice(0, MAX_COMPARE));
      }
    } catch {
      localStorage.removeItem("timewatcher:compare");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("timewatcher:compare", JSON.stringify(compareIds));
  }, [compareIds]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
  }, []);

  const resultWatches = results
    .map((result) => ({ result, watch: catalog.find((watch) => watch.id === result.id) }))
    .filter((entry): entry is { result: SearchResult; watch: Watch } => Boolean(entry.watch));
  const compareWatches = compareIds
    .map((id) => catalog.find((watch) => watch.id === id))
    .filter((watch): watch is Watch => Boolean(watch));
  const selected = useMemo(() => new Set(compareIds), [compareIds]);

  const showLimit = () => {
    setLimitMessage(false);
    requestAnimationFrame(() => setLimitMessage(true));
    if (limitTimerRef.current) clearTimeout(limitTimerRef.current);
    limitTimerRef.current = setTimeout(() => setLimitMessage(false), 2000);
  };

  const addWatch = (watch: Watch) => {
    setCompareIds((current) => {
      const next = toggleComparison(current, watch.id, MAX_COMPARE);
      if (next.limited) setTimeout(showLimit, 0);
      return next.ids;
    });
  };

  const search = async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setError("Describe the watch in at least two characters.");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setInput(trimmed);
    setActiveQuery(trimmed);
    setLoading(true);
    setError("");
    setResults([]);
    setSearchMode("searching");
    const streamed: SearchResult[] = [];
    try {
      await streamSearch(trimmed, controller.signal, (event) => {
        if (event.type === "meta") setSearchMode(event.mode);
        if (event.type === "result" && !streamed.some((item) => item.id === event.result.id)) {
          streamed.push(event.result);
          setResults([...streamed]);
        }
        if (event.type === "error") throw new Error(event.message);
      });
      if (streamed.length < SEARCH_RESULT_COUNT) throw new Error("Search returned too few valid watches.");
    } catch (caught) {
      if (controller.signal.aborted) return;
      const fallback = localDemoSearch(trimmed);
      setResults(fallback);
      setSearchMode("local-demo");
      const message = caught instanceof Error ? caught.message : "Search is temporarily unavailable.";
      if (!/404|failed to fetch|unexpected token|too few valid/i.test(message)) {
        setError(`${message} Showing local catalog matches instead.`);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  return (
    <>
      <section className="search-section" aria-labelledby="page-title">
        <a className="search-wordmark" href="/" aria-label="TimeWatcher home">
          <svg aria-hidden="true" viewBox="0 0 32 32" width="28" height="28">
            <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 2h8l1 4H11l1-4Zm0 28h8l1-4H11l1 4Z" fill="currentColor" />
            <path d="M16 9v7l5 3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
          </svg>
          <span>TimeWatcher</span>
        </a>
        <h1 id="page-title">Find a watch that <em>feels right.</em></h1>
        <form
          id="search"
          className="search-form"
          role="search"
          onSubmit={(event) => { event.preventDefault(); void search(input); }}
        >
          <label className="visually-hidden" htmlFor="watch-query">Describe a watch</label>
          <input
            id="watch-query"
            type="search"
            value={input}
            minLength={2}
            maxLength={280}
            onChange={(event) => setInput(event.target.value)}
            placeholder={'Describe a watch — "something understated for a wedding"'}
            autoComplete="off"
          />
          <button className="search-submit" type="submit" aria-label="Search" disabled={loading}>
            {loading ? <span className="spinner" aria-hidden="true"></span> : <span aria-hidden="true">→</span>}
          </button>
        </form>
        <div className="example-queries" aria-label="Example searches">
          <span>Try</span>
          {EXAMPLE_QUERIES.map((query) => (
            <button key={query} type="button" onClick={() => void search(query)}>“{query}”</button>
          ))}
        </div>
      </section>

      <section className="results-section" aria-labelledby="results-title" aria-busy={loading}>
        <div className="results-heading">
          <h2 id="results-title">{activeQuery ? `Matches for “${activeQuery}”` : "A few good places to start"}</h2>
          {activeQuery ? <span className="search-mode">{searchMode === "semantic-rerank" ? "Semantically ranked" : searchMode === "recall-only" ? "Embedding matches" : "Local preview"}</span> : null}
        </div>
        {error ? <p className="search-error" role="status">{error}</p> : null}
        <div className="results-grid" aria-live="polite">
          {resultWatches.map(({ watch, result }) => (
            <WatchCard
              key={watch.id}
              watch={watch}
              reason={result.reason}
              selected={selected.has(watch.id)}
              onOpen={setDetailWatch}
              onToggleCompare={addWatch}
            />
          ))}
          {loading ? Array.from({ length: SEARCH_RESULT_COUNT - resultWatches.length }, (_, index) => (
            <div className="watch-card skeleton-card" key={`skeleton-${index}`} aria-hidden="true">
              <div className="skeleton-image"></div><div className="skeleton-copy"></div>
            </div>
          )) : null}
        </div>
      </section>

      <DetailDialog
        watch={detailWatch}
        selected={detailWatch ? selected.has(detailWatch.id) : false}
        onClose={() => setDetailWatch(null)}
        onToggleCompare={addWatch}
      />
      <CompareDialog
        open={compareOpen}
        watches={compareWatches}
        catalog={catalog}
        onClose={() => setCompareOpen(false)}
        onAdd={(watch) => {
          if (!selected.has(watch.id)) addWatch(watch);
        }}
        onRemove={(id) => setCompareIds((current) => current.filter((item) => item !== id))}
      />

      {compareIds.length > 0 ? (
        <button
          className={`compare-pill${limitMessage ? " is-limited" : ""}`}
          type="button"
          disabled={compareIds.length === 1}
          aria-disabled={compareIds.length === 1}
          onClick={() => {
            setDetailWatch(null);
            setCompareOpen(true);
          }}
        >
          {limitMessage
            ? "Remove one first"
            : compareIds.length === 1
              ? "1 / 4 selected"
              : `Compare ${compareIds.length} / 4 →`}
        </button>
      ) : null}
    </>
  );
}
