# Page Layout Template Library (17 Templates)

Pre-built PPT page layout templates supporting multiple styles and use cases.

- **Full Index**: [README.md](./README.md) (human browsing — includes categories, primary colors, detailed tone)
- **Slim Index**: [layouts_index.json](./layouts_index.json) (lightweight lookup — `summary` / `keywords` per template id)

> **Template selection is opt-in by explicit path.** The main workflow defaults to free design. A template is only used when the user gives an explicit directory path (e.g. `skills/ppt-master/templates/layouts/academic_defense/` or any other path) in their initial message. Bare names like "academic_defense" do not trigger — `layouts_index.json` and this README are discovery aids for finding the path, not triggers in themselves. See `SKILL.md` Step 3.

---

## Quick Template Index

<!-- quick-index:begin -->
| Template Name | Category | Use Cases | Primary Color | Design Tone |
|---------------|----------|-----------|---------------|-------------|
| `academic_defense` | General | Thesis defense, academic presentations, research progress reports, grant applications | `#003366` | Professional, rigorous, research-oriented, clear hierarchy |
| `ai_ops` | General | Telecom AI operations architecture, IT system overviews, digital transformation proposals, smart infrastructure reports | `#C00000` | Information-dense, structured, modular zoning, telecom/enterprise style |
| `anthropic` | General | AI tech talks, developer conferences, technical training, product launches | `#D97757` | Tech-forward, professional, modern, conclusion-first |
| `china_telecom_template` | General | China Telecom related briefings, 政企数字化方案, 转型规划, 内部汇报 | `#C00000` | Authoritative, structured, restrained, enterprise-government hybrid |
| `google_style` | General | Annual work reports, technical sharing, project showcases, data-driven presentations | `#4285F4` | Professional, modern, clean and restrained, data-driven, generous whitespace |
| `government_blue` | General | Key project briefings, Five-Year Plan presentations, work summaries, investment promotion, policy interpretation | `#0050B3` | Grand, tech-forward, modern, professional government style |
| `government_red` | General | Government briefings, policy interpretation, work summaries, project introductions, investment promotion | `#8B0000` | Authoritative, dignified, professional, modern government style |
| `medical_university` | General | Medical academic reports, case discussions, research presentations, hospital work reports, medical education and training | `#0066B3` | Professional, rigorous, life-affirming, tech-forward, trustworthy |
| `pixel_retro` | General | Tech talks, programming tutorials, game introductions, geek-style showcases | `#0D1117` | Retro gaming, neon cyberpunk, geek tech, 8-bit style |
| `psychology_attachment` | General | Psychotherapy training, academic lectures, counseling case analysis, professional sharing | `#2E5C8E` | Professional, warm, healing, trustworthy |
| `中国电建_常规` | General | Engineering project reports, technical proposal presentations, business negotiations, corporate promotion, annual summaries | `#00418D` | Professional, composed, international, state-owned enterprise style |
| `中国电建_现代` | General | Major engineering reports, international market promotion, technology achievement showcases, high-end business negotiations | `#00418D` | Grand narrative, modern precision, digital tech, international vision |
| `中汽研_商务` | General | Product certification display, evaluation presentations, technology promotion, high-end business reporting | `#003366` | Modern tech, authoritative & professional, composed & grand |
| `中汽研_常规` | General | Product certification display, evaluation presentations, technology promotion, business visits | `#004098` | Professional, authoritative, trustworthy, consulting style |
| `中汽研_现代` | General | Forward-looking technology showcases, strategic releases, high-end business reporting | `#001529` | Futuristic, tech-forward, deep & refined |
| `招商银行` | General | 交易银行产品介绍、销售收款方案汇报、客户案例拆解、分行培训材料 | `#C8152D` | Brand-consistent, structured, product-focused, refined finance |
| `重庆大学` | General | Academic defense, research reports, teaching presentations, scholarly exchange | `#006BB7` | Academically grounded · Mountain City charm · Modern minimalism |
<!-- quick-index:end -->

## Template Categories

### 1. Brand Style Templates

Templates mimicking **specific well-known brands/institutions** with their exclusive design style.
> **Characteristics**: Distinctive brand identity (specific logos, color schemes, VI standards), suitable for internal or external presentations of that organization. Examples: Google, McKinsey, PowerChina.

