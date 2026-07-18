---
name: hps-bauhaus
en_name: "Teach Design Fundamentals like a World-Class Studio Mentor"
zh_name: "像世界级工作室导师一样教设计基础"
description: |
  A visual-design fundamentals course for new brand designers — grid, type, color, and the exercises that build the eye. Built as a decision-grade professional training deck for junior designers, new hires.
en_description: |
  A visual-design fundamentals course for new brand designers — grid, type, color, and the exercises that build the eye. Built as a decision-grade professional training deck for junior designers, new hires.
zh_description: |
  像世界级工作室导师一样教设计基础——一份可商业交付的培训交付 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "professional-training"
  - "employee-onboarding-deck"
  - "education"
  - "training-deck"
  - "workshop"
  - "course-module"
  - "decision-deck"
  - "commercial-slide-agent"
  - "hps-bauhaus"
triggers:
  - "employee-onboarding-deck"
  - "professional-training"
  - "Teach Design Fundamentals like a World-Class Studio Mentor"
  - "像世界级工作室导师一样教设计基础"
  - "training-deck"
  - "workshop"
  - "course-module"
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
    zh-CN: "用「包豪斯三原色」把我的内容做成单文件 HTML 幻灯片。先确认主题、观众和页数，然后从种子 example.html 出发——完整保留 token 表、slide 骨架和键盘运行时，只替换幻灯片内容，严格停留在红黄蓝三原色 + 墨色 + 做旧画布的色域内。"
  category: "professional-training"
  scenario: "education"
  example_prompt: "Create \"Teach Design Fundamentals like a World-Class Studio Mentor\" as a decision-grade Professional training deck in this template's own visual system. Subject: A visual-design fundamentals course for new brand designers — grid, type, color, and the exercises that build the eye. Audience: junior designers, new hires. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: can a learner perform the target task the next day."
---

# Bauhaus Primary (hps-bauhaus)

Single-theme deck plugin ported from the `bauhaus` theme of the upstream
MIT-licensed [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)
(36 themes × 31 layouts × 27 animations). This plugin locks one skin:
design-history geometric modernism — the 1919–1933 Dessau language of
square/triangle/circle, the three primaries on an aged paper ground, and
typography that behaves like a poster.

**Start from `example.html`. Replace content only. Never rewrite the design
system or the runtime script. Never introduce a color or font outside the
token sheet below.**

## Locked token sheet (`:root`, do not deviate)

```css
:root{
  --bg:#f4efe3;            /* aged canvas ground */
  --bg-soft:#e8e2d1;       /* darker canvas */
  --surface:#ffffff;       /* card paper */
  --surface-2:#f4efe3;
  --border:#111111;        /* ink — every stroke is this */
  --border-strong:#111111;
  --text-1:#111111; --text-2:#333333; --text-3:#666666;
  --accent:#e03c27;        /* Rot — red */
  --accent-2:#f4c430;      /* Gelb — yellow */
  --accent-3:#1d4eaf;      /* Blau — blue */
  --good:#1b8c3c; --warn:#f4c430; --bad:#e03c27;
  --grad:linear-gradient(135deg,#e03c27 0 33%,#f4c430 33% 66%,#1d4eaf 66% 100%);
  --grad-soft:linear-gradient(135deg,#f4efe3,#e8e2d1);
  --radius:0; --radius-sm:0; --radius-lg:0;          /* zero radius, always */
  --shadow:4px 4px 0 #111; --shadow-lg:8px 8px 0 #111; /* hard offset, never blurred */
  --font-sans:'Space Grotesk','Inter','Noto Sans SC',sans-serif;
  --font-mono:'JetBrains Mono',SFMono-Regular,Menlo,monospace;
  --font-display:'Archivo Black','Space Grotesk','Noto Sans SC',sans-serif;
  --letter-tight:-.03em; --letter-normal:-.01em;
  --ease:cubic-bezier(.4,0,.2,1);
}
```

Hard rules derived from the sheet:

- The three-band gradient (`--grad`) has **hard stops** — it is a flag, not a
  blend. Use it only on `.gradient-text` hero words, `.tri-band`, and
  `.divider-accent`. Never use soft multi-stop gradients.
- All chrome is ink: `2px solid #111` borders on cards, pills, chart bars,
  checkboxes; `3px` strokes inside SVG.
- Shadows are hard offsets (`4px 4px 0 #111`, `8px 8px 0 #111`). Blurred
  `rgba` drop shadows are forbidden.
