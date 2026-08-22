import { Issue, ProofFrameStats, UsdaPrimTree, Census } from "../types.js";
import { NormalizedContract } from "../contract.js";
import { lintNaming } from "./naming.js";
import { lintTopology, lintEmptyMeshes } from "./topology.js";
import { lintPbr } from "./pbr.js";
import { lintUv } from "./uv.js";
import { lintUnits } from "./units.js";
import { lintIntegrity } from "./integrity.js";
import { lintProof } from "./proof.js";
import { lintExportedStage } from "./stage.js";
import { lintWorld } from "./world.js";
import { lintVoxel } from "./voxel.js";
import { lintSheets, type SheetLintInput } from "./sheet.js";
import { lintClaims } from "./claims.js";
import { lintIntent } from "./judge.js";
import { applyImportedPosture, importedObjects } from "./provenance.js";
import type { ClaimsSpec, SolvedScene } from "../solve/types.js";

export interface LintInput {
  contract: NormalizedContract;
  census?: Census;
  primTree?: UsdaPrimTree;
  /** Coverage stats from the proof stage, when it ran. */
  proofFrames?: ProofFrameStats[];
  /** Raw text of the exported USD stage, when the export stage ran. */
  exportedUsda?: { text: string; file: string };
  /** Decoded and measured 2D sheets declared by the contract. */
  sheets?: Omit<SheetLintInput, "specs"> & { specs: SheetLintInput["specs"] };
  /** The scene spec's claims block, adjudicated against the census. */
  claims?: ClaimsSpec;
  /** The solved scene, when authored from scene.json — carries each part's
   *  `role`, the intent the budget judge resolves to a standard. */
  solved?: SolvedScene;
  /**
   * How the scene's sources were discovered. Provenance is read from it —
   * a bare mesh file is imported in its entirety — alongside the `file:` parts
   * in `solved`; both rules live in lint/provenance.ts. It is a FACT about the
   * input, not a switch: a new source kind states its provenance here rather
   * than growing another boolean.
   */
  sourceKind?: string;
  /**
   * Convention blocks the author wrote EXPLICITLY in scene3d.json (`geometry`,
   * `uv`, …) — not blocks a target preset filled in. Writing in a block is a
   * statement that you meant its rules, and cancels the imported-provenance
   * relaxation for that block alone.
   */
  authoredBlocks?: ReadonlySet<string>;
}

/**
 * Run every deterministic rule over the census + USDA parse tree.
 * Order is fixed; dedupe is by code+target+message so overlapping sources
 * (a Blender object and the same-named USD prim) cannot double-report.
 */
/**
 * Largest world dimension of the scene, metres, or undefined when nothing
 * measurable is present. Reads the same per-object world bounds every other
 * world-space rule reads rather than re-deriving extents.
 */
function sceneSizeMetres(census: Census | undefined): number | undefined {
  if (!census) return undefined;
  let lo: number[] | null = null;
  let hi: number[] | null = null;
  for (const obj of census.objects) {
    if (obj.type !== "MESH" || !obj.worldMin || !obj.worldMax) continue;
    if (!lo || !hi) {
      lo = [...obj.worldMin];
      hi = [...obj.worldMax];
      continue;
    }
    for (let axis = 0; axis < 3; axis++) {
      const mn = obj.worldMin[axis];
      const mx = obj.worldMax[axis];
      if (typeof mn === "number" && mn < lo[axis]!) lo[axis] = mn;
      if (typeof mx === "number" && mx > hi[axis]!) hi[axis] = mx;
    }
  }
  if (!lo || !hi) return undefined;
  const size = Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!);
  return Number.isFinite(size) && size > 0 ? size : undefined;
}

export function runLint(input: LintInput): Issue[] {
  const issues: Issue[] = [];
  // Geometry the author did not build: a `file:`-backed spec part, or — when
  // the whole source IS an imported asset — every mesh in the scene. The rules
  // still RUN over it; `applyImportedPosture` below reclassifies what they find
  // rather than suppressing it, so the report can always explain itself.
  const imported = importedObjects(input);
  const ctx = { ...input, imported };
  lintNaming(ctx, issues);
  lintTopology(ctx, issues);
  if (input.census) lintEmptyMeshes(input.census, issues);
  lintPbr(ctx, issues);
  lintUv(ctx, issues);
  lintUnits(ctx, issues);
  lintIntegrity(ctx, issues);
  lintWorld(input.contract, input.census, issues);
  lintVoxel(input.contract, input.census, issues, input.solved);
  // Thresholds come from the contract, not from whatever the caller happened
  // to build, so the sheet family is tunable like every other one.
  if (input.sheets) lintSheets({ ...input.sheets, ...input.contract.sheetRules }, issues);
  if (input.claims) {
    lintClaims(input.claims, input.census, issues, {
      groundTolerance: input.contract.grounding.tolerance,
      groundExempt: input.contract.grounding.exempt,
    });
  }
  // Scene size comes from the census the rest of the linter already uses:
  // the empty-frame error needs it to tell 'aimed wrong' from 'too small
  // to render'.
  lintProof(input.proofFrames, issues, input.contract.proofThresholds, sceneSizeMetres(input.census));
  lintIntent(input.census, input.contract, input.solved, issues);
  if (input.exportedUsda) {
    lintExportedStage(
      {
        usda: input.exportedUsda.text,
        contract: input.contract,
        file: input.exportedUsda.file,
        ...(input.census ? { objectNames: input.census.objects.map((o) => o.name) } : {}),
      },
      issues,
    );
  }

  // Last, over the finished set: a finding about somebody else's asset is a
  // note, not a defect its new owner must fix — but it is still SAID. Runs
  // after every rule so no module has to know about provenance.
  // Which objects wear each material, so a material-scoped relaxation can
  // ask whether everything using it is imported. Built from the census the
  // rules already read, not from a second source of truth.
  const materialUsers = new Map<string, Set<string>>();
  for (const mesh of input.census?.meshes ?? []) {
    for (const material of mesh.materials ?? []) {
      const users = materialUsers.get(material) ?? new Set<string>();
      users.add(mesh.object);
      materialUsers.set(material, users);
    }
  }
  applyImportedPosture(issues, imported, input.authoredBlocks ?? new Set(), materialUsers);

  const seen = new Set<string>();
  const deduped: Issue[] = [];
  for (const issue of issues) {
    const key = `${issue.code}|${issue.target ?? ""}|${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(issue);
  }
  return deduped;
}