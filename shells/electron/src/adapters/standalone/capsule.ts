import { join } from "node:path";
import { materializeStandaloneBlob } from "@open-design/standalone";
import { createElectronCapsuleLoader } from "@open-design/electron-kit/runtime";
import type { ElectronShellManifest } from "@open-design/electron-kit/contracts";
import { loadElectronInstalledCapsuleSeed, resolveElectronStandaloneTarget } from "./installation.js";

const load = createElectronCapsuleLoader();

/** Fixed accepted baseline startup. Online selection must supply a coherent
 * verified release binding; it must never replace this with a Capsule latest. */
export async function loadInstalledElectronCapsule(manifest: ElectronShellManifest, installation: Readonly<{
  resourceRoot: string;
  runtimeRoot: string;
}>) {
  const target = resolveElectronStandaloneTarget();
  const seed = await loadElectronInstalledCapsuleSeed({ resourceRoot: installation.resourceRoot,
    channel: manifest.channel, target, carrierVersion: manifest.shell.version });
  const capsule = seed.envelope.document;
  if (capsule.provides.shellVersion !== manifest.shell.version) throw new Error("Electron baseline Capsule differs from its installed Shell capability");
  const materialized = await materializeStandaloneBlob(join(installation.runtimeRoot, "capsule"),
    { ...capsule.archive, mediaType: "application/zip", sources: [] }, seed.archivePath,
    { type: "zip", entrypoint: capsule.entrypoint, treeSha256: capsule.archive.treeSha256 });
  return await load({ envelope: seed.envelope, trustedKeys: seed.trustedKeys, root: materialized.path,
    carrier: { target, version: manifest.shell.version } });
}
