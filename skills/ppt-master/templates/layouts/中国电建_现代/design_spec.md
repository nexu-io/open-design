# POWERCHINA (中国电建) Modern Template v2 - Design Specification

> Suitable for POWERCHINA major project reports, international business showcases, high-end summit roadshows, technology innovation releases, and similar scenarios.
> **v2.0 Features**: Blends modern engineering aesthetics with an international perspective, emphasizing structural form, transparency, and digital expression.

---

## I. Template Overview

| Property       | Description                                                      |
| -------------- | ---------------------------------------------------------------- |
| **Template Name** | 中国电建_现代 (formerly powerchina_v2)                        |
| **Use Cases**  | Major engineering reports, international market promotion, technology achievement showcases, high-end business negotiations |
| **Design Tone** | **Grand narrative, modern precision, digital tech, international vision** |
| **Theme Mode** | Deep blue tech gradient + precision grid texture                 |

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

### Primary Colors (Upgraded)

| Role           | Color Value | Gradient (SVG defs)            | Notes                              |
| -------------- | ----------- | ------------------------------ | ---------------------------------- |
| **POWERCHINA Blue** | `#00418D` | `#00418D` -> `#072C61`       | Brand core color for main backgrounds, title bars |
| **Tech Blue**  | `#0066CC`  | `#0066CC` -> `#0088FF`         | Highlight color for charts, accent borders |
| **Deep Sea Blue** | `#001F45` | N/A                           | Page base color for a deep, immersive feel |
| **Engineering White** | `#FFFFFF` | N/A                        | Title text, inverted icons         |

### Auxiliary Colors (National Strength)

| Role           | Color Value | Usage                              |
| -------------- | ----------- | ---------------------------------- |
| **China Red**  | `#C41E3A`  | Key data emphasis, progress bar indicators |
| **Architectural Gray** | `#E2E8F0` | Grid lines, secondary text      |
| **Glorious Gold** | `#FFD700` | Honors, milestone highlights (Opacity 20%) |

---

## IV. Typography System

### Font Stack

**Primary Font Stack**: `"Microsoft YaHei", Arial, sans-serif`

### Font Size Hierarchy (Enhanced Contrast)

| Level | Usage              | Size  | Weight  | Color      |
| ----- | ------------------ | ----- | ------- | ---------- |
| H1    | Cover main title   | 60px  | Bold    | #FFFFFF    |
| H2    | Page heading       | 36px  | Bold    | #00418D    |
| H3    | Section title      | 24px  | Bold    | #1A202C    |
| P     | Body content       | 18px  | Regular | #4A5568    |
| Num   | Giant decorative numbers | 120px | Bold | Opacity 5% |

---

## V. Page Structure

### Common Navigation Bar (y=0 to 100)

- **Top Blue Bar**: 8px height, deep blue gradient.
- **Logo Area**: Fixed at upper-right corner with a white backing plate.
- **Title Group**: Upper-left corner using **"Tag Style"** design, simulating engineering drawing labels.

---

## VI. Page Types

### 1. Cover Page (01_cover.svg)
- **Visual Focus**: **"Foundation"** concept. Heavy deep blue supporting the bottom, transparent top.
- **Background**: Overlaid with precision **"Geo Grid"** (latitude-longitude grid), symbolizing global presence.
- **Layout**: Center-symmetric layout, projecting state-owned enterprise gravitas.

### 2. Table of Contents (02_toc.svg)
- **Layout**: **"Milestones"** style. Horizontal timeline or connected cards, representing project progression.
- **Elements**: Connection lines and node dots, simulating circuits or pipeline networks.

### 3. Chapter Page (02_chapter.svg)
- **Background**: Deep blue tech gradient; large whitespace on the right for perspective grid.
- **Numbers**: Giant outlined numbers (Stroke Only) — not just chapter numbers, but part of the architectural structure.

### 4. Content Page (03_content.svg)
- **Layout**: **"Console"** style. Orderly top navigation bar, maximized content area.
- **Details**: **"Corner Marks"** added at all four corners for a precision engineering feel.

### 5. Ending Page (04_ending.svg)
- **Background**: Echoes the cover's "Foundation" structure.
- **Elements**: Reinforces "win-win cooperation" concept with QR code / contact information displayed in zones.

---

## VII. Layout Patterns (Recommended)

### 1. Tech Cards
- Cards with subtle borders and a glowing effect.
- Ideal for showcasing key technical indicators or innovation achievements.

### 2. Dashboard
- Combined layout of charts and key data.
- Uses Tech Blue as the primary chart color.

### 3. Blueprint
- Leverages the Geo Grid background to explain complex structures through lines and annotations.

---

## VIII. Spacing Guidelines

| Property       | Value | Description              |
| -------------- | ----- | ------------------------ |
| **Base Unit**  | 4px   | Precision design uses a 4px grid |
| **Module Gap** | 40px  | Generous spacing for breathing room |
| **Card Gap**   | 20px  | Compact yet clear spacing |
| **Inner Padding** | 32px | Distance between content and border |

---

## IX. SVG Technical Constraints

### Mandatory Rules

1. **Gradients**: Use `<linearGradient>` to create metallic or light/shadow effects.
2. **Grid**: Use `<pattern>` to define precision grid backgrounds with opacity controlled at 0.05-0.1.
3. **Opacity**: Strictly use `fill-opacity` / `stroke-opacity`.
4. **Clipping/Masking**: `mask` is forbidden; `clipPath` is allowed only on `<image>` under `shared-standards.md` §1.2.

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
| `{{CONTENT_AREA}}` | Content area identifier |
| `{{TOC_ITEM_N_TITLE}}` | TOC item title    |
| `{{TOC_ITEM_N_DESC}}`  | TOC item description |
| `{{THANK_YOU}}`    | Thank-you message     |
| `{{CONTACT_INFO}}` | Contact information   |

---

## XI. Usage Notes (Recommended)

1. **Logo**: Recommend using white PNG Logo to suit dark backgrounds.
2. **Background Images**: Cover background grid is embedded in SVG; no external images needed.
3. **Fonts**: Prefer PowerPoint-safe sans-serif fonts; use Arial for English text unless a custom font is explicitly installed or embedded.
