import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  createClosureDistributionManifest,
} from "@open-design/closure-proto";
import { afterEach, describe, expect, it } from "vitest";

import type { ToolPackConfig } from "../src/config.js";
import { inspectStandaloneSeed } from "../src/standalone-seed.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

function digest(value: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function seedFixture(options: Readonly<{
  minShellVersion?: string;
  writeBlob?: boolean;
}> = {}): Promise<{ config: ToolPackConfig; digest: `sha256:${string}`; root: string }> {
  const root = await mkdtemp(join(tmpdir(), "od-tools-pack-seed-"));
  roots.push(root);
  const seedRoot = join(root, "seed");
  const blob = Buffer.from("PK\u0003\u0004standalone-component");
  const blobDigest = digest(blob);
  const manifest = createClosureDistributionManifest({
    blobs: {
      [blobDigest]: {
        digest: blobDigest,
        mediaType: "application/zip",
        size: blob.byteLength,
        url: `https://releases.open-design.test/beta/blobs/${blobDigest.slice("sha256:".length)}`,
      },
    },
    compatibility: { shell: { electron: { version: { min: options.minShellVersion ?? "0.19.0-beta.1" } } } },
    identity: { channel: "beta", protocolVersion: CLOSURE_PROTOCOL_VERSION, version: "0.19.0-beta.3" },
    required: {
      body: { blob: blobDigest, entryPath: "bootloader.mjs", treeDigest: digest("body") },
      launcher: { blob: blobDigest, entryPath: "launcher.mjs", handoffPath: "bootloader.mjs", treeDigest: digest("launcher") },
      targets: { "darwin-arm64": { native: { blob: blobDigest, treeDigest: digest("native") } } },
    },
    resources: [],
    schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  }, digest);
  await mkdir(join(seedRoot, "beta", "blobs"), { recursive: true });
  await writeFile(join(seedRoot, "beta", "baseline.json"), JSON.stringify({
    channel: "beta",
    closure: manifest,
    releaseState: "complete",
    releaseVersion: "0.19.0-beta.3",
  }));
  if (options.writeBlob !== false) {
    await writeFile(join(seedRoot, "beta", "blobs", blobDigest.slice("sha256:".length)), blob);
  }
  return {
    config: {
      platform: "mac",
      releaseVersion: "0.19.0-beta.3",
      shell: "electron",
      shellVersion: "0.19.0-beta.2",
      standaloneSeedRoot: seedRoot,
    } as ToolPackConfig,
    digest: blobDigest,
    root,
  };
}

describe("Standalone Shell seed", () => {
  it("binds a valid partial or complete baseline repository to the artifact profile", async () => {
    const complete = await seedFixture();
    await expect(inspectStandaloneSeed(complete.config)).resolves.toMatchObject({
      channel: "beta",
      presentBlobs: [complete.digest],
      standaloneVersion: "0.19.0-beta.3",
      target: "darwin-arm64",
    });

    const metadataOnly = await seedFixture({ writeBlob: false });
    await expect(inspectStandaloneSeed(metadataOnly.config)).resolves.toMatchObject({ presentBlobs: [] });
  });

  it("rejects a baseline that cannot legally start under this Shell floor", async () => {
    const value = await seedFixture({ minShellVersion: "0.19.0-beta.4" });
    await expect(inspectStandaloneSeed(value.config)).rejects.toThrow(/incompatible/u);
  });

  it("rejects mutated bytes before they enter a signed Shell artifact", async () => {
    const value = await seedFixture();
    await writeFile(
      join(value.config.standaloneSeedRoot!, "beta", "blobs", value.digest.slice("sha256:".length)),
      "mutated",
    );
    await expect(inspectStandaloneSeed(value.config)).rejects.toThrow(/size|digest/u);
  });
});
