# apps/landing-page/AGENTS.md

Follow the root `AGENTS.md` and `apps/AGENTS.md` first. This file only
records module-level boundaries for `apps/landing-page/`.

## Purpose

`apps/landing-page` is a stand-alone static Astro site that renders
the Open Design marketing surface in the **Atelier Zero** style and
ships per-facet catalog pages for every skill, design system, craft
principle, and live-artifact template in the repo root.

Tightly coupled with:

- Skill: `skills/open-design-landing/` — agent workflow + the source-of-truth
  `example.html` known-good rendering for the homepage hero.
- Design system: `design-systems/atelier-zero/DESIGN.md` — token spec.
- Image assets: `skills/open-design-landing/assets/*.png` are uploaded to
  Cloudflare R2 (`open-design-static`) and served through
  `static.open-design.ai` with Image Resizing (`format=auto`). Do not
  commit local mirrored PNGs into `apps/landing-page/public/assets/`.

## What it is

- Astro static output. The site has multiple route groups:
  - `/` — Atelier Zero homepage (`app/pages/index.astro`).
  - `/skills/` + `/skills/<slug>/` — every `SKILL.md` in `skills/`.
  - `/skills/mode/<slug>/` and `/skills/scenario/<slug>/` —
    facet pages generated from frontmatter via `getStaticPaths`.
  - `/systems/` + `/systems/<slug>/` + `/systems/category/<slug>/` —
    every `DESIGN.md` in `design-systems/`.
  - `/craft/` + `/craft/<slug>/` — every `*.md` in `craft/`.
  - `/templates/` + `/templates/<slug>/` — Live Artifacts in
    `templates/live-artifacts/` plus skills with `od.mode: template`.
- Content sources are **never** mirrored into this app. Astro content
  collections (`app/content.config.ts`) glob the canonical Markdown
  bundles in the repo root at build time. When a contributor adds or
  edits a `SKILL.md`/`DESIGN.md`, the next build picks it up — no
  intermediate "register your skill here" step.
- The shaped data layer lives in `app/_lib/catalog.ts`. Page templates
  import shaped records from there and never re-parse Markdown in JSX.
- React is used only at build time (`renderToStaticMarkup`) for
  `app/page.tsx` and the shared `Header`. The output ships
  CDN-ready HTML/CSS plus a small inline enhancement script;
  no React runtime ships to browsers.
- All styles split between `app/globals.css` (homepage, kept in
  lockstep with `skills/open-design-landing/example.html`) and
  `app/sub-pages.css` (catalog/facet/detail pages).
- All page imagery is referenced through `app/image-assets.ts`, which
  builds Cloudflare Image Resizing URLs for the R2 originals.
- Per-skill / per-template thumbnails are rendered offline by
  `scripts/generate-previews.ts` (Playwright). Output lives in
  `public/previews/<bucket>/<slug>.<ext>` and is **gitignored** — CI
  regenerates on every deploy. The script preserves the actual file
  extension so a future sharp/webp post-processor will work without
  touching the data layer.

## What it is NOT

- Not part of `apps/web`. The web app is the product surface; the
  landing page is a marketing surface. They share design tokens but
  not state, routes, or runtime.
- Not connected to `apps/daemon`. There is no `/api`, no `/artifacts`,
  no `/frames` — no proxy to set up.
- Not a CMS. Content authors edit Markdown in `skills/`,
  `design-systems/`, `craft/`, or `templates/live-artifacts/` at the
  repo root; the landing page rebuilds against those globs and ships
  to Cloudflare Pages automatically.

## Boundary constraints

- Must remain a static Astro output.
- Must not import from `@open-design/web`, `@open-design/daemon`,
  `@open-design/desktop`, `@open-design/sidecar*`, or
  `@open-design/contracts`. Those are product runtime concerns.
- Must not introduce a `src/` shell — keep all source under `app/`.
  Component bundles live in `app/_components/<name>.{tsx,astro}`.
- Must not depend on any non-Google web font.
- Visible "X skills" / "Y systems" claims must read from
  `getCatalogCounts()` — never hardcode. The hero, capabilities cards,
  labs pills, selected-work fractions, footer Library, and
  `<meta name="description">` all derive from the same call so a
  fresh content edit can never publish contradictory totals.
- When the canonical `skills/open-design-landing/example.html`
  changes, the corresponding section JSX in `app/page.tsx` and rules
  in `app/globals.css` must be updated to match. Those two files are
  kept in lockstep; the rest of the landing-page sources are not.
- Content-collection schemas in `app/content.config.ts` stay loose
  (`passthrough()`). Validation lives at render time so vendored
  upstream Markdown (e.g., `guizang-ppt`) doesn't break the build
  when an author uses a slightly different `od:` key.

## Auto-deploy contract

`.github/workflows/landing-page-deploy.yml` runs on push to `main`
when **any** of these change:

- `apps/landing-page/**`
- `skills/**`
- `design-systems/**`
- `craft/**`
- `templates/**`
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- the workflow file itself

A push that only edits a SKILL.md MUST trigger this workflow — if it
doesn't, the `paths:` filter has drifted from the content-collection
glob and the published site will fall behind silently. Treat that as
a regression, not a feature.

## Common commands

```bash
pnpm --filter @open-design/landing-page dev          # http://127.0.0.1:17574
pnpm --filter @open-design/landing-page typecheck
pnpm --filter @open-design/landing-page previews     # render thumbnails
pnpm --filter @open-design/landing-page build        # static export → out/
```

## When to update this app

- Added/edited a `SKILL.md`, `DESIGN.md`, craft `*.md`, or live-artifact
  template at the repo root → no landing-page edit required; CI
  rebuilds and re-renders thumbnails on the next push to `main`.
- Adding a new top-level route group (e.g. `/playbooks/`) → add an
  Astro page directory under `app/pages/`, a content collection in
  `app/content.config.ts`, a shaping function in `app/_lib/catalog.ts`,
  and route entries that match the existing index/detail/facet pattern.
- New section added to the canonical landing page → port it into
  `app/page.tsx` and `app/globals.css` keeping lockstep with
  `skills/open-design-landing/example.html`.
- Brand re-keying for a non-Open-Design tenant → fork the app, update
  copy, swap PNGs. Do not parameterize this app for multi-tenancy.
