# Academic Defense Template - Design Specification

> Suitable for academic thesis defense, research presentations, graduation project showcases, and similar scenarios.

---

## I. Template Overview

| Property       | Description                                            |
| -------------- | ------------------------------------------------------ |
| **Template Name** | academic_defense                                    |
| **Use Cases**  | Thesis defense, academic presentations, research progress reports, grant applications |
| **Design Tone** | Professional, rigorous, research-oriented, clear hierarchy |
| **Theme Mode** | Light theme (white background + dark blue title bar)   |

---

## II. Canvas Specification

| Property       | Value                         |
| -------------- | ----------------------------- |
| **Format**     | Standard 16:9                 |
| **Dimensions** | 1280 × 720 px                |
| **viewBox**    | `0 0 1280 720`                |
| **Page Margins** | Left/Right 40px, Top 0px, Bottom 35px |
| **Safe Area**  | x: 40-1240, y: 70-665        |

---

## III. Color Scheme

### Primary Colors

| Role           | Value       | Notes                            |
| -------------- | ----------- | -------------------------------- |
| **Primary Dark Blue** | `#003366` | Header background, section titles, main headings |
| **Accent Blue** | `#0066CC` | Card borders, icons, secondary decorations |
| **Accent Red** | `#CC0000`  | Key highlights, keyword emphasis, left decorative bar |
| **Light Blue-Gray** | `#E8F4FC` | Key message bar background, card inner sections |
| **Background White** | `#FFFFFF` | Page main background           |

### Text Colors

| Role           | Value       | Usage                  |
| -------------- | ----------- | ---------------------- |
| **White Text** | `#FFFFFF`   | Text on dark backgrounds |
| **Primary Text** | `#333333` | Body content           |
| **Secondary Text** | `#666666` | Descriptions, annotations |
| **Muted Gray** | `#999999`  | Footer, auxiliary info |

### Neutral Colors

| Role           | Value       | Usage                  |
| -------------- | ----------- | ---------------------- |
| **Card Gray**  | `#F5F7FA`   | Card inner background, info blocks |
| **Border Gray** | `#D0D7E0`  | Card borders, dividers |

### Functional Colors

| Usage      | Value       | Description    |
| ---------- | ----------- | -------------- |
| **Success** | `#28A745`  | Positive indicators |
| **Warning** | `#FFA500`  | Alerts         |
| **Info**   | `#17A2B8`   | Information tips |

---

## IV. Typography System

### Font Stack

**Font Stack**: `"Microsoft YaHei", "微软雅黑", Arial, sans-serif`

### Font Size Hierarchy

| Level | Usage            | Size | Weight  |
| ----- | ---------------- | ---- | ------- |
| H1    | Cover main title | 56px | Bold    |
| H2    | Page title       | 28px | Bold    |
| H3    | Section title    | 56px | Bold    |
| H4    | Card title       | 24px | Bold    |
| P     | Body content     | 18px | Regular |
| High  | Highlighted data | 36px | Bold    |
| Sub   | Notes/sources    | 14px | Regular |
| XS    | Page number/copyright | 12px | Regular |

---

## V. Page Structure

### General Layout

| Area           | Position/Height | Description                            |
| -------------- | --------------- | -------------------------------------- |
| **Header**     | y=0, h=70px     | Dark blue background + red left bar + page title |
| **Key Message Bar** | y=70, h=50px | Core message/summary area (light blue-gray background) |
| **Content Area** | y=135, h=515px | Main content area                    |
| **Footer**     | y=665, h=55px   | Data source, section name, page number |

### Decorative Elements

- **Left Red Bar**: Red (`#CC0000`), width 6px, used for header and card decoration
- **Blue Border**: Accent blue (`#0066CC`), used for card borders
- **Decorative Divider**: Blue (`#0066CC`), paired with decorative dots

---

## VI. Page Types

### 1. Cover Page (01_cover.svg)

- White background
- Dark blue top bar + red left vertical bar decoration
- Top-right Logo placeholder area
- Centered main title + subtitle
- Decorative divider line (blue + dots)
- Presenter info area (name, advisor, institution)
- Bottom gray info area (date)

### 2. Table of Contents Page (02_toc.svg)

- White background
- Standard header (dark blue + red vertical bar)
- Card-style TOC item layout (2 columns)
- Light blue-gray background cards + left colored vertical bar
- Optional items use dashed borders

### 3. Chapter Page (02_chapter.svg)

- Dark blue full-screen background (`#003366`)
- Right-side geometric decorations
- Left red vertical bar decoration
- Large semi-transparent background number
- Prominent white chapter title
- Light blue-gray chapter description
- Red decorative horizontal line

### 4. Content Page (03_content.svg)

- White background
- Standard header (dark blue + red vertical bar)
- Key message bar (light blue-gray background + blue left vertical bar)
- Flexible content area
- Footer: data source, section name, page number

### 5. Ending Page (04_ending.svg)

