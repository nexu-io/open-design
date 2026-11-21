---
name: slides-style-emerald-editorial
zh_name: "祖母绿编辑幻灯片"
en_name: "Emerald Editorial Slides"
description: "Create or restyle slide decks in the Emerald Editorial visual system: emerald fields, navy ink, high-contrast Bodoni display type, and fashion-magazine masthead details. Use for brand launches, campaign narratives, premium reports, and editorial strategy; avoid dense technical documentation or utilitarian training. Works across HTML, PPTX, Keynote, Google Slides, and other editable slide formats."
triggers:
  - "Emerald Editorial Slides"
  - "祖母绿编辑幻灯片"
  - "slides-style-emerald-editorial"
  - "Emerald Editorial slide style"
  - "apply this slide style"
  - "用这个风格做幻灯片"
tags: ["slides", "presentation", "design-system", "emerald-editorial"]
od:
  mode: deck
  category: slides
  surface: web
  preview:
    type: html
    entry: example.html
---

# Emerald Editorial Slides

Apply this visual system to a complete presentation without depending on an OpenDesign plugin. The package is self-contained so any agent can inspect one instruction file and clone one editable reference deck.

## Resource map

```
slides-style-emerald-editorial/
├── SKILL.md         ← workflow, style system, layouts, and quality gate
├── example.html     ← editable 16:9 reference deck and preview
└── LICENSE          ← upstream license and attribution
```

## Use this skill when

- The user names this style, points to its reference, or asks for the visual qualities in the description.
- The content fits: brand launches, campaign narratives, premium reports, and editorial strategy.
- Do not select it for dense technical documentation or utilitarian training, unless the user explicitly asks for the contrast.

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

- Preserve the visual signature: emerald fields, navy ink, high-contrast Bodoni display type, and fashion-magazine masthead details.
- Keep every slide focused on one idea. Use evidence, diagrams, or spatial composition instead of defaulting to repeated cards.
- Use only user-provided or sourced facts. Never invent metrics, quotes, people, dates, or citations.
- Keep text editable and semantic. Use CSS or native vector shapes for decoration when possible.
- Do not import colors, fonts, shadows, gradients, radii, or components from another style skill.
- Return the requested artifact plus a short list of source assumptions and any unresolved factual placeholders.
- Visual signature: emerald fields, navy ink, high-contrast Bodoni display type, and fashion-magazine masthead details.
- Best for: brand launches, campaign narratives, premium reports, and editorial strategy.
- Avoid for: dense technical documentation or utilitarian training.
- **Bodoni Moda 900** — every primary display moment, with negative tracking (−0.01em to −0.03em) and tight leading (0.9–0.95). Scale tiers: 460px jumbo numeral (navy panels only) · 200px agenda title · 184px cover lines · 180px closing lines · 128–130px statements/section headlines · 104–120px chart/process headlines · 144px KPI figures (60px unit suffix) · 92px side-panel stats.
- **Bodoni Moda 800** — ornament words (68–84px), tile/card titles (40–64px). **Bodoni Moda 700** — small prepositions only.
- **Manrope 500** — body paragraphs, 24–28px, line-height 1.4–1.5. Never larger than 28px.
- **Manrope 700–800, ALWAYS UPPERCASE** with 0.05–0.18em letter-spacing — every masthead, footline, eyebrow, label, tag, caption, delta, credit (24–30px). Manrope in sentence case is forbidden chrome.
- **Double-rule ornament** — the system's identity: a centered Bodoni 800 word bracketed on both sides by two stacked 4px ink rules (3px gap; 5px rules on the cover). The "The X *of* Y" playbill framing on cover, statement, and closing slides. Always bilateral. Variants via `:root[data-ornament="single"|"none"]` exist but the double form is the default.
- **Masthead / footline** — absolutely positioned Manrope-uppercase flex rows (two strings on opposite sides) at `top: 56px` / `bottom: 56px`, inset 80px. Mandatory on cover and closing; content slides carry a masthead with section + count strings.
- **4px solid `--ink` rules** — every section separator, agenda-row border, tile top rule, grid divider. 5px only for cover/closing ornaments; 2px only for chart grid lines. Never 1px, never dashed, never any other color.
- **Inverse tile** — solid navy with emerald text: chart cards, KPI tiles, process steps, the section-opener panel. Rotate in **paper tiles** (paper fill, ink text) to break rows: process flow alternates ink → paper → ink → paper.
- **Mark / tag / delta pills** — strict-rectangle uppercase Manrope chips (24px, 0.08–0.12em).
- **Flat printed ink only** — zero `border-radius`, zero `box-shadow`, zero gradients, zero blur, zero glow. Depth = color-block inversion + 4px rules. Nothing else.
- Every slide is one `<section class="slide">` authored at exactly **1920×1080px**, a direct child of `<deck-stage width="1920" height="1080" no-rail>`.
- The inlined `deck-stage` web component (MIT, © 2026 Zara Zhang) scales the fixed canvas **uniformly** to the viewport: `factor = min(innerWidth/1920, innerHeight/1080)`, applied as a single `transform: scale()` centered with letterbox/pillarbox on the `#0a0a0a` ground, re-computed on `resize`. **Never reflow content per device; no responsive breakpoints inside slides; all measurements are fixed px at the 1920×1080 design size.**
- The runtime also provides: keyboard navigation (←/→, PgUp/PgDn, Space, Home/End, number keys, R to reset), click/tap zones, a fading slide-count overlay, `#<n>` hash deep-linking with the hash kept in sync on navigation, slides hidden via `visibility/opacity` (never unmounted), per-slide `data-screen-label`, a `slidechange` event, and `@media print` one-page-per-slide PDF export. Keep the entire script verbatim; keep `<style>deck-stage:not(:defined){visibility:hidden}</style>`.
- Single self-contained `.html`: all CSS and the full runtime JS inline; zero build step, zero external JS, no CDN scripts, no remote images. The Google Fonts `<link>` for Bodoni Moda + Manrope is the only allowed external reference.
- Charts are pure CSS/HTML (the `.s5` bar-chart pattern); diagrams use the tile/rule vocabulary; icons, if needed, are inline SVG in ink/emerald.
- No scrolling, no overflow, no overlapping text at 1920×1080.
- CJK: pair Bodoni Moda with `Noto Serif SC` 900 for display and Manrope with `Noto Sans SC` for chrome (append to the same Google Fonts request); relax display tracking to 0 and leading to ~1.05 for Chinese headlines; keep the palette and rules identical.
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

