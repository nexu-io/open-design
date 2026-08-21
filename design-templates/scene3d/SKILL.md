---
name: scene3d
en_name: "Scene 3D"
zh_name: "3D 场景"
description: |
  Model 3D objects and scenes as code and compile them deterministically:
  write a declarative scene.json (parts + relations + claims — no
  coordinates, no scripts), or a Blender Python build script / USDA layers
  for full control, then run ONE compile that parses, solves, builds
  headless, lints, renders turntable proof frames, exports USD + GLB, and
  emits a part manifest. Every problem comes back as a stable issue code you
  fix and recompile against. Use when asked to build a 3D model, prop,
  asset, scene, turntable, or to export GLB/USD geometry.
en_description: |
  Model 3D objects and scenes as code and compile them deterministically
  through headless Blender, with a linted part manifest and turntable proof
  renders. Trigger keywords: 3D model, 3D scene, prop, asset, GLB, USD,
  turntable, Blender.
zh_description: "用代码建模 3D 物体与场景，通过无头 Blender 确定性编译，产出带零件清单的 USD/GLB 与转台校样图。"
triggers:
  - "3d model"
  - "3d scene"
  - "3d asset"
  - "blender"
  - "openusd"
  - "usda"
  - "glb"
  - "gltf"
  - "turntable"
  - "prop model"
  - "scene3d"
od:
  mode: prototype
  surface: web
  scenario: 3d
  category: 3d-assets
  preview:
    type: html
  design_system:
    requires: false
  example_prompt: |
    Model a tide-worn harbor beacon: a rough stone base, a tapering iron
    tower, and a warm glass lamp room that actually glows.
---

# Scene 3D

A 3D scene is a **code project**, and you are its fabricator. You design
and write the source; the compiler builds it through headless Blender,
lights it, photographs it, measures every part, and reports back in
stable issue codes. Nothing is eyeballed and hoped — the facts arrive,
you refine, and the piece gets provably better every pass. That freedom
is the point: the pipeline carries the physics so your attention can
stay on the design.

**Design before fabrication.** The brief is your only source of form:
derive every silhouette, dimension, material, and name from what the
user actually asked for. The examples in this reference are teaching
skeletons — they demonstrate grammar, never vocabulary. A scene that
resembles a doc example is a scene that wasn't designed yet.

## The loop

```
design   →   write / edit sources   →   od scene3d compile   →   read <scene3d-report>   →   refine by code   →   compile again
```

There is **one** command, and it is enough. `compile` parses, builds
through headless Blender, lints naming / topology / PBR / units /
integrity, renders proof frames, measures those frames, exports every
deliverable the contract declares, and writes the manifest — all in one
pass, every pass. No separate "check z-fighting", "validate naming", or
"render preview" tools exist because none are needed; the compiler
watches all of it at once, which is exactly what frees you to think
about the asset instead of the checklist. **You never choose or mention
file formats** — you write geometry and materials; which containers ship
is the project's delivery policy (`export.formats` in `scene3d.json`).

## 1. Lay out the scene

One scene is one directory. A project may hold several.

```
scenes/<name>/
├── scene.json       # the source: declarative parts + relations + claims
├── scene3d.json     # the conventions contract the linter is configured from
└── .scene3d/        # generated — cache and the compiled build script
```

`scene.json` is the default authoring surface. The escape hatches, for
geometry the language cannot express yet: a `build.py` (raw Blender Python),
or `*.usda` layers authored directly. Pick **one** entry point per scene —
a directory with both `scene.json` and `build.py` is two authorities over
the same geometry and is rejected with `S3D-E-102`.

**Real downloaded assets are sources too.** A scene directory holding only
`.glb`/`.gltf`/`.obj`/`.fbx` files compiles as-is: the assets import at
native scale, a framed camera and sun are derived if the files brought
none, and the full census/lint/proof/export runs — the compiler as an
inspection and repackaging tool for any asset from the internet. For
third-party files, relax the contract to the inspection posture
(`naming.objectPattern: "^.+$"`, `forbidDefaultNames: false`,
`geometry.allowOpenMeshes: true` — real game meshes are routinely open) so
the report describes the asset instead of scolding its author.

## 2. Write `scene.json` — the scene language

