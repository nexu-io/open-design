# Psychology Healing Template (Psychology Attachment Style) - Design Specification

> Suitable for psychology, psychotherapy, counseling training, and academic sharing in professional settings.

---

## I. Template Overview

| Property         | Description                                                  |
| ---------------- | ------------------------------------------------------------ |
| **Template Name**| psychology_attachment (Psychology Healing Template)           |
| **Use Cases**    | Psychotherapy training, academic lectures, counseling case analysis, professional sharing |
| **Design Tone**  | Professional, warm, healing, trustworthy                     |
| **Theme Mode**   | Light theme (cloud white background + blue-green gradient accent + multi-color semantic colors) |

### Core Visual Metaphor

The design adopts "**Secure Base**" as the core visual metaphor:

- **Structural Stability**: Page layout resembles a secure attachment relationship with clear boundaries and predictable patterns
- **Clear Hierarchy**: Information levels mirror the organization of the attachment system — from biological instinct to higher-order reflection
- **Warm Professionalism**: Colors convey both professional authority and healing warmth

---

## II. Canvas Specification

| Property           | Value                           |
| ------------------ | ------------------------------- |
| **Format**         | Standard 16:9                   |
| **Dimensions**     | 1280 × 720 px                  |
| **viewBox**        | `0 0 1280 720`                 |
| **Page Margins**   | Left/right 40px, top 60px, bottom 40px |
| **Content Safe Area** | x: 40-1240, y: 60-680       |

### Page Zones

| Zone             | Y-Range   | Height | Usage                      |
| ---------------- | --------- | ------ | -------------------------- |
| Top Title Area   | 60-120    | 60px   | Page title, chapter labels |
| Main Content     | 130-640   | 510px  | Core content display       |
| Bottom Info Area | 650-680   | 30px   | Page number, chapter nav   |

---

## III. Color Scheme

### Primary Colors

| Semantic Role     | Color Name    | HEX       | RGB         | Usage                              |
| ----------------- | ------------- | --------- | ----------- | ---------------------------------- |
| **Dominant**      | Secure Blue   | `#2E5C8E` | 46,92,142   | Titles, key frameworks, secure attachment |
| **Background**    | Cloud White   | `#F8FAFC` | 248,250,252 | Page background                    |
| **Accent A**      | Warm Orange   | `#E07843` | 224,120,67  | Activation, emotion, anxious type  |
| **Accent B**      | Healing Green | `#3D8B7A` | 61,139,122  | Growth, integration, secure type   |
| **Accent C**      | Cool Gray-Blue| `#64748B` | 100,116,139 | Avoidant type, dismissive type     |
| **Warning**       | Trauma Red    | `#B54545` | 181,69,69   | Disorganized type, unresolved trauma |

### Attachment Type Color Assignments

| Attachment Type              | Primary   | Secondary | Symbolism              |
| ---------------------------- | --------- | --------- | ---------------------- |
| Secure / Autonomous          | `#3D8B7A` | `#D4EDDA` | Growth, coherence      |
| Avoidant / Dismissive        | `#64748B` | `#E2E8F0` | Detachment, suppression |
| Anxious-Ambivalent / Preoccupied | `#E07843` | `#FED7AA` | Anxiety, amplification |
| Disorganized / Unresolved    | `#B54545` | `#FECACA` | Trauma, fragmentation  |

### Text Colors

| Role              | Value     | Usage                              |
| ----------------- | --------- | ---------------------------------- |
| **Main Title**    | `#1E293B` | Dark ink blue, cover/page titles   |
| **Subtitle**      | `#2E5C8E` | Secure blue, emphasized subtitles  |
| **Body Text**     | `#374151` | Dark gray, body content            |
| **Helper Text**   | `#6B7280` | Medium gray, annotations           |
| **Secondary Text**| `#64748B` | Gray-blue, page numbers etc.       |
| **White Text**    | `#FFFFFF` | Text on dark backgrounds           |
| **Light Text**    | `#E5E7EB` | Secondary text on dark backgrounds |
| **English Gray**  | `#94A3B8` | English subtitles                  |

