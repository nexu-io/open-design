---
name: hps-y2k-chrome
en_name: "Write a KPI Decision Brief like a CFO-Ready Analytics Lead"
zh_name: "像能让 CFO 读懂的分析负责人一样写 KPI 决策简报"
description: |
  Open Design's KPI decision brief: activation and retention drivers, what's working, and the one metric to move next. Built as a decision-grade data & finance deck for CRO, RevOps, leadership.
en_description: |
  Open Design's KPI decision brief: activation and retention drivers, what's working, and the one metric to move next. Built as a decision-grade data & finance deck for CRO, RevOps, leadership.
zh_description: |
  像能让 CFO 读懂的分析负责人一样写 KPI 决策简报——一份可商业交付的数据财务 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "data-finance"
  - "product-analytics-deck"
  - "finance"
  - "kpi"
  - "metrics"
  - "decision-deck"
  - "commercial-slide-agent"
  - "hps-y2k-chrome"
triggers:
  - "product-analytics-deck"
  - "data-finance"
  - "Write a KPI Decision Brief like a CFO-Ready Analytics Lead"
  - "像能让 CFO 读懂的分析负责人一样写 KPI 决策简报"
  - "kpi"
  - "finance"
  - "metrics"
  - "html deck"
  - "html slides"
od:
  mode: deck
  surface: web
  upstream: "https://github.com/lewislulu/html-ppt-skill"
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  speaker_notes: true
  animations: true
  example_prompt_i18n:
    zh-CN: "用千禧银铬把我的内容做成单文件 HTML 幻灯片。先确认主题、观众和页数，然后从种子 example.html 出发——完整保留它的银铬 token 表、磨砂玻璃卡、slide 骨架和键盘运行时，只替换幻灯片内容，使用真实内容，不要 lorem ipsum。"
  category: "data-finance"
  scenario: "finance"
  example_prompt: "Create \"Write a KPI Decision Brief like a CFO-Ready Analytics Lead\" as a decision-grade Data, KPI & finance deck in this template's own visual system. Subject: Open Design's KPI decision brief: activation and retention drivers, what's working, and the one metric to move next. Audience: CRO, RevOps, leadership. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: does every chart have a decision above it."
---

# Y2K Chrome (hps-y2k-chrome)

Single-theme deck plugin locked to the `y2k-chrome` theme from the upstream
MIT-licensed [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)
(36 themes × 31 layouts × 27 animations — this plugin ships exactly one of
those skins, fully baked into one self-contained seed: `example.html`).

**Start from `example.html`. Replace content only. Never rewrite the design
system or the runtime script. No colors or fonts outside this spec.**

## Locked token sheet (`:root` — do not add, remove, or recolor)

```css
:root{
  --bg:#dfe4ec;            --bg-soft:#eef1f6;
  --surface:rgba(255,255,255,.72);   --surface-2:rgba(255,255,255,.5);
  --border:rgba(120,135,170,.32);    --border-strong:rgba(80,100,140,.55);
  --text-1:#1a1f2e;        --text-2:#4a536a;       --text-3:#8590a6;
  --accent:#8a5cff;        --accent-2:#3ccfd8;     --accent-3:#ff84c4;
  --good:#1fb98c;          --warn:#e8a13d;         --bad:#e0445a;
  --grad:linear-gradient(135deg,#b8c4d8 0%,#f5f7fb 30%,#8a9ab8 55%,#e8ecf4 80%,#6b7a95 100%);
  --grad-soft:linear-gradient(135deg,#c9e4ff,#f5d6ff 50%,#d6fffa);
  --chrome-text:linear-gradient(180deg,#f8faff 0%,#9aa8c4 50%,#4a5670 100%);
  --radius:26px;           --radius-sm:16px;       --radius-lg:36px;
  --shadow:0 12px 30px rgba(70,90,130,.22),inset 0 1px 0 rgba(255,255,255,.9),inset 0 -1px 0 rgba(80,100,140,.2);
  --shadow-lg:0 24px 60px rgba(70,90,130,.35),inset 0 2px 0 rgba(255,255,255,.95);
  --font-sans:'Space Grotesk','Inter','Noto Sans SC',sans-serif;
  --font-display:'Space Grotesk','Inter',sans-serif;
  --font-mono:'JetBrains Mono',SFMono-Regular,Menlo,monospace;
  --letter-tight:-.03em;   --letter-normal:-.01em;
  --ease:cubic-bezier(.4,0,.2,1);
}
```

Fonts: **Space Grotesk** is both display and body type (`'Noto Sans SC'`
fallback for CJK), JetBrains Mono for code/labels. Loaded via Google Fonts
`@import` only — the sole permitted external resource.

## Signature devices (use these, nothing else)

1. **Silver-metal canvas** — `body` carries the full-bleed 5-stop gradient
   `linear-gradient(135deg,#c4cfe0 0%,#f0f3f8 25%,#aab8d0 50%,#f5f7fb 75%,#b8c4d8 100%)`.
   Every slide is transparent over it. Never paint an opaque slide background.
