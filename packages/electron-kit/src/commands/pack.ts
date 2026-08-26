import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { validateElectronShellManifest, type ElectronShellManifest } from "../contracts/index.js";
import { assembleElectronScene, buildElectronDistribution, type ElectronDistributionReceipt } from "../distribution/index.js";
import { validateElectronDistributionPolicy, type ElectronDistributionPolicy } from "../distribution/distribution-policy.js";
import { validateElectronWindowsLifecyclePolicy, type ElectronWindowsLifecyclePolicy } from "../platform/windows/index.js";

export async function packElectronShell(input: Readonly<{
  entryPath: string;
  manifestPath: string;
  fixtureSidecarPath: string;
  nodeCarrierLockPath: string;
  distributionPath: string;
  runtimeConfigPath: string;
  windowsLifecyclePath: string;
  outputRoot: string;
  projectRoot: string;
}>): Promise<ElectronDistributionReceipt> {
  const manifest = validateElectronShellManifest(JSON.parse(await readFile(input.manifestPath, "utf8")) as ElectronShellManifest);
  const policy = validateElectronDistributionPolicy(
    JSON.parse(await readFile(input.distributionPath, "utf8")) as ElectronDistributionPolicy,
  );
  const windowsLifecycle = validateElectronWindowsLifecyclePolicy(
    JSON.parse(await readFile(input.windowsLifecyclePath, "utf8")) as ElectronWindowsLifecyclePolicy,
  );
  const scene = await assembleElectronScene({
    entryPath: input.entryPath,
    manifestPath: input.manifestPath,
    outputRoot: join(input.projectRoot, ".tmp", "electron-kit", manifest.namespace, "scene"),
    fixtureSidecarPath: input.fixtureSidecarPath,
    nodeCarrierLockPath: input.nodeCarrierLockPath,
    runtimeConfigPath: input.runtimeConfigPath,
  });
  return await buildElectronDistribution({ scene, manifest, policy, windowsLifecycle, outputRoot: input.outputRoot });
}
