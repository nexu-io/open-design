---
name: kami-article
description: >
  Produce a print-grade single-page kami (紙 / 纸) **article transcript &
  interpretation** — one document that reads someone else's source piece
  (X thread, blog post, paper) and folds it together with your own
  summary, restated takeaways, and key pulled quotes. Same warm parchment
  canvas, ink-blue accent, serif-at-one-weight rhythm as kami-landing,
  but the page structure is tuned for "reading + commentary" instead of
  "brand + product." Multilingual (EN · zh-CN · ja). One self-contained
  HTML file, zero dependencies beyond Google Fonts.
triggers:
  - kami article
  - kami 文章
  - 文章解读 kami
  - article transcript page
  - article interpretation
  - reading note one-pager
  - tweet thread to kami
  - paper to kami one-pager
  - 把这篇文章排成 kami
  - kami reading
od:
  category: editorial-document
  surface: web
  mode: prototype
  platform: desktop
  scenario: reading
  audience: writers, researchers, newsletter editors, OSS maintainers
  tone: editorial, restrained, print-first
  scale: viewport-anchored long-form single page
  preview:
    type: html
    entry: index.html
    reload: debounce-100
  design_system:
    requires: false
  craft:
    requires:
      - typographic-rhythm
      - pixel-discipline
inputs:
  - id: source
    label: Source article
    description: >
      Author display name, handle, source URL, and a short citation block
      (date / venue / read-time). The example_prompt below shows the
      shape — keep these accurate so the footer attribution links back to
      the real piece.
  - id: hero
    label: Hero / cover block
    description: >
      Eyebrow row + headline (≤ 6 EN words / ≤ 8 CJK chars at display
      size, with one ink-blue accent word) + tagline + 3 hero meta
      tokens (e.g. "06 Reasons / 100+ Line Threshold / 2-4× Cost").
  - id: manifesto
    label: One-line takeaway + interpreter signature
    description: >
      One paragraph that states the piece's core idea in your own voice,
      followed by your byline + a link back to the original.
  - id: metrics
    label: 3-6 metric tiles (value · label · sub)
    description: >
      Real numbers from the source piece — never invented. If a number
      is paraphrased, label the sub-line that way. Honest "—" beats a
      fabricated stat.
  - id: chapters
    label: 3-5 numbered chapters (title + lede + body)
    description: >
      Each chapter restates one of the source's main arguments in your
      own words. Drop in `.quote` blocks for short attributed pulls
      (≤ 2 sentences each) and `chapter-aside` blocks for grids / tables
      / FAQ-style summaries.
  - id: footer
    label: Source · skill · studio columns
    description: >
      Three-column footer linking back to the original, naming this
      skill, and noting the interpreter. Mirror the pattern in
      example.html.
parameters:
  output_format:
    type: enum
    values: [standalone-html]
    default: standalone-html
  language:
    type: enum
    values: [en, zh-CN, ja]
    default: en
    description: >
      Sets the primary serif stack on `:root`. EN uses Source Serif 4 /
      Charter, zh-CN uses Noto Serif SC / Source Han Serif, ja uses
      YuMincho. Mixed-script content is allowed inline; the browser
      resolves per-glyph fallback automatically.
outputs:
  - path: <out>/index.html
    description: Self-contained HTML, kami CSS inlined, zero JS, zero external dependencies beyond Google Fonts.
capabilities_required:
  - file-write
example_prompt: |
  Build me a kami-article one-pager that transcribes and interprets
  Thariq's "The Unreasonable Effectiveness of HTML" (X · @trq212).
  Headline "HTML 的不合理有效性" with the ink accent on "不合理".
  zh-CN language stack. Hero tokens: 06 Reasons / 100+ Line Threshold
  / 2-4× Generation Cost. Manifesto restates the core argument in one
  paragraph. Four numbered chapters covering: Markdown 的编辑前提正在
  消失, 表达力的代差, 文档变成小工具, 重新回到 loop. Pull two short
  attributed quotes from the original. Footer links back to
  https://x.com/trq212/status/2052809885763747935.
---

# kami-article

Produce a single-page **article transcript & interpretation** in the
**kami (紙 / 纸)** design system. The aesthetic is the same as
[`kami-landing`](../kami-landing/) — warm parchment, ink-blue accent,
serif at one weight, no italic — but the page structure is tuned for
*reading another writer's piece* and folding your own commentary onto
the same canvas, instead of describing your own brand or product.

