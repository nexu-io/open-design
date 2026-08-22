# scene3d — architecture and compilable fidelity

The full breakdown of what this compiler IS, what it can compile, and the
principles every layer obeys. Companion documents: `KILN.md` (design
lineage), `RESEARCH.md` (market thesis), root `CLAUDE.md` (working rules).

## The one-sentence version

A deterministic world compiler: declarative sources (or real downloaded
assets) go in through ONE compile call; measured, adjudicated, multi-format
artifacts come out — with every failure a stable code carrying the
measurement that proves it and the source line that caused it.

## Layer map

```
┌─ Sources ──────────────────────────────────────────────────────────────┐
│ scene.json (the language)  ·  bare .glb/.gltf/.obj/.fbx (mesh kind)    │
│ build.py (bpy escape hatch)  ·  .usda layers  ·  .blend                │
├─ Parse ────────────────────────────────────────────────────────────────┤
│ schema validation with JSON paths (E-105) BEFORE any geometry exists   │
│ shader kernels read + structurally checked (comment-stripped, E-801)   │
├─ Solve (pure TS, no I/O) ──────────────────────────────────────────────┤
│ relation fixpoint → world placements · repeat/scatter expansion        │
│ path-addressed RNG (PCG/FNV over BigInt) · contact floors (1mm)        │
├─ Emit ─────────────────────────────────────────────────────────────────┤
│ deterministic bpy script (.scene3d/spec.build.py), byte-stable         │
│ GPU shader programs assembled (stdlib + kernel + dispatch), dual-      │
│ target: Blender create-info now, WebGL2 300es for the editor panel     │
├─ Build (headless Blender 5, bpy module) ───────────────────────────────┤
│ GPU warmup → kernel compile ON THE DRIVER (E-802) → offscreen exec     │
│ (RGBA32F) → NaN oracle (E-804) → bake PNGs (own writer, exact sRGB)    │
│ → height→normal derivation (wrap-aware Sobel) → material wiring        │
│ real-asset import (per-format, shimmed, degraded-import notes W-207)   │
│ CENSUS: world-space measured facts (depsgraph-updated)                 │
├─ Proof ────────────────────────────────────────────────────────────────┤
│ EEVEE turntable, neutral ambient world + transparent film, frame       │
│ statistics measured (luminance/coverage/blown)                         │
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
│ kit tree facts (dims·tris·materials·glyphs·source line·float gap·     │
│ bones·texel density), selection card, matColors swatches, clips,      │
│ ✓N claims shield — all carried in the kit page payload                 │
└────────────────────────────────────────────────────────────────────────┘
```

## The language (scene.json) — full fidelity matrix

| Concept | Vocabulary | Guarantees |
|---|---|---|
| Parts | `size` (AABB, metres) + `shape`: box/cylinder/sphere/cone/torus | every shape fills its box exactly; TRIFAN caps → zero ngons by construction |
| Real assets as parts | `file:` .glb/.gltf/.obj/.fbx | joined, scaffolding-swept, fitted inside the box (bottom-rest); `material:` = wholesale override |
| Placement | `at`, `sits_on(embed)`, `above(clearance)`, `align`, `inset_from`, `span` | relation fixpoint, order-independent; 1mm contact floor → z-fighting structurally impossible; span extents floored + conflict-checked |
| Multiplicity | `repeat(count, along, every)` — grids compose; `scatter(on, count, seed, minGap, sizeJitter)` | path-addressed RNG: adding parts cannot reshuffle a scatter; cross-scatter collision-free; repeat×scatter statically rejected |
| Materials | named PBR: baseColor/roughness/metallic(0|1)/emission/alpha, or `shader:` | undeclared reference = parse error; every generated material authored |
| Shaders | `shaders` block: kernel file + typed uniforms + outputs + size (+frames) | see below |
| Animation | per-part `spin{axis,seconds}`, `bob{amplitude,seconds}` | compiler-owned keyframes, looped (cycles modifiers), GLB carries clips, assetKind derives `animation` |
| Staging | derived camera (`camera{azimuthDeg,elevationDeg,distance}` steers) + `light: studio|sun` | shot always contains the subject; never raw coordinates |
| Claims | `parts, maxTriangles, grounded, maxHeight, footprint, watertight, materialsUsed` | adjudicated against the CENSUS (E-701); unadjudicable = W-701, never a silent pass; rest-pose caveat for bobbing parts reported |

