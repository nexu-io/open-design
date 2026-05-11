---
name: skywalker-design
description: Use this skill to generate well-branded interfaces and assets for Skywalker — the AI-driven Web3 portfolio system for Christian Wu — for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, logos, icons, and a UI kit with 8 portfolio screens (landing, dashboard, NFT collection, NFT detail, AI assistant, MCP apps, wallet, case study).
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick map
- `colors_and_type.css` — every CSS token (light + dark, type, spacing, radius, shadows). Import this once.
- `assets/` — Skywalker mark, wordmark, Christian Wu monogram (color/black/white). Use the SVGs directly; never redraw.
- `fonts/Futurina.ttf` — brand display face. Loaded by the CSS as `--font-display` / `--font-brand`. Use UPPERCASE for hero/eyebrow.
- `preview/*.html` — small visual reference cards (color, type, spacing, components).
- `ui_kits/skywalker/` — interactive 8-screen portfolio prototype. `index.html` is the canonical app shell; `Components.jsx` + `Screens.jsx` hold reusable JSX.

## Voice & vibe
First-person singular, calm, technical. Lower-case for chrome (nav, buttons, captions); Title Case for sections; mono for any identifier (wallet, hash, model, file path). No emoji. No "we". Numbers and dates are always specific.

## Visual rules of thumb
Dark canvas (`#050507`) is canonical, with cyan `#56D6FF` accent for AI states and Christian Wu Blue `#0500FF` for primary actions. Use the 4-pt spacing scale. Cards are border-only (`1px var(--border-default)`) with 14px radius. Hover lifts via `--shadow-lg`. The hero glow is the only animated element. Lucide icons at 1.5px stroke.
