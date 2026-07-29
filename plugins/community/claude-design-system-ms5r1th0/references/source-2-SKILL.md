---
name: claude-design-system
description: Build artifacts in the Claude (Anthropic) visual language — warm ivory surfaces, near-black text, single clay accent #d97757, Anthropic Serif/Sans/Mono type — using measured tokens, real preserved fonts, logos, and component patterns from claude.ai.
user-invocable: true
---

# Claude Design System

## What is inside

- `README.md` — product overview, source evidence, package contents, reuse workflow
- `DESIGN.md` — canonical visual principles (palette, type, voice, imagery, layout, component evidence)
- `colors_and_type.css` — measured token source of truth: light + dark themes, `--cds-*` properties, `@font-face` bindings to preserved woff2 files
- `brand.json` — machine-readable bundle (core roles, extended light/dark scales, typography, fonts, imagery, layout, motion, provenance)
- `fonts/` — Anthropic Sans, Anthropic Serif (normal + italic, variable 300–800), Anthropic Mono, Anthropicons-Variable
- `logos/` — clay starburst SVG (primary), favicon set, apple-touch-icon, og-image
- `imagery/` — social cover captures
- `preview/` — six focused review cards: primary colors, typography specimens, spacing/radius/shadows, brand assets, buttons, prose
- `ui_kits/app/` — applied chat-surface kit (React + Babel JSX modules: Sidebar, AssistantsList, ChatArea, MessageBubble, InputBar, App) with its own README
- `system/` — engine-derived kits (`kit.html`, `kit.dark.html`), antd token files, gallery, and six generated artifacts (landing, deck, poster, email, newsletter, form)

## Source context

Extracted from https://claude.ai/ and re-measured live in 2026-07 against the site's real stylesheets (`data-color-version=v2`, `data-theme=claude`, light + dark blocks). Fonts and logos are the site's own files, preserved locally — never redrawn. The authenticated app was not crawlable; chat-surface guidance is reconstructed from CSS evidence and voice/tone from public copy — both labelled inferred.

## When to use this skill

Any artifact that should look and feel like Claude: product prototypes, marketing pages, decks, dashboards, or components for the Claude ecosystem. Bind it whenever the brief says "Claude", "Anthropic", or references claude.ai.

## How to use

1. Open `README.md` for the workflow and `DESIGN.md` for principles — follow the posture rules (warm ivory surfaces, near-black text, clay once per view, 8px radius, 1px hairlines).
2. Link `colors_and_type.css` and compose with `--cds-*` tokens; add `data-mode="dark"` for the dark theme. The real fonts load automatically from `fonts/`.
3. For machine-readable values read `brand.json` (`extended.light` / `extended.dark` hold the full measured scales).
4. Copy component shapes from `system/kit.html` / `system/kit.dark.html`; full-page layouts from `system/artifacts/`; a composed, working chat surface from `ui_kits/app/` (see its README).
5. Use `logos/favicon-0.svg` as the mark. Icons: 24×24, `stroke: currentColor`, stroke-width 1.6, round caps/joins.
6. Review against the six `preview/` cards before shipping.

## Design system highlights

- **Warm, never cold:** every neutral carries a 45–60° hue; canvas `#ffffff`, surface `#f9f9f7`, text `#131313`, muted `#7b7974`, hairline `#e1e0d9`.
- **One accent:** clay `#d97757` (deep step `#c6613f`) — mark, primary CTA, loading dots. Link blue `#256abf` and Pro violet `#7161e0` are functional, not decorative.
- **Serif voice:** Anthropic Serif for Claude's words and editorial headlines; Anthropic Sans for UI; Anthropic Mono for code; Anthropicons-Variable for the wordmark.
- **Soft depth:** shadows at 6–8% black; borders are dark-at-alpha hairlines; hover is a background step (`.15s ease-out`), press is `scale(.96)` on a spring curve.
- **Restraint:** no gradients, no photography in product chrome, no emoji icons, no cold grays, no pure-black text.