Identifier discipline everywhere: part ids and material names are
charset-gated (`[A-Za-z][A-Za-z0-9_]{2,63}`), shader uniforms are
`uCamelCase` with reserved system names (`uS3dOutput`, `uS3dTime`) —
which is what makes every embedding (generated Python, assembled GLSL)
injection-proof by construction, verified by fuzz suites.

## The GPU shader pipeline

Author writes a PURE KERNEL: `vec4 kernel(vec2 uv)` (+ `kernel_<output>`
per extra channel). The compiler owns:

- uniform declarations (typed from JSON values; std430 running-offset
  push-constant budget vs Vulkan's 128-byte floor)
- the stdlib: `s3d_hash21/22, s3d_vnoise, s3d_fbm, s3d_voronoi` — PCG2D
  over `floatBitsToUint`, bit-deterministic on every backend; never
  `fract(sin)`
- the wrapper + dispatch for two targets (Blender GPUShaderCreateInfo,
  WebGL2 300 es)
- execution: real driver compile (E-802 carries the driver's log),
  offscreen draw into RGBA32F (8-bit targets clamp Inf and blind the
  oracle), NaN/Inf scan (E-804 with count + location), byte-exact PNG
  writing with the compiler's own sRGB transfer (no Blender colour
  management in the loop) — two fresh compiles bake byte-identical files

Outputs: `baseColor`, `emission` (sRGB), `roughness`, `metallic`
(Non-Color), `height` (Non-Color + a DERIVED wrap-aware tangent-space
normal map, `normalStrength` 0-10, wired through a Normal Map node).

**Time is a kernel dimension**: `frames: 2|4|8|16|32|64` bakes the kernel
per time cell (`uS3dTime` ∈ [0,1)) into a power-of-two atlas with a
structural 2px anti-bleed inset — and the atlas registers as a SHEET, so
the existing 2D rules adjudicate GPU output exactly like hand-made
flipbooks: static kernels fail W-601, blank cells fail E-609, the grid and
POT rules apply. This is the bridge into the 2D/VFX asset pipeline: same
kernels, same stdlib, same diagnostics.

## Real-asset ingestion

- Bare files in a scene dir = `mesh` source kind: native import, derived
  staging (camera framed from bounds, sun keyed from the camera quarter),
  full census/lint/proof/export. Inspection contract posture documented
  (open meshes, fractional metallic, mirrored-shared UVs are real-world
  legitimate).
- Rigs are census facts: `armatures` (bone counts), `animation.actionNames`
  (real clips), both action APIs handled. Skins and animations survive
  GLB re-export (dissected and pinned).
- Damage handling = deterministic detect-and-name, never mutate: truncated
  files fail with the importer's own reason (E-202, no traceback soup);
  missing .mtl companions and geometry-free imports surface as W-207 with
  the repair. Upstream importer bugs the compiler absorbs are shimmed
  narrowly and commented (Blender 5.0 FBX-with-lights crash).

## Voxel and Minecraft targets (`target: "voxel"` ⊂ `target: "minecraft"`)

Voxel discipline is TWO layers, because voxel art is an ecosystem
(MagicaVoxel / Goxel / Qubicle → Unity / Godot / Unreal via GLB/OBJ) and
Minecraft is one consumer of it with a specific format:

- **`voxel`** — engine-agnostic blocky-art discipline: grid alignment (W-970),
  the solver's grid-snap of `repeat`/`scatter`, and the pixel-art texel-density
  authority. Ships the normal GLB/OBJ/USD deliverables any engine imports. NO
  format rule — a voxel sphere or a 3-metre dome is legitimate. Gated on
  `contract.voxel.enabled`.
- **`minecraft` ⊃ voxel** — layers the vanilla FORMAT rules (cuboid elements
  W-971, legal rotation W-972, element bounds W-973, the structure class I-970)
  and the model.json/geometry.json export on top. Gated on
  `contract.minecraft.enabled` (which implies `voxel.enabled`). A bare
  `target:"minecraft"` is pixel-art at 16 px/block.

**The oriented box is the authority.** A block-model element is authored as an
un-rotated `from`/`to` plus a rotation about an origin, so every element-space
question is a question about the box's OWN frame. The census recovers exactly
that (`voxel.center`, `localSize`, `rotationAxis`, `rotationDeg`) — and for a
long time one consumer read it while grid deviation, element extent, element
bounds and the Java exporter all reasoned over the world AABB, which for a
rotated box is its diagonal bound. That produced three wrong answers at once:
a Java-LEGAL 22.5 degree rotation necessarily read as off-grid, so W-970
advised "snap the vertices" about the very rotations the format legalises; a
2.5-block element rotated 45 degrees measured 3.54, filed as multi-block
structure, and thereby ESCAPED the element rules it was breaking; and the Java
exporter dropped every rotated box claiming the un-rotated extent was
unrecoverable. Grid alignment and rotation legality are separate questions,
asked separately, in the frame the format defines.

**Boxness is measured on positions, not topology.** A real MagicaVoxel or
Qubicle OBJ exports triangulated, and demanding six quad faces called a
visually perfect block "not a cuboid" and dropped it from the exporter. An
offset from a corner is an EDGE exactly when it is not the sum of two others —
taking the three shortest instead breaks on any elongated box, where a face
diagonal is shorter than the long edge.

Either way it is opt-in and never a style: every rule is a format or
consistency fact, silent without a target, so non-voxel scenes are
byte-identical. Adopted from a fable-5 architecture consult (`KILN.md` records
the reasoning); USD stays the master and the block model is a lowering of it.
The Java block model cannot express a non-cuboid (W-971 says so and the export
skips it); Bedrock's `poly_mesh` format could carry arbitrary geometry — a
documented boundary, not yet built (it needs full per-vertex mesh export in the
census, and the format is niche).

- **Measure (census, `runner.py voxel_facts`, cheap O(verts), gated on the
  target).** Per mesh: `voxel.isBox` (a single rectangular cuboid — a Java
  `element` is representable iff true), a recovered single-axis `rotationAxis`/
  `rotationDeg` for an oriented box (multi-axis boxes surface as `isBox` with a
  null axis), and `gridDeviation` (worst vertex distance from the authoring
  grid). Validated against axis-aligned / 22.5° / 30° / 45° / multi-axis /
  off-grid cubes.
- **Judge (`src/lint/voxel.ts`, a validated-style module, warnings only — the
  linter warns while you iterate, the exporter hard-refuses).** W-970 off-grid
  (the #1 real MC-model bug: clean in Blender, shimmers in-game), W-971 not a
  single cuboid, W-972 illegal rotation (Java allows one axis at {−45, −22.5, 0,
  22.5, 45}°; names the nearest legal angle; dialect-scoped — Bedrock permits
  free angles), W-973 outside the −1..2-block element space. Relative texel
  consistency is left to the existing UV density rules (W-444/445), not
  duplicated.
- **Contract.** `EngineTarget += "minecraft"`; a `minecraft` conventions block
  (`dialect` / `grid.{size,tolerance}` / `pxPerBlock` / `elementBounds`) and its
  normalized form. `TARGET_PROFILES.minecraft` is Y-up like Blockbench. Grid in
  metres (1 block = 1 m, so px·m⁻¹ IS px-per-block); legal angles are a format
  constant, not a knob.
- **Emit the block model (`src/mc/java-model.ts` + `emit.ts`, pipeline-side,
  lowered from the census — the usdz pattern).** Every axis-aligned cuboid →
  one Java `element` in pixels; the Blender→Minecraft frame map is a single −90°
  rotation about X, `(x, y, z) → (x, z, −y)`, then ×16. Faces carry a texture
  ref + full-tile UV; one texture per material (a flat colour is synthesised as
  a 16×16 sRGB PNG via `encodePng`, a bound image is copied); a default display
  block so the model shows in hand/GUI immediately. v1 is faithful, not
  exhaustive: it emits what it can represent EXACTLY and REPORTS the rest
  (spheres, rotated imports) rather than shipping wrong geometry — the same
  parts the linter already flagged. Deliverables land under `out/minecraft/`
  and group as one "Minecraft model" export in the host menu
  (`scene3d-assets.ts`, path-detected). Showcase fixture:
  `tests/fixtures/minecraft/golem` — a blocky biped, pixel-aligned, junctions
  overlapped 1px (how a modeller avoids in-game z-fighting), compiling clean and
  lowering to a standing model.
- **Import (`src/mc/import-java.ts`, the round trip closed).** A dropped-in
  Java `model.json` or Blockbench `.bbmodel` is the `mc_model` source kind
  (`discoverSources`: a `.bbmodel`, or any `.json` that is not scene/scene3d and
  carries an `elements` array). The pipeline converts it to a scene.json spec
  IN MEMORY — each cuboid element → a box part anchored by an `at` relation, the
  frame map the exact inverse of the exporter's (`(X,Y,Z)_px → (X, −Z, Y)/16`) —
  then runs the normal path, so the import is VALIDATED, built, LINTED (the
  voxel rules judge it) and re-emitted. A copy of the derived spec is written to
  `.scene3d/imported.scene.json` (the migration artifact: promote it to
  scene.json and iterate) without the compile mutating the source dir. An
  imported model implies the minecraft target unless a scene3d.json says
  otherwise; a converted model sets `source.kind = "spec"` so the
  source-agnostic solve/emit and build gates treat it uniformly (the solve/emit
  block lives OUTSIDE the scene.json reader for exactly this reason). Faithful,
  not lossy-silent: a ROTATED element has no axis-aligned scene.json form and is
  SKIPPED with a reason (W-207), never imported at the wrong orientation.
  Textures resolve to a flat base colour (a sibling PNG averaged in linear
  space, or an embedded `.bbmodel` data URI; unresolved → a neutral
  placeholder). `import(export(golem))` reproduces the elements exactly — the
  exporter's strongest regression (`voxel-pipeline.test.ts`).
- **Bedrock export (`src/mc/bedrock-model.ts`, `dialect: "bedrock"`).** Bedrock
  addons cannot load a Java block model, so a Bedrock author needs
  `geometry.json` specifically. It shares the Java exporter's validated frame
  map (`common.ts boxToMc`), so a cube sits exactly where the Java element
  would; only the container and texture model differ. A Bedrock geometry
  references ONE texture, so materials pack into a vertical 16×(16·N) atlas and
  every cube gets modern per-face UVs (format 1.16) into its material's row —
  no box-UV-net guesswork. One root bone, `format_version 1.16.0`. Unlike Java,
  Bedrock emits single-axis-ROTATED cubes: the census recovers the box's own
  extent (`voxel.localSize`, by un-rotating the corners about the centroid) and
  centre, so a 22.5°-rotated cube exports as its true size with a `rotation` +
  `pivot`, not its bloated world AABB. The rotation mapping is exact, not a
  guess — the frame map (x,y,z)→(x,z,−y) is a proper rotation, so conjugation
  gives Blender X→MC X (+θ), Z→MC Y (+θ), Y→MC Z (−θ), pinned by a round-trip on
  a real rotated cube; only Bedrock's per-axis sign convention is unconfirmed
  without an in-engine renderer. Multi-axis rotations (no single recovered axis)
  are still skipped with a reason. Follow-ups (not yet built): rotated-element
  scene.json→spec round-trip (needs static rotation in the language, which the
  solver's AABB invariant does not yet carry), multi-axis Bedrock rotation,
  per-face atlas UVs for Java, Bedrock bones/animation. Shared exporter helpers
  (frame map, texture synthesis, atlas tiles) live in `src/mc/common.ts`.

## The material layer (viewer tweaks channel)

The kit page's part card expands into a material panel: the material chip
on the facts row is a button; clicking it pivots the collapse chevron into
a back arrow (one control, two directions — the design language for
anything "in depth" within a part) and swaps the shallow facts for a
picker + customizer built from native primitives (`input[type=color]`,
`input[type=range]`).

Data model, end to end:

- **Measure**: `principled()` in the census reports emission colour,
  emission strength and alpha alongside the existing metallic/roughness/
  baseColor. `readPartFacts` distils an entry-level `mats` record into the
  kit payload — LINEAR floats (what glTF factors and Principled inputs
  speak; the page owns sRGB conversion), keys omitted rather than zeroed
  when unmeasured.
- **Edit**: the material channel rides the SAME per-part edit record as
  transforms — one snapshot shape, one undo history, one save funnel.
  Unlike transforms it is ABSOLUTE state (`assign` + property overrides),
  so it has no compose algebra; `matEq` is the single equality predicate
  shared by dirty/history/save, and a property put back to its census
  value is deleted, not stored.
- **Persist**: `PartTweak.material` in tweaks.json. The daemon validates
  hard (name charset-gated — the string reaches Python; scalars
  range-clamped; colours 0..1 linear) and merges by REPLACEMENT — an
  incoming material replaces the saved one wholesale, an incoming empty
  object clears the channel. Per-key merging would make "I put the
  roughness back" unsayable.
- **Replay**: `apply_material_tweak` in the runner, after `bake_shaders`
  (so assigning a shader-baked material binds finished textures).
  `assign` rebinds every slot to an existing material by name (stale
  names ignored, like stale part names). Overrides on a SHARED material
  land on a per-part instance copy `<material>__<part>` — Unreal's
  material-instance semantics — so one part's tweak can never restyle the
  kit; a sole user mutates in place, no copy litter.
- **Preview**: the GL runtime records each draw's material name, an
  emissive uniform (factor × KHR_materials_emissive_strength — suppressed
  when an emissive TEXTURE drives it, since the flat factor would wash the
  part white) and an honest transparent pass (alphaMode BLEND or alpha
  factor < 1 → back-to-front, blended, depth-write off). Assignment
  preview copies its look from a draw already wearing the target material
  — the actual texture comes along. glTF spec defaults are honoured:
  omitted metallicFactor/roughnessFactor mean 1 (exporters omit defaults —
  mapping absent to 0 rendered Blender-exported gold as plastic).
- **The shelf and the gallery**: the panel's swap row shows this scene's
  materials (assign by name — textures travel) then, past a divider, a
  LOOK-deduped taste of the rest of the kit and a dashed "browse" door.
  The door opens depth three of the same journey (card → panel → gallery;
  the chevron is the single way back at every level): every material in
  every scene, grouped under sticky headers, rendered balls painted in
  rAF chunks (hundreds never block a frame; canvases cached per model),
  filtered by a native search that hides rather than rebuilds so focus
  and scroll survive typing. Foreign picks COPY VALUES as overrides —
  a build cannot bind a material it never authored — and pop back to the
  panel wearing the result.
- **The report closes the loop**: `renderAgentReport` prints a
  "user edits (tweaks.json, baked into this build)" section — moved /
  turned / scaled / material per part, plus what the file MEANS (fold
  into source or leave replaying) — so the agent always sees what the
  human did in the viewport.
- **The bake loop closes in-page**: the viewer's Compile button appears
  once everything is saved-but-unbaked (edit → Save → Compile, taught by
  the buttons' own visibility), riding bridge op `compile` with a 600s
  timeout. Picking any material ball REPLACES the channel ("wear this,
  as authored" — the way back that override-preserving assignment never
  gave); the ring marks only an exact wear; head name and card chip say
  "· edited"/"*" when overrides ride on top. The panel edits the whole
  selection (group restyles, one undo step per gesture). The back
  control counts depth: an extra chevron per level below the card.
- **The panel's instruments** (native primitives, no widget library):
  previews are RENDERED matballs — a shared UV sphere drawn through the
  viewport's own program, lights and textures into an offscreen FBO and
  read back (`renderMatBall`), the head ball idling on a turntable and
  shelf balls spinning on hover. The FBO's colour texture must be unbound
  from the sampler before drawing (feedback loop → INVALID_OPERATION → a
  silently blank ball). Roughness×metallic edit as ONE draggable point on
  the "surface pad" — a 2D appearance field computed with the shader's own
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
{clean, findings, unchecked(reason)}** — and to every consumer that reads as
clean. The compiler states "silence is not evidence" as philosophy; this
round is about enforcing it where it had quietly lapsed.

- **A cap that cannot be reported is a cap that lies.** `coplanar_overlap`
  applied its triangle-pair cap internally and returned "no overlaps", so two
  exactly coincident 590-triangle meshes shipped a textbook z-fight with an
  empty pairs list AND an empty `zFightingSkipped`. Caps now live in the
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
  diagnostics — interpenetrating faces are not coplanar, and no rule owned
  "these are simply inside each other" (S3D-W-107 now). Scope is deliberate:
  only instances the SOLVER generated are compared, because authored
  interpenetration is a technique (overlapping a junction by a pixel is how a
  careful modeller avoids z-fighting), while a relation that mints N instances
  is one decision nobody makes wanting self-overlap.

Three structural authorities came out of the same round:

**Provenance posture** (`lint/provenance.ts`). A third-party asset is a FACT
about somebody else's file, not a defect its new owner can fix — real game
meshes are open, ship welded seams as split vertices, and share mirrored UV
islands on purpose. That was implemented only for spec parts carrying
`file:`, so a project whose SOURCE is a bare `.glb` (a first-class workflow)
got no relaxation and a freshly downloaded Khronos sample compiled `ok:false`;
every fixture here ships a hand-written relaxed contract, which is what kept
it hidden. And the relaxation was SUPPRESSION, so nothing could explain why a
strict contract had gone quiet. Rules now always run and a post-pass
RECLASSIFIES: same finding, at `info`, carrying `provenance` and the severity
it was relaxed from. The rules it covers are a table whose rows name their own
override — writing in a convention block cancels that block's relaxation, and
only that block's.

**The contact model** (`solve/contact.ts`). Resting is a RELATION, not a
coordinate. The solver embeds a `sits_on` part by `MIN_CONTACT` so faces can
never land flush, and the support search rejected negative gaps as "not below
me", so the rule built to name what a part rests on could never name it. Then
`claims.grounded` checked only sinking while the world linter checked
floating, so a part hovering metres up passed the claim and collected the
warning — the "claims declared, none failed" badge awarded to a floating
asset. One predicate now answers both. "Below" is geometric rather than an
epsilon: hand-authored blocky assets overlap junctions by a whole pixel, and
an embed window sized to the solver's own 1mm called every such joint
unsupported.

Making the claim two-sided immediately failed the atelier capstone on its
levitating lava orb, which is the useful half of the lesson: a part suspended
by an `above` relation is DECLARED to hang, and coordinates alone cannot tell
that from a part left in mid-air by accident. The solver records the intent
where it is expressed (`SolvedPart.suspended`) and the claim reads it, rather
than the adjudicator inferring intent back out of geometry it cannot read.

**The oriented box is the voxel authority** (see the voxel section). The
census recovered it and one consumer read it; grid deviation, element extent,
element bounds and the Java exporter all still reasoned over the world AABB,
which for a rotated box is its diagonal bound.

Two supporting invariants land alongside:

- **The contract's field list is data** (`contract-schema.ts`). Validate and
  normalize are two behaviours that must agree about which fields exist, and
  as two hand-maintained cascades they had drifted: four convention blocks
  were normalized but never validated, so a malformed value coerced to the
  default and the rule the author meant to enable stayed silently OFF. Both
  now derive from one table, and a meta-test holds them together from both
  ends.
- **The cache key is the dependency closure** (`parse/companions.ts`). glTF
  legally splits a model across a `.gltf` and an external `.bin`; editing the
  `.bin` reported `build: cached` and shipped the old mesh. References are
  resolved rather than hashing the whole folder, which would trade a
  correctness bug for a precision bug.

## Diagnostics philosophy

The reader is an agent with no viewport. Every issue carries: the stable
code, the measurement that proves it (metres, counts, fractions), WHERE
(provenance to the authored scene.json line — repeat/scatter clones map to
their base part's line — rendered in the report, not buried in JSON), and
the nearest actionable fact (floats → names the nearest support below and
the gap; z-fights → the shared plane's axis, position, and overlap patch
size). Caps are loud: every bounded search reports what it skipped;
unchecked is never passed. The digest orders issues first, then allocation
statistics (tri-density spread, worst bilateral asymmetry) that no render
can show.

## Test corpus

- Generated calibration controls (must stay zero-issue): `spec_pavilion`
  (all shapes, repeat grid, emission, claims), `spec_rock_garden`
  (scatter determinism), `spec_shaded` (GPU bake), `spec_flame` (flipbook),
  `textured_prop`, atelier (everything at once, on real assets).
- Poisoned red fixtures for every rule family, including driver rejection
  and the NaN oracle.
- Real corpus (`tests/fixtures/real/`, licensed): DamagedHelmet (full PBR,
  mirrored-shared UVs), Fox (low-poly rigged), CesiumMan (humanoid
  skinned+animated), BrainStem (multi-bone dance). Real assets found four
  bugs generated fixtures were structurally incapable of exposing.
- Fuzz: validator shape-fuzz, uniform-name injection fuzz, GPU
  hostile-uniform fuzz riding the E-804 oracle, RNG known-answer +
  insertion-stability.
