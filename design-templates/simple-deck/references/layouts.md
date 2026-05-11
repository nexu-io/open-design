# Simple deck slide layouts

**8 paste-ready slide skeletons.** Drop into `<body>` of `assets/template.html`. Don't write slides from scratch — pick the closest layout, paste, swap copy.

## Pre-flight

1. **Read `assets/template.html`** end-to-end — every class below is defined in its `<style>` block. The fixed counter, progress bar, hint, and the 5-rule nav script at the bottom are already wired up; do not re-implement them.
2. **Plan the slide list AND theme rhythm before pasting any slide.** See "Theme rhythm" below — this is the single biggest determinant of whether the deck feels alive or sleepy.
3. **Read the active DESIGN.md** — map its tokens to the six `:root` variables in the seed.

## Theme rhythm — the rule that prevents 6-slide sleep

Every `<section class="slide">` MUST include exactly one of:

- `light` — default white-paper surface
- `dark` — inverted, fg-on-bg
- `hero light` — same as light + extra padding (for cover, big stat, big quote)
- `hero dark` — same as dark + extra padding

**Rules:**

- No 3+ same-theme slides in a row. `light light light` → boring.
- For decks with **8+ slides**: at least one `hero dark` AND at least one `hero light`.
- A `dark` slide every 3–4 slides creates the "breath" that makes the next light slide hit harder.
- The cover is almost always `hero light`. The closing is often `hero dark` or `hero light`.

Before emitting, run mentally: list every slide's class. If you see `light × 5 in a row`, change one to `dark`.

## Class inventory

> `slide` `light` `dark` `hero` `center` `eyebrow` `h-hero` `h-xl` `h-md` `lead` `meta` `stat-num` `unit` `stat-caption` `quote-mark` `quote-text` `quote-author` `pt-grid` `pt` `pipeline` `step` `nb` `ba-grid` `ba-col` `ba-label` `ph-img` `wide` `tall`

If you reach for a class not on this list, define it in the seed's `<style>` first.

---

## Layout 1 — Cover (slide 1)

`hero light center`. One eyebrow with date/context, one big serif headline (≤ 8 words for the punch), one lead sentence.

```html
<section class="slide hero light center" data-screen-label="01 Cover">
  <div class="eyebrow">Filebase · Series B · Q2 2026</div>
  <h1 class="h-hero">The bandwidth bill is the bug.</h1>
  <p class="lead">A sync engine that ships only what changed. Backed by 3,184 paying teams.</p>
</section>
```

## Layout 2 — Body slide (eyebrow + headline + lead)

The workhorse. Use 3–6× per deck. Vary `light` / `dark` for rhythm.

```html
<section class="slide light" data-screen-label="04 Why now">
  <p class="eyebrow">Why now</p>
  <h2 class="h-xl">Three shifts make this market real.</h2>
  <p class="lead">Remote post-production. AI workflows. Bandwidth pricing up 4× since 2022. Storage is cheap; movement is expensive.</p>
</section>
```

## Layout 3 — Big stat (data billboard)

`hero light center` or `hero dark center`. One number. Don't put 3 numbers on one slide — split into 3 stat slides.

```html
<section class="slide hero dark center" data-screen-label="05 Big stat">
  <div class="stat-num">38<span class="unit">×</span></div>
  <p class="stat-caption">less data moved over the wire vs. naive sync, on real customer workloads.</p>
</section>
```

## Layout 4 — Three-point row

A small headline above three rule-topped points. Each point ≤ 2 sentences.

```html
<section class="slide light" data-screen-label="04 Why now">
  <p class="eyebrow">Why now</p>
  <h2 class="h-xl">Three shifts make this market real.</h2>
  <div class="pt-grid">
    <div class="pt">
      <h3>Remote post-production</h3>
      <p>Editors don't sit in one room any more. Cloud sync went from convenient to load-bearing.</p>
    </div>
    <div class="pt">
      <h3>AI workflows</h3>
      <p>Diffusion checkpoints are 7 GB. Engineers iterate on them daily. Existing tools choke.</p>
    </div>
    <div class="pt">
      <h3>Bandwidth pricing</h3>
      <p>Egress costs 4× what it did in 2022. Storage is cheap; movement is expensive.</p>
    </div>
  </div>
</section>
```

