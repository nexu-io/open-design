import { access, copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { Arch, build as electronBuild, Platform, type Configuration } from "electron-builder";

import { validateElectronShellManifest, type ElectronShellManifest } from "../contracts/index.js";
import {
  resolveElectronWindowsInstallIdentity,
  validateElectronWindowsLifecyclePolicy,
  type ElectronWindowsLifecyclePolicy,
} from "../platform/windows/index.js";
import { writeElectronWindowsNsisInclude } from "../platform/windows/installer/nsis-include.js";
import type { ElectronDistributionReceipt, ElectronSceneReceipt } from "./contracts.js";
import { loadElectronScene } from "./scene.js";
import { verifyElectronDistributionBase, type ElectronDistributionBase } from "./base.js";
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
  base?: ElectronDistributionBase;
  /** Complete installation projection; scene build inputs are never implicit payloads. */
  resources: readonly Readonly<{ name: string; path: string }>[];
}>;

/** Distribution consumes only the caller's explicit, flat installation projection. */
export async function resolveElectronDistributionResourceFiles(resources: BuildElectronDistributionInput["resources"]) {
  const names = new Set<string>();
  for (const resource of resources) {
    if (!/^[a-z][a-z0-9.-]{0,127}$/u.test(resource.name) || names.has(resource.name)) throw new Error(`invalid or duplicate Electron distribution resource: ${resource.name}`);
    names.add(resource.name);
    if (resolve(resource.path) !== resource.path) throw new Error("Electron distribution resource path must be absolute and normalized");
    const info = await lstat(resource.path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Electron distribution resource must be a regular file");
  }
  return resources.map(resource => ({ from: resource.path, to: resource.name }));
}

/** Native assembly owns signing. Prepackaged targets only wrap its unchanged
 * result; they must never receive a base modified after its signing boundary. */
export async function buildElectronDistributionStages(input: Readonly<{
  projectDir: string; appPath: string; platform: "mac" | "win"; arch: Arch;
  targets: readonly string[]; config: Configuration;
}>) {
  const platform = input.platform === "mac" ? Platform.MAC : Platform.WINDOWS;
  // electron-builder mutates declarative file sets while normalizing them.
  // Each stage must start from the original recipe, not the previous mutation.
  const assemblyConfig = structuredClone(input.config), wrapperConfig = structuredClone(input.config);
  await electronBuild({ projectDir: input.projectDir,
    targets: platform.createTarget(["dir"], input.arch), config: assemblyConfig });
  await access(input.appPath);
  return electronBuild({ projectDir: input.projectDir,
    prepackaged: input.platform === "mac" ? input.appPath : dirname(input.appPath),
    targets: platform.createTarget(input.targets.filter(target => target !== "dir"), input.arch),
    config: wrapperConfig });
}

export async function buildElectronDistribution(input: BuildElectronDistributionInput): Promise<ElectronDistributionReceipt> {
  const scene = await loadElectronScene(input.scene.sceneRoot, input.scene.sceneManifestSha256);
  const manifest = validateElectronShellManifest(input.manifest);
  const policy = validateElectronDistributionPolicy(input.policy);
  const windowsLifecycle = validateElectronWindowsLifecyclePolicy(input.windowsLifecycle);
  const resourceFiles = await resolveElectronDistributionResourceFiles(input.resources);
  const platform: ElectronDistributionReceipt["platform"] = resolveElectronDistributionPlatform(process.platform);
  if (input.base != null) {
    const distance = relative(resolve(input.outputRoot), resolve(input.base.root));
    if (distance === "" || (!isAbsolute(distance) && distance !== ".." && !distance.startsWith("../"))) throw new Error("Electron base overlaps distribution output");
  }
  await rm(input.outputRoot, { force: true, recursive: true });
  await mkdir(input.outputRoot, { recursive: true });
  const arch = platform === "win" ? Arch.x64 : process.arch === "arm64" ? Arch.arm64 : Arch.x64;
  const appPath = platform === "mac"
    ? join(input.outputRoot, `mac-${process.arch}`, `${input.manifest.executableName}.app`)
    : join(input.outputRoot, "win-unpacked", `${input.manifest.executableName}.exe`);
  const require = createRequire(import.meta.url);
  const electronPackage = JSON.parse(await readFile(require.resolve("electron/package.json"), "utf8")) as { version: string };
  const base = input.base == null ? undefined : await verifyElectronDistributionBase(input.base, {
    scene, electronVersion: electronPackage.version, target: `${process.platform}-${process.arch}`,
  });
  const scratchRoot = await mkdtemp(join(tmpdir(), "electron-kit-distribution-"));
  const projectRoot = join(scratchRoot, "project");
  const windowsNsisIncludePath = platform === "win" ? join(scratchRoot, "installer.nsh") : undefined;
  let built: string[];
  try {
    await mkdir(projectRoot, { recursive: true });
    const iconPath = manifest.iconDataUrl == null ? undefined : join(scratchRoot, "icon.png");
    if (iconPath != null) await writeFile(iconPath, Buffer.from(manifest.iconDataUrl!.slice("data:image/png;base64,".length), "base64"));
    await Promise.all([
      copyFile(base == null ? scene.mainPath : join(base.carrierDirectory, "main.cjs"), join(projectRoot, "main.cjs")),
      copyFile(base == null ? scene.rendererPreloadPath : join(base.carrierDirectory, "renderer-mount-preload.cjs"), join(projectRoot, "renderer-mount-preload.cjs")),
      copyFile(base == null ? scene.carrierConfigPath : join(base.carrierDirectory, "carrier.json"), join(projectRoot, "carrier.json")),
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
    built = await buildElectronDistributionStages({
      projectDir: projectRoot,
      appPath, platform, arch,
      targets: platform === "mac" ? policy.mac.targets : policy.windows.targets,
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
        extraResources: resourceFiles,
        ...(base == null ? {} : { electronDist: base.runtimeDirectory }),
      },
    });
  } finally {
    await rm(scratchRoot, { force: true, recursive: true });
  }
  await access(appPath);

  const artifacts = [resolve(appPath), ...built.map((path) => resolve(path))];
  const receipt = { schemaVersion: 1 as const, platform, outputRoot: input.outputRoot, artifacts };
  await writeFile(join(input.outputRoot, "distribution-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}
