# Design System Inspired by kami (紙 / 纸)

> Category: Editorial & Print
> Editorial paper system: warm parchment canvas, ink-blue accent, serif-led hierarchy. Built for resumes, one-pagers, white papers, portfolios, slide decks — anything that should feel like high-quality print rather than UI. Multilingual by design (EN · zh-CN · ja).

## 1. Visual Theme & Atmosphere

kami compresses into one sentence: **warm parchment canvas, ink-blue accent, serif carries hierarchy, no cool grays, no hard shadows.** It is not a UI framework — it is a constraint system for the page, designed to keep deliverables stable, clear, and unmistakably *printed*. The name reads as **kami / 紙 / 纸** — the same word for "paper" across Japanese and Chinese — and the system is co-designed across English, Simplified Chinese, and Japanese typesetting from the ground up, not retrofitted.

The page background is parchment (`#f5f4ed`), never pure white. Text sits on cream. The single chromatic move is ink-blue (`#1B365D`) — used on section numbers, primary CTAs, the left rule of a quote, the W500 weight in a metric. Everything else is a warm neutral with a yellow-brown undertone; cool blue-grays are absent on purpose.

Hierarchy is carried almost entirely by **serif type at a single weight (500)**. There is no bold, no italic, no second accent color. Density is achieved through tight line-heights (1.10–1.55), four-level gray ramps, and ring/whisper shadows that act as halos rather than drops. The aesthetic borrows from editorial print, technical white papers, and old typewritten correspondence — the goal is "good content on good paper," not "modern app UI."

**Key Characteristics:**
- Warm parchment canvas (`#f5f4ed`) — never `#ffffff`
- Single accent: ink-blue (`#1B365D`), covers ≤ 5% of any surface
- All grays warm (R ≈ G > B), no cool blue-grays anywhere
- Serif everywhere for hierarchy: Charter (EN), TsangerJinKai02 / Source Han Serif (CN), YuMincho (JA)
- Locked at weight 500 — no synthetic bold (700/900) and **no italic**
- Tight print rhythm (line-heights 1.10–1.55), much denser than typical web body
- Depth via 1px rings and whisper shadows (`0 4px 24px rgba(0,0,0,0.05)`), never hard drop shadows
- Tag fills are solid hex (e.g. `#E4ECF5`), never `rgba()` — print renderers double-paint alpha tags
- Numbers sit in `font-variant-numeric: tabular-nums` so columns of metrics don't shimmy

## 2. Color Palette & Roles

### Brand
- **Ink Blue** (`#1B365D`): The only chromatic color. CTAs, section numbers, link text on light surfaces, the left rule on a section title or quote, the active state of a switcher, the W500 metric value.
- **Ink Light** (`#2D5A8A`): Brighter variant, only for links sitting on dark surfaces.

> Rule: ink-blue covers ≤ **5% of document surface area**. More than that turns into ornament and the restraint collapses.

### Surface
- **Parchment** (`#f5f4ed`): The page background — warm cream, the emotional foundation. Never replace with white.
- **Ivory** (`#faf9f5`): Cards and lifted containers. Sits one half-shade brighter than parchment.
- **Warm Sand** (`#e8e6dc`): Default button background, secondary interactive surfaces.
- **Dark Surface** (`#30302e`): Dark-theme containers — warm charcoal, not slate.
- **Deep Dark** (`#141413`): Dark-theme page background. Olive-tinted near-black, never `#000000`.

### Text (four levels — no fifth)
- **Near Black** (`#141413`): Primary text. Slight olive warmth, gentler than pure black.
- **Dark Warm** (`#3d3d3a`): Secondary text, table headers, link defaults.
- **Olive** (`#504e49`): Subtext, captions, descriptions. (JA override: `#4d4c48` because YuMincho strokes are thinner.)
- **Stone** (`#6b6a64`): Tertiary — dates, metadata, meta labels.

