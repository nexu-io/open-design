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
it, measures every part, and sends back a letter from the shop floor.
Nothing ships on eyeballs and hope. Facts arrive. You refine against them. The
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
photographing what these stages already told you, and the manifest rides
along free so `scene3d manifest --json` never reads stale:

```bash
"$OD_NODE_BIN" "$OD_BIN" scene3d compile \
  --project "$OD_PROJECT_ID" --scene scenes/<name> \
  --fast --agent-message
```

A compile that finds errors is still a successful run. The report tells
you what the bench saw; read it, change the source, go again.

You start every run blind, and the harness is built for that: misspelled
keys come back with `did you mean …?`, tunable warnings name their exact
contract knob in the `fix:` line, and the report carries a `read:` block
naming every diagnostic on disk; a clean compile closes with a `next:` step
matched to where the loop stands. When any message and this
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
| **Kernel recipe** | `"recipe": "hull.py"` with `def build(ctx)` recording `ctx.box/cage/subdivide/mirror/move/crease/scale/extrude/inset/clip/triangulate` | Deterministic exact-rational geometry — Catmull-Clark for curved form, plane cuts (`clip`) that chamfer or carve; the compiler predicts the built census and adjudicates it (`S3D-E-702`), and can prove an exact `volume`. Smooth or knife-edged, count-provable, cross-machine identical |
| **GPU material** | A `.glsl` kernel `vec4 kernel(vec2 uv)` plus a `shaders` block | Bakes textures (even a height field → normal map), wires them, shows them in the proof and the GLB |
| **Motion** | Per-part `spin` / `bob` / `screw` | Owns the keyframes, loops them, derives an animation asset, keeps clips on imported rigs; richer timelines and deformation systems are future language work |
| **Sprite / flipbook / VFX / sky** | A sheet file, *or* a kernel with `"frames": 16` | Measures the atlas (grid, bleed, seams, motion). A frames kernel *is* a sheet, so materials do not bind it |
| **Voxel / Minecraft** | Same language, on the pixel grid; or drop a Blockbench `.bbmodel` / Java `model.json` | Snaps `repeat`/`scatter` to the grid, warns about format facts, emits the JSON the game loads |

You are not limited to "a crate in Blender". If the brief is a flame
atlas, a sky cube, a rusted helmet, or a golem the game can animate, that
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

The compiler holds two disciplines. Everything beyond them is the brief's
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

`scene.json` is the default structured source, and each directory has one
authority: `scene.json` and `build.py` side by side are two sources claiming
the same geometry, so the compiler refuses the pair rather than silently
picking a winner. Neither path outranks the other — the rule only asks that
one of them own the scene.

Other legal entry points, when they *are* the job:

- Bare mesh files → inspect and repackage (relax naming / open meshes so
  the report describes the download instead of scolding its author).
- A Minecraft model file → import and refine.
- `build.py` → raw procedural authoring: booleans, curves, modifiers,
  topology, custom staging, or any construction that is clearest in Python.
  Factory-reset first; you build the whole scene, including
  camera and light.

## Orientation

Read this before you type a coordinate. It is the frame every `size`,
`center`, `axis` and proof frame is expressed in.

- **`scene.json` authors in a Z-UP world.** Height is Z. Parts rest on
  `z = 0`. `size: [x, y, z]` is width, depth, height — a standing mast is
  tall in its third component.
- **`conventions.units.upAxis` in `scene3d.json` is an export/target fact,
  not the authoring frame.** It says how the shipped file is written for a
  downstream engine. It never changes what Z means in `scene.json`.
- **Turntable frame `N` is photographed from azimuth `N × 360/count`,
  elevated 30°.** Azimuth `0` is the **front** — camera on `-Y`, Blender's
  numpad-1 view — and azimuth increases toward `+X`. Default steps is 8
  (16 when the scene animates), so the orbit reads:

| Frame | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| View | front | front-right | right | back-right | back | back-left | left | front-left |

So the face you want met first points at `-Y`, and a part at `+X` appears
on the right in frame 0.

## Aiming the camera

The turntable answers *what did I build*. A **shot** answers *what does
that part look like from there* — and you aim it by naming parts and
directions, never by typing coordinates. The compiler resolves the pose
against the census it just measured and hands the pose back, so you always
know exactly where you were standing.

