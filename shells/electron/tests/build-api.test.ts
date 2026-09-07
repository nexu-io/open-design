import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

import { buildElectronScene, buildElectronInstaller } from "@/build-api.js";
import { resolveElectronSceneManifest } from "@/adapters/tools/manifests.js";

const mock = vi.hoisted(() => ({ assemble: vi.fn(), load: vi.fn(), distribute: vi.fn(), install: vi.fn(), trust: vi.fn() }));
vi.mock("@open-design/electron-kit/distribution", () => ({ assembleElectronScene: mock.assemble, loadElectronScene: mock.load, buildElectronDistribution: mock.distribute }));
vi.mock("@open-design/electron-kit/installation", () => ({ inspectMacElectronAppTrust: mock.trust }));
vi.mock("@/adapters/standalone/build.ts", () => ({ buildElectronStandaloneAuthority: async () => ({ host: {}, updaterProvider: {}, supervisor: {} }) }));
vi.mock("@/adapters/standalone/assemble-installation.ts", () => ({ withElectronInstallation: mock.install }));

const roots: string[] = [];
afterEach(async () => { vi.resetAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "electron-build-api-")); roots.push(root);
  return root;
}

it("composes scene identity in memory and resolves source entries through the package root", async () => {
  const root = await fixture();
  const resourceReceiptFile = join(root, "resources.json"), sceneManifestPath = join(root, "scene.json");
  await writeFile(resourceReceiptFile, JSON.stringify({ schemaVersion: 1, operation: "closure.resources.build", resources: [] }));
  await writeFile(sceneManifestPath, "scene-bytes");
  mock.assemble.mockResolvedValue({ sceneManifestPath, sceneRoot: join(root, "scene") });
  const result = await buildElectronScene({ schemaVersion: 1, operation: "electron.scene.build", target: "darwin-arm64",
    buildHash: "a".repeat(64), acceptedClosureBaselineFile: join(root, "closure.mjs"), standaloneLauncherFile: join(root, "launcher.mjs"), resourceReceiptFile, sceneDirectory: join(root, "scene") });
  expect(result.sceneManifestSha256).toBe(createHash("sha256").update("scene-bytes").digest("hex"));
  expect(mock.assemble).toHaveBeenCalledWith(expect.objectContaining({
    manifest: await resolveElectronSceneManifest("a".repeat(64)),
    entryPath: expect.stringMatching(/\/shells\/electron\/src\/main\.ts$/u),
    rendererPreloadEntryPath: expect.stringMatching(/\/shells\/electron\/src\/adapters\/renderer\/preload\.ts$/u),
  }));
  expect(mock.assemble.mock.calls[0]![0]).not.toHaveProperty("manifestPath");
  expect(await readdir(root)).not.toContain("shell.json");
});

it.skipIf(!["darwin-arm64", "darwin-x64", "win32-x64"].includes(`${process.platform}-${process.arch}`))("derives native installer identity from the verified scene and rejects mismatched accepted content before assembly", async () => {
  const root = await fixture(), target = `${process.platform}-${process.arch}` as "darwin-arm64" | "darwin-x64" | "win32-x64";
  const manifest = await resolveElectronSceneManifest("b".repeat(64));
  const sceneManifestPath = join(root, "scene.json"), shellManifestPath = join(root, "shell.json"), contentPath = join(root, "content.json");
  await writeFile(sceneManifestPath, JSON.stringify({ target, closure: { file: "closure.mjs" }, standalone: { entrypoint: "launcher.mjs" } }));
  await writeFile(shellManifestPath, JSON.stringify(manifest));
  await writeFile(contentPath, JSON.stringify({ metadata: { channel: "betahyx", releaseVersion: "1.2.3-betahyx.2", resources: [] } }));
  await writeFile(join(root, "closure-resources.json"), JSON.stringify({ resources: [] }));
  mock.load.mockResolvedValue({ sceneManifestPath, shellManifestPath,
    authorityResources: ["standalone-host.mjs", "electron-updater.mjs", "supervisor.mjs", "closure.mjs", "launcher.mjs", "closure-resources.json"].map(name => ({ name, path: join(root, name) })) });
  const request = { schemaVersion: 1, operation: "electron.distribution.build", target, sceneDirectory: root, sceneManifestSha256: "c".repeat(64),
    outputDirectory: join(root, "output"), acceptedContentMetadataFile: contentPath, acceptedTrustFile: join(root, "trust.json"),
    channel: "betahyx", releaseVersion: "1.2.3-betahyx.1", channelHeadUrl: "https://example.com/betahyx/latest/channel-head.json" } as const;
  await expect(buildElectronInstaller(request)).rejects.toThrow(/content differs/u);
  expect(mock.install).not.toHaveBeenCalled();
  expect(mock.distribute).not.toHaveBeenCalled();

  await writeFile(contentPath, JSON.stringify({ metadata: { channel: request.channel, releaseVersion: request.releaseVersion, resources: [] } }));
  const artifactPath = join(root, process.platform === "darwin" ? "installer.dmg" : "installer.exe");
  await writeFile(artifactPath, "installer-bytes");
  mock.install.mockImplementation(async (_input, consume) => consume({ resourceDirectory: root }));
  mock.distribute.mockImplementation(async ({ manifest: release }) => {
    expect(release.shell).toEqual(manifest.shell);
    expect(release).toMatchObject({ channel: request.channel, version: request.releaseVersion });
    mock.trust.mockResolvedValue({ teamIdentifier: "adhoc", designatedRequirement: "test-only", bundleId: release.appId, executableName: release.executableName, productName: release.productName });
    return { artifacts: [artifactPath, join(root, "Open Design.app")] };
  });
  const result = await buildElectronInstaller(request);
  expect(result.operation).toBe("shell.distribution.contribute");
  expect(result.shell.buildHash).toBe(manifest.shell.buildHash);
  expect(result.artifact.sha256).toBe(createHash("sha256").update(await readFile(artifactPath)).digest("hex"));
  expect(mock.load).toHaveBeenCalledWith(root, request.sceneManifestSha256);
  expect(mock.install).toHaveBeenCalledWith(expect.objectContaining({ authority: expect.objectContaining({ host: expect.objectContaining({ path: join(root, "standalone-host.mjs") }) }) }), expect.any(Function));
});
