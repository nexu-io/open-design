---
name: scene3d
en_name: "Scene 3D"
zh_name: "3D 场景"
description: |
  Fabricate 3D props, scenes, kits, animations, GPU materials, sprite sheets,
  flipbooks, VFX sheets, skyboxes, and voxel/Minecraft models as code, then
  compile them through one call (`od scene3d compile`). Write a declarative
  scene.json using the current parts/relations/claims subset, drop in a real
  GLB, use the freeform part-script path, or author a kernel. The compiler builds, photographs,
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
lint, manifest. No photographs, no export — a full compile spends seconds
of proof on findings these stages already produce, and the manifest rides
along free so `scene3d manifest --json` never reads stale:

```bash
"$OD_NODE_BIN" "$OD_BIN" scene3d compile \
  --project "$OD_PROJECT_ID" --scene scenes/<name> \
  --fast --agent-message
```

Choose requested deliverables in the contract's `export.formats` policy. You
write geometry and materials; the compiler owns how each requested container
is produced, validated, and lowered.

A compile that finds errors is still a successful run. The report tells
you what the bench saw; read it, change the source, go again.

You start every run blind, and the harness is built for that: misspelled
keys come back with `did you mean …?`, tunable warnings name their exact
contract knob in the `fix:` line, and the report carries a `read:` block
naming every diagnostic on disk — with clean compiles closing on a
`next:` step matched to where the loop stands, when one applies. When any message and this
document disagree, trust the message — it is measuring the build in
front of you; this page is memory.

## What you can make

One shop, many jobs. Pick whichever the brief calls for; you have all of
them.

| Job | What you write | What the compiler does for you |
|---|---|---|
| **Prop / assembly** | Parts + relations + named materials + claims | Solves placement, keeps contacts from z-fighting, photographs a turntable, ships the model |
| **Scene** | Several props in conversation — `repeat`, `scatter`, stacking | Path-addressed scatter that does not reshuffle when you add a part; derived camera that always contains the subject |
| **Downloaded asset** | A scene dir of `.glb`/`.gltf`/`.obj`/`.fbx`, *or* a `file:` part inside a declared box | Imports, frames, measures, repackages. `material:` on a `file` part reskins it wholesale |
| **Freeform shape** | `"script": "hull.py"` with `def build(ctx)` creating exactly one mesh | First-class procedural authoring path; fits that mesh into the declared box like any other part, so relations still work |
| **GPU material** | A `.glsl` kernel `vec4 kernel(vec2 uv)` plus a `shaders` block | Bakes textures (even a height field → normal map), wires them, shows them in the proof and the GLB |
| **Motion (current subset)** | Per-part `spin` / `bob` / `screw` | Owns the keyframes, loops them, derives an animation asset, keeps clips on imported rigs; richer timelines and deformation systems are future language work |
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
imported meshes, shaders, sheets. In declarative spec scenes, contacts floor
1 mm from flush so faces do not z-fight. Units are metres. Build from the
language or raw mode; claim what matters.

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

`scene.json` is the default structured source. In the current alpha, one
authority per directory means `scene.json` and `build.py` together are two
sources claiming the same geometry; this source-ownership rule does not make
the freeform Python path second-class.

Other legal entry points, when they *are* the job:

- Bare mesh files → inspect and repackage (relax naming / open meshes so
  the report describes the download instead of scolding its author).
- A Minecraft model file → import and refine.
- `build.py` → raw procedural authoring: booleans, curves, modifiers,
  topology, custom staging, or any construction that is clearest in Python.
  Factory-reset first; you build the whole scene, including
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
the brief. Part and material ids are `[A-Za-z][A-Za-z0-9_]{2,63}`:
`prp_deck`, `mtl_hull`. Shader names are stricter — `shd_` then
lower_snake, 5-45 chars (`shd_rust`, never `shd_rustMetal`). A name is
design information.

**Parts.** `size` is the AABB in metres. `shape` fills it exactly: `box`
(default), `cylinder`, `sphere`, `cone`, `torus`, `wedge`, `tube`,
`capsule`. `axis` (default `"z"`) orients a cylinder/cone/tube/capsule or
a torus hole; `flip: true` points a cone down. For a torus, the entry
along the axis is tube diameter and the two across it are the ring's
outer diameter: `[0.9, 0.9, 0.06]` with `axis: "z"` is a 90 cm ring of
6 cm stock. Curved shapes pick their own segment count from a chord
tolerance; you do not author a segment number.

Four more shapes for when a box, cylinder, sphere, cone, or torus is not
the right primitive:

