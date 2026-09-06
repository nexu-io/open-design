import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Arch, build as electronBuild, Platform } from "electron-builder";

import { validateElectronShellManifest, type ElectronShellManifest } from "../contracts/index.js";
import {
  resolveElectronWindowsInstallIdentity,
  validateElectronWindowsLifecyclePolicy,
  type ElectronWindowsLifecyclePolicy,
} from "../platform/windows/index.js";
import { writeElectronWindowsNsisInclude } from "../platform/windows/installer/nsis-include.js";
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
  windowsLifecycle: ElectronWindowsLifecyclePolicy;
  outputRoot: string;
  additionalResources?: readonly Readonly<{ name: string; path: string }>[];
}>;

export async function buildElectronDistribution(input: BuildElectronDistributionInput): Promise<ElectronDistributionReceipt> {
  const manifest = validateElectronShellManifest(input.manifest);
  const policy = validateElectronDistributionPolicy(input.policy);
  const windowsLifecycle = validateElectronWindowsLifecyclePolicy(input.windowsLifecycle);
  const platform: ElectronDistributionReceipt["platform"] = resolveElectronDistributionPlatform(process.platform);
  await rm(input.outputRoot, { force: true, recursive: true });
  await mkdir(input.outputRoot, { recursive: true });
  const targets = platform === "win"
    ? Platform.WINDOWS.createTarget([...policy.windows.targets], Arch.x64)
    : Platform.MAC.createTarget([...policy.mac.targets], process.arch === "arm64" ? Arch.arm64 : Arch.x64);
  const require = createRequire(import.meta.url);
  const electronPackage = JSON.parse(await readFile(require.resolve("electron/package.json"), "utf8")) as { version: string };
  const scratchRoot = await mkdtemp(join(tmpdir(), "electron-kit-distribution-"));
  const projectRoot = join(scratchRoot, "project");
  const windowsNsisIncludePath = platform === "win" ? join(scratchRoot, "installer.nsh") : undefined;
  let built: string[];
  const existingResourceNames = new Set(input.scene.authorityResources.map(({ name }) => name));
  const additionalResources = input.additionalResources ?? [];
  for (const resource of additionalResources) {
    if (!/^[a-z][a-z0-9.-]{0,127}$/u.test(resource.name) || existingResourceNames.has(resource.name)) throw new Error(`invalid or duplicate Electron distribution resource: ${resource.name}`);
    existingResourceNames.add(resource.name);
    await access(resource.path);
  }
  try {
    await mkdir(projectRoot, { recursive: true });
    const iconPath = manifest.iconDataUrl == null ? undefined : join(scratchRoot, "icon.png");
    if (iconPath != null) await writeFile(iconPath, Buffer.from(manifest.iconDataUrl!.slice("data:image/png;base64,".length), "base64"));
    await Promise.all([
      copyFile(input.scene.mainPath, join(projectRoot, "main.cjs")),
      copyFile(input.scene.rendererPreloadPath, join(projectRoot, "renderer-mount-preload.cjs")),
      copyFile(input.scene.nodeCarrierLockPath, join(projectRoot, "node-lock.json")),
      copyFile(input.scene.runtimeConfigPath, join(projectRoot, "runtime.json")),
      writeFile(join(projectRoot, "shell.json"), `${JSON.stringify(input.manifest, null, 2)}\n`, "utf8"),
      writeFile(join(projectRoot, "package.json"), `${JSON.stringify({
        name: input.manifest.executableName,
        version: input.manifest.version,
        private: true,
        description: `${input.manifest.productName} Electron Shell`,
        author: input.manifest.publisher,
        main: "main.cjs",
      }, null, 2)}\n`, "utf8"),
    ]);
    if (windowsNsisIncludePath != null) {
      await writeElectronWindowsNsisInclude({
        identity: resolveElectronWindowsInstallIdentity({ manifest: input.manifest, policy: windowsLifecycle }),
        path: windowsNsisIncludePath,
      });
    }
    built = await electronBuild({
      projectDir: projectRoot,
      targets,
      config: {
        ...resolveElectronDistributionConfiguration({
          manifest: input.manifest,
          policy,
          electronVersion: electronPackage.version,
          outputRoot: input.outputRoot,
          windowsLifecycle,
          windowsNsisIncludePath,
        }),
        ...(iconPath == null ? {} : { icon: iconPath }),
        extraResources: [...input.scene.authorityResources, ...additionalResources].map((resource) => ({
          from: resource.path,
          to: resource.name,
        })),
      },
    });
  } finally {
    await rm(scratchRoot, { force: true, recursive: true });
  }
  const appPath = platform === "mac"
    ? join(input.outputRoot, `mac-${process.arch}`, `${input.manifest.executableName}.app`)
    : join(input.outputRoot, "win-unpacked", `${input.manifest.executableName}.exe`);
  await access(appPath);

  const artifacts = [resolve(appPath), ...built.map((path) => resolve(path))];
  const receipt = { schemaVersion: 1 as const, platform, outputRoot: input.outputRoot, artifacts };
  await writeFile(join(input.outputRoot, "distribution-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}
