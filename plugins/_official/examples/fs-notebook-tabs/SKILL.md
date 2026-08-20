---
name: fs-notebook-tabs
en_name: "Defend a CS Capstone like a Top Thesis Advisor"
zh_name: "像顶级导师一样答辩计算机毕业项目"
description: |
  A computer-science capstone: an on-device ML keyboard that predicts next words privately — problem, method, evaluation, and defense answers. Built as a decision-grade coursework defense deck for professor, defense committee.
en_description: |
  A computer-science capstone: an on-device ML keyboard that predicts next words privately — problem, method, evaluation, and defense answers. Built as a decision-grade coursework defense deck for professor, defense committee.
zh_description: |
  像顶级导师一样答辩计算机毕业项目——一份可商业交付的课业答辩 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "student-coursework"
  - "senior-capstone-defense-deck"
  - "education"
  - "coursework"
  - "defense"
  - "academic"
  - "decision-deck"
  - "commercial-slide-agent"
  - "fs-notebook-tabs"
triggers:
  - "senior-capstone-defense-deck"
  - "student-coursework"
  - "Defend a CS Capstone like a Top Thesis Advisor"
  - "像顶级导师一样答辩计算机毕业项目"
  - "coursework"
  - "defense"
  - "academic"
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
    zh-CN: "用「索引笔记本」把我的内容做成单文件 HTML 幻灯片：深底之上的奶油纸卡、右缘薄荷/薰衣草/粉/天蓝竖向索引标签、左侧活页装订孔，Bodoni Moda 标题 + DM Sans 正文。从 example.html 出发只替换内容，所有设计 token 保持不变。"
  category: "student-coursework"
  scenario: "education"
  example_prompt: "Create \"Defend a CS Capstone like a Top Thesis Advisor\" as a decision-grade Student coursework deck in this template's own visual system. Subject: A computer-science capstone: an on-device ML keyboard that predicts next words privately — problem, method, evaluation, and defense answers. Audience: professor, defense committee. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: can a reviewer find the contribution, evidence, and limitation in under 90 seconds."
---

# Notebook Tabs (索引笔记本)

A theme-locked deck plugin derived from the MIT-licensed [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides) "Notebook Tabs" style preset (STYLE_PRESETS.md section 5). The whole deck reads as one physical, editorially typeset notebook: every slide is a cream paper page floating on a dark desk, with a colorful tab index on the right fore-edge and binder holes on the left.

**Start from `example.html` in this plugin folder. It is the proven seed: keep its stage CSS, the paper/holes/tabs device, the `:root` token block, and the entire `SlidePresentation` controller script verbatim — replace only the slide content. Do not redesign, do not introduce any color or font outside this spec.**

## Fixed 16:9 stage (locked scaling system)