```bash
scene3d compile --look prp_lamp:left
scene3d compile --look at=prp_bar,from=part:prp_stool,eyeHeight=1.2
```

`--look` is repeatable. Its keys: `at` (the part to aim at; omit for the
whole scene), `from` (a compass word, `<az>/<el>` degrees, or
`part:<name>` to stand AT that part), `elevation`
(`level|eye|high|top|low|bottom`), `fov`, `margin`, `distance`,
`eyeHeight`, `label`.

A camera is four independent things, and `--shot '<json>'` is the general
form when a look cannot say what you mean:

| | decides | forms |
|---|---|---|
| `station` | where the eye is | `{orbit:{of?,azimuthDeg,elevationDeg?,distance?,margin?}}` · `{at:"<part>",offset?:[x,y,z]}` · `{point:[x,y,z]}` |
| `gaze` | where it points | `{at?:"<part>"}` · `{heading:<word\|deg>,pitchDeg?}` · `{toward:[x,y,z]}` |
| `lens` | how much it sees | `{fovDeg?}` |
| `sweep` | the same shot, n times | `{frames,time?,over?}` |

They compose, so there is nothing else to learn:

```bash
# stand on the counter at eye height and turn all the way around
scene3d compile --shot '{"station":{"at":"prp_counter","offset":[0,0,1.6]},
                         "gaze":{"heading":"front"},"lens":{"fovDeg":90},
                         "sweep":{"frames":8,"over":{"headingDeg":[0,360]}}}'

# hold one angle and ride the animation
scene3d compile --shot '{"gaze":{"at":"prp_fan"},"sweep":{"frames":16,"time":true}}'
```

`sweep.over` takes any pose scalar — `azimuthDeg`, `elevationDeg`,
`headingDeg`, `pitchDeg`, `distance`, `fovDeg` — as `[from, to]`, sampled
at `i/frames`. `sweep.time: true` uses the scene's own frame range and holds the camera
still while the clip plays under it.

What comes back per shot, in the report and under `--json`:

- the **full absolute pose** — station, compass, azimuth/elevation,
  distance, lens — enough to re-issue it or nudge it. Nothing is stored
  between compiles; the pose in your context is the state.
- **`frame spans`** — the metres across the frame at the aim depth. A 2mm
  screw and a 2m door make the same picture; this is the number that
  tells them apart.
- **`caught`** — the measured fraction of frame the subject fills.
  `caught: nothing` means the pose is exact and pointed at empty space,
  which is not a defect in your geometry.

Two rules that save a round: shots are rendered by the **proof** stage, so
`--fast` produces none (it says so rather than going quiet); and a shot
that turns in place has no subject, so it reports where it *stands* and
what it *faces* instead of a target and a distance.

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
  box (a metres tuple) and `ctx.material(name)` to bind a declared
  material to the active object (item access, `ctx["size"]`, also
  works). Create **exactly one mesh** — full `bpy` is yours inside that
  contract. The compiler fits the mesh into the box exactly like a
  `file:` asset (uniform scale, centred, bottom-rest, pivot at the box
  centre); placement stays the relations' job. A script that raises
  reports its own line number with this contract restated, and a
  missing script file is a parse error before Blender ever runs.
