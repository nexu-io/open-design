import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assembleElectronScene } from "@open-design/electron-kit/distribution";

import { buildElectronStandaloneAuthority } from "./build-authority.mjs";

type Request = Readonly<{
  schemaVersion: 1;
  operation: "electron.scene.build";
  target: "darwin-arm64" | "darwin-x64" | "win32-x64";
  shellManifestFile: string;
  closureArtifactFile: string;
  standaloneLauncherFile: string;
  sceneDirectory: string;
}>;

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value == null || value.startsWith("--")) throw new Error(`${name} is required`);
  return resolve(value);
}

function request(value: unknown): Request {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("Electron exact scene request is invalid");
  const input = value as Record<string, unknown>;
  const expected = ["closureArtifactFile", "operation", "sceneDirectory", "schemaVersion", "shellManifestFile", "standaloneLauncherFile", "target"];
  if (JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(expected)) throw new Error("Electron exact scene request fields are invalid");
  if (input.schemaVersion !== 1 || input.operation !== "electron.scene.build" || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(input.target as string)) {
    throw new Error("Electron exact scene request identity is invalid");
  }
  for (const field of ["shellManifestFile", "closureArtifactFile", "standaloneLauncherFile", "sceneDirectory"] as const) {
    if (typeof input[field] !== "string" || resolve(input[field]) !== input[field]) throw new Error(`Electron exact scene ${field} must be absolute and normalized`);
  }
  return Object.freeze(input) as Request;
}

const requestPath = argument("--request");
const receiptPath = argument("--receipt");
const input = request(JSON.parse(await readFile(requestPath, "utf8")));
const authority = await buildElectronStandaloneAuthority(resolve(dirname(input.sceneDirectory), "electron-authority-build"));
const receipt = await assembleElectronScene({
  authorityResources: [
    authority.host,
    authority.supervisor,
    { name: "closure.mjs", path: input.closureArtifactFile },
    { name: "standalone-launcher.mjs", path: input.standaloneLauncherFile },
  ],
  entryPath: fileURLToPath(new URL("../src/main.ts", import.meta.url)),
  manifestPath: input.shellManifestFile,
  nodeCarrierLockPath: fileURLToPath(new URL("../config/carriers/node-lock.json", import.meta.url)),
  outputRoot: input.sceneDirectory,
  rendererPreloadEntryPath: fileURLToPath(new URL("../src/adapters/renderer/preload.ts", import.meta.url)),
  runtimeConfigPath: fileURLToPath(new URL("../config/runtime.json", import.meta.url)),
  standaloneBinding: {
    target: input.target,
    closureResourceName: "closure.mjs",
    launcherResourceName: "standalone-launcher.mjs",
  },
});
const sceneBytes = await readFile(receipt.sceneManifestPath);
await mkdir(dirname(receiptPath), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify({
  schemaVersion: 1,
  operation: "electron.scene.build",
  target: input.target,
  sceneDirectory: receipt.sceneRoot,
  sceneManifestSha256: createHash("sha256").update(sceneBytes).digest("hex"),
}, null, 2)}\n`, "utf8");
