# Claude Design System

A production-usable design-system package for **Claude** (Anthropic), extracted from [claude.ai](https://claude.ai/) and deepened by a live re-measurement pass (2026-07) against the site's real stylesheets (`data-color-version=v2`, `data-theme=claude`).

## Product Overview

Claude is Anthropic's AI assistant — "built for problem solvers." The product surface is a chat-first web app whose visual identity rests on three measured facts:

1. **A warm neutral palette.** Every gray is tinted (hue 45–60); the canvas is white, the app surface warm ivory `#f9f9f7`, text near-black `#131313`. There are no cold grays anywhere in the system.
2. **One high-chroma note: clay.** `#d97757` (emphasized `#c6613f`) carries the starburst mark, primary CTAs and loading dots. Blue `#256abf` is reserved for links, violet `#7161e0` for Pro/Max plan cues.
3. **A serif voice.** Claude speaks in Anthropic Serif; the interface around it is Anthropic Sans; code is Anthropic Mono. The logotype uses Anthropicons-Variable.

## Source Evidence

| Evidence | Where |
| --- | --- |
| Captured login page DOM | `prefetch/page.html` |
| Captured + re-fetched live stylesheets (v2 token blocks, both themes) | `prefetch/styles.css`, re-measured 2026-07 |
| Programmatic frequency-rank pass (colors/fonts/logo candidates) | `prefetch/material.md` |
| Setup notes & review contract | `context/source-context.md` |

**Limitations:** the authenticated app could not be crawled — chat-surface component guidance is reconstructed from CSS class evidence (buttons, prose, motion). Voice & tone adjectives are inferred from public meta/login copy. Both are labelled `inferred` where they appear.

## Package Contents

| Path | What it is |
| --- | --- |
| `DESIGN.md` | Canonical principles: palette, type, voice, imagery, layout posture, component evidence |
| `colors_and_type.css` | **Measured source of truth** — full token set (light + dark), `@font-face` bindings to local fonts |
| `brand.json` | Machine-readable bundle: roles, extended ramps, typography, fonts, imagery, provenance |
| `guide.md` | One-page quick reference |
| `SKILL.md` | Agent-facing skill for reusing this system |
| `fonts/` | Real woff2 binaries: Anthropic Sans/Serif (normal+italic, variable 300–800), Anthropic Mono, Anthropicons-Variable |
| `logos/` | Starburst SVG (primary vector mark), favicon set, apple-touch-icon, og-image |
| `imagery/` | Social cover captures |
| `preview/` | Focused review cards (see manifest below) |
| `brand.html` | Daemon-rendered brand-kit overview page |
| `system/` | Engine-derived layer: antd-style tokens (`tokens.*.json`, `variables*.css`, `theme.json`, `seed.json`), component kits (`kit.html`, `kit.dark.html`), gallery (`index.html`), six generated artifacts |
| `system/artifacts/` | `landing` · `deck` · `poster` · `email` · `newsletter` · `form` |

> The `system/` layer uses antd slot *conventions* (token names, component kits), but every semantic value has been re-aligned to the measured palette in `colors_and_type.css` (2026-07 pass): warm gray ramp, measured status colors (`#009300` / `#a66a00` / `#d03b3b`, dark `#0ca30c` / `#b77700` / `#e34948`), link blue `#256abf`, and `Anthropic Mono` in the code stack. The generic antd hue presets (red/orange/blue/…) remain as utility ramps; the `grey` preset is the measured warm ramp. `colors_and_type.css` stays the source of truth — if you edit `brand.json`, re-apply its values to both layers.

## Preview Manifest

| Card | Focus |
| --- | --- |
| `preview/colors-primary.html` | Core roles, functional accents, warm gray ramp, light vs dark side-by-side |
| `preview/typography-specimens.html` | All four preserved faces at real sizes, measured scale table |
| `preview/spacing-radius-shadows.html` | Radius scale, 4px spacing unit, shadow elevations, motion specs |
| `preview/brand-assets.html` | Real preserved files: starburst SVG, favicons, app icon, og-image, covers, font files |
| `preview/components-buttons.html` | Button system rebuilt from measured CSS (primary/secondary/ghost/clay/danger, dark, press + loading dots) |
| `preview/components-prose.html` | Claude's reply typography: headings, lists, blockquote, inline code |

## Applied UI Kit

`ui_kits/app/` composes the tokens into a working chat surface (sidebar, chat area, composer, message bubbles) as React + Babel-standalone JSX modules mounted from `ui_kits/app/index.html`. See `ui_kits/app/README.md` for structure, reuse, and the evidence basis (reconstructed from measured CSS; the authenticated app was not crawlable).

## Reuse Workflow

1. Read `DESIGN.md` for principles and posture rules.
2. Link `colors_and_type.css` (dark: `data-mode="dark"` on `<html>`) — tokens arrive as `--cds-*` custom properties with the real fonts already bound.
3. Use `brand.json` when you need machine-readable values (extended ramps, provenance flags).
4. Copy component patterns from `system/kit.html` / `system/kit.dark.html`; full-page patterns from `system/artifacts/`; a composed chat surface from `ui_kits/app/`.
5. Logo usage: prefer `logos/favicon-0.svg` (clay starburst, transparent); `logos/apple-touch-icon-4.png` for raster contexts.
6. Icons: 24×24 viewBox, `stroke: currentColor`, stroke-width 1.6, round caps/joins — see `ICON_PATHS` in `brand.html`.
7. Review against the six `preview/` cards before shipping.

## Verified Rules (enforced on artifacts built with this system)

- Border-radius defaults to 8px.
- Type uses the Anthropic stacks above (with the declared fallbacks when woff2 can't load).
- Color comes from the measured palette only; clay is a high-signal accent, never a wash.

## Provenance

Formalized by Open Design from candidate ec04d58b-92c4-4936-aa66-8ff053077646.
