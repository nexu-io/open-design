# China Merchants Bank Transaction Banking - Design Specification

## I. Template Overview

| Property | Description |
| --- | --- |
| **Template Name** | 招商银行 |
| **Display Name** | China Merchants Bank Transaction Banking Template |
| **Use Cases** | 交易银行产品介绍、销售收款方案汇报、客户案例拆解、分行培训材料 |
| **Design Tone** | Brand-consistent, structured, product-focused, refined finance |
| **Theme Mode** | Hybrid theme (brand-red cover/chapter/ending + light content pages) |

Reference slides read before generation: `1, 2, 3, 4, 6, 9, 11, 13, 16, 18`.

## II. Canvas Specification

| Property | Value |
| --- | --- |
| **Format** | Standard 16:9 |
| **Dimensions** | 1280 × 720 px |
| **viewBox** | `0 0 1280 720` |
| **Safe Margins** | 56px left/right, 48px top, 40px bottom |
| **Primary Content Area** | x: 72-1216, y: 140-640 |

## III. Color Scheme

| Role | Color Value | Usage |
| --- | --- | --- |
| **Brand Red** | `#C8152D` | Header strips, emphasis, chapter anchor |
| **Deep Red** | `#8F0F1B` | Dark-page overlay and structural depth |
| **Signal Red** | `#E26A74` | Fine divider accents on cover |
| **Finance Blue** | `#2175D9` | Case-study secondary emphasis |
| **Dark Text** | `#1F1F1F` | Main titles and core copy |
| **Medium Gray** | `#666666` | Secondary copy |
| **Light Gray** | `#E9E9E9` | Dividers and boundary hints |
| **White** | `#FFFFFF` | Background and reverse text |

## IV. Typography System

| Level | Usage | Size | Weight |
| --- | --- | --- | --- |
| **H1** | Cover title | 54px | Bold |
| **H2** | Chapter title | 46px | Bold |
| **H3** | Content title | 26px | Bold |
| **H4** | TOC / card title | 20px | Bold |
| **Body** | Paragraph text | 16px | Regular |
| **Caption** | Metadata / footer | 12px | Regular |
| **Display Number** | Chapter numeral | 220px | Bold |

**Font Stack**: `"Microsoft YaHei", "PingFang SC", Arial, sans-serif`

## V. Page Structure

### Common Layout

| Area | Description |
| --- | --- |
| **Header Strip** | Red brand strip with logo, used on light pages |
| **Title Zone** | Left-aligned title and short key message |
| **Content Body** | Open layout with only light boundary hints |
| **Footer** | Thin divider, section/source/page number |

### Design DNA

1. Reuse the PPT's bank-red brand language, but simplify heavy PPT export artifacts into clean vector geometry.
2. Keep cover / chapter / ending pages visually strong and brand-led.
3. Keep content pages bright and practical for data, process, and case-study layouts.
4. Preserve a secondary finance-blue accent to support comparison and case storytelling.
5. Maintain content coverage ≤ 60%, ensuring visual "breathing room" on data-heavy pages.
6. Use structured layouts (cards, grids, process flows) to organize financial data clearly.

## VI. Page Types

### 1. Cover Page (`01_cover.svg`)

- Uses the imported cover background asset `cover_bg.png`
- Centered white typography with restrained divider lines
- Suitable for title, subtitle, presenter, and date

### 2. Table of Contents (`02_toc.svg`)

- Light page with red top strip and logo
- Two-column indexed list for up to four agenda items
- Red numerals + dark text for fast scanning

### 3. Chapter Page (`02_chapter.svg`)

- Full-brand dark red background
- Large translucent chapter numeral in the background
- Left-aligned title and short chapter description

### 4. Content Page (`03_content.svg`)

- Light page with a narrow red header strip and right-aligned white logo
- Page title, section label, key message line, and open body region
- Footer includes section name, source, and page number

### 5. Ending Page (`04_ending.svg`)

- Reuses the cover background asset
- Centered closing message and compact contact card
- Suitable for formal client-facing endings

## VII. Layout Modes

| Mode | Recommendation |
| --- | --- |
| **Process / Flow** | Use full-width body area with 3-6 horizontal stages |
| **Case Study** | Use split columns or a left-right evidence / solution structure |
| **Product Feature** | Use a short key message on top and modular cards below |
| **Agenda / Sectioning** | Use TOC or chapter page instead of improvising layout headers |

## VIII. Spacing Specification

| Property | Value |
| --- | --- |
| **Base Unit** | 8px |
| **Module Gap** | 24px |
| **Card Gap** | 20px |
| **Title to Body** | 44px |
| **Footer Offset** | 32px from bottom |

