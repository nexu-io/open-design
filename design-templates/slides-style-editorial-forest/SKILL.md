---
name: slides-style-editorial-forest
zh_name: "林间编辑幻灯片"
en_name: "Editorial Forest Slides"
description: "Create or restyle slide decks in the Editorial Forest visual system: forest green, dusty pink, warm cream paper, serif-led magazine rhythm, and mosaic editorial layouts. Use for annual reports, design reviews, research recaps, and brand storytelling; avoid urgent sales pitches or high-adrenaline product launches. Works across HTML, PPTX, Keynote, Google Slides, and other editable slide formats."
triggers:
  - "Editorial Forest Slides"
  - "林间编辑幻灯片"
  - "slides-style-editorial-forest"
  - "Editorial Forest slide style"
  - "apply this slide style"
  - "用这个风格做幻灯片"
tags: ["slides", "presentation", "design-system", "editorial-forest"]
od:
  mode: deck
  category: slides
  surface: web
  preview:
    type: html
    entry: example.html
---

# Editorial Forest Slides

Apply this visual system to a complete presentation without depending on an OpenDesign plugin. The package is self-contained so any agent can inspect one instruction file and clone one editable reference deck.

## Resource map

```
slides-style-editorial-forest/
├── SKILL.md         ← workflow, style system, layouts, and quality gate
├── example.html     ← editable 16:9 reference deck and preview
└── LICENSE          ← upstream license and attribution
```

## Use this skill when

- The user names this style, points to its reference, or asks for the visual qualities in the description.
- The content fits: annual reports, design reviews, research recaps, and brand storytelling.
- Do not select it for urgent sales pitches or high-adrenaline product launches, unless the user explicitly asks for the contrast.

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

- Preserve the visual signature: forest green, dusty pink, warm cream paper, serif-led magazine rhythm, and mosaic editorial layouts.
- Keep every slide focused on one idea. Use evidence, diagrams, or spatial composition instead of defaulting to repeated cards.
- Use only user-provided or sourced facts. Never invent metrics, quotes, people, dates, or citations.
- Keep text editable and semantic. Use CSS or native vector shapes for decoration when possible.
- Do not import colors, fonts, shadows, gradients, radii, or components from another style skill.
- Return the requested artifact plus a short list of source assumptions and any unresolved factual placeholders.
- Visual signature: forest green, dusty pink, warm cream paper, serif-led magazine rhythm, and mosaic editorial layouts.
- Best for: annual reports, design reviews, research recaps, and brand storytelling.
- Avoid for: urgent sales pitches or high-adrenaline product launches.
- **No other colors.** No gradients, no shadows, no purple/indigo, no pure white or black surfaces. `rgba(239,231,212,0.18)` (cream at 18%) is the only permitted alpha, used for chart grid lines.
- **No other fonts.** `Source Serif 4` (weights 300–800, weight 500 is the display default) for all headings and body; `JetBrains Mono` (400/500/700, weight 500 default) for kickers, numbers, captions, and axis labels. Load via the Google Fonts `<link>` already in the seed.
- Display sizes: cover/summary h1 220px at `line-height: 0.92–0.94`, section h2 80–96px, statement quote 140px, KPI numerals 220px (unit 110px in cream). Tracking −0.02em on serif display; mono labels run uppercase at `letter-spacing: 0.12–0.18em`, 24–28px.
- `.label` mono uppercase kickers anchor every slide's top edge; paired left/right labels are the header signature.
- The circular `.mark` monogram (130px, 2px border) on the cover; the bottom `.footline` running foot; 2px rule lines (`border-top: 2px solid`) above meta rows, KPI rows, and summary columns; cards with 6–8px radius and 2–2.5px borders. These devices are the theme — keep them.
- Every slide is one `<section class="…" data-screen-label="NN Label">` authored at a fixed **1920×1080** (`width: 1920px; height: 1080px; overflow: hidden`), a direct child of `<deck-stage aspect="1920/1080" no-rail>`.
- The inlined `deck-stage` web component scales the whole stage uniformly to the viewport: `factor = min(viewportWidth/1920, viewportHeight/1080)`, applied as one `transform: scale()` with letterbox/pillarbox centering, recomputed on resize. Never reflow content per device, never add responsive breakpoints inside slides; all measurements are fixed px at design size.
- Inactive slides stay mounted and are hidden with `visibility`/`opacity` — never `display: none`.
- Navigation ships with the runtime: `←`/`→`, Space, PgUp/PgDn, Home/End, number keys; `#<n>` hash deep-link restore and write-back (plus the small `hashchange` supplement script at the end of the seed); print → one page per slide.
- Keep the `deck-stage:not(:defined){visibility:hidden}` guard and the whole inline runtime `<script>` verbatim. No external JS, no build step — the output is one self-contained `.html` file.
- No scrolling, no overflow, no overlapping panels. Split content into more slides instead of shrinking type.
- Quiet density: one idea per slide; agenda tiles get a 2–6 word headline + mono foot tag; body paragraphs 30px serif, max ~2 per column; KPI rows max 3; step rows max 4.
- Voice matches the design: literary, warm, low-pressure. Sentence-case headlines ending in a period ("Agenda.", "Fewer titles, finer paper.") are part of the look.
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

