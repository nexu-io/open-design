# KILN.md — design lineage

Design lineage, not the maintainer map. Start at `README.md` for how the
system is shaped and how to change it. This file records what scene3d took
from Kiln, a deterministic VR-orientated compiler for 3D assets that predates it, and
what remains worth taking.

Kiln lives in a private research repository and will stay there. This file
is written to stand alone: the design bets and failure stories are recorded
here so their lessons survive independently of the code. Unless a capability
is marked as adopted in the current package documentation, treat these
sections as lineage and candidate design material, not live behavior.

One doctrine comes before the details. The boundary around what scene3d may
automate is drawn at **determinism**, not artistic domain. Anything computable
from declared inputs (contact offsets today; expressions, skin weights,
skeletons, spring chains tomorrow) is a candidate for compiler support when
it improves author control, validation, or delivery.
Kiln is the existence proof: rigging and facial expression were "artist
domains" until they were algebra.

## What Kiln was

A declarative recipe compiled to a USD master asset, then lowered to
delivery targets (VRM, glTF, FBX), with machine-checked claims at every
step. Its geometry kernel was pure numpy; Blender sat behind an adapter as
a backend, not a dependency. Avatars were the hardest profile and the one
that proved the architecture; the kernel itself had no humanoid concept.

Built and verified end to end: a parametric head and body, a humanoid rig
with automatically computed skin weights, 43 ARKit expression shapes plus
15 visemes as exact morph targets, VRM 1.0 export, spring physics with a
derived stability bound, an NDMF-style module system, an object registry,
and a QA suite whose report volunteers what is missing and records skipped
checks as skips. Same recipe, same bytes, on any machine.

Its founding judgment is scene3d's: imperative geometry code without
measurement and provenance fails in ways nobody can detect, while structured
declarative intent can fail loudly and specifically. Both authoring modes
belong behind the same compiler boundary.

## Adopted (live in scene3d today)

- **The recipe is declarative and validated before execution.**
  `scene.json`: parts + relations + materials, schema-checked with JSON
  paths (`S3D-E-105`) before any geometry exists. The generating agent
  decides *what* to build in structured, reviewable terms; the solver and
  Blender do the geometry. `build.py` is the first-class freeform authoring
  path when the current JSON subset cannot yet express the intent.
- **The build produces an asset *and* a claim, and the validator is the
  authority.** `claims` in `scene.json`, adjudicated against the census by
  `src/lint/claims.ts` (`S3D-E-701`), with skips reported as skips (`S3D-W-701`).
- **Determinism as a substrate.** Sorted, fixed-precision output; unchanged
  spec compiles byte-identical; content-hash cache. This now reaches the
  DELIVERABLES, not only the census and the report: two --no-cache compiles
  of an unchanged scene produce byte-identical PNGs and byte-identical
  .usda/.glb/.obj/.fbx/.usdz. Getting there meant correcting three
  exporter behaviours that are nobody's arithmetic — depsgraph prim order,
  hash-seeded FBX ids, embedded wall clocks — and reporting the cases where
  a machine cannot make the promise (S3D-W-906). See ARCHITECTURE.md,
  "Byte determinism of the deliverables".
- **Structure over coordinates.** Relations, not numbers; the contact floor
  makes z-fighting structurally impossible.
- **The check owns the explanation.** Failures carry the measured truth and
  the fix direction.
- **Path-addressed RNG** (`src/solve/rng.ts`): streams derive from a
  hierarchical path hash, not seed+counter, so adding a part cannot perturb
  another part's randomness. Powers `scatter`; pinned by known-answer and
  insertion-stability tests.

## Ideas worth keeping, stated so they survive

