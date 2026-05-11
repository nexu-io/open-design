# Shared Technical Standards

Common technical constraints for PPT Master, eliminating cross-role file duplication.

---

## 1. SVG Banned Features Blacklist

The following are **forbidden** in generated SVGs — PPT export breaks otherwise:

### 1.0 Text characters: must be well-formed XML

SVG is strict XML. Two rules for all text and attribute values:

| Character category | Required form | Forbidden form |
|---|---|---|
| Typography & symbols (em dash, en dash, ©, ®, →, ·, NBSP, full-width punctuation, emoji…) | **Raw Unicode characters** — write `—` `–` `©` `®` `→` directly | HTML named entities — `&mdash;` `&ndash;` `&copy;` `&reg;` `&rarr;` `&middot;` `&nbsp;` `&hellip;` `&bull;` etc. |
| XML reserved characters (`&`, `<`, `>`, `"`, `'`) | **XML entities only** — `&amp;` `&lt;` `&gt;` `&quot;` `&apos;` (e.g. `R&amp;D`, `error &lt; 5%`) | Bare `&` `<` `>` (e.g. `R&D`, `error < 5%`) |

One offending character invalidates the file and aborts export. Numeric refs (`&#160;` / `&#xa0;`) are XML-legal but discouraged.

**Structural blacklist** (in addition to the character rules above):

| Banned Feature | Description |
|----------------|-------------|
| `mask` | Masks |
| `<style>` | Embedded stylesheets |
| `class` | CSS selector attributes (`id` inside `<defs>` is a legitimate reference and is NOT banned) |
| External CSS | External stylesheet links |
| `<foreignObject>` | Embedded external content |
| `<symbol>` + `<use>` | Symbol reference reuse |
| `textPath` | Text along a path |
| `@font-face` | Custom font declarations |
| `<animate*>` / `<set>` | SVG animations |
| `<script>` / event attributes | Scripts and interactivity |
| `<iframe>` | Embedded frames |

> **`marker-start` / `marker-end` is conditionally allowed** — see §1.1 for constraints. The converter maps qualifying markers to native DrawingML `<a:headEnd>` / `<a:tailEnd>`.
>
> **`clipPath` on `<image>` is conditionally allowed** — see §1.2 for constraints. The converter maps qualifying clip shapes to native DrawingML picture geometry (`<a:prstGeom>` or `<a:custGeom>`).
>
> **Replacing `<mask>` effects** — DrawingML has no per-pixel alpha. Route by effect:
> - Image gradient overlay (vignette/fade/tint) → stacked `<rect>` with `<linearGradient>`/`<radialGradient>` (§6 Image Overlay)
> - Non-rectangular image crop (circle/rounded/hexagon) → `clipPath` on `<image>` (§1.2)
> - Inner glow / soft-edge → `<filter>` with `<feGaussianBlur>` (§6 Glow)
> - Drop shadow → filter shadow or layered rect (§6 Shadow)
>
> Pixel-level alpha effects (text-knockout image fills, arbitrary alpha composites) have no PPT path — bake into the source image at Image_Generator stage.

---

### 1.1 Line-end Markers (Conditionally Allowed)

`marker-start` and `marker-end` on `<line>` and `<path>` elements are allowed **only** when the referenced `<marker>` satisfies all of the following:

| Requirement | Reason |
|-------------|--------|
| Marker `<marker>` element defined inside `<defs>` | Converter looks up marker defs via id index |
| `orient="auto"` | DrawingML arrow auto-rotates along the line tangent; other orient values will not round-trip |
| Marker shape is **one of**: closed 3-vertex path/polygon (triangle), closed 4-vertex path/polygon (diamond), `<circle>` / `<ellipse>` (oval) | These three map cleanly to DrawingML `type="triangle" / "diamond" / "oval"`. Any other shape is silently dropped with a warning. |
| Marker child's `fill` **matches** the parent line's `stroke` color | In DrawingML the arrow head inherits the line color — a mismatched marker fill will look wrong on export. |
| `markerWidth` / `markerHeight` roughly in `3–15` range | Mapped to `sm` (<6) / `med` (6–12) / `lg` (>12) size buckets. |

**Use boundary**:

- `marker-start` / `marker-end`: only for connector arrows where the line is primary
- For block / chunky / solid arrows (arrow body is the visual object), use standalone closed `<path>` / `<polygon>`; see `templates/charts/chevron_process.svg` or `templates/charts/process_flow.svg`

**Supported DrawingML mapping**:

