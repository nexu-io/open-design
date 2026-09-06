---
name: "slides-style-takram-soft-tech"
en_name: "Takram Soft Tech Slides"
zh_name: "东方柔光科技幻灯片"
description: "Create or restyle slide decks in the Takram Soft Tech visual system: rice-paper neutrals, sage and gold data marks, refined serif labels, and museum-plate diagrams. Use for technology strategy, research, procurement, systems thinking, and evidence-led proposals; avoid youth-culture posters or neon entertainment. Works across HTML, PPTX, Keynote, Google Slides, and other editable slide formats."
zh_description: "米纸中性色、鼠尾草和金色数据标记、精致衬线标签、博物馆图版式图表，适合技术战略、研究、采购、系统思维、证据导向提案。"
tags:
  - "slides"
  - "presentation"
  - "design-system"
  - "takram-soft-tech"
triggers:
  - "Takram Soft Tech Slides"
  - "东方柔光科技幻灯片"
  - "slides-style-takram-soft-tech"
  - "Takram Soft Tech slide style"
  - "apply this slide style"
  - "用这个风格做幻灯片"
  - "soft tech"
  - "takram"
  - "museum diagram"
  - "technology strategy deck"
  - "systems thinking"
  - "procurement"
  - "软科技"
  - "技术战略 PPT"
  - "系统思维"
  - "采购方案"
  - "研究提案"
od:
  mode: "deck"
  task_type: "ppt"
  surface: "web"
  scenario: "engineering"
  category: "slides-style"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
---
# Takram Soft Tech Slides

Apply this visual system to a complete presentation without depending on an OpenDesign plugin. The package is self-contained so any agent can inspect one instruction file and clone one editable reference deck.

## Resource map

```
slides-style-takram-soft-tech/
├── SKILL.md         ← workflow, style system, layouts, and quality gate
├── example.html     ← editable 16:9 reference deck and preview
└── LICENSE          ← upstream license and attribution
```

## Use this skill when

- The user names this style, points to its reference, or asks for the visual qualities in the description.
- The content fits: technology strategy, research, procurement, systems thinking, and evidence-led proposals.
- Do not select it for youth-culture posters or neon entertainment, unless the user explicitly asks for the contrast.

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

- Preserve the visual signature: rice-paper neutrals, sage and gold data marks, refined serif labels, and museum-plate diagrams.
- Keep every slide focused on one idea. Use evidence, diagrams, or spatial composition instead of defaulting to repeated cards.
- Use only user-provided or sourced facts. Never invent metrics, quotes, people, dates, or citations.
- Keep text editable and semantic. Use CSS or native vector shapes for decoration when possible.
- Do not import colors, fonts, shadows, gradients, radii, or components from another style skill.
- Return the requested artifact plus a short list of source assumptions and any unresolved factual placeholders.
- Visual signature: rice-paper neutrals, sage and gold data marks, refined serif labels, and museum-plate diagrams.
- Best for: technology strategy, research, procurement, systems thinking, and evidence-led proposals.
- Avoid for: youth-culture posters or neon entertainment.
- One `<div id="stage">` fixed at **1920 × 1080 px**, centered with
- Each page is one `<section class="slide">` inside `#stage` with a
- Navigation (keep the script verbatim): `←`/`↑`/`PageUp` previous,
- Serif display: cover 90–104px, section titles 44–66px, weight 400–500,
- Labels: 10–13px, weight 500, `letter-spacing: 1.5–3px`, uppercase — the
- Chinese copy uses 「」 quotes; bilingual pages put Chinese serif first,
- Default 10 pages (8–11 allowed). Alternate density: text page → chart
- Color budget: green is the protagonist; gold appears only as the 2nd data
- No emoji, no icon fonts, no shadows heavier than the locked
- Real content only — the user's actual numbers; missing data gets an honest
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