| Template | Description |
|----------|-------------|
| `google_style` | Google Material Design style, four-color brand identity |
| `anthropic` | Anthropic AI style, dark tech-forward aesthetic |
| `china_telecom_template` | China Telecom brand style, red-gray structural header + ribbon footer |
| `中汽研_常规` | CATARC standard style (v1), suitable for certification and evaluation |
| `中汽研_商务` | CATARC business style (v2), modern tech business, composed and sophisticated |
| `中汽研_现代` | CATARC modern style (v3 Future), Future Tech style, deep blue + neon cyan |
| `中国电建_常规` | PowerChina standard style (v1), suitable for power, energy, and engineering SOEs |
| `中国电建_现代` | PowerChina modern style (v2), emphasis on grand narrative and digital tech |
| `招商银行` | China Merchants Bank v2.0, minimalist luxury, borderless open layout |

### 2. Scenario-Specific Templates

Designed for **specific use cases**, with content structures tailored to scenario requirements.

| Template | Description |
|----------|-------------|
| `academic_defense` | Academic defense, clear research content hierarchy |
| `psychology_attachment` | Psychotherapy theme, warm and professional color palette |
| `medical_university` | Hospital / medical university template, suitable for medical reports |
| `重庆大学` | Chongqing University template, blending mountain-city layered imagery with modern academic style |

### 3. Government & Enterprise Templates

Industry-standard designs for **government agencies and general state-owned enterprises**.
> **Distinction**: Unlike brand styles, these are not targeted at specific organizations but provide templates matching the common aesthetic preferences of government/SOE contexts (e.g., official document red, smart governance blue).

| Template | Description |
|----------|-------------|
| `government_red` | Red government style, suitable for government work reports, party-building events |
| `government_blue` | Blue government style, suitable for smart cities, digital governance reports |
| `ai_ops` | Enterprise digital intelligence style, telecom AI ops architecture, high-density reports (includes `reference_style.svg` style reference) |

### 4. Special Style Templates

Unconventional visual styles for specific creative scenarios.

| Template | Description |
|----------|-------------|
| `pixel_retro` | Pixel retro style, cyberpunk / gaming themes |

> **Design philosophy**: Style and scenario are **orthogonal** concepts. Scenario templates define content structure; style templates define visual presentation. In theory, scenario templates can be combined with different styles.

---

## Template File Structure

Each template should contain the following standard files (TOC page is optional):

| Filename | Required | Purpose | Description |
|----------|----------|---------|-------------|
| `design_spec.md` | Yes | Design specification | Complete color, typography, and layout specs |
| `01_cover.svg` | Yes | Cover page | Title, subtitle, date, organization |
| `02_toc.svg` | Optional | Table of contents | Chapter list, navigation |
| `02_chapter.svg` | Yes | Chapter page | Chapter number, chapter title |
| `03_content.svg` | Yes | Content page | Fixed header/footer, flexible content area |
| `04_ending.svg` | Yes | Ending page | Thank-you message, contact info |

> **Design philosophy**: Templates define visual consistency and structural pages; content pages maintain maximum flexibility, letting AI determine layout based on actual content.

---

## design_spec.md Standard Structure

All template design specification documents should follow this chapter structure:

```markdown
# [Template Name] - Design Specification

> One-line description of applicable scenarios

## I. Template Overview
## II. Canvas Specification
## III. Color Scheme
## IV. Typography System
## V. Page Structure
## VI. Page Types
## VII. Layout Modes (Recommended)
## VIII. Spacing Specification
## IX. SVG Technical Constraints
## X. Placeholder Specification
## XI. Usage Guide (Recommended)
```

---

## Placeholder Specification

Templates use `{{PLACEHOLDER}}` format to mark replaceable content:

> For **newly created library templates**, use the canonical placeholder contract below. Some existing templates still contain legacy placeholder variants; those should be treated as historical exceptions rather than the standard for new assets.

### General Placeholders

| Placeholder | Purpose | Applicable Pages |
|-------------|---------|-----------------|
| `{{TITLE}}` | Main title | Cover |
| `{{SUBTITLE}}` | Subtitle | Cover |
| `{{DATE}}` | Date | Cover, Ending |
| `{{AUTHOR}}` | Author / Organization (Chinese) | Cover |
| `{{AUTHOR_EN}}` | Author / Organization (English) | Cover |

### Chapter-Related

| Placeholder | Purpose | Applicable Pages |
|-------------|---------|-----------------|
| `{{CHAPTER_NUM}}` | Chapter number | Chapter, Content |
| `{{CHAPTER_TITLE}}` | Chapter title | Chapter |
| `{{CHAPTER_TITLE_EN}}` | Chapter English subtitle | Chapter |

