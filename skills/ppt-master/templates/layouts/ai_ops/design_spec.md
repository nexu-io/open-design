# ai_ops - Enterprise Digital Intelligence Design Specification

> Suitable for telecom operator AI operations architecture, digital transformation proposals, smart infrastructure reports, IT system overview diagrams, and other high-information-density scenarios.

> **Style Reference**: See `reference_style.svg` (Telecom Operator AI Operations Architecture Overview), which demonstrates the core visual language of this template.

---

## I. Template Overview

| Property           | Description                                                                    |
| ------------------ | ------------------------------------------------------------------------------ |
| **Template Name**  | ai_ops (Enterprise Digital Intelligence)                                       |
| **Use Cases**      | Telecom AI operations architecture, IT system overviews, digital transformation proposals, smart infrastructure reports |
| **Design Tone**    | Information-dense, structured, modular zoning, telecom/enterprise style        |
| **Theme Mode**     | Light theme (white background + red-blue dual-color accents + warm gray panels) |
| **Info Density**   | High density — a single page can accommodate 6-10 information modules, matching telecom reporting conventions |

---

## II. Canvas Specification

| Property           | Value                            |
| ------------------ | -------------------------------- |
| **Format**         | Standard 16:9                    |
| **Dimensions**     | 1280 × 720 px                   |
| **viewBox**        | `0 0 1280 720`                  |
| **Page Margins**   | Left/right 30-50px, top 20px, bottom 40px |
| **Content Safe Area** | x: 30-1250, y: 80-680        |
| **Title Area**     | y: 20-80                        |
| **Grid Baseline**  | 20px (high-density layouts require a finer grid) |

> **Note**: Margins are narrower than standard templates (30px vs 60px) to accommodate the high-information-density reporting style common in telecom presentations.

---

## III. Color Scheme

### Primary Colors

| Role               | Value       | Notes                                        |
| ------------------ | ----------- | -------------------------------------------- |
| **Primary Red**    | `#C00000`   | Brand identity, title vertical bar, number badges, target bars |
| **Accent Blue**    | `#2E75B6`   | Scenario labels, category headers, bottom accent bars |
| **Light Blue**     | `#5B9BD5`   | Feature module cards, sub-item labels        |

### Functional Colors

| Role               | Value       | Usage                              |
| ------------------ | ----------- | ---------------------------------- |
| **Warm Gray BG**   | `#FDF3EB`   | Overview panel, open platform panel background |
| **Warm Orange Border** | `#F8CBAD` | Panel borders, decorative dividers |
| **Light Gray BG**  | `#F2F2F2`   | Subtitle bar, metric card background |
| **Card Gray BG**   | `#E7E6E6`   | Sub-module cards, capability base cards |
| **Card Border**    | `#D9D9D9`   | Card strokes                       |

### Text Colors

| Role               | Value       | Usage                          |
| ------------------ | ----------- | ------------------------------ |
| **Body Black**     | `#000000`   | Titles, standard body text     |
| **White Text**     | `#FFFFFF`   | Text on dark color blocks      |
| **Secondary Text** | `#666666`   | Subtitles, annotations         |
| **Light Secondary**| `#999999`   | Page numbers, source citations |
| **Data Emphasis**  | `#C00000`   | KPI values, key metrics        |

---

## IV. Typography System

### Font Stack

**Font Stack**: `"Microsoft YaHei", "微软雅黑", "SimHei", Arial, sans-serif`

### Font Size Hierarchy

| Level    | Usage                  | Size    | Weight  |
| -------- | ---------------------- | ------- | ------- |
| H1       | Cover main title       | 36-48px | Bold    |
| H2       | Page title             | 32-36px | Bold    |
| H3       | Module title/subtitle  | 18-20px | Bold    |
| P        | Body content           | 14-16px | Regular |
| Caption  | Supplementary/footnotes | 12-14px | Regular |
| Data     | KPI values/metric emphasis | 24-36px | Bold |

> **Note**: Body font size is smaller than usual (14-16px vs standard 18-20px) to accommodate high information density per page.

---

## V. Core Design Principles

### Telecom High-Density Information Style

This template emulates the visual language of telecom technical reports. The core characteristics are "**modular zoning + high information density + red-blue dual-color hierarchy**".

