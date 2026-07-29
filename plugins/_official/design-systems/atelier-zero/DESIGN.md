# Atelier Zero

> Category: Editorial · Studio
> A magazine-grade, collage-driven visual system: warm paper canvas, surreal
> plaster-and-architecture imagery, oversized display type, hairline rules,
> Roman-numeral section markers, and tiny editorial annotations.
> Inspired by the production values of high-end print magazines (Monocle,
> Apartamento, IDEA) translated into a working website.

## 1. Visual Theme & Atmosphere

A small, high-craft studio's annual report rendered as a webpage. The
canvas is warm handmade paper. Every surface earns its lines. Type does
the heavy lifting; collage imagery does the storytelling. Coral provides
the only spark of warmth; mustard, olive, and bone are quiet
companions. The page feels printed, slightly aged, and intentionally
restrained — never noisy, never neon.

- **Visual style:** editorial, collage, museum-catalog calm.
- **Posture:** asymmetric, generous, top-biased.
- **Reading rhythm:** Roman numerals (I, II, III…) walk the reader
  through the page like chapters in a printed essay.
- **Mood:** intelligent, tactile, slightly poetic, unmistakably
  international.

### Print production references

The three magazines are not interchangeable inspiration — each owns a
specific dimension of the system. When a brief asks "shift it closer to
X", consult this map before changing tokens:

- **Monocle:** warm paper stock (`#efe7d2`), tight body leading (~1.55),
  monospace coordinates and SHA stamps, the international metadata
  strip ("Filed under …"), the small ★ in the nav.
- **Apartamento:** surreal collage composition (plaster + architecture
  + small human figure), torn-edge textures inside the imagery, the
  rotated side notes, and the willingness to leave generous negative
  space around an image.
- **IDEA:** Roman-numeral section walks (I → VIII), oversized
  italic-serif words mixed inline with bold sans (Playfair Italic 500
  inside Inter Tight 800), hairline rules threading through method
  steps, the closing mega-word footer.

## 2. Color

All values are tokens. Do not invent new hex.

- **Paper:** `#efe7d2` — primary background, warm ivory.
- **Paper-warm:** `#ece4cf` — second-tier surface tint.
- **Paper-dark:** `#ddd2b6` — subtle wells, cards on cards.
- **Bone:** `#f7f1de` — elevated card surface (always on Paper).
- **Ink:** `#15140f` — body text, primary buttons, strong rules.
- **Ink-soft:** `#2a2620` — secondary text, dense paragraphs.
- **Ink-mute:** `#5a5448` — captions, lab descriptions.
- **Ink-faint:** `#8b8676` — coordinates, page numbers, microcopy.
- **Coral (accent):** `#ed6f5c` — single hot accent. CTA fills,
  Roman-numeral marks, eyebrow underlines, pulse dots, "fin." marks.
- **Coral-soft:** `#f08e7c` — hover/secondary coral states only.
- **Mustard:** `#e9b94a` — used sparingly: a single ★ in the nav, a
  highlighted ring in stats, occasional dot on a numbered annotation.
- **Olive:** `#6e7448` — quiet third accent for tags or partner glyphs.

### Color rules

- One **coral** moment per ~600vh. If two CTAs are coral, the
  Roman numerals should be ink-faint instead.
- Mustard is never used for a CTA. It is jewelry.
- Pure white (`#fff`) only inside the dark "selected work" panel as
  inverse text. Never on Paper.
- Pure black is forbidden. The darkest value is `Ink #15140f`.

### Why single-accent (not multi-accent)

Multi-accent editorial systems (e.g. *The New Yorker* using red for
Opinion and teal for Culture) work when the publication has stable
content categories and a long-term reader who learns the code. A
single-shot studio landing page does not have that runway. One coral
moment per ~600vh forces the agent to pick the single most important
beat per viewport instead of balancing two chromatic hierarchies, and
keeps the page calibrated to the warm-paper canvas. Mustard and olive
exist as **jewelry** (≤1% surface area: a star, a dot, a partner glyph)
— never as semantic signals, and never as CTA fills.

### Surface noise

Every page MUST overlay a faint paper noise texture using a fixed,
pointer-events-disabled `::before` pseudo-element with a
multiply-blend SVG turbulence at ~5–7% opacity, plus two soft
radial gradients in `rgba(106, 92, 56, 0.06)` to simulate
hand-pressed paper warmth.

## 3. Typography

### Families

- **Display / sans:** `Inter Tight` 700–900 weights — headlines, section
  titles, button text. Letter-spacing `-0.025em` to `-0.04em` at
  display sizes.
- **Italic emphasis / serif:** `Playfair Display` Italic, weight 500.
  Used inline inside display headlines on emphasized nouns, on Roman
  numerals, on testimonial quotes, on the brand mark `Ø`.
