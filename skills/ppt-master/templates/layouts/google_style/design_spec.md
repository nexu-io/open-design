# Google Style Template - Design Specification

> Suitable for tech company annual reports, work summaries, technical sharing, data presentations, and similar scenarios.

---

## I. Template Overview

| Property       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| **Template Name** | google_style (Google Style Template)                    |
| **Use Cases**  | Annual work reports, technical sharing, project showcases, data-driven presentations |
| **Design Tone** | Professional, modern, clean and restrained, data-driven, generous whitespace |
| **Theme Mode** | Light theme (white/light gray background + Google brand color accents) |

---

## II. Canvas Specification

| Property       | Value                         |
| -------------- | ----------------------------- |
| **Format**     | Standard 16:9                 |
| **Dimensions** | 1280 × 720 px                |
| **viewBox**    | `0 0 1280 720`                |
| **Page Margins** | Left/Right 60px, Top 50px, Bottom 50px |
| **Safe Area**  | x: 60-1220, y: 50-670        |

---

## III. Color Scheme

### Google Brand Colors

| Role             | Value       | Notes                                |
| ---------------- | ----------- | ------------------------------------ |
| **Google Blue**  | `#4285F4`   | Primary titles, key data, main buttons |
| **Google Red**   | `#EA4335`   | Important emphasis, warning info     |
| **Google Yellow**| `#FBBC04`   | Auxiliary icons, secondary emphasis   |
| **Google Green** | `#34A853`   | Success indicators, positive data    |

### Professional Colors

| Role           | Value       | Usage                                |
| -------------- | ----------- | ------------------------------------ |
| **Deep Blue**  | `#1A237E`   | Titles, core text, dark emphasis     |
| **Deep Blue Gradient Start** | `#1A73E8` | Gradient title start point  |
| **Deep Blue Gradient End** | `#0D47A1` | Gradient title end point      |
| **Main Background White** | `#FFFFFF` | Page main background           |
| **Light Gray Background** | `#F8F9FA` | Card inner background, auxiliary areas |
| **Light Gray Border** | `#E8EAED` | Dividers, borders, grid lines     |

### Text Colors

| Role           | Value       | Usage                                |
| -------------- | ----------- | ------------------------------------ |
| **Primary Text** | `#1A237E` | Titles, important text               |
| **Body Text**  | `#5F6368`   | Body content, descriptions           |
| **Secondary Text** | `#9AA0A6` | Annotations, page numbers, tips    |
| **White Text** | `#FFFFFF`   | Text on dark backgrounds             |

### Chart Colors (use in order)

| Order | Value       | Notes          |
| ----- | ----------- | -------------- |
| 1     | `#4285F4`   | Google Blue    |
| 2     | `#34A853`   | Google Green   |
| 3     | `#FBBC04`   | Google Yellow  |
| 4     | `#EA4335`   | Google Red     |

---

## IV. Typography System

### Font Stack

**Font Stack**: `Arial, "Microsoft YaHei", sans-serif`

> Uses PowerPoint-safe cross-platform fonts by default. Roboto may be used only when the target environment explicitly installs or embeds it.

### Font Size Hierarchy

| Level  | Usage                | Size   | Weight      |
| ------ | -------------------- | ------ | ----------- |
| H1     | Cover main title     | 52px   | 700 (Bold)  |
| H2     | Page main title      | 46px   | 700 (Bold)  |
| H3     | Module/section title | 28px   | 600         |
| H4     | Card title/subtitle  | 24px   | 600         |
| P      | Body content         | 20px   | 400         |
| Data   | Large data numbers   | 56px   | 700 (Bold)  |
| Label  | Data labels/descriptions | 16px | 500        |
| Sub    | Auxiliary text/page number | 14px | 400       |

---

## V. Page Structure

### General Layout

| Area               | Position/Height | Description                            |
| ------------------ | --------------- | -------------------------------------- |
| **Top Decorative Bar** | y=0, h=6px  | Four-color gradient bar, spanning full width |
| **Title Area**     | y=50, h=60px    | Page title + title underline           |
| **Content Area**   | y=130, h=500px  | Main content area                      |
| **Footer**         | y=660, h=60px   | Four-color dot decoration + optional page number |

### Signature Design Elements

#### 1. Four-Color Gradient Top Bar
```
linearGradient: #4285F4 → #EA4335 → #FBBC04 → #34A853
height: 6px, width: 100%
```

#### 2. Title Underline (Four-Color Segments)
```
Blue: 150px → Red: 70px → Yellow: 70px → Green: 170px
stroke-width: 4px, y: 20px below title
```

#### 3. KPI Data Card
```
Size: 280×140px
Border radius: 16px
Border: 3px, using corresponding brand color
Shadow: Subtle shadow for depth
```

#### 4. Four-Color Dot Decoration
```
Used in footer or as dividers
radius: 6-14px (varies)
spacing: 30-50px
```

#### 5. Left Four-Color Vertical Bar
```
Cover page exclusive
width: 10px, 4 segments, 180px each
Color order: Blue → Red → Yellow → Green
```

---

## VI. Page Types

### 1. Cover Page (01_cover.svg)

- Light gradient background (white to light blue/light green)
- Left four-color vertical bar decoration
- Centered rounded white content card (with subtle shadow)
- Gradient main title + subtitle
- Four-color segmented divider line
- Speaker info (name, title, date)
- Bottom four-color dot decoration