1. **Left Red Vertical Bar**: A red rectangle (10×40px) before titles serves as a visual anchor — the most essential title identifier throughout the template.
2. **Number Badges**: Red square badges (30×30px with white numbers) identify key initiatives/capability numbers (e.g., numbers 1-5 in "Five Key Initiatives").
3. **Dashed Zone Frames**: `stroke-dasharray="5 5"` dashed rectangles group content modules, creating a structured, modular visual effect — a common "zone frame" in telecom reports.
4. **Blue Label Bars**: `#2E75B6` blue-filled rectangles (full-width or fixed-width) serve as scenario/category headers carrying scenario names.
5. **Warm Gray Overview Panels**: Panels with `#FDF3EB` background + `#F8CBAD` border carry overviews, summaries, and open platform entries.
6. **Metric Card Groups**: White cards with `#F2F2F2` borders, closely arranged to display KPI metrics; values highlighted in `#C00000` red.
7. **Light Blue Sub-modules**: `#5B9BD5` filled small rectangular cards displaying specific feature items (e.g., "AI One-Click Troubleshooting Assistant").
8. **Gray Capability Base Cards**: Cards with `#E7E6E6` / `#F2F2F2` background for displaying foundational capabilities/platform components.

### Advanced Features

1. **Triangle Decorations**: The top area may use light semi-transparent triangles (`fill-opacity="0.3"`) as visual guides.
2. **Star/Icon Accents**: Simple polygon stars near key achievements enhance visual impact.
3. **Multi-level Nested Zones**: Outer dashed frame > inner label area > specific feature cards, forming a three-layer visual hierarchy.
4. **Compact Line Spacing**: Module spacing compressed to 10-20px to maximize information capacity.

---

## VI. Page Structure

### General Layout

| Area               | Position/Height  | Description                                          |
| ------------------ | ---------------- | ---------------------------------------------------- |
| **Title Area**     | y=20-80          | Red vertical bar + title text + optional subtitle overview bar |
| **Overview Bar**   | y=80-140         | Full-width `#F2F2F2` background bar carrying the page's core summary |
| **Content Area**   | y=140-670        | Main content area (densely packed multi-module layout) |
| **Footer**         | y=680-720        | Red narrow bar with page number + chapter name + source citation |

### Navigation Bar Design

- **Title Vertical Bar**: Red rectangle `#C00000`, 10×40px, positioned left of the title text
- **Title Text**: 10px from the vertical bar, 36px font size, `#C00000` or `#000000`
- **Overview Bar**: Full-width light gray rectangle (h=60px), centered 16px body text carrying the page overview/introduction

### Decorative Elements

- **Number Badges**: 30×30px red squares + white numbers (centered)
- **Blue Labels**: Fixed-width blue rectangles + white text (e.g., "Fault Boundary Identification")
- **Dashed Zone Frames**: `stroke="#C00000"` or `stroke="#E7E6E6"`, `stroke-dasharray="5 5"`
- **Warm Gray Panels**: `fill="#FDF3EB"` + `stroke="#F8CBAD"` + `stroke-width="2"`
- **Light Blue Feature Cards**: `fill="#5B9BD5"` rectangles + white text

---

## VII. Page Types

### 1. Cover Page (01_cover.svg)

- **Background**: White `#FFFFFF`
- **Left Decoration**: Full-height red-blue dual-color vertical bar (red upper half + blue lower half), width 60px
- **Title Area**: Centered large title `{{TITLE}}` (red), with subtitle `{{SUBTITLE}}` inside a light gray overview bar below
- **Middle Decoration**: Number badges (1-5) + blue scenario labels showcasing core capabilities/scenarios
- **Bottom Info**: Speaker `{{AUTHOR}}` + date `{{DATE}}`
- **Bottom Decoration**: Warm gray narrow bar + blue full-width bottom bar

### 2. Chapter Page (02_chapter.svg)

- **Background**: White `#FFFFFF`
- **Left/Right Decoration**: Left red vertical bar + right blue vertical bar (echoing the cover dual-color scheme)
- **Center**: Red number badge (80×80px large) `{{CHAPTER_NUM}}` + watermark number (160px light gray)
- **Title**: Centered `{{CHAPTER_TITLE}}` (48px Bold)
- **Decorative Line**: Red-blue dual lines (thick red line + thin blue line)
- **Description**: `{{CHAPTER_DESC}}` in gray text

### 3. Content Page (03_content.svg)

- **Top**: 4px red top bar + white title bar (80px height)
- **Title Identifier**: Red vertical bar (8×40px) + 32px Bold title `{{PAGE_TITLE}}`
- **Content Area**: Dashed frame (`stroke-dasharray="5 5"`) marking content area `{{CONTENT_AREA}}`
- **Footer**: Light gray bottom bar, left red vertical bar + chapter name `{{SECTION_NAME}}`, right red square page number `{{PAGE_NUM}}`
- **Source Citation**: Footer centered `{{SOURCE}}`
- **TOC**: Use canonical indexed placeholders such as `{{TOC_ITEM_1_TITLE}}`

