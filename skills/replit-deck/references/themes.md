# Themes · replit-deck

Eight complete visual systems captured from **replit.com/slides**. Each theme is a commitment — once the deck picks a theme, every slide inherits from that theme's token set via `<body data-theme="…">`. Do not override per-slide.

All hex values were sampled from the actual Replit Slides landing-page PNGs with ImageMagick on **2026-04-29** (see `SKILL.md` → *Scope & provenance*). Don't guess, don't substitute "similar" colors from memory. To add or refresh a theme, follow the procedure in *Contributing a new theme* at the bottom of this file.

---

## How to pick

| If the brief mentions… | Pick |
|---|---|
| SaaS, metrics, board, analytics, fund | `helix` |
| law firm, memo, pre-read, confidential, investor note | `holm` |
| art, sculpture, photography, catalog, portfolio, gallery | `vance` |
| fashion, campaign, lookbook, SS26, jewelry, editorial | `bevel` |
| policy, macro, finance report, world economy, dark mood | `world-dark` |
| lighter companion deck for a world-dark topic (ESG, wellness finance, sustainability) | `world-mint` |
| history, chapter, archive, long-form narrative, museum | `atlas` |
| consumer product, real estate, lifestyle, playful | `bluehouse` |

**Never mix two themes in one deck.** `<body data-theme="…">` is the single source of truth for the whole deck — one value, no per-slide overrides. This is enforced as a P0 gate in `checklist.md`.

If the brief really needs two visual registers (e.g. chapters vs. data), either pick the theme that already carries that internal contrast (`bluehouse` has gradient cards; `atlas` has chapter plates vs. data strips), or split the content into two separate decks. `world-dark` and `world-mint` are stylistic siblings (same palette, inverted surface), so if you need a companion deck in a different mood they are the most coherent pair — but **still one theme per file**.

---

## helix — Modern minimal

Reference: replit slide-1, slide-4, slide-5.

```
--bg       #fafafa   near-white
--fg       #19191c   ink
--muted    #6e6e73
--border   #e4e4e7
--accent   #5889fe   electric blue
--display  Inter Display · weight 600 · tracking -0.02em
--body     Inter
--mono     JetBrains Mono   (bps / YoY labels)
```

**Do**
- Huge `.num` (`$1.37B`, `128%`, `42,850`) — dominant element on the slide, no decoration.
- Blue shows up in `▲ 38% YoY` / `▼ 1 mo` labels only. Use the mono family for those.
- Plenty of white space. Slides often have the content only in the top or left half.
- Page counter bottom-right in mono (`03 / 05`).

**Don't**
- No gradients. No card shadows. No rounded accent bars.
- Never put a KPI inside a blue-filled box — blue is type-color only.
- Don't tilt or slant.
- Don't add emoji or icons to metric cards.

**Best layouts**: `kpi-row-6` · `split-hero-metric` · `big-number-center`.

---

## holm — Editorial serif memo

Reference: replit slide-2, slide-5.

```
--bg       #e4dfd7   warm cream
--fg       #0f0f0e   ink
--muted    #7c7e84
--border   #c7c1b7
--accent   #52311d   deep chestnut
--display  Tiempos / GT Super style serif · weight 500
--body     Inter sans (body copy + mono eyebrows)
--mono     JetBrains Mono  (MEMO 04 / APR 2026 style meta)
```

**Do**
- Serif display only on the **one** hero statement per slide. Body copy stays sans.
- Eyebrows (`SERIES A — CONFIDENTIAL PRE-READ`, `04 — THE ASK`) in **mono, uppercase, widely tracked**, colored by `--accent` or muted.
- Large vertical rhythm. Think one sentence at 64–96px occupying the left half, the rest breathing.
- A small chestnut wordmark ("Holm") in the top-left meta bar is the only branding.

**Don't**
- No pure white surface — the cream is the identity. Don't lighten to #fff.
- Don't use the serif for body paragraphs (it will feel like a novel, not a memo).
- No boxed cards. A memo has edges only from whitespace.

**Best layouts**: `memo-hero-statement` · `two-column-ask` · `name-card-team`.

---

## vance — Gallery catalog

Reference: replit slide-3, slide-7.

```
--bg       #f1ede2   gallery cream
--fg       #171815   ink
--bar      #0a0a0a   black band (top and/or bottom of slide)
--bar-fg   #f1ede2   cream-on-black
--accent   #171815   ink (there is no chromatic accent)
--display  serif display · weight 400  (italic variants encouraged)
--body     Inter
```

