---
name: slides-style-notebook-tabs
zh_name: "活页标签幻灯片"
en_name: "Notebook Tabs Slides"
description: "Create or restyle slide decks in the Notebook Tabs visual system: layered notebook sheets, colored edge tabs, binder holes, ruled paper, and annotated editorial typography. Use for coursework, defense roadmaps, workshops, study notes, and structured research; avoid minimal luxury branding or cinematic keynotes. Works across HTML, PPTX, Keynote, Google Slides, and other editable slide formats."
triggers:
  - "Notebook Tabs Slides"
  - "活页标签幻灯片"
  - "slides-style-notebook-tabs"
  - "Notebook Tabs slide style"
  - "apply this slide style"
  - "用这个风格做幻灯片"
tags: ["slides", "presentation", "design-system", "notebook-tabs"]
od:
  mode: deck
  category: slides
  surface: web
  preview:
    type: html
    entry: example.html
---

# Notebook Tabs Slides

Apply this visual system to a complete presentation without depending on an OpenDesign plugin. The package is self-contained so any agent can inspect one instruction file and clone one editable reference deck.

## Resource map

```
slides-style-notebook-tabs/
├── SKILL.md         ← workflow, style system, layouts, and quality gate
├── example.html     ← editable 16:9 reference deck and preview
└── LICENSE          ← upstream license and attribution
```

## Use this skill when

- The user names this style, points to its reference, or asks for the visual qualities in the description.
- The content fits: coursework, defense roadmaps, workshops, study notes, and structured research.
- Do not select it for minimal luxury branding or cinematic keynotes, unless the user explicitly asks for the contrast.

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

