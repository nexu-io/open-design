> See shared-standards.md for common technical constraints.

# Image Layout Specification

Layout rules for pages where the image is placed **side-by-side with body text** as a container block. Strategist and Executor both follow these rules when the image's narrative intent is *side-by-side*.

**Core principle (side-by-side)**: compute container layout from the image's original aspect ratio so the image displays completely — no excess whitespace, no cropping.

> **Scope**: this spec applies to *side-by-side* intent only. Other intents (hero / full-bleed, atmosphere / background, accent / inline) use full-bleed placement where ratio alignment is not a constraint and cropping is expected — the ratio→split table below does NOT apply. See `references/strategist.md` §h for intent selection.

---

## Layout Decision Flow

```
1. Decide narrative intent (hero / atmosphere / side-by-side / accent) — see strategist.md §h
2. If intent = side-by-side: continue below. Otherwise: compose per narrative; this spec does not apply.
3. Get image original dimensions → Calculate ratio (width/height)
4. Select layout type based on ratio
5. Calculate maximum display size for the image
6. Allocate remaining space for text area
7. Fill results into the Design Specification's image resource list
```

**When to run**: if image approach includes "B) User-provided", run the scan and populate the image resource list after the Strategist's Eight Confirmations and before content analysis / outlining.

---

## Layout Type Selection (side-by-side intent)

| Image Ratio | Layout Type | Image Position | Description |
|-------------|-------------|----------------|-------------|
| > 2.0 (ultra-wide) | Top-bottom split | Top full-width | Image spans canvas width, height proportional |
| 1.5-2.0 (wide) | Top-bottom split | Top | Image width = content area width, height proportional |
| 1.2-1.5 (standard) | Left-right split | Left | Image height-first fit, width proportional |
| 0.8-1.2 (square) | Left-right split | Left | Image takes content area height, width proportional |
| < 0.8 (portrait) | Left-right split | Left | Image height = content area height, width proportional |

> Boundary ratio (e.g., 1.5): decide by text volume — more text → left-right; less text → top-bottom.

---

## Dimension Calculation Formulas

### Canvas Parameters (All Formats)

| Format | Canvas | Margins (L/R, T/B) | Content Area (W x H) | Title Height | Content Start Y |
|--------|--------|--------------------|-----------------------|-------------|----------------|
| PPT 16:9 | 1280x720 | 60, 60 | 1160 x 600 | 60px | 80px |
| PPT 4:3 | 1024x768 | 50, 50 | 924 x 608 | 60px | 70px |
| Xiaohongshu | 1242x1660 | 60, 80 | 1122 x 1500 | 80px | 100px |
| WeChat Moments | 1080x1080 | 60, 60 | 960 x 960 | 60px | 80px |
| Story | 1080x1920 | 60, 120/180 | 960 x 1620 | 80px | 140px |
| WeChat Article | 900x383 | 40, 40 | 820 x 303 | 40px | 50px |

> Below, **W** = content area width, **H** = content area height (excludes title). PPT 16:9 example: W=1160, H=600.

### Top-Bottom Layout Calculation

```
Image width = W = 1160 px
Image height = W / R = 1160 / R px
Text area height = H - image height - gap(20px)

Validation: Text area height >= 150px (at least 3-4 lines of text)
If not satisfied → Switch to left-right layout
```

### Left-Right Layout Calculation

**Method 1 (height-first, suitable for portrait images)**:
```
Image height = H = 600 px
Image width = H x R = 600 x R px
Text area width = W - image width - gap(20px)
```

**Method 2 (width-constrained, for wide images converted to left-right)**:
```
Image width = W x 0.7 = 812 px
Image height = image width / R
Text area width = W - image width - gap(20px)
```

**Validation**: Text area width >= 280px; otherwise reduce image area width.

---

## Layout Examples

### Ultra-wide Image (ratio 2.45)

```
Original: 1960x800, R=2.45 → Top-bottom split
Image: 1160x473, Text area: 1160x147 → 7:3 top-bottom
```

### Standard Landscape (ratio 1.38)

```
Original: 1614x1171, R=1.38 → Left-right split
Image: 773x560 (left), Text area: 367x560 (right) → 7:3 left-right
```

### Wide Image Edge Case (ratio 1.75)

```
Original: 1820x1040, R=1.75
Try top-bottom: image height=663, text area=-43 ❌
Switch to left-right: image 780x446 (left), text area 360x600 (right) → 7:3 left-right
```

---

## Portrait Canvas Override

Default selection table assumes **landscape or square canvas**. For portrait canvases (height > width), left-right splits leave both columns too narrow — use the override below.