| SVG Marker Shape | DrawingML Output |
|------------------|------------------|
| `<path d="M0,0 L10,5 L0,10 Z"/>` (triangle) | `<a:tailEnd type="triangle" w="med" len="med"/>` |
| `<polygon points="0,0 10,5 0,10"/>` | `<a:tailEnd type="triangle" w="med" len="med"/>` |
| 4-vertex closed path/polygon | `<a:tailEnd type="diamond" .../>` |
| `<circle cx="5" cy="5" r="4"/>` | `<a:tailEnd type="oval" .../>` |

**Recommended template** — a standard arrow-head definition ready to reuse:

```xml
<defs>
  <marker id="arrowHead" markerWidth="10" markerHeight="10" refX="9" refY="5"
          orient="auto" markerUnits="strokeWidth">
    <path d="M0,0 L10,5 L0,10 Z" fill="#1976D2"/>
  </marker>
</defs>
<line x1="100" y1="200" x2="400" y2="200" stroke="#1976D2" stroke-width="3"
      marker-end="url(#arrowHead)"/>
```

> ⚠️ Unclassifiable marker shapes (curved paths, multi-segment, >4 vertices) are silently dropped — line renders without arrow. Use a manual `<polygon>` for exotic shapes.

---

### 1.2 Image Clipping (Conditionally Allowed)

`clip-path` on `<image>` elements is allowed when the referenced `<clipPath>` satisfies the following:

| Requirement | Reason |
|-------------|--------|
| `<clipPath>` element defined inside `<defs>` | Converter looks up clip defs via id index |
| Contains a **single** shape child | First child is used; multiple children are not composited |
| Shape is one of: `<circle>`, `<ellipse>`, `<rect>` (with rx/ry), `<path>`, `<polygon>` | These map to DrawingML geometry (preset or custom) |
| Used **only on `<image>` elements** | Non-image elements with clip-path are **forbidden** |

**Use boundary**:

- Only on `<image>` for non-rectangular crops (circular avatars, rounded frames, hexagons)
- NOT on shapes (`<rect>`/`<circle>`/`<path>`/`<g>`/`<text>`) — draw the target shape directly. A rect clipped to a circle is just a circle.
- PowerPoint's SVG renderer doesn't handle `clipPath`; only the Native PPTX converter does.

**Supported DrawingML mapping**:

| SVG Clip Shape | DrawingML Output | Use Case |
|----------------|------------------|----------|
| `<circle>` / `<ellipse>` | `<a:prstGeom prst="ellipse"/>` | Circular avatar, oval frame |
| `<rect rx="..."/>` | `<a:prstGeom prst="roundRect"/>` with adj value | Rounded rectangle photo frame |
| `<path>` / `<polygon>` | `<a:custGeom>` with path commands | Hexagon, diamond, custom shape |

**Recommended template** — circular image clip:

```xml
<defs>
  <clipPath id="avatarClip">
    <circle cx="200" cy="200" r="100"/>
  </clipPath>
</defs>
<image href="../images/photo.jpg" x="100" y="100" width="200" height="200"
       clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"/>
```

**Rounded rectangle clip** — for card-style image frames:

```xml
<defs>
  <clipPath id="cardClip">
    <rect x="60" y="120" width="400" height="250" rx="16"/>
  </clipPath>
</defs>
<image href="../images/banner.jpg" x="60" y="120" width="400" height="250"
       clip-path="url(#cardClip)" preserveAspectRatio="xMidYMid slice"/>
```

> ⚠️ `clip-path` on non-image elements is FORBIDDEN — quality checker errors out. Draw target geometry directly.

---

## 2. PPT Compatibility Alternatives

| Banned Syntax | Correct Alternative |
|---------------|---------------------|
| `fill="rgba(255,255,255,0.1)"` | `fill="#FFFFFF" fill-opacity="0.1"` |
| `<g opacity="0.2">...</g>` | Set `fill-opacity` / `stroke-opacity` on each child element individually |
| `<image opacity="0.3"/>` | Overlay a `<rect fill="background-color" opacity="0.7"/>` mask layer after the image |

**Mnemonic**: PPT does not recognize rgba, group opacity, or image opacity.

> Arrows: prefer `marker-end` for connector lines (§1.1) — converter produces native auto-rotating arrow heads. For block/chunky arrows, use standalone closed shapes; see `templates/charts/chevron_process.svg` and `templates/charts/process_flow.svg`.

---

## 3. Canvas Format Quick Reference

