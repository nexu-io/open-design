# design-studio-web

A reusable OpenDesign-style template for an **independent design studio / creative studio homepage**.

The template is deliberately project-led rather than SaaS-led. It combines a cinematic WebGL hero, experimental editorial typography, a desktop horizontal Selected Work rail, connected studio disciplines, a live shader material lab, working method, studio profile, recognition and a contact outro.

> Read `SKILL.md` first for the agent contract, art-direction rules and QA checklist. `README.md` is the human quick-start.

> **Canonical preview:** `example.html` now uses the original layout and runtime
> from `examples/aether-studio.html`, with FORM/SHIFT content edited directly in
> the HTML (including `PROJECTS`). Maintain it directly; do not overwrite it
> with `scripts/compose.ts`. The composer remains available for its separate
> input-driven layout and `examples/form-shift.html`.

## 30-second start

```bash
# 1. Generate the five built-in SVG placeholder plates.
npx tsx scripts/placeholder.ts ./assets/

# 2. Open the canonical Aether-based example.
open example.html

# 3. Or compose the English worked example.
npx tsx scripts/placeholder.ts ./out/assets/
npx tsx scripts/compose.ts inputs.example.json out/index.html

# 4. Rebuild the examples/ bake (note the different inputs file — see below).
npx tsx scripts/compose.ts examples/inputs.form-shift.json examples/form-shift.html

# 5. Open it.
open example.html
```

Node 24 can also execute these `.ts` scripts with type stripping:

```bash
node --experimental-strip-types scripts/placeholder.ts ./assets/
node --experimental-strip-types scripts/compose.ts inputs.zh.example.json out/index.html
```

## Two worked examples

| Inputs | Locale | Chrome language | Baked output |
|---|---|---|---|
| `example.html` (directly authored) | `zh-CN` | Aether layout with FORM/SHIFT content | `example.html` |
| `examples/inputs.form-shift.json` | `en` | English (composer defaults) | `examples/form-shift.html` |

Both describe FORM/SHIFT; the canonical preview retains the Aether layout, while
the English example demonstrates the separate input-driven composer.

`imagery.assets_path` is emitted verbatim into the generated `src` attributes,
so it is **output-relative, not package-relative**. `example.html` sits beside
`assets/` and takes `"./assets/"`; the bake inside `examples/` sits one level
down and its inputs file takes `"../assets/"`. Composing `examples/form-shift.html`
from the root `inputs.example.json` rewrites all five plate URLs to
`./assets/…`, which resolves to a directory that does not exist — always pair an
output with the inputs file that lives in the same directory.
`examples/aether-studio.html` is an earlier art-directed bake kept for reference.

## Homepage structure

```text
00  Loader
01  Hero / generative field
02  Point of view / manifesto
03  Selected Work / horizontal project rail
04  Capabilities / connected disciplines + interactive shader lab
05  Working method
06  Studio profile
07  Recognition / clients / awards
08  Contact / outro
    Footer / oversized studio wordmark
```

The hierarchy is intentional: **Work > Point of view > Capabilities > Studio proof**.

## Files

```text
design-studio-web/
├── SKILL.md                 # Agent contract and quality bar
├── README.md                # Human quick-start
├── schema.ts                # Typed content contract / source of truth
├── styles.css               # Canonical design + responsive + CJK system
├── inputs.zh.example.json   # Worked example: FORM/SHIFT → 形流设计 (zh-CN)
├── inputs.example.json      # Worked example: FORM/SHIFT studio (en)
├── example.html             # Known-good composed output (zh-CN)
├── examples/
│   ├── inputs.form-shift.json # English inputs for the examples/ bake
│   ├── form-shift.html      # Same composer, English inputs
│   └── aether-studio.html   # Earlier art-directed bake, kept for reference
├── scripts/
│   ├── compose.ts           # inputs.json + styles.css → HTML
│   ├── imagegen.ts          # Optional gpt-image-2 / fal.ai helper
│   └── placeholder.ts       # Generates deterministic SVG art plates
└── assets/
    ├── image-manifest.json
    ├── imagegen-prompts.md
    ├── work-1.svg
    ├── work-2.svg
    ├── work-3.svg
    ├── work-4.svg
    └── studio.svg
```

## Image strategies

| Strategy | Use it for | Output |
|---|---|---|
| `placeholder` | first pass, layout QA, no image budget | SVG |
| `generate` | final original art direction | PNG |
| `bring-your-own` | existing case-study visuals | PNG |

