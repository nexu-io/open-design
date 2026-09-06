---
name: "slides-style-electric-studio"
en_name: "Electric Studio Slides"
zh_name: "钴蓝工作室幻灯片"
description: "Create or restyle slide decks in the Electric Studio visual system: white and cobalt split panels, hard black seams, corner marks, and bold Manrope typography. Use for B2B proposals, operating plans, product strategy, and executive recommendations; avoid heritage, literary, or hand-crafted narratives. Works across HTML, PPTX, Keynote, Google Slides, and other editable slide formats."
zh_description: "白和钴蓝分割面板、硬黑接缝、角标、Manrope 粗体，适合 B2B 提案、运营计划、产品战略、高管建议。"
tags:
  - "slides"
  - "presentation"
  - "design-system"
  - "electric-studio"
triggers:
  - "Electric Studio Slides"
  - "钴蓝工作室幻灯片"
  - "slides-style-electric-studio"
  - "Electric Studio slide style"
  - "apply this slide style"
  - "用这个风格做幻灯片"
  - "cobalt split"
  - "b2b proposal deck"
  - "operating plan"
  - "product strategy deck"
  - "executive recommendation"
  - "钴蓝分割"
  - "B2B 提案 PPT"
  - "运营计划"
  - "产品战略 PPT"
  - "高管汇报"
od:
  mode: "deck"
  task_type: "ppt"
  surface: "web"
  scenario: "sales"
  category: "slides-style"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
---
# Electric Studio Slides

Apply this visual system to a complete presentation without depending on an OpenDesign plugin. The package is self-contained so any agent can inspect one instruction file and clone one editable reference deck.

## Resource map

```
slides-style-electric-studio/
├── SKILL.md         ← workflow, style system, layouts, and quality gate
├── example.html     ← editable 16:9 reference deck and preview
└── LICENSE          ← upstream license and attribution
```

## Use this skill when

- The user names this style, points to its reference, or asks for the visual qualities in the description.
- The content fits: B2B proposals, operating plans, product strategy, and executive recommendations.
- Do not select it for heritage, literary, or hand-crafted narratives, unless the user explicitly asks for the contrast.

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

