import { Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";

/**
 * Provenance posture: what an author can be held responsible for.
 *
 * A third-party asset is a FACT about somebody else's file, not a defect its
 * new owner can fix. Real game meshes are open by construction, ship welded
 * seams as split vertices, and share mirrored UV islands on purpose — the
 * Khronos `BoxTextured.glb`, the canonical hello-world glTF, trips four strict
 * rules at once. Judging imported geometry by the same standard as geometry
 * the author built is not rigour, it is noise.
 *
 * Two things were wrong before this module existed:
 *
 *  1. **The posture stopped at the part boundary.** Only spec parts carrying
 *     `file:` were relaxed. A whole project whose source is a bare `.glb` —
 *     a first-class, documented workflow — got no relaxation at all, so a
 *     freshly downloaded sample asset compiled with `ok: false`. The repo's
 *     own tests hid this by hand-writing a relaxed contract every time.
 *  2. **The relaxation was invisible, and it was suppression.** Rules simply
 *     did not fire, so nothing in the report could explain why a strict
 *     contract had gone quiet on a mesh — the same "silence is not evidence"
 *     failure this compiler exists to catch, committed on purpose.
 *
 * So relaxation here is RECLASSIFICATION, never suppression: the rule runs,
 * the finding is measured, and its severity drops to `info` with the reason
 * attached. The reader still sees "this mesh has 24 non-manifold edges"; they
 * just are not asked to fix somebody else's asset to ship.
 *
 * The author's own conventions always win, but "own" is decided per KEY, not
 * per block. Each relaxation row names the exact contract leaf that governs
 * its rule (`geometry.allowOpenMeshes` for NON_MANIFOLD); only writing THAT
 * leaf cancels the relaxation. A block-granular version of this shipped first
 * and was wrong: `conventions.geometry.allowOpenMeshes: true` is a PERMISSIVE
 * statement — "open meshes are fine" — but because it touched the `geometry`
 * block, it cancelled the relaxation for every other geometry rule too
 * (Z_FIGHTING, the scale rules, winding, double-verts, zero-area), so writing
 * a relaxing edit made the report louder on six rules the author never
 * mentioned. Some rules read no contract field at all (Z_FIGHTING measures a
 * geometric fact with no threshold to author an opinion about); those carry
 * no `key` and relax unconditionally on imported geometry — no sibling edit,
 * however sweeping, can re-strictify a rule the contract has no knob for.
 */

/** How a mesh came to exist. */
export type Provenance = "authored" | "imported";

/**
 * Provenance sets kept SEPARATE by kind. Object names and material names share
 * a namespace in Blender — a scene can legitimately hold an authored object
 * "Cube" and an imported material "Cube" at once — so collapsing both into one
 * set let an object-scoped relaxation match a material name and quietly relax a
 * finding about authored geometry. Each rule consults the set its subject names.
 */
export interface ImportedProvenance {
  /** Object names the author did not build. */
  objects: Set<string>;
  /** Material names the author did not author (imports' own, never overrides). */
  materials: Set<string>;
}

/**
 * The objects and materials in a scene the author did not build.
 *
 * Both ways geometry arrives are the same statement about provenance, so they
 * are decided in one place: a spec part carrying `file:` is an imported asset
 * fitted into a declared box, and a project whose SOURCE is a bare mesh file
 * is imported in its entirety. Splitting this across a set built here and a
 * boolean passed from the pipeline meant one concept arriving as two inputs,
 * and the second could only ever mean "also add everything".
 */
export function importedObjects(input: {
  sourceKind?: string;
  solved?: { parts: ReadonlyArray<{ id: string; file?: string }> };
  census?: {
    objects: ReadonlyArray<{ name: string }>;
    materials?: ReadonlyArray<{ name: string; imported?: boolean }>;
  };
}): ImportedProvenance {
  const objects = new Set<string>();
  const materials = new Set<string>();
  const whole = input.sourceKind === "mesh";
  // A whole-project mesh source: every object came from somebody's exporter.
  if (whole) for (const object of input.census?.objects ?? []) objects.add(object.name);
  for (const part of input.solved?.parts ?? []) {
    if (part.file !== undefined) objects.add(part.id);
  }

  // Material provenance is WHERE A MATERIAL CAME FROM, measured at the importer
  // boundary (the runner records every importer-created material in-process; the
  // census reports it as `CensusMaterial.imported`) — not who uses it, and not
  // guessed from its name. A material relaxes exactly when it arrived through an
  // importer: its shading values are the third party's and the author cannot
  // edit them, even after reusing it on their own mesh. Everything authored
  // stays enforced (declared materials, a `material:` override, a hand-written
  // build.py, an authored .usda). Measuring at creation, by identity rather than
  // name shape, is what makes it exact where name matching failed: an override
  // that ORPHANS the import's material, and a name collision that Blender
  // uniquifies to `.001`, are judged by the material the importer created.
  for (const mat of input.census?.materials ?? []) {
    if (mat.imported) materials.add(mat.name);
  }
  return { objects, materials };
}

/**
 * Everything an issue names as its subject.
 *
 * Most rules name one thing, but a relation rule names a PAIR — z-fighting
 * reports `"A <-> B"`, because the finding is about the two together. A pair
 * relaxes only when BOTH sides are imported: a coincident plane between
 * somebody else's asset and geometry this project authored is this project's
 * problem, and saying so is the point.
 */
function subjectsOf(target: string): string[] {
  return target.includes(" <-> ") ? target.split(" <-> ").map((s) => s.trim()) : [target];
}

/**
 * The rules a third-party asset legitimately trips, each paired with the
 * convention block that governs it. Data, not a cascade of `if`s: adding a
 * rule to the posture is a row, and the row names its own override.
 */
export const IMPORTED_RELAXATIONS: ReadonlyArray<{
  code: string;
  /** Human-readable block, used only for the fallback hint on keyless rows. */
  block: string;
  /**
   * The exact contract leaf (dot-path under `conventions`, e.g.
   * `"geometry.allowOpenMeshes"`) that governs this rule — read from the
   * emission site, never guessed. Authoring THIS leaf, and only this leaf,
   * cancels the relaxation. Left unset when the rule reads no contract field
   * at all (it measures a fact the contract has no knob to opine on); such a
   * row relaxes unconditionally on imported geometry and no sibling edit can
   * re-strictify it.
   */
  key?: string;
  why: string;
  /**
   * Which provenance set governs this rule — chosen by what its `target` NAMES.
   * `"object"` (the default) consults imported OBJECTS; `"material"` consults
   * imported MATERIALS. The two are separate because object and material names
   * share a namespace, so a rule must say which it means or an imported material
   * named like an authored object would relax that object's finding. This is a
   * SET SELECTOR only: material provenance itself (including override exclusion)
   * is decided in importedObjects, never by resolving a material through its
   * wearers — an override rides an imported mesh yet is the author's.
   */
  subject?: "object" | "material";
}> = [
  {
    code: ISSUE_CODES.DUPLICATE_MATERIALS,
    block: "textures",
    key: "textures.flagDuplicateMaterials", // lint/pbr.ts:156 `if (texRules.flagDuplicateMaterials)`
    why: "an exporter's duplicate slots are the file's, not the scene's",
    subject: "material",
  },
  {
    code: ISSUE_CODES.UV_UNCHECKED,
    block: "uv",
    key: "uv.require", // lint/uv.ts:19,29 `needsUv` (and thus reaching the sampled-check) is gated on `rules.require`
    why: "the UV budget stopped short on geometry the author did not lay out",
  },
  {
    code: ISSUE_CODES.NON_MANIFOLD,
    block: "geometry",
    key: "geometry.allowOpenMeshes", // lint/topology.ts:35 `!ctx.contract.geometry.allowOpenMeshes`
    why: "real game meshes are open by construction",
  },
  {
    code: ISSUE_CODES.LOOSE_GEOMETRY,
    block: "geometry",
    key: "geometry.allowLooseGeometry", // lint/topology.ts:73 `!geo.allowLooseGeometry`
    why: "imported scaffolding is the exporter's, not the author's",
  },
  {
    code: ISSUE_CODES.DOUBLE_VERTICES,
    block: "geometry",
    key: "geometry.allowDoubleVertices", // lint/topology.ts:83 `!geo.allowDoubleVertices`
    why: "split vertices are how UV and normal seams are shipped",
  },
  {
    code: ISSUE_CODES.DOUBLE_VERTICES_UNCHECKED,
    block: "geometry",
    key: "geometry.allowDoubleVertices", // lint/topology.ts:95 `!geo.allowDoubleVertices` (same gate, "unchecked" variant)
    why: "split vertices are how UV and normal seams are shipped",
  },
  {
    code: ISSUE_CODES.INCONSISTENT_WINDING,
    block: "geometry",
    key: "geometry.allowInconsistentWinding", // lint/topology.ts:105 `!geo.allowInconsistentWinding`
    why: "winding is the exporter's convention",
  },
  // Calibrated against the Khronos sample corpus: each of these fires on
  // assets the industry treats as correct, and none can be fixed without
  // editing somebody else's file. Reported, never blocking.
  {
    code: ISSUE_CODES.ZERO_AREA_FACES,
    block: "geometry",
    // lint/topology.ts:58 `if (mesh.zeroAreaFaces > 0)` — unconditional, no
    // contract field gates it. No sibling `geometry.*` edit can re-strictify
    // this on imported geometry.
    why: "degenerate triangles are shipped by real exporters",
  },
  {
    code: ISSUE_CODES.Z_FIGHTING,
    block: "geometry",
    // lint/topology.ts:167-179 `for (const pair of census.zFightingPairs)` —
    // unconditional, no contract field gates it. This is the exact rule the
    // block-granular bug used to re-strictify whenever an author wrote
    // `geometry.allowOpenMeshes`; it now stays relaxed regardless.
    why: "coincident faces WITHIN an imported asset are its own",
  },
  {
    code: ISSUE_CODES.UNAPPLIED_SCALE,
    block: "geometry",
    key: "geometry.requireAppliedScale", // lint/units.ts:88 `geo.requireAppliedScale &&`
    why: "the node transform is the source file's",
  },
  {
    code: ISSUE_CODES.NON_UNIFORM_SCALE,
    block: "geometry",
    key: "geometry.requireAppliedScale", // lint/units.ts:65 `if (geo.requireAppliedScale && ...)`
    why: "the node transform is the source file's",
  },
  {
    code: ISSUE_CODES.NEGATIVE_SCALE,
    block: "geometry",
    key: "geometry.allowNegativeScale", // lint/units.ts:78 `!geo.allowNegativeScale`
    // Mirroring a limb by negating its scale is a standard DCC authoring
    // technique, and importers preserve the node transform exactly as the
    // source file wrote it — a downloaded rig with a mirrored arm should not
    // hard-fail a compile whose whole posture is "inspect, don't judge".
    // Detect-and-name, never mutate: the finding still reports, it just no
    // longer blocks.
    why: "mirroring via negative scale is a standard DCC authoring technique that importers preserve",
  },
  {
    code: ISSUE_CODES.UV_MISSING,
    block: "uv",
    key: "uv.require", // lint/uv.ts:29 `needsUv = rules.require === "all" || textured.has(...)`
    why: "an imported mesh owns its own unwrap, or deliberately has none",
  },
  {
    code: ISSUE_CODES.UV_OVERLAP,
    block: "uv",
    key: "uv.maxOverlapFraction", // lint/uv.ts:69 `uv.overlapFraction > rules.maxOverlapFraction`
    why: "mirrored, shared UV islands are a standard texture-budget technique",
  },
  {
    code: ISSUE_CODES.UV_FLIPPED,
    block: "uv",
    key: "uv.allowFlipped", // lint/uv.ts:81 `!rules.allowFlipped && uv.flippedFaces > 0`
    why: "mirrored islands read as flipped by construction",
  },
  {
    code: ISSUE_CODES.UV_OUT_OF_BOUNDS,
    block: "uv",
    key: "uv.maxOutOfBoundsFraction", // lint/uv.ts:92 `uv.outOfBoundsFraction > rules.maxOutOfBoundsFraction`
    why: "tiling and atlas layouts are the asset's own",
  },
  {
    code: ISSUE_CODES.UV_STRETCH,
    block: "uv",
    key: "uv.maxStretch", // lint/uv.ts:103 `rules.maxStretch !== null && ... uv.stretch.max > rules.maxStretch`
    why: "the unwrap is the asset's own",
  },
  {
    code: ISSUE_CODES.TEXEL_DENSITY_SPREAD,
    block: "uv",
    key: "uv.texelDensity.maxRatio", // lint/uv.ts:149 `max.max / min.min > rules.texelDensityMaxRatio`
    why: "the asset's texel budget was somebody else's decision",
  },
  {
    code: ISSUE_CODES.TEXEL_DENSITY_TARGET,
    block: "uv",
    key: "uv.texelDensity.target", // lint/uv.ts:117 `rules.texelDensityTarget !== null && (...)`
    why: "the asset's texel budget was somebody else's decision",
  },
  {
    code: ISSUE_CODES.NAME_DEFAULT,
    block: "naming",
    key: "naming.forbidDefaultNames", // lint/naming.ts:38 `contract.forbidDefaultNames && BLENDER_DEFAULT_NAMES.has(...)`
    why: "the asset's author chose these names",
  },
  {
    code: ISSUE_CODES.NAME_DEFAULT_WARN,
    block: "naming",
    // No current emission site exists for this code (it shares errors.ts's
    // NAME_DEFAULT family but nothing in lint/ pushes it today); mapped by
    // analogy to NAME_DEFAULT since it is the same check at a different
    // severity, not read from a live call site. Revisit if an emitter for it
    // is added.
    key: "naming.forbidDefaultNames",
    why: "the asset's author chose these names",
  },
  {
    code: ISSUE_CODES.NAME_PATTERN,
    block: "naming",
    key: "naming.objectPattern", // lint/naming.ts:48 `!contract.objectPattern.test(name)`
    why: "the asset's author chose these names",
  },
  {
    code: ISSUE_CODES.STAGE_PRIM_DEFAULT_NAME,
    block: "naming",
    key: "naming.forbidDefaultNames", // lint/stage.ts:165 `if (contract.forbidDefaultNames)`
    // The SAME smell as NAME_DEFAULT, one surface later: the census judges the
    // Blender object and this judges the prim the exporter wrote from it.
    // Relaxing one and not the other gave a downloaded asset two different
    // verdicts depending on which surface you looked at — and because it fires
    // during EXPORT, a bare Khronos asset that linted clean still failed the
    // compile. Found by running the corpus through all six stages after
    // calibrating only the first three.
    why: "the asset's author chose these names",
  },
  {
    code: ISSUE_CODES.DEPTH_LIMIT,
    block: "hierarchy",
    key: "hierarchy.maxDepth", // lint/naming.ts:93,139 `depth > contract.maxDepth`
    // A downloaded creature kit's tail is ten bones deep because its rigger
    // built it that way. Restructuring it means editing somebody else's asset,
    // which is exactly the demand this posture exists to stop making.
    why: "the rig's depth is the asset author's structure, not this project's",
  },
  {
    code: ISSUE_CODES.METALLIC_VALUE,
    block: "pbr",
    key: "pbr.metallicValues", // lint/pbr.ts:34-35 `ctx.contract.metallicValues.length > 0 && !ctx.contract.metallicValues.includes(...)`
    // Targets a MATERIAL (`target: mat.name`), like DUPLICATE_MATERIALS.
    subject: "material",
    why: "real kits ship fractional metallic",
  },
];

const BY_CODE = new Map(IMPORTED_RELAXATIONS.map((r) => [r.code, r]));

/**
 * Reclassify findings against imported geometry, in place.
 *
 * @param provenance  The imported objects and materials (kept separate; see
 *   {@link ImportedProvenance}). Each rule reads the set its `subject` names,
 *   so an imported material named like an authored object cannot relax that
 *   object's finding. importedObjects is the single authority on which
 *   materials count as imported — an authored `material:` override rides an
 *   imported mesh yet is withheld from the material set, so it stays enforced.
 * @param authoredKeys  Contract leaf paths (dot-notation under `conventions`,
 *   e.g. `"geometry.allowOpenMeshes"`) the author wrote explicitly (from the
 *   raw contract, NOT target presets — a preset is a default, not intent).
 *   Cancellation is per-key: a row only cancels when ITS OWN governing key is
 *   in this set, so a permissive edit to one leaf cannot re-strictify sibling
 *   rules the author never mentioned. Keyless rows (no governing contract
 *   field) always relax and are never cancelled by anything in this set.
 */
export function applyImportedPosture(
  issues: Issue[],
  provenance: ImportedProvenance,
  authoredKeys: ReadonlySet<string>,
): void {
  if (provenance.objects.size === 0 && provenance.materials.size === 0) return;
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i]!;
    if (issue.severity === "info") continue;
    const rule = BY_CODE.get(issue.code);
    if (!rule) continue;
    if (rule.key !== undefined && authoredKeys.has(rule.key)) continue;
    if (issue.target === undefined) continue;
    // The rule's subject picks WHICH provenance set governs it: a material rule
    // reads imported materials, everything else reads imported objects. Object
    // and material names share a namespace, so consulting the wrong set would
    // let an imported material named like an authored object relax that object.
    const scope = rule.subject === "material" ? provenance.materials : provenance.objects;
    // A finding's SUBJECTS are everything it holds responsible: a relation names
    // a pair ("A <-> B"), a duplicate-set names its whole group (detail.materials
    // — the census's authoritative membership, not the name-sorted representative
    // the target happens to be), and everything else names one thing. A finding
    // relaxes only when EVERY subject is imported — a duplicate set is the
    // import's fault only if every member is the import's, exactly as a z-fight
    // pair relaxes only when both sides are. Reading the target alone let the
    // group's verdict hinge on which member sorted first.
    const group = issue.detail?.materials;
    const named =
      Array.isArray(group) && group.every((n): n is string => typeof n === "string") && group.length > 0
        ? group
        : subjectsOf(issue.target);
    if (named.length === 0) continue;
    if (!named.every((name) => scope.has(name))) continue;
    const subject = named.length > 1 ? named.join(" and ") : named[0]!;
    const setHint = rule.key !== undefined ? `conventions.${rule.key}` : `conventions.${rule.block}`;
    issues[i] = {
      ...issue,
      severity: "info",
      hint: `${rule.why} — noted, not enforced, because '${subject}' is imported geometry; set ${setHint} to judge it strictly`,
      detail: { ...(issue.detail ?? {}), provenance: "imported", relaxedFrom: issue.severity },
    };
  }
}
