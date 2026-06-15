# Checklist

## P0

- `assets/template.html` exists and opens directly from disk without a build step.
- `example.html` is self-contained (inline CSS + script) and renders in an iframe without a build step.
- Lives under `design-templates/fable-5-liquid-landing/` (renderable template registry).
- No bundled `.js` files — `pnpm guard` rejects residual JavaScript.
- SKILL frontmatter uses `od.mode: template`, `od.scenario: marketing`, and `od.outputs.primary: index.html`.
- Copy pills read `modelId` / `sitePrompt` from `#seed-data` JSON (`application/json`), not raw placeholders in JS strings or attributes.
- Showcase film grain uses `.section-noise::before` at low opacity — never `opacity` on the whole `<section>`.
- Liquid-glass UI: `.liquid-glass` with backdrop blur and gradient border mask.
- Hero uses full-screen looping video with rAF crossfade (`FadingVideo` pattern), not CSS opacity transitions on `<video>`.
- Showcase row uses infinite CSS marquee with pause-on-hover.
- Monochrome palette only: black base, white text, muted white/70 secondary.
- Display headings use Instrument Serif italic.
- No sandbox-hostile APIs (`localStorage`, `sessionStorage`, `alert`, `confirm`, `prompt`, `window.open`).
- Clipboard copy buttons wrap `navigator.clipboard.writeText` in try/catch.

## P1

- Hero bottom seam gradient transitions into black sections.
- Section backdrops include faint graph grid and/or film grain.
- Stat cards, partner cards, and showcase tiles use hover lift (translateY).
- Navbar includes product name and primary CTA.
- Meta description and favicon (`./open-design.png`) are set.
- Videos use CDN or remote URLs — no bundled `.mp4` in the template directory.

## P2

- Seven-section layout when building the full React path: Hero, Capabilities, Showcase, Timeline, Safety, Partners, Pricing.
- Open Design featured in partners and footer credit when product-relevant.
- `base: './'` in Vite config for portable relative asset paths.
- Marquee showcase duplicates items for seamless -50% translate loop.
