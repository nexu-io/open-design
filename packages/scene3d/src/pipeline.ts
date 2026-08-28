import * as fs from "node:fs";
import * as path from "node:path";
import {
  Census,
  CompileRequest,
  CompileResult,
  Issue,
  SceneSource,
  IssueSummary,
  ProofFrameStats,
  ProofOptions,
  Scene3dContract,
  Scene3dManifest,
  StageId,
  StageReport,
  PartTweak,
} from "./types.js";
import { ISSUE_CODES, summarize } from "./errors.js";
import { DEFAULT_CONTRACT, normalizeContract, validateContract, contractCacheKey } from "./contract.js";
import { discoverSources, existingSourceFiles } from "./parse/sources.js";
import { companionFiles } from "./parse/companions.js";
import { lostAuthoredChannels, lostShadingCapability } from "./read/gltf-capability.js";
import { parseUsda, UsdaParseError } from "./parse/usda.js";
import { authorStageModel } from "./usd/stage-model.js";
import { renderUsdGraph } from "./usd/graph.js";
import {
  BlenderProbe,
  hashFiles,
  hashJson,
  readCache,
  runRunner,
  runnerPath,
  scriptsDir,
  probeBlender,
  writeCache,
} from "./build/blender.js";
import { runRecipe } from "./parse/recipe.js";
import { evalTraceShapes, EvalCancelledError } from "./kernel/trace.js";
import { toEmitMesh, fitKernelMesh, predictCensus, type EmitMesh, type PredictedCensus } from "./kernel/mesh.js";
import { ratFromFloat } from "./kernel/rational.js";

type KernelShape = { name: string; verts: Array<[number, number, number]> };
import { validateCensus } from "./build/census.js";
import { runLint } from "./lint/rules.js";
import { validateGltf } from "./lint/gltf-oracle.js";
import { validateUsd } from "./lint/usd-oracle.js";
import { collectSheets } from "./sheet/collect.js";
import type { SheetSpec } from "./lint/sheet.js";
import { buildManifest, writeManifest, writeViewer } from "./manifest.js";
import { describeScene } from "./read/describe.js";
import { changeImpact, formatImpact, type ImpactReport } from "./read/impact.js";
import { renderOrthoSvg, orthoDimensions } from "./read/ortho.js";
import { renderOrthoAscii } from "./read/ortho-ascii.js";
import { renderContactSheet } from "./read/contact.js";
import { isChannelBinding } from "./solve/emit-bpy.js";
import { MATERIAL_CHANNELS } from "./solve/channels.js";
import type { ShaderOutput } from "./shade/types.js";
import { resolveLook } from "./read/look.js";
import { resolveSweep, type ResolvedPose } from "./read/shot.js";
import { describeProofViews, orbitEye, type ProofView } from "./read/views.js";
import { validateSceneSpec, specDeclarationLines } from "./solve/validate.js";
import { solveScene } from "./solve/solver.js";
import { motionEnvelopeIssues } from "./solve/sweep.js";
import { claimMargins } from "./lint/claims.js";
import { clearanceIssues } from "./solve/clearance.js";
import { classifySolveDelta, snapshotSolve, type SolveSnapshot } from "./read/solve-delta.js";
import { emitBlenderScript } from "./solve/emit-bpy.js";
import type { SceneSpec, SolvedScene } from "./solve/types.js";
import { validateShaderSpec } from "./shade/validate.js";
import { packageUsdz } from "./usd/usdz.js";
import { emitMinecraftModel } from "./mc/emit.js";
import { importJavaModel } from "./mc/import-java.js";
import { assembleShaderJob } from "./shade/emit.js";
import { flipbookGrid, type CompiledShaderJob, type ShaderBinding } from "./shade/types.js";

/* Execution order. `proof` precedes `lint` because the linter reads each
   rendered frame's coverage statistics; the stage ids themselves stay the
   declared pipeline vocabulary. */
const STAGE_ORDER: StageId[] = ["parse", "build", "proof", "export", "lint", "manifest"];
const DEFAULT_TIMEOUT_MS = 180_000;
/** The runner is written against Blender 5.x APIs (README "Blender 5.x is
 *  required"); older majors are refused up front rather than crashing deep
 *  in the runner as a generic E-202. */
const MIN_BLENDER_MAJOR = 5;

/**
 * Deliverables live in a plain `out/` directory, not under `.scene3d/`.
 *
 * They used to share the dot-directory with the stage cache, which meant the
 * host's project file listing — which hides dotfiles — showed the two source
 * files and none of the four things the compile actually produced. A user
 * watching a clean compile saw "build.py, scene3d.json" and concluded nothing
 * had been built. The cache stays hidden because it genuinely is internal;
 * the stage, the mesh, the proof frames, and the viewer are the product.
 */
const OUT_DIR = "out";
const PROOF_DIR = `${OUT_DIR}/proof`;
/** Lit-sphere previews, one per distinct material, rendered by the proof. */
const MATERIALS_DIR = `${OUT_DIR}/materials`;

/**
 * Flatten the raw `conventions` object the author wrote into leaf dot-paths
 * (`"geometry.allowOpenMeshes"`, `"uv.texelDensity.target"`, …), for
 * lint/provenance.ts's per-key cancellation. Only descends into plain nested
 * objects; an array (`partPrefixes`, `roughnessRange`) is itself the leaf
 * value, not a container to recurse into.
 */
