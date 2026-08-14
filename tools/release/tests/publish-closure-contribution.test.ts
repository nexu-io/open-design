import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
} from "@open-design/closure/protocol";
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
    url: `https://releases.open-design.test/beta/versions/0.19.0-beta.9/closure/blobs/${value.slice("sha256:".length)}`,
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
    expect(plan.blobs[0]?.objectKey).toBe(
      `beta/versions/0.19.0-beta.9/closure/blobs/${value.launcher.slice("sha256:".length)}`,
    );
  });

  it("publishes target-native and target-scoped resource blobs together", async () => {
    const value = await fixture();
    const resourceBytes = Buffer.from("vela-runtime");
    const resource = digest(resourceBytes);
    await writeFile(join(value.blobRoot, resource.slice("sha256:".length)), resourceBytes);
    const native = value.contribution.body.artifact;
    const contribution = {
      channel: "beta",
      native: { artifact: native, treeDigest: digest("native tree") },
      protocolVersion: CLOSURE_PROTOCOL_VERSION,
      resources: [{
        artifact: {
          digest: resource,
          mediaType: "application/zip",
          size: resourceBytes.byteLength,
          url: `https://releases.open-design.test/beta/versions/0.19.0-beta.9/closure/blobs/${resource.slice("sha256:".length)}`,
        },
        id: "vela-runtime",
        title: "Vela runtime",
        treeDigest: digest("vela tree"),
      }],
      schemaVersion: CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
      target: "darwin-arm64",
      version: "0.19.0-beta.9",
    };
    const plan = createClosureContributionPublicationPlan({
      blobRoot: value.blobRoot,
      channel: "beta",
      contribution,
      kind: "target",
      publicOrigin: "https://releases.open-design.test",
      version: "0.19.0-beta.9",
    });

    expect(plan.blobs.map((entry) => entry.digest)).toEqual([native.digest, resource]);
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