> **Design system source of truth:** [`design-systems/kami/DESIGN.md`](../../design-systems/kami/DESIGN.md).
> Read it before shipping. Tokens, type rules, the "ten invariants",
> and forbidden colors all live there. Treat this skill as a sibling
> of `kami-landing` / `kami-deck`; do not introduce new tokens.

## When to pick this skill (and when not to)

**Pick `kami-article` when** the brief sounds like *"I read this
piece, here is my version of what it says."* — X threads, blog posts,
papers, conference keynotes, FAQ-style essays. The deliverable is one
HTML page that the reader opens once and walks through top-to-bottom.

**Pick [`kami-landing`](../kami-landing/) instead when** the brief is
about your own brand, product, or studio — the page exists to *sell
or position*, not to *read and respond*.

**Pick [`kami-deck`](../kami-deck/) instead when** the deliverable is
a slide-by-slide horizontal walkthrough, not a single scrollable page.

## What you get

Identical visual contract to `kami-landing`:

- **Warm parchment canvas** (`#f5f4ed`) — never `#ffffff`.
- **Single chromatic accent** — ink-blue (`#1B365D`), capped at ≤ 5%
  of the visible surface. Used on the chapter numbers, the headline
  accent word, the manifesto left rule, the metric values, and the
  `.quote` left rule.
- **Serif at one weight (500) for hierarchy** — Source Serif 4 /
  Charter (EN), Noto Serif SC / Source Han Serif (CN), or YuMincho
  (JA). **No italic anywhere.**
- **Tight print rhythm** — line-heights 1.10–1.80 (article body
  intentionally rides at 1.7–1.8 for long-form reading comfort),
  letter-spacing per language (0 for EN, 0.35px for CN, 0.02em for JA).
- **`tabular-nums` on every numeric stack** so metric columns,
  pagination digits, and dates align cleanly.
- **Tag fills as solid hex** (e.g. `#E4ECF5`) — never `rgba()`.
- **Depth via 1px rings + a single whisper shadow**
  (`0 4px 24px rgba(0,0,0,0.05)`). No hard drop shadows, no
  neumorphism, no `backdrop-filter`.
- **Responsive** at 1080 / 640.

## Page structure

```text
1. Eyebrow row     — source attribution (X · @handle / "transcript & interpretation")
                     · edition / read-time / year (12px sans uppercase)
2. Hero            — display headline (56–100px serif 500, one ink-blue word),
                     tagline (19px), three hero-token chips (mono caps, paper-tinted)
3. Manifesto       — one-paragraph takeaway in serif 400, 19px, 1.75 LH,
                     ink-blue left-rule, signature with link back to source
4. Metrics row     — 3-6 cells: value (36px serif 500 ink-blue, tabular-nums),
                     label (13px serif 500), sub (12.5px serif 400 olive)
5. Chapters        — numbered (`01`, `02`, …) ink-blue serif 500 14px,
                     section title 28px, lede 14px olive, body 14.5px / LH 1.8.
                     Drop in `.quote` blocks for short attributed pulls and
                     `.chapter-aside` blocks for grids / tables / FAQ summaries.
6. Footer          — kicker phrase (mega serif 500, one ink-blue word),
                     colophon, three columns: Source / Skill / Studio
```

## Workflow contract

### 1. Gather the source brief

Ask the reader in two rounds. Don't dump the whole input list at once.

1. **Source round** — author display name + handle, canonical URL,
   date, venue (X / blog / paper / talk), read-time estimate, primary
   language of the source piece.
2. **Interpretation round** — your one-line takeaway (the manifesto),
   3-6 honest metric tiles drawn from the source, 3-5 chapters each
   with title + lede + body + at most one `.quote` pull, footer
   colophon copy.

### 2. Pick the language stack

The `language` parameter overrides `--serif` on `:root`. Pick by the
dominant language of *your interpretation body* (not the source) —
inline mixed-script content is fine, the browser per-glyph fallback
chain handles it.

| `language` | `--serif`                                                  | Notes                                       |
| :--------- | :--------------------------------------------------------- | :------------------------------------------ |
| `en`       | Source Serif 4, Charter, Georgia, Palatino, serif          | default                                     |
| `zh-CN`    | Noto Serif SC, Source Han Serif SC, Songti SC, Georgia     | letter-spacing 0.35px on body               |
| `ja`       | YuMincho, Hiragino Mincho ProN, Source Han Serif JP        | also override `--olive` to `#4d4c48`        |

### 3. Write `index.html`