- **Body:** `Inter` 300–500 — paragraph copy, lab descriptions.
- **Mono:** `JetBrains Mono` 400–500 — code spans, coordinates,
  SHAs, plate numbers ("FIG. 01 / OD-26").

### Scale (px)

`9.5 · 10.5 · 11 · 13 · 14 · 16 · 17 · 22 · 26 · 38 · 54 · 66 · 78 · 90 · 200`

### Headline construction

Display headlines mix **bold sans** and **italic serif** in the same
line. The serif italic carries the emotional words; the sans carries
the structure. End every section H1/H2 with a coral period — `<span
class="dot">.</span>`.

```
Designing intelligence with skills, taste, and code.
^^^^^^^^^                ^^^^^^^^  ^^^^^      ^^^^
sans bold                serif italic         coral dot
```

### Microcopy

- **Eyebrow / label:** 11px Inter Tight 600, `letter-spacing: 0.22em`,
  uppercase, coral, prefixed with an 18px coral hairline.
- **Coordinates:** 10px JetBrains Mono, `letter-spacing: 0.04em`,
  ink-faint, e.g. `52.5200° N · 13.4050° E`.
- **Page-of-pages:** `004 / 008` in Inter Tight 11px ink-faint.
- **Roman numerals:** Playfair Italic 14px, coral, `I.` `II.` `III.` etc.
  at the head of every section rule.

## 4. Spacing & Grid

- **Container:** max-width `1360px`, side padding `64px` desktop,
  `44px` at ≤1280, `32px` at ≤1080, `24px` at ≤880.
- **Section padding:** `130px` top+bottom desktop, `90px` for
  tight sections, `80px` ≤560.
- **Grid:** 12-column conceptual, executed as CSS Grid with
  task-specific column ratios. Hero is `0.78fr 1.22fr`.
- **Vertical rhythm:** 8px baseline. Allow 32–48px between
  paragraph blocks.
- **Side rails:** Two 36px-wide fixed vertical strips on the left and
  right edges of the viewport, each containing a single rotated
  text label in 10px Inter Tight 600 letter-spaced 0.42em.

## 5. Layout & Composition

- **Top metadata strip** is mandatory: a single horizontal bar above
  the nav containing the volume/issue, a "Filed under …" badge, and a
  live-status pulse with version + locale. Inter Tight 10.5px,
  ink-faint, 1px ink-line border-bottom.
- **Section rule** is mandatory at the top of every section:
  `[Roman.] · [meta middle] · [page-of-008]`.
- **Image annotations**: every featured image carries 4 corner
  brackets (1px hairlines, 22×22), at least 1 plate number
  ("Plate Nº 08"), and a coordinate or SHA.
- **Hero must extend above the fold** at 1440×900 minimum. The image
  fills the viewport vertically (`calc(100vh - 160px)`), aligned to
  the right edge.
- **Method sections** must use a 4-step layout with a horizontal
  hairline running through the step heads at the same Y, with
  `→` separators between titles.

## 6. Components

### Buttons

- **Primary:** coral fill `#ed6f5c`, white label, `999px` radius,
  `14px 22px` padding, with a white arrow `↗` SVG at 14px and a
  coral 0,14,26,-16 rgba shadow.
- **Ghost:** transparent, `1px solid rgba(21,20,15,0.2)` border,
  ink label, same radius and padding.

### Cards

- **Bone-fill cards** (`#f7f1de`), 18px radius, 28×26 padding,
  inset 1px ink-at-6% ring + 30/60/-30/15 ambient shadow.
- Each card has a `01–04` italic serif num plus a tag eyebrow on
  the same row.
- A bottom-right 28px circular arrow mark turns coral on hover.

### Pill filters

- 10×18 padding, 999px, `1px solid line` border, transparent.
- Active state: coral fill, white label, count separator opacity 0.7.

### Stat rings

- 32–34px circular dashed rings carrying a 2-digit number; one ring
  per row may be coral-stroked to denote the highlighted stat.

### Page numbers / index card

- Hero artwork carries a small bordered card on the right edge with
  `01–04` index entries. The current entry uses bold ink; the rest
  ink-faint. Each item prefixes the digit with a coral `01` token.

### Side rails

- Fixed 36px vertical strips at left + right edges, hidden below
  1280px. Each contains rotated 10px Inter Tight uppercase text
  letter-spaced 0.42em, never wraps.

### Roman section rules

Every section opens with a `.sec-rule`: top hairline 1px, then a
flex row containing `[Roman]`, a centered metadata cluster, and
the page-of-008 counter on the right.

## 7. Motion & Interaction

- **Pulse dot:** 6×6 coral circle at top metadata bar and footer,
  `pulse 2.4s ease-in-out infinite` between 1.0 and 0.35 opacity.
