---
name: hps-academic-paper
en_name: "Write an Academic Review Deck like a Top-Journal Survey Author"
zh_name: "像顶刊综述作者一样写学术报告"
description: |
  A review deck on compositional generalization in large language models — the field map, the gap, the evidence, and open questions. Built as a decision-grade academic research deck for PI, lab group, reviewers.
en_description: |
  A review deck on compositional generalization in large language models — the field map, the gap, the evidence, and open questions. Built as a decision-grade academic research deck for PI, lab group, reviewers.
zh_description: |
  像顶刊综述作者一样写学术报告——一份可商业交付的学术研究 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "academic-research"
  - "academic-review-deck"
  - "research"
  - "grant"
  - "review"
  - "decision-deck"
  - "commercial-slide-agent"
  - "hps-academic-paper"
triggers:
  - "academic-review-deck"
  - "academic-research"
  - "Write an Academic Review Deck like a Top-Journal Survey Author"
  - "像顶刊综述作者一样写学术报告"
  - "research"
  - "grant"
  - "review"
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
    zh-CN: "用「学术论文风」主题把我的研究内容做成单文件 HTML 学术报告：纸白底全衬线排印、链接蓝引用锚点、斜体 kicker、双规则线扉页、带编号的 Figure/Table 图注和 booktabs 三线表。从 example.html 出发——完整保留 token 表、slide 骨架和键盘运行时，只替换幻灯片内容，使用真实内容，不要 lorem ipsum。"
  category: "academic-research"
  scenario: "research"
  example_prompt: "Create \"Write an Academic Review Deck like a Top-Journal Survey Author\" as a decision-grade Academic research deck in this template's own visual system. Subject: A review deck on compositional generalization in large language models — the field map, the gap, the evidence, and open questions. Audience: PI, lab group, reviewers. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: does the deck prove novelty without overclaiming."
---

# Academic Paper（学术论文风）

A locked, single-theme deck plugin in the `html-ppt-studio` family, ported from
the MIT-licensed [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)
`academic-paper` theme (`assets/themes/academic-paper.css` on the upstream
`templates/deck.html` scaffold). The register is a LaTeX article walking on
stage: paper-white ground, ink-black serif text, link-blue underlined
citations, italic kickers, hairline rules everywhere, zero rounded corners,
no shadows. It reads like Computer Modern even when Computer Modern is not
installed.

**Start from `example.html` in this plugin folder. It is the proven seed: keep
its `:root` token sheet, base/slide-system CSS, academic device classes, deck
chrome and the entire navigation script verbatim, then replace only the slide
content. Do not rewrite the design system, and do not introduce any color or
font outside this spec.**

## Design tokens (locked — reproduce verbatim in `:root`)

```css
:root{
  --bg:#fdfcf8; --bg-soft:#f7f5ed; --surface:#ffffff; --surface-2:#f5f3ea;
  --border:rgba(20,20,20,.14); --border-strong:rgba(20,20,20,.35);
  --text-1:#0a0a0a; --text-2:#333333; --text-3:#707070;
  --accent:#1a3a7a;   /* link blue — citations, "ours" data, best numbers */
  --accent-2:#0a0a0a; /* ink — rules, heavy structure */
  --accent-3:#8a1a1a; /* sparing dark red — errata/negative only */
  --good:#1a5a2a; --warn:#8a6a1a; --bad:#8a1a1a;
  --grad:linear-gradient(135deg,#1a3a7a,#0a0a0a);
  --grad-soft:linear-gradient(135deg,#e8edf8,#f5f3ea);
  --radius:0px; --radius-sm:0px; --radius-lg:0px;
  --shadow:none;
  --shadow-lg:0 1px 2px rgba(0,0,0,.1);
  --font-sans:'Latin Modern Roman','Playfair Display','Noto Serif SC',Georgia,serif;
  --font-serif:'Latin Modern Roman','Playfair Display','Noto Serif SC',Georgia,serif;
  --font-mono:'JetBrains Mono',SFMono-Regular,Menlo,monospace;
  --font-display:'Latin Modern Roman','Playfair Display','Noto Serif SC',Georgia,serif;
  --letter-tight:-.01em; --letter-normal:0;
  --ease:cubic-bezier(.4,0,.2,1);
}
```

Hard color discipline: paper white, ink black, link blue, and the three
semantic statuses are the **entire** palette. `--accent-3` dark red appears
only for errata, negative deltas or "withdrawn/deprecated" marks. Never add
gradients beyond the two declared tokens, never round a corner, never cast a
shadow stronger than `--shadow-lg`.

### Typography

- **All three display slots are serif.** `Latin Modern Roman` is named first
  so machines with LaTeX fonts get the real thing; `Playfair Display` (+
  `Noto Serif SC` for CJK, then Georgia) is the webfont fallback. Google
  Fonts `@import` for Playfair Display (incl. italics), Noto Serif SC and
  JetBrains Mono are the only permitted external references.
