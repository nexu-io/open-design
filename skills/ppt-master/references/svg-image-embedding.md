> See shared-standards.md for common technical constraints.

# SVG Image Embedding Guide

Technical spec and workflow for adding images to SVG files.

---

## Image Resource List Format

Defined in the Design Specification & Content Outline; each image carries an `Acquire Via` field plus a status annotation. This file is authoritative for status names and SVG embedding behavior. If image approach includes "B) User-provided": run `analyze_images.py` right after the Eight Confirmations and complete the list before outputting the design spec.

```markdown
| Filename | Dimensions | Purpose | Type | Acquire Via | Status | Reference |
|----------|------------|---------|------|-------------|--------|-----------|
| cover_bg.png | 1280x720 | Cover background | Background | ai | Pending | Modern tech abstract, deep blue gradient |
| team.jpg | 800x600 | Team photo | Photography | web | Pending | Diverse engineering team in modern office |
| product.png | 600x400 | Page 3 product photo | Photography | user | Existing | - |
| chart.png | 600x400 | Page 5 placeholder | Illustration | placeholder | Placeholder | Team collaboration scene to be added later |
```

### Image Status Enum

| Status | Meaning | Executor Handling |
|--------|---------|-------------------|
| **Pending** | Acquisition needed (`Acquire Via: ai` or `web`); not yet attempted | Image Acquisition Phase (Step 5) consumes this; must not remain after Step 5 |
| **Generated** | AI-generated file exists at expected path | Reference from `../images/`; no on-slide credit needed |
| **Sourced** | Web-sourced file exists at expected path | Reference from `../images/`; check `image_sources.json` for `license_tier` — if `attribution-required`, render an inline credit element on the slide (see [executor-base.md §6](./executor-base.md) and [image-searcher.md §7](./image-searcher.md) for the visual spec) |
| **Needs-Manual** | Acquisition attempted once + one retry, failed | Dashed placeholder unless user has manually supplied the file |
| **Existing** | User already has image (`Acquire Via: user`) | Place in `images/`, reference with `<image>` |
| **Placeholder** | Intentionally not prepared yet (`Acquire Via: placeholder`) | Dashed border placeholder; replace later |

---

## Workflow

```
1. Strategist defines image needs → Add image resource list with Acquire Via + Status per row
2. Image Acquisition (Step 5):
   - Pending + ai  → Image_Generator runs image_gen.py     → Generated
   - Pending + web → Image_Searcher runs image_search.py   → Sourced
   - user / placeholder rows are skipped
3. Executor generates SVGs (svg_output/)
   ├── Existing / Generated → <image href="../images/xxx.png" .../>
   ├── Sourced + license_tier=no-attribution → <image href=...> only
   ├── Sourced + license_tier=attribution-required → <image href=...> + small <text> credit element on the slide
   └── Placeholder / Needs-Manual without file → Dashed border + description text
4. Preview: python3 -m http.server -d <project_path> 8000 → /svg_output/<filename>.svg
5. Post-processing & Export → follow shared-standards.md §5
```

> Keep external references in `svg_output/` during generation. `finalize_svg.py` auto-embeds images into `svg_final/`; export PPTX from `svg_final/`.

---

## External Reference vs Base64 Embedding

| Method | Pros | Cons | Suitable For |
|--------|------|------|-------------|
| **External reference** | Small file size, fast iteration, easy to replace | Preview requires HTTP server from project root | `svg_output/` development phase |
| **Base64 embedding** | Self-contained file, stable export | Large file size | `svg_final/` delivery phase |

---

## Method 1: External Reference (Recommended for Generation Phase)

### Syntax

```xml
<image href="../images/image.png" x="0" y="0" width="1280" height="720"
       preserveAspectRatio="xMidYMid slice"/>
```

### Key Attributes

| Attribute | Description | Example |
|-----------|-------------|---------|
| `href` | Image path (relative or absolute) | `"../images/cover.png"` |
| `x`, `y` | Image top-left corner position | `x="0" y="0"` |
| `width`, `height` | Image display dimensions | `width="1280" height="720"` |
| `preserveAspectRatio` | Scaling mode | `"xMidYMid slice"` |

### preserveAspectRatio Common Values

| Value | Effect |
|-------|--------|
| `xMidYMid slice` | Center crop (similar to CSS `cover`) |
| `xMidYMid meet` | Complete display (similar to CSS `contain`) |
| `none` | Stretch to fill, no aspect ratio preservation |

### Preview Method

Browser security blocks external images on directly opened SVGs. Serve via HTTP from the project root:

```bash
python3 -m http.server -d <project_path> 8000
# Visit http://localhost:8000/svg_output/your_file.svg
```

---

## Method 2: Base64 Embedding (Recommended for Delivery Phase)

### Syntax

```xml
<image href="data:image/png;base64,iVBORw0KGgo..." x="0" y="0" width="1280" height="720"/>
```

### MIME Types

| MIME Type | File Format |
|-----------|-------------|
| `image/png` | PNG |
| `image/jpeg` | JPG/JPEG |
| `image/gif` | GIF |
| `image/webp` | WebP |
| `image/svg+xml` | SVG |

---

## Conversion Process

Use the unified pipeline in [shared-standards.md §5](shared-standards.md). `finalize_svg.py` runs before export so image references in `svg_output/` become embedded assets in `svg_final/`.

```bash
python3 scripts/finalize_svg.py <project_path>
python3 scripts/svg_to_pptx.py <project_path>
```

### Standalone: embed_images.py (advanced)

For processing specific SVGs without the full pipeline:

```bash
python3 scripts/svg_finalize/embed_images.py <svg_file>                         # Single file
python3 scripts/svg_finalize/embed_images.py <project_path>/svg_output/*.svg    # Batch
python3 scripts/svg_finalize/embed_images.py --dry-run <project_path>/svg_output/*.svg  # Preview
```

---

## Best Practices

### Image Optimization

Compress before embedding to reduce file size:

```bash
convert input.png -quality 85 -resize 1920x1080\> output.png  # ImageMagick
pngquant --quality=65-80 input.png -o output.png               # pngquant (recommended)
```

### File Organization

```
project/
├── images/            # Image assets
├── sources/           # Source files and their accompanying images
│   └── article_files/
├── svg_output/        # Raw version (external references)
└── svg_final/         # Final version (images embedded)
```

### Rounded Corner / Non-rectangular Image Cropping

`clipPath` **on `<image>` elements** is conditionally allowed — authoritative constraints in [shared-standards.md §1.2](shared-standards.md); do not restate or relax here.

Fallback when `clipPath` doesn't fit: bake rounded corners into the source image (PNG with alpha) before embedding.

---

## FAQ

**Q: Can't see images when opening SVG directly?**
Browser security blocks cross-directory requests. Serve via HTTP from project root, or run `finalize_svg.py` first and view from `svg_final/`.

**Q: Base64 file too large?**
Compress the source, use JPEG, reduce resolution to match actual display dimensions.

**Q: How to reverse-extract a Base64 image?**
```bash
base64 -d image.b64 > image.png
```
