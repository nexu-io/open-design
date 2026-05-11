# Anthropic Style Template - Design Specification

> Suitable for AI/LLM tech talks, developer conferences, technical training, product launches, and similar scenarios.

---

## I. Template Overview

| Property       | Description                                            |
| -------------- | ------------------------------------------------------ |
| **Template Name** | anthropic (Anthropic Style Template)                |
| **Use Cases**  | AI tech talks, developer conferences, technical training, product launches |
| **Design Tone** | Tech-forward, professional, modern, conclusion-first |
| **Theme Mode** | Mixed theme (dark cover/chapter + light content pages) |

---

## II. Canvas Specification

| Property       | Value                         |
| -------------- | ----------------------------- |
| **Format**     | Standard 16:9                 |
| **Dimensions** | 1280 × 720 px                |
| **viewBox**    | `0 0 1280 720`                |
| **Safe Margins** | 60px (left/right), 50px (top/bottom) |
| **Content Area** | x: 60-1220, y: 100-670     |
| **Title Area** | y: 50-100                     |
| **Grid Base**  | 40px                          |

---

## III. Color Scheme

### Primary Colors

| Role             | Value       | Notes                            |
| ---------------- | ----------- | -------------------------------- |
| **Anthropic Orange** | `#D97757` | Brand identity, title emphasis, key data |
| **Deep Space Gray** | `#1A1A2E` | Cover background, body text, chart base |
| **Tech Blue**    | `#4A90D9`   | Flowcharts, links, interactive elements |
| **Mint Green**   | `#10B981`   | Recommended options, positive indicators, success states |
| **Coral Red**    | `#EF4444`   | Risks, cautions, warnings        |

### Neutral Colors

| Role           | Value       | Usage                  |
| -------------- | ----------- | ---------------------- |
| **Cloud White** | `#F8FAFC`  | Card background        |
| **Border Gray** | `#E2E8F0`  | Card borders, dividers |
| **Slate Gray** | `#64748B`   | Secondary text, chart labels |
| **Pure White** | `#FFFFFF`   | Page background        |

---

## IV. Typography System

### Font Stack

**Font Stack**: `Arial, "Helvetica Neue", "Segoe UI", sans-serif`

### Font Size Hierarchy

| Level    | Usage            | Size   | Weight  |
| -------- | ---------------- | ------ | ------- |
| H1       | Cover main title | 56px   | Bold    |
| H2       | Page title       | 32-36px| Bold    |
| H3       | Subtitle/section | 24-28px| Semibold|
| H4       | Card title       | 20-22px| Bold    |
| P        | Body content     | 16-18px| Regular |
| Data     | Highlighted data | 40-48px| Bold    |
| Label    | Label text       | 14px   | 500     |
| Sub      | Chart labels/footnotes | 12-14px | Regular |

---

## V. Core Design Principles

### Top-Tier Consulting Style

1. **Conclusion First (Pyramid Principle)**: Each page title is the core takeaway
2. **Data Contextualization**: Comparisons, trends, benchmarks — never present data in isolation
3. **SCQA Framework**: Situation → Complication → Question → Answer
4. **MECE Principle**: Mutually Exclusive, Collectively Exhaustive
5. **Professional Whitespace**: Content ratio < 65%, let information "breathe"

---

## VI. Page Structure

### General Layout

| Area           | Position/Height | Description                            |
| -------------- | --------------- | -------------------------------------- |
| **Top**        | y=0, h=6-8px    | Anthropic Orange decorative bar        |
| **Label**      | y=50-70         | Page type label (uppercase, orange)    |
| **Title Area** | y=80-140        | Page title (core takeaway)             |
| **Content Area** | y=160-620     | Main content area                      |
| **Footer**     | y=680           | Page number (centered)                 |

### Decorative Elements

- **Top Orange Bar**: Anthropic Orange (`#D97757`), height 6px
- **Left Gradient Bar**: Orange gradient (`#D97757` → `#E8956F`)
- **Card Border**: Light gray (`#E2E8F0`)
- **Card Shadow**: Soft shadow effect
- **Grid Decoration Lines**: White low-opacity grid on dark covers

---

## VII. Page Types

### 1. Cover Page (01_cover.svg)

