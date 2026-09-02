---
name: "slides-style-creative-voltage"
en_name: "Creative Voltage Slides"
zh_name: "创意伏特幻灯片"
description: "Create or restyle slide decks in the Creative Voltage visual system: electric blue and deep navy split fields, neon-yellow signals, halftone texture, and oversized Syne typography. Use for fundraising, launch narratives, bold strategy, and creative technology; avoid quiet editorial reports or conservative governance decks. Works across HTML, PPTX, Keynote, Google Slides, and other editable slide formats."
zh_description: "电光蓝和深海军蓝分割场、荧光黄信号、半调纹理、超大 Syne 字，适合融资、发布叙事、大胆战略、创意科技。"
tags:
  - "slides"
  - "presentation"
  - "design-system"
  - "creative-voltage"
triggers:
  - "Creative Voltage Slides"
  - "创意伏特幻灯片"
  - "slides-style-creative-voltage"
  - "Creative Voltage slide style"
  - "apply this slide style"
  - "用这个风格做幻灯片"
  - "electric blue"
  - "neon yellow"
  - "halftone"
  - "launch deck"
  - "fundraising deck"
  - "bold pitch"
  - "电光蓝"
  - "荧光黄"
  - "发布会 PPT"
  - "融资 PPT"
  - "创意科技"
od:
  mode: "deck"
  task_type: "ppt"
  surface: "web"
  scenario: "marketing"
  category: "slides-style"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
---
# Creative Voltage Slides

Apply this visual system to a complete presentation without depending on an OpenDesign plugin. The package is self-contained so any agent can inspect one instruction file and clone one editable reference deck.

## Resource map

```
slides-style-creative-voltage/
├── SKILL.md         ← workflow, style system, layouts, and quality gate
├── example.html     ← editable 16:9 reference deck and preview
└── LICENSE          ← upstream license and attribution
```

## Use this skill when

- The user names this style, points to its reference, or asks for the visual qualities in the description.
- The content fits: fundraising, launch narratives, bold strategy, and creative technology.
- Do not select it for quiet editorial reports or conservative governance decks, unless the user explicitly asks for the contrast.

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

- Preserve the visual signature: electric blue and deep navy split fields, neon-yellow signals, halftone texture, and oversized Syne typography.
- Keep every slide focused on one idea. Use evidence, diagrams, or spatial composition instead of defaulting to repeated cards.
- Use only user-provided or sourced facts. Never invent metrics, quotes, people, dates, or citations.
- Keep text editable and semantic. Use CSS or native vector shapes for decoration when possible.
- Do not import colors, fonts, shadows, gradients, radii, or components from another style skill.
- Return the requested artifact plus a short list of source assumptions and any unresolved factual placeholders.
- Visual signature: electric blue and deep navy split fields, neon-yellow signals, halftone texture, and oversized Syne typography.
- Best for: fundraising, launch narratives, bold strategy, and creative technology.
- Avoid for: quiet editorial reports or conservative governance decks.
- Every deck is authored on a fixed **1920×1080** canvas: `.deck-viewport` (fills the window) wraps `.deck-stage` (1920×1080, `transform-origin: 0 0`).
- JavaScript scales the whole stage uniformly: `factor = min(innerWidth/1920, innerHeight/1080)`, then `transform: translate(x, y) scale(factor)` to center with letterbox/pillarbox; re-run on `resize`.
- Never reflow slide content per device. No responsive breakpoints inside slides. All measurements are fixed px at the 1920×1080 design size.
- Include the full viewport-base block from the seed `<style>` (stage, slide stacking, print, `prefers-reduced-motion`).
- Slide switching toggles `.active` / `.visible` classes flipping `visibility` / `opacity` / `pointer-events` — **never `display: none`**.
- `<section class="slide">` directly inside `.deck-stage`; ~10 slides per deck — split content into more slides rather than shrinking type.
- `.slide-no` top-left: Space Mono 700, neon yellow, format `NN / VOLT`.
- `.crumbs` top-right: uppercase mono breadcrumbs; active section in neon (`.on`).
- `.baseline` bottom: 2px rule with uppercase mono caption left and `NN / 10` right.
- `.deck-controls` page counter is fixed-positioned **outside** the scaled stage.
- Entrances via `.reveal` elements that transition when the slide gains `.visible`; stagger with `transition-delay` steps of ~0.1s (`nth-child` rules in the seed).
- Chart bars animate `transform: scaleY(0 → 1)` from `transform-origin: bottom` with per-bar delays.
- One signature easing only: `cubic-bezier(0.16, 1, 0.3, 1)`. Animate only `transform` and `opacity`. `prefers-reduced-motion` support is mandatory (in the base CSS).
- Keyboard: `←`/`→`, `↑`/`↓`, `Space`, `PageUp`/`PageDown`, `Home`/`End`.
- Hash routing: current slide mirrored to `#/<index>`; deep links and `hashchange` restore the slide.
- Mouse wheel (debounced ~650ms) and touch swipe (≥40px threshold).
- One self-contained `.html` file: all CSS and JS inline, no build step, no external JS libraries, no CDN scripts; Google Fonts link is the only external reference.
- Icons are inline SVG stroked in `#d4ff00` (or `#1a1a2e` on neon ticks). No remote images; halftone patterns, gradients, and panels are the visual language.
- No scrolling, no overflow, no overlapping text panels. Comment each section `/* === SECTION NAME === */`.
- CSS gotcha: never negate CSS functions directly (`-clamp()` is silently ignored) — use `calc(-1 * clamp(...))`.
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