- `"recipe": "hull.py"`: `def build(ctx):` that RECORDS a deterministic
  kernel trace instead of building geometry. Seed with `ctx.box(half=1)` or
  `ctx.cage(points, faces)`, then chain fluently:
    - `ctx.subdivide(levels)` — exact Catmull-Clark. Smooth form.
    - `ctx.mirror(axis)` — 0=x/1=y/2=z. For OPEN half-shells (build half,
      mirror to close), not a closed solid.
    - `ctx.move(region, offset)` — translate a coordinate region: taper,
      stretch, asymmetry.
    - `ctx.crease(region)` — mark the edges inside a region sharp so
      subdivision keeps them crisp: a flat base, a hard rim.
    - `ctx.scale(region, factor, pivot)` — taper or bulge a region about a
      pivot.
    - `ctx.extrude(region, offset)` — grow the faces in a region outward by an
      offset vector: a bump, a boss, a socket. The offset is a rational
      vector, not a normal distance, so it stays exact.
    - `ctx.inset(region, factor)` — shrink each face in a region to an inner
      panel ringed to its border: a frame, a recess. Factor in (0, 1).
    - `ctx.clip(normal, d)` — cut the mesh by a plane, keeping the half-space
      `normal·x ≤ d` and capping the cut watertight: a chamfer, a bevel, a
      flat facet, or a chain of clips carving the solid against a convex tool.
      The cap welds with no seam — the crossing is exact — and because a plane
      through a planar face leaves it planar, a clipped box keeps a provable
      `volume` with no `triangulate`.
    - `ctx.triangulate()` — fan every face into planar triangles, as the LAST
      step: the opt-in that makes a `volume` claim provable on a curved or
      subdivided mesh, at the cost of quad editability.

  A `region` is a dict of axis → `[min, max]` inclusive bounds (`{"z": ["1",
  "1"]}` is exactly the plane z=1; `{}` is everything). `move`/`scale`/`crease`
  are topology-preserving, `extrude`/`inset` add geometry, and `clip` removes
  it — all exact.

  Morph targets (blendshapes): `ctx.shape("name")` … `ctx.end_shape()` records
  a named variant — deform the base with `move`/`scale` only inside the
  bracket, and it becomes a Blender shape key; because subdivision is linear a
  delta authored on the cage lands on the subdivided surface exactly. Author
  the shape BEFORE the `subdivide` to move tens of cage vertices instead of
  thousands.

  Coordinates are ints, rational strings (`"1/2"`) or `fractions.Fraction`
  — never floats. It runs in plain CPython (no `bpy`), so ordinary loops
  and helpers are fine; the compiler evaluates the trace in exact rationals,
  fits the mesh into the box like `file:`/`script:`, and — because it owns
  the geometry — PREDICTS the built census and adjudicates it against
  Blender (`S3D-E-702` if they ever disagree). Reach for `recipe:` over
  `script:` when you want smooth/organic form that is deterministic across
  machines and count-provable (a rounded hull, a mirror-exact shell); reach
  for `script:` when you need arbitrary `bpy`.

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
| `sits_on` (`embed`, `axis`) | rest on top, sunk so faces overlap; takes the support's x/y unless something else speaks |
| `above` (`clearance`, `axis`) | float past a part with a measured gap, along `axis` (default z) |
| `align` (`axes`) | centre on another part along named axes |
| `inset_from` (`faces`, `by`) | pull named faces in from a reference; it only insets |
| `span` (`from`, `to`, `axis`, `embed`) | stretch between two parts, biting into both |
| `repeat` (`count`, `along`, `every`) | array at a centre-to-centre pitch; two repeats compose a grid |
| `scatter` (`on`, `count`, `seed`, `minGap`, `sizeJitter`) | owns the part's whole placement; deterministic; a region too small fails loudly |
| `around` (`center`, `radius`, `count`, `axis`, `startDeg`, `orient`) | ring `count` instances evenly about another part's centre; `orient: true` turns each one to face its own angle |

`sits_on` with a non-z `axis` is an ATTACHMENT, not a resting — a pommel
capping a Y-up grip. The face-to-face placement is the same and the
support's x/y still fill in, but it says nothing about gravity, records no
resting support, and leaves z open: give the part a z of its own, an
`align` on z or a real `sits_on`.

`around` owns the part's placement in the circle's PLANE and nothing
else — the coordinate along the circle's normal still comes from the
part's own relations, so `sits_on floor` + `around hub` is a ring
standing on the floor. Do not hand-compute `at` positions for a ring;
that arithmetic is what this relation deletes.

`repeat` × `scatter` on the same part is refused, and so is `around`
beside `repeat`, `scatter`, another `around`, or a `span`. Contacts and repeat
pitches floor 1 mm from flush. Loud ceilings, never a silent shortfall:
`repeat` refuses past 100,000 instances, and a scene refuses past 100,000
parts after expansion — backstops against a runaway count, far above any scene
you would mean. Below them a large scene is slow rather than refused: 5,000
instances is a legal scene that takes as long as building 5,000 objects takes.

