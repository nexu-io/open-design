# Hero enrichment — when, what, and how much

This file is loaded after the macrostructure pick (Step 3 in the design flow), when you reach Step 4: "Decide on hero enrichment." It tells you whether to enrich the hero with media at all, and if so, which archetype and how to build it.

**The promise.** Enrichment is an option, not a default. A typographic-only hero is *always* an acceptable answer. Visual enrichment — demo video, illustration, mockup, animated loop, abstract background, photography — has to *earn its place*. If the hero can be deleted of its enrichment and still works, the enrichment earned its place. If the hero collapses without the enrichment, you propped weak typography on a crutch.

**The bar.** Better nothing than bad something. A page that ships a quiet, well-set typographic hero is always better than a page that ships a stock illustration, a Lottie checkmark, an aurora-blob background, or a generic centred demo video block.

---

## Image-need detection — does this brief need imagery at all?

Before picking an enrichment tier, decide whether the brief actually wants imagery. The default is **typography-only**. Match the brief against this table; act on the *first* row that fires:

| Brief signal (any of these words / intents) | Image strategy |
| --- | --- |
| e-commerce, shop, store, product catalogue, brand, fashion, lookbook | Real product photos required — placeholder until user provides |
| photography, portfolio, gallery, artist | Imagery *is* the page — placeholder until user provides |
| food, restaurant, menu, dish, coffee, wine, recipe | Hero photo + product crops — placeholder until user provides |
| team, staff, "about us", portraits, hiring, careers | Portrait crops — placeholder until user provides |
| travel, hotel, destination, real estate, listing, property | Cover photo + tile photos — placeholder until user provides |
| news, blog, magazine, journal, publication | Feature image per post — placeholder until user provides |
| SaaS landing, manifesto, agency, studio, atmospheric, slow-and-editorial | **Kit-led.** Use Hallmark imagery kit (washes, transparent abstracts, ornaments) — see [`assets.md` § Placeholder strategy](assets.md) and [`imagery-kit.md`](imagery-kit.md). |
| API, docs, changelog, CLI, library, dev-tool, SDK, package | **No imagery.** Typography-only. Code blocks if needed. |
| editorial, essay, letter, foundry, type-specimen, broadside | **No imagery.** Display typography is the design. |
| (all other / vague / unspecified) | **Default: typography-only.** When in doubt, no images. |

Rules:

- When the user has attached an image asset (or `.hallmark/preflight.json` cached one), use it. Never overwrite with a placeholder.
- When the brief is genuinely ambiguous between a "needs photos" row and a "no imagery" row, ask one short question: *"Will you have product photos, or should I leave swappable placeholders?"*
- A placeholder must look like a placeholder, not like a confident decision. The skill refuses to invent stock photos as if they were the final design.
- Imagery rows above don't override genre overlays. Modern-minimal genre still suppresses decorative kit imagery (gate in `imagery-kit.md` anti-patterns).

The hierarchy below picks the tier *after* this gate decides imagery is needed at all. Skipping this gate is what produces "blob illustration on every page" outputs — exactly the AI-default Hallmark refuses.

---

## The enrichment hierarchy

Reach for the highest tier the brief lets you ship in the time you have. Skipping tiers is the new tell.

| Tier | What | When |
| --- | --- | --- |
| **0 · Typography only** | No enrichment. Display, lede, optional CTA. | Always acceptable. The strongest fail-state. |
| **A · Custom-built CSS art** | Pure-CSS shapes, gradients, clip-paths, no asset, zero dependency. | Geometric shapes, gradient compositions, glyph-style decoration. |
| **B · Hand-built SVG** | Designed in Figma, optimised, animated declaratively. | Illustrations more complex than CSS handles cleanly — a loaf, a mascot, a workflow diagram. |
| **C · Generated illustration** | Nanobanana / Recraft V4 / Midjourney, with provenance + post-processing. | Characters or specific scenes that hand-build can't economically reach. Always post-processed. |
| **D · Library illustration** | Storyset / Humaaans / unDraw, customised with brand colours. | When budget and timeline force a shortcut — and even then, never unmodified. |
| **E · Lottie animation** | LAST RESORT. Only when complex character motion can't be hand-built. | Articulated figures, multi-frame mascot loops. Never for "spinning logo" or "checkmark draw" — those are CSS. |

