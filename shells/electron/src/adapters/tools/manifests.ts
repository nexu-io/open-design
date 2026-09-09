import { readFile } from "node:fs/promises";

import { validateElectronShellManifest, type ElectronShellManifest } from "@open-design/electron-kit/contracts";
import { createElectronReleaseManifest, type ElectronReleaseIdentityRegistry, type ElectronReleaseManifestRequest } from "../../composition/release-identity.ts";

async function baseManifest(): Promise<ElectronShellManifest> {
  return validateElectronShellManifest(JSON.parse(await readFile(new URL("../../../config/shell.json", import.meta.url), "utf8")) as ElectronShellManifest);
}

export async function resolveElectronSceneManifest(): Promise<ElectronShellManifest> {
  return baseManifest();
}

export async function resolveElectronReleaseManifest(request: ElectronReleaseManifestRequest): Promise<ElectronShellManifest> {
  const registry = JSON.parse(await readFile(new URL("../../../config/release-identities.json", import.meta.url), "utf8")) as ElectronReleaseIdentityRegistry;
  return createElectronReleaseManifest(await baseManifest(), registry, request);
}
