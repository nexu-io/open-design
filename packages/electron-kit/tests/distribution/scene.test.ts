import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { build } from "esbuild";

import { assembleElectronScene, loadElectronScene } from "@/distribution/index.js";
import type { ElectronShellManifest } from "@/contracts/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("Electron scene", () => {
  it("keeps the real Electron CJS closure on the import-meta-free Sidecar authority", async () => {
    const repositoryRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
    const result = await build({
      bundle: true,
      entryPoints: [join(repositoryRoot, "shells/electron/src/main.ts")],
      external: ["electron"],
      format: "cjs",
      logLevel: "silent",
      platform: "node",
      target: "node24",
      write: false,
    });
    expect(result.warnings.filter(({ id }) => id === "empty-import-meta")).toEqual([]);
    expect(result.outputFiles?.[0]?.text).not.toContain("var import_meta = {};");
  });

  it.each([false, true])("keeps deterministic content metadata inside and path-bearing receipt outside (tree=%s)", async (withTree) => {
    const root = await mkdtemp(join(tmpdir(), "electron-scene-"));
    roots.push(root);
    const paths = {
      entryPath: join(root, "main.ts"),
      authorityResourcePath: join(root, "sidecar.cjs"),
      closureResourcePath: join(root, "closure.mjs"),
      launcherResourcePath: join(root, "standalone-launcher.mjs"),
      rendererPreloadEntryPath: join(root, "renderer-preload.ts"),
      manifestPath: join(root, "shell.json"),
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
        schemaVersion: 2,
        appId: "io.example.electron",
        productName: "Example Electron",
        publisher: "Example Company",
        executableName: "example-electron",
        version: "1.2.3",
        channel: "dev",
        namespace: "example-electron",
        protocol: "example",
        shell: { type: "electron", version: "1.2.3", buildHash: "a".repeat(64), digest: "b".repeat(64) },
      })}\n`, "utf8"),
      writeFile(paths.runtimeConfigPath, `${JSON.stringify({
        schemaVersion: 1,
        preflight: { schemaVersion: 1, atoms: [{ id: "language", executor: "electron.preferred-language" }] },
        warmup: {
          schemaVersion: 1,
          nodes: [
            { id: "resolve", executor: "standalone.resolve", dependsOn: [], blocking: true },
            { id: "ready", executor: "standalone.await-ready", dependsOn: ["resolve"], blocking: true },
            { id: "renderer", executor: "electron.mount-renderer", dependsOn: ["ready"], blocking: true },
          ],
        },
      })}\n`, "utf8"),
    ]);

    const platformRoot = join(root, "platform");
    if (withTree) {
      await mkdir(join(platformRoot, "bin"), { recursive: true });
      await writeFile(join(platformRoot, "bin/node"), "native executable bytes");
      await chmod(join(platformRoot, "bin/node"), 0o755);
      await writeFile(join(platformRoot, "empty"), "");
    }
    const receipt = await assembleElectronScene({
      ...paths,
      manifest: JSON.parse(await readFile(paths.manifestPath, "utf8")) as ElectronShellManifest,
      authorityResources: [
        ...(withTree ? [{ name: "platform", path: platformRoot }] : []),
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
      authorityResources: ["closure.mjs", ...(withTree ? ["platform"] : []), "standalone-host.cjs", "standalone-launcher.mjs"],
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
    expect(receipt.authorityResources).toHaveLength(withTree ? 4 : 3);
    expect(receipt.authorityResources).toEqual(expect.arrayContaining([expect.objectContaining({
      name: "standalone-host.cjs",
      path: join(paths.outputRoot, "standalone-host.cjs"),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    })]));
    await expect(loadElectronScene(paths.outputRoot, receipt.sceneManifestSha256)).resolves.toEqual(receipt);
    await expect(loadElectronScene(paths.outputRoot, "f".repeat(64))).rejects.toThrow("binding verification");
    if (withTree) {
      const platform = receipt.authorityResources.find(resource => resource.name === "platform")!;
      expect(platform.tree?.map(file => file.path)).toEqual(["bin/node", "empty"]);
      const executable = join(platform.path, "bin/node");
      await writeFile(executable, "changed executable");
      await expect(loadElectronScene(paths.outputRoot, receipt.sceneManifestSha256)).rejects.toThrow("binding verification: platform");
      await writeFile(executable, "native executable bytes");
      if (process.platform !== "win32") {
        await chmod(executable, 0o644);
        await expect(loadElectronScene(paths.outputRoot, receipt.sceneManifestSha256)).rejects.toThrow("binding verification: platform");
        await chmod(executable, 0o755);
      }
      const extra = join(platform.path, "extra.node");
      await writeFile(extra, "unlisted native bytes");
      await expect(loadElectronScene(paths.outputRoot, receipt.sceneManifestSha256)).rejects.toThrow("binding verification: platform");
      await rm(extra);
      await expect(loadElectronScene(paths.outputRoot, receipt.sceneManifestSha256)).resolves.toEqual(receipt);
      await rm(executable);
      await expect(loadElectronScene(paths.outputRoot, receipt.sceneManifestSha256)).rejects.toThrow("binding verification: platform");
    }
  });

  it.each(["same", "input-inside", "output-inside"])("rejects overlapping scene roots before cleanup: %s", async relationship => {
    const root = await mkdtemp(join(tmpdir(), "electron-scene-overlap-")); roots.push(root);
    await writeFile(join(root, "sentinel"), "untouched");
    const outputRoot = relationship === "output-inside" ? join(root, "output") : root;
    const path = relationship === "input-inside" ? join(root, "sentinel") : root;
    await expect(assembleElectronScene({ authorityResources: [{ name: "platform", path }], manifest: {} as ElectronShellManifest,
      outputRoot, entryPath: "/unused", rendererPreloadEntryPath: "/unused", runtimeConfigPath: "/unused" }))
      .rejects.toThrow(/cannot overlap/u);
    expect(await readFile(join(root, "sentinel"), "utf8")).toBe("untouched");
  });

  it.skipIf(process.platform === "win32")("rejects tree symlinks before replacing output", async () => {
    const root = await mkdtemp(join(tmpdir(), "electron-scene-link-")); roots.push(root);
    const tree = join(root, "tree"), outputRoot = join(root, "output");
    await mkdir(tree); await mkdir(outputRoot);
    await writeFile(join(outputRoot, "sentinel"), "untouched");
    await symlink(process.execPath, join(tree, "node"));
    await expect(assembleElectronScene({ authorityResources: [{ name: "platform", path: tree }],
      manifest: {} as ElectronShellManifest, outputRoot, entryPath: "/unused", rendererPreloadEntryPath: "/unused", runtimeConfigPath: "/unused" }))
      .rejects.toThrow(/link or special file/u);
    expect(await readFile(join(outputRoot, "sentinel"), "utf8")).toBe("untouched");
  });

  it("rejects path-like, reserved and duplicate authority resource names", async () => {
    const input = {
      authorityResources: [] as { name: string; path: string }[],
      entryPath: "/unused/main.ts",
      manifest: {} as ElectronShellManifest,
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
