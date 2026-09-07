---
name: "hallmark-terminal-landing"
en_name: "Terminal Dev-Tool Landing"
zh_name: "终端风开发者工具落地页"
description: "Terminal-mono developer-tool landing page on a midnight blue-black ground with a phosphor-cyan accent, CSS-art pipeline panels, and CLI walkthrough steps."
zh_description: "开发者工具落地页：午夜蓝黑底、荧光青强调、CSS 管线面板、CLI 步骤走查。"
triggers:
  - "developer tool landing"
  - "cli landing page"
  - "devtool website"
  - "terminal style"
  - "command line tool"
  - "开发者工具官网"
  - "CLI 工具落地页"
  - "终端风格"
  - "命令行工具"
od:
  mode: "prototype"
  task_type: "prototype"
  surface: "web"
  platform: "desktop"
  scenario: "engineering"
  category: "landing-page"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Build a dark terminal-style landing page for a CLI deployment tool: mono type, pipeline panel in the hero, step-by-step command walkthrough, and pricing tiers."
---
# Terminal Dev-Tool Landing

A dark, monospace-first landing page for CLI and infrastructure products. The page reads like a
well-typeset terminal session: a split hero with a CSS-art pipeline/trace panel, a sticky
"workbench" walkthrough where each step pairs prose with a shell command, an integrations strip,
and three pricing tiers. Everything is hairline-ruled; the single cyan accent does all the
pointing.

## When to use

- Briefs mentioning "developer tool", "CLI", "terminal", "devtools landing", "infra product",
  "dark landing page", "monospace"
- Products whose core UX is a command line, an API, or an observability surface
- Any marketing page that should feel engineered rather than art-directed

## Style rules

- **Color.** Midnight blue-black ground in three steps: page `oklch(15% 0.012 240)`, raised
  panels `oklch(19% 0.014 240)`, inset bars `oklch(23% 0.014 240)`. Rules `oklch(30% 0.012 240)`.
  Ink at three strengths: `oklch(94% 0.010 240)` / soft `oklch(70% ...)` / muted `oklch(55% ...)`.
  One phosphor-cyan accent `oklch(82% 0.18 200)` used for eyebrows, the em word in the H1, step
  numbers, chips, and primary buttons. Semantic amber `oklch(78% 0.16 50)` and red
  `oklch(68% 0.20 30)` appear only inside data panels.
- **Typography.** Display, nav, buttons, labels, prices, and code are all Geist Mono (fallback
  `"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace`); body prose is Geist (fallback
  `"Inter", sans-serif`). H1 `clamp(2rem, 4.5vw, 3.75rem)` weight 500, line-height 1.05,
  letter-spacing -0.025em. Eyebrows/section heads: 0.75rem uppercase, letter-spacing 0.12em.
  Base body 0.9375rem, line-height 1.55.
- **Spacing.** rem-based scale from 0.25 to 9 (`--space-3xs` … `--space-4xl`). Sections separated
  by 1px hairline rules and 6.5rem vertical padding. Page max-width 80rem.
- **Panels.** Trace/pipeline cards are pure CSS: a 3-column grid (`14ch 1fr 6ch`) of label,
  8px-high bar, and tabular-nums time. Bars are absolute-positioned fills over the inset ground.
  Panel corners 6px, code blocks 4px; nothing rounder.
- **Workbench.** Two-column grid (1fr / 1.1fr): numbered steps on the left, a `position: sticky`
  pinned panel on the right. Each step has a 2px left border that fills with accent on hover
  (height 0 → 100%, 200ms). Steps pair prose (max 48ch) with a one-line `$` command block.
- **Motion.** 100-200ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`, color/border/height only. Respect
  `prefers-reduced-motion`.
- **Buttons.** Rectangular mono-font buttons, 1px border. Primary is solid accent with dark
  text; secondary is outline that turns accent on hover. Focus rings 2px accent, offset 3px.

## Anti-patterns

- Gradients, glassmorphism, glows, or drop shadows — the theme is flat panels and hairlines
- A second brand hue; amber/red exist only as semantic status colors inside data panels
- Sans-serif or serif display headlines; the mono display face is the identity
- Screenshots or stock imagery in the hero — the CSS-art pipeline panel is the product shot
- Radius above 6px, centered body copy, or marketing superlatives replacing concrete mechanics

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

Adapted from https://github.com/Nutlope/hallmark (MIT)
