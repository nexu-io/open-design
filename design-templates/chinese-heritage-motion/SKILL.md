---
name: chinese-heritage-motion
description: >
  Produce a museum-grade, motion-first single-page website for a real Chinese
  heritage architecture or cultural-heritage subject. This template does not
  ask the agent to invent a visual language from scratch: it maps the brief to
  a fixed heritage design system, one of eight canonical scene presets, a typed
  content schema, a scene-aware asset manifest, and a deterministic motion
  runtime. Use for pagodas, temples, gardens, grottoes, city walls, vernacular
  settlements, museum collections, and similar subjects when the target is an
  immersive editorial/Awwwards-level cultural experience rather than a SaaS
  landing page.
triggers:
  - 中国古建筑
  - 文化遗产网站
  - 沉浸式古建筑网站
  - 数字博物馆
  - heritage architecture
  - cinematic cultural website
  - immersive heritage site
  - Awwwards cultural website
od:
  mode: prototype
  category: cultural-editorial-motion
  surface: web
  scenario: design
  audience: museums, cultural bureaus, heritage-tourism studios, editorial agencies
  tone: monumental, restrained, materially specific, historically literate
  scale: chaptered long-form single page
  craft:
    requires:
      - anti-ai-slop
      - typography-hierarchy-editorial
      - animation-discipline
      - accessibility-baseline
inputs:
  - id: subject
    label: Subject identity and source-backed facts
    schema_path: ./schema.ts#SubjectBlock
  - id: visual_system
    label: Subject DNA mapped into the fixed heritage design system
    schema_path: ./schema.ts#VisualSystemBlock
  - id: chapters
    label: Eight canonical scene assignments and chapter copy
    schema_path: ./schema.ts#ChapterBlock
  - id: imagery
    label: Placeholder / generate / documentary / bring-your-own strategy
    schema_path: ./schema.ts#ImageryConfig
parameters:
  output_format:
    type: enum
    values: [standalone-html]
    default: standalone-html
  image_strategy:
    type: enum
    values: [placeholder, generate, documentary, bring-your-own]
    default: generate
  motion_tier:
    type: enum
    values: [high, medium, low, fallback]
    default: medium
