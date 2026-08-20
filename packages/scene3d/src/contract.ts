import { EngineTarget, Scene3dContract } from "./types.js";

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
  fps: number;
  maxFrames: number;
  grounding: { enabled: boolean; tolerance: number; exempt: string[] };
  uv: {
    require: "textured" | "all" | "off";
    maxOverlapFraction: number;
    allowFlipped: boolean;
    maxOutOfBoundsFraction: number;
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
  budgets: { maxTrianglesPerMesh?: number; maxTrianglesTotal?: number };
  proof: NonNullable<Scene3dContract["proof"]>;
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
    partPrefixes: n.partPrefixes ?? [],
    maxDepth: h.maxDepth ?? 8,
    metersPerUnit: u.metersPerUnit ?? 1,
    upAxis: u.upAxis ?? "Y",
    metallicValues: p.metallicValues ?? [0, 1],
    roughnessRange: p.roughnessRange ?? [0, 1],
    iorRange: p.iorRange ?? [1, 2.5],
    fps: a.fps ?? 24,
    maxFrames: a.maxFrames ?? 10_000,
    grounding: {
      // Off by default: grounding is meaningful for props and wrong for a
      // scene composed in world space, so it is opted into per project.
      enabled: g.enabled ?? false,
      tolerance: g.tolerance ?? 0.005,
      exempt: g.exempt ?? [],
    },
    uv: {
      require: uv.require ?? "textured",
      maxOverlapFraction: uv.maxOverlapFraction ?? 0.05,
      allowFlipped: uv.allowFlipped ?? false,
      // Tiling is legitimate, so out-of-bounds is unbounded unless the
      // project says otherwise (trim sheets / atlases set this near 0).
      maxOutOfBoundsFraction: uv.maxOutOfBoundsFraction ?? 1,
      texelDensityTarget: uv.texelDensity?.target ?? null,
      texelDensityMaxRatio: uv.texelDensity?.maxRatio ?? 4,
    },
    textures: {
      requirePowerOfTwo: tex.requirePowerOfTwo ?? true,
      maxSize: tex.maxSize ?? 4096,
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
    sheets: c.sheets ?? [],
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
    exportFormats:
      c.export?.formats && c.export.formats.length > 0
        ? c.export.formats
        : ["usda", "usdz", "glb", "obj", "fbx"],
    budgets: {
      ...(b.maxTrianglesPerMesh !== undefined ? { maxTrianglesPerMesh: b.maxTrianglesPerMesh } : {}),
      ...(b.maxTrianglesTotal !== undefined ? { maxTrianglesTotal: b.maxTrianglesTotal } : {}),
    },
    proof: proof as NonNullable<Scene3dContract["proof"]>,
  };
}

function safePattern(pattern: string | undefined, fallback: string): RegExp {
  try {
    return new RegExp(pattern ?? fallback);
  } catch {
    return new RegExp(fallback);
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
  return problems;
}