- Visual signature: electric blue and deep navy split fields, neon-yellow signals, halftone texture, and oversized Syne typography.
- Best for: fundraising, launch narratives, bold strategy, and creative technology.
- Avoid for: quiet editorial reports or conservative governance decks.

---

# Creative Voltage (fs-creative-voltage)

A locked single-theme deck plugin derived from the **Creative Voltage** preset (section 3 of `STYLE_PRESETS.md`) in the MIT-licensed [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides). Vibe: bold, creative, energetic, retro-modern — a retro poster shop wired to a power grid.

**Start from `example.html` in this Skill package. It is the proven seed: copy its stage CSS, slide shell chrome, signature-device CSS, and the entire `SlidePresentation` controller script verbatim, then replace only the slide content. Do not rewrite the stage system, the navigation script, or the design tokens. Do not introduce any colors or fonts outside this spec.**

### Locked design tokens (`:root` — reproduce exactly)

```css
:root {
    --stage-bg: #10101f;              /* letterbox behind the stage */
    --slide-bg: #1a1a2e;              /* default slide background */

    --bg-primary: #0066ff;            /* electric blue panel */
    --bg-primary-deep: #0052cc;       /* blue gradient stop */
    --bg-dark: #1a1a2e;               /* deep navy panel */
    --bg-dark-2: #23234a;             /* lifted navy card */
    --accent-neon: #d4ff00;           /* neon yellow badge/highlight */
    --accent-neon-soft: rgba(212, 255, 0, 0.14);

    --text-light: #ffffff;
    --text-dim: rgba(255, 255, 255, 0.64);
    --text-faint: rgba(255, 255, 255, 0.34);
    --text-on-neon: #1a1a2e;          /* navy text on neon yellow */
    --line: rgba(255, 255, 255, 0.18);
    --line-blue: rgba(255, 255, 255, 0.28);

    --font-display: 'Syne', sans-serif;       /* 700/800, uppercase headlines */
    --font-mono: 'Space Mono', monospace;     /* 400/700, body + labels + chrome */
    --font-script: 'Yellowtail', cursive;     /* script flourishes only */
    --title-size: 138px;
    --h2-size: 88px;
    --subtitle-size: 32px;
    --body-size: 27px;
    --label-size: 20px;

    --slide-pad: 96px;

    --ease-volt: cubic-bezier(0.16, 1, 0.3, 1);   /* the one signature easing */
    --duration-normal: 0.7s;
}
```