| Canvas Orientation | Image Ratio | Recommended Layout | Reason |
|-------------------|-------------|-------------------|--------|
| Portrait (Xiaohongshu, Story) | > 1.5 (wide) | Top-bottom | Same as landscape canvas |
| Portrait (Xiaohongshu, Story) | 1.2-1.5 (standard) | Top-bottom | Left-right too narrow on tall canvas |
| Portrait (Xiaohongshu, Story) | 0.8-1.2 (square) | Top-bottom | Image fits well in top half |
| Portrait (Xiaohongshu, Story) | 0.5-0.8 (portrait) | Left-right | Portrait image on tall canvas works |
| Portrait (Xiaohongshu, Story) | < 0.5 (extreme portrait) | Left-right | Image takes one side, text the other |

> Square canvases (WeChat Moments 1:1): use the standard landscape rules.

---

## Multi-Image Layout

For slides with multiple images, divide the content area evenly using the formulas below.

### Grid Formulas

```
columns = number of columns
rows = number of rows
gap = 20px (PPT formats) or 30px (social formats)

cell_width  = (W - (columns - 1) * gap) / columns
cell_height = (H - (rows - 1) * gap) / rows
```

### Common Patterns

| Image Count | Layout | Grid | Description |
|-------------|--------|------|-------------|
| 2 (both landscape) | Side-by-side | 2x1 | Two equal columns |
| 2 (both portrait) | Stacked | 1x2 | Two equal rows |
| 2 (mixed) | 1 large + 1 small | Custom | Landscape top (full-width), portrait right-bottom |
| 3 | 1 large + 2 small | 1+2 | Left large (50% width), right column with 2 stacked |
| 4 | Grid | 2x2 | Equal-sized cells |

### Example: 2x2 Grid on PPT 16:9

```
W=1160, H=600, gap=20
cell_width  = (1160 - 20) / 2 = 570
cell_height = (600 - 20) / 2 = 290

Image positions:
  (60, 80)   570x290    (650, 80)  570x290
  (60, 390)  570x290    (650, 390) 570x290
```

> Multi-image slides: use `preserveAspectRatio="xMidYMid meet"` on all images for consistent in-cell display.

---

## Prohibited Practices

| Prohibited | Correct Approach |
|-----------|-----------------|
| Fixed 50:50 or arbitrary ratios | Dynamic calculation based on image ratio |
| Forcing wide image into square container | Use top-bottom layout or increase image area width |
| Placing portrait image in narrow horizontal strip | Use left-right layout, image on left |
| Image whitespace exceeding 10% | Recalculate layout or choose alternative approach |
| Cropping key image content | Use `preserveAspectRatio="xMidYMid meet"` |
| Text area too small to read | Ensure text area >= 150px (top-bottom) or >= 280px (left-right) |

---

## Handoff Fields

This spec only defines layout calculation. Write computed fields into the Image Resource List defined in [`svg-image-embedding.md`](svg-image-embedding.md):

| Field | Meaning |
|-------|---------|
| `Ratio` | Original image width / height |
| `Layout plan` | Top-bottom / left-right / grid, including split ratio when relevant |
| `Image area` | Computed display rectangle size |
| `Text area` | Computed remaining text area size |

For SVG `<image>` syntax, path rules, `preserveAspectRatio`, external refs, and Base64 embedding: see [`svg-image-embedding.md`](svg-image-embedding.md).

### SVG Image Embedding Examples

Complete display (data charts, side-by-side — must not crop):

```xml
<image href="../images/xxx.png"
       x="60" y="80" width="780" height="446"
       preserveAspectRatio="xMidYMid meet"/>
```

Crop-to-fill (backgrounds and hero images only):

```xml
<image href="../images/bg.png"
       x="0" y="0" width="1280" height="720"
       preserveAspectRatio="xMidYMid slice"/>
```

---

## Automation Tool

```bash
python3 scripts/analyze_images.py <project_path>/images                    # Default: PPT 16:9
python3 scripts/analyze_images.py <project_path>/images --canvas ppt43     # PPT 4:3
python3 scripts/analyze_images.py <project_path>/images --canvas xiaohongshu  # Xiaohongshu
```

`--canvas` selects target format (default `ppt169`). The tool computes layout type (top-bottom / left-right), image display area, and text area per the formulas above. Output is a Markdown table — paste directly into the image resource list.

---

## Role Responsibilities

| Role | Responsibility |
|------|---------------|
| **Strategist** | Run analyze_images.py, calculate layout per this spec, populate image resource list |
| **Executor** | Strictly follow the layout plan and dimensions in the image resource list when generating SVGs |
