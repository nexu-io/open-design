# CATARC (中汽研) Business Template - Design Specification (v2.0 Enhanced)

> Suitable for CATARC product certification, evaluation & certification, technology showcases, business visits, and similar scenarios.
> **v2.0 Update**: Fully upgraded to a modern tech-business style with gradients, subtle glow effects, and geometric decorations.

---

## I. Template Overview

| Property       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| **Template Name** | 中汽研_商务 (formerly zhongqiyan_v2)                    |
| **Use Cases**  | Product certification display, evaluation presentations, technology promotion, high-end business reporting |
| **Design Tone** | **Modern tech, authoritative & professional, composed & grand** |
| **Theme Mode** | Deep blue tech gradient + clean white content pages         |

---

## II. Canvas Specification

| Property       | Value                         |
| -------------- | ----------------------------- |
| **Format**     | Standard 16:9                 |
| **Dimensions** | 1280 × 720 px                |
| **viewBox**    | `0 0 1280 720`               |
| **Page Margins** | Left/Right 60px, Top 90px, Bottom 50px |
| **Safe Area**  | x: 60-1220, y: 90-670        |

---

## III. Color Scheme

### Core Palette

| Role           | Color Value | Gradient (SVG defs)            | Notes                            |
| -------------- | ----------- | ------------------------------ | -------------------------------- |
| **Primary Deep Blue** | `#003366` | `#003366` -> `#001F4D`      | Brand primary tone               |
| **Tech Bright Blue**  | `#0050B3` | `#0050B3` -> `#007ACC`      | Highlight decoration, gradient bright end |
| **Auxiliary Cool Gray** | `#F0F2F5` | N/A                        | Background blocks, card base     |
| **Vibrant Red** | `#D32F2F` | N/A                            | Accent, emphasis, alerts         |
| **Pure White**  | `#FFFFFF`  | N/A                            | Text, inverted icons             |

### Text Colors

| Role           | Color Value | Usage                  |
| -------------- | ----------- | ---------------------- |
| **Headings/Body** | `#1F2937` | Dark gray for body text on white backgrounds |
| **Secondary Text** | `#6B7280` | Light gray for descriptions |
| **Inverted Text** | `#FFFFFF` | Text on dark backgrounds |
| **Watermark Text** | `#E5E7EB` | Very light gray for background text |

---

## IV. Typography System

### Font Stack

**Primary Font Stack**: `"Microsoft YaHei", "PingFang SC", "Heiti SC", "Segoe UI", Arial, sans-serif`

### Font Size Hierarchy (Optimized Contrast)

| Level | Usage              | Size | Weight  | Color      |
| ----- | ------------------ | ---- | ------- | ---------- |
| H1    | Cover main title   | 56px | Bold    | #FFFFFF    |
| H2    | Page heading       | 32px | Bold    | #003366    |
| H3    | Section title      | 24px | Bold    | #333333    |
| P     | Body content       | 18px | Regular | #4B5563    |
| Num   | Decorative numbers | 80px+| Bold    | Opacity 10%|

---

## V. Page Structure

### Common Navigation Bar (y=0 to 90)

- **Top Color Bar**: Gradient blue bar, 6px height.
- **Logo Area**: Fixed at upper-right corner.
- **Title Group**: Upper-left corner, includes chapter number (with colored block background) and page title.
- **Decorative Line**: Light gray thin line below the title for visual breathing room.

---

## VI. Page Types

### 1. Cover Page (01_cover.svg)
- **Visual Focus**: Large whitespace or image on the left, dark tech-styled cutout on the right/bottom.
- **Decoration**: Dynamic geometric lines (Tech Lines), simulating light beam effects.
- **Content Layout**: Title left-aligned or centered floating card style for enhanced hierarchy.

### 2. Table of Contents (02_toc.svg)
- **Layout**: Card-style list. Each chapter as a horizontal card with simulated subtle shadow.
- **Numbers**: Extra-large semi-transparent numbers in the background (01, 02...) for added design appeal.

### 3. Chapter Page (02_chapter.svg)
- **Background**: Full-screen deep blue radial gradient for an immersive feel.
- **Elements**: Center-focused typography with radiating lines or ring decorations.

### 4. Content Page (03_content.svg)
- **Layout**: Clean white background, maximizing content display area.
- **Auxiliary**: Very faint Logo watermark in the lower-right corner.

### 5. Ending Page (04_ending.svg)
- **Background**: Echoes the cover's dark tone.
- **Elements**: Centered thank-you message with refined contact information layout.

---

## VII. Layout Patterns (Recommended)

### 1. Card List
- Wide cards arranged vertically, suitable for table of contents or key points.
- Use shadow simulation (e.g., semi-transparent black rectangles) for a floating effect.

### 2. Contrast Layout
- Left-right split: left dark / right light, or left image / right text, emphasizing contrast.

### 3. Radial Layout
- Core concept centered with surrounding explanations, suitable for chapter or summary pages.

---

## VIII. Spacing Guidelines

| Property       | Value | Description              |
| -------------- | ----- | ------------------------ |
| **Base Unit**  | 8px   | 8px grid system          |
| **Module Gap** | 32px  | Comfortable reading gap  |
| **Card Gap**   | 16px  | Compact with cohesion    |

---

## IX. SVG Technical Constraints

### Mandatory Rules

1. **Gradient Support**: Use `<linearGradient>` and `<radialGradient>` defined within `<defs>`.
2. **Shadow Handling**: Use restrained shadows only when an element genuinely floats above another layer. Prefer filter soft shadows from `shared-standards.md` §6; use stacked semi-transparent rectangles only when maximum compatibility is required.
3. **Opacity**: Strictly use `fill-opacity` / `stroke-opacity`.
4. **Clipping/Masking**: `mask` is forbidden; `clipPath` is allowed only on `<image>` under `shared-standards.md` §1.2.

---

## X. Placeholder Specification

| Placeholder        | Description           |
| ------------------ | --------------------- |
| `{{TITLE}}`        | Presentation main title |
| `{{SUBTITLE}}`     | Subtitle              |
| `{{AUTHOR}}`       | Presenter / Department |
| `{{DATE}}`         | Date                  |
| `{{PAGE_TITLE}}`   | Content page title    |
| `{{CHAPTER_NUM}}`  | Chapter number (01, 02) |
| `{{TOC_ITEM_N_TITLE}}` | TOC item title    |
| `{{TOC_ITEM_N_DESC}}`  | TOC item description |
| `{{THANK_YOU}}`    | Thank-you message     |
| `{{CONTACT_INFO}}` | Contact information   |
| `{{LOGO_LARGE}}`   | Cover/back page large Logo |
| `{{LOGO_HEADER}}`  | Navigation bar small Logo |

---

## XI. Usage Notes (Recommended)

1. **Shadow Handling**: Keep shadows subtle and sparse. Use shared-standards §6 as the authority; vector-rectangle shadows are the compatibility fallback.
2. **Gradients**: To modify gradient colors, adjust `stop-color` values in the `<defs>` section.
3. **Logo**: Recommend using transparent PNG. Use inverted (white) Logo for dark background pages.
