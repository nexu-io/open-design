import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { build as bundle } from "esbuild";

import { validateElectronShellManifest, type ElectronShellManifest } from "../boundary/index.js";
import { validateElectronRuntimeWarmupTopology, type ElectronWarmupTopology } from "../warmup/index.js";
import type { ElectronSceneReceipt } from "./contracts.js";

export type AssembleElectronSceneInput = Readonly<{
  entryPath: string;
  manifestPath: string;
  outputRoot: string;
  fixtureSidecarPath: string;
  nodeCarrierLockPath: string;
  warmupPath: string;
}>;

export async function assembleElectronScene(input: AssembleElectronSceneInput): Promise<ElectronSceneReceipt> {
  const manifest = validateElectronShellManifest(JSON.parse(await readFile(input.manifestPath, "utf8")) as ElectronShellManifest);
  validateElectronRuntimeWarmupTopology(
    JSON.parse(await readFile(input.warmupPath, "utf8")) as ElectronWarmupTopology,
  );
  const nodeCarrierLock = JSON.parse(await readFile(input.nodeCarrierLockPath, "utf8")) as {
    schemaVersion?: number;
    targets?: unknown;
    version?: unknown;
  };
  if (nodeCarrierLock.schemaVersion !== 1 || typeof nodeCarrierLock.version !== "string" || nodeCarrierLock.targets == null) {
    throw new Error("invalid official Node carrier lock");
  }

  await rm(input.outputRoot, { force: true, recursive: true });
  await mkdir(input.outputRoot, { recursive: true });
  const mainPath = join(input.outputRoot, "main.cjs");
  const sidecarPath = join(input.outputRoot, "fixture-sidecar.cjs");
  const nodeCarrierLockPath = join(input.outputRoot, "node-lock.json");
  const warmupPath = join(input.outputRoot, "warmup.json");
  await bundle({
    bundle: true,
    entryPoints: [input.entryPath],
    external: ["electron"],
    format: "cjs",
    outfile: mainPath,
    platform: "node",
    target: "node24",
  });
  await copyFile(input.fixtureSidecarPath, sidecarPath);
  await copyFile(input.nodeCarrierLockPath, nodeCarrierLockPath);
  await copyFile(input.warmupPath, warmupPath);

  const packagedManifestPath = join(input.outputRoot, "electron-shell.json");
  await writeFile(packagedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(input.outputRoot, "package.json"), `${JSON.stringify({
    name: manifest.executableName,
    version: manifest.version,
    private: true,
    description: `${manifest.productName} Electron Shell`,
    author: "Open Design",
    main: "main.cjs",
  }, null, 2)}\n`, "utf8");

  const receipt = {
    schemaVersion: 1 as const,
    sceneRoot: input.outputRoot,
    mainPath,
    manifestPath: packagedManifestPath,
    nodeCarrierLockPath,
    sidecarPath,
    warmupPath,
  };
  await writeFile(join(input.outputRoot, "scene-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}