**Do**
- Top band holds `CATALOG — PLATE NN`, `II OF V · FEATURED`, `© 2026 THE ARTIST` — always three-column meta in ALL CAPS small tracked type on black.
- The artwork / photo fills the middle plate, edge-to-edge.
- Serif title (`Untitled (Threshold)`) may break across two lines with italic for the parenthetical.
- Bottom band mirrors top: caption on left (`Untitled (Threshold), 2022. Felt, plaster, and resin…`), `PHOTOGRAPHY — NAME` on right.

**Don't**
- No color accents. Chromatic noise kills the gallery tone.
- Don't center-align text inside the bands — always left/center/right three-column.
- Don't use the cream as a solid background without the black bands; the two-tone is the identity.

**Best layouts**: `gallery-plate` · `spread-image-quote` · `index-grid`.

---

## bevel — Y2K editorial

Reference: replit slide-6, slide-13.

```
--bg       #0d0d0b   near-black
--fg       #eae6dd   warm off-white
--muted    #a29e95
--border   #2a2a28
--accent   #c8ff00   neon / chartreuse (outline + dots only)
--display  Y2K display face — Antonio / Bebas / italic chrome sans · weight 700
--body     Inter
```

**Do**
- Display wordmark (`bevel`, `reflex`) in the chrome-y Y2K italic face — oversized, often rotated off-axis by 0 (but tracked wide).
- Dashed neon frames around product imagery. Each frame gets `::before` / `::after` neon dots in the corners.
- Small neon square markers (`14 PIECES`, `SS26 INDEX`) in the corners.
- Product imagery treated as lookbook: desaturated on black, caption under image in serif-italic small caps.

**Don't**
- Never fill anything with neon. Neon is outline, dot, or 1-char accent only. More than ~2% neon by area = slop.
- Don't use photography that looks like stock SaaS. If the brief is SaaS, pick a different theme.
- Don't use sentence case for the display wordmark.

**Best layouts**: `campaign-cover` · `product-triptych` · `index-grid`.

---

## world-dark — Finance dark

Reference: replit slide-8, slide-10.

```
--bg       #0d3a2b   deep racing green
--fg       #bcd6cd   mint text
--muted    #789f91
--border   #1d4c3c
--accent   #e8f615   neon yellow
--display  Inter Display · weight 500
--body     Inter
```

**Do**
- Big sans display for the report title (`World Finance Report`, `Monetary Policy`).
- Neon yellow appears as:
  - a small **square marker** (14×14px) near section breaks,
  - the color of section labels (`Total debt`, `S&P 500`) above the dark green cells,
  - **never** as a fill for a text block.
- Horizontal divider lines are 1px hairlines in `--border`.
- Image tiles (portraits, skyline, streetscape) use tall 2:3 aspect, full-bleed, with captions in white overlaid bottom-left.

**Don't**
- No icons in KPI cells.
- Don't use the yellow for links or CTAs — it is a pointer, not a button.
- No rounded corners on dividers or cells.

**Best layouts**: `finance-hero-grid` · `quadrant-policy` · `indicator-strip`.

---

## world-mint — Finance light (sibling)

Reference: replit slide-9.

Exact mirror of `world-dark`: swap `--bg` with `--fg`. Deep green becomes the type color; mint becomes the surface. Yellow accent stays identical.

Use `world-mint` as a **standalone deck** when the topic is gentler (ESG report, wellness finance, sustainability). If a `world-dark` deck wants a lighter companion piece for a separate audience, make it a **separate deck file** with `data-theme="world-mint"` — do not alternate slides inside one deck (see one-theme rule above).

**Do / Don't**: same as world-dark.

**Best layouts**: `section-divider-giant-title` · `quadrant-policy` · `indicator-strip`.

---

## atlas — Museum chapter

Reference: replit slide-11.

```
--bg       #111010   near-black
--fg       #e7e6e2   ivory
--muted    #827d78
--border   #2a2826
--accent   #de3f40   vermilion
--display  serif display · weight 500
--body     Inter
```

**Do**
- Vermilion dot (●) before `THE ATLAS QUARTERLY · CHAPTER 01` in the meta bar.
- Huge serif titles split across 2 lines (`The Imperial` / `Age.`) — the period is always vermilion.
- Three-column data strip at the bottom: `PERIOD` / `REACH` / `CAPITALS`, labels in mono all-caps small, data in sans display (one word per column if possible).
- Right half often carries an archival photograph inside a thin ivory hairline border with `PLATE I` label top-left and `EXHIBIT 04.B` tag top-right.
- Progress bar at the very bottom (vermilion segment + ivory hairline).

**Don't**
- Never use the vermilion for body text or callouts — only for the terminal period, the meta dot, and the progress segment.
- Don't pair the serif with a mono kicker that's larger than 12px; the mono must always feel like a catalogue footer.
- Avoid images with modern styling (filters, gradients). Archive-grade black & white or sepia only.

**Best layouts**: `chapter-plate` · `timeline-strip` · `photo-with-caption`.