Recipe and kernel geometry is guarded separately, by the work meter: a
resource-denominated ceiling counted in work units, one unit being roughly one
vertex or face produced, so an accidental `subdivide(1000000)` or a runaway
loop stops with a diagnostic instead of exhausting the machine. Raise it with
`workBudget` on the compile request (`--work-budget` on the CLI) when the asset
and the machine are both bigger.

The contact scan (grounding, touching-faces, the rested-pair check) runs at
any part count: it sweeps and prunes along the scene's longest axis, so it
costs what the NEARBY pairs cost rather than what every pair would. A pair too
heavy to refine falls back to its axis bound and is named, and anything the
scan excludes it reports by name — an empty contact list still means "nothing
within range", never "nobody looked".

**Materials.** A material is a set of BINDINGS onto a surface, and every
channel takes either a constant or a baked shader output. Those are the same
answer at two fidelities — `roughness: 0.4` and
`roughness: { "shader": "shd_rust" }` both say what the roughness IS — so
there is one vocabulary to learn and nothing is a special case.

The everyday channels: `baseColor` (linear RGB, required unless `shader` is
set), `roughness` (default 0.5), `metallic` (0 or 1 — the pbr rule rejects
in-betweens), `emission` + `emissionStrength` (watts, default 1), `alpha`
(0–1, default 1).

The rest of the surface, each a real shading behaviour rather than a texture
trick:

| channels | what they are for |
|---|---|
| `coat`, `coatRoughness`, `coatIor`, `coatTint`, `coatNormal` | a clear lacquer over the surface — car paint, varnish, a wet look |
| `transmission`, `ior` | light passing THROUGH — real glass, water, a bottle. Not the same as `alpha` |
| `sheen`, `sheenRoughness`, `sheenTint` | a retroreflective rim — cloth, velvet, dust, peach skin |
| `subsurface`, `subsurfaceRadius`, `subsurfaceScale` | light scattering under the surface — skin, wax, marble, jade |
| `anisotropic`, `anisotropicRotation` | a stretched highlight — brushed metal, hair, vinyl |
| `thinFilmThickness`, `thinFilmIor` | iridescence — soap, oil on water, a beetle shell |
| `specular`, `specularTint`, `diffuseRoughness` | dielectric reflectance and the diffuse lobe |
| `normal` | a tangent-space normal map, bound directly (a `height` output still derives one) |
| `displacement` | a shader-bound height field that moves geometry on export, not a surface input (see below) |

How the surface is READ is a separate question from what it is:
`alphaMode` (`opaque` | `mask` | `blend`), `alphaCutoff`, `doubleSided`.
`mask` is a hard cut-out that sorts correctly in every engine — use it for
leaves, chain-link and decals; `blend` is true translucency.

`shader: "shd_x"` remains the whole-material shorthand: it binds each of that
kernel's outputs to its matching channel. Per-channel bindings win over it, so
a material can wear a kernel and still pin one channel to a constant, or drive
its coat from a second kernel.

**What travels.** Every channel that IS a surface input reaches the surface
the compiler builds, so the proof frames show it. `displacement` is the
exception in the other direction: it drives the material output rather than
the surface, so it moves geometry in an engine that tessellates and does not
change the proof — do not read a proof frame as evidence about it. Deliverables are a separate question:
OpenUSD is the master and each container is lowered from it, so a channel
`UsdPreviewSurface` and MaterialX cannot express reaches the picture and not
the `.glb`. The compiler MEASURES that and says so (`S3D-W-903`) naming the
channels — ship `out/scene.usda` where the effect matters.

**Camera and light.** In declarative spec scenes, staging is derived from the
solved bounds. Steer with `"camera": { "azimuthDeg": 30, "elevationDeg": 20 }`
and `"light"`. Raw scenes may author their own camera and light directly.

`"light"` is `"studio"` (default), `"sun"`, or an object that scales the same
derived rig:

```json
"light": { "preset": "studio", "key": 0.04, "ambient": 0.008 }
```

| field | what it does |
|---|---|
| `key` | multiplier on the derived key power. `1` is the default; `0` removes the key entirely |
| `ambient` | the world's own light — a linear grey level, or an `[r, g, b]` triple for a coloured cast |
| `azimuthDeg` / `elevationDeg` | where the key stands, in the same compass the camera and orbit use |

