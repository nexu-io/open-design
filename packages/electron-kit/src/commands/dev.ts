import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import electronPath from "electron";

import { assembleElectronScene } from "../build/index.js";
import { validateElectronShellManifest, type ElectronShellManifest } from "../boundary/index.js";

export function normalizeElectronDevArgv(argv: readonly string[]): string[] {
  const normalized = [...argv];
  while (normalized[0] === "--") normalized.shift();
  return normalized;
}

export async function devElectronShell(input: Readonly<{
  entryPath: string;
  manifestPath: string;
  fixtureSidecarPath: string;
  nodeCarrierLockPath: string;
  argv?: readonly string[];
}>): Promise<number> {
  const manifest = validateElectronShellManifest(JSON.parse(await readFile(input.manifestPath, "utf8")) as ElectronShellManifest);
  const scene = await assembleElectronScene({
    entryPath: input.entryPath,
    manifestPath: input.manifestPath,
    outputRoot: join(dirname(input.manifestPath), ".tmp", "electron-kit", manifest.namespace, "scene"),
    fixtureSidecarPath: input.fixtureSidecarPath,
    nodeCarrierLockPath: input.nodeCarrierLockPath,
  });
  const child = spawn(electronPath as unknown as string, [scene.sceneRoot, ...normalizeElectronDevArgv(input.argv ?? [])], { env: process.env, stdio: "inherit" });
  return await new Promise<number>((resolveCode, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolveCode(exitCode ?? 1));
  });
}
