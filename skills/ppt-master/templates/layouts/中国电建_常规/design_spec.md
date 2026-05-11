# POWERCHINA (中国电建) Standard Template - Design Specification

> Suitable for PowerChina (China Power Construction Corporation) project reports, engineering showcases, business negotiations, corporate promotion, and similar scenarios.

---

## I. Template Overview

| Property       | Description                                                      |
| -------------- | ---------------------------------------------------------------- |
| **Template Name** | 中国电建_常规 (formerly powerchina)                           |
| **Use Cases**  | Engineering project reports, technical proposal presentations, business negotiations, corporate promotion, annual summaries |
| **Design Tone** | Professional, composed, international, state-owned enterprise style |
| **Theme Mode** | Light theme (white background + POWERCHINA blue accent)          |

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

### Primary Colors (POWERCHINA Brand Colors)

| Role           | Color Value | Notes                              |
| -------------- | ----------- | ---------------------------------- |
| **POWERCHINA Blue** | `#00418D` | Primary color for title bars, accent blocks, decorative bars |
| **Deep Blue**  | `#002B5C`  | Chapter page background, gradient dark end |
| **Vibrant Blue** | `#0066CC` | Secondary accent, chart colors     |
| **Sky Blue**   | `#4A90D9`  | Decorative accents, tertiary emphasis |
| **Background White** | `#FFFFFF` | Main page background              |
| **Auxiliary Light Gray** | `#F4F6F8` | Secondary content background blocks |

### Auxiliary Colors (China Red Accents)

| Role           | Color Value | Notes                              |
| -------------- | ----------- | ---------------------------------- |
| **China Red**  | `#C41E3A`  | Key data emphasis, decorative accents |
| **Gold**       | `#C9A227`  | Honors, achievements display       |

### Text Colors

| Role           | Color Value | Usage                  |
| -------------- | ----------- | ---------------------- |
| **Primary Text** | `#1A1A1A` | Body text, headings    |
| **White Text** | `#FFFFFF`  | Text on dark backgrounds |
| **Secondary Text** | `#4A5568` | Dimmed chapters, auxiliary descriptions |
| **Light Auxiliary** | `#718096` | Annotations, page numbers, hints |

---

## IV. Typography System

### Font Stack

**Font Stack**: `"Microsoft YaHei", "微软雅黑", "SimHei", Arial, sans-serif`

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
| **Top**    | y=0, h=6px      | POWERCHINA blue gradient bar spanning full width |
| **Title Bar** | y=30, h=50px | Chapter number block + Title text + Top-right Logo |
| **Content** | y=100, h=560px | Main content area                     |
| **Footer** | y=680, h=40px   | Page number, company name, bottom decorative line |

---

## VI. Page Types

### 1. Cover Page (01_cover.svg)

- Deep blue gradient background + engineering-style diagonal line texture
- Left-side brand blue decorative bar
- Main title + subtitle (white)
- Company English name POWERCHINA
- Bottom red decorative bar

### 2. Table of Contents (02_toc.svg)

- White background + left-side blue decorative area
- Supports up to 5 chapters
- Numbered items + vertical line separator design
- Right side can display corporate data

### 3. Chapter Page (02_chapter.svg)

- Deep blue gradient background
- Large chapter number
- Chapter title + English subtitle
- Geometric grid decoration

### 4. Content Page (03_content.svg)

- White background
- Standard navigation bar
- Flexible content area
- Supports multiple layout patterns

### 5. Ending Page (04_ending.svg)

- Deep blue gradient background
- Corporate Logo area
- Thank-you message (Chinese & English)
- Corporate information

---

## VII. Layout Patterns (Recommended)

### 1. Split Column
- Classic image-text mixed layout: left text / right image, or left image / right text.
- Recommended split ratio: 1:1 or 2:3.

### 2. Card Grid
- 3-column or 4-column card layout for showcasing project cases or qualifications.
- Card background recommended: auxiliary light gray `#F4F6F8`.

### 3. Process Flow
- Horizontal timeline or flowchart for displaying project progress.
- POWERCHINA blue as the main axis color, China Red for key milestone markers.

---

## VIII. Spacing Guidelines

| Property       | Value | Description              |
| -------------- | ----- | ------------------------ |
| **Base Unit**  | 8px   | All spacing should be multiples of 8px |
| **Module Gap** | 32px  | Standard gap between major modules |
| **Card Gap**   | 24px  | Gap between cards        |
| **Inner Padding** | 24px | Padding inside cards    |
| **Line Height** | 1.5  | Standard body line height |

---

## IX. SVG Technical Constraints

### Mandatory Rules

1. viewBox fixed at `0 0 1280 720`
2. Background must include a full-screen `<rect>`
3. Text wrapping via `<tspan>`
4. Opacity must use `fill-opacity` / `stroke-opacity`
5. `marker-start` / `marker-end` conditionally allowed — see shared-standards.md §1.1 (marker in `<defs>`, `orient="auto"`, shape = triangle/diamond/oval)

### Forbidden Elements (Blacklist)

- `mask` (masking); `clipPath` is allowed only on `<image>` under `shared-standards.md` §1.2
- `<style>`, `class` (stylesheets; `id` within `<defs>` is allowed)
- `foreignObject` (foreign objects)
- `textPath` (text on path)
- `animate`, `animateTransform`, `set` (animations)

- `rgba()` color format (must use hex + opacity)
- `<g opacity="...">` (group opacity — set individually on each element)

---

## X. Placeholder Specification

| Placeholder          | Description        |
| -------------------- | ------------------ |
| `{{TITLE}}`          | Main title         |
| `{{SUBTITLE}}`       | Subtitle           |
| `{{AUTHOR}}`         | Presenting organization |
| `{{PRESENTER}}`      | Presenter          |
| `{{CHAPTER_NUM}}`    | Chapter number     |
| `{{PAGE_NUM}}`       | Page number        |
| `{{DATE}}`           | Date               |
| `{{CHAPTER_TITLE}}`  | Chapter title      |
| `{{PAGE_TITLE}}`     | Page title         |
| `{{CONTENT_AREA}}`   | Content area identifier |
| `{{TOC_ITEM_N_TITLE}}` | TOC item title   |
| `{{TOC_ITEM_N_DESC}}`  | TOC item description |
| `{{THANK_YOU}}`      | Thank-you message  |
| `{{CONTACT_INFO}}`   | Contact information |

---

## XI. Usage Notes (Recommended)

1. **Logo Adaptation**: Cover and ending pages use inverted (white) Logo; content page upper-right uses color or inverted Logo.
2. **Image Assets**: Ensure the `images/` folder under the template directory contains necessary Logo files.
3. **Fonts**: Recommend installing "Microsoft YaHei" for optimal display.