### Border
- **Border** (`#e8e6dc`): Primary border — section dividers, card edges, table headers.
- **Border Soft** (`#e5e3d8`): Row separators, inner dividers, subtle internal lines.

### Tag tints (solid, NOT rgba)
Print renderers (WeasyPrint and friends) double-paint alpha fills, leaving a visible "double rectangle" on zoom. Tag and chip backgrounds must be solid hex, pre-blended over parchment:

| Effective alpha of `#1B365D` over parchment | Solid hex |
|---|---|
| 0.08 | `#EEF2F7` |
| 0.14 | `#E4ECF5` |
| **0.18 (default tag)** | **`#E4ECF5`** |
| 0.22 | `#D0DCE9` |
| 0.30 | `#D6E1EE` |

### Gradient System
kami is **gradient-free** by default. The only sanctioned gradient is the soft tag brush running `#D6E1EE → #E4ECF5 → #EEF2F7` left-to-right at very low contrast — used at most once per page on a single decorative tag. Do not introduce hero gradients, brand-color washes, or backdrop-filter blurs.

### Forbidden colors
- `#ffffff` as a page background
- `#000000` anywhere
- Any cool-gray surface (`#f8f9fa`, `#f3f4f6`, `slate-*`)
- Any second saturated color (no second accent — pick ink-blue or pick nothing)

## 3. Typography Rules

### Font Stacks

```css
/* English (default) */
--serif: Charter, Georgia, Palatino, "Times New Roman", serif;

/* Chinese */
--serif: "TsangerJinKai02", "Source Han Serif SC", "Noto Serif CJK SC",
         "Songti SC", "STSong", Georgia, serif;

/* Japanese */
--serif: "YuMincho", "Yu Mincho", "Hiragino Mincho ProN",
         "Noto Serif CJK JP", "Source Han Serif JP",
         "TsangerJinKai02", Georgia, serif;

/* Mono — must include CJK fallback so labels/comments don't render as boxes */
--mono: "JetBrains Mono", "SF Mono", "Fira Code", Consolas, Monaco,
        "TsangerJinKai02", "Source Han Serif SC", monospace;

/* Sans always equals serif. There is no separate sans-serif family. */
--sans: var(--serif);
```

### When to swap the stack

The three stacks above are **alternative values for `--serif`**, not three families layered together. When generating an artifact, set the primary stack on `:root` based on the dominant language of the content; let the browser's per-glyph fallback resolve mixed-script text inline. Concretely:

- `<html lang="en">` (or English-dominant content) → leave `--serif` on the EN stack. CJK glyphs that appear inline will fall through to the system Han fallback.
- `<html lang="zh-CN">` → override `--serif` to the CN stack on `:root` or on `html[lang="zh-CN"]`. Latin glyphs render via the Georgia tail of the stack.
- `<html lang="ja">` → override `--serif` to the JA stack and apply the `--olive: #4d4c48` text-color override (YuMincho strokes are thinner; the standard olive looks anemic against parchment).
- Multi-language artifacts (e.g. a deck with one Japanese chapter): set the dominant-language stack on `:root`, then scope the override on a wrapper element (`section[lang="ja"] { --serif: …; }`). Do **not** chain all three families inside a single `font-family` — that dilutes the visual character of every page.

### Hierarchy (screen, px)

The hierarchy table below is sized for **screen-rendered web pages** (resume, one-pager, portfolio shown at desktop width). For other surfaces, scale from the print pt baseline using these ratios — the same rules the kami `slides.py` template applies:

| Surface | Macro tokens (font, padding) | Micro tokens (border, radius, tracking) |
|---|---|---|
| Page / web artifact (one-pager, resume, white paper) | print pt × ~1.33 | print pt × 1 |
| Slide / 1920×1080 deck | print pt × ~1.6 | print pt × ~0.6 |

Concretely: a 22pt H1 in print becomes ~29px on a web page and ~36px on a slide; an 8pt letter-spacing value that reads as confident in print drops to ~5px on a slide. Letter-spacing always uses the slide micro ratio — print tracking applied at slide scale falls apart.

