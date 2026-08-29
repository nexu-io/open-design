import { Budget, EngineTarget, Scene3dContract } from "./types.js";
import { EXPORT_FORMAT_VALUES, validateFields } from "./contract-schema.js";
import { SHEET_DEFAULTS } from "./lint/sheet.js";
import { TESSELLATION_DEFAULTS, type Tessellation } from "./solve/emit-bpy.js";
import { MAX_PARTS, MAX_REPEAT_COUNT } from "./solve/types.js";
import { DEFAULT_PROOF_THRESHOLDS } from "./lint/proof.js";

type Conventions = NonNullable<Scene3dContract["conventions"]>;

/**
 * Per-target convention presets — the few knobs that genuinely differ by
 * delivery destination, and nothing more. Each is a partial `conventions`
 * block layered UNDER the file's explicit conventions (which always win) and
 * OVER the hardcoded neutral defaults. Kept deliberately small: a preset that
 * quietly reshapes every rule would be worse than no preset.
 *
 * - unity / godot: Y-up (their native import axis).
 * - unreal: Z-up (its world axis).
 * - web: Y-up, tighter texture cap and a total-triangle budget — a glTF viewer
 *   pays for both over the wire.
 * - 3d_print: Z-up, watertight mandatory (open/doubled geometry prints as
 *   holes), and UVs irrelevant (a print carries no textures).
 */
export const DEFAULT_EXPORT_FORMATS: ReadonlyArray<
  "usda" | "usdz" | "glb" | "obj" | "fbx" | "stl" | "ply"
> = ["usda", "usdz", "glb", "obj", "fbx"];

/**
 * Deliverables a target needs that the general default does not carry.
 *
 * The general list excludes STL on the grounds that it carries no materials,
 * which is right everywhere except the one place STL is the whole point. A
 * `3d_print` project used to compile clean and ship six files, not one of
 * which a slicer opens — the format was implemented in the runner and simply
 * never requested.
 *
 * A profile ADDS; it never silently removes. USDZ was briefly taken off this
 * list because a Z-up print contract produced an AR package that arrives on
 * its back — but that punished every existing project with a deliverable that
 * quietly disappeared, to work around a defect that was really in the
 * packaging. The package now gets its own Y-up stage (see the usdz branch in
 * pipeline.ts), so a print job's USDZ is correct and there is nothing to
 * remove.
 */
export const TARGET_EXPORT_FORMATS: Partial<Record<EngineTarget, ReadonlyArray<
  "usda" | "usdz" | "glb" | "obj" | "fbx" | "stl" | "ply"
>>> = {
  // The default list PLUS stl. A target profile may add a deliverable a
  // domain needs; it must not quietly take one away, because the projects
  // that lose it are exactly the ones already relying on it and nothing
  // announces the removal.
  "3d_print": [...DEFAULT_EXPORT_FORMATS, "stl"],
};

export const TARGET_PROFILES: Record<EngineTarget, Partial<Conventions>> = {
  unity: { units: { upAxis: "Y" } },
  unreal: { units: { upAxis: "Z" } },
  godot: { units: { upAxis: "Y" } },
  web: {
    units: { upAxis: "Y" },
    textures: { maxSize: 2048 },
    budgets: { maxTrianglesTotal: 200_000 },
  },
  "3d_print": {
    units: { upAxis: "Z" },
    uv: { require: "off" },
    geometry: { allowOpenMeshes: false, allowDoubleVertices: false },
    // FDM defaults (0.4mm nozzle → ~0.8mm reliable wall; support past ~15% of
    // the surface as overhang is a print worth reconsidering). A project tunes
    // these per printer/material.
    print: { minThicknessMm: 0.8, maxOverhangAreaFraction: 0.15 },
  },
  // Generic voxel / blocky art for ANY engine (MagicaVoxel/Goxel/Qubicle →
  // Unity/Godot/Unreal via GLB/OBJ). Grid + pixel-density discipline with NO
  // Minecraft format rules; ships the normal GLB/USD/OBJ deliverables.
  voxel: {
    voxel: {},
  },
  minecraft: {
    units: { upAxis: "Y" },
    // Block models are built from single-sided quads — open by construction —
    // so the format's own idiom relaxes the closed-mesh gate. An author who
    // explicitly demands closed meshes still overrides this (preset < explicit).
    geometry: { allowOpenMeshes: true },
    // Minecraft IS voxel + a format: it implies the generic voxel discipline,
    // and vanilla resolution is 16 px per block face (the format's defining
    // texel density), so a bare `target:"minecraft"` is pixel-art by default;
    // HD packs override with `voxel.pxPerBlock: 32/64`.
    voxel: { pxPerBlock: 16 },
    minecraft: {},
  },
};

