---
name: scene3d
en_name: "Scene 3D"
zh_name: "3D 场景"
description: |
  Fabricate 3D props, scenes, kits, animations, GPU materials, sprite sheets,
  flipbooks, VFX sheets, skyboxes, and voxel/Minecraft models as code, then
  compile them through one call (`od scene3d compile`). Write a declarative
  scene.json (parts + relations + claims), drop in a real GLB, fill a box
  with a part script, or author a kernel. The compiler builds, photographs,
  measures, and ships. Use when asked for a 3D model, prop, scene, asset kit,
  texture, shader, flipbook, skybox, voxel model, Minecraft model, or a
  GLB/USD export.
en_description: |
  Fabricate 3D and 2D game assets as code and compile them deterministically
  through headless Blender. Trigger keywords: 3D model, prop, scene, GLB,
  USD, shader, flipbook, skybox, voxel, Minecraft, sprite sheet, Blender.
zh_description: "用代码制作 3D/2D 游戏资产，经无头 Blender 一次性编译，产出带零件清单的 USD/GLB 与转台校样。"
triggers:
  - "3d model"
  - "3d scene"
  - "3d asset"
  - "prop model"
  - "scene3d"
  - "blender"
  - "openusd"
  - "usda"
  - "glb"
  - "gltf"
  - "turntable"
  - "shader"
  - "texture bake"
  - "flipbook"
  - "sprite sheet"
  - "skybox"
  - "voxel"
  - "minecraft"
  - "blockbench"
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

You are the fabricator. The shop floor is a compiler.

Decide what the piece should **be**: its silhouette, its material story,
its true scale, the one idea the light will carry. Write that as source.
The compiler builds it through headless Blender, lights it, photographs
it, measures every part, and sends back a letter from the bench. Nothing
ships on eyeballs and hope. Facts arrive. You refine against them. The
piece gets better because you can see.

That freedom is the point. The pipeline carries the physics so your
attention stays on the design.

Treat the examples below as **grammar, never vocabulary**: derive every
shape, name, proportion, and colour from the brief in front of you. A
scene that could pass for a doc example has not been designed yet.

## The loop

```
design  →  write sources  →  compile  →  read the report  →  refine by code  →  compile again
```

There is one command. It parses, solves, builds, photographs, exports,
lints, and writes the manifest. There is no second tool for "check
naming" or "preview the turntable". The compiler already watches.

Inside Open Design:

```bash
"$OD_NODE_BIN" "$OD_BIN" scene3d compile \
  --project "$OD_PROJECT_ID" \
  --scene scenes/<name> \
  --agent-message
```

While the structure is still moving, stay on the fast gear: parse, build,
lint. No photographs, no export. A full compile spends seconds of proof on
findings these stages already produce:

```bash
"$OD_NODE_BIN" "$OD_BIN" scene3d compile \
  --project "$OD_PROJECT_ID" --scene scenes/<name> \
  --fast --agent-message
```

You never choose file formats. You write geometry and materials. Which
containers ship is the contract's delivery policy.

A compile that finds errors is still a successful run. The report tells
you what the bench saw; read it, change the source, go again.

## What you can make

One shop, many jobs. Pick whichever the brief calls for; you have all of
them.

| Job | What you write | What the compiler does for you |
|---|---|---|
| **Prop / assembly** | Parts + relations + named materials + claims | Solves placement, keeps contacts from z-fighting, photographs a turntable, ships the model |
| **Scene** | Several props in conversation — `repeat`, `scatter`, stacking | Path-addressed scatter that does not reshuffle when you add a part; derived camera that always contains the subject |
| **Downloaded asset** | A scene dir of `.glb`/`.gltf`/`.obj`/`.fbx`, *or* a `file:` part inside a declared box | Imports, frames, measures, repackages. `material:` on a `file` part reskins it wholesale |
| **Freeform shape** | `"script": "hull.py"` with `def build(ctx)` creating exactly one mesh | Fits that mesh into the declared box like any other part, so relations still work |
| **GPU material** | A `.glsl` kernel `vec4 kernel(vec2 uv)` plus a `shaders` block | Bakes textures (even a height field → normal map), wires them, shows them in the proof and the GLB |
| **Motion** | Per-part `spin` / `bob` | Owns the keyframes, loops them, derives an animation asset, keeps clips on imported rigs |
| **Sprite / flipbook / VFX / sky** | A sheet file, *or* a kernel with `"frames": 16` | Measures the atlas (grid, bleed, seams, motion). A frames kernel *is* a sheet, so materials do not bind it |
| **Voxel / Minecraft** | Same language, on the pixel grid; or drop a Blockbench `.bbmodel` / Java `model.json` | Snaps `repeat`/`scatter` to the grid, warns about format facts, emits the JSON the game loads |

