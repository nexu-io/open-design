# React / Next.js / Tailwind Extraction Patterns

This reference covers the most common frontend stack: React components with
Tailwind CSS (and optionally CSS Modules, styled-components, or Emotion).

## File Discovery Order

Read these files in priority order — higher-priority files give you the
intended design system, lower-priority files show what actually shipped:

1. **`tailwind.config.js` / `tailwind.config.ts`** — The single most
   important file. Custom `theme.extend.colors`, `fontFamily`, `spacing`,
   `borderRadius`, and `screens` are the design system definition.

2. **`globals.css` / `global.css` / `index.css`** — CSS custom properties
   (`--*`), `@layer` directives, `@font-face` declarations, and base styles.

3. **`theme.ts` / `theme.js` / `tokens.ts`** — Explicit design token files.
   May export objects consumed by Tailwind config or CSS-in-JS providers.

4. **`src/app/layout.tsx` or `src/App.tsx`** — Root layout. Shows the global
   font setup (via `next/font` or `<link>`), body background, and overall
   structure.

5. **Component files (`*.tsx` / `*.jsx`)** — Look at 5-8 representative
   components to understand usage patterns.

## Tailwind Config Extraction

The Tailwind config is structured and machine-readable. Extract directly:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#294056',      // → "Deep Muted Teal-Navy" — Primary CTA
        background: '#FCFAFA',   // → "Warm Barely-There Cream" — Page BG
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        button: '8px',
      },
      spacing: {
        section: '5rem',
      }
    }
  }
}
```

Map each custom value to a descriptive name and role.

## CSS Custom Properties

Look for `:root` or `html` blocks in global CSS:

```css
:root {
  --color-primary: #294056;
  --color-bg: #FCFAFA;
  --font-heading: 'Manrope', sans-serif;
  --radius-card: 12px;
  --spacing-section: 5rem;
}
```

These are explicitly declared tokens — use their names as clues for
their intended role.

## Next.js Font Patterns

Next.js uses `next/font` for optimized font loading:

```tsx
import { Inter, Playfair_Display } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-display' })
```

The `variable` names hint at usage: `--font-display` for headlines,
`--font-inter` for body.

## Component Scanning Strategy

Don't read every component. Focus on these archetypes:

| Component Type | What to Extract |
|:---|:---|
| Layout / Shell | Max-width, padding, grid structure |
| Button / CTA | Border radius, colors, hover states, padding |
| Card | Shadow, border, radius, internal spacing |
| Nav / Header | Typography treatment, active states |
| Form / Input | Border, focus state, padding |
| Hero / Landing section | Spacing, typography scale, alignment |

For each, look at the `className` prop for Tailwind classes or the
`styled()` / `css()` calls for CSS-in-JS values.

## CSS-in-JS Patterns (styled-components / Emotion)

If the project uses CSS-in-JS, look for theme providers:

```tsx
// ThemeProvider wrapping the app
const theme = {
  colors: {
    primary: '#294056',
    background: '#FCFAFA',
  },
  fonts: {
    heading: 'Manrope, sans-serif',
  },
  radii: {
    card: '12px',
    button: '8px',
  }
}
```

This theme object *is* the design system. Extract directly.

## Component Library Integration

If the project uses Chakra UI, Material UI, Ant Design, or shadcn/ui:

- **Chakra**: Look for `extendTheme()` calls — these override defaults.
- **MUI**: Look for `createTheme()` — palette, typography, and spacing overrides.
- **Ant Design**: Look for `ConfigProvider` theme prop or `theme.ts` overrides.
- **shadcn/ui**: Colors are defined as CSS custom properties in `globals.css`.
  Check `components.json` for the style configuration.

The overrides are the design system — default values are the library's generic
styling and should be noted but not emphasized.

## Responsive Patterns

Check Tailwind's `screens` config and look for responsive class prefixes
(`sm:`, `md:`, `lg:`, `xl:`) in components:

```js
screens: {
  sm: '640px',   // Mobile landscape
  md: '768px',   // Tablet
  lg: '1024px',  // Desktop
  xl: '1280px',  // Large desktop
  '2xl': '1536px'
}
```

Look for `container` configuration and `max-width` patterns on layout
components to determine content width strategy.
