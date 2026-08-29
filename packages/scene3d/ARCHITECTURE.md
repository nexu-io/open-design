# scene3d — internals and design rationale

Why the compiler behaves the way it behaves: the contracts inside the
pipeline, the doctrine every layer obeys, and the failure stories that
produced the rules. Start at `README.md` for maintainer onboarding, the
host seam, the issue catalog, and how to change the system; this file
picks up where that one hands over.

Other companions: `KILN.md` (design lineage), `RESEARCH.md` (market thesis).

## The one-sentence version

A deterministic world compiler: sources go in through one compile call,
measured and adjudicated artifacts come out, and every failure leaves a
stable code carrying the measurement that proves it plus the most specific
available provenance for the source or imported asset that caused it.

## Layer map

```
┌─ Sources ──────────────────────────────────────────────────────────────┐
│ scene.json (the language)  ·  bare .glb/.gltf/.obj/.fbx (mesh kind)    │
│ build.py (raw authoring mode) ·  .usda layers  ·  .blend               │
├─ Parse ────────────────────────────────────────────────────────────────┤
│ schema validation with JSON paths (E-105) BEFORE any geometry exists   │
│ shader kernels read + structurally checked (comment-stripped, E-801)   │
├─ Solve (pure TS, no I/O) ──────────────────────────────────────────────┤
│ relation fixpoint → world placements · repeat/scatter expansion        │
│ path-addressed RNG (PCG/FNV over BigInt) · contact floors (1mm)        │
├─ Emit ─────────────────────────────────────────────────────────────────┤
│ deterministic bpy script (.scene3d/spec.build.py), byte-stable         │
│ GPU shader programs assembled (stdlib + kernel + dispatch), dual-      │
│ target: Blender create-info now, WebGL2 300 es for the editor panel    │
├─ Build (headless Blender 5, bpy module) ───────────────────────────────┤
│ GPU warmup → kernel compile ON THE DRIVER (E-802) → offscreen exec     │
│ (RGBA32F) → NaN oracle (E-804) → bake PNGs (own writer, exact sRGB)    │
│ → height→normal derivation (wrap-aware Sobel) → material wiring        │
│ real-asset import (per-format, shimmed, degraded-import notes W-207)   │
│ CENSUS: world-space measured facts (depsgraph-updated)                 │
├─ Proof ────────────────────────────────────────────────────────────────┤
│ EEVEE turntable, neutral ambient world + transparent film, frame       │
│ statistics measured (luminance/coverage/blown)                         │
│ aimed shots: station × gaze × lens × sweep resolved against the census │
│ (read/shot.ts), rendered in the same session, pose echoed back         │
├─ Export — USD IS THE MASTER ───────────────────────────────────────────┤
│ the stage (scene.usda) is authored FIRST with the writer's full payload│
│ (UsdSkel, blend shapes, animation, textures materialised, MaterialX    │
│ network + UsdPreviewSurface); every delivery container (GLB/OBJ/FBX)   │
│ is lowered from a RE-IMPORT of the master — a capability our writer    │
│ failed to author cannot silently reach a deliverable. Object animation │
│ is rebaked to keyframes post-import (the importer reads timeSamples    │
│ but builds no fcurves). USDZ is packaged pipeline-side from the FINAL  │
│ post-authored stage (stored entries, 64-byte aligned). Parity is a     │
│ measured claim: build-vs-master fingerprints, E-901 on any loss        │
├─ Lint ─────────────────────────────────────────────────────────────────┤
│ ~90 rules: naming·topology·UV·PBR·textures·units·world·integrity·      │
│ stage·sheets·claims — measure in Blender, judge in the contract        │
├─ Manifest / read model ────────────────────────────────────────────────┤
│ digest (budgeted, issues-first, density+symmetry stats), impact diff,  │
│ ortho SVG, provenance, assetKind DERIVED (never authored), claims      │
│ ledger {declared, failed} for the proven badge                         │
├─ Viewer detail layer (census-earned, degrade-to-plain) ────────────────┤
│ kit tree facts (dims·tris·materials·glyphs·source line·float gap·      │
│ bones·texel density), selection card, matColors swatches, clips,       │
│ ✓N claims shield — all carried in the kit page payload                 │
└────────────────────────────────────────────────────────────────────────┘
```

## The current language (scene.json): the fidelity matrix

This matrix describes the alpha language that exists today, not the full
creative scope of scene3d. The intended direction is a broader declarative
language for authored intent: composable procedural operations, richer
relations, sequenced keyframes, skeletal and deformation systems, and other
asset behavior can be added without changing the compiler's measured,
validated output boundary. `scene.json` and `build.py` are equally legitimate
authoring modes: JSON offers structured declarative intent, while Python is
the raw mode for direct procedural control. The JSON subset can grow without
making the raw mode a second-class path.

| Concept | Vocabulary | Guarantees |
|---|---|---|
| Parts | `size` (AABB, metres) + `shape`: box/cylinder/sphere/cone/torus/wedge/tube/capsule (+ `tip` frustum ratio on a cone, `thickness` wall on a tube) | every shape fills its box exactly; TRIFAN caps and all-quad tube rings → zero ngons by construction |
| Real assets as parts | `file:` .glb/.gltf/.obj/.fbx | joined, scaffolding-swept, fitted inside the box (bottom-rest); `material:` = wholesale override |
| Static rotation | per-part `rotate{axis, deg}` | one world axis, applied at the solved centre; the solver reasons in the ROTATED BOUND of the local box, so every relation stays correct without knowing rotation exists; a whole turn (`deg % 360 == 0`) and `span`+`rotate` are refused |
| Placement | `at`, `sits_on(embed, axis)`, `above(clearance, axis)`, `align`, `inset_from`, `span` | relation fixpoint, order-independent; 1mm contact floor → z-fighting structurally impossible; span extents floored + conflict-checked; `axis` defaults to z (gravity — records a resting support), any other axis is a face-to-face ATTACHMENT (a pommel on a Y-up grip) that grounding ignores |
| Multiplicity | `repeat(count, along, every)`; grids compose. `scatter(on, count, seed, minGap, sizeJitter)` | path-addressed RNG: adding parts cannot reshuffle a scatter; cross-scatter collision-free; repeat×scatter statically rejected |
| Materials | named PBR: baseColor/roughness/`metallic(0\|1)`/emission/alpha, or `shader:` | undeclared reference = parse error; every generated material authored |
| Shaders | `shaders` block: kernel file + typed uniforms + outputs + size (+frames) | see below |
| Animation (current subset) | per-part `spin{axis,seconds}`, `bob{amplitude,seconds}` | compiler-owned keyframes, looped (cycles modifiers), GLB carries clips, assetKind derives `animation`; sequenced and skeletal/deformation animation remain future language work |
| Staging | derived camera (`camera{azimuthDeg,elevationDeg,distance}` steers) + `light: studio\|sun` | shot always contains the subject; never raw coordinates |
| Claims | `parts, maxTriangles, grounded, maxHeight, footprint, watertight, materialsUsed` | adjudicated against the census (E-701); unadjudicable = W-701, never a silent pass; motion adjudicated across the cycle where measurable (sampled + exact envelope), with every hole in the walk named |

Identifier discipline holds everywhere. Part ids and material names are
charset-gated (`[A-Za-z][A-Za-z0-9_]{2,63}`), and shader uniforms are
`uCamelCase` with reserved system names (`uS3dOutput`, `uS3dTime`). That makes
every embedding, generated Python and assembled GLSL alike, injection-proof
by construction, verified by fuzz suites.

## The GPU shader pipeline

The author writes a pure kernel: `vec4 kernel(vec2 uv)` (+ `kernel_<output>`
per extra channel). The compiler owns:

- uniform declarations (typed from JSON values; std430 running-offset
  push-constant budget vs Vulkan's 128-byte floor)
- the stdlib: `s3d_hash21/22, s3d_vnoise, s3d_fbm, s3d_voronoi`, PCG2D
  over `floatBitsToUint`; avoids known driver-dependent constructions such as
  `fract(sin)` and aims for stable output across supported backends
- the wrapper + dispatch for two targets (Blender GPUShaderCreateInfo,
  WebGL2 300 es)
- execution: real driver compile (E-802 carries the driver's log),
  offscreen draw into RGBA32F (8-bit targets clamp Inf and blind the
  oracle), NaN/Inf scan (E-804 with count + location), byte-exact PNG
  writing with the compiler's own sRGB transfer (no Blender colour
  management in the loop); two fresh compiles under the supported toolchain
  bake byte-identical files

Outputs: `baseColor`, `emission` (sRGB), `roughness`, `metallic`
(Non-Color), `height` (Non-Color plus a derived wrap-aware tangent-space
normal map, `normalStrength` 0-10, wired through a Normal Map node).

**Time is a kernel dimension**: `frames: 2|4|8|16|32|64` bakes the kernel
per time cell (`uS3dTime` ∈ [0,1)) into a power-of-two atlas with a
structural 2px anti-bleed inset, and the atlas registers as a sheet, so
the existing 2D rules adjudicate GPU output exactly like hand-made
flipbooks: static kernels fail W-601, blank cells fail E-609, the grid and
POT rules apply. This is the bridge into the 2D/VFX asset pipeline: same
kernels, same stdlib, same diagnostics.

## The deterministic geometry kernel (`recipe:` parts)

A `recipe:` part fills its box with geometry the compiler MINTS, exactly, and
then adjudicates against the build. It is `src/kernel/`, and its shape is a
single architectural bet (fable's "(D)"): **the unit of exchange is a
language-neutral operator TRACE, evaluated by ONE evaluator in the compiler.**
A front-end — the raw-path Python recorder today, a declarative shape later —
only PRODUCES a trace; it never runs the kernel. That is what lets the author
stay imperative (ordinary Python, loops and helpers, in plain CPython with no
`bpy`) while the compiler still owns the geometry, predicts its census, and
checks its own work.

- **Exact rationals, no float, no trig.** `rational.ts` is BigInt rationals;
  every operator is rational averaging, so a mesh is exact through any number
  of subdivision levels and IDENTICAL on every machine — the first raw-path
  geometry that is deterministic across platforms, not merely per-build. The
  one rounding is `toEmitMesh`, at the boundary to Blender.
- **The op set** (`trace.ts` + `mesh.ts`): seed (`cage`/`box`/`grid`),
  `subdivide` (Catmull-Clark), `crease` (boundary and crease unified as one
  "sharp" predicate; dart/crease/corner rules; propagated through subdivision
  and mirror), `move`/`scale` (region deformation), `extrude`/`inset` (add
  topology), `mirror` (exact-coordinate weld, an integer permutation), and
  `shape`/`endShape` (morph targets). One coordinate-region selector drives
  the region ops. Subdivision is topology-REFINING: it assigns indices
  directly (`V'=V+E+F` always) rather than welding, so a prior deformation
  that coincided two vertices cannot make it tear the surface (the property
  fuzz found that; the fix is the principle).
- **Subdivision is proved CONTRACTIVE.** The exact local subdivision matrix at
  valence 3/4/5 is extracted FROM the kernel (the unit-vector trick on a
  wheel) and shown primitive with a simple dominant eigenvalue 1 and everything
  else strictly below — so the limit surface converges rather than creeps, the
  1-vs-1−ε distinction floats cannot make (`kernel-spectrum.test.ts`, with the
  exact subdominant — 1/2 at the regular vertex, (9+√17)/32 at valence 3 — from
  the engine's exact eigensolver).
- **Blendshapes propagate exactly.** A `shape(name)…endShape` bracket deforms a
  COPY of the base with `move`/`scale`; every global op outside a bracket
  applies to the base AND each shape, so a delta authored on the cage lands on
  the limit surface EXACTLY (`S·Δ`, subdivision being linear — doubling the
  cage delta doubles the propagated 98-vertex delta to the last bit). The
  box-fit is in TS (`fitToBox`), derived from the base and applied to every
  shape identically, because Blender refuses `transform_apply` on a mesh with
  shape keys; `_kernel_part` is then a pure `from_pydata` + `shape_key_add`
  builder.
- **The predicted census is the debut consumer** (the doctrine's purest form:
  the compiler is not the authority on its own success). `predictCensus`
  computes V/E/F/triangles/watertight/genus (real orientation + homology
  backing) and morph-target names from the exact mesh; `lint/kernel.ts`
  adjudicates them against what Blender measured (`S3D-E-702` mismatch,
  `S3D-W-702` unchecked). Because the fit is affine, the counts are invariant,
  so a mismatch is a theorem-grade bug that localises which stage lied.
- **Verified three ways.** Exact known answers (a fully-creased box stays an
  exact cube; a box-face boss is exactly V12 E20 F10), a seeded property fuzz
  (250 random operator sequences never tear a closed genus-0 solid), an
  adversarial red-team (which found and forced the topology-exact subdivision
  fix), and scryer as the exact eigenvalue/SNF authority. The end-to-end KAT
  builds a creased rounded hull with a `bulge` morph and confirms the census
  matches the exact prediction, shape key included. Lineage: `KILN.md`.

## Real-asset ingestion

- Bare files in a scene dir = `mesh` source kind: native import, derived
  staging (camera framed from bounds, sun keyed from the camera quarter),
  full census/lint/proof/export. Inspection contract posture documented
  (open meshes, fractional metallic, mirrored-shared UVs are real-world
  legitimate).
- Rigs are census facts: `armatures` (bone counts), `animation.actionNames`
  (real clips), both action APIs handled — and both travel into the
  MANIFEST, so an agent reading the last compile learns what a scene can
  play without spending a Blender run. Skins and imported animations
  survive GLB re-export (dissected and pinned). A `file:` PART is the
  exception and says so: fitting an asset inside a declared box is a join,
  and a join cannot carry an armature, so the drop is measured (armatures,
  bones, clip names) and reported as W-207 naming the bare-asset path that
  keeps the rig. Declarative rigging, skinning, and authored deformation
  systems are future authoring capabilities, not excluded domains.
- Damage handling is deterministic detect-and-name, never mutation:
  truncated files fail with the importer's own reason (E-202, no traceback
  soup); missing .mtl companions and geometry-free imports surface as W-207
  with the repair. Upstream importer bugs the compiler absorbs are shimmed
  narrowly and commented (Blender 5.0 FBX-with-lights crash).

## Voxel and Minecraft targets (`target: "voxel"` ⊂ `target: "minecraft"`)

Voxel discipline has two layers, because voxel art is an ecosystem
(MagicaVoxel / Goxel / Qubicle → Unity / Godot / Unreal via GLB/OBJ) and
Minecraft is one consumer of it with a format of its own:

- **`voxel`.** Engine-agnostic blocky-art discipline: grid alignment (W-970),
  the solver's grid-snap of `repeat`/`scatter`, and the pixel-art texel-density
  authority. Ships the normal GLB/OBJ/USD deliverables any engine imports. No
  format rule: a voxel sphere or a three-metre dome is legitimate. Gated on
  `contract.voxel.enabled`.
- **`minecraft` ⊃ `voxel`.** Layers the vanilla format rules (cuboid elements
  W-971, legal rotation W-972, element bounds W-973, the structure class I-970)
  and the model.json/geometry.json export on top. Gated on
  `contract.minecraft.enabled` (which implies `voxel.enabled`). A bare
  `target: "minecraft"` is pixel-art at 16 px/block.

**The oriented box is the authority.** A block-model element is authored as an
un-rotated `from`/`to` plus a rotation about an origin, so every element-space
question is a question about the box's own frame. The census recovers exactly
that (`voxel.center`, `localSize`, `rotationAxis`, `rotationDeg`); for a
long time one consumer read it while grid deviation, element extent, element
bounds and the Java exporter all reasoned over the world AABB, which for a
rotated box is its diagonal bound. That produced three wrong answers at once:
a Java-legal 22.5 degree rotation necessarily read as off-grid, so W-970
advised "snap the vertices" about the very rotations the format legalises; a
2.5-block element rotated 45 degrees measured 3.54, filed as multi-block
structure, and thereby escaped the element rules it was breaking; and the Java
exporter dropped every rotated box claiming the un-rotated extent was
unrecoverable. Grid alignment and rotation legality are separate questions,
asked separately, in the frame the format defines.

**Boxness is measured on positions, not topology.** A real MagicaVoxel or
Qubicle OBJ exports triangulated, and demanding six quad faces called a
visually perfect block "not a cuboid" and dropped it from the exporter. An
offset from a corner is an edge exactly when it is not the sum of two others;
taking the three shortest instead breaks on any elongated box, where a face
diagonal is shorter than the long edge.

Either way it is opt-in and never a style: every rule is a format or
consistency fact, silent without a target, so non-voxel scenes are
byte-identical. Adopted from a fable-5 architecture consult (`KILN.md` records
the reasoning); USD stays the master and the block model is a lowering of it.
The Java block model cannot express a non-cuboid (W-971 says so and the export
skips it); Bedrock's `poly_mesh` format could carry arbitrary geometry, a
documented boundary we have not built yet (it needs full per-vertex mesh export in the
census, and the format is niche).

- **Measure (census, `runner.py voxel_facts`, cheap O(verts), measured
  unconditionally; the grid-relative half waits for a declared grid).** Per mesh: `voxel.isBox` (a single rectangular cuboid, so a Java
  `element` is representable iff true), a recovered single-axis `rotationAxis`/
  `rotationDeg` for an oriented box (multi-axis boxes surface as `isBox` with a
  null axis), and `gridDeviation` (worst vertex distance from the authoring
  grid). Validated against axis-aligned / 22.5° / 30° / 45° / multi-axis /
  off-grid cubes.
- **Judge (`src/lint/voxel.ts`, a validated-style module, warnings only: the
  linter warns while you iterate, the exporter hard-refuses).** W-970 off-grid
  (the #1 real MC-model bug: clean in Blender, shimmers in-game), W-971 not a
  single cuboid, W-972 illegal rotation (Java allows one axis at {−45, −22.5, 0,
  22.5, 45}°; names the nearest legal angle; dialect-scoped, since Bedrock permits
  free angles), W-973 outside the −1..2-block element space. Relative texel
  consistency is left to the existing UV density rules (W-444/445), not
  duplicated.
- **Contract.** `EngineTarget += "minecraft"`; a `minecraft` conventions block
  (`dialect` / `grid.{size,tolerance}` / `pxPerBlock` / `elementBounds`) and its
  normalized form. `TARGET_PROFILES.minecraft` is Y-up like Blockbench. Grid in
  metres (1 block = 1 m, so px·m⁻¹ is px-per-block); legal angles are a format
  constant, not a knob.
- **Emit the block model (`src/mc/java-model.ts` + `emit.ts`, pipeline-side,
  lowered from the census, the usdz pattern).** Every axis-aligned cuboid →
  one Java `element` in pixels; the Blender→Minecraft frame map is a single −90°
  rotation about X, `(x, y, z) → (x, z, −y)`, then ×16. Faces carry a texture
  ref + full-tile UV; one texture per material (a flat colour is synthesised as
  a 16×16 sRGB PNG via `encodePng`, a bound image is copied); a default display
  block so the model shows in hand/GUI immediately. v1 is faithful, not
  exhaustive: it emits what it can represent exactly and reports the rest
  (spheres, rotated imports) rather than shipping wrong geometry; those are
  the same parts the linter already flagged. Deliverables land under `out/minecraft/`
  and group as one "Minecraft model" export in the host menu
  (`scene3d-assets.ts`, path-detected). Showcase fixture:
  `tests/fixtures/minecraft/golem`, a blocky biped, pixel-aligned, junctions
  overlapped 1px (how a modeller avoids in-game z-fighting), compiling clean and
  lowering to a standing model.
- **Import (`src/mc/import-java.ts`, the round trip closed).** A dropped-in
  Java `model.json` or Blockbench `.bbmodel` is the `mc_model` source kind
  (`discoverSources`: a `.bbmodel`, or any `.json` that is not scene/scene3d and
  carries an `elements` array). The pipeline converts it to a scene.json spec
  in memory, each cuboid element → a box part anchored by an `at` relation and
  the frame map the exact inverse of the exporter's (`(X,Y,Z)_px → (X, −Z, Y)/16`),
  then runs the normal path. The import comes out validated, built, linted (the
  voxel rules judge it) and re-emitted. A copy of the derived spec is written to
  `.scene3d/imported.scene.json` (the migration artifact: promote it to
  scene.json and iterate) without the compile mutating the source dir. An
  imported model implies the minecraft target unless a scene3d.json says
  otherwise; a converted model sets `source.kind = "spec"` so the
  source-agnostic solve/emit and build gates treat it uniformly (the solve/emit
  block lives outside the scene.json reader for exactly this reason). Faithful,
  not lossy-silent: a rotated element has no axis-aligned scene.json form and is
  skipped with a reason (W-207) rather than imported at the wrong orientation.
  Textures resolve to a flat base colour (a sibling PNG averaged in linear
  space, or an embedded `.bbmodel` data URI; unresolved → a neutral
  placeholder). `import(export(golem))` reproduces the elements exactly: the
  exporter's strongest regression (`voxel-pipeline.test.ts`).
- **Bedrock export (`src/mc/bedrock-model.ts`, `dialect: "bedrock"`).** Bedrock
  addons cannot load a Java block model, so a Bedrock author needs
  `geometry.json` specifically. It shares the Java exporter's validated frame
  map (`common.ts boxToMc`), so a cube sits exactly where the Java element
  would; only the container and texture model differ. A Bedrock geometry
  references one texture, so materials pack into a vertical 16×(16·N) atlas and
  every cube gets modern per-face UVs (format 1.16) into its material's row,
  with no box-UV-net guesswork. One root bone, `format_version 1.16.0`. Unlike Java,
  Bedrock emits single-axis-rotated cubes: the census recovers the box's own
  extent (`voxel.localSize`, by un-rotating the corners about the centroid) and
  centre, so a 22.5°-rotated cube exports as its true size with a `rotation` +
  `pivot`, not its bloated world AABB. The rotation mapping is exact rather
  than guessed: the frame map (x,y,z)→(x,z,−y) is a proper rotation, so conjugation
  gives Blender X→MC X (+θ), Z→MC Y (+θ), Y→MC Z (−θ), pinned by a round-trip on
  a real rotated cube; only Bedrock's per-axis sign convention stays unconfirmed
  until someone renders it in an engine. Multi-axis rotations (no single recovered axis)
  are still skipped with a reason. The LANGUAGE half of the rotated-element
  round trip now exists — a part's `rotate: {axis, deg}` is a static single-axis
  rotation the solver carries as a rotated world box (the fidelity matrix's
  "Static rotation" row) — so a scene.json→spec round trip of a
  rotated element is authorable; wiring the .bbmodel importer to emit it is the
  remaining step. Follow-ups (not yet built): rotated-element
  scene.json→spec round-trip emission, multi-axis Bedrock rotation,
  per-face atlas UVs for Java, Bedrock bones/animation. Shared exporter helpers
  (frame map, texture synthesis, atlas tiles) live in `src/mc/common.ts`.

## Rotated bounds are support functions, and the box contract is enforced

The sword-assembly field report ("my boxes are flush but the compile says
0.01m apart") had three distinct roots, all fixed at the math:

- **`rotatedShapeSize` replaces the rectangle-only bound.** The old
  `rotatedBoxSize` folded every shape through `w' = w|cosθ| + h|sinθ|`,
  which inflated a cylinder turned about its OWN axis by up to 41% — the
  solver then placed the fat box flush and the real meshes sat apart by
  the padding. The world extent of a convex shape under rotation R along
  axis e is `h_S(Rᵀe) + h_S(−Rᵀe)` (support function, evaluated in closed
  form per shape in `solve/types.ts:shapeWidthAlong`): exact for box,
  ellipsoidal sphere, cylinder, tube, cone/frustum (both rims), capsule,
  torus, and wedge (a right triangular prism — the convex hull of six
  vertices, so its support is the max over them, `flip`-aware; a subset of
  the box's eight corners, so it is exact yet never exceeds the box hull);
  the box hull only for file/script, whose geometry the solver cannot see.
  The rotation rides a quaternion sandwich, so compound rotations compose by
  multiplication when the language grows them — no Euler-order convention to
  defend.
- **`_fit_box` makes "every shape fills its box exactly" literally true.**
  An n-gon's flats sit cos(π/n) inside its circle, so every revolution
  shape shipped up to 0.5% smaller than its box — phantom hairline gaps
  the census then honestly reported. The emitter now measures the built
  mesh's local bounds and corrects the DATA (per-axis scale + recentre, no
  object transform) so mesh AABB ≡ declared box for every shape at every
  segment count.
- **`sits_on`/`above` take an `axis`** (default z). Z remains gravity and
  records `restsOn` for grounding/claims; any other axis is the same
  face-to-face placement used as an attachment and deliberately records no
  resting support. Pinned in `tests/spec.test.ts` ("rotatedShapeSize",
  "sits_on / above along an authored axis").

Contact separation itself was already honest (world-AABB axis gaps,
box-to-box — `contact_report` in runner.py); the phantom gaps came from
the two bound errors above, not the measurement.

Related validator posture: keys that begin with `//` are the JSON comment
convention (the golem fixture and field scenes both carry them) and every
unknown-key check ignores them (`isCommentKey` in solve/validate.ts) — the
typo strictness stays, the margin notes stay legal.

A follow-up audit swept the rest of the compiler/linter for the same
inflated-AABB and hardcoded-axis classes; four more were confirmed by
reproduction and fixed:

- **`obbSeparation` (solve/types.ts)**: exact 15-axis SAT between oriented
  boxes (quaternion basis; positive = a proven-gap witness, negative =
  exact minimum translation distance). `reportGeneratedIntersections` uses
  it whenever either clone is rotated, so an oriented ring's turned bars —
  whose world AABBs interpenetrate freely — no longer draw a false
  `SOLVE-INTERSECTION`; unrotated pairs keep the identical AABB arithmetic.
- **Census `contact_report`** keeps its per-world-axis gaps (exact support
  intervals there) but adds ONE more support projection — along the
  centre-to-centre axis — before calling a pair "intersects": any positive
  gap on any axis proves disjoint, and this is the axis where canted
  plates actually separate. Verified: two 45°-turned plates 0.1m apart
  (AABB overlap −0.3m) now read `separation 0.1, intersects false`.
  Vert-capped (400k combined) with the AABB verdict standing beyond the
  cap, per the honesty-budget doctrine.
- **The contact scan sweeps and prunes** rather than testing every pair
  against every other. It used to refuse outright past 60 meshes and return
  NO contacts — grounding, touching, z-fighting and every claim resting on
  them, deleted wholesale for a 61-mesh scene, because pairwise enumeration
  got expensive. Contact is a LOCAL relation, so the fix is to stop looking
  at far pairs, not to stop looking. Boxes are sorted by their low edge on
  the axis the scene is most spread along (ties to the lowest index, so the
  choice is deterministic), and each box reaches only the contiguous run
  within `CONTACT_RECORD_RANGE` of its high edge — a pair further apart than
  that on one axis can never pass a `max`-of-axes test, so pruning on it
  drops nothing. The sweep is INVISIBLE to the output: it only chooses which
  pairs to examine, every survivor goes through the unchanged exact per-axis
  test, and the pair list is sorted back into the `(i, j)` order the nested
  loops produced, so the census is byte-identical on scenes that fit under
  the old cap. Vertex samples are retained lazily (only meshes surviving the
  broad phase are asked), and a mesh with non-finite world coordinates is
  named rather than silently matching nothing. Measured: 96 meshes → 185
  contacts in 3.8s, 721 meshes → 720 contacts in 43.9s, both with an empty
  skip list where the old code returned nothing at all.
- **`symmetry_facts`** no longer assumes the mirror plane is world X on a
  world-space (rotation-baked) mesh: it tests six candidate planes — three
  world axes plus the three PRINCIPAL planes of the vertex covariance
  (Jacobi eigensolver, dependency-free; for a bilaterally symmetric body
  the mirror normal IS a principal axis) — and reports the best, with the
  nearest world-axis letter as the axis label. A 45°-turned box now reads
  maxError 0 instead of a spurious asymmetry proportional to the turn.
- **Kit viewer `heat`/`touchingParts` (kit-runtime.ts)**: world AABBs stay
  as the broad phase, but the verdict is `obbGap` — a JS mirror of
  `obbSeparation` built from each draw's LOCAL bounds and node matrix
  (scale folded into extents; shear collapses to the nearest orthogonal
  frame, still strictly tighter than the AABB). `_obb` is cached per draw
  and cleared by `applyEditsToDraws`, the one funnel that rewrites model
  matrices. A canted plate no longer glows "buried" beside a neighbour it
  never touches. Keep obbGap and obbSeparation in step.

The torus branch of `shapeWidthAlong` is exact for a circular major radius
and documented CONSERVATIVE (ellipse ⊕ ball) for anisotropic boxes — never
an under-estimate.

## The USDA lexer skips bulk data (the chess-set OOM)

The structure parser (`parse/usda.ts`) used to tokenize the ENTIRE stage —
including geometry payloads. A real master is hundreds of MB of
`point3f[] points = [(…), …]`, and one Token object per number and comma
meant hundreds of millions of allocations: parsing ABeautifulGame's 358MB
stage took 54s, churned >5.5GB, and OOM'd the daemon (twice — the export
post-pass parses in `authorStageModel`, then lint parses again). The lexer
now consumes a whole `[...]` payload in one charCode walk (`bulkArray`),
minting only the array's structural shell plus what consumers actually
read from arrays — `@asset@` refs, `<target>` paths, quoted strings. The
same discipline runs through `stage-model.ts` (quote-free lines mask to
themselves; depth walks use charCodeAt, never for..of or char arrays).
After: 1.5s, ~zero retained beyond the source string, at a 2GB cap.
Attribute values now record bulk arrays as an empty shell (`[]`) — the
attribute's PRESENCE and its refs survive, the numbers never mattered to
any rule. Pinned in `tests/usda-parser.test.ts` ("elides bulk array
payloads…"). If a future rule needs numeric array content, extend the
lexer with a targeted keep-list; do not revert to full tokenization.

## The viewport: station × gaze × lens × sweep

The turntable photographs one subject from a fixed orbit. A **shot** aims,
and it aims by naming things the census measured — never by taking a
coordinate, which an author cannot derive and an agent cannot guess.

A camera is four independent primitives, and every camera question the
compiler answers is a composition of them (`src/read/shot.ts`):

| | decides | forms |
|---|---|---|
| `station` | where the eye is | `{orbit:{of?,azimuthDeg,elevationDeg?,distance?,margin?}}` · `{at,offset?}` · `{point}` |
| `gaze` | where it points | `{at?}` · `{heading,pitchDeg?}` · `{toward}` |
| `lens` | how much it sees | `{fovDeg?,projection?}` |
| `sweep` | the same shot, n times | `{frames,time?,over?}` |

Keeping station and gaze independent is what makes the surface small.
Welding them looks harmless — an aimed shot derives its position from its
target — but it cannot express standing somewhere and turning around, which
has no subject, nothing to orbit, and no distance to fit. Aiming is the
special case. So a panorama is `station.at + gaze.heading + sweep over
headingDeg`; riding a moving part is `station.at` re-resolved per sample
plus `sweep.time`; stepping off an anchor is a changed `offset`. None is a
code path. The proof turntable itself is `orbit + sweep over azimuthDeg
with time on`, and the composition reproduces `turntableViews` to the last
bit — the standard any change here keeps meeting.

Properties the layer holds:

- **Sugar, not a second implementation.** `LookSpec` (`read/look.ts`) is
  the ergonomic aimed form; `lookToShot` desugars one direction into
  `resolveShot`. One arithmetic path, so the aimed and turn-in-place cases
  cannot drift.
- **Stateless.** A resolved pose is absolute and complete; the relative
  ops (`nudgePose`) are pure rewrites of that record. Nothing is stored
  between compiles — the pose lives in the caller's context, echoed by the
  report, which is the only place agent state is reliable.
- **Absence over a false zero.** A turn-in-place pose has no
  `targetName`/`target`/`distance`/`frameSpanM`. The report, the CLI and
  the daemon DTO all branch on that; a zero would read as a measurement.
- **Sweep is re-resolution, not interpolation.** Each sample substitutes
  `t = i/frames` into the ranged scalars and runs the whole resolver
  again, which is what lets a station attached to a moving part follow its
  curve instead of the chord between its endpoints. `sweep.time` samples
  with the runner's own expression, so a swept shot and a turntable of the
  same length land on the same instants.
- **Attachment is a derivation, never a relationship.** `station.at`
  re-measures the part's world box per sample. Nothing is parented and
  nothing is stored.
- **Verbs that need a subject refuse without one.** `orbit`/`rise`/`dolly`
  on a turn-in-place shot, and `turn`/`tilt` on an aimed one, throw by name
  with the verb that was wanted. A silent no-op reads as a broken camera.
- **Angles outrank vectors.** After an exact clamp, re-deriving azimuth
  and elevation from the direction vector returns 89.8999999999998 for a
  value set to 89.9, so a derived value never overwrites the exact one it
  came from.
- **The runner photographs, it does not decide.** Poses arrive fully
  resolved (eye, target, fov, optional `timeFrame`); the aim point for a
  subject-less shot is derived TypeScript-side as `eye + forward·distance`.
  Camera state and the timeline are saved and restored per shot, so a
  leaked field of view or a moved frame cannot mis-register the id-map
  pass that renders after.
- **Two measured facts travel with every frame.** `frameSpanM =
  2·d·tan(fov/2)` — a 2mm screw and a 2m door make the same picture, so
  scale is what pixels cannot carry — and `coverage`/`meanLuminance` from
  the same measurement the orbit frames report. `coverage: 0` states that
  the pose is exact and aimed at empty space, which is the one result a
  reader cannot diagnose from the picture.

Wire: `looks` (sugar) and `shots` (general) on `CompileRequest` and
`Scene3dCompileRequest`; the daemon validates only the envelope, since the
compiler rejects a bad spec by naming the parts that exist and a schema
check could only downgrade that to an opaque 400. CLI: `od scene3d compile
--look <spec> --shot '<json>'`, both repeatable.

## Viewer continuity and the animated proof

Behaviours that keep the compiled surfaces honest across the compile loop:

- **The clicked part energizes with the kit's own x-ray.** The runner
  renders an object-index map beside every proof frame
  (`<frame>.idx.png`: flat emission per part, code = sorted-index + 1 in
  8-step-per-channel RGB, Standard view transform, filter_size 0.01,
  alpha-0 background; `_proof_id_pass` in runner.py — no restoration,
  the proof process rebuilds from source and exits). The manifest
  advertises `proofIdParts` only when every frame's map exists.
  `apps/web/src/runtime/scene3d-xray.ts` speaks the kit shader's exact
  vocabulary (ghost teal = inspectionRamp's deep-teal stop, filmArc
  cosine, edge tint (0.55,0.72,0.80), stage ink (0.03,0.035,0.05)) with
  the emphasis INVERTED to match how a selection reads in the kit: the
  SELECTED part keeps its real rendered pixels (+6% lift), and the REST
  of the world drops into the spectral ghost — ink stage, translucent
  teal bodies lit by their own smoothed luminance, Sobel feature lines
  plus the id map's exact part-boundary outlines (sharper than the GL
  pass can draw), and a film-arc rim where the ghost meets the
  selection. The panel decodes the map, composes the full-energize
  frame on a canvas, and crossfades with the kit's exact
  200ms-in/140ms-out easeOutCubic — opacity IS uXray. Occlusion is
  free: the map only marks pixels a part won in the render. THREE ghost
  stylings ride the kit page's own chord — X held + 1/2/3 = curvature
  (the full inspection ramp over the geometry's shading, percentile-
  normalized 5th–95th so the amber-cream end actually speaks) / normals
  (translucent teal, the default) / structure (contour lines on near-
  ink) — one keyboard grammar across both scene3d surfaces, and the SAME
  corner chrome: the kit page's x-ray cluster (eye-labelled toggle +
  caret + upward mode menu with ramp strips and X1..X3 key chips) sits
  in the stage's bottom-right, panel-token skinned, geometry kept in
  step with kit.ts's `.xray-cluster`; the toggle stands the effect down
  without clearing the selection, and picking a menu mode re-arms it
  exactly as the kit's menu does. (The orbit hint yielded the corner
  and lives bottom-left.) Stage click
  grammar: plain click selects WITHOUT scrolling the rail; shift-click
  keeps its multi-select toggle untouched; ctrl/cmd-click or
  MIDDLE-click selects AND jumps to the part's rail row (the hover box
  turns gizmo-red #e5484d while ctrl is held as the tell; prototype
  rows are findable by ANY member via the space-joined
  `data-s3d-part-row` + `~=` selector). Reticle brackets stand down
  while energized; missing maps fall back to the reticle. Keep the
  constants in step across FRAG ↔ scene3d-xray.ts ↔ runner ID_STEPS ↔
  XRAY_ID_STEPS (pinned in apps/web/tests/scene3d-xray.test.ts).
