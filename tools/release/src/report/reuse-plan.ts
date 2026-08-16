export type ReleaseOuterCacheState = "exact-hit" | "miss" | "prefix-hit";
export type ReleaseReuseState = "hit" | "miss" | "not-requested" | "unknown";

export type ReleaseReusePlan = {
  closureBuild: ReleaseReuseState;
  outerCache: {
    matchedKey: string;
    state: ReleaseOuterCacheState;
  };
  selectedLanes: string[];
  shellBuild: ReleaseReuseState;
  smokeProof: ReleaseReuseState;
  target: string;
};

function reuseState(value: string, empty: ReleaseReuseState = "unknown"): ReleaseReuseState {
  if (value === "hit" || value === "miss") return value;
  return value.length === 0 ? empty : "unknown";
}

function selectedLanes(value: string): string[] {
  return value.split(",").map((lane) => lane.trim()).filter(Boolean);
}

export function createReleaseReusePlan(input: {
  closureBuild: string;
  outerCacheExactHit: boolean;
  outerCacheMatchedKey: string;
  selectedLanes: string;
  shellBuild: string;
  smokeProof: string;
  target: string;
}): ReleaseReusePlan {
  const matchedKey = input.outerCacheMatchedKey.trim();
  return {
    closureBuild: reuseState(input.closureBuild),
    outerCache: {
      matchedKey,
      state: input.outerCacheExactHit ? "exact-hit" : matchedKey.length > 0 ? "prefix-hit" : "miss",
    },
    selectedLanes: selectedLanes(input.selectedLanes),
    shellBuild: reuseState(input.shellBuild),
    smokeProof: reuseState(input.smokeProof, "not-requested"),
    target: input.target,
  };
}

export function releaseReusePlanMarkdown(plan: ReleaseReusePlan): string {
  const lanes = plan.selectedLanes.length > 0 ? plan.selectedLanes.join(", ") : "none";
  const matchedKey = plan.outerCache.matchedKey.length > 0 ? `\`${plan.outerCache.matchedKey}\`` : "—";
  return [
    `### ${plan.target} reuse plan`,
    "",
    "| Layer | State | Detail |",
    "| --- | --- | --- |",
    `| Outer tools-pack cache | \`${plan.outerCache.state}\` | ${matchedKey} |`,
    `| Electron Shell build | \`${plan.shellBuild}\` | — |`,
    `| Shell smoke proof | \`${plan.smokeProof}\` | lanes: \`${lanes}\` |`,
    `| Closure target build | \`${plan.closureBuild}\` | — |`,
    "",
  ].join("\n");
}

export function releaseReusePlanNotice(plan: ReleaseReusePlan): string {
  const lanes = plan.selectedLanes.length > 0 ? plan.selectedLanes.join(",") : "none";
  const matchedKey = plan.outerCache.matchedKey.length > 0 ? plan.outerCache.matchedKey : "none";
  return [
    `outer_cache=${plan.outerCache.state}`,
    `matched_key=${matchedKey}`,
    `shell_build=${plan.shellBuild}`,
    `smoke_proof=${plan.smokeProof}`,
    `closure_build=${plan.closureBuild}`,
    `lanes=${lanes}`,
  ].join(" ");
}
