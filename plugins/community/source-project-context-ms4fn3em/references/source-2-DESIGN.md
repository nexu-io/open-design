# The Compression Company Design System

> Category: Marketing / product web
> Surface: responsive web (desktop-first bento → mobile stack)
> Source: Website Clone of https://www.thecompressioncompany.com
> Design system id: `user:website-clone-design-system`

**System in one sentence:** Black void canvas with chalk-on-ink typography, white paper cards in a tight bento grid, mono uppercase labels, and a five-color sensor palette used only as high-signal accents.

> **Plugin note:** This file is the canonical rules reference inside `source-project-context-ms4fn3em`. Package paths mentioned below (`colors_and_type.css`, `fonts/`, `preview/`, `ui_kits/app/`, etc.) describe a full design-system package to **generate in a consumer project**. They are not required to exist inside this plugin bundle — use sibling `references/source-*.md` files only.


## 1. Product Context & Atmosphere

Deep-tech edge AI for sensor compression — not SaaS purple, not consumer pastel. The page reads as instrument panel meets editorial lab: pure black field, white “paper” cells, hairline chalk rules, stencil display faces, and sparse coral/tan/green/blue/purple signals like sensor channels.

**Product:** The Compression Company — marketing homepage for an AI codec that compresses high-volume sensor data (earth observation, AVs, robotics, medical imaging) with dual lossy/lossless control. Primary surface is a responsive web bento marketing site extracted from the Website Clone project (`528b2514-393c-4868-bead-278ab096b20f`).

**Feeling:** Precise, dense, technical confidence. Calm black field; information density in bento cells; CTAs are small mono pills with a leading `+`, not large gradient buttons.

## 2. Color

### Semantic core

| Token | OKLch / value | Hex source | Role |
|-------|---------------|------------|------|
| `--bg` | `oklch(0% 0 0)` | `#000` | Page canvas |
| `--surface` | `oklch(17% 0 0)` | `#2a2a2a` | Dark cards (benchmark, strip, code) |
| `--fg` | `oklch(100% 0 0 / 0.98)` | chalk-hi | Primary light text |
| `--muted` | `oklch(100% 0 0 / 0.4)` | chalk-soft | Secondary light text |
| `--border` | `oklch(100% 0 0 / 0.06)` | chalk-border | Hairline on dark |
| `--accent` | `oklch(76% 0.09 230)` | `#64bce8` | Primary CTA / blue |

### Extended brand solids

| Token | Hex | Use |
|-------|-----|-----|
| `--coral` | `#e16051` | Banner wash, sensor channel, timeline stop |
| `--tan` | `#f9d97a` | Sensor channel only |
| `--green` | `#7fdd84` | Positive list markers, POV kicker, PSNR ring |
| `--blue` | `#64bce8` | Primary filled CTAs, accent |
| `--purple` | `#8e6bb3` | Sensor channel, soft radial glows |
| `--white` | `#fff` | Paper cells, nav, light sections |
| `--surface-dark` | `#111` | Platform tile rail |
| `--surface-light` | `#f5f5f5` | Compare graphics |
| `--gray-light` | `#e0e0e0` | PSNR sidebar cell |

### Chalk / ink opacity ramps

**On black:** `--chalk-hi` → `--chalk` → `--chalk-mid` → `--chalk-soft` → `--chalk-faint` → `--chalk-border` → `--chalk-ghost`.

**On paper:** `--ink` (`#000000d9`), `--ink-faint`, `--ink-rule` for hairlines and secondary copy.

### Rules

1. Page background is always black (`--bg`). Never beige, cream, or light gray page shell.
2. Accents are high-signal only — strip cards, timeline dots, telemetry dots, one CTA fill. Never full-page gradient washes of blue/purple.
3. White paper cells use ink type; dark cells use chalk type. Do not invert casually.
4. Coral banner is a full-width exception: solid `--coral` with ink text.

Bind the tokens documented in this file (generate `colors_and_type.css` in the consumer if needed). Prefer `var(--token)` over raw hex in new work.

## 3. Typography

### Families (self-hosted in `fonts/` and `assets/fonts/`)

