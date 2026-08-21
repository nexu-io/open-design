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
import { lintSheets, type SheetLintInput } from "./sheet.js";
import { lintClaims } from "./claims.js";
import type { ClaimsSpec } from "../solve/types.js";

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
}

/**
 * Run every deterministic rule over the census + USDA parse tree.
 * Order is fixed; dedupe is by code+target+message so overlapping sources
 * (a Blender object and the same-named USD prim) cannot double-report.
 */
export function runLint(input: LintInput): Issue[] {
  const issues: Issue[] = [];
  const ctx = input;
  lintNaming(ctx, issues);
  lintTopology(ctx, issues);
  if (input.census) lintEmptyMeshes(input.census, issues);
  lintPbr(ctx, issues);
  lintUv(ctx, issues);
  lintUnits(ctx, issues);
  lintIntegrity(ctx, issues);
  lintWorld(input.contract, input.census, issues);
  if (input.sheets) lintSheets(input.sheets, issues);
  if (input.claims) {
    lintClaims(input.claims, input.census, issues, {
      groundTolerance: input.contract.grounding.tolerance,
      groundExempt: input.contract.grounding.exempt,
    });
  }
  lintProof(input.proofFrames, issues);
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