Output a single file with all CSS inline. Mirror the structure of
[`example.html`](./example.html); use only tokens already shipped in
`design-systems/kami/DESIGN.md`. Do **not** invent new colors,
weights, or font families.

Component primitives the agent can drop in (all defined in the
example's `<style>` block):

- `.eyebrow-row` — sans-serif overline strip with `.left` / `.right`
- `.hero-tokens .row` — mono caps chips for top-of-page facts
- `.metric` — value + label + sub vertical stack
- `.chapter` with `.head` (num + title + lede) + `.body`
- `.quote` — left-rule serif 500 pull quote with `.src` attribution
- `.chapter-aside` — ivory bg card with `.a-grid` (2 × N) or `.table`
- `.tag.standard`, `.tag.brush` — solid-hex tags (one `.brush` max per page)
- `ul.dash` — en-dash bullets in ink-blue
- `.footer .kicker` — mega serif 500 closing phrase

Tag every editable region with `data-od-id="<unique-slug>"` so the
host app's comment mode can target them.

### 4. Honest sourcing — non-negotiable

`kami-article` is read-and-respond, which means every piece of
content has a provenance. Two rules that the agent must enforce:

1. **Quotes are short and attributed.** Each `.quote` block is
   ≤ 2 sentences, lifted verbatim or as a tight paraphrase, and
   carries a `<span class="src">— Author · venue</span>` line.
2. **Numbers are real.** Every metric tile value comes from the
   source piece (or is your own commentary clearly labelled as
   such). When a number is unknown, write `—`, not "10×".

### 5. Self-check before delivering

- [ ] Page background is parchment (`#f5f4ed`), never `#ffffff`.
- [ ] Ink-blue (`#1B365D`) covers ≤ 5% of visible surface — count
      chapter numbers, manifesto rule, metric values, headline
      accent, quote rules, footer kicker accent. Total ≤ 5%.
- [ ] All grays are warm (R ≈ G > B). No `slate-*`, no `#f3f4f6`.
- [ ] Serif weight stays at 500 — no `font-weight: 700` or `900`.
- [ ] No `font-style: italic` anywhere.
- [ ] All numeric stacks (metric values, eyebrow meta, hero tokens,
      legal line) carry `font-variant-numeric: tabular-nums`.
- [ ] All tag fills are solid hex; no `rgba()` on tags.
- [ ] Shadows: at most a 1px ring or a `0 4px 24px rgba(0,0,0,0.05)`
      whisper. No hard drop shadows.
- [ ] Headline ≤ 6 EN words / ≤ 8 CJK chars at display size.
- [ ] Every `.quote` block has a `.src` attribution line.
- [ ] Every metric tile value has a real-source provenance (no
      invented stats).
- [ ] Footer Source column links back to the canonical URL of the
      source piece.
- [ ] At 1080px and 640px the layout collapses to one column without
      horizontal scroll.

Full P0 / P1 / P2 gates live in
[`references/checklist.md`](./references/checklist.md).

## Files in this skill

```text
skills/kami-article/
├── SKILL.md                    # this contract
├── README.md                   # human quick-start
├── example.html                # canonical Open Design rendering
└── references/
    └── checklist.md            # P0 / P1 / P2 gates the agent must pass
```

## Boundaries

- **Do not** invent new colors, typefaces, or design tokens. The
  kami palette is fixed; if a brief demands a brand color, render it
  as a single `.tag.brush` accent or push back.
- **Do not** introduce a second accent color. Pick ink-blue or
  pick nothing.
- **Do not** mix all three font stacks in one declaration; pick the
  dominant language, override `--serif` on `:root`, let the browser
  per-glyph fallback resolve mixed-script inline content.
- **Do not** use `rgba()` for tag fills. Use the pre-blended solid
  hex from `design-systems/kami/DESIGN.md` §2.
- **Do not** add JavaScript for animation. The page is paper, not
  an app — motion belongs to the reader scrolling.
- **Do not** lift more than two short attributed quotes from any
  one source piece. Anything longer should ship as a separate
  transcript artifact, not a single-page kami document.

## See also

- [`design-systems/kami/DESIGN.md`](../../design-systems/kami/DESIGN.md) — full token spec.
- [`skills/kami-landing/`](../kami-landing/) — sibling skill for
  brand / product one-pagers in the same kami language.
- [`skills/kami-deck/`](../kami-deck/) — sibling skill that ships a
  slide deck in the same kami language.
- Upstream: [`tw93/kami`](https://github.com/tw93/kami) — original
  Claude skill (MIT) that the design system adapts.
