---
name: asimov-interstellar-deck
zh_name: "阿西莫夫 × 星际穿越 Deck"
en_name: "Asimov × Interstellar Deck"
emoji: "🌽"
description: "Cinematic 5-slide deck for narrating Asimov's Robots/Empire/Foundation universe in an Interstellar 'cornfield + warm pre-apocalypse dusk' tone."
zh_description: "用《星际穿越》的玉米田 + 末日前夜暖光氛围,讲述阿西莫夫机器人/银河帝国/基地全宇宙的 5 页 deck。"
en_description: "Cinematic 5-slide deck for narrating Asimov's Robots/Empire/Foundation universe in an Interstellar 'cornfield + warm pre-apocalypse dusk' tone."
category: slides
scenario: narrative
aspect_hint: "16:9 横向"
tags: ["deck", "narrative", "editorial", "cinematic", "interstellar", "sci-fi", "asimov"]
od:
  mode: deck
  surface: web
  scenario: narrative
  preview:
    type: html
    entry: examples/example.html
    reload: debounce-100
  design_system:
    requires: false
  example_prompt: "Use the Asimov × Interstellar Deck template to turn my content into a cinematic 5-slide horizontal deck with deep navy/charcoal canvas, warm amber accent (oklch(72% 0.15 70)), serif italic emphasis, and a single distant 'anomaly' light. Cover · Timeline · Three pillars · Quote/closing rhythm."
  example_prompt_i18n:
    zh-CN: "用「阿西莫夫 × 星际穿越 Deck」模板,把我的内容做成一套电影感 5 页横向 deck:深蓝/炭灰画布 + 琥珀暖色重音 oklch(72% 0.15 70) + 衬线斜体强调 + 远处的一颗「异常」亮点。封面 · 时间线 · 三柱 · 引文/收束的节奏。"
---

# Asimov × Interstellar Deck

【模板: Asimov × Interstellar Deck (Cinematic Sci-Fi Narrative)】

【意图】讲一个跨越万年的科幻宇宙(阿西莫夫的机器人/银河帝国/基地系列), 但用《星际穿越》"玉米田 + 末日前夜暖光"的色调, 而不是冷蓝虫洞那一面。任何长跨度的科幻、未来史、文明叙事都可套用。

## Direction (locked)

This deck has ONE visual direction. Do not pick a different direction; do not emit a direction-cards form. The user already chose this template precisely for its look.

```css
:root {
  --bg:      oklch(14% 0.025 60);   /* deep warm charcoal — pre-dawn earth */
  --fg:      oklch(94% 0.02 80);    /* paper-warm white */
  --muted:   oklch(62% 0.04 75);    /* dusty wheat */
  --accent:  oklch(72% 0.15 70);    /* warm amber — single accent, used <= 2x per slide */
  --cold:    oklch(58% 0.08 240);   /* a far-horizon cool blue, used sparingly */
  --surface: oklch(18% 0.028 60);
  --border:  oklch(28% 0.02 60);
  --shell:   oklch(6% 0.012 60);    /* room behind the slide */

  --font-display: "Iowan Old Style", "Charter", "Songti SC", "STSong", Georgia, serif;
  --font-body:    -apple-system, "PingFang SC", "Helvetica Neue", system-ui, sans-serif;
  --font-mono:    ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, monospace;
}
```

## Atmosphere layer (every slide)

Each slide carries a 3-element atmosphere layer behind content, NOT a flat background:

1. `.atmosphere::before` — radial gradients (warm amber bottom-left, cool indigo top-right) + a vertical fade. Reads as an Interstellar pre-storm sky, not as "AI gradient slop".
2. `.atmosphere::after` — fine 3px+7px dot grid at low opacity, mix-blend-mode: screen. Cinematic film grain.
3. `.horizon` — 1px hairline at 18% from bottom, faint amber. Implies an Earth horizon without drawing one.
4. `.anomaly` — a single small white-amber halo near the upper-right. ONE per slide. The wormhole / Cooper Station tell. Do not multiply.

These four pieces are the visual signature. Without them the deck stops feeling like Interstellar.

## Slide arc — exactly 5 slides

Default scope is **5 slides** for an overview deck. The framework counter shows `01 / 05`.

