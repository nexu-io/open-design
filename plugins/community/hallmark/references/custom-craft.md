# Custom craft — how to hand-build hero artwork

This file is loaded only when an enrichment archetype requires construction (Tier A or B in [`hero-enrichment.md`](hero-enrichment.md)). It tells you *which technique* to reach for at *which complexity tier* — and what each looks like done well.

**The principle.** Custom-built artwork is the design. Library-picked artwork is a shortcut, and a good audience reads it as one. The skill's job is to make custom-build the path of least resistance — by knowing when CSS alone suffices, when SVG is right, when JS-driven animation earns its bundle cost, and when (rarely) Three.js is justified.

The 2026 canon is set by Lynn Fisher (*A Single Div*), Diana Smith (*Pure CSS Francine* / *Lace*), Rauno Freiberg, Paco Coursey, Jhey Tompkins, and Adam Argyle. The thread: constraint-driven, hand-crafted, performance-respecting, accessibility-embedded. Use the platform; don't fight it.

---

## Tier A · Pure CSS art

**When.** Geometric forms, gradient compositions, glyph-style decoration. Bars, dots, badges, icons, simple loaves, sliced spheres, abstract logos. Anything that's *shapes plus colour*.

**Effort:** high (mastering `clip-path` + `conic-gradient` takes practice).
**Payoff:** very high (zero bytes, browser-native, infinitely scalable).
**Bundle cost:** zero.

### The CSS-art toolkit (2026)

| Feature | Use for | Browser support |
| --- | --- | --- |
| `clip-path: polygon(…)` | Multi-sided shapes (chevrons, hexagons, custom blobs) | 96 %+ |
| `clip-path: path("M …")` | Curved hand-drawn outlines from an SVG path | 88 %+ (use feature query for fallback) |
| `conic-gradient()` | Pie segments, radial dividers, mandalas, rotating colour wheels | 96 %+ |
| `radial-gradient()` | Spheres, glow points, sun-burst centres | 100 % |
| `linear-gradient()` (multi-stop) | Composite shapes via stacked stops | 100 % |
| `mask-image: url(…)` | Layered transparency, morphing shapes, text-clip effects | 95 %+ |
| `mix-blend-mode` | Compositional depth (multiply, overlay, screen) | 95 %+ |
| `filter` (drop-shadow, blur, hue-rotate) | Soft shadows on irregular shapes (uses the alpha channel) | 100 % |
| `@property` | Smoothly-interpolated custom properties (colour, length, angle) | 88 %+ |
| `animation-timeline: scroll() / view()` | Declarative scroll-linked motion, hardware-composited | Baseline 2025 (88 %) |

### A worked example — the bakery loaf as a single div

```html
<div class="loaf" aria-label="A loaf of bread"></div>
```

```css
@property --rise {
  syntax: "<length>";
  initial-value: 0px;
  inherits: false;
}

.loaf {
  width: 12rem;
  height: 7rem;
  background:
    /* crust ridges */
    radial-gradient(ellipse at 30% 70%, transparent 1.2rem, var(--color-ink-2) 1.21rem 1.3rem, transparent 1.31rem),
    radial-gradient(ellipse at 50% 70%, transparent 1.2rem, var(--color-ink-2) 1.21rem 1.3rem, transparent 1.31rem),
    radial-gradient(ellipse at 70% 70%, transparent 1.2rem, var(--color-ink-2) 1.21rem 1.3rem, transparent 1.31rem),
    /* loaf body */
    linear-gradient(180deg, oklch(78% 0.12 60), oklch(64% 0.16 50));
  border-radius: 50% 50% 14% 14% / 70% 70% 30% 30%;
  transform: translateY(var(--rise));
  animation: rise 6s ease-in-out infinite alternate;
  box-shadow: 0 1.2rem 1.5rem -0.8rem oklch(20% 0.02 60 / 0.18);
}

@keyframes rise {
  to { --rise: -4px; }   /* the breath: 4px over 6s, the loaf is alive */
}

@media (prefers-reduced-motion: reduce) {
  .loaf { animation: none; --rise: 0px; }
}
```

That's a hand-built bakery centerpiece in about 25 lines, no asset, animated, accessible. The next bakery brief Hallmark touches gets a *different* loaf because the variation knobs change (rise distance, loaf curvature, crust-ridge spacing, colour stop).

### Anti-patterns of CSS art