| Role | Family | Size | Weight | Line-height | Letter-spacing | Notes |
|------|--------|------|--------|-------------|----------------|-------|
| Hero / Display | serif | 96–106px | 500 | 1.05–1.10 | -1.2px | One per page max — cover or one-pager hero |
| Display CN/JA | serif | 48–64px | 500 | 1.10–1.12 | 0–0.3px | CJK glyphs need looser tracking and smaller absolute size |
| Section title | serif | 28–32px | 500 | 1.20 | 0.4px | Anchors a chapter; preceded by section number |
| H2 | serif | 22px | 500 | 1.25 | 0 | Subsection |
| H3 | serif | 17–18px | 500 | 1.30 | 0 | Item title, card heading |
| Manifesto / pull quote | serif | 20px | 400 | 1.65 | 0.05em | The one place letter-spacing earns its keep |
| Lede | serif | 15–16px | 500 | 1.55 | 0 | Intro paragraph under a section title |
| Body | serif | 14px | 400 | 1.55 | 0 (EN) · 0.35px (CN) · 0.02em (JA) | Reading body |
| Body dense | serif | 13–14px | 400 | 1.40–1.45 | 0 | Resume, one-pager, dense lists |
| Caption | serif | 12px | 500 | 1.45 | 0 | Notes, figure captions |
| Eyebrow / overline | sans | 12px | 500 | 1 | 1.2px, **uppercase** | Section eyebrow, switcher, meta header |
| Label | sans | 12px | 500 | 1.35 | 0.4px, uppercase | Small inline label, ink-blue if active |
| Mono / spec | mono | 12–13px | 400 | 1.55 | 0.4px | Hex codes, type specs, code |

### Weight rules
- Serif uses **only weights 400 and 500**. No 600, no 700, no 900.
- `strong { font-weight: 500 }` is explicitly set so browsers don't synthesize bold.
- Sans labels may use 500 or 600 at small sizes for legibility.
- **No italic anywhere.** No `font-style: italic`. If emphasis is needed, switch the color to ink-blue or wrap in a tag.

### Line-height
- Tight headline: 1.10–1.30 (display, H1, H2)
- Dense body: 1.40–1.45 (resume, one-pager, dense lists)
- Reading body: 1.50–1.55 (long-form chapters, letters)
- Label / caption: 1.30–1.40

Forbidden: 1.6+ (web rhythm, floats off the page) and 1.0–1.05 (lines collide except at giant display sizes).

### Letter-spacing
- EN body: `0`
- CN body (TsangerJinKai02): `0.35px` to compensate for the font's natural density
- JA body: `0.02em`
- All-caps overlines and small labels (< 10pt): +0.5 to +1.2px is mandatory
- Display CJK at 24px+: `0.2–1px` of optical breathing room
- On slides, tracking is roughly **half** of print values — 8px tracking that reads as confident in a printed deck disintegrates at slide scale.

### Tabular-nums contexts

`font-variant-numeric: tabular-nums` is mandatory anywhere kami numbers stack vertically or sit alongside other numbers — uneven proportional digits read as a layout bug at print resolution. Apply it to:

- Metric values (the big ink-blue number in `.metric-value`) and any side-by-side metric row
- Slide footers and slide counters (`02 / 05`), page numbers, deck pagination
- Section numbers in chapter heads (`01`, `02`, …) when they appear in a stacked TOC
- Resume dates, employment ranges, and education years
- Financial figures: revenue, ARR/MRR, valuations, tables of P&L line items
- White-paper and equity-report data tables (every numeric column)
- Stat-dashboard hero numbers and KPI grids
- Changelog version numbers (`1.4.2 → 1.4.3`) and any inline release dates
- Any inline numeric span inside a paragraph that compares values (`from 142 to 168`)

Do **not** apply tabular-nums to running prose where a single number appears mid-sentence — proportional digits read better there. The rule is "stacks and tables, yes; sentences, no."

