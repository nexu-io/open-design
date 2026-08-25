@AGENTS.md

# Fork focus: scene3d — the compiled-asset mode

The maintainer map is `packages/scene3d/README.md` (host seam, issue
catalog, how to change the system). This file is the fork working-rules
overlay: load-bearing contracts, known gotchas, and the verify loop.
Prefer the README when the two overlap.

This fork's active work is `scene3d`: one deterministic pipeline (headless
Blender) behind ONE compile call that produces game assets, props, scenes,
kits, animations, textures, sprite sheets, flipbooks, VFX sheets, and
skyboxes — with stable `S3D-*` issue codes. Everything below is settled
architecture. Do not re-derive it, do not re-litigate it, do not "explore"
it again; read this, then act.

## Component map (all of these exist — do not recreate)

| Piece | Path |
|---|---|
| Compiler (parse→build→proof→export→lint→manifest) | `packages/scene3d/` |
| Declarative scene language (`scene.json`: shapes/relations/repeat/materials/claims) | `packages/scene3d/src/solve/` (`types.ts` language, `validate.ts` schema, `solver.ts` fixpoint+repeat, `emit-bpy.ts` backend) + `src/lint/claims.ts` |
| Wire contract + `buildScene3dAssetUrl` | `packages/contracts/src/api/scene3d.ts` |
| Daemon routes (`POST …/scene3d/compile`, `GET …/scene3d/manifest`) | `apps/daemon/src/routes/scene3d.ts` |
| CLI (`od scene3d compile|manifest`) | `apps/daemon/src/cli.ts` (`SUBCOMMAND_MAP`) |
| Native compile panel (frame player, parts, issues, Export) | `apps/web/src/components/Scene3dPanel.tsx` |
| Compile hook + scene-path heuristic | `apps/web/src/hooks/useScene3dCompile.ts` |
| Presentation rules (deliverable grouping, assetKind labels, kit hydration) | `apps/web/src/runtime/scene3d-assets.ts` |
| Interactive kit page + orbit/edit runtime (generated HTML) | `packages/scene3d/src/viewer/kit.ts`, `kit-runtime.ts` |
| Sidecar writers | `packages/scene3d/src/manifest.ts` (`writeArtifactSidecar`, `writeKitSidecar`, `writeViewer`, `writeProjectKit`) |
| Home chip / plugin / template | `home-hero/chips.ts` (`example-scene3d`), `plugins/_official/examples/scene3d/`, `design-templates/scene3d/` |

## Load-bearing contracts (violating these is a regression)

