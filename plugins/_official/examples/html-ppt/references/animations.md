# Animations catalog

All animations live in `assets/animations/animations.css`. Apply them by
adding `class="anim-<name>"` OR `data-anim="<name>"` to any element
(`runtime.js` re-triggers `data-anim` elements whenever a slide becomes
active, so you get the entry effect every time you navigate onto the slide).

Open `templates/animation-showcase.html` to browse all of them — one slide
per animation, auto-playing on slide enter. Press **A** on any slide to cycle
a random animation on the current page.

## Directional fades

| name | effect | use for |
|---|---|---|
| `fade-up` | Translate from +32 px, fade. | Default for paragraph + card entry. |
| `fade-down` | Translate from -32 px, fade. | Headers / banners / callouts. |
| `fade-left` | Translate from -40 px. | Left column in a two-column layout. |
| `fade-right` | Translate from +40 px. | Right column in a two-column layout. |

## Dramatic entries

| name | effect | use for |
|---|---|---|
| `rise-in` | +60 px rise + blur-off. | Slide titles, hero headlines. |
| `drop-in` | -60 px drop + slight scale. | Banners, alert bars. |
| `zoom-pop` | Scale 0.6 → 1.04 → 1. | Buttons, stat numbers, CTAs. |
| `blur-in` | 18 px blur clears. | Cover page reveal. |
| `glitch-in` | Clip-path steps + jitter. | Tech / cyber / error states. |

## Text effects

| name | effect | use for |
|---|---|---|
| `typewriter` | Monospace-like type reveal. | One-liners, slogans. |
| `neon-glow` | Cyclic text-shadow pulse. | Terminal-green / dracula themes. |
| `shimmer-sweep` | White sheen passes across. | Metallic buttons, premium cards. |
| `gradient-flow` | Infinite horizontal gradient slide. | Brand wordmarks. |

## Lists & numbers

| name | effect | use for |
|---|---|---|
| `stagger-list` | Children rise-in one-by-one. | Any `<ul>` or `.grid`. |
| `counter-up` | Number ticks 0 → target. | KPI, stat-highlight pages. |

Counter markup:
```html
<span class="counter" data-to="1248">0</span>
```

## SVG / geometry

| name | effect | use for |
|---|---|---|
| `path-draw` | Strokes draw themselves. | Lines, arrows, diagrams. |
| `morph-shape` | Path `d` morph. | Background shapes. |

Put `class="anim-path-draw"` on `<svg>`; every path/line/circle inside gets drawn.

## 3D & perspective

| name | effect | use for |
|---|---|---|
| `parallax-tilt` | Hover → 3D tilt. | Hero cards, product shots. |
| `card-flip-3d` | Y-axis 90° flip. | Before/after reveal. |
| `cube-rotate-3d` | Rotate in from a cube side. | Section dividers. |
| `page-turn-3d` | Left-hinge page turn. | Editorial / story flows. |
| `perspective-zoom` | Pull from -400 Z. | Cover openings. |

## Ambient / continuous

| name | effect | use for |
|---|---|---|
| `marquee-scroll` | Infinite horizontal loop. | Client logo strips. |
| `kenburns` | 14 s slow zoom on images. | Hero backgrounds. |
| `confetti-burst` | Pseudo-element sparkle burst. | Thanks / win pages. |
| `spotlight` | Circular clip-path reveal. | Big reveal moments. |
| `ripple-reveal` | Corner-origin ripple reveal. | Section transitions. |

## Respecting motion preferences

All animations are disabled automatically when
`prefers-reduced-motion: reduce` is set. Do not override this.

## Tips

- Prefer `data-anim="..."` over `class="anim-..."` so that the runtime
  re-triggers the animation whenever the slide becomes active.
- Use at most 1-2 distinct animation types on a single slide. Mixing 5 looks
  messy.
- Stagger lists + a single hero entry = clean rhythm.
- For counter-up, pair with `stat-highlight.html` or `kpi-grid.html`.

## FX (canvas)

CSS animations are fire-and-forget entry effects. **FX** are live, continuously
running canvas/DOM effects that start when their slide becomes active and stop
when it leaves. They are loaded by `assets/animations/fx-runtime.js`, which
dynamically pulls every module under `assets/animations/fx/*.js` and watches
`.slide.is-active` to run lifecycle.