function collectAuthoredKeys(conventions: unknown, prefix = "", out = new Set<string>()): Set<string> {
  if (conventions === null || conventions === undefined) return out;
  if (typeof conventions !== "object" || Array.isArray(conventions)) {
    if (prefix) out.add(prefix);
    return out;
  }
  for (const [key, value] of Object.entries(conventions as Record<string, unknown>)) {
    collectAuthoredKeys(value, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

/**
 * Compile a scene project through the deterministic pipeline:
 *
 *   parse    discover sources, parse USDA structure, load contract
 *   build    run the scene through headless Blender, capture the census
 *   lint     run the deterministic rule set over census + parse tree
 *   proof    render turntable/still frames
 *   export   write USD/GLB deliverables
 *   manifest emit .scene3d/manifest.json
 *
 * Stages are cached by content hash of their inputs; `noCache` bypasses.
 * `ok` is true only when no error-severity issue was produced.
 */
/** Non-serializable, in-process-only compile options. Kept separate from
 *  {@link CompileRequest} (which crosses the worker boundary as data) precisely
 *  because a function can't be serialized — the worker rebuilds `shouldCancel`
 *  locally from a shared flag. See `compileInWorker`. */
export interface CompileControl {
  /** Cooperative cancellation, polled at every kernel work-meter checkpoint AND
   *  at each pipeline stage boundary (build/proof/export). So an abandoned
   *  compile stops the exact evaluation promptly and never STARTS a further
   *  Blender stage. A Blender stage already IN FLIGHT still runs to completion
   *  (bounded by `request.timeoutMs`) — killing a running child would need
   *  cross-platform process-tree management, deliberately out of scope. */
  shouldCancel?: () => boolean;
}

/** The channel table as the runner receives it — derived from the one
 *  vocabulary, never restated. */
const CHANNEL_SOCKETS: Record<string, { sockets: string[]; nonColor: boolean }> =
  Object.fromEntries(
    MATERIAL_CHANNELS.map((c) => [c.name, { sockets: [...c.sockets], nonColor: c.nonColor === true }]),
  );

export async function compile(
  request: CompileRequest,
  control: CompileControl = {},
): Promise<CompileResult> {
  // The runner chdirs into the project and then joins projectDir against
  // the new cwd, so a relative projectDir resolves twice and every source
  // "does not exist". Resolve once here and the whole class of bug is gone.
  request = { ...request, projectDir: path.resolve(request.projectDir) };
  const stages: StageReport[] = [];
  const issues: Issue[] = [];
  const wanted = new Set(request.stages ?? STAGE_ORDER);
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const report = (id: StageId, status: StageReport["status"], durationMs: number) =>
    stages.push({ id, status, durationMs });

  /* ---- parse ------------------------------------------------------ */
  const t0 = performance.now();
  const source = discoverSources(request.projectDir);
  let contract: Scene3dContract = request.contract ?? DEFAULT_CONTRACT;
  let contractIssues: string[] = [];
  /* Contract leaf paths the AUTHOR wrote, as opposed to the ones DEFAULT_CONTRACT
     and the target presets fill in. Only an explicit leaf is a statement of
     intent, and only an explicit leaf cancels the imported-provenance
     relaxation for the one rule it governs (lint/provenance.ts) — never for
     unrelated sibling rules that happen to share its convention block. */
  let authoredKeys = new Set<string>();
  if (request.contract) {
    // A programmatically-supplied contract (od CLI --contract, daemon route,
    // an embedded agent) skips the file-load path but must NOT skip validation:
    // an unchecked string budget or absurd proof.resolution would otherwise
    // silently disable a rule or drive a 100k-px render. Reject it exactly like
    // a bad file and fall back to the default rather than normalise garbage.
    contractIssues = validateContract(request.contract);
    // One issue PER problem, matching scene.json's granularity — the two
    // validators used to answer the same class of mistake in two shapes
    // (fifteen separate E-105 lines vs one semicolon-joined E-104 string).
    if (contractIssues.length > 0) {
      for (const problem of contractIssues) {
        issues.push({
          code: ISSUE_CODES.INVALID_CONTRACT,
          severity: "error",
          message: `contract is invalid: ${problem}`,
          file: "(request.contract)",
        });
      }
      contract = DEFAULT_CONTRACT;
    } else {
      authoredKeys = collectAuthoredKeys(request.contract.conventions);
    }
  } else {
    const contractFile = path.join(request.projectDir, "scene3d.json");
    if (fs.existsSync(contractFile)) {
      try {
        // BOM-tolerant for the same reason as scene.json below.
        const raw = JSON.parse(fs.readFileSync(contractFile, "utf8").replace(/^\uFEFF/, ""));
        contractIssues = validateContract(raw);
        if (contractIssues.length > 0) {
          for (const problem of contractIssues) {
            issues.push({
              code: ISSUE_CODES.INVALID_CONTRACT,
              severity: "error",
              message: `scene3d.json is invalid: ${problem}`,
              file: "scene3d.json",
            });
          }
        } else {
          contract = raw as Scene3dContract;
          authoredKeys = collectAuthoredKeys(contract.conventions);
        }
      } catch (err) {
        issues.push({
          code: ISSUE_CODES.INVALID_CONTRACT,
          severity: "error",
          message: `scene3d.json is not valid JSON: ${(err as Error).message}`,
          file: "scene3d.json",
        });
      }
    }
  }
  // An imported Minecraft model implies the minecraft target: it IS a voxel
  // asset, so the voxel rules should judge it and the model should round-trip
  // back out. An explicit scene3d.json still wins (it can tune grid / dialect /
  // bounds), so this only fills the common case of a bare model dropped in.
  if (
    source.kind === "mc_model" &&
    contract.target === undefined &&
    contract.conventions?.minecraft === undefined
  ) {
    contract = { ...contract, target: "minecraft" };
  }
  const normalized = normalizeContract(contract);

  /* ---- declarative spec (scene.json) ------------------------------ */
  /* The spec is validated BEFORE any geometry exists (Kiln's discipline:
     schema errors are parse errors with JSON paths, never Blender
     tracebacks), solved into placements, and emitted as a deterministic
     generated build script the rest of the pipeline runs unchanged. The
     author writes relations; the compiler owns every coordinate. */
  let spec: SceneSpec | undefined;
  /** Channels each material authored, by material name — read by the
   *  deliverable-parity report. Per material because an extension is not a
   *  scene-wide capability: one material carrying clearcoat says nothing about
   *  whether another material's coat survived the export. */
  const authoredChannels = new Map<string, string[]>();
  let solved: SolvedScene | undefined;
  /** This solve frozen as the NEXT compile's prediction frame. */
  let solveSnapshot: SolveSnapshot | undefined;
  let specScript: string | undefined;
  /** Evaluated, box-fitted kernel meshes for `recipe:` parts, for the emitter. */
  const kernelMeshes: Record<string, EmitMesh> = {};
  /** Morph targets (blendshapes) per recipe part, box-fitted, for the emitter. */
  const kernelShapes: Record<string, KernelShape[]> = {};
  /** Each recipe part's exact predicted census + morph-target names,
   *  adjudicated in lint against what Blender measured (S3D-E-702). */
  const kernelPredictions: Array<{ partId: string; census: PredictedCensus; shapeNames: string[] }> = [];
  let specLines: Record<string, number> = {};
  /* ---- Minecraft model import (.bbmodel / Java model.json) --------- */
  /* Convert the model to a scene.json spec IN MEMORY, then run the normal
     spec path: it is validated, solved, built, LINTED (the voxel rules judge
     the import) and can be re-emitted. A copy of the derived spec is written
     to .scene3d/imported.scene.json so the modeller can promote it to scene.json
     and iterate — the migration story — without this compile mutating the
     source directory. */
  if (source.kind === "mc_model" && source.files.length > 0) {
    const modelRel = source.files[0]!;
    const modelAbs = path.join(request.projectDir, modelRel);
    try {
      const parsed = JSON.parse(fs.readFileSync(modelAbs, "utf8"));
      const imported = importJavaModel(parsed, {
        name: path.basename(modelRel).replace(/\.(bbmodel|json)$/i, ""),
        resolveTexture: (ref) => {
          const dir = path.dirname(modelAbs);
          for (const cand of [
            path.join(dir, `${ref}.png`),
            path.join(dir, "textures", `${ref}.png`),
            path.join(dir, "textures", "block", `${ref}.png`),
          ]) {
            try {
              if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return fs.readFileSync(cand);
            } catch {
              /* keep trying the next candidate */
            }
          }
          return undefined;
        },
      });
      for (const w of imported.warnings) {
        issues.push({ code: ISSUE_CODES.IMPORT_DEGRADED, severity: "warning", message: `import: ${w}`, file: modelRel });
      }
      for (const sk of imported.skipped) {
        issues.push({
          code: ISSUE_CODES.IMPORT_DEGRADED,
          severity: "warning",
          message: `import skipped ${sk.element}: ${sk.reason}`,
          hint: "scene.json reasons in axis-aligned boxes; a rotated element cannot be represented yet",
          file: modelRel,
        });
      }
      if (imported.spec) {
        const rawText = JSON.stringify(imported.spec, null, 2);
        const result = validateSceneSpec(imported.spec, { bake: { min: normalized.shade.bakeMin, max: normalized.shade.bakeMax } });
        if (result.spec) {
          spec = result.spec;
          specLines = specDeclarationLines(rawText);
          // An imported model IS a spec source from here on: it has a derived
          // spec and (below) a generated build script exactly like scene.json.
          // Downstream build/export logic keys on "spec"; the scene.json reader
          // is guarded so it does not also fire for this already-built spec.
          source.kind = "spec";
          const genDir = path.join(request.projectDir, ".scene3d");
          fs.mkdirSync(genDir, { recursive: true });
          fs.writeFileSync(path.join(genDir, "imported.scene.json"), rawText + "\n", "utf8");
          issues.push({
            code: ISSUE_CODES.MODEL_IMPORTED,
            severity: "info",
            message: `imported ${modelRel}: ${imported.spec.parts.length} element(s) → a scene.json spec at .scene3d/imported.scene.json — copy it up to edit and iterate`,
            file: modelRel,
          });
        } else {
          for (const message of result.errors) {
            issues.push({ code: ISSUE_CODES.SPEC_INVALID, severity: "error", message: `imported spec invalid: ${message}`, file: modelRel });
          }
        }
      } else {
        issues.push({
          code: ISSUE_CODES.SPEC_INVALID,
          severity: "error",
          message: `could not import ${modelRel}: ${imported.warnings.join("; ") || "no importable elements"}`,
          file: modelRel,
        });
      }
    } catch (err) {
      issues.push({
        code: ISSUE_CODES.SPEC_INVALID,
        severity: "error",
        message: `${modelRel} is not valid JSON: ${(err as Error).message}`,
        file: modelRel,
      });
    }
  }
  if (source.kind === "spec" && spec === undefined) {
    if (fs.existsSync(path.join(request.projectDir, "build.py"))) {
      issues.push({
        code: ISSUE_CODES.AMBIGUOUS_SOURCES,
        severity: "error",
        message:
          "both scene.json and build.py exist — two authorities over the same geometry; keep one",
        hint: "scene.json is the declarative path (solver, claims, provenance); build.py is raw bpy. Rename the other aside (e.g. build.py.bak) and compile again — nothing is lost either way",
        file: "scene.json",
      });
    } else {
      let rawText: string | undefined;
      try {
        // A UTF-8 BOM is an editor's fingerprint, not authorial intent —
        // Windows tooling (PowerShell 5.1 especially) writes one on every
        // save, and refusing the file taxed authors twice per field run.
        rawText = fs.readFileSync(path.join(request.projectDir, "scene.json"), "utf8").replace(/^\uFEFF/, "");
        const parsed = JSON.parse(rawText);
        const result = validateSceneSpec(parsed, { bake: { min: normalized.shade.bakeMin, max: normalized.shade.bakeMax } });
        if (result.spec) {
          spec = result.spec;
          specLines = specDeclarationLines(rawText);
        } else {
          for (const message of result.errors) {
            issues.push({
              code: ISSUE_CODES.SPEC_INVALID,
              severity: "error",
              message,
              file: "scene.json",
            });
          }
        }
        // Valid-but-suspect authoring rides its own advisory code, so a
        // kilometre part or a provably inert rotation is named without
        // blocking the compile.
        for (const message of result.warnings) {
          issues.push({
            code: ISSUE_CODES.SPEC_SUSPECT,
            severity: "warning",
            message,
            file: "scene.json",
          });
        }
      } catch (err) {
        issues.push({
          code: ISSUE_CODES.SPEC_INVALID,
          severity: "error",
          message: `scene.json is not valid JSON: ${jsonSyntaxDetail(err as Error, rawText)}`,
          file: "scene.json",
          hint: "fix the JSON syntax at the line and column shown, then compile again",
        });
      }
    }
  }

  /* Solving and emitting a spec is source-agnostic: it runs for a scene.json
     spec AND for an imported Minecraft model (whose spec was set above),
     which is why it lives outside the scene.json reader block. */
  {
    let missingAssets = false;
    if (spec) {
      // File-backed parts pull real assets into the build: they must exist
      // (a typo is a parse error, not a Blender traceback) and they join
      // the source list so their bytes participate in the content hash —
      // replacing the asset file recompiles the scene.
      for (const part of spec.parts) {
        if (part.file) {
          if (fs.existsSync(path.join(request.projectDir, part.file))) {
            if (!source.files.includes(part.file)) source.files.push(part.file);
          } else {
            missingAssets = true;
            issues.push({
              code: ISSUE_CODES.SPEC_INVALID,
              severity: "error",
              message: `part '${part.id}': asset file '${part.file}' does not exist in the scene directory`,
              file: "scene.json",
              target: part.id,
            });
          }
        }
        // A recipe-backed part's bytes join the content hash the same way, and
        // must exist. Independent of file/script — one filler per box, and a
        // typo is a parse error here, not a Python traceback at solve time.
        if (part.recipe) {
          if (fs.existsSync(path.join(request.projectDir, part.recipe))) {
            if (!source.files.includes(part.recipe)) source.files.push(part.recipe);
          } else {
            missingAssets = true;
            issues.push({
              code: ISSUE_CODES.SPEC_INVALID,
              severity: "error",
              message: `part '${part.id}': recipe '${part.recipe}' does not exist in the scene directory`,
              file: "scene.json",
              target: part.id,
            });
          }
        }
        // A script-backed part's bytes join the content hash too: editing
        // the script must recompile the scene, exactly like replacing an
        // asset file. Existence is a parse error, not a Blender traceback.
        // An INDEPENDENT check, never chained behind `file` — a part is
        // script-backed OR file-backed, and gating this behind the file
        // branch let every script-only part skip validation entirely and
        // crash the runner with a traceback for a one-line typo.
        if (!part.script) continue;
        if (fs.existsSync(path.join(request.projectDir, part.script))) {
          if (!source.files.includes(part.script)) source.files.push(part.script);
        } else {
          missingAssets = true;
          issues.push({
            code: ISSUE_CODES.SPEC_INVALID,
            severity: "error",
            message: `part '${part.id}': script '${part.script}' does not exist in the scene directory`,
            file: "scene.json",
            target: part.id,
          });
        }
      }
    }
    if (spec) {
      // A voxel scene's grid is a solver CONSTRAINT: emergent positions
      // (repeat instances, scatter samples) snap onto it so they never flood
      // the linter with off-grid vertices. Authored coordinates are untouched.
      solved = solveScene(spec, {
        ...(normalized.voxel.enabled ? { grid: normalized.voxel.gridSize } : {}),
        // Raisable runaway backstops from the contract (default generous).
        maxParts: normalized.geometry.maxParts,
        maxRepeatCount: normalized.geometry.maxRepeatCount,
      });
      for (const diagnostic of solved.diagnostics) {
        // Two diagnostics describe a scene that BUILT: one where the solver
        // adjusted an offset, one where it placed instances inside each other.
        // Both are warnings about geometry the author should look at; the rest
        // mean the graph could not be solved at all.
        const buildable =
          diagnostic.code === "SOLVE-EPSILON-FLOOR" ||
          diagnostic.code === "SOLVE-INTERSECTION" ||
          diagnostic.code === "SOLVE-SUSPECT";
        issues.push({
          code:
            diagnostic.code === "SOLVE-EPSILON-FLOOR"
              ? ISSUE_CODES.SPEC_ADJUSTED
              : diagnostic.code === "SOLVE-INTERSECTION"
                ? ISSUE_CODES.SPEC_INSTANCES_INTERSECT
                : diagnostic.code === "SOLVE-SUSPECT"
                  ? ISSUE_CODES.SPEC_SUSPECT
                  : ISSUE_CODES.SPEC_UNRESOLVED,
          severity: buildable ? "warning" : "error",
          message: diagnostic.message,
          file: "scene.json",
          ...(diagnostic.part ? { target: diagnostic.part } : {}),
        });
      }
      /* The kinematic linter: motion adjudicated across its whole cycle as
         static geometry, at parse time — swept envelopes vs neighbours
         (W-108). Costs no Blender: the fast gear catches a mid-cycle
         collision the rest pose hides. Claims are NOT judged here: the one
         adjudicator (lint/claims.ts) consumes the same swept facts, so the
         analytic and sampled oracles can never contradict each other about
         one claim. */
      issues.push(...motionEnvelopeIssues(solved));
      // Minkowski clearance: parts inside the declared assembly tolerance
      // without being in designed contact. Parse-time box subtraction.
      issues.push(...clearanceIssues(solved, normalized.geometry.minClearance));
      /* Freeze this solve as the next compile's prediction frame. The basis
         carries the non-spec solve inputs (the voxel grid constraint), so a
         contract flip that moves everything reads as "not comparable"
         rather than a fabricated per-part delta. */
      solveSnapshot = snapshotSolve(
        spec,
        solved,
        normalized.voxel.enabled ? { grid: normalized.voxel.gridSize } : {},
        hashJson,
      );
      const unresolved = solved.diagnostics.some(
        (d) => d.code !== "SOLVE-EPSILON-FLOOR" && d.code !== "SOLVE-INTERSECTION",
      );
      // Recipe parts run BEFORE emit: each is ordinary Python executed in
      // plain CPython (no bpy) that authors an operator trace, which the one
      // kernel evaluator turns into exact geometry and an exact predicted
      // census. The geometry is handed to the emitter; the prediction is
      // adjudicated in lint against what Blender measures. A recipe that fails
      // its contract is a parse-class error, and blocks the emit that would
      // otherwise ship an empty box for it.
      let recipeFailed = false;
      if (!unresolved && !missingAssets) {
        const recipeRunner = path.join(scriptsDir(), "kernel", "recipe_runner.py");
        for (const part of solved.parts) {
          if (!part.recipe) continue;
          const result = runRecipe(path.join(request.projectDir, part.recipe), {
            runnerScript: recipeRunner,
          });
          if (!result.ok || !result.trace) {
            recipeFailed = true;
            issues.push({
              code: ISSUE_CODES.SPEC_INVALID,
              severity: "error",
              message: `part '${part.id}': ${result.error ?? "recipe produced no trace"}`,
              file: "scene.json",
              target: part.id,
            });
            continue;
          }
          try {
            const { base, shapes } = evalTraceShapes(result.trace, {
              ...(request.workBudget !== undefined ? { workBudget: request.workBudget } : {}),
              ...(control.shouldCancel ? { shouldCancel: control.shouldCancel } : {}),
            });
            const box = part.localSize ?? part.size;
            // ONE exact box-fit over ℚ (base and every shape by the same exact
            // affine), then a SINGLE rounding at emit. So the census, the mass
            // certificate, and the geometry Blender builds are all the SAME
            // solid — the volume is about what the user actually receives.
            const fittedK = fitKernelMesh(base, shapes, [
              ratFromFloat(box[0]),
              ratFromFloat(box[1]),
              ratFromFloat(box[2]),
            ]);
            kernelMeshes[part.id] = toEmitMesh(fittedK.base);
            if (fittedK.shapes.length > 0) {
              kernelShapes[part.id] = fittedK.shapes.map((sh) => ({
                name: sh.name,
                verts: toEmitMesh(sh.mesh).verts,
              }));
            }
            kernelPredictions.push({
              partId: part.id,
              census: predictCensus(fittedK.base, { mass: true }),
              shapeNames: shapes.map((s) => s.name),
            });
          } catch (e) {
            // A cancellation is the caller walking away, not a defect in the
            // author's recipe — propagate it out of the whole compile instead of
            // blaming the scene with an issue.
            if (e instanceof EvalCancelledError) throw e;
            recipeFailed = true;
            // The try spans evaluation, box-fitting, the float32 bake AND census
            // prediction, so a throw is not necessarily an evaluation failure —
            // e.g. an absurd declared `size` (≥~1e39) overflows the float32 bake,
            // not the exact trace. Don't pin it on "did not evaluate".
            issues.push({
              code: ISSUE_CODES.SPEC_INVALID,
              severity: "error",
              message: `part '${part.id}': recipe could not be evaluated and prepared for build — ${(e as Error).message}`,
              file: "scene.json",
              target: part.id,
            });
          }
        }
      }
      /* Every channel any material authored, for the deliverable-parity
         report: a channel that reached the render and not the .glb is a fact
         only the compiler can tell the author. Collected here, beside the
         emit, so it is independent of whether the scene declares shaders. */
      for (const [matName, mat] of Object.entries(spec.materials ?? {})) {
        const keys = Object.keys(mat as Record<string, unknown>).filter((k) => k !== "shader");
        if (keys.length > 0) authoredChannels.set(matName, keys);
      }
      if (!unresolved && !missingAssets && !recipeFailed) {
        specScript = emitBlenderScript(solved, {
          ...(spec.materials ? { materials: spec.materials } : {}),
          camera: spec.camera ?? true,
          ...(spec.light ? { light: spec.light } : {}),
          tessellation: normalized.tessellation,
          kernelMeshes,
          kernelShapes,
        });
        const generatedDir = path.join(request.projectDir, ".scene3d");
        fs.mkdirSync(generatedDir, { recursive: true });
        fs.writeFileSync(path.join(generatedDir, "spec.build.py"), specScript, "utf8");
      }
    }
  }
  /** Project-relative path of the generated build script, when one exists. */
  const specScriptRel = specScript !== undefined ? ".scene3d/spec.build.py" : undefined;

  /* ---- shaders ----------------------------------------------------- */
  /* Raw GPU kernels: read each declared kernel file, run the structural
     checks that need the text, and assemble the runnable program the
     runner will compile ON THE DRIVER, execute offscreen, and bake. The
     assembled source participates in the build hash, so editing a kernel
     recompiles the scene; the driver's own verdicts come back as
     S3D-E-802/803/804 from the build. */
  const shaderJobs: CompiledShaderJob[] = [];
  const shaderBindings: ShaderBinding[] = [];
  if (spec?.shaders) {
    for (const [name, shaderSpec] of Object.entries(spec.shaders)) {
      const kernelAbs = path.join(request.projectDir, shaderSpec.kernel);
      if (!fs.existsSync(kernelAbs)) {
        issues.push({
          code: ISSUE_CODES.SHADER_INVALID,
          severity: "error",
          message: `shader '${name}': kernel file '${shaderSpec.kernel}' does not exist`,
          file: "scene.json",
          target: name,
        });
        continue;
      }
      const kernelText = fs.readFileSync(kernelAbs, "utf8");
      const shaderErrors: string[] = [];
      const validated = validateShaderSpec(name, shaderSpec, kernelText, shaderErrors, {
        min: normalized.shade.bakeMin,
        max: normalized.shade.bakeMax,
        maxAtlasBytes: normalized.shade.maxAtlasBytes,
      });
      if (!validated) {
        for (const message of shaderErrors) {
          issues.push({
            code: ISSUE_CODES.SHADER_INVALID,
            severity: "error",
            message,
            file: shaderSpec.kernel,
            target: name,
          });
        }
        continue;
      }
      if (!source.files.includes(shaderSpec.kernel)) source.files.push(shaderSpec.kernel);
      shaderJobs.push(
        assembleShaderJob(
          name,
          kernelText,
          validated.outputs,
          validated.uniforms,
          validated.size,
          validated.normalStrength,
          validated.frames,
          validated.motionVectors,
        ),
      );
    }
    const referenced = new Set<string>();
    /* A shader reaches a material two ways, and both land in one binding
       list. `shader:` is the whole-material shorthand — bind every output the
       kernel declares to its matching channel. A per-channel binding names
       one channel and one output, and WINS over the shorthand, which is what
       lets a material wear a kernel and still drive its coat from a second
       one (or pin a channel to a constant). */
    const flipbookRefused = (matName: string, job: { name: string; frames: number }): boolean => {
      if (job.frames <= 1) return false;
      issues.push({
        code: ISSUE_CODES.SHADER_INVALID,
        severity: "error",
        message: `material '${matName}' references flipbook shader '${job.name}' — a frames shader is a sheet product, not a surface`,
        file: "scene.json",
        target: matName,
      });
      return true;
    };
    for (const [matName, mat] of Object.entries(spec.materials ?? {})) {
      const record = mat as unknown as Record<string, unknown>;
      // Per-channel bindings first, so the channels they claim are known
      // before the whole-material shorthand fills in the rest.
      const perChannel = new Map<string, { shader: string; output: string }>();
      for (const key of Object.keys(record)) {
        const v = record[key];
        if (!isChannelBinding(v)) continue;
        const job = shaderJobs.find((j) => j.name === v.shader);
        if (!job) continue;
        referenced.add(v.shader);
        if (flipbookRefused(matName, job)) continue;
        perChannel.set(key, { shader: v.shader, output: v.output ?? key });
      }
      for (const [channel, b] of perChannel) {
        shaderBindings.push({
          material: matName,
          shader: b.shader,
          outputs: [b.output as ShaderOutput],
          ...(b.output !== channel ? { channel } : { channel }),
        });
      }
      if (typeof mat.shader === "string") {
        referenced.add(mat.shader);
        const job = shaderJobs.find((j) => j.name === mat.shader);
        if (!job) continue;
        if (flipbookRefused(matName, job)) continue;
        /* The shorthand fills only what no per-channel binding already claimed,
           and only outputs that ARE channels: a kernel may bake things a
           surface has no input for — `occlusion` has no slot on the surface
           model, `height` reaches it as a derived normal — so binding every
           output by name would report a channel as unbound for the crime of
           having been baked. */
        const claimed = new Set(perChannel.keys());
        // `height` is not bound as itself — it reaches the surface as the
        // DERIVED normal map. So a per-channel `normal` binding claims the
        // shorthand's `height` too; without this the material would carry two
        // competing normal inputs and the explicit override would lose to the
        // shader it was written to overrule.
        if (claimed.has("normal")) claimed.add("height");
        const bindable = new Set([...MATERIAL_CHANNELS.map((c) => c.name), "height"]);
        const outputs = job.outputs.filter((o) => !claimed.has(o) && bindable.has(o));
        if (outputs.length > 0) {
          shaderBindings.push({ material: matName, shader: mat.shader, outputs });
        }
      }
    }
    for (const job of shaderJobs) {
      // A flipbook shader is self-justifying: its atlas IS the product.
      if (!referenced.has(job.name) && job.frames === 1) {
        issues.push({
          code: ISSUE_CODES.SHADER_UNUSED,
          severity: "warning",
          message: `shader '${job.name}' is declared but no material references it`,
          file: "scene.json",
          target: job.name,
        });
      }
    }
  }

  /* Baked flipbook atlases register as SHEETS: the existing 2D rules
     (grid, blank frames, static-flipbook, power-of-two) adjudicate GPU
     output exactly as they adjudicate hand-made atlases — the emergent
     bridge into the 2D asset pipeline. */
  const derivedSheets = shaderJobs
    .filter((job) => job.frames > 1)
    .flatMap((job) =>
      // flipbookGrid is THE grid definition — the runner lays the atlas
      // out with the same formula, and frames is validated to a power of
      // two so the rows always come out integral. An inline copy here is
      // how the adjudicated grid and the baked grid would drift apart.
      job.outputs.map((output) => ({
        file: `out/textures/${job.name}_${output}.png`,
        kind: "flipbook" as const,
        grid: flipbookGrid(job.frames),
      })),
    );

  let primTree: ReturnType<typeof parseUsda> | undefined;
  if (source.kind === "usda" || source.files.some((f) => f.endsWith(".usda"))) {
    const usdaFiles = existingSourceFiles(request.projectDir, source).filter((f) =>
      f.toLowerCase().endsWith(".usda"),
    );
    const errors: string[] = [];
    for (const file of usdaFiles) {
      try {
        const tree = parseUsda(fs.readFileSync(file, "utf8"), path.relative(request.projectDir, file));
        primTree = primTree ? mergeStage(primTree, tree) : tree;
        for (const layer of tree.stage.subLayers) {
          const abs = path.join(request.projectDir, layer);
          if (fs.existsSync(abs) && !source.files.includes(layer)) {
            source.files.push(layer);
            try {
              const sub = parseUsda(fs.readFileSync(abs, "utf8"), layer);
              primTree = mergeStage(primTree ?? sub, sub);
            } catch (err) {
              errors.push((err as Error).message);
            }
          }
        }
      } catch (err) {
        if (err instanceof UsdaParseError) {
          errors.push(err.message);
        } else {
          errors.push((err as Error).message);
        }
      }
    }
    if (errors.length > 0) {
      for (const message of errors) {
        issues.push({ code: ISSUE_CODES.USDA_PARSE_ERROR, severity: "error", message });
      }
    }
  }
  if (source.files.length === 0) {
    issues.push({
      code: ISSUE_CODES.NO_SOURCES,
      severity: "error",
      message: "no scene sources found (expected build.py, *.usda or *.blend)",
    });
  }
  report("parse", issues.length > 0 && source.files.length === 0 ? "skipped" : "ran", ms(t0));

  /* ---- blender availability -------------------------------------- */
  const needsBlender =
    source.kind === "bpy" ||
    source.kind === "blend" ||
    source.kind === "mesh" ||
    specScriptRel !== undefined;
  /** The script the Blender runner should execute, when there is one. */
  const buildScriptRel =
    source.kind === "bpy" ? source.files.find((f) => f === "build.py") : specScriptRel;
  /** Real asset files the runner should import as the scene. */
  const meshFiles = source.kind === "mesh" ? source.files : undefined;
  /** GPU kernels + material wiring, attached to every runner mode: the
   *  bake happens at scene-load time so census, proof, and export all see
   *  the same textured materials. */
  const shaderPayload =
    shaderJobs.length > 0
      ? { shaders: shaderJobs, shaderBindings, channelSockets: CHANNEL_SOCKETS }
      : {};
  let probe: BlenderProbe | null = null;
  if (wanted.has("build") || wanted.has("proof") || wanted.has("export")) {
    probe = await probeBlender({ blenderBin: request.blenderBin, pythonBin: request.pythonBin });
    if (needsBlender && !probe) {
      issues.push({
        code: ISSUE_CODES.BLENDER_NOT_FOUND,
        severity: "error",
        message:
          "Blender runtime not found (set SCENE3D_BLENDER_BIN to a blender executable, or SCENE3D_PYTHON_BIN to a python with bpy installed)",
      });
    }
    /* Gate the version BEFORE running anything. The runner is written
       against Blender 5.x APIs; an older Blender used to run anyway and die
       deep inside the runner as a generic E-202 with a stderr tail — a
       failure indistinguishable from a broken scene. Name the real cause
       with the measured version and run nothing. */
    if (probe && probe.major !== undefined && probe.major < MIN_BLENDER_MAJOR) {
      issues.push({
        code: ISSUE_CODES.BLENDER_UNSUPPORTED,
        severity: "error",
        message: `found ${probe.version} at ${probe.bin} — scene3d requires Blender ${MIN_BLENDER_MAJOR}.x or newer`,
        hint: "install Blender 5.x, or point SCENE3D_BLENDER_BIN at a 5.x executable",
        detail: { version: probe.version, major: probe.major, required: MIN_BLENDER_MAJOR },
      });
      probe = null;
    }
  }

  /* ---- build ------------------------------------------------------ */
  // If the caller already abandoned the request (a client disconnect during
  // parse/solve/eval), stop before the whole Blender pipeline — build, proof,
  // export, lint, manifest — spins up, so an abandoned compile doesn't hold its
  // worker + gate slot through every remaining stage. A disconnect DURING a
  // Blender stage still lets THAT stage finish (killing a running Blender child
  // would need cross-platform process-tree management, deliberately out of
  // scope); the abort reaches the exact-evaluation phase and this boundary.
  if (control.shouldCancel?.()) throw new EvalCancelledError(-1, "build");
  let census: Census | undefined;
  /* The read model. Populated at the manifest stage, which is the only
     point where every measurement this run will produce is final. */
  let impact: ImpactReport | undefined;
  let digest: string | undefined;
  let solveDelta: CompileResult["solveDelta"];
  const sourceFiles = existingSourceFiles(request.projectDir, source);

  // Viewport edits are a source input: they change the geometry that gets
  // built, so they participate in the content hash exactly like build.py.
  // Corrupt tweaks still degrade to "no tweaks" — a bad viewer write must not
  // wedge every future compile of the scene — but degrading SILENTLY made the
  // scene quietly snap back to its rest pose with nothing to read, and the
  // author's only clue was geometry that stopped matching what they dragged.
  let tweaks: Record<string, PartTweak> | undefined;
  let tweaksRaw: string | null = null;
  const tweaksFile = path.join(request.projectDir, "tweaks.json");
  if (fs.existsSync(tweaksFile)) {
    tweaksRaw = fs.readFileSync(tweaksFile, "utf8");
    const read = readTweaks(tweaksRaw);
    tweaks = read.tweaks;
    for (const note of read.notes) {
      issues.push({
        code: ISSUE_CODES.TWEAKS_IGNORED,
        severity: "warning",
        message: `tweaks.json: ${note}`,
        hint: "re-apply the edit in the viewer, or delete tweaks.json to compile the authored scene",
        file: "tweaks.json",
      });
    }
  }

  const buildInputHash = hashJson({
    kind: source.kind,
    // Hash the NORMALIZED contract, not the raw one: two contracts that
    // normalise identically (an explicit `upAxis:"Y"` vs the omitted default,
    // or a numeric vs string-typed field that sanitises to the same value)
    // must share a cache key. Hashing raw text forced a full rebuild on every
    // daemon restart for any project that spelled out a default value.
    // contractCacheKey serialises the RegExp fields so a pattern change still
    // busts the cache (JSON.stringify would otherwise drop them to `{}`).
    contract: contractCacheKey(normalized),
    sources: hashFiles(sourceFiles),
    // Files the sources REFERENCE — a .gltf's external .bin, an .obj's .mtl
    // and its textures. They are geometry and appearance the build reads, and
    // leaving them out meant editing model.bin and recompiling reported
    // "cached" while shipping the old mesh.
    companions: hashFiles(companionFiles(sourceFiles)),
    // The RAW bytes, not the parsed object: hashing the parse result made
    // every unreadable version of the file hash as `null`, so corrupting a
    // valid tweaks.json and then repairing it to a DIFFERENT valid state
    // could land on a cache entry built from neither.
    tweaks: tweaksRaw,
    blender: probe?.version ?? null,
    // The generated script hashes the emitter itself: an emitter change
    // must bust the cache even though scene.json is unchanged.
    generated: specScript ?? null,
    // Assembled shader programs: kernel + stdlib + uniforms + outputs.
    shaders: shaderJobs.length > 0 ? shaderJobs : null,
    // The runner IS a build input: a runner.py change alters what the
    // census measures and how tweaks replay, and without this a cached
    // census from the old runner survives until a source edit or
    // --no-cache happens to arrive.
    runner: hashFiles([runnerPath()]),
  });

  if (wanted.has("build")) {
    const tb = performance.now();
    if (
      source.kind === "bpy" ||
      source.kind === "blend" ||
      source.kind === "spec" ||
      source.kind === "mesh"
    ) {
      if (probe && (source.kind !== "spec" || specScriptRel !== undefined)) {
        const cached = request.noCache ? null : readCache(request.projectDir, "build", buildInputHash);
        let cacheHit = false;
        if (cached) {
          // A corrupted or stale-shaped cache entry is a MISS, never a
          // failure: the fresh path converts the same validation error
          // into INVALID_CENSUS, and an unguarded throw here made a bad
          // cache file abort the whole compile until someone guessed at
          // --no-cache. Recovery is a rebuild, not an incantation.
          try {
            census = validateCensus(cached.data);
            cacheHit = true;
            report("build", "cached", ms(tb));
          } catch {
            census = undefined;
          }
        }
        if (!cacheHit) {
          const job = {
            mode: "build" as const,
            projectDir: request.projectDir,
            buildScript: buildScriptRel,
            usdaFiles:
              source.kind === "bpy"
                ? source.files.filter((f) => f.endsWith(".usda"))
                : source.kind === "spec" || source.kind === "mesh"
                  ? []
                  : source.files,
            blendFile: source.kind === "blend" ? source.files[0] : undefined,
            ...(meshFiles ? { meshFiles } : {}),
            outDir: path.join(request.projectDir, ".scene3d", "work"),
            ...(tweaks ? { tweaks } : {}),
            ...(normalized.print.measureThickness ? { measureThickness: true } : {}),
            // The grid VALUE, not a mode: the oriented box is measured for
            // every mesh regardless, and this decides only whether the
            // grid-relative half of that measurement runs.
            ...(normalized.voxel.enabled ? { voxelGrid: normalized.voxel.gridSize } : {}),
            ...(normalized.geometry.zFightingPairBudget !== 200_000
              ? { zFightingPairBudget: normalized.geometry.zFightingPairBudget }
              : {}),
            ...shaderPayload,
          };
          const result = await runRunner(probe, job, timeoutMs, request.env);
          if (!result.ok) {
            issues.push({
              code: (result.errorCode ?? ISSUE_CODES.BLENDER_FAILED) as typeof ISSUE_CODES[keyof typeof ISSUE_CODES],
              severity: "error",
              message: `build failed: ${result.error ?? "unknown error"}`,
            });
          } else {
            try {
              census = validateCensus(result.data);
              if (!request.noCache) {
                writeCache(request.projectDir, "build", buildInputHash, { artifacts: [], data: census });
              }
            } catch (err) {
              issues.push({
                code: ISSUE_CODES.INVALID_CENSUS,
                severity: "error",
                message: (err as Error).message,
              });
            }
          }
          report("build", "ran", ms(tb));
        }
      }
    } else if (source.kind === "usda") {
      report("build", "skipped", ms(tb));
    }
  }

  /* For spec scenes, provenance must point at the line the author WROTE.
     The runner attributed objects to the generated script, which the author
     never sees; remap every solved part (repeat instances to the base part
     they were expanded from) and material onto its scene.json declaration. */
  if (census && solved) {
    const provenance: Record<string, { file: string; line: number | null }> = {
      ...census.provenance,
    };
    for (const part of solved.parts) {
      const declared = part.from ?? part.id;
      provenance[part.id] = { file: "scene.json", line: specLines[declared] ?? null };
    }
    for (const name of Object.keys(spec?.materials ?? {})) {
      provenance[name] = { file: "scene.json", line: specLines[name] ?? null };
    }
    census.provenance = provenance;
  }

  /* ---- proof ------------------------------------------------------ */
  // Abandoned between stages? Don't start the next Blender render. (See the
  // build-stage note: this bounds an aborted compile's waste to at most the one
  // stage already in flight.)
  if (control.shouldCancel?.()) throw new EvalCancelledError(-1, "proof");
  /* Proof runs before lint on purpose: the linter consumes each frame's
     coverage statistics, so "the render came out black" is a measured fact
     it can report rather than a failure only a human would ever notice. */
  const proofImages: string[] = [];
  /* Lit-sphere material previews. Deliberately NOT folded into proofImages:
     the frame player, the ascii sampling and the viewer all iterate that
     list as a turntable, and a ball is not a frame of one. */
  const materialBalls: string[] = [];
  let materialBallsSkipped = 0;
  let materialBallsSkippedNames: string[] = [];
  let materialBallStats: Array<{ material: string; clipped: number }> = [];
  let proofFrames: ProofFrameStats[] | undefined;
  /** Per-frame off-camera facts from the proof turntable, when it ran. */
  let offByFrame: Array<{ frame: number; objects: string[] }> | undefined;
  /** Per-frame per-part projected screen rects — the viewer's click-to-
   *  highlight reads these off the manifest (see Scene3dManifest.proofRects). */
  let proofRects: Array<Record<string, [number, number, number, number]>> | undefined;
  /** Part names in id-map code order (code = index + 1); present when the
   *  runner rendered `<frame>.idx.png` object-index maps beside the frames.
   *  The viewer derives each map's path from its frame's path. */
  let proofIdParts: string[] | undefined;
  /** The contact sheet's own report: which badge named which part, and which
   *  parts the orbit never showed. Filled at manifest time (below). */
  let contactSheetSummary: ContactSheetSummary | undefined;
  /** Aimed viewport shots: the poses that resolved, and the specs that did not.
   *  Both travel to the result — a shot the compiler refused is a fact the agent
   *  needs, and silence would read as "rendered, and it was empty". */
  const resolvedLooks: ResolvedPose[] = [];
  const looksRejected: Array<{ index: number; reason: string }> = [];
  /** Project-relative path of each resolved look's frame, by index; absent
   *  where the render failed. */
  const lookPaths: Array<string | undefined> = [];
  const proofOpts: ProofOptions = { ...normalized.proof, ...(request.proof ?? {}) };
  if (wanted.has("proof")) {
    const tp = performance.now();
    if (probe && source.files.length > 0 && (source.kind !== "spec" || buildScriptRel !== undefined)) {
      // An animated scene's turntable doubles as its clip preview (the
      // runner samples the timeline across the orbit), and 8 frames of a
      // walk cycle read as a slideshow. 16 keeps playback legible without
      // an explicit request; an authored turntableSteps still wins.
      const sceneAnimates = (census?.animation?.keyframedObjects.length ?? 0) > 0;
      const steps = proofOpts.turntable ? proofOpts.turntableSteps ?? (sceneAnimates ? 16 : 8) : 1;
      /* `steps` is in the hash even though it is derived from the census:
         a derived input is still an input. Without it, an animated scene's
         16-frame request collides with its old 8-frame cache entry (the
         entry's files all exist, so the hit sticks until --no-cache), and a
         `--stages parse,proof` run — census undefined, so 8 frames — would
         write a differently-sized frame set under the same hash. */
      /* Shots resolve BEFORE the hash: resolution is pure arithmetic over the
         census, and its result — not the request — is what the renderer is
         handed and what the cache key must cover. Resolving first also rejects a
         spec naming a part that does not exist, with the available names, before
         Blender is asked to photograph anything. */
      const forResolve = census ?? ({ objects: [], meshes: [] } as unknown as Census);
      /* One queue, two front doors. A `look` desugars to a shot, so both lists
         run the same resolver and land in the same render batch — there is no
         second arithmetic path to keep in step. A sweep expands here, into as
         many poses as it has samples, because from the renderer's side a swept
         shot IS n shots. */
      for (const [index, spec] of (request.looks ?? []).entries()) {
        try {
          resolvedLooks.push(resolveLook(spec, forResolve));
        } catch (err) {
          looksRejected.push({ index, reason: (err as Error).message });
        }
      }
      const lookCount = request.looks?.length ?? 0;
      for (const [i, spec] of (request.shots ?? []).entries()) {
        try {
          resolvedLooks.push(...resolveSweep(spec, forResolve));
        } catch (err) {
          // Indices continue past the looks so a caller reading the rejection
          // list can find the entry it sent, whichever list it came from.
          looksRejected.push({ index: lookCount + i, reason: (err as Error).message });
        }
      }
      /* The resolved poses are hash INPUTS: two compiles that differ only in
         where the camera stood are different renders, and without this the
         second would hit the first's cache and hand back the wrong picture. */
      const proofHash = hashJson({ build: buildInputHash, proof: proofOpts, steps, looks: resolvedLooks });
      const names = Array.from({ length: steps }, (_, i) => `proof-${proofHash}-${String(i).padStart(3, "0")}.png`);
      const abs = names.map((n) => path.join(request.projectDir, OUT_DIR, "proof", n));
      const lookNames = resolvedLooks.map(
        (_, i) => `look-${proofHash}-${String(i).padStart(2, "0")}.png`,
      );
      const lookAbs = lookNames.map((n) => path.join(request.projectDir, OUT_DIR, "proof", n));
      const cached = request.noCache ? null : readCache(request.projectDir, "proof", proofHash);
      /* Material balls are outputs, so they are not hash INPUTS — but they
         are artifacts of this entry, so a hit has to prove they still exist.
         Without this, deleting `out/materials/` left the cache reporting a
         complete proof forever and the previews never came back. */
      const cachedBalls = asStringList((cached?.data as { materialBalls?: unknown } | null)?.materialBalls);
      if (
        cached &&
        [...cached.artifacts, ...cachedBalls].every((a) =>
          fs.existsSync(path.join(request.projectDir, a)),
        )
      ) {
        /* The entry's artifacts hold BOTH the beauty frames and their
           `.idx.png` object-index maps (they must: a hit has to prove both
           still exist). Only the frames are proofImages — pushing the maps
           in doubled the frame count on every cached recompile, and the
           frame player, the ascii sampler and the panel all read that list
           as one orbit of one subject. */
        proofImages.push(
          ...cached.artifacts.filter(
            (a) =>
              !a.toLowerCase().endsWith(".idx.png") &&
              // Aimed shots ride the same entry (a hit must prove they still
              // exist) but they are NOT turntable frames: every consumer of
              // proofImages reads that list as one orbit of one subject.
              !path.basename(a).startsWith("look-"),
          ),
        );
        // The look filenames are a pure function of the hash that produced the
        // hit, so a cached rerun recovers them by name — no second list to keep
        // in step with the first.
        for (const n of lookNames) {
          lookPaths.push(
            fs.existsSync(path.join(request.projectDir, OUT_DIR, "proof", n))
              ? `${PROOF_DIR}/${n}`
              : undefined,
          );
        }
        materialBalls.push(...cachedBalls);
        const cachedNames = (cached.data as { materialBallsSkippedNames?: unknown } | null)
          ?.materialBallsSkippedNames;
        materialBallsSkippedNames = Array.isArray(cachedNames)
          ? cachedNames.filter((m): m is string => typeof m === "string")
          : [];
        materialBallsSkipped =
          typeof (cached.data as { materialBallsSkipped?: unknown } | null)?.materialBallsSkipped === "number"
            ? ((cached.data as { materialBallsSkipped: number }).materialBallsSkipped)
            : 0;
        const cachedBallStats = (cached.data as { materialBallStats?: unknown } | null)
          ?.materialBallStats;
        materialBallStats = Array.isArray(cachedBallStats)
          ? cachedBallStats
              .map((s) => s as { material?: unknown; clipped?: unknown })
              .filter(
                (s): s is { material: string; clipped: number } =>
                  typeof s.material === "string" && typeof s.clipped === "number",
              )
          : [];
        // The cache carries the frame statistics, not just the file list:
        // without them a cached rerun would drop S3D-E-383 and a scene that
        // rendered black would start reporting clean on its second compile.
        // The per-frame off-camera facts ride the same entry.
        const cachedData = cached.data as
          | {
              frames?: unknown;
              offByFrame?: Array<{ frame: number; objects: string[] }>;
              screenRects?: Array<Record<string, [number, number, number, number]>>;
              idParts?: string[];
            }
          | null;
        proofFrames = asProofFrames(cachedData);
        offByFrame = Array.isArray(cachedData?.offByFrame) ? cachedData.offByFrame : undefined;
        proofRects = Array.isArray(cachedData?.screenRects) ? cachedData.screenRects : undefined;
        proofIdParts = Array.isArray(cachedData?.idParts) ? (cachedData.idParts as string[]) : undefined;
        report("proof", "cached", ms(tp));
      } else {
        const result = await runRunner(
          probe,
          {
            mode: "proof",
            projectDir: request.projectDir,
            buildScript: buildScriptRel,
            ...(meshFiles ? { meshFiles } : {}),
            usdaFiles: source.files.filter((f) => f.endsWith(".usda")),
            blendFile: source.kind === "blend" ? source.files[0] : undefined,
            outDir: path.join(request.projectDir, ".scene3d", "work"),
            ...(tweaks ? { tweaks } : {}),
            ...shaderPayload,
            proof: {
              engine: proofOpts.engine ?? "BLENDER_EEVEE",
              resolution: proofOpts.resolution ?? 1024,
              turntable: proofOpts.turntable ?? true,
              turntableSteps: steps,
              respectSceneCamera: proofOpts.respectSceneCamera ?? false,
              ...(proofOpts.background ? { background: proofOpts.background } : {}),
              filepaths: abs,
              materialBallDir: path.join(request.projectDir, OUT_DIR, "materials"),
              ...(resolvedLooks.length > 0
                ? {
                    looks: resolvedLooks.map((pose, i) => ({
                      filepath: lookAbs[i]!,
                      eye: [...pose.eye] as [number, number, number],
                      /* The runner aims at a POINT, and a turn-in-place shot has
                         no subject to supply one — so the aim point is derived
                         here, from the pose's own forward vector, one metre out
                         when there is no depth to borrow. Deriving it in
                         TypeScript keeps the runner's contract unchanged and
                         keeps every camera semantic on this side of the
                         boundary, where it is testable without Blender. */
                      target: [
                        pose.eye[0] + pose.forward[0] * (pose.distance ?? 1),
                        pose.eye[1] + pose.forward[1] * (pose.distance ?? 1),
                        pose.eye[2] + pose.forward[2] * (pose.distance ?? 1),
                      ] as [number, number, number],
                      fovDeg: pose.fovDeg,
                      ...(pose.timeFrame !== undefined ? { timeFrame: pose.timeFrame } : {}),
                    })),
                  }
                : {}),
            },
          },
          timeoutMs,
          request.env,
        );
        if (!result.ok) {
          issues.push({
            code: (result.errorCode ?? ISSUE_CODES.PROOF_FAILED) as typeof ISSUE_CODES[keyof typeof ISSUE_CODES],
            severity: "error",
            message: `proof render failed: ${result.error ?? "unknown error"}`,
          });
        } else {
          const written = names.filter((n) => fs.existsSync(path.join(request.projectDir, OUT_DIR, "proof", n)));
          const rel = written.map((n) => `${PROOF_DIR}/${n}`);
          // A partial turntable is NOT a clean proof: the runner reported
          // success, but frames missing from disk mean a renderer or
          // filesystem failure ate part of the orbit — and silence here
          // let downstream readers treat missing visual evidence as a
          // clean pass. Loud, per the cap doctrine: name the count.
          if (written.length < names.length) {
            issues.push({
              code: ISSUE_CODES.PROOF_FAILED,
              severity: "error",
              message: `proof wrote ${written.length} of ${names.length} expected frame(s) — the renderer reported success but the orbit is incomplete on disk`,
              detail: { expected: names.length, written: written.length },
            });
          }
          // The object-index maps the runner renders beside each frame
          // (`<frame>.idx.png`) — the viewer's per-pixel x-ray silhouettes.
          // Companions, never proofImages: the player, the lint statistics
          // and the digest read beauty frames only.
          const idxNames = names.map((n) => n.replace(/\.png$/i, ".idx.png"));
          const idxWritten = idxNames.filter((n) =>
            fs.existsSync(path.join(request.projectDir, OUT_DIR, "proof", n)),
          );
          // Each compile hashes to a new frame set; without pruning, a scene
          // iterated a handful of times leaves tens of megabytes of orphaned
          // renders sitting in the user's project.
          pruneStaleProofFrames(request.projectDir, [...names, ...idxNames, ...lookNames]);
          proofImages.push(...rel);
          /* The runner names the balls (only it knows the material names), so
             it reports absolute paths and the project-relative form is derived
             here — the same one place every other artifact path is made. */
          const ballFiles = asStringList((result.data as { materialBalls?: unknown } | undefined)?.materialBalls)
            .map((p) => path.basename(p))
            .filter((n) => fs.existsSync(path.join(request.projectDir, OUT_DIR, "materials", n)));
          pruneStaleMaterialBalls(request.projectDir, ballFiles);
          materialBalls.push(...ballFiles.map((n) => `${MATERIALS_DIR}/${n}`));
          const skippedRaw = (result.data as { materialBallsSkipped?: unknown } | undefined)?.materialBallsSkipped;
          materialBallsSkipped = typeof skippedRaw === "number" ? skippedRaw : 0;
          /* The NAMES of the unpreviewed materials, not just their count.
             The runner measures them ({material, reason}); a bare count
             left the reader unable to tell which surfaces went unpreviewed
             — a cap and a bake failure looked identical. */
          const rawNotes = (result.data as { materialBallNotes?: unknown } | undefined)?.materialBallNotes;
          materialBallsSkippedNames = Array.isArray(rawNotes)
            ? rawNotes
                .map((n) => (n as { material?: unknown })?.material)
                .filter((m): m is string => typeof m === "string")
            : [];
          /* Per-ball clipped fractions — the one number that answers "does
             my emission read as the colour I authored". Measured on the
             same lit-sphere the author is told to look at; the report
             names the balls that blow out. */
          const rawBallStats = (result.data as { materialBallStats?: unknown } | undefined)
            ?.materialBallStats;
          materialBallStats = Array.isArray(rawBallStats)
            ? rawBallStats
                .map((s) => s as { material?: unknown; clipped?: unknown })
                .filter(
                  (s): s is { material: string; clipped: number } =>
                    typeof s.material === "string" && typeof s.clipped === "number",
                )
            : [];
          /* Which aimed shots actually landed on disk. Checked by NAME rather
             than trusted from the runner's reply for the same reason the orbit
             frames are: "the renderer reported success" and "the file exists"
             are different facts, and only the second one can be shown to
             anybody. A missing look is left undefined so the result can pair
             the failure with the pose that was requested. */
          for (const n of lookNames) {
            lookPaths.push(
              fs.existsSync(path.join(request.projectDir, OUT_DIR, "proof", n))
                ? `${PROOF_DIR}/${n}`
                : undefined,
            );
          }
          /* What each shot actually CAUGHT, measured on its own pixels. A pose
             can resolve perfectly and still photograph the void — and a blank
             frame with no explanation sends an agent to debug its geometry when
             the fact it needed was "you were pointed at empty space". The
             runner measures the same coverage/luminance it reports for orbit
             frames, so the two are comparable. */
          const rawLookStats = (result.data as { looks?: unknown } | undefined)?.looks;
          if (Array.isArray(rawLookStats)) {
            for (const [i, entry] of rawLookStats.entries()) {
              const stats = (entry as { stats?: { coverage?: unknown; meanLuminance?: unknown } })?.stats;
              const pose = resolvedLooks[i];
              if (!pose || !stats) continue;
              if (typeof stats.coverage === "number") pose.coverage = stats.coverage;
              if (typeof stats.meanLuminance === "number") pose.meanLuminance = stats.meanLuminance;
            }
          }
          const lostLooks = lookPaths.filter((p) => p === undefined).length;
          if (lostLooks > 0) {
            issues.push({
              code: ISSUE_CODES.PROOF_FAILED,
              severity: "warning",
              message: `${lostLooks} of ${lookNames.length} requested look(s) did not render — the pose resolved but the frame is not on disk`,
              detail: { requested: lookNames.length, missing: lostLooks },
            });
          }
          proofFrames = asProofFrames((result.data as { frames?: unknown } | undefined)?.frames);
          offByFrame = (result.data as { offByFrame?: unknown } | undefined)?.offByFrame as
            | Array<{ frame: number; objects: string[] }>
            | undefined;
          const rawRects = (result.data as { screenRects?: unknown } | undefined)?.screenRects;
          proofRects = Array.isArray(rawRects)
            ? (rawRects as Array<Record<string, [number, number, number, number]>>)
            : undefined;
          const rawIdParts = (result.data as { idParts?: unknown } | undefined)?.idParts;
          // Usable only as a complete SET: a frame without its map would
          // x-ray the wrong pixels, so the manifest advertises id maps only
          // when every frame's map actually exists on disk.
          proofIdParts =
            Array.isArray(rawIdParts) && rawIdParts.length > 0 && idxWritten.length === names.length
              ? (rawIdParts as string[])
              : undefined;
          /* A batch with a failed look must NOT be cached. The entry's artifact
             list can only hold the frames that exist, so a later identical
             compile would hit it, find every listed artifact present, and hand
             back the missing shot as though it had never been asked for —
             permanently, until someone thought to pass --no-cache. An
             incomplete render is a reason to re-run, not a result to keep. */
          const looksComplete = lookPaths.every((p) => p !== undefined);
          if (!request.noCache && rel.length === names.length && looksComplete) {
            writeCache(request.projectDir, "proof", proofHash, {
              artifacts: [
                ...rel,
                ...idxWritten.map((n) => `${PROOF_DIR}/${n}`),
                // Aimed shots are artifacts of this entry, so a later hit has
                // to prove they still exist — the same rule the id maps and the
                // material balls follow.
                ...lookPaths.filter((p): p is string => p !== undefined),
              ],
              data: {
                frames: proofFrames ?? null,
                offByFrame: offByFrame ?? [],
                ...(proofRects ? { screenRects: proofRects } : {}),
                ...(proofIdParts ? { idParts: proofIdParts } : {}),
                /* Cached alongside the frame statistics for the same reason
                   they are: a cached rerun that silently dropped the previews
                   would read as the feature coming and going. */
                materialBalls,
                materialBallsSkipped,
                materialBallsSkippedNames,
                materialBallStats,
              },
            });
          }
        }
        report("proof", "ran", ms(tp));
      }
    } else {
      report("proof", "skipped", ms(tp));
      if (wanted.has("proof") && !probe && source.files.length > 0) {
        issues.push({
          code: ISSUE_CODES.STAGE_SKIPPED,
          severity: "info",
          message: "proof skipped — no Blender runtime available",
        });
      }
    }
  }
  /* Aimed shots are rendered BY the proof stage, so a request that skipped it
     (`--fast`, an explicit --stages without proof, or no Blender) photographs
     nothing. Say so, per part and by name: an empty `looks` array beside a
     clean compile is indistinguishable from "you asked for no shots", which is
     exactly the silence that teaches a reader their request worked. */
  const askedFor = (request.looks?.length ?? 0) + (request.shots?.length ?? 0);
  if (askedFor > 0 && resolvedLooks.length === 0 && looksRejected.length === 0) {
    const why = !wanted.has("proof")
      ? "the proof stage was not selected (shots are rendered by proof — drop --fast, or include 'proof' in --stages)"
      : "the proof stage did not run (no Blender runtime, or nothing to render)";
    for (let i = 0; i < askedFor; i++) {
      looksRejected.push({ index: i, reason: `not rendered — ${why}` });
    }
  }

  /* ---- export ----------------------------------------------------- */
  if (control.shouldCancel?.()) throw new EvalCancelledError(-1, "export");
  /* Export precedes lint because the linter reads the exported stage back:
     the USD we ship can violate the contract the Blender scene satisfied,
     and only the artifact itself can settle that. */
  const exportedAssets: string[] = [];
  /** Content restored onto the re-imported stage before lowering, if any.
   *  Travels to the manifest so an audit of the .usda can tell which
   *  capabilities the shipped containers do not owe to it. */
  let carriedRecord: LoweringRecord["carried"];
  if (wanted.has("export")) {
    const te = performance.now();
    if (probe && source.files.length > 0 && (source.kind !== "spec" || buildScriptRel !== undefined)) {
      // A USDA-authored scene already IS its own usda deliverable; exporting
      // one over it would clobber the source of truth with a round-trip.
      const formats =
        source.kind === "usda"
          ? normalized.exportFormats.filter((f) => f !== "usda")
          : [...normalized.exportFormats];
      const exportHash = hashJson({ build: buildInputHash, formats, lod: normalized.lodRatios });
      const cached = request.noCache ? null : readCache(request.projectDir, "export", exportHash);
      /* usdz deliverables that W-904 fired on when the export actually ran,
         recorded into the cache so a cached recompile re-reports them. */
      const usdzUpAxisWarned: string[] = [];
      if (cached && cached.artifacts.every((a) => fs.existsSync(path.join(request.projectDir, a)))) {
        exportedAssets.push(...cached.artifacts);
        // The parity verdict is part of the export's result, so the cache
        // carries the lowering record and a cached recompile re-adjudicates
        // it — the same discipline as the proof cache's frame statistics.
        const cachedData = cached.data as
          | { lowering?: LoweringRecord | null; usdzUpAxisWarned?: string[] }
          | null;
        emitMasterParity(cachedData?.lowering ?? undefined, issues);
        // The carried record reaches the manifest on a HIT too: the cache
        // preserves it precisely so the persisted audit trail survives a
        // recompile of an unchanged export — re-adjudicating the parity
        // while dropping the provenance halved the point of carrying it.
        carriedRecord = cachedData?.lowering?.carried ?? carriedRecord;
        /* Capability parity is a pure re-read of the source and shipped
           containers — no cached data involved — so a cached recompile
           re-adjudicates it. It used to live only in the miss branch, which
           made W-903 fire once and vanish on the next identical compile:
           the exact stale-state-read-as-flakiness failure the cache
           discipline above exists to prevent. */
        emitMaterialCapabilityParity(request.projectDir, source, solved, cached.artifacts, issues, authoredChannels);
        /* Same for W-904: the packaging facts were recorded when the export
           ran. Legacy cache entries predate the record — infer from the
           lowering record instead (no AR stage + non-Y contract axis means
           the package came from the non-Y master), except for usda sources,
           whose packaging path never adjudicated the axis. */
        const warnedUsdz =
          cachedData?.usdzUpAxisWarned ??
          (source.kind !== "usda" && normalized.upAxis !== "Y" && !cachedData?.lowering?.arMaster
            ? cached.artifacts.filter((a) => a.toLowerCase().endsWith(".usdz"))
            : []);
        for (const usdzRel of warnedUsdz) {
          if (!cached.artifacts.includes(usdzRel)) continue;
          issues.push({
            code: ISSUE_CODES.USDZ_UP_AXIS,
            severity: "warning",
            message: `${usdzRel} is packaged from a ${normalized.upAxis}-up stage — AR Quick Look and Scene Viewer read USDZ as Y-up, so it will arrive rotated onto its back`,
            file: usdzRel,
            hint: "the Y-up AR stage could not be authored for this compile; set conventions.units.upAxis to Y, or drop usdz from export.formats",
            detail: { upAxis: normalized.upAxis, expected: "Y" },
          });
        }
        report("export", "cached", ms(te));
      } else {
        const result = await runRunner(
          probe,
          {
            mode: "export",
            projectDir: request.projectDir,
            buildScript: buildScriptRel,
            ...(meshFiles ? { meshFiles } : {}),
            usdaFiles: source.files.filter((f) => f.endsWith(".usda")),
            blendFile: source.kind === "blend" ? source.files[0] : undefined,
            outDir: path.join(request.projectDir, OUT_DIR),
            formats,
            ...(normalized.lodRatios.length > 0 ? { lodRatios: normalized.lodRatios } : {}),
            upAxis: normalized.upAxis,
            metersPerUnit: normalized.metersPerUnit,
            assetName: path.basename(request.projectDir),
            ...(tweaks ? { tweaks } : {}),
            ...shaderPayload,
          },
          timeoutMs,
          request.env,
        );
        if (!result.ok) {
          issues.push({
            code: (result.errorCode ?? ISSUE_CODES.EXPORT_FAILED) as typeof ISSUE_CODES[keyof typeof ISSUE_CODES],
            severity: "error",
            message: `export failed: ${result.error ?? "unknown error"}`,
          });
        } else {
          const payload = result.data as
            | {
                assets?: string[];
                skipped?: Array<{ format: string; reason: string }>;
                lowering?: LoweringRecord;
              }
            | undefined;
          const assets = payload?.assets ?? [];
          const rel = assets.filter((a) => fs.existsSync(path.join(request.projectDir, a)));
          exportedAssets.push(...rel);

          /* USD is the core format: the runner authored the master stage
             first and lowered every container from a re-import of it. The
             parity check makes master-totality a MEASURED claim — anything
             the build contained that did not survive into the master is a
             writer failure and a hard error, because a deliverable can now
             only contain what the master contains. */
          const lowering = payload?.lowering;
          emitMasterParity(lowering, issues);
          // What the deliverables owe to a repair rather than to the master.
          // Recorded, not reported — see the note in emitMasterParity.
          carriedRecord = lowering?.carried ?? carriedRecord;

          /* Parity COUNTS meshes, materials, armatures and bound clips, which
             catches a material that vanished and is blind to one that survived
             as a shell. That is the normal outcome of the round trip, because
             UsdPreviewSurface cannot express most of the modern PBR extension
             surface — calibration against the Khronos corpus found glass,
             iridescence, sheen, IOR and volume destroyed end to end with every
             stage reporting success. Read the capability off both ends and
             name what the shape of this pipeline costs. */
          emitMaterialCapabilityParity(request.projectDir, source, solved, rel, issues, authoredChannels);

          /*
           * Author the model hierarchy onto the stage Blender just wrote.
           *
           * Blender exports geometry; it has no hook for `kind` or
           * `purpose`, and no idea whether the thing it wrote is one asset
           * or an arrangement of several. Deciding that here rather than in
           * the runner is the same split the rest of the pipeline uses —
           * measure in Blender, judge on this side — and this is the only
           * side with a real USDA parser, so the edit is guided by a parse
           * rather than by a regex over raw text.
           *
           * Before lint, deliberately: the stage linter reads the shipped
           * artifact back, and it must judge what we actually ship.
           */
          for (const asset of rel) {
            if (!asset.toLowerCase().endsWith(".usda")) continue;
            const abs = path.join(request.projectDir, asset);
            try {
              const authored = authorStageModel({
                usda: fs.readFileSync(abs, "utf8"),
                assetName: path.basename(request.projectDir),
                file: asset,
              });
              fs.writeFileSync(abs, authored.usda);
              /* A legible scene-GRAPH beside the .usda. The exported USD is
                 text, but every prim is buried under kilobytes of vertex arrays;
                 this is the prim tree, kinds, xforms, and material bindings an
                 agent can actually read to reason about the shipped artifact.
                 Best-effort: a graph that fails to render must never fail the
                 export that produced the asset. */
              try {
                fs.writeFileSync(abs.replace(/\.usda$/i, ".tree.txt"), renderUsdGraph(authored.usda));
              } catch {
                /* the .usda is the deliverable; its graph is a convenience */
              }
              /* USDZ packages the FINAL stage — semantics included — so it
                 can only be built after this authoring step. The runner
                 deliberately leaves it to us. */
              if (formats.includes("usdz")) {
                const usdzRel = asset.replace(/\.usda$/i, ".usdz");
                /* Packaged from the Y-up AR stage when the contract's axis is
                   not Y — AR Quick Look and Scene Viewer both read a package
                   as Y-up, so a Z-up contract would otherwise ship an asset
                   that arrives on its back. The runner authors that stage
                   beside the master; the master itself keeps the contract's
                   axis, because that is what the engine targets asked for.

                   Falls back to the master when the AR stage could not be
                   authored, and W-904 then reports the axis rather than the
                   compile silently shipping the wrong orientation. */
                const arRel = lowering?.arMaster;
                const arAbs = arRel ? path.join(request.projectDir, arRel) : undefined;
                const packageFrom = arAbs && fs.existsSync(arAbs) ? arAbs : abs;
                if (packageFrom !== abs) {
                  /* The AR stage carries the same kind/assetInfo semantics as
                     the master — it is a delivery of the same asset, and a
                     package whose stage disagrees with the master's identity
                     is the exact defect authorStageModel exists to prevent. */
                  const arAuthored = authorStageModel({
                    usda: fs.readFileSync(packageFrom, "utf8"),
                    assetName: path.basename(request.projectDir),
                    file: arRel!,
                  });
                  fs.writeFileSync(packageFrom, arAuthored.usda);
                }
                try {
                  const packed = packageUsdz(packageFrom, path.join(request.projectDir, usdzRel));
                  // An archive that lacks files its own layers reference
                  // "succeeds" here and fails in the consumer — say which
                  // files never made it, at package time.
                  if (packed.missing.length > 0) {
                    issues.push({
                      code: ISSUE_CODES.EXPORT_FORMAT_UNAVAILABLE,
                      severity: "warning",
                      message: `usdz packaged without ${packed.missing.length} referenced file(s) the layers name but the disk lacks: ${packed.missing.slice(0, 5).join(", ")}${packed.missing.length > 5 ? ` +${packed.missing.length - 5} more` : ""}`,
                      detail: { format: "usdz", missing: packed.missing },
                    });
                  }
                  // Binary layers ride the package but cannot be scanned for
                  // THEIR references — a named caveat, never a silent gap.
                  if (packed.unscanned.length > 0) {
                    issues.push({
                      code: ISSUE_CODES.EXPORT_FORMAT_UNAVAILABLE,
                      severity: "info",
                      message: `usdz carries ${packed.unscanned.length} binary layer(s) whose own references this packager cannot scan (${packed.unscanned.slice(0, 3).join(", ")}${packed.unscanned.length > 3 ? ` +${packed.unscanned.length - 3} more` : ""}) — transitive assets behind them may be absent`,
                      detail: { format: "usdz", unscanned: packed.unscanned },
                    });
                  }
                  if (!rel.includes(usdzRel)) {
                    rel.push(usdzRel);
                    exportedAssets.push(usdzRel);
                  }
                } finally {
                  if (packageFrom !== abs) {
                    /* An intermediate, never a deliverable: it exists only to
                       be packaged, and leaving it beside the master would
                       offer the user two stages of the same scene that
                       disagree about which way is up. In a `finally` because a
                       packaging failure is exactly when a stray stage would be
                       left behind to confuse the next reader. */
                    try {
                      fs.rmSync(packageFrom, { force: true });
                    } catch {
                      /* A stage we cannot remove is still listed nowhere; it
                         costs disk, not correctness. */
                    }
                  }
                }
                if (packageFrom === abs && normalized.upAxis !== "Y") {
                  usdzUpAxisWarned.push(usdzRel);
                  issues.push({
                    code: ISSUE_CODES.USDZ_UP_AXIS,
                    severity: "warning",
                    message: `${usdzRel} is packaged from a ${normalized.upAxis}-up stage — AR Quick Look and Scene Viewer read USDZ as Y-up, so it will arrive rotated onto its back`,
                    file: usdzRel,
                    hint: "the Y-up AR stage could not be authored for this compile; set conventions.units.upAxis to Y, or drop usdz from export.formats",
                    detail: { upAxis: normalized.upAxis, expected: "Y" },
                  });
                }
              }
            } catch (err: any) {
              /* A stage we cannot re-author still ships; it simply ships
                 without the semantics, and the linter then says so. Silence
                 would be worse than either. */
              issues.push({
                code: ISSUE_CODES.STAGE_NO_KIND,
                severity: "warning",
                message: `could not author the model hierarchy onto ${asset}: ${String(err?.message ?? err)}`,
                file: asset,
              });
            }
          }
          /* A USDA-authored project's master is the SOURCE file — the
             runner never re-exports it, so it never appears in `rel` and
             the packaging loop above never sees it. Requesting usdz on
             such a project used to succeed with no usdz and no diagnostic
             (found by the release audit). The package wraps the source
             stage as-is; the source itself is never modified. */
          if (
            source.kind === "usda" &&
            formats.includes("usdz") &&
            !rel.some((a) => a.toLowerCase().endsWith(".usdz"))
          ) {
            const masterRel = source.files.find((f) => f.toLowerCase().endsWith(".usda"));
            if (masterRel) {
              try {
                fs.mkdirSync(path.join(request.projectDir, OUT_DIR), { recursive: true });
                const usdzRel = `${OUT_DIR}/scene.usdz`;
                const packed = packageUsdz(
                  path.join(request.projectDir, masterRel),
                  path.join(request.projectDir, usdzRel),
                );
                if (packed.missing.length > 0) {
                  issues.push({
                    code: ISSUE_CODES.EXPORT_FORMAT_UNAVAILABLE,
                    severity: "warning",
                    message: `usdz packaged without ${packed.missing.length} referenced file(s) the layers name but the disk lacks: ${packed.missing.slice(0, 5).join(", ")}${packed.missing.length > 5 ? ` +${packed.missing.length - 5} more` : ""}`,
                    detail: { format: "usdz", missing: packed.missing },
                  });
                }
                if (packed.unscanned.length > 0) {
                  issues.push({
                    code: ISSUE_CODES.EXPORT_FORMAT_UNAVAILABLE,
                    severity: "info",
                    message: `usdz carries ${packed.unscanned.length} binary layer(s) whose own references this packager cannot scan (${packed.unscanned.slice(0, 3).join(", ")}${packed.unscanned.length > 3 ? ` +${packed.unscanned.length - 3} more` : ""}) — transitive assets behind them may be absent`,
                    detail: { format: "usdz", unscanned: packed.unscanned },
                  });
                }
                rel.push(usdzRel);
                exportedAssets.push(usdzRel);
              } catch (err: any) {
                issues.push({
                  code: ISSUE_CODES.EXPORT_FORMAT_UNAVAILABLE,
                  severity: "warning",
                  message: `could not package usdz from ${masterRel}: ${String(err?.message ?? err)}`,
                  detail: { format: "usdz" },
                });
              }
            }
          }
          /* A container the contract asked for and the build could not
             produce is a warning, not silence. The user chose that format
             for a reason, and finding out it is missing when the download
             menu is one item short is far too late. */
          for (const miss of payload?.skipped ?? []) {
            issues.push({
              code: ISSUE_CODES.EXPORT_FORMAT_UNAVAILABLE,
              severity: "warning",
              message: `could not export ${miss.format}: ${miss.reason}`,
              hint: "this Blender build may not ship that exporter; remove the format from scene3d.json or install it",
              detail: { format: miss.format },
            });
          }
          /* Minecraft block-model deliverable: emit the JSON the game loads,
             lowered from the census on this side of the process boundary (the
             usdz pattern). Only a `minecraft` contract asks for it. Emitted
             before the export cache is written so it rides cache hits like the
             other deliverables. */
          if (normalized.minecraft.enabled && census) {
            try {
              const mc = emitMinecraftModel(census, normalized, request.projectDir, OUT_DIR);
              for (const d of mc.deliverables) {
                if (!rel.includes(d)) {
                  rel.push(d);
                  exportedAssets.push(d);
                }
              }
              if (mc.elements === 0) {
                issues.push({
                  code: ISSUE_CODES.VOXEL_NOT_CUBOID,
                  severity: "warning",
                  message: "the Minecraft model is empty — no part could be expressed as a cuboid element/cube",
                  hint: "author from box shapes; round and sloped shapes (spheres, cylinders, tubes, capsules, wedges) and rotated imports cannot be Minecraft cuboids",
                });
              }
            } catch (err: any) {
              issues.push({
                code: ISSUE_CODES.EXPORT_FORMAT_UNAVAILABLE,
                severity: "warning",
                message: `could not emit the Minecraft block model: ${String(err?.message ?? err)}`,
                detail: { format: "minecraft" },
              });
            }
          }
          if (!request.noCache && rel.length > 0) {
            writeCache(request.projectDir, "export", exportHash, {
              artifacts: rel,
              data: { lowering: lowering ?? null, usdzUpAxisWarned },
            });
          }
        }
        report("export", "ran", ms(te));
      }
    } else {
      // A REQUESTED export that produced nothing must say why — "skipped"
      // in the stage list with no issue let a USDA project (excluded from
      // needsBlender, so no BLENDER_NOT_FOUND either) return ok=true with
      // zero deliverables and nothing naming the gap. Info, not error:
      // the scene is fine; this machine is what is missing.
      if (!probe) {
        issues.push({
          code: ISSUE_CODES.BLENDER_NOT_FOUND,
          severity: "info",
          message:
            "export skipped — no Blender runtime on this machine, so the requested deliverables (GLB/USD/OBJ/FBX) were not produced",
          hint: "install Blender to produce deliverables; parse and lint results above are complete without it",
        });
      }
      report("export", "skipped", ms(te));
    }
  }

  /* What the manifest may claim as BAKED. The viewer subtracts this from
     tweaks.json to find pending edits, so it must describe the shipped
     geometry: the export stage is what applies tweaks into the GLB (fresh
     or cache-hit — the cache key includes them). A restricted pass that
     never exported, or an export that failed, keeps the PREVIOUS
     manifest's answer; claiming the full file baked there recreated the
     exact "work looked lost" failure this field exists to prevent. */
  const bakedTweaksForManifest =
    wanted.has("export") && exportedAssets.length > 0
      ? tweaks
      : previousManifestBakedTweaks(request.projectDir);

  /* Motion-vector atlases are companion deliverables: a real-time engine
     needs the `<name>_mv.png` beside the beauty flipbook to interpolate it.
     The path is derived from the shader spec (the runner lays it out by the
     same convention), added when the baked file is actually on disk.

     Gated on the EXPORT stage having run, for the same reason the manifest
     carry-forward below is: the mv atlas is written during BUILD, so a
     restricted compile (parse,build,lint,manifest — no export) would push it
     into an otherwise-empty exportedAssets, defeating the carry-forward that
     restores the previous compile's real deliverables and dropping the GLB /
     USD / LODs from the manifest. When export DID run, the mv joins the fresh
     exports; when it did not, the carry-forward restores the prior mv too. */
  if (wanted.has("export")) {
    const boundShaders = new Set(shaderBindings.map((b) => b.shader));
    for (const job of shaderJobs) {
      // The baked maps, but ONLY for a shader that is itself the product.
      //
      // A sheet shader — a flipbook, or any kernel no material binds — exists
      // to produce its atlas, and that atlas was reaching disk without ever
      // being declared, so the Export menu offered the geometry containers and
      // not the thing the scene was written to make. A shader bound to a
      // material is the opposite case: its bakes are INPUTS, already embedded
      // in the GLB and the USD, and listing them again offers the user the
      // same pixels twice under a worse name.
      const isProduct = job.frames > 1 || !boundShaders.has(job.name);
      if (isProduct) {
        for (const output of job.outputs) {
          const rel = `out/textures/${job.name}_${output}.png`;
          if (fs.existsSync(path.join(request.projectDir, rel)) && !exportedAssets.includes(rel)) {
            exportedAssets.push(rel);
          }
        }
      }
      if (!job.motionVectors || job.frames <= 1) continue;
      const mvRel = `out/textures/${job.name}_mv.png`;
      if (fs.existsSync(path.join(request.projectDir, mvRel)) && !exportedAssets.includes(mvRel)) {
        exportedAssets.push(mvRel);
      }
    }
    /* Sweep bakes from shaders that no longer exist — the same discipline
       the proof-frame sweep applies, for the same reason: a deleted
       shader's atlas otherwise survives every clean recompile and SHIPS.
       Only the generated naming pattern is touched (shd_ ids are
       charset-gated, so the pattern is tight); anything else in the
       directory is the user's and stays. */
    {
      const texDir = path.join(request.projectDir, "out", "textures");
      if (fs.existsSync(texDir)) {
        const current = new Set<string>();
        for (const job of shaderJobs) {
          for (const output of job.outputs) current.add(`${job.name}_${output}.png`);
          current.add(`${job.name}_mv.png`);
          // The compiler DERIVES a normal map from a height output — a
          // product of the job that appears in no outputs list, and the
          // first thing this sweep wrongly deleted.
          if (job.outputs.includes("height")) current.add(`${job.name}_normal.png`);
        }
        for (const entry of fs.readdirSync(texDir)) {
          if (!/^shd_[a-z0-9_]+_[a-z]+(?:Color)?\.png$/i.test(entry)) continue;
          if (current.has(entry)) continue;
          try {
            fs.rmSync(path.join(texDir, entry));
          } catch {
            /* A locked file stays; it will be reported stale next compile. */
          }
        }
      }
    }
  }

  /* ---- lint ------------------------------------------------------- */
  let lintIssues: Issue[] = [];
  if (wanted.has("lint")) {
    const tl = performance.now();
    // Read the shipped stage back off disk rather than trusting the export
    // step's return value: a cached export is just as much the deliverable
    // as a fresh one, and both must face the same rules.
    let exportedUsda: { text: string; file: string } | undefined;
    // A USDA-authored project's source IS its shipped stage — it is
    // deliberately never re-exported, which used to mean the whole
    // S3D-4xx stage-rule block silently never ran for exactly the
    // projects most likely to hand-author stage metadata wrong
    // (found by adversarial review). The source file faces the same
    // rules the export faces everywhere else.
    const usdaAsset =
      exportedAssets.find((a) => a.endsWith(".usda")) ??
      (source.kind === "usda"
        ? source.files.find((f) => f.toLowerCase().endsWith(".usda"))
        : undefined);
    if (usdaAsset) {
      try {
        exportedUsda = {
          text: fs.readFileSync(path.join(request.projectDir, usdaAsset), "utf8"),
          file: usdaAsset,
        };
      } catch {
        /* the export stage already reported anything that made it unreadable */
      }
    }
    // 2D sheets are decoded in-process, so they cost milliseconds and stay
    // checkable on a machine with no Blender at all.
    const sheets =
      normalized.sheets.length > 0 || derivedSheets.length > 0
        ? collectSheets(request.projectDir, [
            ...(normalized.sheets as SheetSpec[]),
            ...(derivedSheets as SheetSpec[]),
          ])
        : undefined;

    lintIssues = runLint({
      contract: normalized,
      census,
      primTree,
      proofFrames,
      ...(offByFrame ? { offByFrame } : {}),
      ...(exportedUsda ? { exportedUsda } : {}),
      ...(sheets ? { sheets } : {}),
      ...(spec?.claims ? { claims: spec.claims } : {}),
      ...(solved ? { solved } : {}),
      // The language's own sentence for "this hovers on purpose": a part
      // placed by `above` is a declared float, and the two-sided grounded
      // claim honours it instead of demanding a support chain for it.
      ...(spec
        ? {
            declaredFloating: spec.relations
              .filter((r) => r.type === "above")
              .map((r) => r.part),
          }
        : {}),
      sourceKind: source.kind,
      // Only what the author actually wrote. A target preset fills in
      // conventions too, but a preset is a default, not a statement of intent,
      // and must not cancel the relaxation on their behalf.
      authoredKeys,
      // Each recipe part's exact predicted census, adjudicated against the
      // census Blender measured — the compiler checking its own author.
      ...(kernelPredictions.length > 0 ? { kernelPredictions } : {}),
    });
    /* The two animated-claim oracles both live in lint/claims.ts now —
       the sampled census envelope AND the analytic swept envelope
       (solve/sweep.ts), joined by one interval calculus: samples prove
       failures, exact swept boxes prove failures, the full envelope proves
       passes, and a conservative bound over a claim is said to be UNPROVEN
       rather than either passed or failed. The two hard-coded bob/screw
       blocks that used to sit here were special cases of the exact swept
       box and were deleted when the calculus generalised them (they could
       also contradict the census layer about the same claim, two lines
       apart — the D7 field finding). */
    /* Plan-versus-build for the escape hatches: a file/script part's
       declared box is a placement ENVELOPE, and the fit inside it is
       uniform-scale to the tightest axis — so a declared aspect ratio the
       asset does not have shrinks the whole part and leaves the box mostly
       empty. Measured (census box vs solved box), judged structurally: half
       the declared extent unused on some axis is past any plausible
       "loose framing" and into "the plan and the build are different
       objects". The half threshold needs no contract knob — it separates
       intent mismatch from slack, not taste from taste. */
    if (solved && census) {
      for (const part of solved.parts) {
        if (!part.file && !part.script) continue;
        const mesh = census.meshes.find((m) => m.object === part.id);
        if (!mesh?.spatial?.worldMin || !mesh.spatial.worldMax) continue;
        const built = [0, 1, 2].map(
          (i) => mesh.spatial!.worldMax![i]! - mesh.spatial!.worldMin![i]!,
        );
        const fit = built.map((d, i) => (part.size[i]! > 1e-9 ? d / part.size[i]! : 1));
        const worst = fit.indexOf(Math.min(...fit));
        const best = Math.max(...fit);
        if (fit[worst]! < 0.5) {
          // The suggested box keeps the constraining axis where the author
          // put it and reshapes the others to the asset's own proportions.
          const proposed = built.map((d) => Number((d / best).toFixed(3)));
          lintIssues.push({
            code: ISSUE_CODES.FILE_PART_UNDERFILLS,
            severity: "warning",
            message: `'${part.id}' fills ${(fit[worst]! * 100).toFixed(0)}% of its declared box on ${"xyz"[worst]} — the asset's aspect ratio does not match the box, so the uniform fit shrank the whole part (built ${built.map((d) => d.toFixed(3)).join(" × ")}m inside a declared ${part.size.map((v) => v.toFixed(3)).join(" × ")}m)`,
            target: part.id,
            hint: `reshape the declared size toward the asset's own proportions (about ${proposed.join(" × ")} keeps the constraining axis and fills the rest), or accept the slack if the envelope is intentional`,
            detail: {
              fit: fit.map((f) => Number(f.toFixed(4))),
              built: built.map((d) => Number(d.toFixed(4))),
              declared: part.size.map((v) => Number(v.toFixed(4))),
            },
          });
        }
      }
    }
    // Hand every exported .glb to Khronos's reference validator — a second,
    // independent authority on the bytes that ship, in ADDITION to our rules.
    // The UNCHECKED warning is NOT filtered here (unlike USD below): the
    // validator is a declared npm dependency, so its failure to load is a real
    // environment breakage worth surfacing, per the codebase's "unchecked is
    // never passed silently" rule.
    for (const glb of exportedAssets.filter((a) => a.toLowerCase().endsWith(".glb"))) {
      lintIssues.push(...(await validateGltf(request.projectDir, glb)));
    }
    // And the exported USD stage to OpenUSD's own runtime. The UNCHECKED
    // warning IS dropped here: unlike the bundled glTF validator, the USD
    // oracle is host-optional (needs pxr), so a machine without it should get
    // silence, not a warning on every compile. Real conformance findings
    // (E-502/W-502) still surface.
    if (exportedUsda) {
      const usdIssues = await validateUsd(request.projectDir, exportedUsda.file);
      lintIssues.push(...usdIssues.filter((i) => i.code !== ISSUE_CODES.USD_UNCHECKED));
    }
    report("lint", "ran", ms(tl));
  }

  /* ---- manifest --------------------------------------------------- */
  /** The manifest AS PERSISTED — the result returns this same object so the
   *  compile response and `out/manifest.json` can never disagree. */
  let finalManifest: ReturnType<typeof buildManifest> | undefined;
  if (wanted.has("manifest")) {
    const tm = performance.now();
    // A restricted compile (`--stages parse,build,lint` — the fast loop the
    // skill itself recommends) must not amnesia the manifest: the proof
    // frames and exports on disk are still the scene's deliverables. Carry
    // them forward from the previous manifest when their stage was not
    // asked to run, verifying each file still exists.
    let proofCarried = false;
    let carriedProofViews: ProofView[] | undefined;
    let carriedContactSheet: ContactSheetSummary | undefined;
    if (!wanted.has("proof") && proofImages.length === 0) {
      const block = carriedProofBlock(request.projectDir);
      proofImages.push(...block.images);
      proofCarried = block.images.length > 0;
      if (proofCarried) {
        // The whole coherent block rides with the frames: poses, part rectangles
        // (so the panel still picks parts), id-map legend, per-frame stats, and
        // the contact sheet as-drawn — none re-derived from this compile.
        carriedProofViews = block.views;
        carriedContactSheet = block.contactSheet;
        if (proofRects === undefined) proofRects = block.rects;
        if (proofIdParts === undefined) proofIdParts = block.idParts;
        if (proofFrames === undefined) proofFrames = block.frames;
      }
    }
    if (!wanted.has("export") && exportedAssets.length === 0) {
      exportedAssets.push(...previousManifestArtifacts(request.projectDir, "exportedAssets"));
    }
    const allIssues = attributeIssues([...issues, ...lintIssues], census);

    /* ---- the read model ---------------------------------------------
     * A compile that only says pass/fail makes the reader open the result
     * and look. These two artifacts let them read instead: a budgeted
     * summary of what the scene IS, and a report of what this edit
     * changed — including the relationships that changed without anything
     * the author touched having moved.
     *
     * Both are derived from measurements already taken, so they cost no
     * extra Blender time and cannot disagree with the census.
     */
    const prior = previousReadModel(request.projectDir);
    impact = changeImpact(prior?.census, census, prior?.issues ?? [], allIssues);
    /* The codec pass: classify this solve against the previous one —
       authored edits and their graph-predicted propagation compress to
       counts; only the residual (a change nothing authored explains)
       earns lines in the report. Absent baseline or basis mismatch
       degrades to no delta, never a fabricated one. */
    if (solveSnapshot && prior?.solve) {
      solveDelta = classifySolveDelta(prior.solve, solveSnapshot);
    }
    digest = census ? describeScene(census, allIssues) : "no census — build stage did not run";
    try {
      /* The baseline is the last SUCCESSFUL build, held across failures: a
         failed compile writes its own issues (the parse error IS the delta
         worth diffing against) but keeps the prior census, so the first
         success after a red stretch diffs against the world as it last
         measurably was — not against the empty world of the failure, which
         used to re-announce the whole scene as `appeared`. The carry is
         marked so a read-model reader can tell measurement from memory. */
      writeReadModel(request.projectDir, {
        version: READ_MODEL_VERSION,
        census: census ?? prior?.census,
        ...(census === undefined && prior?.census !== undefined
          ? { censusFrom: "previous successful build" }
          : {}),
        issues: allIssues,
        digest,
        impact,
        ...(solveSnapshot ? { solve: solveSnapshot } : {}),
      });
    } catch (err: any) {
      /* Disk full / permissions. The compile finished; the response still
         carries the digest and impact. Say what is missing on disk. */
      issues.push({
        code: ISSUE_CODES.DELIVERABLE_WRITE_FAILED,
        severity: "warning",
        message: `could not write the read model (digest.md, ortho.svg): ${String(err?.message ?? err)}`,
      });
    }

    /* Where each frame was photographed from.
       The compiler always knew this and never said it, so `proof-<hash>-003`
       was a picture of an unidentified side and "check the back" was not a
       move a reader could make. `describeProofViews` refuses to guess when
       the camera was authored rather than orbited — absent beats wrong.

       When the frames were CARRIED from a previous compile (proof did not run
       this pass), their poses are what THAT compile measured — not the current
       proof options, which may differ (a turntable request after an authored-
       camera render would otherwise relabel a still as `front · az 0°`). Read
       them back from the previous manifest, reconstructing each `eye` from its
       angles; absent there (the prior render was authored) stays absent. */
    const proofViews: ProofView[] | undefined = proofCarried
      ? carriedProofViews
      : describeProofViews({
          frameCount: proofImages.length,
          turntable: proofOpts.turntable !== false,
          /* The render went through the AUTHOR'S camera whenever the runner
             did not aim one itself — which is `respectSceneCamera`, and also
             a non-turntable proof of a scene that has its own camera: the
             runner uses `scene.camera` there and never re-aims it. Reading
             only the flag labelled that frame `front · az 0°` while the
             camera sat wherever the author put it, and the wrong name then
             travelled to the manifest, the contact sheet, its gnomon and the
             web scrubber.

             `camera.staging` deliberately does NOT enter this: the flag asks
             "did the runner aim this camera", not "who placed it". A staging
             camera is not re-aimed either, and its pose is measured the same
             way — a bare import photographs at a measured 45 and is named
             front-right, which is what it is. */
          authoredCamera:
            proofOpts.respectSceneCamera === true ||
            (proofOpts.turntable === false && census?.camera.present === true),
          // The runner MEASURED the placed camera's pose, so an authored still
          // gets an honest compass name instead of silence.
          ...(census?.camera.azimuthDeg !== undefined
            ? { authoredAzimuthDeg: census.camera.azimuthDeg }
            : {}),
          ...(census?.camera.elevationDeg !== undefined
            ? { authoredElevationDeg: census.camera.elevationDeg }
            : {}),
        });


    /* Recomputed AFTER the read-model write attempt: a failed write pushed
       DELIVERABLE_WRITE_FAILED into `issues`, and building the manifest
       from the earlier list made the response and the manifest disagree
       about that warning — the exact response-versus-disk split the
       single-manifest discipline exists to prevent. (A failed MANIFEST
       write below can only ride the response; an artifact cannot contain
       the failure to write itself.) */
    const manifestIssues = attributeIssues([...issues, ...lintIssues], census);
    /* Everything the manifest derives from EXCEPT the issue list — a later
       fallible write (the contact sheet, below) can still grow that list, so
       the manifest is rebuilt from these once the final issues are known,
       keeping summary/issueCodes/actionableCodes consistent with one another
       through one definition (buildManifest). */
    const manifestInput = {
      source,
      projectDir: request.projectDir,
      carried: carriedRecord,
      ...(proofFrames ? { proofFrames } : {}),
      ...(proofRects ? { proofRects } : {}),
      ...(proofIdParts ? { proofIdParts } : {}),
      census,
      proofImages,
      exportedAssets,
      blenderUsed: probe !== null && needsBlender,
      blenderVersion: probe?.version ?? null,
      bakedTweaks: bakedTweaksForManifest,
      sheets: [...normalized.sheets, ...derivedSheets],
      ...(spec?.claims ? { claimsDeclared: Object.keys(spec.claims).length } : {}),
      ...(spec?.claims ? { claimMargins: claimMargins(spec.claims, census, solved?.parts) } : {}),
      // The licence behind a held grounded claim, for the ledger: the
      // reader must be able to tell "everything reaches the ground" from
      // "the hovering parts were declared as hovering on purpose".
      ...(spec?.claims?.grounded
        ? {
            claimsLicensedFloats: [
              ...new Set(spec.relations.filter((r) => r.type === "above").map((r) => r.part)),
            ].sort(),
          }
        : {}),
    };
    const baseManifest = buildManifest({
      ...manifestInput,
      issues: manifestIssues,
      summary: summarize(manifestIssues),
    });

    /* The contact sheet: the whole orbit on one labelled page.
       Drawn here, between building the manifest and writing it, because its
       header quotes the census metrics the manifest just derived — reading
       them rather than re-deriving them keeps one definition of "how big is
       this scene". A failure is reported and survivable, like the read
       model's: the compile's products are the frames and the exports, and a
       sheet that could not be drawn must not take them down with it.

       On a CARRIED pass the frames are the last render's, so the sheet is too:
       redrawing it here would stamp THIS compile's metrics (world size, tris,
       part count) onto stale pictures, a page whose facts and images disagree.
       The carried sheet — drawn when those frames were fresh, its facts theirs —
       is reused as-is instead. */
    let contactSheet: ContactSheetSummary | undefined = proofCarried ? carriedContactSheet : undefined;
    if (!proofCarried && proofImages.length > 0) {
      try {
        contactSheet = writeContactSheet(request.projectDir, {
          title: sceneTitle(request, source),
          images: proofImages,
          views: proofViews,
          idParts: proofIdParts,
          metrics: baseManifest.metrics,
        });
      } catch (err: any) {
        issues.push({
          code: ISSUE_CODES.DELIVERABLE_WRITE_FAILED,
          severity: "warning",
          message: `could not write the proof contact sheet (out/contact.png): ${String(err?.message ?? err)}`,
        });
      }
    }
    /* Recomputed AGAIN after the contact-sheet write, for the same reason the
       read-model write forced the recompute above: writeContactSheet can push a
       DELIVERABLE_WRITE_FAILED, and a manifest built from the pre-contact-sheet
       issues would report the warning in the response while the persisted
       manifest denied it — the response-versus-disk split the single-manifest
       discipline exists to prevent. Rebuilt from the SAME inputs (one
       definition, not a hand-patched field) only when the list actually grew;
       baseManifest — already drawn from for its metrics — stands otherwise. */
    const finalManifestIssues = attributeIssues([...issues, ...lintIssues], census);
    const builtManifest =
      finalManifestIssues.length === manifestIssues.length
        ? baseManifest
        : buildManifest({ ...manifestInput, issues: finalManifestIssues, summary: summarize(finalManifestIssues) });
    const manifest: Scene3dManifest = {
      ...builtManifest,
      /* The pose as ANGLES, without the `eye` unit vector the in-process
         view carries. The vector is a pure function of the two angles
         (`orbitEye`), so persisting it would be derived state that can
         drift from its own source — and it serialises as three 17-digit
         floats per frame for a reader that can recompute it exactly. */
      ...(proofViews
        ? {
            proofViews: proofViews.map((v) => ({
              index: v.index,
              azimuthDeg: v.azimuthDeg,
              elevationDeg: v.elevationDeg,
              name: v.name,
            })),
          }
        : {}),
      ...(contactSheet ? { contactSheet } : {}),
    };
    contactSheetSummary = contactSheet;
    try {
      finalManifest = writeManifest(request.projectDir, manifest);
      // The viewer is part of the deliverable, not a debug aid: it is the only
      // thing in `out/` a file browser can actually open and play.
      if (proofImages.length > 0) {
        writeViewer(request.projectDir, finalManifest, proofImages, request.scenePath);
      }
    } catch (err: any) {
      /* The compile is done and its findings are real; a failed manifest
         write must not turn a finished compile into a bare 500. The result
         falls back to the in-memory manifest below. */
      finalManifest = manifest;
      issues.push({
        code: ISSUE_CODES.DELIVERABLE_WRITE_FAILED,
        severity: "warning",
        message: `could not write out/manifest.json or the viewer: ${String(err?.message ?? err)}`,
      });
    }
    report("manifest", "ran", ms(tm));
  }

  /* ---- result ----------------------------------------------------- */
  const allIssues = attributeIssues([...issues, ...lintIssues], census);
  const summary: IssueSummary = summarize(allIssues);
  return {
    ok: summary.errors === 0,
    source,
    stages,
    issues: allIssues,
    census,
    primTree,
    /* The persisted manifest when the manifest stage ran — response and
       disk are then the SAME object (same generatedAt). Building a second
       manifest here used to hand the HTTP response a fresh stamp while the
       panel hydrated the stable one from disk. The fallback build only
       runs for `--stages` requests that skipped the manifest stage. */
    manifest:
      finalManifest ??
      buildManifest({
        source,
        projectDir: request.projectDir,
        carried: carriedRecord,
        ...(proofFrames ? { proofFrames } : {}),
        ...(proofRects ? { proofRects } : {}),
        ...(proofIdParts ? { proofIdParts } : {}),
        census,
        issues: allIssues,
        summary,
        proofImages,
        exportedAssets,
        blenderUsed: probe !== null && needsBlender,
        blenderVersion: probe?.version ?? null,
        bakedTweaks: bakedTweaksForManifest,
        sheets: [...normalized.sheets, ...derivedSheets],
        ...(spec?.claims ? { claimsDeclared: Object.keys(spec.claims).length } : {}),
      ...(spec?.claims ? { claimMargins: claimMargins(spec.claims, census, solved?.parts) } : {}),
      // The licence behind a held grounded claim, for the ledger: the
      // reader must be able to tell "everything reaches the ground" from
      // "the hovering parts were declared as hovering on purpose".
      ...(spec?.claims?.grounded
        ? {
            claimsLicensedFloats: [
              ...new Set(spec.relations.filter((r) => r.type === "above").map((r) => r.part)),
            ].sort(),
          }
        : {}),
      }),
    proofImages,
    /* Every resolved pose travels back, whether or not its frame landed: the
       pose IS the answer to "where was I standing", and a shot that failed to
       render is still a shot the agent asked for and must be told about. */
    looks: resolvedLooks.map((pose, i) => ({
      ...(lookPaths[i] ? { path: lookPaths[i]! } : {}),
      pose,
    })),
    ...(looksRejected.length > 0 ? { looksRejected } : {}),
    materialBalls,
    ...(materialBallsSkipped > 0 ? { materialBallsSkipped } : {}),
    ...(materialBallsSkippedNames.length > 0 ? { materialBallsSkippedNames } : {}),
    ...(materialBallStats.length > 0 ? { materialBallStats } : {}),
    exportedAssets,
    summary,
    digest,
    impact,
    ...(solveDelta ? { solveDelta } : {}),
    ...(solved ? { solved } : {}),
  };
}

/**
 * Point every issue at the source line that produced the geometry it is
 * about.
 *
 * Done centrally rather than in each rule for two reasons: no lint rule
 * should have to know provenance exists, and a rule added later gets the
 * behaviour for free. A rule only has to name what it is talking about via
 * `target`, which it already does.
 *
 * Targets that name a pair ("a <-> b") resolve to both origins, because the
 * useful answer to "these two overlap" is usually the two lines, not one.
 */
export function attributeIssues(issues: Issue[], census: Census | undefined): Issue[] {
  const origins = census?.provenance;
  if (!origins || Object.keys(origins).length === 0) return issues;

  return issues.map((issue) => {
    if (!issue.target) return issue;
    const names = issue.target.split("<->").map((s) => s.trim()).filter(Boolean);
    const found = names
      .map((name) => ({ name, at: origins[name] }))
      .filter((row): row is { name: string; at: { file: string; line: number | null } } =>
        Boolean(row.at),
      );
    if (found.length === 0) return issue;
    return {
      ...issue,
      detail: {
        ...issue.detail,
        origin: found.map((row) => ({
          part: row.name,
          file: row.at.file,
          line: row.at.line,
          // Pre-formatted because this is the string a reader wants to
          // paste into an editor, and every consumer would otherwise
          // rebuild it identically.
          at: row.at.line === null ? row.at.file : `${row.at.file}:${row.at.line}`,
        })),
      },
    };
  });
}

/**
 * Narrow the runner's (or the cache's) frame payload to typed stats.
 *
 * The stats cross a process boundary and a cache file, so a malformed
 * payload has to degrade to "unmeasured" rather than throw — a broken stat
 * must never be the reason a compile fails.
 */
/**
 * Delete proof renders left behind by earlier compiles of this scene.
 *
 * Frame filenames carry the proof input hash, so a scene edited N times
 * accumulates N full turntables. Only the current set is kept; anything else
 * in `out/proof/` matching the generated-frame naming pattern is removed.
 * Files that do not match the pattern are left alone — the directory is
 * visible to the user now, so it must not eat something they put there.
 */
/** Artifact paths from the last written manifest that still exist on disk. */
/** The file holding everything a reader needs without opening the asset. */
const READ_MODEL_FILE = "read-model.json";

/**
 * Bump when the census/issue shape the delta reads changes incompatibly. A
 * baseline written by an older compiler is treated as absent rather than
 * diffed: comparing new census fields against a baseline that lacks them
 * fabricates "everything moved", and a wrong delta is worse than no delta —
 * the agent acts on it.
 */
const READ_MODEL_VERSION = 1;

interface ReadModel {
  /** Absent on read → written before versioning → treat as no baseline. */
  version?: number;
  census?: Census;
  /** Present when `census` is carried forward from an earlier successful
   *  build because THIS compile measured nothing — memory, not
   *  measurement, and labelled as such. */
  censusFrom?: string;
  issues: Issue[];
  digest: string;
  impact: ImpactReport;
  /** The solve frozen as the next compile's prediction frame — absent for
   *  non-spec scenes and for baselines written before it existed, which
   *  degrades to "no solve delta", never to a wrong one. */
  solve?: SolveSnapshot;
}

/**
 * The read model written by the previous compile, if any.
 *
 * Read before this run overwrites it — comparing against it is what turns a
 * compile from a verdict into a report of what the edit actually did.
 * Absent on a first compile, which is not an error: there is simply nothing
 * to have changed from.
 */
/**
 * A JSON syntax error located the way every SEMANTIC error already is: with
 * a line, a column, and the text around it. The raw V8 message carries only
 * a byte offset (and mangles the quoting), which made malformed JSON the
 * one mistake this compiler located worse than `python -m json.tool` —
 * every other error in the file gets a precise JSON path.
 */
function jsonSyntaxDetail(err: Error, raw: string | undefined): string {
  const msg = err.message;
  const pos = /position (\d+)/.exec(msg);
  if (!raw || !pos) return msg;
  const at = Math.min(Number(pos[1]), raw.length);
  const before = raw.slice(0, at);
  const line = before.split("\n").length;
  const col = at - before.lastIndexOf("\n");
  const from = Math.max(0, at - 30);
  const to = Math.min(raw.length, at + 30);
  const snippet = raw.slice(from, to).replace(/\s+/g, " ").trim();
  return `${msg} — scene.json line ${line}, column ${col}, near: ${snippet}`;
}

function previousReadModel(projectDir: string): ReadModel | undefined {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(projectDir, OUT_DIR, READ_MODEL_FILE), "utf8"),
    ) as ReadModel;
    // A hand-corrupted or half-written file must not fail the compile; the
    // worst case is one run without a diff.
    if (!parsed || typeof parsed !== "object") return undefined;
    // A baseline from an older compiler is not comparable — degrade to "no
    // baseline" (silence) rather than risk a fabricated delta.
    if (parsed.version !== READ_MODEL_VERSION) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Written with no timestamp and stable key order, so two compiles of an
 * unchanged scene produce byte-identical files. That is what makes the read
 * model itself diffable, which is most of its value.
 */
/**
 * Read the viewer's edit sidecar, naming everything it drops.
 *
 * `tweaks.json` is written by an iframe and edited by hand, so it really does
 * arrive truncated, half-written, or carrying values the runner cannot apply.
 * Dropping those is right — a bad viewer write must never wedge the scene —
 * but dropping them QUIETLY made the compile a liar: the geometry reverted to
 * the rest pose and the report said the scene was clean. Each rejection comes
 * back as a note so the caller can say which edit was ignored and why.
 *
 * Channel validation is here rather than in the runner because "the runner
 * ignored it" is not observable from the outside: `apply_tweaks` skipped a
 * non-positive scale with a bare `pass`, so a `[1,1,-1]` mirror silently did
 * nothing, while the same negative scale authored in a spec is S3D-E-327.
 */
export function readTweaks(raw: string): {
  tweaks: Record<string, PartTweak> | undefined;
  notes: string[];
} {
  const notes: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { tweaks: undefined, notes: [`not valid JSON (${(err as Error).message}) — viewer edits ignored`] };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { tweaks: undefined, notes: ["not an object of part edits — viewer edits ignored"] };
  }

  const triple = (v: unknown): v is [number, number, number] =>
    Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));
  const quad = (v: unknown): v is [number, number, number, number] =>
    Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number" && Number.isFinite(n));

  const out: Record<string, PartTweak> = {};
  for (const [part, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      notes.push(`'${part}' is not an edit object — ignored`);
      continue;
    }
    // Copy first, then reject: an allow-list would silently drop any channel
    // this reader has not heard of — including `rotate`, which the runner
    // still honours for sidecars written by an older viewer. Becoming a new
    // silent dropper while fixing one is not a fix.
    const tweak = { ...(value as Record<string, unknown>) };
    const drop = (key: string, why: string) => {
      notes.push(`'${part}'.${key} ${why} — ignored`);
      delete tweak[key];
    };
    for (const key of ["translate", "rotate"]) {
      if (tweak[key] !== undefined && !triple(tweak[key])) drop(key, "is not three finite numbers");
    }
    if (tweak.quat !== undefined && !quad(tweak.quat)) drop("quat", "is not four finite numbers");
    if (tweak.scale !== undefined) {
      if (!triple(tweak.scale)) drop("scale", "is not three finite numbers");
      // A mirror is a legitimate modelling operation but not a viewport one:
      // the runner cannot apply it without flipping normals, and shipping a
      // negative scale is S3D-E-327 anyway. Say so instead of no-op'ing it.
      else if (tweak.scale.some((n) => n <= 0)) {
        drop("scale", `${JSON.stringify(tweak.scale)} is not positive (a mirrored scale is not a viewport edit)`);
      }
    }
    if (tweak.material !== undefined && (typeof tweak.material !== "object" || tweak.material === null || Array.isArray(tweak.material))) {
      drop("material", "is not an object");
    }
    if (Object.keys(tweak).length > 0) out[part] = tweak as PartTweak;
  }
  return { tweaks: Object.keys(out).length > 0 ? out : undefined, notes };
}