- Preserve the visual signature: white and cobalt split panels, hard black seams, corner marks, and bold Manrope typography.
- Keep every slide focused on one idea. Use evidence, diagrams, or spatial composition instead of defaulting to repeated cards.
- Use only user-provided or sourced facts. Never invent metrics, quotes, people, dates, or citations.
- Keep text editable and semantic. Use CSS or native vector shapes for decoration when possible.
- Do not import colors, fonts, shadows, gradients, radii, or components from another style skill.
- Return the requested artifact plus a short list of source assumptions and any unresolved factual placeholders.
- Visual signature: white and cobalt split panels, hard black seams, corner marks, and bold Manrope typography.
- Best for: B2B proposals, operating plans, product strategy, and executive recommendations.
- Avoid for: heritage, literary, or hand-crafted narratives.
- **Display / H2** — Manrope 800, tight negative letter-spacing (`-0.025em` to `-0.035em`), line-height ≤ 1.08. Title ~152px, H2 60–88px. A terminal period in `--accent-blue` (`<span class="blue">.</span>`) is a signature flourish.
- **Quote hero** — Manrope 800 at ~92px with an oversized cobalt `“` mark (~220px): **quote typography is the deck's hero visual.**
- **Kicker** — 22px, 800, uppercase, `letter-spacing: 0.34em`, cobalt on white / white on cobalt.
- **Body / lede** — 400/500, 25–33px. Support copy on the white panel uses `--text-dark-soft`; body copy on the cobalt panel stays full `--text-light` for WCAG AA contrast (the soft light alpha is reserved for bold uppercase chrome: marks, hints, separators).
- **Marks** — 19px, 800, uppercase, `letter-spacing: 0.22em`.
- Never substitute Inter, Roboto, Arial, serifs, or any second typeface.
- **White above, cobalt #4361ee below — always.** Vary only the split ratio per master; never side-by-side splits, never blue-over-white.
- **Edge bar** (`.edge-bar`, 14px, `--bg-dark`) sits on the seam of every slide; use `.edge-bar.light` (white) only when a slide reads as cobalt-dominant and needs the inverse.
- **Brand marks in corners** are the chrome (no breadcrumbs, no baseline rule): top-left cobalt chip (16px square) + wordmark; top-right section label; bottom-left deck label; bottom-right `NN / NN` page mark. Marks over the white panel use `.dark`, marks over the cobalt panel use `.light`.
- Horizontal padding is `--slide-pad-x` (110px) on both panels; spacing stays confident and restrained — generous margins, no cramming.
- Author every slide on a fixed **1920×1080** canvas: `.deck-viewport` (fills the window) wraps `.deck-stage` (1920×1080, `transform-origin: 0 0`).
- JavaScript scales the whole stage uniformly: `factor = min(innerWidth/1920, innerHeight/1080)`, then `translate(x, y) scale(factor)` to center with letterbox/pillarbox; re-run on `resize`.
- Never reflow content per device; no responsive breakpoints inside slides; all measurements are fixed px at design size.
- Keep the FULL viewport-base.css block from the seed (stage, slide stacking, print styles, `prefers-reduced-motion`).
- Slide switching toggles `.active`/`.visible` (visibility/opacity/pointer-events) — **never `display: none`**.
- Navigation runtime (keep the seed's `SlidePresentation` controller verbatim): `←`/`→`/`↑`/`↓`/`Space`/`PageUp`/`PageDown`/`Home`/`End`, debounced wheel (~650ms), touch swipe (≥40px), `#/<index>` hash routing with deep-link restore, page counter pill in `.deck-controls` fixed **outside** the scaled stage.
- Entrances only: `.reveal` elements transition when the slide gains `.visible`; stagger via `transition-delay` in ~0.1s steps.
- One signature easing: `cubic-bezier(0.16, 1, 0.3, 1)`. Animate only `transform` and `opacity`. Chart bars enter via `scaleY`.
- `prefers-reduced-motion` support is mandatory (in the base CSS).
- Single self-contained `.html`: all CSS/JS inline, zero build, zero external JS, no CDN scripts. Google Fonts link for Manrope is the only external reference.
- Icons are inline SVG (stroke `#4361ee` on white, `#ffffff` on cobalt). Charts are pure CSS. No remote images.
- No scrolling, no overflow: split content into more slides instead of shrinking type. Low-density speaker-led decks: one idea per slide, 1–3 bullets. High-density reading-first decks: structured grids, max 4–6 cards.
- Comment every section: `/* === SECTION NAME === */`. Never negate CSS functions directly (`-clamp()` is silently ignored) — use `calc(-1 * clamp(...))`.
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

- Visual signature: white and cobalt split panels, hard black seams, corner marks, and bold Manrope typography.
- Best for: B2B proposals, operating plans, product strategy, and executive recommendations.
- Avoid for: heritage, literary, or hand-crafted narratives.

---

# Electric Studio · 钴蓝工作室

Bold, clean, professional, high-contrast split-panel decks. Theme locked to the **Electric Studio** preset (section 2 of `STYLE_PRESETS.md`) from the MIT-licensed [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides).

**Start from `example.html` in this Skill package. It is the proven seed: keep its stage CSS (full viewport-base.css contents), the split-panel shell, the corner-marks chrome, the `:root` tokens, and the entire `SlidePresentation` controller script verbatim — replace slide content only. Do not rewrite the design; do not introduce any color or font outside this spec.**

### Locked design tokens (`:root` — complete list, no additions)

```css
:root {
    --bg-dark: #0a0a0a;                          /* edge bar, dark text, stage letterbox */
    --bg-white: #ffffff;                         /* upper panel */
    --accent-blue: #4361ee;                      /* cobalt panel, chips, bars, numerals */
    --text-dark: #0a0a0a;
    --text-light: #ffffff;
    --text-dark-soft: rgba(10, 10, 10, 0.58);
    --text-light-soft: rgba(255, 255, 255, 0.72);
    --line-dark: rgba(10, 10, 10, 0.14);
    --line-light: rgba(255, 255, 255, 0.28);
    --blue-soft: rgba(67, 97, 238, 0.10);        /* tick boxes, outline bar fills */

    --stage-bg: var(--bg-dark);
    --slide-bg: var(--bg-white);

    --font: 'Manrope', sans-serif;               /* the ONLY typeface */
    --title-size: 152px;
    --h2-size: 88px;
    --lede-size: 33px;
    --body-size: 27px;

    --slide-pad-x: 110px;
    --edge-bar-h: 14px;

    --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
    --duration-normal: 0.7s;
}
```

Forbidden: any other hue, gradients, purple/indigo (#6366f1), warm accents, photography, illustrations, drop shadows, rounded hero cards. The palette is exactly white / cobalt / near-black plus their soft alphas.

### Typography (all Manrope, Google Fonts weights 400/500/800)

- **Display / H2** — Manrope 800, tight negative letter-spacing (`-0.025em` to `-0.035em`), line-height ≤ 1.08. Title ~152px, H2 60–88px. A terminal period in `--accent-blue` (`<span class="blue">.</span>`) is a signature flourish.
- **Quote hero** — Manrope 800 at ~92px with an oversized cobalt `“` mark (~220px): **quote typography is the deck's hero visual.**
- **Kicker** — 22px, 800, uppercase, `letter-spacing: 0.34em`, cobalt on white / white on cobalt.
- **Body / lede** — 400/500, 25–33px. Support copy on the white panel uses `--text-dark-soft`; body copy on the cobalt panel stays full `--text-light` for WCAG AA contrast (the soft light alpha is reserved for bold uppercase chrome: marks, hints, separators).
- **Marks** — 19px, 800, uppercase, `letter-spacing: 0.22em`.
- Never substitute Inter, Roboto, Arial, serifs, or any second typeface.

### Locked layout system — vertical split panels

Every slide is the same shell:

```html
<section class="slide s-<master>">
  <div class="split">
    <div class="panel panel-white panel-pad"> … </div>
    <div class="edge-bar"></div>            <!-- 14px #0a0a0a accent bar on the panel seam -->
    <div class="panel panel-blue panel-pad"> … </div>
  </div>
  <div class="mark mark-tl dark"><span class="chip"></span>Brand</div>
  <div class="mark mark-tr dark"><span class="soft">Section</span></div>
  <div class="mark mark-bl light"><span class="soft">Deck label</span></div>
  <div class="mark mark-br light">NN / NN</div>
</section>
```

- **White above, cobalt #4361ee below — always.** Vary only the split ratio per master; never side-by-side splits, never blue-over-white.
- **Edge bar** (`.edge-bar`, 14px, `--bg-dark`) sits on the seam of every slide; use `.edge-bar.light` (white) only when a slide reads as cobalt-dominant and needs the inverse.
- **Brand marks in corners** are the chrome (no breadcrumbs, no baseline rule): top-left cobalt chip (16px square) + wordmark; top-right section label; bottom-left deck label; bottom-right `NN / NN` page mark. Marks over the white panel use `.dark`, marks over the cobalt panel use `.light`.
- Horizontal padding is `--slide-pad-x` (110px) on both panels; spacing stays confident and restrained — generous margins, no cramming.

### Master pages (compose decks from these; all present in the seed)

| Master | Split | Content |
| ------ | ----- | ------- |
| `s-title` | 50/50 | Kicker + giant statement title on white; lede + meta row on blue |
| `s-agenda` | 348px / rest | H2 on white; numbered hairline rows (`--line-light`) on blue with idx + hint |
| `s-divider` | 150px / rest | Empty white strip; giant outlined number (`-webkit-text-stroke: 3px var(--bg-white)`) + label on cobalt |
| `s-bullets` | deep / 240px | Kicker + H2 + ≤3 tick points (cobalt-bordered `.tick` with inline-SVG check) on white; one bold takeaway on blue |
| `s-stat` | deep / 300px | Oversized cobalt number (~400px, 800) on white; label + note on blue |
| `s-quote` | deep / 220px | Cobalt `“` + 92px statement quote on white; attribution on blue |
| `s-compare` | 50/50 | The split IS the contrast: "their way" on white vs "our way" on cobalt, dash-topped list items |
| `s-grid` | 300px / rest | H2 on white; 2×2 `.gcard` grid (2px `--line-light` borders) on cobalt |
| `s-chart` | deep / 200px | Pure-CSS bar chart on white: cobalt bars (`.solid` fill or `--blue-soft` + cobalt border), `scaleY(0)→1` entrance; takeaway on blue |
| `s-close` | 150px / rest | Cobalt-dominant statement ("Let's make something electric.") + inline-SVG contact links |

### Fixed 16:9 stage — NON-NEGOTIABLE scaling system

- Author every slide on a fixed **1920×1080** canvas: `.deck-viewport` (fills the window) wraps `.deck-stage` (1920×1080, `transform-origin: 0 0`).
- JavaScript scales the whole stage uniformly: `factor = min(innerWidth/1920, innerHeight/1080)`, then `translate(x, y) scale(factor)` to center with letterbox/pillarbox; re-run on `resize`.
- Never reflow content per device; no responsive breakpoints inside slides; all measurements are fixed px at design size.
- Keep the FULL viewport-base.css block from the seed (stage, slide stacking, print styles, `prefers-reduced-motion`).
- Slide switching toggles `.active`/`.visible` (visibility/opacity/pointer-events) — **never `display: none`**.
- Navigation runtime (keep the seed's `SlidePresentation` controller verbatim): `←`/`→`/`↑`/`↓`/`Space`/`PageUp`/`PageDown`/`Home`/`End`, debounced wheel (~650ms), touch swipe (≥40px), `#/<index>` hash routing with deep-link restore, page counter pill in `.deck-controls` fixed **outside** the scaled stage.

### Motion

- Entrances only: `.reveal` elements transition when the slide gains `.visible`; stagger via `transition-delay` in ~0.1s steps.
- One signature easing: `cubic-bezier(0.16, 1, 0.3, 1)`. Animate only `transform` and `opacity`. Chart bars enter via `scaleY`.
- `prefers-reduced-motion` support is mandatory (in the base CSS).

### Output contract

- Single self-contained `.html`: all CSS/JS inline, zero build, zero external JS, no CDN scripts. Google Fonts link for Manrope is the only external reference.
- Icons are inline SVG (stroke `#4361ee` on white, `#ffffff` on cobalt). Charts are pure CSS. No remote images.
- No scrolling, no overflow: split content into more slides instead of shrinking type. Low-density speaker-led decks: one idea per slide, 1–3 bullets. High-density reading-first decks: structured grids, max 4–6 cards.
- Comment every section: `/* === SECTION NAME === */`. Never negate CSS functions directly (`-clamp()` is silently ignored) — use `calc(-1 * clamp(...))`.

### Attribution

Theme, fixed-stage model, and workflow come from the upstream MIT-licensed [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides) (© 2025 Zara Zhang), Electric Studio preset (STYLE_PRESETS.md section 2). The LICENSE file ships in this Skill package; keep it in place when redistributing.

## Layout registry

Use this registry when outlining a deck or when content no longer fits the current page. Use the closest registered layout before creating a new one. A new layout is acceptable only when it recombines the same grid, type roles, color budget, and signature devices.

Registered layout IDs: `cover`, `agenda`, `section`, `bullets`, `statistic`, `quote`, `comparison`, `plan-grid`, `chart`, `closing`

### Density modes

- `speaker`: one idea per slide, up to three short bullets or four compact items, strong pacing, and generous negative space. Split content before reducing body text below 22 px on a 1600 × 900 canvas.
- `reader`: self-contained evidence for async reading, up to eight concise bullets or six comparable items. Split content before reducing body text below 18 px.
- The template default is `reader`. Change it only when the delivery context requires the other mode; declare the choice with `data-density` in HTML or in the deck's authoring notes for native formats.

### Registered layouts

| ID | Role | Use when | Guardrail |
|---|---|---|---|
| `cover` | Cover | Open with one memorable thesis and minimal supporting copy. | Keep the title dominant; no agenda, dashboard, or multi-card payload. |
| `agenda` | Agenda | Set the sequence and expectation for the deck. | Use short labels and preserve scanning rhythm. |
| `section` | Section | Create a pacing break and name the next chapter. | One phrase or short sentence only. |
| `bullets` | Bullets | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `statistic` | Statistic | Make one quantitative finding the visual hero. | State the takeaway; do not show decorative or invented data. |
| `quote` | Quote | Give one attributed voice or qualitative proof point room to breathe. | Keep attribution visible and never fabricate the quote. |
| `comparison` | Comparison | Contrast two choices, states, or approaches. | Use matched criteria and comparable evidence. |
| `plan-grid` | Plan Grid | Explain a dated or sequential progression. | Keep stages parallel and prevent labels from entering the navigation safe zone. |
| `chart` | Chart | Show a real trend, comparison, or composition. | Label the conclusion and preserve readable axes and units. |
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