- Dark gradient background (`#1A1A2E` → `#16213E` → `#0F0F1A`)
- Grid decoration lines (white, 3% opacity)
- Orange and blue glow effects
- Neural network-style connection lines and nodes
- Centered main title (white) + subtitle
- Orange decorative short line
- Bottom date and source info

### 2. Table of Contents Page (02_toc.svg)

- White background
- Left orange gradient decorative bar (8px)
- Orange circular numbers + chapter titles
- Right-side complexity progression illustration

### 3. Chapter Page (02_chapter.svg)

- Dark gradient background
- Grid decoration
- Centered large chapter title
- Orange decorative line

### 4. Content Page (03_content.svg)

- White background
- Top orange decorative bar
- Page type label (orange uppercase)
- Title as core takeaway
- Three-column card layout (colored top borders)
- Footer with centered page number

### 5. Ending Page (04_ending.svg)

- Dark gradient background
- Neural network decoration
- Centered thank-you message
- Contact information

---

## VIII. Common Components

### Card Style

```xml
<!-- Card with shadow -->
<g filter="url(#cardShadow)">
    <path fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1"
          d="M72,180 H408 A12,12 0 0 1 420,192 V588 A12,12 0 0 1 408,600 H72 A12,12 0 0 1 60,588 V192 A12,12 0 0 1 72,180 Z"/>
</g>
<!-- Top colored decorative bar -->
<rect x="60" y="180" width="360" height="6" fill="#10B981"/>
```

### Circular Number

```xml
<circle cx="90" cy="200" r="24" fill="#D97757"/>
<text x="90" y="207" font-size="18" font-weight="bold" fill="#FFFFFF" text-anchor="middle">1</text>
```

### Icon Background Circle

```xml
<circle cx="130" cy="250" r="35" fill="#10B981" fill-opacity="0.1"/>
```

---

## IX. Spacing Guidelines

| Element          | Value  |
| ---------------- | ------ |
| Safe margin      | 60px   |
| Card gap         | 30-40px|
| Card border radius | 8-12px |
| Card padding     | 30px   |
| Grid base        | 40px   |

---

## X. SVG Technical Constraints

### Mandatory Rules

1. viewBox: `0 0 1280 720`
2. Use `<rect>` elements for backgrounds
3. Use `<tspan>` for text wrapping (**strictly no** `<foreignObject>`)
4. Use `fill-opacity` / `stroke-opacity` for transparency
5. Prohibited: `mask`, `<style>`, `class`, `foreignObject`. `clipPath` is allowed only on `<image>` under `shared-standards.md` §1.2
6. Prohibited: `textPath`, `animate*`, `script`
7. Define gradients using `<defs>`

### PPT Compatibility Rules

- No `<g opacity="...">` (group opacity)
- Inline styles only

---

## XI. Placeholder Specification

| Placeholder        | Description        |
| ------------------ | ------------------ |
| `{{TITLE}}`        | Main title         |
| `{{SUBTITLE}}`     | Subtitle           |
| `{{COVER_QUOTE}}`  | Cover quote        |
| `{{SOURCE}}`       | Source info        |
| `{{DATE}}`         | Date               |
| `{{PAGE_TITLE}}`   | Page title (core takeaway) |
| `{{PAGE_LABEL}}`   | Page type label    |
| `{{CONTENT_AREA}}` | Flexible content anchor |
| `{{CHAPTER_NUM}}`  | Chapter number     |
| `{{CHAPTER_TITLE}}`| Chapter title      |
| `{{PAGE_NUM}}`     | Page number        |
| `{{TOTAL_PAGES}}`  | Total pages        |
| `{{TOC_ITEM_N_TITLE}}` | TOC item title |
| `{{TOC_ITEM_N_DESC}}`  | TOC item description |
| `{{THANK_YOU}}`    | Thank-you message  |
| `{{CONTACT_INFO}}` | Primary contact info |

---

## XII. Usage Instructions

1. Copy the template to the project directory
2. Select the appropriate page template based on content needs
3. **Title is the core takeaway** — ensure each page has a clear conclusion
4. Use three accent colors to differentiate content types (green = recommended, blue = process, orange = emphasis)
5. Generate the final SVG through the Executor role
