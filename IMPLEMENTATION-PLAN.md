# TimeWatcher — Implementation Plan

Semantic search → 4 results → detail modal → comparison modal.

---

## 0. The cost budget — and what it buys

**Target: well under $1 per search.** The design below lands at **~$0.025** — about 40
searches per dollar, using 2.5% of the ceiling.

That headroom is the point. Nothing here was ever going to cost dollars per search; the
risk was the opposite — building a search *cheaper than it needed to be* and shipping a
worse product to save fractions of a cent. So the budget gets spent in the one place it
converts directly into quality: **a real model reads the shortlist and picks the four
results.**

| Line item | Cost |
|---|---|
| **Per search — embed query** | ~$0.000001 |
| **Per search — Opus 4.8 reranks top 20 (§4.2)** | **~$0.025** |
| **Per-search total** | **~$0.025** — 40 searches / $1 |
| Catalog generation (Opus 4.8 + vision, 500 watches, batched) | ~$4 once |
| Hosting (Cloudflare Pages, unlimited bandwidth) | $0 |
| Images (static assets, same CDN) | $0 |
| Database | $0 — there isn't one (§3) |
| Fonts | $0 — system stack |

At 1,000 searches/month that's **~$25/month** — and that's the *expensive* configuration,
chosen deliberately. Levers if traffic ever makes that matter, in the order you'd pull them:

1. **Cache identical queries.** Search traffic is Zipf-distributed — a handful of queries
   will be most of your volume. A hash → results cache probably removes half the bill for
   ten lines of code.
2. **Rerank 10 candidates instead of 20** → ~$0.013.
3. **Rerank with Haiku 4.5** → ~$0.005. Only if volume genuinely demands it; this is the
   step where the product's quality lives.

Do not pre-optimize any of these. Ship the good version.

---

## 1. Design system

Minimal, light-only, one blue accent. Light-only is a deliberate commitment, not an
omission — the whole surface is white cards holding transparent-background product shots,
and that's a look that doesn't survive inversion.

### Tokens

```css
:root {
  /* ground */
  --bg:              #FFFFFF;
  --surface-sunken:  #F7F8FA;   /* page background behind cards */
  --border:          #E4E7EC;
  --border-strong:   #CDD3DC;

  /* ink */
  --text:            #12161C;   /* cool near-black, never #000 */
  --text-2:          #5A6472;
  --text-3:          #8B94A3;

  /* the one accent */
  --accent:          #2B5CE6;
  --accent-hover:    #1E48C4;
  --accent-wash:     #EEF2FE;

  /* overlay */
  --scrim:           rgb(18 22 28 / 0.55);

  /* elevation — only two things in the app cast a shadow */
  --shadow-modal:    0 24px 48px -12px rgb(18 22 28 / 0.18),
                     0 0 0 1px rgb(18 22 28 / 0.04);
  --shadow-fab:      0 8px 24px -6px rgb(18 22 28 / 0.24);
}
```

Neutrals carry a slight blue bias so they sit under the accent rather than beside it. A
pure `#808080` grey next to a blue accent reads as unconsidered.

**The accent does exactly four jobs** and nothing else: the search focus ring, the primary
button, links, and the best-in-row badge. If it starts appearing anywhere else, the page
has lost its hierarchy.

### Type

System stack. Zero bytes downloaded, instant first paint, and it's genuinely the right
face for a utilitarian product surface — the watches supply the personality.

```css
--font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        "Helvetica Neue", Arial, sans-serif;
--font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```

Scale: `12 · 13 · 15 · 17 · 20 · 28 · 40`. Body 15/1.6.

**Every measurement, price, and reference number gets `font-variant-numeric: tabular-nums`.**
In the comparison table this is not cosmetic — non-tabular digits make a column of
`39mm / 41mm / 42mm` fail to line up, which defeats the point of a table.

### Geometry

- Radius: **8px** cards and modals, **6px** buttons and inputs, **999px** on the compare
  pill only (it floats; a pill is correct there and nowhere else).
- Borders: 1px `--border`. **Cards have no shadow** — only the two modals and the floating
  pill are elevated, because only they actually float.
- Spacing base: 4px. Modal padding 32px, card padding 16px.
- Focus: `outline: 2px solid var(--accent); outline-offset: 2px`. Never `outline: none`.

