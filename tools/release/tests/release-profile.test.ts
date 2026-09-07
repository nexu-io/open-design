import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { executeExactReleaseControl, validateReleaseArtifactTrust } from "../src/exact/control-release.js";
import { readReleasePolicyReceipt, releaseTargetsEqual, resolveReleasePolicy, writeReleasePolicy } from "../src/policy/release-profile.js";

const roots: string[] = [];
const sourceCommit = "a".repeat(40);
const target = Object.freeze({
  endpointUrl: "https://storage.invalid",
  bucket: "release",
  latestChannelHeadUrl: "https://storage.invalid/release/betahyx/latest/channel-head.json",
  publicBaseUrl: "https://releases.invalid",
});

afterEach(async () => await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true }))));

function request(profile: "exact-validation" | "prerelease-distribution" | "stable-distribution") {
  const stable = profile === "stable-distribution";
  const channel = profile === "exact-validation" ? "betahyx" : stable ? "stable" : "prerelease";
  return {
    schemaVersion: 1 as const,
    operation: "release.policy.resolve" as const,
    profile,
    channel,
    releaseVersion: stable ? "1.2.3" : `1.2.3-${channel}.4`,
    sourceCommit,
    sourceRef: profile === "exact-validation" ? "refs/heads/main" : "refs/heads/release/v1.2.3",
    switches: { endUserDistribution: stable, stableAuthorized: stable },
    target: {
      ...target,
      latestChannelHeadUrl: `https://storage.invalid/release/${channel}/latest/channel-head.json`,
    },
  };
}

