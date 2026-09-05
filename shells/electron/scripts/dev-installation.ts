import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "@open-design/standalone";

import { loadElectronStandaloneInstallation, type ElectronStandaloneTarget } from "../src/adapters/standalone/installation.ts";
import { buildElectronStandaloneAuthority } from "./build-authority.ts";

export const ELECTRON_DEV_INSTALLATION_SCHEMA_VERSION = 1 as const;

export type ElectronDevInstallationRequest = Readonly<{
  bootstrapUrl: string;
  operation: "electron.dev.installation.materialize";
  outputDirectory: string;
  schemaVersion: typeof ELECTRON_DEV_INSTALLATION_SCHEMA_VERSION;
  target: ElectronStandaloneTarget;
}>;

export type ElectronDevInstallationReceipt = Readonly<{
  channel: string;
  installationSha256: string;
  operation: "electron.dev.installation.materialize";
  releaseVersion: string;
  resourceDirectory: string;
  schemaVersion: typeof ELECTRON_DEV_INSTALLATION_SCHEMA_VERSION;
  target: ElectronStandaloneTarget;
}>;

type RemoteFile = Readonly<{ file: string; sha256: string; size: number; url: string }>;
type RemoteSeed = Readonly<RemoteFile & { blobSha256: string; component: "standalone.launcher" | "standalone.resource" }>;
type Bootstrap = Readonly<{
  channel: string;
  channelHeadUrl: string;
  content: RemoteFile;
  releaseVersion: string;
  schemaVersion: 1;
  seeds: readonly RemoteSeed[];
  trust: RemoteFile;
}>;

const digestPattern = /^[a-f0-9]{64}$/u;
const safeFlatFilePattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const targetPattern = new Set<ElectronStandaloneTarget>(["darwin-arm64", "darwin-x64", "win32-x64"]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} fields are invalid`);
}

function localHttpUrl(value: unknown, origin: string | null, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} URL is invalid`);
  const url = new URL(value);
  if (url.protocol !== "http:" || (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") || url.username !== "" || url.password !== "" || url.hash !== "") {
    throw new Error(`${label} must use an unauthenticated loopback HTTP URL`);
  }
  if (origin != null && url.origin !== origin) throw new Error(`${label} escaped the bootstrap origin`);
  return url.href;
}

function remoteFile(value: unknown, origin: string, expectedFile: string | null, label: string): RemoteFile {
  const input = record(value, label);
  exactKeys(input, ["file", "sha256", "size", "url"], label);
  if (typeof input.file !== "string" || !safeFlatFilePattern.test(input.file)
    || basename(input.file) !== input.file || (expectedFile != null && input.file !== expectedFile)) {
    throw new Error(`${label} file is invalid`);
  }
  if (typeof input.sha256 !== "string" || !digestPattern.test(input.sha256)) throw new Error(`${label} digest is invalid`);
  if (!Number.isSafeInteger(input.size) || (input.size as number) < 1) throw new Error(`${label} size is invalid`);
  return Object.freeze({ file: input.file, sha256: input.sha256, size: input.size as number, url: localHttpUrl(input.url, origin, label) });
}

function parseBootstrap(value: unknown, bootstrapUrl: string): Bootstrap {
  const input = record(value, "Electron dev bootstrap");
  exactKeys(input, ["channel", "channelHeadUrl", "content", "releaseVersion", "schemaVersion", "seeds", "trust"], "Electron dev bootstrap");
  if (input.schemaVersion !== 1 || typeof input.channel !== "string" || typeof input.releaseVersion !== "string") throw new Error("Electron dev bootstrap identity is invalid");
  const origin = new URL(bootstrapUrl).origin;
  if (!Array.isArray(input.seeds) || input.seeds.length === 0) throw new Error("Electron dev bootstrap seeds are invalid");
  const files = new Set<string>();
  const digests = new Set<string>();
  let launchers = 0;
  const seeds = input.seeds.map((value, index) => {
    const seed = record(value, `Electron dev seed ${index}`);
    exactKeys(seed, ["blobSha256", "component", "file", "sha256", "size", "url"], `Electron dev seed ${index}`);
    const file = remoteFile({ file: seed.file, sha256: seed.sha256, size: seed.size, url: seed.url }, origin, null, `Electron dev seed ${index}`);
    if ((seed.component !== "standalone.launcher" && seed.component !== "standalone.resource")
      || seed.blobSha256 !== file.sha256 || files.has(file.file) || digests.has(file.sha256)) {
      throw new Error(`Electron dev seed ${index} binding is invalid`);
    }
    files.add(file.file);
    digests.add(file.sha256);
    if (seed.component === "standalone.launcher") launchers += 1;
    return Object.freeze({ ...file, blobSha256: file.sha256, component: seed.component });
  });
  if (launchers !== 1) throw new Error("Electron dev bootstrap must bind exactly one launcher seed");
  return Object.freeze({
    schemaVersion: 1,
    channel: input.channel,
    releaseVersion: input.releaseVersion,
    channelHeadUrl: localHttpUrl(input.channelHeadUrl, origin, "Electron dev channel head"),
    content: remoteFile(input.content, origin, "standalone-content.json", "Electron dev content"),
    trust: remoteFile(input.trust, origin, "standalone-trust.json", "Electron dev trust"),
    seeds: Object.freeze(seeds),
  });
}

