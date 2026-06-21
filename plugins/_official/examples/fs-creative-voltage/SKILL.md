---
name: fs-creative-voltage
description: "Creative Voltage decks: retro-modern electric blue × deep navy split panels, neon yellow badges, halftone dot textures, and script flourishes on a fixed 1920×1080 stage that scales to any viewport. Syne + Space Mono + Yellowtail. Single-file, zero-dependency HTML."
triggers:
  - "creative voltage"
  - "electric blue slides"
  - "neon yellow deck"
  - "halftone slides"
  - "retro modern deck"
  - "创意伏特"
od:
  mode: deck
  surface: web
  category: slides
  upstream: "https://github.com/zarazhangrui/frontend-slides"
  preview:
    type: html
    entry: example.html
  example_prompt: "Use the Creative Voltage theme to turn my content into a single-file HTML deck: electric blue × deep navy split panels, neon yellow badges, halftone dot textures, script flourishes, Syne + Space Mono typography, on a fixed 1920×1080 stage with keyboard navigation and hash routing. Start from example.html and replace only the content — keep the design system."
  example_prompt_i18n:
    zh-CN: "用「创意伏特」主题把我的内容做成单文件 HTML 幻灯片：电光蓝 × 深海军撞色分割版面、荧光黄徽章、halftone 网点纹理、script 手写点缀，Syne + Space Mono 字体，固定 1920×1080 舞台等比缩放、键盘导航 + hash 路由。从 example.html 出发只替换内容，保留设计系统。"
---

# Creative Voltage (fs-creative-voltage)

A locked single-theme deck plugin derived from the **Creative Voltage** preset (section 3 of `STYLE_PRESETS.md`) in the MIT-licensed [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides). Vibe: bold, creative, energetic, retro-modern — a retro poster shop wired to a power grid.

**Start from `example.html` in this plugin folder. It is the proven seed: copy its stage CSS, slide shell chrome, signature-device CSS, and the entire `SlidePresentation` controller script verbatim, then replace only the slide content. Do not rewrite the stage system, the navigation script, or the design tokens. Do not introduce any colors or fonts outside this spec.**

## Locked design tokens (`:root` — reproduce exactly)

```css
:root {
    --stage-bg: #10101f;              /* letterbox behind the stage */
    --slide-bg: #1a1a2e;              /* default slide background */

    --bg-primary: #0066ff;            /* electric blue panel */
    --bg-primary-deep: #0052cc;       /* blue gradient stop */
    --bg-dark: #1a1a2e;               /* deep navy panel */
    --bg-dark-2: #23234a;             /* lifted navy card */
    --accent-neon: #d4ff00;           /* neon yellow badge/highlight */
    --accent-neon-soft: rgba(212, 255, 0, 0.14);

    --text-light: #ffffff;
    --text-dim: rgba(255, 255, 255, 0.64);
    --text-faint: rgba(255, 255, 255, 0.34);
    --text-on-neon: #1a1a2e;          /* navy text on neon yellow */
    --line: rgba(255, 255, 255, 0.18);
    --line-blue: rgba(255, 255, 255, 0.28);

    --font-display: 'Syne', sans-serif;       /* 700/800, uppercase headlines */
    --font-mono: 'Space Mono', monospace;     /* 400/700, body + labels + chrome */
    --font-script: 'Yellowtail', cursive;     /* script flourishes only */
    --title-size: 138px;
    --h2-size: 88px;
    --subtitle-size: 32px;
    --body-size: 27px;
    --label-size: 20px;

    --slide-pad: 96px;

    --ease-volt: cubic-bezier(0.16, 1, 0.3, 1);   /* the one signature easing */
    --duration-normal: 0.7s;
}
```

Google Fonts (the only external reference allowed):
`https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Yellowtail&display=swap`

**Forbidden:** any color outside the token table; Inter / Roboto / Arial / system display fonts; purple gradients; generic indigo `#6366f1`; rounded-corner glassmorphism. Neon yellow is an accent, never a slide background.

## Fixed 16:9 stage — NON-NEGOTIABLE scaling system

- Every deck is authored on a fixed **1920×1080** canvas: `.deck-viewport` (fills the window) wraps `.deck-stage` (1920×1080, `transform-origin: 0 0`).
- JavaScript scales the whole stage uniformly: `factor = min(innerWidth/1920, innerHeight/1080)`, then `transform: translate(x, y) scale(factor)` to center with letterbox/pillarbox; re-run on `resize`.
- Never reflow slide content per device. No responsive breakpoints inside slides. All measurements are fixed px at the 1920×1080 design size.
- Include the full viewport-base block from the seed `<style>` (stage, slide stacking, print, `prefers-reduced-motion`).
- Slide switching toggles `.active` / `.visible` classes flipping `visibility` / `opacity` / `pointer-events` — **never `display: none`**.

