---
name: kami-landing
description: >
  Produce a print-grade single-page kami (紙 / 纸) document — warm
  parchment canvas, ink-blue accent, serif at one weight, no italic,
  no cool grays. The output reads like a professional white paper or
  studio one-pager, not an app UI. Multilingual by design (EN ·
  zh-CN · ja). One self-contained HTML file, zero dependencies.
triggers:
  - kami
  - 紙
  - 纸
  - paper one-pager
  - 白皮书
  - white paper
  - parchment landing
  - editorial document
  - print-grade page
  - kami landing
od:
  category: brand-page
  surface: web
  mode: prototype
  platform: desktop
  scenario: marketing
  featured: 0.05
  audience: founders, design studios, OSS maintainers, researchers
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
  - id: brand
    label: Brand identity
    description: Name, tagline, location, edition / version, primary URL.
  - id: hero
    label: Hero / cover block
    description: Eyebrow + headline (one line, ≤ 6 words at display size) + tagline + 3 hero meta tokens.
  - id: manifesto
    label: Manifesto paragraph + signature
  - id: metrics
    label: 3-6 metric tiles (value · label · sub)
  - id: chapters
    label: 3-5 numbered chapters (title + lede + body)
  - id: footer
    label: License · year · contact + 3-column site index
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
      Sets the primary serif stack on `:root`. EN uses Charter,
      zh-CN uses TsangerJinKai02 / Source Han Serif, ja uses
      YuMincho. Mixed-script content is allowed inline; the browser
      resolves per-glyph fallback automatically.
outputs:
  - path: <out>/index.html
    description: Self-contained HTML, kami CSS inlined, zero JS, zero external dependencies beyond Google Fonts.
capabilities_required:
  - file-write
example_prompt: |
  Build me a kami-style one-pager for "Lumen Field", an indie studio
  shipping a soundscape app for focus. Hero headline "Soundscapes for
  focused work.", manifesto paragraph + signature "by Lumen Field,
  Berlin", 3 metric tiles (12 soundscapes / 4 presets / 1 daily ritual),
  three numbered chapters covering the studio, the app, and the roadmap.
  English-language stack.
---

# kami-landing

Produce a single-page document in the **kami (紙 / 纸)** design system.
The aesthetic borrows from editorial print, technical white papers,
and old typewritten correspondence — the goal is *good content on
good paper*, not *modern app UI*.

> **Design system source of truth:** [`design-systems/kami/DESIGN.md`](../../design-systems/kami/DESIGN.md).
> Read it before shipping. Tokens, type rules, the "ten invariants",
> and forbidden colors all live there.

## What you get

A single self-contained HTML file with:

- **Warm parchment canvas** (`#f5f4ed`) — never `#ffffff`.
- **Single chromatic accent** — ink-blue (`#1B365D`), used on the
  section number, the headline accent word, the left rule of the
  manifesto, and the metric values. Anywhere else, ink-blue must
  cover ≤ 5% of the document surface area.
- **Serif at one weight (500) for hierarchy** — Charter (EN),
  TsangerJinKai02 / Source Han Serif (CN), or YuMincho (JA),
  selected by the `language` parameter. **No italic anywhere.**
- **Tight print rhythm** — line-heights 1.10–1.55, letter-spacing
  per language (0 for EN, 0.35px for CN, 0.02em for JA).
- **Numeric stacks set in `font-variant-numeric: tabular-nums`** so
  metric columns and pagination digits sit cleanly aligned.
- **Depth via 1px rings + whisper shadows** (`0 4px 24px rgba(0,0,0,0.05)`).
  No hard drop shadows, no neumorphism, no backdrop-filter blurs.
- **Tag fills as solid hex** (e.g. `#E4ECF5`), never `rgba()` —
  print renderers double-paint alpha tags.
- **Responsive** at 1280 / 980 / 768 / 560.

## Page structure

```text
1. Eyebrow row     — locale switcher · edition · version (12px sans uppercase)
2. Hero            — display headline (96–106px serif 500), tagline (21px),
                     three hero-token chips (paper-tinted)
3. Manifesto       — pull paragraph in serif 400, 20px, 1.65 LH, with
                     ink-blue left-rule and signature footer
4. Metrics row     — 3-6 cells: value (24px serif 500 ink-blue, tabular-nums),
                     label (12px serif 500 olive)
5. Chapters        — numbered (`01`, `02`, …) ink-blue serif 500 14px,
                     section title 28-32px, body 14-15px
6. Footer          — kicker word (mega serif 500), license · year · contact,
                     three-column site index in 12px serif 500
```

