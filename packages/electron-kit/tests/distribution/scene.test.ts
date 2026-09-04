import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { assembleElectronScene } from "@/distribution/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("Electron scene", () => {
  it("keeps deterministic content metadata inside and path-bearing receipt outside", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-scene-"));
    roots.push(root);
    const paths = {
      entryPath: join(root, "main.ts"),
      authorityResourcePath: join(root, "sidecar.cjs"),
      closureResourcePath: join(root, "closure.mjs"),
      launcherResourcePath: join(root, "standalone-launcher.mjs"),
      rendererPreloadEntryPath: join(root, "renderer-preload.ts"),
      manifestPath: join(root, "shell.json"),
      nodeCarrierLockPath: join(root, "node-lock.json"),
      outputRoot: join(root, "build", "scene"),
      runtimeConfigPath: join(root, "runtime.json"),
    };
    await Promise.all([
      writeFile(paths.entryPath, "export const foundation = true;\n", "utf8"),
      writeFile(paths.authorityResourcePath, "module.exports = {};\n", "utf8"),
      writeFile(paths.closureResourcePath, "export const closure = true;\n", "utf8"),
      writeFile(paths.launcherResourcePath, "export const launcher = true;\n", "utf8"),
      writeFile(paths.rendererPreloadEntryPath, "export const preload = true;\n", "utf8"),
      writeFile(paths.manifestPath, `${JSON.stringify({
        schemaVersion: 1,
        appId: "io.example.electron",
        productName: "Example Electron",
        publisher: "Example Company",
        executableName: "example-electron",
        version: "1.2.3",
        channel: "dev",
        namespace: "example-electron",
        protocol: "example",
        window: { width: 800, height: 600, title: "Example Electron" },
        shell: { type: "electron", version: "1.2.3", buildHash: "a".repeat(64), digest: "b".repeat(64) },
      })}\n`, "utf8"),
      writeFile(paths.nodeCarrierLockPath, `${JSON.stringify({ schemaVersion: 1, version: "24.18.0", targets: {} })}\n`, "utf8"),
      writeFile(paths.runtimeConfigPath, `${JSON.stringify({
        schemaVersion: 1,
        preflight: { schemaVersion: 1, atoms: [{ id: "language", executor: "electron.preferred-language" }] },
        warmup: {
          schemaVersion: 1,
          nodes: [
            { id: "carrier", executor: "electron.ensure-carrier", dependsOn: [], blocking: true },
            { id: "resolve", executor: "standalone.resolve", dependsOn: ["carrier"], blocking: true },
            { id: "ready", executor: "standalone.await-ready", dependsOn: ["resolve"], blocking: true },
            { id: "renderer", executor: "electron.mount-renderer", dependsOn: ["ready"], blocking: true },
          ],
        },
      })}\n`, "utf8"),
    ]);

    const receipt = await assembleElectronScene({
      ...paths,
      authorityResources: [
        { name: "standalone-host.cjs", path: paths.authorityResourcePath },
        { name: "closure.mjs", path: paths.closureResourcePath },
        { name: "standalone-launcher.mjs", path: paths.launcherResourcePath },
      ],
      standaloneBinding: { target: "darwin-arm64", closureResourceName: "closure.mjs", launcherResourceName: "standalone-launcher.mjs" },
    });
    const scene = await readFile(receipt.sceneManifestPath, "utf8");
    const packageManifest = JSON.parse(await readFile(join(paths.outputRoot, "package.json"), "utf8")) as Record<string, unknown>;
    expect(receipt.receiptPath).toBe(join(root, "build", "scene-receipt.json"));
    expect(scene).not.toContain(root);
    expect(scene).not.toMatch(/releaseVersion|publishedAt|artifactBaseUrl|distribution/u);
    expect(JSON.parse(scene)).toMatchObject({
      schemaVersion: 1,
      operation: "electron.scene.build",
      target: "darwin-arm64",
      shellVersion: "1.2.3",
      shellBuildHash: "a".repeat(64),
      closure: { file: "closure.mjs", sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) },
      standalone: { entrypoint: "standalone-launcher.mjs", sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) },
      products: expect.arrayContaining([
        expect.objectContaining({ name: "renderer-mount-preload.cjs", sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) }),
        expect.objectContaining({ name: "runtime.json", sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) }),
        expect.objectContaining({ name: "shell.json", sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) }),
      ]),
    });
    await expect(readFile(join(paths.outputRoot, "scene-receipt.json"), "utf8")).rejects.toThrow();
    expect(packageManifest.author).toBe("Example Company");
    expect(receipt.authorityResources).toHaveLength(3);
    expect(receipt.authorityResources).toEqual(expect.arrayContaining([expect.objectContaining({
      name: "standalone-host.cjs",
      path: join(paths.outputRoot, "standalone-host.cjs"),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    })]));
  });

  it("rejects path-like, reserved and duplicate authority resource names", async () => {
    const input = {
      authorityResources: [] as { name: string; path: string }[],
      entryPath: "/unused/main.ts",
      manifestPath: "/unused/shell.json",
      nodeCarrierLockPath: "/unused/node-lock.json",
      outputRoot: "/unused/scene",
      rendererPreloadEntryPath: "/unused/preload.ts",
      runtimeConfigPath: "/unused/runtime.json",
    };
    for (const name of ["../host.cjs", "nested/host.cjs", "main.cjs"]) {
      await expect(assembleElectronScene({ ...input, authorityResources: [{ name, path: "/unused/source" }] }))
        .rejects.toThrow(/authority resource name/u);
    }
    await expect(assembleElectronScene({
      ...input,
      authorityResources: [
        { name: "standalone-host.cjs", path: "/unused/one" },
        { name: "standalone-host.cjs", path: "/unused/two" },
      ],
    })).rejects.toThrow(/authority resource name/u);
  });

});
