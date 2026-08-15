# Plain CSS / SASS / Less Extraction Patterns

For projects without a JavaScript framework — static sites, WordPress
themes, vanilla HTML/CSS, or CSS preprocessor-heavy projects.

## File Discovery Order

1. **`index.html` / `*.html`** — Check `<link>` tags and `<style>` blocks
   for stylesheet references, inline styles, and font loading.

2. **Main stylesheet** (`style.css`, `main.css`, `app.css`) — The primary
   CSS file. Look for custom properties, base styles, and typography.

3. **`_variables.scss` / `_tokens.scss` / `variables.less`** — Preprocessor
   variable files containing design tokens.

4. **`_mixins.scss`** — Reusable style patterns reveal design conventions.

5. **Component/module stylesheets** — Individual CSS files for UI components.

## CSS Custom Properties (Modern CSS)

Modern vanilla CSS projects often define a design system via custom properties:

```css
:root {
  /* Colors */
  --color-primary: #294056;
  --color-bg: #FCFAFA;
  --color-surface: #F5F5F5;
  --color-text: #2C2C2C;
  --color-text-secondary: #6B6B6B;
  --color-border: #E0E0E0;
  --color-success: #10B981;
  --color-error: #EF4444;

  /* Typography */
  --font-heading: 'Manrope', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-size-base: 1rem;
  --line-height-body: 1.7;

  /* Spacing */
  --spacing-xs: 0.5rem;
  --spacing-sm: 1rem;
  --spacing-md: 2rem;
  --spacing-lg: 4rem;
  --spacing-xl: 6rem;

  /* Shapes */
  --radius-button: 8px;
  --radius-card: 12px;

  /* Shadows */
  --shadow-card: 0 2px 8px rgba(0,0,0,0.06);
}
```

This is the cleanest source of truth. Extract directly and name each token.

## SASS/SCSS Token Patterns

```scss
// _variables.scss
$colors: (
  'primary': #294056,
  'background': #FCFAFA,
  'surface': #F5F5F5,
  'text': #2C2C2C,
  'text-muted': #6B6B6B,
);

$font-stack-heading: 'Manrope', sans-serif;
$font-stack-body: 'Inter', sans-serif;

$breakpoints: (
  'mobile': 768px,
  'tablet': 1024px,
  'desktop': 1280px,
);

$spacers: (
  'section': 5rem,
  'component': 2rem,
  'element': 1rem,
);
```

SASS maps are essentially design token dictionaries. Extract all values.

## Less Variable Patterns

```less
@primary-color: #294056;
@bg-color: #FCFAFA;
@text-color: #2C2C2C;
@font-heading: 'Manrope', sans-serif;
@border-radius-base: 8px;
```

Same extraction approach — map each variable to a descriptive name and role.

## Static Sites and WordPress

For static sites or WordPress themes:

- **WordPress**: Check `style.css` header comment for theme metadata.
  Look for `wp-content/themes/<name>/assets/css/` for stylesheets.
  `functions.php` may enqueue Google Fonts.
- **Jekyll/Hugo**: Check `_sass/` or `assets/css/` directories.
- **Static HTML**: Everything is in the CSS files and `<style>` blocks.

## Inline Style Scanning

For projects heavy on inline styles (legacy codebases, email templates):

Search HTML files for `style="..."` attributes. Group unique values by
property type:

```
background-color: #FCFAFA, #F5F5F5, #294056
color: #2C2C2C, #6B6B6B, white
border-radius: 8px, 12px
font-family: 'Manrope', 'Inter'
```

Then deduplicate and assign roles.

## Color Extraction Strategy

When there's no explicit token system, you need to discover colors across
all stylesheets. Search for:

```
background-color:
background:
color:
border-color:
border:
outline-color:
box-shadow:
fill:
stroke:
```

Collect all unique hex values, `rgb()`, `rgba()`, and `hsl()` values.
Group by proximity (similar colors within a few shades) and assign roles
based on context (which selectors use them).

## Responsive Patterns

Look for `@media` queries in all stylesheets. Common patterns:

```css
@media (max-width: 768px) { ... }   /* Mobile-first breakpoint */
@media (min-width: 1024px) { ... }  /* Desktop enhancement */
@media (prefers-color-scheme: dark) { ... } /* Dark mode support */
```

Document all breakpoints and the content strategy at each (column
changes, padding adjustments, navigation transformations).
