---
name: section-from-prompt
description: Build one responsive section from a written design brief.
version: 0.1.0
author: Alpon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [design, layout, section, html, prompt-to-ui, design-agent]
    related_skills: [brand-token-system, placeholder-copy, impeccable]
---

# Section From Prompt

Take a natural-language description of a single page section and produce a
laid-out, editable HTML section that uses the active brand tokens — the
"section layout can be prompt" requirement.

## When to use this skill

- "Build a pricing section with 3 tiers and a monthly/annual toggle"
- "Make a testimonials row / FAQ accordion / feature grid"
- A request for one section (not a whole page — for 3 full-page directions use
  `layout-options`)

## Inputs

- A text description of the section (purpose, elements, any layout hints)
- The active brand tokens from `brand-token-system`
- Optional copy from `placeholder-copy`

## Workflow

1. **Parse the description** into structure (regions, components, interactions).
2. **Load tokens** so spacing, color, and type match the brand.
3. **Lay it out** using the target project's existing components and conventions.
   For a standalone artifact, use semantic HTML and minimal CSS.
4. **Fill copy** via `placeholder-copy` if the section needs words.
5. **Render and verify** the section as a self-contained, responsive HTML block;
   wire up simple interactions (toggles, accordions) with minimal JS.

## Output contract

- A self-contained, responsive HTML section using `var(--token)` references
- Notes on any interaction added
- Editable markup (semantic, class-named) ready for engineering to lift

## Rules

- One section per call; keep it composable.
- Always reference tokens, never hard-coded one-off colors.
