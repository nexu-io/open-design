import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { Arch, build } from "electron-builder";
import { buildElectronDistributionStages } from "@/distribution/distribution.js";

vi.mock("electron-builder", async importOriginal => ({
  ...await importOriginal<typeof import("electron-builder")>(), build: vi.fn(),
}));
const roots: string[] = [];
afterEach(async () => { vi.resetAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it.each(["mac", "win"] as const)("assembles before wrapping the untouched %s application", async platform => {
  const root = await mkdtemp(join(tmpdir(), "electron-distribution-stage-")); roots.push(root);
  const appPath = join(root, platform === "mac" ? "Product.app" : "win-unpacked/Product.exe");
  vi.mocked(build).mockImplementationOnce(async options => {
    expect(options?.prepackaged).toBeUndefined();
    expect([...options!.targets!.values()].flatMap(value => [...value.values()].flat())).toEqual(["dir"]);
    await mkdir(dirname(appPath), { recursive: true });
    await writeFile(appPath, "signed application");
    return [];
  }).mockResolvedValueOnce([join(root, "installer")]);
  const config = { appId: "test.app" };
  expect(await buildElectronDistributionStages({ projectDir: root, appPath, platform, arch: Arch.arm64,
    config, targets: ["dir", platform === "mac" ? "dmg" : "nsis"] })).toEqual([join(root, "installer")]);
  expect(vi.mocked(build).mock.calls[1]![0]).toMatchObject({
    prepackaged: platform === "mac" ? appPath : dirname(appPath), config,
  });
});

it("does not wrap an application when native assembly fails", async () => {
  vi.mocked(build).mockRejectedValueOnce(new Error("signing failed"));
  await expect(buildElectronDistributionStages({ projectDir: "/unused", appPath: "/unused/app", platform: "mac",
    arch: Arch.arm64, targets: ["dir", "dmg"], config: {} })).rejects.toThrow("signing failed");
  expect(build).toHaveBeenCalledTimes(1);
});