Say what you mean, never where things go. A scene is **parts** (each a
shape filling a stated box) plus **relations** between them; the compiler
solves the relation graph into coordinates, emits the Blender program,
builds it, and then **adjudicates your `claims` against what was actually
built**. You type dimensions and joint tolerances; you never type a
placement coordinate, and you never do arithmetic.

```json
{
  "schemaVersion": 1,
  "materials": {
    "mtl_hull": { "baseColor": [0.24, 0.28, 0.3], "roughness": 0.55, "metallic": 1 },
    "mtl_signal": {
      "baseColor": [0.9, 0.35, 0.2],
      "emission": [1, 0.4, 0.15], "emissionStrength": 5
    }
  },
  "parts": [
    { "id": "prp_deck", "size": [1.8, 1.1, 0.1], "material": "mtl_hull" },
    { "id": "prp_vent", "size": [0.14, 0.14, 0.5], "shape": "cylinder", "material": "mtl_hull" },
    { "id": "prp_mast", "size": [0.08, 0.08, 0.7], "shape": "cylinder", "material": "mtl_hull" },
    { "id": "prp_beacon", "size": [0.2, 0.2, 0.2], "shape": "sphere", "material": "mtl_signal" }
  ],
  "relations": [
    { "type": "at", "part": "prp_deck", "center": [0, 0, 0.05] },
    { "type": "sits_on", "part": "prp_vent", "on": "prp_deck" },
    { "type": "inset_from", "part": "prp_vent", "from": "prp_deck", "faces": ["x-", "y-"], "by": 0.12 },
    { "type": "repeat", "part": "prp_vent", "count": 3, "along": "x", "every": 0.55 },
    { "type": "sits_on", "part": "prp_mast", "on": "prp_deck" },
    { "type": "inset_from", "part": "prp_mast", "from": "prp_deck", "faces": ["x+", "y+"], "by": 0.2 },
    { "type": "sits_on", "part": "prp_beacon", "on": "prp_mast", "embed": 0.03 },
    { "type": "align", "part": "prp_beacon", "to": "prp_mast", "axes": ["x", "y"] }
  ],
  "light": "studio",
  "claims": { "parts": 6, "grounded": true, "watertight": true, "maxHeight": 1.05 }
}
```

That is a complete scene — one authored vent becomes a row of three via
the `repeat`, the beacon seats into its mast by a stated 3cm, the camera
and key light derive from the solved bounds, and the compile fails
unless the built artifact really has 6 watertight, grounded parts under
1.05 m. It is also deliberately generic: a grammar demo, not a design.
Your parts, names, proportions, and palette come from the brief in front
of you.

**Parts.** `size` is the part's axis-aligned box in metres; `shape` says
what fills it — `box` (default), `cylinder`, `sphere`, `cone`, `torus` —
and every shape fills its box exactly, so relations behave identically for
all of them. `axis` (default `"z"`) orients a cylinder/cone's length or a
torus's hole; `flip: true` points a cone downward. A torus must be circular
across its axis and its ring extent must exceed twice its tube extent.

Or fill the box with a **real asset**: `"file": "assets/helmet.glb"`
(scene-relative `.glb`/`.gltf`/`.obj`/`.fbx`) imports the file, joins its
meshes into one part named by your id, drops stowaway cameras/lights, and
fits it inside the box — uniform scale, centred, resting on the box
bottom — so every relation works on it exactly like a primitive. Its own
materials and textures are kept; `file` excludes `shape` and `material`.

**Materials.** Named PBR specs: `baseColor` [r,g,b] 0-1, `roughness`,
`metallic` (0 or 1 only), optional `emission` + `emissionStrength`, optional
`alpha`. A part may only reference a declared material — a typo is a parse
error, not a grey render.

**Relations.**

| Relation | Meaning |
|---|---|
| `at` | absolute anchor; every scene needs at least one |
| `sits_on` (`embed`) | rest on top of a part, sunk in by `embed` so faces overlap |
| `above` (`clearance`) | float over a part with a measured gap |
| `align` (`axes`) | centre on another part along the named axes |
| `inset_from` (`faces`, `by`) | pull named faces in from a reference part's faces |
| `span` (`from`,`to`,`axis`,`embed`) | stretch between two parts, biting into both |
| `repeat` (`count`,`along`,`every`) | array into instances at a centre-to-centre pitch |
| `scatter` (`on`,`count`,`seed`,`minGap`,`sizeJitter`) | strew instances across a part's top — rocks, plants, debris |