- **`scene.json` is the primary authoring surface; `build.py`/USDA/blend are
  escape hatches.** The declarative path (Kiln's design; lineage and the
  full bet map live in `packages/scene3d/KILN.md`) is: validate BEFORE
  execution (S3D-E-105 with JSON paths, never a
  traceback) → solve relations to a fixpoint (E-106/W-106) → emit a
  deterministic script to `.scene3d/spec.build.py` → the normal six stages →
  **adjudicate the spec's `claims` against the census** (E-701 fail /
  W-701 unchecked-never-passed; `lint/claims.ts`). The author is never the
  authority on whether the build succeeded. Rules the language keeps:
  every shape fills its AABB exactly (solver reasons in boxes, shape is a
  rendering fact); contact offsets and repeat pitches are floored 1mm from
  flush so z-fighting is structurally impossible; generated output must lint
  clean by construction (TRIFAN caps, applied transforms, authored
  materials); provenance remaps to the scene.json line the author wrote
  (repeat clones → their base part's line); `scene.json`+`build.py` together
  = S3D-E-102, never a silent winner. Showcase fixture:
  `tests/fixtures/good/spec_pavilion` (every shape, repeat grid, emission,
  full claims — must compile with zero issues); claims red-path:
  `poisoned/spec-claims`. Web: `scene.json` (never `scene3d.json`) opens the
  panel via `scene3dScenePathForFile`.
- **Shaders are raw GPU kernels compiled by the pipeline.** `src/shade/`
  (types/validate/emit/stdlib) + runner `bake_shaders`. The author writes
  `vec4 kernel(vec2 uv)` in a `.glsl` file; scene.json declares it
  (`shaders` block) and materials reference it (`shader:`). The compiler
  owns uniforms (identifier-regex-gated → GLSL injection structurally
  impossible; byte-budgeted vs the 128-byte Vulkan push-constant floor),
  the integer-hash noise stdlib (PCG2D over floatBitsToUint — NEVER
  fract(sin), which is driver-dependent), and both wrappers (Blender
  GPUShaderCreateInfo for the bake; WebGL2 300 es assembled+tested now for
  the future editor panel). Execution facts that cost real debugging:
  the gpu module is background-gated until ONE tiny EEVEE render warms the
  backend (`gpu_warmup` on the empty scene); the bake target must be
  RGBA32F — the RGBA8 default clamps Inf/NaN to bytes and blinds the
  non-finite oracle (E-804); color management is bypassed entirely
  (kernels output linear, runner sRGB-encodes exactly and writes PNG bytes
  itself via `write_png`). Codes: E-801 structure, E-802 driver log,
  E-803 execution, E-804 non-finite, W-801 unused. Showcase:
  `good/spec_shaded` (fbm rust, baseColor+roughness, byte-deterministic
  across compiles); red paths: `poisoned/spec-shader-bad`/`spec-shader-nan`;
  GPU fuzz rides the E-804 oracle. User prior art to consult for the
  future editor UI: `~/Documents/Projects/universal-stylized-shader`.
  Outputs vocabulary: baseColor/emission (sRGB-encoded), roughness/
  metallic (Non-Color), height (Non-Color + compiler-DERIVED wrap-aware
  normal map via numpy central differences, `normalStrength` knob, wired
  through a Normal Map node). `material` on a `file` part = deliberate
  wholesale override of the imported asset's materials. Declarative
  animation: part `spin`/`bob` → compiler-owned keyframes (24fps, cycles
  modifiers, `_loop_fcurves` handles both action APIs) → assetKind
  `animation`. Census reports `armatures` (bones) + `animation.actionNames`
  (real clips — the Fox pins Run/Walk/Survey). glTF imports can ship
  non-view-layer scaffolding meshes (bone-shape icospheres): `_import_part`
  sweeps un-joined imported meshes by name after the join. Capstone
  fixture: `tests/atelier-pipeline.test.ts` builds marble(height→normal) +
  lava(emission,spin) + water(alpha,bob) + real helmet + gold-overridden
  Fox in one compile — keep it green.
  **Time is a kernel dimension**: `frames: 2..64` bakes per-cell
  (`uS3dTime` system uniform) into a POT atlas with a structural 2px
  anti-bleed inset; the atlas REGISTERS AS A SHEET so the existing 2D
  rules adjudicate GPU output (static kernel → W-601 emergent). Flipbook
  shaders are sheet products — materials may not bind them; they're
  self-justifying (no W-801). Reserved uniforms uS3dOutput/uS3dTime;
  kernel structural checks run on COMMENT-STRIPPED text (`un/**/iform`
  bypass closed); push-constant budget uses std430 running-offset
  alignment; drivers strip provably-inert uniforms — uploads tolerate it.
  Ids/material names charset-gated + py() escapes control chars (Python
  injection closed). repeat×scatter same part statically rejected; span
  double-claim + collapsed-extent floored loudly; coincident repeat
  clones refused. Import hardening: per-file try/except → E-202 with the
  importer's reason; missing .mtl / empty imports → census importNotes →
  W-207 (detect-and-name, never mutate); Blender 5.0's FBX importer
  crashes on lights (`cycles.cast_shadow` removed) — `shim_fbx_importer_bugs`
  absorbs it (class reached via instance, NOT bpy.types); FBX export
  embeds textures (path_mode COPY). Diagnostics: report renders
  detail.origin lines; NOT_GROUNDED names the nearest support below via
  census contacts; Z_FIGHTING carries axis/position/patch extent; digest
  puts issues before stats. Full breakdown: `packages/scene3d/ARCHITECTURE.md`.
  Corpus grew: CesiumMan (humanoid rig round-trips with skin+clips
  pinned), BrainStem; `tests/formats.test.ts` is the format-breadth suite.
  **USD is the MASTER format** (Kiln Bet 1, enforced structurally):
  `export_scene` authors scene.usda FIRST with the writer's full payload
  (`master_usd_kwargs`: export_animation gated on bound actions,
  armatures/shapekeys/hair, MaterialX network, textures materialised;
  `usd_export_resilient` drops unknown kwargs one at a time), then
  RE-IMPORTS it and lowers GLB/OBJ/FBX from the reimported scene.
  Parity = measured claim: `scene_fingerprint` (meshes/materials/
  armatures/BOUND actions only — orphan clips are not content) compared
  build-vs-master → E-901 loss / W-901 unchecked. Facts probed, not
  assumed: the USD importer applies timeSamples but builds NO fcurves →
  `rebuild_object_animation` bakes movers back to keyframes so lowered
  GLBs keep clips; skel round-trips (SkelRoot+Skeleton+skins+clips —
  CesiumMan pinned); glTF bone custom-shape scaffolding meshes are swept
  at import (they never reach USD and read as false losses). USDZ is
  packaged PIPELINE-side (`src/usd/usdz.ts`, stored + 64-byte aligned,
  refs collected from @...@) AFTER authorStageModel — a runner-side
  package predates the kind/assetInfo authoring. usda-SOURCE scenes lint
  their own source as the shipped stage (S3D-4xx used to never run for
  them). Parser now survives timeSamples/`:`/`;`/triple-quoted strings;
  stage-model scans are string-aware (paren in a doc string used to
  silently drop kind authoring). Gizmo: ring drag multiplies by the
  projected-basis winding sign captured at press (direction used to
  invert when orbited behind the ring plane); ctrl-scale snaps THEN
  floors at one grid step; endDrag rebuilds the neighbourhood map;
  ResizeObserver on the canvas. Red-team backlog (reported, not yet
  built): oriented-box picking for rotated parts, x-ray-aware picking,
  assembly-vs-group kind semantics, CRLF-preserving stage splices.
  **Kit page detail layer** (census-earned, degrade-to-plain): tree rows
  carry compact facts via `entryTree(manifest, readPartFacts(outDir))` in
  manifest.ts — d dims / r tris / m materials / y glyphs (a animated,
  w watertight, x textured) / o scene.json line / g float-gap / b bones /
  x texel density, plus entry-level matColors (linear→sRGB hex) and
  clips. Rendered as: inline-SVG nature glyphs (the page PINS no-font-
  glyphs — ▸ etc. fail a test), bone-count type badges, ±float whispers,
  and a `.tfacts` row on the selection card (tris · bones+clips · px/m ·
  material swatches · click-to-copy `scene.json:N`). Ident meta wears
  `· ✓N` ONLY when manifest.claims declared>0 && failed==0 (failure shows
  nothing — the badge can't be cheapened). manifest.claims computed from
  claimsDeclared + distinct E-701 details. Facts flow through kit.html
  page payload (no 16KB sidecar pressure). Remember: backticks inside
  kit.ts comments break the String.raw template.
  **The rail tree is a prototype view, not an instance list.** Sibling
  subtrees with equal structural signatures (protoStem + census type,
  recursively — `sigOf` in kit.ts buildTree) render as ONE row: stem +
  `×N` count pill; the first instance's anatomy renders once beneath it;
  clicking selects every descendant of every instance (roots are often
  undrawable empties). Stems strip trailing ordinal/positional/axis
  tokens (`_01`, `.002`, `_left`, `_fl`, `_zn` — TREE_STEM_SUFFIX), at
  most twice, min 4 chars. The tree payload carries the WHOLE inventory
  (MAX_TREE_PARTS is a 4000 backstop, not a display cap) and the dead
  "+N more parts" row is gone — do not reintroduce either. Selection
  card lines wrap, never ellipsize (`.terr`/`.tfacts`); nowrap remains
  ONLY on the drag-live dimension line, per the comments at those rules.
  The card's placement solver also samples the gizmo's published
  footprint (`gizmoFootprint`) so it never parks on the handles.
  **Material panel/gallery (do not re-derive; full map in
  `packages/scene3d/ARCHITECTURE.md` "material layer" sections)**. The
  rules that keep biting: the material channel rides the SAME edit
  record/history/save funnel as transforms but is ABSOLUTE state -
  `matEq` is the one equality predicate, values put back to census facts
  are deleted not stored, daemon merge REPLACES the material object
  wholesale (empty object = clear); picking any material ball REPLACES
  the whole channel ("wear this, as authored") and the ring marks only an
  exact wear; panel gestures apply to the WHOLE selection. Runner
  overrides: shared material -> per-part instance `<mat>__<part>`, sole
  user in place; scalar override on a mapped channel unlinks/gates that
  map, colour on a textured surface is a multiply TINT (importer's own
  Mix-MULTIPLY topology, so export round-trips it). GL runtime: unbind
  the ball FBO's colour texture from the sampler before drawing
  (feedback loop = silently blank ball); glTF omitted metallic/roughness
  factors default to 1 per spec; emissive factor is suppressed when an
  emissive TEXTURE drives it unless the map is bound. Bridge op
  `compile` uses a 600s timeout (5s file-op timeout would declare a
  mid-bake host dead). Daemon tweak name gates are structural, not
  ASCII (unicode names legal; control chars/separators/>100 chars not).
  Web `isEditorStateSidecarPath` (ProjectView) keeps tweaks.json and
  `.scene3d/` scratch writes from evicting the keep-alive iframe pool.
  Pins: `pipeline.test.ts` "replays material tweaks" / "tints a textured
  material"; page pins in `kit-viewer.test.ts`.
- **Real assets are first-class sources.** A scene dir of bare
  `.glb/.gltf/.obj/.fbx` compiles as kind `mesh` (native import, derived
  cam/sun via `ensure_staging`); a spec part with `file:` imports a real
  asset joined+fitted INSIDE its declared box (bottom-rest, uniform scale).
  Pinned corpus: `tests/fixtures/real/` (Khronos DamagedHelmet + Fox, see
  LICENSES.md; `tests/real-assets.test.ts`). Third-party scenes use the
  INSPECTION contract posture: `naming.objectPattern "^.+$"`,
  `forbidDefaultNames false`, `geometry.allowOpenMeshes true` (real game
  meshes are open — Fox is 100% boundary edges), `pbr.metallicValues []`
  (= unconstrained; real kits ship fractional metallic),
  `uv.allowFlipped true` + `maxOverlapFraction 1` (mirrored-shared UV
  layouts are a legitimate technique — DamagedHelmet measures ~100%
  overlap BY DESIGN). Lessons real assets taught (do not re-learn):
  imported glTF UVs live at V∈[-1,0] (importer maps v→-v), so ALL
  tile-relative UV facts are tile-NORMALIZED in `uv_facts` (global mean
  shift + per-face tile); Blender 5 layered actions have no
  `Action.fcurves` (`action_has_curves` handles both APIs); bmesh index
  access needs `ensure_lookup_table`; proofs default to a neutral ambient
  world + `film_transparent` (metals reflect the environment — black
  world = black metal) with the staging sun keyed from the camera's
  quarter. Deep analytics ride the census per mesh: `surfaceArea`,
  `triDensity` (allocation spread), `symmetry` (bilateral mirror error,
  kd-tree sampled) — surfaced as one-line stats in the digest.
  `compile()` resolves projectDir at entry (relative paths double-resolved
  against the runner's chdir). Kiln adoption map: `packages/scene3d/KILN.md`;
  market research distillation: `packages/scene3d/RESEARCH.md`.

- **kind vs renderer.** Every compiled artifact's sidecar has
  `kind: "scene3d"` (what it IS — gates chrome, labels, export).
  `renderer` says how it draws: `"scene3d"` → native `Scene3dPanel`
  (used by `out/index.html`, the frame player); `"html"` → `HtmlViewer`
  with the scene3d-gated toolbar (used by `kit.html` pages, which are live
  WebGL viewports). `Scene3dRenderer` in `renderer-registry.ts` matches on
  `renderer` only and is registered FIRST (kit pages are HTML; without the
  ordering they'd fall into the plain prototype viewer).
- **assetKind is DERIVED, never authored.** `deriveAssetKind()` in
  `packages/scene3d/src/manifest.ts` reads the census + declared sheets:
  keyframes→`animation`, single unstaged root→`prop`, sheets with no
  geometry→`skybox|vfx|flipbook|sprite`, textures only→`texture`,
  else `scene`. Web-side fallback: `resolveAssetKind()`. Never add a
  config field for it.
- **The host Export menu owns downloads.** The generated kit page has NO
  in-page download control (removed deliberately; test pins its absence in
  `packages/scene3d/tests/kit-viewer.test.ts`). Deliverable paths ride on
  sidecar `metadata.deliverables` (project-relative); `HtmlViewer` groups
  them (glTF/GLB, OpenUSD, OBJ, images; `.mtl`/`.bin` companions hidden)
  via `groupDeliverables()`. Do not reintroduce a page-side download UI.
- **Host never scales a 3D viewport.** In `HtmlViewer`,
  `isScene3dArtifact` (read from artifact KIND) is declared ABOVE the
  zoom/viewport state on purpose: zoom is forced to 100, viewport to
  `desktop`, cached prefs ignored, and the viewport-preset + zoom controls
  are hidden. The page's own camera is the only zoom. Keep the predicate
  above the state — moving it below reintroduces the TDZ/stale-cache bug.
- **One URL builder.** `buildScene3dAssetUrl(projectId, path)` in
  contracts. Daemon `artifactRef()` and web `deliverableRefs()` both use
  it. Never hand-roll `/api/projects/:id/files/...` encoding.
- **One compile call.** No per-check tools/endpoints beside it (root
  AGENTS.md pins this). The compile response's `agentMessage` is the
  `<scene3d-report>` block for agent self-correction.
- **Measure in Blender, judge in the contract.** Lint rules never invent
  thresholds: `runner.py` measures (census), `scene3d.json` conventions
  decide (`normalizeContract` holds every default), lint modules map the
  comparison onto stable codes. The UV block (S3D-*-44x), texture-file
  rules (346-349), and engine-hygiene rules (327-330) all follow this;
  UV *quality* verdicts scope like `conventions.uv.require` (textured
  meshes by default) because a mirrored island on a flat-colour prop
  changes nothing on screen — Blender's own factory cylinder ships one.
  Rasterise UV occupancy per FACE, never per fan triangle (the quad
  diagonal runs through cell centres and reports self-overlap).
- **Measure unconditionally; gate judgement on policy, emission on a requested
  deliverable.** An intrinsic fact (the oriented box, symmetry) is measured for
  every mesh in every scene — gating a MEASUREMENT on a target means no other
  consumer can use it, and it inverts "measure in Blender, judge in the
  contract". The only legitimate measurement gate is cost, keyed on a VALUE
  that proves a reader exists (`minThicknessMm` for the thickness ray-cast, a
  declared grid for `gridDeviation`), never on a mode. `voxel.enabled` /
  `minecraft.enabled` are not author-settable and are not modes: they are the
  cached "did anyone declare this policy". Before adding a flag, place it in
  one of the three strata; if it fits none, it duplicates a value.
- **A check never exits without a verdict, and a relaxation is never a
  suppression.** Every bounded search reports what it skipped (the caller owns
  the cap, so there is somebody to tell); every sidecar that fails to load
  reports it (`readTweaks` returns what it rejected); every guarantee that can
  vary by machine is probed and reported (the E-804 readback). Imported
  geometry is RECLASSIFIED, not skipped: rules always run, and
  `lint/provenance.ts` drops the severity to info with `detail.provenance` so
  the report can explain its own quiet. Turning any of these back into an
  early `return`/`catch {}` reinstates the exact bug class three audits found.
- **One predicate per physical relation.** Grounding lives in
  `solve/contact.ts` and is consumed by both the world linter and the claims
  adjudicator; the voxel element frame is the census's oriented box
  (`center`/`localSize`/`rotation`), consumed by grid deviation, extent,
  bounds and BOTH exporters. Re-deriving either locally is how they last
  disagreed.
- **`view_layer.update()` before census.** Background bpy does not refresh
  `matrix_world` for transforms set outside operators (plain
  `rotation_euler =` on a `bpy.data`-made object), so without the explicit
  depsgraph update at the top of `census()` every world-space fact —
  bounds, grounding, contacts, off-camera, doubles, texel density — is
  measured against where objects USED to be. The proof stage carries the
  same call for the same reason. Zero-area and doubles are METRIC facts
  (thresholds in m / m²) and are measured after the world transform;
  topological counts (ngons, manifold, loose, winding) stay local.
- **Kit viewer renders textures.** `kit-runtime.ts` samples
  `baseColorTexture` (embedded GLB PNG → createImageBitmap →
  `SRGB8_ALPHA8` upload so the GPU linearises to match the linear
  factors), TEXCOORD_0 on attribute 2, attribute locations pinned via
  `bindAttribLocation` before link. Textured materials default to the
  glTF white factor, untextured factor-less ones keep the 0.8 display
  grey. The fragment shader passes `uColor.a` through — a hardcoded 1.0
  there silently made the x-ray ghosts opaque once already. Container
  reading (`textureSourceInfo`) is pure and pinned by tests against a
  real embedded PNG.
- **Toolbar changes to `HtmlViewer` = named predicate + `&&` gate**, in
  the cluster next to `isDeckArtifact`/`isMarkdownArtifact`. Never
  restructure `HtmlViewer`, `runtime/srcdoc.ts`, or the workspace shell.

## THE rule that keeps biting: changes are not "live" until a compile runs

Sidecars (`*.artifact.json`) and kit pages are **compile-time artifacts on
disk**. After editing compiler/viewer/sidecar code, the UI shows NOTHING
new for existing projects until each scene recompiles. Also: the daemon
auto-writes a legacy inferred sidecar (`kind: "html"`, `metadata.inferred`)
for any bare `.html` — so an un-recompiled kit page looking like a plain
prototype is stale state, not a routing bug.

Deterministic verify loop (run it; don't ask the user to click things):

```bash
# 1. rebuild in dependency order, then restart via tools-dev (ONLY lifecycle)
pnpm --filter @open-design/contracts build
pnpm --filter @open-design/scene3d build
pnpm --filter @open-design/daemon build
pnpm tools-dev stop && pnpm tools-dev

# 2. ports change on every restart — never assume, always resolve:
pnpm tools-dev status --json    # daemon + web urls live here

# 3. recompile a scene through the API (Blender 5.x is installed locally)
curl -s -X POST "$DAEMON/api/projects/$PID/scene3d/compile" \
  -H content-type:application/json -d '{"scenePath":"scenes/<name>","noCache":true}'

# 4. verify the artifacts, not vibes:
#    - <project>/kit.html contains zero "dlBtn"
#    - kit.html.artifact.json: kind=scene3d renderer=html, metadata.deliverables non-empty
#    - scenes/<s>/out/index.html.artifact.json: renderer=scene3d
#    - curl a deliverable URL -> 200 with real bytes
```

Managed projects live at `<repo>/.od/projects/<projectId>/` in dev (confirm
via `GET /api/projects/:id` → `resolvedDir`; never hardcode data paths per
the Daemon data directory contract).

## Known gotchas (all confirmed, don't rediscover them)

- `scenes/*/out/` is hidden from the files-list API, but
  `GET /api/projects/:id/files/<path>` still serves those bytes. Export
  URLs work; the file rail just doesn't show generated dirs.
- Retained workspace tabs keep old iframes mounted. After a recompile,
  close and reopen the file tab; a stale tab is not a bug report.
- **Two agents work this repo concurrently** and both touch
  `packages/scene3d/src/viewer/kit.ts` / `kit-runtime.ts`. Use exact-match
  Edit operations only (a collision then fails loudly instead of
  clobbering). A transient `tsc` parse error in `kit-runtime.ts` at a
  shifting line number = the other agent mid-write; re-run before
  diagnosing.
- The scene3d suite (`pnpm --filter @open-design/scene3d test`) runs real
  Blender; ~2–6 min. The fast slices are `tests/asset-kind.test.ts` and
  `tests/kit-viewer.test.ts`.
- i18n: every new key goes in `apps/web/src/i18n/types.ts` AND all 19
  locale files (typecheck enforces it). scene3d keys are the
  `'scene3d.*'` block; extend it in place.
- Sidecar `metadata` is capped at 16KB by the daemon validator; the kit
  sidecar truncates (`MAX_KIT_SCENES`/`MAX_KIT_DELIVERABLES`) and flags
  `scenesTruncated`/`deliverablesTruncated` — keep truncation loud.
- Desktop window can wedge on launch (content painted at a stale surface
  size, off-center input, renderer geometry reporting `screenX: -32000`).
  Fix: `pnpm tools-dev stop desktop && pnpm tools-dev start desktop`. Not
  a code regression; if it recurs, the suspect is `revealWhenReady` in
  `apps/desktop/src/main/runtime.ts`.
- Allowlists must stay in sync when artifact enums change — FOUR places:
  `packages/contracts/src/api/artifacts.ts`, `apps/web/src/artifacts/types.ts`,
  `apps/web/src/artifacts/manifest.ts`, `apps/daemon/src/artifacts/manifest.ts`.

## Operating the app for verification (GUI + headless)

Confirmed working recipes — use these instead of rediscovering them.

- **`pnpm tools-dev start web` is NOT the GUI.** It starts daemon + web
  server only. The visible app is the Electron shell:
  `pnpm tools-dev start desktop` (or bare `pnpm tools-dev` for all three).
  Desktop can come up with `window hidden` — that's the launch wedge;
  `pnpm tools-dev stop desktop && pnpm tools-dev start desktop` clears it.
  `pnpm tools-dev inspect desktop status|screenshot` verifies it.
- **Headless visual verification** (preferred for iteration — no window
  focus games): Playwright is at
  `node_modules/.pnpm/playwright@<ver>/node_modules/playwright` (require by
  absolute path; `e2e/node_modules` only exposes `@playwright/test`).
  Drive the WEB url from `tools-dev status --json`. Deep links:
  `/projects/:id/files/scenes/<s>/scene.json` → native Scene3dPanel;
  `/projects/:id/files/kit.html` → kit viewer. `scenes/*/out/index.html`
  does NOT deep-link (out/ is hidden from the files list, so the route
  falls back to the project browser).
  - The kit iframe is srcdoc: find it by polling `page.frames()` for a
    frame containing `.rail` (URL matching fails). First dev-server load
    compiles on demand — poll up to ~60s.
  - CSS-module elements: select with `[class*="Scene3dPanel_stage"]`-style
    substrings; verify layout with getComputedStyle probes, not eyeballs —
    they catch dropped/overridden declarations screenshots hide.
- **srcdoc = opaque origin, by design.** The daemon's `/api` guard rejects
  `Origin: null` except for read-only raw/preview routes. A kit-page (or
  any generated artifact) feature that needs the API must go through a
  host postMessage bridge (see `od:scene3d-tweaks` in
  `packages/contracts/src/api/scene3d.ts` + the handler in
  `FileViewer.tsx` beside the ident ack). Never "fix" this with CORS
  headers — that hands every generated iframe the daemon API.
- **Two CSS traps that already bit this fork** (both now carry comments at
  the fix site — keep the pattern):
  - The `font:` shorthand cannot take `inherit` as family; the whole
    declaration drops silently and the kit page's generic `button` rule
    (12px/1 + shadow) takes over, clipping descenders. Longhands only.
  - In CSS Modules, a `@container` override loses a same-specificity tie
    against a base rule written LATER in the file. All narrow-mode
    overrides live in one @container block at the END of
    `Scene3dPanel.module.css`.
- **Issue-code transparency:** every `S3D-*` code has a human title in
  `packages/contracts/src/api/scene3d-codes.ts`
  (`scene3dIssueTitle(code)`); a daemon test
  (`tests/scene3d-issue-titles.test.ts`) pins the catalog against
  `ISSUE_CODES` in `packages/scene3d/src/errors.ts`. Adding a code =
  adding a title in the same change, or that test goes red. Any UI that
  shows a bare code must show/tooltip its title.
- The `<scene3d-report>` agent block renders each finding's `detail`
  payload as a `data:` line (report.ts `compactDetail`) — measured facts
  (patch extents, gaps, measured-vs-expected) must reach the model, so
  when adding lint rules put the numbers in `detail`, not only in prose.

## Working style for this fork

- Act on the map above instead of re-exploring; a fresh grep tour of
  FileViewer/AGENTS.md to answer "where does X live" wastes the session.
- Ship whole capabilities: HTTP route + contracts + UI + `od` CLI in one
  change (root AGENTS.md dual-track rule) with `pnpm guard`,
  `pnpm typecheck`, and package-scoped tests green.
- When the user says something "isn't live", check compile-time artifacts
  on disk FIRST (sidecar kind, `dlBtn` count, mtimes) before touching code.
