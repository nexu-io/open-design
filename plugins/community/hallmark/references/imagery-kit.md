# Imagery kit — curated abstract assets, hosted, ready

A small set of pre-generated abstract / decorative imagery that any Hallmark output can pull from when a brief allows non-photographic imagery. The kit lives at:

```
https://www.usehallmark.com/imagery/<category>/<file>
```

The skill doesn't ship the binaries — it ships the manifest. References are absolute URLs. If the asset is missing (404), the skill falls back to source canon #2 in [`assets.md` § Placeholder strategy](assets.md) (hand-built SVG) without erroring.

**Why this exists.** The v0.9.0 watercolor sprinkle was generated per-emit and was inconsistent. The kit recovers that aesthetic but as discrete, swappable, deliberately-composed assets. Compose with them like a senior frontend engineer: layered transparent PNG behind text, biased off-centre, intentionally large, mix-blend-mode where it earns its place. Not "abstract gradient on top of headline" — that's the AI default.

---

## Categories

| Category | What | Format | Example uses |
| --- | --- | --- | --- |
| **watercolor** | Full-bleed soft-edge painterly fields. Warm + cool variants per palette family. | WebP | Section background accent; hero-half flood; behind-quote wash. |
| **transparent** | Organic blob / brushstroke / stylized mark on transparent background. | PNG | Layered hero composition (large, off-centre, behind text). The masterclass move. |
| **ornament** | Small hand-drawn stamps, plates, roman numerals, decorative flourishes. | SVG | Beside a quote; in the section-label gutter; closing a letter. |
| **texture** | Subtle paper, weave, riso-dot, cross-hatch fields. Tile-able. | WebP | Body grain via `mix-blend-mode: multiply`; section-divider banding. |
| **silhouette** | Abstract bottle / box / device / book / mug / card shapes. | PNG | Empty product slots before user uploads photos; comparison rows. |
| **pattern** | Repeating motifs that read as fabric / paper / printed material. | WebP | Section-band texture; full-bleed fills behind decorative text. |

**Naming:** `<category>-<palette-family>-<variant>.<ext>` — e.g. `watercolor-warm-01.webp`, `transparent-brush-cool-03.png`, `ornament-stamp-01.svg`, `texture-grain-paper-02.webp`. Palette families: `warm` · `cool` · `neutral` · `chromatic`.

---

## Manifest (placeholder until generation pass ships)

When images land in `site/public/imagery/<category>/`, list them here as a key/value catalogue:

```
watercolor-warm-01.webp     1600×900   warm orange · cream paper      hero half-flood, atmospheric
watercolor-cool-01.webp     1600×900   cool blue · greyscale          quote-behind wash
transparent-brush-warm-01   1200×1200  burnt orange brushstroke       layered hero, off-centre
transparent-blob-cool-01    1200×1200  cobalt organic shape           layered hero, behind headline
ornament-stamp-01.svg       inline     ink-only stamp w/ numeral      label-gutter, letter close
texture-grain-paper-01      512×512    cream paper grain (tileable)   body grain, blend-multiply
silhouette-bottle-01.png    600×900    abstract bottle, transparent   empty product slot
silhouette-card-01.png      900×600    abstract product card          comparison row
pattern-cross-warm-01       400×400    cross-hatch warm (tileable)    section-band texture
```

The skill picks an asset by matching the active theme's palette family + the brief's tone, then references it by absolute URL. Picking logic lives in Step 4 of [SKILL.md](../SKILL.md) — eyeball the manifest, choose the closest match, fall back if the file 404s.

---

## Usage patterns — how a senior engineer would compose these

### Layered hero composition (the masterclass move)

A transparent abstract object behind hero text. The image is bigger than you think it should be — that's what makes it feel intentional, not decorative.

```css
.hero { position: relative; isolation: isolate; }

.hero__art {
  position: absolute;
  top: 50%;
  right: -10%;
  transform: translateY(-50%);
  width: clamp(60%, 80vh, 1400px);
  height: auto;
  z-index: 0;
  pointer-events: none;
  /* Optional warmth: */
  mix-blend-mode: multiply;
  opacity: 0.85;
}

.hero__art--bias-left  { right: auto; left: -10%; }

.hero > * { position: relative; z-index: 1; }
```