/** Defaults applied when `scene3d.json` omits sections. */
export const DEFAULT_CONTRACT: Scene3dContract = {
  schemaVersion: 1,
  conventions: {
    naming: {
      objectPattern: "^[A-Za-z][A-Za-z0-9_]{2,63}$",
      forbidDefaultNames: true,
      collectionPattern: "^[A-Za-z][A-Za-z0-9_]{2,63}$",
    },
    hierarchy: { maxDepth: 8 },
    units: { metersPerUnit: 1, upAxis: "Y" },
    pbr: {
      metallicValues: [0, 1],
      roughnessRange: [0, 1],
      iorRange: [1, 2.5],
    },
    animation: { fps: 24, maxFrames: 0 },
    uv: {
      require: "textured",
      maxOverlapFraction: 0.05,
      allowFlipped: false,
      maxOutOfBoundsFraction: 1,
      texelDensity: { maxRatio: 4 },
    },
    textures: {
      requirePowerOfTwo: true,
      maxSize: 4096,
      flagDuplicateMaterials: true,
      requireFaceAssignment: true,
    },
    geometry: {
      allowOpenMeshes: false,
      allowLooseGeometry: false,
      allowDoubleVertices: false,
      allowInconsistentWinding: false,
      allowNegativeScale: false,
      requireAppliedScale: true,
    },
  },
  proof: {
    engine: "BLENDER_EEVEE",
    resolution: 1024,
    turntable: true,
    turntableSteps: 8,
    respectSceneCamera: false,
  },
};

/** Names Blender auto-generates; catching them catches "the model wrote
 *  primitives and never named them" in one rule. */
export const BLENDER_DEFAULT_NAMES = new Set([
  "Cube",
  "Sphere",
  "Cylinder",
  "Cone",
  "Torus",
  "Plane",
  "Empty",
  "Camera",
  "Light",
  "Point",
  "Sun",
  "Area",
  "Spot",
  "Collection",
  "Scene",
  "Object",
  "Text",
  // Mesh/data primitive defaults Blender also auto-names; the stage linter's
  // DEFAULT_PRIM_NAME already covers the mesh ones, and these keep the census
  // naming rule in step for the object-level check.
  "Icosphere",
  // The bare data-block name a glTF import lands on when the source named
  // nothing. It was in the stage linter's DEFAULT_PRIM_NAME but not here, so
  // one smell was an error in the exported stage and silent in the census —
  // the same name, two verdicts, depending on which surface you looked at.
  "Mesh",
  "Grid",
  "Circle",
  "Suzanne",
  "Armature",
  "Lattice",
  "Speaker",
]);

