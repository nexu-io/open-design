---
name: "huashu-ios-tiled-prototype"
en_name: "iOS Tiled Prototype"
zh_name: "iOS 多屏平铺原型"
description: "iOS app prototype as a tiled overview: 4-6 iPhone frames side by side, each a primary screen with an italic label, high product-information density, serif display plus one warm accent."
zh_description: "iOS 原型平铺总览：4 到 6 个 iPhone 框并排，每个是一个主屏并带斜体标签，高信息密度，衬线展示字加一个暖色强调。"
triggers:
  - "ios prototype"
  - "multiple screens"
  - "app screens side by side"
  - "iphone mockup set"
  - "app flow overview"
  - "iOS 原型"
  - "多屏"
  - "多个页面并排"
  - "app 流程图"
  - "iPhone 多屏"
od:
  mode: "prototype"
  task_type: "prototype"
  surface: "web"
  platform: "mobile"
  scenario: "product"
  category: "mobile-app"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Prototype a focus-timer iOS app as 4 iPhone screens side by side: today view, live session, insights, settings."
---
# iOS Tiled Prototype

The default delivery shape for a mobile-app prototype: instead of one lonely phone or a
slide deck, tile the 4-6 primary screens as iPhone frames side by side on a warm paper
stage. The whole product is visible at a glance; each screen still reads as a real,
dense, believable UI.

## When to use

- "Make an app prototype / iOS mockup / mobile app" briefs
- Product overviews for founders, investors, or design reviews
- AI/data products whose intelligence must be visible on every screen
- Comparing primary screens of a flow (home, action, analytics, settings)

## Style rules

- Stage: warm paper background (`#F4F1EC`), one heading row (serif app name + one-line
  positioning), then phones in a flex row with ~28px gaps, wrapping if needed.
- Each phone gets an italic serif label above it naming the screen and its job
  ("Today · plan & task queue"), 13-14px, muted color.
- iPhone frame: black shell with ~44px outer radius, 7px bezel, Dynamic Island pill
  centered at top, status bar (time left, signal + battery right), home indicator bar at
  bottom. Never let content collide with the island; keep frame proportions ~272x588
  when tiling four across a 1280 stage.
- Taste anchors: serif display font (Newsreader / Source Serif) for headings and quotes,
  `-apple-system`/Inter for UI; ONE warm accent (rust `#B4552D` family) carried across
  every screen: tab highlights, rings, toggles, chart bars.
- Information density: for AI/data products, every screen shows at least 3 pieces of
  non-decorative product intelligence (inferred context, deflected notifications,
  estimate accuracy, auto-scheduling notes). No screen is just a button and a clock.
- Vary screen temperature: at least one dark immersive screen (e.g. live session) among
  the light ones, sharing the same accent.
- Interactive elements (tabs, toggles, cards) get `cursor: pointer` and visible states
  even in a static preview.

## Anti-patterns

- A single centered phone with acres of empty stage; always show the tiled overview.
- Hand-rolled sloppy Dynamic Island / status bar that collides with content.
- Lorem ipsum or "Task 1 / Task 2" filler; every string must sound like a real product.
- Multi-color accent chaos; one warm accent, everywhere.
- Decorative stock imagery pasted into screens that would lose nothing without it.

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

Adapted from https://github.com/alchaincyf/huashu-design (MIT)
