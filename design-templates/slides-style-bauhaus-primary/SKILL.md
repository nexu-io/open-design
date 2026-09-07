---
name: "slides-style-bauhaus-primary"
en_name: "Bauhaus Primary Slides"
zh_name: "包豪斯原色幻灯片"
description: "Create or restyle slide decks in the Bauhaus Primary visual system: primary red, blue, and yellow geometry, black rules, asymmetry, and functional modernist typography. Use for strategy, education, urban systems, architecture, and operating proposals; avoid soft lifestyle stories or subdued financial reporting. Works across HTML, PPTX, Keynote, Google Slides, and other editable slide formats."
zh_description: "红蓝黄三原色几何、黑色规线、非对称、功能主义现代排版，适合战略、教育、城市系统、建筑、运营提案。"
tags:
  - "slides"
  - "presentation"
  - "design-system"
  - "bauhaus-primary"
triggers:
  - "Bauhaus Primary Slides"
  - "包豪斯原色幻灯片"
  - "slides-style-bauhaus-primary"
  - "Bauhaus Primary slide style"
  - "apply this slide style"
  - "用这个风格做幻灯片"
  - "bauhaus primary"
  - "primary colors"
  - "red blue yellow"
  - "modernist deck"
  - "三原色"
  - "包豪斯 PPT"
  - "红蓝黄"
  - "现代主义幻灯片"
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
# Bauhaus Primary Slides

Apply this visual system to a complete presentation without depending on an OpenDesign plugin. The package is self-contained so any agent can inspect one instruction file and clone one editable reference deck.

## Resource map

```
slides-style-bauhaus-primary/
├── SKILL.md         ← workflow, style system, layouts, and quality gate
├── example.html     ← editable 16:9 reference deck and preview
└── LICENSE          ← upstream license and attribution
```

## Use this skill when

- The user names this style, points to its reference, or asks for the visual qualities in the description.
- The content fits: strategy, education, urban systems, architecture, and operating proposals.
- Do not select it for soft lifestyle stories or subdued financial reporting, unless the user explicitly asks for the contrast.

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

- Preserve the visual signature: primary red, blue, and yellow geometry, black rules, asymmetry, and functional modernist typography.
- Keep every slide focused on one idea. Use evidence, diagrams, or spatial composition instead of defaulting to repeated cards.
- Use only user-provided or sourced facts. Never invent metrics, quotes, people, dates, or citations.
- Keep text editable and semantic. Use CSS or native vector shapes for decoration when possible.
- Do not import colors, fonts, shadows, gradients, radii, or components from another style skill.
- Return the requested artifact plus a short list of source assumptions and any unresolved factual placeholders.
- Visual signature: primary red, blue, and yellow geometry, black rules, asymmetry, and functional modernist typography.
- Best for: strategy, education, urban systems, architecture, and operating proposals.
- Avoid for: soft lifestyle stories or subdued financial reporting.
- The three-band gradient (`--grad`) has **hard stops** — it is a flag, not a
- All chrome is ink: `2px solid #111` borders on cards, pills, chart bars,
- Shadows are hard offsets (`4px 4px 0 #111`, `8px 8px 0 #111`). Blurred
- `border-radius` is `0` on every element except the geometric circle device
- **Display** (`.h1 .h2 .stat-big .quote .section-num .kpi .num`):
- **Body** (`.lede`, card copy, lists): `Space Grotesk`, weights 300–700.
- **Mono** (step counters, theme chip, code): `JetBrains Mono`.
- No serif, no slab, no handwriting, no brush — those belong to sibling
- Google Fonts via `@import` is the only allowed remote resource.
- **Kandinsky mark**: inline SVG of red square + yellow triangle + blue
- **Outlined section numerals**: `.section-num` rendered stroke-only via
- **Primary top rules**: `.card-accent / .card-accent-2 / .card-accent-3`
- **Tri-band**: `.tri-band` and `.divider-accent` are ink-bordered strips of
- **Square checkboxes**: `.check li::before` is a yellow ink-bordered square
- **Geo strip**: `.geo-square / .geo-triangle / .geo-circle` repeat the
- One self-contained HTML file: inline `<style>` + inline `<script>`, zero
- Every page is `<section class="slide" data-title="...">` inside
- Fixed chrome: `.deck-header` (deck name + theme chip), `.deck-footer`
- Keyboard: `←` `→` `Space` `PageUp` `PageDown` `Home` `End` navigate;
- Speaker notes: one hidden `<div class="notes">…</div>` per slide, 1–3
- Animations: restrained upstream subset — `anim-rise-in` on the hero,
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

This is the detailed source specification adapted from the selected OpenDesign deck. In this standalone Skill, the canonical seed is `example.html`; plugin registration is not required.

> Portability note: the historical source notes below may mention a plugin, an artifact wrapper, or historical packaging paths. For this standalone Skill, follow the root `SKILL.md` for packaging and output; use the material below only as the authoritative visual and layout specification.

