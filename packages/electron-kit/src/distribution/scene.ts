import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { build as bundle } from "esbuild";

import { validateElectronShellManifest, type ElectronShellManifest } from "../contracts/index.js";
import { validateElectronRuntimeConfig, type ElectronRuntimeConfig } from "../runtime/startup/config.js";
import type { ElectronSceneReceipt } from "./contracts.js";

export type AssembleElectronSceneInput = Readonly<{
  entryPath: string;
  manifestPath: string;
  outputRoot: string;
  rendererPreloadEntryPath: string;
  fixtureSidecarPath: string;
  nodeCarrierLockPath: string;
  runtimeConfigPath: string;
}>;

async function describeSceneProduct(root: string, name: string): Promise<Readonly<{
  name: string;
  sha256: string;
  size: number;
}>> {
  const path = join(root, name);
  const bytes = await readFile(path);
  return {
    name,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: (await stat(path)).size,
  };
}

export async function assembleElectronScene(input: AssembleElectronSceneInput): Promise<ElectronSceneReceipt> {
  const manifest = validateElectronShellManifest(JSON.parse(await readFile(input.manifestPath, "utf8")) as ElectronShellManifest);
  const runtimeConfig = validateElectronRuntimeConfig(
    JSON.parse(await readFile(input.runtimeConfigPath, "utf8")) as ElectronRuntimeConfig,
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
  const rendererPreloadPath = join(input.outputRoot, "renderer-mount-preload.cjs");
  const sidecarPath = join(input.outputRoot, "fixture-sidecar.cjs");
  const nodeCarrierLockPath = join(input.outputRoot, "node-lock.json");
  const runtimeConfigPath = join(input.outputRoot, "runtime.json");
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
  await bundle({
    bundle: true,
    entryPoints: [input.rendererPreloadEntryPath],
    external: ["electron"],
    format: "cjs",
    outfile: rendererPreloadPath,
    platform: "node",
    target: "node24",
  });
  await copyFile(input.nodeCarrierLockPath, nodeCarrierLockPath);
  await writeFile(runtimeConfigPath, `${JSON.stringify(runtimeConfig, null, 2)}\n`, "utf8");

  const packagedManifestPath = join(input.outputRoot, "shell.json");
  await writeFile(packagedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(input.outputRoot, "package.json"), `${JSON.stringify({
    name: manifest.executableName,
    version: manifest.version,
    private: true,
    description: `${manifest.productName} Electron Shell`,
    author: manifest.publisher,
    main: "main.cjs",
  }, null, 2)}\n`, "utf8");

  const sceneManifestPath = join(input.outputRoot, "scene.json");
  const products = await Promise.all([
    "main.cjs",
    "fixture-sidecar.cjs",
    "node-lock.json",
    "renderer-mount-preload.cjs",
    "runtime.json",
    "shell.json",
    "package.json",
  ].map((name) => describeSceneProduct(input.outputRoot, name)));
  await writeFile(sceneManifestPath, `${JSON.stringify({
    schemaVersion: 1,
    operation: "electron.scene.build",
    products,
  }, null, 2)}\n`, "utf8");
  const sceneManifestSha256 = createHash("sha256")
    .update(await readFile(sceneManifestPath))
    .digest("hex");
  const receiptPath = join(dirname(input.outputRoot), "scene-receipt.json");
  const receipt = {
    schemaVersion: 1 as const,
    operation: "electron.scene.build" as const,
    sceneRoot: input.outputRoot,
    sceneManifestPath,
    sceneManifestSha256,
    receiptPath,
    mainPath,
    rendererPreloadPath,
    shellManifestPath: packagedManifestPath,
    nodeCarrierLockPath,
    runtimeConfigPath,
    sidecarPath,
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}
