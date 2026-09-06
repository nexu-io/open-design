import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateElectronShellManifest, type ElectronShellManifest } from "@open-design/electron-kit/contracts";

import { createElectronReleaseManifest, type ElectronReleaseIdentityRegistry } from "../src/composition/release-identity.ts";

type Request = Readonly<{
  schemaVersion: 1;
  operation: "electron.release-manifest.resolve";
  channel: string;
  releaseVersion: string;
  buildHash: string;
  manifestFile: string;
}>;

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value == null || value.startsWith("--")) throw new Error(`${name} is required`);
  return resolve(value);
}

function parse(value: unknown): Request {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("Electron release manifest request is invalid");
  const request = value as Record<string, unknown>;
  const expected = ["buildHash", "channel", "manifestFile", "operation", "releaseVersion", "schemaVersion"];
  if (JSON.stringify(Object.keys(request).sort()) !== JSON.stringify(expected)) throw new Error("Electron release manifest request fields are invalid");
  if (request.schemaVersion !== 1 || request.operation !== "electron.release-manifest.resolve") throw new Error("Electron release manifest request schema or operation is unsupported");
  if (typeof request.channel !== "string" || typeof request.releaseVersion !== "string" || typeof request.buildHash !== "string"
    || typeof request.manifestFile !== "string" || !isAbsolute(request.manifestFile) || resolve(request.manifestFile) !== request.manifestFile) {
    throw new Error("Electron release manifest request values are invalid");
  }
  return request as Request;
}

const request = parse(JSON.parse(await readFile(argument("--request"), "utf8")));
const baseManifest = validateElectronShellManifest(JSON.parse(await readFile(fileURLToPath(new URL("../config/shell.json", import.meta.url)), "utf8")) as ElectronShellManifest);
const registry = JSON.parse(await readFile(fileURLToPath(new URL("../config/release-identities.json", import.meta.url)), "utf8")) as ElectronReleaseIdentityRegistry;
const manifest = createElectronReleaseManifest(baseManifest, registry, request);
await mkdir(dirname(request.manifestFile), { recursive: true });
await writeFile(request.manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const receipt = argument("--receipt");
await mkdir(dirname(receipt), { recursive: true });
await writeFile(receipt, `${JSON.stringify({
  schemaVersion: 1,
  operation: "electron.release-manifest",
  channel: manifest.channel,
  releaseVersion: manifest.version,
  identity: { appId: manifest.appId, executableName: manifest.executableName, namespace: manifest.namespace, productName: manifest.productName },
  manifestFile: request.manifestFile,
  shell: manifest.shell,
}, null, 2)}\n`, "utf8");
