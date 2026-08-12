import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
} from "@open-design/closure-proto";
import { afterEach, describe, expect, it } from "vitest";

import { createClosureContributionPublicationPlan } from "../src/storage/publish-closure-contribution.js";

const roots: string[] = [];

function digest(bytes: Buffer | string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "od-closure-publish-plan-"));
  roots.push(root);
  const blobRoot = join(root, "blobs");
  await mkdir(blobRoot);
  const launcherBytes = Buffer.from("launcher");
  const bodyBytes = Buffer.from("body");
  const launcher = digest(launcherBytes);
  const body = digest(bodyBytes);
  await Promise.all([
    writeFile(join(blobRoot, launcher.slice("sha256:".length)), launcherBytes),
    writeFile(join(blobRoot, body.slice("sha256:".length)), bodyBytes),
  ]);
  const artifact = (value: `sha256:${string}`, size: number) => ({
    digest: value,
    mediaType: "application/zip",
    size,
    url: `https://releases.open-design.test/beta/blobs/${value.slice("sha256:".length)}`,
  });
  const contribution = {
    body: { artifact: artifact(body, bodyBytes.byteLength), entryPath: "bootloader.mjs", treeDigest: digest("body tree") },
    channel: "beta",
    launcher: {
      artifact: artifact(launcher, launcherBytes.byteLength),
      entryPath: "launcher.mjs",
      handoffPath: "bootloader.mjs",
      treeDigest: digest("launcher tree"),
    },
    protocolVersion: CLOSURE_PROTOCOL_VERSION,
    resources: [],
    schemaVersion: CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
    shellCompatibility: { electron: { version: { min: "0.19.0-beta.1" } } },
    version: "0.19.0-beta.9",
  };
  return { blobRoot, body, contribution, launcher };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

describe("Closure contribution publication boundary", () => {
  it("binds protocol-declared CAS objects to locally verified bytes", async () => {
    const value = await fixture();
    const plan = createClosureContributionPublicationPlan({
      blobRoot: value.blobRoot,
      channel: "beta",
      contribution: value.contribution,
      kind: "shared",
      publicOrigin: "https://releases.open-design.test",
      version: "0.19.0-beta.9",
    });
    expect(plan.blobs.map(({ digest: value }) => value)).toEqual([value.launcher, value.body]);
    expect(plan.blobs[0]?.objectKey).toBe(`beta/blobs/${value.launcher.slice("sha256:".length)}`);
  });

  it("rejects cross-release contributions before storage access", async () => {
    const value = await fixture();
    expect(() => createClosureContributionPublicationPlan({
      blobRoot: value.blobRoot,
      channel: "beta",
      contribution: value.contribution,
      kind: "shared",
      publicOrigin: "https://releases.open-design.test",
      version: "0.19.0-beta.10",
    })).toThrow(/identity/u);
  });

  it("rejects local byte drift and URL drift", async () => {
    const value = await fixture();
    await writeFile(join(value.blobRoot, value.body.slice("sha256:".length)), "drift");
    expect(() => createClosureContributionPublicationPlan({
      blobRoot: value.blobRoot,
      channel: "beta",
      contribution: value.contribution,
      kind: "shared",
      publicOrigin: "https://releases.open-design.test",
      version: "0.19.0-beta.9",
    })).toThrow(/digest verification/u);

    const next = await fixture();
    next.contribution.body.artifact.url = "https://example.test/body.zip";
    expect(() => createClosureContributionPublicationPlan({
      blobRoot: next.blobRoot,
      channel: "beta",
      contribution: next.contribution,
      kind: "shared",
      publicOrigin: "https://releases.open-design.test",
      version: "0.19.0-beta.9",
    })).toThrow(/blob URL/u);
  });
});