| Role | Family | CSS token | Notes |
|------|--------|-----------|-------|
| Display / stencil | **roboter** → Inter | `--font-stencil` | Hero, section titles, card titles; weight 400–500 |
| Editorial italic | **Instrument Serif** | `--font-serif` | `em` inside hero/section, funnel italic word |
| Body / UI | **Inter** | `--font-sans` | Default body; rarely used for labels |
| Mono / labels | **Fragment Mono** | `--font-mono` | Uppercase labels, CTAs, telemetry, subtitles |

Prefer self-hosted faces when the consumer has font files; otherwise use the declared fallback stacks. Do not require plugin-local font paths.

### Scale

| Token | Approx range | Use |
|-------|--------------|-----|
| `--text-xs` | 8–9px | Dataset labels, meta, chip text |
| `--text-base` | 10–11px | Nav CTAs, ticker, mono buttons |
| `--text-body` | 12–13px | Body mono prose, list items |
| `--text-lg` | 13–15px | Sensor titles, ICP labels |
| `--text-2xl` | 16–20px | FAQ questions, strip titles |
| `--text-section` | 20–44px | Section headlines |
| `--text-hero` | 40–60px | Hero |
| `--text-cta` | 32–56px | Funnel / FAQ display |

### Tracking & leading

- Hero: leading `0.95`, tracking `-0.03em`; italic em scale `1.21em`
- Section: leading `1.05`, tracking `-0.02em`
- Labels: uppercase + `0.03em`–`0.06em` tracking
- Mono prose: slight negative tracking `-0.01em`

### Hierarchy pattern

Stencil headline → optional Instrument Serif italic fragment → Fragment Mono uppercase kicker/label → mono or stencil body.

## 4. Spacing

Fluid clamp scale from source:

| Token | Role |
|-------|------|
| `--space-2xs` … `--space-3xl` | Component padding ladder |
| `--gap` | Bento gutter (~3–5px) — signature density |
| `--pad-inline` | Section horizontal pad |
| `--pad-block` | Section vertical pad |
| `--nav-height` | Sticky nav bar |

**Density:** Marketing bento is intentionally tight. Prefer `--gap` between cells over large empty bands. Section blocks use `--pad-block` / `--pad-inline` inside white or dark cells.

**Radius:** `--radius: 10px` for cells/cards; `--radius-sm: 6px` for image wells; `--radius-pill: 9999px` for CTAs, chips, nav toggle.

**Shadows:** Minimal. Prefer `box-shadow: 0 0 0 1px var(--ink-rule)` hairline rings and soft radial glows (`color-mix` with blue/purple) over Material elevation.

## 5. Layout & Composition

### Bento grid

```
grid-template-columns: 1fr 1fr 1fr minmax(0, calc(25% + 2.2vw));
gap: var(--gap);
padding: var(--gap);
```

- Nav: full width, sticky, white paper
- Hero: cols 1–3 + right column (benchmark + PSNR)
- Subsequent sections: full-width cells (headline, strip, compare, banner, ICP, features, timeline, funnel, FAQ)

### Responsive

- ~1100px: collapse to 2-col; hero and right-col stack
- ~720px: 1-col; hide desktop nav, show drawer; hide funnel telemetry corners; marquee animations off under `prefers-reduced-motion`

### Page spine (homepage)

1. Sticky nav  
2. Hero + benchmark + PSNR  
3. Feature ticker  
4. Edge headline + platform carousel  
5. Legacy vs bespoke compare  
6. Coral banner + POV  
7. Modalities ICP list + detail card  
8. Features / founders photo + backer logos  
9. Timeline (how it works)  
10. Company strip cards (colored)  
11. Funnel CTA  
12. FAQ accordion  

## 6. Components

### Buttons / CTAs (`.hero-nav-btn`, `.funnel-btn`, `.tl-btn`)

- Mono, uppercase, pill radius, leading `+` in label copy
- **Filled:** `background: var(--blue)`, ink text; hover → white fill
- **Outline:** transparent, grey-light border, ink text; hover → black fill + white text
- Heights: ~34px primary, ~22px micro (timeline)

### Nav (`.bento-nav`)

White sticky cell; brand mark SVG + stencil name; desktop outline/filled pills; mobile `+` circular toggle opens drawer.

### Bento cell (`.bento-cell`)

`border-radius: var(--radius)`; backgrounds white / surface-card / surface-dark / coral / bg depending on section.