/**
 * Report shading capability the sources declared that the shipped glTF does
 * not carry.
 *
 * Per SOURCE file, because that is the granularity the loss happens at: a
 * scene may import three assets and lose transmission from only one of them.
 * The message names the extensions rather than a count, since "you lost
 * KHR_materials_transmission" is actionable and "materials degraded" is not.
 */
function emitMaterialCapabilityParity(
  projectDir: string,
  source: SceneSource,
  solved: SolvedScene | undefined,
  exported: string[],
  issues: Issue[],
  /** Channel names the spec authored, across every material. */
  authoredChannels: ReadonlyMap<string, readonly string[]> = new Map(),
): void {
  const shipped = exported.find((a) => a.toLowerCase().endsWith(".glb"));
  if (shipped === undefined) return;
  const shippedAbs = path.join(projectDir, shipped);

  // Every glTF container this scene was built from: a bare mesh source, or the
  // `file:` parts of a spec.
  const sources = new Set<string>();
  for (const file of source.files) {
    if (/\.(glb|gltf)$/i.test(file)) sources.add(path.join(projectDir, file));
  }
  for (const part of solved?.parts ?? []) {
    if (part.file !== undefined && /\.(glb|gltf)$/i.test(part.file)) {
      sources.add(path.join(projectDir, part.file));
    }
  }

  /* Channels the AUTHOR wrote that the shipped container does not carry.
     The compiler sets every one of them on the surface it builds and the
     proof photographs that surface — so the render is honest. The deliverable
     is a separate question: OpenUSD is the master and every container is
     lowered from it, so a channel UsdPreviewSurface cannot express reaches the
     picture and not the file. Measured by reading the shipped glTF, and
     reported per channel, because an author who wrote `sheen` and shipped a
     GLB has no other way to learn it did not travel. */
  if (authoredChannels.size > 0) {
    const lostChannels = lostAuthoredChannels(authoredChannels, shippedAbs);
    if (lostChannels.length > 0) {
      // Grouped by material, because that is the granularity the loss happens
      // at and the granularity an author can act on.
      const byMaterial = new Map<string, string[]>();
      for (const l of lostChannels) {
        byMaterial.set(l.material, [...(byMaterial.get(l.material) ?? []), l.channel]);
      }
      const described = [...byMaterial.entries()]
        .map(([m, cs]) => `${m} (${cs.sort().join(", ")})`)
        .sort()
        .join("; ");
      issues.push({
        code: ISSUE_CODES.MASTER_MATERIAL_CAPABILITY,
        severity: "warning",
        message: `the shipped glTF does not carry channels authored on ${described} — the proof frames show them, the .glb does not`,
        hint: "OpenUSD is the master and every container is lowered from it; out/scene.usda carries what UsdPreviewSurface and MaterialX can express, so ship the USD where the effect matters",
        detail: {
          lost: lostChannels.map((l) => `${l.material}.${l.channel}`).sort(),
          extensions: [...new Set(lostChannels.map((l) => l.extension))].sort(),
          shipped,
        },
      });
    }
  }

  for (const sourceAbs of [...sources].sort()) {
    const lost = lostShadingCapability(sourceAbs, shippedAbs);
    if (lost.length === 0) continue;
    const name = path.relative(projectDir, sourceAbs).split(path.sep).join("/");
    issues.push({
      code: ISSUE_CODES.MASTER_MATERIAL_CAPABILITY,
      severity: "warning",
      message: `'${name}' declares ${lost.join(", ")}, which the shipped glTF does not carry — those materials render differently than the source`,
      hint: "USD is the master format and UsdPreviewSurface cannot express these; ship the original file alongside if the effect matters",
      file: name,
      detail: { lost, shipped },
    });
  }
}