The composer automatically uses `.svg` for placeholder mode and `.png` for generate / bring-your-own mode.

### Generate art-direction prompts or images

```bash
# Dry run: prints full prompts, writes nothing. Needs no key.
npx tsx scripts/imagegen.ts inputs.example.json --out=./assets/

# Generate through the same fal.ai pattern used by the OpenDesign reference.
FAL_KEY=... npx tsx scripts/imagegen.ts inputs.example.json --out=./assets/ --force

# Then flip the strategy so the composer emits .png instead of .svg, and recompose.
#   inputs.zh.example.json  →  imagery.strategy: "generate"
#   examples/inputs.form-shift.json → imagery.strategy: "generate"
npx tsx scripts/compose.ts inputs.zh.example.json out/index.html
npx tsx scripts/compose.ts examples/inputs.form-shift.json examples/form-shift.html
```

`assets/image-manifest.json` is the slot contract: one entry per plate with its
target size, ratio and a `prompt_section` that resolves to a real `##` heading in
`assets/imagegen-prompts.md`. Generation replaces the `*.svg` plates with
`*.png` files of the same basename; the composer picks the extension from
`imagery.strategy`, so the two steps above are the whole switchover.

The five slots are intentionally few: the homepage should feel art-directed, not like an image dump.

Until `FAL_KEY` (or another image model) is configured, the shipped plates are
the deterministic SVG placeholders from `scripts/placeholder.ts`. They are
deliberately labelled on-image — slot id, ratio, target size, prompt subject and
a `PLACEHOLDER / REPLACE …` line — so an unfinished bake is never mistaken for
finished art direction.

## Main design tokens

```css
--bg: #0A0A0B;
--surface: #111114;
--accent: #4D7CFE;
--accent-2: #7CFFCB;
--ease-out: cubic-bezier(.16,1,.3,1);
--ease-inout: cubic-bezier(.83,0,.17,1);
```

Use saturated accent colors sparingly. The visual richness should come from type scale, negative space, material imagery, WebGL flow and motion—not a larger color palette.

## Motion behavior

The generated HTML includes no runtime framework. It uses browser-native JavaScript for:

- character-level hero reveal;
- scroll reveal via `IntersectionObserver`;
- sticky-nav hide / reveal;
- top scroll-progress line;
- damped scroll-velocity signal;
- WebGL FBM / domain-warping field;
- desktop horizontal Selected Work scrub;
- custom cursor states;
- magnetic CTAs;
- project-card tilt;
- capability-lab shader sliders and presets;
- optional user-initiated Web Audio ambient layer.

`prefers-reduced-motion` receives a complete static experience rather than a broken version of the animated layout.

## Localised briefs

Set `brand.locale` to the document language and translate the `ui` block, which
owns every string the studio does not author itself: the loader caption, menu
labels, the shader lab, cursor hints, and image alt text. Omitted keys fall back
to English, so partial translation is possible but never desirable — one
viewport must not mix languages.

For Chinese copy the stylesheet supplies a `:lang(zh)` layer: CJK font stacks,
tracking and leading that suit full-width glyphs, and a Song/Ming face for the
emphasised fragments instead of a synthetic oblique. Latin text is untouched.

## Customize for a new studio

1. Copy `inputs.example.json` → `inputs.json`.
2. Replace studio identity and positioning.
3. Translate the `ui` block if the brief is not in English.
4. Replace the four projects with real case studies.
5. Remove unverified metrics, awards and client names.
6. Choose image strategy.
7. Prepare `out/assets/` (copy your PNGs, or run `npx tsx scripts/placeholder.ts ./out/assets/`), then compose to `out/index.html`.
8. Review desktop and mobile before delivery.

## Recommended project data

Each project should contain:

- client / project name;
- category and year;
- one concise concept sentence;
- 3–4 services;
- one real proof point if available;
- one art-directed 4:3 image.

Four projects is the default sweet spot for a homepage. Put the full archive elsewhere.

## Performance notes

The WebGL implementation is intentionally lightweight: one full-screen triangle, one fragment shader and no Three.js dependency in the composed artifact. A production implementation can swap this runtime for React Three Fiber / Three.js while preserving the same uniform contract.

On lower-power devices the renderer reduces pixel density. On mobile, custom cursor, card tilt and horizontal rail behavior are removed. If WebGL cannot initialize, the CSS fallback gradient stays in place.


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
