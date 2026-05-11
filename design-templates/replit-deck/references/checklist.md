# Self-check · replit-deck

Run this list silently before emitting `<artifact>`. Anything failing at **P0** is a regression — fix it, don't ship. P1 means the deck is emittable but will feel AI-generated to a designer; fix if you have two passes left. P2 is polish.

Score yourself 1–5 on each block. Anything ≤ 3 means re-do that dimension.

---

## P0 — hard gates (non-negotiable)

### Theme lock-in

- [ ] `<body data-theme="…">` is set to ONE value from the enum.
- [ ] No `style="--bg: …"` or `style="--accent: …"` on individual slides (grep confirms).
- [ ] No `<style>` block inside a `<section>`.
- [ ] No imported font from Google/Adobe. All fonts resolve via the theme's `--font-*` stacks.

```bash
grep -nE 'style="--(bg|fg|accent|surface|border|muted)' index.html && echo FAIL
grep -nE '<style' index.html | wc -l   # expect 1
grep -nE '@import|<link.*font' index.html && echo FAIL
```

### Structural

- [ ] Every `<section>` has `class="slide"` (plus optional `center`).
- [ ] Every `<section>` has a unique `data-screen-label="NN Name"`.
- [ ] Deck chrome is present exactly once: `.deck-progress`, `.deck-counter`, `.deck-hint`.
- [ ] The nav `<script>` is unchanged from the seed.

### Honesty

- [ ] No invented metrics. Any number displayed is from the user's brief, or labeled as illustrative.
- [ ] Unfilled content uses `—` or a muted rectangle, not lorem or AI-made stats like "10× faster".
- [ ] No stock SaaS emoji (🚀 📊 ✨).

---

## P1 — taste gates

### Typography

- [ ] Display face matches the theme:
  - `helix` / `world-*` / `bluehouse` → sans display, weight 600–700.
  - `holm` / `vance` / `atlas` → serif display.
  - `bevel` → Y2K italic display (Antonio / Bebas / Impact fallback).
- [ ] Exactly ONE display family per slide. No swapping mid-slide.
- [ ] `.lead` paragraph uses the body sans, not the display face.
- [ ] Mono is reserved for meta-bar, eyebrow small-caps, and `.num-delta`. Not body copy.

### Accent restraint

- [ ] Accent color appears **1–2 times per slide maximum**.
- [ ] Accent is NEVER used for:
  - body paragraph text,
  - a filled box bigger than 120×40px (bluehouse gradient cards excepted),
  - multiple adjacent elements ("accent chain").
- [ ] In `holm` / `atlas`, accent shows up on: the final period of a title, the em-dash-prefixed eyebrow, and the progress segment. Nowhere else unless deliberate.

### Layout rhythm

- [ ] For 6+ slide decks: at least one slide is `center` and one isn't.
- [ ] No three slides in a row look visually identical (same layout, same density).
- [ ] For 8+ slides: include at least one "breath" slide — a giant-title divider or a one-stat hero.

### Theme-specific musts

- [ ] **helix**: every metric slide uses the `.num` primitive, not custom type.
- [ ] **holm**: the serif appears on the headline only; meta, eyebrow, body are sans + mono.
- [ ] **vance**: every slide has both top and bottom black bands (`.vance-top` 2×), OR is a full-bleed image slide with meta overlaid.
- [ ] **bevel**: the Y2K display face is used for the wordmark and section titles only; body remains Inter.
- [ ] **world-dark / world-mint**: yellow marker appears at least once, never as a body text color.
- [ ] **atlas**: vermilion appears on ① the meta dot ② a title's final period ③ the progress segment. All three? Fine. More? Cut.
- [ ] **bluehouse**: exactly one gradient direction per slide (135° coral→peach XOR 180° lavender→blue on one card, not both).

---

## P2 — polish

- [ ] `.num` values are within 3 characters of each other in width when in a `grid-6` row (so the row reads as a set).
- [ ] `text-wrap: balance` effect is visible on 2-line headlines (verify by eye).
- [ ] Page counter in meta-bar matches `.deck-counter` (both read "NN / NN").
- [ ] On `holm` / `vance` / `atlas`, the body cream/ivory feels warm, not fluorescent. If it looks cold, you accidentally overrode `--bg`.
- [ ] No CSS box-shadow except on `.bh-card` (bluehouse). Shadows elsewhere = SaaS regression.
- [ ] `border-radius` is either 0 (helix/holm/vance/bevel/world-*/atlas) or 16–24px (bluehouse only).

---

## Five-dimension critique (silent, before emit)

Before writing `<artifact>`, score this deck 1–5 in each dimension. If any is **≤ 3**, fix and re-score.

1. **Philosophy**: Does it look like replit.com/slides's gallery, not a generic shadcn dashboard?
2. **Hierarchy**: Is there exactly one dominant element per slide? Can you read the deck by looking at the biggest thing on each slide only?
3. **Execution**: Is the theme rendered cleanly — type weights, spacing, accent usage all theme-consistent?
4. **Specificity**: Does the copy belong to this project (names, numbers, dates), or could it live on any deck?
5. **Restraint**: Are you using fewer colors / weights / icons than you could? (If yes, good. If "I used everything available," bad.)

Two passes is normal. Three is fine. Four means you picked the wrong theme — go back to Step 1.

---

## Emission contract

Stop after `</artifact>`. Do not add post-mortem commentary.

```
<artifact identifier="deck-<slug>" type="text/html" title="<deck title>">
<!doctype html>
<html>…</html>
</artifact>
```