/** What the contact sheet reported about itself, for the manifest and report. */
export interface ContactSheetSummary {
  /** Project-relative path to the sheet. */
  path: string;
  /** Legend number → part name, exactly as drawn. */
  legend: Array<{ badge: number; part: string }>;
  /** Parts the orbit never showed a pixel of. */
  neverVisible: string[];
}

/**
 * Draw and write `out/contact.png`.
 *
 * The turntable's frames are the compiler's most information-dense product
 * and, as loose serially-named PNGs, its least usable one: nothing on a frame
 * says which side it photographs or which shape is which part, so a reader
 * opens several and carries nothing between them. This composes all of them
 * onto one labelled page — compass names and azimuths from the same `views`
 * module the text report quotes, an axis gnomon projected from the real
 * camera pose, and one numbered badge per part keyed to a legend.
 *
 * A frame that will not decode is drawn as a labelled blank rather than
 * skipped, so a sheet with a hole in it looks like one.
 */
function writeContactSheet(
  projectDir: string,
  input: {
    title: string;
    images: string[];
    views: ProofView[] | undefined;
    idParts: string[] | undefined;
    metrics: Scene3dManifest["metrics"];
  },
): ContactSheetSummary | undefined {
  const frames = input.images.map((rel, index) => {
    const abs = path.join(projectDir, rel);
    const idAbs = abs.replace(/\.png$/i, ".idx.png");
    return {
      png: fs.readFileSync(abs),
      // The id map is an enhancement, not a dependency: without it the sheet
      // still orients the reader, it just cannot name the shapes.
      ...(fs.existsSync(idAbs) ? { idPng: fs.readFileSync(idAbs) } : {}),
      ...(input.views?.[index] ? { view: input.views[index]! } : {}),
    };
  });

  const worldSize = input.metrics?.worldSize;
  const facts = [
    `${frames.length} ${frames.length === 1 ? "frame" : "frames"}`,
    worldSize
      ? `world ${worldSize.map((v: number) => Number(v.toFixed(2))).join(" × ")} m`
      : null,
    input.metrics?.totalTriangles
      ? `${input.metrics.totalTriangles.toLocaleString("en-US")} tris`
      : null,
    input.idParts ? `${input.idParts.length} parts` : null,
  ].filter((f): f is string => f !== null);

  const sheet = renderContactSheet({
    title: input.title,
    frames,
    ...(input.idParts ? { idParts: input.idParts } : {}),
    facts,
  });
  const dir = path.join(projectDir, OUT_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, CONTACT_SHEET_FILE), sheet.png);
  return {
    path: `${OUT_DIR}/${CONTACT_SHEET_FILE}`,
    legend: sheet.legend,
    neverVisible: sheet.neverVisible,
  };
}