- Every deck is authored on a fixed **1920×1080** canvas: `.deck-viewport` (fills the window) wraps `.deck-stage` (1920×1080, `transform-origin: 0 0`).
- JavaScript scales the whole stage uniformly: `factor = min(innerWidth/1920, innerHeight/1080)`, then `translate(x, y) scale(factor)` to center with letterbox/pillarbox; re-run on `resize`. This is the viewport-base.css system — the full file is already inlined in the seed.
- Never reflow slide content per device. No responsive breakpoints inside slides. All measurements are fixed px at the 1920×1080 design size (the upstream preset's `clamp()` tab sizing is superseded by stage scaling — use fixed px).
- Slide switching toggles `.active`/`.visible` (visibility/opacity/pointer-events) — never `display: none`.
- Keyboard (`←`/`→`/`↑`/`↓`/Space/PageUp/PageDown/Home/End), debounced wheel (~650ms), touch swipe (≥40px), and `#/<index>` hash routing with deep-link restore. The page counter lives in `.deck-controls`, fixed-positioned outside the scaled stage.

## Design tokens (locked — reproduce exactly, never substitute)

```css
:root {
    /* Colors */
    --bg-outer: #2d2d2d;          /* dark desk behind the notebook */
    --bg-page: #f8f6f1;           /* cream paper */
    --text-primary: #1a1a1a;
    --text-secondary: #6b6358;
    --rule: #d8d2c4;              /* hairline rules on paper */
    --tab-1: #98d4bb;             /* Mint */
    --tab-2: #c7b8ea;             /* Lavender */
    --tab-3: #f4b8c5;             /* Pink */
    --tab-4: #a8d8ea;             /* Sky */
    --tab-5: #ffe6a7;             /* Cream */
    --stage-bg: var(--bg-outer);
    --slide-bg: var(--bg-outer);

    /* Typography */
    --font-display: 'Bodoni Moda', 'Didot', serif;   /* 400/700 + italic */
    --font-body: 'DM Sans', 'Helvetica Neue', sans-serif;  /* 400/500/700 */
    --title-size: 150px;
    --h2-size: 84px;
    --subtitle-size: 30px;
    --body-size: 26px;
    --label-size: 17px;

    /* Paper geometry inside the 1920×1080 stage */
    --paper-top: 56px;
    --paper-bottom: 56px;
    --paper-left: 120px;
    --paper-right: 150px;        /* leaves room for the protruding tabs */
    --paper-pad-x: 110px;
    --paper-pad-y: 78px;

    /* Motion */
    --ease-page: cubic-bezier(0.16, 1, 0.3, 1);   /* the one signature easing */
    --duration-normal: 0.7s;
}
```

Fonts load via one Google Fonts `@import` (`Bodoni Moda` ital,wght 0,400/0,700/1,400 + `DM Sans` 400/500/700). **Forbidden:** any other font, Inter/Roboto/Arial/system display fonts, any color outside the tokens above, gradients as decoration, indigo `#6366f1`, dark-glassmorphism panels.

## Signature devices (every slide carries all of them)

1. **Paper card** `.paper` — absolutely positioned by the `--paper-*` insets, `border-radius: 8px`, layered shadow (`0 2px 4px` + `0 18px 50px` dark drops + a 1px inner white highlight), faint 44px-pitch ruled-line grain via a layered `linear-gradient`, `z-index: 1`.
2. **Binder holes** `.holes` — a left-margin flex column of 10 punched circles (26px, `background: var(--bg-outer)`, inset dark shadow + 1px white bottom highlight), inside the paper at `left: 38px`.
3. **Margin rule** `.margin-rule` — a 1px vertical line at `left: 92px` in `var(--tab-3)` at 0.55 opacity, echoing a real notebook's red margin line.
4. **Index tabs** `.tabs` — a vertical column of 5 tabs on the right fore-edge, `writing-mode: vertical-rl`, DM Sans 700 uppercase letter-spaced, 56×158px, `border-radius: 0 10px 10px 0`, colored `--tab-1`…`--tab-5` in order. The column is positioned against the stage (`right: calc(--paper-right - 44px)`) at `z-index: 0` so 12px of each tab root tucks *under* the paper. The current section's tab gets `.on` (full opacity, `translateX(0)`, stronger shadow); inactive tabs sit at 0.82 opacity, `translateX(-6px)`. Tab labels name the deck's sections (seed: Intro / Craft / Numbers / Plan / End) — rename to the actual sections, keep the color order.
5. **Page chrome** — `.runhead` top ("No. NN" + running title, uppercase DM Sans, hairline bottom border) and `.baseline` bottom (section name + "NN / total", hairline top border). Keep both on every slide.

## Layout vocabulary (compose every deck from these masters)

`cover` (kicker with color chip + giant Bodoni display with one italic word + swatch row), `contents` (index rows: color chip + roman numeral + dotted leaders + page no.), `section divider` (430px outline-stroke Bodoni numeral + color bar + h2), `bullets` (max 3 points: colored circular pin with inline-SVG icon + Bodoni h3 + DM Sans support line), `quote` (lavender 220px quote mark + Bodoni italic 66px), `big-stat` (300px Bodoni number with italic unit + mint-left-border side note), `CSS bar chart` (scaleY-animated bars in tab colors over a solid axis), `two-column comparison` (plain column vs `.hot` column with `8px 8px 0 var(--tab-4)` hard offset shadow), `principle grid` (2×2 cards, each with a 12px colored left edge via `--edge`), `closing` (display sign-off + underlined contact links + colophon line). Default 8-11 slides per deck; honor the requested slide count when the user picks one; split content rather than shrinking type. No scrolling, no overflow.

## Motion

- Entrances only via `.reveal` elements transitioning when the slide gains `.visible`; stagger with `transition-delay` steps of ~0.1s (`.d1`–`.d6` helper classes).
- One signature easing: `cubic-bezier(0.16, 1, 0.3, 1)`. Animate only `transform` and `opacity`. Chart bars grow with `transform: scaleY` from `transform-origin: bottom`.
- `prefers-reduced-motion` support is mandatory (already in the inlined stage CSS).

## Output contract

- Single self-contained `.html`: all CSS and JS inline, zero build step, zero external JS libraries or CDN scripts (no Chart.js, no mermaid — pure CSS/SVG only). Icons are inline SVG. No remote images. The only allowed external reference is the Google Fonts `@import`.
- Comment every block: `/* === SECTION NAME === */`.
- **From `example.html`, change only the content** (text, section/tab names, data values, icon paths). The tokens, paper device, tabs, chrome, and controller script are the product — do not rewrite them, and never introduce colors or fonts outside this spec.