### Content Page

| Placeholder | Purpose | Applicable Pages |
|-------------|---------|-----------------|
| `{{PAGE_TITLE}}` | Page title | Content |
| `{{CONTENT_AREA}}` | Content area placeholder | Content |
| `{{PAGE_NUM}}` | Page number | Content, Ending |
| `{{SOURCE}}` | Data source | Content footer |

### Table of Contents

| Placeholder | Purpose |
|-------------|---------|
| `{{TOC_ITEM_1_TITLE}}` ~ `{{TOC_ITEM_N_TITLE}}` | TOC item titles |
| `{{TOC_ITEM_1_DESC}}` ~ `{{TOC_ITEM_N_DESC}}` | Optional TOC item descriptions |
| `{{TOC_ITEM_1}}` ~ `{{TOC_ITEM_N}}` | Legacy simple TOC items; do not use for new templates unless no description field is needed |

### Ending Page

| Placeholder | Purpose |
|-------------|---------|
| `{{THANK_YOU}}` | Thank-you message |
| `{{ENDING_SUBTITLE}}` | Ending page subtitle |
| `{{CLOSING_MESSAGE}}` | Closing message |
| `{{CONTACT_INFO}}` | Contact information |

---

## Usage

To use a template, give the AI an explicit directory path in your initial message — e.g. "用 `skills/ppt-master/templates/layouts/academic_defense/` 这个模板做……". The Step 3 logic copies that directory's SVGs + `design_spec.md` + assets into your project before Strategist starts.

The directory does not have to live under `templates/layouts/`. A template kept in `projects/<other_project>/template/` or any other location works the same way as long as you give the path.

After the copy:

1. Read `design_spec.md` to understand the design specification
2. Adjust colors based on project requirements (if needed)
3. Place logo files in the `images/` directory
4. Use the Executor role to generate SVG pages based on templates

---

## Template Development Guide

### Creating New Templates

1. Create a new directory under `templates/layouts/`
2. Create required files following the existing template structure
3. Ensure `design_spec.md` follows the standard chapter structure
4. All SVGs use `viewBox="0 0 1280 720"`
5. Follow SVG technical constraints (see below)
6. Validate the template directory with `python3 scripts/svg_quality_checker.py templates/layouts/<template_name> --format ppt169`
7. Register the new template by running `python3 scripts/register_template.py <template_id>` — it derives the `summary` and `keywords` index entry from `design_spec.md` and refreshes the Quick Index above

`layouts_index.json` is the lightweight lookup used to **discover** library templates (e.g. answering "what templates exist?"). It is not consulted when triggering Step 3 — Step 3 triggers on an explicit directory path the user supplied, regardless of whether that path is in the index. A template folder without an index entry still works fine if the user names its path; it just won't show up in discovery listings.

### SVG Technical Constraints (All Templates Must Comply)

#### Required

- viewBox: `0 0 1280 720`
- Backgrounds use `<rect>` elements
- Text wrapping uses `<tspan>`
- Transparency uses `fill-opacity` / `stroke-opacity`
- Gradients use `<defs>` with `<linearGradient>`

#### Forbidden (PPT Incompatible)

| Banned Element | Alternative |
|----------------|-------------|
| HTML named entities in text (`&nbsp;` `&mdash;` `&copy;` `&ndash;` `&reg;` …) | Write the raw Unicode character directly (`—` `–` `©` `®` `→` NBSP …); see shared-standards.md §1.0 |
| Bare `&` `<` `>` `"` `'` in text or attribute values | Escape as XML entities `&amp;` `&lt;` `&gt;` `&quot;` `&apos;` (e.g. `R&amp;D`, `error &lt; 5%`) |
| `<foreignObject>` | Use `<text>` + `<tspan>` |
| `clipPath` on shapes / groups / text | Draw the target geometry directly with the matching native element (`<circle>` / `<ellipse>` / `<rect rx>` / `<polygon>` / `<path>`). `clipPath` on `<image>` elements is conditionally allowed — see shared-standards.md §1.2 |
| `mask` | Use `fill-opacity` |
| `<style>` / `class` | Use inline styles |
| `textPath` | Use plain `<text>` |
| `animate*` | Static design |
| `script` | No interactivity supported |
| `rgba()` | Use HEX + `fill-opacity` |
| `<g opacity="...">` | Set opacity on each child element individually |

---