Contact offsets are floored at 1 mm — two surfaces can never land exactly
flush, so z-fighting is structurally impossible, including between `repeat`
neighbours. Two `repeat`s on one part compose into a grid; instances are
named `part_2`, `part_3`, … and issues about them point back at the line
you wrote. Relations can be written in any order; the solver is a fixpoint.

`scatter` owns its part's entire placement (no other relation needed): the
layout is a pure function of (`seed`, part, support) via a path-addressed
random stream, so recompiles are identical and adding unrelated parts
cannot reshuffle it. Instances stay fully on the support, keep `minGap`
clear of each other AND of every earlier scatter on the same support, and
a region too small for the count fails loudly instead of placing fewer.

**Camera and light.** Derived from the solved bounds — the shot always
contains the subject at any scale. Steer with
`"camera": { "azimuthDeg": 30, "elevationDeg": 20, "distance": 3 }` and
`"light": "studio" | "sun"`; you cannot replace the derivation with raw
coordinates, on purpose.

**Shaders.** Raw GPU kernels as compiled sources. Write a pure kernel in a
`.glsl` file — `vec4 kernel(vec2 uv)` — declare it and its uniforms in the
spec, and reference it from a material:

```json
"shaders": {
  "shd_rust": {
    "kernel": "rust.glsl",
    "size": 512,
    "uniforms": { "uScale": 6, "uColorA": [0.72, 0.45, 0.2] },
    "outputs": ["baseColor", "roughness"]
  }
},
"materials": { "mtl_rusted": { "shader": "shd_rust", "metallic": 0 } }
```

The compiler owns everything but the kernel body: uniform declarations
(names are `uCamelCase`, values float/int/vec2-4, budgeted against the
GPU's push-constant limit), the deterministic noise stdlib (`s3d_hash21`,
`s3d_vnoise`, `s3d_fbm`, `s3d_voronoi` — integer-hash based, identical on
every GPU), and the wrapper. The kernel is compiled BY THE DRIVER, executed
offscreen, scanned for NaN/Inf, and baked to textures wired into the
material — so the shader shows up in the census, the proof render, the GLB,
and the kit viewer. Extra outputs are extra kernel functions
(`vec4 kernel_roughness(vec2 uv)`). Outputs: `baseColor`, `emission`,
`roughness`, `metallic`, and `height` — height is special: you author the
height field, the compiler bakes it AND derives a wrap-aware tangent-space
normal map from it (`normalStrength` 0-10 steers it), wired through a
Normal Map node. Never write `#version`, `main()`, `uniform` declarations,
or samplers in a kernel — S3D-E-801 explains each. Driver rejections come
back as S3D-E-802 with the driver's own log; a kernel that runs but
produces non-finite pixels fails S3D-E-804 with the count and location.
A `material` on a `file` part overrides the imported asset's own materials
wholesale — the retexture-a-download move — so a shader material can
reskin any real asset.

**Time is a kernel dimension.** `"frames": 16` (2/4/8/16/32/64) bakes the
kernel once per time cell with the system uniform `uS3dTime` ∈ [0,1) into
one power-of-two atlas (grid derived, 2px anti-bleed inset structural) —
and the atlas is adjudicated by the 2D SHEET rules like any hand-made
flipbook: a kernel that ignores `uS3dTime` fails the static-flipbook rule,
blank cells fail the blank-frame rule. Loop time through the unit circle
(`cos/sin(uS3dTime * 6.2832)`) so the last frame flows into the first. A
frames shader is a sheet product — materials cannot reference it.

**Animation.** Declarative motion; the compiler owns the keyframes:
`"spin": { "axis": "z", "seconds": 5 }` (one full turn, linear, looped) and
`"bob": { "amplitude": 0.05, "seconds": 4 }` (vertical sine, looped) on any
part. Any motion makes the compile derive as an `animation` asset and the
GLB carries the clip. Rigged imports (`mesh` kind) keep their skeletons:
the census reports `armatures` (name + bone count) and
`animation.actionNames` (the real clips), so a downloaded rig's contents
are report facts, not DCC archaeology.

