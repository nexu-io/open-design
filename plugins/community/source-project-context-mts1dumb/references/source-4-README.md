# South Florida Elevated — Applied UI Kit

An applied interface kit that mounts the South Florida Elevated design system onto working product UI, so future agents can see and reuse how the tokens, typography, and component language compose into real screens. It is **data-driven**, not a static mock.

## Source basis

The kit is composed entirely from this package's design system:

- **Tokens:** `../../colors_and_type.css` (OKLch palette with hex references, fonts, spacing/layout variables).
- **Component language:** the source carousel `south-florida-elevated-carousel.html` and `../../build/lib/sfe-common.css` (sharp corners, gold hairlines, serif-emphasis headlines, chips/rails/slugs, dusk plates).
- **Rules:** `../../DESIGN.md` (gold-as-material, teal-as-accent, onyx/ivory duality, one serif idea per frame, anti-patterns).

## Structure

The kit is a small set of screen files that all share the same token imports, plus a `components/` folder of modular app chrome, data, and an `App` entry component:

```
ui_kits/app/
├── index.html        # kit overview — mounts the App, renders the cardinal grid
├── pillars.html      # the three editorial pillars as interface cards
├── showcase.html     # the cinematic dusk-plate treatment
├── components/
│   ├── app.css         # App chrome + layout composed on brand tokens
│   ├── app.jsx         # App entry component — window.SFEAPP.mount()
│   └── brand-config.js # shared wordmark mark SVG + cardinal data (window.SFEKIT)
└── README.md          # this reuse guide
```

## Component files

The kit is composed from reusable component files and the preserved review cards, so each screen is a PreviewCard built on the same tokens:

| File | Role |
|---|---|
| `index.html` | Kit overview — mounts the `App` (`components/app.jsx`) and renders the cardinal grid |
| `pillars.html` | The three editorial pillars composed as interface PreviewCards (onyx + ivory variants) |
| `showcase.html` | The cinematic dusk-plate treatment composed as a PreviewCard cover/close frame |
| `components/app.jsx` | `App` entry component — `window.SFEAPP.mount({ mark, grid })` renders data-driven surfaces |
| `components/app.css` | `App` chrome + layout composed on the brand tokens |
| `components/brand-config.js` | Brand config — wordmark mark SVG + cardinal data as `window.SFEKIT` |

## Usage workflow

1. **Bind tokens** — every screen imports `../../colors_and_type.css` before its own styles:
   ```html
   <link rel="stylesheet" href="../../colors_and_type.css" />
   <link rel="stylesheet" href="components/app.css" />
   ```
2. **Import chrome** — `components/app.css` (rail, cards, actions, focus rings) or copy individual rules into your own stylesheet.
3. **Drive with data** — `components/brand-config.js` exports the mark + pillar data as `window.SFEKIT`; `components/app.jsx` reads it and `index.html` calls `window.SFEAPP.mount()` to render. Extend the array and re-render to adapt the kit to new content.
4. **Extend** — add new screen files alongside `index.html` reusing the same imports and the `data-od-id` inspection attributes.

## Design notes

- **Sharp corners only.** No radius anywhere (`--radius: 0`) — matches the source.
- **Gold is the material, teal the accent.** Teal appears only in numerals/marks; gold carries emphasis.
- **Exactly one primary per action** — the `action` hairline button; `action.ghost` for secondary, distinct copy.
- **Hover moves the keyline/background, never foreground lightness;** focus uses a visible gold ring.
- **Semantic tokens, not raw palette.** Components bind `--surface-1/2`, `--text-primary/secondary`, `--action`, `--mark`, `--border-subtle`, `--focus-ring`. Apply `data-theme="light"` (or `.light`) on `<html>` to remap the whole shell to the ivory editorial kit — on ivory, swap to `--ink` + `--gold-deep` (never reuse the dark-surface text colors).
- **Disabled is the only low-contrast state**; target size ≥ `--control-h` 44px; `:focus-visible` always shows the gold ring.

## Light/dark switch

The kit is dark-by-default (onyx nights). To preview the ivory editorial kit, add the light theme to the document root:

```html
<html lang="en" data-theme="light">
```

No per-component changes are needed — the rail, cards, chips, and actions all rebind through the role tokens in `colors_and_type.css`.

## Reusing in a new project

Copy the `components/` folder and the import lines, or reference this kit as the canonical applied example. Keep brand rules from `../../DESIGN.md` in force; when in doubt, bind tokens rather than hardcoding values.
