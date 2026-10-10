---
version: alpha
name: Sigmund-design-analysis
description: "A light, editorial, trust-first B2B canvas for Sigmund (sigmundtest.com — psychometric assessment for HR). White and near-white slate surfaces (#ffffff canvas, #F8FAFC surface-1) carry dense, source-backed content; the structural voice is a single deep blue (#0053A0) used for headings, table headers and brand marks, while a single action green (#00A77F) is reserved for CTAs, badges and positive verdicts. A rare amber accent (#F1C40F) signals offers and price only — never decoration. Type is Poppins across the whole hierarchy (Calibri fallback), headings in uppercase with light tracking. Depth is carried by surface lift and a single soft shadow, not by stacked elevation. Photography is the signature gesture: high-contrast black-and-white with exactly one splash of color on an object tied to the theme."
colors:
  primary: "#0053A0"
  on-primary: "#ffffff"
  primary-hover: "#004480"
  primary-focus: "#004480"
  secondary: "#00A77F"
  on-secondary: "#ffffff"
  secondary-hover: "#008C69"
  secondary-light: "#5CBF8C"
  secondary-pale: "#E8F5EF"
  accent: "#F1C40F"
  on-accent: "#0053A0"
  accent-strong: "#F39C12"
  ink: "#1E293B"
  ink-muted: "#64748B"
  ink-subtle: "#475569"
  canvas: "#ffffff"
  surface-1: "#F8FAFC"
  surface-2: "#F1F5F9"
  hairline: "#E2E8F0"
  hairline-strong: "#CBD5E1"
  brand-logo-blue: "#004080"
  brand-logo-green: "#008060"
  semantic-success: "#00A77F"
  semantic-info: "#0053A0"
typography:
  display-xl:
    fontFamily: Poppins
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: -0.5px
  display-lg:
    fontFamily: Poppins
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.10
    letterSpacing: -0.3px
  display-md:
    fontFamily: Poppins
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.2px
  headline:
    fontFamily: Poppins
    fontSize: 26px
    fontWeight: 600
    lineHeight: 1.20
    letterSpacing: 0
  card-title:
    fontFamily: Poppins
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: 0
  subhead:
    fontFamily: Poppins
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.40
    letterSpacing: 0
  body-lg:
    fontFamily: Poppins
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  body:
    fontFamily: Poppins
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: 0
  body-sm:
    fontFamily: Poppins
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.50
    letterSpacing: 0
  caption:
    fontFamily: Poppins
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.40
    letterSpacing: 0
  button:
    fontFamily: Poppins
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.20
    letterSpacing: 0.2px
  eyebrow:
    fontFamily: Poppins
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.30
    letterSpacing: 1px
  metric:
    fontFamily: Poppins
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.00
    letterSpacing: -0.5px
rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 10px
  xl: 12px
  pill: 9999px
  full: 9999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px
  section: 96px
components:
  button-primary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px 24px
  button-primary-hover:
    backgroundColor: "{colors.secondary-hover}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px 24px
  button-primary-focus:
    backgroundColor: "{colors.secondary-hover}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px 24px
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px 24px
  button-offer:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px 24px
  button-disabled:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 12px 24px
  badge-success:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 12px
  badge-offer:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 12px
  badge-neutral:
    backgroundColor: "{colors.ink-muted}"
    textColor: "{colors.canvas}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 12px
  feature-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  benefit-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  positive-card:
    backgroundColor: "{colors.secondary-pale}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  pricing-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  pricing-card-featured:
    backgroundColor: "{colors.secondary-pale}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  comparison-table-header:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.card-title}"
    rounded: "{rounded.xs}"
    padding: 12px 16px
  comparison-table-row:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: 12px 16px
  comparison-table-row-alt:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: 12px 16px
  metric-block:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.metric}"
    rounded: "{rounded.xs}"
    padding: 8px 0
  stat-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.metric}"
    rounded: "{rounded.lg}"
    padding: 24px
  icon-tile:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.secondary}"
    typography: "{typography.caption}"
    rounded: "{rounded.lg}"
    padding: 16px
  testimonial-card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.lg}"
    padding: 32px
  cta-banner:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.headline}"
    rounded: "{rounded.xl}"
    padding: 48px
  cover-band:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.display-lg}"
    rounded: "{rounded.xs}"
    padding: 64px
  section-band-alt:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.display-md}"
    rounded: "{rounded.xs}"
    padding: 48px
  logo-pill:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 10px 14px
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 10px 14px
  text-input-focused:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 10px 14px
  top-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.xs}"
    height: 64px
  footer:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 64px 32px
  footer-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 64px 32px
  divider:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    height: 1px
