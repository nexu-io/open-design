---
name: example-scene3d
description: Author 3D models, scenes, textures, sprite sheets, flipbook animations, skyboxes, and vector assets as code, then compile them deterministically through headless Blender with `od scene3d compile`. Use when the user asks for a 3D model, prop, scene, asset kit, texture, sprite sheet, flipbook, skybox, or a GLB/USD/OBJ export.
---

# 3D Scene & Assets

The asset is **code**, and code compiles. You write the source, run one
command, and the compiler tells you what is wrong in stable issue codes.
You never eyeball geometry and hope.

The full authoring reference is the bundled `scene3d` design template
(`design-templates/scene3d/SKILL.md`) — conventions, the `scene3d.json`
contract, and the complete issue-code table. This file is the scenario
entry point: what to build for each asset class, and the loop to run.

## The loop

```
write sources  →  od scene3d compile  →  read <scene3d-report>  →  fix by code  →  compile again
```

One command runs the whole pipeline: parse → build (headless Blender) →
proof render → export → lint → manifest. **Do not look for separate
"check naming" or "render preview" tools.** They do not exist on purpose;
a compiler reports its own diagnostics. Which containers ship is the
contract's delivery policy (`export.formats`) — you write geometry and
materials, never export calls.

```bash
od scene3d compile --project "$OD_PROJECT_ID" --scene scenes/<name> --agent-message
```

While you are still fixing structure, skip the expensive stages:

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
adjudicates against the measured build (`S3D-E-701` when the artifact is
not what you claimed). A directory of bare downloaded asset files
compiles as-is (`mesh` kind) with derived staging.
The camera and lights are derived from the solved bounds; z-fighting is
structurally impossible. Drop to a hand-written `build.py` only for
geometry the language cannot express (booleans, curves, modifiers, custom
topology) — never both in one scene (`S3D-E-102`). The full language
reference lives in the design template.

## Asset classes

All of these are one surface. What changes is what the source builds and
which conventions the `scene3d.json` contract enforces.

**3D model / prop.** A part hierarchy in real geometry: named parts
(`prp_crate_body`), applied scale, a Principled material per part with
metallic pinned to 0 or 1, a hero camera, and a key light. In `scene.json`
all of that is the default output; claim `parts`, `grounded` and
`watertight` so the compile proves it.

**Full scene.** Several props parented under named collections, a shot
camera, and a light rig. Watch `S3D-E-324` (z-fighting): coplanar surfaces
must be separated by at least 1e-3, which is the single most common defect
in generated scenes.

**Texture / material.** Default: write a GPU shader kernel in `scene.json`
(`shaders` block — the compiler bakes baseColor/roughness/metallic/
emission/height→normal maps and wires them into the material). The
`build.py` node-tree route remains for graphs the kernel language cannot
express. Render on a test sphere so the proof frames show the material
rather than the model. Textures need a UV layer or the compile errors with `S3D-E-441`; the UV/material rules (island overlap, texel density, power-of-two textures, missing texture files) are governed by `conventions.uv` and `conventions.textures` in `scene3d.json`.

**Sprite sheet / flipbook.** Pack the frames into a square power-of-two
atlas on a uniform grid — 4×4 at 1024px (256px cells) is the shape real VFX
sheets ship in, and a consumer samples it by cell index, so any cell that
drifts off the grid tears the animation. Drive the frames from the proof
stage: set `proof.turntableSteps` to the frame count so they come out
deterministic and evenly spaced, then compose the atlas. Two things matter
more than they look: render the element on **transparent** background (VFX
sheets are tinted and additively blended downstream, so bake no background
and no color you want the consumer to choose), and make sure the motion
actually progresses — `S3D-W-384` fires when the frames never change, and a
flipbook whose frames are identical is not an animation.

**Skybox / cubemap.** Six faces named `<name>_ft`, `_bk`, `_up`, `_dn`,
`_lf`, `_rt`, all the same square resolution, rendered from a single point
with a 90° camera so the seams line up. Ship day and night variants as
separate face sets rather than one set you recolor. Name the outputs by
face — a consumer that has to guess the axis order gets an inside-out sky.

## Non-negotiables

- **Name every object.** `Cube.001` and `Empty` are hard errors
  (`S3D-E-301`), because they are the signature of geometry that fell out
  of a generative loop and was never humanized.
- **Metallic is 0 or 1** (`S3D-E-341`). Values in between are not
  physically meaningful.
- **Ship a camera and a light.** The proof render is your only eyes on the
  asset. For a ~1m prop, a key AREA light around 50–80W gives visible
  shadow falloff; `S3D-W-385` means blown out — quarter the energy. Set the
  backdrop with `proof.background` in the contract, never with world
  node-graph code.
- **Look at the proof frames before you call it done.** They are measured —
  a black render fails with `S3D-E-383` — but "renders something" is not
  the same as "renders the thing the user asked for".

## Deliverables

A clean compile leaves everything under `out/`: the orbitable kit viewer
(`kit.html`), the turntable player (`index.html`), the measured proof
frames, `manifest.json` (part tree, materials, scale metrics, issue codes),
and whatever containers the contract declares.

If the user drags parts around in the viewer, their edits are saved to
`tweaks.json` beside `build.py` and replayed on every compile. Treat that
file as user intent: fold the deltas into the build script when you next
touch the scene, then delete it.