- Visual signature: rice-paper neutrals, sage and gold data marks, refined serif labels, and museum-plate diagrams.
- Best for: technology strategy, research, procurement, systems thinking, and evidence-led proposals.
- Avoid for: youth-culture posters or neon entertainment.

---

# Takram Soft Tech · 东方柔光科技

Produce a **single-file, soft nature-toned tech deck**. You are a research
studio designer working in HTML: every chart is composed like a museum plate,
every color is borrowed from moss, paper and dusk. The visual system, canvas
contract, and navigation runtime are locked by `example.html`. **Start from
`example.html`, replace content only — do not rewrite the design or the
script. Do not introduce any color or font outside this spec.**

Adapted from the `ppt-takram` showcase of
[huashu-design](https://github.com/alchaincyf/huashu-design) by 花叔
(alchaincyf), MIT licensed. The upstream file is a single benchmark page;
this Skill package extends it into a full multi-section deck while preserving its
DNA: data visualization treated as an art piece.

### Hard spec (locked — violating any line is a regression)

#### Canvas & runtime

- One `<div id="stage">` fixed at **1920 × 1080 px**, centered with
  `position: fixed; top: 50%; left: 50%`; a `fit()` function applies
  `translate(-50%, -50%) scale(min(innerWidth/1920, innerHeight/1080))` on
  load and `resize`. All inner layout in px — the scaler owns responsiveness.
- Each page is one `<section class="slide">` inside `#stage` with a
  `data-screen-label="01 封面"`-style label; exactly one slide carries
  `.active`. This is an **all-light style — there are no dark pages**;
  rhythm comes from density alternation, not theme swaps.
- Navigation (keep the script verbatim): `←`/`↑`/`PageUp` previous,
  `→`/`↓`/`Space`/`PageDown` next, `Home`/`End` first/last; `#/N` hash
  routing (1-indexed) read on load + `hashchange`, written via
  `history.replaceState`; click left third = back, rest = forward; fixed
  counter pill bottom-right, key-hint bottom-left. No external JS, no build
  step — the file must open inside a sandboxed iframe via `file://`.

#### Design tokens (`:root` — keep the names, re-theme values only)

| Token | Value | Role |
|---|---|---|
| `--paper` | `#F5F0EB` | warm rice-paper page background |
| `--ink` | `#2D3436` | heading ink |
| `--body` | `#3A3A3A` | body ink |
| `--green` | `#6B8F71` | sage green — the primary accent |
| `--green-2` | `#7D9B72` | lighter sage (delta pills, fills) |
| `--sage` | `#A8B5A0` | pale sage (labels, washes, flow lines) |
| `--gold` | `#D4A574` | the **only** warm accent — 2nd data series |
| `--gray-warm` | `#C8C2B8` | warm gray — 3rd data series, captions |
| `--gray-line` | `#D4CFC6` | delicate axis / rule lines |
| `--gray-dash` | `#DDD9D2` | dashed grid circles |
| `--gray-bg` | `#E8E4DC` | faint outermost rings |
| `--muted` | `#615C54` | secondary text (warm ink, WCAG AA on paper) |
| `--faint` | `#736D64` | tertiary captions (warm ink, WCAG AA) |
| `--card` | `rgba(255,255,255,0.6)` | translucent card background |
| `--card-line` | `rgba(168,181,160,0.18)` | card hairline border |
| `--serif` | `'Noto Serif SC', 'Songti SC', serif` | display headings, quotes, insight text |
| `--sans` | `'Inter', 'PingFang SC', 'Hiragino Sans GB', sans-serif` | labels, numbers, body |

Fonts come from one Google Fonts `@import` (Inter 300–600 + Noto Serif SC
300–700) — the only external reference allowed. **No purple, no blue, no
neon, no pure black, no gradients other than the two locked radial washes.**

#### Signature devices (the visual DNA — every deck must show them)

1. **Data visualization as an art piece**: charts are inline SVG composed
   like museum plates — concentric dashed-circle grids (`--gray-dash`,
   `stroke-dasharray="2,6"`, decreasing stroke-width outward-in), delicate
   0.5px axis lines, tiny hollow endpoint circles, faint scale numbers, and
   a 3-series overlay: **green polygon prominent (stroke 2, dot r=6 with
   halo ring), gold secondary (stroke 1.2, dot r=3.5), warm-gray tertiary
   (stroke 1 dashed, dot r=2.5)**. Value callouts use thin annotation lines
   + 14px/600 green numerals. Every plate signs off with a right-aligned
   8–9px `Fig. NN — Title` caption in `--gray-warm`.
2. **Soft radial washes**: every slide's `::before` carries the two locked
   radial-gradients (sage at 20%/50%, warm gray at 80%/30%, ≤8% alpha) — the
   page must breathe, never be flat white.
3. **Rounded translucent cards** (`.soft-card`): 16px radius,
   `rgba(255,255,255,0.6)` fill, `--card-line` hairline border, and a 32px ×
   2px sage tick at top-left (`::before`). Value typography: 38–44px
   weight-300 numerals with a smaller green unit span; deltas in a rounded
   sage pill with a tiny SVG triangle (gold pill allowed once per page for a
   special callout).
4. **Hairline masthead** on every page: 64px strip, bottom border
   `rgba(107,143,113,0.15)`; left = green dot + 11px/500/3px-tracking
   uppercase deck name; right = 10px/400 `--faint` section label. Footer:
   11px faint credit line bottom-left, `Fig./Sec.` note bottom-right. Page
   numbering lives **only** in the runtime counter pill.
5. **Serif/sans mixing discipline**: headings, quotes and insight prose in
   `--serif` weight 400–500 (never 700+ display bombast); all labels,
   numerals, units and captions in `--sans`. English subtitles are 15–18px
   weight-300 `--muted` prose under Chinese serif titles.
6. **Badge & insight**: rounded-24px pill badge (green dot + 13px green
   label on 8% green fill) and the `.insight` card (10px uppercase sage
   label + serif 17px/1.9 finding text) for key takeaways.

#### Layout enumeration (use 5+ per deck, never one layout everywhere)

| Layout | Role |
|---|---|
| `cover` | left serif display title + badge, right oversized dashed-ring SVG art |
| `contents` | serif rows + green index numbers separated by sage hairlines |
| `philosophy` | one 60–70px serif claim + 3 soft-cards |
| `big-number` | 240–280px weight-300 numeral + green unit + hairline stat row |
| `radar` (the master) | 480px left panel (kicker/serif title/badge/insight/credit) + right radar plate + 3 metric cards — preserve this two-panel grid from upstream |
| `diagram` | SVG flow/architecture plate: dashed clusters, sage dashed flow paths, gold middle node, green terminal node |
| `metrics-grid` | 2×3 soft-card grid with delta pills |
| `quote` | centered serif 52px quote, gold SVG quote marks, key phrase in green |
| `roadmap` | hairline timeline, dots graded `--gray-warm` → `--sage` → `--green-2` → `--green` (last with halo) |
| `closing` | centered serif CTA over faint concentric rings + badge |

#### Typography & scale (read from 10 meters)

- Serif display: cover 90–104px, section titles 44–66px, weight 400–500,
  letter-spacing ~1px, line-height 1.35–1.65. Hero numerals 240–280px
  weight 300 with negative tracking.
- Labels: 10–13px, weight 500, `letter-spacing: 1.5–3px`, uppercase — the
  connective tissue of the style. Body/captions 13–18px weight 300,
  line-height 1.7–1.9.
- Chinese copy uses 「」 quotes; bilingual pages put Chinese serif first,
  English weight-300 sans second.

#### Rhythm & discipline

- Default 10 pages (8–11 allowed). Alternate density: text page → chart
  plate → whitespace/quote page. At least one radar/diagram art plate per
  deck — it is the reason this style exists.
- Color budget: green is the protagonist; gold appears only as the 2nd data
  series, quote marks, or one special delta pill; warm gray is the 3rd
  series and all chrome. Never promote gold or gray to a heading color.
- No emoji, no icon fonts, no shadows heavier than the locked
  `drop-shadow(0 4px 20px rgba(0,0,0,0.04))`, no border heavier than 1px
  except SVG data strokes, no Chart.js/mermaid — all charts are hand-laid
  inline SVG.
- Real content only — the user's actual numbers; missing data gets an honest
  `<!-- 待用户提供 -->` placeholder, never invented statistics. (The seed
  deck's 「青屿/QINGYU」 data is fictional demo content and must be fully
  replaced.)

### Workflow

1. **Clarify once**: topic, audience, page count, and which comparison or
   dataset becomes the radar/diagram art plate — this style lives and dies
   by its chart plate; pick it before writing any page.
2. **Copy `example.html`**, retitle, then replace each section's content
   following the layout enumeration. Keep masthead/footer chrome, washes,
   token names, and the script intact. Re-theme by changing token values
   only — and only if the user's brand genuinely demands it; the
   sage/gold/warm-gray triad on rice paper is the identity.
3. **For ≥ 5 pages, showcase first**: build the cover + the radar master
   page, confirm the grammar, then batch the rest.
4. **Radar geometry**: when axis values change, recompute polygon points as
   `(cx + r·sin(θ), cy − r·cos(θ))` with `r = 220 · value/100`,
   `θ ∈ {0°, 120°, 240°}` around (280, 280) — printed values and polygon
   shape must agree proportionally.
5. **Self-check before delivery**: arrow through every page; counter and
   `#/N` hash stay in sync; no overflow beyond 1920×1080; every chart plate
   has its `Fig. NN` caption; only the three series colors appear in any
   chart; no leftover demo (「青屿」/"QINGYU") text; grep for `TODO`.

## Layout registry

Use this registry when outlining a deck or when content no longer fits the current page. Use the closest registered layout before creating a new one. A new layout is acceptable only when it recombines the same grid, type roles, color budget, and signature devices.

Registered layout IDs: `cover`, `agenda`, `philosophy`, `statement`, `radar`, `architecture`, `metrics`, `quote`, `roadmap`, `closing`

### Density modes

- `speaker`: one idea per slide, up to three short bullets or four compact items, strong pacing, and generous negative space. Split content before reducing body text below 22 px on a 1600 × 900 canvas.
- `reader`: self-contained evidence for async reading, up to eight concise bullets or six comparable items. Split content before reducing body text below 18 px.
- The template default is `reader`. Change it only when the delivery context requires the other mode; declare the choice with `data-density` in HTML or in the deck's authoring notes for native formats.

### Registered layouts

| ID | Role | Use when | Guardrail |
|---|---|---|---|
| `cover` | Cover | Open with one memorable thesis and minimal supporting copy. | Keep the title dominant; no agenda, dashboard, or multi-card payload. |
| `agenda` | Agenda | Set the sequence and expectation for the deck. | Use short labels and preserve scanning rhythm. |
| `philosophy` | Philosophy | Create a pacing break and name the next chapter. | One phrase or short sentence only. |
| `statement` | Statement | Make one quantitative finding the visual hero. | State the takeaway; do not show decorative or invented data. |
| `radar` | Radar | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `architecture` | Architecture | Use this layout only for content that matches its demonstrated information shape. | Preserve its hierarchy, alignment, and signature spacing before adding variants. |
| `metrics` | Metrics | Make one quantitative finding the visual hero. | State the takeaway; do not show decorative or invented data. |
| `quote` | Quote | Give one attributed voice or qualitative proof point room to breathe. | Keep attribution visible and never fabricate the quote. |
| `roadmap` | Roadmap | Sequence work, owners, or milestones. | Expose dependencies and avoid false precision. |
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