---

## Overview

Sigmund is a **light-canvas, editorial, trust-first** system built for HR / psychometric
B2B content: plaquettes, comparatives, reports, flyers. The canvas is `{colors.canvas}`
#ffffff with `{colors.surface-1}` #F8FAFC as the resting section surface — there is no dark
mode on the marketing/document surface. Two brand colors do the work: a **deep structural
blue** `{colors.primary}` #0053A0 for headings, table headers and brand marks, and a single
**action green** `{colors.secondary}` #00A77F for CTAs, badges and positive verdicts. A rare
**amber accent** `{colors.accent}` #F1C40F is reserved for offers and price — never decor.

The system reads as **science you can trust**: generous whitespace, a stable grid, data
(tables, metrics, comparisons) at the front. Typography is **Poppins** across the entire
hierarchy (with Calibri as a tolerated legacy fallback); display headings are uppercase with
light positive tracking, body holds at ordinary tracking. Depth is deliberately shallow — a
single soft shadow `0 10px 25px rgba(0,0,0,.10)` separates a card from the page; everything
else uses surface lift and hairline borders.

The signature gesture is **photography**: high-contrast black-and-white images with exactly
**one splash of color** on an object tied to the theme (a pen, a folder, a screen), framed
in circles or soft-cornered tiles. Humans are always shown in a real professional setting,
dignified, never stock-cheerful or anxiety-inducing.

