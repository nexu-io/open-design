---
name: frontend-slides
en_name: "Write an AI-Workflow 101 like a Top Technology Explainer"
zh_name: "像顶级技术解释者一样写 AI 工作流 101"
description: |
  Open Design as a worked AI-workflow example: how local agents read your files and design on your desktop — concretely. Built as a decision-grade AI literacy deck for teams new to AI, leadership.
en_description: |
  Open Design as a worked AI-workflow example: how local agents read your files and design on your desktop — concretely. Built as a decision-grade AI literacy deck for teams new to AI, leadership.
zh_description: |
  像顶级技术解释者一样写 AI 工作流 101——一份可商业交付的AI 素养 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "ai-literacy"
  - "enterprise-ai-copilot-rollout-brief"
  - "ai"
  - "copilot"
  - "workflow"
  - "decision-deck"
  - "commercial-slide-agent"
  - "frontend-slides"
triggers:
  - "enterprise-ai-copilot-rollout-brief"
  - "ai-literacy"
  - "Write an AI-Workflow 101 like a Top Technology Explainer"
  - "像顶级技术解释者一样写 AI 工作流 101"
  - "ai"
  - "copilot"
  - "workflow"
  - "html deck"
  - "html slides"
od:
  mode: deck
  surface: web
  upstream: "https://github.com/zarazhangrui/frontend-slides"
  preview:
    type: html
    entry: example.html
  example_prompt_i18n:
    zh-CN: "用 Frontend Slides 把我的内容做成一套动画丰富的单文件 HTML 幻灯片：固定 1920×1080 舞台等比缩放、个性化字体排印、克制而坚定的配色、错峰入场动画、键盘导航和 hash 路由。从 example.html 出发只替换内容，保留设计系统。"
  category: "ai-literacy"
  scenario: "ai"
  example_prompt: "Create \"Write an AI-Workflow 101 like a Top Technology Explainer\" as a decision-grade AI literacy deck in this template's own visual system. Subject: Open Design as a worked AI-workflow example: how local agents read your files and design on your desktop — concretely. Audience: teams new to AI, leadership. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: does the deck make AI implementation concrete enough to fund."
---

# Frontend Slides

Zero-dependency, animation-rich HTML presentations that run entirely in the browser. Curated from the MIT-licensed [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides).

**Start from `example.html` in this plugin folder. It is the proven seed: copy its stage CSS, slide shell, and the entire `SlidePresentation` controller script verbatim, then replace slide content. Do not rewrite the stage system, the navigation script, or the design tokens architecture from scratch.**

## Hard spec (locked — every deck must satisfy all of these)

### Fixed 16:9 stage — NON-NEGOTIABLE

- Every deck is authored on a fixed **1920×1080** canvas: `.deck-viewport` (fills the window) wraps `.deck-stage` (1920×1080, `transform-origin: 0 0`).
- JavaScript scales the whole stage uniformly: `factor = min(innerWidth/1920, innerHeight/1080)`, then `translate(x, y) scale(factor)` to center with letterbox/pillarbox. Re-run on `resize`.
- Never reflow slide content per device. No responsive breakpoints inside slides. All slide measurements are fixed px at the 1920×1080 design size.
- Include the FULL contents of `references/viewport-base.css` in the `<style>` block (the seed already embeds it).

### Slide structure

- Each page is one `<section class="slide">` directly inside `.deck-stage`. Around 10 slides for a standard deck; split content into more slides rather than shrinking type.
- Slide switching uses `.active` / `.visible` classes toggling `visibility`, `opacity`, `pointer-events` — **never `display: none/block`** (layout classes like `display: flex` on children would override it and show every slide at once).
- No scrolling, no overflow, no overlapping panels, no text below comfortable reading size at 1920×1080.

### Navigation runtime (keep the seed's script)

- Keyboard: `←`/`→`, `↑`/`↓`, `Space`, `PageUp`/`PageDown`, `Home`/`End`.
- Hash routing: current slide mirrored to `#/<index>`; deep links and `hashchange` restore the slide.
- Mouse wheel (debounced ~650ms) and touch swipe (≥40px threshold).
- Page counter chrome lives in `.deck-controls`, fixed-positioned **outside** the scaled stage.

### Design tokens

- All colors, fonts, sizes, and easing live in `:root` CSS custom properties; retheme by editing tokens only.
- Typography: distinctive webfonts from Google Fonts or Fontshare — **never** Inter, Roboto, Arial, or system fonts as display type. Avoid `#6366f1` indigo and purple-gradient-on-white clichés.
- Pick one preset from `references/STYLE_PRESETS.md` (12 curated presets: Bold Signal, Electric Studio, Creative Voltage, Dark Botanical, Notebook Tabs, Pastel Geometry, Split Pastel, Vintage Editorial, Neon Cyber, Terminal Green, Swiss Modern, Paper & Ink) or design a custom system with the same discipline. The seed ships **Bold Signal**.

### Layout vocabulary (compose slides from these)

`title-card` (colored focal card), `agenda` (numbered editorial list), `section divider` (giant outlined number), `bullets` (icon + heading + support line, max 4-6), `big-stat` (oversized number + side note), `quote`, `two-column comparison`, `principle grid` (2×2 cards), `CSS bar chart` (scaleY-animated bars), `closing`. Keep the slide-number top-left, breadcrumb nav top-right, and baseline rule bottom — that chrome is the deck's signature.

### Motion

- Entrances via `.reveal` elements that transition when the slide gains `.visible`; stagger with `transition-delay` steps (~0.1s).
- One signature easing per deck (seed: `cubic-bezier(0.16, 1, 0.3, 1)`); animate only `transform` and `opacity`.
- `prefers-reduced-motion` support is mandatory (included in viewport-base.css).
- Match animation character to the content's feeling using `references/animation-patterns.md`.

### Density modes

Ask (or infer) whether the deck is speaker-led or reading-first:

- **Low density / speaker-led** — one idea per slide, large type, 1-3 bullets max, more slides.
- **High density / reading-first** — self-contained slides, structured grids/tables, 4-6 cards max, still no overflow.

### Output contract

- Single self-contained `.html` file: all CSS and JS inline, no build step, no external JS libraries, no CDN scripts.
- Icons are inline SVG. No remote images from slow CDNs; CSS-generated visuals (gradients, shapes, patterns) are a first-class path.
- Comment every section: `/* === SECTION NAME === */`.
- CSS gotcha: never negate CSS functions directly (`-clamp()` is silently ignored) — use `calc(-1 * clamp(...))`.

## References (read on demand)

| File | When |
| ---- | ---- |
| `references/STYLE_PRESETS.md` | Choosing the visual direction |
| `references/viewport-base.css` | Mandatory stage CSS — embed in full |
| `references/html-template.md` | Controller architecture, inline-editing pattern, image pipeline |
| `references/animation-patterns.md` | Matching effects to feeling |

## Attribution

Design system, fixed-stage model, presets, and workflow come from the upstream MIT-licensed [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides) (© 2025 Zara Zhang). The LICENSE file ships in this plugin folder; keep it in place when redistributing.
