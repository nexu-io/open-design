import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { canonicalJson } from "@open-design/standalone";
import type { buildElectronStandaloneAuthority } from "./build.ts";
import { ELECTRON_STANDALONE_INSTALLATION_SCHEMA_VERSION, loadElectronInstalledCapsuleSeed, loadElectronStandaloneInstallation, type ElectronStandaloneTarget } from "./installation.ts";

export type ElectronInstallationInput = Readonly<{
  channel: string;
  releaseVersion: string;
  channelHeadUrl: string;
  contentFile: string;
  trustFile: string;
  capsule: Readonly<{ manifestFile: string; archiveFile: string }>;
}>;

export function parseElectronInstallationInput(value: unknown): ElectronInstallationInput {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("Electron installation input is invalid");
  const input = value as Record<string, unknown>;
  const keys = ["capsule", "channel", "channelHeadUrl", "contentFile", "releaseVersion", "trustFile"];
  if (JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(keys)) throw new Error("Electron installation input fields are invalid");
  if (typeof input.channel !== "string" || typeof input.releaseVersion !== "string" || typeof input.channelHeadUrl !== "string") throw new Error("Electron installation input identity is invalid");
  const url = new URL(input.channelHeadUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error("Electron installation update URL is invalid");
  const path = (value: unknown): string => {
    if (typeof value !== "string" || resolve(value) !== value) throw new Error("Electron installation input paths must be absolute and normalized");
    return value;
  };
  if (input.capsule == null || typeof input.capsule !== "object" || Array.isArray(input.capsule)
    || Object.keys(input.capsule).sort().join(",") !== "archiveFile,manifestFile") throw new Error("Electron installation needs an exact Capsule seed");
  const capsule = input.capsule as Record<string, unknown>;
  return Object.freeze({ channel: input.channel, releaseVersion: input.releaseVersion, channelHeadUrl: url.href,
    capsule: Object.freeze({ manifestFile: path(capsule.manifestFile), archiveFile: path(capsule.archiveFile) }),
    contentFile: path(input.contentFile), trustFile: path(input.trustFile),
  });
}

/** Product installation assembly from local producer inputs, independent of acquisition. */
export async function withElectronInstallation<T>(
  request: Readonly<{ input: ElectronInstallationInput; outputDirectory: string; target: ElectronStandaloneTarget;
    carrierVersion: string;
    authority?: Awaited<ReturnType<typeof buildElectronStandaloneAuthority>>;
  }>,
  consume: (installation: Readonly<{ channel: string; releaseVersion: string; resourceDirectory: string }>) => Promise<T>,
): Promise<T> {
  const input = parseElectronInstallationInput(request.input);
  if (resolve(request.outputDirectory) !== request.outputDirectory) throw new Error("Electron installation output root must be absolute");
  await mkdir(request.outputDirectory, { recursive: true });
  const stage = await mkdtemp(join(request.outputDirectory, "installation-"));
  const descriptor = async (path: string, file = basename(path)) => {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Electron installation input must be a regular file: ${file}`);
    const bytes = await readFile(path);
    return Object.freeze({ file, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.byteLength });
  };
  try {
    const authority = request.authority ?? await (await import("./build.ts")).buildElectronStandaloneAuthority(stage);
    const content = await descriptor(input.contentFile, "standalone-content.json");
    const trust = await descriptor(input.trustFile, "standalone-trust.json");
    const capsule = { manifest: await descriptor(input.capsule.manifestFile, "capsule-manifest.json"),
      archive: await descriptor(input.capsule.archiveFile, "capsule.zip") };
    const installation = {
      schemaVersion: ELECTRON_STANDALONE_INSTALLATION_SCHEMA_VERSION, channel: input.channel, releaseVersion: input.releaseVersion, target: request.target,
      host: await descriptor(authority.host.path), updaterProvider: await descriptor(authority.updaterProvider.path),
      supervisor: await descriptor(authority.supervisor.path), content, trust, capsule,
      update: { channelHeadUrl: input.channelHeadUrl },
    };
    const names = ["standalone-installation.json", installation.host.file, installation.updaterProvider.file, installation.supervisor.file, content.file, trust.file, capsule.manifest.file, capsule.archive.file];
    if (new Set(names).size !== names.length) throw new Error("Electron installation resource names collide");
    // Finish every copy before disposing the unique stage, including failures.
    const copies = await Promise.allSettled([
      ...[authority.host, authority.updaterProvider, authority.supervisor].filter(resource => resource.path !== join(stage, resource.name)).map(resource => copyFile(resource.path, join(stage, resource.name))),
      copyFile(input.contentFile, join(stage, content.file)), copyFile(input.trustFile, join(stage, trust.file)),
      copyFile(input.capsule.manifestFile, join(stage, capsule.manifest.file)), copyFile(input.capsule.archiveFile, join(stage, capsule.archive.file)),
    ]);
    const failure = copies.find(result => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    await writeFile(join(stage, "standalone-installation.json"), canonicalJson(installation), { flag: "wx" });
    await loadElectronStandaloneInstallation({ resourceRoot: stage, channel: input.channel, target: request.target });
    await loadElectronInstalledCapsuleSeed({ resourceRoot: stage, channel: input.channel, target: request.target, carrierVersion: request.carrierVersion });
    return await consume(Object.freeze({ channel: input.channel, releaseVersion: input.releaseVersion, resourceDirectory: stage }));
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