**Subdivision is a sparse linear operator.** For fixed topology and creases,
Catmull-Clark is a matrix `S`: rows sum to exactly 1, so
`S @ (cage + delta) == S @ delta` to machine precision. A blendshape
authored by moving ~18 vertices on a 675-vertex control cage propagates to
a 10,295-vertex limit surface *exactly*, verified at 4.4e-16. No fitting,
no deformation transfer, no residual. This turned "author 30,000 numbers per
facial shape" into "author tens of numbers per shape, each attached to an
anatomical intent", which is the difference between a tractable
machine-authored shape space and an impossible one. Three extensions prove
it reaches further than blendshapes: skin weights ride the same operator
(`S @ W`, partition of unity exact with no renormalisation pass); UVs ride
it encoded as points on a circle, so the wrap seam never exists during
propagation; and the export-time vertex split is a row-gather, so the
composed operator keeps both properties through export. When scene3d wants
characters, faces, or rigged creatures, this is a proven road in. It is not
limited to manual mesh editing and can support both machine-authored and
human-directed workflows.

**Structure comes from patch graphs, not remeshing.** Generic auto-retopology aligns
to curvature, not anatomy; it emits a different vertex count every run, so a
reusable shape library is impossible, and it destroys UVs and vertex groups.
Kiln's answer generalises past faces: quad-patch layouts resolved by
union-find over edge rings, welded by *allocating* shared vertices once
(no distance-tolerance seams), and `inset_aperture`, which rebuilds a block
of faces as concentric rings converging on a chosen curve, with poles parked
deliberately at harmless corners. A window, a porthole, a nostril and an eye
are the same operation. `extrude_loop` grew limbs out of body sockets and
generalises the same way: an arm from a shoulder is a chimney from a roof.

**Symmetry is structural or it is nothing.** When mirroring is an integer
permutation, bilateral symmetry survives subdivision exactly, and a
reflected morph target is bit-exact, halving authoring and guaranteeing
consistency. The tolerance is 1e-9 m precisely because it *should* be zero;
the two real bugs that motivated it (a best-fit aperture alignment that was
not mirror-equivariant, landing differently left and right, and a midline
block spanning an odd number of segments, producing 8.9 mm of skew) were
invisible in every render and would have passed a comfortable epsilon.

**Humanoid-ness is a profile, not a kernel concept.** A skeleton is a named
joint hierarchy; "humanoid" maps joint paths onto a delivery vocabulary and
reports what each tier retains. Generic versus humanoid rig is a capability
trade to report, not a validity gate. Degenerate rigs are first-class: a
flat billboard avatar gets one joint and validates as a legitimate asset.

**Delivery formats make bad data models.** VRM requires 15 humanoid bones
with no non-humanoid escape hatch, so nothing that must also produce
quadrupeds or props can be built on it. USD has no opinion, which is the
right amount. But UsdSkel is a deformation format, not a rig: bone
semantics, expression-to-morph mapping, spring physics and look-at stay ours
to own and lower per target.

**Identity is minted once; indices are minted last.** glTF and VRM address
joints and morph targets by index, so any renumbering silently rewires the
asset. Kiln mints identity immediately, defers integer indices to emit from
a registry whose namespaces freeze when taken, carries named vertex sets
through every renumbering, and counts what a remap loses. This is the
mandatory companion to any pass system.

**A missing dependency is an error, not a silent no-op.** Kiln copied NDMF's
phase model (Resolve → Generate → Transform → Optimise → Emit) with one
deliberate departure: NDMF ignores missing modules for ecosystem
friendliness; a deterministic compiler that did that would ship a
valid-looking asset with a pass quietly absent. Two further scars copied
verbatim: generate and assign in the same sequence, and ordering from
declared constraints, never priority integers.

**The validation discipline.** Skips are reported as skips, never as passes.
Tolerances sit as tight as the maths allows (symmetry at 1e-9 m because an
integer permutation should be exact; the comfortable epsilon hid two real
bugs). The check owns the explanation: say what breaks and why. Any metric
used as evidence gets a known-answer test (Kiln's UV distortion metric shipped
transposed and reported plausible numbers until run against a case with an
independently known answer). Threshold comparisons must fail on NaN, so write
them so the failing branch fires, or a validator certifies exactly the corrupt
data it exists to catch. Verify the artifact's bytes, not the helper that
produced them; sample nothing; and a safeguard that cannot fail the build is
advisory, not a gate.

## Worth taking next (in rough value order)

1. **Module/pass system with an object registry**, the moment the language
   grows procedural generators. The phase model, the registry discipline,
   and the two scars above are specified enough to port directly.