- Preserve the visual signature: layered notebook sheets, colored edge tabs, binder holes, ruled paper, and annotated editorial typography.
- Keep every slide focused on one idea. Use evidence, diagrams, or spatial composition instead of defaulting to repeated cards.
- Use only user-provided or sourced facts. Never invent metrics, quotes, people, dates, or citations.
- Keep text editable and semantic. Use CSS or native vector shapes for decoration when possible.
- Do not import colors, fonts, shadows, gradients, radii, or components from another style skill.
- Return the requested artifact plus a short list of source assumptions and any unresolved factual placeholders.
- Visual signature: layered notebook sheets, colored edge tabs, binder holes, ruled paper, and annotated editorial typography.
- Best for: coursework, defense roadmaps, workshops, study notes, and structured research.
- Avoid for: minimal luxury branding or cinematic keynotes.
- Every deck is authored on a fixed **1920×1080** canvas: `.deck-viewport` (fills the window) wraps `.deck-stage` (1920×1080, `transform-origin: 0 0`).
- JavaScript scales the whole stage uniformly: `factor = min(innerWidth/1920, innerHeight/1080)`, then `translate(x, y) scale(factor)` to center with letterbox/pillarbox; re-run on `resize`. This is the viewport-base.css system — the full file is already inlined in the seed.
- Never reflow slide content per device. No responsive breakpoints inside slides. All measurements are fixed px at the 1920×1080 design size (the upstream preset's `clamp()` tab sizing is superseded by stage scaling — use fixed px).
- Slide switching toggles `.active`/`.visible` (visibility/opacity/pointer-events) — never `display: none`.
- Keyboard (`←`/`→`/`↑`/`↓`/Space/PageUp/PageDown/Home/End), debounced wheel (~650ms), touch swipe (≥40px), and `#/<index>` hash routing with deep-link restore. The page counter lives in `.deck-controls`, fixed-positioned outside the scaled stage.
- Entrances only via `.reveal` elements transitioning when the slide gains `.visible`; stagger with `transition-delay` steps of ~0.1s (`.d1`–`.d6` helper classes).
- One signature easing: `cubic-bezier(0.16, 1, 0.3, 1)`. Animate only `transform` and `opacity`. Chart bars grow with `transform: scaleY` from `transform-origin: bottom`.
- `prefers-reduced-motion` support is mandatory (already in the inlined stage CSS).
- Single self-contained `.html`: all CSS and JS inline, zero build step, zero external JS libraries or CDN scripts (no Chart.js, no mermaid — pure CSS/SVG only). Icons are inline SVG. No remote images. The only allowed external reference is the Google Fonts `@import`.
- Comment every block: `/* === SECTION NAME === */`.
- **From `example.html`, change only the content** (text, section/tab names, data values, icon paths). The tokens, paper device, tabs, chrome, and controller script are the product — do not rewrite them, and never introduce colors or fonts outside this spec.
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

- Visual signature: layered notebook sheets, colored edge tabs, binder holes, ruled paper, and annotated editorial typography.
- Best for: coursework, defense roadmaps, workshops, study notes, and structured research.
- Avoid for: minimal luxury branding or cinematic keynotes.

---

# Notebook Tabs (索引笔记本)

A theme-locked deck plugin derived from the MIT-licensed [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides) "Notebook Tabs" style preset (STYLE_PRESETS.md section 5). The whole deck reads as one physical, editorially typeset notebook: every slide is a cream paper page floating on a dark desk, with a colorful tab index on the right fore-edge and binder holes on the left.

**Start from `example.html` in this Skill package. It is the proven seed: keep its stage CSS, the paper/holes/tabs device, the `:root` token block, and the entire `SlidePresentation` controller script verbatim — replace only the slide content. Do not redesign, do not introduce any color or font outside this spec.**

### Fixed 16:9 stage (locked scaling system)

- Every deck is authored on a fixed **1920×1080** canvas: `.deck-viewport` (fills the window) wraps `.deck-stage` (1920×1080, `transform-origin: 0 0`).
- JavaScript scales the whole stage uniformly: `factor = min(innerWidth/1920, innerHeight/1080)`, then `translate(x, y) scale(factor)` to center with letterbox/pillarbox; re-run on `resize`. This is the viewport-base.css system — the full file is already inlined in the seed.
- Never reflow slide content per device. No responsive breakpoints inside slides. All measurements are fixed px at the 1920×1080 design size (the upstream preset's `clamp()` tab sizing is superseded by stage scaling — use fixed px).
- Slide switching toggles `.active`/`.visible` (visibility/opacity/pointer-events) — never `display: none`.
- Keyboard (`←`/`→`/`↑`/`↓`/Space/PageUp/PageDown/Home/End), debounced wheel (~650ms), touch swipe (≥40px), and `#/<index>` hash routing with deep-link restore. The page counter lives in `.deck-controls`, fixed-positioned outside the scaled stage.

### Design tokens (locked — reproduce exactly, never substitute)

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

### Signature devices (every slide carries all of them)

1. **Paper card** `.paper` — absolutely positioned by the `--paper-*` insets, `border-radius: 8px`, layered shadow (`0 2px 4px` + `0 18px 50px` dark drops + a 1px inner white highlight), faint 44px-pitch ruled-line grain via a layered `linear-gradient`, `z-index: 1`.
2. **Binder holes** `.holes` — a left-margin flex column of 10 punched circles (26px, `background: var(--bg-outer)`, inset dark shadow + 1px white bottom highlight), inside the paper at `left: 38px`.
3. **Margin rule** `.margin-rule` — a 1px vertical line at `left: 92px` in `var(--tab-3)` at 0.55 opacity, echoing a real notebook's red margin line.
4. **Index tabs** `.tabs` — a vertical column of 5 tabs on the right fore-edge, `writing-mode: vertical-rl`, DM Sans 700 uppercase letter-spaced, 56×158px, `border-radius: 0 10px 10px 0`, colored `--tab-1`…`--tab-5` in order. The column is positioned against the stage (`right: calc(--paper-right - 44px)`) at `z-index: 0` so 12px of each tab root tucks *under* the paper. The current section's tab gets `.on` (full opacity, `translateX(0)`, stronger shadow); inactive tabs sit at 0.82 opacity, `translateX(-6px)`. Tab labels name the deck's sections (seed: Intro / Craft / Numbers / Plan / End) — rename to the actual sections, keep the color order.
5. **Page chrome** — `.runhead` top ("No. NN" + running title, uppercase DM Sans, hairline bottom border) and `.baseline` bottom (section name + "NN / total", hairline top border). Keep both on every slide.

### Layout vocabulary (compose every deck from these masters)

`cover` (kicker with color chip + giant Bodoni display with one italic word + swatch row), `contents` (index rows: color chip + roman numeral + dotted leaders + page no.), `section divider` (430px outline-stroke Bodoni numeral + color bar + h2), `bullets` (max 3 points: colored circular pin with inline-SVG icon + Bodoni h3 + DM Sans support line), `quote` (lavender 220px quote mark + Bodoni italic 66px), `big-stat` (300px Bodoni number with italic unit + mint-left-border side note), `CSS bar chart` (scaleY-animated bars in tab colors over a solid axis), `two-column comparison` (plain column vs `.hot` column with `8px 8px 0 var(--tab-4)` hard offset shadow), `principle grid` (2×2 cards, each with a 12px colored left edge via `--edge`), `closing` (display sign-off + underlined contact links + colophon line). Default 8-11 slides per deck; honor the requested slide count when the user picks one; split content rather than shrinking type. No scrolling, no overflow.

### Motion

- Entrances only via `.reveal` elements transitioning when the slide gains `.visible`; stagger with `transition-delay` steps of ~0.1s (`.d1`–`.d6` helper classes).
- One signature easing: `cubic-bezier(0.16, 1, 0.3, 1)`. Animate only `transform` and `opacity`. Chart bars grow with `transform: scaleY` from `transform-origin: bottom`.
- `prefers-reduced-motion` support is mandatory (already in the inlined stage CSS).

### Output contract

- Single self-contained `.html`: all CSS and JS inline, zero build step, zero external JS libraries or CDN scripts (no Chart.js, no mermaid — pure CSS/SVG only). Icons are inline SVG. No remote images. The only allowed external reference is the Google Fonts `@import`.
- Comment every block: `/* === SECTION NAME === */`.
- **From `example.html`, change only the content** (text, section/tab names, data values, icon paths). The tokens, paper device, tabs, chrome, and controller script are the product — do not rewrite them, and never introduce colors or fonts outside this spec.

## Layout registry

Use this registry when outlining a deck or when content no longer fits the current page. Use the closest registered layout before creating a new one. A new layout is acceptable only when it recombines the same grid, type roles, color budget, and signature devices.

Registered layout IDs: `cover`, `agenda`, `problem`, `solution`, `diagram`, `metric`, `performance`, `comparison`, `contributions`, `conclusion`

### Density modes

- `speaker`: one idea per slide, up to three short bullets or four compact items, strong pacing, and generous negative space. Split content before reducing body text below 22 px on a 1600 × 900 canvas.
- `reader`: self-contained evidence for async reading, up to eight concise bullets or six comparable items. Split content before reducing body text below 18 px.
- The template default is `reader`. Change it only when the delivery context requires the other mode; declare the choice with `data-density` in HTML or in the deck's authoring notes for native formats.

### Registered layouts

| ID | Role | Use when | Guardrail |
|---|---|---|---|
| `cover` | Cover | Open with one memorable thesis and minimal supporting copy. | Keep the title dominant; no agenda, dashboard, or multi-card payload. |
| `agenda` | Agenda | Set the sequence and expectation for the deck. | Use short labels and preserve scanning rhythm. |
| `problem` | Problem | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `solution` | Solution | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `diagram` | Diagram | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `metric` | Metric | Make one quantitative finding the visual hero. | State the takeaway; do not show decorative or invented data. |
| `performance` | Performance | Show a real trend, comparison, or composition. | Label the conclusion and preserve readable axes and units. |
| `comparison` | Comparison | Contrast two choices, states, or approaches. | Use matched criteria and comparable evidence. |
| `contributions` | Contributions | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `conclusion` | Conclusion | Synthesize the evidence into one defensible conclusion. | Separate proven findings from open questions. |

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