### Gradients

| Name             | Start     | Middle    | End       | Usage                  |
| ---------------- | --------- | --------- | --------- | ---------------------- |
| Cover Gradient   | `#1E3A5F` | `#2E5C8E` | `#3D8B7A` | Cover/chapter page BG  |
| Ending Gradient  | `#1E3A5F` | `#2E5C8E` | `#3D8B7A` | Ending page background |

---

## IV. Typography System

### Font Stack

**Chinese Font Stack**: `"Microsoft YaHei", "PingFang SC", sans-serif`

**English Font Stack**: `Arial, sans-serif`

### Font Size Hierarchy

| Level | Usage            | Size | Weight   | Line Height |
| ----- | ---------------- | ---- | -------- | ----------- |
| H1    | Cover main title | 52px | Bold     | 1.2         |
| H2    | Page main title  | 32px | Bold     | 1.3         |
| H3    | Section subtitle | 24px | SemiBold | 1.3         |
| H4    | Card title       | 20px | SemiBold | 1.4         |
| Body  | Body content     | 18px | Regular  | 1.5         |
| Small | Annotations      | 14px | Regular  | 1.4         |

### Spacing System

| Usage              | Value                     |
| ------------------ | ------------------------- |
| Base unit          | 8px                       |
| Element spacing    | 16px / 24px / 32px / 48px |
| Paragraph spacing  | 24px                      |
| List item spacing  | 12px                      |
| Card inner padding | 24px                      |

---

## V. Page Structure

### General Layout

| Area              | Position/Height | Description                          |
| ----------------- | --------------- | ------------------------------------ |
| **Left Accent**   | x=0, w=8px      | Dominant color vertical bar (content pages) |
| **Top**           | y=60-120        | Page title + English subtitle        |
| **Divider**       | y=125-130       | Decorative divider line              |
| **Content Area**  | y=130-640       | Main content area (510px height)     |
| **Footer**        | y=650-700       | Page number, chapter info            |

### Decorative Design

- **Left Accent Bar**: Dominant color (`#2E5C8E`), width 8px, spanning the full page height
- **Divider Line**: Light gray (`#E5E7EB`), width 1-2px
- **Circle Decorations**: Low-opacity circles for chapter page/cover backgrounds

---

## VI. Page Types

### 1. Cover Page (01_cover.svg)

- **Background**: Blue-green gradient (`#1E3A5F` → `#2E5C8E` → `#3D8B7A`)
- **Decoration**: Optional background image (opacity=0.25)
- **Title Area**: Centered, main title 52px + subtitle 28px
- **English Title**: Light gray, 24px
- **Decorative Line**: Warm orange thin line, 200px wide
- **Bottom**: Quote card (semi-transparent background + healing green left border)
- **Tags**: Keyword tags (semi-transparent capsules)
- **Page Number**: Bottom-right, 14px

### 2. Table of Contents (02_toc.svg)

- **Background**: Cloud white (`#F8FAFC`)
- **Left Accent**: Dominant color 8px vertical bar
- **Title**: "Contents Overview"
- **Left Side**: Five-chapter list (colored number blocks + title + description)
  - Chapter 1: Dominant blue `#2E5C8E`
  - Chapter 2: Healing green `#3D8B7A`
  - Chapter 3: Warm orange `#E07843`
  - Chapter 4: Cool gray-blue `#64748B`
  - Chapter 5: Trauma red `#B54545`
- **Right Side**: Learning objectives card
- **Center**: Dashed divider

### 3. Chapter Page (02_chapter.svg)

- **Background**: Blue-green gradient
- **Decoration**: Multiple low-opacity concentric circles, diagonal line accents
- **Large Number**: 120px, semi-transparent white, centered
- **Chapter Label**: Capsule shape "CHAPTER X"
- **Title**: 48px white bold
- **Subtitle**: 24px light gray English
- **Decorative Line**: Warm orange thin line, 200px
- **Quote**: Semi-transparent quote card
- **Keywords**: Bottom tag group
- **Page Number**: Bottom-right

### 4. Content Page (03_content.svg)