- **The proof frames are pickable.** The runner already projected every
  part through the render camera for the off-camera check; the same pass
  now records each part's screen rect per frame
  (`manifest.proofRects[frame][part] = [x0,y0,x1,y1]`, normalized, y
  down) — ground truth from the exact transform that produced the pixels.
  The host panel (`Scene3dPanel`) draws an animated focus reticle over
  the selected parts, pre-highlights on hover, and resolves a click on
  the picture back to a part (smallest containing rect wins; shift
  toggles; empty space clears; the rail scrolls the picked row into
  view). Web-side only the VIEWPORT transform lives in code —
  `proofViewport` / `proofRectToStage` / `pickProofPart` in
  `apps/web/src/runtime/scene3d-assets.ts`, pure and unit-tested, the
  same split kit-runtime makes between worldToScreen and its canvas. A
  manifest from before rects existed simply has no `proofRects`, and the
  click stays a no-op rather than a guess.
- **The compile toolbar speaks in marks.** The asset kind is a drawn,
  gently animated glyph (word = tooltip/aria-label; the `scene` glyph is
  the same cube-on-turntable sentence as the shared `scene3d` icon); the
  verdict is a check / error / warning mark with counts, and the claims
  badge is a drawn shield in the same grammar; parts, triangles and world
  size are glyph+number with the full sentence (Blender version
  included) as tooltip AND aria-label. The same drawn verdict mark rides
  the HtmlViewer kit-toolbar ident chip (`viewer-scene3d-ident-mark` in
  FileViewer) so colour is never the only verdict channel, and the
  export chips show the shared spinner while archiving instead of an
  ellipsis. Non-mesh part rows carry tiny camera/light/bone glyphs in
  the tree-glyph style. World size renders axis-coloured in the kit
  gizmo's exact palette (X #e5484d, Y #46a758, Z #3b82f6 — AXES in
  kit.ts), theme-static like the gizmo, so readout and manipulator share
  one colour language. `KitEntry.kind` carries the derived asset kind
  into the kit page: the rail shows a per-row kind glyph ONLY when the
  kit mixes kinds (KIND_GLYPHS in kit.ts, static mirrors of
  KindGlyphArt — keep the paths in step), and the ident message hands
  `kind` to the host, whose toolbar chip draws the same glyph
  (`viewer-scene3d-ident-kind`, allowlist-validated in FileViewer). Narrow containers shed the dims first, then the
  whole meta row (both live in the @container blocks at the end of
  `Scene3dPanel.module.css`); every motion stands down under
  prefers-reduced-motion.

