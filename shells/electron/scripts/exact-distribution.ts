import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateElectronShellManifest, type ElectronShellManifest } from "@open-design/electron-kit/contracts";
import { buildElectronDistribution, loadElectronScene } from "@open-design/electron-kit/distribution";
import { canonicalJson } from "@open-design/standalone";

import { loadElectronStandaloneInstallation } from "../src/adapters/standalone/installation.ts";
import { parseElectronExactDistributionRequest } from "./exact-adapter-contract.ts";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value == null || value.startsWith("--")) throw new Error(`${name} is required`);
  return resolve(value);
}

async function descriptor(path: string, file = basename(path)) {
  const bytes = await readFile(path);
  return Object.freeze({ file, sha256: createHash("sha256").update(bytes).digest("hex"), size: (await stat(path)).size });
}

const requestPath = argument("--request");
const receiptPath = argument("--receipt");
const input = parseElectronExactDistributionRequest(JSON.parse(await readFile(requestPath, "utf8")));
const currentTarget = process.platform === "win32" ? `win32-${process.arch}` : `${process.platform}-${process.arch}`;
if (currentTarget !== input.target) throw new Error(`Electron exact distribution target ${input.target} cannot build on ${currentTarget}`);
const scene = await loadElectronScene(input.sceneDirectory, input.sceneManifestSha256);
const sceneManifest = JSON.parse(await readFile(scene.sceneManifestPath, "utf8")) as {
  target?: unknown;
  closure?: { file?: unknown; sha256?: unknown };
  standalone?: { entrypoint?: unknown; sha256?: unknown };
};
if (sceneManifest.target !== input.target || typeof sceneManifest.closure?.file !== "string" || typeof sceneManifest.standalone?.entrypoint !== "string") {
  throw new Error("Electron exact distribution differs from its scene target or seeds");
}
const manifest = validateElectronShellManifest(JSON.parse(await readFile(scene.shellManifestPath, "utf8")) as ElectronShellManifest);
const contentEnvelope = JSON.parse(await readFile(input.contentMetadataFile, "utf8")) as { metadata?: { channel?: unknown; releaseVersion?: unknown } };
if (contentEnvelope.metadata?.channel !== manifest.channel || typeof contentEnvelope.metadata.releaseVersion !== "string") {
  throw new Error("Electron exact content differs from its Shell channel identity");
}

const stagingRoot = resolve(dirname(input.outputDirectory), `electron-installed-${input.target}`);
await rm(stagingRoot, { force: true, recursive: true });
await mkdir(stagingRoot, { recursive: true });
const contentPath = join(stagingRoot, "standalone-content.json");
const trustPath = join(stagingRoot, "standalone-trust.json");
await Promise.all([copyFile(input.contentMetadataFile, contentPath), copyFile(input.trustFile, trustPath)]);
const byName = new Map(scene.authorityResources.map((resource) => [resource.name, resource]));
const required = (name: string) => {
  const resource = byName.get(name);
  if (resource == null) throw new Error(`Electron scene lacks installed authority resource ${name}`);
  return resource;
};
const host = required("standalone-host.mjs");
const supervisor = required("supervisor.mjs");
const closure = required(sceneManifest.closure.file);
const launcher = required(sceneManifest.standalone.entrypoint);
for (const resource of [host, supervisor, closure, launcher]) await copyFile(resource.path, join(stagingRoot, resource.name));
const installation = Object.freeze({
  schemaVersion: 1,
  channel: manifest.channel,
  releaseVersion: contentEnvelope.metadata.releaseVersion,
  target: input.target,
  host: await descriptor(host.path, host.name),
  supervisor: await descriptor(supervisor.path, supervisor.name),
  content: await descriptor(contentPath),
  trust: await descriptor(trustPath),
  update: Object.freeze({ channelHeadUrl: input.channelHeadUrl }),
  seeds: Object.freeze([
    Object.freeze({ ...await descriptor(launcher.path, launcher.name), blobSha256: sceneManifest.standalone.sha256 }),
    Object.freeze({ ...await descriptor(closure.path, closure.name), blobSha256: sceneManifest.closure.sha256 }),
  ]),
});
const installationPath = join(stagingRoot, "standalone-installation.json");
await writeFile(installationPath, canonicalJson(installation));
await loadElectronStandaloneInstallation({ resourceRoot: stagingRoot, channel: manifest.channel, target: input.target });

const policy = JSON.parse(await readFile(fileURLToPath(new URL("../config/distribution.json", import.meta.url)), "utf8"));
const windowsLifecycle = JSON.parse(await readFile(fileURLToPath(new URL("../config/platforms/windows.json", import.meta.url)), "utf8"));
const built = await buildElectronDistribution({
  scene,
  manifest,
  policy,
  windowsLifecycle,
  outputRoot: input.outputDirectory,
  additionalResources: [
    { name: "standalone-content.json", path: contentPath },
    { name: "standalone-trust.json", path: trustPath },
    { name: "standalone-installation.json", path: installationPath },
  ],
});
const extension = input.target.startsWith("darwin-") ? ".dmg" : ".exe";
const artifactPath = built.artifacts.find((path) => path.toLowerCase().endsWith(extension));
if (artifactPath == null) throw new Error(`Electron distribution lacks its ${extension} installer artifact`);
const artifact = await descriptor(artifactPath);
await mkdir(dirname(receiptPath), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify({
  schemaVersion: 1,
  operation: "shell.distribution.contribute",
  shell: { type: manifest.shell.type, version: manifest.shell.version, buildHash: manifest.shell.buildHash },
  target: input.target,
  artifact: { ...artifact, mediaType: input.target.startsWith("darwin-") ? "application/x-apple-diskimage" : "application/vnd.microsoft.portable-executable" },
  updater: { protocol: "standalone-shell-updater-v3", handler: "sidecar-v1", interaction: "restart-and-install" },
}, null, 2)}\n`, "utf8");
