import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
  CLOSURE_LAUNCHER_ENTRY_PATH,
  CLOSURE_LAUNCHER_HANDOFF_PATH,
  CLOSURE_PROTOCOL_VERSION,
  type ClosureDistributionBlob,
  type ClosureDistributionManifest,
} from "@open-design/closure/protocol";
import { afterEach, describe, expect, it } from "vitest";

import { mergeClosureDistributionFiles } from "../src/storage/merge-closure-distribution.js";

const execFileAsync = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, "..", "..", "..");
const tsxCliPath = require.resolve("tsx/cli");
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
    const intelTargetPath = join(root, "darwin-x64.json");
    const windowsTargetPath = join(root, "win32-x64.json");
    const outputPath = join(root, "closure-distribution.json");
    const launcher = blob("launcher");
    const body = blob("body");
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
      schemaVersion: CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
      target: "darwin-arm64",
      version: "0.19.0-beta.10",
    }));

    const manifest = mergeClosureDistributionFiles({ sharedPath, targetPaths: [targetPath] });
    expect(Object.keys(manifest.required.targets)).toEqual(["darwin-arm64"]);
    expect(manifest.required.launcher.handoffPath).toBe("bootloader.mjs");

    await writeFile(intelTargetPath, JSON.stringify({
      channel: "beta",
      native: { artifact: blob("native-intel"), treeDigest: digest("native-intel-tree") },
      protocolVersion: CLOSURE_PROTOCOL_VERSION,
      schemaVersion: CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
      target: "darwin-x64",
      version: "0.19.0-beta.10",
    }));
    await writeFile(windowsTargetPath, JSON.stringify({
      channel: "beta",
      native: { artifact: blob("native-windows"), treeDigest: digest("native-windows-tree") },
      protocolVersion: CLOSURE_PROTOCOL_VERSION,
      schemaVersion: CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
      target: "win32-x64",
      version: "0.19.0-beta.10",
    }));

    await execFileAsync(process.execPath, [
      tsxCliPath,
      "tools/release/src/index.ts",
      "merge-closure-distribution",
      sharedPath,
      targetPath,
      intelTargetPath,
      windowsTargetPath,
      "--output",
      outputPath,
    ], { cwd: workspaceRoot });
    const cliManifest = JSON.parse(await readFile(outputPath, "utf8")) as ClosureDistributionManifest;
    expect(Object.keys(cliManifest.required.targets)).toEqual([
      "darwin-arm64",
      "darwin-x64",
      "win32-x64",
    ]);

    await writeFile(targetPath, JSON.stringify({ bad: true }));
    expect(() => mergeClosureDistributionFiles({ sharedPath, targetPaths: [targetPath] }))
      .toThrow(/unsupported fields|schema version/u);
  });
});