Add to any page:
```html
<script src="../assets/animations/fx-runtime.js"></script>
```

Then drop one of these into any slide:
```html
<div data-fx="particle-burst" style="width:100%;height:360px;"></div>
```

The container just needs a size — the FX auto-sizes a canvas to fit with
`ResizeObserver` + DPR correction. Colors read your theme (`--accent`,
`--accent-2`, `--ok`, `--warn`, `--danger`).

| name | effect | use case | trigger |
|---|---|---|---|
| `particle-burst` | Particles explode from center, gravity + fade, re-bursts every 2.5s. | Reveal moments, stat pages. | `<div data-fx="particle-burst">` |
| `confetti-cannon` | Colored rotating rects arcing from both bottom corners. | Thank you / success pages. | `<div data-fx="confetti-cannon">` |
| `firework` | Rockets from bottom explode into colored sparks, continuous. | Celebration, launch slides. | `<div data-fx="firework">` |
| `starfield` | 3D perspective starfield flying outward. | Sci-fi / deep space backgrounds. | `<div data-fx="starfield">` |
| `matrix-rain` | Falling green katakana + hex columns. | Cyber / security / data theme. | `<div data-fx="matrix-rain">` |
| `knowledge-graph` | Force-directed graph, 28 labeled nodes, ~50 edges, live physics. | Knowledge / RAG / graph slides. | `<div data-fx="knowledge-graph">` |
| `neural-net` | 4-6-6-3 feedforward net with pulses traveling along edges. | ML / model architecture slides. | `<div data-fx="neural-net">` |
| `constellation` | Drifting points, linked when within 150 px, opacity by distance. | Ambient hero backgrounds. | `<div data-fx="constellation">` |
| `orbit-ring` | 5 concentric rings with dots at different speeds, radial glow. | System / planet / layered concepts. | `<div data-fx="orbit-ring">` |
| `galaxy-swirl` | Logarithmic spiral of ~800 particles, slow rotation. | Cover pages, intros. | `<div data-fx="galaxy-swirl">` |
| `word-cascade` | Words fall from top, pile up at bottom. | Vocabulary / concept cloud slides. | `<div data-fx="word-cascade">` |
| `letter-explode` | Heading letters fly in from random directions, loops every ~4.5s. | Big titles, hero text. | `<div data-fx="letter-explode" data-fx-text-value="EXPLODE">` |
| `chain-react` | 8 circles with a domino pulse wave traveling across. | Pipeline / sequential flow. | `<div data-fx="chain-react">` |
| `magnetic-field` | Particles travel bezier/sin curves leaving trails. | Energy / flow / abstract. | `<div data-fx="magnetic-field">` |
| `data-stream` | Rows of scrolling hex/binary text, cyberpunk. | Data, API, security. | `<div data-fx="data-stream">` |
| `gradient-blob` | 4 drifting blurred radial gradients (additive). | Soft hero backgrounds. | `<div data-fx="gradient-blob">` |
| `sparkle-trail` | Pointer-driven sparkle emitter (auto-wiggles if idle). | Interactive reveal, hover canvases. | `<div data-fx="sparkle-trail">` |
| `shockwave` | Expanding rings from center on loop. | Impact, launch, alert. | `<div data-fx="shockwave">` |
| `typewriter-multi` | 3 lines typing concurrently with blinking block cursors (DOM). | Terminal, agent boot log. | `<div data-fx="typewriter-multi" data-fx-line1="> boot...">` |
| `counter-explosion` | Number counts 0 → target, bursts particles, resets after 4s. | KPI reveal, record highs. | `<div data-fx="counter-explosion" data-fx-to="2400">` |

FX tips:
- One FX per slide is almost always enough. Mix with regular CSS `data-anim`
  effects for layered polish.
- The container needs an explicit size (height) — the canvas fills 100%.
- Every module respects theme custom properties. Set `--accent` / `--accent-2`
  on the slide or element to recolor on the fly.
- Lifecycle is automatic: entering a slide starts the FX, leaving stops it and
  frees the canvas. You can also call `window.__hpxReinit(el)` manually.