## 4. Component Stylings

### Cards / Containers
```css
background: var(--ivory);             /* never parchment — cards lift one shade */
border: 1px solid var(--border);
border-radius: 8px;                   /* default; featured cards 12px; hero 16–24px */
padding: 28px 28px 24px;              /* component interior */
transition: box-shadow 0.2s;
/* Hover lifts via whisper shadow only — no transform, no brightness shift */
&:hover { box-shadow: 0 4px 24px rgba(0,0,0,0.05); }
```

### Buttons
```css
.btn-primary {
  background: var(--brand);                    /* #1B365D */
  color: var(--ivory);
  box-shadow: 0 0 0 1px var(--brand);          /* ring shadow as edge */
  padding: 8px 14px;
  border-radius: 8px;
  font: 500 12px/1 var(--sans);
  letter-spacing: 0.4px;
}
.btn-secondary {
  background: var(--warm-sand);
  color: var(--dark-warm);
  box-shadow: 0 0 0 1px var(--border);
}
.btn-ghost {
  background: transparent;
  color: var(--brand);
  box-shadow: 0 0 0 1px var(--brand);
}
```

### Tags / Chips
```css
.tag {
  font: 500 12px/1 var(--sans);
  padding: 2px 7px;
  border-radius: 2px;
  color: var(--brand);
  background: #EEF2F7;        /* solid hex, NOT rgba */
  letter-spacing: 0.4px;
}
.tag.standard { background: #E4ECF5; padding: 2px 8px; border-radius: 4px; }

/* The single sanctioned gradient — see §2 "Gradient System".
 * Use at most once per page on a "featured" or "new" tag. The gradient
 * runs darkest-to-lightest left-to-right so the eye reads it as a
 * watercolor wash, not a button highlight. */
.tag.brush {
  background: linear-gradient(to right, #D6E1EE, #E4ECF5 70%, #EEF2F7);
}
```

```html
<!-- Example: a single brush tag flagging the new chapter in a long doc -->
<span class="tag brush">New · Edition 02</span>
```

### Quote
```css
.quote {
  border-left: 2px solid var(--brand);
  padding: 4px 0 4px 14px;
  font: 500 15px/1.55 var(--serif);
  color: var(--olive);
}
```

### Section title pattern
```html
<div class="section-head">
  <p class="section-num">01</p>            <!-- ink-blue, 14px serif, tracking 0.4px -->
  <h2 class="section-title">Color</h2>     <!-- 32px serif 500 -->
  <p class="section-lede">Optional one-line description in olive.</p>
</div>
```
The number is set in the same serif as the title, in ink-blue, the same size as caption text. There is no underline, no left bar, no eyebrow — the number *is* the marker.

### Metrics
```html
<div class="metric">
  <div class="metric-value">8.4×</div>     <!-- serif 500 24px ink-blue, tabular-nums -->
  <div class="metric-label">faster ship</div> <!-- serif 12px olive -->
</div>
```
Numbers always sit in `font-variant-numeric: tabular-nums` so adjacent metrics align.

### Lists
```css
ul.dash {
  list-style: none; padding: 0;
}
ul.dash li {
  position: relative; padding-left: 14px;
}
ul.dash li::before {
  content: "\2013";          /* en-dash, ink-blue */
  position: absolute; left: 0;
  color: var(--brand);
}
```
Bullets are en-dashes in ink-blue, never filled discs.

### Code block
```css
.code {
  background: var(--ivory);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 14px;
  font: 12px/1.55 var(--mono);
  color: var(--near-black);
  white-space: pre;
}
.code .k { color: var(--brand); }   /* keyword */
.code .c { color: var(--stone); }   /* comment */
```

## 5. Layout Principles

### Page geometry (print A4)

| Document | Top | Right | Bottom | Left |
|---|---|---|---|---|
| Resume (dense) | 11mm | 13mm | 11mm | 13mm |
| One-Pager | 15mm | 18mm | 15mm | 18mm |
| Long Doc | 20mm | 22mm | 22mm | 22mm |
| Letter | 25mm | 25mm | 25mm | 25mm |
| Portfolio | 12mm | 15mm | 12mm | 15mm |

