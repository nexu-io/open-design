---
name: "style-glassmorphism"
en_name: "Glassmorphism Style"
zh_name: "毛玻璃风格"
description: "Build glassmorphism (frosted glass) interfaces with backdrop blur, translucent layers, and vibrant backgrounds."
zh_description: "毛玻璃风界面：背景模糊、半透明层、鲜艳背景。"
triggers:
  - "glassmorphism"
  - "frosted glass"
  - "backdrop blur"
  - "translucent cards"
  - "music app"
  - "毛玻璃"
  - "磨砂玻璃"
  - "玻璃拟态"
  - "半透明"
  - "音乐 app"
od:
  mode: "prototype"
  task_type: "prototype"
  surface: "web"
  platform: "mobile"
  scenario: "product"
  category: "style"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Design a music streaming app home screen in a glassmorphism style: frosted glass cards over a vibrant gradient background."
---
# Glassmorphism Style

Frosted-glass UI: translucent white panels floating over a vivid, colorful background. The glass only reads as glass when there is something vibrant behind it to blur.

## When to use
- Modern SaaS dashboards and marketing pages
- Music / weather / lifestyle app interfaces
- Modal overlays, navigation bars, media players
- High-end corporate or financial product surfaces
- Any brief mentioning "frosted glass", "translucent", "blur card"

## Style rules
- Glass surface: `background: rgba(255,255,255,0.10-0.30)` (default 0.15); never opaque white.
- Blur: `backdrop-filter: blur(10-20px)` (default 15px) plus `-webkit-backdrop-filter` for Safari.
- Border: exactly `1px solid rgba(255,255,255,0.2)` on every glass panel.
- Background MUST be vibrant: gradients or blurred orbs using Electric Blue `#0080FF`, Neon Purple `#8B00FF`, Vivid Pink `#FF1493`, Teal `#20B2AA`.
- Light-source reflection: a `::before` overlay with `linear-gradient(115deg, rgba(255,255,255,0.3), transparent 55%)` on cards.
- Depth: layer glass at 2-3 z-levels (page orbs → cards → floating bar); deeper layers get stronger blur/opacity and larger `box-shadow` like `0 8px 32px rgba(10,5,40,0.25)`.
- Radius: generous, 14-22px on panels; pill (999px) on tags.
- Text: white at three opacities (1.0 / 0.78 / 0.55); verify 4.5:1 contrast against the blurred backdrop.
- Hover: raise cards (`translateY(-4px)`) and step opacity up one level (0.15 → 0.25), 200ms ease.
- Honor `prefers-reduced-motion`: disable spins/sweeps.

## Design tokens
`--blur-amount: 15px; --glass-opacity: 0.15; --border-color: rgba(255,255,255,0.2)`

## Anti-patterns
- Glass over a flat, low-contrast, or plain white background (the effect disappears).
- Dark translucent panels with dark text; any text below 4.5:1 contrast.
- Using it for critical-accessibility or performance-limited targets (blur is GPU-costly at scale).
- Opaque cards with a blur filter on the content itself; blur belongs to the backdrop.
- Drop shadows so dark they read as neumorphism.

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