- **Background**: Cloud white
- **Left Accent**: Dominant blue 8px vertical bar
- **Title Area**: Main title 28px + English subtitle 16px
- **Divider**: Decorative line below title
- **Content Area**: Flexible layout (three-column / left-right split / single column)
- **Card Styles**:
  - White background + light gray border
  - Border radius 12-16px
  - Colored top bar / colored left border
- **Bottom Tip**: Light gray background tip bar (optional)
- **Page Number**: Bottom-right

### 5. Ending Page (04_ending.svg)

- **Background**: Blue-green gradient
- **Decoration**: Network connection graph (dots + lines)
- **Title**: Main title 56px + subtitle 28px
- **English**: Light gray English title
- **Decorative Line**: Warm orange thin line, 300px
- **Info Area**: Semi-transparent info card
- **Bottom**: Copyright information

---

## VII. Layout Patterns

### 7.1 Three-Column Side-by-Side (Comparison/Findings)

```
[Card 1: 360px] [Gap: 40px] [Card 2: 360px] [Gap: 40px] [Card 3: 360px]
```

- Each card: Colored top bar + icon + number + title + content + bottom tag
- Suitable for: Three findings, three-type comparisons

### 7.2 Left-Right Split

```
[Left Column: 560px] [Gap: 60px] [Right Column: 580px]
```

- Left side: Concepts/theory
- Right side: Application/practice
- Suitable for: Concept explanations, therapeutic relationships

### 7.3 Vertical Stack (Hierarchical Structure)

```
┌─────────────────────────────────┐
│       Top Layer: Metacognition   │
├─────────────────────────────────┤
│       Representation Layer       │
├─────────────────────────────────┤
│       Affective Layer            │
├─────────────────────────────────┤
│       Somatic Layer              │
└─────────────────────────────────┘
```

- Suitable for: Self-development hierarchy, theoretical frameworks

### 7.4 Attachment Type Quadrant

| Secure (Green) | Avoidant (Gray-Blue) |
| Anxious-Ambivalent (Orange) | Disorganized (Red) |

- Each card uses the corresponding attachment type color scheme

---

## VIII. Visual Element Specifications

### 8.1 Card Styles

```xml
<!-- Standard info card -->
<rect rx="12" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="1"/>

<!-- Emphasis card (with left border) -->
<rect rx="12" fill="#FFFFFF"/>
<rect x="0" width="4" fill="#2E5C8E" rx="2"/>

<!-- Colored top card -->
<rect rx="16" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="1"/>
<rect rx="16" width="100%" height="80" fill="#2E5C8E"/>  <!-- Top color block -->
```

### 8.2 Number Blocks

```xml
<path fill="#2E5C8E" d="M8,0 H42 A8,8 0 0 1 50,8 V42 A8,8 0 0 1 42,50 H8 A8,8 0 0 1 0,42 V8 A8,8 0 0 1 8,0 Z"/>
<text x="25" y="33" font-size="20" font-weight="bold" fill="#FFFFFF" text-anchor="middle">1</text>
```

### 8.3 Tag Styles

```xml
<!-- Capsule tag -->
<path fill="#E0F2FE" d="M33,0 H107 A13,13 0 0 1 120,13 V13 A13,13 0 0 1 107,26 H33 A13,13 0 0 1 20,13 V13 A13,13 0 0 1 33,0 Z"/>
<text x="70" y="18" font-size="13" fill="#2E5C8E" text-anchor="middle">Tag Text</text>
```

### 8.4 Quote Cards

```xml
<!-- Semi-transparent quote card -->
<path fill="#FFFFFF" fill-opacity="0.1" d="..."/>
<path fill="#3D8B7A" d="..." rx="2"/>  <!-- Left accent bar -->
<text font-style="italic" fill="#E5E7EB">Quote content</text>
```

### 8.5 Divider Lines

```xml
<line x1="60" y1="Y" x2="1240" y2="Y" stroke="#E5E7EB" stroke-width="2"/>
```

---

## IX. Icon Usage

Use `tabler-outline` as the stylistic icon library for this template. It matches the professional, warm, low-noise psychology tone and avoids heavy filled symbols.

