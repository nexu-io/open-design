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
  StageId,
  StageReport,
  PartTweak,
} from "./types.js";
import { ISSUE_CODES, summarize } from "./errors.js";
import { DEFAULT_CONTRACT, normalizeContract, validateContract, contractCacheKey } from "./contract.js";
import { discoverSources, existingSourceFiles } from "./parse/sources.js";
import { companionFiles } from "./parse/companions.js";
import { lostShadingCapability } from "./read/gltf-capability.js";
import { parseUsda, UsdaParseError } from "./parse/usda.js";
import { authorStageModel } from "./usd/stage-model.js";
import {
  BlenderProbe,
  hashFiles,
  hashJson,
  readCache,
  runRunner,
  runnerPath,
  probeBlender,
  writeCache,
} from "./build/blender.js";
import { validateCensus } from "./build/census.js";
import { runLint } from "./lint/rules.js";
import { isExempt } from "./lint/exempt.js";
import { validateGltf } from "./lint/gltf-oracle.js";
import { validateUsd } from "./lint/usd-oracle.js";
import { collectSheets } from "./sheet/collect.js";
import type { SheetSpec } from "./lint/sheet.js";
import { buildManifest, writeManifest, writeViewer } from "./manifest.js";
import { describeScene } from "./read/describe.js";
import { changeImpact, formatImpact, type ImpactReport } from "./read/impact.js";
import { renderOrthoSvg, orthoDimensions } from "./read/ortho.js";
import { validateSceneSpec, specDeclarationLines } from "./solve/validate.js";
import { solveScene } from "./solve/solver.js";
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
export async function compile(request: CompileRequest): Promise<CompileResult> {
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
    if (contractIssues.length > 0) {
      issues.push({
        code: ISSUE_CODES.INVALID_CONTRACT,
        severity: "error",
        message: `contract is invalid: ${contractIssues.join("; ")}`,
        file: "(request.contract)",
      });
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
          issues.push({
            code: ISSUE_CODES.INVALID_CONTRACT,
            severity: "error",
            message: `scene3d.json is invalid: ${contractIssues.join("; ")}`,
            file: "scene3d.json",
          });
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
  let solved: SolvedScene | undefined;
  let specScript: string | undefined;
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
      } catch (err) {
        issues.push({
          code: ISSUE_CODES.SPEC_INVALID,
          severity: "error",
          message: `scene.json is not valid JSON: ${(err as Error).message}`,
          file: "scene.json",
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
        if (!part.file) continue;
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
        // A script-backed part's bytes join the content hash too: editing
        // the script must recompile the scene, exactly like replacing an
        // asset file. Existence is a parse error, not a Blender traceback.
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
      solved = solveScene(spec, normalized.voxel.enabled ? { grid: normalized.voxel.gridSize } : {});
      for (const diagnostic of solved.diagnostics) {
        // Two diagnostics describe a scene that BUILT: one where the solver
        // adjusted an offset, one where it placed instances inside each other.
        // Both are warnings about geometry the author should look at; the rest
        // mean the graph could not be solved at all.
        const buildable =
          diagnostic.code === "SOLVE-EPSILON-FLOOR" || diagnostic.code === "SOLVE-INTERSECTION";
        issues.push({
          code:
            diagnostic.code === "SOLVE-EPSILON-FLOOR"
              ? ISSUE_CODES.SPEC_ADJUSTED
              : diagnostic.code === "SOLVE-INTERSECTION"
                ? ISSUE_CODES.SPEC_INSTANCES_INTERSECT
                : ISSUE_CODES.SPEC_UNRESOLVED,
          severity: buildable ? "warning" : "error",
          message: diagnostic.message,
          file: "scene.json",
          ...(diagnostic.part ? { target: diagnostic.part } : {}),
        });
      }
      const unresolved = solved.diagnostics.some(
        (d) => d.code !== "SOLVE-EPSILON-FLOOR" && d.code !== "SOLVE-INTERSECTION",
      );
      if (!unresolved && !missingAssets) {
        specScript = emitBlenderScript(solved, {
          ...(spec.materials ? { materials: spec.materials } : {}),
          camera: spec.camera ?? true,
          ...(spec.light ? { light: spec.light } : {}),
          tessellation: normalized.tessellation,
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
    for (const [matName, mat] of Object.entries(spec.materials ?? {})) {
      if (!mat.shader) continue;
      referenced.add(mat.shader);
      const job = shaderJobs.find((j) => j.name === mat.shader);
      if (!job) continue;
      if (job.frames > 1) {
        issues.push({
          code: ISSUE_CODES.SHADER_INVALID,
          severity: "error",
          message: `material '${matName}' references flipbook shader '${job.name}' — a frames shader is a sheet product, not a surface`,
          file: "scene.json",
          target: matName,
        });
        continue;
      }
      shaderBindings.push({ material: matName, shader: mat.shader, outputs: job.outputs });
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
    shaderJobs.length > 0 ? { shaders: shaderJobs, shaderBindings } : {};
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
  let census: Census | undefined;
  /* The read model. Populated at the manifest stage, which is the only
     point where every measurement this run will produce is final. */
  let impact: ImpactReport | undefined;
  let digest: string | undefined;
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
        if (cached) {
          census = validateCensus(cached.data);
          report("build", "cached", ms(tb));
        } else {
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
  /* Proof runs before lint on purpose: the linter consumes each frame's
     coverage statistics, so "the render came out black" is a measured fact
     it can report rather than a failure only a human would ever notice. */
  const proofImages: string[] = [];
  /* Lit-sphere material previews. Deliberately NOT folded into proofImages:
     the frame player, the ascii sampling and the viewer all iterate that
     list as a turntable, and a ball is not a frame of one. */
  const materialBalls: string[] = [];
  let materialBallsSkipped = 0;
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
      const proofHash = hashJson({ build: buildInputHash, proof: proofOpts, steps });
      const names = Array.from({ length: steps }, (_, i) => `proof-${proofHash}-${String(i).padStart(3, "0")}.png`);
      const abs = names.map((n) => path.join(request.projectDir, OUT_DIR, "proof", n));
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
        proofImages.push(...cached.artifacts);
        materialBalls.push(...cachedBalls);
        materialBallsSkipped =
          typeof (cached.data as { materialBallsSkipped?: unknown } | null)?.materialBallsSkipped === "number"
            ? ((cached.data as { materialBallsSkipped: number }).materialBallsSkipped)
            : 0;
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
          pruneStaleProofFrames(request.projectDir, [...names, ...idxNames]);
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
          if (!request.noCache && rel.length === names.length) {
            writeCache(request.projectDir, "proof", proofHash, {
              artifacts: [...rel, ...idxWritten.map((n) => `${PROOF_DIR}/${n}`)],
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

  /* ---- export ----------------------------------------------------- */
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
        /* Capability parity is a pure re-read of the source and shipped
           containers — no cached data involved — so a cached recompile
           re-adjudicates it. It used to live only in the miss branch, which
           made W-903 fire once and vanish on the next identical compile:
           the exact stale-state-read-as-flakiness failure the cache
           discipline above exists to prevent. */
        emitMaterialCapabilityParity(request.projectDir, source, solved, cached.artifacts, issues);
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
          emitMaterialCapabilityParity(request.projectDir, source, solved, rel, issues);

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
                  packageUsdz(packageFrom, path.join(request.projectDir, usdzRel));
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
                packageUsdz(
                  path.join(request.projectDir, masterRel),
                  path.join(request.projectDir, usdzRel),
                );
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
      sourceKind: source.kind,
      // Only what the author actually wrote. A target preset fills in
      // conventions too, but a preset is a default, not a statement of intent,
      // and must not cancel the relaxation on their behalf.
      authoredKeys,
    });
    // A claim is adjudicated at the rest pose; a bobbing part leaves that
    // pose every cycle — but the CYCLE is adjudicable too, and "unchecked"
    // for a motion whose envelope the solver just computed was a permanent
    // warning an author could never answer. A field run's ember bobbed
    // ±18mm at 470mm altitude, provably unable to reach the floor, and the
    // coexistence warning blocked `--fail-on warning` forever. So: judge.
    //  - a resting part's bob is TROUGH-anchored by the emitter (it only
    //    rises from the solved pose; see _animate_bob) — grounded all cycle;
    //  - a floating part's bob is centred: its worst dip is bottom minus
    //    amplitude, measured against the same ground tolerance the claim
    //    itself uses — silent when it provably clears, a REAL claim failure
    //    when it provably sinks mid-cycle;
    //  - exempt parts are outside the claim entirely, exactly as they are
    //    in the rest-pose adjudication;
    //  - only a part the solver did not place keeps the unchecked warning.
    if (spec?.claims?.grounded) {
      const exempt = normalized.grounding.exempt;
      const tolerance = normalized.grounding.tolerance;
      for (const part of spec.parts) {
        if (!part.bob) continue;
        if (isExempt(part.id, exempt)) continue;
        const placed = solved?.parts.find((p) => p.id === part.id);
        if (placed) {
          if (placed.restsOn) continue; // trough-anchored: never dips below rest
          const worstBottom = placed.center[2] - placed.size[2] / 2 - part.bob.amplitude;
          if (worstBottom >= -tolerance) continue; // clears the floor all cycle
          lintIssues.push({
            code: ISSUE_CODES.CLAIM_FAILED,
            severity: "error",
            message: `claim grounded failed: '${part.id}' bobs ±${part.bob.amplitude}m and sinks ${(-worstBottom).toFixed(4)}m below the ground plane at its trough`,
            target: part.id,
            hint: "raise the part, shrink the bob amplitude, or exempt it via conventions.grounding.exempt",
            detail: { claim: "grounded", amplitude: part.bob.amplitude, worstBottom },
          });
          continue;
        }
        lintIssues.push({
          code: ISSUE_CODES.CLAIM_UNCHECKED,
          severity: "warning",
          message: `claim grounded is adjudicated at the rest pose only — '${part.id}' bobs ±${part.bob.amplitude}m and its cycle envelope could not be derived`,
          target: part.id,
          detail: { claim: "grounded", amplitude: part.bob.amplitude },
        });
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
    if (!wanted.has("proof") && proofImages.length === 0) {
      proofImages.push(...previousManifestArtifacts(request.projectDir, "proofImages"));
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
    digest = census ? describeScene(census, allIssues) : "no census — build stage did not run";
    try {
      writeReadModel(request.projectDir, {
        version: READ_MODEL_VERSION,
        census,
        issues: allIssues,
        digest,
        impact,
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

    const manifest = buildManifest({
      source,
      projectDir: request.projectDir,
      carried: carriedRecord,
      ...(proofFrames ? { proofFrames } : {}),
      ...(proofRects ? { proofRects } : {}),
      ...(proofIdParts ? { proofIdParts } : {}),
      census,
      issues: allIssues,
      summary: summarize(allIssues),
      proofImages,
      exportedAssets,
      blenderUsed: probe !== null && needsBlender,
      blenderVersion: probe?.version ?? null,
      bakedTweaks: bakedTweaksForManifest,
      sheets: [...normalized.sheets, ...derivedSheets],
      ...(spec?.claims ? { claimsDeclared: Object.keys(spec.claims).length } : {}),
    });
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
      }),
    proofImages,
    materialBalls,
    ...(materialBallsSkipped > 0 ? { materialBallsSkipped } : {}),
    exportedAssets,
    summary,
    digest,
    impact,
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
  issues: Issue[];
  digest: string;
  impact: ImpactReport;
}

/**
 * The read model written by the previous compile, if any.
 *
 * Read before this run overwrites it — comparing against it is what turns a
 * compile from a verdict into a report of what the edit actually did.
 * Absent on a first compile, which is not an error: there is simply nothing
 * to have changed from.
 */
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
  return /^proof-[0-9a-f]{24}-\d{3,}\.png$/.test(name);
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