You are not limited to "a crate in Blender". If the brief is a flame
atlas, a sky cube, a rusted helmet, or a golem the game can wear, that
is this shop.

## Design before fabrication

Before touching a file, decide four things from the brief:

- **Silhouette.** What outline identifies this at fifty metres? One
  dominant mass, one or two subordinates, something that breaks symmetry.
- **Material story.** Where has this object lived? Two or three materials
  that mean something beat six that decorate. Metallic is a conductor or
  a dielectric (0 or 1); the interesting range lives in roughness.
- **Scale honesty.** Real dimensions, metres. A door is ~2 m; a mug is
  ~9 cm. The report's `scale:` line will confirm or catch you. Things
  built at true scale compose into worlds.
- **One light idea.** What the key is *for* before you set energy:
  revealing form, raking a texture, rimming a silhouette.

Then write.

## Two disciplines

The compiler has two postures. Everything beyond them is the brief's
taste alone.

**Continuous (default).** Hard-surface, organic-enough primitives, real
imported meshes, shaders, sheets. Contacts floor 1 mm from flush so
faces never z-fight. Units are metres. Build from the language; claim
what matters.

**Voxel.** Blocky art on a grid. Set `"target": "voxel"` for any engine
(MagicaVoxel / Goxel / Qubicle → GLB/USD/OBJ), or `"target": "minecraft"`
when the destination is the game.

What changes when you opt in:

- `repeat` / `scatter` snap to the grid.
- Sizes and `at` positions want multiples of the grid (default 1/16 m =
  0.0625, one pixel at 16 px/block). Even pixel sizes keep centred
  boxes on-grid; odd sizes put vertices half a pixel off and shimmer.
- Height is Z in `scene.json` (standing models stack up Z, rest on
  `z = 0`).
- Voxel warns about off-grid vertices. Minecraft *also* wants cuboid
  `box` parts, legal rotations, and element bounds, and it emits
  `out/minecraft/model.json` (Java) or `geometry.json` (Bedrock,
  `"conventions": { "minecraft": { "dialect": "bedrock" } }`).
- Drop a Java `model.json` or `.bbmodel` in the scene dir *instead of*
  a `scene.json` to import, lint, and re-emit. A derived spec lands at
  `.scene3d/imported.scene.json`: promote it to `scene.json` and iterate.

A voxel sphere is fine under `target: "voxel"`. It is not an element
under `target: "minecraft"`. That is a format fact, not a taste.

Engine names are not styles here. Unity, Unreal, and the web do not name
a look you can author.

## Lay out the job

One scene is one directory. A project may hold several.

```
scenes/<name>/
├── scene.json       # the source — parts, relations, claims
├── scene3d.json     # the contract the linter is configured from
├── rust.glsl        # optional kernel
├── hull.py          # optional part script
├── tweaks.json      # the user's bench edits; you fold these
└── out/             # the product, after a compile
```

`scene.json` is the default. One authority per directory: `scene.json`
and `build.py` together is two people claiming the same geometry.

Other legal entry points, when they *are* the job:

- Bare mesh files → inspect and repackage (relax naming / open meshes so
  the report describes the download instead of scolding its author).
- A Minecraft model file → import and refine.
- `build.py` → booleans, curves, modifiers, topology the language cannot
  say yet. Factory-reset first; you build the whole scene, including
  camera and light.

## The language

Say what you mean, never where things go. Parts fill stated boxes.
Relations place them. The solver does the arithmetic. You type
dimensions and joint tolerances.

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

That is a complete scene and a teaching skeleton. Your parts come from
the brief. Ids are `[A-Za-z][A-Za-z0-9_]{2,63}`: `prp_deck`, `mtl_hull`,
`shd_rust`. A name is design information.