- `cone` with `tip` (0 ≤ tip < 1, default 0): the top diameter as a
  ratio of the base. `0.6` turns a cone into a bucket, a lamp shade, a
  plant pot — a ratio rather than a metre value so the frustum keeps its
  proportions when the box resizes. `tip: 1` is a cylinder; use `shape:
  "cylinder"` instead.
- `wedge`: a right triangular prism — a ramp, a doorstop, a roof
  slope. `axis` is the up-slope direction (`"x"` or `"y"` only — a
  ramp cannot climb the axis it is tall along); `flip` swaps which end
  is high.
- `tube`: a hollow cylinder — a pipe, a ring wall, a socket. Requires
  `thickness` in metres, measured inward from the outer surface; the
  one fact a hollow shape carries that its box cannot express.
- `capsule`: a cylinder with hemispherical ends — a pill, a tank, a
  limb blank. Long axis via `axis`; the along-axis extent must be at
  least the diameter (a capsule shorter than it is wide is just a
  sphere).

**Turning a part.** `"rotate": { "axis": "z", "deg": 15 }` is a static
rotation of the finished part about one world axis, at its solved
position — a tilted sign, a canted buttress, a ramp turned to face the
door. `size` stays the part's own box; the solver reasons in the ROTATED
BOUND of the part, shape-aware — exact for boxes and the round shapes
(a cylinder turned about its own axis keeps its box), conservative for
wedges and imported parts (extra clearance, never interpenetration) — and
canted clones are separated by an exact oriented test rather than their
swollen AABBs. `deg` is strictly between -360 and 360 and never a whole turn
(that rotates nothing, and is refused). Not combinable with `span`,
whose whole job is to solve a size on a world axis.

Fill the box another way:

- `"file": "assets/helmet.glb"`: join, fit (uniform scale, centred,
  bottom-rest). Omit `material` to keep the asset's own surfaces; set
  `material` to reskin it.
- `"script": "hull.py"`: `def build(ctx):` with `ctx.size` the declared
  box and `ctx.material(name)` to bind (item access, `ctx["size"]`, also
  works). Create **exactly one mesh**. The compiler fits it into the box;
  placement stays the relations' job.

**Roles.** `role` on a part names its job — `hero`, `character`, `prop`,
`background`, or `decor` — and the intent judge budgets triangle share
and texel density by it (the `S3D-W-95x` family). Tune per role in
`conventions.budgets.roles` or per part id in
`conventions.budgets.parts`; a scene with no roles is judged by its
scene-wide budgets alone.

**Margin notes.** Any key beginning `//` is a comment to the next
reader, ignored by every unknown-key check — in scene.json, the shader
block, and scene3d.json alike:
`"//": "the ring is oversized on purpose; see the brief"`.

**Relations.** Any order; the solver is a fixpoint. Every declarative spec
scene needs at least one `at`.

| Relation | Meaning |
|---|---|
| `at` | absolute anchor |
| `sits_on` (`embed`, `axis`) | rest on top, sunk so faces overlap; takes the support's x/y unless something else speaks. `axis` (default `z`) is the direction "on top of" means — any other axis is an ATTACHMENT (a pommel capping a Y-up grip): same face-to-face placement and the support's x/y still fill in as usual, but it says nothing about gravity, records no resting support, and leaves z open — give the part a z of its own (an `align` on z, or a real `sits_on`) |
| `above` (`clearance`, `axis`) | float past a part with a measured gap, along `axis` (default z) |
| `align` (`axes`) | centre on another part along named axes |
| `inset_from` (`faces`, `by`) | pull named faces in from a reference; it only insets |
| `span` (`from`, `to`, `axis`, `embed`) | stretch between two parts, biting into both |
| `repeat` (`count`, `along`, `every`) | array at a centre-to-centre pitch; two repeats compose a grid |
| `scatter` (`on`, `count`, `seed`, `minGap`, `sizeJitter`) | owns the part's whole placement; deterministic; a region too small fails loudly |
| `around` (`center`, `radius`, `count`, `axis`, `startDeg`, `orient`) | ring `count` instances evenly about another part's centre; `orient: true` turns each one to face its own angle |

`around` owns the part's placement in the circle's PLANE and nothing
else — the coordinate along the circle's normal still comes from the
part's own relations, so `sits_on floor` + `around hub` is a ring
standing on the floor. Do not hand-compute `at` positions for a ring;
that arithmetic is what this relation deletes.