const CONTACT_SHEET_FILE = "contact.png";

/**
 * What to call this compile on the sheet.
 *
 * The scene directory's own name, which is what the author typed and what
 * every path in the report already shows. Falling back to the project
 * directory keeps a single-scene project from being titled `.`.
 */
function sceneTitle(request: CompileRequest, source: { files: string[] }): string {
  const fromScene = request.scenePath
    ? path.basename(request.scenePath.replace(/[\\/]+$/, ""))
    : "";
  if (fromScene && fromScene !== "." && fromScene !== "..") return fromScene;
  const first = source.files[0];
  if (first) {
    const parent = path.dirname(first);
    if (parent && parent !== "." && parent !== "..") return path.basename(parent);
  }
  return path.basename(request.projectDir) || "scene";
}

function writeReadModel(projectDir: string, model: ReadModel): void {
  const dir = path.join(projectDir, OUT_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, READ_MODEL_FILE), JSON.stringify(model, null, 2), "utf8");
  // Plain text beside the JSON: the digest is meant to be read, and asking
  // a reader to parse JSON to reach prose is a tax with no payer.
  const impactText = formatImpact(model.impact);
  // Orthographic elevations with the dimensions written on them. Unlike the
  // proof frames, which are perspective and answer "does it look right",
  // these answer "what size is it and where" — and because they are SVG,
  // the answer is text a reader can take without seeing the picture.
  const dimensions = model.census ? orthoDimensions(model.census) : "no census";
  if (model.census) {
    fs.writeFileSync(path.join(dir, "ortho.svg"), renderOrthoSvg(model.census), "utf8");
    // The same three elevations as ASCII box-art — proportion and height a
    // text-only model reads natively, without parsing SVG paths. The primary
    // spatial feedback in the --fast gear, where there are no proof frames.
    fs.writeFileSync(path.join(dir, "ortho.txt"), renderOrthoAscii(model.census), "utf8");
  }
  fs.writeFileSync(
    path.join(dir, "digest.md"),
    `# Scene digest\n\n${model.digest}\n\n` +
      `## Change since last compile\n\n${impactText}\n\n` +
      `## Dimensions\n\n\`\`\`\n${dimensions}\n\`\`\`\n\n` +
      `Orthographic plan/front/side drawing: \`ortho.svg\`\n`,
    "utf8",
  );
}