- `border-radius` is `0` on every element except the geometric circle device
  (`border-radius:50%`).

## Typography

- **Display** (`.h1 .h2 .stat-big .quote .section-num .kpi .num`):
  `Archivo Black`, weight 400 (the face is already black — never fake-bold),
  uppercase, letter-spacing `-.03em`.
- **Body** (`.lede`, card copy, lists): `Space Grotesk`, weights 300–700.
- **Mono** (step counters, theme chip, code): `JetBrains Mono`.
- No serif, no slab, no handwriting, no brush — those belong to sibling
  themes (`editorial-serif`, `peoples-platform`), not this one.
- Google Fonts via `@import` is the only allowed remote resource.

## Signature devices (keep these; they are the style)

- **Kandinsky mark**: inline SVG of red square + yellow triangle + blue
  circle, 3px ink strokes — on the cover and the closer.
- **Outlined section numerals**: `.section-num` rendered stroke-only via
  `-webkit-text-stroke:3px var(--text-1)` with transparent fill.
- **Primary top rules**: `.card-accent / .card-accent-2 / .card-accent-3`
  give cards an 8px red/yellow/blue top border; rotate the three primaries
  across a grid rather than repeating one.
- **Tri-band**: `.tri-band` and `.divider-accent` are ink-bordered strips of
  the hard three-band gradient.
- **Square checkboxes**: `.check li::before` is a yellow ink-bordered square
  with an ink check stroke.
- **Geo strip**: `.geo-square / .geo-triangle / .geo-circle` repeat the
  square/triangle/circle motif as a footer ornament.

## Layout system (shared upstream catalog, 31 layouts)

The slide scaffold and class vocabulary come from the upstream html-ppt
system. Master categories (compose `cover → toc → section-divider → content
pages → closer`):

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

The seed demonstrates 10 of them: cover, toc, section-divider, two-column,
kpi-grid, stat-highlight, chart-bar, process-steps, big-quote, thanks.
Charts are always pure CSS blocks or inline SVG with primary fills and ink
strokes — never Chart.js or any external library. "Images" are geometric
SVG compositions; no photos, no external image hosts.

## Page structure & runtime contract

- One self-contained HTML file: inline `<style>` + inline `<script>`, zero
  build, zero external JS/CSS (Google Fonts `@import` excepted).
- Every page is `<section class="slide" data-title="...">` inside
  `<div class="deck" id="deck">` — a horizontal scroll-snap strip, each
  slide exactly `100vw × 100vh` (`flex:0 0 100vw`), 16:9 / 1280×720
  baseline with `clamp()` type scales, padding `72px 96px`. One screen per
  slide; no internal vertical scrolling.
- Fixed chrome: `.deck-header` (deck name + theme chip), `.deck-footer`
  (attribution + `N / total` counter), `.progress-bar` (ink-topped red fill).
- Keyboard: `←` `→` `Space` `PageUp` `PageDown` `Home` `End` navigate;
  `#/N` (1-based) hash deep-links via `history.replaceState` in try/catch
  (srcdoc-safe). The script dedupes dual window/document capture-phase key
  listeners by Event identity and auto-focuses `<body>` — these solve real
  iframe-host bugs; keep the script verbatim.
- Speaker notes: one hidden `<div class="notes">…</div>` per slide, 1–3
  sentences.
- Animations: restrained upstream subset — `anim-rise-in` on the hero,
  `anim-fade-up` on quotes, `anim-stagger-list` on grids. At most one hero
  animation plus one stagger per slide.

## Authoring checklist

1. Copy `example.html`; keep all `<style>` blocks and the `<script>`
   verbatim.
2. Replace the 10 demo slides with the planned layout sequence; the script
   recomputes the `N / total` counter automatically.
3. Real content, real numbers — no lorem ipsum, no placeholder images.
4. Rotate the three primaries deliberately (red = emphasis, yellow = warm
   support, blue = structure); large areas stay canvas + ink.
5. Verify: arrows + Space navigate, `#/5` deep-links, no slide overflows
   vertically, every stroke is #111, every radius is 0.

## Attribution

Token vocabulary, layout taxonomy, slide scaffold, and the bauhaus palette
come from the upstream MIT-licensed
[`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)
(© lewis &lt;sudolewis@gmail.com&gt;). The LICENSE file ships alongside this
plugin — keep it in place when redistributing.