---

## bluehouse — Consumer card

Reference: replit slide-12.

```
--bg       #0b1524   deep navy
--fg       #ffffff
--muted    #8ea0b8
--border   #1a2c46
--accent   #fb675d   coral
--accent-2 #ff8f68   peach (for gradient)
--card-peach     #e0af99
--card-lavender  #c7cff0
--display  Inter Display · weight 700 · tracking -0.025em
--body     Inter
```

**Do**
- Big bold sans headlines (`Driving real estate ROI with prime properties`) with an inline **pill** highlighting a key noun (e.g., `ROI`) — pill uses `--card-peach` or `--card-lavender` background with navy text.
- 3–4 cards below in a horizontal row, mixing:
  - one photo card with a subtle tint overlay,
  - one **coral→peach gradient** card with the hero stat (`+47%`),
  - one **cool lavender→blue gradient** card with a secondary stat,
  - one **navy / peach neutral** card for small numbers.
- Cards are `border-radius: 24px`, 4:3 aspect, label top-left, number/stat bottom-left.
- Tiny icon cluster top-left of gradient cards (e.g., property-pin chips overlapping).

**Don't**
- Don't use the coral for headline text. It lives **inside** gradient cards.
- No more than one gradient direction per slide (either 135° coral→peach OR 180° lavender→blue, not both on the same card).
- Don't put text over the photo area that's smaller than 16px — the imagery competes.

**Best layouts**: `pill-headline-cards-row` · `product-gradient-grid` · `hero-photo-split`.

---

## Cross-theme don'ts (all 8)

- No emoji (SaaS trap).
- No hand-drawn SVG people (AI-slop).
- No "aggressive purple gradient" — bluehouse is the only theme allowed to gradient, and only peach/coral/lavender.
- No rounded left-border cards with a hex-shift accent (generic AI card).
- Invented metrics are forbidden. Use `—` or a muted rectangle when the number doesn't exist yet.
- The display face is a **theme setting**, not a slide setting. Never mix serif and Y2K in one deck.

---

## Contributing a new theme

If replit.com/slides ships a new template you want reflected here, or you want to propose a fork theme, follow this procedure so colors stay honest (no memory guesses, no "looks about right").

### 1. Capture the source PNG

Screenshot the replit.com/slides card at **2× device pixel ratio** (macOS: `Cmd+Shift+4` on a HiDPI display captures 2×). Save as `reference-<theme>.png`. Crop to just the template card — exclude chrome and shadows.

### 2. Extract the dominant colors

```bash
# Install once (macOS): brew install imagemagick
magick reference-<theme>.png \
  -resize 200x200 \
  -colors 8 \
  -unique-colors txt:- \
  | tail -n +2 \
  | awk '{print $3}' \
  | sort -u
```

This quantizes to 8 dominant colors and prints their hex values. The top few will be surface / type / border; the rare one is usually the accent.

For a specific point (e.g. sampling the accent from a known pixel):

```bash
magick reference-<theme>.png -format "%[pixel:p{420,280}]" info:
```

### 3. Map to the 6-token palette

Every theme uses the same 6 tokens plus a display font. Fill in:

```
--bg         surface (largest area, ≥ 50% coverage)
--fg         type color (largest area inside text blocks)
--muted      secondary text (~40% alpha feel)
--border     hairline dividers, 1px
--accent     chromatic accent (≤ 5% coverage — the rare color)
--font-display  sans / serif / Y2K display — see the three allowed families in template.html
```

If the source uses two near-identical grays, collapse to one `--border`. Don't invent new tokens; every theme must map cleanly to this set so `data-theme` switching stays lossless.

### 4. Add the theme block

1. Append a new `body[data-theme="<name>"] { … }` block to `assets/template.html` in the theme tokens section. Mirror an existing block's token order.
2. Add the theme row to the `od.inputs.theme.values` enum in `SKILL.md` (frontmatter).
3. Add a "When to pick" row to the pick-table in `SKILL.md` and to the table in this file.
4. Write a new `## <theme> — <name>` section below (palette block + Do / Don't / Best layouts), matching the shape of the other eight.
5. Add a P1 theme-specific must to `checklist.md` (one bullet describing the theme's non-negotiable visual tell).
6. Add a row to the reviewer screenshot-mapping table in the PR description so future contributors can reconcile drift.

### 5. Verify

- Render a one-slide example with the new theme and compare side-by-side with the source PNG. If the `--accent` looks off, re-sample with a larger `-colors` count (try `16`) and pick the one whose coverage matches the source.
- Add an `example-<theme>.html` to `examples/` if the new theme is visually contrasting from the existing four (helix / holm / atlas / bluehouse). Otherwise a preview via `examples/README.md`'s instructions is enough.