function previousManifestArtifacts(
  projectDir: string,
  key: "proofImages" | "exportedAssets",
): string[] {
  try {
    const previous = JSON.parse(
      fs.readFileSync(path.join(projectDir, OUT_DIR, "manifest.json"), "utf8"),
    ) as { proofImages?: string[]; exportedAssets?: string[] };
    return (previous[key] ?? []).filter(
      (rel) => typeof rel === "string" && fs.existsSync(path.join(projectDir, rel)),
    );
  } catch {
    return [];
  }
}

/**
 * The proof-frame poses from the previous manifest, for a pass that CARRIES its
 * frames rather than rendering them. The manifest stores each view's angles and
 * name but not its `eye` unit vector (derivable, so not persisted); this
 * reconstructs `eye` with the same `orbitEye` the live path uses, so a carried
 * contact sheet draws the same gnomon it did when the frames were fresh. Returns
 * undefined when the previous render had no derivable pose (an authored camera),
 * which is the honest label for the carried frames too.
 */
interface CarriedProofBlock {
  images: string[];
  views: ProofView[] | undefined;
  rects: Scene3dManifest["proofRects"];
  idParts: string[] | undefined;
  frames: Scene3dManifest["proofFrames"];
  contactSheet: ContactSheetSummary | undefined;
}

