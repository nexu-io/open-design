---
name: design-studio-web
zh_name: "Design Studio Web · 设计工作室首页"
en_name: "Design Studio Web — Motion-First Creative Studio Homepage"
description: >
  Produce an internationally competitive single-page homepage for an
  independent design studio, creative practice, digital agency, or art
  direction team. The template is project-led rather than SaaS-led: a
  cinematic WebGL hero, manifesto, horizontal selected-work rail, connected
  disciplines, interactive material lab, method, studio profile, recognition,
  and contact outro are generated from one typed inputs.json. The visual
  language combines Future Minimalism, experimental editorial typography,
  generative graphics, restrained glass/refraction, spatial composition and
  motion-first interaction. A pure-function composer emits a standalone HTML
  page with CSS and runtime JavaScript inlined; project imagery can be generated,
  stubbed with art-directed SVG placeholders, or supplied by the user.
triggers:
  - design studio website
  - creative studio homepage
  - agency portfolio
  - studio portfolio
  - 设计工作室官网
  - 设计工作室首页
  - 创意工作室网站
  - motion portfolio
  - webgl portfolio
  - awwwards studio site
od:
  # Declared explicitly: the description text mentions "imagery" and
  # "motion", and inferMode() matches those before it ever reaches the
  # prototype fallback, so an absent mode classifies this template as an
  # image skill and drops platform to null.
  mode: prototype
  platform: desktop
  fidelity: high-fidelity
  category: brand-page
  surface: web
  scenario: studio-marketing
  audience: design studios, creative agencies, art directors, digital practices
  tone: future-minimal, editorial, cinematic, confident, restrained
  scale: viewport-anchored long-form single page
  preview:
    type: html
    entry: example.html
  craft:
    requires:
      - pixel-discipline
      - typographic-rhythm
      - motion-discipline
      - animation-discipline
      - anti-ai-slop
inputs:
  - id: brand
    label: Studio identity
    description: Name, mark, positioning, location, contact, status and social links.
    schema_path: ./schema.ts#BrandBlock
  - id: nav
    label: Navigation
    description: Primary in-page anchors.
    schema_path: ./schema.ts#NavLink
  - id: hero
    label: Hero
    description: Studio positioning, statement, CTA and three proof points.
    schema_path: ./schema.ts#HeroBlock
  - id: manifesto
    label: Point of view
    description: Studio thesis plus three design principles.
    schema_path: ./schema.ts#ManifestoBlock
  - id: work
    label: Selected work
    description: Project-led horizontal portfolio rail. Four projects recommended.
    schema_path: ./schema.ts#WorkBlock
  - id: capabilities
    label: Connected disciplines
    description: Four capability rows plus the interactive material lab.
    schema_path: ./schema.ts#CapabilitiesBlock
  - id: method
    label: Working method
    description: Four-stage senior-led studio process.
    schema_path: ./schema.ts#MethodBlock
  - id: studio
    label: Studio profile
    description: Practice profile, disciplines and operational proof points.
    schema_path: ./schema.ts#StudioBlock
  - id: proof
    label: Recognition
    description: Quote, client cloud and selected awards.
    schema_path: ./schema.ts#ProofBlock
  - id: contact
    label: Contact outro
    description: Closing statement, email and availability.
    schema_path: ./schema.ts#ContactBlock
  - id: imagery
    label: Image strategy
    description: placeholder / generate / bring-your-own.
    schema_path: ./schema.ts#ImageryConfig
  - id: motion
    label: Motion behavior
    description: Global intensity, loader, cursor, audio and adaptive quality.
    schema_path: ./schema.ts#MotionConfig
  - id: ui
    label: Interface chrome
    description: Translated loader, menu, shader-lab, cursor and alt-text strings. Omit to keep English defaults.
    schema_path: ./schema.ts#UiStrings
parameters:
  output_format:
    type: enum
    values: [standalone-html]
    default: standalone-html
    description: Writes one HTML document with styles and runtime scripts inlined; images remain relative assets.
  image_strategy:
    type: enum
    values: [placeholder, generate, bring-your-own]
    default: placeholder
    description: Placeholder renders immediately; generate uses original art-direction imagery; bring-your-own accepts PNG artwork.
  experience_priority:
    type: enum
    values: [desktop-first-adaptive]
    default: desktop-first-adaptive
    description: Desktop receives the full cinematic interaction; mobile retains hierarchy and content but simplifies expensive motion.