> See [`canvas-formats.md`](canvas-formats.md) for the full format table (presentations / social / marketing) and the format-selection decision tree.

---

## 4. Basic SVG Rules

- **viewBox** must match the canvas dimensions (`width`/`height` must match `viewBox`)
- **Background**: Use `<rect>` to define the page background color
- **`<tspan>`** has two purposes: (1) manual line breaks (use `dy` or explicit `y`); (2) inline run formatting on the same line (color/weight/size). `<foreignObject>` is FORBIDDEN. See "Single logical line" rule below.
- **Fonts**: every `font-family` stack MUST end with a pre-installed family (Microsoft YaHei / SimSun / Arial / Times New Roman / Consolas …); `@font-face` is FORBIDDEN. Full rule: [`strategist.md §g`](strategist.md).
- **Styles**: inline only (`fill=""`, `font-size=""`); `<style>`/`class` FORBIDDEN (`id` inside `<defs>` is fine)
- **Colors**: HEX only; transparency via `fill-opacity`/`stroke-opacity`
- **Images**: `<image href="../images/xxx.png" preserveAspectRatio="xMidYMid slice"/>`
- **Icons**: `<use data-icon="<library>/<name>" x="" y="" width="48" height="48" fill="#HEX"/>` (auto-embedded post-processing). Always include library prefix. One stylistic library per deck (`chunk-filled`/`tabler-filled`/`tabler-outline`/`phosphor-duotone`); `simple-icons` only for real brand marks. See [`../templates/icons/README.md`](../templates/icons/README.md).

### Inline Text Runs (Single Logical Line = Single `<text>`)

One logical line — even with mixed colors/weights/sizes — MUST be one `<text>` with inline `<tspan>` children. Never use multiple adjacent `<text>` elements. The converter maps each `<tspan>` to a `<a:r>` run within the same PPT text frame, keeping the line as one editable shape.

✅ **DO** — one `<text>` → one text frame with three runs:

```xml
<text x="100" y="200" font-size="24" fill="#333333">
  实现<tspan fill="#1A73E8" font-weight="bold">10倍</tspan>效率提升
</text>
```

❌ **DON'T** — three side-by-side `<text>` elements become three separate text frames in PPT (breaks edit-as-one-line, risks alignment drift, makes spacing fragile):

```xml
<text x="100" y="200" font-size="24" fill="#333333">实现</text>
<text x="160" y="200" font-size="24" fill="#1A73E8" font-weight="bold">10倍</text>
<text x="240" y="200" font-size="24" fill="#333333">效率提升</text>
```

**⚠️ Inline tspans must NOT carry `x`/`y`/`dy`** — those mark a new line, and `flatten_tspan` will split into a separate text frame. `dx` is safe (kerning, stays inline). Only set `x`/`y`/`dy` on tspans that genuinely start a new line.

**Multi-line `<text>` with per-line emphasis works**: an outer line-break tspan (with `x` + `dy` or `y`) MAY contain nested inline tspans for color/weight/size — converter walks nested tspans and emits one run per styled segment:

```xml
<text x="80" y="190" font-size="18" fill="#333333">
  <tspan x="80" dy="0">完成率<tspan fill="#4CAF50" font-weight="bold">98%</tspan>超预期</tspan>
  <tspan x="80" dy="35">成本降低<tspan fill="#F44336" font-weight="bold">¥120万</tspan></tspan>
</text>
```

❌ **DON'T** — same-line column jump via `<tspan x="...">`:

```xml
<text x="100" y="200" font-size="18" fill="#333333">
  <tspan x="100">左列</tspan><tspan x="600" font-weight="bold">右列</tspan>
</text>
```

`x` on a tspan starts a new line, splitting into two independent text frames. For two-column layouts, write two `<text>` elements.

**Default — lift key information.** Uniform-styled paragraphs read as walls of text. Wrap these in `<tspan fill="..." font-weight="bold">`:

- **Numerical results** — percentages, multipliers (`10x`), absolute amounts (`¥120万`)
- **Contrasts** — gain/loss, before/after, target/actual
- **One or two load-bearing nouns per sentence** — the term that carries the insight

Do NOT highlight: connectives, common verbs, every noun, decorative adjectives, structural text (footer/axis/legend/page number/labels).

Color: use the deck's primary brand color for emphasis. Reserve green/red for actual positive/negative semantics.

❌ **DON'T** — uniform-styled paragraph buries the insight:

```xml
<text x="80" y="200" font-size="20" fill="#333333">
  2024年公司营收同比增长35%达到12亿元创历史新高
</text>
```

