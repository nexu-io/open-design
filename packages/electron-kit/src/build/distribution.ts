import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

import { Arch, build as electronBuild, Platform } from "electron-builder";

import type { ElectronShellManifest } from "../boundary/index.js";
import type { ElectronDistributionReceipt, ElectronSceneReceipt } from "./contracts.js";
import {
  resolveElectronDistributionConfiguration,
  resolveElectronDistributionPlatform,
  validateElectronDistributionPolicy,
  type ElectronDistributionPolicy,
} from "./distribution-policy.js";

export type BuildElectronDistributionInput = Readonly<{
  scene: ElectronSceneReceipt;
  manifest: ElectronShellManifest;
  policy: ElectronDistributionPolicy;
  outputRoot: string;
}>;

export async function buildElectronDistribution(input: BuildElectronDistributionInput): Promise<ElectronDistributionReceipt> {
  const policy = validateElectronDistributionPolicy(input.policy);
  const platform: ElectronDistributionReceipt["platform"] = resolveElectronDistributionPlatform(process.platform);
  await rm(input.outputRoot, { force: true, recursive: true });
  await mkdir(input.outputRoot, { recursive: true });
  const targets = platform === "win"
    ? Platform.WINDOWS.createTarget([...policy.windows.targets], Arch.x64)
    : Platform.MAC.createTarget([...policy.mac.targets], process.arch === "arm64" ? Arch.arm64 : Arch.x64);
  const require = createRequire(import.meta.url);
  const electronPackage = JSON.parse(await readFile(require.resolve("electron/package.json"), "utf8")) as { version: string };
  const built = await electronBuild({
    projectDir: input.scene.sceneRoot,
    targets,
    config: {
      ...resolveElectronDistributionConfiguration({
        manifest: input.manifest,
        policy,
        electronVersion: electronPackage.version,
        outputRoot: input.outputRoot,
      }),
      extraResources: [{ from: input.scene.sidecarPath, to: "fixture-sidecar.cjs" }],
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