## Slide shell chrome (every slide)

- `<section class="slide">` directly inside `.deck-stage`; ~10 slides per deck — split content into more slides rather than shrinking type.
- `.slide-no` top-left: Space Mono 700, neon yellow, format `NN / VOLT`.
- `.crumbs` top-right: uppercase mono breadcrumbs; active section in neon (`.on`).
- `.baseline` bottom: 2px rule with uppercase mono caption left and `NN / 10` right.
- `.deck-controls` page counter is fixed-positioned **outside** the scaled stage.

## Signature devices (the theme's identity — use them, don't invent new ones)

1. **Split panels** — `.panel-blue` (46% width, `linear-gradient(160deg, #0066ff, #0052cc)`) against the deep navy base; `.panel-blue.right` mirrors it. Covers, dividers, quotes, and closings lean on this two-tone split.
2. **Halftone dot texture** — `.halftone`: pure CSS `radial-gradient(circle, rgba(255,255,255,.30) 2.2px, transparent 2.9px)` on a `22px` grid, faded out with a `mask-image` linear gradient (`.fade` or inline masks). `.halftone.neon` swaps the dots to `rgba(212,255,0,.45)`. Place one halftone patch per slide, in a corner.
3. **Neon badges** — `.badge`: neon yellow block, navy mono uppercase text, `rotate(-2deg)`, hard offset shadow `6px 6px 0 rgba(0,0,0,.35)`. Sticker energy.
4. **Script flourishes** — `.script` (Yellowtail) in neon yellow, used for one emphasized word inside a headline or a signature line; often `rotate(-2deg/-3deg)`. Never for body text.
5. **Ghost numerals** — `.ghost-num`: transparent fill with `-webkit-text-stroke: 4px var(--accent-neon)` for giant section-divider characters.

## Layout masters (compose every deck from these — all present in the seed)

| Master | Seed slide | Notes |
| ------ | ---------- | ----- |
| Cover (split blue/dark) | 1 | badge + giant Syne title + script tagline left; mono metadata + neon rule right |
| Agenda | 2 | rows with neon mono index, Syne uppercase name, dim mono hint |
| Section divider | 3 | giant ghost numeral on blue panel + badge + intro paragraph |
| Bullets | 4 | max 3-4 items: rotated neon tick (inline SVG) + Syne heading + mono support line |
| Big stat | 5 | one oversized neon Syne number (≈480px) + side note column |
| Principle grid | 6 | 2×2 cards on `--bg-dark-2`, one `.hot` card on electric blue, inline SVG icons stroked `#d4ff00` |
| CSS bar chart | 7 | `scaleY`-animated bars (navy / blue / neon for the hero bar), mono values + labels, no chart libraries |
| Quote | 8 | Syne quote with neon `<em>`, Yellowtail attribution, narrow blue panel right |
| Comparison | 9 | navy "before" column (× markers) vs blue "after" column (→ markers, neon tag) |
| Closing | 10 | badge + giant title ending in a script word + mono contact links with inline SVG icons |

## Motion

- Entrances via `.reveal` elements that transition when the slide gains `.visible`; stagger with `transition-delay` steps of ~0.1s (`nth-child` rules in the seed).
- Chart bars animate `transform: scaleY(0 → 1)` from `transform-origin: bottom` with per-bar delays.
- One signature easing only: `cubic-bezier(0.16, 1, 0.3, 1)`. Animate only `transform` and `opacity`. `prefers-reduced-motion` support is mandatory (in the base CSS).

## Navigation runtime (keep the seed's script verbatim)

- Keyboard: `←`/`→`, `↑`/`↓`, `Space`, `PageUp`/`PageDown`, `Home`/`End`.
- Hash routing: current slide mirrored to `#/<index>`; deep links and `hashchange` restore the slide.
- Mouse wheel (debounced ~650ms) and touch swipe (≥40px threshold).

## Output contract

- One self-contained `.html` file: all CSS and JS inline, no build step, no external JS libraries, no CDN scripts; Google Fonts link is the only external reference.
- Icons are inline SVG stroked in `#d4ff00` (or `#1a1a2e` on neon ticks). No remote images; halftone patterns, gradients, and panels are the visual language.
- No scrolling, no overflow, no overlapping text panels. Comment each section `/* === SECTION NAME === */`.
- CSS gotcha: never negate CSS functions directly (`-clamp()` is silently ignored) — use `calc(-1 * clamp(...))`.

## Attribution

Theme tokens and the fixed-stage model come from the upstream MIT-licensed [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides) (© 2025 Zara Zhang), Creative Voltage preset. The LICENSE file ships in this plugin folder; keep it in place when redistributing.