`repeat` × `scatter` on the same part is refused, and so is `around`
beside `repeat`, `scatter`, another `around`, or a `span`. Contacts and repeat
pitches floor 1 mm from flush. Loud ceilings, never a silent shortfall:
`repeat` refuses past 4000 instances, and a scene refuses past 4000 parts
after expansion — backstops against a runaway count, far above any scene
you would mean. Below those, a big scatter still changes what the
compiler can *measure*: past ~60 meshes the contact scan (grounding,
touching-faces, the rested-pair check) reports itself skipped rather
than guessing, so a claim that leans on contacts is unchecked, not
failed, above that count.

**Materials.** `baseColor` (linear RGB, required unless `shader` is set),
`roughness` (default 0.5), `metallic` (0 or 1 — the pbr rule rejects
in-betweens), `emission` + `emissionStrength` (watts, default 1) to
glow, and `alpha` (0–1, default 1) — anything below 1 turns on alpha
blending, for glass, a scrim, a ghosted x-ray part.

**Camera and light.** In declarative spec scenes, staging is derived from the
solved bounds. Steer with `"camera": { "azimuthDeg": 30, "elevationDeg": 20 }`
and `"light": "studio" | "sun"`. Raw scenes may author their own camera and
light directly.

**Omit `distance`.** Left out, it AUTO-FITS: the compiler solves
`d = r / (tan(fov/2) × 0.8)` against its own 50mm lens, so the subject
fills about 80% of the frame height at every orbit angle — identically
for a 26cm lantern and a 26m hangar. If you do write it, it is a
**multiple of the scene's bounding radius, never metres**: `1` parks the
camera on the bounding sphere itself (inside the subject), `3.47` is the
auto-fit, and the useful range for a tighter or wider shot is roughly
2.5–6. Reaching for it because a subject "looks too small in metres" is
the one mistake this knob invites — the default already fits.

**Claims** are your signature on the work, checked against the *built*
artifact: `parts`, `maxTriangles`, `grounded`, `maxHeight`, `footprint`
`[x,y]`, `watertight`, `materialsUsed`. Numerics are upper bounds except
`parts`, which is exact. `materialsUsed` is an ARRAY OF NAMES, not a
count: every listed material must be bound to some part in the built
scene. It is a subset check — a bound material you did not list passes
silently, so it guards against losing a material, not against gaining
one. `grounded` means what the word means, in both directions: nothing
sinks through the floor, AND everything is supported — resting on the
ground or transitively in contact with something that is. A part you
*mean* to float already says so in the language: placing it with an
`above` relation declares the float (and anything hanging from it
inherits the licence); a bedded rock or mount that has no relation to
carry the intent goes in `conventions.grounding.exempt` (an array of
part ids). A part floating with neither is a claim failure with the
measured height and the nearest surface named. The same machinery keeps
a moving part honest across its whole cycle (a trough-anchored rest
passes, a provably-clearing floater passes, a slow sinker fails with
the measured numbers). Claim what matters. A failed claim carries the
measured truth; the report echoes a ledger (`claims: 7/7 held`, with a
margin line saying how close the tightest one ran), and the ledger only
counts what was actually adjudicated — a compile whose build never ran
reports `0/7 checked`, never "held". Spatial claims are judged across
TIME with an interval calculus: sampled frames prove failures, the
closed-form swept envelope of compiler-owned motion proves failures
(a fast spin's corner sweep is exact for boxes — integer-frame samples
that never land on 45° cannot save it) and proves passes (an envelope
inside the bound suppresses the stride caveat), and a conservative
bound over the claim is reported as UNPROVEN rather than either.

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

The shader is declared with `kernel:` (a scene-relative `.glsl` path),
never `file:` — `file:` is for real mesh assets on a part. Uniforms are
`uCamelCase`, used bare — do not write your own `uniform` declaration,
the compiler injects one from the `uniforms` block and a hand-written
one either collides or silently does nothing. Floats need a decimal
point. Helper functions are legal if defined before use. Leave out
`#version`, `main()`, and samplers too; the wrapper owns the scaffolding.

Core stdlib (integer-hash, identical on every GPU): `s3d_hash21(vec2)`,
`s3d_hash22(vec2)`, `s3d_vnoise(vec2)`, `s3d_fbm(vec2)`, `s3d_voronoi(vec2)`.
`s3d_fbm` takes one argument — the coordinate, pre-scaled by you
(`s3d_fbm(uv * uScale)`) — octave count, lacunarity and gain are fixed,
not extra parameters. The base fields do NOT tile: for anything that
repeats — a beam strip, a sky face, a trim texture — use the seamless
`_tiled` variants, which take a SECOND argument, the period:
`s3d_fbm_tiled(uv * 6.0, vec2(6.0))`. The period must equal the integer
cell count you pre-scaled by — same number both places — or the wrap
lands at the wrong frequency and the seam returns. (`s3d_vnoise_tiled`,
`s3d_fbm_tiled`, `s3d_voronoi_tiled`, with `s3d_wrap_cell` underneath.) Two more declaration keys beside `uniforms`:
`ints` declares integer uniforms, and `motionVectors: true` on a
`frames` kernel additionally bakes a `<name>_mv.png` atlas a real-time
engine interpolates with (`baseColor` must be among the outputs). `ints`
is an array of NAMES re-typing entries already in `uniforms`
(`"ints": ["uSteps"]`); a name with no matching uniform is refused.

