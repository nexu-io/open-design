import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  type ClosureDigest,
  type ClosureDistributionManifest,
  type ClosureDistributionManifestDraft,
} from "@open-design/closure-proto";
import { afterEach, describe, expect, it } from "vitest";

import {
  createClosureDistributionSharedContribution,
  createClosureDistributionTargetContribution,
  mergeClosureDistributionTargetContributions,
  sealClosureDistributionManifest,
} from "../src/closure-distribution.js";

const fixturePath = fileURLToPath(
  new URL("../../../packages/closure-proto/fixtures/distribution-v2.json", import.meta.url),
);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

async function artifact(root: string, name: string, content: string) {
  const path = join(root, name);
  await writeFile(path, content);
  return {
    mediaType: "application/zip",
    path,
    treeDigest: `sha256:${createHash("sha256").update(`tree:${content}`).digest("hex")}` as const,
  };
}

async function sharedContributionOptions(version = "0.19.0-beta.10") {
  const root = await mkdtemp(join(tmpdir(), "od-closure-contribution-shared-"));
  roots.push(root);
  return {
    blobOrigin: "https://releases.open-design.ai/",
    body: await artifact(root, "body.zip", "shared-body"),
    channel: "beta" as const,
    launcher: await artifact(root, "launcher.zip", "shared-launcher"),
    resources: [{
      ...await artifact(root, "design-systems.zip", "shared-design-systems"),
      id: "design-systems",
      title: "Design systems",
    }],
    shellCompatibility: {
      electron: { version: { min: "0.19.0-beta.4" } },
    },
    version,
  };
}

async function targetContributionOptions(target: "darwin-arm64" | "win32-x64") {
  const root = await mkdtemp(join(tmpdir(), `od-closure-contribution-${target}-`));
  roots.push(root);
  return {
    blobOrigin: "https://releases.open-design.ai/",
    channel: "beta" as const,
    native: await artifact(root, "native.zip", `native-${target}`),
    runtime: {
      ...await artifact(root, "node.zip", `official-node-${target}`),
      entryPath: target === "darwin-arm64" ? "bin/node" : "node.exe",
    },
    target,
    version: "0.19.0-beta.10",
  };
}

describe("tools-pack layered Closure producer", () => {
  it("reproduces the protocol fixture from unordered build inputs", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as ClosureDistributionManifest;
    const draft: ClosureDistributionManifestDraft = {
      blobs: Object.fromEntries(Object.entries(fixture.blobs).reverse()),
      compatibility: fixture.compatibility,
      identity: {
        channel: fixture.identity.channel,
        protocolVersion: CLOSURE_PROTOCOL_VERSION,
        version: fixture.identity.version,
      },
      required: {
        ...fixture.required,
        targets: Object.fromEntries(Object.entries(fixture.required.targets).reverse()),
      },
      resources: [...fixture.resources].reverse(),
      schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
    };

    expect(sealClosureDistributionManifest(draft)).toEqual(fixture);
  });

  it("changes release identity without changing a reused resource blob", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as ClosureDistributionManifest;
    const next = sealClosureDistributionManifest({
      ...fixture,
      identity: {
        channel: fixture.identity.channel,
        protocolVersion: fixture.identity.protocolVersion,
        version: "0.19.1-beta.1",
      },
    });

    expect(next.identity.digest).not.toBe(fixture.identity.digest);
    expect(next.resources[0]?.blob).toBe(fixture.resources[0]?.blob as ClosureDigest);
  });

  it("seals real component bytes per target and merges one version-wide graph", async () => {
    const shared = await createClosureDistributionSharedContribution(
      await sharedContributionOptions(),
    );
    const mac = await createClosureDistributionTargetContribution(
      await targetContributionOptions("darwin-arm64"),
    );
    const win = await createClosureDistributionTargetContribution(
      await targetContributionOptions("win32-x64"),
    );
    const merged = mergeClosureDistributionTargetContributions(shared, [win, mac]);

    expect(Object.keys(merged.required.targets)).toEqual(["darwin-arm64", "win32-x64"]);
    expect(merged.required.launcher.blob).toBe(shared.launcher.artifact.digest);
    expect(merged.required.body.blob).toBe(shared.body.artifact.digest);
    expect(merged.resources[0]?.blob).toBe(shared.resources[0]?.artifact.digest);
    expect(Object.values(merged.blobs).every((blob) => (
      blob.url === `https://releases.open-design.ai/beta/blobs/${blob.digest.slice("sha256:".length)}`
    ))).toBe(true);
  });

  it("reuses resource blobs across versions while changing the release graph", async () => {
    const firstShared = await createClosureDistributionSharedContribution(
      await sharedContributionOptions(),
    );
    const secondShared = await createClosureDistributionSharedContribution(
      await sharedContributionOptions("0.19.1-beta.1"),
    );
    const firstTarget = await createClosureDistributionTargetContribution(
      await targetContributionOptions("darwin-arm64"),
    );
    const secondTarget = await createClosureDistributionTargetContribution({
      ...await targetContributionOptions("darwin-arm64"),
      version: "0.19.1-beta.1",
    });
    const first = mergeClosureDistributionTargetContributions(firstShared, [firstTarget]);
    const second = mergeClosureDistributionTargetContributions(secondShared, [secondTarget]);

    expect(first.resources[0]?.blob).toBe(second.resources[0]?.blob);
    expect(first.identity.digest).not.toBe(second.identity.digest);
  });

  it("rejects duplicate targets and release identity drift before final sealing", async () => {
    const shared = await createClosureDistributionSharedContribution(
      await sharedContributionOptions(),
    );
    const mac = await createClosureDistributionTargetContribution(
      await targetContributionOptions("darwin-arm64"),
    );
    const drift = await createClosureDistributionTargetContribution({
      ...await targetContributionOptions("win32-x64"),
      version: "0.19.1-beta.1",
    });

    expect(() => mergeClosureDistributionTargetContributions(shared, [mac, mac])).toThrow(/duplicate/u);
    expect(() => mergeClosureDistributionTargetContributions(shared, [mac, drift])).toThrow(/release identity/u);
  });

  it("keeps shared bytes out of platform contributions", async () => {
    const target = await createClosureDistributionTargetContribution(
      await targetContributionOptions("darwin-arm64"),
    );

    expect(target).not.toHaveProperty("body");
    expect(target).not.toHaveProperty("launcher");
    expect(target).not.toHaveProperty("resources");
  });
});
