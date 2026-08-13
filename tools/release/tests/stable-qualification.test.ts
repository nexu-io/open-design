import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createStableQualification,
  validateStableQualification,
} from "../src/storage/stable-qualification.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

async function fixture(amrProfile = "prod") {
  const manifestDir = await mkdtemp(join(tmpdir(), "od-stable-qualification-"));
  roots.push(manifestDir);
  const releaseVersion = "1.2.3-prerelease.4";
  const targetManifest = (target: string, seed: string) => ({
    artifacts: {
      primary: {
        digest: `sha256:${seed.repeat(64)}`,
        url: `https://releases.example/prerelease/versions/${releaseVersion}/${target}.zip`,
      },
    },
    platformKey: target,
    r2: {
      versionManifestUrl: `https://releases.example/prerelease/versions/${releaseVersion}/platforms/${target}.json`,
    },
  });
  const manifests = {
    mac_arm64: targetManifest("mac_arm64", "a"),
    mac_x64: targetManifest("mac_x64", "b"),
    win_x64: targetManifest("win_x64", "c"),
  };
  for (const [target, manifest] of Object.entries(manifests)) {
    await writeFile(join(manifestDir, `${target}.json`), `${JSON.stringify(manifest)}\n`);
  }
  const metadata = {
    amrProfile,
    baseVersion: "1.2.3",
    channel: "prerelease",
    generatedAt: "2026-08-13T00:00:00.000Z",
    github: {
      branch: "release/v1.2.3",
      commit: "abc123",
      repository: "nexu-io/open-design",
      runAttempt: 1,
      runId: 42,
      workflow: "release-prerelease",
    },
    parameterMatrix: {
      mac_arm64: { signMode: "notarized" },
      mac_x64: { signMode: "notarized" },
      win_x64: { signMode: "unsigned" },
    },
    releaseState: "complete",
    releaseTargets: manifests,
    releaseVersion,
  };
  return {
    manifestDir,
    metadataBytes: Buffer.from(`${JSON.stringify(metadata)}\n`),
    metadataUrl: `https://releases.example/prerelease/versions/${releaseVersion}/metadata.json`,
  };
}

describe("stable qualification", () => {
  it("binds prod prerelease metadata, all platform digests, and successful core smoke", async () => {
    const input = await fixture();
    const qualification = createStableQualification({
      ...input,
      smokeResults: { mac_arm64: "success", mac_x64: "success", win_x64: "success" },
    });
    expect(qualification?.status).toBe("qualified");
    expect(qualification?.targets.win_x64.artifacts.primary).toBe(`sha256:${"c".repeat(64)}`);
    expect(validateStableQualification({ ...input, qualification })).toEqual(qualification);
  });

  it("does not qualify a non-prod build or advisory smoke failure", async () => {
    const nonProd = await fixture("test");
    expect(createStableQualification({
      ...nonProd,
      smokeResults: { mac_arm64: "success", mac_x64: "success", win_x64: "success" },
    })).toBeNull();

    const prod = await fixture();
    expect(createStableQualification({
      ...prod,
      smokeResults: { mac_arm64: "success", mac_x64: "failure", win_x64: "success" },
    })).toBeNull();
  });

  it("rejects a credential whose parameter matrix was changed", async () => {
    const input = await fixture();
    const qualification = createStableQualification({
      ...input,
      smokeResults: { mac_arm64: "success", mac_x64: "success", win_x64: "success" },
    });
    expect(qualification).not.toBeNull();
    const changed = structuredClone(qualification!);
    changed.parameterMatrix.win_x64 = { signMode: "signed" };
    expect(() => validateStableQualification({ ...input, qualification: changed })).toThrow(/parameter matrix/u);
  });
});
