import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import electronPath from "electron";

import { validateElectronShellManifest, type ElectronShellManifest } from "../contracts/index.js";
import { assembleElectronScene } from "../distribution/index.js";
import type { ElectronSceneReceipt } from "../distribution/index.js";

export function normalizeElectronDevArgv(argv: readonly string[]): string[] {
  const normalized = [...argv];
  while (normalized[0] === "--") normalized.shift();
  return normalized;
}

export type PrepareElectronDevShellInput = Readonly<{
  authorityResources: readonly Readonly<{ name: string; path: string }>[];
  entryPath: string;
  manifestPath: string;
  nodeCarrierLockPath: string;
  projectRoot: string;
  rendererPreloadEntryPath: string;
  runtimeConfigPath: string;
  argv?: readonly string[];
}>;

export type ElectronDevShellPreparation = Readonly<{
  electronPath: string;
  manifest: ElectronShellManifest;
  scene: ElectronSceneReceipt;
}>;

/** Assemble a development scene without deciding how its lifecycle is supervised. */
export async function prepareElectronDevShell(input: PrepareElectronDevShellInput): Promise<ElectronDevShellPreparation> {
  const manifest = validateElectronShellManifest(JSON.parse(await readFile(input.manifestPath, "utf8")) as ElectronShellManifest);
  const scene = await assembleElectronScene({
    authorityResources: input.authorityResources,
    entryPath: input.entryPath,
    manifestPath: input.manifestPath,
    outputRoot: join(input.projectRoot, ".tmp", "electron-kit", manifest.namespace, "scene"),
    nodeCarrierLockPath: input.nodeCarrierLockPath,
    rendererPreloadEntryPath: input.rendererPreloadEntryPath,
    runtimeConfigPath: input.runtimeConfigPath,
  });
  return Object.freeze({ electronPath: electronPath as unknown as string, manifest, scene });
}

export async function devElectronShell(input: PrepareElectronDevShellInput): Promise<number> {
  const prepared = await prepareElectronDevShell(input);
  // Native Electron/Chromium switches must precede the app path. Keeping the
  // caller's sequence untouched also means an explicitly repeated Chromium
  // switch retains Electron's own last-value-wins behavior.
  const child = spawn(prepared.electronPath, [...normalizeElectronDevArgv(input.argv ?? []), prepared.scene.sceneRoot], { env: process.env, stdio: "inherit" });
  return await new Promise<number>((resolveCode, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolveCode(exitCode ?? 1));
  });
}
