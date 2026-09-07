/**
 * The single declaration of every author-writable contract field.
 *
 * A contract is read by two layers that must agree about which fields exist:
 * `validateContract` rejects a malformed value loudly (S3D-E-104) and
 * `normalizeContract` degrades safely so a programmatic contract can never
 * crash a downstream comparison. Both behaviours are correct; what is not
 * correct is for them to disagree, and as two hand-maintained cascades they
 * had drifted. The `print`, `voxel`, `minecraft` and `coherence` blocks were
 * normalized but never validated, so
 *
 *     { conventions: { print: { minThicknessMm: "big" } } }
 *
 * passed validation with zero problems and then coerced to the default — the
 * thin-wall rule the author believed they had just enabled was silently OFF.
 * A check that is inert because nobody could read the author's value is
 * exactly the "silence is not evidence" failure this compiler exists to catch,
 * and the compiler was committing it against its own configuration.
 *
 * So the field list is data, declared once. `validateContract` walks it, and
 * `contract-schema.test.ts` holds the two layers together from both ends: for
 * every declared field a wrong-typed value must be REJECTED and must normalize
 * to exactly the same contract as omitting it, and every leaf the defaults or
 * target profiles mention must appear here. Adding a normalized field without
 * declaring it is a red test now, not a silently disabled rule an audit finds
 * months later.
 */

/** How a leaf is allowed to be spelled, and how to say so when it is not. */
export type FieldSpec = {
  /** Dotted path from the contract root, e.g. `conventions.uv.maxStretch`. */
  path: string;
  /**
   * Overrides the generated "must be …" tail. Used where the long-standing
   * wording reads better than anything derivable (`'Y' or 'Z'`), never to
   * describe a different rule than the constraints below.
   */
  expected?: string;
} & (
  | { kind: "boolean" }
  | { kind: "string" }
  /** A string that must COMPILE as a regular expression. `safePattern`
   *  degrades an invalid one to the default at normalize time (total, never
   *  crashing), so without this kind an authored `"["` validated clean and
   *  the default rule silently won — the exact silently-disabled-rule
   *  failure the top of this file documents. */
  | { kind: "pattern" }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "object" }
  | ({ kind: "number" } & Range)
  | ({ kind: "numberArray"; length?: number } & Range)
  /** With `values`, every entry must come from the list — an enum array.
   *  Without it, any strings pass (author vocabulary like part prefixes). */
  | { kind: "stringArray"; values?: readonly string[] }
);

type Range = {
  min?: number;
  max?: number;
  exclusiveMin?: boolean;
  exclusiveMax?: boolean;
  integer?: boolean;
};

/** Containers whose contents this table describes; a non-object here would
 *  make every leaf below it read as "absent" and disable those rules. */
export const CONTRACT_CONTAINERS = [
  "conventions",
  "conventions.naming",
  "conventions.hierarchy",
  "conventions.units",
  "conventions.pbr",
  "conventions.pbr.realism",
  "conventions.animation",
  "conventions.grounding",
  "conventions.budgets",
  "conventions.uv",
  "conventions.uv.texelDensity",
  "conventions.textures",
  "conventions.geometry",
  "conventions.shade",
  "conventions.print",
  "conventions.voxel",
  "conventions.voxel.grid",
  "conventions.minecraft",
  "conventions.minecraft.elementBounds",
  "conventions.minecraft.grid",
  "conventions.tessellation",
  "conventions.sheets",
  "conventions.coherence",
  "proof",
  "export",
] as const;

/** The containers the export stage can actually produce — the ONE list the
 *  schema validates against and normalize filters with, so "validated" and
 *  "produced" can never name different sets. */
export const EXPORT_FORMAT_VALUES = ["usda", "usdz", "glb", "obj", "fbx", "stl", "ply"] as const;

export const ENGINE_TARGETS = [
  "unity",
  "unreal",
  "godot",
  "web",
  "3d_print",
  "voxel",
  "minecraft",
] as const;

