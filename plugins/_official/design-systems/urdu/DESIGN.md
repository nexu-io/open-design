# Urdu Modern (Indus Script System)

> Category: Editorial / Personal / Publication
Urdu-first digital experiences with native RTL support,Nastaliq typography, and bilingual harmony.

---

## 1. Visual Theme & Atmosphere

**"Digital Heritage"** — A clean, spacious, and respectful aesthetic that bridges traditional Urdu calligraphy and contemporary minimal design.

The system avoids visual clutter. Every component prioritizes **whitespace**, **legibility**, and the inherent elegance of the Nastaliq script. The color palette echoes the earth tones and cultural symbols of the Indus region. Typography is the protagonist; everything else supports readability and cultural authenticity.

**Design Philosophy:**
- Urdu is not a "regional variant" of another language; it's the primary voice
- RTL layout is not an afterthought; it's architecturally primary
- Nastaliq's vertical complexity demands generous spacing
- Cultural aesthetics (traditional patterns, warm earths) elevate the experience beyond generic tech UI

---

## 2. Color Palette (Cultural Modernism)

All colors are tested for WCAG AA contrast compliance (minimum 4.5:1 for body text, 3:1 for large text).

### Primary Colors

| Color | Hex | Name | Usage | WCAG Contrast (on Parchment) |
|-------|-----|------|-------|------------------------------|
| **Primary Brand** | `#0F595E` | Deep Teal / Jungle Green | CTAs, primary actions, headers | 8.4:1 ✅ AA |
| **Background** | `#F4F1EA` | Parchment / Off-White | Main canvas, card backgrounds | — |
| **Accent** | `#C05621` | Terracotta / Rust | Secondary CTAs, highlights, focus states | 4.05:1 ✅ AA(large) |
| **Text Primary** | `#1A202C` | Rich Slate | Body text, labels | 15.1:1 ✅ AAA |
| **Text Secondary** | `#4A5568` | Warm Grey | Secondary labels, captions | 3.56:1 ✅ UI Only |
| **Border** | `#E2E8F0` | Light Silver | Component borders, dividers | — |

### Why These Colors?

