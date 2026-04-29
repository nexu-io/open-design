# Components · replit-deck

Small shared primitives you'll compose slides from. None of these should be edited per-slide beyond the `[REPLACE]` content slots. If you find yourself rewriting the CSS of a component, you're fighting the theme — pick a different layout instead.

---

## meta-bar

Top-row brand / context / page. Every slide has one.

```html
<div class="meta-bar">
  <span>[REPLACE] BRAND · CONTEXT</span>
  <span>[REPLACE] NN / NN</span>
</div>
```

- Mono, uppercase, 11px, tracked 0.1em, `--muted` color.
- On `vance`, meta-bar sits **inside** the black top band (`.vance-top`) and gets 3 columns.

---

## eyebrow

Section kicker above the slide headline.

```html
<p class="eyebrow">SECTION EYEBROW · OPTIONAL DATE</p>
<p class="eyebrow accent">COLORED VARIANT</p>
```

- Default: `--muted`.
- `.eyebrow.accent` → `--accent` color. Use once per slide, sparingly.
- On `atlas`/`holm` add a em-dash prefix: `— &nbsp; CHAPTER ONE …`.

---

## numeric display  (`.num`, `.num-label`, `.num-delta`)

The single most important primitive for helix / world / atlas.

```html
<div>
  <div class="num-label">Annual Recurring Revenue</div>
  <div class="num">$1.37B</div>
  <div class="num-delta">▲ 38% YoY</div>
</div>
```

- `.num` is the display typeface, 48–84px, line-height 1, tight tracking.
- `.num-delta` is **mono**, `--accent` color. Use `▲` / `▼` Unicode — never an emoji.
- Don't wrap a number in a colored background. Number = chromatic anchor.

---

## bevel-frame  (bevel only)

Dashed neon rectangle with corner dots.

```html
<div class="bevel-frame">
  <!-- product photo or campaign image inside -->
</div>
```

- Already has `::before` / `::after` neon dots on diagonal corners.
- Do NOT fill the frame with neon. Frame is 1px dashed border; fill is image or muted bg.

---

## world-marker  (world-* only)

Small yellow square used inline next to section titles.

```html
<span class="world-marker"></span>
```

- 14×14px, flat color, no animation.
- Appears at most twice on one slide.

---

## atlas-dot  (atlas only)

Small vermilion disc used as chapter mark or list bullet.

```html
<span class="atlas-dot"></span>
```

- 10×10px. Smaller (6×6) variant manually sized for the inline `EXHIBIT 04.B` tag.

---

## bh-card  (bluehouse only)

Colored card in the consumer-grid row.

```html
<div class="bh-card peach">…</div>
<div class="bh-card coral">…</div>
<div class="bh-card lavender">…</div>
```

- `peach` = flat warm sand.
- `coral` = coral→peach 135° gradient.
- `lavender` = cool lavender→blue 180° gradient.
- Interior: `flex column`, `justify-content: space-between` — put icons/meta top, numbers bottom.
- Always `border-radius: 24px`, always 4:3 aspect unless explicitly broken for layout reasons.

---

## progress + counter chrome (auto)

You do not author these. The seed ships with:

```html
<div class="deck-progress" id="deck-progress"></div>
<div class="deck-counter"  id="deck-counter">1 / 3</div>
<div class="deck-hint">← / → · scroll · swipe</div>
```

…and the `<script>` auto-updates on scroll / key. Leave them alone.

---

## Content-type cross-reference

| Content you need to show | Primitive(s) |
|---|---|
| A single number | `.num` alone, centered |
| A row of metrics | `.num-label` + `.num` + `.num-delta`, grid-6 |
| A brand wordmark | plain `<span>` in meta-bar, serif display, 22-32px |
| A section divider | centered `.h-hero` on a slide of its own, theme flipped if available (`world-mint` inside `world-dark`) |
| A call-out stat with context | `.num` (big) + `.lead` (small) paired |
| A pull-quote | `.h-xl` in display serif, `— Attribution` in mono small-caps |

---

## What **not** to component-ify

Resist creating: `.card.featured`, `.hero-v2`, `.metric-fancy`. These bloat the seed and make the deck drift toward "shadcn demo". The 10 layouts × 8 themes already compose into >50 distinct slide archetypes — that's enough.