export const CONTRACT_FIELDS: readonly FieldSpec[] = [
  { path: "target", kind: "enum", values: ENGINE_TARGETS },

  /* naming */
  { path: "conventions.naming.objectPattern", kind: "pattern" },
  { path: "conventions.naming.collectionPattern", kind: "pattern" },
  { path: "conventions.naming.forbidDefaultNames", kind: "boolean" },
  { path: "conventions.naming.partPrefixes", kind: "stringArray" },

  /* hierarchy / units */
  { path: "conventions.hierarchy.maxDepth", kind: "number", min: 1, integer: true },
  { path: "conventions.units.metersPerUnit", kind: "number", expected: "a number" },
  { path: "conventions.units.upAxis", kind: "enum", values: ["Y", "Z"], expected: "'Y' or 'Z'" },
  { path: "conventions.units.maxExtentM", kind: "number", min: 0, expected: "a non-negative number of metres (0 = unjudged)" },

  /* pbr */
  { path: "conventions.pbr.metallicValues", kind: "numberArray" },
  // TUPLES, not lists: normalize casts these straight to [lo, hi], so `[]`
  // or `[0.5]` used to validate clean and hand consumers undefined bounds.
  { path: "conventions.pbr.roughnessRange", kind: "numberArray", length: 2 },
  { path: "conventions.pbr.iorRange", kind: "numberArray", length: 2 },
  { path: "conventions.pbr.realism.enabled", kind: "boolean" },
  { path: "conventions.pbr.realism.darkLuminanceMax", kind: "number", min: 0 },
  { path: "conventions.pbr.realism.metalMin", kind: "number", min: 0, max: 1 },
  { path: "conventions.pbr.realism.roughMax", kind: "number", min: 0, max: 1 },

  /* animation */
  { path: "conventions.animation.fps", kind: "number", min: 0, exclusiveMin: true },
  // Zero is legal and is the default: it means NO clip-length budget. A
  // minimum of 1 would make the shipped default contract fail its own
  // validator, and would force every project to carry a ceiling it never
  // asked for.
  { path: "conventions.animation.maxFrames", kind: "number", min: 0, integer: true },

  /* grounding */
  { path: "conventions.grounding.enabled", kind: "boolean" },
  { path: "conventions.grounding.tolerance", kind: "number", min: 0 },
  { path: "conventions.grounding.exempt", kind: "stringArray" },

  /* budgets */
  { path: "conventions.budgets.maxTrianglesPerMesh", kind: "number", min: 1, integer: true },
  { path: "conventions.budgets.maxTrianglesTotal", kind: "number", min: 1, integer: true },
  { path: "conventions.budgets.roles", kind: "object" },
  { path: "conventions.budgets.parts", kind: "object" },

  /* uv */
  { path: "conventions.uv.require", kind: "enum", values: ["textured", "all", "off"] },
  { path: "conventions.uv.maxOverlapFraction", kind: "number", min: 0, max: 1 },
  { path: "conventions.uv.maxOutOfBoundsFraction", kind: "number", min: 0, max: 1 },
  { path: "conventions.uv.maxStretch", kind: "number", min: 0, exclusiveMin: true },
  { path: "conventions.uv.allowFlipped", kind: "boolean" },
  { path: "conventions.uv.texelDensity.target", kind: "number", min: 0, exclusiveMin: true },
  {
    path: "conventions.uv.texelDensity.maxRatio",
    kind: "number",
    min: 1,
    expected: "a number >= 1",
  },

  /* textures */
  { path: "conventions.textures.maxSize", kind: "number", min: 1, expected: "a positive number" },
  { path: "conventions.textures.requirePowerOfTwo", kind: "boolean" },
  { path: "conventions.textures.flagDuplicateMaterials", kind: "boolean" },
  { path: "conventions.textures.requireFaceAssignment", kind: "boolean" },

  /* geometry */
  { path: "conventions.geometry.allowOpenMeshes", kind: "boolean" },
  { path: "conventions.geometry.allowNgons", kind: "boolean" },
  { path: "conventions.geometry.allowLooseGeometry", kind: "boolean" },
  { path: "conventions.geometry.allowDoubleVertices", kind: "boolean" },
  { path: "conventions.geometry.allowInconsistentWinding", kind: "boolean" },
  { path: "conventions.geometry.allowNegativeScale", kind: "boolean" },
  { path: "conventions.geometry.minClearance", kind: "number", min: 0 },
  { path: "conventions.geometry.requireAppliedScale", kind: "boolean" },
  // Per-pair triangle-product budget for the coplanar comparison. The
  // ceiling is a typo backstop only (a pasted 2e12 must refuse loudly, not
  // stall the compile for hours); it sits orders of magnitude above any
  // declared trade an author means, and within it the cost is theirs.
  // `integer: true` because the runner consumes this with int(): without the
  // gate a fractional budget was silently floored — the schema is the ONE
  // validator, so the truncation must be a refusal here, not a quiet edit.
  { path: "conventions.geometry.zFightingPairBudget", kind: "number", min: 1000, max: 1_000_000_000, integer: true },
  /* The solver reads both of these and the docs name them, but neither was
     declared here — so a project that raised either one was refused with
     E-104 for using a knob the compiler itself consumes. Raisable ceilings on
     a resource, not size caps: the values are the scale a machine can carry. */
  { path: "conventions.geometry.maxParts", kind: "number", min: 1, max: 10_000_000, integer: true },
  { path: "conventions.geometry.maxRepeatCount", kind: "number", min: 1, max: 10_000_000, integer: true },
  /* The bake atlas budget in bytes. Same story: consumed by the shader
     validator, named in its own refusal message, and undeclared here. */
  { path: "conventions.shade.maxAtlasBytes", kind: "number", min: 1, max: Number.MAX_SAFE_INTEGER, integer: true },

  /* print (DfM) — was normalized but never validated */
  { path: "conventions.print.minThicknessMm", kind: "number", min: 0, exclusiveMin: true },
  { path: "conventions.print.maxOverhangAreaFraction", kind: "number", min: 0, max: 1 },

  /* voxel — was normalized but never validated */
  { path: "conventions.voxel.grid.size", kind: "number", min: 0, exclusiveMin: true },
  { path: "conventions.voxel.grid.tolerance", kind: "number", min: 0 },
  { path: "conventions.voxel.pxPerBlock", kind: "number", min: 0, exclusiveMin: true },

  /* minecraft — was normalized but never validated. `grid`/`pxPerBlock` here
   * are the deprecated pre-split spellings kept for back-compat; they are read
   * by normalize, so they are declared and validated like any other field. */
  { path: "conventions.minecraft.dialect", kind: "enum", values: ["java", "bedrock"] },
  { path: "conventions.minecraft.elementBounds.minBlocks", kind: "number" },
  { path: "conventions.minecraft.elementBounds.maxBlocks", kind: "number" },
  { path: "conventions.minecraft.grid.size", kind: "number", min: 0, exclusiveMin: true },
  { path: "conventions.minecraft.grid.tolerance", kind: "number", min: 0 },
  { path: "conventions.minecraft.pxPerBlock", kind: "number", min: 0, exclusiveMin: true },

  /* emitted-primitive tessellation */
  { path: "conventions.tessellation.chordToleranceM", kind: "number", min: 1e-6, max: 1 },
  { path: "conventions.tessellation.minSegments", kind: "number", min: 3, max: 4096, integer: true },
  { path: "conventions.tessellation.maxSegments", kind: "number", min: 3, max: 4096, integer: true },

  /* 2D sheet rules */
  { path: "conventions.sheets.maxDimension", kind: "number", min: 1, integer: true },
  { path: "conventions.sheets.seamTolerance", kind: "number", min: 0, max: 255 },
  { path: "conventions.sheets.additiveBorderMax", kind: "number", min: 0, max: 255 },
  { path: "conventions.sheets.fullAlphaMin", kind: "number", min: 0, max: 255 },
  { path: "conventions.sheets.sparseCoverageMin", kind: "number", min: 0, max: 1 },
  { path: "conventions.sheets.tintHueMax", kind: "number", min: 0, max: 1 },
  { path: "conventions.sheets.cellBleedMax", kind: "number", min: 0, integer: true },
  { path: "conventions.sheets.beamSeamMax", kind: "number", min: 0, max: 255 },
  { path: "conventions.sheets.particleBorderTouchMax", kind: "number", min: 0, integer: true },
  { path: "conventions.sheets.skyNonOpaqueMax", kind: "number", min: 0, max: 1 },
  { path: "conventions.sheets.skyClipMax", kind: "number", min: 0, max: 1 },

  /* coherence — was normalized but never validated */
  { path: "conventions.coherence.outlierZ", kind: "number", min: 0, exclusiveMin: true },

  /* proof */
  { path: "proof.engine", kind: "enum", values: ["BLENDER_EEVEE", "CYCLES"] },
  { path: "proof.resolution", kind: "number", min: 64, max: 8192, integer: true },
  { path: "proof.turntable", kind: "boolean" },
  { path: "proof.turntableSteps", kind: "number", min: 1, max: 360, integer: true },
  { path: "proof.respectSceneCamera", kind: "boolean" },
  { path: "proof.background", kind: "string" },
  { path: "proof.emptyLuminance", kind: "number", min: 0, max: 1, exclusiveMin: true },
  { path: "proof.sparseCoverage", kind: "number", min: 0, max: 1, exclusiveMin: true },
  { path: "proof.blownRatio", kind: "number", min: 0, max: 1, exclusiveMin: true },

  /* export */
  {
    path: "export.lod",
    kind: "numberArray",
    min: 0,
    max: 1,
    exclusiveMin: true,
    exclusiveMax: true,
    expected: "an array of triangle-keep ratios in (0, 1)",
  },
  // Every entry must be a container this compiler can actually produce:
  // `["blend"]` used to validate clean and then the export stage either
  // attempted an unsupported format or quietly omitted the deliverable —
  // a requested output lost with no error naming the request.
  {
    path: "export.formats",
    kind: "stringArray",
    values: EXPORT_FORMAT_VALUES,
  },
];

