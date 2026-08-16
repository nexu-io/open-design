import { appendFileSync } from "node:fs";

import { bool, optional, required, requiredTarget, writeJson } from "../storage/common.ts";
import {
  createReleaseReusePlan,
  releaseReusePlanMarkdown,
  releaseReusePlanNotice,
} from "./reuse-plan.ts";

function githubCommandValue(value: string): string {
  return value.replace(/%/gu, "%25").replace(/\r/gu, "%0D").replace(/\n/gu, "%0A");
}

const plan = createReleaseReusePlan({
  closureBuild: optional("RELEASE_CLOSURE_BUILD_STATE"),
  outerCacheExactHit: bool("RELEASE_OUTER_CACHE_EXACT_HIT"),
  outerCacheMatchedKey: optional("RELEASE_OUTER_CACHE_MATCHED_KEY"),
  selectedLanes: optional("RELEASE_SMOKE_SELECTED_LANES"),
  shellBuild: optional("RELEASE_SHELL_BUILD_STATE"),
  smokeProof: optional("RELEASE_SMOKE_PROOF_STATE"),
  target: requiredTarget(),
});

writeJson(required("RELEASE_REUSE_PLAN_JSON_PATH"), plan);
const summaryPath = optional("GITHUB_STEP_SUMMARY");
if (summaryPath.length > 0) appendFileSync(summaryPath, releaseReusePlanMarkdown(plan), "utf8");
console.log(`::notice title=${githubCommandValue(`${plan.target} reuse plan`)}::${githubCommandValue(releaseReusePlanNotice(plan))}`);
