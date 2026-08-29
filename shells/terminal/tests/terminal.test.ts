import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StandaloneStore, StandaloneUpdater, VersionedLauncher, canonicalJson, sha256Hex, signStandaloneChannelHead, signStandaloneMetadata, type StandaloneMetadata } from "@open-design/standalone";
import { FileFixtureLifecyclePort, OFFICIAL_NODE_VERSION, applyTerminalUpdate, assertOfficialNodeVersion } from "../src/index.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))); });

describe("Terminal shell skeleton", () => {
  it("pins the exact official Node carrier", () => {
    expect(OFFICIAL_NODE_VERSION).toBe("24.18.0");
    expect(() => assertOfficialNodeVersion("24.18.0")).not.toThrow();
    expect(() => assertOfficialNodeVersion("24.18.1")).toThrow("requires official Node 24.18.0");
  });

  it("persists the Web/daemon-independent lifecycle fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "terminal-fixture-")); roots.push(root);
    const port = new FileFixtureLifecyclePort(root, "betahyx-local");
    const generation = { schemaVersion: 1 as const, id: "generation-1", channel: "betahyx", releaseVersion: "0.1.0-betahyx.1", standaloneVersion: "0.1.0", sourceCommit: "a".repeat(40), components: {} };
    await expect(port.start(generation)).resolves.toEqual({ state: "running", generationId: "generation-1" });
    await expect(new FileFixtureLifecyclePort(root, "betahyx-local").status()).resolves.toEqual({ state: "running", generationId: "generation-1" });
    await expect(port.stop()).resolves.toEqual({ state: "stopped", generationId: "generation-1" });
  });

  it("applies an already-prepared update returned as current", async () => {
    const lifecycle = { state: "running" as const, generationId: "generation-2" };
    const applyNow = vi.fn(async () => lifecycle);
    const preparation = { status: "current" as const, generationId: "generation-2", applyRequired: true };
    await expect(applyTerminalUpdate({ applyNow } as never, {} as never, preparation)).resolves.toEqual({ preparation, lifecycle });
    expect(applyNow).toHaveBeenCalledOnce();
  });

  it("returns lifecycle status when an already-active update is applied again", async () => {
    const lifecycle = { state: "running" as const, generationId: "generation-2" };
    const applyNow = vi.fn();
    const status = vi.fn(async () => lifecycle);
    const preparation = { status: "current" as const, generationId: "generation-2", applyRequired: false };
    await expect(applyTerminalUpdate({ applyNow } as never, { status } as never, preparation)).resolves.toEqual({ preparation, lifecycle });
    expect(applyNow).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledOnce();
  });

  it("replays apply-update after install committed without starting the generation", async () => {
    const root = await mkdtemp(join(tmpdir(), "terminal-replay-")); roots.push(root);
    const artifact = Buffer.from("closure-update");
    const keys = generateKeyPairSync("ed25519");
    const metadata: StandaloneMetadata = {
      schemaVersion: 1,
      channel: "betahyx",
      releaseVersion: "0.1.0-betahyx.1",
      standaloneVersion: "0.1.0",
      sourceCommit: "a".repeat(40),
      publishedAt: "2026-08-24T00:00:00.000Z",
      components: [{ name: "closure-fixture", mode: "required", artifact: { entrypoint: "fixture.mjs", sha256: sha256Hex(artifact), size: artifact.byteLength, url: "https://fixtures.invalid/closure.mjs" } }],
      shellCompatibility: [{ shell: "terminal", target: "darwin-arm64", shellVersion: "0.1.0", runtime: { name: "node", version: OFFICIAL_NODE_VERSION } }],
    };
    const envelope = signStandaloneMetadata(metadata, "test-key", keys.privateKey);
    const metadataBytes = Buffer.from(canonicalJson(envelope));
    const head = signStandaloneChannelHead({
      schemaVersion: 1,
      channel: "betahyx",
      publishedAt: "2026-08-24T00:00:00.000Z",
      lanes: { closure: { releaseVersion: metadata.releaseVersion, url: "https://fixtures.invalid/metadata.json", sha256: sha256Hex(metadataBytes), size: metadataBytes.byteLength } },
    }, [{ keyId: "test-key", privateKey: keys.privateKey }]);
    const store = new StandaloneStore(root, "terminal-betahyx");
    const updater = new StandaloneUpdater(
      "betahyx",
      "closure",
      { shell: "terminal", target: "darwin-arm64", shellVersion: "0.1.0", runtime: { name: "node", version: OFFICIAL_NODE_VERSION } },
      new Map([["test-key", keys.publicKey]]),
      store,
      { readChannelHead: async () => head, readArtifact: async (url) => url.endsWith("metadata.json") ? metadataBytes : artifact },
    );
    const launcher = new VersionedLauncher(store, new FileFixtureLifecyclePort(root, "terminal-betahyx"));

    const prepared = await updater.prepareLatest();
    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") throw new Error("expected a prepared generation");
    await store.commit(prepared.generation.id);
    const current = await updater.prepareLatest();
    expect(current).toMatchObject({ status: "current", applyRequired: false });
    await expect(applyTerminalUpdate(updater, launcher, current)).resolves.toMatchObject({ lifecycle: { state: "stopped" } });
    expect(await store.readState()).toMatchObject({ active: prepared.generation.id, attempt: prepared.generation.id });
  });

  it("rejects a foreign Node carrier before parsing commands or opening a store", () => {
    const result = spawnSync(process.execPath, [
      "--import", "tsx",
      "--eval", "Object.defineProperty(process.versions, 'node', { value: '24.18.1' }); await import('./src/cli.ts');",
    ], { cwd: join(import.meta.dirname, ".."), encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Terminal carrier requires official Node 24.18.0; got 24.18.1");
    expect(result.stderr).not.toContain("missing --root");
  });

  it("uses the signed channel namespace across default install and start", async () => {
    const root = await mkdtemp(join(tmpdir(), "terminal-cli-defaults-")); roots.push(root);
    const artifact = Buffer.from("export default 'closure';\n");
    const keys = generateKeyPairSync("ed25519");
    const artifactPath = join(root, "closure.mjs");
    const metadataPath = join(root, "metadata.json");
    const publicKeyPath = join(root, "public.pem");
    const headPath = join(root, "head.json");
    const trustedKeysPath = join(root, "trusted-keys.json");
    const signed = signStandaloneMetadata({
      schemaVersion: 1,
      channel: "betahyx",
      releaseVersion: "0.1.0-betahyx.1",
      standaloneVersion: "0.1.0",
      sourceCommit: "a".repeat(40),
      publishedAt: "2026-08-24T00:00:00.000Z",
      components: [{ name: "closure-fixture", mode: "required", artifact: { entrypoint: "fixture.mjs", sha256: sha256Hex(artifact), size: artifact.byteLength, url: new URL(`file://${artifactPath}`).href } }],
      shellCompatibility: [{ shell: "terminal", target: "darwin-arm64", shellVersion: "0.1.0", runtime: { name: "node", version: OFFICIAL_NODE_VERSION } }],
    }, "test-key", keys.privateKey);
    await writeFile(artifactPath, artifact);
    const metadataBytes = Buffer.from(canonicalJson(signed));
    const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
    const head = signStandaloneChannelHead({
      schemaVersion: 1,
      channel: "betahyx",
      publishedAt: "2026-08-24T00:00:00.000Z",
      lanes: { closure: { releaseVersion: signed.metadata.releaseVersion, url: "https://fixtures.invalid/metadata.json", sha256: sha256Hex(metadataBytes), size: metadataBytes.byteLength } },
    }, [{ keyId: "test-key", privateKey: keys.privateKey }]);
    await writeFile(metadataPath, metadataBytes);
    await writeFile(publicKeyPath, publicKey);
    await writeFile(headPath, canonicalJson(head));
    await writeFile(trustedKeysPath, canonicalJson({ "test-key": publicKey }));
    const runCli = (args: string[]) => spawnSync(process.execPath, [
      "--import", "tsx",
      "--eval", `Object.defineProperty(process.versions, 'node', { value: '${OFFICIAL_NODE_VERSION}' }); const { readFile } = await import('node:fs/promises'); globalThis.fetch = async (url) => new Response(await readFile(String(url).includes('head.json') ? ${JSON.stringify(headPath)} : ${JSON.stringify(metadataPath)})); process.argv = [process.execPath, 'cli', ...${JSON.stringify(args)}]; await import('./src/cli.ts');`,
    ], { cwd: join(import.meta.dirname, ".."), encoding: "utf8" });

    const install = runCli(["install", "--root", root, "--metadata", metadataPath, "--public-key", publicKeyPath, "--target", "darwin-arm64"]);
    expect(install.status, install.stderr).toBe(0);
    expect(JSON.parse(install.stdout)).toMatchObject({ generation: { channel: "betahyx" } });
    const update = runCli(["update", "--root", root, "--channel", "betahyx", "--channel-head", "https://fixtures.invalid/head.json", "--trusted-keys", trustedKeysPath, "--target", "darwin-arm64"]);
    expect(update.status, update.stderr).toBe(0);
    expect(JSON.parse(update.stdout)).toMatchObject({ status: "current" });
    const start = runCli(["start", "--root", root]);
    expect(start.status, start.stderr).toBe(0);
    expect(JSON.parse(start.stdout)).toMatchObject({ state: "running" });
    expect(await new StandaloneStore(root, "terminal-betahyx").readState()).toMatchObject({ active: expect.any(String), lastSuccessful: expect.any(String) });
    expect(await new StandaloneStore(root, "terminal-local").readState()).toMatchObject({ active: null });
  });

  it("preserves a shell reinstall requirement without applying a stale attempt", async () => {
    const applyNow = vi.fn();
    const preparation = { status: "shell-reinstall-required" as const, releaseVersion: "0.1.0-betahyx.2" };
    await expect(applyTerminalUpdate({ applyNow } as never, {} as never, preparation)).resolves.toEqual({ preparation });
    expect(applyNow).not.toHaveBeenCalled();
  });
});
