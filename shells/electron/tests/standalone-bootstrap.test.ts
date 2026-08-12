import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import {
  CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  createClosureComponentTreeDigest,
  createClosureDistributionManifest,
  type ClosureDistributionBlob,
} from "@open-design/closure-proto";
import { createStandaloneHandoffEnvelope } from "@open-design/standalone-proto";
import JSZip from "jszip";

import {
  resolveElectronStandaloneTarget,
  resolveStandaloneViaOfficialNode,
} from "../src/standalone-bootstrap.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

describe("Electron thin Standalone bootstrap", () => {
  it("crosses the real fossil/baseline process and commits an offline generation", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-electron-bootstrap-real-"));
    roots.push(root);
    const digest = (value: string | Buffer): `sha256:${string}` => (
      `sha256:${createHash("sha256").update(value).digest("hex")}`
    );
    const archive = async (files: Array<readonly [string, string]>): Promise<Buffer> => {
      const zip = new JSZip();
      for (const [path, contents] of files) zip.file(path, contents, { date: new Date(0) });
      return await zip.generateAsync({ compression: "DEFLATE", type: "nodebuffer" });
    };
    const sources = {
      body: [["bootloader.mjs", "export const handoff = async () => null;\n"]],
      launcher: [["bootloader.mjs", "export const handoff = async () => null;\n"], ["launcher.mjs", "export const launcher = true;\n"]],
      native: [["node_modules/addon/addon.node", "native\n"]],
    } satisfies Record<string, Array<readonly [string, string]>>;
    const bytes = {
      body: await archive(sources.body),
      launcher: await archive(sources.launcher),
      native: await archive(sources.native),
    };
    const artifact = (value: Buffer): ClosureDistributionBlob => ({
      digest: digest(value), mediaType: "application/zip", size: value.byteLength,
      url: `https://offline.example.test/beta/blobs/${digest(value).slice("sha256:".length)}`,
    });
    const artifacts = { body: artifact(bytes.body), launcher: artifact(bytes.launcher), native: artifact(bytes.native) };
    const tree = (files: Array<readonly [string, string]>) => createClosureComponentTreeDigest(
      files.map(([path, contents]) => ({ digest: digest(contents), path, size: Buffer.byteLength(contents) })),
      digest,
    );
    const manifest = createClosureDistributionManifest({
      blobs: Object.fromEntries(Object.values(artifacts).map((value) => [value.digest, value])),
      compatibility: { shell: { electron: { version: { min: "0.19.0-beta.1" } } } },
      identity: { channel: "beta", protocolVersion: CLOSURE_PROTOCOL_VERSION, version: "0.19.0-beta.1" },
      required: {
        body: { blob: artifacts.body.digest, entryPath: "bootloader.mjs", treeDigest: tree(sources.body) },
        launcher: { blob: artifacts.launcher.digest, entryPath: "launcher.mjs", handoffPath: "bootloader.mjs", treeDigest: tree(sources.launcher) },
        targets: { "darwin-arm64": { native: { blob: artifacts.native.digest, treeDigest: tree(sources.native) } } },
      },
      resources: [],
      schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
    }, digest);
    const shellRoot = join(root, "shell", "standalone");
    const seedRoot = join(shellRoot, "seed");
    await mkdir(join(shellRoot, "baseline"), { recursive: true });
    await cp(join(process.cwd(), "../../apps/standalone/dist/bootstrap/bootloader.mjs"), join(shellRoot, "bootloader.mjs"));
    await cp(join(process.cwd(), "../../apps/standalone/dist/bootstrap/baseline/launcher.mjs"), join(shellRoot, "baseline", "launcher.mjs"));
    await mkdir(join(seedRoot, "beta", "blobs"), { recursive: true });
    await writeFile(join(seedRoot, "beta", "baseline.json"), JSON.stringify({
      channel: "beta", closure: manifest, releaseState: "complete", releaseVersion: "0.19.0-beta.1",
    }));
    for (const [name, value] of Object.entries(bytes)) {
      await writeFile(join(seedRoot, "beta", "blobs", artifacts[name as keyof typeof artifacts].digest.slice("sha256:".length)), value);
    }
    const repositoryConfigPath = join(shellRoot, "repository.json");
    await writeFile(repositoryConfigPath, JSON.stringify({ localSeeds: [{ root: "seed" }], remoteOrigins: [], schemaVersion: 1 }));
    const resolution = await resolveStandaloneViaOfficialNode({
      bootloaderPath: join(shellRoot, "bootloader.mjs"),
      descriptor: {
        attachment: { id: "electron-shell", shell: { digest: `sha256:${"f".repeat(64)}`, type: "electron", version: "0.19.0-beta.1" } },
        discovery: { metadataUrl: null, target: "darwin-arm64" },
        paths: {
          cacheRoot: join(root, "cache"), dataRoot: join(root, "data"), installationRoot: join(root, "install"),
          logsRoot: join(root, "logs"), resourceRoot: join(root, "resources"), runtimeRoot: join(root, "runtime"),
        },
        repositoryConfigPath,
        schemaVersion: 1,
        scope: { channel: "beta", namespace: "release-beta" },
      },
      nodeCommand: process.execPath,
    });
    expect(resolution.bootloaderPath).toMatch(/generations\/0\/launcher\/bootloader\.mjs$/u);
    expect(JSON.parse(await readFile(join(root, "install", "closure", "channels", "beta", "namespaces", "release-beta", "state", "binding.json"), "utf8")))
      .toMatchObject({ committed: { standalone: { generation: 0 } } });
  });

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
