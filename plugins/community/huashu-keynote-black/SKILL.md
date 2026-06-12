---
name: huashu-keynote-black
description: |
  Keynote Black (黑场大数字) — Jobs-2007 / Lei-Jun-launch-event black-stage
  keynote decks, generated from the「黑底巨型数字剧场 / Black Big-Number
  Stage」spec in 花叔 (alchaincyf)'s huashu-design design-styles library.
  Pure black #000000 stage, pure white type, one word or one giant
  tabular-nums numeral per screen, exactly one brand accent for the whole
  deck (Mi orange #FF6900 / Spotify green #1ED760 / Apple blue #2997FF),
  massive negative space, accent-vs-grey spec comparison bars, and a
  price-reveal climax. Use when the user wants a product launch keynote,
  发布会 PPT, 主题演讲, town hall, year-in-review, Jobs-style or
  雷军式 presentation, or a one-word-per-slide black deck.
triggers:
  - "keynote"
  - "product launch deck"
  - "black stage slides"
  - "big number slides"
  - "发布会 PPT"
  - "主题演讲"
  - "雷军式"
  - "黑底大字"
  - "一屏一词"
od:
  mode: deck
  surface: web
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  example_prompt: "Use the Keynote Black template to turn my launch story into a black-stage HTML keynote: 1920×1080 fixed canvas, pure black background and pure white geometric bold type, one word or one giant tabular-nums number per screen, a single Mi-orange #FF6900 accent for the whole deck, accent-vs-grey spec comparison bars and a price-reveal page. Start from example.html, replace the content only, and keep the design system intact."
  example_prompt_i18n:
    zh-CN: "用「黑场大数字」模板把我的发布会故事做成黑场 HTML 主题演讲：1920×1080 固定画布、纯黑底纯白几何粗体、一屏一词或一个超大 tabular-nums 数字、整套只用一个小米橙 #FF6900 强调色、强调色对灰色的参数对比条和价格揭晓页。从 example.html 出发只换内容，不要重写设计。"
---

# Keynote Black · 黑场大数字

Produce a **single-file, black-stage keynote deck**. You are directing a
launch event, not writing a document: the screen is a stage, every page is
one beat, and the audience must be able to read it from the last row. The
visual system, canvas contract, and navigation runtime are locked by
`example.html`. **Start from `example.html`, replace content only — do not
rewrite the design or the script. Do not introduce any color or font outside
this spec.**

Generated from the「黑底巨型数字剧场 / Black Big-Number Stage」entry
(大胆派, 还原 97%) of `references/design-styles.md` in
[huashu-design](https://github.com/alchaincyf/huashu-design) by 花叔
(alchaincyf), MIT licensed — references: Steve Jobs' 2007 iPhone keynote,
Lei Jun's Xiaomi SU7 Ultra launch, Spotify Wrapped, Presentation Zen. The
upstream entry is a written spec; this plugin realizes it as a full
multi-section deck while preserving its DNA.

Not to be confused with siblings: `dir-key-nav-minimal` rotates 8 colored
monochrome pages (indigo/cream/crimson/jade…) — this deck is **constant pure
black** with one accent and no color rotation; `studio` is a black +
electric-yellow design-studio text style with no big numbers; `ppt-keynote`
is a light generic Keynote card deck.

## Hard spec (locked — violating any line is a regression)

### Canvas & runtime

- One `<div id="stage">` fixed at **1920 × 1080 px**, centered with
  `position: fixed; top: 50%; left: 50%`; a `fit()` function applies
  `translate(-50%, -50%) scale(min(innerWidth/1920, innerHeight/1080))` on
  load and `resize`. All inner layout in px — the scaler owns responsiveness.
- Each page is one `<section class="slide">` inside `#stage` with a
  `data-screen-label="01 封面"`-style label; exactly one slide carries
  `.active`. There are no light pages — every page is the black stage.
- Navigation (keep the script verbatim): `←`/`↑`/`PageUp` previous,
  `→`/`↓`/`Space`/`PageDown` next, `Home`/`End` first/last; `#/N` hash
  routing (1-indexed) read on load + `hashchange`, written via
  `history.replaceState`; click left third = back, rest = forward; fixed
  counter pill bottom-right, key-hint bottom-left. No external JS, no build
  step — the file must open inside a sandboxed iframe via `file://`.

### Design tokens (`:root` — keep the names; only `--accent` may change)

| Token | Value | Role |
|---|---|---|
| `--stage` | `#000000` | the stage — every page background |
| `--ink` | `#FFFFFF` | primary type, pure white only |
| `--accent` | `#FF6900` | **the one accent** — deck-wide single choice |
| `--muted` | `#9B9B9B` | captions / secondary lines |
| `--faint` | `#5F5F5F` | whisper labels, footnotes |
| `--line` | `#2A2A2A` | hairlines, capsule borders |
| `--bar-base` | `#3A3A3A` | losing / baseline comparison bar |
| `--sans` | `'Inter', 'Geist', 'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif` | the only family |

- `--accent` is a **single choice per deck** from exactly three values:
  Mi orange `#FF6900`, Spotify green `#1ED760`, Apple blue `#2997FF`.
  Mixing two of them in one deck is the cardinal sin of this style.
- Fonts load via one Google Fonts `@import` (Inter + Noto Sans SC); no other
  external resource of any kind.

### Signature devices (the visual DNA — every deck must show them)

1. **One idea per screen**: each page centers one element with flex — one
   word, one number, one sentence, or one comparison. If a page needs a
   paragraph, it needs to become two pages.
2. **Giant numeral theater**: hero numbers are 320–460px, weight 900,
   tracking ≈ −0.04em, `font-variant-numeric: tabular-nums`, pure white,
   with a small uppercase unit beside or below — the unit (or one glyph) may
   take the accent. Exactly one quiet `--muted` caption line underneath.
3. **One-word manifesto**: 240–300px weight-900 word ending in an accent
   full stop (`<span class="a">。</span>`), with one whisper line below.
4. **Stage spotlight**: a single faint
   `radial-gradient(closest-side, rgba(255,255,255,.05), transparent)`
   ellipse behind the hero element (`.spotlight`). This is the only
   decoration allowed — no other gradients, no photos, no emoji, no icon
   fonts, no shadows, no border-radius (runtime counter pill excepted).
5. **Whisper top label**: 12px / 600 / 4px-tracking uppercase `--faint`
   label centered at the top of every page (event name · chapter). It is
   chrome, not content — keep it nearly invisible.
6. **Accent-vs-grey comparison bars**: `.vs-row` = white 20px label left,
   full-width `--line`-hairline-topped track, accent fill for the subject
   vs `--bar-base` fill for the baseline, values printed at the right end in
   tabular-nums (accent value white-hot, baseline value `--muted`). The
   page's subject is **always** the accent bar.
7. **Price reveal**: small struck-through `--muted` expectation line above a
   giant white price whose currency glyph is the accent. The deck's climax.

### Layout enumeration (use 5+ per deck, never one layout everywhere)

| Layout | Role |
|---|---|
| `cover` | whisper event label + product name with accent full stop + one sub line |
| `agenda` | "今晚，只讲三件事。" — 3 numbered rows, accent numerals, hairline-separated |
| `one-word` | 240–300px single word + accent 。 + whisper subtitle |
| `big-number` | 320–460px numeral + uppercase unit + one caption (the workhorse — use 2–3) |
| `versus` | subject vs baseline spec bars, accent vs `--bar-base`, tabular values |
| `quote` | 64–88px white statement, one phrase in accent, attribution in `--faint` |
| `price` | strikethrough expectation + giant price, accent currency glyph |
| `one-more-thing` | the classic teaser line + one whisper reveal |
| `closing` | 「谢谢。」-scale farewell + key-hint capsule |

### Typography & scale (read from the last row)

- Geometric bold sans only, weights 700–900; headlines 96–180px, hero words
  240–300px, hero numbers 320–460px, all with negative tracking (−0.02 to
  −0.05em). Captions 20–24px `--muted`; whisper labels 12–13px uppercase
  4px-tracking `--faint`. Nothing between 24px and 64px — this style has no
  "medium" type; it whispers or it shouts.
- Every digit everywhere sits in `tabular-nums`. Large numbers take thin
  comma grouping (`1,024`).
- Chinese copy uses 「」 quotes; the accent is applied to a single glyph or
  a single phrase, never a whole headline.

### Rhythm & discipline

- Default 10 pages (8–11 allowed). Sequence builds like a launch event:
  cover → agenda → alternating word/number beats → versus → quote →
  price reveal → one more thing → closing. Place the biggest number and the
  price in the back half — the deck must escalate.
- Accent budget: **at most one accent device per page**; pages with none are
  encouraged. Pure black + pure white carries the style; the accent is the
  laser pointer, not the lighting rig.
- Real content only — the user's actual words and numbers; missing data gets
  an honest `<!-- 待用户提供 -->` placeholder, never invented statistics.
  (The seed deck's 「曜石 YAO」 launch is fictional demo content and must be
  fully replaced.)

## Workflow

1. **Clarify once**: topic, audience, page count, the ONE accent, and which
   2–3 numbers are the protagonists (plus the price, if there is one). This
   style lives and dies by its hero numerals — pick them before any page.
2. **Copy `example.html`**, retitle, then replace each section's content
   following the layout enumeration. Keep tokens, spotlight, whisper labels,
   and the script intact. Change `--accent` only to one of the three
   sanctioned values.
3. **For ≥ 5 pages, showcase first**: build the cover + one big-number page,
   confirm the grammar, then batch the rest.
4. **Self-check before delivery**: arrow through every page; counter and
   `#/N` hash stay in sync; no overflow beyond 1920×1080; one idea and ≤ 1
   accent device per page; every digit tabular; versus bar widths match
   their printed values proportionally; no second accent anywhere; no
   leftover demo (「曜石」/「YAO」) text; grep for `TODO`.
