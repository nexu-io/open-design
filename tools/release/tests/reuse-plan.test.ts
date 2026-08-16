import { describe, expect, it } from "vitest";

import {
  createReleaseReusePlan,
  releaseReusePlanMarkdown,
  releaseReusePlanNotice,
} from "../src/report/reuse-plan.js";

describe("release reuse plan", () => {
  it("distinguishes a prefix restore from an exact cache hit", () => {
    const plan = createReleaseReusePlan({
      closureBuild: "hit",
      outerCacheExactHit: false,
      outerCacheMatchedKey: "tools-pack-win-v3-beta-Windows-X64-31951320699-1",
      selectedLanes: "standalone",
      shellBuild: "hit",
      smokeProof: "hit",
      target: "win_x64",
    });

    expect(plan.outerCache).toEqual({
      matchedKey: "tools-pack-win-v3-beta-Windows-X64-31951320699-1",
      state: "prefix-hit",
    });
    expect(releaseReusePlanNotice(plan)).toContain("outer_cache=prefix-hit");
    expect(releaseReusePlanMarkdown(plan)).toContain("lanes: `standalone`");
  });

  it("keeps an unrequested smoke proof distinct from a proof miss", () => {
    const plan = createReleaseReusePlan({
      closureBuild: "miss",
      outerCacheExactHit: false,
      outerCacheMatchedKey: "",
      selectedLanes: "profile-default",
      shellBuild: "miss",
      smokeProof: "",
      target: "mac_arm64",
    });

    expect(plan.outerCache.state).toBe("miss");
    expect(plan.smokeProof).toBe("not-requested");
    expect(plan.selectedLanes).toEqual(["profile-default"]);
  });
});
