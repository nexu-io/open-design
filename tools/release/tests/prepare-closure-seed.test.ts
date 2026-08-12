import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  createClosureDistributionManifest,
} from "@open-design/closure-proto";
import { afterEach, describe, expect, it } from "vitest";

import { prepareClosureSeed } from "../src/storage/prepare-closure-seed.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

function digest(value: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "od-closure-seed-producer-"));
  roots.push(root);
  const blobs = {
    body: Buffer.from("body"), launcher: Buffer.from("launcher"), native: Buffer.from("native"), resource: Buffer.from("resource"),
  };
  const artifacts = Object.fromEntries(Object.entries(blobs).map(([name, value]) => {
    const valueDigest = digest(value);
    return [name, {
      digest: valueDigest,
      mediaType: "application/zip",
      size: value.byteLength,
      url: `https://releases.open-design.test/beta/blobs/${valueDigest.slice("sha256:".length)}`,
    }];
  })) as Record<keyof typeof blobs, { digest: `sha256:${string}`; mediaType: string; size: number; url: string }>;
  const manifest = createClosureDistributionManifest({
    blobs: Object.fromEntries(Object.values(artifacts).map((value) => [value.digest, value])),
    compatibility: { shell: { electron: { version: { min: "0.19.0-beta.1" } } } },
    identity: { channel: "beta", protocolVersion: CLOSURE_PROTOCOL_VERSION, version: "0.19.0-beta.3" },
    required: {
      body: { blob: artifacts.body.digest, entryPath: "bootloader.mjs", treeDigest: digest("body-tree") },
      launcher: { blob: artifacts.launcher.digest, entryPath: "launcher.mjs", handoffPath: "bootloader.mjs", treeDigest: digest("launcher-tree") },
      targets: { "darwin-arm64": { native: { blob: artifacts.native.digest, treeDigest: digest("native-tree") } } },
    },
    resources: [{ blob: artifacts.resource.digest, id: "skills", title: "Skills", treeDigest: digest("resource-tree") }],
    schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  }, digest);
  const manifestPath = join(root, "closure.json");
  const blobRoot = join(root, "blobs");
  await mkdir(blobRoot, { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest));
  for (const [name, value] of Object.entries(blobs)) {
    await writeFile(join(blobRoot, artifacts[name as keyof typeof artifacts].digest.slice("sha256:".length)), value);
  }
  return { artifacts, blobRoot, manifest, manifestPath, root };
}

describe("Closure seed producer", () => {
  it("writes a conventional metadata-only baseline without copying lazy resources", async () => {
    const value = await fixture();
    const outputRoot = join(value.root, "metadata-seed");
    const result = await prepareClosureSeed({
      channel: "beta", manifestPath: value.manifestPath, mode: "metadata", outputRoot,
      releaseVersion: "0.19.0-beta.3", target: "darwin-arm64",
    });
    expect(result.copiedBlobs).toEqual([]);
    expect(await readdir(join(outputRoot, "beta", "blobs"))).toEqual([]);
    expect(JSON.parse(await readFile(result.indexPath, "utf8"))).toMatchObject({ closure: { identity: value.manifest.identity } });
  });

  it("copies and verifies only the target required group", async () => {
    const value = await fixture();
    const outputRoot = join(value.root, "required-seed");
    const result = await prepareClosureSeed({
      channel: "beta", manifestPath: value.manifestPath, mode: "required", outputRoot,
      releaseVersion: "0.19.0-beta.3", sourceBlobRoot: value.blobRoot, target: "darwin-arm64",
    });
    expect(result.copiedBlobs).toHaveLength(3);
    expect(result.copiedBlobs).not.toContain(value.artifacts.resource.digest);
    expect(await readdir(join(outputRoot, "beta", "blobs"))).toHaveLength(3);
  });

  it("fails closed when a required source blob is mutated", async () => {
    const value = await fixture();
    await writeFile(join(value.blobRoot, value.artifacts.native.digest.slice("sha256:".length)), "broken");
    await expect(prepareClosureSeed({
      channel: "beta", manifestPath: value.manifestPath, mode: "required", outputRoot: join(value.root, "bad-seed"),
      releaseVersion: "0.19.0-beta.3", sourceBlobRoot: value.blobRoot, target: "darwin-arm64",
    })).rejects.toThrow(/size|digest/u);
  });
});
