import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { build as bundle } from "esbuild";

import { validateElectronShellManifest, type ElectronShellManifest } from "../contracts/index.js";
import { validateElectronRuntimeConfig, type ElectronRuntimeConfig } from "../runtime/startup/config.js";
import type { ElectronSceneReceipt } from "./contracts.js";

export type AssembleElectronSceneInput = Readonly<{
  authorityResources: readonly Readonly<{ name: string; path: string }>[];
  entryPath: string;
  manifestPath: string;
  outputRoot: string;
  rendererPreloadEntryPath: string;
  nodeCarrierLockPath: string;
  runtimeConfigPath: string;
  standaloneBinding?: Readonly<{
    target: string;
    closureResourceName: string;
    launcherResourceName: string;
  }>;
}>;

const sceneResourceName = /^[a-z][a-z0-9.-]{0,127}$/u;
const reservedSceneProducts = new Set([
  "main.cjs",
  "node-lock.json",
  "package.json",
  "renderer-mount-preload.cjs",
  "runtime.json",
  "scene.json",
  "shell.json",
]);

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
  const authorityResourceNames = new Set<string>();
  for (const resource of input.authorityResources) {
    if (!sceneResourceName.test(resource.name) || reservedSceneProducts.has(resource.name) || authorityResourceNames.has(resource.name)) {
      throw new Error(`invalid or duplicate Electron authority resource name: ${resource.name}`);
    }
    authorityResourceNames.add(resource.name);
  }
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
  await Promise.all(input.authorityResources.map(async (resource) => {
    await copyFile(resource.path, join(input.outputRoot, resource.name));
  }));
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
  const productNames = [
    "main.cjs",
    "node-lock.json",
    "renderer-mount-preload.cjs",
    "runtime.json",
    "shell.json",
    "package.json",
    ...authorityResourceNames,
  ].sort();
  const products = await Promise.all(productNames.map((name) => describeSceneProduct(input.outputRoot, name)));
  const authorityResources = products.filter(({ name }) => authorityResourceNames.has(name)).map((resource) => Object.freeze({
    ...resource,
    path: join(input.outputRoot, resource.name),
  }));
  let standaloneBinding: Readonly<Record<string, unknown>> = Object.freeze({});
  if (input.standaloneBinding != null) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.standaloneBinding.target)) throw new Error("invalid Electron Standalone scene target");
    const closure = products.find(({ name }) => name === input.standaloneBinding!.closureResourceName);
    const launcher = products.find(({ name }) => name === input.standaloneBinding!.launcherResourceName);
    if (closure == null || launcher == null || !authorityResourceNames.has(closure.name) || !authorityResourceNames.has(launcher.name)) {
      throw new Error("Electron Standalone scene binding must select exact authority resources");
    }
    standaloneBinding = Object.freeze({
      target: input.standaloneBinding.target,
      shellVersion: manifest.shell.version,
      shellBuildHash: manifest.shell.buildHash,
      closure: Object.freeze({ file: closure.name, sha256: closure.sha256, size: closure.size }),
      standalone: Object.freeze({ entrypoint: launcher.name, sha256: launcher.sha256, size: launcher.size }),
    });
  }
  await writeFile(sceneManifestPath, `${JSON.stringify({
    schemaVersion: 1,
    operation: "electron.scene.build",
    ...standaloneBinding,
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
    authorityResources: Object.freeze(authorityResources),
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}
