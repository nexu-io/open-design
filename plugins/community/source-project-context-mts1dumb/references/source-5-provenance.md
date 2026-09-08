# Provenance

## Source project
- **Source project id:** bb760814-bca2-4004-a0cd-40f826270efa
- **Source project name:** Your Core Visual System Should Be
- **Source skill id:** (none)
- **Active design system id (source):** professional

## This workspace
- **Design-system project id:** 79208616-2e51-4e2f-8a2f-e75f4448722e
- **Design-system id:** user:your-core-visual-system-should-be-design-system
- **Created at:** 2026-08-29

## Source evidence
Copied files, treated as primary evidence:
- `../preview.png` — rendered preview of the source carousel (6057 KB)
- `../south-florida-elevated-carousel.html` — the 5-frame "Who We Are" Instagram carousel (31 KB) authored for @southfloridaelevated by Miguel Perez; the definitive token/component/typography reference
- `../brand-spec.md` — the client's master style prompt "South Florida Elevated", listing OKLch tokens and observed design rules

## Source metadata bindings
- Kind: `prototype`; source `exampleBinding.pluginId = example-social-carousel`; scenario `snapshotId = 2aa978b6-49a1-4eb7-86ef-4e997da222b0`; task profile `prototype`.

## What was derived and how
Every token in `colors_and_type.css`, `DESIGN.md`, and the previews/kit was extracted from the source carousel's `:root` block and `brand-spec.md` — the OKLch values are copied, not invented. The wordmark SVG mark, skyline silhouettes, dusk-plate gradients, keyline/grain treatments, and the editorial layout system are preserved relationships, not guesses.

## Derived package layout
- `DESIGN.md` — the authoritative visual system
- `colors_and_type.css` — bindable token stylesheet
- `brand-spec.md` — preserved client spec (source)
- `south-florida-elevated-carousel.html` — preserved source artifact (see below)
- `preview.png` — preserved source preview (see below)
- `assets/` — preserved brand assets (wordmark mark, palette)
- `build/` — extracted component/library hooks (runtime icons/labels)
- `fonts/` — font fallback notes (webfonts loaded from Google Fonts CDN; no local files shipped)
- `preview/` — focused review cards
- `ui_kits/app/` — applied interface kit reflecting the source project

## Preservation notice
- `south-florida-elevated-carousel.html` and `preview.png` remain at the project root as unmodified source evidence (their `.artifact.json` manifests exist alongside).
- Fonts are served from Google Fonts CDN (Instrument Serif + Cairo). No proprietary font files are redistributed; `fonts/` documents the loading contract.
