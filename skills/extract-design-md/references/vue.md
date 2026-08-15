# Vue / Nuxt Extraction Patterns

Vue projects have a distinctive styling architecture. Styles are often
co-located with components inside `<style>` blocks, and Nuxt adds
convention-based directories.

## File Discovery Order

1. **`nuxt.config.ts` / `nuxt.config.js`** — May contain global CSS paths,
   font configuration, and Tailwind/UnoCSS module config.

2. **`assets/css/main.css`** (or similar) — Global styles, CSS custom
   properties, and font imports.

3. **`tailwind.config.js`** (if Tailwind is used) — Same as React; extract
   custom theme values directly.

4. **`plugins/vuetify.ts`** (if Vuetify) — Theme definition with custom
   palette and typography.

5. **Component `<style>` blocks** — Co-located styles (scoped or global).

## Single-File Component (SFC) Patterns

Vue components bundle template, script, and style together:

```vue
<template>
  <div class="card">
    <h2 class="card__title">{{ title }}</h2>
  </div>
</template>

<style scoped>
.card {
  background: var(--color-surface);
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.card__title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
}
</style>
```

**Key extraction points:**
- `var(--*)` references → trace back to global CSS for the actual values
- `scoped` styles → component-specific, but reveal consistent patterns
- BEM naming (`.card__title`) → hints at component hierarchy

## Vuetify Theme Extraction

Vuetify projects define their design system explicitly:

```ts
// plugins/vuetify.ts
export default createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#294056',
          secondary: '#6B6B6B',
          background: '#FCFAFA',
          surface: '#F5F5F5',
          error: '#EF4444',
          success: '#10B981',
        }
      }
    }
  }
})
```

This is the design system declaration. Map each key to a functional role
and descriptive name.

## Quasar / PrimeVue / Element Plus

These component libraries use their own theming systems:

- **Quasar**: `quasar.config.js` → `framework.config.brand` for colors
- **PrimeVue**: CSS themes in `assets/` or theme preset configuration
- **Element Plus**: SCSS variables in `element-variables.scss`

Look for the override file — that's where the project's unique values live.

## CSS Scoping Behavior

Vue's `scoped` attribute adds data attributes for CSS isolation. When
scanning for patterns, look at multiple components to find repeated values
(same `border-radius`, similar `padding`, consistent color references).
Repeated patterns across scoped styles = design system conventions.

## Nuxt-Specific Patterns

- **`app.vue`** or **`layouts/default.vue`** — Root layout, reveals
  global background, font loading, and overall structure.
- **`assets/`** — Global CSS, fonts, and images.
- **`composables/`** — May contain `useTheme` or `useDesignTokens`.
- **`nuxt.config.ts`** `css` array — Lists global stylesheets automatically
  injected into every page.