### Ticker (`.ticker`)

Horizontal marquee of mono uppercase items with `[ brackets ]` and `•` separators; 40s linear loop.

### Platform cards

Dark cards 200×140 with name + vendor mono; label cards dashed border + chip text.

### Benchmark panel

Dark cell: mono dataset label, stencil sensor title, image well, range slider (lossless ↔ max lossy), dual stats (original / compressed).

### PSNR sidebar

Light gray cell: mono label, huge stencil number + unit, green conic ring, mono note.

### Compare block

Two columns (legacy vs bespoke) with graphic, mono heading, stencil list (`–` vs green `+`).

### ICP modality list

Numbered rows; active/hover chalk-ghost fill; detail card with gradient, mono label, stencil tagline, chips.

### FAQ accordion

Stencil question + rotating `+` icon; grid reveal for answer; chalk-faint rules.

### Company strip cards

225×225 colored tiles (coral/tan/green/blue/purple) with stencil title, mono subtitle, line art icon.

### Funnel CTA

Centered stencil/serif hybrid headline, mono subtitle, blue pill CTA; corner telemetry (sensor dots + UTC clock).

## 7. Motion & Interaction

| Pattern | Spec |
|---------|------|
| Hover CTAs | `.25s` background / color / border |
| ICP list | `.3s` background + color |
| FAQ open | icon rotate 45°, answer grid-rows 0fr → 1fr |
| Tickers | CSS `translateX` 30–55s linear infinite |
| Benchmark slider | Instant label/stat update (no image swap in clone) |
| Reduced motion | Kill ticker/platform/backer/strip animations |

No Lenis smooth-scroll or scroll-triggered banner choreography in this system (known gap vs live site).

## 8. Voice & Brand

**Tone:** Technical, plainspoken, product-led. Compression, edge, sensor, codec, lossless/lossy, PSNR, downstream utility — not hype AI magic.

**Copy patterns:**

- Headlines: short stencil lines; one italic serif fragment for emphasis (*compress data*, *at the edge*)
- Labels: ALL CAPS mono with brackets in tickers: `[ AI CODEC FOR SENSOR DATA ]`
- CTAs: `+ Contact`, `+ Capabilities`, `+ Book a demo`
- Metrics: real-looking units (MB, dB) — use labelled placeholders if unknown; never invent traction stats

**Capitalization:** Sentence case for headlines; uppercase for mono labels and pills.

## 9. Anti-patterns

Do **not**:

1. Purple gradient page washes or multi-color full-bleed backgrounds  
2. Emoji as feature icons (use line SVGs: cylinder, grid, buildings, press, barcode)  
3. Soft SaaS cards with left accent borders  
4. Inter/Roboto as display faces (Inter is body only; display is Roboter)  
5. Large rounded 24px+ marketing cards (stay near 10px)  
6. Warm cream/beige canvases  
7. Accent as large surface fills except coral banner and strip tiles  
8. Drop shadows / neumorphism as primary depth  
9. Invented metrics or fake customer quotes  
10. Crowded multi-logo hero collages without the strip/marquee pattern  

## Semantic file names

Prefer semantic deliverables (`homepage-bento.html`, `capabilities-section.html`) over defaulting every file to `index.html`. Reserve `index.html` for launchers and `ui_kits/app/index.html`.

## Package map

Full-package paths below are **targets to generate in a consumer project**. Inside this plugin, the equivalent evidence is the `references/source-*.md` set (see plugin root `SKILL.md`).

| Full-package path | Purpose | Plugin evidence |
|------|---------|-----------------|
| `DESIGN.md` | This document | `source-2-DESIGN.md` |
| `README.md` | Human package overview | `source-3-README.md` |
| `SKILL.md` | Agent usage contract | `source-4-SKILL.md` |
| `colors_and_type.css` | Tokens + type utilities | Generate from this DESIGN |
| `fonts/` / `assets/` | Faces and brand media | Not shipped in plugin |
| `preview/` | Focused review cards | Generate in consumer |
| `ui_kits/app/` | Applied interface kit | Structure in `source-5-README.md` |
| `examples/` | Full homepage clones | Not shipped in plugin |
| `brand-spec.md` / `context/` | Compact brand + handoff | `source-1` + `provenance.json` |
