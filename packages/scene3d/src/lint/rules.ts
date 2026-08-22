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
import { applyImportedPosture } from "./provenance.js";
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
   * Every object in the scene is imported third-party geometry — the whole
   * source is a bare `.glb`/`.gltf`/`.obj`/`.fbx`. Spec parts carrying `file:`
   * are derived from `solved`; this covers the case where there is no spec to
   * derive from, which is why a freshly downloaded sample asset used to
   * compile with `ok: false`. See lint/provenance.ts.
   */
  allImported?: boolean;
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
export function runLint(input: LintInput): Issue[] {
  const issues: Issue[] = [];
  // Geometry the author did not build: a `file:`-backed spec part, or — when
  // the whole source IS an imported asset — every mesh in the scene. The rules
  // still RUN over it; `applyImportedPosture` below reclassifies what they find
  // rather than suppressing it, so the report can always explain itself.
  const imported = new Set(
    (input.solved?.parts ?? []).filter((p) => p.file !== undefined).map((p) => p.id),
  );
  if (input.allImported) for (const o of input.census?.objects ?? []) imported.add(o.name);
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
  if (input.sheets) lintSheets(input.sheets, issues);
  if (input.claims) {
    lintClaims(input.claims, input.census, issues, {
      groundTolerance: input.contract.grounding.tolerance,
      groundExempt: input.contract.grounding.exempt,
      suspended: (input.solved?.parts ?? []).filter((p) => p.suspended).map((p) => p.id),
    });
  }
  lintProof(input.proofFrames, issues, input.contract.proofThresholds);
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
  applyImportedPosture(issues, imported, input.authoredBlocks ?? new Set());

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