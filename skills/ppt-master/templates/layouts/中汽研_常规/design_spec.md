# CATARC (中汽研) Standard Template - Design Specification

> Suitable for CATARC product certification, evaluation & certification, technology showcases, business visits, and similar scenarios.

---

## I. Template Overview

| Property       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| **Template Name** | 中汽研_常规 (formerly zhongqiyan)                       |
| **Use Cases**  | Product certification display, evaluation presentations, technology promotion, business visits |
| **Design Tone** | Professional, authoritative, trustworthy, consulting style |
| **Theme Mode** | Light theme (white background + deep blue accent)          |

---

## II. Canvas Specification

| Property       | Value                         |
| -------------- | ----------------------------- |
| **Format**     | Standard 16:9                 |
| **Dimensions** | 1280 × 720 px                |
| **viewBox**    | `0 0 1280 720`               |
| **Page Margins** | Left/Right 60px, Top 80px, Bottom 40px |
| **Safe Area**  | x: 60-1220, y: 80-680        |

---

## III. Color Scheme

### Primary Colors

| Role           | Color Value | Notes                            |
| -------------- | ----------- | -------------------------------- |
| **Primary Deep Blue** | `#004098` | Title bar, navigation bar, chapter number blocks, decorative bars |
| **Background White** | `#FFFFFF` | Main page background            |
| **Auxiliary Light Gray** | `#F5F5F5` | Secondary content background blocks |
| **Border Gray** | `#E0E0E0` | Dividers, borders               |
| **Accent Red** | `#CC0000`  | Key information highlight        |

### Text Colors

| Role           | Color Value | Usage                  |
| -------------- | ----------- | ---------------------- |
| **Primary Text** | `#333333` | Body text, headings    |
| **White Text** | `#FFFFFF`  | Text on dark backgrounds |
| **Secondary Text** | `#666666` | Dimmed chapters, auxiliary descriptions |
| **Light Auxiliary** | `#999999` | Annotations, page numbers, hints |

### Functional Colors

| Usage      | Color Value | Description    |
| ---------- | ----------- | -------------- |
| **Success** | `#4CAF50` | Pass / Certified |
| **Warning** | `#CC0000` | Failed / Attention |

---

## IV. Typography System

### Font Stack

**Font Stack**: `"Microsoft YaHei", "微软雅黑", "SimHei", Arial, Calibri, sans-serif`

### Font Size Hierarchy

| Level | Usage              | Size | Weight  |
| ----- | ------------------ | ---- | ------- |
| H1    | Cover main title   | 48px | Bold    |
| H2    | Page heading       | 28px | Bold    |
| H3    | Section title / Subtitle | 24px | Bold |
| P     | Body content       | 18px | Regular |
| High  | Emphasized data    | 36px | Bold    |
| Sub   | Auxiliary notes    | 14px | Regular |

---

## V. Page Structure

### Common Layout

| Area       | Position/Height | Description                            |
| ---------- | --------------- | -------------------------------------- |
| **Top**    | y=0, h=4px      | Deep blue bar spanning full width      |
| **Title Bar** | y=30, h=50px | Chapter number block + Title text + Top-right Logo |
| **Content** | y=100, h=560px | Main content area                     |
| **Footer** | y=680, h=40px   | Page number (right-aligned), bottom decorative line |

### Navigation Design

- **Top Decorative Line**: Deep blue (`#004098`), height 4px, spanning full width
- **Bottom Decorative Line**: Deep blue (`#004098`), height 4px, y=716
- **Title Bar** (y=30):
  - Chapter number block: Deep blue square (50×50px), white number/text centered
  - Title text: 20px from number block, 28px font size, `#333333`
  - Top-right Logo: Fixed at x=1107, size 113×50px

---

## VI. Page Types

### 1. Cover Page (01_cover.svg)

