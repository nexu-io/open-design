# China Telecom Template - Design Specification

> Suitable for telecom solution proposals, digital transformation briefings, government-enterprise reports, and executive review materials.

---

## I. Template Overview

| Property | Description |
| --- | --- |
| **Template Name** | `china_telecom_template` (`中国电信模板`) |
| **Use Cases** | China Telecom related briefings, 政企数字化方案, 转型规划, 内部汇报 |
| **Design Tone** | Authoritative, structured, restrained, enterprise-government hybrid |
| **Theme Mode** | Light theme (white background + telecom red title bar + silver-gray structural lane + restrained brand imagery) |

---

## II. Canvas Specification

| Property | Value |
| --- | --- |
| **Format** | Standard 16:9 |
| **Dimensions** | 1280 × 720 px |
| **viewBox** | `0 0 1280 720` |
| **Page Margins** | Left/Right 72px, Top 88px, Bottom 56px |
| **Safe Area** | x: 72-1208, y: 88-664 |

---

## III. Color Scheme

### Primary Colors

| Role | Value | Notes |
| --- | --- | --- |
| **Telecom Red** | `#C00000` | Main header blocks, numbering, emphasis |
| **Light Silver Gray** | `#D9D9D9` | Structural lane, chapter ribbon backing |
| **Warm White** | `#FFFFFF` | Main background |
| **Line Gray** | `#CFCFCF` | Divider lines and subtle frames |
| **Graphite** | `#2B2F33` | Primary text |

### Secondary Colors

| Role | Value | Notes |
| --- | --- | --- |
| **Muted Gray** | `#6B7280` | Secondary text and descriptions |
| **Soft Red** | `#E55B5B` | Auxiliary emphasis |
| **Near Black** | `#111827` | Key headings |
| **Skyline Blue** | `#DCEAF8` | Decorative cityline / digital texture |

---

## IV. Typography System

### Font Stack

`"Microsoft YaHei", "微软雅黑", "PingFang SC", "Source Han Sans SC", Arial, sans-serif`

### Font Size Hierarchy

| Level | Usage | Size | Weight |
| --- | --- | --- | --- |
| H1 | Cover title | 42px | Bold |
| H2 | Chapter / content title | 28px | Bold |
| H3 | Section label / TOC item | 20px | Bold |
| P | Body text | 16px | Regular |
| Meta | Subtitle / annotations | 13px | Regular |
| Number | TOC / chapter index | 30px | Bold |

---

## V. Page Structure

### General Layout

| Area | Position | Description |
| --- | --- | --- |
| **Logo Area** | x=72, y=36 | Fixed top-left brand logo |
| **Header Ribbon** | y=32 to 96 | Red capsule + gray lane for TOC/content pages |
| **Main Content Area** | y=132 to 618 | Main text/layout body |
| **Visual Sidebar** | x=922 to 1208 | Fixed image-only rail on cover / TOC / chapter / ending pages |
| **Footer Ribbon** | y=548 to 720 | Fixed decorative bottom image area on cover/ending |
| **Footer Meta** | y=650 to 690 | Source / page number / contact info |

### Structural Rules

- Cover and ending pages reuse the image-based footer ribbon to preserve the brand atmosphere.
- TOC and content pages use dedicated visual sidebars/cards for imagery, keeping text and images in separate safe zones.
- Chapter pages are cleaner section-divider pages and should not inherit the content-page header ribbon.
- Each page should contain at most one formal logo mark; sidebars should rely on slogan and skyline imagery instead of repeated logo lockups.
- The content page remains open-canvas by default and should not reserve a large fixed sidebar.

---

## VI. Page Types

### 1. Cover Page (`01_cover.svg`)

- Top-left fixed logo
- Left-aligned title cluster with red accent rule
- Right-side visual card containing slogan and skyline imagery
- Bottom full-width ribbon background

### 2. Table of Contents (`02_toc.svg`)