/**
 * The proof block a carrying pass reuses from the previous manifest — the frames
 * and every artifact coupled to them: poses, part rectangles, id-map legend,
 * per-frame stats, and the contact sheet.
 *
 * A restricted compile (`parse,build,lint`) does not re-render, so it presents
 * the LAST render's artifacts rather than none. Two disciplines keep that
 * honest, and they are the whole point of gathering the block in one place:
 *
 *  - The FRAMES carry only if every one still exists on disk (a partial set is
 *    a broken orbit), and each POSITIONAL companion — poses, rects, per-frame
 *    stats — carries only when its length matches the frames, so it stays
 *    paired to the right frame. An incoherent or absent companion is dropped,
 *    not force-fit: a right view labelled `front` or a rect that picks the
 *    wrong part is worse than an unlabelled frame ("absent beats wrong", the
 *    same rule the pose module keeps for an authored camera). A pre-feature
 *    manifest (frames, none of this metadata) thus carries bare frames — the
 *    behavior it always had — and gains the rest on its next FULL compile.
 *  - The CONTACT SHEET carries as the reference it already is — drawn when
 *    these frames were fresh, its embedded facts theirs. The caller does not
 *    REDRAW it on a carried pass, which would stamp this compile's metrics onto
 *    stale pictures; a scene with no prior sheet simply gets one from its next
 *    full compile.
 *
 * Each `eye` is reconstructed with `orbitEye` (the manifest stores angles, not
 * the derivable vector).
 */