---

## 2. Screens

### 2.1 Search + 4 results

Centered search field, 640px, 56px tall. On focus: `--accent` border + 3px `--accent-wash`
ring. Placeholder: `Describe a watch — "something understated for a wedding"`.

Below it, three example queries as plain clickable text (not chips):
- "vintage-feeling field watch with a cream dial"
- "something understated I could wear to a wedding"
- "chunky and rugged, like it could survive anything"

Results: **exactly 4**, in a row on desktop, 2×2 on tablet, stacked on mobile.

Four is a real constraint and it's the right one. A grid of 40 results is a *ranking*
problem the user has to solve; four is an *answer*. It also forces the retrieval quality
to be honest — with four slots there's nowhere for a mediocre match to hide.

**WatchCard:**
```
┌──────────────────────────┐
│                     [+]  │  ← add to compare, top-right, visible on hover/focus
│      [watch image]       │  ← transparent PNG, dial dead-on, true-scale (§5)
│                          │
├──────────────────────────┤
│ TUDOR                    │  12px, uppercase, --text-3, 0.08em tracking
│ Black Bay 58             │  17px, --text
│ 39mm · Automatic · 200m  │  13px, --text-2, tabular-nums
│ $4,050                   │  15px, --text, tabular-nums
└──────────────────────────┘
```
Card: `--bg`, 1px `--border`, radius 8. Hover: border → `--border-strong`. Whole card is
the click target for the detail modal; the `+` stops propagation.

### 2.2 Detail modal

Opens on card click. Scrim darkens the page; modal centers at 720px wide, max 85vh, with
the body scrolling inside if needed.

```
┌───────────────────────────────────────────────────┐
│                                             [×]   │
│  ┌─────────────┐   TUDOR                          │
│  │             │   Black Bay 58                   │  28px
│  │   [image]   │   M79030N-0001                   │  13px mono --text-3
│  │             │   ─────────────────────────      │
│  │             │   $4,050          new / retail   │  28px tabular
│  └─────────────┘   $2,900 – $3,600    pre-owned   │  17px --text-2
│                                                   │
│   A vintage-inspired diver that ended the size    │  15px/1.7, max 62ch
│   wars — 39mm, gilt dial, no crown guards.        │  (the generated blurb, §4)
│                                                   │
│   ── Specifications ───────────────────────────   │
│   Case            39mm steel                      │
│   Thickness       11.9mm                          │
│   Lug-to-lug      47.8mm                          │
│   Movement        Tudor MT5402                    │
│   Power reserve   70h                             │
│   Water resist.   200m                            │
│   Crystal         Domed sapphire                  │
│   Released        2018                            │
│                                                   │
│   [ + Add to compare ]                            │
└───────────────────────────────────────────────────┘
```

Spec rows: label 13px `--text-2` left, value 13px `--text` tabular right, 1px `--border`
between rows, no zebra striping, no card wrapper.

### 2.3 Compare modal

Opens from the floating pill. Wider — `min(1100px, 94vw)`, max 88vh.

```
┌──────────────────────────────────────────────────────────────────┐
│  Compare                                                   [×]   │
│                                                                  │
│           │  [img]   │  [img]   │  [img]   │  [ + ]              │
│           │  TUDOR   │  ROLEX   │  OMEGA   │  Add                │
│           │  BB58 ×  │  Sub ×   │  SM ×    │                     │
│  ─────────┼──────────┼──────────┼──────────┼──────────           │
│  Price    │  $4,050  │ $10,900  │  $5,600  │                     │
│  Case ⓘ   │   39mm   │   41mm   │   42mm   │                     │
│  Thick. ⓘ │ 11.9mm ◆ │  12.5mm  │  13.5mm  │   ◆ Thinnest        │
│  L2L ⓘ    │  47.8mm  │  47.8mm  │  48.5mm  │                     │
│  Movement │  MT5402  │   3235   │   8800   │                     │
│  Reserve ⓘ│   70h ◆  │   70h ◆  │   55h    │   ◆ Longest (tie)   │
│  Water ⓘ  │   200m   │  300m ◆  │  300m ◆  │   ◆ Deepest         │
│  Crystal ⓘ│ Sapphire │ Sapphire │ Sapphire │                     │
└──────────────────────────────────────────────────────────────────┘
```

