# scene3d

A deterministic world compiler for Open Design.

One call takes a scene directory, runs parse → build → proof → export →
lint → manifest through headless Blender, and returns a structured report
with stable `S3D-*` issue codes. The generating agent writes sources; the
compiler turns them into the asset, its measurements, and its diagnostics.
No per-check tools sit beside that call.

This file is the maintainer map: how the system is shaped, where each piece
lives, which contracts must not drift, and how to change them without
breaking the host. Read it when you are working *on* scene3d. Teaching an
agent to *author* a scene is a different job, and it belongs to
[`design-templates/scene3d/SKILL.md`](../../design-templates/scene3d/SKILL.md).

Companion documents in this package:

| File | Role |
|---|---|
| `README.md` (this file) | Maintainer architecture, host seam, how to change the system |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Compiler internals: language fidelity, USD master, shaders, voxel, materials, verdict totality |
| [`KILN.md`](./KILN.md) | Design lineage: what was adopted from prior research artifacts, what remains worth taking |
| [`RESEARCH.md`](./RESEARCH.md) | Historical strategy note: why this is a compiler, not a reconstruction generator |

## Contents

1. [What it is](#what-it-is)
2. [The host seam](#the-host-seam)
3. [Ownership](#ownership)
4. [Current architectural baseline](#current-architectural-baseline)
5. [Pipeline](#pipeline)
6. [Sources](#sources)
7. [The language](#the-language)
8. [The contract](#the-contract)
9. [Issue taxonomy](#issue-taxonomy)
10. [Subsystems](#subsystems)
11. [Artifacts on disk](#artifacts-on-disk)
12. [Host surfaces](#host-surfaces)
13. [Viewer and kit](#viewer-and-kit)
14. [Diagnostics](#diagnostics)
15. [Testing](#testing)
16. [How to change the system](#how-to-change-the-system)
17. [Load-bearing invariants](#load-bearing-invariants)
18. [Product boundary](#product-boundary)
19. [Commands](#commands)

---

## What it is

scene3d treats a 3D scene the way a compiler treats a code project.

This is an alpha, and the declarative language is intentionally incomplete.
The current JSON vocabulary is a useful structured subset, not the boundary
of what scene3d may eventually express. The freeform Python path is a
first-class authoring mode today; over time, more of that expressive power
can become declarative while keeping the same measurement, diagnostics, and
export boundary. "Not implemented yet" is not the same as "forbidden by the
architecture."

- **Sources are text or real files.** A declarative `scene.json`, a Blender
  Python `build.py`, USDA layers, a `.blend`, a dropped-in `.glb`, or a
  Minecraft `model.json`. One entry point per scene directory.
- **Compilation is deterministic.** Under the supported toolchain, the same
  sources and contract produce the same measured census and issue codes, plus
  a byte-identical `<scene3d-report>` once the cache is warm. Artifact bytes
  are promised where the relevant exporter and runtime can make that promise;
  semantic equivalence is the expectation across different toolchains.
- **Judgement is measured.** Headless Blender records a census of
  world-space facts, and pure TypeScript lint rules compare those facts to
  `scene3d.json`. Every failure is a stable code carrying the measurement
  that proves it and the source line that caused it.
- **USD is the current master for 3D scene and geometry deliveries.** The
  stage is authored first. GLB, OBJ, FBX, and the rest are lowered from a
  re-import of that stage. Other asset products may retain a more natural
  authoritative source while using the same measurement and validation
  boundary.

Inside Open Design, HyperFrames already runs this play: the agent authors
sources, a deterministic compiler produces the asset and its diagnostics,
and the host surfaces the result. scene3d carries the pattern into 3D.

`ok` is true only when the compile produced zero error-severity issues. A
failing scene is still a successful API call (`200` + `ok: false`). HTTP
errors are reserved for a request the daemon could not run.

---

## The host seam

scene3d ships as a compiler package plus a thin host ring. The ring exposes
one compile call on both the web UI and the `od` CLI, and the repository
counts a single-surface capability as a regression.

```
┌─ Authoring ──────────────────────────────────────────────────────────┐
│  generating agent writes scene.json / freeform build.py / real assets │
│  design-templates/scene3d/SKILL.md is that agent's manual            │
├─ Compiler  @open-design/scene3d ─────────────────────────────────────┤
│  compile(projectDir) → CompileResult                                 │
│  no Express, no Next, no browser, no SQLite, no daemon internals     │
├─ Wire    @open-design/contracts ─────────────────────────────────────┤
│  request/response DTOs, issue titles, URL builder, tree layout,      │
│  postMessage protocol (selection + tweaks)                           │
├─ Daemon  apps/daemon ────────────────────────────────────────────────┤
│  POST  /api/projects/:id/scene3d/compile                             │
│  GET   /api/projects/:id/scene3d/manifest                            │
│  GET|POST /api/projects/:id/scene3d/tweaks                           │
│  od scene3d compile | manifest | tweaks                              │
├─ Web     apps/web ───────────────────────────────────────────────────┤
│  Scene3dPanel  — native compile surface (proof player, parts, issues)│
│  HtmlViewer    — kit pages (renderer: html, kind: scene3d)           │
│  host Export menu owns downloads                                     │
└──────────────────────────────────────────────────────────────────────┘
```

Both UI and CLI call the same `/api/*` endpoints. The daemon HTTP layer is
the source of truth. `packages/contracts` carries the shared DTOs. The
compiler package never knows it is being driven by a panel, a CLI, or a
test.

### Kind versus renderer

Every compiled artifact's sidecar has `kind: "scene3d"`: what the file
*is*. That gates chrome, labels, and the Export menu.

`renderer` says how it draws:

| renderer | surface | typical file |
|---|---|---|
| `"scene3d"` | native `Scene3dPanel` | `out/index.html` (frame player) |
| `"html"` | `HtmlViewer` with the scene3d-gated toolbar | `kit.html` (live WebGL viewport) |

`Scene3dRenderer` in `apps/web/src/artifacts/renderer-registry.ts` matches
on `renderer` only, and is registered first. Kit pages are HTML; matching
on `kind` would drag them into the native panel and wrap a full editor in
a second frame.

`assetKind` (`scene` / `prop` / `animation` / `sprite` / `flipbook` /
`vfx` / `skybox` / `texture`) is **derived**, never authored.
`deriveAssetKind()` in `src/manifest.ts` reads the census and declared
sheets. Do not add a config field for it.

### One URL builder

`buildScene3dAssetUrl(projectId, path)` in
`packages/contracts/src/api/scene3d.ts` is the only encoder for
`/api/projects/:id/files/...` deliverable URLs. The daemon's `artifactRef()`
and the web's `deliverableRefs()` both use it. A second encoder is how a
filename with a space silently 404s on one surface.

### Sidecars are compile-time artifacts

`*.artifact.json` files and kit pages are written at compile time, on
disk. Editing compiler, viewer, or sidecar code shows nothing new for an
existing project until that scene is recompiled. The daemon also
auto-writes a legacy inferred sidecar (`kind: "html"`) for any bare
`.html`, so a kit page that renders like a plain prototype is showing you
stale disk state; suspect the sidecar before the router.

---

## Ownership

| Layer | Path | Owns | Must not own |
|---|---|---|---|
| Compiler | `packages/scene3d` | Pipeline, language, solver, shaders, census protocol, lint, issue codes, kit HTML, USDZ/MC lowering | HTTP, UI, i18n, project store |
| Wire | `packages/contracts/src/api/scene3d.ts` | DTOs, `buildScene3dAssetUrl`, selection/tweaks messages | Filesystem, Blender, React |
| Issue titles | `packages/contracts/src/api/scene3d-codes.ts` | Human phrase per `S3D-*` code | The code *set* (that is `errors.ts`) |
| Tree layout | `packages/contracts/src/api/scene3d-tree.ts` | Prototype-stem clustering, prim paths, row layout | Viewer rendering |
| Daemon routes | `apps/daemon/src/routes/scene3d.ts` | Compile/manifest/tweaks HTTP, 409 in-flight lock, 200-on-lint-fail | Compiler policy |
| CLI | `apps/daemon/src/cli.ts` (`od scene3d`) | Dual-track of the HTTP surface, `--json`, `--set-file -` | A second compile path |
| Native panel | `apps/web/src/components/Scene3dPanel.tsx` | Proof player, parts tree, issues, Export | Kit WebGL |
| Compile hook | `apps/web/src/hooks/useScene3dCompile.ts` | POST compile, hydrate from stored manifest, `scene3dScenePathForFile` | Pipeline |
| Presentation | `apps/web/src/runtime/scene3d-assets.ts` | Deliverable grouping, `assetKind` labels | Compiler types |
| Selection bus | `apps/web/src/runtime/scene3d-selection.ts` | Host-side selection store from `od:scene3d-select` | Kit internals |
| Authoring skill | `design-templates/scene3d/SKILL.md` | How a generating agent writes a scene | Compiler internals |
| Example plugin | `plugins/_official/examples/scene3d/` | Discoverable example | Pipeline |

`packages/scene3d` takes a project directory and returns a `CompileResult`.
As far as the host is concerned, that is the whole API.

Artifact enums that mention `scene3d` must stay in sync in four places:

- `packages/contracts/src/api/artifacts.ts`
- `apps/web/src/artifacts/types.ts`
- `apps/web/src/artifacts/manifest.ts`
- `apps/daemon/src/artifacts/manifest.ts`

i18n keys live in the `'scene3d.*'` block of `apps/web/src/i18n/types.ts`
and every locale under `apps/web/src/i18n/locales/`. Typecheck enforces
the full set of 19 locales.

---

## Current architectural baseline

These are the current decisions that protect the compiler boundary. Some are
long-lived invariants; others describe the present alpha implementation and
may be extended as the language grows. Change the latter deliberately, but do
not mistake today's supported syntax for a permanent ceiling.

1. **One compile call.** No sibling "check z-fighting" / "validate naming"
   tools or endpoints. The compile response's `agentMessage` is the
   `<scene3d-report>` block for agent self-correction.
2. **`scene.json` and `build.py` are peer authoring modes.** JSON emphasizes
  structured declarative intent; Python is the raw mode for direct
  procedural control. USDA and `.blend` are additional source modes.
  `scene.json` + `build.py` together is
   `S3D-E-102`, never a silent winner.
3. **Validate before geometry exists.** Spec failures are `S3D-E-105` with
   JSON paths, never a Blender traceback.
4. **The author is never the authority on success.** `claims` are
   adjudicated against the census (`S3D-E-701` / `S3D-W-701`).
5. **Every shape fills its AABB exactly.** The solver reasons in boxes.
   Shape is a rendering fact.
6. **Contact offsets and repeat pitches floor at 1 mm from flush.**
   Z-fighting is structurally impossible for generated contacts.
7. **Measure in Blender, judge in the contract.** Lint rules never invent
   thresholds. `normalizeContract` holds every default.
8. **Measure unconditionally; gate judgement on policy; gate emission on a
   requested deliverable.** See [Three strata](#three-strata).
9. **A check never exits without a verdict.** `{clean, findings,
   unchecked(reason)}`. Silence is not evidence. A skipped oracle is a
   warning, not a pass.
10. **A relaxation is never a suppression.** Imported geometry is
    reclassified (`lint/provenance.ts`) to info with `detail.provenance`.
    Rules always run.
11. **USD is the master.** Author `scene.usda` first, re-import, lower
    everything else. Parity is measured (`S3D-E-901` / `S3D-W-901`).
12. **Export precedes lint** so the linter validates the artifact that
    ships, not only the scene that was built. Proof still runs before lint
    because lint reads frame statistics.
13. **The host Export menu owns downloads.** Generated kit pages have no
    in-page download control.
14. **The host never scales a 3D viewport.** In `HtmlViewer`,
    `isScene3dArtifact` is declared above zoom/viewport state so zoom is
    forced to 100 and the page camera is the only zoom. This is why a kit
    page shows less preview chrome than a generic WebGL artifact (which
    keeps the zoom menu and the device-viewport picker): CSS-zooming an
    orbit camera's canvas resamples pixels without changing framing, and a
    phone-width simulation of a self-fitting 3D viewport simulates nothing.
    The suppression is the seam working, not a missing feature; a
    scene3d-native equivalent (camera distance, FOV) would belong in the
    page's own chrome, not the host toolbar.
15. **Kit pages talk to the API through the host.** Srcdoc is an opaque
    origin. `Origin: null` is rejected by the daemon on purpose. Tweaks and
    compile-from-viewer go through `od:scene3d-tweaks` postMessage.

### Three strata

The compiler distinguishes three important kinds of conditional. Confusing
them is how modes grow.

| Stratum | Gate | Example |
|---|---|---|
| Measurement | Unconditional, except cost keyed on a *value* that proves a reader exists | Oriented box of every mesh; thickness ray-cast only when `minThicknessMm` is set |
| Judgement | Presence of policy | `contract.voxel.enabled` is the cached answer to "did anyone declare this policy", not an author-settable switch |
| Emission | A requested deliverable | `export.formats`, `minecraft.dialect`, `proof.turntable` |

A fact measured only in one mode is a fact no other consumer can use. When
a flag appears, place it in one of the three strata. If it fits none, it
is probably duplicating a value that already exists.

---

## Pipeline

`compile()` in `src/pipeline.ts` is the only public compile entry. It
resolves `projectDir` to an absolute path at entry. The runner chdirs, so
a relative path would otherwise resolve twice.

Declared stage vocabulary: `parse`, `build`, `lint`, `proof`, `export`,
`manifest`. Actual execution order:

```
parse → build → proof → export → lint → manifest
```

Proof precedes lint because lint reads frame coverage statistics. Export
precedes lint so stage/oracle rules read the shipped USD and glTF, not
the Blender scene.

| Stage | What it does | Failure mode |
|---|---|---|
| **parse** | Discover the single source, load `scene3d.json`, validate the spec, solve relations, emit `.scene3d/spec.build.py`, structurally check shaders | `S3D-E-101`–`106`, `S3D-E-801` |
| **build** | Headless Blender: GPU warmup, shader bake, import, geometry, census | `S3D-E-201`–`204`, `S3D-W-207`/`208`, `S3D-E-802`–`804` |
| **proof** | EEVEE turntable, neutral ambient world, transparent film, frame statistics | `S3D-E-206`; empty/sparse frames judged later as `S3D-E-383` / `W-383`–`386` |
| **export** | Author USD master, re-import, lower GLB/OBJ/FBX/…, package USDZ, emit Minecraft models | `S3D-E-205`, `S3D-W-205`, `S3D-E-901` |
| **lint** | Pure functions over census + USDA + exported stage + sheets + claims + proof stats | The `S3D-*-3xx`–`9xx` families |
| **manifest** | Digest, sidecar, kit page, derived `assetKind`, claims ledger | Does not fail the compile on its own |

Default timeout is 180 s inside the package; the daemon ceiling is 600 s
(shader bakes). A second concurrent compile of the same scene is `409
CONFLICT`: two Blender trees would race on the cache and the proof PNGs.

Stages cache by content hash of their inputs. `noCache` bypasses.
**A stage that caches must cache everything its consumers read, not just
file artifacts.** The proof stage caches frame statistics alongside PNG
paths; without that, a cached recompile drops `S3D-E-383` and reports a
black render as clean.

The Blender runner (`scripts/blender/runner.py`) speaks one protocol: a
job JSON in, one sentinel-framed JSON line out:

```
###SCENE3D###<base64 json>###
```

Everything else on stdout is progress chatter. The runner is resolved
through `resolveScriptsDir`, which probes both the `src/` layout (package
tests importing source) and the bundled `dist/` layout (daemon consuming
the esbuild build). A hard-coded `../../scripts` silently breaks every
consumer while this package's own tests still pass.

Runtime discovery: `SCENE3D_BLENDER_BIN`, or `python` with the `bpy`
module (`SCENE3D_PYTHON_BIN`). `SCENE3D_SCRIPTS_DIR` overrides the scripts
root. `view_layer.update()` runs at the top of `census()` and of the proof
stage. Background bpy does not refresh `matrix_world` for transforms set
outside operators, so without that update every world-space fact is
measured against where objects used to be.

---

## Sources

`discoverSources()` in `src/parse/sources.ts` picks one primary source kind in
the current alpha. Some primary sources may use intentional companions; for
example, a raw Python build may have USDA layers alongside it. Companions do
not become competing authoring sources unless the discovery rules say so.
Precedence is fixed:

| Kind | Trigger | Notes |
|---|---|---|
| `spec` | `scene.json` | Primary. Solver emits the bpy script. |
| `bpy` | `build.py` | Raw authoring mode. USDA siblings may ride along. |
| `usda` | `.usda` / `.usdc` / `.usdz` | Direct stage. Prefers `scene.usda`. |
| `blend` | `.blend` | Native Blender file. |
| `mc_model` | `.bbmodel`, or a `.json` with an `elements` array that is not `scene.json` / `scene3d.json` | Converted in memory to a spec; copy written to `.scene3d/imported.scene.json`. |
| `mesh` | `.glb` / `.gltf` / `.obj` / `.fbx` | Bare downloaded assets. Inspection posture. |

`scene.json` + `build.py` together is `S3D-E-102`. An empty directory is
`S3D-E-101`.

Real downloaded assets are first-class. A scene dir of bare meshes
compiles as `mesh`: native import, derived camera and sun, full
census/lint/proof/export. Third-party files use the inspection contract
posture (open meshes, fractional metallic, mirrored-shared UVs are
legitimate techniques). Provenance reclassifies findings about imported
geometry to info; writing an explicit convention block cancels the
relaxation for that block alone.

Companion files (a `.gltf`'s external `.bin`, an OBJ's `.mtl`) are part of
the cache key (`parse/companions.ts`). Hashing only the entry file is how
an edited `.bin` used to report `build: cached` and ship the old mesh.

---

## The language

`src/solve/` is pure TypeScript: no I/O, no Blender. The language is
**parts + relations + materials + claims**. Coordinates are a solver
output.

- **Parts** declare an AABB in metres and what fills it: `box`,
  `cylinder`, `sphere`, `cone`, `torus`, a `file:` import, a `script:`
  Python file that defines `def build(ctx)`, or a `recipe:` — Python that
  records a deterministic kernel operator trace (`ctx.box`/`cage`/
  `subdivide`/`mirror`) the compiler evaluates in exact rationals (see
  [Kernel](#kernel)). Every fill is fitted inside the declared box (uniform
  scale, centred on x/y, bottom-rest), so relations, claims, contacts, and
  provenance behave identically.
- **Relations** (`at`, `sits_on`, `above`, `align`, `inset_from`, `span`,
  `repeat`, `scatter`) are order-independent. The solver is a fixpoint.
  `repeat` × `scatter` on the same part is a static reject.
- **Scatter** uses path-addressed RNG (`src/solve/rng.ts`, PCG/FNV over
  BigInt). Adding an unrelated part cannot reshuffle an existing scatter.
- **Materials** are named PBR. An undeclared reference is a parse error.
  `material` on a `file` or `script` part is a wholesale override.
- **Shaders** are raw kernels (`vec4 kernel(vec2 uv)` in a `.glsl` file).
  The compiler owns uniforms, the integer-hash stdlib, both wrappers
  (Blender GPUShaderCreateInfo and WebGL2 300 es), and the bake. Time is a
  kernel dimension: `frames: 2..256` (powers of two) bakes a POT atlas that registers as a
  sheet.
- **Animation currently includes** per-part `spin` / `bob`. The compiler owns
  those keyframes (24 fps, cycles modifiers), and any motion derives
  `assetKind: animation`. Sequenced keyframes, skeletal/deformation systems,
  and richer animation intent are future language areas, not architectural
  exclusions.
- **Claims** (`parts`, `maxTriangles`, `grounded`, `maxHeight`,
  `footprint`, `watertight`, `materialsUsed`) are adjudicated against the
  census. `grounded` means nothing sinks through the floor. Floating is a
  legitimate composition; projects that want it reported opt into
  `conventions.grounding`.
- **Identifiers** are charset-gated (`[A-Za-z][A-Za-z0-9_]{2,63}` for
  parts and materials; `uCamelCase` for uniforms). That is what makes
  generated Python and assembled GLSL injection-proof by construction.

The grammar, examples, and issue remedies for a generating agent live in
the skill. The type source of truth is `src/solve/types.ts`. Schema
validation is `src/solve/validate.ts`. The bpy backend is
`src/solve/emit-bpy.ts`.

One physical relation has one predicate. Grounding lives in
`src/solve/contact.ts` and is consumed by both the world linter and the
claims adjudicator. The voxel element frame is the census's oriented box
(`center` / `localSize` / `rotation`), consumed by grid deviation, extent,
bounds, and both Minecraft exporters. Re-deriving either locally is how
they last disagreed.

---

## The contract

`scene3d.json` is the conventions file the linter is configured from. Both
the generating agent and the linter read it. There is no parallel
prose policy.

- `schemaVersion: 1`
- `target` (optional): `unity` | `unreal` | `godot` | `web` | `3d_print` |
  `voxel` | `minecraft`. A preset fills defaults; explicit `conventions`
  always win. A profile may **add** a deliverable (print adds STL); it
  must not silently remove one.
- `conventions`: naming, hierarchy, units, PBR, UV, textures, geometry,
  grounding, budgets, print DfM, sheets, tessellation, voxel, minecraft,
  coherence.
- `proof`: engine, resolution, turntable, background.
- `export.formats`: `usda` | `usdz` | `glb` | `obj` | `fbx` | `stl` |
  `ply`. Default is USDA + USDZ + GLB + OBJ + FBX.
- `sheets`: declared 2D assets the sheet linter judges.

Validate and normalize derive from one field table
(`src/contract-schema.ts`). A convention block that is normalized but
never validated coerces garbage to the default and silently disables the
rule the author meant to enable. The meta-test in
`tests/contract-schema.test.ts` holds both ends together.

`voxel` is engine-agnostic blocky-art discipline (grid, snap, pixel
density) and ships normal GLB/USD/OBJ. `minecraft` ⊃ `voxel` and adds
vanilla format rules plus the JSON the game loads. Neither is a style.
Voxel lint is advisory; the exporter is what hard-refuses an
unrepresentable model.

---

## Issue taxonomy

Codes are the contract between the pipeline, the generating agent, and the
test corpus. They live in `src/errors.ts` as `ISSUE_CODES`. Human titles
live in `packages/contracts/src/api/scene3d-codes.ts`. A daemon test
(`apps/daemon/tests/scene3d-issue-titles.test.ts`) asserts every code has
a title, so the two cannot drift.

The severity prefix is part of the identity. `S3D-E-321` (non-manifold)
and `S3D-W-321` (n-gons) are different codes for different rules. A
numeric-only uniqueness scan produces false positives; do not "fix" that.

Any UI that shows a bare code must show or tooltip its title via
`scene3dIssueTitle(code)`.

| Range | Family | Typical owner |
|---|---|---|
| `E-101`–`106`, `W-105`–`109` | Parse, spec, solver, kinematics | `parse/`, `solve/` |
| `E-201`–`207`, `W-205`–`209` | Blender, census, export, tweaks | `build/`, pipeline |
| `*-301`–`306` | Naming | `lint/naming.ts` |
| `*-321`–`336` | Topology, hygiene, print DfM, contacts | `lint/topology.ts`, `world.ts` |
| `*-325`–`326` | Grounding, triangle budgets | `lint/world.ts` |
| `*-341`–`350` | PBR, textures as files | `lint/pbr.ts` |
| `*-361`–`362` | Units, up axis | `lint/units.ts` |
| `*-381`–`386` | Integrity, proof frames | `lint/integrity.ts`, `proof.ts` |
| `*-401`–`405` | Exported USD stage | `lint/stage.ts` |
| `E-441`, `W-441`–`447` | UVs | `lint/uv.ts` |
| `E-501`/`W-501`/`W-509` | Khronos glTF oracle | `lint/gltf-oracle.ts` |
| `E-502`/`W-502`/`W-508` | OpenUSD pxr oracle | `lint/usd-oracle.ts` |
| `I-501`–`502` | Stage skipped, MC import | pipeline |
| `*-601`–`616` | 2D sheets | `lint/sheet.ts` |
| `E-701`/`W-701` | Claims | `lint/claims.ts` |
| `*-801`–`804` | Shaders | `shade/`, runner |
| `*-901`–`904` | Master parity, USDZ up-axis | pipeline, `usd/` |
| `W-951`–`956`, `I-951`–`952` | Intent budgets, outliers | `lint/judge.ts` |
| `W-970`–`973`, `I-970` | Voxel / Minecraft format | `lint/voxel.ts` |

### Parse and solve

| Code | Title |
|---|---|
| `S3D-E-101` | No scene sources found |
| `S3D-E-102` | Multiple scene sources conflict |
| `S3D-E-103` | USDA failed to parse |
| `S3D-E-104` | Invalid scene3d.json contract |
| `S3D-E-105` | scene.json fails validation |
| `S3D-E-106` | Layout constraints unsolvable |
| `S3D-W-105` | Valid but suspect authoring |
| `S3D-W-106` | Authored offset auto-adjusted |
| `S3D-W-107` | Generated instances intersect |
| `S3D-W-108` | Motion envelope crosses a neighbour |
| `S3D-W-109` | Clearance thinner than declared |

### Build

| Code | Title |
|---|---|
| `S3D-E-201` | Blender not found |
| `S3D-E-202` | Blender build failed |
| `S3D-E-203` | Build stage timed out |
| `S3D-E-204` | Scene census invalid |
| `S3D-E-205` | Export failed |
| `S3D-W-205` | Export format unavailable |
| `S3D-E-206` | Proof render failed |
| `S3D-E-207` | Blender version unsupported |
| `S3D-W-207` | Imported file degraded |
| `S3D-W-208` | Viewer edits ignored |
| `S3D-W-209` | Deliverable write failed |

### Naming, topology, world, PBR, units, integrity

| Code | Title |
|---|---|
| `S3D-E-301` / `S3D-W-301` | Default object name |
| `S3D-E-302` | Name violates pattern |
| `S3D-E-303` | Missing name prefix |
| `S3D-E-304` | Default collection name |
| `S3D-E-305` | Collection name violates pattern |
| `S3D-E-306` | Hierarchy too deep |
| `S3D-E-321` | Non-manifold mesh |
| `S3D-W-321` | N-gon faces |
| `S3D-E-322` | NaN in transform |
| `S3D-E-323` | Degenerate scale |
| `S3D-W-322` | Zero-area faces |
| `S3D-E-324` | Z-fighting between faces |
| `S3D-W-323` | Z-fighting check incomplete |
| `S3D-W-325` | Part floats above support |
| `S3D-E-325` | Part sunk below ground |
| `S3D-E-326` | Mesh over triangle budget |
| `S3D-W-326` | Scene over triangle budget |
| `S3D-E-327` | Negative scale |
| `S3D-W-327` | Loose geometry |
| `S3D-W-328` | Duplicate vertices |
| `S3D-W-329` | Inconsistent face winding |
| `S3D-W-330` | Unapplied object scale |
| `S3D-W-331` | Duplicate-vertex check skipped |
| `S3D-W-332` | Hidden mesh still exports |
| `S3D-W-333` | Unsupported print overhang |
| `S3D-W-334` | Wall too thin to print |
| `S3D-W-335` | Triangle budget approximated |
| `S3D-W-336` | Contact scan skipped |
| `S3D-W-337` | Rested pair never touches |
| `S3D-W-338` | File part underfills its declared box |
| `S3D-E-341` | Metallic outside convention |
| `S3D-E-342` | Roughness out of range |
| `S3D-W-341` | Untouched default material |
| `S3D-W-342` | IOR out of range |
| `S3D-W-343` | Texture without UVs |
| `S3D-W-344` | Unused material |
| `S3D-W-345` | Object without material |
| `S3D-E-346` | Texture file missing |
| `S3D-W-346` | Texture not power-of-two |
| `S3D-W-347` | Texture oversized |
| `S3D-W-348` | Duplicate materials |
| `S3D-W-349` | Faces without material |
| `S3D-W-350` | Unrealistic dark metal |
| `S3D-E-361` | Scene units mismatch |
| `S3D-E-362` | Up-axis mismatch |
| `S3D-W-361` | Non-uniform scale |
| `S3D-E-381` | No camera |
| `S3D-W-381` | No lights |
| `S3D-E-382` | Empty mesh |
| `S3D-W-382` | Part off camera |
| `S3D-E-383` | Proof render empty |
| `S3D-W-383` | Proof render sparse |
| `S3D-W-384` | Turntable shows no motion |
| `S3D-W-385` | Proof overexposed |
| `S3D-W-386` | Some proof angles empty |
| `S3D-W-387` | Proof frames unmeasured |

### Exported stage, UVs, oracles

| Code | Title |
|---|---|
| `S3D-E-401` | Stage prim missing kind |
| `S3D-E-402` | Stage up-axis mismatch |
| `S3D-E-403` | Stage units mismatch |
| `S3D-E-404` | Stage prim default name |
| `S3D-E-405` | No default prim |
| `S3D-W-401` | No assetInfo authored |
| `S3D-W-402` | Missing extent |
| `S3D-W-403` | Prim name mismatch |
| `S3D-W-404` | Proof rig not marked guide |
| `S3D-W-405` | Model hierarchy inconsistent |
| `S3D-E-441` | UVs missing |
| `S3D-W-441` | Overlapping UV islands |
| `S3D-W-442` | Flipped UVs |
| `S3D-W-443` | UVs outside the 0–1 tile |
| `S3D-W-444` | Uneven texel density |
| `S3D-W-445` | Texel density off target |
| `S3D-W-446` | UV check incomplete |
| `S3D-W-447` | UV stretch too high |
| `S3D-E-501` | glTF failed Khronos validation |
| `S3D-W-501` | glTF validation warning |
| `S3D-E-502` | USD stage does not compose |
| `S3D-W-502` | USD binding resolves to nothing |
| `S3D-W-508` | USD conformance unchecked |
| `S3D-W-509` | glTF conformance unchecked |
| `S3D-I-501` | Stage skipped |
| `S3D-I-502` | Minecraft model imported |

### Sheets, claims, shaders, master, intent, voxel

| Code | Title |
|---|---|
| `S3D-E-601` | Sheet file missing |
| `S3D-E-602` | Sheet unreadable |
| `S3D-E-603` | Sheet not power-of-two |
| `S3D-E-604` | Sheet oversized |
| `S3D-E-605` | Sheet empty |
| `S3D-E-606` | No fully opaque pixels |
| `S3D-E-607` | Tintable sheet carries hue |
| `S3D-E-608` | Grid does not match cells |
| `S3D-E-609` | Blank flipbook frames |
| `S3D-E-610` | Cell bleeds into neighbour |
| `S3D-E-611` | Art touches sheet border |
| `S3D-E-612` | Sheet not tileable |
| `S3D-E-613` | Art touches strip long edge |
| `S3D-E-614` | Skybox not opaque |
| `S3D-E-615` | Skybox seam break |
| `S3D-E-616` | Cubemap faces incomplete |
| `S3D-W-601` | Flipbook frames identical |
| `S3D-W-602` | Skybox highlights clipped |
| `S3D-W-603` | Sheet mostly empty |
| `S3D-W-604` | Flipbook cells not power-of-two |
| `S3D-W-605` | Additive sheet has a bright border |
| `S3D-E-701` | Authored claim failed |
| `S3D-W-701` | Claim could not be checked |
| `S3D-E-702` | Kernel prediction did not match build |
| `S3D-W-702` | Kernel prediction could not be checked |
| `S3D-E-801` | Shader source invalid |
| `S3D-E-802` | Driver rejected shader |
| `S3D-E-803` | Shader bake failed |
| `S3D-E-804` | Shader produced NaN/Inf |
| `S3D-W-801` | Shader never referenced |
| `S3D-W-804` | Non-finite pixel oracle unchecked |
| `S3D-E-901` | Master stage lost content |
| `S3D-W-901` | Master parity unchecked |
| `S3D-W-902` | Joint/morph order drifted in lowering |
| `S3D-W-903` | Material capability lost in lowering |
| `S3D-W-904` | USDZ is not Y-up for AR |
| `S3D-W-951` | Part over its role triangle share |
| `S3D-W-952` | Hero less detailed than background |
| `S3D-W-953` | Part over its role texture budget |
| `S3D-W-954` | Part scale incoherent with the scene |
| `S3D-W-955` | Sliver triangles for the role |
| `S3D-W-956` | Under-textured for the role |
| `S3D-I-951` | Triangle-density outlier |
| `S3D-I-952` | Size outlier — verify units |
| `S3D-W-970` | Vertices off the voxel grid |
| `S3D-W-971` | Not a single cuboid element |
| `S3D-W-972` | Rotation not allowed in this format |
| `S3D-W-973` | Outside the model element bounds |
| `S3D-I-970` | Multi-block structure, not one element |

Adding a code follows a fixed five-step checklist; it lives under
[Add an issue code](#add-an-issue-code).

---

## Subsystems

```
packages/scene3d/src/
├── pipeline.ts          compile() — the only public compile entry
├── errors.ts            ISSUE_CODES — the code set
├── types.ts             stage/census/contract shapes that cross stages
├── contract.ts          defaults, target profiles, normalize
├── contract-schema.ts   one field table for validate + normalize
├── report.ts            <scene3d-report> for the generating agent
├── verdict.ts           issues → ranked "what to fix first"
├── manifest.ts          sidecars, kit index, deriveAssetKind
├── parse/               source discovery, USDA parser, companion files
├── solve/               language, validate, fixpoint, contact, emit-bpy, rng
├── kernel/              deterministic geometry: exact rationals, Catmull-Clark,
│                        mirror, homology, predicted census, operator-trace IR
├── shade/               kernel validate/emit/stdlib (PCG2D, never fract(sin))
├── build/               Blender spawn, runner protocol, census types
├── lint/                one module per family; rules.ts is the orchestra
├── sheet/               PNG codec + occupancy/edge measurement
├── usd/                 stage-model authoring, pipeline-side USDZ packager
├── mc/                  Java + Bedrock lowering, Java/Blockbench import
├── read/                digest, impact diff, ortho SVG, ASCII frame
└── viewer/              kit HTML + WebGL runtime + camera/gizmo math
packages/scene3d/scripts/blender/
├── runner.py            build / proof / export / bake_shaders / census
└── usd_oracle.py        OpenUSD pxr composition/binding check
packages/scene3d/scripts/kernel/
└── recipe_runner.py     runs a `recipe:` in plain CPython → operator trace
```

### Solver

Pure arithmetic over a part graph. Output is a `SolvedScene` of boxes.
`emitBlenderScript` then writes a byte-stable `.scene3d/spec.build.py`.
Generated geometry must lint clean by construction (TRIFAN caps, applied
transforms, authored materials). Provenance remaps repeat/scatter clones
to the base part's authored line.

### Kernel

The deterministic geometry engine behind `recipe:` parts (`src/kernel/`).
It is a **language-neutral operator IR with one evaluator**: a front-end
(the raw-path Python recorder today, a declarative shape later) produces a
serialized *trace* of exact operators — `cage`, `subdivide` (Catmull-Clark),
`mirror` — and the compiler alone evaluates it. Everything is exact
rational arithmetic on BigInt (no float, no trig), so a mesh is exact
through any number of subdivision levels and identical on every machine;
the one rounding is `toEmitMesh`, at emit, into `_kernel_part`'s
`from_pydata`. The weld is by exact coordinate (an integer permutation, no
tolerance), so `mirror` shares its seam and `predictCensus` can assert
watertightness. Because the kernel mints the geometry exactly, it PREDICTS
the built census (V/E/F/triangles/watertight/genus, with real orientation
and homology backing) and that prediction is adjudicated against Blender's
measurement (`S3D-E-702`) — the compiler checking its own author. The trace
hashes into the content cache like a build script's bytes. Blendshapes
(`delta`), creases, and skin weights are future opcodes in the same union,
not a new architecture. Lineage and the full design bet: `KILN.md`.

### Shaders

The author writes a kernel. The compiler injects typed uniforms (identifier
regex + std430 push-constant budget vs Vulkan's 128-byte floor), the
integer-hash stdlib, and the wrapper. Bake target is RGBA32F; RGBA8
clamps Inf/NaN and blinds `S3D-E-804`. Colour management is bypassed;
kernels output linear and the runner sRGB-encodes exactly via its own PNG
writer. GPU module is background-gated until one tiny EEVEE render warms
the backend. Height output additionally derives a wrap-aware tangent-space
normal map.

Structural checks run on comment-stripped text (`un/**/iform` is closed).
Reserved uniforms: `uS3dOutput`, `uS3dTime`. Flipbook shaders are sheet
products; materials may not bind them.

### USD master

`export_scene` authors `scene.usda` first with the writer's full payload
(`master_usd_kwargs`: animation gated on bound actions, armatures,
shapekeys, MaterialX, textures materialised; `usd_export_resilient` drops
unknown kwargs one at a time). Then it re-imports and lowers GLB/OBJ/FBX
from the reimported scene. The USD importer applies timeSamples but
builds no fcurves; `rebuild_object_animation` bakes movers back so
lowered GLBs keep clips. USDZ is packaged pipeline-side (`src/usd/usdz.ts`,
stored entries, 64-byte aligned) after authoring, not by the runner.

Parity fingerprint (`scene_fingerprint`) compares meshes, materials,
armatures, and **bound** actions. Orphan clips are not content. Order
drift of joints/shapekeys is `S3D-W-902`. A material that survives as a
shell (glass that stopped refracting) is `S3D-W-903`; counting materials
cannot see it.

### Minecraft lowering

Pipeline-side, like USDZ: cuboid recovery is pure math over the census
oriented box, not a Blender exporter. Java emits `out/minecraft/model.json`.
Bedrock emits `geometry.json` plus a packed atlas. Import of a dropped-in
`model.json` / `.bbmodel` converts to a spec, writes
`.scene3d/imported.scene.json`, and runs the normal path.

### Lint orchestra

`runLint` in `src/lint/rules.ts` calls naming, topology, PBR, UV, units,
integrity, world, voxel, sheets, claims, proof, intent, and the exported
stage. Then `applyImportedPosture` runs as a last pass over the finished
set. Dedupe is by `code|target|message`.

Caps live in the caller, which has somebody to tell. A cap applied inside
a search that then returns "no overlaps" is how coincident 590-triangle
meshes shipped a textbook z-fight with an empty pairs list.

### Read model

`src/read/` answers "what is it, and what did my edit just do" without a
viewport: digest (issues first, then density/symmetry stats), impact diff
(contacts that broke), ortho SVG elevations, ASCII proof frames when a
proof-looking code fires.

---

## Artifacts on disk

One scene is one directory. A project may hold several.

```
scenes/<name>/
├── scene.json              # authored spec (or build.py / mesh / usda)
├── scene3d.json            # conventions contract
├── tweaks.json             # viewer edits, replayed on the next compile
├── .scene3d/               # hidden: stage cache, emitted spec.build.py
│   └── imported.scene.json # migration artifact from an mc_model import
└── out/                    # visible product
    ├── index.html          # proof-frame player (renderer: scene3d)
    ├── kit.html            # live WebGL viewport (renderer: html)
    ├── manifest.json
    ├── digest.md
    ├── ortho.svg
    ├── read-model.json
    ├── proof/proof-*.png
    ├── scene.usda / .usdz / .glb / .obj / .fbx / …
    └── minecraft/          # when target is minecraft
```

Deliverables live in `out/`, not under `.scene3d/`. The host file listing
hides dot-directories; putting the product there made a clean compile look
like nothing had been built. The cache stays hidden because it is
internal.

`scenes/*/out/` is hidden from the files-list API, but
`GET /api/projects/:id/files/<path>` still serves those bytes. Export URLs
work; the file rail does not show generated dirs. Opening `out/index.html`
via the files route therefore does not deep-link: the route falls back to
the project browser. Deep links that work:

- `/projects/:id/files/scenes/<s>/scene.json` → native `Scene3dPanel`
- `/projects/:id/files/kit.html` → kit viewer (the catalog lives at the
  project root, not under `out/`)

Sidecar `metadata` is capped at 16 KB by the daemon validator. The kit
sidecar truncates at `MAX_KIT_SCENES` (48) / `MAX_KIT_DELIVERABLES` (192)
and flags `scenesTruncated` / `deliverablesTruncated`. Keep truncation
loud. The tree payload carries the whole inventory (`MAX_TREE_PARTS` is a
4000-part backstop, not a display cap). Do not reintroduce a "+N more
parts" row.

---

## Host surfaces

Adding a scene3d capability is the repository three-step closure: HTTP
route + contract type + UI + `od` subcommand, landed together.

### HTTP

| Method | Path | Role |
|---|---|---|
| `POST` | `/api/projects/:id/scene3d/compile` | Run the pipeline. `200` + `ok: false` on lint failure. `409` if that scene is already compiling. Write capability required. |
| `GET` | `/api/projects/:id/scene3d/manifest` | Last compile, no Blender. Hydrates the panel on open. |
| `GET`/`POST` | `/api/projects/:id/scene3d/tweaks` | Persist/read viewer edits. Daemon merge **replaces** a material object wholesale (empty object = clear). Name gates are structural, not ASCII. |

### CLI

```
od scene3d compile  --project <id> --scene <path> [--fast] [--json] [--agent-message]
                    [--stages parse,build,lint] [--no-cache] [--no-turntable]
                    [--fail-on error|warning|none]
od scene3d manifest --project <id> --scene <path> [--json]
od scene3d tweaks   --project <id> --scene <path> [--json]
                    [--set '<json>'] [--set-file <path|->] [--merge]
```

`--json` is the machine envelope. Long-form prompts go through
`--prompt-file` on other `od` commands; scene3d's `--set-file -` is the
equivalent for piping a tweaks map.

### Web

- Opening `scene.json` (never `scene3d.json`) or `build.py` or a mesh
  source resolves the scene directory via `scene3dScenePathForFile` and
  mounts `Scene3dPanel`.
- Kit pages draw through `HtmlViewer`. Toolbar changes there are a named
  predicate `&&`-gated next to `isDeckArtifact` / `isMarkdownArtifact`.
  Do not restructure `HtmlViewer`, `runtime/srcdoc.ts`, or the workspace
  shell to land a scene3d control.
- `isEditorStateSidecarPath` in ProjectView keeps `tweaks.json` and
  `.scene3d/` scratch writes from evicting the keep-alive iframe pool.
- Retained workspace tabs keep old iframes mounted. After a recompile,
  close and reopen the file tab; a stale tab is not a bug report.

---

## Viewer and kit

The kit page (`src/viewer/kit.ts` + `kit-runtime.ts`) is generated HTML
with a live WebGL viewport. It is a compile-time artifact. Backticks
inside `kit.ts` comments break the `String.raw` template.

### Tree

The rail tree is a **prototype view, not an instance list**. Sibling
subtrees with equal structural signatures (`protoStem` + census type,
recursively) render as one row: stem + `×N` count pill. Clicking selects
every descendant of every instance. Stems strip trailing
ordinal/positional/axis tokens (`_01`, `.002`, `_left`, `_fl`) at most
twice, min 4 characters. The algorithm lives in
`packages/contracts/src/api/scene3d-tree.ts` so the native panel and the
kit page cannot drift.

Tree rows carry census-earned facts (degrade-to-plain if absent):
dimensions, triangle count, materials, nature glyphs (`a` animated, `w`
watertight, `x` textured), source line, float gap, bones, texel density.
The ident meta wears `· ✓N` only when `manifest.claims.declared > 0 &&
failed === 0`. Failure shows nothing; the badge cannot be cheapened.

Inline-SVG nature glyphs: the page pins a no-font-glyphs rule. Characters like
`▸` fail a test.

### Materials

The material channel rides the same edit record / history / save funnel as
transforms, but it is **absolute** state. `matEq` is the equality
predicate. Values put back to census facts are deleted, not stored.
Picking any material ball replaces the whole channel ("wear this, as
authored"). Panel gestures apply to the whole selection.

Runner overrides: a shared material becomes a per-part instance
`<mat>__<part>`; a sole user mutates in place. A scalar override on a
mapped channel unlinks that map. Colour on a textured surface is a
multiply tint (the importer's Mix-MULTIPLY topology, so export
round-trips it).

GL: unbind the ball FBO's colour texture from the sampler before drawing
(feedback loop = silently blank ball). glTF omitted metallic/roughness
factors default to 1. Emissive factor is suppressed when an emissive
texture drives it.

### Tweaks bridge

Srcdoc is an opaque origin. The page posts `od:scene3d-tweaks`
(`load` | `save` | `compile`) to the parent; `FileViewer` makes the real
API call and posts `od:scene3d-tweaks-result` back. Bridge op `compile`
uses a 600 s timeout, because the 5 s file-op default would declare a
mid-bake host dead.

Selection broadcasts as both `postMessage` and a DOM `CustomEvent` named
`od:scene3d-select`, carrying the whole part inventory, not only the
selection.

### What the kit page must not grow

- In-page download buttons (`dlBtn`). The host Export menu owns that.
  `tests/kit-viewer.test.ts` pins the absence.
- Host-level zoom or viewport presets. The page camera is the zoom.
- Direct `/api` fetches. They will be rejected. Go through the bridge.

A visual harness at `scripts/harness/` renders real `renderKitHtml`
output across states and screenshots it, so viewer changes can be judged
in seconds without compiling a scene through the app.

---

## Diagnostics

The reader of a compile is often an agent with no viewport. Every issue
carries: the stable code, the measurement that proves it, where
(provenance to the authored `scene.json` line), and the nearest actionable
fact (floats name the nearest support and the gap; z-fights carry axis,
position, and overlap patch). Caps are loud.

`renderAgentReport` emits a byte-stable `<scene3d-report>` (no timestamps,
no absolute paths, no per-run durations) so an unchanged recompile is
distinguishable from an edit. It leads with verdict, lists codes, and
renders `detail` as `data:` lines. Put numbers in `detail`, not only in
prose.

`verdict.ts` synthesises issues into a grade (`pass` / `attention` /
`fail`) and a ranked action list. Fail means an error exists. Nothing
here has a weight to argue about.

---

## Testing

Tests live in `packages/scene3d/tests/`, sibling to `src/`. Do not add
`*.test.ts` under `src/`.

The suite splits into vitest projects (`vitest.config.ts`): `unit` and
`unit-serial` are pure TypeScript, run in seconds, and are what CI runs
(`test:unit`); `blender` holds the real-Blender integration files, one at
a time. Fast local loop:

```bash
pnpm --filter @open-design/scene3d test:unit
```

Everything Blender-bound rides `BLENDER_FILES` in `vitest.config.ts`, and
`tests/vitest-blender-files.test.ts` keeps that list honest in both
directions: a Blender-gated file missing from the list fails, and a listed
file carrying an ungated describe fails too (that would be pure-TS
coverage silently dropped from CI). On an environment that is SUPPOSED to
carry the runtimes, set `SCENE3D_REQUIRE_BLENDER=1` (and
`SCENE3D_REQUIRE_PXR=1`) so a missing install fails loudly instead of
green-skipping — the escape hatches are exported from the package
(`src/testing.ts`) so host-side suites arm them too.

### Fixture contract

Every lint rule is pinned by a fixture: a good scene that passes it and a
poisoned scene that fails it with the exact code. Adding a rule without
both is how a gate silently stops gating.

| Fixture | What it pins |
|---|---|
| `good/spec_pavilion` | Every primitive shape, repeat grid, emission, full claims; must compile with zero issues |
| `good/spec_rock_garden` | Scatter determinism |
| `good/spec_shaded` | GPU bake, byte-deterministic across compiles |
| `good/spec_flame` | Flipbook shader as a sheet product |
| `good/spec_script_part` | `script:` part fitted into its box |
| `good/prop_crate`, `good/textured_prop` | raw Python authoring path |
| `minecraft/golem` | Voxel path, Java lowering, import round-trip |
| `poisoned/spec-claims` | `S3D-E-701` |
| `poisoned/spec-shader-bad` / `spec-shader-nan` | `S3D-E-801` / `E-804` |
| `poisoned/*` | Naming, topology, PBR, UV, blind camera |
| `real/` | Licensed Khronos assets: DamagedHelmet, Fox, CesiumMan |
| `print/thin_shell` | DfM walls |
| `sheets/real/` | Beam, particle, sky cube |

`tests/atelier-pipeline.test.ts` is the capstone: marble (height→normal) +
lava (emission, spin) + water (alpha, bob) + real helmet + gold-overridden
Fox in one compile. Keep it green.

Generated fixtures test what the author imagined. The real corpus tests
what is true. Calibration posture: nobody is going to "fix" Sponza, so
every error against a well-known third-party asset is a false positive by
definition, and every warning has to earn itself. Run the whole pipeline
when calibrating, not only the interesting stage.

Fuzz: validator shape-fuzz, uniform-name injection, GPU hostile-uniform
riding `E-804`, RNG known-answer + insertion-stability.

Host-side tests:

- `apps/daemon/tests/scene3d-routes.test.ts` — HTTP contract, 200-on-fail,
  path traversal, tweaks merge
- `apps/daemon/tests/scene3d-issue-titles.test.ts` — code set ↔ title catalog
- `apps/daemon/tests/scene3d-xray-modes.test.ts` — x-ray mode catalogue parity
- `apps/web/tests/scene3d-*.test.ts` — presentation, selection, tree render,
  archive grouping
- `packages/contracts/tests/scene3d-tree.test.ts` — stem clustering, paths

---

## How to change the system

Work from the ownership table. Most mistakes are a change in the wrong
layer.

### Add an issue code

1. Add it to `ISSUE_CODES` in `src/errors.ts` in the family range, with a
   comment that states the invariant.
2. Add the human title to `SCENE3D_ISSUE_TITLES` in
   `packages/contracts/src/api/scene3d-codes.ts` in the same change.
3. Emit it from the lint module (or parse/build) with `detail` carrying
   the measured facts.
4. Pin a good fixture and a poisoned fixture.
5. If the generating agent needs a remedy line, add it to
   `design-templates/scene3d/SKILL.md`.

### Add a lint rule

1. Measure in the runner (`census()` or a `*_facts` helper) unless the
   fact already exists. Do not invent a threshold in the rule.
2. Judge in `src/lint/<family>.ts` against `NormalizedContract`.
3. Wire the module in `runLint` if it is new.
4. Place any new flag in measure / judge / emit. Prefer a value the author
   already writes over a mode.
5. If the search is bounded, the caller owns the cap and the rule emits
   an `*_UNCHECKED` code when it hits.
6. Fixtures as above. Do not early-`return` on imported geometry; let
   provenance reclassify.

### Grow the language

1. Types in `src/solve/types.ts`.
2. Schema in `src/solve/validate.ts` (JSON paths, `S3D-E-105`).
3. Solver / emitter as needed. Keep solving pure.
4. Claims in `lint/claims.ts` if the new fact is assertable.
5. A showcase in `good/` and a red path in `poisoned/`.
6. Update the skill. The generating agent cannot use a feature the skill
   does not teach.

### Add a host surface

HTTP in `apps/daemon/src/routes/scene3d.ts`, DTO in
`packages/contracts/src/api/scene3d.ts`, UI in `apps/web`, CLI flag in
`apps/daemon/src/cli.ts` registered through `SUBCOMMAND_MAP`. Land all
four. `--json` on the CLI form.

If the artifact kind or renderer enum changes, update the four allowlists
listed under [Ownership](#ownership). If a user-visible string is new, add
the i18n key to `types.ts` and all 19 locales.

### Touch the kit page

Exact-match edits. The generated HTML is a `String.raw` template; a
backtick in a comment breaks it. After compiler/viewer/sidecar edits,
recompile a real scene before judging the UI; sidecars on disk do not
hot-reload from source.

CSS traps already paid for:

- The `font:` shorthand cannot take `inherit` as family; the whole
  declaration drops and a generic `button` rule clips descenders. Longhands
  only.
- In CSS Modules, a `@container` override loses a same-specificity tie
  against a base rule written later. Narrow-mode overrides for
  `Scene3dPanel.module.css` live in one `@container` block at the end of
  the file.

### Touch the runner

`scripts/blender/runner.py` is dependency-free beyond Blender's own
Python. Lists sorted by name, floats rounded to 6 dp, no wall-clock in
payloads. World-space analysis happens after `view_layer.update()`.
Importer bugs the compiler absorbs are shimmed narrowly and commented
(Blender 5.0's FBX importer crashes on lights; `shim_fbx_importer_bugs`
reaches the class via instance, not `bpy.types`).

---

## Load-bearing invariants

Every entry below earned its place the hard way. None of them looked
important the first time it broke.

- **`compile()` resolves `projectDir` at entry.** Relative paths
  double-resolve against the runner's chdir.
- **`resolveScriptsDir` probes layouts.** Do not hard-code a depth.
- **Cache the consumer data.** Proof frame stats, not only PNG paths.
- **Companion files are cache inputs.** A `.gltf` is not the whole model.
- **Census `view_layer.update()` first.** Otherwise every world-space fact
  is stale.
- **Zero-area and doubles are metric** (thresholds in m / m²), measured
  after the world transform. Topological counts stay local.
- **UV occupancy is rasterised per face, never per fan triangle.** The
  quad diagonal runs through cell centres and reports self-overlap.
- **Imported glTF UVs live at V ∈ [−1, 0].** Tile-relative facts are
  tile-normalised in `uv_facts`.
- **Bake RGBA32F, write PNG bytes yourself.** Blender colour management is
  not in the loop. The 8-bit default blinds the non-finite oracle.
- **Stdlib is PCG2D over `floatBitsToUint`.** Never `fract(sin)`.
- **glTF metallic/roughness omitted = 1**, per spec. Mapping absent to 0
  rendered exported gold as plastic.
- **Kit fragment shader passes `uColor.a` through.** A hardcoded `1.0`
  made x-ray ghosts opaque.
- **`isScene3dArtifact` sits above zoom state** in `HtmlViewer`. Moving it
  below reintroduces a TDZ / stale-cache bug.
- **`Scene3dRenderer` matches `renderer`, registered first.**
- **Material merge replaces the object.** Per-key merge makes "I put the
  roughness back" unsayable.
- **`claims.grounded` is one-sided** (nothing sinks). Floating is not a
  failed claim.
- **Oriented box is the voxel authority**, not the world AABB of a rotated
  part.
- **Boxness is measured on positions, not topology.** A triangulated
  MagicaVoxel export is still a cuboid.
- **Oracles that cannot run emit `*_UNCHECKED`**, additive, never fatal.

---

## Product boundary

scene3d is a technical-art compiler: it turns authored code, declarative
intent, and source assets into generated, measured, validated, exportable
things. The goal is not only to make geometry, but to make geometry that can
be trusted in the scene, in the target engine, and in the final delivery
format.

scene3d is not primarily a reconstruction model or a text/image-to-3D
product. It may integrate those systems when useful, but reconstruction is
not the durable differentiator. The durable layer is the compiler's ability
to preserve intent, expose measurable truth, and report what survives each
stage of production.

The product should not compete on generic commodity features such as
text/image-to-3D reconstruction, generic remeshing, one-click auto-rigging,
or high-resolution texture generation. Those may be replaceable inputs or
stages when a project needs them. They are not forbidden capabilities, and
they do not define the boundary of what the compiler may eventually express.

In particular, deterministic, author-directed systems for procedural
construction, relations, sequenced keyframes, skeletal animation, skinning,
facial shapes, creatures, avatars, and other domain-specific behavior are
within the long-term scope when the language and export contracts can
represent them honestly.

The current JSON language is only one evolving way to express that intent.
The freeform Python path is a first-class authoring mode today. Over time,
more of its useful expressive power may move into declarative forms without
changing the compiler's core responsibility: turn intent into a working
asset, then measure and explain the result.

The host and pipeline still have concrete invariants: one compile entry
point, shared URL construction, derived asset kinds, host-owned downloads,
and no silent validation gaps. Those are implementation contracts, not
limits on the creative domain.

`KILN.md` records design lineage and possible future directions.
`RESEARCH.md` records a dated strategy snapshot. Neither document is a
permanent feature promise or a substitute for current maintainer judgment.

---

## Commands

```bash
# package
pnpm --filter @open-design/scene3d typecheck
pnpm --filter @open-design/scene3d test
pnpm --filter @open-design/scene3d build

# host surfaces that talk to it
pnpm --filter @open-design/contracts build
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/web test

# repo gates, before calling work done
pnpm guard
pnpm typecheck
```

Local lifecycle is `pnpm tools-dev` only. After compiler or sidecar edits:

```bash
pnpm --filter @open-design/contracts build
pnpm --filter @open-design/scene3d build
pnpm --filter @open-design/daemon build
pnpm tools-dev stop
pnpm tools-dev
pnpm tools-dev status --json          # ports change every restart
```

Then recompile a scene through the API (`noCache: true`) and verify the
artifacts on disk: `kit.html` has no `dlBtn`; `kit.html.artifact.json`
has `kind: scene3d`, `renderer: html`, and non-empty
`metadata.deliverables`; `out/index.html.artifact.json` has
`renderer: scene3d`.

Viewer-only iteration, no Blender:

```bash
pnpm --filter @open-design/scene3d build
node packages/scene3d/scripts/harness/build-fixtures.mjs
node packages/scene3d/scripts/harness/shoot.mjs
```

Blender 5.x is required for the full suite. The pip `bpy` module is an
accepted substitute for `blender --background` when `probeBlender` finds
it.