- Visual signature: emerald fields, navy ink, high-contrast Bodoni display type, and fashion-magazine masthead details.
- Best for: brand launches, campaign narratives, premium reports, and editorial strategy.
- Avoid for: dense technical documentation or utilitarian training.

---

# Emerald Editorial（祖母绿封面故事）

A magazine-cover business deck system rooted in fashion-magazine mastheads and 19th-century theatrical playbills: a saturated emerald field, deep navy ink, warm paper tiles, bilateral double-rule ornaments, and Bodoni Moda at weight 900. Curated from the MIT-licensed [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates) `emerald-editorial` template.

**Start from `example.html` in this Skill package. It is the locked seed: keep its `:root` tokens, all eight slide-master CSS blocks, the `<deck-stage>` element, and the entire inlined deck-stage runtime script verbatim. Replace only the text content, numbers, and labels. Do not rewrite the design, and do not introduce any color or font outside this spec.**

### Design tokens (locked — list verbatim in `:root`)

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#3CD896` | Emerald — the dominant slide canvas |
| `--bg-2` | `#2DC684` | Darker emerald, reserved tonal variant (rarely used) |
| `--bg-3` | `#25B377` | Darkest emerald, reserved |
| `--ink` | `#0F1A5C` | Navy — text, rules, borders, inverse-panel fill |
| `--ink-2` | `#1B2774` | Lighter navy, reserved |
| `--ink-3` | `#3A4593` | Lightest navy, reserved |
| `--paper` | `#F1E9D6` | Oat paper — alternate tile fill, alt chart series |
| `--rule` | `rgba(15, 26, 92, 0.22)` | Chart grid lines only (2px, on navy ground use `rgba(60,216,150,0.22)`) |
| `--rule-strong` | `rgba(15, 26, 92, 0.85)` | Near-solid rule alternative |
| `--display-font` | `'Bodoni Moda', serif` | The single display face |

Page background outside the stage is `#0a0a0a` (the runtime letterbox). **The emerald / navy / paper triad is the entire palette — never introduce a fourth color family.** Color pairings are fixed: ink-on-emerald, emerald-on-navy (the only display color flip), ink-on-paper. Delta/tag pills invert: emerald pill on a navy tile, navy pill on a paper tile.

