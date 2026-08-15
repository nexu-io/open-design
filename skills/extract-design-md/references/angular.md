# Angular Extraction Patterns

Angular projects use a structured, convention-heavy approach to styling.
Design systems often live in SCSS/CSS files with clear separation between
global themes and component-scoped styles.

## File Discovery Order

1. **`angular.json`** — Lists global style files under
   `projects.*.architect.build.options.styles`. These are the entry-point
   CSS/SCSS files.

2. **`src/styles.scss` / `src/styles.css`** — Global stylesheet. CSS custom
   properties, font imports, and base styles live here.

3. **`src/theme.scss` / `src/theme/`** — Explicit theme directory. Custom
   Material/component palettes.

4. **Tailwind Config (`tailwind.config.js` or Tailwind v4 `@theme {}`)** — For Tailwind v3, read `tailwind.config.js`. For Tailwind v4, inspect `@theme {}` blocks, `@custom-variant`, and `@plugin 'tailwindcss-primeui'` in your global CSS/SCSS (e.g. `src/styles.css` or `src/assets/tailwind.css`) for CSS custom property tokens (`--color-*`, `--font-*`, `--text-*`, `--breakpoint-*`).

5. **`src/app/app.component.scss`** — Root component styles, reveals global
   layout patterns.

6. **Component `.scss` / `.css` files** — Co-located styles (ViewEncapsulation
   scoped by default).

7. **External Template `.html` files (`src/app/**/*.component.html`)** — Essential for Angular 17+ standalone components using Tailwind CSS utility classes (`bg-*`, `text-*`, `p-*`, `rounded-*`) or structural class bindings (`[ngClass]`, `[class.*]`). Always inspect `.html` templates when styling uses utility classes.

## Angular Material Theme Extraction

Angular Material is the most common component library. Themes are SCSS-based:

```scss
// src/theme.scss
@use '@angular/material' as mat;

$primary-palette: mat.m2-define-palette(mat.$m2-teal-palette, 800);
$accent-palette: mat.m2-define-palette(mat.$m2-blue-grey-palette);
$warn-palette: mat.m2-define-palette(mat.$m2-red-palette);

$theme: mat.m2-define-light-theme((
  color: (
    primary: $primary-palette,
    accent: $accent-palette,
    warn: $warn-palette,
  ),
  typography: mat.m2-define-typography-config(
    $font-family: 'Manrope, sans-serif',
    $headline-1: mat.m2-define-typography-level(3.5rem, 4rem, 600),
    $headline-5: mat.m2-define-typography-level(1.5rem, 2rem, 500),
    $body-1: mat.m2-define-typography-level(1rem, 1.7, 400),
  ),
));

@include mat.all-component-themes($theme);
```

**What to extract:**
- Palette choices → map to functional color roles
- Typography config → maps directly to the hierarchy section
- Light vs dark theme → atmosphere

For Angular Material 3 (MDC-based), look for `mat.define-theme()` using
the new token system with `--mat-*` CSS custom properties.

## SCSS Variable Patterns

Many Angular projects use SCSS variables for tokens:

```scss
// _variables.scss
$color-primary: #294056;
$color-background: #FCFAFA;
$color-surface: #F5F5F5;
$color-text: #2C2C2C;

$font-heading: 'Manrope', sans-serif;
$font-body: 'Inter', sans-serif;

$radius-button: 8px;
$radius-card: 12px;

$breakpoint-mobile: 768px;
$breakpoint-desktop: 1024px;

$spacing-section: 5rem;
$spacing-component: 2rem;
```

These are explicit design tokens. Map them directly.

## ViewEncapsulation and Scoped Styles

Angular scopes styles by default (similar to Vue's `scoped`). When scanning
component styles:

- Look for `:host` selectors — these style the component's root element
- `::ng-deep` (deprecated but still used) — styles that pierce encapsulation
- Repeated values across components indicate design system conventions

## PrimeNG / Nebular / NG-ZORRO

If component libraries are used:
- **PrimeNG (v17/v18/v19+)**: Look for modern theme configuration in `src/app.config.ts` (e.g., `providePrimeNG({ theme: { preset: Aura, options: { darkModeSelector: '.app-dark' } } })`). Check for Tailwind v4 integration via `@plugin 'tailwindcss-primeui'` in CSS assets. Inspect CSS custom properties defined by PrimeNG tokens (`--primary-color`, `--surface-*`).
- **Nebular**: `nb-theme()` in `styles.scss` with custom theme object.
- **NG-ZORRO (Ant Design for Angular)**: `ng-zorro-antd.less` variables
  or custom theme config in `angular.json`.

## Modern Angular (v17 - v19) Standalone Components & Control Flow

In modern Angular repositories:
- **Standalone Components (`@Component({ standalone: true })`)**: Components import their own dependencies directly without NgModules. Inspect `templateUrl` and `styleUrl(s)` in component metadata to locate the template and style files.
- **Control Flow (`@if`, `@for`, `@switch`)**: Notice how conditional layouts and lists are structured in `.html` templates when analyzing component density and spacing rules.
- **Signals & Zoneless (`signal()`, `input()`, `computed()`, `provideZonelessChangeDetection()`)**: Dynamic styling or theme toggling is often driven by signals bound to `[class.dark]` or custom CSS classes in templates. Notice `app.config.ts` for app-wide providers.

## Responsive Patterns

Check for:
- `@media` queries in `styles.scss` and component styles
- Angular CDK `BreakpointObserver` usage in components
- Tailwind responsive prefixes if Tailwind is configured
- Angular Flex-Layout directives (`fxLayout`, `fxFlex`) in templates
