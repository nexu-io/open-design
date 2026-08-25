---
name: example-scene3d
description: Author 3D models, scenes, GPU materials, sprite sheets, flipbook animations, skyboxes, voxel/Minecraft models, and kits as code, then compile them with one call (`od scene3d compile`). Use when the user asks for a 3D model, prop, scene, asset kit, texture, shader, flipbook, skybox, voxel model, or a GLB/USD export.
---

# 3D Scene & Assets

You are the fabricator. The shop floor is a compiler.

Decide what the piece should **be**: its silhouette, its material story,
its true scale, the one idea the light will carry. Write that as source.
The compiler builds it through headless Blender, lights it, photographs
it, measures every part, and sends back a letter from the bench. Nothing
ships on eyeballs and hope. Facts arrive. You refine against them. The
piece gets better because you can see. The pipeline carries the physics
so your attention stays on the design.

Treat the examples in this file as **grammar, never vocabulary**: derive
every shape, name, proportion, and colour from the brief. A scene that
could pass for a doc example has not been designed yet.

## The loop

```
design  →  write sources  →  compile  →  read the report  →  refine by code  →  compile again
```

One command. No second tool for "check naming" or "preview the turntable".

```bash
"$OD_NODE_BIN" "$OD_BIN" scene3d compile \
  --project "$OD_PROJECT_ID" --scene scenes/<name> --agent-message
```

While structure is moving, stay on the fast gear (parse + build + lint,
no photographs):

```bash
"$OD_NODE_BIN" "$OD_BIN" scene3d compile \
  --project "$OD_PROJECT_ID" --scene scenes/<name> --fast --agent-message
```

You never choose file formats. You write geometry and materials; the
contract ships containers. The report tells you what the bench saw;
read it, change the source, go again.

Also on this surface:

| Command | When |
|---|---|
| `compile --fast --agent-message` | Default iteration |
| `compile --agent-message` | Photographs + export; the pass you call done |
| `compile --no-cache` | Cache is stale |
| `compile --fail-on warning` | Final pass |
| `compile --json` | Scripting |
| `manifest --json` | Last compile, no Blender |
| `tweaks --json` | Read the user's bench |
| `tweaks --set '<json>' --merge` | Write bench edits |
| `tweaks --clear` | After you have folded intent into source |

## What you can make

One shop. Pick the job from the brief.

| Job | You write | The compiler |
|---|---|---|
| **Prop / assembly** | Parts + relations + materials + claims | Solves placement, keeps contacts from z-fighting, photographs, ships |
| **Scene** | Several props — `repeat`, `scatter`, stacking | Scatter that does not reshuffle when you add a part; camera that contains the subject |
| **Downloaded asset** | A dir of `.glb`/`.gltf`/`.obj`/`.fbx`, or `"file":` inside a box | Imports, frames, measures, repackages. `material` on a file part reskins it |
| **Freeform shape** | `"script": "hull.py"`, `def build(ctx)`, exactly one mesh | Fits it into the declared box; relations still work |
| **GPU material** | `.glsl` kernel `vec4 kernel(vec2 uv)` + a `shaders` block | Bakes (height → normal map too), wires it, shows it in the proof and the GLB |
| **Motion** | Per-part `spin` / `bob` | Owns keyframes, derives an animation, keeps clips on imported rigs |
| **Sprite / flipbook / VFX / sky** | A sheet file, or a kernel with `"frames": 16` | Measures the atlas. A frames kernel *is* a sheet, so materials do not bind it |
| **Voxel / Minecraft** | Same language on the pixel grid, or drop a `.bbmodel` / Java `model.json` | Grid-snaps, format warnings, emits the JSON the game loads |

If the brief is a flame atlas, a sky cube, a rusted helmet, or a golem
the game can wear, that is this shop.

## Design before fabrication

From the brief, before a file:

- **Silhouette.** One dominant mass, plus something that breaks symmetry.
- **Material story.** Two or three materials that mean something beat six
  that decorate. Metallic is 0 or 1; roughness carries the life.
- **Scale honesty.** Metres. A door ~2 m, a mug ~9 cm; read `scale:` on
  every report.
- **One light idea.** What the key is *for* before you set energy.

## Two disciplines

**Continuous (default).** Hard-surface, imported meshes, shaders, sheets.
Contacts floor 1 mm from flush. Units are metres.

**Voxel.** `"target": "voxel"` for any engine (ships GLB/USD/OBJ), or
`"target": "minecraft"` when the destination is the game.

What changes: `repeat`/`scatter` snap to the grid; sizes and `at` want
multiples of 1/16 m (0.0625); height is Z; standing models rest on
`z = 0`; even pixel sizes keep centred boxes on-grid. Minecraft also
wants cuboid `box` parts and emits `out/minecraft/model.json` (or
Bedrock `geometry.json`, via `conventions.minecraft.dialect: "bedrock"`).
Drop a Blockbench
file instead of `scene.json` to import and refine (a derived spec lands
at `.scene3d/imported.scene.json`: promote it and iterate).

A voxel sphere is fine under `voxel`. It is not a Minecraft element.
That is a format fact, not a taste. Engine names are not styles here.

## Lay out the job

```
scenes/<name>/
├── scene.json        # default source
├── scene3d.json      # contract
├── tweaks.json       # user's bench; fold this
└── out/              # product, after compile
```