2. **Chrome-clipped type** — `.h1`, `.chrome-text`, `.stat-big` clip
   `--chrome-text` (white→steel→gunmetal) via `background-clip:text`, plus
   `filter:drop-shadow(0 2px 3px rgba(40,55,85,.38))` so the white top stop
   keeps letter definition over the light canvas. Display numerals and hero
   words are always chrome, never flat color.
3. **Frosted-glass cards** — `.card` = `--surface` (72% white) +
   `backdrop-filter:blur(16px) saturate(140%)` + `--shadow`. The
   `inset 0 1px 0 rgba(255,255,255,.9)` top highlight is the signature —
   never drop it. Mega radius `--radius:26px` (lg surfaces 36px).
4. **Candy accents** — purple `--accent` leads (kickers, progress bar,
   checks), aqua `--accent-2` and pink `--accent-3` support (orbs, chart
   bars, eyebrow tints). Accents are for small surfaces only; large fills
   use `--grad` / `--grad-soft`.
5. **Glossy orbs** — `.orb` radial-gradient candy spheres with a white
   specular highlight, absolutely positioned, `z-index:0`, decor only.
6. **Chrome sparkles** — inline 4-point star SVGs (`.sparkle`) filled with
   the chrome gradient or candy accents.
7. **Chrome capsule pills** — `.pill` = `linear-gradient(180deg,#fff,#d4dcec)`
   with `--border` stroke; `.pill-accent` tints with `--accent`.

Forbidden: dark mode, neon-on-black, hard offset shadows, flat untextured
H1 color, any hex value or font family not listed above.

## Page structure & runtime (keep verbatim from the seed)

- One self-contained HTML file: inline `<style>` + inline `<script>`,
  zero build, zero external JS. Charts are pure CSS / inline SVG —
  never Chart.js or mermaid. Icons are inline SVG. No external images.
- Every page is `<section class="slide" data-title="…">` inside
  `<div class="deck" id="deck">` — a horizontal scroll-snap strip, one
  `100vw × 100vh` screen per slide, padding `72px 96px`, no internal
  scrolling.
- Fixed chrome: `.deck-header` (deck name + `y2k-chrome` theme chip),
  `.deck-footer` (attribution + `N / total` counter), `.progress-bar`
  (accent fill).
- Keyboard runtime: `←` `→` `Space` `PageUp` `PageDown` `Home` `End`
  navigate; `#/N` (1-based) hash deep-links with `history.replaceState`
  in try/catch (srcdoc-safe). The script dedupes the dual window/document
  capture-phase key listeners by Event identity and auto-focuses `<body>`
  so keys work without a click — these solve real iframe-host bugs, do
  not "simplify" them away. This variant is theme-locked: no `T` cycling.
- Speaker notes: one hidden `<div class="notes">…</div>` per slide.

## Layout masters (upstream 31-layout catalog)

| group | layouts |
|---|---|
| Openers & transitions | `cover` `toc` `section-divider` |
| Text-centric | `bullets` `two-column` `three-column` `big-quote` |
| Numbers & data | `stat-highlight` `kpi-grid` `table` `chart-bar` `chart-line` `chart-pie` `chart-radar` |
| Code & terminal | `code` `diff` `terminal` |
| Diagrams & flows | `flow-diagram` `arch-diagram` `process-steps` `mindmap` |
| Plans & comparisons | `timeline` `roadmap` `gantt` `comparison` `pros-cons` `todo-checklist` |
| Visuals | `image-hero` `image-grid` |
| Closers | `cta` `thanks` |

Composition default: `cover` → `toc` → (`section-divider` → 2–4 content
pages) × N → `cta`/`thanks`. The seed demonstrates 11 masters: cover, toc,
section-divider, two-column, kpi-grid, stat-highlight, chart-bar,
process-steps, comparison, big-quote, thanks.

Class vocabulary (replace content, not classes):
typography `.eyebrow .kicker .h1 .h2 .h3 .h4 .lede .dim .dim2 .mono .chrome-text .gradient-text`;
layout `.row .row.wrap .grid .g2 .g3 .g4 .center .mt-s/.mt-m/.mt-l`;
components `.card .card-soft .card-accent .pill .pill-accent .divider-accent .section-num .kpi .stat-big .bar-chart .steps .quote .check .orb .sparkle`.

Animations (upstream subset inlined in the seed): `anim-rise-in`,
`anim-fade-up`, `anim-stagger-list`. Restraint rule: at most one hero
animation plus one stagger per slide.

## Authoring checklist

1. Copy `example.html`; keep all `<style>` blocks and the `<script>` verbatim.
2. Replace the 11 demo slides with the planned layout sequence; the script
   computes the `N / total` counter automatically.
3. Real content, real numbers — no lorem ipsum, no placeholder images.
4. Write 1–3 sentence speaker notes per slide in `.notes`.
5. Verify: arrows + Space navigate, `#/5` deep-links, every H1 reads as
   chrome over the metal canvas, no slide overflows vertically.

## Attribution

Visual system, token vocabulary, layout taxonomy, and the y2k-chrome palette
come from the upstream MIT-licensed
[`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)
(© lewis &lt;sudolewis@gmail.com&gt;). The LICENSE file ships alongside this
plugin — keep it in place when redistributing.