Rule: **denser = smaller margins, more formal = larger margins.**

### Web / screen pages
- Max content width: `1120px`, centered, with `padding: 88px 64px 120px` on desktop.
- Section gap: `72px` between top-level sections.
- Card-grid columns: 2 by default at desktop; collapse to 1 below 768px.
- Table columns sized in absolute px (not %), so kami tables don't reflow into spaghetti.

### Slides (1920×1080)
- Four-side padding baseline: `--slide-pad: 80px`.
- Padding-top of a content slide: 72–80px (print is 96–120px; slides are more compact).
- Sizing follows the surface ratios from §3 ("Hierarchy"): macro tokens × 1.6, micro tokens × 0.6 against the print pt baseline.
- Cover and chapter slides may flip background to ink-blue (`#1B365D`) with ivory text; everything else stays on parchment.

## 6. Depth & Elevation

Three sanctioned levels — that is the entire system:

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat (0) | No shadow, no border | Body text, manifesto, paragraphs on parchment |
| Ring (1) | `1px solid var(--border)` or `0 0 0 1px var(--brand)` | Cards, primary buttons, table edges |
| Whisper (2) | `0 4px 24px rgba(0,0,0,0.05)` | Hovered cards, lifted hero containers, screenshots |

Forbidden:
- Hard drop shadows (`0 12px 40px rgba(0,0,0,0.25)` and the like) — the page is paper, not a UI panel
- Neumorphism, glassmorphism, backdrop-filter blurs
- Multi-layer composite shadows

### Border radius scale
`2px → 4px → 6px → 8px (default) → 12px → 16px`. Tags hover at 2–4px, buttons and cards at 8px, featured / hero containers at 12–16px. Anything above 16px is reserved for cover-slide visuals.

## 7. Do's and Don'ts

### Do
- Use parchment (`#f5f4ed`) as the page background — the warm cream tone *is* the kami personality.
- Use a single serif weight (500) for every heading; let size carry hierarchy.
- Use ink-blue (`#1B365D`) only for primary CTAs, section numbers, links, the left rule of a quote, and the W500 in metrics.
- Keep every gray warm (yellow-brown undertone). When in doubt, sample with `R ≈ G > B`.
- Use ring shadows or whisper shadows for elevation; never hard drops.
- Set tag backgrounds as solid hex pre-blended over parchment, never `rgba()`.
- Set numbers in `font-variant-numeric: tabular-nums`.
- Pair the section number with the section title in the same serif — no eyebrow needed.
- Default bullets to ink-blue en-dashes (`–`).

### Don't
- Don't use `#ffffff` as page background, anywhere.
- Don't introduce a second accent color or a chromatic gradient.
- Don't use cool blue-grays (`slate-*`, `#f3f4f6`, `#6b7280`). Every neutral is warm.
- Don't use bold (700+) on serif — weight 500 is the ceiling.
- **Don't use italic anywhere.** No `font-style: italic`. Swap to ink-blue or a tag instead.
- Don't use sans-serif for headlines or body — sans is reserved for eyebrows, switchers, and small labels (and the sans stack literally equals the serif stack).
- Don't drop body line-height below 1.4 or push it above 1.55 — that range *is* kami's reading rhythm.
- Don't use round-disc bullets, drop shadows, or pill-shaped chips with heavy borders.
- Don't apply `backdrop-filter`, `mix-blend-mode`, or any modern compositing trick — the system targets print fidelity.

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|------|-------|-------------|
| Phone | < 768px | Single column. Hero 46px, section title 24px, manifesto 17px. Card padding drops to 20px 16px. Hide `.hero-tokens` row. |
| Tablet | 768–979px | Most 2-col grids hold; switch tag tints from 5 to 3 columns. |
| Desktop | ≥ 980px | Full 2-col / 4-col grids, JA gets `white-space: nowrap` rescue rules on long ledes. |

