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
`@ant-design/colors`' `generate()` (the canonical blue ladder reproduces
bit-for-bit; see `__tests__/palette.test.ts`).

## Public API

Import from the barrel `@/lib/brand/engine`:

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
} from "@/lib/brand/engine";
```

`BrandSystem` is `{ slug, seed, themes: { default, dark, compact }, files }`
where `files` is a `{ relativePath → contents }` map ready to write, return over
HTTP, or inspect.

## How an agent drives it — one command

### CLI

```bash
# From an already-synthesized brand kit (offline, deterministic):
pnpm brand:build path/to/brand.json [outDir]

# Straight from a site URL (deterministic prefetch → seed → system; no LLM):
pnpm brand:build https://stripe.com [outDir]
```

Default `outDir` is `./out/<slug>`. The command prints the file tree and the
path to `index.html`.

> Node 24 strips TS types but does not add `.ts` to the engine's extensionless
> relative imports, so `pnpm brand:build` re-spawns node with
> `scripts/ts-resolve-hook.mjs` registered (a dependency-free ESM resolver shim
> that maps `./palette` → `./palette.ts`). No source or build changes required.

### HTTP API

`POST /api/brand/build` (Node runtime):

```jsonc
// from a URL
{ "url": "https://stripe.com", "write": false }

// from a brand kit, also writing to disk
{ "brand": { /* Brand */ }, "write": true, "outDir": "./out/acme" }
```

Response:

```jsonc
{
  "slug": "stripe",
  "themes": ["default", "dark", "compact"],
  "files": { "seed.json": "…", "variables.css": "…", "index.html": "…", … },
  "writtenTo": "./out/stripe"   // only when write: true
}
```

Binary logo assets (URL path) come back as `*.b64` string entries and are
decoded to real bytes by `writeBrandSystem` / `write: true`.

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