**Claims.** The contract with reality, checked against the measured census
— never against the spec: `parts`, `maxTriangles`, `grounded`, `maxHeight`,
`footprint` [x,y], `watertight`, `materialsUsed`. A failed claim is
`S3D-E-701` with the measured truth; a claim the census cannot adjudicate is
`S3D-W-701`, reported rather than silently passed. Claim what matters and
let the compiler prove you honest.

## 2b. Escape hatch: `build.py`

For geometry the language cannot express (booleans, curves, modifiers,
custom topology), write plain Blender Python. The runner factory-resets
first, so start from an empty scene and build everything you need,
including the camera and lights.

```python
import bpy, math

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
body = bpy.context.object
body.name = "prp_press_frame"         # name every object for what it is
body.scale = (0.6, 0.5, 1.2)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

mat = bpy.data.materials.new("mtl_press_iron")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.16, 0.17, 0.19, 1.0)
bsdf.inputs["Roughness"].default_value = 0.45
bsdf.inputs["Metallic"].default_value = 1.0       # conductor or dielectric
body.data.materials.append(mat)

bpy.ops.object.camera_add(location=(4.0, -3.6, 2.4))
cam = bpy.context.object
cam.name = "cam_press_shot"
cam.rotation_euler = (math.radians(68), 0, math.radians(48))
bpy.context.scene.camera = cam                     # the proofs are your eyes

bpy.ops.object.light_add(type="AREA", location=(4, 4, 6))
light = bpy.context.object
light.name = "lgt_key"
light.data.energy = 150
```

The floor the linter holds for this path:

- **Every object carries its name.** A name is design information;
  `Cube.001`, `Empty`, `Collection` mark geometry nobody finished
  thinking about, and the gate returns them to you.
- **Apply scale** after resizing, so exported transforms stay clean.
- **Metallic is 0 or 1** — a surface is a conductor or a dielectric; put
  the expressive range into roughness.
- **Ship a camera and at least one light.** The proof render is your only
  eyes on the model.

## 3. Write `scene3d.json`

This is the contract — the single place conventions live, read by both you
and the linter. No prose reminders to "please name things properly"; the
gate is configured from this file.

```json
{
  "schemaVersion": 1,
  "conventions": {
    "naming": {
      "objectPattern": "^[a-z]{3}_[a-z0-9_]{2,60}$",
      "forbidDefaultNames": true,
      "partPrefixes": ["prp_", "cam_", "lgt_", "mtl_"]
    },
    "units": { "metersPerUnit": 1, "upAxis": "Y" },
    "pbr": { "metallicValues": [0, 1], "roughnessRange": [0, 1] },
    "uv": {
      "require": "textured",
      "maxOverlapFraction": 0.05,
      "texelDensity": { "target": 512, "maxRatio": 4 }
    },
    "textures": { "requirePowerOfTwo": true, "maxSize": 4096 },
    "geometry": { "requireAppliedScale": true }
  },
  "proof": {
    "engine": "BLENDER_EEVEE",
    "resolution": 512,
    "turntable": true,
    "turntableSteps": 6
  }
}
```

Every section is optional; omitted sections fall back to the defaults.

### Delivery targets

`"target": "<name>"` at the top of `scene3d.json` applies a preset bundle of
conventions for a delivery target; anything you write in `conventions` still
wins. Targets: `unity`, `unreal`, `godot`, `web`, `3d_print`, `voxel`,
`minecraft`.

**Voxel** (`"target": "voxel"`) is generic, engine-AGNOSTIC blocky-art
discipline — the MagicaVoxel / Goxel / Qubicle → Unity/Godot/Unreal workflow.
It turns on grid alignment (W-970), grid-snapping of `repeat`/`scatter`, and the
pixel-art texel-density authority, and ships the normal GLB/OBJ/USD deliverables
any engine imports. It imposes NO Minecraft format rule — no cuboid-only, no
element bounds, no rotation restriction — so a voxel sphere or a 3-metre dome is
fine. Tune the grid with `conventions.voxel.grid.size` and the resolution with
`conventions.voxel.pxPerBlock`.