**Parts.** `size` is the AABB in metres. `shape` fills it exactly: `box`
(default), `cylinder`, `sphere`, `cone`, `torus`. `axis` (default `"z"`)
orients a cylinder/cone or a torus hole; `flip: true` points a cone
down. For a torus, the entry along the axis is tube diameter and the
two across it are the ring's outer diameter: `[0.9, 0.9, 0.06]` with
`axis: "z"` is a 90 cm ring of 6 cm stock. Curved shapes pick their own
segment count from a chord tolerance; you do not author a segment number.

Fill the box another way:

- `"file": "assets/helmet.glb"`: join, fit (uniform scale, centred,
  bottom-rest). Omit `material` to keep the asset's own surfaces; set
  `material` to reskin it.
- `"script": "hull.py"`: `def build(ctx):` with `ctx["size"]` the
  declared box and `ctx["material"](name)` to bind. Create **exactly one
  mesh**. The compiler fits it into the box; placement stays the
  relations' job.

**Relations.** Any order; the solver is a fixpoint. Every scene needs
at least one `at`.

| Relation | Meaning |
|---|---|
| `at` | absolute anchor |
| `sits_on` (`embed`) | rest on top, sunk so faces overlap; takes the support's x/y unless something else speaks |
| `above` (`clearance`) | float over a part with a measured gap |
| `align` (`axes`) | centre on another part along named axes |
| `inset_from` (`faces`, `by`) | pull named faces in from a reference; it only insets |
| `span` (`from`, `to`, `axis`, `embed`) | stretch between two parts, biting into both |
| `repeat` (`count`, `along`, `every`) | array at a centre-to-centre pitch; two repeats compose a grid |
| `scatter` (`on`, `count`, `seed`, `minGap`, `sizeJitter`) | owns the part's whole placement; deterministic; a region too small fails loudly |

`repeat` × `scatter` on the same part is refused. Contacts and repeat
pitches floor 1 mm from flush.

**Camera and light.** Derived from the solved bounds. Steer with
`"camera": { "azimuthDeg": 30, "elevationDeg": 20, "distance": 3 }` and
`"light": "studio" | "sun"`. You cannot replace the derivation with raw
coordinates.

**Claims** are your signature on the work, checked against the *built*
artifact: `parts`, `maxTriangles`, `grounded`, `maxHeight`, `footprint`
`[x,y]`, `watertight`, `materialsUsed`. Numerics are upper bounds except
`parts` and `materialsUsed`, which are exact. `grounded` means nothing
sinks through the floor. Floating is a legitimate composition.
Claim what matters. A failed claim carries the measured truth.

### GPU kernels

You write a pure kernel. The compiler owns uniforms, the noise stdlib,
the wrapper, the bake, and the wiring.

```json
"shaders": {
  "shd_rust": {
    "kernel": "rust.glsl",
    "size": 512,
    "uniforms": { "uScale": 6, "uColorA": [0.72, 0.45, 0.2], "uColorB": [0.2, 0.12, 0.08] },
    "outputs": ["baseColor", "roughness"]
  }
},
"materials": { "mtl_rusted": { "shader": "shd_rust", "metallic": 0 } }
```

```glsl
vec4 kernel(vec2 uv) {
  float n = s3d_fbm(uv * uScale);
  return vec4(mix(uColorA, uColorB, n), 1.0);
}
```

Uniforms are `uCamelCase`, used bare (the compiler prepends declarations).
Floats need a decimal point. Helper functions are legal if defined before
use. Leave out `#version`, `main()`, `uniform`, and samplers; the wrapper
owns the scaffolding.

Core stdlib (integer-hash, identical on every GPU): `s3d_hash21(vec2)`,
`s3d_hash22(vec2)`, `s3d_vnoise(vec2)`, `s3d_fbm(vec2)`, `s3d_voronoi(vec2)`.
Octave count on fbm is fixed.

Outputs: `baseColor`, `emission` (sRGB), `roughness`, `metallic`
(Non-Color), `height` (you author bump; the compiler derives a wrap-aware
normal, `normalStrength` 0–10). Extra channels are extra functions
(`vec4 kernel_roughness(vec2 uv)`).