## Layout 5 — Pipeline (numbered steps)

Workflow / process / how-it-works. Up to 4 steps; if you need more, split across two slides.

```html
<section class="slide dark" data-screen-label="06 Pipeline">
  <p class="eyebrow">How it works</p>
  <h2 class="h-md">Four passes, end to end.</h2>
  <div class="pipeline">
    <div class="step">
      <span class="nb">01</span>
      <h3>Watch</h3>
      <p>FS events from kernel, debounced 50ms.</p>
    </div>
    <div class="step">
      <span class="nb">02</span>
      <h3>Chunk</h3>
      <p>Content-defined splitting, ~64KB target.</p>
    </div>
    <div class="step">
      <span class="nb">03</span>
      <h3>Diff</h3>
      <p>Bloom-filtered hash compare against remote.</p>
    </div>
    <div class="step">
      <span class="nb">04</span>
      <h3>Ship</h3>
      <p>Only the chunks the remote doesn't have.</p>
    </div>
  </div>
</section>
```

## Layout 6 — Big quote / pull quote

`hero light center`. One quote, one attribution. Italic-feel via the serif display, not actual `<em>`.

```html
<section class="slide hero light center" data-screen-label="07 Quote">
  <div class="quote-mark">"</div>
  <p class="quote-text">Filebase pays for itself in the first month. We were going to hire a dedicated DevOps person — instead we just switched.</p>
  <p class="quote-author">— Mira Hassan, CTO at Northwind Studios</p>
</section>
```

## Layout 7 — Before / after (comparison)

Two columns, same shape, contrasting state. Don't decorate the columns — the contrast comes from copy and from picking one column to tint with the accent.

```html
<section class="slide light" data-screen-label="08 Before / after">
  <p class="eyebrow">The shift</p>
  <h2 class="h-md">From whole-file sync to chunk-level sync.</h2>
  <div class="ba-grid">
    <div class="ba-col">
      <p class="ba-label">Before · 2022</p>
      <h3>Edit one frame, ship the whole 4 GB project.</h3>
      <p>$1,800 / month bandwidth bill on a single Final Cut workflow. Editors waiting 12 minutes per save.</p>
    </div>
    <div class="ba-col">
      <p class="ba-label" style="color: var(--accent);">After · 2026</p>
      <h3>Edit one frame, ship 240 KB.</h3>
      <p>$200 / month on the same workflow. Save-to-remote completes inside the editor's auto-save window.</p>
    </div>
  </div>
</section>
```

## Layout 8 — Closing / CTA

`hero dark center` or `hero light center`. One sentence on the ask, one supporting line. The audience leaves remembering this.

```html
<section class="slide hero dark center" data-screen-label="09 Ask">
  <div class="eyebrow">Ask</div>
  <h2 class="h-hero">$22M to ship the next sync engine.</h2>
  <p class="lead">18-month runway, hire 14, expand to enterprise on-prem.</p>
</section>
```

---

## Default arcs

**6-slide pitch (the minimum):**
1. `hero light center` — Cover (Layout 1)
2. `light`            — Problem body (Layout 2)
3. `hero dark center` — Big stat (Layout 3)
4. `light`            — Three points (Layout 4)
5. `hero light center`— Quote (Layout 6)
6. `hero dark center` — Ask (Layout 8)

**10-slide narrative:**
1. `hero light center` — Cover
2. `light`            — Problem
3. `hero dark center` — Big stat 1
4. `light`            — Three points
5. `dark`             — Pipeline (Layout 5)
6. `hero light center`— Quote
7. `light`            — Before / after (Layout 7)
8. `hero dark center` — Big stat 2
9. `light`            — Team / metrics
10. `hero dark center`— Ask

After laying out, mentally read the class list — `light dark light dark` should show alternation, not blocks of the same theme.
