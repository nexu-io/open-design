---
name: "slides-style-block-frame"
en_name: "Block Frame Slides"
zh_name: "拼贴框架幻灯片"
description: "Create or restyle slide decks in the Block Frame visual system: hard-edged frames, paper panels, black rules, saturated blocks, and editorial collage. Use for design audits, creative briefs, portfolios, and transformation narratives; avoid soft wellness or minimal luxury decks. Works across HTML, PPTX, Keynote, Google Slides, and other editable slide formats."
zh_description: "硬边框架、纸质面板、黑色规线、饱和色块、编辑拼贴，适合设计审计、创意简报、作品集、转型叙事。"
tags:
  - "slides"
  - "presentation"
  - "design-system"
  - "block-frame"
triggers:
  - "Block Frame Slides"
  - "拼贴框架幻灯片"
  - "slides-style-block-frame"
  - "Block Frame slide style"
  - "apply this slide style"
  - "用这个风格做幻灯片"
  - "block frame"
  - "collage deck"
  - "creative brief deck"
  - "design audit slides"
  - "portfolio deck"
  - "块状框架"
  - "拼贴 PPT"
  - "创意简报"
  - "设计评审 PPT"
  - "作品集 PPT"
od:
  mode: "deck"
  task_type: "ppt"
  surface: "web"
  scenario: "design"
  category: "slides-style"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
---
# Block Frame Slides

Apply this visual system to a complete presentation without depending on an OpenDesign plugin. The package is self-contained so any agent can inspect one instruction file and clone one editable reference deck.

## Resource map

```
slides-style-block-frame/
├── SKILL.md         ← workflow, style system, layouts, and quality gate
├── example.html     ← editable 16:9 reference deck and preview
└── LICENSE          ← upstream license and attribution
```

## Use this skill when

- The user names this style, points to its reference, or asks for the visual qualities in the description.
- The content fits: design audits, creative briefs, portfolios, and transformation narratives.
- Do not select it for soft wellness or minimal luxury decks, unless the user explicitly asks for the contrast.

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

- Preserve the visual signature: hard-edged frames, paper panels, black rules, saturated blocks, and editorial collage.
- Keep every slide focused on one idea. Use evidence, diagrams, or spatial composition instead of defaulting to repeated cards.
- Use only user-provided or sourced facts. Never invent metrics, quotes, people, dates, or citations.
- Keep text editable and semantic. Use CSS or native vector shapes for decoration when possible.
- Do not import colors, fonts, shadows, gradients, radii, or components from another style skill.
- Return the requested artifact plus a short list of source assumptions and any unresolved factual placeholders.
- Visual signature: hard-edged frames, paper panels, black rules, saturated blocks, and editorial collage.
- Best for: design audits, creative briefs, portfolios, and transformation narratives.
- Avoid for: soft wellness or minimal luxury decks.
- **Scheme:** light
- **Formality:** medium-low
- **Density:** high
- **Slides in demo:** 10
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

- Visual signature: hard-edged frames, paper panels, black rules, saturated blocks, and editorial collage.
- Best for: design audits, creative briefs, portfolios, and transformation narratives.
- Avoid for: soft wellness or minimal luxury decks.

---

# BlockFrame

> Neobrutalist deck with pastel-neon color blocks and chunky black borders.

A single self-contained HTML deck — typography, palette, decorative system,
and slide vocabulary are all tuned together. Mixing layouts across templates
breaks the system; stay inside this one.

### At a glance

- **Scheme:** light
- **Formality:** medium-low
- **Density:** high
- **Slides in demo:** 10

### Best for

Anything that should feel pop-graphic and design-led: indie SaaS launches, agency credentials, creative reviews, brand redesigns. Also a strong unexpected pick for tech, finance, or research when the speaker wants to land as confident and contemporary rather than buttoned-up.

### Avoid for

Contexts that require quiet institutional restraint or traditional weight (regulated disclosures, formal legal briefs).

### Workflow

1. **Clone `example.html`** into the user's workspace as the working file.
2. **Replace placeholder content** with the user's real headlines, body copy,
   numbers, names, dates, and section labels. Match existing dimensions when
   swapping image placeholders.
3. **Preserve the design system.** Never substitute fonts, recolor the palette,
   restructure the layout grid, or strip decorative elements (corner brackets,
   paper grain, geometric shapes, illustrated SVGs). They are part of the
   identity.
4. **Adjust deck length by duplicating layouts.** If the user has more content
   than the demo holds, duplicate an existing slide of the most appropriate
   layout. If less, drop slides from the bottom. Update page-number labels.
5. **Designing missing layouts:** if a slide needs a layout the template
   doesn't have, design it from scratch using the same fonts, palette,
   decorative vocabulary, spacing rhythm, and component grammar — never bail
   to a different template.
6. **Keep the navigation runtime as shipped.** If the deck ships an
   `assets/deck-stage.js` or inline keyboard handler, leave it intact.

### Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="zhangzara-block-frame" type="text/html" title="Deck Title">
<!doctype html>
<html>...</html>
</artifact>
```

### Source & license

Vendored from upstream MIT-licensed
[`zarazhangrui/beautiful-html-templates`](https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/block-frame).

The full upstream MIT license text — including the original copyright notice — ships in this skill at
[`LICENSE`](LICENSE) and must be redistributed alongside any copy of `example.html`,
`template.json`, or any vendored `assets/` runtime. See `template.json` for the upstream metadata snapshot.

## Layout registry

Use this registry when outlining a deck or when content no longer fits the current page. Use the closest registered layout before creating a new one. A new layout is acceptable only when it recombines the same grid, type roles, color budget, and signature devices.

Registered layout IDs: `cover`, `problem-brief`, `principle`, `evidence`, `statement`, `system-grammar`, `timeline`, `outcome`, `deliverables`, `checklist`

### Density modes

- `speaker`: one idea per slide, up to three short bullets or four compact items, strong pacing, and generous negative space. Split content before reducing body text below 22 px on a 1600 × 900 canvas.
- `reader`: self-contained evidence for async reading, up to eight concise bullets or six comparable items. Split content before reducing body text below 18 px.
- The template default is `reader`. Change it only when the delivery context requires the other mode; declare the choice with `data-density` in HTML or in the deck's authoring notes for native formats.

### Registered layouts

| ID | Role | Use when | Guardrail |
|---|---|---|---|
| `cover` | Cover | Open with one memorable thesis and minimal supporting copy. | Keep the title dominant; no agenda, dashboard, or multi-card payload. |
| `problem-brief` | Problem Brief | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `principle` | Principle | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `evidence` | Evidence | Show a real trend, comparison, or composition. | Label the conclusion and preserve readable axes and units. |
| `statement` | Statement | Make one quantitative finding the visual hero. | State the takeaway; do not show decorative or invented data. |
| `system-grammar` | System Grammar | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `timeline` | Timeline | Explain a dated or sequential progression. | Keep stages parallel and prevent labels from entering the navigation safe zone. |
| `outcome` | Outcome | Show a real trend, comparison, or composition. | Label the conclusion and preserve readable axes and units. |
| `deliverables` | Deliverables | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `checklist` | Checklist | End with the decision, takeaway, or next action. | Do not introduce new evidence or a second competing message. |

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
