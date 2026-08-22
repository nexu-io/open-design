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
 * The author's own conventions always win. Writing any key in a convention
 * block is a statement that you meant that block's rules, so it cancels the
 * relaxations that block governs — and only those, since demanding printable
 * wall thickness says nothing about how you feel about a downloaded mesh's UVs.
 */

/** How a mesh came to exist. */
export type Provenance = "authored" | "imported";

/**
 * The objects in a scene the author did not build.
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
  census?: { objects: ReadonlyArray<{ name: string }> };
}): Set<string> {
  const imported = new Set<string>();
  // A whole-project mesh source: every object came from somebody's exporter.
  if (input.sourceKind === "mesh") {
    for (const object of input.census?.objects ?? []) imported.add(object.name);
  }
  for (const part of input.solved?.parts ?? []) {
    if (part.file !== undefined) imported.add(part.id);
  }
  return imported;
}

/**
 * The rules a third-party asset legitimately trips, each paired with the
 * convention block that governs it. Data, not a cascade of `if`s: adding a
 * rule to the posture is a row, and the row names its own override.
 */
export const IMPORTED_RELAXATIONS: ReadonlyArray<{
  code: string;
  block: string;
  why: string;
}> = [
  { code: ISSUE_CODES.NON_MANIFOLD, block: "geometry", why: "real game meshes are open by construction" },
  { code: ISSUE_CODES.LOOSE_GEOMETRY, block: "geometry", why: "imported scaffolding is the exporter's, not the author's" },
  { code: ISSUE_CODES.DOUBLE_VERTICES, block: "geometry", why: "split vertices are how UV and normal seams are shipped" },
  { code: ISSUE_CODES.DOUBLE_VERTICES_UNCHECKED, block: "geometry", why: "split vertices are how UV and normal seams are shipped" },
  { code: ISSUE_CODES.INCONSISTENT_WINDING, block: "geometry", why: "winding is the exporter's convention" },
  { code: ISSUE_CODES.UV_MISSING, block: "uv", why: "an imported mesh owns its own unwrap, or deliberately has none" },
  { code: ISSUE_CODES.UV_OVERLAP, block: "uv", why: "mirrored, shared UV islands are a standard texture-budget technique" },
  { code: ISSUE_CODES.UV_FLIPPED, block: "uv", why: "mirrored islands read as flipped by construction" },
  { code: ISSUE_CODES.UV_OUT_OF_BOUNDS, block: "uv", why: "tiling and atlas layouts are the asset's own" },
  { code: ISSUE_CODES.UV_STRETCH, block: "uv", why: "the unwrap is the asset's own" },
  { code: ISSUE_CODES.TEXEL_DENSITY_SPREAD, block: "uv", why: "the asset's texel budget was somebody else's decision" },
  { code: ISSUE_CODES.TEXEL_DENSITY_TARGET, block: "uv", why: "the asset's texel budget was somebody else's decision" },
  { code: ISSUE_CODES.NAME_DEFAULT, block: "naming", why: "the asset's author chose these names" },
  { code: ISSUE_CODES.NAME_DEFAULT_WARN, block: "naming", why: "the asset's author chose these names" },
  { code: ISSUE_CODES.NAME_PATTERN, block: "naming", why: "the asset's author chose these names" },
  {
    code: ISSUE_CODES.DEPTH_LIMIT,
    block: "hierarchy",
    // A downloaded creature kit's tail is ten bones deep because its rigger
    // built it that way. Restructuring it means editing somebody else's asset,
    // which is exactly the demand this posture exists to stop making.
    why: "the rig's depth is the asset author's structure, not this project's",
  },
  { code: ISSUE_CODES.METALLIC_VALUE, block: "pbr", why: "real kits ship fractional metallic" },
];

const BY_CODE = new Map(IMPORTED_RELAXATIONS.map((r) => [r.code, r]));

/**
 * Reclassify findings against imported geometry, in place.
 *
 * @param imported  Object names whose geometry the author did not build.
 * @param authoredBlocks  Convention blocks the author wrote explicitly (from
 *   the raw contract, NOT target presets — a preset is a default, not intent).
 */
export function applyImportedPosture(
  issues: Issue[],
  imported: ReadonlySet<string>,
  authoredBlocks: ReadonlySet<string>,
): void {
  if (imported.size === 0) return;
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i]!;
    if (issue.severity === "info") continue;
    const rule = BY_CODE.get(issue.code);
    if (!rule || authoredBlocks.has(rule.block)) continue;
    const subject = issue.target;
    if (subject === undefined || !imported.has(subject)) continue;
    issues[i] = {
      ...issue,
      severity: "info",
      hint: `${rule.why} — noted, not enforced, because '${subject}' is imported geometry; set conventions.${rule.block} to judge it strictly`,
      detail: { ...(issue.detail ?? {}), provenance: "imported", relaxedFrom: issue.severity },
    };
  }
}
