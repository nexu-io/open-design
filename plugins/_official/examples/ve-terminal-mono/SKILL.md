---
name: ve-terminal-mono
en_name: "Teach an AI CLI Workflow like a Developer-Tools Educator"
zh_name: "像开发者工具讲师一样教 AI CLI 工作流"
description: |
  Open Design from the CLI: driving the full design workflow with the `od` command — scripted, composable, agent-ready. Built as a decision-grade AI literacy deck for developers, power users.
en_description: |
  Open Design from the CLI: driving the full design workflow with the `od` command — scripted, composable, agent-ready. Built as a decision-grade AI literacy deck for developers, power users.
zh_description: |
  像开发者工具讲师一样教 AI CLI 工作流——一份可商业交付的AI 素养 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "ai-literacy"
  - "enterprise-ai-copilot-rollout-brief"
  - "ai"
  - "copilot"
  - "workflow"
  - "decision-deck"
  - "commercial-slide-agent"
  - "ve-terminal-mono"
triggers:
  - "enterprise-ai-copilot-rollout-brief"
  - "ai-literacy"
  - "Teach an AI CLI Workflow like a Developer-Tools Educator"
  - "像开发者工具讲师一样教 AI CLI 工作流"
  - "ai"
  - "copilot"
  - "workflow"
  - "html deck"
  - "html slides"
od:
  mode: deck
  surface: web
  upstream: "https://github.com/nicobailon/visual-explainer"
  preview:
    type: html
    entry: example.html
  example_prompt_i18n:
    zh-CN: "用「等宽终端 Terminal Mono」主题把我的内容做成开发者原生的单文件 HTML 幻灯片：近黑 #0a0e14 底色、全 Geist Mono 等宽排印（标题用大号 weight-400 而非粗体）、Dracula 绿 #50fa7b 点缀、微点阵背景、低透明度绿色描边，scroll-snap 翻页 + SlideEngine 键盘导航 + hash 路由，prefers-color-scheme 自动亮色模式。从 example.html 出发只替换内容，保留设计系统。"
  category: "ai-literacy"
  scenario: "ai"
  example_prompt: "Create \"Teach an AI CLI Workflow like a Developer-Tools Educator\" as a decision-grade AI literacy deck in this template's own visual system. Subject: Open Design from the CLI: driving the full design workflow with the `od` command — scripted, composable, agent-ready. Audience: developers, power users. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: does the deck make AI implementation concrete enough to fund."
---

# Terminal Mono（等宽终端）

