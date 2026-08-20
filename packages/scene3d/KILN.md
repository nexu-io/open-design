# Kiln → scene3d integration notes

Source: `~/Documents/Projects/vr-avatar/kiln/` — a deterministic compiler
for 3D assets (declarative recipe → USD master → lowered delivery targets,
every claim machine-checked). Read `kiln/ADD.md` (the design document) and
`kiln/CLAUDE.md` before drawing on it further; several of its findings
correct widely-repeated errors. These notes track what scene3d has adopted
and what remains worth taking, so the next session starts from the map
instead of re-reading a 1000-line ADD.

## Adopted (live in scene3d today)

- **The recipe is declarative and validated before execution** (Kiln Bet 4,
  first half). `scene.json` — parts + relations + materials, schema-checked
  with JSON paths (`S3D-E-105`) before any geometry exists. The LLM decides
  *what* to build in structured, reviewable terms; the solver and Blender
  do the geometry. "An LLM that writes imperative geometry code" is the
  failure mode both projects exist to avoid; `build.py` stays only as the
  escape hatch for what the language cannot yet express.
- **The build produces an asset AND a claim, and the validator is the
  authority** (Bet 4, second half). `claims` in `scene.json`, adjudicated
  against the census by `src/lint/claims.ts` (`S3D-E-701`), with the
  "skips are reported as skips, never as passes" rule (`S3D-W-701`).
- **Determinism as a substrate.** Solved scenes are sorted and
  fixed-precision; an unchanged spec emits a byte-identical script and the
  content-hash cache hits. (Kiln goes further — see below.)
- **Structure over coordinates.** Kiln's "author structure, never geometry"
  working agreement is the solver's whole design: relations, not numbers;
  the contact floor makes z-fighting structurally impossible.
- **The check owns the explanation.** Claim failures carry the measured
  truth and the fix direction, per Kiln's validation principle 3.
- **Path-addressed RNG** (`kiln.determinism.Rng` → `src/solve/rng.ts`):
  streams derived from a hierarchical path hash, not seed+counter, so
  adding a part cannot perturb another part's randomness. Powers the
  `scatter` relation (deterministic organic placement with cross-scatter
  collision avoidance); pinned by a known-answer test and an
  insertion-stability test, per Kiln's own verification discipline.

## Worth taking next (in rough value order)

1. **Module/pass system with NDMF phases** (Resolve → Generate → Transform
   → Optimise → Emit) once the language grows procedural generators. Two
   scars to copy verbatim: generate-and-assign in the same sequence, and an
   object registry so index renumbering can never silently rewire anything
   (glTF addresses morphs/joints by index).
2. **Multiple render-context outputs on one USD material** (portable
   `UsdPreviewSurface` fallback + rich context) when materials grow beyond
   Principled parameters.
3. **Patch graphs + `inset_aperture`** for organic/structured topology
   (windows, portholes, faces). This is Kiln's L2 kernel; if scene3d ever
   needs edge-loop-correct openings, port the operators rather than
   reinventing (the union-find resolution solve and exact welding are the
   hard-won parts, and the pole-placement rules are research-backed).
4. **Catmull-Clark as a sparse linear operator** (Bet 2) — cage-level
   authoring propagated exactly to the limit surface. The lever for
   blendshapes/character work; irrelevant for hard-surface props.
5. **Live link** (watch → GLB → WebSocket → WebXR) as the kit viewer's
   future hot-reload path.

## Traps Kiln documents that apply here directly

- `bpy` shape-key/modifier interactions are a minefield (modifiers cannot
  apply to meshes with shape keys; `export_apply=True` drops shape keys) —
  relevant the day scene3d grows animation morphs.
- Never hardcode a morph/joint index; emit a name→index manifest at export.
- Blender's glTF exporter writes bone matrices as-is (`export_yup` stays
  True); "Bone Dir" is an import option, not an export one.
- Headless EEVEE renders fine on Windows with a session; surfaceless-EGL
  headless is Linux-only (matters only for CI boxes).
- "Any metric used as evidence needs a known-answer test" — Kiln's UV
  distortion metric shipped transposed and looked plausible. scene3d's
  equivalents (UV raster, texel density) are pinned by fixtures; keep that
  bar for every new measurement.
