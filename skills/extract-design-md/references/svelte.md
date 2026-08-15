# Svelte / SvelteKit Extraction Patterns

Svelte co-locates styles even more tightly than Vue. Every `.svelte` file
has a `<style>` block that is scoped by default. Design systems in Svelte
projects typically live in global CSS, CSS custom properties, or a shared
theme store.

## File Discovery Order

1. **`src/app.css` / `src/app.postcss`** — Global styles and CSS custom
   properties. The most important file.

2. **`svelte.config.js`** — May reference CSS preprocessors, Tailwind, or
   UnoCSS configuration.

3. **`tailwind.config.js`** (if Tailwind/UnoCSS) — Same extraction as React.

4. **`src/lib/theme.ts` / `src/lib/tokens.ts`** — Shared design tokens
   exported as JS objects.

5. **`src/routes/+layout.svelte`** — Root layout. Shows global font loading,
   background, and structural patterns.

6. **Component `<style>` blocks** — Scoped styles revealing component patterns.

## Svelte Component Style Patterns

```svelte
<script>
  export let variant = 'primary'
</script>

<button class="btn btn-{variant}">
  <slot />
</button>

<style>
  .btn {
    border-radius: 8px;
    padding: 0.875rem 2rem;
    font-weight: 500;
    transition: all 250ms ease-in-out;
  }

  .btn-primary {
    background-color: var(--color-primary);
    color: white;
  }

  .btn-primary:hover {
    filter: brightness(0.9);
  }
</style>
```

**Extraction points:**
- Component props (like `variant`) reveal the intended variant system
- `var(--*)` references → trace to `app.css`
- Transition values reveal the interaction design philosophy

## SvelteKit Layout Patterns

- **`+layout.svelte`** at route root — Global header, footer, font loading
- **`+layout.ts/js`** — May load theme data or tokens
- **`$lib/`** directory — Reusable components and shared utilities

## CSS Custom Properties Strategy

Svelte projects heavily use CSS custom properties for theming:

```css
/* app.css */
:root {
  --color-primary: #294056;
  --color-bg: #FCFAFA;
  --color-surface: #F5F5F5;
  --color-text: #2C2C2C;
  --color-text-muted: #6B6B6B;

  --font-heading: 'Manrope', sans-serif;
  --font-body: 'Inter', sans-serif;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-full: 9999px;

  --shadow-hover: 0 2px 8px rgba(0,0,0,0.06);
  --spacing-section: 5rem;
}
```

These variable names are highly intentional. Use them as the foundation
of your design system extraction.

## Skeleton UI / DaisyUI / Flowbite-Svelte

If component libraries are used:
- **Skeleton UI**: Theme defined in `tailwind.config.js` using Skeleton's
  design token system. Look for custom theme config object.
- **DaisyUI**: Theme in `tailwind.config.js` → `daisyui.themes` array.
- **Flowbite-Svelte**: Standard Tailwind theming.
