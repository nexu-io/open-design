---
name: pattern-generator
description: Create three tileable pattern options from a reference.
version: 0.1.0
author: Alpon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [design, pattern, texture, background, generative, p5js, logo, design-agent]
    related_skills: [brand-token-system, design-imagery]
---

# Pattern Generator

Derive **3 distinct** repeatable patterns from a logo or reference, usable as
backgrounds/textures — the "pattern, 3 options (ref from logo or any ref)"
requirement.

## When to use this skill

- "Give me 3 pattern options for the brand"
- An explicit request for multiple pattern directions derived from a mark or reference

Do not activate this skill for a singular pattern request. It is a post-M1
three-option exploration workflow.

## Inputs

- A logo or reference image available to the local client
- The active brand palette from `brand-token-system`

## Workflow

1. **Extract motifs** from the logo/reference — a shape, an angle, a repeated
   element, the palette.
2. **Generate 3 different approaches**, e.g.:
   - **Geometric/parametric** as editable SVG or canvas code.
   - **Organic/textured** through a configured image backend, when available.
   - **Line/lattice or halftone** derived directly from the logo silhouette.
3. **Make them tileable** — verify the tile repeats without visible seams.
4. **Keep on-palette** using the brand tokens.

## Output contract

- 3 distinct pattern previews (PNG, tileable) + a tiled-preview render of each
- SVG or canvas source for generative options so density, scale, and color can be tuned
- A one-line description of each direction

## Rules

- Exactly 3, visually distinct.
- Each must tile cleanly; show the repeat so the human can judge it.
