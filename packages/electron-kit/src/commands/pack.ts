import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { validateElectronShellManifest, type ElectronShellManifest } from "../contracts/index.js";
import { assembleElectronScene, buildElectronDistribution, type ElectronDistributionReceipt } from "../distribution/index.js";
import { validateElectronDistributionPolicy, type ElectronDistributionPolicy } from "../distribution/distribution-policy.js";
import { validateElectronWindowsLifecyclePolicy, type ElectronWindowsLifecyclePolicy } from "../platform/windows/index.js";

export async function packElectronShell(input: Readonly<{
  authorityResources: readonly Readonly<{ name: string; path: string }>[];
  entryPath: string;
  manifest: ElectronShellManifest;
  distributionPath: string;
  runtimeConfigPath: string;
  windowsLifecyclePath: string;
  outputRoot: string;
  projectRoot: string;
  rendererPreloadEntryPath: string;
}>): Promise<ElectronDistributionReceipt> {
  const manifest = validateElectronShellManifest(input.manifest);
  const policy = validateElectronDistributionPolicy(
    JSON.parse(await readFile(input.distributionPath, "utf8")) as ElectronDistributionPolicy,
  );
  const windowsLifecycle = validateElectronWindowsLifecyclePolicy(
    JSON.parse(await readFile(input.windowsLifecyclePath, "utf8")) as ElectronWindowsLifecyclePolicy,
  );
  const scene = await assembleElectronScene({
    authorityResources: input.authorityResources,
    entryPath: input.entryPath,
    manifest,
    outputRoot: join(input.projectRoot, ".tmp", "electron-kit", manifest.namespace, "scene"),
    rendererPreloadEntryPath: input.rendererPreloadEntryPath,
    runtimeConfigPath: input.runtimeConfigPath,
  });
  return await buildElectronDistribution({ scene, manifest, policy, windowsLifecycle, outputRoot: input.outputRoot });
}
