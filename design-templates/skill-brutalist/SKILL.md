---
name: "skill-brutalist"
en_name: "Industrial Brutalist Terminal"
zh_name: "工业野兽派终端"
description: "Industrial brutalist / tactical terminal interface: rigid visible grids, extreme type-scale contrast, monospace telemetry, hazard-red accent, simulated CRT texture."
zh_description: "工业野兽派与战术终端界面：刚性可见网格、极端字号对比、等宽遥测、危险红强调、模拟 CRT 纹理。"
triggers:
  - "brutalist"
  - "industrial"
  - "tactical terminal"
  - "crt"
  - "monospace ui"
  - "hazard red"
  - "野兽派"
  - "工业风"
  - "战术终端"
  - "CRT 纹理"
  - "硬核界面"
od:
  mode: "prototype"
  task_type: "prototype"
  surface: "web"
  platform: "desktop"
  scenario: "engineering"
  category: "style"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Make a brutalist terminal-style landing page for a deploy orchestration CLI: dark CRT look with red accents."
---
# Industrial Brutalist Terminal

Interfaces that read like declassified blueprints or aerospace terminals: mechanical precision, high data density, zero consumer-UI softness. Pick ONE substrate per project and commit: Swiss Industrial Print (light newsprint) or Tactical Telemetry (dark CRT). Never mix both.

## When to use

- Briefs mentioning "brutalist", "terminal", "industrial", "tactical", "CRT", "blueprint"
- Developer tool / CLI / infrastructure product landing pages
- Data-heavy dashboards or portfolios that should feel like machinery, not marketing

## Style rules

- **Substrate (dark mode).** Background #0A0A0A or #121212, never pure #000. Foreground #EAEAEA (white phosphor). Accent #FF2A2A hazard red, the ONLY accent; use for strike-throughs, thick divider bars, vital readouts. Optional terminal green #4AF626 on exactly one status element, or omit.
- **Substrate (light mode).** Paper #F4F4F0 / #EAE8E3, carbon ink #050505-#111111, same red rules.
- **Macro type.** Heavy uppercase sans (Archivo Black, Inter 800-900, or similar) at `clamp(3rem, 9vw, 11rem)`, tracking -0.03em to -0.05em, line-height 0.85-0.95. Headlines are architecture, not text.
- **Micro type.** Monospace (JetBrains Mono, IBM Plex Mono, Space Mono) at 10-14px, uppercase, tracking +0.05em to +0.1em, for ALL metadata, nav, labels, coordinates, unit IDs.
- **Layout.** Strict CSS grid with visible compartments: `display:grid; gap:1px; background:<border-color>` on the parent with solid child backgrounds yields razor-thin dividers. Full-width `<hr>`-style rules segregate zones. Oscillate between dense monospace clusters and vast negative space around macro type.
- **Geometry.** border-radius 0 absolutely everywhere. No gradients, no soft shadows, no translucency.
- **Symbology.** ASCII framing `[ SYSTEMS ]`, `>>>`, `///`, crosshair `+` at grid intersections, ®/©/™ as structural glyphs, randomized codes (`REV 2.6`, `UNIT/D-01`) as live-machinery texture.
- **Texture.** CRT scanlines via `repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,.1) 2px 4px)`; optional low-opacity noise on the root. Keep effects on non-scrolling fixed layers.
- **Hover.** Inverted blocks (red bg / dark text), 1px offset shifts, blinking cursor. Instant or <120ms transitions; the machine does not ease.

## Anti-patterns

- Rounded corners, gradients, glassmorphism, or soft drop shadows
- Mixing light and dark substrates in one interface
- A second accent color, or green used as general text color
- Friendly marketing tone; copy is terse, uppercase, procedural
- Centered airy hero with pill buttons (that is the opposite of this skill)

## Template fidelity (hard constraint)

The bundled `example.html` in this folder is the ground truth for this
template, not loose inspiration. Before generating, read `example.html`
and reproduce its visual system:

1. Reuse its layout skeleton, section order, spacing rhythm, typography
   stack, color tokens, and signature components as-is.
2. Swap only CONTENT for the user's brief: copy, data, imagery subjects,
   brand name. Structure, hierarchy, and visual language stay.
3. Keep the same fonts (or the closest available), the same accent-color
   discipline, and the same interaction details (hover states, motion).
4. Output copy follows the language of the user's brief, but the result
   must remain recognizably this template when placed side-by-side with
   `example.html`.
5. If the brief conflicts with the template, make the smallest deviation
   that satisfies the brief. Never redesign from scratch.

Adapted from https://github.com/Leonxlnx/taste-skill/tree/main/skills/brutalist-skill (MIT)