- **Card hover:** translateY(-3px), arrow mark fills coral.
- **Button hover:** translateY(-1px), darker coral fill.
- **Pill hover:** ink-at-4% wash.
- **Transitions:** `0.18s ease` everywhere; never longer than `0.25s`.
- **No parallax, no scroll-jacking, no auto-rotators.** Editorial
  pages do not animate themselves at the user.

## 8. Voice & Brand

- Headlines mix declarative and italicized emotional words.
- Body copy is plain-spoken and specific. Quote real numbers
  (12 / 31 / 72), real coordinates (52.5200° N · 13.4050° E),
  real commands (`pnpm tools-dev`).
- Microcopy uses publication metaphors: "Filed under", "Plate Nº",
  "Vol. 01 / Issue Nº 26", "FIN.", "MMXXVI", "Edited by".
- Latin numerals — Roman for sections, Arabic for stats.

## 9. Anti-patterns

- ❌ No drop shadows above 30px blur. No gradients on text.
- ❌ No emoji in product copy. ★ is allowed once in the nav CTA.
- ❌ No glassmorphism, no neon, no neumorphism, no rounded
  corners larger than 24px (except 32px on the dark "Selected Work" panel).
- ❌ No more than one coral CTA per viewport.
- ❌ No collage image without corner brackets and at least one
  monospace annotation.
- ❌ No Roman numeral skipped — sections must be sequential.
- ❌ No pure white, no pure black, no pure 100%-saturation accent.

### Anti-patterns specific to AI-generated imagery

This system is paired with `gpt-image-fal` / `gpt-image-azure` via the
open-design-landing skill. Several common image-model defaults will
silently break the Atelier Zero aesthetic, so they are forbidden in
every collage prompt and rejected on visual review:

- ❌ No lens flares, light leaks, bloom, or cinematic post-FX. The
  paper-and-museum mood is matte, not cinematic.
- ❌ No glitch, datamosh, RGB-split, or scanline artifacts.
- ❌ No photorealistic human faces or stock-portrait people. Plaster
  fragments, busts, and small scale figures only — eyes never look at
  the viewer.
- ❌ No visible AI signatures, watermarks, generator logos, or
  hallucinated model captions. The rendered surface must read as a
  printed page, not a model output.
- ❌ No DSLR-style shallow depth-of-field bokeh on the collage
  fragments — every plane stays in focus.

## 10. Responsive Behavior

- **Desktop ≥ 1280px:** full container, two side rails visible,
  metadata strip shows all three columns.
- **Laptop 1080–1279px:** side rails hidden, container 32–44px
  padding, metadata strip's middle column collapses.
- **Tablet 880–1079px:** hero / about / capabilities / testimonial
  / cta grids collapse to 1 column at 50px gap. Method becomes 2×2,
  the connecting hairline is removed. Nav links + brand-meta hide;
  brand-mark + CTA remain.
- **Phone < 560px:** all multi-column grids become 1 col;
  section padding drops to 80px.

## 11. Imagery

This system is collage-first. Every page-level image must be
generated to match these constraints:

- **Background:** warm ivory paper with subtle grain, faint vertical
  folds, drafting registration marks.
- **Subject:** classical plaster head fragments, brutalist concrete
  blocks, archways, stairs, tree, sky cutouts, one small human figure.
- **Color overlay:** restrained — cream, stone, charcoal, washed
  coral, occasional mustard, pale-blue inside small sky cutouts.
- **Annotations baked in:** thin hairline circles, crosshairs,
  dotted matrices, numbered tags. Never typography that conflicts
  with on-page copy.

See `skills/open-design-landing/assets/imagegen-prompts.md` for the
working prompt pack and per-section variants. All renders should be
at 16:9 (heroes) or 1:1 (cards / about / cta), saved as PNG, ≥1024px
on the long edge.

## 12. Agent Prompt Guide

When generating against this design system:

- The page is a **printed magazine** that happens to deploy. Lean
  into print metaphors before web metaphors.
- Always include the metadata strip, the side rails, the Roman
  section rules, and a footer with a giant `Open Design.` (or brand)
  word at clamp(70px, 13vw, 200px).
- Coral is a single character on stage. If you find yourself
  reaching for a second coral element in the same viewport, use
  ink-faint or mustard instead.
- Italic serif words inside display headlines should always be
  emotional nouns: *intelligence*, *taste*, *memorable*, *open*,
  *visually*. Never verbs, never adjectives.
- If asked for "more dramatic," the lever is **typography size**
  (clamp top to 90–110px) and **image height** (push to 100vh - nav).
  Do not reach for color.
- If asked for "more minimal," remove decorative side notes and
  reduce annotations to one per image — never remove the Roman
  rules or the metadata strip.
