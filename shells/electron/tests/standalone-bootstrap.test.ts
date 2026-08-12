import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { createStandaloneHandoffEnvelope } from "@open-design/standalone-proto";

import {
  resolveElectronStandaloneTarget,
  resolveStandaloneViaOfficialNode,
} from "../src/standalone-bootstrap.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

describe("Electron thin Standalone bootstrap", () => {
  it("accepts an exact committed result produced by official Node", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-electron-bootstrap-valid-"));
    roots.push(root);
    const bootloaderPath = join(root, "bootloader.mjs");
    const descriptor = {
      attachment: { id: "electron-shell", shell: { digest: `sha256:${"f".repeat(64)}` as const, type: "electron", version: "0.19.0-beta.1" } },
      discovery: { metadataUrl: null, target: "darwin-arm64" },
      paths: {
        cacheRoot: join(root, "cache"), dataRoot: join(root, "data"), installationRoot: join(root, "install"),
        logsRoot: join(root, "logs"), resourceRoot: join(root, "resources"), runtimeRoot: join(root, "runtime"),
      },
      repositoryConfigPath: join(root, "repository.json"),
      schemaVersion: 1 as const,
      scope: { channel: "beta" as const, namespace: "release-beta" },
    };
    const handoff = createStandaloneHandoffEnvelope({
      descriptor: {
        release: { version: "0.19.0-beta.1" },
        standalone: { digest: `sha256:${"a".repeat(64)}`, protocolVersion: 1, version: "0.19.0-beta.1" },
      },
      scope: { ...descriptor.scope, generation: 0 },
    });
    await writeFile(bootloaderPath, `
import { readFile, writeFile } from "node:fs/promises";
const input = JSON.parse(await readFile(process.env.OD_STANDALONE_BOOTSTRAP_INPUT_V1, "utf8"));
await writeFile(process.env.OD_STANDALONE_BOOTSTRAP_RESULT_V1, JSON.stringify({
  outcome: "resolved",
  resolution: {
    bootloaderPath: ${JSON.stringify(join(root, "generation", "launcher", "bootloader.mjs"))},
    handoff: { attachment: input.attachment, handoff: ${JSON.stringify(handoff)}, paths: input.paths },
  },
  schemaVersion: 1,
}));
`);
    await expect(resolveStandaloneViaOfficialNode({
      bootloaderPath,
      descriptor,
      nodeCommand: process.execPath,
    })).resolves.toMatchObject({ handoff: { handoff: { scope: { generation: 0 } } } });
  });

  it("executes a JSON-only handoff once under caller-supplied official Node", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-electron-bootstrap-"));
    roots.push(root);
    const bootloaderPath = join(root, "bootloader.mjs");
    await writeFile(bootloaderPath, `
import { readFile, writeFile } from "node:fs/promises";
const input = JSON.parse(await readFile(process.env.OD_STANDALONE_BOOTSTRAP_INPUT_V1, "utf8"));
await writeFile(process.env.OD_STANDALONE_BOOTSTRAP_RESULT_V1, JSON.stringify({
  outcome: "resolved",
  resolution: {
    bootloaderPath: ${JSON.stringify(join(root, "generation", "launcher", "bootloader.mjs"))},
    handoff: {
      attachment: input.attachment,
      handoff: {
        descriptor: { release: { version: "0.19.0-beta.1" }, standalone: { digest: "sha256:${"a".repeat(64)}", protocolVersion: 1, version: "0.19.0-beta.1" } },
        descriptorDigest: "sha256:${"b".repeat(64)}",
        schemaVersion: 1,
        scope: { ...input.scope, generation: 0 },
      },
      paths: input.paths,
    },
  },
  schemaVersion: 1,
}));
`);
    await expect(resolveStandaloneViaOfficialNode({
      bootloaderPath,
      descriptor: {
        attachment: { id: "electron-shell", shell: { digest: `sha256:${"f".repeat(64)}`, type: "electron", version: "0.19.0-beta.1" } },
        discovery: { metadataUrl: null, target: "darwin-arm64" },
        paths: {
          cacheRoot: join(root, "cache"), dataRoot: join(root, "data"), installationRoot: join(root, "install"),
          logsRoot: join(root, "logs"), resourceRoot: join(root, "resources"), runtimeRoot: join(root, "runtime"),
        },
        repositoryConfigPath: join(root, "repository.json"),
        schemaVersion: 1,
        scope: { channel: "beta", namespace: "release-beta" },
      },
      nodeCommand: process.execPath,
    })).rejects.toThrow(/descriptorDigest/u);
  });

  it("preserves installer-required as the only incompatible-Shell escape", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-electron-bootstrap-floor-"));
    roots.push(root);
    const bootloaderPath = join(root, "bootloader.mjs");
    await writeFile(bootloaderPath, `
import { writeFile } from "node:fs/promises";
await writeFile(process.env.OD_STANDALONE_BOOTSTRAP_RESULT_V1, JSON.stringify({
  error: { code: "installer-required", message: "Install Open Design 0.19.0" },
  outcome: "rejected",
  schemaVersion: 1,
}));
`);
    await expect(resolveStandaloneViaOfficialNode({
      bootloaderPath,
      descriptor: {
        attachment: { id: "electron-shell", shell: { digest: `sha256:${"f".repeat(64)}`, type: "electron", version: "0.18.0" } },
        discovery: { metadataUrl: null, target: "darwin-arm64" },
        paths: {
          cacheRoot: join(root, "cache"), dataRoot: join(root, "data"), installationRoot: join(root, "install"),
          logsRoot: join(root, "logs"), resourceRoot: join(root, "resources"), runtimeRoot: join(root, "runtime"),
        },
        repositoryConfigPath: join(root, "repository.json"),
        schemaVersion: 1,
        scope: { channel: "beta", namespace: "release-beta" },
      },
      nodeCommand: process.execPath,
    })).rejects.toMatchObject({ code: "installer-required" });
  });

  it("keeps platform targeting out of Standalone version semantics", () => {
    expect(resolveElectronStandaloneTarget("darwin", "arm64")).toBe("darwin-arm64");
    expect(resolveElectronStandaloneTarget("win32", "x64")).toBe("win32-x64");
    expect(resolveElectronStandaloneTarget("linux", "x64")).toBeNull();
  });
});
