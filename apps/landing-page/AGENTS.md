# apps/landing-page/AGENTS.md

Follow the root `AGENTS.md` and `apps/AGENTS.md` first. This file only
records module-level boundaries for `apps/landing-page/`.

## Purpose

`apps/landing-page` is a stand-alone static Astro site that renders
the Open Design marketing surface in the **Atelier Zero** style and
ships a public plugin library plus compatibility/detail catalog pages for
repository skills, design templates, design systems, craft principles, and
legacy live-artifact templates.

Tightly coupled with:

- Design template: `design-templates/open-design-landing/` — agent workflow + the source-of-truth
  `example.html` known-good rendering for the homepage hero.
- Design system: `design-systems/atelier-zero/DESIGN.md` — token spec.
- Image assets: `design-templates/open-design-landing/assets/*.png` are uploaded to
  Cloudflare R2 (`open-design-static`) and served through
  `static.open-design.ai` with Image Resizing (`format=auto`). Do not
  commit local mirrored PNGs into `apps/landing-page/public/assets/`.

## What it is

- Astro static output. Its catalog route groups are:
  - `/` — Atelier Zero homepage (`app/pages/index.astro`).
  - `/plugins/` — primary public discovery hub, with `/plugins/templates/`,
    `/plugins/skills/`, `/plugins/systems/`, `/plugins/craft/`, and plugin
    detail/search/preview routes. The hub reads bundled manifests from
    `plugins/_official/` and mirrors the in-app plugin taxonomy.
  - Direct `/skills/`, `/systems/`, `/craft/`, and `/templates/` catalog,
    facet, and detail routes remain for compatibility and deep links. The
    template catalog is primarily `design-templates/*/SKILL.md`; legacy
    `templates/live-artifacts/*/README.md` entries remain compatibility records.
- Content sources are **never** mirrored into this app. Astro content
  collections (`app/content.config.ts`) glob the canonical Markdown
  bundles in the repo root at build time. When a contributor adds or
  edits a `SKILL.md`/`DESIGN.md` or plugin manifest, the next build picks it up — no
  intermediate "register your skill here" step.
- The shaped data layer lives in `app/_lib/catalog.ts`. Page templates
  import shaped records from there and never re-parse Markdown in JSX.
- React is used only at build time (`renderToStaticMarkup`) for
  `app/page.tsx` and the shared `Header`. The output ships
  CDN-ready HTML/CSS plus a small inline enhancement script;
  no React runtime ships to browsers.
- All styles split between `app/globals.css` (homepage, kept in
  lockstep with `design-templates/open-design-landing/example.html`) and
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
- Not a CMS. Content authors edit canonical sources in `skills/`,
  `design-templates/`, `design-systems/`, `craft/`,
  `templates/live-artifacts/`, or `plugins/` at the repo root; the landing
  page rebuilds against those sources and ships to Cloudflare Pages.

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
  labs pills, selected-work fractions, and footer Library all derive
  from the same call so a fresh content edit can never publish
  contradictory totals. The homepage `<meta name="description">` is
  intentionally scenario-focused and no longer states catalog totals, so
  it is not a count-backed surface; `getHomeSeo()` still accepts the
  counts and its `{skills}`/`{systems}` substitution stays as a no-op
  hook, so if the description ever surfaces a count again it must route
  through `getCatalogCounts()`.
- When the canonical `design-templates/open-design-landing/example.html`
  changes, the corresponding section JSX in `app/page.tsx` and rules
  in `app/globals.css` must be updated to match. Those two files are
  kept in lockstep; the rest of the landing-page sources are not.
- Content-collection schemas in `app/content.config.ts` stay loose
  (`passthrough()`). Validation lives at render time so vendored
  upstream Markdown (e.g., `guizang-ppt`) doesn't break the build
  when an author uses a slightly different `od:` key.

## Deploy contract (staging → manual production)

Deploys are split across **two Cloudflare Pages projects** so a merge to
`main` can never publish to the live site on its own:

- Production project `open-design-landing` → `open-design.ai`.
- Staging project `open-design-landing-staging` → `staging.open-design.ai`.

The safety gate is project separation: only the manual production workflow
ever names the production project.

- `.github/workflows/landing-page-staging.yml` runs on push to `main` and
  deploys to the **staging project** (`open-design-landing-staging`,
  `staging.open-design.ai`).
- `.github/workflows/landing-page-production.yml` is **manual**
  (`workflow_dispatch`) and is the only workflow that names the production
  project (`open-design-landing`, `open-design.ai`). Gate it with required
  reviewers on the GitHub `production` environment.
- `.github/workflows/landing-page-ci.yml` runs on PRs: it validates the build
  and, for same-repo branches, deploys a per-PR preview into the staging
  project (`--branch=pr-<number>` →
  `pr-<number>.open-design-landing-staging.pages.dev`) and comments the URL.

The staging workflow triggers when **any** of these change:

- `apps/landing-page/**`
- `design-templates/open-design-landing/**`
- `design-templates/**`
- `skills/**`
- `design-systems/**`
- `craft/**`
- `templates/**`
- `plugins/**`
- `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- the workflow files themselves

A push that only edits a catalog source or bundled plugin manifest MUST trigger
the staging workflow. If it does not, the `paths:` filter has drifted from the
build-time readers and the staged site will fall behind silently.

## Common commands

```bash
pnpm --filter @open-design/landing-page dev          # http://127.0.0.1:17574
pnpm --filter @open-design/landing-page typecheck
pnpm --filter @open-design/landing-page previews     # render thumbnails
pnpm --filter @open-design/landing-page build        # static export → out/
```

## When to update this app

- Added/edited a skill, design template, `DESIGN.md`, craft principle,
  live-artifact compatibility template, or bundled plugin manifest at the
  repo root → no landing-page edit required; CI
  rebuilds and re-renders thumbnails on the next push to `main`.
- Adding a new top-level route group (e.g. `/playbooks/`) → add an
  Astro page directory under `app/pages/`, a content collection in
  `app/content.config.ts`, a shaping function in `app/_lib/catalog.ts`,
  and route entries that match the existing index/detail/facet pattern.
- New section added to the canonical landing page → port it into
  `app/page.tsx` and `app/globals.css` keeping lockstep with
  `design-templates/open-design-landing/example.html`.
- Brand re-keying for a non-Open-Design tenant → fork the app, update
  copy, swap PNGs. Do not parameterize this app for multi-tenancy.
