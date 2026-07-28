---
name: the-compression-company
description: >
  Design system for The Compression Company marketing web — black bento canvas,
  chalk typography, paper cells, mono + CTAs, sensor accent palette. Use when
  building TCC-branded pages, edge-AI compression marketing, or matching the
  Website Clone homepage system (user:website-clone-design-system).
user-invocable: true
---

# The Compression Company — Agent Skill (reference)

Reusable Claude Design–style skill text for The Compression Company marketing web.

> **Plugin note:** This file ships under `references/`. Bind rules from **`source-2-DESIGN.md`** in this same folder. Do not require unshipped package paths (`colors_and_type.css`, `preview/`, `fonts/`, `assets/`, `ui_kits/app/*.html`) to exist inside the plugin — generate them in the consumer workspace when the task needs them.

## What's inside (plugin evidence)

- **`source-2-DESIGN.md`** — canonical posture, components, motion, voice, anti-patterns  
- **`source-3-README.md`** — package guide + plugin-safe review workflow  
- **`source-5-README.md`** — applied marketing kit structure (prose)  
- **`source-1-source-context.md`** / **`provenance.json`** — handoff and formalization  

When a full package is materialized in a consumer project, also expect generated: `colors_and_type.css`, optional `fonts/` + `assets/`, `preview/` cards, `ui_kits/app/` HTML, and `examples/`.

## Source context

Based on the Open Design **Website Clone** project (`528b2514-393c-4868-bead-278ab096b20f`), a high-fidelity homepage clone of https://www.thecompressioncompany.com. Evidence for agents using this plugin is the markdown under `references/`, not remote workspace binaries.

## When to use

Use this skill when building:

- TCC marketing pages, section prototypes, or landing artifacts  
- Edge-AI / sensor-compression product interfaces that must match this brand  
- Design-system previews, investor one-pagers, or UI kits in this visual language  
- Any production-style mock that should look like the black bento homepage  

## How to use (plugin-safe)

1. Read **`source-2-DESIGN.md`** for non-negotiable posture and anti-patterns.  
2. Apply tokens described there (semantic core + sensor accents + type stacks) — paste into artifact CSS or generate `colors_and_type.css` in the consumer project.  
3. Follow composition notes in **`source-5-README.md`** (shell, benchmark, strip, FAQ, funnel).  
4. Use **`source-3-README.md`** for the human review order when materializing a full package.  
5. Prefer semantic deliverable filenames; reserve `index.html` for launchers and kit entry points.  
6. Do **not** hot-link remote brand files; only use assets the consumer already has or generates.

**How to use:** Start with `source-2-DESIGN.md`, then compose from `source-5-README.md` patterns.

## Design system highlights

- **Colors:** Black `--bg`, chalk type, paper white cells; accents coral / tan / green / blue / purple as high-signal only; primary CTA blue `#64bce8`  
- **Typography:** Roboter stencil display, Instrument Serif italic emphasis, Inter body, Fragment Mono uppercase labels  
- **Spacing & radius:** Fluid space scale; bento `--gap` ~3–5px; cell radius 10px; pill CTAs  
- **Layout:** Sticky white nav + dense 4-col bento collapsing to 2 then 1 column  
- **Interaction:** Pill hover fills, FAQ accordion, modality list, marquee tickers (disabled under reduced motion)  
- **Icons:** Line SVGs (cylinder, grid, buildings, press, barcode) — never emoji  

## Build checklist

- [ ] Tokens from `source-2-DESIGN.md` bound in the artifact or consumer CSS  
- [ ] Black page canvas; paper or dark cells only  
- [ ] Display = Roboter (or declared stencil stack); mono labels uppercase  
- [ ] Primary CTA = blue pill with leading `+`  
- [ ] Accents not used as page washes (except coral banner / strip tiles)  
- [ ] No invented metrics; honest placeholders if unknown  

## Anti-patterns (hard fail)

Purple gradient washes · emoji icons · left-border accent cards · Inter as display · cream canvas · fake stats.