**The discipline.** If you can do it in tier A, do it in tier A. If A can't reach it, try B. Only drop to C when characters demand it. Only D when the brief is explicit about "fast and cheap". Only E when E is genuinely the only option. Reaching for E because it's familiar — and many AI tools do — is the signature of a templated page.

See [`custom-craft.md`](custom-craft.md) for *how* to build at tiers A and B. See [`assets.md`](assets.md) for the catalogue of sources at tiers C, D, and E.

---

## Eyeball or ask — the decision protocol

Two paths to picking enrichment:

```
If the brief contains explicit visual cues, pick from this map:

  • "demo", "show how it works", "product tour"           → E1 / E2 demo video
  • "platform", "tool", "infra", "dashboard", "developer" → E3 / E4 mockup
  • "shop", "store", "menu", "products", "items"          → E8 photography (or F6 product grid)
  • "bakery", "kitchen", "café", "atelier" + craft brief  → E5 custom illustration (Tier B SVG)
  • "agency", "studio", "portfolio"                       → E8 photography or no enrichment
  • "manifesto", "essay", "book", "letter"                → no enrichment (typography only)
  • Quiet theme picked                                    → no enrichment (the theme IS restraint)

Else if the brief is genuinely ambiguous, ask one question:
  "Want me to add a demo video, an illustration, or keep it
   typography-only? I default to typography-only because it's
   the strongest fail-state."

Else default to no enrichment. State the inference in one sentence
in your reply, alongside the macrostructure inference.
```

When in doubt: don't enrich. The hero will be fine. Most great landing pages are typographic.

---

## Eight enrichment archetypes

Each archetype has a one-line definition, "use when", "avoid when", a short code sketch, and 2–3 within-archetype variation knobs (consistent with [`component-cookbook.md`](component-cookbook.md)).

### E1 · Demo Video — Clipped-by-viewport-edge

A display headline left, a demo video right, and the rightmost ~10–20 % of the video extending past the viewport so it's intentionally cut off. The clip *is* the design — it implies "there's more product than fits on this screen". Pioneered by Linear; refined by Vercel, Resend, Cursor.

*Use when:* the brief is a SaaS / dev tool / dashboard / platform and you have real footage of the product.
*Avoid when:* you don't have real footage. A clipped-edge video of a stock-footage city skyline reads as filler.

**Knobs:**
- Clip side (right · left · both)
- Aspect ratio (16/10 · 16/9 · 4/3)
- Frame treatment (hairline 1 px frame · browser chrome · none)

**Example.** Tracejam (SaaS observability — see [`site/_tests/05-tracejam-saas/`](../../../site/_tests/05-tracejam-saas/)). Display headline left ("Distributed tracing that explains itself."); hand-built CSS-art trace waterfall right, tilted -0.4°, extending 12 vw past the viewport's right edge. Aspect 16/10. Hairline frame. **Not a real video** — the mockup is custom-built CSS at Tier A (rectangles on a percentage grid simulating a flame chart). Mobile (< 60 rem): drop the clip, stack vertically.

```html
<section class="hero hero--clipped">
  <div class="hero__copy">
    <h1>Plan, build, ship.</h1>
    <p>The project tracker your engineering team won't ignore.</p>
    <a class="btn" href="/signup">Try it free</a>
  </div>
  <figure class="hero__media">
    <video autoplay muted loop playsinline preload="metadata"
           poster="/hero-poster.webp" fetchpriority="high"
           aria-label="Tour of the dashboard interface">
      <source src="/hero.av1.mp4"  type='video/mp4; codecs="av01.0.05M.08"'>
      <source src="/hero.vp9.webm" type="video/webm">
      <source src="/hero.h264.mp4" type="video/mp4">
    </video>
  </figure>
</section>
```

