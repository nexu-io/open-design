# apps/landing-page/AGENTS.md

Follow the root `AGENTS.md` and `apps/AGENTS.md` first. This file only
records module-level boundaries for `apps/landing-page/`.

## Purpose

`apps/landing-page` is a stand-alone static Astro site that renders
the canonical Open Design marketing page in the **Atelier Zero** style.
It is the deployable counterpart to:

- Skill: `skills/open-design-landing/` — agent workflow + the source-of-truth
  `example.html` known-good rendering.
- Design system: `design-systems/atelier-zero/DESIGN.md` — token spec.
- Image assets: `skills/open-design-landing/assets/*.png` are uploaded to
  Cloudflare R2 (`open-design-static`) and served through
  `static.open-design.ai` with Image Resizing (`format=auto`). Do not
  commit local mirrored PNGs into `apps/landing-page/public/assets/`.

## What it is

- Astro static output. The route lives at `app/pages/index.astro` and
  uses React only at build time (`renderToStaticMarkup`) for the existing
  `app/page.tsx` component. The generated page is CDN-ready HTML/CSS plus
  a small inline enhancement script; no React runtime ships to browsers.
- `astro.config.ts` always uses `output: 'static'` and emits to `out/`
  so it can be served by any CDN (Vercel, Cloudflare Pages, the daemon's
  static fallback) without a Node runtime.
- All styles live in `app/globals.css`. Class names match the Atelier
  Zero CSS in the canonical example so visual parity is one-to-one.
- All page imagery is referenced through `app/image-assets.ts`, which builds
  Cloudflare Image Resizing URLs for the R2 originals.

## What it is NOT

- Not part of `apps/web`. The web app is the product surface; the
  landing page is a marketing surface. They share design tokens but
  not state, routes, or runtime.
- Not connected to `apps/daemon`. There is no `/api`, no `/artifacts`,
  no `/frames` — no proxy to set up.
- Not multi-page. There is exactly one route (`/`) that renders the
  full landing page. If you need a second page, add it as a sibling
  Astro page route.

## Boundary constraints

- Must remain a static Astro output.
- Must not import from `@open-design/web`, `@open-design/daemon`,
  `@open-design/desktop`, `@open-design/sidecar*`, or
  `@open-design/contracts`. Those are product runtime concerns.
- Must not introduce a `src/` shell — keep all source under
  `app/`. If a component grows beyond ~80 lines, extract it to
  `app/_components/<name>.tsx`.
- Must not depend on any non-Google web font.
- When the canonical `skills/open-design-landing/example.html` changes,
  the corresponding section JSX in `app/page.tsx` and rules in
  `app/globals.css` must be updated to match. The two files are kept
  in lockstep.

## Common commands

```bash
pnpm --filter @open-design/landing-page dev          # http://127.0.0.1:17574
pnpm --filter @open-design/landing-page build        # static export → out/
pnpm --filter @open-design/landing-page typecheck
```

## When to update this app

- New section added to the canonical landing page → port it here.
- Asset regeneration in the skill → re-mirror PNGs into
  `public/assets/`.
- Brand re-keying for a non-Open-Design tenant → fork the app, update
  copy, swap PNGs. Do not parameterize this app for multi-tenancy.