**Minecraft** (`"target": "minecraft"`) IS voxel PLUS the vanilla model format:
it implies everything above and adds the format rules (cuboid elements W-971,
legal rotation W-972, element bounds W-973, the structure class) and emits the
JSON the game loads. Use it only when the destination is Minecraft; for any
other engine use `voxel`.

- **Author on the pixel grid.** One block = one metre = 16 px, so every size
  and `at` position should be a multiple of `1/16` m (0.0625). Build from `box`
  shapes. Height is the **Z** axis (scene.json is Blender Z-up), so a standing
  model stacks up Z and rests its lowest part on `z = 0`.
- **The voxel rules** (all warnings, silent off-target): `W-970` off-grid
  vertex (shimmers in-game), `W-971` not a single cuboid, `W-972` illegal
  rotation, `W-973` outside the −1..2-block element space. Flush-stacked cubes
  are fine (they do not z-fight under culling) — overlapping is optional.
- **Dialect.** `conventions.minecraft.dialect` is `"java"` (default → emits
  `out/minecraft/model.json` + per-material textures) or `"bedrock"` (→
  `geometry.json` + one atlas texture). `grid.size`, `pxPerBlock`, and
  `elementBounds` are tunable in the same `minecraft` block for HD packs or
  non-vanilla formats.
- **Import to refine.** Drop a Java `model.json` or a Blockbench `.bbmodel`
  into the scene dir *instead of* a `scene.json`. The compile converts it to a
  scene.json spec (written to `.scene3d/imported.scene.json` — promote it to
  `scene.json` and iterate), lints it, and re-emits it. Rotated elements have
  no axis-aligned scene.json form and are reported (`W-207`), never imported
  wrong.

```json
{ "schemaVersion": 1, "target": "minecraft",
  "conventions": { "minecraft": { "dialect": "java", "pxPerBlock": 16 } } }
```

## 4. Compile

```bash
od scene3d compile --project "$OD_PROJECT_ID" --scene scenes/<name> --agent-message
```

Useful flags while iterating:

- `--stages parse,build,lint` — skip rendering and exporting while you are
  still fixing structure. Much faster.
- `--no-turntable` — one still instead of an orbit.
- `--fail-on warning` — treat warnings as failures for a final pass.
- `--json` — machine-readable envelope for scripting.

Stages are cached by content hash, so an unchanged scene recompiles almost
instantly and only the stages whose inputs moved re-run.

## 5. Read the report, fix by code

```
<scene3d-report ok="false" errors="2" warnings="1">
source: bpy (build.py)
stages: parse ran 1ms · build ran 1446ms · proof ran 6554ms · lint ran 2ms · export ran 1805ms · manifest ran 2ms
parts (4): cam_press_shot(camera), lgt_key(light), prp_press_frame(mesh:8v/6f), prp_press_platen(mesh:8v/6f)

errors:
  S3D-E-324 [prp_press_frame <-> prp_press_platen] coplanar overlap (6 face pair(s))
    fix: offset one surface by at least 1e-3
  S3D-E-341 [mtl_press_brass] metallic 0.5 is not in 0, 1

verdict: fix every error above, then compile again.
</scene3d-report>
```

Fix the **codes**, not the prose. Each code has exactly one remedy.

## Issue codes