Google Fonts (the only external reference allowed):
`https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Yellowtail&display=swap`

**Forbidden:** any color outside the token table; Inter / Roboto / Arial / system display fonts; purple gradients; generic indigo `#6366f1`; rounded-corner glassmorphism. Neon yellow is an accent, never a slide background.

### Fixed 16:9 stage — NON-NEGOTIABLE scaling system

- Every deck is authored on a fixed **1920×1080** canvas: `.deck-viewport` (fills the window) wraps `.deck-stage` (1920×1080, `transform-origin: 0 0`).
- JavaScript scales the whole stage uniformly: `factor = min(innerWidth/1920, innerHeight/1080)`, then `transform: translate(x, y) scale(factor)` to center with letterbox/pillarbox; re-run on `resize`.
- Never reflow slide content per device. No responsive breakpoints inside slides. All measurements are fixed px at the 1920×1080 design size.
- Include the full viewport-base block from the seed `<style>` (stage, slide stacking, print, `prefers-reduced-motion`).
- Slide switching toggles `.active` / `.visible` classes flipping `visibility` / `opacity` / `pointer-events` — **never `display: none`**.

### Slide shell chrome (every slide)

- `<section class="slide">` directly inside `.deck-stage`; ~10 slides per deck — split content into more slides rather than shrinking type.
- `.slide-no` top-left: Space Mono 700, neon yellow, format `NN / VOLT`.
- `.crumbs` top-right: uppercase mono breadcrumbs; active section in neon (`.on`).
- `.baseline` bottom: 2px rule with uppercase mono caption left and `NN / 10` right.
- `.deck-controls` page counter is fixed-positioned **outside** the scaled stage.

### Signature devices (the theme's identity — use them, don't invent new ones)

1. **Split panels** — `.panel-blue` (46% width, `linear-gradient(160deg, #0066ff, #0052cc)`) against the deep navy base; `.panel-blue.right` mirrors it. Covers, dividers, quotes, and closings lean on this two-tone split.
2. **Halftone dot texture** — `.halftone`: pure CSS `radial-gradient(circle, rgba(255,255,255,.30) 2.2px, transparent 2.9px)` on a `22px` grid, faded out with a `mask-image` linear gradient (`.fade` or inline masks). `.halftone.neon` swaps the dots to `rgba(212,255,0,.45)`. Place one halftone patch per slide, in a corner.
3. **Neon badges** — `.badge`: neon yellow block, navy mono uppercase text, `rotate(-2deg)`, hard offset shadow `6px 6px 0 rgba(0,0,0,.35)`. Sticker energy.
4. **Script flourishes** — `.script` (Yellowtail) in neon yellow, used for one emphasized word inside a headline or a signature line; often `rotate(-2deg/-3deg)`. Never for body text.
5. **Ghost numerals** — `.ghost-num`: transparent fill with `-webkit-text-stroke: 4px var(--accent-neon)` for giant section-divider characters.

### Layout masters (compose every deck from these — all present in the seed)

| Master | Seed slide | Notes |
| ------ | ---------- | ----- |
| Cover (split blue/dark) | 1 | badge + giant Syne title + script tagline left; mono metadata + neon rule right |
| Agenda | 2 | rows with neon mono index, Syne uppercase name, dim mono hint |
| Section divider | 3 | giant ghost numeral on blue panel + badge + intro paragraph |
| Bullets | 4 | max 3-4 items: rotated neon tick (inline SVG) + Syne heading + mono support line |
| Big stat | 5 | one oversized neon Syne number (≈480px) + side note column |
| Principle grid | 6 | 2×2 cards on `--bg-dark-2`, one `.hot` card on electric blue, inline SVG icons stroked `#d4ff00` |
| CSS bar chart | 7 | `scaleY`-animated bars (navy / blue / neon for the hero bar), mono values + labels, no chart libraries |
| Quote | 8 | Syne quote with neon `<em>`, Yellowtail attribution, narrow blue panel right |
| Comparison | 9 | navy "before" column (× markers) vs blue "after" column (→ markers, neon tag) |
| Closing | 10 | badge + giant title ending in a script word + mono contact links with inline SVG icons |

