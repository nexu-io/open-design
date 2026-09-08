# South Florida Elevated — Design System Package

A complete, reusable OpenDesign design-system package distilled from the "Your Core Visual System Should Be" project — the South Florida Elevated identity by Miguel Perez.

## Product overview

**South Florida Elevated** is a boutique luxury real-estate practice for the modern South Florida life: local expertise, elevated white-glove service, and an eye for the extraordinary. The brand package turns that positioning into a **luxury-editorial visual identity** — deep onyx nights, champagne-gold rules, restrained Florida teal, and instrument-serif headlines — reading like a high-end fashion magazine crossed with a waterfront property publication.

**Primary surfaces the package supports:**
- Instagram carousels (the source artifact is a 5-frame 1080 × 1350 px "Who We Are" deck)
- Pitch / presentation decks
- Marketing & landing pages
- Brand assets (wordmark mark, lockup, skyline silhouette, palette)
- Applied product UI (see `ui_kits/app/`)

**Core capabilities:** a bindable OKLch token set with hex references, a two-typeface system (Instrument Serif + Cairo), sharp-cornered editorial component frames, art-directed dusk photographic plates, and a data-driven applied UI kit.

## Product context

Created in the "Your Core Visual System Should Be" project and preserved as the "professional" design system. The governing brief (`brand-spec.md`) binds the direction: **gold is the material, teal is the accent**, editorial restraint with one serif headline per frame, cinematic dusk photographic treatment, and a confident local voice ("down to the waterline"). Provenance is documented in `context/provenance.md`; source handoff metadata in `context/source-context.md`.

## Source & context references

| Reference | Path |
|---|---|
| Source handoff metadata | `context/source-context.md` |
| Provenance & derivation | `context/provenance.md` |
| Client master style prompt | `brand-spec.md` |
| Canonical source artifact | `south-florida-elevated-carousel.html` |
| Source render | `preview.png` |

## Package contents

| Path | What it is |
|---|---|
| `DESIGN.md` | Authoritative visual system (theme, color, type, spacing, layout, components, motion, voice, anti-patterns) |
| `colors_and_type.css` | Bindable OKLch tokens + concrete hex references + type / layout variables |
| `SKILL.md` | Discoverable skill package for generating on-brand artifacts |
| `fonts/` | Font loading contract (Instrument Serif + Cairo via Google Fonts CDN) |

### Preserved source examples & assets

- **`south-florida-elevated-carousel.html`** — preserved verbatim at the root (with `.artifact.json` manifest). The 5-frame carousel is the definitive implementation reference; keep it intact, never strip it to a stub.
- **`assets/`** — real source-derived assets: `sfe-wordmark-mark.svg`, `sfe-wordmark.svg`, `skyline-coversheet.svg`, `sfe-palette.svg`, plus the shipped "MP × Elevated" brand logo set (`sfe-symbol.png`, `sfe-lockup-transparent-light.png`, `sfe-lockup-transparent-dark.png`), and monochrome lockup concepts in `logo-concepts/` (see `assets/README.md`).

### build/ — runtime hooks

- `build/lib/sfe-common.css` — component CSS distilled exactly from the source carousel (masthead, chips, rails/slugs, keyline + grain, dusk plates, focus ring).
- `build/lib/sfe-components.js` — bootstraps the wordmark mark and index marks.
- `build/runtime-hooks.json` — machine-readable manifest of marks, labels, and hook paths.

### preview/ — review cards

Focused review surfaces that visibly load the preserved files:

| Card | Path |
|---|---|
| Color tokens | `preview/colors.html`, `preview/colors-primary.html` |
| Typography specimens | `preview/typography-specimens.html` |
| Spacing, radius, rhythm | `preview/spacing-tokens.html` |
| Components & marks | `preview/components-buttons.html` |
| Brand assets | `preview/brand-assets.html` (loads `assets/*`) |
| Applied UI surface | `preview/applied-ui.html` |

### ui_kits/app/ — applied interface kit

- `ui_kits/app/index.html` — composed cardinal interface (loads `../../colors_and_type.css` + `components/`).
- `ui_kits/app/pillars.html`, `showcase.html` — applied editorial surfaces.
- `ui_kits/app/components/app.css` + `brand-config.js` — modular app chrome and shared data.
- `ui_kits/app/README.md` — how to reuse the kit.

## Preview manifest

Concrete review cards generated under `preview/` — reviewers and future agents can inspect them directly:

| Card | Path | What to check |
|---|---|---|
| Color tokens · primary | `preview/colors-primary.html` | OKLch palette + semantic roles + state pairs |
| Color tokens | `preview/colors.html` | Alias of the primary color card |
| Themes · light/dark kits | `preview/themes-light-dark.html` | Semantic role tokens remapped for the onyx night + ivory editorial kits |
| Typography specimens | `preview/typography-specimens.html` | Two-face scale, letter-spacing, emphasis voice |
| Spacing & radius | `preview/spacing-tokens.html` | Spacing scale, sharp-corner radius rule, layout rhythm |
| Components & marks | `preview/components-buttons.html` | Wordmark, chips, rails, actions, dusk plate |
| Brand assets | `preview/brand-assets.html` | Preserved `assets/*` files load live |
| Applied UI | `preview/applied-ui.html` | Tokens composed onto a real interface surface |

## Reuse workflow

1. **Bind tokens** — import `colors_and_type.css` (or paste its `:root`) into your first `<style>`; load the fonts. Components consume the **semantic role tokens** (`--surface-1`, `--text-primary`, `--action`, `--mark`, `--border-subtle`, `--focus-ring`), so the whole surface remaps when you apply `data-theme="light"` / `.light`.
2. **Read the rules** — follow `DESIGN.md` (sharp corners, gold/teal discipline, one serif headline, dusk plates, anti-patterns, accessibility contract).
3. **Reuse source** — pull component CSS from `build/lib/sfe-common.css` and assets from `assets/`.
4. **Compose UI** — import `ui_kits/app/components/*` for product surfaces, or reuse the whole kit. For a product UI, set semantic surfaces on `body` and build chrome from role tokens so the light kit comes for free.

## Review workflow

1. Open the **color** card (`preview/colors-primary.html`) to sanity-check the palette.
2. Open **typography** (`preview/typography-specimens.html`) for the two-face hierarchy.
3. Open **applied UI** (`preview/applied-ui.html`) and `ui_kits/app/index.html` to see the tokens composed.
4. Open **brand-assets** (`preview/brand-assets.html`) to verify preserved files load.
5. Cross-check behavior against the preserved source carousel.