async function download(file: RemoteFile, root: string): Promise<void> {
  const response = await fetch(file.url);
  if (!response.ok || response.url !== file.url) throw new Error(`Electron dev resource acquisition failed: ${file.file}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength !== file.size || createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
    throw new Error(`Electron dev resource binding failed: ${file.file}`);
  }
  await writeFile(join(root, file.file), bytes, { flag: "wx" });
}

async function descriptor(path: string, file = basename(path)) {
  const details = await lstat(path);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error(`Electron dev installed resource is not a regular file: ${file}`);
  const bytes = await readFile(path);
  return Object.freeze({ file, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.byteLength });
}

export function parseElectronDevInstallationRequest(value: unknown): ElectronDevInstallationRequest {
  const input = record(value, "Electron dev installation request");
  exactKeys(input, ["bootstrapUrl", "operation", "outputDirectory", "schemaVersion", "target"], "Electron dev installation request");
  if (input.schemaVersion !== ELECTRON_DEV_INSTALLATION_SCHEMA_VERSION || input.operation !== "electron.dev.installation.materialize") {
    throw new Error("Electron dev installation request identity is invalid");
  }
  if (typeof input.outputDirectory !== "string" || resolve(input.outputDirectory) !== input.outputDirectory) throw new Error("Electron dev outputDirectory must be absolute and normalized");
  if (!targetPattern.has(input.target as ElectronStandaloneTarget)) throw new Error("Electron dev target is invalid");
  return Object.freeze({
    bootstrapUrl: localHttpUrl(input.bootstrapUrl, null, "Electron dev bootstrap"),
    operation: "electron.dev.installation.materialize",
    outputDirectory: input.outputDirectory,
    schemaVersion: ELECTRON_DEV_INSTALLATION_SCHEMA_VERSION,
    target: input.target as ElectronStandaloneTarget,
  });
}

export async function materializeElectronDevInstallation(requestInput: ElectronDevInstallationRequest): Promise<ElectronDevInstallationReceipt> {
  const request = parseElectronDevInstallationRequest(requestInput);
  const response = await fetch(request.bootstrapUrl);
  if (!response.ok || response.url !== request.bootstrapUrl) throw new Error("Electron dev bootstrap acquisition failed");
  const bootstrap = parseBootstrap(await response.json(), request.bootstrapUrl);
  const stage = `${request.outputDirectory}.stage-${process.pid}`;
  await rm(stage, { force: true, recursive: true });
  await mkdir(stage, { recursive: true });
  try {
    const authority = await buildElectronStandaloneAuthority(stage);
    await Promise.all([download(bootstrap.content, stage), download(bootstrap.trust, stage), ...bootstrap.seeds.map((seed) => download(seed, stage))]);
    const installation = Object.freeze({
      schemaVersion: 1,
      channel: bootstrap.channel,
      releaseVersion: bootstrap.releaseVersion,
      target: request.target,
      host: await descriptor(authority.host.path, authority.host.name),
      supervisor: await descriptor(authority.supervisor.path, authority.supervisor.name),
      content: await descriptor(join(stage, bootstrap.content.file)),
      trust: await descriptor(join(stage, bootstrap.trust.file)),
      update: Object.freeze({ channelHeadUrl: bootstrap.channelHeadUrl }),
      seeds: Object.freeze(await Promise.all(bootstrap.seeds.map(async (seed) => Object.freeze({ ...await descriptor(join(stage, seed.file)), blobSha256: seed.blobSha256 })))),
    });
    const installationPath = join(stage, "standalone-installation.json");
    await writeFile(installationPath, canonicalJson(installation), { flag: "wx" });
    await loadElectronStandaloneInstallation({ resourceRoot: stage, channel: bootstrap.channel, target: request.target });
    await mkdir(dirname(request.outputDirectory), { recursive: true });
    await rm(request.outputDirectory, { force: true, recursive: true });
    await rename(stage, request.outputDirectory);
    return Object.freeze({
      schemaVersion: ELECTRON_DEV_INSTALLATION_SCHEMA_VERSION,
      operation: "electron.dev.installation.materialize",
      channel: bootstrap.channel,
      releaseVersion: bootstrap.releaseVersion,
      target: request.target,
      resourceDirectory: request.outputDirectory,
      installationSha256: (await descriptor(join(request.outputDirectory, "standalone-installation.json"))).sha256,
    });
  } catch (error) {
    await rm(stage, { force: true, recursive: true }).catch(() => undefined);
    throw error;
  }
}

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value == null || value.startsWith("--")) throw new Error(`${name} is required`);
  return resolve(value);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const requestPath = argument("--request");
  const receiptPath = argument("--receipt");
  const receipt = await materializeElectronDevInstallation(JSON.parse(await readFile(requestPath, "utf8")) as ElectronDevInstallationRequest);
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, canonicalJson(receipt));
}