Outputs: `baseColor`, `emission` (sRGB), `roughness`, `metallic`
(Non-Color), `height` (you author bump; the compiler derives a wrap-aware
normal, `normalStrength` 0–10). Entry points are named BY OUTPUT, not by
position: `baseColor` is the plain `vec4 kernel(vec2 uv)`; every other
output needs its own `vec4 kernel_<output>(vec2 uv)`. So
`["baseColor", "roughness"]` defines `kernel` and `kernel_roughness` —
and a height-only shader (`["height"]`) defines just `kernel_height`,
no plain `kernel` at all. An output declared with no matching function
is a wasted round trip, not a partial bake.

**Time is a kernel dimension.** `"frames": 16` (any power of two, 2..256) bakes a
power-of-two atlas with `uS3dTime` ∈ [0, 1). Loop through the unit circle
(`cos/sin(uS3dTime * 6.2832)`) so the last frame flows into the first. A
frames shader is a sheet product, so materials cannot bind it.

Iterating a kernel does not need a full compile: `--fast` still bakes
shader textures to `out/textures/` (the bake happens at build time), so
you can judge the actual pixels cheap and save the photograph for when
the composition is right. A FULL compile's proof additionally writes a
lit-sphere preview per material (capped at 24, alphabetical — the
report counts the skipped and names the first six) to
`out/materials/ball-<name>.png`, under the
proof's own lighting — the cheap way to judge emission, alpha, and
metallic composition without walking a whole turntable.
`--fast` skips proof, so no balls there: raw bakes on the fast gear,
composed previews on the full one.

### Motion

```json
"spin": { "axis": "z", "seconds": 5 },
"bob": { "amplitude": 0.05, "seconds": 4 },
"screw": { "axis": "z", "seconds": 4, "rise": 0.3 }
```

`screw` is the general one: a full turn per `seconds` about `axis`
composed with `rise` metres of travel along it — a bit driving, an auger
lifting, a spiral descending (`rise` may be negative; any finite nonzero
number is legal — how far one turn travels is your scale to judge).
Because the clip loops, the advance REPEATS: it drives 0 → rise
and snaps back to start the next thread, which is what an endless screw
looks like and not what a lid that unscrews once does. A screw IS a spin
with a rise, so the two are refused together; and a screw about z is
refused beside a `bob`, since both would author z travel (screw about x
or y composes with a bob freely).

Compiler-owned, looped. Any motion makes the compile an `animation`.
Imported rigs keep their skeletons and clip names: the report hands them
to you as facts, no excavation required.

Motion is adjudicated across its WHOLE cycle, at parse time, as static
geometry — no simulation. A spinning part reserves its box's corner
circle (a shape symmetric about its spin axis — an orb, a column turning
in place — reserves nothing extra); a bob reserves its exact travel; a
screw reserves both, so a symmetric auger reserves only its rise. The
solved-boxes table annotates moving rows (`· sweeps ⌀0.42, z+0.05`),
S3D-W-108 warns when a cycle presses into a neighbour the rest pose
clears, claims that hold at rest but not across the cycle warn as
unchecked — and a bob crest provably over a claimed `maxHeight` is a
hard claim failure, measured, because a translation's arithmetic is
exact.

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

Knobs that get mistyped in the field — the exact nesting, not the
flattened key you might guess: `conventions.grounding.exempt` (part
ids, see Claims above), `conventions.grounding.tolerance`, and
`conventions.uv.texelDensity.maxRatio` / `conventions.uv.texelDensity.target`
(nested under `texelDensity`, never `uv.texelDensityMaxRatio`).

`conventions.geometry.minClearance` (metres, default 0 = off) declares
the assembly's working tolerance: any two parts closer than it without
being in designed contact get a W-109 pinch warning. Set it when the kit
must survive printing, kitbashing, or physics — leave it off for scenes
where near-touching is composition, not error.