export interface NormalizedContract {
  objectPattern: RegExp;
  collectionPattern: RegExp;
  forbidDefaultNames: boolean;
  partPrefixes: string[];
  maxDepth: number;
  metersPerUnit: number;
  upAxis: "Y" | "Z";
  metallicValues: number[];
  roughnessRange: [number, number];
  iorRange: [number, number];
  /** Dark-metal realism heatmap thresholds (see conventions.pbr.realism). */
  pbrRealism: { enabled: boolean; darkLuminanceMax: number; metalMin: number; roughMax: number };
  fps: number;
  /** Longest clip this project ships, in frames. ZERO MEANS NO BUDGET, and is
   *  the default: a project that never declared a clip length has not asked to
   *  be told its animation is long, and inventing a ceiling for it would be a
   *  limit nobody chose. The rule fires only once somebody states a number. */
  maxFrames: number;
  grounding: { enabled: boolean; tolerance: number; exempt: string[] };
  uv: {
    require: "textured" | "all" | "off";
    maxOverlapFraction: number;
    allowFlipped: boolean;
    maxOutOfBoundsFraction: number;
    maxStretch: number | null;
    texelDensityTarget: number | null;
    texelDensityMaxRatio: number;
  };
  /** Shader bake resolution bounds (power-of-two, inclusive). The lower bound
   *  is data, not a kernel constant: 64 for pbr, or the author's declared
   *  `pxPerBlock` (pow2-floored) under pixel-art so a 16-px bake is legal. */
  shade: { bakeMin: number; bakeMax: number; maxAtlasBytes: number };
  textures: {
    requirePowerOfTwo: boolean;
    maxSize: number;
    flagDuplicateMaterials: boolean;
    requireFaceAssignment: boolean;
  };
  geometry: {
    allowOpenMeshes: boolean;
    allowNgons: boolean;
    allowLooseGeometry: boolean;
    allowDoubleVertices: boolean;
    allowInconsistentWinding: boolean;
    allowNegativeScale: boolean;
    requireAppliedScale: boolean;
    /** Declared assembly/print/animation tolerance in metres; 0 = off. */
    minClearance: number;
    /** TOTAL triangle-pair comparisons the coplanar (z-fighting) scan may
     *  spend across the whole scene — the scan's ONE resource knob. Candidate
     *  pairs (boxes overlapping) charge their triangle product against it in
     *  deterministic order; a pair it cannot cover is skipped LOUDLY
     *  (S3D-W-323) with the number it needed. There is no mesh-count or
     *  per-mesh ceiling beside it — the second walls that once made raising
     *  this knob reveal an unraisable one. */
    zFightingPairBudget: number;
    /** Backstop on total parts after `repeat`/`scatter`/`around` expansion, and
     *  on any single instance count — a RUNAWAY guard (a `count:` typo), not a
     *  size cap, and RAISABLE: an author building a genuine crowd/forest lifts it
     *  rather than being refused. Generous default; the real bound on a huge scene
     *  is downstream (Blender's own memory), which fails on its own resources. */
    maxParts: number;
    maxRepeatCount: number;
  };
  sheets: NonNullable<Scene3dContract["sheets"]>;
  /** Thresholds for the 2D sheet rules — contract data like every other lint
   *  family's, rather than module constants with a dead override field. */
  sheetRules: {
    maxDimension: number;
    seamTolerance: number;
    additiveBorderMax: number;
    fullAlphaMin: number;
    sparseCoverageMin: number;
    tintHueMax: number;
    cellBleedMax: number;
    beamSeamMax: number;
    particleBorderTouchMax: number;
    skyNonOpaqueMax: number;
    skyClipMax: number;
  };
  /** Chord tolerance and clamps for emitted primitives. */
  tessellation: Tessellation;
  /** Deliverable containers the export stage emits. */
  exportFormats: Array<"usda" | "usdz" | "glb" | "obj" | "fbx" | "stl" | "ply">;
  /** LOD triangle-keep ratios (0,1); empty = no LOD variants. */
  lodRatios: number[];
  budgets: { maxTrianglesPerMesh?: number; maxTrianglesTotal?: number };
  /** Project overrides for role-driven intent budgets, keyed by role name and
   *  by part id — layered over the built-in ROLE_PROFILES (see lint/budgets). */
  roleBudgets: Record<string, Budget>;
  partBudgets: Record<string, Budget>;
  proof: NonNullable<Scene3dContract["proof"]>;
  /** Proof-quality lint thresholds, resolved from `proof` with defaults. */
  proofThresholds: { emptyLuminance: number; sparseCoverage: number; blownRatio: number };
  /** Print DfM thresholds; null = not printing = the DfM checks are inert.
   *  `measureThickness` gates the (costly) ray-cast: on only when there is a
   *  thickness threshold to check against. */
  print: {
    minThicknessMm: number | null;
    maxOverhangAreaFraction: number | null;
    measureThickness: boolean;
  };
  /** Robust z cutoff for the size / tri-density outlier facts (default 3.5). */
  outlierZ: number;
  /** Generic voxel discipline (engine-agnostic). `enabled` gates the voxel
   *  census facts, the solver grid-snap, off-grid lint (W-970) and the pixel-art
   *  texel authority; off, they are inert and the census is byte-identical.
   *  Grid in metres. Implied by the minecraft target. */
  voxel: {
    enabled: boolean;
    gridSize: number;
    gridTolerance: number;
    pxPerBlock: number | null;
  };
  /** Minecraft FORMAT discipline — layers on top of `voxel`. `enabled` gates the
   *  cuboid/rotation/element-bounds rules (W-971/972/973), the structure class,
   *  and the model.json/geometry.json export. Bounds in blocks. */
  minecraft: {
    enabled: boolean;
    dialect: "java" | "bedrock";
    elementMinBlocks: number;
    elementMaxBlocks: number;
  };
}