/** Walk a dotted path; returns `undefined` when any step is missing or is not
 *  a plain object (the container itself is reported by `CONTRACT_CONTAINERS`). */
function at(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const key of path.split(".")) {
    if (!isPlainObject(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function inRange(v: number, r: Range): boolean {
  if (r.integer && !Number.isInteger(v)) return false;
  if (r.min !== undefined && (r.exclusiveMin ? !(v > r.min) : !(v >= r.min))) return false;
  if (r.max !== undefined && (r.exclusiveMax ? !(v < r.max) : !(v <= r.max))) return false;
  return true;
}

/** The "must be …" tail for a spec, derived from its own constraints so the
 *  message can never describe a rule the validator does not apply. */
export function describeField(spec: FieldSpec): string {
  if (spec.expected) return spec.expected;
  switch (spec.kind) {
    case "boolean":
      return "a boolean";
    case "string":
      return "a string";
    case "pattern":
      return "a string containing a valid regular expression";
    case "object":
      return "an object";
    case "stringArray":
      return spec.values
        ? `an array drawn from ${spec.values.map((v) => `'${v}'`).join(", ")}`
        : "an array of strings";
    case "enum":
      return `one of ${spec.values.map((v) => `'${v}'`).join(", ")}`;
    case "numberArray":
      return spec.length !== undefined
        ? `an array of exactly ${spec.length} numbers${rangeTail(spec)}`
        : `an array of numbers${rangeTail(spec)}`;
    case "number":
      return numberTail(spec);
  }
}

function numberTail(r: Range): string {
  const noun = r.integer ? "integer" : "number";
  if (r.min !== undefined && r.max === undefined) {
    if (r.min === 0 && r.exclusiveMin) return `a positive ${noun}`;
    if (r.min === 1 && r.integer) return "a positive integer";
    if (r.min === 0 && !r.exclusiveMin) return `a non-negative ${noun}`;
    return `a ${noun} ${r.exclusiveMin ? ">" : ">="} ${r.min}`;
  }
  if (r.min !== undefined && r.max !== undefined) return `an ${noun} in ${interval(r)}`.replace("an number", "a number");
  return `a ${noun}`;
}

function rangeTail(r: Range): string {
  return r.min === undefined && r.max === undefined ? "" : ` in ${interval(r)}`;
}

function interval(r: Range): string {
  const lo = r.exclusiveMin ? "(" : "[";
  const hi = r.exclusiveMax ? ")" : "]";
  return `${lo}${r.min}, ${r.max}${hi}`;
}

/** Validate every declared field present in `raw`. Absent is always fine —
 *  omission means "use the default", which is a legitimate authoring choice. */
export function validateFields(raw: unknown): string[] {
  const problems: string[] = [];
  for (const container of CONTRACT_CONTAINERS) {
    const v = at(raw, container);
    if (v !== undefined && !isPlainObject(v)) problems.push(`${container} must be an object`);
  }
  for (const spec of CONTRACT_FIELDS) {
    const v = at(raw, spec.path);
    if (v === undefined) continue;
    if (!satisfies(v, spec)) problems.push(`${spec.path} must be ${describeField(spec)}`);
  }
  /* The top-level `sheets` DECLARATIONS (distinct from conventions.sheets,
     which tunes how they are judged). Normalize reduces a malformed value
     to an empty list — total, never crashing — so without validation here
     an authored flipbook declaration could silently become "no sheets
     declared" and every 6xx rule the author asked for went quiet. */
  const sheets = at(raw, "sheets");
  if (sheets !== undefined) {
    if (!Array.isArray(sheets)) {
      problems.push("sheets must be an array of sheet declarations ({ file, kind, ... })");
    } else {
      const KINDS = ["sprite", "flipbook", "particle", "beam", "sky"];
      sheets.forEach((entry, i) => {
        if (!isPlainObject(entry)) {
          problems.push(`sheets[${i}] must be an object with a file and a kind`);
          return;
        }
        const e = entry as { file?: unknown; kind?: unknown };
        if (typeof e.file !== "string" || e.file.length === 0) {
          problems.push(`sheets[${i}].file must be a project-relative image path`);
        }
        if (typeof e.kind !== "string" || !KINDS.includes(e.kind)) {
          problems.push(`sheets[${i}].kind must be one of ${KINDS.map((k) => `'${k}'`).join(", ")}`);
        }
      });
    }
  }
  problems.push(...unknownFieldProblems(raw));
  return problems;
}

/* ------------------------------------------------------------------ */
/* Unknown keys                                                        */
/* ------------------------------------------------------------------ */

/**
 * A key this schema has not declared is a sentence the author believes they
 * said. Until now it was IGNORED: `uv.texelDensityMaxRatio` (the wrong
 * nesting) validated clean and the default silently won — the exact
 * "silently disabled rule" failure the top of this file documents, committed
 * one level up from the fields it was written to protect. Field runs hit it.
 *
 * Suggestions come in two tiers: an exact dots-removed match catches the
 * wrong-nesting class outright; otherwise a short edit distance against the
 * legal keys at the same level catches plain typos.
 */
export function unknownFieldProblems(raw: unknown): string[] {
  if (!isPlainObject(raw)) return [];
  const problems: string[] = [];
  const containers = new Set<string>(CONTRACT_CONTAINERS);
  /* Subtrees whose keys are the AUTHOR'S vocabulary (role names, part
     names), not this schema's — an unknown key beneath one is a name,
     never a typo. */
  const opaque = new Set(CONTRACT_FIELDS.filter((f) => f.kind === "object").map((f) => f.path));
  const legal = new Set<string>([
    "schemaVersion",
    "sheets",
    ...containers,
    ...CONTRACT_FIELDS.map((f) => f.path),
  ]);
  const dotless = (p: string) => p.replace(/\./g, "").toLowerCase();
  const byDotless = new Map<string, string>([...legal].map((p) => [dotless(p), p]));
  /* The mirror of scene.json's CONTRACT_KEYS net: scene vocabulary written
     into the contract gets pointed at the right file, because no within-file
     suggestion can rescue a key whose whole family lives next door. */
  const SCENE_KEYS = new Set([
    "parts", "relations", "claims", "materials", "shaders", "camera", "light", "name",
  ]);

  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const key of Object.keys(node)) {
      // The `//` margin-note convention holds in the contract exactly as it
      // does in scene.json: refusing a comment here used to be an E-104
      // that silently reverted EVERY authored convention to defaults.
      if (key.startsWith("//")) continue;
      const full = prefix ? `${prefix}.${key}` : key;
      if (prefix === "" && SCENE_KEYS.has(key)) {
        problems.push(
          `${key} is not a contract field — it belongs in scene.json beside this contract; move it there and compile again`,
        );
        continue;
      }
      if (legal.has(full)) {
        if (opaque.has(full)) continue;
        const child = node[key];
        if (containers.has(full) && isPlainObject(child)) walk(child, full);
        continue;
      }
      const rewrapped = byDotless.get(dotless(full));
      const siblings = [...legal]
        .filter((p) => p.startsWith(prefix ? `${prefix}.` : "") && !p.slice(prefix ? prefix.length + 1 : 0).includes("."))
        .map((p) => (prefix ? p.slice(prefix.length + 1) : p));
      const near = siblings
        .map((s) => ({ s, d: editDistance(key.toLowerCase(), s.toLowerCase()) }))
        .filter((c) => c.d > 0 && c.d <= 2)
        .sort((a, b) => a.d - b.d)[0];
      /* Never a refusal with nothing to steer by: when no suggestion fires,
         the legal keys at this level ARE the map — the same "known fields:"
         tail every scene.json gate already provides. */
      const suggestion = rewrapped
        ? ` — did you mean ${rewrapped}? (note the nesting)`
        : near
          ? ` — did you mean "${near.s}"?`
          : siblings.length > 0
            ? ` — known fields here: ${siblings.sort().join(", ")}`
            : "";
      problems.push(
        `${full} is not a contract field${suggestion}; an unknown key would otherwise be ignored and its default would silently win`,
      );
    }
  };
  walk(raw, "");
  return problems;
}

/** Bounded Levenshtein — distances above 3 all read as "not a typo". */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 4;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

function satisfies(v: unknown, spec: FieldSpec): boolean {
  switch (spec.kind) {
    case "boolean":
      return typeof v === "boolean";
    case "string":
      return typeof v === "string";
    case "pattern": {
      if (typeof v !== "string") return false;
      try {
        new RegExp(v);
        return true;
      } catch {
        return false;
      }
    }
    case "object":
      return isPlainObject(v);
    case "enum":
      return typeof v === "string" && spec.values.includes(v);
    case "stringArray":
      return (
        Array.isArray(v) &&
        v.every(
          (e) => typeof e === "string" && (spec.values === undefined || spec.values.includes(e)),
        )
      );
    case "numberArray":
      return (
        Array.isArray(v) &&
        (spec.length === undefined || v.length === spec.length) &&
        v.every((e) => typeof e === "number" && Number.isFinite(e) && inRange(e, spec))
      );
    case "number":
      return typeof v === "number" && Number.isFinite(v) && inRange(v, spec);
  }
}
