# brand engine

An Ant-Design-style brand engine: a brand collapses into a tiny **Seed**
(~20 fields), and a deterministic algorithm derives a whole style system, a
themed component kit, and finished products (landing / email / poster) from it.
Variants (light / dark / compact) are the *same* seed run through a different
algorithm — never hand-authored.

## Pipeline

```
  URL ──prefetch──▶ material ──seedFromMaterial──┐
                                                 ├─▶  Seed (SeedToken, ~20 fields)
  Brand kit ───────────────────seedFromBrand────┘
                                                 │
                              deriveTokens(seed, "default" | "dark" | "compact")
                                                 │
                                                 ▼
                                  DesignTokens  (the style system)
                  ┌──────────────────────┬──────────────────┬───────────────────┐
                  ▼                      ▼                  ▼                   ▼
            export                     kit              artifacts            (raw)
   tokens.json / variables.css   themed components   landing / email     primaryPalette
   theme.json (antd)             (var(--brand-*))    poster (HTML)        + 13 presets
```

Every downstream value traces back to the Seed via algorithm — nothing is
hand-typed. The 10-step color ladders are a faithful, dependency-free port of
`@ant-design/colors`' `generate()` (see `palette.ts`).

## Public API

Import from the barrel `./index.js` (the daemon has no `@/` path alias):

```ts
import {
  buildBrandSystem,   // Brand  → BrandSystem (offline)
  buildFromUrl,       // URL    → BrandSystem (one prefetch hop, no LLM)
  writeBrandSystem,   // BrandSystem + outDir → writes files to disk
  slugify,
  // lower-level building blocks
  deriveTokens, defaultSeed, seedFromBrand, seedFromMaterial,
  generate, presets,
  tokensToJson, tokensToCssVars, tokensToThemeJson,
  button, card, input, tag, alert, swatches, typeScale, renderKitPage,
  renderArtifact, renderArtifactGallery,
  // helpers + types
  cssVar, varRef, flattenTokens,
  type SeedToken, type ThemeAlgorithm, type DesignTokens, type BrandSystem,
} from "./index.js";
```

`BrandSystem` is `{ slug, seed, themes: { default, dark, compact }, files }`
where `files` is a `{ relativePath → contents }` map ready to write, return over
HTTP, or inspect.

## How an agent drives it

There is no dedicated build CLI for the engine. It is reached through the
daemon's brand endpoints and the `od brand` subcommands that call them:

```bash
od brand extract https://stripe.com   # reserve a brand + backing project
od brand preview <id>                 # re-render brand.html live during extraction
od brand finalize <id>                # register the kit as a design system
```

`od brand --help` lists every subcommand. `BRAND_USAGE` in
`apps/daemon/src/cli-help/brands-cli-help.ts` is the authoritative text.

### HTTP API

Brand extraction is served from `apps/daemon/src/brand-routes.ts`:

```
POST   /api/brands                       # reserve the brand, start extraction
GET    /api/brands                       # list
GET    /api/brands/:id                   # full detail (meta + brand + guide)
POST   /api/brands/:id/preview           # re-render from the current brand.json
POST   /api/brands/:id/finalize          # register the kit as a design system
POST   /api/brands/:id/extract-from-html # re-run against pre-captured HTML
POST   /api/brands/:id/cancel-extraction # stop the daemon-owned extraction
DELETE /api/brands/:id                   # remove brand + design system
```

Extraction is agent-driven and registers a real design system, so it does not
return a `BrandSystem` file bundle directly. The bundle is written to the
project's design-system directory by `finalize`.

## Produced files

| Path | What it is |
| --- | --- |
| `seed.json` | Generated snapshot of the effective SeedToken; persistent overrides belong in `brand.json.seed`. |
| `tokens.default.json` / `.dark.json` / `.compact.json` | Full derived DesignTokens per algorithm. |
| `variables.css` | `:root{}` (light) + `.dark{}` (dark) CSS custom properties. |
| `variables.dark.css` | Standalone `:root{}` for the dark theme. |
| `theme.json` | antd `ConfigProvider` theme (`{ token, algorithm }`). |
| `kit.html` / `kit.dark.html` | Themed component showcase. |
| `artifacts/landing.html` · `email.html` · `poster.html` | Finished products. |
| `index.html` | Gallery: file index + live iframe previews. |
| `BRAND-SYSTEM.md` | Human-readable summary + how to re-theme. |
| `logos/*` | (URL path only) downloaded logo candidates. |

## Recipes

**Change the brand color.** Set `seed.colorPrimary` or edit the `accent` color
role in the Brand. For registered brand projects, persist overrides in
`brand.json.seed`, then run `od brand finalize <brand-id>`. Do not edit
`system/seed.json` directly; finalize regenerates it. The 10-step palette, every
interaction state, the primary background/border, and every component referencing
`var(--brand-color-primary)` update together.

**Light → dark / compact.** Both are the same seed run through a different
algorithm. Load `variables.dark.css` (or add the `.dark` class) for dark;
`tokens.compact.json` tightens spacing & control heights while keeping colors
identical.

**Add a new artifact type.** `renderArtifact(kind, brand, tokens)` already
accepts every `AssetKind` (`landing | deck | poster | email | newsletter |
form`); kinds without a bespoke layout fall back to a sensible card+button page.
To ship a new kind in the bundle, add it to `ARTIFACT_KINDS` in `build.ts`. To
give it a bespoke layout, add a `renderXxx(brand, tokens)` and a `case` in
`renderArtifact`.