- Visual signature: forest green, dusty pink, warm cream paper, serif-led magazine rhythm, and mosaic editorial layouts.
- Best for: annual reports, design reviews, research recaps, and brand storytelling.
- Avoid for: urgent sales pitches or high-adrenaline product launches.

---

# Editorial Forest (林间编辑部)

A quiet, considered editorial deck theme — deep forest green, dusty pink, and warm cream paper meet Source Serif 4. Built for quarterly reviews, internal readouts, studio updates, research recaps, and anything that should feel warm and unhurried rather than corporate. Avoid it for content that needs to feel urgent, punchy, or sales-driven.

Ported from the MIT-licensed [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates) `editorial-forest` template.

**Start from `example.html` in this Skill package. It is the locked seed: keep the inline `<deck-stage>` runtime script, the `:root` token block, and every layout skin verbatim — replace only slide content. Do not rewrite the design, do not introduce colors or fonts outside the spec below.**

### Design tokens (locked — list verbatim in `:root`)

```css
:root {
  --green: #2e4a2a;        /* forest green — dark canvas + primary text on cream */
  --green-deep: #243a21;   /* text on pink surfaces */
  --green-lite: #3a5a36;   /* lighter green tile variant */
  --pink: #e89cb1;         /* dusty pink — accent, text on green, bar series A */
  --pink-deep: #d27e96;    /* pink tile border */
  --cream: #efe7d4;        /* warm cream paper — light canvas, text on green */
  --cream-2: #e6dcc4;      /* secondary cream tile */
  --ink: #1a1a17;          /* body text on cream */
  --serif: "Source Serif 4", "Source Serif Pro", Georgia, serif;
  --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
}
```

- **No other colors.** No gradients, no shadows, no purple/indigo, no pure white or black surfaces. `rgba(239,231,212,0.18)` (cream at 18%) is the only permitted alpha, used for chart grid lines.
- **No other fonts.** `Source Serif 4` (weights 300–800, weight 500 is the display default) for all headings and body; `JetBrains Mono` (400/500/700, weight 500 default) for kickers, numbers, captions, and axis labels. Load via the Google Fonts `<link>` already in the seed.

### Typography & signature devices

- Display sizes: cover/summary h1 220px at `line-height: 0.92–0.94`, section h2 80–96px, statement quote 140px, KPI numerals 220px (unit 110px in cream). Tracking −0.02em on serif display; mono labels run uppercase at `letter-spacing: 0.12–0.18em`, 24–28px.
- `.label` mono uppercase kickers anchor every slide's top edge; paired left/right labels are the header signature.
- The circular `.mark` monogram (130px, 2px border) on the cover; the bottom `.footline` running foot; 2px rule lines (`border-top: 2px solid`) above meta rows, KPI rows, and summary columns; cards with 6–8px radius and 2–2.5px borders. These devices are the theme — keep them.

### Mixed scheme rhythm (8 slides)

Alternate dark, light, and pink canvases — never run more than two same-tone slides in a row:

| # | Master | Class | Canvas | Role |
|---|--------|-------|--------|------|
| 1 | Cover | `.cover` | green | monogram topbar, 220px serif title, mono footline |
| 2 | Agenda | `.agenda` | cream | 5-tile mosaic grid (`t-green` spans 2 rows, `t-pink`/`t-cream`/`t-greenLite`) |
| 3 | Statement | `.statement` | pink | 140px serif quote + mono attribution row |
| 4 | Two-column | `.two-col` | cream | green figure panel (880px) + serif narrative + 3-col `dl.meta` |
| 5 | Data | `.data` | green | pure-CSS grouped bar chart (pink/cream bars, mono axes, grid-lines) |
| 6 | Framework | `.framework` | cream | 4 step cards: outline → `pinkfill` → `fill` → outline |
| 7 | Stats | `.stats` | green | 3 KPI callouts, 220px pink numerals over a pink rule |
| 8 | Summary | `.summary` | green | 220px pink closing word + 3-column takeaways |

Reuse these masters for longer decks (a second `.two-col` or `.data`, another `.statement`); keep the tone alternation. Charts stay pure CSS/HTML (percentage-height `.bar` divs); diagrams and icons are inline SVG stroked in token colors only — never Chart.js, mermaid, or remote images.

### Stage system & runtime (locked)

- Every slide is one `<section class="…" data-screen-label="NN Label">` authored at a fixed **1920×1080** (`width: 1920px; height: 1080px; overflow: hidden`), a direct child of `<deck-stage aspect="1920/1080" no-rail>`.
- The inlined `deck-stage` web component scales the whole stage uniformly to the viewport: `factor = min(viewportWidth/1920, viewportHeight/1080)`, applied as one `transform: scale()` with letterbox/pillarbox centering, recomputed on resize. Never reflow content per device, never add responsive breakpoints inside slides; all measurements are fixed px at design size.
- Inactive slides stay mounted and are hidden with `visibility`/`opacity` — never `display: none`.
- Navigation ships with the runtime: `←`/`→`, Space, PgUp/PgDn, Home/End, number keys; `#<n>` hash deep-link restore and write-back (plus the small `hashchange` supplement script at the end of the seed); print → one page per slide.
- Keep the `deck-stage:not(:defined){visibility:hidden}` guard and the whole inline runtime `<script>` verbatim. No external JS, no build step — the output is one self-contained `.html` file.

### Content guardrails

- No scrolling, no overflow, no overlapping panels. Split content into more slides instead of shrinking type.
- Quiet density: one idea per slide; agenda tiles get a 2–6 word headline + mono foot tag; body paragraphs 30px serif, max ~2 per column; KPI rows max 3; step rows max 4.
- Voice matches the design: literary, warm, low-pressure. Sentence-case headlines ending in a period ("Agenda.", "Fewer titles, finer paper.") are part of the look.

### Attribution

Template design, palette, and the `deck-stage` runtime come from the upstream MIT-licensed [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates) (© 2026 Zara Zhang), template `editorial-forest`. The LICENSE file ships in this Skill package; keep it in place when redistributing.

## Layout registry

Use this registry when outlining a deck or when content no longer fits the current page. Use the closest registered layout before creating a new one. A new layout is acceptable only when it recombines the same grid, type roles, color budget, and signature devices.

Registered layout IDs: `cover`, `agenda`, `statement`, `two-column`, `data`, `framework`, `stats`, `closing`

### Density modes

- `speaker`: one idea per slide, up to three short bullets or four compact items, strong pacing, and generous negative space. Split content before reducing body text below 22 px on a 1600 × 900 canvas.
- `reader`: self-contained evidence for async reading, up to eight concise bullets or six comparable items. Split content before reducing body text below 18 px.
- The template default is `reader`. Change it only when the delivery context requires the other mode; declare the choice with `data-density` in HTML or in the deck's authoring notes for native formats.

### Registered layouts

| ID | Role | Use when | Guardrail |
|---|---|---|---|
| `cover` | Cover | Open with one memorable thesis and minimal supporting copy. | Keep the title dominant; no agenda, dashboard, or multi-card payload. |
| `agenda` | Agenda | Set the sequence and expectation for the deck. | Use short labels and preserve scanning rhythm. |
| `statement` | Statement | Make one quantitative finding the visual hero. | State the takeaway; do not show decorative or invented data. |
| `two-column` | Two Column | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `data` | Data | Make one quantitative finding the visual hero. | State the takeaway; do not show decorative or invented data. |
| `framework` | Framework | Explain a reusable decision model or method. | Show relationships, not a decorative collection of boxes. |
| `stats` | Stats | Compare a small set of related measures. | Keep units and denominators consistent. |
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
