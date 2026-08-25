import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

import { Arch, build as electronBuild, Platform } from "electron-builder";

import type { ElectronShellManifest } from "../boundary/index.js";
import type { ElectronDistributionReceipt, ElectronSceneReceipt } from "./contracts.js";

export type BuildElectronDistributionInput = Readonly<{
  scene: ElectronSceneReceipt;
  manifest: ElectronShellManifest;
  outputRoot: string;
}>;

export async function buildElectronDistribution(input: BuildElectronDistributionInput): Promise<ElectronDistributionReceipt> {
  await rm(input.outputRoot, { force: true, recursive: true });
  await mkdir(input.outputRoot, { recursive: true });
  const platform: ElectronDistributionReceipt["platform"] = process.platform === "win32" ? "win" : "mac";
  const targets = platform === "win"
    ? Platform.WINDOWS.createTarget(["dir", "nsis"], Arch.x64)
    : Platform.MAC.createTarget(["dir", "dmg"], process.arch === "arm64" ? Arch.arm64 : Arch.x64);
  const require = createRequire(import.meta.url);
  const electronPackage = JSON.parse(await readFile(require.resolve("electron/package.json"), "utf8")) as { version: string };
  const built = await electronBuild({
    projectDir: input.scene.sceneRoot,
    targets,
    config: {
      appId: input.manifest.appId,
      productName: input.manifest.productName,
      executableName: input.manifest.executableName,
      electronVersion: electronPackage.version,
      asar: true,
      directories: { output: input.outputRoot },
      files: ["main.cjs", "electron-shell.json", "warmup.json", "node-lock.json", "package.json", "scene-receipt.json"],
      extraResources: [{ from: input.scene.sidecarPath, to: "fixture-sidecar.cjs" }],
      npmRebuild: false,
      nodeGypRebuild: false,
      mac: { category: "public.app-category.developer-tools", target: ["dir", "dmg"] },
      dmg: { sign: false },
      win: { target: ["dir", "nsis"] },
      nsis: { oneClick: false, perMachine: false },
    },
  });
  const appPath = platform === "mac"
    ? join(input.outputRoot, `mac-${process.arch}`, `${input.manifest.executableName}.app`)
    : join(input.outputRoot, "win-unpacked", `${input.manifest.executableName}.exe`);
  await access(appPath);

  const artifacts = [resolve(appPath), ...built.map((path) => resolve(path))];
  const receipt = { schemaVersion: 1 as const, platform, outputRoot: input.outputRoot, artifacts };
  await writeFile(join(input.outputRoot, "distribution-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}
