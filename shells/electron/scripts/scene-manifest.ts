import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateElectronShellManifest, type ElectronShellManifest } from "@open-design/electron-kit/contracts";

import { createElectronSceneManifest } from "../src/composition/release-identity.ts";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value == null || value.startsWith("--")) throw new Error(`${name} is required`);
  return resolve(value);
}

const request = JSON.parse(await readFile(argument("--request"), "utf8")) as Record<string, unknown>;
if (JSON.stringify(Object.keys(request).sort()) !== JSON.stringify(["buildHash", "manifestFile", "operation", "schemaVersion"])) {
  throw new Error("Electron scene manifest request fields are invalid");
}
if (request.schemaVersion !== 1 || request.operation !== "electron.scene-manifest.resolve"
  || typeof request.buildHash !== "string" || typeof request.manifestFile !== "string"
  || !isAbsolute(request.manifestFile) || resolve(request.manifestFile) !== request.manifestFile) {
  throw new Error("Electron scene manifest request is invalid");
}
const basePath = fileURLToPath(new URL("../config/shell.json", import.meta.url));
const base = validateElectronShellManifest(JSON.parse(await readFile(basePath, "utf8")) as ElectronShellManifest);
const manifest = createElectronSceneManifest(base, request.buildHash);
await mkdir(dirname(request.manifestFile), { recursive: true });
await writeFile(request.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const receiptPath = argument("--receipt");
await mkdir(dirname(receiptPath), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify({ schemaVersion: 1, operation: "electron.scene-manifest", manifestFile: request.manifestFile, shell: manifest.shell }, null, 2)}\n`, "utf8");
