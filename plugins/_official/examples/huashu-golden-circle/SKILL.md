---
name: huashu-golden-circle
en_name: "Present a Brand-Repositioning Strategy like a Top Consulting Principal"
zh_name: "像顶级咨询董事一样讲品牌重塑战略"
description: |
  A brand-repositioning strategy for a heritage coffee chain — why, how, what — the governing idea and the moves to prove it. Built as a decision-grade consulting deck for client CMO, board.
en_description: |
  A brand-repositioning strategy for a heritage coffee chain — why, how, what — the governing idea and the moves to prove it. Built as a decision-grade consulting deck for client CMO, board.
zh_description: |
  像顶级咨询董事一样讲品牌重塑战略——一份可商业交付的咨询交付 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "consulting"
  - "consulting-final-deck"
  - "strategy"
  - "consulting-deliverable"
  - "client"
  - "decision-deck"
  - "commercial-slide-agent"
  - "huashu-golden-circle"
triggers:
  - "consulting-final-deck"
  - "consulting"
  - "Present a Brand-Repositioning Strategy like a Top Consulting Principal"
  - "像顶级咨询董事一样讲品牌重塑战略"
  - "consulting-deliverable"
  - "strategy"
  - "client"
  - "html deck"
  - "html slides"
od:
  mode: deck
  surface: web
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt_i18n:
    zh-CN: "用「黄金圆环图解」模板把我的方法论做成单图母图 HTML 幻灯片：暖白纸底、唯一金色强调 #E8860C、一个嵌套同心圆母图以填充/高亮/灰化/描边四种模式贯穿全场，大写 Jost 标签嵌入圆环、Manrope 标题。从 example.html 出发只换内容，不要重写设计。"
  category: "consulting"
  scenario: "strategy"
  example_prompt: "Create \"Present a Brand-Repositioning Strategy like a Top Consulting Principal\" as a decision-grade Consulting deck in this template's own visual system. Subject: A brand-repositioning strategy for a heritage coffee chain — why, how, what — the governing idea and the moves to prove it. Audience: client CMO, board. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: would a client know what to do Monday morning."
---

# Golden Circle Diagram · 黄金圆环图解

Produce a **single-file, one-diagram concept deck**. You are visualizing a
methodology the way Simon Sinek drew the Golden Circle on a TED flip chart:
one geometric master figure carries the entire argument, and every page is
that figure seen from a different angle. The visual system, canvas contract,
and navigation runtime are locked by `example.html`. **Start from
`example.html`, replace content only — do not rewrite the design or the
script. Do not introduce any color or font outside this spec.**

Generated from the 中性派「单图母图概念图解 / Diagrammatic Minimalism」spec in
`references/design-styles.md` of
[huashu-design](https://github.com/alchaincyf/huashu-design) by 花叔
(alchaincyf), MIT licensed. Lineage: Simon Sinek's Golden Circle TED talk,
Bauhaus geometric abstraction, "one diagram rules the room" information
architecture.

## Hard spec (locked — violating any line is a regression)

### Canvas & runtime

- One `<div id="stage">` fixed at **1920 × 1080 px**, centered with
  `position: fixed; top: 50%; left: 50%`; a `fit()` function applies
  `translate(-50%, -50%) scale(min(innerWidth/1920, innerHeight/1080))` on
  load and `resize`. All inner layout in px — the scaler owns responsiveness.
- Each page is one `<section class="slide">` inside `#stage` with a
  `data-screen-label="01 封面"`-style label; exactly one slide carries
  `.active`; the dark closing page adds `.dark`.
- Navigation (keep the script verbatim): `←`/`↑`/`PageUp` previous,
  `→`/`↓`/`Space`/`PageDown` next, `Home`/`End` first/last; `#/N` hash
  routing (1-indexed) read on load + `hashchange`, written via
  `history.replaceState`; click left third = back, rest = forward; fixed
  counter pill bottom-right, key-hint bottom-left. No external JS, no build
  step — the file must open inside a sandboxed iframe via `file://`.

### Design tokens (`:root` — keep the names, re-theme values only)

| Token | Value | Role |
|---|---|---|
| `--paper` | `#FAFAF7` | warm-white page background |
| `--ink` | `#141414` | primary text |
| `--night` | `#161512` | dark closing-page background |
| `--night-ink` | `#F5F2EA` | primary text on dark |
| `--accent` | `#E8860C` | **the only accent hue (gold)** |
| `--tint-2` | `#F2BA6B` | middle-ring tint of the accent |
| `--tint-3` | `#FAE5C3` | outer-ring tint of the accent |
| `--neutral-2` | `#E8E4D9` | de-emphasized ring (warm grey) |
| `--neutral-3` | `#F2EFE7` | de-emphasized outer ring |
| `--line` | `#E5E1D6` | hairline rules |
| `--muted` | `#8A867C` | secondary labels |
| `--muted-2` | `#56524A` | body copy |
| `--faint` | `#B5B0A4` | tertiary captions |
| `--night-line` | `#3A372F` | hairlines on the dark page |
| `--display` | `'Jost', 'Manrope', 'PingFang SC', …` | uppercase tracked labels |
| `--sans` | `'Manrope', 'PingFang SC', …` | headlines + body |

- Fonts come from the single existing Google Fonts `@import`
  (Jost 400–700 + Manrope 400–800); Chinese falls back to PingFang SC /
  Microsoft YaHei. No other `@import`, no CDN scripts, no icon fonts.
- `--tint-2/--tint-3` are tints of the accent, not second colors. **A second
  accent hue is the cardinal sin of this style.**

### THE master figure (the deck's entire visual vocabulary)

The `.gc` component — nested concentric circles, pure `border-radius: 50%`
divs — is the only diagram in the deck. Keep its geometry verbatim:

- `.gc { --gc: <size>px }` sets the diameter; rings at `inset: 0` (WHAT,
  `--tint-3`), `inset: 16%` (HOW, `--tint-2`), `inset: 33%` (WHY, solid
  `--accent`, flex-centered core label).
- Uppercase labels (`.lbl`, Jost 600, `letter-spacing: .35em`) are embedded
  **inside the bands**: WHAT centered at 8% height, HOW at 24.5%, WHY in the
  core at `calc(var(--gc) * 0.085)` in `--paper` white.
- Locked modes — these are the full enumeration, do not invent new ones:
  - default: golden fill (cover, master page, the "right way" comparison);
  - `.mode-how` / `.mode-what`: target band `--accent` (its label `--paper`),
    other bands `--neutral-3`/`--paper`;
  - `.mode-grey`: all-neutral counter-example (core `--muted`);
  - `.mode-outline`: transparent rings with 2px `--accent` strokes — dark
    closing page only.
- Derivatives allowed: the solid accent disc (`.why-disc`, the WHY page's
  zoomed core), faint watermark rings (1px accent border, opacity ≤ 0.3,
  may bleed off-canvas), mini three-circle inline-SVG glyphs (36px, one band
  accented to mark a section), and inside-out arrows (inline SVG: dot at the
  center, 2–2.5px line, solid polygon head). Nothing else — no photos, no
  charts, no emoji, no decorative illustration.
- The rings may be renamed to match the user's framework (信念/路径/产品,
  core/loop/surface…) but there are **always exactly three bands**, and the
  innermost band is always the thesis.