- **The proof turntable of an animated scene samples the clip.** Frame `i`
  of the orbit also sets timeline frame `start + span·i/steps` (i/steps,
  not i/(steps−1), so looped playback cycles without a doubled pose) —
  without this, an asset the manifest labels `animation` proved as N
  identical poses and the player scrubbed a statue. Single stills keep the
  authored frame; the sampling lives in `_proof_frames` (runner.py) and
  logs what it sampled. Animated scenes default to 16 turntable steps
  (pipeline.ts, census-gated) so playback is legible; an authored
  `proof.turntableSteps` still wins. Both frame players (the host's
  `Scene3dPanel` and the generated `out/index.html`) autoplay when
  `assetKind === "animation"` and answer drag-to-rotate over the picture;
  the generated page's square stage caps to the viewport so its controls
  never fall below the fold.
- **kit.html remembers its view across reloads.** The host reloads the
  page whenever a compile rewrites it or the file watcher refreshes the
  srcdoc; the page snapshots {entry, camera, selection, rail, x-ray mode}
  into `window.name` (tag `s3dview:` — the one storage an opaque-origin
  srcdoc can reach, and it survives a srcdoc swap in the same iframe) on a
  debounce hooked into `invalidate()`, and the boot restores it: entry
  choice against the rebuilt rail, camera/selection consumed once after
  the first model load (validated, distance re-clamped to the new bounds —
  the reload may be showing a resized asset). Pins:
  `tests/kit-viewer.test.ts` "kit view-state persistence" /
  "turntable viewer page".