| Code | Meaning | Remedy |
|---|---|---|
| `S3D-E-101` | no scene sources found | add `build.py` or a `.usda` layer |
| `S3D-E-102` | ambiguous sources | keep one entry point per scene |
| `S3D-E-103` | USDA parse error | fix the layer syntax at the reported line |
| `S3D-E-104` | invalid `scene3d.json` | fix the contract shape |
| `S3D-E-105` | invalid `scene.json` | fix the spec at the reported JSON path |
| `S3D-E-106` | relation graph did not resolve | anchor the part / break the cycle the message names |
| `S3D-W-106` | the solver adjusted an offset (contact floor, flush repeat pitch) | accept it, or author a non-flush value |
| `S3D-E-201` | no Blender runtime | install Blender or `pip install bpy` |
| `S3D-E-202` | build script raised | read the traceback in the message |
| `S3D-E-203` | stage timed out | simplify the scene or raise the timeout |
| `S3D-E-204` | runner emitted a malformed census | recompile; persistent = runner bug, report it |
| `S3D-E-205` | export failed | read the exporter's reason in the message |
| `S3D-E-206` | proof render failed | read the renderer's reason in the message |
| `S3D-W-207` | a real asset imported degraded (missing .mtl, no geometry) | repair the source file or its companions — the import is never mutated |
| `S3D-E-301` | Blender default name | rename the object |
| `S3D-E-302` | name fails the pattern | rename to match `objectPattern` |
| `S3D-E-303` | missing required prefix | prefix with `prp_` / `cam_` / `lgt_` |
| `S3D-W-301` | default-style name (warn tier) | rename it |
| `S3D-E-304` | Blender default collection name | rename the collection |
| `S3D-E-305` | collection name fails the pattern | rename to match `collectionPattern` |
| `S3D-E-306` | hierarchy too deep | flatten the parenting |
| `S3D-E-321` | non-manifold edges | close the mesh; remove duplicate faces |
| `S3D-E-322` | NaN transform | a location/rotation/scale went non-finite |
| `S3D-E-323` | degenerate scale | a scale axis is zero |
| `S3D-E-324` | z-fighting | separate coplanar surfaces by ≥ 1e-3 |
| `S3D-E-341` | metallic not 0 or 1 | pick a conductor or a dielectric |
| `S3D-E-342` | roughness out of range | clamp into `roughnessRange` |
| `S3D-W-342` | IOR outside the plausible range | fix the IOR or widen `iorRange` |
| `S3D-E-361` | units mismatch | fix `metersPerUnit` in the stage header |
| `S3D-E-362` | up-axis mismatch | fix `upAxis` |
| `S3D-E-381` | no camera | add one and set it as the scene camera |
| `S3D-E-382` | empty mesh | the object has no geometry |
| `S3D-E-383` | **proof frame rendered empty** | the camera sees nothing — check aim, lights, and that the subject is in front of it |
| `S3D-W-205` | a requested export format could not be written | this Blender build lacks that exporter; drop it from `export.formats` |
| `S3D-W-321` | n-gons | quads/tris export more predictably |
| `S3D-W-322` | zero-area faces | remove them |
| `S3D-W-323` | z-fighting scan did not cover the whole scene | it hit its cap — silence is not proof there is none; `detail.skipped` says what was excluded |
| `S3D-W-341` | material at factory defaults | actually author the material |
| `S3D-W-343` | texture with no UV layer | unwrap the mesh |
| `S3D-W-344` | unused material | bind or delete it |
| `S3D-W-345` | object with no material | assign one |
| `S3D-W-361` | non-uniform scale | apply the scale |
| `S3D-W-381` | no lights | add a key light |
| `S3D-W-382` | object outside the frustum | move it into frame |
| `S3D-W-383` | subject fills < 1% of frame | tighten the framing |
| `S3D-W-384` | turntable frames identical | the camera is not moving |
| `S3D-E-325` | part sinks below the ground | raise it, or declare it exempt |
| `S3D-W-325` | part floats above the ground | drop it, or declare it exempt |
| `S3D-E-326` | mesh over the triangle budget | split or decimate it |
| `S3D-W-326` | scene over the triangle budget | decimate the heaviest parts |
| `S3D-E-401` | exported stage has no `kind` | not a valid USD model |
| `S3D-E-402` | stage up-axis ≠ contract | the asset lands rotated |
| `S3D-E-403` | stage units ≠ contract | fix `metersPerUnit` at the source |
| `S3D-E-404` | exporter default name in the USD | name the mesh data, not just the object |
| `S3D-E-405` | exported stage has no defaultPrim | the compiler authors it; a hand-written stage must too |
| `S3D-W-401` | exported stage has no assetInfo | ship identity metadata |
| `S3D-W-402` | prim missing its extent | author or recompute bounds |
| `S3D-W-403` | prim name diverges from the scene object | keep names aligned across export |
| `S3D-W-404` | proof rig (camera/light) not marked `guide` in the USD | staging must not ship as content |
| `S3D-W-405` | model hierarchy malformed (component containing models, etc.) | fix the kind hierarchy |
| `S3D-I-501` | a stage was skipped | informational — the report names why |
| `S3D-E-441` | textured mesh with no UVs | unwrap it (smart UV project is the floor) |
| `S3D-W-441` | UV islands overlap past the limit | separate them, or allow deliberate mirroring |
| `S3D-W-442` | mirrored UV winding | flip the islands, or set `uv.allowFlipped` |
| `S3D-W-443` | UVs outside 0-1 past the limit | pack into the tile (tiling materials raise the limit) |
| `S3D-W-444` | texel density varies across the scene | even out UV scale or texture sizes |
| `S3D-W-445` | texel density misses the project target | rescale islands or resize the texture |
| `S3D-W-446` | mesh too heavy for the UV raster | overlap/coverage were NOT checked on it |
| `S3D-E-346` | texture file missing on disk | fix the path or pack the image |
| `S3D-W-346` | non-power-of-two texture | resize for mips/compression |
| `S3D-W-347` | texture over the size limit | downsize it |
| `S3D-W-348` | duplicate materials | merge them — identical materials cost draw calls |
| `S3D-W-349` | faces with no material slot | assign every face |
| `S3D-E-327` | negative scale | apply the mirror to the mesh — normals flip on import |
| `S3D-W-327` | loose vertices/edges | delete them |
| `S3D-W-328` | double vertices | merge by distance |
| `S3D-W-329` | inconsistent face winding | recalculate normals outside |
| `S3D-W-330` | unapplied object scale | apply scale before export |
| `S3D-E-801` | invalid shader declaration or kernel structure | fix per the message — the compiler owns scaffolding, you own the kernel |
| `S3D-E-802` | the GPU driver rejected the kernel | read the driver log in the message |
| `S3D-E-803` | the bake failed to execute | read the message; usually a resource limit |
| `S3D-E-804` | kernel produced NaN/Inf pixels | check divisions and pow() domains |
| `S3D-W-801` | declared shader referenced by no material | bind it or delete it |
| `S3D-E-701` | a `claims` entry failed against the measured build | fix the scene or fix the claim — the message carries the measured truth |
| `S3D-W-701` | a claim could not be adjudicated | unchecked is not passed; make the build measurable |
| `S3D-W-970` | a vertex is off the voxel grid (`target:"minecraft"`) | snap sizes/positions to multiples of 1/16 m — it shimmers in-game otherwise |
| `S3D-W-971` | a part is not a single cuboid | build from `box` shapes; a sphere/cylinder cannot be a Minecraft element |
| `S3D-W-972` | rotation not allowed in this format | Java allows one axis at {−45,−22.5,0,22.5,45}°; use `dialect:"bedrock"` for free angles |
| `S3D-W-973` | an element-scale part is positioned outside the −1..2-block space | move it into the element space |
| `S3D-I-970` | a part is larger than the whole element space | info — it is multi-block structure/terrain, not one element; split it only if it must ship as one block model |
| `S3D-I-952` | a part is a size outlier in the scene | info — verify it is not a unit/scale slip (metres vs centimetres) |
| `S3D-I-951` | a part's triangle density is an outlier | info — a possible LOD / re-topology candidate |

