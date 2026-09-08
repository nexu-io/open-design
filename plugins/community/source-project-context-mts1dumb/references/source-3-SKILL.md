---
name: south-florida-elevated-design-system
description: Apply the South Florida Elevated luxury-editorial design system — deep onyx nights, champagne-gold rules, restrained Florida teal, Instrument Serif + Cairo. Use for any deliverable for Miguel Perez's boutique South Florida real-estate brand: Instagram carousels, pitch decks, landing pages, brand assets, and applied UI.
user-invocable: true
---

# South Florida Elevated — Design System Skill

A reusable skill package for generating on-brand artifacts for **South Florida Elevated**, distilled from the source OpenDesign project "Your Core Visual System Should Be".

## What is inside

- `DESIGN.md` — the authoritative visual system (theme, color, type, spacing, layout, components, motion, voice, anti-patterns).
- `colors_and_type.css` — bindable OKLch token stylesheet with concrete hex references.
- `brand-spec.md` — the preserved client master-style prompt.
- `south-florida-elevated-carousel.html` — the canonical 5-frame brand carousel (source reference).
- `assets/` — preserved brand assets: wordmark mark, wordmark lockup, skyline silhouette, palette reference, plus the shipped "MP × Elevated" brand symbol and light/dark transparent logo lockups (`logo-concepts/` holds monochrome explorations).
- `build/lib/sfe-common.css` — component CSS distilled from the source carousel.
- `preview/` — six focused review cards (color, type, spacing, components, brand, applied UI).
- `ui_kits/app/` — an applied interface kit composing the tokens into working product UI.

## Source context

- **Source project:** "Your Core Visual System Should Be" (`bb760814-bca2-4004-a0cd-40f826270efa`).
- **Source evidence:** `south-florida-elevated-carousel.html` (5-frame carousel for @southfloridaelevated) and `brand-spec.md` (client master style prompt). All tokens/values are extracted from these files, not invented.
- **Design system id:** `user:your-core-visual-system-should-be-design-system`.
- **Provenance:** see `context/provenance.md`.

## When to use this skill

Use whenever a deliverable carries the South Florida Elevated identity — an Instagram carousel, a pitch/presentation deck, a marketing or landing page, brand assets, signage, or an applied interface kit. Also use it to review or extend any existing SFE artifact.

## How to use

1. **Bind tokens:** copy `colors_and_type.css` (or its `:root`) into the artifact's first `<style>`. Compose components against the **semantic role tokens** so a `data-theme="light"` / `.light` scope remaps the whole surface for free. Load the two Google Fonts per `fonts/README.md`.
2. **Read the rules:** follow `DESIGN.md` for color, type, spacing, layout, and anti-patterns (plus the accessibility contract in §10).
3. **Reuse source components:** pull masthead, chips, rails, keyline/grain frames, and dusk plates from `build/lib/sfe-common.css` and `assets/`.
4. **Carousel:** reuse the 5-frame arc (cover → three pillars → close) from the preserved source HTML.
5. **Applied UI:** compose product surfaces by importing `ui_kits/app/components/app.css` and `brand-config.js`; for a product shell set `--surface-1`/`--text-primary` on `body`.

## Design system highlights

- **Gold is the material; teal is the accent.** Thin metallic gold rules and serif-italic gold emphasis carry the identity; Florida teal stays small and rare (index numerals, dots, eyebrows).
- **Sharp corners everywhere.** `border-radius: 0` is a hard rule.
- **One serif headline per frame** in Instrument Serif; **italic for emphasis**; Cairo supports with letterspaced caps.
- **Cinematic dusk** photographic treatment — deep onyx with champagne horizon glow and fine grain, never stock-bright.
- **Voice:** confident, local, specific ("down to the waterline"); no invented metrics.
- **Accessibility:** onyx/ivory text pairs hold strong contrast; hover/focus never reduce foreground lightness; gold keyline focus ring required.

## Anti-patterns

Purple washes, rounded corners, multiple solid CTAs, teal surfaces, emoji icons, bright stock photography, invented metrics, and AI-slop typography (untracked caps, unjustified serif). Full list in `DESIGN.md` §9.