- Supports background image (AI-generated / user-provided)
- Semi-transparent overlay for text readability
- Large centered Logo
- Main title + subtitle
- Organization name (Chinese & English)

### 2. Table of Contents (02_toc.svg)

- Double vertical line `||` separator design
- Supports up to 5 chapters
- Left decorative vertical line
- Optional statistics display area on the right

### 3. Chapter Page (02_chapter.svg)

- Deep blue gradient background
- Large chapter number
- Chapter title + English subtitle

### 4. Content Page (03_content.svg)

- White background
- Standard navigation bar
- Flexible content area
- Supports multiple layout patterns

### 5. Ending Page (04_ending.svg)

- Deep blue solid background
- Centered Logo
- Thank-you message
- Organization information

---

## VII. Layout Patterns (Recommended)

| Pattern              | Use Cases                      |
| -------------------- | ------------------------------ |
| **Single Column Center** | Cover, conclusion, key points |
| **Left-Right Split (5:5)** | Comparison display          |
| **Left-Right Split (4:6)** | Image-text mixed layout     |
| **Top-Bottom Split** | Process description, standards list |
| **Three-Column Cards** | Project listings             |
| **Matrix Grid**      | Category display               |
| **Table**            | Data comparison, specification lists |

---

## VIII. Spacing Guidelines

| Element        | Value  |
| -------------- | ------ |
| Card gap       | 24px   |
| Content block gap | 32px |
| Card padding   | 24px   |
| Card border radius | 8px |
| Icon-to-text gap | 12px |

---

## IX. SVG Technical Constraints

### Mandatory Rules

1. viewBox: `0 0 1280 720`
2. Use `<rect>` elements for backgrounds
3. Text wrapping via `<tspan>` (no `<foreignObject>`)
4. Opacity via `fill-opacity` / `stroke-opacity`, no `rgba()`
5. Forbidden: `mask`, `<style>`, `class`, `foreignObject`. `clipPath` is allowed only on `<image>` under `shared-standards.md` §1.2
6. Forbidden: `textPath`, `animate*`, `script`
7. `marker-start` / `marker-end` conditionally allowed (marker in `<defs>`, `orient="auto"`, shape = triangle/diamond/oval) — see shared-standards.md §1.1

### PPT Compatibility Rules

- No `<g opacity="...">` (group opacity) — set opacity on each child element individually
- Use overlay layers for image transparency
- Inline styles only — no external CSS or `@font-face`

---

## X. Placeholder Specification

Templates use `{{PLACEHOLDER}}` format. Common placeholders:

| Placeholder          | Description        |
| -------------------- | ------------------ |
| `{{TITLE}}`          | Main title         |
| `{{SUBTITLE}}`       | Subtitle           |
| `{{AUTHOR}}`         | Author / Organization (Chinese) |
| `{{AUTHOR_EN}}`      | Author / Organization (English) |
| `{{PAGE_TITLE}}`     | Page title         |
| `{{CHAPTER_NUM}}`    | Chapter number     |
| `{{PAGE_NUM}}`       | Page number        |
| `{{TOC_ITEM_N_TITLE}}` | TOC item title   |
| `{{TOC_ITEM_N_DESC}}`  | TOC item description |
| `{{THANK_YOU}}`      | Thank-you message  |
| `{{CONTACT_INFO}}`   | Primary contact info |
| `{{LOGO_LARGE}}`     | Large Logo filename |
| `{{LOGO_HEADER}}`    | Header Logo filename |
| `{{COVER_BG_IMAGE}}` | Cover background image filename |

---

## XI. Usage Notes (Recommended)

1. **Template Deployment**: Copy the template to your project directory.
2. **Asset Replacement**: Replace `大型 logo.png` (592×238) and `右上角 logo.png` (113×50) in the `images` directory.
3. **Content Generation**: Select appropriate page templates based on content needs, and replace content using `{{}}` placeholders.
4. **SVG Generation**: Generate final SVG files via automation scripts.
