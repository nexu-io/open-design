import { Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { NormalizedContract } from "../contract.js";
import { parseUsda } from "../parse/usda.js";

/**
 * Lint the exported USD stage — the artifact that actually ships.
 *
 * Every other rule in this package validates the Blender scene: the objects,
 * their names, their materials, their geometry. That is the thing we *built*.
 * It is not the thing we *hand over*, and the two can disagree badly:
 *
 *   - Blender's exporter writes no `kind`, so an asset that lints perfectly
 *     is not a valid USD model and cannot be referenced as a component.
 *   - The object `prp_crate_slat_back_b` ships a mesh prim named `Cube_008`.
 *     The exact default-name smell `S3D-E-301` exists to kill survives into
 *     the deliverable while the compile reports clean.
 *   - `upAxis` is whatever the exporter felt like (Z), regardless of what the
 *     contract asked for (Y) — and the units rule never fired for bpy scenes
 *     at all, because it read stage metadata from an authored USDA source
 *     that a `build.py` project does not have.
 *
 * So the export gets read back and checked on its own terms. This is the
 * same lesson as the black proof frames: validate the output, not the
 * intent that produced it.
 */
export interface StageLintInput {
  /** Raw text of the exported `.usda`. */
  usda: string;
  contract: NormalizedContract;
  /** Blender object names, so prim names can be checked against them. */
  objectNames?: string[];
  /** Project-relative path, for issue attribution. */
  file?: string;
}

/** Names an exporter invents when the author never named the data block. */
const DEFAULT_PRIM_NAME = /^(Cube|Sphere|Cylinder|Cone|Torus|Plane|Grid|Circle|Icosphere|Suzanne|Mesh|Empty|Object|Text)([._]\d+)?$/;

export function lintExportedStage(input: StageLintInput, issues: Issue[]): void {
  const { usda, contract } = input;
  const file = input.file;
  const at = (extra: Partial<Issue>): Partial<Issue> => (file ? { file, ...extra } : extra);

  /* ---- stage metadata --------------------------------------------- */

  const defaultPrim = /\bdefaultPrim\s*=\s*"([^"]+)"/.exec(usda)?.[1];
  if (!defaultPrim) {
    issues.push({
      code: ISSUE_CODES.STAGE_NO_DEFAULT_PRIM,
      severity: "error",
      message: "exported stage declares no defaultPrim",
      hint: "a consumer referencing this asset has no root to target",
      ...at({}),
    });
  }

  const upAxis = /\bupAxis\s*=\s*"([^"]+)"/.exec(usda)?.[1];
  if (upAxis && upAxis !== contract.upAxis) {
    issues.push({
      code: ISSUE_CODES.STAGE_UPAXIS_MISMATCH,
      severity: "error",
      message: `exported stage is ${upAxis}-up but the contract asks for ${contract.upAxis}-up`,
      hint: `set conventions.units.upAxis to "${upAxis}" or convert on export — the asset will land rotated in a stage that disagrees`,
      detail: { actual: upAxis, expected: contract.upAxis },
      ...at({}),
    });
  }

  const metersPerUnit = /\bmetersPerUnit\s*=\s*([0-9.eE+-]+)/.exec(usda)?.[1];
  if (metersPerUnit !== undefined && Number(metersPerUnit) !== contract.metersPerUnit) {
    issues.push({
      code: ISSUE_CODES.STAGE_UNITS_MISMATCH,
      severity: "error",
      message: `exported stage is ${metersPerUnit} metres per unit, the contract asks for ${contract.metersPerUnit}`,
      detail: { actual: Number(metersPerUnit), expected: contract.metersPerUnit },
      ...at({}),
    });
  }

  /* ---- model hierarchy -------------------------------------------- */

  // `kind` is what makes a stage an addressable *model* rather than loose
  // geometry: without it the asset cannot be referenced as a component and
  // will not appear correctly in an asset browser.
  if (!/\bkind\s*=\s*"(component|assembly|group|subcomponent)"/.test(usda)) {
    issues.push({
      code: ISSUE_CODES.STAGE_NO_KIND,
      severity: "error",
      message: "no prim in the exported stage declares a `kind`",
      hint: 'set the root prim kind to "component" so the asset is a valid USD model',
      ...at({}),
    });
  }

  if (!/\bassetInfo\s*=\s*\{/.test(usda)) {
    issues.push({
      code: ISSUE_CODES.STAGE_NO_ASSET_INFO,
      severity: "warning",
      message: "exported stage carries no assetInfo",
      hint: "record name/identifier/version so a consumer can resolve and version this asset",
      ...at({}),
    });
  }

  /* ---- prim naming ------------------------------------------------ */

  const known = new Set(input.objectNames ?? []);
  const seen = new Set<string>();
  const primPattern = /\bdef\s+(\w+)\s+"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = primPattern.exec(usda)) !== null) {
    const [, typeName, name] = match as unknown as [string, string, string];
    if (seen.has(name)) continue;
    seen.add(name);
    if (DEFAULT_PRIM_NAME.test(name)) {
      issues.push({
        code: ISSUE_CODES.STAGE_PRIM_DEFAULT_NAME,
        severity: "error",
        message: `exported ${typeName} prim '${name}' is an exporter default name`,
        hint: "name the mesh data block, not just the object — the data name is what ships in the USD",
        target: name,
        ...at({}),
      });
      continue;
    }
    // A prim whose name matches no Blender object is usually the data block
    // riding along under a correctly-named Xform; worth surfacing, not fatal.
    if (known.size > 0 && !known.has(name) && typeName === "Mesh") {
      issues.push({
        code: ISSUE_CODES.STAGE_PRIM_NAME_MISMATCH,
        severity: "warning",
        message: `exported Mesh prim '${name}' does not match any object name`,
        hint: "give the mesh data the same name as its object so the part tree reads the same in USD",
        target: name,
        ...at({}),
      });
    }
  }

  /* ---- boundables ------------------------------------------------- */

  const meshCount = (usda.match(/\bdef\s+Mesh\s+"/g) ?? []).length;
  const extentCount = (usda.match(/\bfloat3\[\]\s+extent\s*=/g) ?? []).length;
  if (meshCount > 0 && extentCount < meshCount) {
    issues.push({
      code: ISSUE_CODES.STAGE_MISSING_EXTENT,
      severity: "warning",
      message: `${meshCount - extentCount} of ${meshCount} Mesh prims have no authored extent`,
      hint: "extent lets a consumer cull and frame the asset without loading its points",
      detail: { meshes: meshCount, withExtent: extentCount },
      ...at({}),
    });
  }

  /* ---- model hierarchy + rig purpose ------------------------------- */
  /*
   * Read from the parse tree, not by regex over the text.
   *
   * These two rules judge relationships between prims — which prim is
   * beneath which, and what type its children are — and a regex cannot see
   * structure. The rules above predate the parser exposing prim metadata
   * and still match on raw text; they work, but this is the shape the file
   * should be growing toward.
   */
  lintModelHierarchy(input, issues, at);
}

/**
 * The stage must describe itself the way the exporter's sibling deliverable
 * does. Two disagreements are worth a diagnostic:
 *
 *   The proof-render rig shipping as asset content. `scene.glb` from a
 *   compile carries only the meshes; a `.usda` that also carries the hero
 *   camera and the key light is the same compile answering the same
 *   question two different ways, and the USD consumer is the one who gets
 *   the wrong answer.
 *
 *   A model hierarchy that contradicts the shape. `component` is a leaf
 *   model — the unit you reference as one asset. Declaring it on a root
 *   holding several independent parts says the arrangement is atomic.
 */
function lintModelHierarchy(
  input: StageLintInput,
  issues: Issue[],
  at: (extra: Partial<Issue>) => Partial<Issue>,
): void {
  let tree;
  try {
    tree = parseUsda(input.usda, input.file ?? "<usda>");
  } catch {
    // Unparseable stages are already the other rules' business.
    return;
  }
  const rootName = tree.stage.defaultPrim;
  const root = rootName ? tree.root.children.find((p) => p.name === rootName) : undefined;
  if (!root) return;

  const unquoted = (value: string | undefined): string =>
    (value ?? "").replace(/^"|"$/g, "");

  const isRigType = (typeName: string | null): boolean =>
    typeName === "Camera" || typeName === "Speaker" || (typeName !== null && /Light$/.test(typeName));

  const children = root.children.filter((p) => p.kind === "def");
  const rig = children.filter(
    (p) => isRigType(p.typeName) || p.children.some((c) => isRigType(c.typeName)),
  );
  const unguarded = rig.filter((p) => !unquoted(p.attributes.get("purpose")).includes("guide"));
  if (unguarded.length > 0) {
    issues.push({
      code: ISSUE_CODES.STAGE_RIG_NOT_GUIDE,
      severity: "warning",
      message: `${unguarded.length} staging prim(s) ship as asset content: ${unguarded
        .map((p) => p.name)
        .join(", ")}`,
      hint: 'mark the compiler rig `uniform token purpose = "guide"` so a consumer does not inherit lighting the GLB never had',
      detail: { prims: unguarded.map((p) => p.name) },
      ...at({}),
    });
  }

  const geometry = children.filter(
    (p) => !rig.includes(p) && p.typeName !== "Scope",
  );
  const rootKind = unquoted(root.metadata.get("kind"));
  const expected = geometry.length > 1 ? "assembly" : "component";
  if (rootKind && rootKind !== expected) {
    issues.push({
      code: ISSUE_CODES.STAGE_MODEL_HIERARCHY,
      severity: "warning",
      message: `stage root is kind "${rootKind}" but holds ${geometry.length} geometry root(s), which is an ${expected}`,
      hint:
        expected === "assembly"
          ? "a component is a leaf model; an arrangement of several parts is an assembly of components"
          : "a single-part asset is one referenceable component",
      detail: { actual: rootKind, expected, geometryRoots: geometry.length },
      ...at({}),
    });
  }
}