### 4. Ending Page (04_ending.svg)

- **Layout**: Mirrors the cover — left red-blue dual-color vertical bar, bottom blue bar
- **Central Panel**: Warm gray panel (`#FDF3EB` + `#F8CBAD` border) carrying the thank-you message
- **Content**: `{{THANK_YOU}}` (red 64px Bold) + `{{ENDING_SUBTITLE}}` (blue 22px)
- **Contact Info**: `{{CONTACT_INFO}}` + `{{COPYRIGHT}}`
- **Bottom Decoration**: Number badges + blue labels, echoing the cover

---

## VIII. Layout Patterns

| Pattern                        | Applicable Scenarios                              |
| ------------------------------ | ------------------------------------------------- |
| **Architecture Overview**      | AI operations overview, system architecture panorama |
| **Metrics Dashboard**          | KPI display, performance reports, data dashboards |
| **Multi-Module Zoning**        | Capability lists, scenario matrices, domain displays |
| **Process/Timeline**           | Implementation roadmap, deployment plan, evolution path |
| **Top-Bottom Split**           | Objectives+results (top), scenarios+capabilities (bottom) |
| **Left-Right Split (3:7)**     | Left navigation labels + right content area       |
| **Card Matrix (2x3/3x3)**     | Capability modules, team assignments, project lists |
| **Table**                      | Metric comparisons, progress tracking             |

> **Recommended**: Telecom reports commonly use the "**Architecture Overview**" pattern — a single page presenting the complete architecture from objectives → results → scenarios → orchestration → foundational capabilities, unfolding top to bottom.

---

## IX. Common Components

### Title Vertical Bar Decoration

```xml
<!-- Red vertical bar + title -->
<rect x="30" y="20" width="10" height="40" fill="#C00000" />
<text x="50" y="55" font-family="Microsoft YaHei, sans-serif" font-size="36" font-weight="bold" fill="#C00000">Page Title</text>
```

### Number Badge

```xml
<!-- Red square number badge -->
<rect x="80" y="560" width="30" height="30" fill="#C00000" />
<text x="95" y="582" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#FFFFFF" text-anchor="middle">1</text>
```

### Blue Scenario Label

```xml
<!-- Blue label bar -->
<rect x="120" y="310" width="220" height="40" fill="#2E75B6" />
<text x="230" y="336" font-family="Microsoft YaHei, sans-serif" font-size="16" font-weight="bold" fill="#FFFFFF" text-anchor="middle">Fault Boundary Identification</text>
```

### Metric Card

```xml
<!-- White metric card (values highlighted in red) -->
<rect x="120" y="215" width="140" height="35" fill="#FFFFFF" stroke="#F2F2F2" stroke-width="2" />
<text x="190" y="239" font-family="Microsoft YaHei, sans-serif" font-size="14" font-weight="bold" fill="#000000" text-anchor="middle">Fault tickets reduced by<tspan fill="#C00000">30%</tspan></text>
```

### Dashed Zone Frame

```xml
<!-- Dashed content zone -->
<rect x="120" y="390" width="940" height="150" fill="none" stroke="#C00000" stroke-width="2" stroke-dasharray="5 5" />
```

### Warm Gray Overview Bar

```xml
<!-- Full-width warm gray overview/summary bar -->
<rect x="30" y="80" width="1220" height="60" fill="#F2F2F2" />
<text x="640" y="115" font-family="Microsoft YaHei, sans-serif" font-size="16" fill="#000000" text-anchor="middle">Overview text content...</text>
```

### Warm Gray Panel

```xml
<!-- Warm gray panel (open platform/summary area) -->
<rect x="1080" y="390" width="160" height="300" fill="#FDF3EB" stroke="#F8CBAD" stroke-width="2" />
```

### Light Blue Feature Card

```xml
<!-- Feature module card -->
<rect x="160" y="450" width="240" height="30" fill="#5B9BD5" />
<text x="280" y="471" font-family="Microsoft YaHei, sans-serif" font-size="14" fill="#FFFFFF" text-anchor="middle">AI One-Click Troubleshooting Assistant</text>
```

### Gray Capability Base Card

```xml
<!-- Foundational capability card -->
<rect x="120" y="630" width="80" height="40" fill="#F2F2F2" stroke="#D9D9D9" stroke-width="1" />
<text x="160" y="655" font-family="Microsoft YaHei, sans-serif" font-size="14" fill="#000000" text-anchor="middle">Core Network</text>
```