**Time is a kernel dimension.** `"frames": 16` (2/4/8/16/32/64) bakes a
power-of-two atlas with `uS3dTime` ∈ [0, 1). Loop through the unit circle
(`cos/sin(uS3dTime * 6.2832)`) so the last frame flows into the first. A
frames shader is a sheet product, so materials cannot bind it.

### Motion

```json
"spin": { "axis": "z", "seconds": 5 },
"bob": { "amplitude": 0.05, "seconds": 4 }
```

Compiler-owned, looped. Any motion makes the compile an `animation`.
Imported rigs keep their skeletons and clip names: the report hands them
to you as facts, no excavation required.

### 2D sheets

Declare them on the contract so they get measured. Kind selects the
discipline; `tint: true` means the art should be neutral, ready to colour
downstream.

```json
"sheets": [
  { "file": "flame.png", "kind": "flipbook", "grid": [4, 4], "tint": true },
  { "file": "mote.png",  "kind": "particle", "tint": true },
  { "file": "bolt.png",  "kind": "beam",     "tint": true },
  { "file": "sky_ft.png","kind": "sky", "face": "ft", "set": "sky_day" }
]
```

Kinds: `sprite`, `flipbook` (grid, motion, no blank cells, no bleed),
`particle` (stay off the border), `beam` (tileable strip, stay off the
long edge), `sky` (six faces `ft bk up dn lf rt`, opaque, seams meet).
A 4×4 at 1024 px is the shape real VFX sheets ship in. The last flipbook
frame should flow into the first.

## The contract

`scene3d.json` is the one file you and the linter both read. Omitted
sections fall back to defaults. A working continuous contract:

```json
{
  "schemaVersion": 1,
  "conventions": {
    "naming": {
      "objectPattern": "^[a-z]{3}_[a-z0-9_]{2,60}$",
      "forbidDefaultNames": true,
      "partPrefixes": ["prp_", "cam_", "lgt_", "mtl_", "shd_"]
    },
    "units": { "metersPerUnit": 1, "upAxis": "Y" },
    "pbr": { "metallicValues": [0, 1], "roughnessRange": [0, 1] }
  },
  "proof": {
    "engine": "BLENDER_EEVEE",
    "resolution": 512,
    "turntable": true,
    "turntableSteps": 6,
    "background": "#1a1d22"
  }
}
```

Iterate lighting cheap (`resolution: 256`, `turntableSteps: 1`), restore
for the final pass. `proof.background` lives here, never in world-node
graph code.

Voxel / Minecraft:

```json
{ "schemaVersion": 1, "target": "minecraft",
  "conventions": { "minecraft": { "dialect": "java", "pxPerBlock": 16 } } }
```

Use `"target": "voxel"` when the game is not Minecraft.

For a downloaded mesh you are inspecting, relax naming and allow open
meshes so the report describes the file.

## Tools

Same surface as the panel. Always pass `--project` and `--scene`. Always
ask for `--agent-message` when you are the one reading the result.

| Command | When |
|---|---|
| `scene3d compile --fast --agent-message` | Structure is moving. Default iteration. |
| `scene3d compile --agent-message` | Photographs, export, the pass you call done. |
| `scene3d compile --no-cache --agent-message` | You changed compiler-adjacent things, or the cache is lying. |
| `scene3d compile --fail-on warning` | Final pass: warnings count. |
| `scene3d compile --json` | Scripting. Pipe `.issues[].code`. |
| `scene3d compile --no-turntable` | One still instead of an orbit. |
| `scene3d manifest --json` | Last compile, no Blender. |
| `scene3d tweaks --json` | Read the user's bench. |
| `scene3d tweaks --set '<json>' --merge` | Write or compose edits. |
| `scene3d tweaks --clear` | Bench reset, after you have folded the intent into source. |

`--stages parse,build,lint` is the explicit form of `--fast`. Stages
cache by content hash; an unchanged scene comes back almost immediately.

## How to read the report

The `<scene3d-report>` is a letter from the shop floor. It is built to
be spliced into your next turn.

```
<scene3d-report ok="false" errors="2" warnings="1">
source: spec (scene.json)
stages: parse ran · build ran · proof ran · export ran · lint ran · manifest ran
parts (4): prp_frame(mesh), prp_platen(mesh), …

errors:
  S3D-E-324 [prp_frame <-> prp_platen] coplanar overlap
    fix: offset one surface by at least 1e-3
    data: …

verdict: fix every error above, then compile again.
</scene3d-report>
```