outputs:
  - path: <out>/index.html
    description: CSS and motion runtime inlined; images remain relative assets.
  - path: <out>/assets/*
    description: Scene masters, independent plates, authored vector overlays, or placeholders.
capabilities_required:
  - file-write
  - node-runtime
  - http-fetch # only for generation/documentary strategies
example_prompt: |
  Build an immersive heritage website for 应县木塔. Use the eight canonical
  scenes and a restrained timber/paper visual system. Generate individual image
  assets through the configured image interface, then compose scroll-driven
  scenes. Use placeholders only for layout QA; preserve factual uncertainty.
---

# chinese-heritage-motion

Read `references/motion-direction.md` before composing. The current baked example is
an image-led cinematic page, NOT a repeated heading/image split. Match its
full-bleed opening, fixed registration frame, overlaid directory, asymmetric atlas,
and alternating dense/quiet rhythm. Placeholders are an intermediate QA mode only.

This template follows a strict principle:

> **The agent fills a designed system; it does not redesign the system on every run.**

The visual language lives in `DESIGN.md` + `styles.css`. Scene composition and
motion live in `scene-presets.json` + `motion-runtime.ts`. The user-facing brief
is normalized into `inputs.json` using `schema.ts`. Assets are addressed through
`assets/asset-manifest.json`.

```text
brief / verified sources
        │
        ▼
    inputs.json ─────────────┐
        │                    │
        ▼                    ▼
 scene-presets.json     asset-manifest.json
        │                    │
        ├──── styles.css ─────┤
        ├ motion-runtime.ts ──┤
        │                    │
        └──────────► scripts/compose.ts
                              │
                              ▼
                         index.html
```

## 1. What is fixed

Do not treat the following as freeform design variables:

- the eight canonical scene families;
- typography hierarchy and CJK/Latin pairing behavior;
- grid posture, crop logic, text-safe zones, and density rhythm;
- motion vocabulary and intensity scale;
- responsive scene adaptation rules;
- asset role semantics;
- anti-AI-slop constraints;
- visual QA thresholds.

If a brief truly requires a new visual language, extend `DESIGN.md` and add a
new scene preset first. Do not quietly invent a ninth styling system inside
`inputs.json`.

## 2. Canonical narrative arc

The default eight-chapter arc is:

1. `encounter` — monument as silhouette / first contact;
2. `verticality` — scale, rise, rhythm, repeated levels;
3. `structure` — assembly, timber logic, overlay reading;
4. `detail` — dougong/joinery/material macro;
5. `interior` — spatial compression, darkness, interior depth;
6. `time` — weathering, historical duration, traces of repair/use;
7. `preservation` — survey, documentation, conservation logic;
8. `afterimage` — visual release and quiet closure.

A project may rename chapter labels and change copy, but the first-pass template
keeps all eight scene families because the composition and motion rhythm were
designed as a complete sequence.

## 3. Scene presets — never use anonymous A/B/C/D modes

Every chapter chooses exactly one `scene_type` from `scene-presets.json`:

| scene_type | composition | dominant motion |
|---|---|---|
| `encounter` | full-bleed master, left display type, image-overlaid contents | pinned camera push / title exit |
| `verticality` | full-screen crop, upright Chinese title, eave registration | continuous upward camera move |
| `structure` | 12-column asymmetric atlas: wide plate + offset narrow crop | staggered image reveal |
| `detail` | oversize horizontal material strip | scroll-driven horizontal travel; touch scroll on mobile |
| `interior` | full-screen dark portal with a luminous aperture | pinned push toward doorway |
| `time` | same-source overview and magnified detail | pointer wipe with keyboard range alternative |
| `preservation` | observation plate, registration lines, folding field notes | SVG stroke reveal |
| `afterimage` | full-bleed image, large cropped colophon, return link | settle / quiet closure |

A preset owns its default density, image anchor, title anchor, text width,
transition intensity, responsive posture, and motion envelope.

## 4. Gather inputs

Fill `inputs.json` against `schema.ts`. Preserve source status:

- `documented` = explicitly supported by a source supplied or verified for the project;
- `interpretive` = editorial interpretation, clearly not presented as measurement/fact;
- `unverified` = retained internally but never rendered as authoritative copy.

Never invent exact dates, dimensions, floor counts, structural counts, UNESCO
status, restoration dates, or technical construction claims to complete a layout.

## 5. Subject DNA → visual system

Before writing chapter copy, map subject features into `visual_system`:

- `vertical_rhythm`
- `structural_motif`
- `material_character`
- `silhouette_logic`
- `spatial_quality`
- `weathering_character`

These fields influence copy and asset prompts, but **do not unlock arbitrary CSS**.
The page still uses the fixed visual primitives in `DESIGN.md`.

## 6. Asset model

There are two fundamentally different asset classes.

### 6.1 Independent plates

These may be generated separately because they do not have to share one camera:

- documentary plate;
- macro material detail;
- historical/atmospheric plate;
- transition texture;
- diagram base silhouette.

### 6.2 Scene families

A spatial chapter uses one **master scene** as its camera truth. Derived assets
(depth/masks) must come from that master scene or from the same 3D/source render.
Do **not** independently generate background/mid/foreground images and pretend
they are one camera.

Typical family:

```text
scene_master
├── depth_map       derived
├── mask_far        derived
├── mask_mid        derived
├── mask_subject    derived
└── atmosphere      optional independent overlay
```

The starter renders source plates and authored vector overlays. It does not yet consume depth maps or segmented 3D layers; these are optional future extensions, not generated deliverables.

The manifest encodes `asset_class`, `derivation`, `alpha_mode`, `overscan`, and
`responsive_focus` so the composer can distinguish a poster from a spatial scene.

## 7. Image strategies

### `placeholder`

For layout QA only, or when the user explicitly requests it. If no image interface is configured, report that the final imagery is pending; do not present placeholders as a completed visual delivery.

Run:

```bash
node scripts/placeholder.ts ./assets/placeholders
```

Generates real `.svg` placeholder files. No fake `.png` aliases are created.

### `generate`

Use the configured image interface to generate individual motion plates, then map returned filenames into `imagery.provided_assets`. The included adapter uses `od media generate` (the existing daemon HTTP boundary), including asynchronous `media wait` results. It inherits run credentials and policy; never add provider keys to this template.

Run a dry prompt pass first:

```bash
node scripts/imagegen.ts inputs.json --dry-run
```

The prompt system is:

```text
DESIGN.md visual anchor
+ subject DNA / documented facts
+ slot composition
+ camera continuity requirements
```

For real generation, select a configured image model and pass the actual local project files directory:

```bash
node scripts/imagegen.ts inputs.json --execute --model <model-id> --project <project-id> --files-dir <project-files-directory>
node scripts/compose.ts inputs.generated.json out/index.html
```

Use `--slot encounter-master` for a single-slot trial. Results are checkpointed
in `inputs.generated.json`; existing mapped files are reused. Pending jobs are
recorded as `pending-<slot>.json`; resume them with `od media wait`, map the
returned filename, then remove the pending record. Never blindly resubmit.
Provider output extensions are retained; `.webp` in the manifest is only a
manual-import convention, not a file conversion. No model is hardcoded.

Only `scene_master` and `independent` slots are raw generation targets. Derived
masks/depth maps are never separately synthesized as unrelated images.

### `documentary`

Documentary assets require explicit source metadata in `inputs.json`:

- source URL;
- author/owner when known;
- license label;
- license URL when available;
- retrieval date/status.

Unknown license status is not equivalent to rights-cleared.

### `bring-your-own`

Supply paths matching the manifest slot ids.

## Reference direction

Read [references/motion-direction.md](references/motion-direction.md) when planning the image plates and chapter timing. The Shopify and Pear references inform composition and progression, not copied assets or assumed implementation internals.

## 8. Motion system

Motion is deterministic and comes from `motion-runtime.ts` + each scene preset.

Implemented motion is native-scroll, event-driven DOM/CSS:

- Three sticky stages (encounter, verticality, interior), 190svh desktop / 135svh mobile.
- Same-master camera scale / upward crop; independent title exit and registration lines.
- Asymmetric image reveals, horizontal material strip, SVG stroke tracing.
- User-driven overview/detail wipe supports pointer dragging and a labeled native range input.
- Native dialog chapter navigation and disclosure notes remain keyboard-accessible.

Each chapter gets one dominant motion idea. Do not turn every paragraph into an animation.
Interpolation uses delta time, never wheel hijacking. Frames stop when settled or hidden.
`prefers-reduced-motion` and `fallback` remove long pinned runs, retain visible copy,
and leave comparisons and horizontal strips manually operable. No WebGL, true 3D,
depth segmentation, architectural explosion, or video is implemented by this starter.

## 9. Rhythm rules

- Do not use the same text anchor on two adjacent chapters.
- Do not use the same dominant motion family on two adjacent chapters.
- No more than two centered-title chapters across the whole page.
- At least three distinct composition families must be visible across eight chapters.
- A high-intensity transition (`3`) cannot be followed by another `3`.
- Use quiet sections deliberately; not every chapter needs a spectacle transition.

## 10. Responsive art direction

Responsive behavior is a design rule, not a late CSS shrink pass.

Each asset slot carries desktop/mobile focus points. Scene presets specify whether
mobile uses crop, stack, poster fallback, or reduced-motion simplification.
Local asset paths resolve relative to the input file; the composer copies used files beside the exported HTML and fails on missing media. It preserves semantic order even when the visual scene changes.

## 11. Performance budget

Default ceilings for the whole first load:

- no more than 2 scene masters eager-loaded;
- all later media lazy-loaded;
- generated raster target: AVIF/WebP where production tooling permits;
- max desktop texture dimension: 2048px for ordinary planes, 3072px only for the hero master;
- max mobile source dimension: 1440px;
- unload or suspend non-adjacent heavy scenes in a production WebGL implementation;
- no autoplay video unless explicitly required by the brief.

This starter template uses DOM/CSS transforms and `<img>` assets, so it remains
functional without a GPU-heavy runtime.

## 12. Compose

```bash
node scripts/compose.ts inputs.example.json example.html
```

`example.html` is a generated artifact. **Do not hand-edit it.** Change
`styles.css`, `motion-runtime.ts`, `scene-presets.json`, manifest, or input data,
then rebuild.

## 13. Visual QA

Before delivery, run the checklist in `qa/VISUAL_QA.md` at:

- 1440×900;
- 1920×1080;
- 390×844.

Fail the build review if three consecutive chapters share the same basic
composition, if text sits over high-detail imagery without protection, or if the
site reads as a generic luxury/SaaS template with heritage content swapped in.

## 14. Boundaries

- Do not use glassmorphism, purple/blue SaaS gradients, fake calligraphy, lantern
  decoration, random gold, KPI/stat-card grids, or generic rounded feature cards.
- Do not independently generate depth layers of one camera scene.
- Do not use raw generated images as dimensioned architectural drawings.
- Do not add arbitrary typefaces/colors in `inputs.json`.
- Do not hand-edit `example.html`.
- Do not silently treat unknown-license documentary media as cleared for use.

## Files

```text
chinese-heritage-motion/
├── SKILL.md
├── README.md
├── DESIGN.md
├── schema.ts
├── scene-presets.json
├── styles.css
├── motion-runtime.ts
├── inputs.example.json
├── example.html              # generated, do not edit
├── package.json
├── scripts/
│   ├── compose.ts
│   ├── placeholder.ts
│   ├── imagegen.ts
│   └── documentary.ts
├── assets/
│   ├── asset-manifest.json
│   ├── imagegen-prompts.md
│   └── placeholders/*.svg
└── qa/
    └── VISUAL_QA.md
```