### Selection summary

- Visual signature: primary red, blue, and yellow geometry, black rules, asymmetry, and functional modernist typography.
- Best for: strategy, education, urban systems, architecture, and operating proposals.
- Avoid for: soft lifestyle stories or subdued financial reporting.

---

# Bauhaus Primary (hps-bauhaus)

Single-theme deck plugin ported from the `bauhaus` theme of the upstream
MIT-licensed [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)
(36 themes × 31 layouts × 27 animations). This plugin locks one skin:
design-history geometric modernism — the 1919–1933 Dessau language of
square/triangle/circle, the three primaries on an aged paper ground, and
typography that behaves like a poster.

**Start from `example.html`. Replace content only. Never rewrite the design
system or the runtime script. Never introduce a color or font outside the
token sheet below.**

### Locked token sheet (`:root`, do not deviate)

```css
:root{
  --bg:#f4efe3;            /* aged canvas ground */
  --bg-soft:#e8e2d1;       /* darker canvas */
  --surface:#ffffff;       /* card paper */
  --surface-2:#f4efe3;
  --border:#111111;        /* ink — every stroke is this */
  --border-strong:#111111;
  --text-1:#111111; --text-2:#333333; --text-3:#666666;
  --accent:#e03c27;        /* Rot — red */
  --accent-2:#f4c430;      /* Gelb — yellow */
  --accent-3:#1d4eaf;      /* Blau — blue */
  --good:#1b8c3c; --warn:#f4c430; --bad:#e03c27;
  --grad:linear-gradient(135deg,#e03c27 0 33%,#f4c430 33% 66%,#1d4eaf 66% 100%);
  --grad-soft:linear-gradient(135deg,#f4efe3,#e8e2d1);
  --radius:0; --radius-sm:0; --radius-lg:0;          /* zero radius, always */
  --shadow:4px 4px 0 #111; --shadow-lg:8px 8px 0 #111; /* hard offset, never blurred */
  --font-sans:'Space Grotesk','Inter','Noto Sans SC',sans-serif;
  --font-mono:'JetBrains Mono',SFMono-Regular,Menlo,monospace;
  --font-display:'Archivo Black','Space Grotesk','Noto Sans SC',sans-serif;
  --letter-tight:-.03em; --letter-normal:-.01em;
  --ease:cubic-bezier(.4,0,.2,1);
}
```

Hard rules derived from the sheet:

- The three-band gradient (`--grad`) has **hard stops** — it is a flag, not a
  blend. Use it only on `.gradient-text` hero words, `.tri-band`, and
  `.divider-accent`. Never use soft multi-stop gradients.
- All chrome is ink: `2px solid #111` borders on cards, pills, chart bars,
  checkboxes; `3px` strokes inside SVG.
- Shadows are hard offsets (`4px 4px 0 #111`, `8px 8px 0 #111`). Blurred
  `rgba` drop shadows are forbidden.
- `border-radius` is `0` on every element except the geometric circle device
  (`border-radius:50%`).

### Typography

- **Display** (`.h1 .h2 .stat-big .quote .section-num .kpi .num`):
  `Archivo Black`, weight 400 (the face is already black — never fake-bold),
  uppercase, letter-spacing `-.03em`.
- **Body** (`.lede`, card copy, lists): `Space Grotesk`, weights 300–700.
- **Mono** (step counters, theme chip, code): `JetBrains Mono`.
- No serif, no slab, no handwriting, no brush — those belong to sibling
  themes (`editorial-serif`, `peoples-platform`), not this one.
- Google Fonts via `@import` is the only allowed remote resource.

### Signature devices (keep these; they are the style)

- **Kandinsky mark**: inline SVG of red square + yellow triangle + blue
  circle, 3px ink strokes — on the cover and the closer.
- **Outlined section numerals**: `.section-num` rendered stroke-only via
  `-webkit-text-stroke:3px var(--text-1)` with transparent fill.
- **Primary top rules**: `.card-accent / .card-accent-2 / .card-accent-3`
  give cards an 8px red/yellow/blue top border; rotate the three primaries
  across a grid rather than repeating one.
- **Tri-band**: `.tri-band` and `.divider-accent` are ink-bordered strips of
  the hard three-band gradient.
- **Square checkboxes**: `.check li::before` is a yellow ink-bordered square
  with an ink check stroke.
- **Geo strip**: `.geo-square / .geo-triangle / .geo-circle` repeat the
  square/triangle/circle motif as a footer ornament.

### Layout system (shared upstream catalog, 31 layouts)

The slide scaffold and class vocabulary come from the upstream html-ppt
system. Master categories (compose `cover → toc → section-divider → content
pages → closer`):

