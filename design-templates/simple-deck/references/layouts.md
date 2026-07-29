# Simple deck slide layouts

**8 paste-ready slide skeletons.** Drop into `<body>` of `assets/template.html`. Don't write slides from scratch — pick the closest layout, paste, swap copy.

## Pre-flight

1. **Read `assets/template.html`** end-to-end — every class below is defined in its `<style>` block. The standalone counter, progress bar, hint, and the 5-rule nav script at the bottom are already wired up inside `data-deck-nav`; do not re-implement them or add a second navigation layer.
2. **Plan the slide list AND surface hierarchy before pasting any slide.** See "Surface hierarchy" below — background changes should communicate the story, not decorate the sequence.
3. **Read the active DESIGN.md** — map its tokens to the six `:root` variables in the seed.

## Surface hierarchy — narrative first

Every `<section class="slide">` MUST include exactly one of:

- `light` — default white-paper surface
- `dark` — inverted, fg-on-bg
- `hero light` — same as light + extra padding (for cover, big stat, big quote)
- `hero dark` — same as dark + extra padding

**Rules:**

- Choose one dominant surface from the active brand or direction, unless the user or active DESIGN.md explicitly requires another surface program.
- Consecutive same-surface slides are valid when they belong to the same narrative act.
- Use the inverse surface only for a named narrative role such as a chapter break, key reveal, proof point, or closing.
- A single-surface deck is valid. Never alternate surfaces by slide index or quota.
- Create rhythm through layout, scale, density, imagery, and typography before changing the background.

Before emitting, read every slide's class beside its label. If an inverse slide has no narrative purpose, return it to the dominant surface.

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

The workhorse. Use 3–6× per deck. Use the dominant surface unless this slide has a named reason to invert.

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

`hero light center` is shown here; bind it to the dominant surface by default. One quote, one attribution. Italic-feel via the serif display, not actual `<em>`.

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

`hero dark center` or `hero light center`. Use the inverse only when the closing is a deliberate narrative punctuation. One sentence on the ask, one supporting line. The audience leaves remembering this.

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
3. `light`            — Evidence (Layout 4)
4. `hero dark center` — Solution reveal (Layout 3; inverse starts a new act)
5. `dark`             — Pipeline (Layout 5; same solution act)
6. `hero light center`— Ask (Layout 8; return to dominant)

**10-slide narrative:**
1. `hero light center` — Cover
2. `light`            — Problem
3. `light`            — Why now
4. `hero dark center` — Solution reveal (inverse starts a new act)
5. `dark`             — Pipeline (same solution act)
6. `dark`             — Product proof (same solution act)
7. `light`            — Before / after (Layout 7)
8. `light`            — Business model
9. `light`            — Team / metrics
10. `hero dark center`— Ask (inverse closing)

These are illustrative roles, not a surface quota. After laying out, read the class list with the slide labels: every surface switch should mark a narrative transition or emphasis. Strict alternation without that reason is a defect.