### Placeholder Format

```xml
<use data-icon="tabler-outline/icon-name" x="X" y="Y" width="32" height="32" fill="COLOR"/>
```

### Common Icon Mappings

| Concept              | Icons                     |
| -------------------- | ------------------------- |
| Attachment/Bonding   | `tabler-outline/heart`, `tabler-outline/link` |
| Secure Base          | `tabler-outline/home`, `tabler-outline/shield-check` |
| Mentalization        | `tabler-outline/brain`, `tabler-outline/bulb` |
| Affect Regulation    | `tabler-outline/activity`, `tabler-outline/adjustments-horizontal` |
| Awareness            | `tabler-outline/eye`, `tabler-outline/compass` |
| Trauma               | `tabler-outline/alert-triangle`, `tabler-outline/bolt` |
| Repair               | `tabler-outline/refresh`, `tabler-outline/tool` |
| Development          | `tabler-outline/trending-up`, `tabler-outline/layers-linked` |

---

## X. SVG Technical Constraints

### viewBox Specification

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
```

### Prohibited Features (Blocklist)

| Category           | Prohibited Items                        |
| ------------------ | --------------------------------------- |
| **Clipping/Masking** | `mask` is forbidden; `clipPath` is allowed only on `<image>` under `shared-standards.md` §1.2 |
| **Style System**   | `<style>`, `class` (`id` inside `<defs>` is allowed) |
| **Structure/Nesting** | `<foreignObject>`                   |
| **Text/Font**      | `textPath`, `@font-face`               |
| **Animation/Interaction** | `<animate*>`, `<set>`, `on*`    |

> `marker-start` / `marker-end` are conditionally allowed — see `shared-standards.md` §1.1 (marker must be in `<defs>`, `orient="auto"`, shape = triangle / diamond / oval).

### PPT Compatibility Rules

| Prohibited                         | Correct Alternative                                    |
| ---------------------------------- | ------------------------------------------------------ |
| `fill="rgba(255,255,255,0.1)"`     | `fill="#FFFFFF" fill-opacity="0.1"`                    |
| `stroke="rgba(0,0,0,0.5)"`        | `stroke="#000000" stroke-opacity="0.5"`                |
| `<g opacity="0.2">...</g>`        | Set `opacity` / `fill-opacity` on each child element individually |

---

## XI. Placeholder Specification

| Placeholder          | Usage                |
| -------------------- | -------------------- |
| `{{TITLE}}`          | Main title           |
| `{{SUBTITLE}}`       | Subtitle             |
| `{{TITLE_EN}}`       | English title        |
| `{{PAGE_TITLE}}`     | Content page title   |
| `{{CONTENT_AREA}}`   | Flexible content area |
| `{{CHAPTER_NUM}}`    | Chapter number       |
| `{{CHAPTER_TITLE}}`  | Chapter title        |
| `{{CHAPTER_EN}}`     | Chapter English title |
| `{{QUOTE}}`          | Quote content        |
| `{{QUOTE_AUTHOR}}`   | Quote author         |
| `{{PAGE_NUM}}`       | Page number          |
| `{{COVER_BG_IMAGE}}` | Cover background image path |
| `{{TOC_ITEM_N_TITLE}}` | TOC item title     |
| `{{TOC_ITEM_N_DESC}}`  | TOC item description |
| `{{THANK_YOU}}`      | Thank-you message    |
| `{{CONTACT_INFO}}`   | Primary contact info |

---

## XII. Usage Notes

### Template Usage Steps

1. **Copy Template**: Copy template files to the project `templates/` directory
2. **Replace Placeholders**: Replace `{{}}` placeholders with actual content
3. **Adjust Colors**: Fine-tune the color scheme based on the theme
4. **Generate Content**: Use the Executor role to generate specific pages
5. **Post-process**: Run `finalize_svg.py` to complete image embedding

### Applicable Topics

- Psychotherapy and counseling
- Attachment theory research
- Developmental psychology
- Clinical case analysis
- Academic training lectures
- Psychology course instruction