outputs:
  - path: <out>/index.html
    description: Standalone creative-studio homepage.
  - path: <out>/assets/*.svg
    description: Art-directed placeholders when image_strategy=placeholder.
  - path: <out>/assets/*.png
    description: Generated or supplied art-direction imagery when image_strategy=generate or bring-your-own.
capabilities_required:
  - file-write
  - node-runtime
  - http-fetch # image generation only
example_prompt: |
  Build a homepage for "FORM/SHIFT", an independent design studio working
  across brand systems, digital experiences, motion and creative technology.
  Make Selected Work the visual center of gravity. Use a near-black base,
  electric blue and aurora cyan accents, cinematic generative motion, a
  horizontal project rail on desktop, and placeholder imagery for the first pass.
---

# design-studio-web

**Canonical preview update:** `example.html` is now a directly edited derivative of `examples/aether-studio.html`, preserving its original layout, WebGL2 fluid/particle runtime and project dialogs with FORM/SHIFT content. Edit the HTML and its `PROJECTS` data directly to maintain this preview. The composer below produces a separate layout; do not run it over the canonical `example.html`.

`design-studio-web` is a **design-studio homepage template**, not a software-product landing page.

Its job is to make a studio feel like a point of view: selected work carries most of the visual weight; capabilities are expressed as connected disciplines; motion explains hierarchy and spatial relationships; code and generative graphics are treated as design material.

The quality bar is contemporary international creative-studio / Awwwards-level craft without copying any named website.

```text
inputs.json + styles.css                     5 image slots
        │                                          │
        └──────────► scripts/compose.ts ◄──────────┘
                            │
                            ▼
                   <out>/index.html
                   <out>/assets/
```

## Core posture

### This template should feel like

- an independent creative practice with strong art direction;
- a portfolio where projects are the primary evidence;
- a cinematic editorial sequence rather than a stack of product sections;
- a coherent system of type, spacing, motion, imagery and interaction;
- a senior studio with taste, not a generic agency theme.

### This template must not drift into

- SaaS pricing / feature / testimonial-card conventions;
- excessive glass cards or dashboard UI;
- purple-blue gradient startup aesthetics;
- a gallery of unrelated visual tricks;
- animated decoration with no relationship to narrative structure;
- dense copy that competes with project imagery.

---

## Visual system contract

### Color

The canonical dark system lives in `styles.css`:

- background: `#0A0A0B`;
- surface: `#111114` / `#17171C`;
- primary accent: electric blue `#4D7CFE`;
- secondary accent: aurora cyan `#7CFFCB`;
- saturated accents should remain below roughly 5% of the viewport;
- all generative / shader color should sample from the same palette.

Do not add a third saturated hue just to make a section feel different. Variation comes from scale, light, motion, image composition and typography—not rainbow section theming.

### Typography

- Display: geometric grotesk / modern sans, strong negative tracking.
- Editorial emphasis: high-contrast italic serif.
- Body: neutral sans.
- Meta / index / coordinates: monospaced.
- Hero display range: approximately `clamp(62px, 10.8vw, 190px)`.
- Large headline/body contrast should remain at least 4:1.

### Grid

- Twelve-column spatial logic on desktop.
- Use asymmetry deliberately; do not center every section.
- Keep one dominant object per viewport.
- Use large pauses between chapters; the page should breathe.
- Project cards can break the container during the horizontal rail.

---

## Motion system contract

All interaction should behave like one motion language.

### Easing

- entrance / displacement: `cubic-bezier(0.16, 1, 0.3, 1)`;
- emphasis / spatial folding: `cubic-bezier(0.83, 0, 0.17, 1)`;
- magnetic return uses the same out-expo posture rather than bouncy novelty.

### Timing

- micro interaction: ~180–280ms;
- UI state / card motion: ~500–700ms;
- section-scale transition: ~1200–1600ms.

### Runtime rules

- avoid component-local timers as a choreography mechanism;
- runtime uses one requestAnimationFrame loop for WebGL fields;
- scroll velocity is damped before entering the shader;
- all optional motion must honor `prefers-reduced-motion`;
- custom cursor and card tilt disappear on touch / mobile layouts.

---

## Narrative structure

### Act 0 — Loader

Minimal identity mark + percentage + one progress line. The loader is an entrance ritual, not a fake wait screen. Keep it around one second in the canonical example and remove it immediately when reduced-motion is enabled.

### Act 1 — Hero

Full-viewport WebGL generative field with:

- `uTime`;
- `uResolution`;
- `uMouse`;
- `uScrollVelocity`;
- `uAct`;
- `uNoiseFreq`;
- `uFlowSpeed`;
- `uDistortion`;
- `uChromatic`.

The headline is character-revealed from blur and vertical displacement. Pointer movement creates restrained local field movement. The hero must introduce the studio's point of view in one sentence.

### Act 2 — Point of view

Editorial manifesto with large negative space and three principles. This section explains what the studio believes, not its corporate history.

### Act 3 — Selected Work

This is the **center of gravity**.

Desktop:

- vertical scroll maps to horizontal project travel;
- sticky 100vh frame;
- large 4:3 project plates;
- light 3D tilt follows pointer movement;
- each card carries client, category, year, services and one proof point.

Mobile:

- remove sticky horizontal scrub;
- stack projects vertically;
- preserve art direction and hierarchy.

Use four strong projects by default. Fewer than three makes the studio feel thin; more than six makes the homepage become an archive.

### Act 4 — Capabilities / Interactive Lab

Capabilities are expressed as four connected disciplines, not product features.

The lower half is an interactive material lab. Sliders write directly into the live fragment shader:

```glsl
uniform float uNoiseFreq;
uniform float uFlowSpeed;
uniform float uDistortion;
uniform float uChromatic;
```

The point is to demonstrate craft through interaction rather than through a progress bar or skill percentage.

### Act 5 — Working method

Four stages: Frame → Explore → Systemize → Launch.

Keep the explanation specific enough to show how the studio works, but concise enough that the page remains a portfolio.

### Act 6 — Studio

One vertical studio-atmosphere image, one concise practice description, discipline pills and three proof points. Avoid posed team grids unless the user explicitly asks for a team page.

### Act 7 — Recognition

One strong pull quote, restrained client cloud and a short award list. Recognition supports the work; it should never overpower it.

### Act 8 — Contact / Outro

Large closing statement, magnetic email CTA, availability and timezone. Reuse the visual energy of the hero in a more resolved / quieter state.

---

## Image strategy

Five canonical slots are defined in `assets/image-manifest.json`:

```text
work-1.svg / .png
work-2.svg / .png
work-3.svg / .png
work-4.svg / .png
studio.svg / .png
```

### `placeholder`

```bash
npx tsx scripts/placeholder.ts ./out/assets/
```

Creates intentional abstract SVG plates. Use this for the first pass, internal review and layout QA.

### `generate`

```bash
FAL_KEY=... npx tsx scripts/imagegen.ts inputs.json --out=./out/assets/
```

The helper composes:

1. a shared art-direction anchor;
2. brand variables from `inputs.json`;
3. a slot-specific composition prompt.

Without `FAL_KEY`, it becomes a dry run and prints the complete prompts so an agent can route them through any available image-generation tool.

Generated files are PNG. Set `imagery.strategy` to `generate` so the composer references `.png` assets.

### `bring-your-own`

Drop PNG files using the same slot ids into `imagery.assets_path`, then set `imagery.strategy` to `bring-your-own`.

---

## Localisation contract

`brand.locale` sets the document language. The `ui` block owns every string the
studio does not author itself — loader caption, menu and close labels, ambient
audio label, the whole shader lab (title, body, hint, readout, four slider
labels, four preset names), cursor hint words, the navigation landmark name, and
both image alt-text suffixes. Missing keys fall back to the composer's English
defaults, which keeps older inputs files valid but also means a half-translated
brief ships a half-translated page: **the artifact must never show two languages
in one viewport.**

`styles.css` carries a `:lang(zh)` layer for Han scripts:

- CJK-aware `--sans` / `--display` / `--serif` stacks;
- tracking and leading that suit full-width glyphs instead of the negative
  tracking tuned for Latin display type;
- `em` fragments switch from synthetic oblique to a Song/Ming face;
- Latin type, layout and motion are unchanged.

When the brief is in a non-Latin script, verify the composed page at 360px,
768px and 1440px: CJK line-breaking produces different line counts than the
English bake, and a headline that wrapped in two lines may now wrap in three.

Two worked examples ship together for exactly this reason:
`inputs.zh.example.json` (Simplified Chinese composer input; output to `out/index.html`) and
`examples/inputs.form-shift.json` (English, baked to `examples/form-shift.html`).

Each bake has its own inputs file because `imagery.assets_path` is written
verbatim into the generated `src` attributes: it is output-relative, not
package-relative. `example.html` sits beside `assets/`, so it takes
`"./assets/"`; `examples/form-shift.html` sits one level down, so its inputs
file takes `"../assets/"`. Composing the `examples/` bake from the root
`inputs.example.json` silently rewrites all five plate URLs to
`./assets/…`, which resolves to a directory that does not exist and leaves
the rail with five broken images. Use the inputs file that belongs to the
output directory.

## Workflow contract

### 1. Translate the brief into a studio point of view

Before filling fields, extract:

- what kind of studio this is;
- the strongest 3–5 projects;
- disciplines actually practiced;
- what makes its process distinct;
- the audience / client type it wants next;
- one concise availability / contact action.

If details are missing, use neutral placeholders rather than inventing fake client claims or awards.

### 2. Author `inputs.json`

Start from `inputs.example.json`. Keep the typed shape in `schema.ts` intact.

For `MixedText`, use italic emphasis sparingly:

```json
[
  { "text": "We build " },
  { "text": "visual systems", "em": true },
  { "text": " that move." }
]
```

Use `accent: true` on at most one short fragment per major headline.

### 3. Prepare imagery

Choose one image strategy and make all required slots exist before delivery. For `out/index.html` with `assets_path: "./assets/"`, generate or copy images into `out/assets/` before composing; the composer does not copy assets.

### 4. Compose

```bash
npx tsx scripts/compose.ts inputs.json out/index.html
```

The composer inlines:

- canonical `styles.css`;
- semantic section markup;
- loader;
- reveal observer;
- sticky-nav behavior;
- scroll progress;
- desktop horizontal project rail;
- custom cursor;
- magnetic buttons;
- project tilt;
- WebGL fragment shader and uniforms;
- interactive capability-lab controls;
- optional Web Audio ambient layer.

No framework is required at runtime.

---

## Performance and graceful degradation

- adaptive quality uses a lower canvas pixel ratio when `hardwareConcurrency <= 4`;
- mobile disables cursor and card tilt and converts horizontal work to vertical flow;
- no WebGL context → canvas hides and CSS radial-gradient fallback remains visible;
- reduced motion removes loader timing, camera-like movement, horizontal scrub and reveal transforms;
- without JavaScript, content and navigation remain visible and projects use a static grid;
- resizing across 760px updates the work rail; tablet navigation remains available up to 1080px;
- keep expensive imagery compressed in production; KTX2/Basis is recommended for a future full Three.js implementation;
- target stable 60fps desktop and at least 30fps on supported mobile devices.

---

## Self-check before delivery

- [ ] Check `inputs.json` against the TypeScript contract in `schema.ts` (the CLI parses JSON; it does not provide runtime schema validation).
- [ ] `index.html` opens without console-breaking JavaScript errors.
- [ ] `ui` is fully translated whenever `brand.locale` is not English.
- [ ] All five image slots resolve—no broken project plates.
- [ ] Selected Work is visually stronger than Capabilities.
- [ ] Hero headline is readable before the WebGL effect becomes noticeable.
- [ ] Accent color stays restrained; no section introduces an unrelated hue.
- [ ] Desktop project rail reaches the last card cleanly.
- [ ] Mobile project rail becomes a vertical stack with no horizontal overflow.
- [ ] Interactive lab updates all four shader parameters.
- [ ] Every interactive element shows a visible `:focus-visible` ring.
- [ ] `prefers-reduced-motion: reduce` produces a complete, readable static page.
- [ ] WebGL failure still leaves a usable hero via CSS fallback.
- [ ] Contact email and project links remain keyboard-accessible.
- [ ] Text contrast meets WCAG AA for normal-size body copy.

---

## Files

```text
design-templates/design-studio-web/
├── SKILL.md
├── README.md
├── schema.ts
├── styles.css
├── inputs.zh.example.json
├── inputs.example.json
├── example.html
├── examples/
│   ├── inputs.form-shift.json
│   ├── form-shift.html
│   └── aether-studio.html
├── scripts/
│   ├── compose.ts
│   ├── imagegen.ts
│   └── placeholder.ts
└── assets/
    ├── image-manifest.json
    ├── imagegen-prompts.md
    ├── work-1.svg
    ├── work-2.svg
    ├── work-3.svg
    ├── work-4.svg
    └── studio.svg
```

## Boundaries

- Do not turn this into a feature-list SaaS page.
- Do not add pricing tables unless the user explicitly needs service packages.
- Do not use more than two saturated accent hues.
- Do not hide weak art direction behind excessive blur, grain or shader noise.
- Do not let WebGL lower text readability or block navigation.
- Do not force desktop-only interactions onto mobile.
- Do not fabricate awards, clients, metrics or testimonials for a real studio.
- Keep `styles.css` as the visual source of truth and `schema.ts` as the content contract.


## Ripple and particle material

The fluid field takes its material direction from `examples/aether-studio.html`:
blue contour filaments, cyan caustic rims, two depths of luminous particles,
fine scanlines and dithering. The hero and interactive lab share this shader.
The implementation uses analytic particles in the existing WebGL 1 pass rather
than the reference's WebGL 2 transform-feedback simulation. It adds no canvas,
external dependency or animation loop.

Noise frequency controls contour density; flow speed controls ripple travel
and particle drift; distortion warps the contours; chromatic offset separates
the caustic highlight. Pointer position bends the field locally and scroll
velocity perturbs the flow. Text retains a dark directional veil. Mobile and
low-power devices render at pixel ratio 1; reduced motion and zero intensity
freeze time and pointer movement. No-WebGL/no-script hero fallback retains
static concentric texture in CSS.