✅ **DO** — same line, key data lifted:

```xml
<text x="80" y="200" font-size="20" fill="#333333">
  2024年公司营收同比<tspan fill="#1A73E8" font-weight="bold">增长35%</tspan>达到<tspan fill="#1A73E8" font-weight="bold">12亿元</tspan>创历史新高
</text>
```

### Element Grouping (Mandatory)

Wrap logically related elements in top-level `<g id="...">` groups. Produces PowerPoint groups in PPTX, making slides easier to select/move/edit and providing stable anchors for optional per-element entrance animation.

> ⚠️ Only `<g opacity="...">` is banned (§2). Plain `<g>` for grouping is required.

**Animation-ready rule**: direct children of `<svg>` should be semantic groups, not raw drawing atoms. Aim for **3–8 top-level content `<g id>` groups per slide** (the 3–8 budget excludes page chrome — see below); each content group becomes one entrance step under the chosen `--animation-trigger` mode (one click in `on-click`, one cascade slot in `after-previous`, parallel in `with-previous`).

**Chrome groups are excluded automatically.** The exporter treats top-level groups whose id contains chrome tokens as page chrome and skips them in the animation sequence — they appear together with the slide. Tokens (matched against id after splitting on `-` / `_`): `background`, `bg`, `decoration` / `decorations` / `decor`, `header`, `footer`, `chrome`, `watermark`, `pagenumber` / `pagenum` / `page-number`. So `<g id="bg-texture">`, `<g id="cover-footer">`, `<g id="p03-header">`, `<g id="bottom-decor">` all skip animation while keeping their `<g>` wrapper for editing/grouping. Use these naming conventions for chrome — do **not** strip the `<g>` wrapper.

**What to group**:

| Grouping Unit | Contains |
|---------------|----------|
| Card / panel | Background rect + (optional shadow only if the card floats over a photo/colored panel — see §6) + icon + title + body text |
| Process step | Number circle + icon + label + description |
| List item | Bullet / number + icon + title + description |
| Icon-text combo | Icon element + adjacent label |
| Page header | Title + subtitle + accent decoration |
| Page footer | Page number + branding |
| Decorative cluster | Related decorative shapes (rings, orbs, dots) |

**Do not**:

- Put the whole slide into one giant `<g>`; that leaves only one animation step.
- Leave many top-level `<rect>` / `<text>` / `<path>` elements ungrouped; fallback animation is capped at 8 primitives and dense flat pages may skip animation.
- Split every icon, text line, or decorative mark into separate top-level groups; that creates too many click steps.
- Use anonymous top-level groups. Every top-level semantic group needs a descriptive `id`.

**Example**:

```xml
<g id="card-benefits-1">
  <!-- This card floats over a colored panel — shadow is appropriate. On a flat white canvas, omit the filter. -->
  <rect x="60" y="115" width="565" height="260" rx="20" fill="#FFFFFF" filter="url(#shadow)"/>
  <use data-icon="chunk-filled/bolt" x="108" y="163" width="44" height="44" fill="#0071E3"/>
  <text x="105" y="270" font-size="56" font-weight="bold" fill="#0071E3">10×</text>
  <text x="250" y="270" font-size="30" font-weight="bold" fill="#1D1D1F">Faster</text>
  <text x="105" y="310" font-size="18" fill="#6E6E73">Reduce production time from days to hours.</text>
</g>
```

**Naming**: descriptive `id` on top-level `<g>` is **required** (e.g., `card-1`, `step-discover`, `header`, `footer`). Each top-level `<g id>` becomes one anchor for per-element entrance animation in PPTX export; without it, the exporter falls back to at most 8 top-level primitives or skips animation on dense pages.

---

## 5. Post-processing Pipeline (3 Steps)

Must be executed in order — skipping or adding extra flags is FORBIDDEN:

```bash
# 1. Split speaker notes into per-page note files
python3 scripts/total_md_split.py <project_path>

# 2. SVG post-processing (icon embedding, image crop/embed, text flattening, rounded rect to path)
python3 scripts/finalize_svg.py <project_path>

# 3. Export PPTX (from svg_final/, embeds speaker notes by default)
python3 scripts/svg_to_pptx.py <project_path>
# Output:
#   exports/<project_name>_<timestamp>.pptx           ← main native pptx
#   backup/<timestamp>/<project_name>_svg.pptx        ← SVG snapshot
#   backup/<timestamp>/svg_output/                    ← Executor SVG source backup
```