- Red rounded title capsule + gray structural lane
- Top-right compact logo for page-level brand anchoring
- Left visual card with restrained brand imagery
- Right text list area for up to 4 major sections
- Dotted leaders and right-aligned descriptions

### 3. Chapter Page (`02_chapter.svg`)

- Clean section-divider page without the content-page header ribbon
- Top-right compact logo anchored away from the title area
- Large chapter number and title in the left safe zone
- Right-side visual card with fixed imagery and no duplicated large logo
- Footer ribbon used as a restrained anchor

### 4. Content Page (`03_content.svg`)

- Red section tab at top-left, gray lane at top-right
- Top-right compact logo for page-level brand anchoring
- Open-canvas content area for flexible charts, tables, and mixed layouts
- Only keep lightweight corner / footer-level brand control
- Footer source and page number

### 5. Ending Page (`04_ending.svg`)

- White background
- Left closing statement block
- Right closing visual card with restrained skyline / slogan composition
- Full-width footer ribbon

---

## VII. Layout Modes

| Mode | Use Cases |
| --- | --- |
| **Title + Open Canvas** | Executive summary, key messages |
| **Two Column** | Solution architecture, comparison |
| **Card Grid** | Capability modules, initiatives |
| **Timeline / Process** | Implementation roadmap |
| **Chart + Notes** | Data dashboards, KPI explanation |

---

## VIII. Spacing Specification

| Element | Value |
| --- | --- |
| Outer margin | 72px |
| Header inner padding | 24px |
| Content block gap | 24px |
| Card padding | 20px |
| Border radius | 18px |
| Title-to-subtitle gap | 18px |
| Text-to-image safety gap | 32px |

---

## IX. SVG Technical Constraints

1. `viewBox` must remain `0 0 1280 720`
2. Do not use `mask`, `<style>`, `class`, `foreignObject`, or `rgba()`. `clipPath` is allowed only on `<image>` under `shared-standards.md` §1.2
3. Use plain vector geometry and `<image>` references to packaged assets only
4. Transparency must use `fill-opacity` / `stroke-opacity`
5. Text wrapping should be handled with `<tspan>` if needed
6. Avoid PPT-fragile decorative complexity; simplify repeated motifs into reusable structures

---

## X. Placeholder Specification

| Placeholder | Purpose | Applicable Page |
| --- | --- | --- |
| `{{TITLE}}` | Main title | Cover |
| `{{SUBTITLE}}` | Subtitle | Cover |
| `{{DATE}}` | Date | Cover |
| `{{AUTHOR}}` | Author / organization | Cover |
| `{{CHAPTER_NUM}}` | Chapter number | Chapter |
| `{{CHAPTER_TITLE}}` | Chapter title | Chapter |
| `{{PAGE_TITLE}}` | Page title | Content |
| `{{CONTENT_AREA}}` | Content placeholder | Content |
| `{{SECTION_NAME}}` | Section name | Content |
| `{{SOURCE}}` | Source note | Content |
| `{{PAGE_NUM}}` | Page number | Content, Ending |
| `{{TOC_ITEM_1_TITLE}}` ~ `{{TOC_ITEM_4_TITLE}}` | TOC titles | TOC |
| `{{TOC_ITEM_1_DESC}}` ~ `{{TOC_ITEM_4_DESC}}` | TOC descriptions | TOC |
| `{{THANK_YOU}}` | Closing heading | Ending |
| `{{ENDING_SUBTITLE}}` | Closing subtitle | Ending |
| `{{CONTACT_INFO}}` | Contact information | Ending |

---

## XI. Usage Guide

1. Reuse `logo.png` and `footer_ribbon.png` as fixed brand assets; `slogan_red.png` and `skyline_bg.png` should be used selectively and only on the cover / ending pages.
2. Keep generated text inside the documented safe areas; only chapter pages use a strong left/right split.
3. Prefer red emphasis only for structure and key figures; do not over-saturate the content area.