export function normalizeContract(contract?: Scene3dContract): NormalizedContract {
  const c = contract ?? DEFAULT_CONTRACT;
  // The target preset (if any) is the fallback layer between hardcoded
  // defaults and the file's explicit conventions: `{ ...preset, ...explicit }`
  // means any field the author wrote wins, any field they left out inherits
  // the target's convention, and everything else stays neutral default.
  const pp = c.target ? (TARGET_PROFILES[c.target] ?? {}) : {};
  const n = c.conventions?.naming ?? {};
  const h = c.conventions?.hierarchy ?? {};
  const u = { ...pp.units, ...c.conventions?.units };
  const p = c.conventions?.pbr ?? {};
  const a = c.conventions?.animation ?? {};
  const g = c.conventions?.grounding ?? {};
  const b = { ...pp.budgets, ...c.conventions?.budgets };
  const uv = { ...pp.uv, ...c.conventions?.uv };
  const tex = { ...pp.textures, ...c.conventions?.textures };
  const geo = { ...pp.geometry, ...c.conventions?.geometry };
  const pr = { ...pp.print, ...c.conventions?.print };
  const vx = { ...pp.voxel, ...c.conventions?.voxel };
  const mc = { ...pp.minecraft, ...c.conventions?.minecraft };
  // Minecraft is a SPECIALISATION of voxel: the minecraft target/block implies
  // the generic voxel discipline, but a plain `voxel` target (MagicaVoxel →
  // Unity, etc.) gets grid + pixel-density WITHOUT any Minecraft format rule.
  const mcEnabled = c.target === "minecraft" || c.conventions?.minecraft !== undefined;
  const voxelEnabled = mcEnabled || c.target === "voxel" || c.conventions?.voxel !== undefined;
  // Grid / pixel-density are VOXEL data. They read from `conventions.voxel`,
  // falling back to `conventions.minecraft` (deprecated shorthand) so a bare
  // minecraft contract still works, then to defaults.
  const gridSrc = (vx.grid ?? (mc as { grid?: unknown }).grid) as { size?: unknown; tolerance?: unknown } | undefined;
  const pxSrc = (vx as { pxPerBlock?: unknown }).pxPerBlock ?? (mc as { pxPerBlock?: unknown }).pxPerBlock;
  const voxelGridSize = (() => {
    const gs = numOr(gridSrc?.size, 1 / 16);
    return gs > 0 ? gs : 1 / 16;
  })();
  const voxelGridTolerance = (() => {
    const t = numOr(gridSrc?.tolerance, 1 / 256);
    return t >= 0 ? t : 1 / 256;
  })();
  const voxelPxPerBlock = (() => {
    const v = finiteOrNull(pxSrc);
    return v !== null && v > 0 ? v : null;
  })();
  const mcDialect = (mc as { dialect?: unknown }).dialect === "bedrock" ? "bedrock" : "java";
  const mcElementMin = numOr((mc.elementBounds as { minBlocks?: unknown } | undefined)?.minBlocks, -1);
  const mcElementMax = numOr((mc.elementBounds as { maxBlocks?: unknown } | undefined)?.maxBlocks, 2);
  // The density authority resolves ONCE (fable-5 Mechanism 1): an explicit
  // px/m target wins; else a voxel scene with a declared pxPerBlock adopts it
  // (px/block ≡ px/m since 1 block = 1 m); else none. `pixelArt` discipline is
  // exactly "the target came from pxPerBlock", which turns off the PBR role
  // floors and re-aims the spread rule as a mixel detector.
  const explicitTexelTarget = finiteOrNull(uv.texelDensity?.target);
  const effectiveTexelTarget =
    explicitTexelTarget ?? (voxelEnabled && voxelPxPerBlock !== null ? voxelPxPerBlock : null);
  // The bake floor is data, driven by the declared value rather than by a
  // discipline enum: a project that says one block is worth 16 px has said a
  // 16-px bake is legal, and nothing downstream needs to know a mode name.
  const bakeMin = voxelPxPerBlock !== null ? pow2Floor(voxelPxPerBlock) : 64;
  /* Largest float32 bake atlas, in bytes. Resource-denominated rather than a
     frame cap: what hurts is the allocation, and the same frame count is
     harmless at a small cell size and fatal at a large one. Raisable, because
     a bigger machine really can bake a bigger sheet — a wall you can raise is
     a resource negotiation, not a refusal. */
  const atlasBytes = intIn(
    (c.conventions as { shade?: { maxAtlasBytes?: unknown } } | undefined)?.shade?.maxAtlasBytes,
    1,
    Number.MAX_SAFE_INTEGER,
    1024 ** 3,
  );
  // Field-by-field, not a spread: this block is not only lint config, it is
  // the RENDER JOB. A wrong-typed `engine` or `resolution` from a programmatic
  // contract used to pass straight through to Blender, where "big" pixels is
  // not a threshold that silently disables a rule but a render that fails.
  const rawProof = (c.proof ?? {}) as Record<string, unknown>;
  const dp = DEFAULT_CONTRACT.proof!;
  const proof: NonNullable<Scene3dContract["proof"]> = {
    engine: rawProof.engine === "CYCLES" ? "CYCLES" : dp.engine,
    resolution: intIn(rawProof.resolution, 64, 8192, dp.resolution!),
    turntable: boolOr(rawProof.turntable, dp.turntable!),
    turntableSteps: intIn(rawProof.turntableSteps, 1, 360, dp.turntableSteps!),
    respectSceneCamera: boolOr(rawProof.respectSceneCamera, dp.respectSceneCamera!),
    ...(typeof rawProof.background === "string" ? { background: rawProof.background } : {}),
    ...(finiteOrNull(rawProof.emptyLuminance) !== null ? { emptyLuminance: rawProof.emptyLuminance as number } : {}),
    ...(finiteOrNull(rawProof.sparseCoverage) !== null ? { sparseCoverage: rawProof.sparseCoverage as number } : {}),
    ...(finiteOrNull(rawProof.blownRatio) !== null ? { blownRatio: rawProof.blownRatio as number } : {}),
  };
  const minThicknessMm = finiteOrNull(pr.minThicknessMm);
  const maxOverhangAreaFraction = finiteOrNull(pr.maxOverhangAreaFraction);
  return {
    objectPattern: safePattern(n.objectPattern, DEFAULT_CONTRACT.conventions!.naming!.objectPattern!),
    collectionPattern: safePattern(
      n.collectionPattern,
      DEFAULT_CONTRACT.conventions!.naming!.collectionPattern!,
    ),
    forbidDefaultNames: boolOr(n.forbidDefaultNames, true),
    partPrefixes: asArray<string>(n.partPrefixes, []),
    // Every numeric field is coerced to a finite value: `?? default` guards
    // only null/undefined, so a NaN/Infinity/string reaching here via a
    // programmatic contract (which C-1 validates, but normalize must not crash
    // or emit NaN for) would otherwise flow through as a dead threshold.
    maxDepth: numOr(h.maxDepth, 8),
    metersPerUnit: numOr(u.metersPerUnit, 1),
    upAxis: u.upAxis === "Z" ? "Z" : "Y",
    metallicValues: asArray<number>(p.metallicValues, [0, 1]),
    roughnessRange: asArray<number>(p.roughnessRange, [0, 1]) as [number, number],
    iorRange: asArray<number>(p.iorRange, [1, 2.5]) as [number, number],
    pbrRealism: {
      enabled: boolOr(p.realism?.enabled, true),
      darkLuminanceMax: numOr(p.realism?.darkLuminanceMax, 0.02),
      metalMin: numOr(p.realism?.metalMin, 0.9),
      roughMax: numOr(p.realism?.roughMax, 0.1),
    },
    fps: numOr(a.fps, 24),
    maxFrames: numOr(a.maxFrames, 0),
    grounding: {
      // Off by default: grounding is meaningful for props and wrong for a
      // scene composed in world space, so it is opted into per project.
      enabled: boolOr(g.enabled, false),
      tolerance: numOr(g.tolerance, 0.005),
      exempt: asArray<string>(g.exempt, []),
    },
    uv: {
      require: uv.require === "all" || uv.require === "off" ? uv.require : "textured",
      maxOverlapFraction: numOr(uv.maxOverlapFraction, 0.05),
      allowFlipped: boolOr(uv.allowFlipped, false),
      // Tiling is legitimate, so out-of-bounds is unbounded unless the
      // project says otherwise (trim sheets / atlases set this near 0).
      maxOutOfBoundsFraction: numOr(uv.maxOutOfBoundsFraction, 1),
      // Positive number or the "off" null — a wrong-typed value reaching here
      // via a programmatic contract must not flow through as a bad threshold.
      maxStretch:
        typeof uv.maxStretch === "number" && uv.maxStretch > 0 ? uv.maxStretch : null,
      texelDensityTarget: effectiveTexelTarget,
      texelDensityMaxRatio: numOr(uv.texelDensity?.maxRatio, 4),
    },
    shade: { bakeMin, bakeMax: 4096, maxAtlasBytes: atlasBytes },
    // Iglewicz–Hoaglin robust-z cutoff — a citable statistical constant, not a
    // domain threshold; overridable for a scene that mixes scales on purpose.
    outlierZ: (() => {
      const z = numOr(c.conventions?.coherence?.outlierZ, 3.5);
      return z > 0 ? z : 3.5;
    })(),
    textures: {
      requirePowerOfTwo: boolOr(tex.requirePowerOfTwo, true),
      maxSize: numOr(tex.maxSize, 4096),
      flagDuplicateMaterials: boolOr(tex.flagDuplicateMaterials, true),
      requireFaceAssignment: boolOr(tex.requireFaceAssignment, true),
    },
    geometry: {
      allowOpenMeshes: boolOr(geo.allowOpenMeshes, false),
      allowNgons: boolOr(geo.allowNgons, false),
      allowLooseGeometry: boolOr(geo.allowLooseGeometry, false),
      allowDoubleVertices: boolOr(geo.allowDoubleVertices, false),
      allowInconsistentWinding: boolOr(geo.allowInconsistentWinding, false),
      allowNegativeScale: boolOr(geo.allowNegativeScale, false),
      requireAppliedScale: boolOr(geo.requireAppliedScale, true),
      // 0 = the rule is off. A declared value is a real assembly/print/
      // animation tolerance in metres; W-109 reports pairs inside it.
      minClearance: numOr(geo.minClearance, 0),
      // The runner default, kept in one place: raising it buys the coplanar
      // check on dense pairs at quadratic cost, which is the author's
      // trade to make, not the module's.
      // 2M total tri-pair comparisons ~= a couple of seconds of narrow phase:
      // everything the old per-pair regime actually ran still runs, and the
      // heavy pairs it silently walled off now skip with a raisable number.
      zFightingPairBudget: numOr(geo.zFightingPairBudget, 2_000_000),
      // Raisable runaway backstops (not size caps): default generous, an author
      // building a real crowd/forest lifts them rather than being refused.
      maxParts: Math.max(1, Math.floor(numOr(geo.maxParts, MAX_PARTS))),
      maxRepeatCount: Math.max(1, Math.floor(numOr(geo.maxRepeatCount, MAX_REPEAT_COUNT))),
    },
    sheets: asArray(c.sheets, []) as NonNullable<Scene3dContract["sheets"]>,
    tessellation: {
      chordToleranceM: numOr(
        c.conventions?.tessellation?.chordToleranceM,
        TESSELLATION_DEFAULTS.chordToleranceM,
      ),
      minSegments: Math.round(
        numOr(c.conventions?.tessellation?.minSegments, TESSELLATION_DEFAULTS.minSegments),
      ),
      maxSegments: Math.round(
        numOr(c.conventions?.tessellation?.maxSegments, TESSELLATION_DEFAULTS.maxSegments),
      ),
    },
    sheetRules: {
      maxDimension: numOr(c.conventions?.sheets?.maxDimension, SHEET_DEFAULTS.maxDimension),
      seamTolerance: numOr(c.conventions?.sheets?.seamTolerance, SHEET_DEFAULTS.seamTolerance),
      additiveBorderMax: numOr(
        c.conventions?.sheets?.additiveBorderMax,
        SHEET_DEFAULTS.additiveBorderMax,
      ),
      fullAlphaMin: numOr(c.conventions?.sheets?.fullAlphaMin, SHEET_DEFAULTS.fullAlphaMin),
      sparseCoverageMin: numOr(
        c.conventions?.sheets?.sparseCoverageMin,
        SHEET_DEFAULTS.sparseCoverageMin,
      ),
      tintHueMax: numOr(c.conventions?.sheets?.tintHueMax, SHEET_DEFAULTS.tintHueMax),
      cellBleedMax: numOr(c.conventions?.sheets?.cellBleedMax, SHEET_DEFAULTS.cellBleedMax),
      beamSeamMax: numOr(c.conventions?.sheets?.beamSeamMax, SHEET_DEFAULTS.beamSeamMax),
      particleBorderTouchMax: numOr(
        c.conventions?.sheets?.particleBorderTouchMax,
        SHEET_DEFAULTS.particleBorderTouchMax,
      ),
      skyNonOpaqueMax: numOr(c.conventions?.sheets?.skyNonOpaqueMax, SHEET_DEFAULTS.skyNonOpaqueMax),
      skyClipMax: numOr(c.conventions?.sheets?.skyClipMax, SHEET_DEFAULTS.skyClipMax),
    },
    // USD is the interchange stage, GLB the web-viewer mesh; both ship by
    // default so neither the author nor the agent ever has to think about
    // containers. Projects with a different delivery policy override here.
    /*
     * Default to the containers a person is actually asked for: the
     * authoring stage (USDA), the engine/web container (GLB), the DCC
     * interchange pair (OBJ+MTL, FBX), and the AR one (USDZ). Emitting them
     * costs one exporter call each on an already-loaded scene, and the
     * alternative is a user who finds out their pipeline needed FBX only
     * after the compile they were waiting on has finished.
     *
     * STL and PLY stay opt-in: they carry no materials, so shipping them by
     * default would put two lossy files in every download menu.
     */
    exportFormats: (() => {
      // FILTERED to the schema's own legal set, never cast: `["blend"]`
      // used to be adopted straight into exportFormats — a value the
      // validator (now) rejects must degrade to the same contract as
      // omitting it, per the reject-loudly/degrade-safely discipline.
      const fmts = asArray<unknown>(c.export?.formats, []).filter(
        (f): f is (typeof EXPORT_FORMAT_VALUES)[number] =>
          typeof f === "string" &&
          (EXPORT_FORMAT_VALUES as readonly string[]).includes(f),
      );
      if (fmts.length > 0) return fmts;
      const preset = (c.target ? TARGET_EXPORT_FORMATS[c.target] : undefined)
        ?? DEFAULT_EXPORT_FORMATS;
      return [...preset];
    })(),
    // Only ratios that actually reduce; a LOD at ≥1 or ≤0 is meaningless and
    // is dropped rather than shipped as a same-size or empty "LOD". asArray
    // guards a non-array `lod` (a string), which used to crash the .filter.
    lodRatios: asArray<unknown>(c.export?.lod, []).filter(
      (r): r is number => typeof r === "number" && r > 0 && r < 1,
    ),
    budgets: {
      ...(numOrUndef(b.maxTrianglesPerMesh) !== undefined
        ? { maxTrianglesPerMesh: numOrUndef(b.maxTrianglesPerMesh)! }
        : {}),
      ...(numOrUndef(b.maxTrianglesTotal) !== undefined
        ? { maxTrianglesTotal: numOrUndef(b.maxTrianglesTotal)! }
        : {}),
    },
    // Intent-budget overrides pass through as plain objects (a non-object is
    // ignored, not crashed — same defensiveness as every other field). The
    // per-bound numbers inside are validated where they are consumed.
    roleBudgets: asBudgetMap((b as { roles?: unknown }).roles),
    partBudgets: asBudgetMap((b as { parts?: unknown }).parts),
    print: {
      minThicknessMm,
      maxOverhangAreaFraction,
      // Only pay for the ray-cast when a thickness gate will read it.
      measureThickness: minThicknessMm !== null,
    },
    voxel: {
      enabled: voxelEnabled,
      gridSize: voxelGridSize,
      gridTolerance: voxelGridTolerance,
      pxPerBlock: voxelPxPerBlock,
    },
    minecraft: {
      enabled: mcEnabled,
      dialect: mcDialect,
      elementMinBlocks: mcElementMin,
      elementMaxBlocks: mcElementMax,
    },
    proof,
    proofThresholds: {
      // Defaults from the rule module that owns their rationale, not a second
      // copy of the same three numbers. The module's own default argument is
      // unreachable in production (rules.ts always passes these), so a drift
      // between the two would have shown up only in tests — which is to say,
      // as a green suite and a wrong compile.
      //
      // `pos` still guards a wrong-typed programmatic value, like uv/lod above.
      emptyLuminance: pos(proof.emptyLuminance, DEFAULT_PROOF_THRESHOLDS.emptyLuminance),
      sparseCoverage: pos(proof.sparseCoverage, DEFAULT_PROOF_THRESHOLDS.sparseCoverage),
      blownRatio: pos(proof.blownRatio, DEFAULT_PROOF_THRESHOLDS.blownRatio),
    },
  };
}