## 2D sheets

Declare each sheet in `scene3d.json` and it gets checked. The `kind`
selects the rules; flags like `tint` are the asset's own statement of intent.

```json
"sheets": [
  { "file": "flame.png", "kind": "flipbook", "grid": [4, 4], "tint": true },
  { "file": "mote.png",  "kind": "particle", "tint": true },
  { "file": "bolt.png",  "kind": "beam",     "tint": true },
  { "file": "sky_ft.png","kind": "sky", "face": "ft", "set": "sky_day" }
]
```

| Code | Meaning | Remedy |
|---|---|---|
| `S3D-E-601` | declared sheet missing | fix the path or produce it |
| `S3D-E-602` | file will not decode | re-export it |
| `S3D-E-603` | not power-of-two | resize |
| `S3D-E-604` | over the size cap | resize |
| `S3D-E-605` | nothing drawn | the image is empty |
| `S3D-E-606` | never reaches full alpha | the hot core is missing |
| `S3D-E-607` | tintable art carries hue | author it neutral grey |
| `S3D-E-608` | grid does not divide evenly | fractional cells tear every frame |
| `S3D-E-609` | blank frames | a blank cell plays as a dropped frame |
| `S3D-E-610` | frames bleed into a cell border | inset each frame |
| `S3D-E-611` | particle touches the atlas border | it will clip once packed |
| `S3D-E-612` | strip will not tile | make the two ends identical |
| `S3D-E-613` | ribbon touches its long edge | shows a hard cut |
| `S3D-E-614` | sky face not fully opaque | shows the void behind it |
| `S3D-E-615` | cube seam does not meet | a visible line in the sky |
| `S3D-E-616` | cube set incomplete | all six faces or holes |
| `S3D-W-601` | flipbook never animates | every frame is identical |
| `S3D-W-602` | sky clips to black/white | reads posterised |
| `S3D-W-603` | sheet is mostly empty | wasted texture memory |

