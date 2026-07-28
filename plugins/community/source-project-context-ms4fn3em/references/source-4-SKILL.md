---
name: the-compression-company
description: >
  Design system for The Compression Company marketing web — black bento canvas,
  chalk typography, paper cells, mono + CTAs, sensor accent palette. Use when
  building TCC-branded pages, edge-AI compression marketing, or matching the
  Website Clone homepage system (user:website-clone-design-system).
user-invocable: true
---

# The Compression Company — Agent Skill

Reusable Claude Design–style package for The Compression Company marketing web. Bind tokens from `colors_and_type.css`, follow `DESIGN.md`, and compose from `ui_kits/app/` plus focused `preview/` cards.

## What's inside

- **DESIGN.md** — canonical posture, components, motion, voice, anti-patterns
- **colors_and_type.css** — semantic + sensor color tokens, type stacks, spacing, radius
- **fonts/** — Roboter, Inter, Fragment Mono, Instrument Serif (woff2 + fonts.css)
- **assets/** — logos, line icons, ascii hero cloud, founders still, benchmark thumb
- **preview/** — focused review cards (colors, type, spacing, components, brand, applied)
- **ui_kits/app/** — applied marketing shell + modular component HTML
- **examples/** — preserved full homepage clones
- **brand-spec.md** / **context/** — compact brand extract and provenance

## Source context

Based on the Open Design **Website Clone** project (`528b2514-393c-4868-bead-278ab096b20f`), a high-fidelity homepage clone of https://www.thecompressioncompany.com. Evidence: computed CSS variables, self-hosted fonts, icons, logos, imagery, and full HTML implementations copied into this workspace (see `context/source-context.md`, `context/provenance.md`, `NOTES.md`).

## When to use

Use this skill when building:

- TCC marketing pages, section prototypes, or landing artifacts
- Edge-AI / sensor-compression product interfaces that must match this brand
- Design-system previews, investor one-pagers, or UI kits in this visual language
- Any production-style mock that should look like the black bento homepage

## How to use

1. Read **DESIGN.md** for non-negotiable posture and anti-patterns.  
2. Load **fonts/fonts.css**, then bind **colors_and_type.css** (or paste its `:root` into the artifact `<style>`).  
3. Inspect **preview/** cards and compose from **ui_kits/app/** (index + `components/`).  
4. Reuse preserved **assets/** and **fonts/** by relative path — do not hot-link remote brand files.  
5. For full-page composition reference, open **examples/homepage-full.html**.  
6. Prefer semantic deliverable filenames; reserve `index.html` for launchers and `ui_kits/app/index.html`.

**How to use:** Start with DESIGN.md + colors_and_type.css, then copy patterns from preview/ and ui_kits/app/.

## Design system highlights

- **Colors:** Black `--bg`, chalk type, paper white cells; accents coral / tan / green / blue / purple as high-signal only; primary CTA blue `#64bce8`
- **Typography:** Roboter stencil display, Instrument Serif italic emphasis, Inter body, Fragment Mono uppercase labels
- **Spacing & radius:** Fluid space scale; bento `--gap` ~3–5px; cell radius 10px; pill CTAs
- **Layout:** Sticky white nav + dense 4-col bento collapsing to 2 then 1 column
- **Interaction:** Pill hover fills, FAQ accordion, modality list, marquee tickers (disabled under reduced motion)
- **Icons:** Line SVGs (cylinder, grid, buildings, press, barcode) — never emoji

## Build checklist

- [ ] Fonts + `colors_and_type.css` bound  
- [ ] Black page canvas; paper or dark cells only  
- [ ] Display = Roboter; mono labels uppercase  
- [ ] Primary CTA = blue pill with leading `+`  
- [ ] Accents not used as page washes (except coral banner / strip tiles)  
- [ ] No invented metrics; honest placeholders if unknown  

## Anti-patterns (hard fail)

Purple gradient washes · emoji icons · left-border accent cards · Inter as display · cream canvas · fake stats.
