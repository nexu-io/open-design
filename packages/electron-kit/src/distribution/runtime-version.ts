import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readPackageResourceText } from "../lib/resources.js";

/** The pinned host contract is authoritative even in a portable build closure
 * without an installed Electron binary. Never infer a version from the runner. */
export function electronRuntimeVersion(manifest: { peerDependencies?: { electron?: unknown }; devDependencies?: { electron?: unknown } }): string {
  const version = manifest.peerDependencies?.electron;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/u.test(version)
    || manifest.devDependencies?.electron !== version) throw new Error("Electron runtime contract must have matching exact peer and development versions");
  return version;
}

export async function readElectronRuntimeVersion() {
  return electronRuntimeVersion(JSON.parse(await readPackageResourceText({ packageName: "@open-design/electron-kit",
    resourcePath: "package.json", startDirectory: dirname(fileURLToPath(import.meta.url)) })));
}