`conventions.geometry.zFightingPairBudget` (default 200000) is the
per-pair triangle-product cap on the coplanar comparison. A dense pair
over it is skipped LOUDLY (W-323 names the pair and the cost); raise the
budget when a correct sphere-on-cylinder joint must be verified rather
than skipped — the quadratic cost is then your declared trade.

Deliverables ride `export.formats`. Omit it and you get the default set
— `usda`, `usdz`, `glb`, `obj`, `fbx` — plus `stl` when `target` is
`3d_print`. `stl`/`ply` stay opt-in everywhere else: they carry no
materials, so shipping them by default would put two lossy files in
every download menu. Name the block explicitly only to narrow it or add
`ply`.

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

`--fast` is `parse,build,lint,manifest` — it carries the manifest stage
along for free (pure TypeScript, milliseconds) so `scene3d manifest
--json` mid-iteration is never reading a stale census; `--stages
parse,build,lint` is the explicit form MINUS manifest, when you truly
don't need it refreshed. Stages cache by content hash; an unchanged
scene comes back almost immediately.

Operational facts worth knowing before they surprise you:

- **409 means "already compiling," not "broken."** The daemon refuses a
  second concurrent compile of the same scene rather than racing two
  Blender processes over the same output files. Wait and retry; do not
  fork the scene into a second directory to work around it.
- **A dropped connection (CLI exit code 3) does not mean the compile
  died.** The daemon may finish the run after your request disconnects.
  Check `scene3d manifest --json`'s `generatedAt` before assuming
  failure, and expect the next compile's stages to come back cached.
- **Resolve the daemon port fresh every session** via `pnpm tools-dev
  status --json`; never trust an inherited `OD_DAEMON_URL`, it changes
  on every restart.
- **`od` in a printed `run:` hint names this CLI**, not necessarily a
  command on your PATH — invoke it through your session's prefix
  (`"$OD_NODE_BIN" "$OD_BIN" …`) when bare `od` is not available.
- **On Windows, never write scene sources with PowerShell
  `Set-Content`** — it stamps a UTF-8 BOM. The compiler tolerates a BOM
  on `scene.json`/`scene3d.json` now, but other tools reading your files
  may not, so prefer `.NET UTF8Encoding($false)` or the host's own file
  tools when you have the choice.

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

verdict: fix every error above, then compile again — the fix: lines name the change and the data: lines carry the measured numbers.
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
   frames blow out, quarter the energy. If you can read images, open the
   proof PNGs directly; if you cannot, pass `--frames` (or `"frames":
   true` on the API) to get the frames rendered as ASCII luminance ramps
   right inside the report, sampled around the orbit — you are never
   actually blind to the shot.
6. **`out/ortho.svg`, every structural change, no exceptions.** A
   dimensioned plan/front/side drawing — and it is SVG, so it is
   readable as text even without vision. A 2-second look catches a
   proportion or overlap mistake the turntable's angle hides; a field
   build once shipped a defective cage because nothing told its author
   to look here.

Every compile whose manifest stage ran — `--fast` included — carries a
`read:` block, and each line appears only when the file exists this
pass: `out/digest.md` and `out/read-model.json` always, `out/ortho.svg`
with a census, `out/textures/` and `out/materials/` when bakes and ball
previews landed, `out/index.html` and `kit.html` when frames exist.
Follow it rather than guessing what exists — a path it names is there. `out/digest.md` is the prose twin of the report: issues first,
then what this compile changed. Contacts that broke are included,
because that is how an edit can move nothing and still stop one part
supporting another. `out/read-model.json` is the same census,
machine-readable, for when you need to compare a number precisely
rather than read a sentence.

Remember what the harness actually validates: what was **built**, not
what was **meant**. The solved-boxes table and the digest hand you the
built dimensions; comparing them against the brief's intent is your
job, and `claims` is how you write that intent down so the compiler
checks it FOR you on every future compile instead of you eyeballing it
each time.

Fix the source. Compile again. Do not argue with the measurement.

## The user's bench

After a compile, the user has a turntable (`out/index.html`) and a live
kit (`kit.html`, at the project root) where they can orbit, pick parts,
move them, and restyle materials. The host Export menu owns shipping files; the page
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

## Raw authoring mode: `build.py`

Use Blender Python when direct procedural control is the clearest expression
of the brief: booleans, curves, modifiers, custom topology, authored
animation, custom staging, or anything else the raw mode can express. The
runner factory-resets; you start from empty and build everything, including a
named camera and a named light. Name every object for what it is. Apply scale
after resizing. For generated materials, use metallic 0 or 1 unless the
brief or imported source calls for something else.

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