## Workflow contract

### 1. Gather brand brief

Use `AskQuestion` (or equivalent) to collect the brand brief in
chunks. Don't dump the whole input list on the user; ask in two
rounds:

1. Identity round — name, tagline, location, edition / version,
   primary URL, dominant language.
2. Content round — manifesto paragraph + signature, 3-6 metric
   tiles, 3-5 chapter (title + lede + body) entries.

### 2. Pick the language stack

The `language` parameter controls which `--serif` stack is set on
`:root`. Pick based on the dominant language of the manifesto and
chapter body copy:

| `language` | `--serif`                                                 | Notes                                  |
| :--------- | :-------------------------------------------------------- | :------------------------------------- |
| `en`       | Charter, Georgia, Palatino, Times New Roman, serif         | default                                |
| `zh-CN`    | TsangerJinKai02, Source Han Serif SC, Songti SC, Georgia   | letter-spacing 0.35px on body          |
| `ja`       | YuMincho, Hiragino Mincho ProN, Source Han Serif JP        | also override `--olive` to `#4d4c48` (YuMincho strokes are thinner) |

Inline mixed-script content is fine — the browser per-glyph fallback
chain handles it. Do **not** chain all three families inside one
`font-family` declaration; that dilutes character.

### 3. Write `index.html`

Output a single file with all CSS inline. Mirror the structure of
[`example.html`](./example.html) and use only the tokens from
`design-systems/kami/DESIGN.md`. Do **not** invent new colors,
weights, or font families.

Component primitives the agent can drop in (all defined in the
example's `<style>` block):

- `.eyebrow`, `.label` — sans-serif overlines
- `.metric` — value + label vertical pair
- `.section-num` + `.section-title` + `.section-lede`
- `.tag.standard`, `.tag.brush` — solid-hex tags (one brush max per page)
- `.quote` — left-rule serif 500 quote
- `ul.dash` — en-dash bullets in ink-blue
- `.code` — ivory-bg, 1px-border code block
- `.footer-kicker` — mega serif 500 word

Tag every editable element with `data-od-id="<unique-slug>"` so the
host app's comment mode can target it.

### 4. Self-check before delivering

- [ ] Page background is parchment (`#f5f4ed`), never `#ffffff`.
- [ ] Ink-blue (`#1B365D`) covers ≤ 5% of visible surface — count
      section numbers, the manifesto rule, the metric values, the
      headline accent. Total ≤ 5%.
- [ ] All grays are warm (R ≈ G > B). No `slate-*`, no `#f3f4f6`.
- [ ] Serif weight stays at 500 — no `font-weight: 700` or `900`
      anywhere on serif text.
- [ ] No `font-style: italic` anywhere. Emphasis swaps to ink-blue
      color or a `.tag` instead.
- [ ] All numeric stacks (metric values, pagination, dates, financial
      figures) carry `font-variant-numeric: tabular-nums`.
- [ ] All tag fills are solid hex (e.g. `#E4ECF5`), never `rgba()`.
- [ ] Shadows: at most a `1px` ring or a `0 4px 24px rgba(0,0,0,0.05)`
      whisper. No hard drop shadows.
- [ ] Headline ≤ 6 words at display size; CJK ≤ 8 characters.
- [ ] At 768px and 560px the layout collapses to one column without
      horizontal scroll.

## Files in this skill

```text
skills/kami-landing/
├── SKILL.md                 # this contract
├── README.md                # human quick-start
└── example.html             # canonical Open Design rendering
```

## Boundaries

- **Do not** invent new colors or typefaces. The kami palette is
  fixed; if a brief demands a brand color, push back or render the
  brand color as a single `.tag.brush` accent.
- **Do not** introduce a second accent color. Pick ink-blue or pick
  nothing.
- **Do not** mix all three font stacks in one declaration; pick the
  dominant language, override `--serif` on `:root`, and let the
  browser per-glyph fallback resolve mixed-script inline content.
- **Do not** use `rgba()` for tag fills — print renderers
  double-paint alpha tags. Use the pre-blended solid hex from the
  table in `design-systems/kami/DESIGN.md` §2.
- **Do not** add JavaScript for animation. The page is paper, not
  an app — motion belongs to the reader scrolling.

## See also

- [`design-systems/kami/DESIGN.md`](../../design-systems/kami/DESIGN.md) — the full token spec.
- [`skills/kami-deck/`](../kami-deck/) — sister skill that produces a
  slide deck in the same kami language.
- Upstream: [`tw93/kami`](https://github.com/tw93/kami) — original
  Claude skill (MIT) that the design system adapts.