- White background
- Dark blue top bar
- Centered thank-you message
- Tagline
- Decorative divider line
- Contact info card (gray background)
- Bottom gray area (copyright, page number)

---

## VII. Layout Patterns

| Pattern            | Use Cases                      |
| ------------------ | ------------------------------ |
| **Single Column Centered** | Cover, ending, key points |
| **Two-Column Cards** | Table of contents            |
| **Left-Right Split (5:5)** | Comparison display      |
| **Left-Right Split (4:6)** | Image-text mixed layout |
| **Card Grid**      | Research content list           |
| **Timeline**       | Research progress               |
| **Table**          | Data comparison, experiment results |

---

## VIII. Spacing Guidelines

| Element            | Value  |
| ------------------ | ------ |
| Card gap           | 20px   |
| Content block gap  | 24px   |
| Card padding       | 20px   |
| Card border radius | 8px    |
| Icon-to-text gap   | 12px   |

---

## IX. SVG Technical Constraints

### Mandatory Rules

1. viewBox: `0 0 1280 720`
2. Use `<rect>` elements for backgrounds
3. Use `<tspan>` for text wrapping (no `<foreignObject>`)
4. Use `fill-opacity` / `stroke-opacity` for transparency; no `rgba()`
5. Prohibited: `mask`, `<style>`, `class`, `foreignObject`. `clipPath` is allowed only on `<image>` under `shared-standards.md` §1.2
6. Prohibited: `textPath`, `animate*`, `script`
7. `marker-start` / `marker-end` conditionally allowed (marker in `<defs>`, `orient="auto"`, shape = triangle/diamond/oval) — see shared-standards.md §1.1

### PPT Compatibility Rules

- No `<g opacity="...">` (group opacity); set opacity on each child element individually
- Use overlay layers for image transparency
- Inline styles only; no external CSS or `@font-face`

---

## X. Placeholder Specification

Templates use `{{PLACEHOLDER}}` format placeholders. Common placeholders:

| Placeholder        | Description        |
| ------------------ | ------------------ |
| `{{TITLE}}`        | Thesis/project main title |
| `{{SUBTITLE}}`     | Subtitle           |
| `{{AUTHOR}}`       | Presenter name     |
| `{{ADVISOR}}`      | Advisor            |
| `{{INSTITUTION}}`  | University/institution |
| `{{DATE}}`         | Defense date       |
| `{{PAGE_TITLE}}`   | Page title         |
| `{{SECTION_NUM}}`  | Section number     |
| `{{CHAPTER_NUM}}`  | Chapter number (large) |
| `{{CHAPTER_TITLE}}`| Chapter title      |
| `{{CHAPTER_DESC}}` | Chapter description |
| `{{KEY_MESSAGE}}`  | Key message        |
| `{{PAGE_NUM}}`     | Page number        |
| `{{SOURCE}}`       | Data source        |
| `{{SECTION_NAME}}` | Section name (footer) |
| `{{TOC_ITEM_N_TITLE}}` | TOC item title (N=1..n) |
| `{{TOC_ITEM_N_DESC}}` | TOC item description (N=1..n) |
| `{{THANK_YOU}}`    | Thank-you message  |
| `{{ENDING_SUBTITLE}}` | Ending subtitle/tagline |
| `{{CONTACT_INFO}}` | Contact information |
| `{{EMAIL}}`        | Email address      |
| `{{COPYRIGHT}}`    | Copyright info     |
| `{{LOGO}}`         | Logo text          |

---

## XI. Component Specifications

### 1. Tag

```xml
<!-- Blue background white text tag -->
<rect x="40" y="150" width="80" height="28" fill="#0066CC" rx="4"/>
<text x="80" y="170" text-anchor="middle" fill="#FFFFFF" font-size="14" font-weight="bold">内容详解</text>

<!-- Red background white text tag (emphasis) -->
<rect x="40" y="150" width="80" height="28" fill="#CC0000" rx="4"/>
<text x="80" y="170" text-anchor="middle" fill="#FFFFFF" font-size="14" font-weight="bold">核心目标</text>
```

### 2. Flow Arrow

```xml
<!-- Horizontal flow arrow -->
<line x1="200" y1="300" x2="350" y2="300" stroke="#0066CC" stroke-width="2"/>
<polygon points="350,295 360,300 350,305" fill="#0066CC"/>
```

### 3. Data Highlight Box

```xml
<!-- Key data block -->
<rect x="40" y="400" width="200" height="80" fill="#FFFFFF" stroke="#CC0000" stroke-width="2" rx="8"/>
<text x="140" y="445" text-anchor="middle" fill="#CC0000" font-size="24" font-weight="bold">30%</text>
<text x="140" y="470" text-anchor="middle" fill="#666666" font-size="12">关键指标</text>
```

---

## XII. Usage Instructions

1. Copy the template to the project directory
2. Select the appropriate page template based on defense content needs
3. Use placeholders to mark content that needs replacement
4. Ensure presenter info and advisor info are complete
5. Generate the final SVG through the Executor role