- **Deep Teal (#0F595E):** Represents trust, stability, and national identity. Inspired by SadaPay (Pakistani fintech) and traditional Urdu ink.
- **Parchment (#F4F1EA):** Warm white that mimics high-quality paper and reduces eye strain during long reading sessions (critical for editorial content).
- **Terracotta (#C05621):** Echoes traditional pottery from the Indus Valley. Used for emphasis without overwhelming.
- **Rich Slate (#1A202C):** Maximum contrast for Nastaliq text; the script's nuqtas (diacritical marks) demand dark, sharp color.

### Extended Palette (Semantic)

```css
:root {
  /* Primary */
  --color-primary: #0F595E;
  --color-primary-dark: #0D3F45;
  --color-primary-light: #2B7A82;
  
  /* Accent */
  --color-accent: #C05621;
  --color-accent-dark: #A03F1C;
  --color-accent-light: #E8754A;
  
  /* Backgrounds */
  --color-bg-primary: #F4F1EA;
  --color-bg-secondary: #FAFAF8;
  
  /* Text */
  --color-text-primary: #1A202C;
  --color-text-secondary: #4A5568;
  --color-text-tertiary: #718096;
  
  /* Status Colors */
  --color-success: #2D5B4A; /* Deep green */
  --color-warning: #C05621; /* Terracotta (doubles as warning) */
  --color-error: #8B3A3A;   /* Deep burgundy */
  --color-info: #2B7A82;    /* Light teal */
  
  /* Borders & Dividers */
  --color-border: #E2E8F0;
  --color-border-dark: #CBD5E0;
}
```

---

## 3. Typography (The Heart of the System)

Urdu typography is the foundational layer. The system enforces **Bilingual Harmony** — Urdu takes priority; Latin text plays a supporting role.

### Font Families

#### Urdu Script (Primary)

```css
font-family: "Noto Nastaliq Urdu", "Mehr Nastaliq", "URW Chancery", serif;
```

**Font Selection Rationale:**
- **Noto Nastaliq Urdu** (Google Fonts): Professionally maintained, open-source, optimized for modern screens. Heavy weight (700) gives proper authority.
- **Mehr Nastaliq**: Pakistani-developed alternative; excellent Urdu-specific kerning.
- **URW Chancery** (system fallback): Hand-drawn serif; graceful degradation when web fonts fail.

**Import (add to `<head>`):**
```html
<link rel="preload" href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" as="style">
<link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">
```

#### Latin Script (Secondary)

```css
font-family: "Inter", "Segoe UI", "Helvetica Neue", sans-serif;
```

**Usage:** Technical terms, code snippets, numerical data, English labels, API names.

**Why Inter:** Designed for screens, excellent kerning at all sizes, modern and neutral.

### Font Sizes & Scale

**Base Unit:** 16px

| Level | Size | Line-Height | Usage |
|-------|------|-------------|-------|
| **Display XL** | 48px | 1.2 | Page titles |
| **Display Large** | 36px | 1.3 | Section headers |
| **Heading 1** | 32px | 1.4 | Major headings |
| **Heading 2** | 24px | 1.5 | Section subheadings |
| **Heading 3** | 20px | 1.6 | Component titles |
| **Body Large** | 18px | 1.8 | Lead paragraphs, intro text |
| **Body** | 16px | 1.8 | Standard body text, editorial |
| **Body Small** | 14px | 1.8 | Secondary text, captions |
| **Label** | 12px | 1.8 | Form labels, micro-copy |

### Line-Height (Critical for Nastaliq)

**Minimum line-height: 1.8**

Nastaliq has high vertical ascenders and deep descenders. Standard web line-heights (1.5) cause nuqtas (diacritical marks) to clip or overlap. 

**Enforcement:**
```css
body {
  line-height: 1.8;
}

/* Headings can compress slightly, but never below 1.4 */
h1, h2, h3 {
  line-height: 1.4;
}

/* Ensure body paragraphs maintain breathing room */
p {
  line-height: 1.9; /* Slightly more for readability */
}
```

### Font Rendering & Smoothing

```css
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  /* Keeps Nastaliq curves sharp and prevents blurry rendering */
  text-rendering: optimizeLegibility;
}

/* Prevent font-weight shifts during hover states */
button, a {
  transition: color 0.2s ease, background 0.2s ease;
  /* Do NOT animate font-weight; it causes layout shift */
}
```

### Font Weights

Only use:
- **400 (Regular):** Body text, standard labels
- **700 (Bold):** Headings, emphasis, strong text

**Avoid:** 300, 500, 600 (Noto Nastaliq doesn't render well at intermediate weights; design suffers).

---

## 4. Spacing & Layout Grid

**Base Unit:** 4px

All spacing follows a **modular scale** rooted in 4px. This allows for both fine-grained and large-scale alignments.

### Spacing Scale

| Name | Value | Usage |
|------|-------|-------|
| **xs** | 4px | Micro-spacing (inline elements, icon gaps) |
| **sm** | 8px | Component internal padding, tight grouping |
| **md** | 16px | Standard padding, default gaps |
| **lg** | 24px | Section spacing, moderate breathing room |
| **xl** | 32px | Large section gaps, hero spacing |
| **2xl** | 48px | Page-level spacing, major layout blocks |
| **3xl** | 64px | Full-screen spacing, viewport-scale gaps |

### Layout Principles

#### Horizontal (RTL-Aware)

In RTL context, directionality is reversed:
- **margin-inline-start:** Becomes right margin (logical property; auto-flips on RTL)
- **padding-inline-end:** Becomes left padding (logical property; auto-flips on RTL)

**Always use logical properties:**
```css
.component {
  /* ✅ GOOD: Auto-flips in RTL */
  margin-inline: 16px;
  padding-inline-start: 24px;
  
  /* ❌ BAD: Hard-coded LTR; breaks in RTL */
  margin-left: 16px;
  padding-right: 24px;
}
```

#### Vertical

Vertical spacing is **unaffected by RTL**. All vertical margins and paddings remain consistent.

```css
.card {
  padding-block: 24px;      /* 24px top + bottom */
  margin-block: 16px;       /* 16px top + bottom */
}
```

### Container & Card Spacing

```css
.card {
  padding: 24px;            /* Internal spacing */
  margin-block: 16px;       /* External spacing */
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-secondary);
}

.section {
  padding-block: 32px;      /* Vertical padding within section */
  padding-inline: 24px;     /* Horizontal padding (RTL-safe) */
}
```

### Grid System (Optional: 12-column)

For complex layouts, use a 12-column grid:
```css
.grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
  direction: rtl;           /* RTL grid automatically reverses columns */
}

.grid-col-6 {
  grid-column: span 6;
}

.grid-col-4 {
  grid-column: span 4;
}
```

---

## 5. Component Styles

### Buttons

#### Primary Button
```html
<button class="button button-primary">
  <span lang="ur">موافقہ</span>
</button>
```

```css
.button-primary {
  background: var(--color-primary);
  color: white;
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-family: var(--font-urdu);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease;
}

.button-primary:hover {
  background: var(--color-primary-dark);
}

.button-primary:active {
  opacity: 0.9;
}

.button-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

#### Secondary Button
```html
<button class="button button-secondary">
  <span lang="ur">منسوخ</span>
</button>
```

```css
.button-secondary {
  background: var(--color-bg-secondary);
  color: var(--color-primary);
  padding: 12px 24px;
  border: 2px solid var(--color-primary);
  border-radius: 6px;
  font-family: var(--font-urdu);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.button-secondary:hover {
  background: rgba(15, 89, 94, 0.1);
}
```

#### Icon Placement (RTL-Aware)

In RTL, icons should be placed on the **right (logical-right)** of the text:

```html
<!-- Urdu context (RTL) -->
<button class="button button-primary">
  <icon class="icon-send" aria-hidden="true"></icon>
  <span lang="ur">بھیجیں</span>
</button>

<!-- HTML rendered as: [icon] [text] (visually: [text] [icon] in RTL) -->
```

```css
.button {
  display: flex;
  align-items: center;
  gap: 8px;
  /* In RTL, flex automatically reverses; icon appears on right visually */
}

.button .icon {
  width: 20px;
  height: 20px;
}
```

### Form Components

#### Input Fields

```html
<div class="form-group">
  <label lang="ur" for="username">صارف کا نام</label>
  <input 
    id="username" 
    type="text" 
    class="input" 
    placeholder="اپنا صارف کا نام درج کریں"
    lang="ur"
    dir="rtl"
  />
</div>
```

```css
.form-group {
  margin-block: 16px;
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-family: var(--font-urdu);
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-block-end: 8px;
  text-align: right;  /* Right-aligned for RTL labels */
}

.input {
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-family: var(--font-urdu);
  font-size: 16px;
  color: var(--color-text-primary);
  line-height: 1.8;
  direction: rtl;
}

.input::placeholder {
  color: var(--color-text-tertiary);
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(15, 89, 94, 0.1);
}

.input:disabled {
  background: var(--color-bg-secondary);
  color: var(--color-text-tertiary);
  cursor: not-allowed;
}
```

#### Accessibility: Placeholder vs. Label

**Never** rely on placeholder as the only label. Placeholders disappear on focus, breaking accessibility.

```html
<!-- ❌ BAD: No visible label -->
<input placeholder="صارف کا نام" />

<!-- ✅ GOOD: Label + placeholder both present -->
<label for="username">صارف کا نام</label>
<input id="username" placeholder="مثال: احمد علی" />

<!-- ✅ EXCELLENT: Label + aria-label for screen readers -->
<label for="username" lang="ur">صارف کا نام</label>
<input 
  id="username" 
  aria-label="صارف کا نام درج کریں"
  placeholder="احمد علی"
/>
```

### Cards

```html
<div class="card">
  <h3 lang="ur">کارڈ کا عنوان</h3>
  <p lang="ur">یہاں کارڈ کا مواد ہے۔</p>
</div>
```

```css
.card {
  padding: 24px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.card h3 {
  margin-block-end: 12px;
  color: var(--color-primary);
}

.card p {
  color: var(--color-text-secondary);
  line-height: 1.8;
}
```

### Links

```html
<a href="#" lang="ur">مزید معلومات پڑھیں</a>
```

```css
a {
  color: var(--color-primary);
  text-decoration: underline;
  font-family: var(--font-urdu);
  transition: color 0.2s ease;
}

a:hover {
  color: var(--color-primary-dark);
}

a:focus {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

---

## 6. Motion & Animation

All animations respect RTL directionality and maintain readability.

### Entrance Animations

```css
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.card {
  animation: fade-in-up 0.3s ease-out;
}
```

### Hover & Interactive States

```css
.button:hover {
  background-color: var(--color-primary-dark);
  transition: background-color 0.2s ease-in-out;
  /* Avoid font-weight changes; they cause layout shift */
}

.button:active {
  transform: scale(0.98);
  /* Provides tactile feedback without breaking layout */
}
```

### Avoid (Anti-Patterns)

- ❌ **Parallax on Urdu text:** Breaks readability during scroll; text moves at different speeds
- ❌ **Rotating Urdu elements:** Nastaliq curves distort when rotated; illegible
- ❌ **Italic animations:** Urdu doesn't have true italic; it looks broken
- ❌ **Fast transitions (< 150ms):** RTL reflows need time; fast animations stutter

### Recommended Durations

| Animation Type | Duration | Easing |
|---|---|---|
| Entrance | 300ms | ease-out |
| Hover | 200ms | ease-in-out |
| Exit | 200ms | ease-in |
| Scroll-reveal | 600ms | ease-out |

---

## 7. Accessibility (A11y)

This system is built to be accessible. All color contrasts are verified against WCAG standards.

### Color Contrast (Verified Ratios)

| Combination | Contrast | Standard | Notes |
|---|---|---|---|
| Deep Teal (#0F595E) on Parchment | 8.4:1 | ✅ AAA | Safe for all text |
| Rich Slate (#1A202C) on Parchment | 15.1:1 | ✅ AAA | Safe for all text |
| Terracotta (#C05621) on Parchment | 4.05:1 | ⚠️ AA (Large) | **Large Text (18pt+) or Bold only** |
| Muted Slate (#718096) on Parchment | 3.56:1 | ❌ UI Only | Decorative/Borders only; avoid for text |

### Text Size Minimums

- **Body text:** Minimum 16px (Nastaliq script becomes unreadable at smaller sizes).
- **Labels:** Minimum 14px.
- **Captions:** Minimum 12px (for non-essential information only).

### Focus States (Keyboard Navigation)

All interactive elements must have visible focus indicators to support keyboard users:

```css
button:focus,
a:focus,
input:focus {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

### ARIA Labels (For Screen Readers)
Accessible Naming Rules (ARIA Best Practices)
Native Labels First: Always use standard <label for="..."> elements. This is the gold standard for screen readers and ensures the accessible name matches the visible text.

When to use aria-label: Only use aria-label when an interactive element has no visible text (e.g., an icon-only button).

Avoid Overriding: Do not use an aria-label that repeats or conflicts with visible text. This prevents WCAG "Label-in-Name" mismatches.


```html
<label for="email" lang="ur">ای میل</label>
<input id="email" type="email" placeholder="name@example.com" />

<button class="icon-button" aria-label="تلاش کریں">
  <icon class="icon-search"></icon>
</button>

<label for="pass" lang="ur">پاس ورڈ</label>
<input id="pass" type="password" aria-describedby="pass-hint" />
<p id="pass-hint" lang="ur">کم از کم 8 حروف۔</p>

```

### Language Declaration

Properly declaring the document language is critical for Urdu screen reading and correct font rendering:

```html
<html lang="ur" dir="rtl">
  <head>
    <meta charset="UTF-8">
  </head>
  <body>
    <h1 lang="ur">خیر مقدم</h1>
  </body>
</html>
```

---

## 8. Brand Voice & Tone

Urdu is a **formal, respectful language**. Microcopy should reflect this.

### Formality Levels

#### Formal (Government, Banking, Official)
```urdu
✅ معافی چاہتے ہیں، آپ کی درخواست مکمل نہیں ہو سکی۔ براہ کرم دوبارہ کوشش کریں۔
❌ خرابی ہوگئی
```

Translation: "We apologize; your request could not be completed. Please try again."

#### Friendly (Apps, Products)
```urdu
✅ کوئی مسئلہ! دوبارہ کوشش کریں۔
❌ Error 503
```

Translation: "Oops! Try again."

#### Technical (Developer Docs, Code)
```urdu
✅ API جواب میں خرابی: [error_code]
❌ بھئی، غلط ہوا
```

Translation: "API response error: [error_code]"

### Currency & Localization

Always use Pakistani Rupee (₨), not generic rupee (₹):

```html
<!-- ✅ Correct -->
<span lang="ur">₨ ۲۵,۰۰۰</span>

<!-- ❌ Wrong -->
<span lang="ur">₹ 25,000</span>
```

### Microcopy Examples

| English | Urdu | Context |
|---------|------|---------|
| "Submit" | "بھیجیں" or "جمع کرائیں" | Form action |
| "Cancel" | "منسوخ کریں" or "واپس جائیں" | Dismissal |
| "Loading..." | "لوڈ ہو رہا ہے..." | Wait state |
| "Error occurred" | "معافی چاہتے ہیں، کوئی مسئلہ واقع ہوا۔" | Error state |
| "No results" | "کوئی نتیجہ نہیں ملا" | Empty state |

---

## 9. Anti-Patterns (Do NOT)

### ❌ Layout & Direction

- **Hard-coded margin-left/right:** Breaks RTL layouts. Always use logical properties like `margin-inline-start` or `padding-inline-end`.
- **Fixed Widths on Text Containers:** Urdu script has a large vertical footprint; fixed heights will cause "nuqta" (dot) clipping.

### ✅ Bidirectional (Bidi) Success Patterns
- **Isolate LTR content:** When mixing Urdu with English product names, URLs, or numbers, always use the `<bdi>` tag or `dir="ltr"` to prevent punctuation (like brackets or periods) from flipping to the wrong side.

```html
<p dir="rtl">
  Check our website <bdi dir="ltr">example.com</bdi> for more details.
</p>
```

### ❌ Typography

- **Generic Arabic fonts (Almarai, Droid Arabic):** Do not use Almarai or Noto Naskh Arabic. These do not support the cascading nature of Nastaliq and break spacing.

- **Italic Urdu text:** Nastaliq doesn't have true italic. Font rendering breaks. Use bold or color for emphasis instead.

- **Line-height < 1.8:** Narrow line heights will clip the dots (nuqtas). Maintain a minimum of 1.8 for all Urdu body text.

### ❌ Visual Design

- **Soft shadows on Urdu text:** Shadows make nuqtas invisible. Use only on containers.
  ```css
  /* ❌ BAD */
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  
  /* ✅ GOOD: Shadows only on containers */
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  ```

- **Emoji as primary icons:** Emoji is LTR by default; ambiguous in RTL. Use SVG icons instead.
- **Truncate text with ellipsis in RTL:** `text-overflow: ellipsis` reads backwards. Use expand-button or full text instead.
  ```html
  <!-- ❌ BAD: Ellipsis reads wrong in RTL -->
  <p style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
    یہ بہت لمبا متن ہے...
  </p>
  
  <!-- ✅ GOOD: Full text or expand-button -->
  <details>
    <summary lang="ur">مزید دیکھیں</summary>
    <p lang="ur">یہ بہت لمبا متن ہے جو مکمل طور پر دیکھنے کے لیے کلک کریں۔</p>
  </details>
  ```

- **Aggressive purple gradients:** Doesn't match the Indus palette. Use Deep Teal or Terracotta.
- **Low-contrast backgrounds:** Nastaliq nuqtas need high contrast (7:1+).

### ❌ Component Structure

- **Icon Source Order:** In RTL buttons, the icon should be placed to the right of the text in the source code to maintain a natural visual flow.
- **Directional Icons:** Always manually flip directional icons (like arrows) using transform: scaleX(-1) to align with RTL flow.

  ```html
  <!-- Icon on right in source; flex auto-reverses -->
  <button style="display: flex; gap: 8px;">
    <icon name="arrow-left" style="transform: scaleX(-1);"></icon>
    <span lang="ur">بھیجیں</span>
</button>
  ```

- **Form inputs without explicit labels:** Placeholders disappear; accessibility fails.

---

## Quick Start: RTL Bilingual Component

Here's a complete, production-ready example:

```html
<!DOCTYPE html>
<html lang="ur" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Urdu Modern - Quick Start</title>
  
  <!-- Google Fonts: Noto Nastaliq Urdu -->
  <link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">
  
  <style>
    :root {
      /* Colors */
      --color-primary: #0F595E;
      --color-primary-dark: #0D3F45;
      --color-accent: #C05621;
      --color-bg: #F4F1EA;
      --color-text: #1A202C;
      --color-border: #E2E8F0;
      
      /* Typography */
      --font-urdu: "Noto Nastaliq Urdu", serif;
      --font-latin: "Inter", "Segoe UI", sans-serif;
      
      /* Spacing */
      --space-xs: 4px;
      --space-sm: 8px;
      --space-md: 16px;
      --space-lg: 24px;
      --space-xl: 32px;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: var(--font-urdu);
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.8;
      direction: rtl;
      -webkit-font-smoothing: antialiased;
    }
    
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: var(--space-lg);
    }
    
    h1 {
      font-size: 32px;
      font-weight: 700;
      margin-block-end: var(--space-lg);
      color: var(--color-primary);
      line-height: 1.4;
    }
    
    p {
      font-size: 16px;
      line-height: 1.8;
      margin-block-end: var(--space-md);
      color: var(--color-text);
    }
    
    .button-group {
      display: flex;
      gap: var(--space-md);
      margin-block-start: var(--space-lg);
      flex-direction: row-reverse; /* Reverses button order for RTL visual hierarchy */
    }
    
    .button {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      font-family: var(--font-urdu);
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s ease;
      flex: 1;
    }
    
    .button-primary {
      background: var(--color-primary);
      color: white;
    }
    
    .button-primary:hover {
      background: var(--color-primary-dark);
    }
    
    .button-secondary {
      background: transparent;
      color: var(--color-primary);
      border: 2px solid var(--color-primary);
    }
    
    .button-secondary:hover {
      background: rgba(15, 89, 94, 0.1);
    }
    
    .button:focus {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
    
    .code-block {
      background: #f5f5f5;
      padding: var(--space-md);
      border-radius: 6px;
      font-family: "Courier New", monospace;
      direction: ltr; /* Code is LTR, even in RTL pages */
      text-align: left;
      margin-block: var(--space-md);
      border-inline-start: 4px solid var(--color-accent);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>خیر مقدم — Urdu Modern Quick Start</h1>
    
    <p>
      یہ ایک مکمل مثال ہے جو دکھاتی ہے کہ کیسے Urdu Modern ڈیزائن سسٹم استعمال کریں۔
    </p>
    
    <p>
      یہاں کچھ اہم خصوصیات ہیں:
    </p>
    
    <ul style="margin-block-start: var(--space-md); margin-inline-start: var(--space-lg);">
      <li>نسطعلیق فونٹ خودکار طور پر RTL کے لیے بہتر بنایا گیا ہے</li>
      <li>رنگ نقطے <code>#0F595E</code> معلومات تنبیہی کے ساتھ منظم ہیں</li>
      <li>تمام اردو ٹیکسٹ <code>lang="ur"</code> کے ساتھ نشان زد ہے</li>
    </ul>
    
    <div class="code-block">
      &lt;button class="button-primary"&gt;موافقہ&lt;/button&gt;
    </div>
    
    <div class="button-group">
      <button class="button button-primary">موافقہ</button>
      <button class="button button-secondary">منسوخ</button>
    </div>
  </div>
</body>
</html>
```

---

## How the AI Agent Should Use This System

When an agent generates UI using the Urdu Modern design system, it **must** follow these rules:

1. **Set document direction:** Root `<html>` element always has `dir="rtl"` and `lang="ur"`

2. **Wrap Urdu text:** All Urdu strings wrapped in semantic tags with `lang="ur"`:
   ```html
   <h1 lang="ur">یہ ایک سرخ</h1>
   <p lang="ur">یہاں متن ہے۔</p>
   ```

3. **Use logical CSS properties:** Never hard-code `left`/`right`; use logical equivalents:
   ```css
   margin-inline-start  /* instead of margin-left */
   padding-inline-end   /* instead of padding-right */
   inset-inline-start   /* instead of left */
   ```

4. **Respect line-height:** Minimum 1.8 for body Urdu text; never drop below 1.6

5. **Test icon mirroring:** Directional icons (arrows, back buttons) must flip in RTL context:
   ```html
   <!-- Icon automatically flips in RTL thanks to flex direction -->
   <button>
     <span lang="ur">بھیجیں</span>
     <svg class="icon-send" aria-hidden="true"><!-- SVG --></svg>
   </button>
   ```

6. **Validate color contrast:** Every text-color combination must meet WCAG AA (4.5:1 minimum)

7. **Test bilingual:** When mixing Urdu + English/code, ensure:
   - Urdu text flows RTL
   - Code blocks/English remain LTR
   - No text reflow on directional change

8. **Use system tokens:** Never hard-code colors/spacing; use CSS variables:
   ```css
   background: var(--color-primary);
   padding: var(--space-md);
   ```

---

## Design System Metadata (For OD Daemon)

```yaml
name: Urdu Modern
slug: urdu
description: Premium design system for Urdu-first digital experiences
category: Editorial / Personal / Publication
language: Urdu (ur) + English
rtl_primary: true
fonts:
  - name: Noto Nastaliq Urdu
    url: https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700
  - name: Inter
    url: system
primary_color: "#0F595E"
accent_color: "#C05621"
target_audience: Pakistani startups, news, education, government, global Urdu communities
```

---

## Resources & References

- **Noto Nastaliq Urdu Font:** https://fonts.google.com/noto/specimen/Noto+Nastaliq+Urdu
- **WCAG Accessibility Guidelines:** https://www.w3.org/WAI/WCAG21/quickref/
- **CSS Logical Properties:** https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Logical_Properties
- **RTL Best Practices:** https://www.w3.org/International/questions/qa-html-dir
- **Urdu Typography Guide:** https://fonts.google.com/knowledge/glossary/nastaliq

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-05-07 | Initial release; complete Nastaliq + RTL + bilingual support |

**Last Updated:** 2025-05-07  
**Status:** Production-Ready ✅