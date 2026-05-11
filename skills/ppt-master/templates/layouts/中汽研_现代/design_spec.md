# CATARC (中汽研) Modern Template - Design Specification (v3.0 Future Tech)

> Suitable for CATARC high-end launches, forward-looking technology presentations, international exchanges, and similar scenarios.
> **v3.0 Update**: Introduces a "Future Tech" design language with deep blue + neon cyan palette, emphasizing spatial depth and flowing light effects.

---

## I. Template Overview

| Property       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| **Template Name** | 中汽研_现代 (CATARC_Modern_Tech)                       |
| **Use Cases**  | Forward-looking technology showcases, strategic releases, high-end business reporting |
| **Design Tone** | **Futuristic, tech-forward, deep & refined**              |
| **Theme Mode** | Immersive dark cover/transition pages + clean light-gray content pages |

---

## II. Canvas Specification

| Property       | Value                         |
| -------------- | ----------------------------- |
| **Format**     | Standard 16:9                 |
| **Dimensions** | 1280 × 720 px                |
| **viewBox**    | `0 0 1280 720`               |
| **Page Margins** | Left/Right 80px, Top 100px, Bottom 60px |
| **Safe Area**  | x: 80-1200, y: 100-660       |

---

## III. Color Scheme

### Core Palette (Future Tech Palette)

| Role           | Color Value | Gradient (SVG defs)            | Notes                            |
| -------------- | ----------- | ------------------------------ | -------------------------------- |
| **Deep Night Sky** | `#001529` | `#001529` -> `#002B52`        | Cover/transition page main background |
| **Tech Blue**  | `#1890FF`  | `#1890FF` -> `#096DD9`         | Primary visual accent            |
| **Neon Cyan**  | `#00E5FF`  | `#00E5FF` -> `#00B5D8`         | Ultra-bright accent for highlights/data |
| **Polar Gray** | `#F7F9FC`  | N/A                            | Content page background (not pure white, easier on eyes) |
| **Dark Night** | `#1F2937`  | N/A                            | Body text                        |

### Text Colors

| Role           | Color Value | Usage                  |
| -------------- | ----------- | ---------------------- |
| **Heading (Dark BG)** | `#FFFFFF` | Main title on dark backgrounds |
| **Heading (Light BG)** | `#001529` | Main title on light backgrounds |
| **Body Text**  | `#374151`  | Content page body text  |
| **Secondary Text** | `#6B7280` | Auxiliary descriptions  |
| **Decorative Text** | `#E5E7EB` | Very light watermark text |

---

## IV. Typography System

### Font Stack

**Primary Font Stack**: `Arial, "Microsoft YaHei", sans-serif`
*Use Arial for English and numbers by default. Roboto or DIN may be used only when the font is explicitly installed or embedded for the target environment.*

### Font Size Hierarchy

| Level | Usage              | Size  | Weight  | Color      |
| ----- | ------------------ | ----- | ------- | ---------- |
| H1    | Cover main title   | 64px  | Bold    | #FFFFFF    |
| H2    | Page heading       | 36px  | Bold    | #001529    |
| H3    | Section title      | 24px  | Bold    | #1890FF    |
| P     | Body content       | 18px  | Regular | #374151    |
| Deco  | Decorative large numbers | 120px | Bold | Opacity 5% |

---

## V. Page Structure (Asymmetric Tech Layout)

### Common Navigation Bar (y=0 to 100)

- **Asymmetric Design**: Title left-aligned with a geometric decorative bar on the left.
- **Logo**: Floating in the upper-right corner with a subtle glow effect.
- **Decoration**: Top area retains only a splash of bright color line on the right side, breaking visual balance.

---

## VI. Page Types

### 1. Cover Page (01_cover.svg)
- **Visual Focus**: **Deep spatial depth**. Background uses a deep blue radial gradient.
- **Hero Element**: Right side features abstract **"Luminous Flow"** or **"Digital Matrix"** graphics.
- **Title**: Bottom-left aligned, emphasizing bold typography with a neon-colored underline.

### 2. Table of Contents (02_toc.svg)
- **Layout**: **Split Screen (left dark, right light)**.
- **Left Side**: Dark area containing "CONTENTS" and Logo.
- **Right Side**: Light area with TOC items. Replaces cards with **"Timeline"** or **"Floating List"** style.
- **Numbers**: Highlighted in neon cyan (`#00E5FF`).

### 3. Chapter Page (02_chapter.svg)
- **Background**: Dark background.
- **Special Effect**: Large outlined numbers in the background (Stroke Text).
- **Dynamism**: Added tilted decorative lines to simulate a sense of speed.

### 4. Content Page (03_content.svg)
- **Background**: Very light gray `#F7F9FC`.
- **Header**: Floating title bar for enhanced hierarchy.
- **Watermark**: Tech-styled geometric watermark in the lower-right corner.

### 5. Ending Page (04_ending.svg)
- **Background**: Echoes the cover.
- **Center**: Minimalist "Thank You" with surrounding halo ring decoration.

---

## VII. Layout Patterns (Recommended)

### 1. Floating Timeline
- Uses right-side space for time or process display.
- Nodes feature a neon glowing effect.

### 2. HUD Display
- Simulates a heads-up display style using thin wireframes and highlighted numbers for key KPIs.

### 3. Asymmetric Contrast
- Leverages the page's asymmetric structure to create dynamic image-text layouts.

---

## VIII. Spacing Guidelines

| Property       | Value | Description              |
| -------------- | ----- | ------------------------ |
| **Base Unit**  | 8px   | Tech designs typically use an 8px grid |
| **Module Gap** | 48px  | Extra spacious for a modern feel |
| **Line Height** | 1.6  | Increased line height for readability |

---

## IX. SVG Technical Constraints

### Mandatory Rules

1. **Blend Modes**: Avoid `mix-blend-mode` wherever possible; use `opacity` as a substitute.
2. **Gradients**: Leverage angled `linearGradient` (e.g., `x1="0%" y1="0%" x2="100%" y2="50%"`) to create light and shadow effects.
3. **Strokes**: Use thin `stroke-width="1"` with low transparency `stroke-opacity="0.2"` to simulate glass edges.

---

## X. Placeholder Specification

| Placeholder        | Description           |
| ------------------ | --------------------- |
| `{{TITLE}}`        | Presentation main title |
| `{{SUBTITLE}}`     | Subtitle              |
| `{{AUTHOR}}`       | Presenting organization |
| `{{PRESENTER}}`    | Presenter             |
| `{{DATE}}`         | Date                  |
| `{{CHAPTER_NUM}}`  | Chapter number (01, 02) |
| `{{PAGE_TITLE}}`   | Content page title    |
| `{{STAT_1}}`       | Statistical data 1    |
| `{{TOC_ITEM_N_TITLE}}` | TOC item title    |
| `{{TOC_ITEM_N_DESC}}`  | TOC item description |
| `{{THANK_YOU}}`    | Thank-you message     |
| `{{CONTACT_INFO}}` | Contact information   |

---

## XI. Usage Notes (Recommended)

1. **Light & Shadow Effects**: All light and shadow effects are achieved via SVG gradients, with no dependency on external images.
2. **Fonts**: Use Arial for numbers by default. Roboto or DIN may be used only with an explicit font-install or font-embedding requirement.
3. **Backgrounds**: Dark backgrounds look excellent on projectors, but ensure the ambient lighting is as dim as possible.