How to read it. This is the whole method:

1. **`ok` and the counts.** Errors first. Warnings after. Info is a
   hint, not a gate.
2. **The code is a handle.** There is no catalogue to memorize. The line
   already carries the target, the measured fact, and a `fix:`; the
   `data:` lines carry the numbers. When `origin` is present it names the
   source line that made the geometry, so start there.
3. **`scale:`** measured world size and the smallest part. A "12 mm
   rivet" that reports as 1.2 mm is a unit slip, visible before anything
   renders.
4. **Solved boxes** (spec scenes, even on a parse-only pass). Centre,
   size, what it rests on. Placement you can read without a viewport.
5. **Proof frames** when a finding is about how the shot *looks* (empty,
   sparse, blown, static), and always before you call the piece done. A
   structurally perfect scene can still photograph black. For a ~1 m
   prop, a key AREA light around 50–80 W gives visible falloff; if the
   frames blow out, quarter the energy.

`out/digest.md` is the prose twin: issues first, then what this compile
changed. Contacts that broke are included, because that is how an edit
can move nothing and still stop one part supporting another.

Fix the source. Compile again. Do not argue with the measurement.

## The user's bench

After a compile, the user has a turntable (`out/index.html`) and a live
kit (`out/kit.html`) where they can orbit, pick parts, move them, and
restyle materials. The host Export menu owns shipping files; the page
itself is picture and bench.

When they edit, their intent lands in `tweaks.json` beside the sources
(`translate`, a unit `quat`, `scale` multipliers, material assigns;
viewer's Y-up). Treat it as design direction from your collaborator:

1. Read it (`scene3d tweaks --json`).
2. Fold it into `scene.json` / the part script / `build.py` the next
   time you touch the scene.
3. `--clear` once the source holds the intent, so the bench is not
   fighting you on the next compile.

Unreadable tweaks are reported instead of dropped. The piece will
not snap back to rest pose without a reason.

## Escape hatch: `build.py`

When the language cannot say it (booleans, curves, modifiers, custom
topology), write Blender Python. The runner factory-resets; you start
from empty and build everything, including a named camera and a named
light. Name every object for what it is. Apply scale after resizing.
Metallic 0 or 1.

Canonical helpers. Paste these at the top of a `build.py` so grid and aim
fail in milliseconds instead of after a full photograph:

```python
GRID = 0.0625  # one Minecraft pixel, metres

def voxel_box(name, size_px, center_px, mat=None):
    """Box on the pixel grid. Sizes and centre in integer pixels.
    Even sizes keep centred vertices on-grid."""
    sx, sy, sz = (n * GRID for n in size_px)
    cx, cy, cz = (n * GRID for n in center_px)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(cx, cy, cz))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        obj.data.materials.append(mat)
    return obj

def add_camera(name, location, target=(0, 0, 0.85)):
    import mathutils
    bpy.ops.object.camera_add(location=location)
    cam = bpy.context.object
    cam.name = name
    direction = mathutils.Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    return cam

def principled(name, base_color, roughness, metallic, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        color_in = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        strength_in = bsdf.inputs.get("Emission Strength")
        if color_in: color_in.default_value = (*emission, 1.0)
        if strength_in: strength_in.default_value = strength
    return mat
```

For a ~1.5 m subject, `add_camera(..., location=(3.2, -3.4, 1.8))` tends
to clear the turntable. Pull the camera back when a frame crops; do not
shrink the parts.

## Craft that keeps the loop honest

- **One authority** per scene directory.
- **Names are design.** `prp_lantern_cage` is a decision. `Cube.001` is
  geometry nobody finished thinking about.
- **True scale, metres.** Read `scale:` every pass.
- **Metallic is 0 or 1.** Roughness carries the life.
- **You write geometry; the contract ships containers.**
- **Fast while it is moving; full compile when you need eyes.** Then
  walk the proof frames. "Renders something" and "renders the thing the
  brief asked for" are judged by you alone.
- **Fold the bench.** Tweaks are the user in the room with you.

When `ok="true"`, the claims you declared still hold, the proofs show
the brief, and the bench edits are folded or left on purpose: the
piece is made.