**The ⓘ button is the feature that makes this page worth building.** "Water resistance:
200m" is not information to a normal person — it's a number that sounds like it means
"200 metres deep," which is wrong and would ruin a watch. The tooltip is where the app
stops being a spec dump and starts being useful. Write this copy carefully; it's the
highest-value text in the product. See §7.

**Badge rules (`◆` + superlative label):**

- Only rows with an objectively better direction get a badge.
- **Never badge price.** Cheaper is not better; that's the user's call, not the app's.
- **Never badge case size or movement type.** Bigger isn't better, and automatic isn't
  better than quartz — quartz is *more accurate*. An app that badges "Automatic" as best
  is telling a beginner something false.
- Ties badge **all** tied cells (see the 70h reserve row above).
- Badges only render with ≥2 watches loaded.

Use the **specific superlative** ("Thinnest", "Longest", "Deepest"), not a generic "Best".
Same pixels, strictly more information, and it avoids implying a $10,900 watch is a better
*object* than a $4,050 one — it just has a deeper rating.

### 2.4 The floating compare pill

Appears at ≥1 watch; hidden entirely at 0 (it must never occupy space it hasn't earned).
Bottom-center, `--shadow-fab`, `--accent` fill, 999px radius, 48px tall.

- 1 watch: `1 / 4 selected` — 55% opacity, `disabled`, `aria-disabled="true"`.
  The disabled state teaches what the pill is *for* at the exact moment the user has
  expressed interest in exactly one watch.
- 2–4: `Compare 3 / 4 →` — live.
- Attempting a 5th: don't silently drop it and don't throw an error. Shake the pill
  (respecting `prefers-reduced-motion`) and show `Remove one first` for 2s.

---

## 3. Architecture — there is no database

The single most important technical decision: **at 300–500 watches, the catalog is a JSON
file.** Not Postgres, not pgvector, not Supabase. A file.

500 watches × 768-dim embeddings, quantized to int8, is **~384KB**. The metadata is another
~200KB. That fits in a Worker's memory with room to spare, cosine similarity over 500
vectors takes **under 1ms**, and there is no connection pool, no cold start, no free-tier
row limit, and no monthly bill.

Reaching for pgvector here would be pure ceremony — the infrastructure of a problem you
don't have. Revisit at ~50k watches. You will never get there on a portfolio project.

```
Build time (one-off, ~$4)          Runtime (per search, ~$0.025)
─────────────────────────          ─────────────────────────────
watches.yaml (hand-curated)        query string
   ↓                                  ↓
Opus 4.8 + vision ─── batched      embed query          ~$0.000001
   ↓  style descriptions              ↓
embed each description             cosine vs. bundled catalog
   ↓                                  ↓   <1ms, in-memory — RECALL
catalog.json + embeddings.bin      top 20 candidates
   ↓                                  ↓
bundled into the deploy            Opus 4.8 reads all 20    ~$0.025
                                   + the query              PRECISION
                                      ↓
                                   the 4, ranked, with reasons
```

**Stack:** Next.js (App Router) or Astro → static export → **Cloudflare Pages**
(unlimited bandwidth, free). One edge function for query embedding. Images as static
assets on the same CDN. AVIF with alpha, ~40–80KB each at 800px.

Everything except the search endpoint is static. There is nothing to scale.

---

## 4. The two model calls

The app calls a model in exactly two places: once per watch at build time (§4.1), and once
per search at runtime (§4.2). Everything else is arithmetic.

### 4.1 The catalog build — where the $4 goes

For each watch, Claude reads the **soldier shot** (dial dead-on, transparent background —
the standard industry asset every brand produces) alongside the specs, and writes a
description covering **looks, mood, style, and occasion**. That description is what gets
embedded.

This is the whole trick. You cannot embed a spec sheet and expect "something for a
wedding" to match — the words *wedding*, *understated*, and *rugged* appear nowhere in
`{case: 39, wr: 200}`. The LLM writes the bridge between specs and vibe, once, offline,
and the embedding does the rest at runtime for free.

**Prompt shape:**

> Describe this watch for a search index. Cover, in prose: what it physically looks like
> (case shape, dial colour and texture, hands, bezel, bracelet); the mood it projects;
> which style tradition it belongs to; what occasions and outfits it suits, and which it
> doesn't; and how it wears at its size. Be concrete and opinionated. Do not list specs —
> they're indexed separately. 150–200 words.

**Cost, for real (500 watches):**

| | Input | Output | Cost |
|---|---|---|---|
| Per watch | ~2,000 tok (image + specs + prompt) | ~250 tok | — |
| 500 watches | 1.0M tok | 125K tok | — |
| Opus 4.8 @ $5 / $25 per MTok | $5.00 | $3.13 | **$8.13** |
| via **Message Batches API** (−50%) | | | **~$4.07** |

Three things make this cheap enough to stop thinking about:

1. **Message Batches API — 50% off, and this is the textbook use case.** 500 requests, no
   latency requirement, runs in the background at build time. Submit, poll, collect.
2. **Prompt caching** on the shared system prompt + style guide. Cache reads are ~0.1×.
   Note the prefix must clear **4096 tokens** to cache at all on Opus 4.8 — a short system
   prompt silently won't cache, with no error.
3. **Content-hash the cache.** Key each generated description by a hash of
   `(image bytes + specs)`. Re-running the build only pays for watches that actually
   changed. After the first run, incremental builds are ~$0.

`model: "claude-opus-4-8"`, `thinking: {type: "adaptive"}` — note adaptive is **not** on
by default when the field is omitted on 4.8; set it explicitly.

**Do not downgrade this to Haiku to save $3.** The description quality *is* the search
quality. This is the one place in the app where model capability converts directly into
whether the product works, and the entire bill is a rounding error against a domain
renewal.

---

### 4.2 The rerank — where the search actually gets good

Embeddings retrieve; a model decides. Two stages, because they're good at different things:

| Stage | Job | Cost |
|---|---|---|
| **Cosine over 500 vectors** | Recall — get the ~20 plausible ones. Fast, in-memory, free. | ~$0 |
| **Opus 4.8 reads all 20** | Precision — pick and order the 4, with a reason each. | ~$0.025 |

**Why the rerank isn't optional.** Cosine similarity is genuinely good at vibe, and
genuinely bad at three things this app hits constantly:

- **Negation.** "nothing flashy" embeds *close to* flashy watches — the vector for the
  concept dominates the polarity. Pure cosine will confidently hand you a diamond bezel.
- **Hard constraints.** "under $800" is not a direction in embedding space. There is no
  amount of cosine that enforces a number.
- **Compound queries.** "vintage but waterproof and fits a small wrist" averages into one
  blurry vector that is faithful to none of the three clauses.

A model reading 20 candidates against the literal query handles all three, because it's
reading rather than measuring. This is the standard retrieve-then-rerank shape, and the
reason it's affordable is that the expensive stage only ever sees 20 items — never 500.

**The call:**

```
Input:  the user's query, verbatim
      + 20 candidates: id, styleDescription (~200 tok), price, case size, movement, WR
Output: the 4 best ids, ranked, each with a one-line reason grounded in the query
```

Use **structured outputs** (`output_config.format`) so the response is a validated object,
not prose you have to parse:

```ts
{ results: [{ id: string, reason: string }] }   // exactly 4, ranked
```

Cost: ~4,000 input (20 × ~200) + ~200 output → 4,000 × $5/1M + 200 × $25/1M ≈ **$0.025**.

`model: "claude-opus-4-8"`, `thinking: {type: "adaptive"}`, `output_config: {effort: "low"}`
— this is a scoped ranking task with the candidates already in front of it, not a research
problem. Low effort keeps latency down and quality flat here.

**Cache the shared prefix.** The system prompt (ranking rubric + house style) is identical
on every search; put the `cache_control` breakpoint at its end, with the query and
candidates after it. Note the 4096-token minimum on Opus 4.8 — a short rubric silently
won't cache and you'll see `cache_creation_input_tokens: 0` with no error.

**The reason string is a real feature, not debug output.** Surface it under each result:
*"cream dial, 38mm, hand-wound — the closest thing to a 1940s field watch under $800."*
It shows the user the app understood them, which is what makes a wrong result correctable
instead of mystifying. It costs ~200 output tokens total.

**Latency is the real tradeoff, not cost.** This adds ~1–2s to a search. Stream the four
cards in as the structured output arrives rather than blocking on the whole response.

---

## 5. True-scale rendering

Every image is a transparent-background soldier shot, so the alpha channel's bounding box
*is* the case extent. You know `caseDiameterMm` from the specs. Therefore:

```ts
const PX_PER_MM = 7.5;                       // one global constant, app-wide
const width = watch.caseDiameterMm * PX_PER_MM;   // 39mm → 292.5px
```

Non-round cases (Tank, Reverso) key off `caseWidthMm`. Store the alpha bbox at build time
so the browser never measures anything.

That's the entire feature — arithmetic, once you have clean assets. And it means a 36mm
watch renders *visibly smaller* than a 42mm one everywhere it appears, which is what makes
a row of four cards silently function as a comparison. **Never scale a watch to fill its
container.** If they all look the same size, the feature is dead.

---

## 6. The modals — use the platform

Both popups are native `<dialog>`. This is not a minor implementation detail; it deletes
an entire category of bugs and dependencies.

```html
<dialog id="detail" class="modal">…</dialog>
```
```js
detailEl.showModal();   // focus trap, Esc-to-close, inert background — all free
```

`showModal()` gives you, with zero code and zero dependencies:
- a **real focus trap** (the thing hand-rolled modals almost always get wrong)
- Esc-to-close
- the background marked `inert` — screen readers and Tab can't reach it
- the top layer, so it renders above everything regardless of `z-index`

The scrim is `::backdrop` — the "darken the rest of the screen" requirement is one CSS
rule, not a positioned overlay div:

```css
.modal::backdrop { background: var(--scrim); }
```

Animate with modern CSS only — no JS, no animation library, no bytes:

```css
.modal {
  opacity: 0;
  translate: 0 8px;
  transition: opacity .18s ease, translate .18s ease, overlay .18s allow-discrete,
              display .18s allow-discrete;
}
.modal[open] { opacity: 1; translate: 0 0; }
@starting-style { .modal[open] { opacity: 0; translate: 0 8px; } }
.modal::backdrop { background: rgb(18 22 28 / 0); transition: background .18s, overlay .18s allow-discrete, display .18s allow-discrete; }
.modal[open]::backdrop { background: var(--scrim); }
@starting-style { .modal[open]::backdrop { background: rgb(18 22 28 / 0); } }

@media (prefers-reduced-motion: reduce) { .modal, .modal::backdrop { transition: none; } }
```

Click-outside-to-close needs one listener (`<dialog>` doesn't do this natively):
```js
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
```

**Only one modal open at a time.** Opening compare closes detail first — nested `<dialog>`
top-layer stacking is a mess you don't need.

---

## 7. The ⓘ tooltips

Native **Popover API** — again, no library:

```html
<button popovertarget="i-wr" class="info" aria-label="What does water resistance mean?">ⓘ</button>
<div popover id="i-wr" class="tip">…</div>
```

Free: light-dismiss, Esc, top-layer, correct ARIA wiring. Add hover-to-open with a ~150ms
delay for pointer devices on top of the native click behaviour (click must keep working —
it's the only path for touch and keyboard).

Position with CSS anchor positioning where available, and **ship a fallback** — support is
not universal enough to bet the feature on:

```css
@supports (anchor-name: --a) { /* anchor-positioned */ }
@supports not (anchor-name: --a) { /* absolutely positioned within a relative wrapper */ }
```

### The copy — the actual deliverable

Write these for someone who has never owned a mechanical watch.

| Spec | Tooltip |
|---|---|
| **Case diameter** | How wide the watch face is, not counting the crown. Most wrists suit 36–42mm — but lug-to-lug matters more. |
| **Lug-to-lug** | Tip-to-tip length, and the number that actually decides fit. If it's wider than your wrist, the watch overhangs and looks wrong no matter what the diameter says. |
| **Thickness** | How far it stands off your wrist. Under 12mm slides under a shirt cuff. Over 14mm won't. |
| **Movement** | **Automatic** winds itself from your wrist's motion. **Hand-wound** needs winding daily. **Quartz** runs on a battery — and is more accurate than either. |
| **Power reserve** | How long it keeps running after you take it off. Under 48h means it stops over a weekend and needs resetting Monday. |
| **Water resistance** | Not literal depth. **30m**: splashes. **50m**: swimming. **100m**: snorkelling. **200m+**: actual diving. |
| **Crystal** | The glass. **Sapphire** is nearly unscratchable. **Mineral** scratches. **Acrylic** scratches if you look at it, but polishes out with toothpaste. |
| **Lug width** | The strap width — decides which straps fit. 20mm is the most common, so straps are cheap and everywhere. |

The water-resistance and movement entries are the two that stop a real purchase mistake.

---

## 8. Data model

```ts
type Watch = {
  id: string;                    // "tudor-black-bay-58-m79030n"
  brand: string;
  model: string;
  reference: string;
  price: { retail: number | null; preOwnedLow: number; preOwnedHigh: number };
  image: { src: string; w: number; h: number; alphaBbox: [number,number,number,number] };
  specs: {
    caseDiameterMm: number;
    caseWidthMm?: number;        // non-round cases
    thicknessMm: number;
    lugToLugMm: number;
    lugWidthMm: number;
    movementType: 'automatic'|'hand-wound'|'quartz'|'solar'|'spring-drive';
    caliber: string;
    powerReserveH: number | null;
    waterResistanceM: number;
    crystal: 'sapphire'|'mineral'|'acrylic';
    yearReleased: number;
  };
  styleDescription: string;      // LLM-written, §4 — this is what gets embedded
};
```

Spec-row config drives both the table and the badges from one place:

```ts
type SpecDef = {
  key: string;
  label: string;
  info: string;                              // the ⓘ copy
  format: (w: Watch) => string;
  compare?: {                                // omit → never badged
    value: (w: Watch) => number | null;
    direction: 'higher' | 'lower';
    superlative: string;                     // "Longest" | "Thinnest" | "Deepest"
  };
};
```

`price`, `caseDiameterMm`, and `movementType` deliberately have **no `compare`** — see §2.3.

---

## 9. Build order

1. **10 watches, hand-written descriptions, no LLM.** Prove the *descriptions* are the
   right shape before generating 500 of them. If 10 hand-written ones don't retrieve well,
   500 generated ones won't either — and you'll have found that out for $0.
2. Image pipeline: source soldier shots → AVIF + alpha bbox → true-scale render.
3. The three surfaces with static data. Get `<dialog>` and the pill right.
4. Wire embeddings + the Worker. **Ship cosine-only first** and keep a set of ~15 real
   queries you check by hand — including at least one negation ("nothing flashy"), one
   price constraint, and one compound query.
5. **Add the rerank.** Run those same 15 queries again. The negation and constraint cases
   are where you'll see it earn its $0.025 — if they don't visibly improve, something is
   wrong with the prompt, not the idea.
6. Run the full batch build. Pay the $4.

Steps 1 and 4 are the ones people skip. They're the ones that tell you whether the product
works — and step 4's query set is what makes step 5 a measurement instead of a vibe.

---

## 10. Things that will bite

- **`<dialog>` needs `dialog::backdrop`, not a div.** If you find yourself writing
  `position: fixed; inset: 0; background: rgba(...)`, you've rebuilt something the
  platform gives you — and lost the focus trap.
- **Prompt cache silently no-ops under 4096 tokens on Opus 4.8.** No error, just
  `cache_creation_input_tokens: 0`. Check the field; don't assume. Applies to both the
  batch build (§4.1) and the rerank's shared rubric (§4.2).
- **Batch results come back unordered.** Key by `custom_id`, never by array position.
- **Don't skip cosine and rerank all 500.** That's ~$0.60/search — 24× the cost for worse
  latency and no better answer. The shortlist is the whole reason the rerank is affordable.
- **The rerank can hallucinate an id.** Validate every returned id against the candidate
  set you sent; drop and backfill from cosine order rather than rendering a broken card.
- **Adaptive thinking is off when `thinking` is omitted on Opus 4.8.** Set it explicitly
  on both calls, or you silently get the no-thinking path.
- **Don't let `--accent` sprawl.** Four jobs (§1). The moment it's also on hover states,
  borders, and headings, nothing reads as primary.
- **Don't badge price.** It's the row users most want ranked and the one where ranking is
  a lie about their priorities.
- **`tabular-nums` on every number.** Without it the comparison columns don't align and
  the table stops doing its job.
- **Test the 5th-watch case.** It's the only genuinely awkward state in the flow.
