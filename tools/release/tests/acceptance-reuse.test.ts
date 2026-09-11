import { expect, it } from "vitest";
import { validateReusedAcceptance } from "@/exact/acceptance-reuse.ts";
import { resolveReleasePolicy } from "@/policy/release-profile.ts";

function fixture() {
  const policy = resolveReleasePolicy({ schemaVersion: 1, operation: "release.policy.resolve", profile: "exact-validation", channel: "betahyx",
    releaseVersion: "0.1.0-betahyx.41", sourceCommit: "a".repeat(40), sourceRef: "refs/heads/test",
    switches: { endUserDistribution: false, stableAuthorized: false }, target: { endpointUrl: "https://storage.example", bucket: "releases",
      publicBaseUrl: "https://public.example", latestChannelHeadUrl: "https://storage.example/releases/betahyx/latest/channel-head.json" } });
  const expected = { shell: { type: "electron", version: "0.3.0", buildHash: "b".repeat(64) }, target: "darwin-arm64",
    artifact: { sha256: "c".repeat(64) }, shellMetadata: { sha256: "d".repeat(64) },
    platformTrust: { mode: "formal", teamIdentifier: "TEAM" }, updater: { protocol: "v1" }, installIdentity: { channel: "betahyx" } };
  const origin = { ...expected, schemaVersion: 1, operation: "exact.acceptance", status: "accepted", channel: policy.channel,
    releaseVersion: "0.1.0-betahyx.40", sourceCommit: "e".repeat(40), artifact: { sha256: "f".repeat(64) },
    installed: { shell: expected.shell, target: expected.target, proof: { hot: { fromVersion: "0.1.0-betahyx.39" } } } };
  const credential = { ...expected, schemaVersion: 1, operation: "exact.acceptance.reuse", status: "accepted",
    channel: policy.channel, releaseVersion: policy.releaseVersion, sourceCommit: policy.sourceCommit, origin,
    evidence: { url: "https://cache.example/evidence.zip", sha256: "a".repeat(64) } };
  return { policy, expected, credential };
}

it("retains historical version and update provenance without inventing a current installed proof", () => {
  const { policy, expected, credential } = fixture();
  expect(() => validateReusedAcceptance(credential, expected, policy)).not.toThrow();
  expect(credential.origin.releaseVersion).toBe("0.1.0-betahyx.40");
  expect(credential.origin.installed.proof.hot.fromVersion).toBe("0.1.0-betahyx.39");
  expect(credential).not.toHaveProperty("installed");
});

it.each(["stable", "prerelease"])("rejects reused installed evidence for %s", channel => {
  const { policy, expected, credential } = fixture();
  expect(() => validateReusedAcceptance(credential, expected, { ...policy, channel })).toThrow("fresh installed acceptance");
});

it.each(["candidate", "carrier", "trust", "binding", "recursive", "fabricated"])("rejects %s evidence drift", scenario => {
  const { policy, expected, credential } = fixture();
  const value: Record<string, any> = structuredClone(credential);
  if (scenario === "candidate") value.origin.baselineCandidate = true;
  if (scenario === "carrier") value.origin.shell.buildHash = "0".repeat(64);
  if (scenario === "trust") value.origin.platformTrust.mode = "verify-only";
  if (scenario === "binding") value.releaseVersion = "0.1.0-betahyx.42";
  if (scenario === "recursive") value.origin.operation = "exact.acceptance.reuse";
  if (scenario === "fabricated") value.installed = value.origin.installed;
  expect(() => validateReusedAcceptance(value, expected, policy)).toThrow();
});
