import { Budget, EngineTarget, Scene3dContract } from "./types.js";

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
    animation: { fps: 24, maxFrames: 10_000 },
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
  textures: {
    requirePowerOfTwo: boolean;
    maxSize: number;
    flagDuplicateMaterials: boolean;
    requireFaceAssignment: boolean;
  };
  geometry: {
    allowOpenMeshes: boolean;
    allowLooseGeometry: boolean;
    allowDoubleVertices: boolean;
    allowInconsistentWinding: boolean;
    allowNegativeScale: boolean;
    requireAppliedScale: boolean;
  };
  sheets: NonNullable<Scene3dContract["sheets"]>;
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
  const proof = { ...DEFAULT_CONTRACT.proof, ...(c.proof ?? {}) };
  return {
    objectPattern: safePattern(n.objectPattern, DEFAULT_CONTRACT.conventions!.naming!.objectPattern!),
    collectionPattern: safePattern(
      n.collectionPattern,
      DEFAULT_CONTRACT.conventions!.naming!.collectionPattern!,
    ),
    forbidDefaultNames: n.forbidDefaultNames ?? true,
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
      enabled: p.realism?.enabled ?? true,
      darkLuminanceMax: numOr(p.realism?.darkLuminanceMax, 0.02),
      metalMin: numOr(p.realism?.metalMin, 0.9),
      roughMax: numOr(p.realism?.roughMax, 0.1),
    },
    fps: numOr(a.fps, 24),
    maxFrames: numOr(a.maxFrames, 10_000),
    grounding: {
      // Off by default: grounding is meaningful for props and wrong for a
      // scene composed in world space, so it is opted into per project.
      enabled: g.enabled ?? false,
      tolerance: numOr(g.tolerance, 0.005),
      exempt: asArray<string>(g.exempt, []),
    },
    uv: {
      require: uv.require ?? "textured",
      maxOverlapFraction: numOr(uv.maxOverlapFraction, 0.05),
      allowFlipped: uv.allowFlipped ?? false,
      // Tiling is legitimate, so out-of-bounds is unbounded unless the
      // project says otherwise (trim sheets / atlases set this near 0).
      maxOutOfBoundsFraction: numOr(uv.maxOutOfBoundsFraction, 1),
      // Positive number or the "off" null — a wrong-typed value reaching here
      // via a programmatic contract must not flow through as a bad threshold.
      maxStretch:
        typeof uv.maxStretch === "number" && uv.maxStretch > 0 ? uv.maxStretch : null,
      texelDensityTarget: finiteOrNull(uv.texelDensity?.target),
      texelDensityMaxRatio: numOr(uv.texelDensity?.maxRatio, 4),
    },
    textures: {
      requirePowerOfTwo: tex.requirePowerOfTwo ?? true,
      maxSize: numOr(tex.maxSize, 4096),
      flagDuplicateMaterials: tex.flagDuplicateMaterials ?? true,
      requireFaceAssignment: tex.requireFaceAssignment ?? true,
    },
    geometry: {
      allowOpenMeshes: geo.allowOpenMeshes ?? false,
      allowLooseGeometry: geo.allowLooseGeometry ?? false,
      allowDoubleVertices: geo.allowDoubleVertices ?? false,
      allowInconsistentWinding: geo.allowInconsistentWinding ?? false,
      allowNegativeScale: geo.allowNegativeScale ?? false,
      requireAppliedScale: geo.requireAppliedScale ?? true,
    },
    sheets: asArray(c.sheets, []) as NonNullable<Scene3dContract["sheets"]>,
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
      const fmts = asArray<"usda" | "usdz" | "glb" | "obj" | "fbx" | "stl" | "ply">(
        c.export?.formats,
        [],
      );
      return fmts.length > 0 ? fmts : ["usda", "usdz", "glb", "obj", "fbx"];
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
    proof: proof as NonNullable<Scene3dContract["proof"]>,
    proofThresholds: {
      // Defensive `?? default` also guards a wrong-typed programmatic value,
      // like the uv/lod fields above.
      emptyLuminance: pos(proof.emptyLuminance, 0.002),
      sparseCoverage: pos(proof.sparseCoverage, 0.01),
      blownRatio: pos(proof.blownRatio, 0.6),
    },
  };
}

