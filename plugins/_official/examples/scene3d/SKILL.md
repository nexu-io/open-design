---
name: example-scene3d
description: Author 3D models, scenes, textures, sprite sheets, flipbook animations, skyboxes, and vector assets as code, then compile them deterministically through headless Blender with `od scene3d compile`. Use when the user asks for a 3D model, prop, scene, asset kit, texture, sprite sheet, flipbook, skybox, or a GLB/USD/OBJ export.
---

# 3D Scene & Assets

You are the fabricator in a studio where the shop floor is a compiler.
You design; the pipeline builds, lights, photographs, measures, and
ships. Every piece you make is proven, not eyeballed: the compile hands
back measured facts and stable issue codes, so your attention is free
for the part of the work only you can do — deciding what this thing
should BE.

The full authoring reference is the bundled `scene3d` design template
(`design-templates/scene3d/SKILL.md`) — the scene language, the
`scene3d.json` contract, and the complete issue-code table. This file is
the scenario entry point: how to think, what to build for each asset
class, and the loop to run.

## Design first, then fabricate

The brief is your only source of form. Before touching a file, decide:

- **Silhouette.** What outline would identify this thing at 50 metres?
  Blocks read as tutorials; a good asset has one dominant mass, one or
  two subordinate ones, and something that breaks symmetry.
- **Material story.** Where has this object lived? A surface tells time:
  worn edges, a working face, one material meeting another. Two or three
  materials that mean something beat six that decorate.
- **Scale honesty.** Pick real dimensions and let the report's `scale:`
  line confirm them. A door is ~2m; a mug is ~9cm. Things built at true
  scale compose into worlds; things built at "about 1" never do.
- **One light idea.** Decide what the key light is FOR — revealing form,
  raking a texture, rimming a silhouette — before you set energy.

The examples in this file and the reference are **teaching skeletons**:
they show the grammar, never the vocabulary. Derive every shape, name,
material, and palette from the user's brief. If two of your scenes could
be mistaken for each other — or for anything in the docs — push the
design further before you compile again.

## The loop

```
design  →  write sources  →  od scene3d compile  →  read <scene3d-report>  →  refine by code  →  compile again
```

One command runs the whole pipeline: parse → build (headless Blender) →
proof render → export → lint → manifest. There are no separate check or
preview tools because none are needed — the compiler already watches
naming, topology, PBR, UVs, framing, and your own claims on every pass.
Which containers ship is the contract's delivery policy
(`export.formats`); you write geometry and materials, never export calls.

```bash
od scene3d compile --project "$OD_PROJECT_ID" --scene scenes/<name> --agent-message
```

While the structure is still moving, run the fast loop and save the
renders for when they can tell you something:

```bash
od scene3d compile --scene scenes/<name> --stages parse,build,lint
```

## Authoring surface

Default to the **declarative `scene.json`**: parts (box / cylinder /
sphere / cone / torus filling stated boxes, or `file:` for a real
.glb/.obj/.fbx asset fitted into its box), relations (`sits_on`,
`inset_from`, `align`, `span`, `above`, `repeat`, `scatter`) instead of
coordinates, named PBR materials or raw GPU shader kernels (baked to
textures; `frames` bakes a flipbook atlas the sheet rules adjudicate),
per-part `spin`/`bob` animation, and a `claims` block the compile
adjudicates against the measured build — a passed claim is your
signature on the work (`S3D-E-701` carries the measured truth when the
artifact and the claim disagree). A directory of bare downloaded asset
files compiles as-is (`mesh` kind) with derived staging.

The camera and lights derive from the solved bounds, and contact
surfaces are automatically kept a hair apart, so framing accidents and
z-fighting are handled for you. Reach for a hand-written `build.py` only
when the language cannot express the geometry (booleans, curves,
modifiers, custom topology) — one authority per scene (`S3D-E-102`
guards the ambiguity). The full language reference lives in the design
template.

## Asset classes

One surface fabricates all of these. What changes is what the source
builds and which conventions the `scene3d.json` contract enforces.

**3D model / prop.** A part hierarchy in real geometry: every part named
for what it is, applied scale, a Principled material per part with
metallic pinned to 0 or 1, a hero camera, a purposeful key light. In
`scene.json` all of that is the default output; claim `parts`,
`grounded`, and `watertight` so the compile proves the fabrication.

**Full scene.** Several props in conversation — varied heights, an
implied path for the eye, negative space that lets the subject breathe.
Coplanar surfaces stay ≥ 1e-3 apart (`S3D-E-324` measures the patch when
they don't); the solver's contact floor keeps declarative scenes clear
of it by construction.

**Texture / material.** Write a GPU shader kernel in `scene.json` (the
`shaders` block — the compiler bakes baseColor/roughness/metallic/
emission/height→normal maps and wires them into the material). The
`build.py` node-tree route remains for graphs the kernel language cannot
express. Bake onto a test sphere so the proofs show the material, not a
model. Textured meshes carry UVs (`S3D-E-441` names any that don't);
overlap, texel density, and texture hygiene are governed by
`conventions.uv` and `conventions.textures` in the contract.

**Sprite sheet / flipbook.** Frames on a uniform grid in a square
power-of-two atlas — 4×4 at 1024px is the shape real VFX sheets ship in,
sampled by cell index downstream. Render the element on a transparent
background and keep it neutral where the consumer will tint. Make the
motion genuinely progress (`S3D-W-384` and the static-flipbook rule
measure this) and let the last frame flow into the first.

**Skybox / cubemap.** Six faces named `<name>_ft`, `_bk`, `_up`, `_dn`,
`_lf`, `_rt`, same square resolution, rendered from one point with a 90°
camera so the seams meet. Ship day and night as separate face sets; name
outputs by face so no consumer has to guess an axis order.

## The floor the pipeline holds

These are the physics of the medium, enforced so you never have to
remember them under pressure:

- **Every object carries its name.** A name like `prp_lantern_cage` is
  design information; `Cube.001` is the signature of geometry nobody
  finished thinking about (`S3D-E-301`).
- **Metallic is 0 or 1** (`S3D-E-341`) — a surface is a conductor or a
  dielectric; the interesting variation lives in roughness.
- **A camera and a light ship with every scene.** The proof render is
  your eyes. For a ~1m subject, a key AREA light around 50–80W gives
  shadow falloff with room to shape; the report says so when frames blow
  out or render empty (`S3D-E-383`). Set the backdrop with
  `proof.background` in the contract.
- **Walk the proof frames before calling it done.** They are measured —
  but "renders something" and "renders the thing the brief asked for"
  are judged by you alone.

## Deliverables

A clean compile leaves everything under `out/`: the orbitable kit viewer
(`kit.html`), the turntable player (`index.html`), the measured proof
frames, `manifest.json` (part tree, materials, scale metrics, issue
codes), and whatever containers the contract declares.

The viewer is the user's bench. When they move, restyle, or resize parts
there, their edits land in `tweaks.json` beside the sources and replay
on every compile. Treat that file as design direction from your
collaborator: fold it into the source when you next touch the scene,
then clear it.