function carriedProofBlock(projectDir: string): CarriedProofBlock {
  const empty: CarriedProofBlock = {
    images: [],
    views: undefined,
    rects: undefined,
    idParts: undefined,
    frames: undefined,
    contactSheet: undefined,
  };
  try {
    const prev = JSON.parse(
      fs.readFileSync(path.join(projectDir, OUT_DIR, "manifest.json"), "utf8"),
    ) as Partial<Scene3dManifest>;
    const all = Array.isArray(prev.proofImages) ? prev.proofImages : [];
    if (
      all.length === 0 ||
      !all.every((rel) => typeof rel === "string" && fs.existsSync(path.join(projectDir, rel)))
    ) {
      return empty;
    }
    const pv = Array.isArray(prev.proofViews) ? prev.proofViews : undefined;
    const views =
      pv && pv.length === all.length
        ? all.map((_, i) => ({
            index: pv[i]!.index,
            azimuthDeg: pv[i]!.azimuthDeg,
            elevationDeg: pv[i]!.elevationDeg,
            name: pv[i]!.name,
            eye: orbitEye(pv[i]!.azimuthDeg, pv[i]!.elevationDeg),
          }))
        : undefined;
    // The contact sheet reference carries only if the PNG it names still exists;
    // its embedded facts stay from when it was drawn, matching its own frames.
    const sheet =
      prev.contactSheet &&
      typeof prev.contactSheet.path === "string" &&
      fs.existsSync(path.join(projectDir, prev.contactSheet.path))
        ? prev.contactSheet
        : undefined;
    return {
      images: [...all],
      views,
      rects:
        Array.isArray(prev.proofRects) && prev.proofRects.length === all.length ? prev.proofRects : undefined,
      idParts:
        Array.isArray(prev.proofIdParts) && prev.proofIdParts.length > 0 ? prev.proofIdParts : undefined,
      frames:
        Array.isArray(prev.proofFrames) && prev.proofFrames.length === all.length ? prev.proofFrames : undefined,
      contactSheet: sheet,
    };
  } catch {
    return empty;
  }
}

/** The previous compile's bakedTweaks, for passes that ship no new
 *  geometry. Absent or unreadable manifests read as "nothing baked". */
function previousManifestBakedTweaks(
  projectDir: string,
): Record<string, PartTweak> | undefined {
  try {
    const previous = JSON.parse(
      fs.readFileSync(path.join(projectDir, OUT_DIR, "manifest.json"), "utf8"),
    ) as { bakedTweaks?: Record<string, PartTweak> };
    return previous.bakedTweaks && typeof previous.bakedTweaks === "object"
      ? previous.bakedTweaks
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True ONLY for a proof frame this compiler itself wrote:
 * `proof-<24 hex>-<frame>.png`, where the 24 hex is exactly what hashJson
 * emits (`.slice(0,24)`). The prune pattern's hex group was unbounded, so any
 * file of the loose shape `proof-<anything>-<n>` — a user's hand-dropped
 * snapshot in this user-visible product dir — got silently deleted on the next
 * compile. \d{3,} stays tolerant of a legacy 4-digit suffix.
 */
export function isCompilerProofFrame(name: string): boolean {
  // The optional `.idx` tail covers the object-index maps that ride beside
  // every beauty frame: they hash and orphan exactly the same way, and a
  // pattern without the tail pruned the frames while their maps
  // accumulated forever.
  return /^proof-[0-9a-f]{24}-\d{3,}(?:\.idx)?\.png$/.test(name);
}

/**
 * True ONLY for a material-ball preview this compiler itself wrote:
 * `ball-<sanitised material name>.png`, where the stem is exactly the
 * charset the runner's `safe_filename` can emit. Anything else in
 * `out/materials/` is left alone — the directory is user-visible, and the
 * proof-frame pruner learned that lesson the expensive way.
 */
export function isCompilerMaterialBall(name: string): boolean {
  return /^ball-[A-Za-z0-9._-]+\.png$/.test(name);
}

function pruneStaleMaterialBalls(projectDir: string, keep: string[]): void {
  const dir = path.join(projectDir, OUT_DIR, "materials");
  const survivors = new Set(keep);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (survivors.has(entry)) continue;
    if (!isCompilerMaterialBall(entry)) continue;
    try {
      fs.rmSync(path.join(dir, entry), { force: true });
    } catch {
      /* a viewer may hold the handle; the next compile retries */
    }
  }
}

/** Narrow an untyped payload/cache field to a list of strings. */
function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function pruneStaleProofFrames(projectDir: string, keep: string[]): void {
  const dir = path.join(projectDir, OUT_DIR, "proof");
  const survivors = new Set(keep);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (survivors.has(entry)) continue;
    if (!isCompilerProofFrame(entry)) continue;
    try {
      fs.rmSync(path.join(dir, entry), { force: true });
    } catch {
      /* a viewer may hold the handle; the next compile retries */
    }
  }
}

function asProofFrames(value: unknown): ProofFrameStats[] | undefined {
  // The cache entry's `data` has two shapes in the wild: entries written
  // before offByFrame rode along store the frames array DIRECTLY, and
  // entries since store `{ frames, offByFrame }`. Accept both — reading the
  // new shape as "not an array" silently dropped proofFrames on every cached
  // recompile, and a scene that rendered black started reporting clean on
  // its second compile (the exact failure this cache exists to prevent).
  const list = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.frames) ? value.frames : undefined;
  if (!list) return undefined;
  const frames: ProofFrameStats[] = [];
  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.path !== "string") continue;
    frames.push({
      path: e.path,
      meanLuminance: typeof e.meanLuminance === "number" ? e.meanLuminance : null,
      coverage: typeof e.coverage === "number" ? e.coverage : null,
      blownRatio: typeof e.blownRatio === "number" ? e.blownRatio : null,
    });
  }
  return frames.length > 0 ? frames : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mergeStage(a: ReturnType<typeof parseUsda>, b: ReturnType<typeof parseUsda>) {
  return { stage: { ...a.stage, ...b.stage, subLayers: [...a.stage.subLayers, ...b.stage.subLayers] }, root: a.root, prims: [...a.prims, ...b.prims] };
}

function ms(t0: number): number {
  return Math.round(performance.now() - t0);
}

/** The lowering record the runner emits and the export cache persists. */
interface LoweringRecord {
  master: string | null;
  buildFingerprint?: Fingerprint;
  masterFingerprint?: Fingerprint | null;
  /** A Y-up stage authored alongside the master, for the USDZ package only.
   *  Present when the contract's axis is not Y. */
  arMaster?: string;
  /** What `restore_carry` put back on the re-imported scene, by name. */
  carried?: {
    clips?: string[];
    occlusion?: string[];
    materials?: string[];
    emission?: string[];
  };
  droppedExportOptions?: string[];
}

/**
 * Adjudicate master parity from a lowering record — fresh OR cached.
 * A missing record is reported as UNCHECKED, never passed silently: the
 * export cache used to drop the record entirely, which meant a cached
 * recompile skipped the parity verdict without a trace (found by the
 * release audit; the proof cache already carries its stats for exactly
 * this reason).
 */
function emitMasterParity(lowering: LoweringRecord | null | undefined, issues: Issue[]): void {
  if (!lowering) {
    issues.push({
      code: ISSUE_CODES.MASTER_UNCHECKED,
      severity: "warning",
      message:
        "master parity has no record for this export (pre-parity cache entry?) — recompile with --no-cache to measure it",
    });
    return;
  }
  if (!lowering.masterFingerprint) {
    issues.push({
      code: ISSUE_CODES.MASTER_UNCHECKED,
      severity: "warning",
      message:
        "master parity could not be measured — the stage was not re-imported; deliverables may be missing",
    });
    return;
  }
  // The carry is deliberately NOT an issue.
  //
  // It reports a repair that succeeded, which asks nothing of the reader, and
  // it fires on every scene that declares an emission strength — so as a
  // finding it was pure noise, and it broke the showcase fixtures whose whole
  // contract is "compiles with zero issues". The failure case does not need it
  // either: a carry that does not land leaves the master fingerprint short of
  // the build's, and E-901 below reports that as the loss it is.
  //
  // So it is recorded rather than reported. `manifest.lowering.carried` names
  // exactly what the deliverables owe to a repair instead of to the master,
  // which is the question somebody auditing the .usda actually asks.
  // A build that measured material capabilities against a master that did not
  // is UNCHECKED, not clean. materialCapabilityLosses skips a material the
  // master has no entry for — correct per material, and wrong as a verdict
  // when the master has no entries at all, because then it skips every one of
  // them and reports nothing. Only a cache entry written before the field
  // existed can produce that, which is exactly the case that must not read as
  // a pass.
  if (
    lowering.buildFingerprint?.materialCaps &&
    Object.keys(lowering.buildFingerprint.materialCaps).length > 0 &&
    Object.keys(lowering.masterFingerprint.materialCaps ?? {}).length === 0
  ) {
    issues.push({
      code: ISSUE_CODES.MASTER_UNCHECKED,
      severity: "warning",
      message:
        "material capabilities could not be compared across lowering — the master fingerprint predates the measurement; recompile with --no-cache to check texture bindings and sidedness",
      file: lowering.master ?? "scene.usda",
    });
  }
  if (lowering.buildFingerprint) {
    for (const loss of fingerprintLosses(lowering.buildFingerprint, lowering.masterFingerprint)) {
      issues.push({
        code: ISSUE_CODES.MASTER_INCOMPLETE,
        severity: "error",
        message: `the master stage lost ${loss} — the writer failed to author it; the master must be total`,
        file: lowering.master ?? "scene.usda",
      });
    }
    const shift = boundsShift(lowering.buildFingerprint, lowering.masterFingerprint);
    if (shift) {
      issues.push({
        code: ISSUE_CODES.MASTER_ORDER_DRIFT,
        severity: "warning",
        message: `the scene's world extents changed through lowering, ${shift.from} -> ${shift.to} — ${shift.permuted ? "the axes were permuted, so the asset arrives rotated" : "the asset arrives at a different size"}; every mesh, bone and clip survived, which is why nothing else reports it`,
        file: lowering.master ?? "scene.usda",
        detail: { from: shift.from, to: shift.to, permuted: shift.permuted },
      });
    }
    for (const drift of orderDrifts(lowering.buildFingerprint, lowering.masterFingerprint)) {
      issues.push({
        code: ISSUE_CODES.MASTER_ORDER_DRIFT,
        severity: "warning",
        message: `${drift} changed through lowering — the names all survived but their order did not; animation that binds by index may misalign. Verify the skin weights / morph drivers were remapped in step.`,
        file: lowering.master ?? "scene.usda",
        detail: { drift },
      });
    }
  }
}


/**
 * Whether the scene's world extents survived lowering.
 *
 * The parity check counts content; this asks WHERE it is. A round trip that
 * rotated or rescaled the whole asset keeps every mesh, material, bone and
 * clip, so nothing else in the compiler would notice. `permuted` separates the
 * two failures worth telling apart: the same three extents in a different
 * order is a rotation, anything else is a resize.
 *
 * Tolerance is relative, because a 3.7km Sponza and a 2cm Avocado cannot share
 * an absolute epsilon; 1% is far under a wrong axis and far over float drift
 * through a text stage.
 */
export function boundsShift(
  build: Fingerprint,
  master: Fingerprint,
): { from: string; to: string; permuted: boolean } | null {
  const a = build.bounds;
  const b = master.bounds;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 3 || b.length !== 3) return null;
  // A scene with no renderable geometry has no extents to compare.
  if (a.every((v) => v === 0) && b.every((v) => v === 0)) return null;
  const close = (x: number, y: number) => Math.abs(x - y) <= Math.max(1e-3, Math.abs(x) * 0.01);
  if (a.every((v, i) => close(v, b[i]!))) return null;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  const permuted = sortedA.every((v, i) => close(v, sortedB[i]!));
  const fmt = (v: number[]) => `[${v.map((n) => n.toFixed(3)).join(", ")}]`;
  return { from: fmt(a), to: fmt(b), permuted };
}

/** What the runner's scene fingerprints carry for the parity check. */
interface Fingerprint {
  meshes?: Record<string, number>;
  materials?: string[];
  armatures?: Record<string, number>;
  actions?: string[];
  /** Ordered bone names per armature — order is index-binding, not decoration. */
  boneOrder?: Record<string, string[]>;
  /** Ordered morph-target (shape key) names per mesh, Basis excluded. */
  morphs?: Record<string, string[]>;
  /** World-space extents of all renderable geometry (metres, mm-rounded).
   *  Counts cannot see a scene that arrived ROTATED or RESCALED — every mesh,
   *  bone and clip is present when an asset comes back on its side. */
  bounds?: number[] | null;
  /** Per-material texture-role bindings and surface flags. Names and counts
   *  cannot see a material that kept its name and lost its occlusion map, or
   *  a closed mesh that came back two-sided. */
  materialCaps?: Record<string, MaterialCapability>;
}

interface MaterialCapability {
  /** role ("baseColor", "occlusion", …) -> texture identity. */
  roles?: Record<string, string>;
  backfaceCulling?: boolean;
}

/**
 * Where the set of joints/morphs survived lowering but their ORDER did not.
 *
 * A count check cannot see this: same names, same total, different sequence.
 * It matters because skinning and morph animation index by position — a
 * reordered joint list binds weights to the wrong bone. Only reported when
 * the name SET is identical (a shrunk set is a loss E-901 already owns), so
 * this is purely the "silently shuffled" case.
 */
export function orderDrifts(build: Fingerprint, master: Fingerprint): string[] {
  const drifts: string[] = [];
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join("\0") === [...b].sort().join("\0");
  const scan = (
    kind: string,
    b: Record<string, string[]> | undefined,
    m: Record<string, string[]> | undefined,
  ) => {
    for (const [name, order] of Object.entries(b ?? {})) {
      const after = m?.[name];
      if (!after) continue; // the whole entry vanished — that is an E-901 loss
      if (sameSet(order, after) && order.join("\0") !== after.join("\0")) {
        drifts.push(`${kind} order on '${name}'`);
      }
    }
  };
  scan("bone", build.boneOrder, master.boneOrder);
  scan("morph-target", build.morphs, master.morphs);
  return drifts;
}

/**
 * What the build had that the master does not — the losses that make a
 * master non-total. Names are compared as SETS (importer round-trips can
 * legally suffix or sanitise), counts as totals with tolerance for the
 * triangulation differences an interchange round-trip introduces.
 */
export function fingerprintLosses(build: Fingerprint, master: Fingerprint): string[] {
  const losses: string[] = [];
  const buildMeshes = Object.keys(build.meshes ?? {});
  const masterMeshes = Object.keys(master.meshes ?? {});
  if (masterMeshes.length < buildMeshes.length) {
    losses.push(
      `${buildMeshes.length - masterMeshes.length} of ${buildMeshes.length} mesh part(s)`,
    );
  }
  const buildMats = build.materials ?? [];
  const masterMats = master.materials ?? [];
  if (masterMats.length < buildMats.length) {
    losses.push(`${buildMats.length - masterMats.length} of ${buildMats.length} material(s)`);
  }
  const buildArms = Object.keys(build.armatures ?? {}).length;
  const masterArms = Object.keys(master.armatures ?? {}).length;
  if (masterArms < buildArms) {
    losses.push(`${buildArms - masterArms} of ${buildArms} armature(s)`);
  }
  const buildBones = Object.values(build.armatures ?? {}).reduce((s, n) => s + n, 0);
  const masterBones = Object.values(master.armatures ?? {}).reduce((s, n) => s + n, 0);
  if (buildArms > 0 && masterArms === buildArms && masterBones < buildBones) {
    losses.push(`${buildBones - masterBones} of ${buildBones} bone(s)`);
  }
  // PARTIAL action loss is loss too: master=[walk] when build=[walk,idle]
  // dropped the idle clip. The old `masterActions === 0` guard only caught a
  // total wipe, so losing all-but-one clip was silent. Count-based, like the
  // mesh/material/bone checks above.
  const buildActions = build.actions ?? [];
  const masterActions = master.actions ?? [];
  if (masterActions.length < buildActions.length) {
    losses.push(`${buildActions.length - masterActions.length} of ${buildActions.length} animation clip(s)`);
  }
  // Morph targets (shape keys) were compared for ORDER drift but never for
  // LOSS — orderDrifts explicitly skips a vanished entry with the comment
  // "that is an E-901 loss", yet no code emitted that loss. Dropping every
  // shape key of a character's face was silent. Count across all meshes so
  // both a single dropped morph and a whole mesh's morphs vanishing register.
  const morphTotal = (m?: Record<string, string[]>) =>
    Object.values(m ?? {}).reduce((s, names) => s + names.length, 0);
  const buildMorphs = morphTotal(build.morphs);
  const masterMorphs = morphTotal(master.morphs);
  if (masterMorphs < buildMorphs) {
    losses.push(`${buildMorphs - masterMorphs} of ${buildMorphs} morph target(s)`);
  }
  losses.push(...materialCapabilityLosses(build, master));
  return losses;
}

/**
 * What each material stopped being able to do.
 *
 * Counting materials answers "did they all arrive", which is the question the
 * fingerprint could already ask — and every one of these losses passes it. The
 * material keeps its name and its slot; what it loses is a binding. Reported
 * per material and per role because "the helmet lost its occlusion map" is a
 * fact somebody can act on, while "materials differ" is not.
 */
function materialCapabilityLosses(build: Fingerprint, master: Fingerprint): string[] {
  const losses: string[] = [];
  const buildCaps = build.materialCaps ?? {};
  const masterCaps = master.materialCaps ?? {};
  // Absent on BOTH sides means a runner that predates the field, not a total
  // wipe — say nothing rather than invent a loss for every older cache entry.
  if (Object.keys(buildCaps).length === 0) return losses;
  for (const [name, buildCap] of Object.entries(buildCaps)) {
    const masterCap = masterCaps[name];
    if (!masterCap) continue; // the material itself vanished; counted above.
    const dropped = Object.keys(buildCap.roles ?? {}).filter(
      (role) => !(masterCap.roles ?? {})[role],
    );
    if (dropped.length > 0) {
      losses.push(`material '${name}' texture binding(s) ${dropped.sort().join(", ")}`);
    }
    // Sidedness is not a texture but it is authored intent, and losing it
    // doubles the overdraw of every closed mesh in the delivered asset.
    if (buildCap.backfaceCulling === true && masterCap.backfaceCulling === false) {
      losses.push(`material '${name}' single-sidedness (came back two-sided)`);
    }
  }
  return losses;
}