## The material layer (viewer tweaks channel)

The kit page's part card expands into a material panel: the material chip
on the facts row is a button; clicking it pivots the collapse chevron into
a back arrow (one control, two directions: the design language for
anything "in depth" within a part) and swaps the shallow facts for a
picker + customizer built from native primitives (`input[type=color]`,
`input[type=range]`).

Data model, end to end:

- **Measure**: `principled()` in the census reports emission colour,
  emission strength and alpha alongside the existing metallic/roughness/
  baseColor. `readPartFacts` distils an entry-level `mats` record into the
  kit payload — linear floats, what glTF factors and Principled inputs
  speak (the page owns sRGB conversion) — with keys omitted rather than zeroed
  when unmeasured.
- **Edit**: the material channel rides the same per-part edit record as
  transforms: one snapshot shape, one undo history, one save funnel.
  Unlike transforms it is absolute state (`assign` + property overrides),
  so it has no compose algebra; `matEq` is the single equality predicate
  shared by dirty/history/save, and a property put back to its census
  value is deleted, not stored.
- **Persist**: `PartTweak.material` in tweaks.json. The daemon validates
  hard (name charset-gated, because the string reaches Python; scalars
  range-clamped; colours 0..1 linear) and merges by replacement: an
  incoming material replaces the saved one wholesale, an incoming empty
  object clears the channel. Per-key merging would make "I put the
  roughness back" unsayable.
- **Replay**: `apply_material_tweak` in the runner, after `bake_shaders`
  (so assigning a shader-baked material binds finished textures).
  `assign` rebinds every slot to an existing material by name (stale
  names ignored, like stale part names). Overrides on a shared material
  land on a per-part instance copy `<material>__<part>`, Unreal's
  material-instance semantics, so one part's tweak can never restyle the
  kit; a sole user mutates in place with no copy litter.
- **Preview**: the GL runtime records each draw's material name, an
  emissive uniform (factor × KHR_materials_emissive_strength, suppressed
  when an emissive texture drives it, since the flat factor would wash the
  part white) and an honest transparent pass (alphaMode BLEND or alpha
  factor < 1 → back-to-front, blended, depth-write off). Assignment
  preview copies its look from a draw already wearing the target material,
  so the actual texture comes along. glTF spec defaults are honoured:
  omitted metallicFactor/roughnessFactor mean 1 (exporters omit defaults;
  mapping absent to 0 rendered Blender-exported gold as plastic).
- **The shelf and the gallery**: the panel's swap row shows this scene's
  materials (assign by name, textures travel), then, past a divider, a
  look-deduped taste of the rest of the kit and a dashed "browse" door.
  The door opens onto depth three of the same journey (card → panel → gallery;
  the chevron is the single way back at every level): every material in
  every scene, grouped under sticky headers, matballs painted in
  rAF chunks (hundreds never block a frame; canvases cached per model),
  filtered by a native search that hides rather than rebuilds so focus
  and scroll survive typing. Foreign picks copy values as overrides,
  because a build cannot bind a material it never authored, and pop back
  to the panel wearing the result.
- **The report closes the loop**: `renderAgentReport` prints a
  "user edits (tweaks.json, baked into this build)" section, moved /
  turned / scaled / material per part plus what the file means (fold
  into source or leave replaying), so the agent always sees what the
  human did in the viewport.
