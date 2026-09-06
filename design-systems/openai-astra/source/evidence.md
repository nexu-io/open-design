# OpenAI Astra Source Evidence

## Source Scope

This package is hand-authored from a locally saved copy of the public
GPT-6 Astra announcement page (`openai.com`), captured on 2026-09-05
(HTML plus 25 stylesheets and 108 script chunks). Values below are read
from that capture. The particle choreography (stages, thresholds, star
counts) was measured through the open-source Starflow engine
(<https://github.com/Win-Hao/starflow>, MIT), which re-implements the
page's particle system from those chunks.

This package is an independent distillation of publicly visible CSS and
is not affiliated with or endorsed by OpenAI. No fonts, logos, images, or
scripts from the page are included.

## Observed Values

### Theme and canvas

- `<body class="text-p1 text-primary-100 dark bg-background">` — the page is forced dark.
- Dark block: `--color-background: #000`, `--color-primary-100: #fff`,
  `--color-primary-60: #fff9`, `--color-primary-44: #ffffff70`,
  `--color-primary-12: #fff3`, `--color-primary-4: #ffffff1f`,
  `--color-primary-2: #ffffff14`, `--color-tertiary-100: #1f1f1f`,
  `--color-secondary-solid-4: #0a0a0a`.
- `.AstraHero-module__layout { color: #fafafa }`; scroll label `#fafafa99`;
  static shape target `#fafafa4d`; label text-shadow `0 0 1.5rem #fafafa14`.
- Ambient backdrop: `radial-gradient(ellipse farthest-corner at center,
  transparent 0%, color-mix(in srgb, var(--astra-ambient-color, #23435f) 6.25%, transparent) 25%,
  color-mix(… 25%, transparent) 50%, …)`; inline
  `--astra-ambient-color: #23435F; --astra-ambient-opacity: 0.55; --astra-ambient-fade-duration: 5.5s`.
- Backdrop element inline style: `background: rgb(0, 0, 0)`.

### Typography

- `--font-sans: "OpenAI Sans", "OpenAI Sans Variable Scripts", sans-serif`
  with `--font-sans--font-feature-settings: "liga" on, "calt" on`.
- `--font-mono: "SF Mono", Consolas, "Liberation Mono", ui-monospace, monospace`.
- Fluid scale (`--type-*`, 375px → 1440px):
  h1 2rem → 4rem, line 2.28rem → 4rem, track -0.03em, weight 500;
  h2 2rem → 3rem, line 2.28rem → 3.48rem, track -0.03em → -0.01em, weight 500;
  h3 1.5rem → 1.875rem, track -0.01em, weight 500;
  h4 1.25rem → 1.375rem; h5 1rem → 1.125rem;
  p1 1.0625rem / 1.75rem, track -0.01em, weight 400;
  p2 and caption .875rem / 1.435rem; cta .875rem / .875rem weight 500;
  meta .875rem / 1.225rem weight 500; nav-header .8125rem weight 500.
- Hero labels ("GPT" left, "Astra" right) use `.text-h1`; the section title
  uses `.text-h2 … max-w-250 text-balance`; sub-sections use `.text-h3`;
  benchmark headings use `.text-h5`.

### Components

- Primary CTA (41 instances): `text-cta min-h-10 inline-flex items-center
  justify-center gap-1 px-4 py-3 rounded-full transition-colors ease-curve-d
  duration-medium hover:bg-primary-12 focus-visible:outline-primary-12`.
  Glass variant adds `bg-primary-4`; solid variant uses `bg-secondary-100`.
- Icon buttons: `rounded-full size-4|6|8|10 ease-curve-a duration-200`.
- Replay control: `width/height 2.25rem; background #ffffff26; color #fffc;
  border-radius 9999px; hover background #ffffff40, color #ffffffe6;
  transition color .15s, background-color .15s; position bottom .75rem`.
- Focus: `outline .125rem solid #ffffffb3; outline-offset -.25rem` on the drag surface.
- Shadow utility seen on the page: `shadow-[0_18px_60px_rgb(0_0_0/0.08)]`.
- Radii: `--radius-sm .375rem`, `--radius-md .5rem`, `--radius-lg .625rem`,
  `--radius-2xl 1rem`, `--radius-full 9999px`.

### Layout

- `--gutter-size: max(20px, calc((var(--document-width) - 68rem) / 2))` → 1088px content width.
- `--max-width-container-desktop: 90rem`; `--media-gutter-size` uses 1728px for full-bleed media.
- Grid: `grid-cols-12 gap-x-(--grid-gap) [--grid-gap:8px] md:[--grid-gap:16px] lg:[--grid-gap:24px]`.
- Labels inset `clamp(1.25rem, 4vw, 3.5rem)`; `--spacing: .25rem`.
- Shape cue: `max-width 576px; height calc(0.8 * var(--astra-viewport-height, 100vh))`.
- Copy column between the star rails: 676px (Starflow measurement of the
  page's `contentBounds`).

### Motion

- Named curves: `curve-a cubic-bezier(0,0,1,1)`, `curve-b (.25,0,.75,1)`,
  `curve-c (0,.56,.46,1)`, `curve-d (.6,0,.4,1)`, `curve-e (.5,1.25,0,1)`;
  `--transition-duration-short .2s`, `medium .3s`, `long .4s`;
  `--default-transition-duration .15s`.
- Label letter reveal: `animation … var(--astra-label-duration) cubic-bezier(.22,1,.36,1)
  var(--astra-label-delay) forwards`; inline delays 0.85s–1.25s, duration 1s, shift ±44px.
- Title parallax: `.titleParallax { translate: 0 var(--astra-title-parallax-y) }`, inline 120px.
- Ambient fade-in 5.5s to opacity .55 (matches the engine's 5.5s intro).
- Reduced motion: `[data-astra-static=true]` swaps the canvas for
  `/images/astra/{cursor,openai-knot}-particles.webp` posters and disables drag.

### Particle choreography (via Starflow)

- 4,000 stars: 5 galaxy arms × (220 strong + 170 weak) × density 4; 96-star core cluster.
- Palette `#6DCBF4 #7AB1FE #F87915 #FA994C #F5F6FB` quantised 36 / 16 / 12 / 10 / 26%.
- Star size 2.05; flow speed 0.8; bloom intensity 0.7, threshold 0.08, radius 0.72;
  ACES filmic tone mapping; lens flare intensity 0.28.
- Disperse distance 800px of scroll = progress 1. Tilt to −52° about X, peaking at 75%.
- Scatter: 72% of stars pushed to the rails flanking the content column; brightness to 18%,
  dim stars to 45% size.
- Shape cues form over the first 36% of entry and dissolve between 50% and 86%; the last cue holds.
- Path shapes: cursor (single closed path) and the six-arc knot; auto-rotate 0.42 rad on formation.

## Not Included

No fonts (OpenAI Sans is proprietary), no logos or brand marks, no images,
no scripts from the page. The knot and cursor path data ship with the
Starflow engine, not with this package.
