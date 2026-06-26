# MotoChefe UI Kit — App

A runnable marketing page interface kit demonstrating the MotoChefe design system in a real product surface. This kit provides a complete, functional marketing page with Header, Hero, Stats, Product Categories, 6 Reasons, and Footer components — all built with the MotoChefe token system.

## Kit structure

```
ui_kits/app/
├── index.html              # Entry point — loads React + Babel + tokens + renders App
├── README.md               # This file — kit documentation
└── components/
    └── App.jsx             # Complete marketing page shell (Header → Hero → Stats → Products → Reasons → Footer)
```

| File | Purpose |
|---|---|
| `index.html` | Runnable HTML entry point. Loads `../../colors_and_type.css` for design tokens, React 18.3.1 + ReactDOM 18.3.1 + Babel 7.29.0 via unpkg CDN for JSX rendering. Includes CSS skeleton fallback. |
| `components/App.jsx` | Single-file React component containing all 6 section components. Each exposed as `window.*` global for independent reuse. |
| `README.md` | This documentation file — kit structure, components, usage, design notes, source basis. |

## Component files

| Component | Role | Source Evidence |
|---|---|---|
| `Header` | Sticky nav bar with logo, nav links (Sobre, Modelos, Franqueado, Contato), gold accent bar, CTA button (Suporte) | Live site header: fixed white, logo left, nav center, gold top bar at `#B7A45F` |
| `Hero` | Full-viewport dark hero with overline ("Desde 2019"), display headline ("Líder em mobilidade elétrica sobre duas rodas no Brasil"), body text, and gold CTA button | Homepage hero: dark gradient bg, Be Vietnam Pro 50px heading, gold pill CTA |
| `Stats` | Three-column stat numbers on dark background: +200K, +310, +70 | Homepage stats bar: Bebas Neue display numbers, gold color, uppercase labels |
| `ProductCategories` | 2×2 grid of product category cards with gradient overlays: Autopropelidos, Ciclomotor, Triciclos, E-Bikes | Homepage models section: 24px radius cards, gradient bottom overlay, category + description |
| `SixReasons` | 3×2 grid of numbered reason cards on dark background with gold numbers | Homepage "6 Razões" section: charcoal `#1F1F1F` cards, 24px radius, Bebas Neue numbers |
| `Footer` | Three-column dark footer with logo, product links, company links, copyright bar | Site footer: `#1F1F1F`, multi-column nav, white logo, copyright text at 30% opacity |

## Usage workflow

### Quick start

1. **Open `ui_kits/app/index.html`** in a browser — it renders a complete MotoChefe marketing page
2. **All components use the shared token system** from `../../colors_and_type.css` (`--mc-*` CSS custom properties)
3. **Components are exposed as `window.*` globals**: `window.App`, `window.Header`, `window.Hero`, `window.Stats`, `window.ProductCategories`, `window.SixReasons`, `window.Footer`

### Detailed workflow

1. **To run**: open `index.html` in a browser — React loads from CDN, Babel transpiles JSX, and the composed App renders
2. **To modify**: edit `components/App.jsx` — all components are in a single file for simplicity
3. **To extend**: add new component functions in `App.jsx`, expose them on `window`, and compose them into the `App` render tree
4. **To extract a single component**: access any `window.*` global (e.g., `window.Header`) and render it standalone in a new HTML file that loads the same token CSS
5. **To split into separate files**: move each component into its own `.jsx` file, expose each as a `window.*` global, and load them via `<script type="text/babel">` tags in index.html

### Token usage example

```jsx
// All components use --mc-* CSS custom properties from colors_and_type.css
const buttonStyle = {
  background: 'var(--mc-gold)',
  color: 'var(--mc-black)',
  borderRadius: 'var(--mc-radius-pill)',
  fontFamily: 'var(--mc-font-heading)',
  padding: 'var(--mc-space-md) var(--mc-space-xl)',
};
```

## Design notes

- All typography uses `var(--mc-font-heading)`, `var(--mc-font-display)`, `var(--mc-font-body)` tokens from `colors_and_type.css`
- Colors reference the brand palette: `#DBB42C` (gold), `#090909` (near-black), `#1F1F1F` (charcoal), `#FFFFFF` (white)
- Buttons use pill radius (9999px), gold background, black text — matching the live site exactly
- Product category cards use 24px border-radius — consistent with the design system's card pattern
- Stats section uses Bebas Neue display font at 56px with gold color — matching the live stats bar
- Footer uses 3-column grid layout with 60px gap, matching the production site's footer structure
- This is a marketing/brand surface, not a chat/workspace app — components match the actual MotoChefe product
- The CSS skeleton fallback ensures the page renders instantly before React loads, providing good perceived performance
- Sections alternate between light (`#FFFFFF`) and dark (`#090909`) backgrounds for visual rhythm

## Source basis

All components are modeled directly after the live production site at https://motochefebrasil.com.br/. The layout structure, color usage, typography choices, and component patterns directly match the Elementor-built WordPress site.

| Component | Evidence Source | Key Pattern |
|---|---|---|
| Header | Homepage `<style>` blocks | Sticky positioning, gold accent bar (`#B7A45F`), logo + nav + CTA layout |
| Hero | Homepage hero section | Full-viewport dark gradient, 50px heading, overline with letter-spacing |
| Stats | Homepage stats bar | Bebas Neue numbers, 3-column grid, dark background |
| Product categories | `/modelos/` page | 2×2 grid, 24px radius, gradient overlays |
| 6 Reasons | Homepage reasons section | Charcoal cards, numbered layout, 3-column grid |
| Footer | Site footer | `#1F1F1F` background, 3-column nav, copyright bar |

## Dependencies

- React 18.3.1 (loaded via unpkg CDN)
- ReactDOM 18.3.1 (loaded via unpkg CDN)
- Babel standalone 7.29.0 (for JSX transpilation in browser)
- `../../colors_and_type.css` (MotoChefe design tokens)