### Touch targets
- Buttons keep `8 14px` padding minimum.
- Tap targets stay above 44×44 by giving cards generous internal padding rather than oversizing chrome.

### Print
- `@page { size: A4; margin: 14mm 16mm; background: #f5f4ed; }`.
- Section, hero, family, comp, swatch, tint, quote, blockquote, pre, tr, anti-pattern blocks all use `break-inside: avoid` so kami pages don't snap mid-card.
- `-webkit-print-color-adjust: exact` is required so the parchment background actually reaches paper.

## 9. Agent Prompt Guide

### Quick Color Reference
- Page Background: "Parchment (#f5f4ed)"
- Card Surface: "Ivory (#faf9f5)"
- Brand / CTA: "Ink Blue (#1B365D)"
- Primary Text: "Near Black (#141413)"
- Secondary Text: "Dark Warm (#3d3d3a)"
- Subtext / Caption: "Olive (#504e49)"
- Tertiary / Meta: "Stone (#6b6a64)"
- Border: "Border (#e8e6dc)"
- Tag fill (default): "#E4ECF5 solid (NOT rgba)"

### Example Component Prompts
- "Build a kami one-pager hero on Parchment (#f5f4ed). Eyebrow row in 12px sans uppercase Stone (#6b6a64), letter-spacing 1.2px. Headline in serif 500 at 96px Near Black (#141413), line-height 1.05, letter-spacing -1.2px. Tagline below in serif 500 at 21px Olive (#504e49)."
- "Design a kami section header. A two-line stack: section number `01` in serif 500 at 14px Ink Blue (#1B365D) tracking 0.4px, then the title in serif 500 at 32px Near Black. Optional lede in serif 500 at 16px Olive."
- "Render a kami metric row of three metrics. Each metric is a vertical pair: value in serif 500 at 24px Ink Blue with `font-variant-numeric: tabular-nums`, label in 12px Olive. Gap between metrics: 28px."
- "Build a kami card on Ivory (#faf9f5) with 1px Border (#e8e6dc), 8px radius, 28px padding. Title in serif 500 at 16px Near Black. Hint underneath in 12px mono Stone. On hover, add a whisper shadow `0 4px 24px rgba(0,0,0,0.05)`. No transform, no color shift."
- "Build a kami slide cover at 1920×1080. Background ink-blue (#1B365D). Centered title in serif 500 at 96px Ivory (#faf9f5). Below, a 1px ivory rule, 96px wide. Author and date below in serif 500 at 18px Ivory at 70% opacity."

### Iteration Guide
1. **Start by checking the gray temperature.** If a gray reads cool, the design is no longer kami. Replace with the warm ramp.
2. **Audit the accent.** If ink-blue covers more than ~5% of the visible surface, reduce — push elements back to Olive or Dark Warm.
3. **Audit weight.** Any weight above 500 on serif is wrong. Replace with weight 500 and let size carry the contrast.
4. **Audit italic.** No italic, ever. Swap to ink-blue color or a small tag.
5. **Audit shadows.** If a shadow is visible at a glance, it's too strong. The only shadows are 1px rings and the `0 4px 24px rgba(0,0,0,0.05)` whisper.
6. **Tag fills must be solid hex.** If you wrote `rgba(27, 54, 93, 0.18)`, replace with `#E4ECF5`.
7. **Numbers tabular-nums.** Any column of numbers without `font-variant-numeric: tabular-nums` will look wrong on a print render.
8. **For slide work, halve tracking and scale macro tokens by 1.6.** Print rhythm is too loose at 1920×1080 without the adjustment.

## Attribution

Aesthetic inspiration drawn from [tw93/kami](https://github.com/tw93/kami) (MIT, © Tw93 and contributors). kami is a Claude skill for typesetting professional documents and slide decks; the tokens, type rules, and "ten invariants" above adapt its print-first design language for use as an Open Design system.