- **The bake loop closes in-page**: the viewer's Compile button appears
  once everything is saved-but-unbaked (edit → Save → Compile, taught by
  the buttons' own visibility), riding bridge op `compile` with a 600s
  timeout. Picking any material ball replaces the channel ("wear this,
  as authored": the way back that override-preserving assignment never
  gave); the ring marks only an exact wear; head name and card chip say
  "· edited"/"*" when overrides ride on top. The panel edits the whole
  selection (group restyles, one undo step per gesture). The back
  control counts depth: an extra chevron per level below the card.
- **The panel's instruments** (native primitives, no widget library).
  Previews are rendered matballs: a shared UV sphere drawn through the
  viewport's own program, lights and textures into an offscreen FBO and
  read back (`renderMatBall`), the head ball idling on a turntable and
  shelf balls spinning on hover. The FBO's colour texture must be unbound
  from the sampler before drawing (feedback loop → INVALID_OPERATION → a
  silently blank ball). Roughness×metallic edit as one draggable point on
  the "surface pad": a 2D appearance field computed with the shader's own
  lighting formulas over the material's colour; ctrl snaps the quarter
  grid. Colour/glow/alpha stay native inputs. Touched rows wear a dot and
  their label click reverts.

Round-trip pinned by `pipeline.test.ts` ("replays material tweaks"):
assign rebinds the crate lid to wood, assign+override creates
`mtl_crate_wood__prp_crate_lid` and leaves the body's wood untouched,
sole-user override mutates in place, and the kit payload carries the
instance's measured emission.

## Verdict totality (the FINDINGS3 round)

Three blind audits converged on one defect, wearing different clothes each
time: **a code path can exit a check without producing any of
{clean, findings, unchecked(reason)}**, and reads as clean to every
consumer. The compiler states "silence is not evidence" as philosophy; this
round is about enforcing it where it had quietly lapsed.

- **A cap that cannot be reported is a cap that lies.** `coplanar_overlap`
  applied its triangle-pair cap internally and returned "no overlaps", so two
  exactly coincident 590-triangle meshes shipped a textbook z-fight with an
  empty pairs list and an empty `zFightingSkipped`. Caps now live in the
  caller, which has somebody to tell, and name both meshes and the cost.
- **A sidecar dropped in a `catch {}` is a check that skipped.** A truncated
  `tweaks.json` degraded to "no tweaks" and the scene reverted to its rest
  pose with nothing in the report (S3D-W-208 now). It is read through one
  reader that returns what it rejected, and which copies-then-rejects rather
  than allow-listing, so it cannot silently eat a channel it has not heard of.
- **A relaxation that suppresses is a silence machine.** See provenance below.
- **A guarantee that varies by machine must say so.** The E-804 non-finite
  oracle is only as good as the readback, so its reach is now probed (through
  a uniform, so the answer is about the driver and not its constant folder)
  and any gap reported as S3D-W-804.
- **The solver's output is proofed, not assumed.** `repeat every: 0.5` on a
  1m box shipped three boxes overlapping by half a metre, `ok: true`, no
  diagnostics: interpenetrating faces are not coplanar, and no rule owned
  "these are simply inside each other" (S3D-W-107 now). Scope is deliberate:
  only instances the solver generated are compared, because authored
  interpenetration is a technique (overlapping a junction by a pixel is how a
  careful modeller avoids z-fighting), while nobody mints N instances wanting
  them to overlap.

Structural decisions the round produced or confirmed:

**Provenance posture** (`lint/provenance.ts`). A third-party asset is a fact
about somebody else's file, not a defect its new owner can fix; real game
meshes are open, ship welded seams as split vertices, and share mirrored UV
islands on purpose. That was implemented only for spec parts carrying
`file:`, so a project whose source is a bare `.glb` (a first-class workflow)
got no relaxation and a freshly downloaded Khronos sample compiled `ok: false`;
every fixture here ships a hand-written relaxed contract, which is what kept
it hidden. And the relaxation was suppression, so nothing could explain why a
strict contract had gone quiet. Rules now always run and a post-pass
reclassifies: same finding, at `info`, carrying `provenance` and the severity
it was relaxed from. The rules it covers are a table whose rows name their own
override: writing in a convention block cancels that block's relaxation, and
only that block's.

**The contact model** (`solve/contact.ts`). Resting is a relation, not a
coordinate. The solver embeds a `sits_on` part by `MIN_CONTACT` so faces can
never land flush, and the support search rejected negative gaps as "not below
me", so the rule built to name what a part rests on could never name it. Then
`claims.grounded` checked only sinking while the world linter checked
floating, so a part hovering metres up passed the claim and collected the
warning: the "claims declared, none failed" badge awarded to a floating
asset. One predicate now answers both. "Below" is geometric rather than an
epsilon: hand-authored blocky assets overlap junctions by a whole pixel, and
an embed window sized to the solver's own 1mm called every such joint
unsupported.

The claim's two-sidedness has reversed twice, and both reversals are
worth keeping. The first two-sided attempt was recorded here as a mistake:
it failed the atelier capstone on its deliberately levitating lava orb, and
the repair — reading `above` relations as declared suspension — rescued
only parts placed one particular way, so a part positioned with `at` was
still told it was broken. The claim went back to one direction ("nothing
sinks through the floor"), with floating reported only through the
opt-in `conventions.grounding` policy (W-325).

A field audit (D2) then re-opened it from the other side: an author who
writes `grounded: true` over a scene where the contact line says "2 touch
nothing" is being told "held" about an assertion the census can see is
false. The second two-sided implementation (lint/claims.ts, "direction
two") answers the first attempt's recorded objection with a wider licence:
`above` parts AND `conventions.grounding.exempt` entries are declared
floats, and everything transitively hanging from a declared float inherits
the licence through measured contacts. The known residual cost, stated
rather than hidden: a hoverer placed with `at` must be exempted explicitly
— the failure message names both escape hatches. If that friction proves
worse in the field than the false "held" it prevents, this paragraph is
where the third reversal starts from.

**The oriented box is the voxel authority** (see the voxel section). The
census recovered it and one consumer read it; grid deviation, element extent,
element bounds and the Java exporter all still reasoned over the world AABB,
which for a rotated box is its diagonal bound.

Two supporting invariants land alongside:

- **The contract's field list is data** (`contract-schema.ts`). Validate and
  normalize are two behaviours that must agree about which fields exist, and
  as two hand-maintained cascades they had drifted: four convention blocks
  were normalized but never validated, so a malformed value coerced to the
  default and the rule the author meant to enable stayed silently off. Both
  now derive from one table, and a meta-test holds them together from both
  ends.
- **The cache key is the dependency closure** (`parse/companions.ts`). glTF
  legally splits a model across a `.gltf` and an external `.bin`; editing the
  `.bin` reported `build: cached` and shipped the old mesh. References are
  resolved rather than hashing the whole folder, which would trade a
  correctness bug for a precision bug.

## Three strata: measure, judge, emit

The compiler has exactly three kinds of conditional, and confusing them is how
modes grow:

1. **Measurement is unconditional.** If a fact is intrinsic to a shape, it is
   measured for every mesh in every scene: `symmetry_facts`, and the oriented
   box (`isBox`, `axisAligned`, `rotationAxis/Deg`, `center`, `localSize`). The
   one exception is cost, and the gate is then on a value proving somebody will
   read the result: `dfm_facts` runs its thickness ray-cast only when
   `minThicknessMm` exists, and `gridDeviation` is measured only when a grid was
   declared. Never on a mode. "Is this mesh a box" was gated on
   `target: "minecraft"` for a while, which put the doctrine exactly backwards:
   a project had to declare itself blocky before the compiler would say what
   shape its meshes were, and no other consumer could ask at all. That is the
   flag equivalent of setting TypeScript to "web mode" to use it outside a
   browser. Ungating it cost nothing measurable: the box scan stops at the
   ninth distinct vertex position, because a cuboid has eight.
2. **Judgement is keyed on presence of policy.** `contract.voxel.enabled` and
   `contract.minecraft.enabled` are not switches an author sets; they are not
   in the contract schema at all. They are the cached answer to "did anyone
   declare this policy" (`target === "minecraft" || conventions.minecraft !==
   undefined`). A rule with no bound is silent; that is the judge's whole
   design, and it means a new rule never needs a mode either.
3. **Emission is keyed on a requested deliverable.** `minecraft.dialect`,
   `export.formats`, `proof.turntable`: build targets in the Makefile sense,
   not capability gates, and legitimate.

A fact measured only in one mode is a fact no other consumer can use, and an
enum whose content is "which arm of a `??` fired" (`texelDiscipline` was
literally that) is precedence wearing a mode's name. When a flag appears, place
it in one of the three strata; if it fits none, it is probably duplicating a
value that already exists.

## Byte determinism of the deliverables

Two `--no-cache` compiles of an unchanged scene produce byte-identical
artifacts — every PNG and all five 3D containers plus `scene.tree.txt`.
That is a stronger claim than "the same geometry", and it took closing
three separate sources of per-run variance, none of which is this
compiler's own arithmetic:

| Source | Where it leaks | Correction |
|---|---|---|
| Prim ORDER in the USD stage | Blender's USD writer walks the depsgraph in scheduler order, so eight compiles authored eight differently-ordered stages | `scripts/blender/usd_sort.py` sorts every prim's children by name with the real `Sdf` API |
| FBX object ids | The FBX exporter derives them from Python's `hash()`, which is seed-randomised per process | `PYTHONHASHSEED=0` in the runner's spawn env (`src/build/blender.ts`) |
| Wall clocks | The FBX header stamps date fields; every PNG carries a `Date` text chunk | `strip_fbx_timestamp` (all-or-nothing) and `strip_png_dates`, both atomic temp-and-replace |

Three properties make this hold rather than merely pass once:

- **The master is sorted BEFORE the re-import.** Every container is lowered
  from the re-imported stage, so canonicalising one file fixes all five
  formats. Sorting the lowered outputs individually would have been five
  fixes and five ways to drift.
- **The sort runs in a subprocess.** `pxr` and `bpy` bundle conflicting USD
  libraries; once `bpy` is loaded, `from pxr import Sdf` dies with a DLL
  bind error. The runner probes for a plain interpreter (refusing anything
  blender-named, since handing the blender binary a `.py` positional runs
  nothing and exits nothing) and shells out.
- **Every gap is recorded, never silent.** No `pxr`, no clean interpreter,
  an FBX header this build does not recognise — each writes a note into the
  lowering record instead of shipping unreproducible bytes quietly. A
  determinism promise that fails invisibly is worse than one that admits
  its reach.

A USDA-SOURCE scene is deliberately exempt from the sort: the compiler does
not rewrite an author's own file, and a file on disk already has one stable
order, so every lowering from it is reproducible without touching it.

## Diagnostics philosophy

The reader is an agent with no viewport. Every issue carries: the stable
code, the measurement that proves it (metres, counts, fractions), where
(provenance to the authored scene.json line; repeat/scatter clones map to
their base part's line, rendered in the report rather than buried in JSON), and
the nearest actionable fact (floats → names the nearest support below and
the gap; z-fights → the shared plane's axis, position, and overlap patch
size). Caps are loud: every bounded search reports what it skipped;
unchecked is never passed. The digest orders issues first, then allocation
statistics (tri-density spread, worst bilateral asymmetry) that no render
can show.

## Calibration against assets the industry agrees on

Generated fixtures test what the author imagined. A corpus of well-understood
assets tests what is true. The method, run against 23 Khronos glTF sample
models compiled with **no contract written at all**, the drop-it-in path:

> Nobody is going to "fix" Sponza. So every ERROR is a false positive by
> definition, and every warning has to earn itself.

That single falsifiable premise found five defects in one afternoon. Four were
the same defect wearing different clothes: **a verdict computed from facts too coarse to see the thing being judged**.

| symptom | root |
|---|---|
| `E-341` failed OrientationTest, a correctness reference | the imported-provenance posture indexed object names; metallic names a material |
| `E-324` failed TransmissionTest | the posture indexed single names; a z-fight names a pair (`"A <-> B"`) |
| `W-348` told AlphaBlendModeTest to merge its five deliberately different materials | the census measured no alpha mode and no cutoff |
| `W-903` (new): glass, iridescence, sheen, IOR and volume destroyed end to end | master parity counts materials, so a material surviving as a shell passes |
| `E-404` failed RiggedFigure and Sponza after they linted clean | the posture stopped at lint; the stage-naming rule fires during export |

The third is the instructive one. Adding `blendMethod` fixed one asset; adding
`alphaCutoff` fixed a second; iridescence would have been a third. **Enumerating
properties loses that race by construction** — a Blender material is an
arbitrary node graph and every glTF extension adds a distinction the list does
not carry — so the fingerprint hashes the graph instead and subsumes all of
them. The asymmetry that justifies it: a false negative costs a missed draw
call, a false positive costs an author merging two materials that looked
identical only to us.

The last one indicts the method itself, and is the most useful of the five. The
calibration ran `parse/build/lint` and never `export`, `proof`, or `manifest`; the
regression test written for exactly this workflow ("compiles a bare downloaded
asset") stopped after lint too. So the one workflow this round set out to
protect could pass every check written for it and still fail the compile, in a
stage neither the probe nor the test ever reached. **A posture that only holds
for the stages you happened to run is not a posture.** It also means a "23/23
clean" claim from that harness was measured through lint; through all six
stages it was 21/23 until the fix.

Three habits the corpus enforces that a fixture suite cannot:

- **Separate instrument error from findings.** The first ground-truth run
  reported eight "metallic declared=1 measured=null" disagreements. All eight
  were the probe being wrong: those materials drive metallic from a texture, so
  the Principled input is linked and has no scalar, and glTF's `metallicFactor`
  is a multiplier there rather than a value. Fix the instrument before
  believing it.
- **Report clean results as loudly as failures.** Texture colour space was
  audited across 19 assets and 129 images (69 of them Sponza's) against the
  role each source binds — baseColor/emissive sRGB, normal/occlusion/
  metallicRoughness linear data — with zero disagreements. Knowing a thing is
  right is worth as much as finding it wrong, and only a real corpus can say so.
- **Run the whole pipeline, not the interesting part of it.** Calibrating the
  linter is not calibrating the compiler; a stage nobody invokes is a stage
  whose verdicts nobody has ever read.

Only the four pinned corpus assets are vendored: `tests/fixtures/real/`
holds DamagedHelmet, Fox, CesiumMan and BrainStem with `LICENSES.md`, while
the wider calibration set is fetched on demand, because 100 MB of reference
art does not belong in the repository.

## Test corpus

- Generated calibration controls (must stay zero-issue): `spec_pavilion`
  (all shapes, repeat grid, emission, claims), `spec_rock_garden`
  (scatter determinism), `spec_shaded` (GPU bake), `spec_flame` (flipbook),
  `textured_prop`. The atelier capstone compiles everything at once on real
  assets and must stay green.
- Poisoned red fixtures for every rule family, including driver rejection
  and the NaN oracle.
- Real corpus (`tests/fixtures/real/`, licensed): DamagedHelmet (full PBR,
  mirrored-shared UVs), Fox (low-poly rigged), CesiumMan (humanoid
  skinned+animated), BrainStem (multi-bone dance). Real assets found four
  bugs generated fixtures were structurally incapable of exposing.
- Fuzz: validator shape-fuzz, uniform-name injection fuzz, GPU
  hostile-uniform fuzz riding the E-804 oracle, RNG known-answer +
  insertion-stability.

## The interval calculus over time (the false-pass round)

A black-box field audit proved a claims false pass with hand arithmetic: a
1.4 m plate spinning at 6 frames/revolution samples θ ∈ {0°, 60°, …} and
never 45°, so the sampled envelope measured 1.9124 m of a true 1.4·√2 =
1.9799 m sweep and a 1.95 m footprint claim "held at 98% of its bound".
The mechanism was structural: the analytic swept envelope (exact for the
breach) lived parse-side and could only ever emit a W-701 advisory, while
the sampled census owned the verdict — the verdict belonged to the weaker
of two oracles, printed two lines apart with two different numbers (that
was the audit's D7 too).

The fix is one adjudicator running one interval argument (`lint/claims.ts`,
fed by `solve/sweep.ts` `sweptSceneFacts`):

- **Samples are lower bounds.** A sampled breach is a real visited pose →
  proven failure (frame named).
- **The pairwise verdict narrows to the swept SOLID.** The envelope above
  is an axis-aligned box, and a spin's true occupancy in the plane across
  its axis is a DISC — the box's corner reaches √2 further than the circle
  ever does. `sweptBox` therefore also reports `spinDisc` (centre, radius,
  axis), and `motionEnvelopeIssues` judges a pair through it. The
  refinement is SYMMETRIC, which is the part that had to be learned twice:
  a neighbouring revolution solid standing on the same axis (a cylinder
  column, a sphere, a ring) occupies its INSCRIBED circle, so measuring the
  mover's disc against the neighbour's bounding square gave eight identical
  fins around one column four collisions and four clears. Every refinement
  is an upper bound on the true overlap, so the minimum of the applicable
  bounds is the tightest honest number — and `file`/`script` movers keep
  the box, because their own clips can deform beyond any solved box and
  narrowing a heuristic bound would turn it into a confident miss.
- **Exact swept boxes are attained.** `sweptBox` now carries an exactness
  flag with a theorem behind it: over a full turn the swept region of any
  rigid shape is rotationally symmetric with radius max‖p⊥‖, so a BOX's
  cross extent is exactly its local cross diagonal (corners are the hull's
  extreme points; some θ carries the far corner onto each axis). Bob and
  the screw advance are exact translations; a spin-symmetric part sweeps
  to itself. `file`/`script` parts are never exact (content is fitted
  inside the box and can carry its own clips). An exact envelope over a
  claim → proven failure, closed form, **no census needed** — the fast
  gear catches it at parse time.
- **The full envelope is an upper bound** (conservative parts over-
  reserve) — an envelope inside the claim proves the pass over ALL time
  and suppresses the stride caveat. Gated on a fully procedural scene
  (imported clips deform beyond solved boxes).
- **Conservative bound over the claim** → W-701 saying *unproven either
  way, not failed* — never "adjudicated at the rest pose" prose beside a
  contradicting E-701.

`claimMargins` folds the exact swept extents in, so the margin line can
never print 98% about a claim the part provably exceeds. The two
hard-coded bob/screw blocks in `pipeline.ts` were special cases of the
exact swept box and were deleted when the calculus generalised them.

The same audit round fixed the ledger and the claim's other direction:

- **`claims.checked`** (manifest + kit payload + report): declared minus
  the claims marked `detail.unadjudicated` in W-701. `claims: 3/3 held`
  used to print on compiles where the build never ran; now it reads
  `0/3 checked — nothing was measured`. The proven badge (kit ident `✓N`,
  panel ProvenBadge) requires `checked === declared`.
- **`grounded` is two-sided.** Direction one: nothing sinks (rest pose ∪
  sampled cycle ∪ exact swept minimum). Direction two: everything is
  SUPPORTED — `groundedSupport` in `solve/contact.ts` BFS-es the measured
  contact graph from ground-touching roots; contact (not strictly-below)
  is the edge so lateral attachments count. Declared floats are the
  author's: a part placed by `above` (and everything hanging from it, and
  `conventions.grounding.exempt`) is licensed to hover. An earlier
  two-sided attempt failed the showcase's levitating orb because it had no
  notion of declared intent; `above` IS that declaration, already in the
  language. Unverifiable support (contact scan skipped) is UNCHECKED,
  never failed.

## Contact separation is a certified distance (the 23mm round)

The same audit measured `census.contacts[].separation` under-reporting a
diagonal cylinder–cube gap by ~23 mm — the number implied a nearest point
at radius 0.5233 on a mesh of radius 0.5. Root: separation was the best
DIRECTIONAL support gap over four directions (three world axes +
centre-to-centre), and a directional gap is a lower bound of the true
distance with equality only at the optimal direction; the centre direction
had a z component the geometry didn't. `contact_report` now runs a narrow
phase: alternating BVH projection (p→proj_B→proj_A→…, non-increasing, so
it converges to a stationary point pair) gives an attained upper bound,
and the support gap along (q−p) is the matching lower-bound certificate —
the GJK move. Disjoint pairs report the measured point-pair distance;
intersecting pairs keep the negative widest-axis overlap as the
penetration proxy (embeds still read −0.001). Two labels were also made
honest: `gap` is documented as broad-phase AABB slack (diagnostic only —
all-negative does NOT mean interpenetration), and the 50 mm recording
cutoff is a named constant exported as `census.contactRange`, because
"touches nothing" means "nothing within this range".

## Error-channel honesty (codes, cascades, JSON)

- **A demoted code shows its demotion**: `report.ts` prints
  `S3D-E-321→info` when provenance reclassification drops severity below
  the code letter — a grep for `S3D-E-` on a clean compile no longer
  returns lines that read as errors. The code stays stable; the arrow is
  the posture.
- **Poisoned, not missing**: a material referencing a shader whose own
  declaration failed gets NO error of its own and no baseColor-fallback
  demand (`declaredShaders` beside `declaredMaterials`); a shader `size`
  that is an array is told its SHAPE is wrong ("one number — bakes are
  square"), not that 512 isn't a power of two; `file:` in a shader block
  names the cross-vocabulary alias (`kernel`).
- **Cycles are named as cycles**: the solver's double-constraint path asks
  the relation graph first (`placementCycle` DFS) and prints
  `prp_a → prp_b → prp_a` instead of "constrained twice"; the one-node
  case already did. Cascade "has no placement" lines are suppressed when
  the relation that would have placed the part already errored.
- **One issue per problem for E-104** (matching E-105's granularity), JSON
  syntax errors carry line/column/snippet (`jsonSyntaxDetail`), float
  noise is formatted (`0.299`, not `0.29900000000000004`), a wedge with no
  axis is told the field is REQUIRED (the default was always invalid),
  shape values get did-you-mean, and `above.of`/`above.gap` map to
  `over`/`clearance` via an explicit alias table.
- **S3D-W-105 (SPEC_SUSPECT)** is the valid-but-suspect family: a
  dimension over 10 km (millimetres-as-metres, mirroring the 1e-5 m
  floor's hint), a rotation about a shape's own symmetry axis (provably
  inert — `rotationIsInert`), and a span whose body never overlaps an
  anchor it names (bridging air, measured per transverse axis). The
  report's `scale:` line adds a `spread N:1 — verify units` note past
  10⁴:1, and `conventions.geometry.zFightingPairBudget` is the z-fighting
  scan's ONE resource knob: the TOTAL triangle-pair comparisons the scan
  may spend across the scene (sweep-and-prune candidates charge their
  triangle product in deterministic order; what the budget cannot cover is
  skipped loudly as W-323). Plumbed through the build job to
  `z_fighting_pairs`; there is no mesh-count or per-mesh ceiling beside it.
- **Signed outliers**: `robustZ` keeps the sign; I-951's prose reads it
  (DENSER → LOD/decimation, SPARSER → proxy/fixture, subdivide only if it
  should match) — the rule used to advise decimating a 12-triangle plinth.
- **Override orphans**: an unused material on a scene whose spec overrides
  a `file` part's materials is reclassified to info with the reason —
  wholesale replacement is documented behaviour, and "bind or delete" was
  advice the author could not take on a material inside a third-party GLB.

## Report voice (one word, one number)

From the same audit's inconsistency list: the `parts (…)` header counts by
kind (`31 mesh · 1 camera · 1 light`) so "parts" can't mean two numbers in
one report; the solved-boxes header says `world box` (the column was
always the world box — rotated rows just made it visible); the materials
line prints emission×N and alpha (the two properties that needed review
were the two it omitted); `scale:` appends the measured cycle sweep for
animated assets; the healthy contact case is stated (`contact: all N
part(s) touch another`) instead of implied by absence; `headroom:` became
`built:` (no declared budget = nothing to have headroom against); the
proof line names the animation frame range the turntable stepped; and the
delta channel diffs MATERIALS (principled properties + node-graph
fingerprint) and ANIMATION (frame range, clips, cycle bounds), so a
roughness edit no longer reads "unchanged since previous compile". Shader
bake images now wear ONE name family (`shd_rust_baseColor` as datablock
AND file — the `tex_` datablock alias is gone).

## Known gaps (alpha)

The honest ledger of what is understood but not built. An item here is a
scoped decision to defer, not an unknown; each names its cost and where the
work would land. (The Minecraft-specific follow-ups stay in the Minecraft
section above.)

- **Panoramic lenses.** `LensSpec` is rectilinear only. Blender offers
  equirectangular and fisheye camera types, but nothing in the package sets
  `cam.data.type` and the proof engine is EEVEE, whose panoramic support is
  version-dependent — so a `projection` field would have to be gated on a
  PROBED capability rather than assumed, or it silently renders rectilinear
  and lies. The cheaper answer for spatial coverage is already expressible:
  a cube cross is six rectilinear shots (`gaze.heading` × `pitchDeg`), which
  is complete, per-tile labellable, and needs no new machinery. Cost: a
  capability probe beside `gpu_warmup`, the lens field, and a degrade path
  that reports the substitution.
- **Attachment tracks the part's box, not its motion.** `station.at`
  re-measures the census box per sweep sample, so a station rides a part
  that MOVES BETWEEN COMPILES. Riding an animated part within one compile
  needs the box measured per timeline frame, which the census does not carry.
  The fix is the runner returning two points per requested (part, frame) —
  keeping every angle in TypeScript — and NOT a per-part motion track on the
  census, which would land in `buildInputHash` and make every new camera
  angle re-run the build stage.
- **Nothing is burned into the pixels.** The pose, the frame span and the
  coverage travel as text beside the image. A facing indicator and a scale
  bar drawn onto the frame would survive being passed around detached from
  the report; the contact sheet's labeller (`read/contact.ts`, `read/font.ts`)
  already has the machinery.
- **X-ray-aware picking.** `pickPart` (`src/viewer/kit-runtime.ts`) iterates
  every draw with no reference to the x-ray state, so in x-ray mode the user
  sees the interior and clicks the shell. Cost: a visibility/depth-order
  filter in the candidate loop plus a runtime test beside
  `tests/kit-picking.test.ts`.
- **Arity-based assembly/component kinds.** `src/usd/stage-model.ts` calls a
  stage with more than one geometry root an `assembly`, one root a
  `component`. A two-part prop that is conceptually one component is still
  called an assembly; nothing in the language lets the author say otherwise.
- **Multi-axis rotation in the declarative language.** `rotate: {axis, deg}`
  (the fidelity matrix's "Static rotation" row) covers ONE world axis. A part turned about
  two axes at once — a diagonal brace, a compound-angle strut — still has no
  word, and the rotated-bound arithmetic that makes one axis exact would have
  to compose (still conservative, no longer exact for a box). `span` +
  `rotate` is refused rather than reconciled, for the same reason.
- **Curved-support contact is box contact.** `sits_on`/`scatter` against a
  cylinder or sphere support use the support's AABB, not its surface: a
  scatter over a cylindrical slab can land samples on the box corners where
  no geometry exists. Self-consistent (the contact report measures the same
  way) but visually wrong on curved supports.
- **Screen→NDC picking half is verified by inspection only.**
  `tests/kit-picking.test.ts` pins the ray/mesh half; the DOM-layout half
  (resize/DPR) has no automated coverage.
- **Exporter kwarg drops are silent.** `usd_export_resilient` removes
  unknown kwargs one at a time, so a different Blender point release can
  export a narrower payload with no issue code. An `*_UNCHECKED`-family
  code for a dropped kwarg would make the variance visible.
- **Stage-model authoring has four verified rough edges** (whole-tree
  audit; each confirmed by reading, none yet repaired): `assetInfo` is
  authored at stage scope where USD consumers inspect the ROOT PRIM for
  it; the `purpose` splice can land after a single-line prim's closing
  brace (invalid USDA for that shape); the structural scan does not skip
  comments, so a brace inside one can desync a splice; and inline prim
  metadata is appended to rather than replaced, risking duplicate
  declarations. All four live in `src/usd/stage-model.ts`, whose splice
  tests pin current behaviour — repairs need those pins moved with them.
- **Compiler-owned motion quantizes periods to whole frames** (`seconds ×
  24` rounded, quarter-frames floored at 1), so a 0.125s bob plays as a
  4-frame ≈0.167s cycle with no notice. Sub-frame periods are near the
  validator's 0.1s floor and rarely visible, but the quantization is
  unstated anywhere the author can read.
- **The pxr oracle inspects less than its name implies** (whole-tree
  audit): material-binding conformance checks a subset of binding shapes,
  and stages with unresolved sublayers/references can come back "ok" —
  composition errors are not read off the stage. Host-optional second
  authority, so the gap narrows confidence rather than fabricating it,
  but the report should say which questions the oracle did not ask.