A locked, single-theme deck plugin derived from the MIT-licensed
[nicobailon/visual-explainer](https://github.com/nicobailon/visual-explainer)
slide-deck template, restyled with the **Terminal Mono** aesthetic from its
`references/slide-patterns.md`. Developer-native and typographically strict:
near-black ground, monospace everything, one green voice, a faint dot grid.

**Zero skeuomorphism, zero effects.** No `$` prompts, no red/yellow/green
window chrome, no CRT scanlines, no vignettes, no glows. This theme stands on
typographic discipline and the dot-grid texture alone. (The skeuomorphic
"terminal theater" look belongs to a different plugin — do not drift there.)

**Start from `example.html` in this plugin folder. It is the proven seed: copy
its `:root` tokens (both themes), deck/slide CSS, dot-grid treatment, and the
entire SlideEngine script verbatim, then replace only the slide content. Do not
rewrite the design system, and do not introduce any color or font outside this
spec.**

## Design tokens (locked — list verbatim in `:root`)

Dark is the default theme; light mode switches automatically via
`prefers-color-scheme: light`. **Both blocks are part of the locked spec** —
dual-theme support is the visual-explainer family signature and must ship in
every deck.

```css
:root {
  --font-body: 'Geist Mono', 'SF Mono', Consolas, monospace;
  --font-mono: 'Geist Mono', 'SF Mono', Consolas, monospace;
  --bg: #0a0e14;                         /* near-black ground */
  --surface: #12161e;
  --surface2: #1a1f2a;
  --surface-elevated: #222836;
  --border: rgba(80, 250, 123, 0.06);    /* low-opacity green hairline */
  --border-bright: rgba(80, 250, 123, 0.12);
  --text: #c8d6e5;
  --text-dim: #7d8c9b;                   /* AA on --bg for body text */
  --accent: #50fa7b;                     /* Dracula green — the only voice */
  --accent-dim: rgba(80, 250, 123, 0.08);
  --code-bg: #060a10;
  --code-text: #c8d6e5;
  --dot: rgba(80, 250, 123, 0.05);       /* dot-grid ink */
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #f4f6f8;
    --surface: #ffffff;
    --surface2: #eaecf0;
    --surface-elevated: #f8f9fa;
    --border: rgba(0, 80, 40, 0.08);
    --border-bright: rgba(0, 80, 40, 0.16);
    --text: #1a2332;
    --text-dim: #5a6a7a;
    --accent: #0d7a3e;                   /* deep green for light ground */
    --accent-dim: rgba(13, 122, 62, 0.08);
    --code-bg: #1a2332;                  /* code blocks stay dark in light mode */
    --code-text: #c8d6e5;
    --dot: rgba(13, 122, 62, 0.07);
  }
}
```

## Typography (locked)

- **One typeface for everything**: Geist Mono 400/500/600/700 from Google
  Fonts (`https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600;700&display=swap`).
  Fallback stack `'SF Mono', Consolas, monospace`. No second typeface, ever.
- **Titles are large weight-400 mono, never bold display.** Display
  `clamp(36px, 7vw, 88px)` weight 400 letter-spacing -2px; headings
  `clamp(24px, 4vw, 42px)` weight 400 letter-spacing -1px.
- Labels/eyebrows: 10-13px, weight 600, uppercase, letter-spacing 1.5-2px,
  accent color. Subtitles: uppercase mono in `--text-dim`.
- Body and bullets: 15-20px, line-height ~1.6, `--text-dim`.
- Numbers use `font-variant-numeric: tabular-nums`.

## Signature devices (locked)

- **Dot grid on every slide**:
  `background-image: radial-gradient(var(--dot) 1px, transparent 1px); background-size: 24px 24px;`
  This replaces the radial accent glows other family themes use — no glows here.
- **Hairlines, not shadows**: 1px borders in `--border` / `--border-bright`.
  No box-shadows, no blurs (except the nav-dots backdrop blur from the seed).
- **Square geometry**: border-radius 0-2px everywhere; bullet ticks are 7px
  squares in `--accent` (no round dots); deck dots are squares.
- **Corner bracket decor** (title/closing slides only): two 1.5px accent
  lines at ~0.25 opacity forming an L in a corner, as inline SVG.
- Section divider numbers: giant mono numerals (up to 260px), weight 400,
  accent color at 0.05 opacity, centered behind the heading.

## Deck engine & navigation (keep verbatim from the seed)

- `.deck` is a `100dvh` scroll-snap container; each page is one
  `<section class="slide">` (also `100dvh`, `scroll-snap-align: start`).
- SlideEngine (plain JS, no dependencies) builds the chrome: 2px accent
  progress bar, square dot rail (right, backdrop-blurred), `n / N` counter,
  fading hints. Keyboard `←`/`→`, `↑`/`↓`, `Space`, `PageUp`/`PageDown`,
  `Home`/`End`; touch swipe (50px threshold); IntersectionObserver toggles
  `.visible` for entrance reveals.
- **Hash routing**: current slide mirrored to `#/<n>` via
  `history.replaceState`; deep links restore on load and `hashchange`.
- Reveals: `.reveal` children stagger in at 0.1s steps when the slide gains
  `.visible`; animate only opacity/transform; `prefers-reduced-motion`
  disables all of it.

## Layout masters (all present in example.html — compose from these)

1. **Title** — centered; corner brackets; uppercase eyebrow, accent display
   title, uppercase sub-line.
2. **Section divider** — giant ghost numeral behind heading + subtitle.
3. **Content** — 3fr/2fr grid: label + heading + square-tick bullets left,
   restrained line-art SVG aside right (1px strokes, accent, low opacity).
4. **Split before/after** — two full-height panels (`--surface` /
   `--surface2`), 1px `--border-bright` divider; "before" label in
   `--text-dim`, "after" label in `--accent`.
5. **Diagram** — pure CSS/SVG pipeline: `.pipe-node` boxes (1px hairline,
   mono name + uppercase meta) joined by 1px connector lines with CSS-triangle
   arrowheads and tiny uppercase edge labels; accent-bordered nodes mark
   emphasis; legend row below. **Never mermaid, never any external JS.**
6. **Dashboard** — KPI card grid: big tabular-nums value (accent or text),
   uppercase label, dim trend line.
7. **Table** — hairline-framed table; uppercase mono headers on `--surface2`,
   zebra rows, accent-tint hover, inline `code` chips in `--accent-dim`.
8. **Code** — `--code-bg` block with accent filename tab; `.hl` accent and
   `.cm` dim spans for highlighting (code stays dark in both themes).
9. **Quote** — centered; an oversized `>` glyph in accent at 0.08 opacity as
   the quote mark (no curly serif quotes), upright mono blockquote, uppercase
   cite.
10. **Closing** — left-aligned display heading with one accent `<em>` word,
    top hairline, corner bracket, uppercase next-steps sub-line.

## Hard rules

- Single self-contained HTML file: all CSS and JS inline; only the Google
  Fonts stylesheet may be external. No Chart.js, no mermaid, no CDN scripts,
  no remote images; icons and diagram art are inline SVG or pure CSS.
- Default 8-11 slides for a standard deck; honor the requested slide count
  when the user picks one. Split content into more slides instead of
  shrinking type or letting a slide scroll.
- Only the spec colors: the two greens (`#50fa7b` dark / `#0d7a3e` light),
  the listed surfaces and text tones. No red/blue/yellow semantic colors —
  express "before/risk/off" with `--text-dim` and "after/win/on" with
  `--accent`.
- Only Geist Mono. Bold weights (600/700) are reserved for labels and small
  emphasis, never for titles.
- Keep both theme token blocks; never hard-code a themed color where a token
  exists.
- Start from `example.html`; replace content only — never redesign the theme.
