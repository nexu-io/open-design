import * as fs from "node:fs";
import * as path from "node:path";
import {
  Census,
  CompileRequest,
  CompileResult,
  Issue,
  IssueSummary,
  ProofFrameStats,
  ProofOptions,
  Scene3dContract,
  StageId,
  StageReport,
  PartTweak,
} from "./types.js";
import { ISSUE_CODES, summarize } from "./errors.js";
import { DEFAULT_CONTRACT, normalizeContract, validateContract } from "./contract.js";
import { discoverSources, existingSourceFiles } from "./parse/sources.js";
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
import { assembleShaderJob } from "./shade/emit.js";
import { flipbookGrid, type CompiledShaderJob, type ShaderBinding } from "./shade/types.js";

/* Execution order. `proof` precedes `lint` because the linter reads each
   rendered frame's coverage statistics; the stage ids themselves stay the
   declared pipeline vocabulary. */
const STAGE_ORDER: StageId[] = ["parse", "build", "proof", "export", "lint", "manifest"];
const DEFAULT_TIMEOUT_MS = 180_000;

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
    }
  } else {
    const contractFile = path.join(request.projectDir, "scene3d.json");
    if (fs.existsSync(contractFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(contractFile, "utf8"));
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
  if (source.kind === "spec") {
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
        rawText = fs.readFileSync(path.join(request.projectDir, "scene.json"), "utf8");
        const parsed = JSON.parse(rawText);
        const result = validateSceneSpec(parsed);
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
      }
    }
    if (spec) {
      solved = solveScene(spec);
      for (const diagnostic of solved.diagnostics) {
        const adjusted = diagnostic.code === "SOLVE-EPSILON-FLOOR";
        issues.push({
          code: adjusted ? ISSUE_CODES.SPEC_ADJUSTED : ISSUE_CODES.SPEC_UNRESOLVED,
          severity: adjusted ? "warning" : "error",
          message: diagnostic.message,
          file: "scene.json",
          ...(diagnostic.part ? { target: diagnostic.part } : {}),
        });
      }
      const unresolved = solved.diagnostics.some((d) => d.code !== "SOLVE-EPSILON-FLOOR");
      if (!unresolved && !missingAssets) {
        specScript = emitBlenderScript(solved, {
          ...(spec.materials ? { materials: spec.materials } : {}),
          camera: spec.camera ?? true,
          ...(spec.light ? { light: spec.light } : {}),
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
      const validated = validateShaderSpec(name, shaderSpec, kernelText, shaderErrors);
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
  // Corrupt tweaks degrade to "no tweaks" — a bad viewer write must not
  // wedge every future compile of the scene.
  let tweaks: Record<string, PartTweak> | undefined;
  const tweaksFile = path.join(request.projectDir, "tweaks.json");
  if (fs.existsSync(tweaksFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(tweaksFile, "utf8"));
      if (parsed && typeof parsed === "object") tweaks = parsed;
    } catch {
      /* ignore malformed tweaks */
    }
  }

  const buildInputHash = hashJson({
    kind: source.kind,
    contract: contract,
    sources: hashFiles(sourceFiles),
    tweaks: tweaks ?? null,
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
  let proofFrames: ProofFrameStats[] | undefined;
  const proofOpts: ProofOptions = { ...normalized.proof, ...(request.proof ?? {}) };
  if (wanted.has("proof")) {
    const tp = performance.now();
    if (probe && source.files.length > 0 && (source.kind !== "spec" || buildScriptRel !== undefined)) {
      const steps = proofOpts.turntable ? proofOpts.turntableSteps ?? 8 : 1;
      const proofHash = hashJson({ build: buildInputHash, proof: proofOpts });
      const names = Array.from({ length: steps }, (_, i) => `proof-${proofHash}-${String(i).padStart(3, "0")}.png`);
      const abs = names.map((n) => path.join(request.projectDir, OUT_DIR, "proof", n));
      const cached = request.noCache ? null : readCache(request.projectDir, "proof", proofHash);
      if (cached && cached.artifacts.every((a) => fs.existsSync(path.join(request.projectDir, a)))) {
        proofImages.push(...cached.artifacts);
        // The cache carries the frame statistics, not just the file list:
        // without them a cached rerun would drop S3D-E-383 and a scene that
        // rendered black would start reporting clean on its second compile.
        proofFrames = asProofFrames(cached.data);
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
          // Each compile hashes to a new frame set; without pruning, a scene
          // iterated a handful of times leaves tens of megabytes of orphaned
          // renders sitting in the user's project.
          pruneStaleProofFrames(request.projectDir, names);
          proofImages.push(...rel);
          proofFrames = asProofFrames((result.data as { frames?: unknown } | undefined)?.frames);
          if (!request.noCache && rel.length === names.length) {
            writeCache(request.projectDir, "proof", proofHash, {
              artifacts: rel,
              data: proofFrames ?? null,
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
      if (cached && cached.artifacts.every((a) => fs.existsSync(path.join(request.projectDir, a)))) {
        exportedAssets.push(...cached.artifacts);
        // The parity verdict is part of the export's result, so the cache
        // carries the lowering record and a cached recompile re-adjudicates
        // it — the same discipline as the proof cache's frame statistics.
        emitMasterParity(
          (cached.data as { lowering?: LoweringRecord } | null)?.lowering,
          issues,
        );
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
                packageUsdz(abs, path.join(request.projectDir, usdzRel));
                if (!rel.includes(usdzRel)) {
                  rel.push(usdzRel);
                  exportedAssets.push(usdzRel);
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
          if (!request.noCache && rel.length > 0) {
            writeCache(request.projectDir, "export", exportHash, {
              artifacts: rel,
              data: { lowering: lowering ?? null },
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
    for (const job of shaderJobs) {
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
      ...(exportedUsda ? { exportedUsda } : {}),
      ...(sheets ? { sheets } : {}),
      ...(spec?.claims ? { claims: spec.claims } : {}),
    });
    // A claim is adjudicated at the rest pose; a bobbing part leaves that
    // pose every cycle. Unchecked-never-passed applies across TIME too.
    if (spec?.claims?.grounded) {
      for (const part of spec.parts) {
        if (!part.bob) continue;
        lintIssues.push({
          code: ISSUE_CODES.CLAIM_UNCHECKED,
          severity: "warning",
          message: `claim grounded is adjudicated at the rest pose only — '${part.id}' bobs ±${part.bob.amplitude}m and dips below it mid-cycle`,
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
  let manifestPath = "";
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
    writeReadModel(request.projectDir, {
      version: READ_MODEL_VERSION,
      census,
      issues: allIssues,
      digest,
      impact,
    });

    const manifest = buildManifest({
      source,
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
    manifestPath = writeManifest(request.projectDir, manifest);
    // The viewer is part of the deliverable, not a debug aid: it is the only
    // thing in `out/` a file browser can actually open and play.
    if (proofImages.length > 0) {
      writeViewer(request.projectDir, manifest, proofImages, request.scenePath);
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
    manifest: buildManifest({
      source,
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
    exportedAssets,
    summary,
    digest,
    impact,
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
    // \d{3,}: a contract past 999 turntable steps writes 4-digit frame
    // suffixes, and a prune pattern that cannot see them lets orphans pile
    // up forever.
    if (!/^proof-[0-9a-f]+-\d{3,}\.png$/.test(entry)) continue;
    try {
      fs.rmSync(path.join(dir, entry), { force: true });
    } catch {
      /* a viewer may hold the handle; the next compile retries */
    }
  }
}

function asProofFrames(value: unknown): ProofFrameStats[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const frames: ProofFrameStats[] = [];
  for (const entry of value) {
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
  if (lowering.buildFingerprint) {
    for (const loss of fingerprintLosses(lowering.buildFingerprint, lowering.masterFingerprint)) {
      issues.push({
        code: ISSUE_CODES.MASTER_INCOMPLETE,
        severity: "error",
        message: `the master stage lost ${loss} — the writer failed to author it; the master must be total`,
        file: lowering.master ?? "scene.usda",
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
function fingerprintLosses(build: Fingerprint, master: Fingerprint): string[] {
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
  if ((build.actions ?? []).length > 0 && (master.actions ?? []).length === 0) {
    losses.push(`all ${build.actions!.length} animation clip(s)`);
  }
  return losses;
}