/** The largest power of two ≤ n (≥ 1). Used to floor a declared pixel-art
 *  bake resolution to a legal power-of-two without inventing a constant. */
function pow2Floor(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  // Exact integer doubling, not 2 ** floor(log2(n)): this floors a bake
  // resolution that reaches the baked pixels, and Math.log2's last ULP is not
  // bit-identical across libm builds — a boundary flip would ship a different
  // resolution on two machines, the determinism guarantee this package holds.
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

/** A finite positive number, or the fallback — defensive against a bad
 *  programmatic value that skipped validateContract. */
function pos(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** A boolean, or the fallback. `?? default` guards only null/undefined, so a
 *  truthy string like "yes" from a programmatic contract would be adopted as
 *  the value and flip the rule — the mirror of the numeric `numOr` guard. */
function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** An integer inside [lo, hi], or the fallback. Guards the fields that are
 *  render JOB parameters rather than thresholds. */
function intIn(value: unknown, lo: number, hi: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= lo && value <= hi
    ? value
    : fallback;
}

/** A finite number, or the fallback. A NaN/Infinity/string budget must never
 *  reach a threshold — `?? default` only guards null/undefined, so `NaN ?? 8`
 *  is still NaN and silently disables the rule (found by fuzzing). */
function numOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A finite number or null — for optional thresholds whose "off" state is
 *  null. A NaN would otherwise read as an authored value. */
function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A finite number or undefined — for optional budgets that are simply absent
 *  when not a real number, so a NaN/string never becomes a live budget. */
function numOrUndef(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** The value if it is an array, else the fallback — defensive so a wrong-typed
 *  programmatic field (a string where an array was expected) cannot crash a
 *  downstream .filter/.includes/.some (found by fuzzing). */
function asArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

/** A plain map of budget objects, or {} — each entry kept only if it is itself
 *  a plain object, so a malformed override degrades to ungated, never a crash. */
function asBudgetMap(value: unknown): Record<string, Budget> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, Budget> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "object" && v !== null && !Array.isArray(v)) out[key] = v as Budget;
  }
  return out;
}