**Optional animation flags** (only when the user asks):
- `-t <effect>` — page transition (`fade` / `push` / `wipe` / `split` / `strips` / `cover` / `random` / `none`; default `fade`)
- `-a <effect>` — per-element entrance animation (`fade` / `mixed` / `random` / one of 22 named effects / `none`; default `mixed`). Anchors on top-level `<g id="...">` groups.
- `--animation-trigger {on-click,with-previous,after-previous}` — Start mode matching PowerPoint's animation-pane Start dropdown. Default `after-previous` (cascade on slide entry; pace via `--animation-stagger <seconds>`); `on-click` advances per click; `with-previous` plays all groups together.
- `--auto-advance <seconds>` — kiosk-style auto-play

**Optional recorded narration** (only when the user asks for narrated/video export):

```bash
python3 scripts/notes_to_audio.py <project_path> --voice zh-CN-XiaoxiaoNeural
python3 scripts/svg_to_pptx.py <project_path> --recorded-narration audio
```

- `notes_to_audio.py` reads split `notes/*.md` files and writes one audio file per slide to `audio/`. Default `edge` output is MP3; configured cloud providers may output MP3 or WAV depending on provider settings.
- `--recorded-narration audio` embeds matching audio, keeps speaker notes, and sets slide timings from audio duration.

Full reference: [`animations.md`](animations.md).

