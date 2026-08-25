---
name: example-scene3d
description: Author 3D models, scenes, GPU materials, sprite sheets, flipbook animations, skyboxes, voxel/Minecraft models, and kits as code, then compile them with one call (`od scene3d compile`). Use when the user asks for a 3D model, prop, scene, asset kit, texture, shader, flipbook, skybox, voxel model, or a GLB/USD export.
---

# 3D Scene & Assets — quickstart

You are the fabricator. The shop floor is a compiler.

Decide what the piece should **be** — silhouette, material story, true
scale in metres, one light idea — and write that as source. The compiler
builds it through headless Blender, photographs it, measures every part,
and sends back a letter from the bench. Facts arrive; you refine against
them. Treat the example below as **grammar, never vocabulary**: derive
every shape, name, and proportion from the brief.

## The loop

```
design  →  write sources  →  compile  →  read the report  →  refine by code  →  compile again
```

```bash
"$OD_NODE_BIN" "$OD_BIN" scene3d compile \
  --project "$OD_PROJECT_ID" --scene scenes/<name> --agent-message
```

While structure is still moving, add `--fast` (no photographs — seconds,
and it still bakes shader textures and refreshes the manifest). Drop
`--fast` when you want eyes: proof frames, exports, material previews.
Add `--no-cache` only when you suspect a stale cache. With the same
invocation prefix and `--project`/`--scene` arguments,
`scene3d manifest --json` reads the last compile without Blender and
`scene3d tweaks --json` reads the user's viewport edits (fold them into
source, then `--clear`).

## A first scene

`scenes/<name>/scene.json` (+ optional `scene3d.json` contract):

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

Parts fill declared boxes (metres); relations place them; the solver
does the arithmetic; claims are re-checked against the *built* artifact
on every compile. Ids: `[A-Za-z][A-Za-z0-9_]{2,63}` (`prp_`, `mtl_`);
shader names are stricter — `shd_` then lower_snake (`shd_rust`, never
camelCase). Shapes: `box`, `cylinder`, `sphere`, `cone` (+`tip`), `torus`,
`wedge`, `tube`, `capsule` — or fill a box with `"file": "asset.glb"`
or `"script": "hull.py"`. Relations: `at`, `sits_on`, `above`, `align`,
`inset_from`, `span`, `repeat`, `scatter`, `around`, plus per-part
`rotate`, `spin`, `bob`, `screw`. GPU materials are a `.glsl`
`vec4 kernel(vec2 uv)` plus a `shaders` block (`baseColor` is `kernel`;
any other output gets its own `kernel_<output>`); `"frames": 16` bakes a
flipbook. Kernels use the integer-hash noise stdlib — `s3d_hash21`,
`s3d_hash22`, `s3d_vnoise`, `s3d_fbm`, `s3d_voronoi`, plus seamless
`_tiled` variants for anything that repeats — those take a second
period argument matching your pre-scale, `s3d_fbm_tiled(uv * 6.0,
vec2(6.0))`, same number both places — never hand-rolled
`fract(sin(...))`, which renders
differently per GPU driver; a `frames` kernel animates from
`uS3dTime` ∈ [0, 1). A part that is *meant* to float or bed while the
scene claims `grounded` goes in `conventions.grounding.exempt` — a
contract key, in scene3d.json like all `conventions.*`. Keys beginning
`//` are margin notes, ignored by every unknown-key check in both
files. In
**scene3d.json** (the contract, beside scene.json — never in
scene.json itself): `"target": "voxel"` / `"minecraft"` moves the same
language onto the pixel grid, and 2D sheets are declared like
`"sheets": [{ "file": "flame.png", "kind": "flipbook", "grid": [4, 4] }]`
— kinds are `sprite`, `flipbook`, `particle`, `beam`, and `sky`
(a skybox is six `sky` faces, `ft bk up dn lf rt`).

## The compiler teaches you the rest

You start every run blind; the harness is built for that. Trust its
messages over memory — when a message and any doc disagree, the message
is measuring the current build:

- **Misspell any key** — in scene.json, a shader block, or the contract —
  and validation refuses it with a `did you mean …?` naming the legal
  field. Guessing a spelling costs one fast parse, never a Blender run.
- **Every warning names its lever.** The `fix:` line carries the exact
  contract knob when the rule is tunable, and `data:` carries the
  measured numbers. You never need a rule catalogue.
- **The report carries its own map** — a `read:` block naming every
  diagnostic on disk (`out/ortho.svg` dimensioned drawings,
  `out/digest.md` census prose, `out/read-model.json`), and clean
  compiles close with a `next:`/`tip:` line matched to where the loop
  stands, when one applies. Follow them; they are cheaper than
  re-deriving the state of the world.
- **You are never actually blind to the shot.** Open the proof PNGs if
  you can read images; pass `--frames` if you cannot and the frames
  arrive as ASCII luminance ramps sampled around the orbit. Every proof
  also writes per-material lit-sphere previews to `out/materials/` —
  judge emission and alpha there before paying for a turntable.

## Reading the letter

1. `ok` and the counts — errors first; info is a hint, not a gate.
2. `scale:` — catch unit slips before trusting any render.
3. Solved boxes — placement you can read without a viewport.
4. `out/ortho.svg` after every structural change — a 2-second look
   catches proportion and overlap mistakes the turntable hides.

Fix the source, compile again; do not argue with the measurement. The
harness validates what was **built** — comparing it to what was *meant*
is your job, and claims are how you write that intent down so the
compiler holds it for you.

## Going deeper

The full grammar — every shape's fields, `rotate`/`around` semantics,
kernel outputs and time, contract knobs with exact nesting, sheet
disciplines, raw `build.py` mode, and the operational facts (ports,
409s, Windows BOM) — lives in the **`scene3d` design template skill**
(`design-templates/scene3d/SKILL.md` in the Open Design repo). It may
not be staged in your session; do not hunt for it. When this page runs
out: lean on the compiler's messages first (they carry the exact key,
knob, or fix at the moment you miss), and if you genuinely need the
reference, ask the user to enable the scene3d design template skill.
For most props and scenes, this page plus the compiler's own letters
are enough.

One convention for every `run:` hint the harness prints: `od` names
this CLI — invoke it through your session's prefix
(`"$OD_NODE_BIN" "$OD_BIN" …`) if bare `od` is not on your PATH.

When `ok="true"`, the claims hold, the proofs show the brief, and the
user's bench edits are folded or left on purpose: the piece is made.
