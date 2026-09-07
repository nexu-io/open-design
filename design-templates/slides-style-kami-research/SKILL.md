---
name: "slides-style-kami-research"
en_name: "Kami Research Slides"
zh_name: "和纸研究幻灯片"
description: "Create or restyle slide decks in the Kami Research visual system: ink-blue and parchment, single-weight serif typography, print rhythm, and restrained research chrome. Use for academic research, lab meetings, investment reviews, and evidence-led narratives; avoid playful launches or multi-color campaign decks. Works across HTML, PPTX, Keynote, Google Slides, and other editable slide formats."
zh_description: "墨蓝和羊皮纸、单一字重衬线、印刷节奏、克制的研究外壳，适合学术研究、实验室会议、投资评审、证据导向叙事。"
tags:
  - "slides"
  - "presentation"
  - "design-system"
  - "kami-research"
triggers:
  - "Kami Research Slides"
  - "和纸研究幻灯片"
  - "slides-style-kami-research"
  - "Kami Research slide style"
  - "apply this slide style"
  - "用这个风格做幻灯片"
  - "research deck"
  - "academic slides"
  - "lab meeting"
  - "parchment"
  - "evidence-led"
  - "investment review"
  - "研究汇报 PPT"
  - "学术 PPT"
  - "组会"
  - "羊皮纸"
  - "投资评审"
od:
  mode: "deck"
  task_type: "ppt"
  surface: "web"
  scenario: "education"
  category: "slides-style"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
---
# Kami Research Slides

Apply this visual system to a complete presentation without depending on an OpenDesign plugin. The package is self-contained so any agent can inspect one instruction file and clone one editable reference deck.

## Resource map

```
slides-style-kami-research/
├── SKILL.md         ← workflow, style system, layouts, and quality gate
├── example.html     ← editable 16:9 reference deck and preview
└── LICENSE          ← upstream license and attribution
```

## Use this skill when

- The user names this style, points to its reference, or asks for the visual qualities in the description.
- The content fits: academic research, lab meetings, investment reviews, and evidence-led narratives.
- Do not select it for playful launches or multi-color campaign decks, unless the user explicitly asks for the contrast.

## Workflow

1. Confirm or infer the audience, decision or communication goal, source material, language, output format, and approximate slide count. Ask only when a missing choice would materially change the result.
2. Read the style system, layout registry, and quality gate below before composing. Build a one-sentence narrative, then assign one job and one primary claim to every slide.
3. Choose `speaker` or `reader` density. Select a registered layout that matches the information shape before inventing a new one.
4. For HTML, copy [example.html](example.html) to the requested output path. Preserve its 16:9 stage, navigation runtime, tokens, layout classes, and active-slide behavior.
5. For PPTX, Keynote, Google Slides, Figma Slides, or another native format, recreate the same token values and composition grammar with editable native elements. The HTML is the visual source of truth, not a required runtime.
6. Replace all sample claims with user-provided or sourced content. Rewrite or split content before shrinking type, breaking the grid, or introducing a one-off component.
7. Render and inspect every slide at 16:9 plus one narrow viewport. Fix clipping, collisions, unreadable type, navigation intrusion, broken image slots, and off-style additions before handoff.

## Output contract

- Deliver the requested editable artifact, not a screenshot-only deck.
- Keep the deck self-contained unless the requested format requires linked assets.
- Return a short summary naming the output file, source assumptions, and unresolved factual placeholders. Do not paste the full HTML into chat unless the user explicitly asks for source.

## Non-negotiables