**Prohibited**:
- NEVER use `cp` as a substitute for `finalize_svg.py`
- NEVER force `-s output` for the legacy/preview pptx (PowerPoint's internal SVG parser drops icons and rounded corners). Default auto-split already gives native the high-fidelity source it needs without affecting legacy.
- NEVER use `--only` (it suppresses one of the two output files)

> Source-directory split: by default `svg_to_pptx.py` reads `svg_output/` for the native pptx (preserves icon `<use>`, image `preserveAspectRatio` → `srcRect`, rounded rect `rx/ry` → `prstGeom roundRect`) and `svg_final/` for the legacy/preview pptx (PowerPoint's internal SVG parser needs the flattened form). Pass `-s output` or `-s final` only when you specifically want both products to read from a single source.

**Re-run rule**: Any change to `svg_output/` after post-processing requires re-running Steps 2-3. Step 1 only re-runs if `notes/total.md` changed.

---

## 6. Shadow & Overlay Techniques

> `<mask>` elements and `<image opacity="...">` are banned. Always use stacked `<rect>` or gradient overlays instead (see §2).

### Shadow

> **Shadow is restraint, not default.** The "designed" feel comes from absence, not abundance.

#### When to use

Only when the element genuinely floats above another layer:
- Card / quote bubble / annotation on a photo or colored panel
- Single primary CTA or "recommended" item picked out from peers
- Overlay layer (callout, tooltip, modal emphasis)
- Floating image card on a textured background

#### When NOT to use

- Background panels / dividers / decorative bars — they are the floor
- Equal peer cards in a 2/3/4-up grid — keep all flat
- Containers with visible border, gradient fill, or strong tint — redundant
- Body-text paragraph containers — disrupts scan rhythm
- Decorative lines / dividers / icons — they are symbols, not objects
- Pages with only one content container — no second layer to lift above
- Dark backgrounds — black shadows vanish; use 1px low-opacity white stroke or outer glow

**Per-page budget**: ≤2-3 shadowed elements. If you reach for a 4th, drop one first.

#### Single light source per page

All `feOffset` on a page must share the same `dx`/`dy` direction. Default: `dx="0"`, `dy="4"`-`dy="8"` (light from upper front).

#### Restraint over visibility

Standard: "the shadow is felt, not seen." If noticed, it's too strong.
- Resting cards: `flood-opacity` 0.06-0.12
- Raised elements (CTA, overlay): max `flood-opacity` 0.20
- Above 0.20 = Office 2007 hard-shadow look
- Color: near-black at low opacity, or a darker tint of background. Brand-color shadow only on accent elements sharing that hue.

#### Two-tier elevation maximum

A page may have at most two non-floor tiers.

| Tier | When | dy | stdDeviation | flood-opacity |
|------|------|----|--------------|---------------|
| Floor (no shadow) | Backgrounds, peer-grid cards, dividers, body-text containers | — | — | — |
| Resting | Cards on photos/panels, secondary callouts | 2-4 | 4-8 | 0.06-0.10 |
| Raised | Primary CTA, focused/recommended card, overlay | 6-10 | 10-16 | 0.12-0.20 |

#### Don't stack visual-weight tools

Pick **one** per container: shadow, border, gradient fill, or strong tint. Stacking = instant template look.

---

#### Filter Soft Shadow — Recommended

Best for: cards, floating panels, elevated elements. The `svg_to_pptx` converter automatically converts `feGaussianBlur` + `feOffset` into native PPTX `<a:outerShdw>`.

```xml
<defs>
  <filter id="softShadow" x="-15%" y="-15%" width="140%" height="140%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="12"/>
    <feOffset dx="0" dy="6" result="offsetBlur"/>
    <feFlood flood-color="#000000" flood-opacity="0.10" result="shadowColor"/>
    <feComposite in="shadowColor" in2="offsetBlur" operator="in" result="shadow"/>
    <feMerge>
      <feMergeNode in="shadow"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
</defs>
<rect x="60" y="60" width="400" height="240" rx="12" fill="#FFFFFF" filter="url(#softShadow)"/>
```

Recommended parameters (see "Two-tier elevation maximum" above for tier guidance):
```
stdDeviation:   4–16       (resting cards: 4–8;  raised elements: 10–16)
flood-opacity:  0.06–0.12  (resting cards — default)
                0.12–0.20  (raised elements only — primary CTA, overlay)
                NEVER     > 0.20  (Office 2007 hard-shadow look)
dy:             2–10       (resting: 2–4;  raised: 6–10)
dx:             0–2        (must match every other shadow on the page — single light source)
```

#### Colored Shadow

Best for: accent buttons, brand-colored cards. Use the element's own color family instead of black.

```xml
<filter id="colorShadow" x="-15%" y="-15%" width="140%" height="140%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="10"/>
  <feOffset dx="0" dy="6" result="offsetBlur"/>
  <feFlood flood-color="#1A73E8" flood-opacity="0.20" result="shadowColor"/>
  <feComposite in="shadowColor" in2="offsetBlur" operator="in" result="shadow"/>
  <feMerge>
    <feMergeNode in="shadow"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>
```

Replace `flood-color` with the element's brand color. Keep `flood-opacity` 0.12-0.20. Reserve for the single primary CTA per page — using on every button defeats the cue.

#### Glow Effect

Best for: title highlights, key metrics, hero text. The converter automatically converts `feGaussianBlur` without `feOffset` into native PPTX `<a:glow>`.

```xml
<defs>
  <filter id="titleGlow" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="blur"/>
    <feFlood flood-color="#1A73E8" flood-opacity="0.45" result="glowColor"/>
    <feComposite in="glowColor" in2="blur" operator="in" result="glow"/>
    <feMerge>
      <feMergeNode in="glow"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
</defs>
<text x="640" y="360" text-anchor="middle" font-size="48" fill="#1A73E8" filter="url(#titleGlow)">Key Insight</text>
```

Recommended parameters:
```
stdDeviation:   4–8      (smaller = subtle, larger = prominent)
flood-color:    brand color or accent color (NOT black)
flood-opacity:  0.35–0.55  (stronger than shadow for visibility)
```

**vs shadow**: no `<feOffset>` (or dx=0/dy=0). The converter uses this to distinguish glow from shadow.

#### Layered Rect Shadow — High-Compatibility Fallback

Best for: maximum compatibility with older PowerPoint versions. Stack 2–3 semi-transparent rectangles behind the main card:

```xml
<!-- Shadow layers (back to front, largest offset first) -->
<rect x="68" y="72" width="400" height="240" rx="16" fill="#000000" fill-opacity="0.03"/>
<rect x="65" y="69" width="400" height="240" rx="14" fill="#000000" fill-opacity="0.05"/>
<rect x="62" y="66" width="400" height="240" rx="12" fill="#1A73E8" fill-opacity="0.04"/>
<!-- Main card -->
<rect x="60" y="60" width="400" height="240" rx="12" fill="#FFFFFF"/>
```

### Image Overlay

#### Linear Gradient Overlay — Most Common

Best for: image+text pages. Gradient direction should match text position (text on left → gradient darkens toward left).

```xml
<image href="..." x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/>
<defs>
  <linearGradient id="imgOverlay" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="#1A1A2E" stop-opacity="0.85"/>
    <stop offset="55%"  stop-color="#1A1A2E" stop-opacity="0.30"/>
    <stop offset="100%" stop-color="#1A1A2E" stop-opacity="0"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="1280" height="720" fill="url(#imgOverlay)"/>
```

#### Bottom Gradient Bar

Best for: cover slides and full-image pages with bottom title.

```xml
<defs>
  <linearGradient id="bottomBar" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.72"/>
  </linearGradient>
</defs>
<rect x="0" y="380" width="1280" height="340" fill="url(#bottomBar)"/>
```

#### Radial Gradient Overlay — Vignette Effect

Best for: full-screen atmosphere slides; draws attention to the center.

```xml
<defs>
  <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
    <stop offset="0%"   stop-color="#000000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#000000" stop-opacity="0.58"/>
  </radialGradient>
</defs>
<rect x="0" y="0" width="1280" height="720" fill="url(#vignette)"/>
```

#### Brand Color Overlay

Best for: slides needing strong visual brand identity.

```xml
<defs>
  <linearGradient id="brandOverlay" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="#005587" stop-opacity="0.80"/>
    <stop offset="100%" stop-color="#005587" stop-opacity="0.10"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="1280" height="720" fill="url(#brandOverlay)"/>
```

### Quick-Reference Table

| Scenario | Recommended Technique | Avoid |
|----------|-----------------------|-------|
| Card / panel shadow (only when floating over photo/colored panel) | Filter soft shadow (`flood-opacity` 0.06–0.12, single light source) | Hard black shadow, full-page abundance |
| Equal peer cards in a grid | All flat (no shadow) | Lifting every card uniformly |
| Page-section background panel | Flat fill, no shadow | Treating panels as floating cards |
| Accent / CTA button (one per page) | Colored shadow (same hue family, `flood-opacity` 0.12–0.20) | Generic gray shadow, applying to every button |
| Title / metric highlight | Glow filter (brand color, no offset) | Overuse on body text |
| Text over image | Linear gradient overlay (direction matches text side) | Uniform flat opacity over whole image |
| Cover / full-image slide | Bottom gradient bar + brand color | Solid black overlay |
| Atmosphere / hero slide | Radial vignette | Unprocessed raw image |
| Max PPT compatibility needed | Layered rect shadow | Filter-based shadow |

---

## 7. Stroke, Text & Shape Effects

### stroke-dasharray — Dashed / Dotted Lines

Converts to native PPTX `<a:prstDash>`. Use preset patterns for best results:

| SVG Value | PPTX Preset | Best For |
|-----------|-------------|----------|
| `4,4` | Dash | General dashed lines, separators |
| `2,2` | Dot (sysDot) | Subtle dotted borders, placeholder outlines |
| `8,4` | Long dash | Timeline connectors, flow arrows |
| `8,4,2,4` | Long dash-dot | Technical drawings, dimension lines |

```xml
<rect x="60" y="60" width="400" height="240" rx="12"
  fill="none" stroke="#999999" stroke-width="2" stroke-dasharray="4,4"/>

<line x1="100" y1="360" x2="1180" y2="360"
  stroke="#CCCCCC" stroke-width="1" stroke-dasharray="2,2"/>
```

### stroke-linejoin

Controls how line segments join at corners. Supported values convert to native PPTX line join types:

| SVG Value | PPTX Equivalent | Best For |
|-----------|-----------------|----------|
| `round` | Round join | Smooth polyline charts, organic shapes |
| `bevel` | Bevel join | Technical diagrams |
| `miter` | Miter join (default) | Sharp-cornered rectangles, arrows |

```xml
<polyline points="100,200 200,100 300,200" fill="none"
  stroke="#1A73E8" stroke-width="3" stroke-linejoin="round"/>
```

### text-decoration

Supported text decorations convert to native PPTX text formatting:

| SVG Value | PPTX Equivalent | Best For |
|-----------|-----------------|----------|
| `underline` | Single underline | Emphasis, links, key terms |
| `line-through` | Strikethrough | Removed items, before/after comparisons |

```xml
<text x="100" y="200" font-size="20" fill="#333333" text-decoration="underline">Important Term</text>

<!-- Per-tspan decoration -->
<text x="100" y="240" font-size="18" fill="#333333">
  Regular text <tspan text-decoration="line-through" fill="#999999">old value</tspan> new value
</text>
```

### Gradient Fill — linearGradient & radialGradient

Gradients defined in `<defs>` and referenced via `fill="url(#id)"` convert to native PPTX `<a:gradFill>`. Use them as shape fills (not just overlays) for polished surfaces.

**Linear gradient** — best for buttons, header bars, background panels:

```xml
<defs>
  <linearGradient id="btnGrad" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="#1A73E8"/>
    <stop offset="100%" stop-color="#0D47A1"/>
  </linearGradient>
</defs>
<rect x="540" y="600" width="200" height="48" rx="24" fill="url(#btnGrad)"/>
```

**Radial gradient** — best for spotlight backgrounds, circular accents:

```xml
<defs>
  <radialGradient id="spotBg" cx="50%" cy="50%" r="70%">
    <stop offset="0%" stop-color="#1A73E8" stop-opacity="0.15"/>
    <stop offset="100%" stop-color="#1A73E8" stop-opacity="0"/>
  </radialGradient>
</defs>
<circle cx="640" cy="360" r="300" fill="url(#spotBg)"/>
```

### transform: rotate — Element Rotation

Rotation converts to native PPTX `<a:xfrm rot="...">`. Supported on all element types: `rect`, `circle`, `ellipse`, `line`, `path`, `polygon`, `polyline`, `image`, and `text`.

```xml
<!-- Rotated decorative element -->
<rect x="100" y="100" width="60" height="60" fill="#1A73E8" fill-opacity="0.1"
  transform="rotate(45, 130, 130)"/>

<!-- Rotated text label -->
<text x="50" y="400" font-size="14" fill="#999999"
  transform="rotate(-90, 50, 400)">Y-Axis Label</text>
```

**Syntax**: `rotate(angle)` or `rotate(angle, cx, cy)` where `cx,cy` is the rotation center. Positive angles rotate clockwise.

### Arc Paths — Donut / Pie Charts

Calculate arc endpoint coordinates precisely with trigonometry. Never estimate — small errors produce wildly wrong shapes.

**Calculation formula** (center `cx,cy`, radius `r`, angle `θ` in degrees):
```
x = cx + r × cos(θ × π / 180)
y = cy + r × sin(θ × π / 180)
```

**Key rules**:
1. Start at **-90°** (12 o'clock position) and go clockwise
2. Each sector spans `percentage × 360°`
3. Use **large-arc flag = 1** when the sector is > 180°, **0** otherwise
4. sweep-direction = 1 (clockwise) for outer arc, 0 (counter-clockwise) for inner arc returning
5. **Always verify** that the sum of all sector angles equals 360° and that the last sector's end point matches the first sector's start point

**Example — 75% donut sector** (center 400,400, outer r=180, inner r=100):
```
Start angle: -90°    → outer(400, 220), inner(400, 300)
End angle: -90+270=180° → outer(220, 400), inner(300, 400)
Large-arc flag: 1 (270° > 180°)

<path d="M 400,220 A 180,180 0 1,1 220,400 L 300,400 A 100,100 0 1,0 400,300 Z"/>
```

### Polygon Arrows on Diagonal Lines

> For connector lines prefer `marker-end`/`marker-start` (§1.1). For chunky/wide solid/non-connector arrows, use standalone polygon or path.

Horizontal/vertical lines can use simple point offsets for `<polygon>` arrowheads. Diagonal lines need triangle vertices rotated to match line direction.

**Method** — calculate triangle points using the line's direction vector:

```
Given line from (x1,y1) to (x2,y2):
1. Direction vector: dx = x2-x1, dy = y2-y1
2. Normalize: len = √(dx²+dy²), ux = dx/len, uy = dy/len
3. Perpendicular: px = -uy, py = ux
4. Arrow tip = (x2, y2)
5. Back point 1 = (x2 - ux×12 + px×5,  y2 - uy×12 + py×5)
6. Back point 2 = (x2 - ux×12 - px×5,  y2 - uy×12 - py×5)
```

**Example — diagonal line** from (260,310) to (370,430):
```
dx=110, dy=120, len≈162.8, ux=0.676, uy=0.737
px=-0.737, py=0.676
Tip: (370, 430)
Back1: (370-8.1-3.7, 430-8.8+3.4) = (358.2, 424.6)
Back2: (370-8.1+3.7, 430-8.8-3.4) = (365.6, 417.8)

<polygon points="370,430 365.6,417.8 358.2,424.6" fill="#C8A96E"/>
```

⚠️ Never use a fixed downward/rightward triangle on a diagonal line — arrow will point wrong.

---

## 8. Project Directory Structure

```
project/
├── svg_output/    # Raw SVGs (Executor output, contains placeholders)
├── svg_final/     # Post-processed final SVGs (finalize_svg.py output)
├── images/        # Image assets (user-provided + AI-generated)
├── notes/         # Speaker notes (.md files matching SVG names)
│   └── total.md   # Complete speaker notes document (before splitting)
├── templates/     # Project templates (if any)
└── *.pptx         # Exported PPT file
```
