import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { validateElectronShellManifest, type ElectronShellManifest } from "@open-design/electron-kit/contracts";
import { buildElectronDistribution, loadElectronScene } from "@open-design/electron-kit/distribution";
import { inspectMacElectronAppTrust } from "@open-design/electron-kit/installation";

import { loadElectronStandaloneAuthorityResources } from "../standalone/installation.ts";
import { withElectronInstallation } from "../standalone/assemble-installation.ts";
import { assertElectronDistributionBinding } from "../../composition/release-identity.ts";
import { parseElectronExactDistributionRequest } from "./exact-contract.ts";
import { resolveElectronReleaseManifest } from "./manifests.ts";

async function descriptor(path: string, file = basename(path)) {
  const bytes = await readFile(path);
  return Object.freeze({ file, sha256: createHash("sha256").update(bytes).digest("hex"), size: (await stat(path)).size });
}

export async function executeElectronExactDistribution(input: ReturnType<typeof parseElectronExactDistributionRequest>) {
const currentTarget = process.platform === "win32" ? `win32-${process.arch}` : `${process.platform}-${process.arch}`;
if (currentTarget !== input.target) throw new Error(`Electron exact distribution target ${input.target} cannot build on ${currentTarget}`);
const scene = await loadElectronScene(input.sceneDirectory, input.sceneManifestSha256);
const sceneManifest = JSON.parse(await readFile(scene.sceneManifestPath, "utf8")) as {
  target?: unknown;
};
if (sceneManifest.target !== input.target) {
  throw new Error("Electron exact distribution differs from its scene target");
}
const sceneIdentity = validateElectronShellManifest(JSON.parse(await readFile(scene.shellManifestPath, "utf8")) as ElectronShellManifest);
const manifest = await resolveElectronReleaseManifest({ channel: input.channel, releaseVersion: input.releaseVersion, buildHash: sceneIdentity.shell.buildHash });
const contentEnvelope = JSON.parse(await readFile(input.acceptedContentMetadataFile, "utf8")) as {
  metadata?: { channel?: unknown; releaseVersion?: unknown; resources?: unknown };
};
if (typeof contentEnvelope.metadata?.channel !== "string" || typeof contentEnvelope.metadata.releaseVersion !== "string") {
  throw new Error("Electron exact content identity is incomplete");
}
assertElectronDistributionBinding(sceneIdentity, manifest, {
  channel: contentEnvelope.metadata.channel,
  releaseVersion: contentEnvelope.metadata.releaseVersion,
});

const byName = new Map(scene.authorityResources.map((resource) => [resource.name, resource]));
const required = <Name extends string>(name: Name) => {
  const resource = byName.get(name);
  if (resource == null) throw new Error(`Electron scene lacks installed authority resource ${name}`);
  return Object.freeze({ ...resource, name });
};
const host = required("standalone-host.mjs");
const updaterProvider = required("electron-updater.mjs");
const supervisor = required("supervisor.mjs");
return await withElectronInstallation({
  input: { channel: manifest.channel, releaseVersion: contentEnvelope.metadata.releaseVersion, channelHeadUrl: input.channelHeadUrl,
    contentFile: input.acceptedContentMetadataFile, trustFile: input.acceptedTrustFile,
    capsule: { manifestFile: input.acceptedCapsuleManifestFile, archiveFile: input.acceptedCapsuleArchiveFile } },
  outputDirectory: dirname(input.outputDirectory), target: input.target, carrierVersion: manifest.shell.version, authority: { host, updaterProvider, supervisor },
}, async ({ resourceDirectory }) => {
const policy = JSON.parse(await readFile(fileURLToPath(new URL("../../../config/distribution.json", import.meta.url)), "utf8"));
const windowsLifecycle = JSON.parse(await readFile(fileURLToPath(new URL("../../../config/platforms/windows.json", import.meta.url)), "utf8"));
const built = await buildElectronDistribution({
  scene,
  manifest,
  policy,
  windowsLifecycle,
  outputRoot: input.outputDirectory,
  resources: await loadElectronStandaloneAuthorityResources(resourceDirectory),
});
const extension = input.target.startsWith("darwin-") ? ".dmg" : ".exe";
const artifactPath = built.artifacts.find((path) => path.toLowerCase().endsWith(extension));
if (artifactPath == null) throw new Error(`Electron distribution lacks its ${extension} installer artifact`);
const artifact = await descriptor(artifactPath);
const platformTrust = input.target.startsWith("darwin-") ? await (async () => {
  const appPath = built.artifacts.find((path) => path.toLowerCase().endsWith(".app"));
  if (appPath == null) throw new Error("Electron distribution lacks its signed app bundle");
  let observation = await inspectMacElectronAppTrust({ appPath, mode: "verify-only" });
  const mode = observation.teamIdentifier === "adhoc" ? "verify-only" as const : "formal" as const;
  if (mode === "formal") observation = await inspectMacElectronAppTrust({ appPath, mode });
  if (observation.bundleId !== manifest.appId || observation.executableName !== manifest.executableName
    || observation.productName !== manifest.productName) throw new Error("Electron signed app identity differs from its release manifest");
  return Object.freeze({
    platform: "macos" as const,
    mode,
    designatedRequirement: observation.designatedRequirement,
    teamIdentifier: observation.teamIdentifier,
  });
})() : undefined;
return Object.freeze({
  schemaVersion: 1,
  operation: "shell.distribution.contribute",
  shell: { type: manifest.shell.type, version: manifest.shell.version, buildHash: manifest.shell.buildHash },
  target: input.target,
  installIdentity: {
    appId: manifest.appId,
    executableName: manifest.executableName,
    namespace: manifest.namespace,
    productName: manifest.productName,
  },
  artifact: { ...artifact, mediaType: input.target.startsWith("darwin-") ? "application/x-apple-diskimage" : "application/vnd.microsoft.portable-executable" },
  ...(platformTrust == null ? {} : { platformTrust }),
  updater: { protocol: "standalone-shell-updater-v4", handler: "sidecar-v1", interaction: "restart-and-install" },
});
});
}