- Preserve the visual signature: ink-blue and parchment, single-weight serif typography, print rhythm, and restrained research chrome.
- Keep every slide focused on one idea. Use evidence, diagrams, or spatial composition instead of defaulting to repeated cards.
- Use only user-provided or sourced facts. Never invent metrics, quotes, people, dates, or citations.
- Keep text editable and semantic. Use CSS or native vector shapes for decoration when possible.
- Do not import colors, fonts, shadows, gradients, radii, or components from another style skill.
- Return the requested artifact plus a short list of source assumptions and any unresolved factual placeholders.
- Visual signature: ink-blue and parchment, single-weight serif typography, print rhythm, and restrained research chrome.
- Best for: academic research, lab meetings, investment reviews, and evidence-led narratives.
- Avoid for: playful launches or multi-color campaign decks.
- N viewport-sized slides (6-15 is the sweet spot) laid out
- **Cover and chapter slides** flip background to ink-blue
- **Content / stats / quote / CTA slides** stay on parchment
- **Per-slide chrome strip**: brand mark · deck title · live slide
- **Tabular-nums** on every counter, metric, page number.
- **Coral-free** — kami's accent is ink-blue. Progress bar and dot
- **Keyboard / wheel / touch nav**, ESC overview grid, dot indicator.
- **Multilingual stack** — EN / zh-CN / ja, set on `:root` via
- [ ] All cover / chapter / end slides use ink-blue background
- [ ] Ink-blue covers ≤ 5% of any parchment slide's surface.
- [ ] Slide titles use serif weight 500 only. No italic.
- [ ] All numeric stacks (counter, metrics, page numbers) carry
- [ ] Press `→` / `Space` / scroll. Smoothly slides one viewport
- [ ] Press `Esc`. Overview grid appears with scaled thumbnails.
- [ ] Resize to 1080px and 640px. Cover / content collapse to a
- [ ] Lighthouse: contrast AA, font-display swap, no layout shift.
- **Do not** introduce a second accent color. Pick ink-blue or
- **Do not** use italic anywhere — emphasis swaps to ink-blue.
- **Do not** use `rgba()` for tag fills; pre-blend over parchment
- **Do not** add a router. This is a single-file artifact.
- **Do not** reuse Atelier Zero collage imagery (the open-design-landing
- [`kami-landing`](../kami-landing/) — long-form one-pager sister skill.
- [`design-systems/kami/DESIGN.md`](../../design-systems/kami/DESIGN.md) — token spec.
- [`open-design-landing-deck`](../open-design-landing-deck/) — same
- Upstream: [`tw93/kami`](https://github.com/tw93/kami) — original
- `speaker`: one idea per slide, up to three short bullets or four compact items, strong pacing, and generous negative space. Split content before reducing body text below 22 px on a 1600 × 900 canvas.
- `reader`: self-contained evidence for async reading, up to eight concise bullets or six comparable items. Split content before reducing body text below 18 px.
- The template default is `reader`. Change it only when the delivery context requires the other mode; declare the choice with `data-density` in HTML or in the deck's authoring notes for native formats.
- Preview frames must look like real slides from the requested deck. Never place QA badges, file names, template slugs, prompt notes, paths, or workflow labels on the slide itself.
- Use real deck chrome only: title, section, date, author, organisation, or page number.
- Wait for entry motion to settle before capturing screenshots.
- Author on one 16:9 canvas and scale the entire stage uniformly. Do not reflow slide content at narrow browser widths. Letterboxing is acceptable; distortion and cropping are not.
- Keep meaningful content inside the slide bounds and outside navigation controls at the design canvas, 1280 × 720, and one narrow viewport.
- Preserve reduced-motion readability: every slide must remain complete when animation is disabled.
- Apply the density mode declared in the layout registry above.
- Rewrite or split before shrinking. On a 1600 × 900 canvas, speaker body text should normally be at least 22 px; reader body text at least 18 px; functional metadata may be 12–16 px when contrast is strong.
- A paragraph longer than 40 words requires deliberate reader-mode treatment. A title should remain readable at 50% thumbnail scale.
- Intentional editorial overlaps are allowed only when every word remains legible and the overlap is part of a registered layout.
- Give every content image a named slot: `hero-16x9`, `evidence-16x10`, `evidence-4x3`, `grid-1x1`, `portrait-3x4`, `brand-native`, or another explicit role-ratio pair. Use `decorative-native` only for non-semantic texture or ornament.
- Evidence screenshots and text-heavy UI use contain-style fitting; do not crop critical labels or values. Photographs may use cover-style fitting only after checking faces, products, and quiet zones.
- Images in one comparison or grid use the same ratio, height, crop logic, and caption density.
- Generated imagery is an asset, not a precomposed slide: it must not contain duplicate titles, page numbers, footers, logos, or fake data.

## Style system

This is the detailed source specification adapted from the selected OpenDesign deck. In this standalone Skill, the canonical seed is `example.html`; plugin registration is not required.

> Portability note: the historical source notes below may mention a plugin, an artifact wrapper, or historical packaging paths. For this standalone Skill, follow the root `SKILL.md` for packaging and output; use the material below only as the authoritative visual and layout specification.

### Selection summary

- Visual signature: ink-blue and parchment, single-weight serif typography, print rhythm, and restrained research chrome.
- Best for: academic research, lab meetings, investment reviews, and evidence-led narratives.
- Avoid for: playful launches or multi-color campaign decks.

---

# kami-deck

Sister skill to [`kami-landing`](../kami-landing/). Produces a single
self-contained HTML file: a horizontal magazine-style swipe deck in
the **kami (紙 / 纸)** design system — print rhythm, ink-blue accent,
serif at one weight, no italic, no cool grays.

The navigation model is intentionally borrowed from the
[`guizang-ppt`](../guizang-ppt/) skill — `←/→` arrow keys, wheel /
swipe, ESC for the overview grid. The aesthetic stays kami: parchment
content slides, ink-blue cover and chapter slides, serif everywhere.

> **Design system source of truth:**
> [`design-systems/kami/DESIGN.md`](../../design-systems/kami/DESIGN.md).
> Read it before shipping. Tokens, type rules, and forbidden colors
> all live there. Slide-specific scale ratios (macro × 1.6,
> letter-spacing × 0.6 vs. print) are documented in §3 "Hierarchy"
> and §5 "Layout Principles · Slides".

### What you get

- N viewport-sized slides (6-15 is the sweet spot) laid out
  horizontally on one transformed flex track.
- **Cover and chapter slides** flip background to ink-blue
  (`#1B365D`) with ivory text — the only place dark theme is used.
- **Content / stats / quote / CTA slides** stay on parchment
  (`#f5f4ed`) with serif at weight 500.
- **Per-slide chrome strip**: brand mark · deck title · live slide
  counter (`01 / 09`).
- **Tabular-nums** on every counter, metric, page number.
- **Coral-free** — kami's accent is ink-blue. Progress bar and dot
  nav are ink-blue too.
- **Keyboard / wheel / touch nav**, ESC overview grid, dot indicator.
- **Multilingual stack** — EN / zh-CN / ja, set on `:root` via
  the `language` parameter.

### Slide types

| Kind        | Background | Use it for                                                |
| :---------- | :--------- | :-------------------------------------------------------- |
| `cover`     | ink-blue   | Title plate at the start. Centered serif title + tagline. |
| `chapter`   | ink-blue   | Roman/Arabic numeral chapter divider.                     |
| `content`   | parchment  | Section number + title + body + optional bullets.         |
| `stats`     | parchment  | 3-4 metric cells (value · label · sub).                   |
| `quote`     | parchment  | Pull quote with ink-blue left rule + author signature.    |
| `cta`       | parchment  | Closing pitch + 1-2 buttons.                              |
| `end`       | ink-blue   | Mega serif kicker word + colophon footer.                 |

A typical 11-slide deck:

```
1. cover     — ink-blue title plate
2. chapter   — "01 / Why now"
3. content   — manifesto
4. content   — capabilities + bullets
5. stats     — 4 numbers
6. chapter   — "02 / How it feels"
7. content   — method
8. content   — selected work
9. quote     — testimonial
10. cta      — primary action
11. end      — ink-blue kicker
```

### Workflow

#### 1. Gather the brief

Ask in two rounds (don't dump the whole list at once):

1. Identity round — name, mark, tagline, location, edition, language.
2. Content round — for each slide, kind + the typed fields.

#### 2. Pick the language stack

Same as [`kami-landing`](../kami-landing/SKILL.md#2-pick-the-language-stack):
EN → Charter, zh-CN → TsangerJinKai02 / Source Han Serif, ja →
YuMincho. JA also overrides `--olive` to `#4d4c48` because YuMincho
strokes are thinner.

#### 3. Write `index.html`

Output a single file with all CSS inline. Mirror the structure of
[`example.html`](example.html). Use only the tokens from
`design-systems/kami/DESIGN.md`.

The runtime script (keyboard / wheel / touch nav, dot indicator,
progress bar, ESC overview) should match the model documented in
[`open-design-landing-deck/scripts/compose.ts`](../open-design-landing-deck/scripts/compose.ts).
Do **not** reuse the open-design-landing-deck CSS; the visual
language is different.

#### 4. Self-check

- [ ] All cover / chapter / end slides use ink-blue background
      (`#1B365D`) with ivory text. All other slides are on
      parchment.
- [ ] Ink-blue covers ≤ 5% of any parchment slide's surface.
- [ ] Slide titles use serif weight 500 only. No italic.
- [ ] All numeric stacks (counter, metrics, page numbers) carry
      `font-variant-numeric: tabular-nums`.
- [ ] Press `→` / `Space` / scroll. Smoothly slides one viewport
      to the right; dot nav advances; the ink-blue progress bar
      ticks forward.
- [ ] Press `Esc`. Overview grid appears with scaled thumbnails.
- [ ] Resize to 1080px and 640px. Cover / content collapse to a
      single column; dot nav still works.
- [ ] Lighthouse: contrast AA, font-display swap, no layout shift.

### Boundaries

- **Do not** introduce a second accent color. Pick ink-blue or
  pick nothing.
- **Do not** use italic anywhere — emphasis swaps to ink-blue.
- **Do not** use `rgba()` for tag fills; pre-blend over parchment
  and use solid hex from the table in
  `design-systems/kami/DESIGN.md` §2.
- **Do not** add a router. This is a single-file artifact.
- **Do not** reuse Atelier Zero collage imagery (the open-design-landing
  visual system). Kami is gradient-free, image-light, and hierarchy
  is carried by type.

### See also

- [`kami-landing`](../kami-landing/) — long-form one-pager sister skill.
- [`design-systems/kami/DESIGN.md`](../../design-systems/kami/DESIGN.md) — token spec.
- [`open-design-landing-deck`](../open-design-landing-deck/) — same
  horizontal swipe nav model, different visual language (Atelier Zero).
- Upstream: [`tw93/kami`](https://github.com/tw93/kami) — original
  Claude skill (MIT). Kami's slides.py template documents the macro
  × 1.6 / micro × 0.6 ratios this skill applies.

## Layout registry

Use this registry when outlining a deck or when content no longer fits the current page. Use the closest registered layout before creating a new one. A new layout is acceptable only when it recombines the same grid, type roles, color budget, and signature devices.

Registered layout IDs: `cover`, `chapter`, `content`, `stats`, `quote`, `cta`, `closing`

### Density modes

- `speaker`: one idea per slide, up to three short bullets or four compact items, strong pacing, and generous negative space. Split content before reducing body text below 22 px on a 1600 × 900 canvas.
- `reader`: self-contained evidence for async reading, up to eight concise bullets or six comparable items. Split content before reducing body text below 18 px.
- The template default is `reader`. Change it only when the delivery context requires the other mode; declare the choice with `data-density` in HTML or in the deck's authoring notes for native formats.

### Registered layouts

| ID | Role | Use when | Guardrail |
|---|---|---|---|
| `cover` | Cover | Open with one memorable thesis and minimal supporting copy. | Keep the title dominant; no agenda, dashboard, or multi-card payload. |
| `chapter` | Chapter | Open a chapter with a framing claim. | Prefer a single claim over explanatory detail. |
| `content` | Content | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `stats` | Stats | Compare a small set of related measures. | Keep units and denominators consistent. |
| `quote` | Quote | Give one attributed voice or qualitative proof point room to breathe. | Keep attribution visible and never fabricate the quote. |
| `cta` | Cta | State the requested action and its immediate consequence. | One ask only; no new argument. |
| `closing` | Closing | End with the decision, takeaway, or next action. | Do not introduce new evidence or a second competing message. |

### Selection rules

1. Start from the claim and evidence shape, not from visual novelty.
2. Reuse a layout when the information hierarchy matches, even if the subject matter differs.
3. Split content when a layout exceeds its density limit; do not create smaller text as a workaround.
4. Preserve the style's alignment axes, spacing rhythm, and signature devices across every registered layout.
5. In HTML, set `data-layout="<id>"` on every slide. In PPTX, Keynote, Google Slides, or Figma Slides, record the same ID in speaker notes, layer names, or authoring metadata when practical.

## Quality gate

Use this quality gate after the outline is stable and again before delivery. It protects the visual system without tying the Skill to one rendering tool.

### Preview authenticity

- Preview frames must look like real slides from the requested deck. Never place QA badges, file names, template slugs, prompt notes, paths, or workflow labels on the slide itself.
- Use real deck chrome only: title, section, date, author, organisation, or page number.
- Wait for entry motion to settle before capturing screenshots.

### Fixed-stage behavior

- Author on one 16:9 canvas and scale the entire stage uniformly. Do not reflow slide content at narrow browser widths. Letterboxing is acceptable; distortion and cropping are not.
- Keep meaningful content inside the slide bounds and outside navigation controls at the design canvas, 1280 × 720, and one narrow viewport.
- Preserve reduced-motion readability: every slide must remain complete when animation is disabled.

### Typography and density

- Apply the density mode declared in the layout registry above.
- Rewrite or split before shrinking. On a 1600 × 900 canvas, speaker body text should normally be at least 22 px; reader body text at least 18 px; functional metadata may be 12–16 px when contrast is strong.
- A paragraph longer than 40 words requires deliberate reader-mode treatment. A title should remain readable at 50% thumbnail scale.
- Intentional editorial overlaps are allowed only when every word remains legible and the overlap is part of a registered layout.

### Images and evidence

- Give every content image a named slot: `hero-16x9`, `evidence-16x10`, `evidence-4x3`, `grid-1x1`, `portrait-3x4`, `brand-native`, or another explicit role-ratio pair. Use `decorative-native` only for non-semantic texture or ornament.
- Evidence screenshots and text-heavy UI use contain-style fitting; do not crop critical labels or values. Photographs may use cover-style fitting only after checking faces, products, and quiet zones.
- Images in one comparison or grid use the same ratio, height, crop logic, and caption density.
- Generated imagery is an asset, not a precomposed slide: it must not contain duplicate titles, page numbers, footers, logos, or fake data.

### Rendered inspection

Check every slide, not only the first two:

1. No text, media, rules, or decorative shapes clip at any edge.
2. No text block collides with another text block, a color seam, or a navigation control.
3. Bottom content stays clearly above pagination and controls.
4. Titles, body copy, labels, units, and citations remain readable at presentation scale.
5. Empty space looks intentional; fixing overflow must not create a large accidental void.
6. Colors, typography, radii, shadows, and decorative devices remain inside the style system above.

For HTML, inspect the rendered deck in a real browser at the target canvas and one narrow viewport. Structural checks do not replace visual inspection.