| group | layouts |
|---|---|
| Openers & transitions | `cover` `toc` `section-divider` |
| Text-centric | `bullets` `two-column` `three-column` `big-quote` |
| Numbers & data | `stat-highlight` `kpi-grid` `table` `chart-bar` `chart-line` `chart-pie` `chart-radar` |
| Code & terminal | `code` `diff` `terminal` |
| Diagrams & flows | `flow-diagram` `arch-diagram` `process-steps` `mindmap` |
| Plans & comparisons | `timeline` `roadmap` `gantt` `comparison` `pros-cons` `todo-checklist` |
| Visuals | `image-hero` `image-grid` |
| Closers | `cta` `thanks` |

The seed demonstrates 10 of them: cover, toc, section-divider, two-column,
kpi-grid, stat-highlight, chart-bar, process-steps, big-quote, thanks.
Charts are always pure CSS blocks or inline SVG with primary fills and ink
strokes — never Chart.js or any external library. "Images" are geometric
SVG compositions; no photos, no external image hosts.

### Page structure & runtime contract

- One self-contained HTML file: inline `<style>` + inline `<script>`, zero
  build, zero external JS/CSS (Google Fonts `@import` excepted).
- Every page is `<section class="slide" data-title="...">` inside
  `<div class="deck" id="deck">` — a horizontal scroll-snap strip, each
  slide exactly `100vw × 100vh` (`flex:0 0 100vw`), 16:9 / 1280×720
  baseline with `clamp()` type scales, padding `72px 96px`. One screen per
  slide; no internal vertical scrolling.
- Fixed chrome: `.deck-header` (deck name + theme chip), `.deck-footer`
  (attribution + `N / total` counter), `.progress-bar` (ink-topped red fill).
- Keyboard: `←` `→` `Space` `PageUp` `PageDown` `Home` `End` navigate;
  `#/N` (1-based) hash deep-links via `history.replaceState` in try/catch
  (srcdoc-safe). The script dedupes dual window/document capture-phase key
  listeners by Event identity and auto-focuses `<body>` — these solve real
  iframe-host bugs; keep the script verbatim.
- Speaker notes: one hidden `<div class="notes">…</div>` per slide, 1–3
  sentences.
- Animations: restrained upstream subset — `anim-rise-in` on the hero,
  `anim-fade-up` on quotes, `anim-stagger-list` on grids. At most one hero
  animation plus one stagger per slide.

### Authoring checklist

1. Copy `example.html`; keep all `<style>` blocks and the `<script>`
   verbatim.
2. Replace the 10 demo slides with the planned layout sequence; the script
   recomputes the `N / total` counter automatically.
3. Real content, real numbers — no lorem ipsum, no placeholder images.
4. Rotate the three primaries deliberately (red = emphasis, yellow = warm
   support, blue = structure); large areas stay canvas + ink.
5. Verify: arrows + Space navigate, `#/5` deep-links, no slide overflows
   vertically, every stroke is #111, every radius is 0.

### Attribution

Token vocabulary, layout taxonomy, slide scaffold, and the bauhaus palette
come from the upstream MIT-licensed
[`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill)
(© lewis &lt;sudolewis@gmail.com&gt;). The LICENSE file ships alongside this
plugin — keep it in place when redistributing.

## Layout registry

Use this registry when outlining a deck or when content no longer fits the current page. Use the closest registered layout before creating a new one. A new layout is acceptable only when it recombines the same grid, type roles, color budget, and signature devices.

Registered layout IDs: `cover`, `module-overview`, `rationale`, `principles`, `metrics`, `interlude`, `programme`, `critique-loop`, `closing-assignment`

### Density modes

- `speaker`: one idea per slide, up to three short bullets or four compact items, strong pacing, and generous negative space. Split content before reducing body text below 22 px on a 1600 × 900 canvas.
- `reader`: self-contained evidence for async reading, up to eight concise bullets or six comparable items. Split content before reducing body text below 18 px.
- The template default is `speaker`. Change it only when the delivery context requires the other mode; declare the choice with `data-density` in HTML or in the deck's authoring notes for native formats.

### Registered layouts

| ID | Role | Use when | Guardrail |
|---|---|---|---|
| `cover` | Cover | Open with one memorable thesis and minimal supporting copy. | Center the complete content group horizontally on the canvas while keeping its internal typography left-aligned. |
| `module-overview` | Module Overview | Set the sequence and expectation for the deck. | Use short labels and preserve scanning rhythm. |
| `rationale` | Rationale | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `principles` | Principles | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `metrics` | Metrics | Make one quantitative finding the visual hero. | State the takeaway; do not show decorative or invented data. |
| `interlude` | Interlude | Create a pacing break and name the next chapter. | One phrase or short sentence only. |
| `programme` | Programme | Present a structured sequence of modules or moves. | Keep item labels parallel and durations explicit when known. |
| `critique-loop` | Critique Loop | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `closing-assignment` | Closing Assignment | End with the decision, takeaway, or next action. | Do not introduce new evidence or a second competing message. |

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