```css
.hero--clipped {
  display: grid;
  grid-template-columns: minmax(20rem, 1fr) 1.4fr;
  gap: var(--space-2xl);
  align-items: center;
  overflow: visible;        /* let the media spill past the page edge */
}
.hero__media {
  width: calc(100% + 12vw); /* the 12 % of viewport that sits beyond the right edge */
  aspect-ratio: 16 / 10;
  border-radius: 12px;
  border: var(--rule-hair) solid var(--color-rule);
  overflow: hidden;
}
.hero__media video { width: 100%; height: 100%; object-fit: cover; }

@media (max-width: 60rem) {
  .hero--clipped { grid-template-columns: 1fr; }
  .hero__media { width: 100%; }    /* don't try to clip on mobile — reads as broken */
}

@media (prefers-reduced-motion: reduce) {
  .hero__media video { display: none; }
  .hero__media { background: url('/hero-poster.webp') center/cover; }
}
```

**Critical:** never `loading="lazy"` on the hero video — that kills LCP. Use `preload="metadata"` and `fetchpriority="high"`. Always include a `poster=""` and a `<track kind="captions">` for accessibility.

### E2 · Demo Video — Full-bleed muted loop with ghost overlay

Video fills the fold, ghost-tinted via `mix-blend-mode: multiply` over a paper-coloured overlay so the type stays readable. The video is wallpaper, not subject.

*Use when:* the product's *feel* is the message (mood, tactility, atmosphere).
*Avoid when:* the product needs to be *seen* clearly — use E1 or E3 instead.

**Knobs:**
- Ghost opacity (0.3 / 0.5 / 0.7)
- Text alignment (left-bias / centred)
- Pause behaviour (always-loop · pause-on-hover · pause-when-out-of-viewport)

**Example.** A small fashion brand's spring lookbook. 8-second muted loop of fabric draping in a studio. `mix-blend-mode: multiply` over a 0.5-opacity warm-cream overlay so the italic display headline ("Spring · 2026 · Lookbook 04") reads cleanly over the moving footage. Pauses on hover so the user can read the lede without distraction. Caption track (VTT) describes the footage for accessibility.

### E3 · Mock App Screenshot — Browser-framed split