1. **Cover** (`.s-cover`) — kicker (subject + dates) → display headline (≤ 2 lines, ≤ 132px) → subtitle row → latin/romanized tagline. Justify content to the bottom; the upper 60% of the slide is sky.
2. **Timeline** (`.s-timeline`) — kicker → display headline (≤ 66px) → 920px lead paragraph → 200px / 1fr two-column timeline with 3 era rows. Each row: era-time + tiny caption / era-name (serif) / era-desc / era-works (mono caps). Vertical hairline + amber dot per row.
3. **Pillar / Concept** (`.s-robots` style) — number kicker `CHAPTER 0X` → display headline → 1.05fr / 0.95fr split. Left = enumerated principles (e.g. Three Laws, four eras, three thermodynamic conditions). Right = sidebar with a labeled panel + a year/title list.
4. **Three columns** (`.s-foundation` / `.pillars`) — kicker → display headline (≤ 72px) → 1200px italic lead → 3-column pillar grid (number / title / body / meta caption). One idea per column.
5. **Closing / Quote** (`.s-unify`) — display (≤ 88px) two-line statement → big italic block quote with left amber border + small mono attribution → 4-step horizontal arc strip.

Adapt slide content to the user's actual brief, but keep the 5-slot rhythm. Don't grow to 8-12 slides unless the user explicitly asks; the warmth is in the brevity.

## Typography

- **Display headlines**: `var(--font-display)` (Iowan / Charter / Songti SC fallback). Weight 500. Letter-spacing -0.012em. Line-height 1.02. Italic via `<em>` only — italic carries the accent color. No bold.
- **Body lead**: serif body (`body-serif`) at 19–22px / 1.5. Color `oklch(82-86% 0.025 75)`.
- **Kicker / mono**: 11–14px monospace, letter-spacing 0.18–0.32em, uppercase. Color `var(--accent)` for the active kicker, `oklch(70% 0.04 75 / 0.7)` for passive footer mono.
- **Footer**: every slide carries a `.deck-footer` with left = section label (e.g. `02 / 05 · TIMELINE`) and right = a quiet English tagline (`A QUIET WARNING FROM A WARMER SUN`). 12px mono, letter-spacing 0.28em, uppercase.

## Density rules (the Interstellar rule)

The film tells a 2-hour story by withholding. The deck honors that:

- **One idea per slide.** Two ideas → two slides.
- **Cover headline ≤ 8 words, ≤ 2 lines, ≤ 132px.** No subtitle paragraphs on the cover.
- **Body slides: ≤ 3 paragraphs, ≤ 56ch lead width, ≤ 12 words per line.**
- **Reserve a 200px-tall footer safe-zone** at the bottom of every slide; do not let flow content extend into it. The framework's `@media print` block depends on this margin.
- **Accent budget: 1 amber accent per slide, used ≤ 2x.** Cool blue (`--cold`) is for one tiny element only — a horizon, a vector tip — not a fill.

## Forbidden moves (anti-AI-slop, Interstellar edition)

- ❌ Purple/violet gradient sky (Interstellar's sky is amber + indigo, never violet).
- ❌ Multiple "anomaly" lights. The whole point is ONE.
- ❌ Emoji icons in slide bodies (kicker dots are the only ornament).
- ❌ Drop shadows, soft glows on text, neumorphic cards, glass blur.
- ❌ Inter / Roboto as a display face — display must be a serif.
- ❌ A subtitle paragraph fighting the cover headline.
- ❌ Inventing stats (years, dates, populations) without a textual source.
- ❌ Switching to a "cold space / wormhole / cyan" palette. This template is the warm-Earth side.

## Framework

This skill emits a deck on top of OD's standard 1920×1080 deck framework (scale-to-fit, prev/next, counter, keyboard, position-restore, print stylesheet). Do **not** rewrite that framework. Copy it verbatim from the system prompt's "Slide deck — fixed framework" section, then bind the tokens above and fill in the 5 `<section class="slide">` slots.

Run the P0 self-check from the system prompt's deck directive before emitting:

- [ ] Each slide fits 1920×1080 without overflow into the footer band.
- [ ] Cover display ≤ 140px, ≤ 8 words, ≤ 2 lines.
- [ ] Atmosphere + horizon + single anomaly present on every slide.
- [ ] Accent used ≤ 2x per slide.
- [ ] No emoji, no purple gradient, no extra anomaly halos.
