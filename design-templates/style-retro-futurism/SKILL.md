---
name: "style-retro-futurism"
en_name: "Retro-Futurism Style"
zh_name: "复古未来风格"
description: "Build retro-futuristic synthwave/cyberpunk interfaces with neon glow, CRT scanlines, glitch effects and 80s geometry."
zh_description: "复古未来、合成波、赛博朋克界面：霓虹发光、CRT 扫描线、故障效果、80 年代几何。"
triggers:
  - "retro futurism"
  - "synthwave"
  - "cyberpunk"
  - "neon glow"
  - "vaporwave"
  - "80s"
  - "复古未来"
  - "合成波"
  - "赛博朋克"
  - "霓虹"
  - "蒸汽波"
od:
  mode: "prototype"
  task_type: "prototype"
  surface: "web"
  platform: "desktop"
  scenario: "marketing"
  category: "style"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Make a synthwave music festival promo page with neon glow, a retro sun, CRT scanlines and a glitching title."
---
# Retro-Futurism Style

The 1980s' idea of the future: neon light on deep black, CRT artifacts, chrome and grids. Every element either glows, glitches, or both.

## When to use
- Gaming, entertainment and music platform pages
- Festival / event / album promo sites
- Tech brands and artistic projects courting nostalgia
- Cyberpunk or vaporwave themed products
- Any brief mentioning "synthwave", "outrun", "80s neon", "CRT"

## Style rules
- Base: deep black `#0B0B14` to `#1A1A2E`; dusk-gradient heroes (`#1A1A2E → #3D1758 → #6B1B6E`).
- Neon palette: Neon Blue `#0080FF`, Hot Pink `#FF006E`, Cyan `#00FFFF`, Purple `#5D34D0`; Gold `#FFD700` and 80s Pink `#FF10F0` as accents.
- Glow is mandatory: text via `text-shadow: 0 0 10px <neon>` (stack 2-3 radii for intensity); borders/buttons via outer `box-shadow` PLUS a matching `inset` glow.
- CRT scanlines: a fixed full-viewport `::before` with `repeating-linear-gradient(0deg, rgba(0,0,0,.28) 0 1px, transparent 1px 3px)` at ~0.3 opacity, `pointer-events: none`; add a radial vignette layer.
- Glitch: keyframes that briefly `skewX(±6-8deg)` + offset with split pink/cyan text-shadows, using `steps(1)` so it snaps; keep it to ~8% of a 3s+ loop. Guard with `prefers-reduced-motion`.
- Iconic props: striped sun (radial gradient gold→pink with `mask-image` horizontal stripes), perspective grid floor (`transform: perspective() rotateX(~58deg)` over crossed repeating-linear-gradients).
- Type: monospace body (Share Tech Mono / IBM Plex Mono) + wide display face (Orbitron), generous letter-spacing (2-6px), UPPERCASE labels; terminal-prompt flourishes (`user@host:~$`, blinking block cursor).
- Buttons: transparent fill, 2px neon border, glow inside and out; hover raises glow and adds a translucent neon fill. Corners sharp.
- Keep neon ON dark only, and verify 4.5:1 text contrast for body copy (use desaturated lavenders like `#B9B9E6` for paragraphs).

## Design tokens
`--neon: #0080FF #FF006E #00FFFF; --background: #0B0B14; --font: monospace + display; --scanline-opacity: 0.3; --effect: glitch + glow`

## Anti-patterns
- Conservative, corporate, legal or finance briefs; elderly-focused audiences (accessibility risk is high).
- Neon text on light backgrounds, or glow on more than ~30% of elements (everything glowing = nothing glows).
- Soft rounded pastel cards or realistic drop shadows breaking the aesthetic.
- Continuous aggressive glitch/flicker (seizure risk); always rare, brief, and reduced-motion aware.
- System sans-serif typography; it instantly breaks the period feel.

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

Adapted from https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (MIT)