---

## X. Spacing Specification

| Element                        | Value     |
| ------------------------------ | --------- |
| Page left/right margins        | 30-50px   |
| Page top/bottom margins        | 20-40px   |
| Title area height              | 60px      |
| Overview bar height            | 60px      |
| Title to overview bar spacing  | 0px       |
| Overview bar to content spacing | 10-20px  |
| Module spacing                 | 10-20px   |
| Card spacing                   | 10px      |
| Card inner padding             | 15-20px   |
| Badge to label spacing         | 5-10px    |
| Footer height                  | 40px      |

> **Compact Principle**: The telecom style pursues maximum information per page; spacing is generally 30-50% smaller than standard templates.

---

## XI. SVG Technical Constraints

### Mandatory Rules

1. viewBox: `0 0 1280 720`
2. Use `<rect>` elements for backgrounds
3. Use `<tspan>` for text wrapping (**`<foreignObject>` is strictly prohibited**)
4. Use `fill-opacity` / `stroke-opacity` for transparency; `rgba()` is prohibited
5. Prohibited: `mask`, `<style>`, `class`, `foreignObject` (`id` inside `<defs>` is allowed). `clipPath` is allowed only on `<image>` under `shared-standards.md` §1.2
6. Prohibited: `textPath`, `animate*`, `script`
7. Prohibited: `<symbol>+<use>`, `<iframe>`, `@font-face`
8. Prohibited: `<g opacity="...">` (group opacity) — set opacity on each child element individually
9. `marker-start` / `marker-end` conditionally allowed (marker in `<defs>`, `orient="auto"`, shape = triangle/diamond/oval) — see shared-standards.md §1.1
10. Use only system fonts and inline styles

### PPT Compatibility Rules

- Use overlay layers instead of image opacity
- Define gradients using `<linearGradient>` inside `<defs>`
- Use `rx`/`ry` attributes for rounded rectangles (post-processing converts to Path)

---

## XII. Placeholder Specification

The template uses `{{PLACEHOLDER}}` format placeholders:

| Placeholder         | Description              | Applicable Template |
| ------------------- | ------------------------ | ------------------- |
| `{{TITLE}}`         | Main title               | Cover               |
| `{{SUBTITLE}}`      | Subtitle/overview        | Cover               |
| `{{AUTHOR}}`        | Speaker/organization     | Cover               |
| `{{DATE}}`          | Date                     | Cover               |
| `{{CHAPTER_NUM}}`   | Chapter number           | Chapter page        |
| `{{CHAPTER_TITLE}}` | Chapter title            | Chapter page        |
| `{{CHAPTER_DESC}}`  | Chapter description      | Chapter page        |
| `{{PAGE_TITLE}}`    | Page title               | Content page        |
| `{{CONTENT_AREA}}`  | Content area identifier  | Content page        |
| `{{SECTION_NAME}}`  | Section name (footer)    | Content page        |
| `{{SOURCE}}`        | Data source (footer)     | Content page        |
| `{{PAGE_NUM}}`      | Page number              | Content/ending page |
| `{{THANK_YOU}}`     | Thank-you message        | Ending page         |
| `{{ENDING_SUBTITLE}}` | Slogan/tagline         | Ending page         |
| `{{CONTACT_INFO}}`  | Contact information      | Ending page         |
| `{{COPYRIGHT}}`     | Copyright                | Ending page         |

---

## XIII. Usage Notes

1. Copy this template directory to the project `templates/` directory
2. Review `reference_style.svg` to understand the core visual style
3. Select appropriate page templates based on content needs
4. Mark content to be replaced using placeholders
5. Generate final SVG through the Executor role
6. For high-information-density pages, refer to the multi-module zoning layout in `reference_style.svg`

---

## XIV. Design Highlights

- **Telecom DNA**: Derived from real telecom AI operations architecture reports, naturally suited for telecom/enterprise presentation styles
- **High Information Density**: A single page can accommodate a complete architecture view (objectives → results → scenarios → orchestration → foundational capabilities)
- **Red-Blue Dual-Color Hierarchy**: Red = core/emphasis/objectives, Blue = scenarios/modules/capabilities — clear visual hierarchy
- **Number Badge System**: Red square numbers throughout create a "N Key Initiatives" visual narrative
- **Three-Level Nested Zoning**: Dashed outer frame → category labels → feature cards for structured expression of complex architectures
- **Metric Card Groups**: Compactly arranged KPI metrics with red-highlighted values for instant readability