One authority per directory. `scene.json` + `build.py` together is two
people claiming the same geometry. Bare meshes inspect-and-repackage
(relax naming, allow open meshes). `build.py` is the escape hatch for
booleans, curves, modifiers: you then build the whole scene, named
camera and light included.

## The language

Parts fill stated boxes. Relations place them. The solver does the
arithmetic.

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
    { "id": "prp_mast", "size": [0.08, 0.08, 0.7], "shape": "cylinder", "material": "mtl_hull" },
    { "id": "prp_beacon", "size": [0.2, 0.2, 0.2], "shape": "sphere", "material": "mtl_signal" }
  ],
  "relations": [
    { "type": "at", "part": "prp_deck", "center": [0, 0, 0.05] },
    { "type": "sits_on", "part": "prp_mast", "on": "prp_deck" },
    { "type": "align", "part": "prp_mast", "to": "prp_deck", "axes": ["x", "y"] },
    { "type": "sits_on", "part": "prp_beacon", "on": "prp_mast", "embed": 0.03 },
    { "type": "align", "part": "prp_beacon", "to": "prp_mast", "axes": ["x", "y"] }
  ],
  "light": "studio",
  "claims": { "parts": 3, "grounded": true, "watertight": true, "maxHeight": 1.05 }
}
```

Ids follow `[A-Za-z][A-Za-z0-9_]{2,63}` (`prp_`, `mtl_`, `shd_`). Shapes:
`box` (default), `cylinder`, `sphere`, `cone`, `torus`, or fill the box
with `"file": "assets/helmet.glb"` / `"script": "hull.py"`. A script
defines `def build(ctx)` (`ctx.size`, `ctx.material(name)`; item access
also works), creates exactly one mesh, and does not place itself.

Relations (any order; need one `at`): `sits_on`, `above`, `align`,
`inset_from`, `span`, `repeat`, `scatter`. `scatter` owns placement;
`repeat` × `scatter` on the same part is refused.

Steer framing with `"camera": { "azimuthDeg", "elevationDeg", "distance" }`
and `"light": "studio" | "sun"`.

**Claims** (`parts`, `maxTriangles`, `grounded`, `maxHeight`,
`footprint`, `watertight`, `materialsUsed`) are checked against the
build. `grounded` means nothing sinks through the floor; floating is a
legitimate composition, and a failed claim always carries its measured
truth. Claim what matters.

**Kernel.** You write `vec4 kernel(vec2 uv)`. Uniforms `uCamelCase`,
used bare. Stdlib: `s3d_hash21`, `s3d_hash22`, `s3d_vnoise`, `s3d_fbm`,
`s3d_voronoi`. Outputs: `baseColor`, `emission`, `roughness`,
`metallic`, `height` (compiler derives the normal). `"frames": 16`
bakes a flipbook atlas with `uS3dTime` ∈ [0, 1); loop on the unit
circle; materials cannot bind a frames shader.

**Sheets** on the contract: `sprite`, `flipbook` (`grid`), `particle`,
`beam`, `sky` (six faces `ft bk up dn lf rt`). `tint: true` means keep
the art neutral, ready to colour downstream.

**Motion:** `"spin": { "axis": "z", "seconds": 5 }`, `"bob": { "amplitude": 0.05, "seconds": 4 }`.

Contract sketch (continuous):

```json
{
  "schemaVersion": 1,
  "conventions": {
    "naming": {
      "objectPattern": "^[a-z]{3}_[a-z0-9_]{2,60}$",
      "forbidDefaultNames": true,
      "partPrefixes": ["prp_", "cam_", "lgt_", "mtl_", "shd_"]
    },
    "pbr": { "metallicValues": [0, 1] }
  },
  "proof": { "resolution": 512, "turntable": true, "background": "#1a1d22" }
}
```

Minecraft: `{ "schemaVersion": 1, "target": "minecraft" }`.
Voxel-not-game: `{ "schemaVersion": 1, "target": "voxel" }`.

Iterate lighting cheap (`resolution: 256`, `turntableSteps: 1`).

## How to read the report

The `<scene3d-report>` is a letter from the shop floor.

1. **`ok` and the counts.** Errors first.
2. **The code is a handle.** There is no catalogue to memorize. The line
   already carries the target, the measured fact, and a `fix:`; the
   `data:` lines carry the numbers. When `origin` is present it names
   the source line that made the geometry, so start there.
3. **`scale:`** world size and the smallest part. Catch unit slips
   before you trust a render.
4. **Solved boxes** on spec scenes: centre, size, what it rests on.
5. **Proof frames** when a finding is about how the shot looks, and
   always before you call it done. A perfect mesh can still photograph
   black. For a ~1 m prop, a key AREA around 50–80 W; if frames blow
   out, quarter the energy.

`out/digest.md` names contacts that broke. Fix the source, compile
again. Do not argue with the measurement.

## The user's bench

`out/kit.html` is where they orbit, pick, move, restyle. The host
Export menu ships files. Their edits land in `tweaks.json`. Read them
(`tweaks --json`), fold them into source the next time you touch the
scene, then `--clear` so the bench does not fight you on the next
compile.

## Craft

- One authority per directory.
- Names are design (`prp_lantern_cage`, not `Cube.001`).
- True scale, metres. Metallic 0 or 1.
- Fast while it is moving; full compile when you need eyes. Walk the
  proofs. Fold the bench.

When `ok="true"`, the claims still hold, the proofs show the brief,
and bench edits are folded or left on purpose: the piece is made.