- **Recalculating `clip-path` on every scroll.** Tanks framerate. Animate `transform` instead, or use `animation-timeline` (which composites off-thread).
- **Over-nested wrapper divs.** A pure-CSS illustration should fit in one to three elements. Eight nested wrappers reads as "I gave up structuring this".
- **No reduced-motion fallback.** Every animation must have a `@media (prefers-reduced-motion: reduce)` block.
- **Random gradient noise.** If the gradient looks generated rather than designed, redo it. Three stops max for any single gradient layer.

---

## Tier B · Hand-built SVG illustration

**When.** Complex illustrations CSS can't express cleanly — characters, articulated figures, organic curves, multi-element scenes. The bakery's full storefront, the studio mascot, the workflow diagram with seven labelled paths.

**Effort:** medium (designing in Figma + cleaning the export).
**Payoff:** very high (scales infinitely, compresses to < 10 KB, animatable).
**Bundle cost:** the file size of the SVG — typically 4–15 KB inline.

### Pipeline

1. **Design in Figma.** Use a component system (constraints, variants). Keep paths as paths — don't rasterise. Name layers; the export honours them.
2. **Export as SVG.** Figma's export is decent. Set "Outline strokes" only if you need stroke-as-fill animation; otherwise keep them strokes.
3. **Run through [SVGOMG](https://jakearchibald.github.io/svgomg/)** — removes Figma metadata, unnecessary `<defs>`, redundant transforms. 30–60 % size reduction is typical.
4. **Inline the result in HTML** for animation, or save as `static.svg` and reference via `<img>` or CSS `background-image` for caching.
5. **Animate declaratively** — CSS keyframes on `<path d="">` (Chrome, Edge, Safari support the `d` property), `@property`-driven attribute interpolation, or [Motion](https://motion.dev) for orchestrated sequences.

### A hand-built SVG with declarative animation

```html
<svg viewBox="0 0 200 100" class="loaf-svg" aria-label="A loaf of bread">
  <path class="loaf-body" d="M 20 70 Q 100 10 180 70 L 180 90 L 20 90 Z" />
  <path class="loaf-score" d="M 60 50 L 90 30 M 100 45 L 130 25 M 140 50 L 165 35" />
</svg>
```

```css
@property --bake {
  syntax: "<percentage>";
  initial-value: 0%;
  inherits: false;
}

.loaf-body {
  fill: oklch(72% 0.14 50);
  filter: drop-shadow(0 4px 8px oklch(20% 0.02 60 / 0.16));
  transform-origin: 100px 90px;
  animation: bake 6s ease-in-out infinite alternate;
}

.loaf-score {
  stroke: oklch(38% 0.1 35);
  stroke-width: 2;
  stroke-linecap: round;
  fill: none;
  stroke-dasharray: 0 200;
  animation: score 1.6s 0.8s var(--ease-out) forwards;
}

@keyframes bake  { to { transform: scaleY(calc(1 + var(--bake) * 0.005)); --bake: 1%; } }
@keyframes score { to { stroke-dasharray: 200 200; } }

@media (prefers-reduced-motion: reduce) {
  .loaf-body, .loaf-score { animation: none; }
  .loaf-score { stroke-dasharray: 200 200; }
}
```

The breath comes from `@property --bake` interpolating a percentage; the score-marks draw themselves once on load via `stroke-dasharray`. No JS. 18 lines of CSS. Reduced-motion-safe.

### Animation choices for SVG in 2026

| Method | When | Verdict |
| --- | --- | --- |
| **CSS keyframes on `<path d>`** | Path-morphing where shapes have matching anchor counts | Use this. Composable with the rest of CSS, GPU-friendly. |
| **`@property` + animated CSS variables** | Smoothly interpolated colour, length, angle, percentage | Use this. Declarative, predictable. |
| **CSS keyframes on `transform` / `opacity`** | Position, rotation, fade | Always. Hardware-accelerated, no layout thrash. |
| **`stroke-dasharray` draw-on** | Hand-drawn line illustrations that build themselves | Yes. Cheap and effective. |
| **SMIL `<animate>`** | Legacy SVG-only attribute animation | Acceptable in 2026 but deprioritised — CSS is composable, SMIL isn't. Use only if CSS can't express it. |
| **JS via Motion / GSAP** | Multi-element orchestrated entrances, scroll-scrubbing, complex timelines | Use when CSS isn't enough — see Tier C below. |

### Anti-patterns of hand-built SVG

- **Shipping the raw Figma export.** Always run SVGOMG. Untouched exports carry hundreds of bytes of metadata, unused `<defs>`, doubled transforms.
- **A 300-KB SVG.** Anything over 30 KB is suspicious. Most well-built illustrations sit at 4–15 KB. If yours is 100 KB+, you have hidden raster embeds or thousands of unnecessary path commands.
- **`viewBox` cruft.** A `viewBox="0 0 24 24"` for an icon, or `viewBox="0 0 1920 1080"` for a hero illustration. Match the box to the design's bounds, no padding, no extra space.
- **Animation with linear easing on everything.** Add ease-out (or a cubic-bezier specified to two decimals); the difference is the difference between "moving" and "alive".
- **Path morphing between shapes with mismatched anchor counts.** Browsers will interpolate, but the result jitters. Either match anchor counts, or use `clip-path` instead.

---

## Tier C · Declarative animation (CSS-first, JS-when-needed)

The 2026 declarative animation canon. Use the platform first; reach for JS only when the platform can't express the orchestration.

### CSS keyframes + `@property`

`@property` (Baseline 2024, ~88 % support by 2026) lets you define typed custom properties — `<color>`, `<length>`, `<angle>`, `<number>`, `<percentage>` — that the browser knows how to interpolate smoothly. Without `@property`, animating a custom property steps from start to end with no in-between values.

```css
@property --hue {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

@keyframes spin-hue { to { --hue: 360deg; } }

.gradient-loop {
  background: conic-gradient(from var(--hue),
    oklch(70% 0.2 var(--hue)),
    oklch(70% 0.2 calc(var(--hue) + 120deg)),
    oklch(70% 0.2 calc(var(--hue) + 240deg)));
  animation: spin-hue 8s linear infinite;
}
```

That's a smoothly hue-rotating conic gradient. No JS, no library, GPU-composited.

### Scroll-driven animations

`animation-timeline: scroll()` and `view()` reached **Baseline October 2025** — production-ready in Chromium, Edge, Safari Tech Preview, Firefox behind a flag. The rule: progressive enhancement.

```css
@supports (animation-timeline: view()) {
  .reveal {
    animation: fade-up linear both;
    animation-timeline: view();
    animation-range: entry 0% cover 30%;
  }
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

If the browser supports it, the element animates as it enters the viewport. If not, the element is just there — no JavaScript, no library, no IntersectionObserver. The CSS Scroll-Driven Animations community is the canonical reference: [scroll-driven-animations.style](https://scroll-driven-animations.style/).

### View Transitions API

Production-ready in 2026 (Baseline October 2025 for same-document; Chromium 126+, Safari 18.2+ for cross-document). The Hallmark landing page already uses it for theme transitions:

```js
function applyTheme(theme) {
  const apply = () => { /* mutate the DOM */ };
  if (!reduced && document.startViewTransition) {
    document.startViewTransition(apply);
  } else {
    apply();
  }
}
```

The browser handles the cross-fade. No animation libraries needed for state changes.

### Motion / GSAP / friends — when each earns its bundle

| Library | When | Bundle | Verdict |
| --- | --- | --- | --- |
| **[Motion](https://motion.dev)** (`motion/react`, `motion`) | Orchestrated multi-element entrances in React (variants, `AnimatePresence`, viewport hooks). The default for React heroes in 2026. | 4 KB base + 2 KB React = 6 KB. Web Animations API–backed. | First reach for React. |
| **[GSAP](https://gsap.com)** (free since the Webflow partnership) | Ambitious timelines, scrub-on-scroll, SVG path-morphing across mismatched anchors. Hero sequences with 20+ elements, multi-step narratives. | ~50 KB core; 100 KB+ with plugins (ScrollTrigger, Draggable). | Worth it when timelines are core. Overkill for a fade-in. |
| **AutoAnimate** | Trivial layout transitions in React (a list reflows, an element appears). | 2 KB. | Fine for what it does. |
| **Anime.js v4** | Lightweight stagger, simple animations, vanilla JS. | ~15 KB. | Acceptable; less common than Motion in 2026. |
| **Theatre.js** | Visual editor + code API for ambitious orchestration. Niche but powerful. | Heavy (~80 KB+). | Single-page interactive art only. |

**The decision rule:**

```
Single element, simple motion           → CSS keyframes / @property
Multiple elements, orchestrated entrance → Motion (React) or GSAP (vanilla / complex)
Scroll-progress-linked                   → animation-timeline (CSS) — or GSAP ScrollTrigger if complex
State change between two layouts         → View Transitions API
A list reflows in React                  → AutoAnimate
A complex hero narrative with scrubbing   → GSAP timeline + ScrollTrigger
```

Reaching for Motion for a single fade-in (4 KB for nothing) is the bundle-bloat tell. Reaching for GSAP for a list reflow (50 KB for nothing) is the same tell, louder.

### Anti-patterns of declarative animation

- **Animating `width`, `height`, `top`, `left`, `margin`, or `padding`** (causes layout thrash). Animate `transform` and `opacity` only — they composite on the GPU.
- **Linear easing on UI** (no subtlety; reads as "demo from a tutorial").
- **Bouncy elastic on hero entrances** (`cubic-bezier(0.34, 1.56, …)` and friends) — reserved for genuine physical interactions like drag-release.
- **Importing Motion or GSAP for one fade-in.** 50 KB for what `transition: opacity 400ms var(--ease-out)` does in zero bytes.
- **Scroll-fade-everything.** Every section fading in on scroll. The page never settles. Pick one orchestrated entrance on first load and let the rest *be there*.
- **Reveal animations with no `prefers-reduced-motion` fallback.** Every transform / animation must be guarded.

---

## Tier D · Three.js / WebGL / shaders

**When justified.** The 3D *is* the hero value — a rotating product the user can interact with, an interactive 3D playground, a generative art piece. Examples: Apple's product pages with interactive bottles / iPhones, Bruno Simon's portfolio, Vercel's WebGL hero galleries.

**When not.** A static spinning thing the user can't interact with. A bloom-overdosed shader background that "looks premium". A 5-MB model loaded eagerly on a marketing page.

**Performance budget.**
- < 100 draw calls
- < 2 MB JS + assets total
- < 6 s load time
- 60 fps target on mid-range mobile

**Stack.**
- React Three Fiber (R3F) for React projects — ergonomic, ~30 KB on top of Three.js
- Vanilla [Three.js](https://threejs.org) otherwise (~100–300 KB depending on features)
- Models: glTF 2.0 with Draco compression (20–50 % size reduction)
- Textures: KTX2 / Basis (much smaller than PNG/JPEG)

**Always include a non-WebGL fallback.** If the canvas fails to initialise (no WebGL2, GPU blacklisted, low-power mode), show a static poster image so the page still renders.

### Anti-patterns of Three.js / WebGL

- **Three.js for a stationary product.** No interaction = no justification. Use SVG or a still photograph.
- **Bloom + glow overdose.** Three or four post-processing passes that just make everything blurry. Pick one effect, dial it down to "barely visible".
- **5-MB models loaded eagerly.** Always lazy-load the geometry, show a poster while it streams in.
- **No fallback.** WebGL fails on ~5 % of devices; if the page is unusable for them, you've failed accessibility.
- **Generic procedural-noise shaders.** Looks like every other Three.js demo on the internet. Custom shaders earn their place; off-the-shelf Perlin noise rarely does.

---

## Tier E · Generated stills (Nanobanana / Recraft V4 / Midjourney)

When characters or specific scenes are needed and hand-build is uneconomical (the brief calls for a small mascot in five poses; the agency is selling a thing that needs an evocative atmospheric still).

| Model | Cost | Best for | Output |
| --- | --- | --- | --- |
| **[Nanobanana 2 / Gemini 2.5 Flash Image](https://ai.google.dev/gemini-api/docs/image-generation)** | $0.039 / image | Character consistency across multiple panels, fast iteration, brand-style adherence via reference images, infographics with text | PNG (transparent supported); no SVG, no animation |
| **[Recraft V4](https://www.recraft.ai/)** | ~$0.04 / image | **The only mainstream model with production-grade SVG output.** Logos, icons, illustrations that need to live in code and scale. | SVG + PNG |
| **[Midjourney v8](https://www.midjourney.com)** | ~$0.14 / image | Aesthetic beauty, artistic direction, atmospheric stills | PNG |
| **[Flux 2](https://blackforestlabs.ai/)** | ~$0.03 / image | Photorealism, skin / fabric / product detail | PNG |

### Discipline when generating

- **Always post-process.** Add grain, asymmetric crop, hand-drawn overlays, colour grading. Raw model output reads as AI 100 % of the time. The post-process is what makes it ours.
- **Use reference images** for brand consistency. Nanobanana's character-consistency feature is the differentiator vs. Midjourney; feed it your existing brand assets so generations stay on-style.
- **Stamp the model in the macrostructure comment** (`generated: nanobanana-2 · post-processed`). Future audits need to know provenance.
- **Verify the SynthID watermark** is present (Google's invisible AI-provenance marker).
- **Multi-frame animation isn't supported** by any of these models. Don't try to assemble keyframes into a Lottie loop — that's Tier F territory and almost always a worse outcome than a single still.

### Anti-patterns of generated stills

- **Symmetrical compositions.** Algorithmic; reads as AI. Crop asymmetrically.
- **Smooth-mesh-blob faces.** The 2024 "generic AI character" look. Avoid character-led stills if you can't get past this; or use Nanobanana's character-consistency feature with reference images and prompt heavily for asymmetry / imperfection.
- **Default lighting + blue-tinted backgrounds.** The generic AI tell. Specify brand-anchored colour and unusual lighting in the prompt.
- **Six fingers, doubled furniture, impossible rooms.** Less common than 2023, but still lurking. Always inspect.

---

## Tier F · Library illustrations + Lottie (last resort)

When budget and timeline force a shortcut. The catalogue is in [`assets.md`](assets.md) — Storyset, Humaaans, unDraw, IRA Design, LottieFiles. Even at this tier:

- **Customise.** Colour-swap to brand anchor hue. Crop or recompose. Don't ship the unmodified library look.
- **Avoid the giveaway poses.** Every team has seen "guy on laptop with floating speech bubble" a hundred times. Anything that screams "stock illustration" loses.

### Lottie specifically — last resort

**Use Lottie only when:**
- The motion is character-articulated (a five-frame mascot wave, a multi-joint walking cycle) and CSS / SVG can't reasonably express it
- You have a custom-commissioned Lottie that matches your brand
- File is < 2 MB
- Pause / resume support is wired
- `prefers-reduced-motion` fallback is a static keyframe

**Don't use Lottie for:**
- Spinning logo loops — use CSS `@keyframes rotate`
- Checkmark-draw confirmations — use SVG `stroke-dasharray`
- Loading spinners — use CSS conic-gradient + rotate
- Hover micro-interactions — use CSS transitions
- Hero centerpieces that could be hand-built — use Tier A or B

The Lottie Tell, version 2026: a generic LottieFiles pull where pure CSS would have built it stronger and lighter. The audit verb catches this.

---

## The bakery worked example, end-to-end

**Brief:** "Build a landing page for a small bakery in Lisbon."

**Step 2 (macrostructure):** Long Document — the bakery is a story-led brand, not a SaaS product.
**Step 3 (theme):** Linen — warm-paper, prose-led, intimate.
**Step 4 (enrichment):** E5 Custom Illustration Centerpiece. Tier B (hand-built SVG).

**The output:**

A 60-line SVG of a single loaf, three paths (crust + crumb + scoring marks), positioned to the right of the headline at 40 % column width. Animation: `@property --rise` interpolates a 4 px vertical lift over 6 s, ease-in-out, alternate. The score-marks draw themselves on first paint via `stroke-dasharray`. Reduced-motion: static loaf, no animation.

```css
/* Hallmark · macrostructure: Long Document
 * H5 hero: Letter (intimate salutation + 2-paragraph body)
 * enrichment: E5 Custom Illustration · craft: tier-B SVG (60 lines)
 * animation: @property --rise (6s, alternate) + stroke-dasharray draw-on
 * theme: Linen · accent: warm-amber ~3% · studied: no
 */
```

The next bakery brief Hallmark touches gets a *different* loaf — different curvature, different rise distance, different score pattern, possibly a different illustration entirely (a sourdough boule vs. a baguette vs. a flatbread). The variation knobs in [`hero-enrichment.md`](hero-enrichment.md) make sure of it.

---

## Recipe library

The bakery loaf above is one worked example. This library catalogues four more — each a small, complete, copy-paste-able recipe at Tier A or Tier B. Use them when the brief calls for the named subject; otherwise treat them as *technique references* (the workflow diagram's `stroke-dashoffset` flow is reusable; the mascot's blink-loop is reusable; etc.).

Each recipe ships with: a one-line description, full code, a "use when / avoid when" note, a `prefers-reduced-motion` fallback block, and a real-world inspiration line.

### Recipe 1 · Workflow / process diagram

Three labelled boxes connected by curved arrows. Slight asymmetric rotation (-1° on box one, +0.5° on box three) for hand-drawn feel. One arrow has an animated `stroke-dashoffset` flow suggesting data movement. Use case: feature page showing data flow, decision tree, or user journey steps.

```html
<svg class="flow" viewBox="0 0 720 200" role="img" aria-label="Data flow: input, process, output">
  <defs>
    <marker id="flow-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="currentColor" />
    </marker>
  </defs>

  <g class="flow__step flow__step--a">
    <rect class="flow__box" x="20"  y="55" width="160" height="90" rx="0" />
    <text class="flow__label" x="100" y="105" text-anchor="middle">Input</text>
  </g>

  <path class="flow__arrow flow__arrow--live" d="M 180 100 Q 220 80 260 100" marker-end="url(#flow-arrow)" />

  <g class="flow__step">
    <rect class="flow__box" x="260" y="55" width="200" height="90" rx="0" />
    <text class="flow__label" x="360" y="100" text-anchor="middle">Parse + Filter</text>
    <text class="flow__sub"   x="360" y="118" text-anchor="middle">small predicate language</text>
  </g>

  <path class="flow__arrow" d="M 460 100 Q 500 120 540 100" marker-end="url(#flow-arrow)" />

  <g class="flow__step flow__step--c">
    <rect class="flow__box" x="540" y="55" width="160" height="90" rx="0" />
    <text class="flow__label" x="620" y="105" text-anchor="middle">Output</text>
  </g>
</svg>
```

```css
@property --flow-dash {
  syntax: "<length>";
  initial-value: 0px;
  inherits: false;
}

.flow { width: 100%; max-width: 48rem; height: auto; display: block; margin: 0 auto; color: var(--color-ink); }
.flow__box   { fill: none; stroke: currentColor; stroke-width: 1.5; }
.flow__label { font-family: var(--font-display); font-size: 16px; fill: var(--color-ink); }
.flow__sub   { font-family: var(--font-mono); font-size: 11px; fill: var(--color-muted); }
.flow__step--a { transform: rotate(-1deg); transform-origin: 100px 100px; }
.flow__step--c { transform: rotate(0.5deg); transform-origin: 620px 100px; }
.flow__arrow { fill: none; stroke: var(--color-muted); stroke-width: 1.5; stroke-linecap: round; }
.flow__arrow--live {
  stroke: var(--color-accent);
  stroke-dasharray: 6 6;
  animation: flow 2.4s linear infinite;
}
@keyframes flow { to { stroke-dashoffset: -24; } }

@media (prefers-reduced-motion: reduce) {
  .flow__arrow--live { animation: none; stroke-dasharray: 0; }
}
```

**Use when** the brief is "show the user how data flows" — feature page, docs landing, technical-narrative section. **Avoid when** the diagram has more than five nodes (use Mermaid or a real graph layout) or when relationships are non-linear (this recipe assumes left-to-right flow).

*Inspiration:* Lynn Fisher's `lynnandtonic.com` `<rect>`-rotation experiments; Rauno Freiberg's `stroke-dashoffset` flows on rauno.me.

### Recipe 2 · Minimal-line mascot

A small SVG character — face only, ~120 × 120 px — that has personality without anthropomorphic uncanny-valley risk. Two ellipse eyes (with `@keyframes blink` 3s loop), a single quadratic-curve mouth, and two stem accents (hair / hat / horns / antennae). Pairs beside text.

```html
<figure class="mascot" aria-label="The Hallmark mascot — a face with two eyes and a small smile">
  <svg viewBox="0 0 120 130" class="mascot__svg">
    <circle class="mascot__head" cx="60" cy="60" r="42" />

    <ellipse class="mascot__eye mascot__eye--l" cx="46" cy="56" rx="4" ry="6" />
    <ellipse class="mascot__eye mascot__eye--r" cx="74" cy="56" rx="4" ry="6" />

    <path class="mascot__mouth" d="M 50 76 Q 60 84 70 76" />

    <path class="mascot__accent" d="M 32 22 Q 40 12 52 18" />
    <path class="mascot__accent" d="M 88 22 Q 80 12 68 18" />
  </svg>
</figure>
```

```css
.mascot { display: inline-block; width: 80px; height: 86px; margin: 0; vertical-align: -8px; }
.mascot__svg { width: 100%; height: 100%; color: var(--color-ink); }
.mascot__head { fill: color-mix(in oklch, var(--color-paper-2) 100%, var(--color-accent) 6%); stroke: var(--color-ink); stroke-width: 2; }
.mascot__eye  { fill: var(--color-ink); animation: blink 5s ease-in-out infinite; }
.mascot__eye--r { animation-delay: 80ms; }   /* one eye lags slightly — feels organic */
@keyframes blink {
  0%, 8%, 92%, 100% { ry: 6px; }
  12%, 14%          { ry: 0.8px; }
}
.mascot__mouth { fill: none; stroke: var(--color-ink); stroke-width: 1.6; stroke-linecap: round; }
.mascot__accent { fill: none; stroke: var(--color-accent); stroke-width: 1.2; opacity: 0.6; stroke-linecap: round; }

@media (hover: hover) and (pointer: fine) {
  .mascot:hover .mascot__head { fill: color-mix(in oklch, var(--color-paper-2) 100%, var(--color-accent) 12%); transition: fill 240ms cubic-bezier(0.16, 1, 0.3, 1); }
}

@media (prefers-reduced-motion: reduce) {
  .mascot__eye { animation: none; }
}
```

**Use when** a small product / studio / indie brand needs personality without the uncanny-valley risk of a generated character. **Avoid when** the mascot needs to be expressive across many states (use Rive instead — the @property route is for simple loops, not articulated emotion).

*Inspiration:* Are.na's reductive-aesthetic site mark; the Mailchimp Freddie family (single-colour confidence); Diana Smith's CSS-art portrait constraints.

### Recipe 3 · Three-tier architectural diagram

Browser → API → Database, drawn at ~16/9 with three labelled boxes and animated `stroke-dasharray` flow lines using `@property --flow-offset`. The data-flow lines pulse to suggest live traffic. Use case: a developer-tool landing page showing where the product fits in the stack.

```html
<svg class="arch" viewBox="0 0 320 180" role="img" aria-label="Three-tier architecture: browser, API, database">
  <g class="arch__tier">
    <rect x="14"  y="50" width="76" height="80" />
    <text x="52"  y="86" text-anchor="middle" class="arch__name">Browser</text>
    <text x="52"  y="104" text-anchor="middle" class="arch__sub">React / Next</text>
  </g>

  <line class="arch__flow" x1="90"  y1="90" x2="120" y2="90" />
  <text class="arch__hop"  x="105"  y="80" text-anchor="middle">HTTPS · OTLP</text>

  <g class="arch__tier arch__tier--mid">
    <rect x="120" y="50" width="80" height="80" />
    <text x="160" y="86" text-anchor="middle" class="arch__name">API</text>
    <text x="160" y="104" text-anchor="middle" class="arch__sub">Edge runtime</text>
  </g>

  <line class="arch__flow arch__flow--reverse" x1="200" y1="90" x2="230" y2="90" />
  <text class="arch__hop"  x="215"  y="80" text-anchor="middle">SQL · gRPC</text>

  <g class="arch__tier">
    <rect x="230" y="50" width="76" height="80" />
    <text x="268" y="86" text-anchor="middle" class="arch__name">Database</text>
    <text x="268" y="104" text-anchor="middle" class="arch__sub">Postgres + vec</text>
  </g>
</svg>
```

```css
@property --flow-offset {
  syntax: "<number>";
  initial-value: 0;
  inherits: false;
}

.arch { width: 100%; max-width: 48rem; height: auto; color: var(--color-ink); display: block; margin: 0 auto; }

.arch__tier rect {
  fill: var(--color-paper-2);
  stroke: var(--color-ink);
  stroke-width: 1.5;
}
.arch__tier--mid rect {
  fill: color-mix(in oklch, var(--color-paper-2) 100%, var(--color-accent) 8%);
  stroke: color-mix(in oklch, var(--color-accent) 60%, var(--color-ink));
}

.arch__name { font-family: var(--font-display); font-size: 11px; font-weight: 500; fill: var(--color-ink); }
.arch__sub  { font-family: var(--font-mono);    font-size: 8px;  fill: var(--color-muted); }
.arch__hop  { font-family: var(--font-mono);    font-size: 7px;  fill: var(--color-muted); letter-spacing: 0.04em; }

.arch__flow {
  stroke: var(--color-accent);
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-dasharray: 4 4;
  animation: arch-flow 1.6s linear infinite;
}
.arch__flow--reverse { animation-direction: reverse; }
@keyframes arch-flow { to { stroke-dashoffset: -8; } }

@media (prefers-reduced-motion: reduce) {
  .arch__flow { animation: none; stroke-dasharray: 0; }
}
```

**Use when** the brief is a developer-facing product that needs to show its position in a stack — observability tools, edge functions, ORMs, ingestion services. **Avoid when** the architecture has more than five tiers or non-linear topology (this recipe is for the "three-box flow" model only; for graph-like topologies, use a real diagram tool and embed an SVG export).

*Inspiration:* Vercel's network/edge diagrams; Diana Smith's structural precision in placing geometry.

### Recipe 4 · Botanical leaf flourish

A small (~40 × 80 px) hand-drawn sprig with two asymmetric leaves at +25° and -30° rotations. Leaf veins at 0.6 opacity. Sized to sit beside a headline as an inline accent. Pure SVG, no animation by default (the design is the stillness).

```html
<svg class="sprig" viewBox="0 0 40 80" aria-hidden="true">
  <path class="sprig__stem" d="M 20 76 Q 18 56 21 36 Q 22 22 20 8" />

  <g transform="translate(8 38) rotate(-25)">
    <ellipse class="sprig__leaf"  cx="0" cy="0" rx="6" ry="11" />
    <path     class="sprig__vein" d="M 0 -10 Q 1 0 0 10" />
  </g>

  <g transform="translate(28 52) rotate(30)">
    <ellipse class="sprig__leaf"  cx="0" cy="0" rx="6" ry="11" />
    <path     class="sprig__vein" d="M 0 -10 Q -1 0 0 10" />
  </g>

  <path class="sprig__stem" d="M 20 22 Q 16 19 13 22" />
</svg>
```

```css
.sprig {
  width: 32px;
  height: 64px;
  display: inline-block;
  vertical-align: -0.6em;
  margin-inline-end: 0.4em;
  color: var(--color-accent);
}

.sprig__stem  { fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; }
.sprig__leaf  { fill: none; stroke: currentColor; stroke-width: 1.4; }
.sprig__vein  { fill: none; stroke: currentColor; stroke-width: 0.9; opacity: 0.6; stroke-linecap: round; }

/* Use beside a headline */
h1.has-flourish { display: flex; align-items: baseline; gap: 0.4em; }
```

**Use when** the brief is a bakery, restaurant, café, boutique, herbalist, florist, atelier — anything where a hand-drawn signal of *care* fits the brand. **Avoid when** the brand is technical, brutalist, or quietly austere (the sprig adds warmth where the page wants restraint).

*Inspiration:* hand-drawn botanical assets in old broadsheet papers; restaurant menus from Lisbon and Tokyo; Lynn Fisher's constraint-driven simplicity (this recipe could have been *A Single Div* with cleverer clip-paths, but SVG is more legible at small scale).

---

### Cross-recipe techniques

What all four recipes share — the four habits of hand-built CSS/SVG illustration in 2026:

1. **`@property` for declarative interpolation.** Animating a typed custom property (`<length>`, `<number>`, `<angle>`, `<color>`) gives you GPU-composited animation with zero JS. The bakery loaf, the workflow flow line, the architectural data-flow, and the mascot's blink — all use it.
2. **Asymmetric `transform: rotate()` for hand-drawn feel.** The workflow boxes rotate at ±1°, the mascot's eyes have an 80 ms delay between them, the sprig's leaves rotate +25° / -30°. Symmetry reads as algorithmic; controlled asymmetry reads as drawn.
3. **Opacity layering for pencil/secondary detail.** The workflow's reverse arrow is `var(--color-muted)`; the architectural sub-labels are 60% opacity; the sprig veins are 0.6 opacity. The hierarchy of opacity is the hierarchy of attention.
4. **Mono labels grounding decorative work in function.** The architectural diagram's `arch__sub` text uses `var(--font-mono)` at 8 px. The workflow's "small predicate language" uses mono. Decorative work earns its place by being legible and accurate; mono signals that.

Use these recipes verbatim when they fit, or strip them for technique when the brief calls for something different. The point is that *every illustration on a Hallmark page is built, not picked.*

- **Reaching for Lottie when CSS would do.** The new tell. Build the loaf in pure CSS or hand-built SVG; the Lottie is the shortcut that costs you.
- **Importing 50 KB of GSAP for a single fade-in.** Use `transition: opacity 400ms var(--ease-out)`. Zero bytes.
- **Animating `width` or `height` for a "smooth resize".** Reflows the layout; use `transform: scale(...)` and `transform-origin`.
- **Three.js for a non-interactive rotation.** No interaction = no justification. Use SVG with `transform: rotate()` animated.
- **Untouched Figma export.** Run SVGOMG. Always.
- **Generated raster shipped raw.** Post-process. Grain, crop, colour grade. The raw output reads as AI.
- **Linear easing.** Add ease-out at minimum. The difference between "moving" and "alive".