Display headline left, a browser-frame mockup right, the mockup window slightly tilted (1–3°) for life. Frames are from [Browserframe](https://browserframe.com) or hand-built (a 1-px hairline + three macOS dots).

*Use when:* you're selling a web app and you have a clean, well-lit screenshot.
*Avoid when:* the screenshot is busy or blurry — the frame draws attention to the mess.

**Knobs:**
- Frame style (browser chrome · macOS toolbar · minimal hairline · none)
- Tilt angle (0° · 1.5° · 3°)
- Screenshot count (1 · stack-of-3 · orbit-of-3)

**Example.** A Linear-style SaaS landing for a project tracker. Headline left ("Plan, build, ship."), browser-frame screenshot of the kanban view right, tilted 1.5° clockwise. Three numbered annotations (1 · assigns automatically · 2 · real-time presence · 3 · keyboard-first), each with a small numbered pin and a margin-aligned caption — never arrows-and-labels. Single screenshot, not a stack — fewer assets to load, sharper read.

### E4 · Mock App Screenshot — Floating no-frame

Same composition as E3 but without browser chrome — the screenshot floats with a soft shadow and 12 px corner radius. Cleaner; demands a higher-quality screenshot since the chrome isn't there to forgive.

*Use when:* the screenshot itself is beautiful enough to stand naked.
*Avoid when:* the product needs the "this is a real web app" cue from the chrome.

**Knobs:**
- Shadow depth (subtle / medium / dramatic)
- Corner radius (0 · 8 px · 16 px)
- Background reveal (gradient / solid / none)

**Example.** A code-formatting CLI marketing page. Headline left ("Format anything, in eight lines."), a single floating screenshot right showing `before` / `after` code side by side. 12 px corner radius, a soft 24 px shadow at -10 px offset, sitting on a barely-tinted gradient surface. **No browser chrome** — the screenshot itself is composed and beautiful enough to stand naked. Use this when the screenshot is unusually high-quality; otherwise switch to E3 (the chrome forgives messier captures).

### E5 · Custom Illustration Centerpiece

A hand-built SVG (the default, Tier B) or a generated raster (Tier C, when characters demand it) sitting on the hero as a single illustrative element — the bakery loaf, the studio's mascot, the diagram of how the workflow flows.

*Use when:* the brand has a story or a thing-it-makes that benefits from being drawn.
*Avoid when:* the brand is "modern professional team" generic — illustrating that is the new template.

**Knobs:**
- Build method (Tier A pure-CSS / Tier B hand-SVG / Tier C generated / Tier D library)
- Animation (none · loop · scroll-linked)
- Scale (small accent · dominant)

**Example.** Maple Street Bread (bakery — see [`site/_tests/03-maple-bakery/`](../../../site/_tests/03-maple-bakery/)). Letter-style hero copy left ("Saturday, 6:14 a.m. The dough went in at midnight."), 60-line hand-built SVG loaf right, 3 paths (body, shade, score-marks). Animated with `@property --rise` for a subtle 4 px breathing-loop over 6 s, alternating; the score-marks draw themselves on first paint via `stroke-dasharray`. Tier B, dominant scale, animation: loop. Reduced-motion fallback is a static keyframe.

For *how* to build a hand-drawn loaf in 60 lines of SVG and animate its breath with `@property`, see [`custom-craft.md`](custom-craft.md) — there's a full bakery worked example, plus four more recipes (workflow diagram, mascot, architectural diagram, botanical accent).

### E6 · Animated Loop — pure CSS / SVG / Motion

A small custom-built loop — an orbiting dot, a breathing rectangle, an animated gradient stop, a type-mask reveal. The point is *small*, custom, and looped *only when reduced-motion is off*.

*Use when:* the page is otherwise still and one small animated element gives it life.
*Avoid when:* the page already has movement — adding more reads as anxious.

**Knobs:**
- Medium (CSS keyframes · SVG SMIL/CSS · Motion)
- Placement (margin · inline-with-headline · corner-accent)
- Loop duration (≤ 4s — anything longer drags)

**Example.** A collaborative whiteboard app. A 2-second pure-CSS loop next to the headline: a single dot orbiting a slow ellipse, suggesting "real-time collaboration" without a Lottie. Built with `@property --angle` interpolating 0deg → 360deg on a `transform: rotate()`. Margin-placed, ~64 × 64 px, accent colour at low chroma. **Not a Lottie** — pure CSS keeps the bundle at zero bytes and respects reduced-motion gracefully (animation: none on the media query).

### E7 · Abstract Background — subtle gradient + grain

A two-colour CSS gradient at low chroma, overlaid with SVG `<feTurbulence>` grain at < 0.1 opacity. *Not* aurora; *not* purple-to-cyan mesh; *not* floating orbs. The point is *texture you can barely see* — paper-quality, not decoration.

*Use when:* the page would feel synthetic with a flat surface.
*Avoid when:* the theme already has a paper feel (Specimen, Linen, Riso). Doubling the grain is muddy.

**Knobs:**
- Gradient direction (45° / 135° / radial)
- Grain amount (off · subtle · textured)
- Animation (none · slow drift · scroll-linked parallax)

**Example.** A small podcast site (when the host wants more visual heat than Tide's typography-only quote). Two-stop CSS gradient at 135° (warm-cream → barely-orange, both at < 0.04 chroma) over the *hero only* — never page-wide. SVG `<feTurbulence>` grain overlay at 0.06 opacity, `mix-blend-mode: multiply`. No animation. Resists every aurora-blob temptation.

```html
<section class="hero hero--bg">
  <div class="hero__bg" aria-hidden="true">
    <svg width="0" height="0" style="position: absolute;">
      <filter id="grain"><feTurbulence baseFrequency="0.9" numOctaves="2"/></filter>
    </svg>
  </div>
  <div class="hero__copy"> ... </div>
</section>
```
```css
.hero { position: relative; isolation: isolate; }
.hero__bg {
  position: absolute; inset: 0; z-index: -1;
  background:
    linear-gradient(135deg,
      color-mix(in oklch, var(--color-paper) 100%, var(--color-accent) 4%),
      color-mix(in oklch, var(--color-paper) 100%, var(--color-paper-2) 50%));
}
.hero__bg::after {
  content: ""; position: absolute; inset: 0;
  filter: url(#grain);
  opacity: 0.06;
  mix-blend-mode: multiply;
  pointer-events: none;
}
```

### E8 · Hero Photography — single tightly-cropped image

Existing H6 archetype in the cookbook. Cross-referenced here for completeness. See [`component-cookbook.md`](component-cookbook.md) for variation knobs.

**Example.** A small Lisbon café. One tightly-cropped photograph of the espresso machine at dawn, 4/3 ratio, no full-bleed. Caption sits margin-aligned at lower-left in mono small-caps ("Plate 04 · 6:42 a.m."). The photograph is desaturated 8 % from the source to harmonise with the page's warm-paper tone. Always pair photography with a tone-matched typography pairing (see [`typography.md`](typography.md)) — a luxury-tone photo on a brutalist page jars.

---

## Hero shape polish — patterns beyond enrichment

The eight enrichment archetypes above (E1–E8) decide *what sits next to the headline*. The four polish patterns below decide *how the headline itself sits* — they affect layout, type, motion, not decoration on top. They are admissible on top of any hero macrostructure (Marquee Hero, Stat-Led, Quote-Led, Letter, Photographic, Clipped). Pick one polish pattern when the hero feels shape-flat — colour-only, symmetric, predictable.

You can ship a hero with one polish pattern *and* one enrichment archetype, but never two polish patterns at once. The hero is a high-stakes surface; one structural choice carries it.

### HP1 · Vertical-rail title

The wordmark or a pull-label runs *vertically* alongside the centred body. CSS: `writing-mode: vertical-rl; text-orientation: mixed;` on the rail; the body sits in normal flow beside it. Reads as studio · atelier · editorial — Japanese-print rhythm, hand-set page furniture.

*Use when:* the hero is otherwise centred or marquee-shaped and the page wants a structural anchor that isn't a rule or a numeral.
*Avoid when:* the body title is itself big and centred — vertical rail beside huge horizontal display reads as competing axes; pick one direction.

```html
<header class="hero hero--rail">
  <p class="hero__rail" aria-hidden="true">STUDIO · 2026 · WORK · LETTERS</p>
  <div class="hero__body">
    <h1 class="hero__display">A working archive.</h1>
    <p class="hero__lede">Twelve years. Selected projects, in their own time.</p>
  </div>
</header>
```
```css
.hero--rail { display: grid; grid-template-columns: auto 1fr; gap: var(--space-2xl); padding: var(--space-2xl) var(--page-gutter); align-items: end; }
.hero__rail { writing-mode: vertical-rl; text-orientation: mixed; font-family: var(--font-display); font-size: var(--text-sm); letter-spacing: 0.18em; color: var(--color-ink-2); margin: 0; }
@media (max-width: 60rem) { .hero--rail { grid-template-columns: 1fr; } .hero__rail { writing-mode: horizontal-tb; font-size: var(--text-xs); } }
```

*Anti-pattern:* vertical text *and* horizontal display title competing at the same scale. Pick one direction; the rail is supporting voice.

### HP2 · Marquee-overflow

The H1 is intentionally larger than the viewport — `overflow-x: clip` on the hero container; the title bleeds past the right edge. Reads as manifesto · brutal · sport — the headline is loud enough that the page can't contain it.

*Use when:* the genre is playful (Brutal, Manifesto, Sport) and the title is *short* (≤ 6 words). Long titles + overflow = noise.
*Avoid when:* the title carries legal information that must be readable in full (privacy notice, terms page).

```html
<header class="hero hero--overflow">
  <h1 class="hero__display hero__display--xxl">STOP MAKING UI THAT LOOKS LIKE EVERYONE ELSE'S UI.</h1>
  <p class="hero__lede">Hallmark. A design skill that refuses defaults.</p>
</header>
```
```css
.hero--overflow { overflow-x: clip; padding: var(--space-2xl) var(--page-gutter); }
.hero__display--xxl { font-family: var(--font-display); font-weight: 800; font-size: clamp(4rem, 14vw, 14rem); line-height: 0.92; letter-spacing: -0.04em; margin: 0; white-space: nowrap; }
@media (max-width: 60rem) { .hero__display--xxl { white-space: normal; font-size: clamp(2.5rem, 10vw, 5rem); } }
```

*Anti-pattern:* `overflow-x: hidden` on `<html>` or `<body>` at the same time as this hero — the clip breaks horizontal scroll behaviour for descendants. Use `overflow-x: clip` only, scoped to the hero container.

### HP3 · Cursor-spotlight

A radial-gradient background that tracks `mousemove`, scoped to the hero only. Reads as atmospheric · modern-minimal SaaS — Linear, Tailwind Labs, Raycast.

*Use when:* the page is atmospheric / dark-paper / SaaS marketing, the hero has empty surface to play under, and the brand voice can carry "tactile, alive".
*Avoid when:* the cursor would track over content (text, buttons) — pulls focus from reading. Scope the spotlight to a backdrop layer beneath text, never over it.

```html
<header class="hero hero--spotlight">
  <div class="hero__spotlight" aria-hidden="true"></div>
  <div class="hero__body">
    <h1 class="hero__display">Distributed tracing that explains itself.</h1>
    <p class="hero__lede">Open one trace. See the whole story.</p>
  </div>
</header>
```
```css
.hero--spotlight { position: relative; isolation: isolate; padding: var(--space-2xl) var(--page-gutter); overflow: hidden; }
.hero__spotlight { position: absolute; inset: 0; z-index: -1; background: radial-gradient(600px circle at var(--mx, 50%) var(--my, 30%), color-mix(in oklch, var(--color-accent) 22%, transparent), transparent 60%); transition: background 200ms var(--ease-out); }
@media (prefers-reduced-motion: reduce) { .hero__spotlight { transition: none; --mx: 50%; --my: 30%; } }
```
```js
// Scope to hero only — never page-wide.
const hero = document.querySelector('.hero--spotlight');
hero?.addEventListener('pointermove', (e) => {
  const r = hero.getBoundingClientRect();
  hero.style.setProperty('--mx', `${e.clientX - r.left}px`);
  hero.style.setProperty('--my', `${e.clientY - r.top}px`);
});
```

*Anti-pattern:* tracking the cursor across the *whole page* — nausea-inducing, focus-stealing. Scope to hero only. The reduced-motion fallback must pin the gradient to a sensible static position (50% / 30%), not just disable the effect (which would leave a flat surface).

### HP4 · Decorative-numeral

A huge edition number / year / chapter glyph set in display-italic in a hero corner. The numeral *means something* — issue 22, year 2026, chapter 03, version 0.8. Reads as editorial · salon · newsprint · almanac.

*Use when:* the page genuinely has an edition / issue / chapter / version semantic — magazines, journals, archived work, dated essays.
*Avoid when:* the numeral has no semantic anchor. A random "42" in the corner reads as decoration, which is slop (see slop-test gate 55).

```html
<header class="hero hero--num">
  <p class="hero__eyebrow">Studio · Spring 2026</p>
  <h1 class="hero__display">A working archive.</h1>
  <p class="hero__lede">Twelve years. Selected projects, in their own time.</p>
  <span class="hero__num" aria-hidden="true">22</span>
</header>
```
```css
.hero--num { position: relative; padding: var(--space-2xl) var(--page-gutter) var(--space-3xl); overflow: hidden; }
.hero__num { position: absolute; right: var(--page-gutter); bottom: -0.15em; font-family: var(--font-display); font-style: italic; font-weight: 600; font-size: clamp(8rem, 22vw, 18rem); line-height: 1; color: color-mix(in oklch, var(--color-ink) 8%, transparent); pointer-events: none; user-select: none; }
@media (max-width: 60rem) { .hero__num { font-size: clamp(5rem, 26vw, 9rem); right: -0.1em; } }
```

*Anti-pattern:* numerals that mean nothing. The numeral must carry information — issue, year, version, chapter, plate. If you can't name what the number *is*, drop it.

---

## Hero space discipline

Every hero — enriched or not, polished or not — obeys these rules.

- **Footprint.** The hero takes 70–90 % of the first viewport's height — no more, no less. `min-height: 100vh / 100dvh` is the AI fingerprint (gate 7); a hero that's only 20 % of the viewport feels like a header. Aim for `min-height: clamp(60vh, 75dvh, 88dvh)` and let content settle inside.
- **Asymmetric padding.** `padding-block-end` ≥ 1.3× `padding-block-start`. The hero sits *into* the page; symmetric padding floats. Slop-test gate 54 enforces this.
- **Never centre everything.** Eyebrow + title + lede + CTA all stacked centred is the AI fingerprint. Pick at most *two* centred elements; break alignment for the others. Gate 53 enforces this. Centred-narrow heroes are admissible only when the genre is editorial / salon / atelier *and* the eyebrow or CTA breaks alignment.
- **Entrance animation.** Pick one of {fade, sweep, none} per element — never both fade *and* sweep on the same element. Duration ≤ 220 ms. Disable on `prefers-reduced-motion: reduce`. Cross-reference the "One orchestrated reveal per page" rule below.
- **Headline typography.** Prefer one display weight + tight tracking (-0.02em to -0.04em) over default 0; line-height 0.95–1.05 for display, never 1.2 (which inherits the body line-height and reads as un-set type). Avoid two display weights on the same headline (a `<strong>` in a different weight inside the title is AI's idea of "emphasis"; pick one weight, let the words carry).
- **One polish pattern, max.** HP1–HP4 are mutually exclusive on a single hero. A vertical rail *and* a marquee-overflow *and* a cursor spotlight *and* a decorative numeral on one hero is a panic attack. Pick one.

The decision sequence:

1. Pick the hero macrostructure (Marquee Hero, Stat-Led, Quote-Led, Letter, Photographic, Clipped) — see [`macrostructures.md`](macrostructures.md).
2. Pick zero-or-one **enrichment archetype** (E1–E8 above).
3. Pick zero-or-one **polish pattern** (HP1–HP4 above).
4. Apply the space discipline rules.
5. Stamp the choices into the macrostructure stamp.

---

## Animation discipline (hero specifically)

Cross-references [`motion.md`](motion.md), [`microinteractions.md`](microinteractions.md), and [`custom-craft.md`](custom-craft.md). The hero is the highest-stakes animation surface on the page; the rules are tighter here than elsewhere.

**One orchestrated reveal per page.** Not eight. Not "everything fades in on scroll". One: the hero settles in 0.4–0.8 s with a single coordinated motion, then stops.

**Banned for hero entrances:**
- Bouncy elastic easing (`cubic-bezier(0.34, 1.56, ...)`) — reads as 2016 Framer demo
- Scroll-fade-everything (every section fades in when it enters the viewport)
- Mouse-follow gradients on SaaS landing pages (allowed only on portfolio / creative / agency work)
- Parallax-on-mouse (motion sickness, gimmicky)
- Particle / starfield backgrounds (2010s nostalgia, distracting)
- Auto-rotating hero carousels (WCAG 2.2.2 fail unless paused-on-hover-and-focus is implemented)

**Allowed:**
- A single image-fade-in-late after the headline lands (~0.6 s after, ~0.4 s duration)
- Type-unmask on the headline (`clip-path` opening over text)
- View Transitions API for state changes (theme switch, route change)
- Number-tick on a stat-led hero (counter from 0 to final, ≤ 1.2 s)
- A single subtle Lottie / CSS loop ≤ 4 s, with `prefers-reduced-motion` fallback

**Reduced-motion is the default in 2026.** Every animation gets a `@media (prefers-reduced-motion: reduce)` block that either disables the motion or replaces it with a static keyframe. This is non-negotiable; the slop test will catch you.

---

## Quality bar — eight pre-flight questions

Every question must answer *yes* before the enrichment ships. If any answer is *no*, ship the typographic-only hero instead.

1. Does the enrichment **communicate** something the typography can't?
2. Is it under **2 MB** total (video poster + first segment, illustration + animation JSON, image + grain)?
3. Does it have a **`prefers-reduced-motion` fallback**?
4. If video: muted, looped, `playsinline`, with a poster + `fetchpriority="high"` + caption track?
5. If illustration: built or generated with intent? **Not picked from a Lottie library as a shortcut?**
6. If background: under one accent colour at < 5 % footprint? (Aurora and mesh-gradients fail this.)
7. Does it survive being deleted? (If the hero still works without it, it earned its place. If the hero collapses without it, you propped weak typography on a crutch.)
8. Does its tone match the page's tone? (Risograph illustration on a Brutal page = wrong. Hand-drawn doodle on a Workbench developer-tool page = wrong. Three.js bloom on a Quiet page = wrong.)

The slop test ([`SKILL.md`](../SKILL.md) §5) carries four binary gates that mirror these questions; the audit verb runs them.

---

## Output stamp

When you ship enrichment, the macrostructure stamp records the choice:

```css
/* Hallmark · macrostructure: Marquee Hero · H1 hero knobs: size=xxl, alignment=left-bias
 * enrichment: E1 Clipped-Edge Video · clip=right, aspect=16/10, frame=hairline
 * polish: HP3 Cursor-spotlight (scoped to hero, reduced-motion fallback pinned at 50%/30%)
 * nav: N5 Floating pill · footer: Ft5 Statement
 * craft: tier-A CSS art (no real video — pure custom-built mockup)
 * theme: Linen · accent: steel-blue ~3% · studied: no
 */
```

If no polish pattern is used, omit the `polish:` line — don't fake it. Same for enrichment.

This signals to future Hallmark runs (and to the audit verb) what was chosen and how. It also lets the user see the inferences in one place and redirect if anything's off.

---

## Common mistakes — and the fixes

- **Defaulting to E5 illustration on every brief.** Most heroes don't want an illustration. Reach for E0 (typography only) first; reach for E1–E4 when there's a *thing* to show; reach for E5 only when illustration genuinely matches the tone.
- **Using a stock Lottie checkmark as the hero animation.** That's tier E used to skip tiers A–D. Build the checkmark in pure CSS (`stroke-dasharray` animated to draw the tick); it's 8 lines.
- **Adding a grain background everywhere.** Grain is a treatment, not a default. Half the existing themes already carry texture (Riso, Linen, Specimen). Don't double up.
- **Treating the abstract background as the hero.** It isn't. The headline is. The background is paper.
- **Shipping the unmodified Storyset SVG.** That's tier D ungrounded — the library look. Customise the colour to your anchor hue at minimum; recompose if you can.
- **A clipped-edge video on mobile.** The clip reads as broken on a 375-px viewport. Always collapse to stacked at < 60 rem.