/** A finite positive number, or the fallback — defensive against a bad
 *  programmatic value that skipped validateContract. */
function pos(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
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

function safePattern(pattern: string | undefined, fallback: string): RegExp {
  const src = pattern ?? fallback;
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

/** Validate a contract file's shape; returns human-readable problems. */
export function validateContract(value: unknown): string[] {
  const problems: string[] = [];
  if (typeof value !== "object" || value === null) return ["contract must be an object"];
  const c = value as Record<string, unknown>;
  if (c.schemaVersion !== 1) problems.push("schemaVersion must be 1");
  if (
    c.target !== undefined &&
    !["unity", "unreal", "godot", "web", "3d_print"].includes(c.target as string)
  ) {
    problems.push("target must be one of 'unity', 'unreal', 'godot', 'web', '3d_print'");
  }
  const units = (c.conventions as Record<string, unknown> | undefined)?.units as
    | Record<string, unknown>
    | undefined;
  if (units) {
    if (units.upAxis !== undefined && units.upAxis !== "Y" && units.upAxis !== "Z") {
      problems.push("conventions.units.upAxis must be 'Y' or 'Z'");
    }
    if (units.metersPerUnit !== undefined && typeof units.metersPerUnit !== "number") {
      problems.push("conventions.units.metersPerUnit must be a number");
    }
  }
  const conventions = c.conventions as Record<string, unknown> | undefined;
  const uv = conventions?.uv as Record<string, unknown> | undefined;
  if (uv) {
    if (uv.require !== undefined && uv.require !== "textured" && uv.require !== "all" && uv.require !== "off") {
      problems.push("conventions.uv.require must be 'textured', 'all', or 'off'");
    }
    for (const key of ["maxOverlapFraction", "maxOutOfBoundsFraction"] as const) {
      const v = uv[key];
      if (v !== undefined && (typeof v !== "number" || v < 0 || v > 1)) {
        problems.push(`conventions.uv.${key} must be a number in [0, 1]`);
      }
    }
    if (uv.maxStretch !== undefined && (typeof uv.maxStretch !== "number" || uv.maxStretch <= 0)) {
      problems.push("conventions.uv.maxStretch must be a positive number");
    }
    const density = uv.texelDensity as Record<string, unknown> | undefined;
    if (density) {
      if (density.target !== undefined && (typeof density.target !== "number" || density.target <= 0)) {
        problems.push("conventions.uv.texelDensity.target must be a positive number");
      }
      if (density.maxRatio !== undefined && (typeof density.maxRatio !== "number" || density.maxRatio < 1)) {
        problems.push("conventions.uv.texelDensity.maxRatio must be a number >= 1");
      }
    }
  }
  const textures = conventions?.textures as Record<string, unknown> | undefined;
  if (textures) {
    if (textures.maxSize !== undefined && (typeof textures.maxSize !== "number" || textures.maxSize < 1)) {
      problems.push("conventions.textures.maxSize must be a positive number");
    }
    for (const key of ["requirePowerOfTwo", "flagDuplicateMaterials", "requireFaceAssignment"] as const) {
      if (textures[key] !== undefined && typeof textures[key] !== "boolean") {
        problems.push(`conventions.textures.${key} must be a boolean`);
      }
    }
  }
  // Boolean knobs must be booleans: a truthy string like "yes" would
  // otherwise sail through the `?? default` in normalizeContract and flip
  // the rule silently instead of surfacing S3D-E-104.
  if (uv && uv.allowFlipped !== undefined && typeof uv.allowFlipped !== "boolean") {
    problems.push("conventions.uv.allowFlipped must be a boolean");
  }
  const exportBlock = c.export as Record<string, unknown> | undefined;
  if (exportBlock?.lod !== undefined) {
    if (
      !Array.isArray(exportBlock.lod) ||
      !exportBlock.lod.every((r) => typeof r === "number" && r > 0 && r < 1)
    ) {
      problems.push("export.lod must be an array of triangle-keep ratios in (0, 1)");
    }
  }
  const geometry = conventions?.geometry as Record<string, unknown> | undefined;
  if (geometry) {
    for (const key of [
      "allowOpenMeshes",
      "allowLooseGeometry",
      "allowDoubleVertices",
      "allowInconsistentWinding",
      "allowNegativeScale",
      "requireAppliedScale",
    ] as const) {
      if (geometry[key] !== undefined && typeof geometry[key] !== "boolean") {
        problems.push(`conventions.geometry.${key} must be a boolean`);
      }
    }
  }
  // Budget/grounding/proof numerics were unchecked, so a string budget
  // (`"big"`) reached `tris > "big"` -> NaN -> false and silently disabled the
  // rule, and `proof.resolution: 100000` / `turntableSteps: 99999` would have
  // driven an OOM render or 99k frames. Validate them up front so a malformed
  // contract is rejected (S3D-E-104) rather than half-honoured.
  const budgets = conventions?.budgets as Record<string, unknown> | undefined;
  if (budgets) {
    for (const key of ["maxTrianglesPerMesh", "maxTrianglesTotal"] as const) {
      const v = budgets[key];
      if (v !== undefined && (typeof v !== "number" || !Number.isInteger(v) || v < 1)) {
        problems.push(`conventions.budgets.${key} must be a positive integer`);
      }
    }
  }
  const grounding = conventions?.grounding as Record<string, unknown> | undefined;
  if (grounding) {
    if (grounding.enabled !== undefined && typeof grounding.enabled !== "boolean") {
      problems.push("conventions.grounding.enabled must be a boolean");
    }
    if (
      grounding.tolerance !== undefined &&
      (typeof grounding.tolerance !== "number" || !Number.isFinite(grounding.tolerance) || grounding.tolerance < 0)
    ) {
      problems.push("conventions.grounding.tolerance must be a non-negative number");
    }
    if (
      grounding.exempt !== undefined &&
      (!Array.isArray(grounding.exempt) || !grounding.exempt.every((e) => typeof e === "string"))
    ) {
      problems.push("conventions.grounding.exempt must be an array of strings");
    }
  }
  const proof = c.proof as Record<string, unknown> | undefined;
  if (proof) {
    if (
      proof.resolution !== undefined &&
      (typeof proof.resolution !== "number" || !Number.isInteger(proof.resolution) || proof.resolution < 64 || proof.resolution > 8192)
    ) {
      problems.push("proof.resolution must be an integer in [64, 8192]");
    }
    if (
      proof.turntableSteps !== undefined &&
      (typeof proof.turntableSteps !== "number" || !Number.isInteger(proof.turntableSteps) || proof.turntableSteps < 1 || proof.turntableSteps > 360)
    ) {
      problems.push("proof.turntableSteps must be an integer in [1, 360]");
    }
    for (const key of ["turntable", "respectSceneCamera"] as const) {
      if (proof[key] !== undefined && typeof proof[key] !== "boolean") {
        problems.push(`proof.${key} must be a boolean`);
      }
    }
    if (proof.engine !== undefined && proof.engine !== "BLENDER_EEVEE" && proof.engine !== "CYCLES") {
      problems.push("proof.engine must be 'BLENDER_EEVEE' or 'CYCLES'");
    }
    for (const key of ["emptyLuminance", "sparseCoverage", "blownRatio"] as const) {
      const v = proof[key];
      if (v !== undefined && (typeof v !== "number" || !(v > 0) || v > 1)) {
        problems.push(`proof.${key} must be a number in (0, 1]`);
      }
    }
  }
  return problems;
}