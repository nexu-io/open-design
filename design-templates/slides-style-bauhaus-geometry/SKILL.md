---
name: "slides-style-bauhaus-geometry"
en_name: "Bauhaus Geometry Slides"
zh_name: "包豪斯几何幻灯片"
description: "Create or restyle slide decks in the Bauhaus Geometry visual system: cream stock, cobalt mass, vermilion counterforce, solar yellow, condensed black typography, and asymmetric geometry. Use for strategy, cities, operations, architecture, and system proposals; avoid quiet luxury or delicate editorial stories. Works across HTML, PPTX, Keynote, Google Slides, and other editable slide formats."
zh_description: "奶油底、钴蓝和朱红和太阳黄几何块、压缩黑体、非对称几何，适合战略、城市、运营、建筑、系统提案。"
tags:
  - "slides"
  - "presentation"
  - "design-system"
  - "bauhaus-geometry"
triggers:
  - "Bauhaus Geometry Slides"
  - "包豪斯几何幻灯片"
  - "slides-style-bauhaus-geometry"
  - "Bauhaus Geometry slide style"
  - "apply this slide style"
  - "用这个风格做幻灯片"
  - "bauhaus"
  - "geometric slides"
  - "cobalt vermilion yellow"
  - "asymmetric deck"
  - "包豪斯"
  - "几何风 PPT"
  - "三色几何"
  - "战略汇报 PPT"
od:
  mode: "deck"
  task_type: "ppt"
  surface: "web"
  scenario: "general"
  category: "slides-style"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
---
# Bauhaus Geometry Slides

Apply this visual system to a complete presentation without depending on an OpenDesign plugin. The package is self-contained so any agent can inspect one instruction file and clone one editable reference deck.

## Resource map

```
slides-style-bauhaus-geometry/
├── SKILL.md         ← workflow, style system, layouts, and quality gate
└── example.html     ← editable 16:9 reference deck and preview
```

## Use this skill when

- The user names this style, points to its reference, or asks for the visual qualities in the description.
- The content fits: strategy, cities, operations, architecture, and system proposals.
- Do not select it for quiet luxury or delicate editorial stories, unless the user explicitly asks for the contrast.

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

- Preserve the visual signature: cream stock, cobalt mass, vermilion counterforce, solar yellow, condensed black typography, and asymmetric geometry.
- Keep every slide focused on one idea. Use evidence, diagrams, or spatial composition instead of defaulting to repeated cards.
- Use only user-provided or sourced facts. Never invent metrics, quotes, people, dates, or citations.
- Keep text editable and semantic. Use CSS or native vector shapes for decoration when possible.
- Do not import colors, fonts, shadows, gradients, radii, or components from another style skill.
- Return the requested artifact plus a short list of source assumptions and any unresolved factual placeholders.
- cream: `#F4EFDF`
- cobalt: `#2250C6`
- vermilion: `#F43A2C`
- yellow: `#FFD119`
- ink: `#111111`
- Display: Barlow Condensed 900. Use short, decisive headlines with intentional line breaks.
- Body and labels: Inter 500. Keep body copy compact and aligned to the composition.
- Use a minimum 54 px display size and 22 px body size on a 1600 × 900 stage. Metadata may be 13–16 px.
- Rewrite before shrinking. Do not mix additional display families.
- Use one dominant geometric mass and one diagonal counterforce.
- Keep titles left-aligned and tightly stacked.
- Use no more than four active colors on one slide.
- Prefer circles, bars, grids, and crop over cards or decoration.
- One dominant visual or typographic claim per slide.
- 16:9 stage with a safe inset of at least 54 px.
- No clipping at 1600 × 900 or a scaled browser viewport.
- Decorative shapes never collide with body text.
- All key text meets readable contrast; accent-on-accent is reserved for large display type.
- `speaker`: one idea per slide, up to three short bullets or four compact items, strong pacing, and generous negative space. Split content before reducing body text below 22 px on a 1600 × 900 canvas.
- `reader`: self-contained evidence for async reading, up to eight concise bullets or six comparable items. Split content before reducing body text below 18 px.
- The template default is `speaker`. Change it only when the delivery context requires the other mode; declare the choice with `data-density` in HTML or in the deck's authoring notes for native formats.
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

### Intent

cream stock, cobalt mass, vermilion counterforce, solar yellow, condensed black typography, and asymmetric geometry. Best for strategy, cities, operations, architecture, and system proposals; avoid quiet luxury or delicate editorial stories.

### Color

- cream: `#F4EFDF`
- cobalt: `#2250C6`
- vermilion: `#F43A2C`
- yellow: `#FFD119`
- ink: `#111111`

Target balance: **62% cream / 18% cobalt / 12% vermilion / 8% yellow**. Treat the ratio as a composition budget, not a requirement to show every color on every slide.

### Typography

- Display: Barlow Condensed 900. Use short, decisive headlines with intentional line breaks.
- Body and labels: Inter 500. Keep body copy compact and aligned to the composition.
- Use a minimum 54 px display size and 22 px body size on a 1600 × 900 stage. Metadata may be 13–16 px.
- Rewrite before shrinking. Do not mix additional display families.

### Composition grammar

- Use one dominant geometric mass and one diagonal counterforce.
- Keep titles left-aligned and tightly stacked.
- Use no more than four active colors on one slide.
- Prefer circles, bars, grids, and crop over cards or decoration.

The supplied template includes six layout families: cover, problem split, manifesto, three-part system, programme, and closing statement. Duplicate the closest family for additional pages. Create new layouts only by recombining the same grid, type roles, palette, and signature geometry.

### Quality gate

- One dominant visual or typographic claim per slide.
- 16:9 stage with a safe inset of at least 54 px.
- No clipping at 1600 × 900 or a scaled browser viewport.
- Decorative shapes never collide with body text.
- All key text meets readable contrast; accent-on-accent is reserved for large display type.

## Layout registry

Use this registry when outlining a deck or when content no longer fits the current page. Use the closest registered layout before creating a new one. A new layout is acceptable only when it recombines the same grid, type roles, color budget, and signature devices.

Registered layout IDs: `cover`, `problem-split`, `manifesto`, `system-grid`, `agenda`, `closing`

### Density modes

- `speaker`: one idea per slide, up to three short bullets or four compact items, strong pacing, and generous negative space. Split content before reducing body text below 22 px on a 1600 × 900 canvas.
- `reader`: self-contained evidence for async reading, up to eight concise bullets or six comparable items. Split content before reducing body text below 18 px.
- The template default is `speaker`. Change it only when the delivery context requires the other mode; declare the choice with `data-density` in HTML or in the deck's authoring notes for native formats.

### Registered layouts

| ID | Role | Use when | Guardrail |
|---|---|---|---|
| `cover` | Cover | Open with one memorable thesis and minimal supporting copy. | Vertically center the complete text group while preserving its left alignment and keeping it clear of the geometric field. |
| `problem-split` | Problem Split | Contrast the current tension with the opportunity or decision. | Keep each side to one claim; never let the dividing device cut through text. |
| `manifesto` | Manifesto | Deliver a single high-conviction statement or editorial passage. | Protect whitespace; split the slide before shrinking the statement. |
| `system-grid` | System Grid | Explain three or four parts of one system. | Use parallel grammar, comparable density, and equal visual weight. |
| `agenda` | Agenda | Set the sequence and expectation for the deck. | Use short labels and preserve scanning rhythm. |
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