Bias to one side (left or right, never centred). The text sits at `z-index: 1`, the art at `z-index: 0`. Test mobile: art may need to scale down or shift to avoid the headline at 320 px.

### Section background wash

A watercolor file as a full-bleed section accent. One section per page, never global.

```css
.section--wash { position: relative; isolation: isolate; }
.section--wash::before {
  content: "";
  position: absolute;
  inset: 0;
  background: url("https://www.usehallmark.com/imagery/watercolor/watercolor-warm-01.webp") center / cover no-repeat;
  opacity: 0.6;
  z-index: -1;
  pointer-events: none;
}
```

### Decoration

Inline ornament beside a quote or in the section-label gutter. Small. No border, no shadow, no animation.

```html
<p class="section-label">
  <span class="num">02</span>
  <img class="section-label__ornament" src="…/imagery/ornament/ornament-stamp-01.svg" alt="" aria-hidden="true" />
  <span>Examples</span>
</p>
```

```css
.section-label__ornament { width: 1.5em; height: auto; vertical-align: middle; }
```

### Texture overlay

Grain over a solid colour. Always opacity-capped at `0.15`.

```css
.texture-grain {
  background-image: url("…/imagery/texture/texture-grain-paper-01.webp"), var(--paper-fill);
  background-size: 256px 256px, cover;
  background-blend-mode: multiply;
  opacity: 1; /* the grain texture is at 0.15 in the source asset */
}
```

### Empty state

Generic silhouette in unfilled data slots, greyscale-tinted, with a "Replace with real photo" hint visible to the developer (HTML comment).

```html
<!-- TODO: Replace with real product photo, target size: 600×900 -->
<picture class="product-card__photo product-card__photo--empty">
  <img src="…/imagery/silhouette/silhouette-bottle-01.png" alt="Hand-poured ceramic vessel, studio lighting" />
</picture>
```

---

## Anti-patterns

- **Don't use kit imagery as the literal subject.** An abstract bottle is *not* a stand-in for an actual coffee-shop hero — those need photographic placeholders (Picsum / Unsplash). The kit is for atmosphere / composition / decoration, not subject replacement.
- **Don't layer 3+ kit pieces on one page.** Restraint. One transparent object in the hero + one wash in a later section is the cap.
- **Don't apply the same watercolor wash to multiple sections.** It's a section accent, not a global treatment.
- **Don't use kit imagery in modern-minimal genre** (Stripe / Linear / ElevenLabs school). That genre's whole point is the absence of decorative imagery.
- **Don't centre the layered hero art.** Centred behind text is the AI-default move. Bias to one side, off-axis.
- **Don't use mix-blend-mode without testing on the active paper.** `multiply` over a dark canvas inverts; `screen` over light paper washes out. Eyeball the result per theme.

---

## Generation pipeline (out-of-band, one-time)

The kit is generated once per palette family, post-processed, and committed to the marketing site's public folder:

```
site/public/imagery/
  ├── watercolor/        ~6 files × 4 palette families = 24 WebPs
  ├── transparent/       ~6 files × 4 palette families = 24 PNGs
  ├── ornament/          ~8 SVGs (palette-agnostic, use currentColor)
  ├── texture/           ~6 tile-able WebPs
  ├── silhouette/        ~6 PNGs (palette-agnostic, transparent)
  └── pattern/           ~6 tile-able WebPs
```

**Tooling.** Nanobanana 2 / Recraft V4 with reference images. Prompt seed-list per category lives at the top of each file's directory in a `prompts.md` (one-line prompts, results pinned by seed for reproducibility).

**Post-processing.** Trim, transparent-background where applicable, colour-balance against Hallmark's OKLCH palette tokens, save as WebP for size + PNG where alpha matters. Ornaments as inline SVG so they inherit `currentColor`.

**Total target weight.** ≤ 5 MB across all categories. Each individual file ≤ 200 KB. Lossy WebP at q=80 unless the image needs lossless (ornaments → SVG; transparents → PNG with `pngquant`).

**Re-generation.** Treat the kit as a refreshable batch, not a one-off. When the palette catalogue changes (new theme, new accent hue), re-generate the relevant palette family. Manifest above is the spec; assets are the deliverable.