2. **Cage-level subdivision operators** (blendshapes, reflected morph pairs,
   propagated skin weights, circle-encoded UVs, seam-split gathers) whenever
   the product wants faces, characters, or rigs. Deterministically
   automated and proven at production scale; what is missing is demand,
   not feasibility.
3. **Patch graphs, `inset_aperture`, `extrude_loop`** for organic or
   structured topology: openings with correct edge loops, sockets, grown
   limbs. Hard-won parts: union-find resolution solving, exact welding,
   pole-placement rules.
4. **Multiple render-context outputs on one USD material** (portable
   `UsdPreviewSurface` fallback beside a richer context) when materials grow
   beyond Principled parameters.
5. **Rig and lowering discipline**, when skeletal, deformation, facial, or
  sequenced animation arrives: deform bones in
   quaternion mode; bone roll is not cosmetic (identical head/tail with
   different roll exports as different rest rotations); emit a name→index
   manifest and generate binds from it; generate to the strictest rest pose
   and the looser spec is satisfied free; spring chains carry an exact
   stability bound (`omega*dt <= 2*(sqrt(1+zeta^2) - zeta)`); platform-side
   physics components do not survive export, so the lowering reports the
   loss and emits the setup step instead.
6. **Live link** (watch → GLB → WebSocket → WebXR page) as the kit viewer's
   future hot-reload path.

## Voxel / Minecraft target — fable-5 consult (built Phase 1+2)

A read-only fable-5 architecture consult shaped the `target: "minecraft"`
work; the load-bearing decisions, so later phases honour them:

- **The exporter is the load-bearing piece, not the linter.** A voxel linter
  over a format you still leave for Blockbench to produce is annotation, not
  replacement. The loop the user wants (author → compile to exactly what the
  game loads → tweak) *is* the exporter.
- **Lower pipeline-side, not in the runner.** There is no Blender exporter
  for MC JSON; cuboid recovery is pure math. The usdz precedent keeps it
  small and unit-pinnable.
- **Every rule is a format/consistency fact, never a style.** All voxel lint
  is target-gated, advisory, and phrased as "the game will reject/shimmer".
  The linter warns; the exporter hard-refuses.
- **Scope traps avoided:** no attempt to become a full Blockbench clone for
  the Minecraft target; no baked-in MC version knowledge in code paths; no
  resource-pack assembly in core, because the moment scene3d knows namespaces
  it is a build system. A timeline or richer animation system belongs in the
  broader compiler when it serves author intent; it is simply outside this
  target's current scope.
- **Domain facts corrected in-consult:** Java rotations are the fixed set
  {−45,−22.5,0,22.5,45}° on one axis (not free 22.5° steps); Bedrock cubes
  take free angles; cuboid-only is the contract for both dialects.

## Traps Kiln paid for that apply here

- `bpy.shape_key_add()` defaults to `from_mix=True` and silently bakes the
  current mix. Modifiers cannot be applied to a mesh with shape keys at all;
  apply Mirror/Subsurf before any shape key exists.
- The glTF exporter's `export_apply=True` silently drops shape keys; a shape
  key whose `relative_key` points at itself is silently skipped on export;
  muted keys skip too.
- Consumers prune empty morph targets, and because targets are addressed by
  index, one pruned shape shifts every later index and rewires the asset.
  Never emit a near-zero-delta shape; never hardcode a morph index.
- Best-fit search alignment is not mirror-equivariant; pair by each
  vertex's own angle instead. A midline-straddling block is mirror-closed
  only across an even segment span.
- Every IEEE comparison involving NaN evaluates false, so `value > limit`
  *passes* a NaN. Fix the comparison form once, in a shared primitive.
- `.usda` writes `quatf` literals `(w,x,y,z)`; glTF serialises `(x,y,z,w)`.
  `subdivisionScheme` defaults to `catmullClark` and `upAxis` to `Z`; omit
  either on delivery geometry and consumers smooth your final mesh or stand
  it on the wrong axis.
- Headless EEVEE renders fine on Windows with a session; surfaceless-EGL
  headless is Linux-only (matters only for CI boxes).