**Key Characteristics:**
- **Light, editorial canvas** — white + slate `{colors.surface-1}`, no dark surface.
- **One structural blue** (`{colors.primary}` #0053A0) + **one action green** (`{colors.secondary}` #00A77F).
- **Amber is scarce** (`{colors.accent}` #F1C40F) — offers and price only, with blue text on it.
- **Poppins** everywhere; uppercase display headings with light tracking.
- **Depth by surface lift**, not stacked shadows; one soft shadow per element.
- **Data-first** — comparison tables, metric blocks and source-backed numbers drive layout.
- **Black-and-white photography with a single color splash** is the brand's visual sign.

## Visual Theme & Atmosphere

Modern, scientific, institutional **de confiance** (trustworthy) — never kitsch, never
anxiety-inducing (HR / psychometric sector). Evidence before promise: numbers, metrics and
comparison tables take the foreground; decoration never competes with data.

Mood and density:
- **Sober by default**, expressive only at the offer/CTA moment.
- **≈1 strong idea per page**, 1–3 visuals per section (except an explicit "many photos" mode).
- The whitespace is a component: target 30–40% non-text surface on editorial pages. Never
  fill a gap with decor — enlarge the data or the space instead.

## Colors

> Source: Sigmund site stylesheet, brand charter v1.0.7, `STYLES.md`, `plaquette_helper.py`.

### Brand & Accent
- **Deep Blue** (`{colors.primary}` #0053A0): the structural voice — headings, table headers, brand marks, link emphasis.
- **Deep Blue Dark** (`{colors.primary-hover}` #004480): hover/focus and deep section bands.
- **Action Green** (`{colors.secondary}` #00A77F): CTAs, badges, positive verdicts, icons on light.
- **Green Dark** (`{colors.secondary-hover}` #008C69): hover on green actions, active borders.
- **Green Light** (`{colors.secondary-light}` #5CBF8C): CTA gradients, secondary icons.
- **Green Pale** (`{colors.secondary-pale}` #E8F5EF): positive card fills, recommended-column tint.
- **Amber Accent** (`{colors.accent}` #F1C40F → `{colors.accent-strong}` #F39C12): offers, price, a single highlight. **Always with blue text on it.**

### Surface
- **Canvas** (`{colors.canvas}` #ffffff): default page/card background, text on color.
- **Surface 1** (`{colors.surface-1}` #F8FAFC): resting section background, alternating table rows.
- **Surface 2** (`{colors.surface-2}` #F1F5F9): disabled fills, quiet inset panels.
- **Hairline** (`{colors.hairline}` #E2E8F0): 1px separators and table borders.
- **Hairline Strong** (`{colors.hairline-strong}` #CBD5E1): input borders, stronger rules.

### Text
- **Ink** (`{colors.ink}` #1E293B): all headings and emphasized body — dark slate.
- **Ink Muted** (`{colors.ink-muted}` #64748B): secondary type, captions, footer on light.
- **Ink Subtle** (`{colors.ink-subtle}` #475569): tertiary text, meta lines.

### Semantic
- **Success** (`{colors.semantic-success}` #00A77F): positive verdicts, "included" ticks — same hue as the action green.
- **Info** (`{colors.semantic-info}` #0053A0): neutral informational emphasis — same hue as the structural blue.
- *No red.* Comparatives stay balanced and non-alarmist; a "no" cell is muted ink, not red.

### Contrast Rules (AA)
- Text on blue / green / ink → **white** (`{colors.on-primary}`), ratio ≥ 4.5:1.
- Text on canvas / surface-1 → **ink** `{colors.ink}` — never light gray on white.
- Amber is a **background only**, with **blue** `{colors.on-accent}` text on it (never white on amber).

## Typography

### Font Family
- **Poppins** — the site and document typeface (`'Poppins', sans-serif`). Carries the entire hierarchy.
- **Calibri** — tolerated legacy fallback (PowerPoint default theme) only; migrate to Poppins on any new production. Recommended open substitute when Poppins is unavailable: **Inter**.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 48px | 700 | 1.05 | -0.5px | Hero / cover headline (uppercase) |
| `{typography.display-lg}` | 40px | 700 | 1.10 | -0.3px | H1, cover band title |
| `{typography.display-md}` | 32px | 600 | 1.15 | -0.2px | H2, section band title |
| `{typography.headline}` | 26px | 600 | 1.20 | 0 | H3, CTA banner heading |
| `{typography.card-title}` | 20px | 600 | 1.25 | 0 | Card / table-header titles |
| `{typography.subhead}` | 18px | 400 | 1.40 | 0 | Lead paragraphs, chapeau |
| `{typography.body-lg}` | 16px | 400 | 1.55 | 0 | Default body, testimonials |
| `{typography.body}` | 14px | 400 | 1.55 | 0 | Dense body, table cells |
| `{typography.body-sm}` | 13px | 400 | 1.50 | 0 | Nav, secondary body |
| `{typography.caption}` | 12px | 400 | 1.40 | 0 | Captions, badges, footer meta |
| `{typography.button}` | 14px | 600 | 1.20 | 0.2px | All button labels |
| `{typography.eyebrow}` | 13px | 600 | 1.30 | 1px | Uppercase eyebrow / kicker |
| `{typography.metric}` | 40px | 700 | 1.00 | -0.5px | Metric figures (blue) |

### Principles
- **Two-to-three type levels per page maximum.** A heading is a short assertive phrase, never a paragraph.
- **Uppercase on display**, with light positive tracking for covers and bands; sentence case for H2/H3.
- **Never justify text** — align left. Body never below 14px on print (12px for captions).
- Metric figures set in blue `{colors.primary}` with a 12px muted label below.

## Layout

### Spacing System
- **Base unit**: 4px.
- Tokens: `{spacing.xxs}` 4 · `{spacing.xs}` 8 · `{spacing.sm}` 12 · `{spacing.md}` 16 · `{spacing.lg}` 24 · `{spacing.xl}` 40 · `{spacing.xxl}` 64 · `{spacing.section}` 96.
- Card interior padding: `{spacing.lg}` 24px (32px on testimonials). Gap between a title and its body: `{spacing.md}` 16px. Between stacked blocks in a card: `{spacing.lg}` 24px.
- Page margin (print/slide): 0.8in (≈77px).

### Grid & Container
- Native document format: **16:9 slides — 13.333 × 7.5in** (deck); **A4 portrait** (print); flyer 1 page.
- Content max width ≈ 11.7in (slides); web container ≈ 1200px.
- Card grids: **3-up desktop → 2-up tablet → 1-up mobile**. Column gutter `{spacing.md}`–`{spacing.lg}`.
- Every element aligns to a margin or a column — **no floating elements**.

### Whitespace Philosophy
The canvas lift IS the whitespace. Sections separate by moving onto `{colors.surface-1}`, not by
darker fills. Keep ≈30–40% of an editorial page free of content.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 (flat) | No shadow, no border | Body type, headings, footer on surface |
| 1 (card lift) | `{colors.canvas}` background on `{colors.surface-1}`, `{rounded.lg}` corners | Default cards, metric blocks |
| 2 (soft shadow) | `0 10px 25px rgba(0,0,0,.10)` (outerShdw, blur 8, dist 4–5, 40–45% ink) | Photo tiles, a single featured card |
| 3 (emphasis) | card lift + `{colors.secondary}` left accent bar (pill) | Recommended pricing card, positive callout |
| 4 (band) | Full-bleed `{colors.primary}` or `{colors.secondary}` section band | Sections, cover band, CTA banner |

**Rules:** one shadow per element, consistent direction (down, 90°) · shadow is **functional**
(detach a card/photo), never decorative · **no shadow** on text, badges, icons or tables ·
hierarchy comes from **surface** (surface-1 → canvas → green-pale), not from stacking shadows ·
on a colored/ink band the only white surface allowed is the **logo pill**.

## Shapes

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Table cells, dividers |
| `{rounded.sm}` | 6px | Inline tags |
| `{rounded.md}` | 8px | Buttons, inputs |
| `{rounded.lg}` | 10px | Cards, photo tiles — the default corner |
| `{rounded.xl}` | 12px | Large panels, CTA banner |
| `{rounded.pill}` | 9999px | Badges, chips, filter toggles |
| `{rounded.full}` | 9999px | Circle photos, avatars |

**Geometry of imagery:** photos appear as **perfect circles** (with a 2–3pt white border) in
grids of 2×2 / 3 columns, or as **soft-cornered tiles** (`{rounded.lg}`) with an optional soft
shadow. Proportions are always preserved (crop to cover, never squash). Icons are 2px linear
pictograms — check, cross, users, shield, doc, chart, star, mail — green on light, white on color.

## Components

### Buttons
- **`button-primary`** — the green action. Background `{colors.secondary}`, text `{colors.on-secondary}`, `{rounded.md}`, padding 12px 24px. One primary CTA per page/section.
- **`button-primary-hover`** / **`button-primary-focus`** — background shifts to `{colors.secondary-hover}`.
- **`button-secondary`** — outline blue. `{colors.canvas}` background, `{colors.primary}` text, 1.5px `{colors.primary}` border.
- **`button-offer`** — amber offer/price. `{colors.accent}` background, `{colors.on-accent}` blue text. **Scarce.**
- **`button-disabled`** — `{colors.surface-2}` background, `{colors.ink-muted}` text ("Sur devis", inactive).

### Badges
- **`badge-success`** — green pill, white text (verdict, category).
- **`badge-offer`** — amber pill, blue text (offer, price).
- **`badge-neutral`** — muted ink pill, white text.

### Cards & Containers
- **`feature-card`** / **`benefit-card`** — white card on surface-1, `{rounded.lg}`, 24px padding, optional green left accent bar.
- **`positive-card`** — green-pale fill `{colors.secondary-pale}` for affirming content.
- **`pricing-card`** / **`pricing-card-featured`** — tier cards; the featured one lifts to green-pale + green border.
- **`testimonial-card`** — surface-1 fill, `{typography.body-lg}`, 32px padding.
- **`cta-banner`** — blue `{colors.primary}` band, white text, `{rounded.xl}`, 48px padding, one green CTA inside.
- **`cover-band`** — full blue band with centered **logo pill** and uppercase display title.

### Comparison Table (the core B2B component)
- **`comparison-table-header`** — blue `{colors.primary}` fill, white `{typography.card-title}`.
- **`comparison-table-row`** / **`comparison-table-row-alt`** — alternating white / `{colors.surface-1}` with `{colors.hairline}` 1px borders.
- Positive verdict = `badge-success`; the recommended Sigmund column is tinted `{colors.secondary-pale}` with a green rule. Presentation stays **balanced**; a "no" cell is muted ink, never red.

### Metrics & Icons
- **`metric-block`** / **`stat-card`** — green vertical accent bar + `{typography.metric}` figure in blue + 12px muted label. Always a **real, source-backed** number.
- **`icon-tile`** — surface-1 tile with a green 2px icon. No emoji, no 3D icons.

### Inputs & Navigation
- **`text-input`** / **`text-input-focused`** — white field, `{rounded.md}`, `{colors.hairline-strong}` border; focus ring 2px `{colors.primary}` at 50%.
- **`top-nav`** — white bar, ink text, 64px height; logo left, nav center, `button-secondary` + `button-primary` right.

### Footer
- **`footer`** — light pages: `{colors.surface-1}` fill, `{colors.ink-muted}` caption.
- **`footer-dark`** — ink `{colors.ink}` band, white text.
- **Mandatory credit line** on every page: `© {ANNÉE} SIGMUND — sigmundtest.com · {n} / {total}` at `{typography.caption}`, plus the page number.

## Do's and Don'ts

### Do
- Anchor on `{colors.canvas}` + `{colors.surface-1}`; separate sections by surface lift.
- Reserve `{colors.primary}` blue for structure (headings, table headers, brand) and `{colors.secondary}` green for action (CTA, badges, verdicts).
- Keep `{colors.accent}` amber **scarce** — offers and price only, with blue text on it.
- Set the whole hierarchy in **Poppins**; uppercase display headings with light tracking.
- Put real, sourced numbers on every "proof" band (metrics, comparisons).
- Use **black-and-white photography with a single color splash**, in circles or soft-cornered tiles, each image used **once**.
- Keep the mandatory footer `© {ANNÉE} SIGMUND — sigmundtest.com` + page number on **every** page.

### Don't
- Don't introduce a dark marketing surface or a second chromatic system.
- Don't use amber for anything but offers/price; never white text on amber.
- Don't use green for large decorative fills — it is the action color.
- Don't put a light gray on white (contrast), and don't use red/alarm colors in comparatives.
- Don't stack shadows or add decorative depth; one functional shadow maximum.
- Don't leave a logo directly on a colored/ink band without the **white logo pill**.
- Don't squash images, use the same image twice, or emit transparent (RGBA) images — convert to RGB.
- Don't emoji, don't 3D icons, don't decor on report/scientific layouts.

## Responsive Behavior

### Breakpoints (document formats)

| Name | Format | Key changes |
|---|---|---|
| Slide / deck | 16:9 — 13.333 × 7.5in | Reference grid; 12-column |
| Print | A4 portrait (21 × 29.7cm) | 0.8in margins kept; columns stack |
| Flyer | 1 page (recto-verso max) | Single CTA, offer prominent |
| Social | 1:1 / 4:5 | Short title, big metric, short CTA |

### Language Elasticity (FR / EN / ES)
- Spanish runs **+15–25%** longer than French; English **−10–15%**.
- Collapsing strategy: shrink within allowed ranges (body 16→14px), loosen line-height, drop
  3→2 columns, shorten the title — but **never** clip, overflow, or break the grid.
- The layout is **identical across languages**; only line breaks adapt.

### Minimum Sizes (legibility)
- Print body **≥14px (≈14pt)**, caption **≥12px**, footer **10pt**.
- Text/background contrast ≥ **4.5:1** (AA).
- Circle photo useful diameter ≥ ~1.5in.

### Touch Targets (web/social surfaces)
- CTAs hold ≥44px tap height; pill toggles ≥36px (≥44px on touch).

## Iteration Guide

1. Change ONE component at a time and reference it by its `components:` token name.
2. When adding a section, first decide which surface it rests on (`{colors.canvas}` or `{colors.surface-1}`).
3. Default body to `{typography.body}`; reserve `{typography.display-*}` for headings.
4. Treat green as the action color and blue as the structure color — never swap them.
5. Treat amber as scarce: offers and price only.
6. Verify the footer credit `© {ANNÉE} SIGMUND` + page number is present on every page.
7. For photographs: black-and-white + one color splash, RGB, unique, proportions preserved.

## Known Gaps

- Poppins is a Google Font and freely available; the site ships `'Poppins', sans-serif` with a system fallback. Calibri appears only in legacy PowerPoint decks and is a compatibility token, not a brand choice.
- Amber's on-color text (`{colors.on-accent}`) is specified as blue `{colors.primary}`; the site also uses white on amber in one component — blue is the canonical document choice.
- `{colors.ink-subtle}` (#475569) is drawn from the same slate scale as `{colors.ink}` / `{colors.ink-muted}` / `{colors.hairline}` / `{colors.surface-1}`; it is a derived tertiary step, not a value published in the charter.
- Legal/footer address lines and legal mentions are not codified here (standardized footer template pending).
- The site uses both `#00A77F` and `#5CBF8C` greens; `{colors.secondary}` (#00A77F) is the single canonical action green, with `{colors.secondary-light}` (#5CBF8C) reserved for gradients/icons.