## IX. SVG Technical Constraints

1. `viewBox` must stay `0 0 1280 720`
2. No `mask`, `<style>`, `class`, `foreignObject`, `textPath`, or animation tags. `clipPath` is allowed only on `<image>` under `shared-standards.md` §1.2
3. Use plain hex colors with `fill-opacity` / `stroke-opacity`
4. Keep image assets semantic and minimal
5. Prefer vector reconstruction over embedding PPT-export fragments

## X. Placeholder Specification

| Placeholder | Description |
| --- | --- |
| `{{TITLE}}` | Cover main title |
| `{{SUBTITLE}}` | Cover subtitle |
| `{{DATE}}` | Cover date |
| `{{AUTHOR}}` | Cover presenter / organization |
| `{{TAGLINE}}` | Cover tagline (e.g. product/service line) |
| `{{BRAND_LINE}}` | Cover bottom brand attribution line |
| `{{CHAPTER_NUM}}` | Chapter number |
| `{{CHAPTER_TITLE}}` | Chapter title |
| `{{CHAPTER_DESC}}` | Chapter description |
| `{{PAGE_TITLE}}` | Content page title |
| `{{KEY_MESSAGE}}` | Content page key message |
| `{{CONTENT_AREA}}` | Content page body placeholder |
| `{{SECTION_NAME}}` | Section label / footer section |
| `{{SOURCE}}` | Source text |
| `{{PAGE_NUM}}` | Page number |
| `{{TOC_ITEM_1_TITLE}}` | TOC item 1 title |
| `{{TOC_ITEM_1_DESC}}` | TOC item 1 description |
| `{{TOC_ITEM_2_TITLE}}` | TOC item 2 title |
| `{{TOC_ITEM_2_DESC}}` | TOC item 2 description |
| `{{TOC_ITEM_3_TITLE}}` | TOC item 3 title |
| `{{TOC_ITEM_3_DESC}}` | TOC item 3 description |
| `{{TOC_ITEM_4_TITLE}}` | TOC item 4 title |
| `{{TOC_ITEM_4_DESC}}` | TOC item 4 description |
| `{{TOC_FOOTER}}` | TOC page footer description |
| `{{THANK_YOU}}` | Ending main message |
| `{{ENDING_SUBTITLE}}` | Ending subtitle |
| `{{CLOSING_MESSAGE}}` | Ending supporting sentence |
| `{{CONTACT_NAME}}` | Ending contact person name |
| `{{DEPARTMENT}}` | Ending department name |
| `{{CONTACT_EMAIL}}` | Ending email address |
| `{{CONTACT_PHONE}}` | Ending phone number |

## XI. Asset Specification

### Core Assets

| Asset | Purpose |
| --- | --- |
| `cover_bg.png` | Cover / ending brand background (dark pages) |
| `logo_white.png` | White brand logo for red and dark pages |
| `logo_dark.png` | 「招商银行 \| 公司金融」dark logo for light page headers |

### Optional Assets

| Asset | Purpose |
| --- | --- |
| `page_header_bg.png` | Full-page header background reference (red accent + logo) |
| `logo_crm_banner.png` | 「招商银行 \| CRM 4.0」red banner (product-specific, use when applicable) |
| `ref_content_bg.png` | Content page reference layout (with building illustration, for design reference only) |

### Usage Rule

Core assets are wired into SVG templates. `logo_dark.png` is used on light pages (TOC, content); `logo_white.png` and `cover_bg.png` on dark pages (cover, chapter, ending). Optional assets are available for project-specific customization.

## XII. Chart Specifications

### Recommended Chart Dimensions

| Chart Type | Recommended Size |
| --- | --- |
| Bar chart | 500-700 × 400px |
| Pie chart | 300-400px diameter |
| Data card | 160 × 120px |
| Process flow | Full width, 100-140px height |
| Comparison table | 1100 × 300-400px |

### Chart Color Palette

| Usage | Colors |
| --- | --- |
| Primary series | `#C8152D`, `#E26A74`, `#8F0F1B` |
| Secondary series | `#2175D9`, `#5A9FE6` |
| Positive indicator | `#27AE60` |
| Negative indicator | `#E74C3C` |
| Neutral | `#666666` |

## XIII. Usage Instructions

1. Copy the template directory to the project `templates/` folder
2. Read this design specification to understand the visual system
3. Select the appropriate page template for each slide
4. Replace `company_finance_header.png` if the project is not CRM-specific
5. Mark content to be replaced using `{{PLACEHOLDER}}` format
6. Prioritize data charts and structured layouts; keep text concise
7. Generate final SVGs through the Executor role
