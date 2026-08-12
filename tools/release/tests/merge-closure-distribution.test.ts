import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
  CLOSURE_LAUNCHER_ENTRY_PATH,
  CLOSURE_LAUNCHER_HANDOFF_PATH,
  CLOSURE_PROTOCOL_VERSION,
  type ClosureDistributionBlob,
} from "@open-design/closure-proto";
import { afterEach, describe, expect, it } from "vitest";

import { mergeClosureDistributionFiles } from "../src/storage/merge-closure-distribution.js";

const roots: string[] = [];
const digest = (value: string): `sha256:${string}` => (
  `sha256:${createHash("sha256").update(value).digest("hex")}`
);
const blob = (value: string): ClosureDistributionBlob => {
  const valueDigest = digest(value);
  return {
    digest: valueDigest,
    mediaType: "application/zip",
    size: 1,
    url: `https://releases.open-design.test/beta/blobs/${valueDigest.slice("sha256:".length)}`,
  };
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

describe("Closure contribution file aggregation", () => {
  it("parses untrusted job files and emits one target-neutral graph", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-closure-merge-"));
    roots.push(root);
    await mkdir(root, { recursive: true });
    const sharedPath = join(root, "shared.json");
    const targetPath = join(root, "darwin-arm64.json");
    const launcher = blob("launcher");
    const body = blob("body");
    const runtime = blob("runtime");
    const native = blob("native");
    await writeFile(sharedPath, JSON.stringify({
      body: { artifact: body, entryPath: CLOSURE_ARCHIVE_ENTRY_PATH, treeDigest: digest("body-tree") },
      channel: "beta",
      launcher: {
        artifact: launcher,
        entryPath: CLOSURE_LAUNCHER_ENTRY_PATH,
        handoffPath: CLOSURE_LAUNCHER_HANDOFF_PATH,
        treeDigest: digest("launcher-tree"),
      },
      protocolVersion: CLOSURE_PROTOCOL_VERSION,
      resources: [],
      schemaVersion: CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
      shellCompatibility: { electron: { version: { min: "0.19.0" } } },
      version: "0.19.0-beta.10",
    }));
    await writeFile(targetPath, JSON.stringify({
      channel: "beta",
      native: { artifact: native, treeDigest: digest("native-tree") },
      protocolVersion: CLOSURE_PROTOCOL_VERSION,
      runtime: { artifact: runtime, entryPath: "bin/node", treeDigest: digest("runtime-tree") },
      schemaVersion: CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
      target: "darwin-arm64",
      version: "0.19.0-beta.10",
    }));

    const manifest = mergeClosureDistributionFiles({ sharedPath, targetPaths: [targetPath] });
    expect(Object.keys(manifest.required.targets)).toEqual(["darwin-arm64"]);
    expect(manifest.required.launcher.handoffPath).toBe("bootloader.mjs");

    await writeFile(targetPath, JSON.stringify({ bad: true }));
    expect(() => mergeClosureDistributionFiles({ sharedPath, targetPaths: [targetPath] }))
      .toThrow(/unsupported fields|schema version/u);
  });
});