**To light a scene by its own lamps, you must turn the room off.** `key` and
`ambient` answer different questions and a night shot needs both near zero: a
dim key against a bright world is an overcast afternoon, and a bright key
against a black world is a subject in a void. With the key down, `emission` on
a material stops being a glow and starts being a lamp — an emissive surface
casts real light onto what is near it, so a lantern pools warmth on the counter
under it and a lit sign rims what it hangs over. At full key it can only ever
blow out, which is why an emissive part in a default shot looks like a white
blob rather than a light.

Judge emission on `out/materials/ball-<material>.png` before the turntable. The
report says `ball clips N%` when the material's output exceeds display range —
that number, not the frame, is what tells you the strength is too hot.

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
artifact: `parts`, `maxTriangles`, `grounded`, `maxHeight`, `minHeight`,
`footprint` `[x,y]`, `minFootprint` `[x,y]`, `watertight`,
`materialsUsed`, `volume`. Numerics are upper bounds except `parts` (exact) and
the two `min*` floors — the floors exist for scale honesty: a scene
uniformly wrong by 100× has no internal outliers for any relative check
to catch, so `minHeight`/`minFootprint` are your one-line signature of
real-world magnitude (declare a floor and a ceiling together and the
scene's scale is bounded outright). `materialsUsed` is an ARRAY OF NAMES, not a
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
TIME with an interval calculus: sampled frames can prove a failure; the
closed-form swept envelope of compiler-owned motion can prove either
verdict — failure (a fast spin's corner sweep is exact for boxes;
integer-frame samples that never land on 45° cannot save it) or pass (an
envelope inside the bound retires the stride caveat); and when the
calculus can only bound the claim, it reports UNPROVEN rather than
guessing either way.

**`volume`** is the exact physics claim: an EXACT RATIONAL string (`"4/3"`,
`"297412448/475021263"` — never a float) asserting the total enclosed volume,
and the compiler proves or refutes it in ℚ, no tolerance. It is deliberately
narrow, because it is a theorem about the SHIPPED asset, not a guess:
- **Recipe geometry only.** Every part must be a `recipe:` part (the kernel
  built it, so its volume is exactly known). A primitive `box`/`cylinder`,
  an imported `file:`, or a `script:` part has no exact rational volume, so
  the claim stays honestly *unchecked* (the report names the offending part).
- **The mesh must be a single closed solid** (watertight, one shell). An open
  shell encloses no volume.
- **A curved surface needs `ctx.triangulate()`.** A subdivided/curved mesh has
  bent quads, so its volume shifts depending on how an exporter splits them and
  the claim reads *unchecked* (with the range it could land in). Add
  `ctx.triangulate()` as the last recipe step to lock it down — then the volume
  is one fixed number and the claim holds. A flat-faced box needs nothing.
- **Mind the fit.** A recipe fills its `size` box by UNIFORM scale (the cage is
  scaled by `min(size/extent)`, not stretched per-axis), so a unit-cube cage in
  `size:[2,1,1]` is a 1×1×1 cube resting in the box, volume `1`, not `2`. Build
  the proportions into the cage; a wrong claim is refuted with the exact value.
- **Don't hand-derive the value.** The exact volume is often an ugly rational;
  claim the value the compiler reports (a wrong claim is refuted WITH the right
  one, so one compile tells you what to write).

Alongside the volume it reports the centre of mass and whether the shape is
mass-symmetric, and it refuses a mesh that passes through itself, naming the two
faces that cross — so a `volume` you claim is a real physical fact about the
asset, not an approximation.

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
`uCamelCase`, used bare — the compiler injects the declaration from the
`uniforms` block, so a hand-written one either collides or silently does
nothing. Floats need a decimal
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

Outputs are the MATERIAL CHANNELS, plus two things that are bakeable
without being surface inputs. Anything a material can wear, a kernel can
write — `baseColor`, `emission`, `roughness`, `metallic`, `normal`,
`alpha`, `coat`, `coatRoughness`, `sheen`, `transmission`, `subsurface`,
`anisotropic`, `thinFilmThickness`, and the rest of the table above. The
two extras: `height` (you author bump; the compiler derives a wrap-aware
normal from it, `normalStrength` 0–10, and it is also what `displacement`
binds to) and `occlusion` (baked to disk for you to multiply into
`baseColor` yourself — no surface has an AO input, so a material cannot
wear it). Colour channels are sRGB-encoded; everything else is Non-Color
data. Entry points are named BY OUTPUT, not by position: `baseColor` is the plain `vec4 kernel(vec2 uv)`; every other
output needs its own `vec4 kernel_<output>(vec2 uv)`. So
`["baseColor", "roughness"]` defines `kernel` and `kernel_roughness` —
and a height-only shader (`["height"]`) defines just `kernel_height`,
no plain `kernel` at all. An output declared with no matching function
is a wasted round trip, not a partial bake.

**Time is a kernel dimension.** `"frames": 16` (any power of two >= 2) bakes a
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
graph code. The `turntableSteps: 6` above is this example narrowing the
default, not the norm: the default is 8 (16 when the scene animates), the
contract accepts 1–360, and the HTTP route rejects anything above 64.

`conventions.units.upAxis` is the EXPORT target's frame — how the shipped
file is written for a downstream engine. It does not change what Z means
in `scene.json`, which is always Z-up (see Orientation).

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
| `scene3d compile --frames --agent-message` | You cannot read images: frames arrive as ASCII ramps. |
| `scene3d compile --no-turntable` | One still instead of an orbit. |
| `scene3d compile --respect-scene-camera` | One still through the camera the SCENE places. No compass name is claimed for it. |
| `scene3d compile --look prp_x:left` | Photograph one part from one side. Repeatable. Needs the proof stage. |
| `scene3d compile --shot '<json>'` | Turn in place, sweep an angle, ride the animation. The general form. |
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
   frames blow out, quarter the energy. Read them in this order:
   - **`out/contact.png` first** if you can read images. Every proof frame
     on one labelled page: each cell carries its compass name and azimuth,
     an axis gnomon showing world `+X +Y +Z` as projected from that camera,
     and one numbered badge per part keyed to a legend. It is the only
     artifact that says which frame is which side, so it answers "is the
     back finished" and "which cylinder is `prp_mast`" in one look.
   - **The loose frames** at `out/proof/proof-<24 hex>-NNN.png`, `NNN` =
     `000`, `001`, … The hash changes every compile — never guess it; the
     report prints the exact pattern and the index range.
   - **`--frames`** (or `"frames": true` on the API) when you cannot read
     images at all: the frames arrive as ASCII luminance ramps sampled
     around the orbit. The report also carries `orbit:` and `badges:`
     lines with the same compass and part facts as text.

   You are never actually blind to the shot.
6. **The `looks:` block**, when you asked for a shot. Each entry carries
   the pose it resolved to — subject, compass, azimuth and elevation,
   distance, lens — plus `frame spans` (metres across the frame, so you
   can size what you see) and `caught` (how much of the frame the subject
   fills). `caught: nothing` is the pose reporting that it is exact and
   aimed at empty space; move the camera, not the geometry. The pose is
   also the input to your next shot: change one number and re-issue.
7. **`out/ortho.svg`, every structural change, no exceptions.** A
   dimensioned plan/front/side drawing — and it is SVG, so it is
   readable as text even without vision. A 2-second look catches a
   proportion or overlap mistake the turntable's angle hides; a field
   build once shipped a defective cage because nothing told its author
   to look here.

Every compile whose manifest stage ran — `--fast` included — carries a
`read:` block, and each line appears only when the file exists this
pass: `out/digest.md` and `out/read-model.json` always, `out/ortho.svg`
with a census, `out/contact.png` when frames were photographed,
`out/textures/` and `out/materials/` when bakes and ball
previews landed, `out/index.html` and `kit.html` when frames exist.
Follow it rather than guessing what exists — a path it names is there,
and because it lists *this* compile's artifacts it is also where you read
the current proof-frame filenames instead of guessing the hash. `out/digest.md` is the prose twin of the report: issues first,
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
the WebGL viewer's Y-up, not `scene.json`'s Z-up — convert when you
fold). Treat it as design direction from your collaborator:

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