describe("tools-release profile policy", () => {
  it.each(["refs/heads/main", "refs/heads/feat/electron-shell-exact-delivery", "refs/heads/fix/startup"])("allows betahyx validation from the actual branch %s", (sourceRef) => {
    expect(resolveReleasePolicy({ ...request("exact-validation"), sourceRef }).sourceRef).toBe(sourceRef);
  });

  it.each(["refs/tags/v1.2.3", "main", "refs/heads/", "refs/heads/bad..name", "refs/heads/topic.lock", "refs/heads/topic\nother"])("rejects a non-branch or malformed source ref %j", (sourceRef) => {
    expect(() => resolveReleasePolicy({ ...request("exact-validation"), sourceRef })).toThrow("valid refs/heads branch");
  });

  it.each(["ab", "abcdefghijk", "beta1", "Beta", "bet-axy", "bet_axy", "beta\n"])("rejects custom channel syntax %j before rollout selection", (channel) => {
    expect(() => resolveReleasePolicy({ ...request("exact-validation"), channel })).toThrow("3–10 lowercase letters");
  });

  it.each(["abc", "abcdefghij", "preview"])("keeps valid custom channel %s closed until rollout", (channel) => {
    expect(() => resolveReleasePolicy({ ...request("exact-validation"), channel })).toThrow("does not permit channel");
  });

  it.each(["stable-distribution", "prerelease-distribution"] as const)("restricts %s to the version-matched release branch", (profile) => {
    for (const sourceRef of ["refs/heads/main", "refs/heads/feat/electron", "refs/heads/release/v1.2.4"]) {
      expect(() => resolveReleasePolicy({ ...request(profile), sourceRef })).toThrow("matching release/vX.Y.Z ref");
    }
  });

  it("keeps every workflow profile on one capability boundary", () => {
    const receipts = [request("exact-validation"), request("prerelease-distribution"), request("stable-distribution")]
      .map(resolveReleasePolicy);
    expect(new Set(receipts.map(({ capabilities }) => JSON.stringify(capabilities)))).toHaveLength(1);
    expect(receipts.map(({ profile, channel }) => ({ profile, channel }))).toEqual([
      { profile: "exact-validation", channel: "betahyx" },
      { profile: "prerelease-distribution", channel: "prerelease" },
      { profile: "stable-distribution", channel: "stable" },
    ]);
  });

  it("fails closed on rollout, version, and stable switch mismatches", () => {
    expect(() => resolveReleasePolicy({ ...request("exact-validation"), channel: "preview", releaseVersion: "1.2.3-preview.1" }))
      .toThrow("does not permit channel preview");
    expect(() => resolveReleasePolicy({ ...request("prerelease-distribution"), releaseVersion: "1.2.3-betahyx.1" }))
      .toThrow("prerelease release version");
    expect(() => resolveReleasePolicy({ ...request("stable-distribution"), switches: { endUserDistribution: true, stableAuthorized: false } }))
      .toThrow("switches do not match");
    expect(() => resolveReleasePolicy({ ...request("stable-distribution"), sourceRef: "refs/heads/main" }))
      .toThrow("matching release/vX.Y.Z ref");
  });

  it("allows verify-only mac trust only in the isolated exact-validation profile", () => {
    const acceptance = {
      shell: { type: "electron" },
      target: "darwin-arm64",
      platformTrust: { platform: "macos", mode: "verify-only", designatedRequirement: 'identifier "io.open-design.betahyx"', teamIdentifier: "adhoc" },
    };
    expect(() => validateReleaseArtifactTrust(resolveReleasePolicy(request("exact-validation")), [acceptance])).not.toThrow();
    expect(() => validateReleaseArtifactTrust(resolveReleasePolicy(request("prerelease-distribution")), [acceptance]))
      .toThrow("requires formal Electron macOS trust");
    expect(() => validateReleaseArtifactTrust(resolveReleasePolicy(request("stable-distribution")), [{
      ...acceptance,
      platformTrust: { ...acceptance.platformTrust, mode: "formal", teamIdentifier: "ABC1234XYZ" },
    }])).not.toThrow();
  });

  it("writes a canonical receipt and revalidates its exact binding at the side-effect boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "tools-release-policy-"));
    roots.push(root);
    const input = join(root, "request.json"), output = join(root, "receipt.json");
    await mkdir(root, { recursive: true });
    await writeFile(input, JSON.stringify(request("exact-validation")));
    await writeReleasePolicy(input, output);
    expect(JSON.parse(await readFile(output, "utf8"))).toMatchObject({ operation: "release.policy", profile: "exact-validation", channel: "betahyx" });
    await expect(readReleasePolicyReceipt(output, {
      capability: "publish",
      channel: "betahyx",
      releaseVersion: "1.2.3-betahyx.4",
      sourceCommit,
      target,
    })).resolves.toMatchObject({ profile: "exact-validation" });
    await expect(readReleasePolicyReceipt(output, {
      capability: "activate",
      channel: "betahyx",
      releaseVersion: "1.2.3-betahyx.5",
      sourceCommit,
    })).rejects.toThrow("releaseVersion binding mismatch");
  });

  it("makes every declared workflow capability an executable tools-release gate", async () => {
    const root = await mkdtemp(join(tmpdir(), "tools-release-capability-"));
    roots.push(root);
    const input = join(root, "request.json"), policyReceipt = join(root, "policy.json");
    await writeFile(input, JSON.stringify(request("exact-validation")));
    await writeReleasePolicy(input, policyReceipt);

    for (const capability of ["plan", "prepare", "finalize", "publish", "acceptance", "activate", "promote", "reuse"] as const) {
      const receipt = join(root, `${capability}.json`);
      await executeExactReleaseControl({
        schemaVersion: 1,
        operation: "release.authorize",
        policyReceipt,
        capability,
        channel: "betahyx",
        releaseVersion: "1.2.3-betahyx.4",
        sourceCommit,
      }, receipt);
      expect(JSON.parse(await readFile(receipt, "utf8"))).toMatchObject({ operation: "release.authorized", capability });
    }

    const tampered = JSON.parse(await readFile(policyReceipt, "utf8"));
    tampered.capabilities = tampered.capabilities.filter((capability: string) => capability !== "prepare");
    await writeFile(policyReceipt, JSON.stringify(tampered));
    await expect(executeExactReleaseControl({
      schemaVersion: 1,
      operation: "release.authorize",
      policyReceipt,
      capability: "prepare",
      channel: "betahyx",
      releaseVersion: "1.2.3-betahyx.4",
      sourceCommit,
    }, join(root, "denied.json"))).rejects.toThrow("capability boundary differs");
  });

  it("binds a canonical endpoint, bucket, and latest URL into the policy receipt", () => {
    expect(resolveReleasePolicy(request("exact-validation")).target).toEqual(target);
    expect(releaseTargetsEqual({ bucket: target.bucket, latestChannelHeadUrl: target.latestChannelHeadUrl, endpointUrl: target.endpointUrl, publicBaseUrl: target.publicBaseUrl }, target)).toBe(true);
    expect(releaseTargetsEqual({ ...target, extra: true }, target)).toBe(false);
    expect(() => resolveReleasePolicy({
      ...request("exact-validation"),
      target: { ...target, latestChannelHeadUrl: "https://attacker.invalid/release/betahyx/latest/channel-head.json" },
    })).toThrow("latest channel head URL differs");
    expect(() => resolveReleasePolicy({
      ...request("exact-validation"),
      target: { ...target, endpointUrl: "https://storage.invalid/" },
    })).toThrow("endpoint URL is not canonical");
  });

  it("rejects publication before storage access when the tools-release policy receipt is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "tools-release-policy-gate-"));
    roots.push(root);
    const pack = join(root, "pack.json");
    await writeFile(pack, JSON.stringify({
      schemaVersion: 2,
      operation: "exact.pack",
      channel: "betahyx",
      releaseVersion: "1.2.3-betahyx.4",
      sourceCommit,
    }));
    await expect(executeExactReleaseControl({
      schemaVersion: 1,
      operation: "exact.publish",
      packReceipt: pack,
      endpointUrl: "https://storage.invalid",
      bucket: "release",
    }, join(root, "receipt.json"))).rejects.toThrow("release policy receipt is required");
  });

  it.each([
    ["endpoint", { endpointUrl: "https://attacker.invalid", bucket: "release", publicBaseUrl: target.publicBaseUrl }],
    ["bucket", { endpointUrl: "https://storage.invalid", bucket: "attacker", publicBaseUrl: target.publicBaseUrl }],
  ])("rejects a tampered publish %s before any fetch", async (_label, storageTarget) => {
    const root = await mkdtemp(join(tmpdir(), "tools-release-policy-target-"));
    roots.push(root);
    const pack = join(root, "pack.json"), policyRequest = join(root, "policy-request.json"), policyReceipt = join(root, "policy.json");
    await writeFile(pack, JSON.stringify({
      schemaVersion: 2,
      operation: "exact.pack",
      channel: "betahyx",
      releaseVersion: "1.2.3-betahyx.4",
      sourceCommit,
    }));
    await writeFile(policyRequest, JSON.stringify(request("exact-validation")));
    await writeReleasePolicy(policyRequest, policyReceipt);
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(executeExactReleaseControl({
      schemaVersion: 1,
      operation: "exact.publish",
      packReceipt: pack,
      policyReceipt,
      ...storageTarget,
    }, join(root, "receipt.json"))).rejects.toThrow("release policy target binding mismatch");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it("rejects a tampered published latest URL before any fetch", async () => {
    const root = await mkdtemp(join(tmpdir(), "tools-release-policy-latest-"));
    roots.push(root);
    const policyRequest = join(root, "policy-request.json"), policyReceipt = join(root, "policy.json"), publishReceipt = join(root, "publish.json");
    await writeFile(policyRequest, JSON.stringify(request("exact-validation")));
    await writeReleasePolicy(policyRequest, policyReceipt);
    await writeFile(publishReceipt, JSON.stringify({
      schemaVersion: 1,
      operation: "exact.publish",
      profile: "exact-validation",
      channel: "betahyx",
      releaseVersion: "1.2.3-betahyx.4",
      sourceCommit,
      target,
      latestChannelHeadUrl: "https://attacker.invalid/release/betahyx/latest/channel-head.json",
    }));
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(executeExactReleaseControl({
      schemaVersion: 1,
      operation: "exact.activate",
      publishReceipt,
      policyReceipt,
      acceptanceCredentials: [],
    }, join(root, "receipt.json"))).rejects.toThrow("published release target binding mismatch");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it("rejects release version components outside the safe integer boundary", async () => {
    expect(() => resolveReleasePolicy({
      ...request("exact-validation"),
      releaseVersion: "9007199254740992.2.3-betahyx.4",
    })).toThrow("safe canonical integer boundary");
    const root = await mkdtemp(join(tmpdir(), "tools-release-policy-version-"));
    roots.push(root);
    const pack = join(root, "pack.json");
    await writeFile(pack, JSON.stringify({
      schemaVersion: 2,
      operation: "exact.pack",
      channel: "betahyx",
      releaseVersion: "9007199254740992.2.3-betahyx.4",
      sourceCommit,
    }));
    await expect(executeExactReleaseControl({
      schemaVersion: 1,
      operation: "exact.publish",
      packReceipt: pack,
      policyReceipt: join(root, "missing-policy.json"),
      endpointUrl: target.endpointUrl,
      bucket: target.bucket,
    }, join(root, "receipt.json"))).rejects.toThrow("safe canonical integer boundary");
  });
});