### Chrome (hairline strips, not bars)

- Every page: `.head` (top) and `.foot` (bottom) — 84px strips at
  `left/right: 80px` with a 1px `--line` border (`--night-line` on dark),
  Jost 13px/600/3px-tracking uppercase; left side carries the deck logotype
  in `--ink` `<b>` + a gold `/` separator; right side of `.foot` carries
  `NN / 章节名`. Content lives in `.body` (`top/bottom: 84px`,
  `left/right: 80px`).
- The only rounded rectangle in the deck is the runtime counter pill (and
  the WHAT evidence cards at 18px radius); everything else is a circle or a
  straight hairline.

### Layout enumeration (use 6+ per deck, never one layout everywhere)

| Layout | Role |
|---|---|
| `cover` | left headline (gold full stop `。`) + hairline meta row; right master figure |
| `contents` | hairline rows: gold number + mini glyph + title + uppercase EN label |
| `master` | the figure at ≈660px + inside-out arrow piercing the rings + per-ring notes |
| `why` | solid accent disc (zoomed core) + one belief statement, ≤ 2 sentences |
| `how` | `.mode-how` figure + three hairline-separated pillar columns |
| `what` | `.mode-what` figure + 2×2 evidence cards with glyph markers |
| `big-number` | 300px Manrope-800 numeral (accent unit glyph) + stat rail + watermark rings |
| `comparison` | grey circle (inward arrow, outside-in) vs gold circle (outward arrow, inside-out) |
| `quote` | 66px/800 quote, key word in accent, offset watermark rings bleeding right |
| `closing` | dark page, `.mode-outline` figure + CTA in a 2px accent outlined capsule |

### Typography & discipline

- Headlines: Manrope 800, 64–96px, negative tracking; the cover/closing
  full stop `。` is the accent. Body (`.lede`) 20px/1.85 `--muted-2` with
  `<strong>` ink emphasis — **statements, not bullet walls**; any list ≤ 3
  short lines.
- Labels (`.kicker`, `.caption`, ring labels): Jost 600, 12–15px, 3–5px
  tracking, uppercase — the connective tissue of the style.
- Chinese copy uses 「」 quotes and full-width punctuation; accent is applied
  to single glyphs and key words, never whole headings.
- Default 10 pages (8–11 allowed). Exactly **one** dark page (the closing).
  Accent budget: outside the figure itself, ≤ 3 gold touches per page.
- One idea per page, mapped onto the figure: if a concept cannot be pointed
  to on the circle, it does not belong in this deck.

## Workflow

1. **Clarify once**: topic, audience, page count — and the user's
   three-band framework (what is the WHY / HOW / WHAT of *their* argument),
   plus 1–2 protagonist numbers for the evidence page. The master figure is
   the deck; name its bands before writing any page.
2. **Copy `example.html`**, retitle, rename the ring labels if needed, then
   replace each section's content following the layout enumeration. Keep the
   `.gc` component, tokens, hairline chrome, and the script intact. Re-theme
   by changing token values only — and keep `--tint-2/--tint-3` as tints of
   whatever single accent you choose.
3. **For ≥ 5 pages, showcase first**: build the cover + the master-diagram
   page, confirm the figure's band names read correctly, then batch the rest.
4. **Self-check before delivery**: arrow through every page; counter and
   `#/N` hash stay in sync; no overflow beyond 1920×1080; every page shows
   the figure or one of its locked derivatives; ring labels sit inside their
   bands at every `--gc` size used; exactly one accent hue in the whole
   file; no leftover demo ("同心"/"TONGXIN") text; grep for `TODO`.