### Typography (locked — exactly two faces)

Google Fonts: `Bodoni Moda` (700/800/900) + `Manrope` (400–800). No third typeface, ever — not Playfair, not Inter, not system fonts.

- **Bodoni Moda 900** — every primary display moment, with negative tracking (−0.01em to −0.03em) and tight leading (0.9–0.95). Scale tiers: 460px jumbo numeral (navy panels only) · 200px agenda title · 184px cover lines · 180px closing lines · 128–130px statements/section headlines · 104–120px chart/process headlines · 144px KPI figures (60px unit suffix) · 92px side-panel stats.
- **Bodoni Moda 800** — ornament words (68–84px), tile/card titles (40–64px). **Bodoni Moda 700** — small prepositions only.
- **Manrope 500** — body paragraphs, 24–28px, line-height 1.4–1.5. Never larger than 28px.
- **Manrope 700–800, ALWAYS UPPERCASE** with 0.05–0.18em letter-spacing — every masthead, footline, eyebrow, label, tag, caption, delta, credit (24–30px). Manrope in sentence case is forbidden chrome.

Bodoni never appears at body/label scale; Manrope never appears at display scale. No italics, no underline — emphasis is size, inversion, and ornament.

### Signature devices (non-optional when the element type appears)

- **Double-rule ornament** — the system's identity: a centered Bodoni 800 word bracketed on both sides by two stacked 4px ink rules (3px gap; 5px rules on the cover). The "The X *of* Y" playbill framing on cover, statement, and closing slides. Always bilateral. Variants via `:root[data-ornament="single"|"none"]` exist but the double form is the default.
- **Masthead / footline** — absolutely positioned Manrope-uppercase flex rows (two strings on opposite sides) at `top: 56px` / `bottom: 56px`, inset 80px. Mandatory on cover and closing; content slides carry a masthead with section + count strings.
- **4px solid `--ink` rules** — every section separator, agenda-row border, tile top rule, grid divider. 5px only for cover/closing ornaments; 2px only for chart grid lines. Never 1px, never dashed, never any other color.
- **Inverse tile** — solid navy with emerald text: chart cards, KPI tiles, process steps, the section-opener panel. Rotate in **paper tiles** (paper fill, ink text) to break rows: process flow alternates ink → paper → ink → paper.
- **Mark / tag / delta pills** — strict-rectangle uppercase Manrope chips (24px, 0.08–0.12em).
- **Flat printed ink only** — zero `border-radius`, zero `box-shadow`, zero gradients, zero blur, zero glow. Depth = color-block inversion + 4px rules. Nothing else.

### The eight slide masters (mixed scheme — keep this rhythm)

1. **Cover** (`.s1`) — centered emerald page: "The" (76px) → giant title line (184px) → double-rule ornament with preposition → second title line → letter-spaced credit; top row + masthead strings.
2. **Agenda** (`.s2`) — eyebrow + 200px "The Programme" title + ruled list rows (`130px | 1fr | 320px` grid: Bodoni ordinal · Bodoni name · uppercase kind/duration), 4px rules above each row and below the last.
3. **Section opener** (`.s3`) — full-bleed 50/50 split: left navy panel with a 460px Bodoni numeral and corner label pairs; right emerald column with kicker, 128px headline, 28px lede, and mark pills above a 4px top rule.
4. **Statement + three** (`.s4`) — centered 130px statement broken by an ornament row, over a 3-column grid of supporting cells (Bodoni ordinal + 44px title + 26px body) under a 4px rule.
5. **Data study** (`.s5`) — headline + sub over a `1.4fr | 1fr` body: navy chart card with a pure-CSS grouped bar chart (emerald + paper bars, height percentages, Bodoni y-axis, Manrope x-axis, 2px grid lines at 22% opacity) and legend; takeaway side panel with tag pill, 48px Bodoni takeaway, note, and two 92px stats.
6. **Process flow** (`.s6`) — headline pair over four alternating navy/paper step tiles: 80px ordinal, 40px title above a 4px `currentColor` rule, 24px body, owner/duration meta row.
7. **KPI grid** (`.s7`) — headline pair over four alternating tiles: uppercase label, 144px Bodoni figure (+60px unit), delta pill, 24px description.
8. **Closing** (`.s8`) — cover echo: kicker, 180px line + ornament + 180px line, then a ruled 3-column footer (next review / owner / distribution) and footline strings.