- Headings weight 700, body 400, line-height 1.6. No uppercase headings, no
  negative tracking beyond `--letter-tight:-.01em`.
- `.kicker` is the theme signature: *italic*, link blue, sentence case,
  `letter-spacing:0`, weight 400 — never uppercase, never bold.
- Numbers in stats/tables use `font-variant-numeric:tabular-nums`.

## Academic devices (theme-signature components — use them)

| class | device |
|---|---|
| `.rule` / `.rule-double` | hairline rule / LaTeX titlepage double rule (2px over 1px) |
| `.abstract` | italic abstract environment between two hairline rules, bold lead word |
| `.cite` | `[n]` citation anchor — mono, link blue, underlined |
| `.figure` + `.figcaption` | ruled figure box with numbered italic caption (`<b>Figure 1:</b> …`) |
| `.booktabs` | three-line table: 2px top/bottom rules, 1px header rule, **no vertical rules**; `.best` bolds winners in link blue |
| `.footnote` | dagger small print under a hairline rule |
| `.references` | hanging `[n]` bibliography list, titles in `<i>` |
| `.toc-list` | numbered outline with hairline separators and italic timing column |
| `.section-num` | oversized ghost numeral (in `--surface-2`) for section dividers |

Every figure and table **must** carry a numbered caption — that is what makes
the deck feel like a paper. Diagrams are ink-line inline SVG (1.5px ink
strokes, serif labels, the "ours" box tinted `#e8edf8`/link blue); charts are
pure CSS bars on a heavy ink axis with baselines in muted `--surface-2` and
exactly one link-blue "ours" bar. No chart libraries, no remote images.

## Layout masters (all demonstrated in `example.html`, 11 pages)

1. **cover** — italic venue kicker, double rule, serif title, author line with
   superscript affiliations, hairline rule, affiliation small print
2. **toc/outline** — `.toc-list` numbered contents
3. **section-divider** — ghost numeral + ink rule
4. **abstract + contributions** — `.abstract` beside a `.check` list
5. **stat-highlight** — one giant tabular number in link blue + `.footnote` CI
6. **method figure** — inline SVG pipeline in `.figure` with Figure caption
7. **chart-bar** — CSS bar chart, muted baselines vs blue "ours", Figure caption
8. **booktabs table** — Table caption, `.best` winners
9. **big-quote** — italic serif epigraph with precise attribution
10. **conclusions** — two ruled cards (shown / open problems) + artifact link
11. **thanks/references** — `.references` bibliography + contact line

Compose decks from these masters; sequence
`cover → outline → (divider → 2–4 content pages) × N → conclusions → references`.

## Slide system & runtime (keep verbatim)

- One self-contained HTML file; inline `<style>` + `<script>`; zero build,
  zero external JS. Each page is `<section class="slide" data-title="…">`
  inside `<div class="deck" id="deck">` — a horizontal scroll-snap strip,
  one `100vw × 100vh` screen per slide (16:9 / 1280×720 baseline, fluid via
  `clamp()`), padding `72px 96px`, no internal scrolling.
- Fixed chrome: `.deck-header` (running head: short title · venue, italic),
  `.deck-footer` (attribution + `N / total` counter), 2px `.progress-bar` in
  link blue.
- Keyboard: `←/→/Space/PageUp/PageDown/Home/End`; `#/N` hash deep links via
  `history.replaceState` in try/catch (srcdoc-safe). The script's dual
  capture-phase listeners with Event-identity dedupe, `.deck` scroll sync and
  body auto-focus fix real iframe-host bugs — do not simplify them away.
  This variant is theme-locked: there is no `T` theme cycling.
- Speaker notes: one hidden `<div class="notes">…</div>` per slide.
- Animations are restrained: at most one `anim-rise-in`/`anim-fade-up` hero
  plus one `anim-stagger-list` per slide. No 3D, no glitch, no confetti —
  this is a lecture hall, not a launch party.

## Authoring checklist

1. Copy `example.html`; keep all `<style>` blocks and the `<script>` verbatim.
2. Replace the 11 demo slides with your content using the masters above.
3. Real content, real numbers, real (or plausibly fictional) citations — no
   lorem ipsum; number every Figure/Table caption consecutively.
4. Keep the running head and footer attribution updated; the script computes
   the `N / total` counter automatically.
5. Write 1–3 sentence speaker notes per slide in `.notes`.
6. Verify: arrows + Space navigate, `#/5` deep-links, no slide overflows
   vertically, no color or font outside the token sheet.

## Attribution

Theme tokens and the deck scaffold come from the upstream MIT-licensed
[`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)
(© lewis &lt;sudolewis@gmail.com&gt;) — theme `academic-paper`. The LICENSE
file ships alongside this skill; keep it in place when redistributing.