### 2. Table of Contents Page (02_toc.svg)

- White background + top four-color gradient bar
- Page title + blue underline
- Chapter list (left brand-color dots + numbers + titles)
- Optional: right-side decorative graphics or data stats

### 3. Chapter Page (02_chapter.svg)

- Dark gradient background (deep blue to darker blue)
- Large chapter number (gradient or white)
- Chapter title (white, large font)
- English subtitle (white, semi-transparent)
- Four-color decorative elements

### 4. Content Page (03_content.svg)

- White background
- Top four-color gradient bar
- Page title + blue underline
- Flexible content area (supports multiple layouts)
- Bottom four-color dot decoration

### 5. Ending Page (04_ending.svg)

- Light gradient background
- Centered rounded white content card
- Gradient "Thank You!" title
- Four-color divider line
- Acknowledgment list (brand-color dots + names/items)
- Closing remarks + bottom four-color dots

---

## VII. Layout Patterns

| Pattern                | Use Cases                          |
| ---------------------- | ---------------------------------- |
| **Centered Card**      | Cover, ending, key points          |
| **Left Text Right Image** | Text description + chart/KPI area |
| **KPI Grid (2×2/2×3)** | Data overview, key metrics display |
| **Three-Column Cards** | Project lists, feature introductions |
| **Four Quadrants**     | Category display, SWOT analysis    |
| **Top-Bottom Split**   | Two related topics side by side    |
| **Timeline**           | Development history, roadmap       |
| **Dashboard Style**    | Multi-metric data dashboard        |

---

## VIII. Spacing Guidelines

| Element              | Value    |
| -------------------- | -------- |
| Page margins         | 60px     |
| Title-to-content gap | 30-40px  |
| Module gap           | 60-80px  |
| Card gap             | 20-24px  |
| Card padding         | 20px     |
| Card border radius   | 16px     |
| Icon-to-text gap     | 15px     |

---

## IX. SVG Technical Constraints

### Mandatory Rules

1. viewBox: `0 0 1280 720`
2. Use `<rect>` elements for backgrounds
3. Use `<tspan>` for text wrapping (no `<foreignObject>`)
4. Use `fill-opacity` / `stroke-opacity` for transparency
5. Define gradients using `<linearGradient>` within `<defs>`

### Prohibited Elements

The following SVG features are prohibited (not PPT-compatible):

- `mask`; `clipPath` is allowed only on `<image>` under `shared-standards.md` §1.2
- `<style>` tag, `class` attribute
- `foreignObject`
- `textPath`
- `animate*` animation elements
- `script`
- `rgba()` color format (use HEX + opacity instead)

> `marker-start` / `marker-end` are conditionally allowed — see `shared-standards.md` §1.1 (marker must be in `<defs>`, `orient="auto"`, shape = triangle / diamond / oval). The converter maps them to native DrawingML arrow heads.

### Shadow Implementation

Since `filter` may affect PPT compatibility:
- Use subtle border color variations to simulate shadows
- Or accept that `filter` may be ignored in older PPT versions, though it works well in newer versions

---

## X. Placeholder Specification

Templates use `{{PLACEHOLDER}}` format placeholders:

| Placeholder            | Description              |
| ---------------------- | ------------------------ |
| `{{TITLE}}`            | Main title               |
| `{{SUBTITLE}}`         | Subtitle/department info |
| `{{SPEAKER_NAME}}`     | Speaker name             |
| `{{SPEAKER_TITLE}}`    | Speaker title/position   |
| `{{DATE}}`             | Date                     |
| `{{PAGE_TITLE}}`       | Page title               |
| `{{CHAPTER_NUM}}`      | Chapter number           |
| `{{CHAPTER_TITLE}}`    | Chapter title            |
| `{{CHAPTER_TITLE_EN}}` | Chapter English subtitle |
| `{{PAGE_NUM}}`         | Page number              |
| `{{CONTENT_AREA}}`     | Content area placeholder |
| `{{TOC_ITEM_N_TITLE}}` | TOC item title           |
| `{{THANK_YOU}}`        | Thank-you message        |
| `{{CONTACT_INFO}}`     | Primary contact info     |
| `{{ENDING_SUBTITLE}}`  | Ending subtitle          |

---

## XI. Color Application Examples

### KPI Card Color Rules

| Card Order | Border Color | Number Color | Applicable Content |
| ---------- | ------------ | ------------ | ------------------ |
| 1st        | `#4285F4`    | `#4285F4`    | Core projects/main metrics |
| 2nd        | `#34A853`    | `#34A853`    | Cost/efficiency metrics |
| 3rd        | `#EA4335`    | `#EA4335`    | Reliability/risk   |
| 4th        | `#FBBC04`    | `#FBBC04`    | Performance/growth |

### List Item Colors

- Use the four brand colors in rotation for list bullet colors
- Keep text in a consistent deep blue `#1A237E`

---

## XII. Usage Instructions

1. Copy the template to the project directory `templates/`
2. Select the appropriate page type based on content needs
3. Use placeholders to mark content that needs replacement
4. Strictly follow the Google brand four-color scheme
5. Maintain generous whitespace to highlight key information
6. Data-driven: use large numbers + small labels to display KPIs

---

_This specification is based on Google Material Design principles, adapted for PPT Master project requirements_