Longer decks repeat masters 03–07 per section; **never invent a new layout master.** Padding scale: content slides `110px 110px 70px`; cover `56px 110px`; closing `80px 110px`. Density: one display headline + 3–4 supporting elements per slide; split into more slides rather than shrinking type or cramming six small elements.

### Stage & runtime (locked — the deck-stage scaling system)

- Every slide is one `<section class="slide">` authored at exactly **1920×1080px**, a direct child of `<deck-stage width="1920" height="1080" no-rail>`.
- The inlined `deck-stage` web component (MIT, © 2026 Zara Zhang) scales the fixed canvas **uniformly** to the viewport: `factor = min(innerWidth/1920, innerHeight/1080)`, applied as a single `transform: scale()` centered with letterbox/pillarbox on the `#0a0a0a` ground, re-computed on `resize`. **Never reflow content per device; no responsive breakpoints inside slides; all measurements are fixed px at the 1920×1080 design size.**
- The runtime also provides: keyboard navigation (←/→, PgUp/PgDn, Space, Home/End, number keys, R to reset), click/tap zones, a fading slide-count overlay, `#<n>` hash deep-linking with the hash kept in sync on navigation, slides hidden via `visibility/opacity` (never unmounted), per-slide `data-screen-label`, a `slidechange` event, and `@media print` one-page-per-slide PDF export. Keep the entire script verbatim; keep `<style>deck-stage:not(:defined){visibility:hidden}</style>`.

### Output contract

- Single self-contained `.html`: all CSS and the full runtime JS inline; zero build step, zero external JS, no CDN scripts, no remote images. The Google Fonts `<link>` for Bodoni Moda + Manrope is the only allowed external reference.
- Charts are pure CSS/HTML (the `.s5` bar-chart pattern); diagrams use the tile/rule vocabulary; icons, if needed, are inline SVG in ink/emerald.
- No scrolling, no overflow, no overlapping text at 1920×1080.
- CJK: pair Bodoni Moda with `Noto Serif SC` 900 for display and Manrope with `Noto Sans SC` for chrome (append to the same Google Fonts request); relax display tracking to 0 and leading to ~1.05 for Chinese headlines; keep the palette and rules identical.

### Attribution

Design system, tokens, slide masters, and the deck-stage runtime come from the upstream MIT-licensed [zarazhangrui/beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates) `emerald-editorial` template (© 2026 Zara Zhang). The LICENSE file ships in this Skill package; keep it in place when redistributing.

## Layout registry

Use this registry when outlining a deck or when content no longer fits the current page. Use the closest registered layout before creating a new one. A new layout is acceptable only when it recombines the same grid, type roles, color budget, and signature devices.

Registered layout IDs: `cover`, `agenda`, `manifesto`, `audience`, `offer`, `process`, `proof`, `closing`

### Density modes

- `speaker`: one idea per slide, up to three short bullets or four compact items, strong pacing, and generous negative space. Split content before reducing body text below 22 px on a 1600 × 900 canvas.
- `reader`: self-contained evidence for async reading, up to eight concise bullets or six comparable items. Split content before reducing body text below 18 px.
- The template default is `speaker`. Change it only when the delivery context requires the other mode; declare the choice with `data-density` in HTML or in the deck's authoring notes for native formats.

### Registered layouts

| ID | Role | Use when | Guardrail |
|---|---|---|---|
| `cover` | Cover | Open with one memorable thesis and minimal supporting copy. | Keep the title dominant; no agenda, dashboard, or multi-card payload. |
| `agenda` | Agenda | Set the sequence and expectation for the deck. | Use short labels and preserve scanning rhythm. |
| `manifesto` | Manifesto | Deliver a single high-conviction statement or editorial passage. | Protect whitespace; split the slide before shrinking the statement. |
| `audience` | Audience | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `offer` | Offer | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `process` | Process | Explain a dated or sequential progression. | Keep stages parallel and prevent labels from entering the navigation safe zone. |
| `proof` | Proof | Show a real trend, comparison, or composition. | Label the conclusion and preserve readable axes and units. |
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