Sheets are decoded in-process, so 2D checks need no Blender and cost
milliseconds — they run in CI on any machine.

`S3D-E-383` and `S3D-W-384` exist because a structurally perfect scene can
still render black. The proof frames are measured, not assumed — a camera
aimed the wrong way passes every naming, topology, and PBR rule.

## 6. Lighting and framing

Light energy in watts is opaque; anchor it to the subject instead of
guessing: for a ~1m prop, a key AREA light around **50–80W** gives visible
shadow falloff, and every doubling washes contrast fast. If the compiler
reports `S3D-W-385` the frames are blown out — quarter the energy and
re-render. Iterate lighting with a cheap loop first:

```json
"proof": { "resolution": 256, "turntableSteps": 1, "background": "#1a1d22" }
```

then restore full resolution for the final pass. `proof.background` is the
contract's — never write world node-graph code in `build.py`.

The report's `scale:` line echoes the measured world size and the smallest
part. Read it: a "12mm rivet" that reports as 1.2mm was a unit slip you can
now catch before rendering.

## 7. Deliverables

A clean compile leaves everything under `out/` — visible, next to the
sources:

- `out/index.html` — turntable player with replay and scrub
- `out/kit.html` — orbitable viewer with part selection and downloads
- `out/proof/proof-*.png` — the measured turntable frames
- `out/manifest.json` — part tree, materials, metrics, and the issue codes
- `out/digest.md` — what the scene IS, plus what this compile changed
- `out/ortho.svg` — plan/front/side elevations with dimensions written on
  them as text, and a `z=0` ground line
- `out/read-model.json` — the census, issues, digest and change report
- the exported containers the contract declares (`export.formats`)

`export.formats` accepts `usda`, `usdz`, `glb`, `obj`, `fbx`, `stl`, `ply`.
Default is USDA + USDZ + GLB + OBJ (with its `.mtl`) + FBX. A format this
Blender build cannot write is reported as `S3D-W-205` and the rest still
ship.

## Reading the result without looking at it

Renders answer "does it look right". These answer "what is it, and what did
my edit just do" — which is usually the question you actually have:

- **`out/digest.md`** — hierarchical summary within a token budget, issues
  first, and a `Change since last compile` section. That section names
  contacts that broke, which is how you catch an edit that stopped one part
  supporting another without either part's own numbers changing.
- **Issue `detail.origin`** — every issue points at the `build.py` line that
  created the geometry it is about, e.g. `build.py:47`. Go straight there.
- **`census.meshes[].spatial`** — per part: `worldMin`/`worldMax`, `size`,
  `centroid`, `groundGap` (height above `z=0`; negative is buried).
- **`census.contacts`** — per-axis separation between nearby parts, with
  `intersects`. Use it instead of eyeballing whether two parts touch.
- **`S3D-W-323`** — the z-fighting scan hit its cap, so silence about
  z-fighting is not evidence of its absence for that scene.

If the user edits parts in the viewer — move, rotate, or scale — their
edits land in `tweaks.json` beside `build.py`, as `translate`, a unit
`quat` (x, y, z, w) and `scale` multipliers, all in the viewer's Y-up
space. Treat it as user intent: fold it into the build script when you next
touch the scene, then delete the file.

Read the proof frames before you call the model done. They are the whole
reason the loop is worth running.