### Motion

- Entrances via `.reveal` elements that transition when the slide gains `.visible`; stagger with `transition-delay` steps of ~0.1s (`nth-child` rules in the seed).
- Chart bars animate `transform: scaleY(0 → 1)` from `transform-origin: bottom` with per-bar delays.
- One signature easing only: `cubic-bezier(0.16, 1, 0.3, 1)`. Animate only `transform` and `opacity`. `prefers-reduced-motion` support is mandatory (in the base CSS).

### Navigation runtime (keep the seed's script verbatim)

- Keyboard: `←`/`→`, `↑`/`↓`, `Space`, `PageUp`/`PageDown`, `Home`/`End`.
- Hash routing: current slide mirrored to `#/<index>`; deep links and `hashchange` restore the slide.
- Mouse wheel (debounced ~650ms) and touch swipe (≥40px threshold).

### Output contract

- One self-contained `.html` file: all CSS and JS inline, no build step, no external JS libraries, no CDN scripts; Google Fonts link is the only external reference.
- Icons are inline SVG stroked in `#d4ff00` (or `#1a1a2e` on neon ticks). No remote images; halftone patterns, gradients, and panels are the visual language.
- No scrolling, no overflow, no overlapping text panels. Comment each section `/* === SECTION NAME === */`.
- CSS gotcha: never negate CSS functions directly (`-clamp()` is silently ignored) — use `calc(-1 * clamp(...))`.

### Attribution

Theme tokens and the fixed-stage model come from the upstream MIT-licensed [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides) (© 2025 Zara Zhang), Creative Voltage preset. The LICENSE file ships in this Skill package; keep it in place when redistributing.

## Layout registry

Use this registry when outlining a deck or when content no longer fits the current page. Use the closest registered layout before creating a new one. A new layout is acceptable only when it recombines the same grid, type roles, color budget, and signature devices.

Registered layout IDs: `cover`, `agenda`, `problem`, `barriers`, `solution`, `benefits`, `growth`, `proof`, `comparison`, `closing`

### Density modes

- `speaker`: one idea per slide, up to three short bullets or four compact items, strong pacing, and generous negative space. Split content before reducing body text below 22 px on a 1600 × 900 canvas.
- `reader`: self-contained evidence for async reading, up to eight concise bullets or six comparable items. Split content before reducing body text below 18 px.
- The template default is `speaker`. Change it only when the delivery context requires the other mode; declare the choice with `data-density` in HTML or in the deck's authoring notes for native formats.

### Registered layouts

| ID | Role | Use when | Guardrail |
|---|---|---|---|
| `cover` | Cover | Open with one memorable thesis and minimal supporting copy. | Keep the right-side supporting copy slightly above the lower baseline while preserving the left headline hierarchy; no agenda, dashboard, or multi-card payload. |
| `agenda` | Agenda | Set the sequence and expectation for the deck. | Use short labels and preserve scanning rhythm. |
| `problem` | Problem | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `barriers` | Barriers | Contrast two choices, states, or approaches. | Use matched criteria and comparable evidence. |
| `solution` | Solution | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `benefits` | Benefits | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `growth` | Growth | Show a real trend, comparison, or composition. | Label the conclusion and preserve readable axes and units. |
| `proof` | Proof | Show a real trend, comparison, or composition. | Label the conclusion and preserve readable axes and units. |
| `comparison` | Comparison | Contrast two choices, states, or approaches. | Use matched criteria and comparable evidence. |
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