/**
 * A JSON-safe projection of a normalized contract, for the build cache key.
 *
 * The normalized contract carries two `RegExp` fields, and `JSON.stringify`
 * turns a RegExp into `{}` — so hashing the normalized object directly would
 * collapse every pattern to the same value and hand back a cached lint from a
 * DIFFERENT naming rule (a false cache hit, worse than the false miss this
 * whole change removes). Patterns are serialised to `source/flags` so a
 * pattern change still busts the cache while two contracts that normalise
 * identically share a key.
 */
export function contractCacheKey(n: NormalizedContract): unknown {
  return {
    ...n,
    objectPattern: `${n.objectPattern.source}/${n.objectPattern.flags}`,
    collectionPattern: `${n.collectionPattern.source}/${n.collectionPattern.flags}`,
  };
}

function safePattern(pattern: unknown, fallback: string): RegExp {
  // Only a STRING is a pattern. A programmatic contract carrying a number
  // would otherwise become `new RegExp(123)` — a live rule nobody authored.
  const src = typeof pattern === "string" ? pattern : fallback;
  // Prefer Unicode mode so a `\p{L}`-style pattern — the standard way to allow
  // international prim names — compiles as a Unicode property escape instead of
  // silently degrading to the literal class `[p{L}]` and rejecting the very
  // names it was written to permit. Fall back to legacy mode for the rare
  // pattern valid only without `u`, then to the ASCII default, so no working
  // pattern regresses.
  try {
    return new RegExp(src, "u");
  } catch {
    /* fall through */
  }
  try {
    return new RegExp(src);
  } catch {
    return new RegExp(fallback, "u");
  }
}

/**
 * Validate a contract file's shape; returns human-readable problems.
 *
 * Every field rule lives in `CONTRACT_FIELDS` (contract-schema.ts) — the same
 * table the normalize-coverage meta-test replays `normalizeContract` against.
 * This function used to be a hand-written cascade parallel to
 * `normalizeContract`, and the two had drifted: the print, voxel, minecraft
 * and coherence blocks were normalized but never validated, so a malformed
 * value in them was coerced to the default and the rule the author meant to
 * enable stayed silently off. Keep new field rules in the table, not here.
 */
export function validateContract(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return ["contract must be an object"];
  const problems: string[] = [];
  if ((value as Record<string, unknown>).schemaVersion !== 1) problems.push("schemaVersion must be 1");
  problems.push(...validateFields(value));
  return problems;
}
