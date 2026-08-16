import { describe, expect, it } from "vitest";

import {
  RELEASE_CANDIDATE_SCHEMA_VERSION,
  releaseCandidateId,
  releaseCandidatePrefix,
  validateReleaseCandidateSpec,
} from "../src/candidate/identity.ts";

const base = {
  amrProfile: "test",
  channel: "beta",
  closureMinShellVersion: "0.19.0-beta.1",
  commit: "a".repeat(40),
  macArm64SignMode: "notarized",
  macX64SignMode: "notarized",
  releaseVersion: "0.19.0-beta.2",
  schemaVersion: RELEASE_CANDIDATE_SCHEMA_VERSION,
  targets: ["mac_arm64", "mac_x64", "win_x64"],
  winX64SignMode: "unsigned",
};

describe("release candidate identity", () => {
  it("binds every release-material input and canonicalizes target order", () => {
    const first = releaseCandidateId(base);
    expect(releaseCandidateId({ ...base, targets: [...base.targets].reverse() })).toBe(first);
    for (const changed of [
      { channel: "qa" , releaseVersion: "0.19.0-qa.2", closureMinShellVersion: "0.19.0-qa.1" },
      { commit: "b".repeat(40) },
      { amrProfile: "prod" },
      { macArm64SignMode: "signed" },
    ]) expect(releaseCandidateId({ ...base, ...changed })).not.toBe(first);
  });

  it("keeps stable explicit rather than representing it as an omitted default", () => {
    const stable = validateReleaseCandidateSpec({
      ...base,
      amrProfile: "prod",
      channel: "stable",
      closureMinShellVersion: "0.19.0",
      releaseVersion: "0.19.0",
    });
    expect(stable.channel).toBe("stable");
    expect(releaseCandidateId(stable)).not.toBe(releaseCandidateId(base));
  });

  it("mints only channel/version/id-scoped candidate prefixes", () => {
    const candidateId = releaseCandidateId(base);
    expect(releaseCandidatePrefix({ candidateId, channel: "beta", releaseVersion: "0.19.0-beta.2" }))
      .toBe(`candidates/beta/0.19.0-beta.2/${candidateId.slice(7)}`);
    expect(() => releaseCandidatePrefix({ candidateId: "latest", channel: "beta", releaseVersion: "0.19.0-beta.2" }))
      .toThrow(/sha256/u);
  });
});
