import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { downloadCopyAndClear } from "@open-design/download";

type RemoteFile = Readonly<{ file: string; sha256: string; size: number; url: string }>;
type RemoteSeed = Readonly<RemoteFile & { blobSha256: string; component: "standalone.launcher" | "standalone.resource" }>;
type Bootstrap = Readonly<{
  channel: string;
  channelHeadUrl: string;
  content: RemoteFile;
  releaseVersion: string;
  schemaVersion: 2;
  capsule: Readonly<{ manifest: RemoteFile; archive: RemoteFile }> | null;
  seeds: readonly RemoteSeed[];
  trust: RemoteFile;
}>;

const digestPattern = /^[a-f0-9]{64}$/u;
const safeFlatFilePattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

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
  const input = record(value, "Standalone fixture bootstrap");
  exactKeys(input, ["capsule", "channel", "channelHeadUrl", "content", "releaseVersion", "schemaVersion", "seeds", "trust"], "Standalone fixture bootstrap");
  if (input.schemaVersion !== 2 || typeof input.channel !== "string" || typeof input.releaseVersion !== "string") throw new Error("Standalone fixture bootstrap identity is invalid");
  const origin = new URL(bootstrapUrl).origin;
  if (!Array.isArray(input.seeds) || input.seeds.length === 0) throw new Error("Standalone fixture bootstrap seeds are invalid");
  const files = new Set<string>();
  const digests = new Set<string>();
  let launchers = 0;
  const seeds = input.seeds.map((value, index) => {
    const seed = record(value, `Standalone fixture seed ${index}`);
    exactKeys(seed, ["blobSha256", "component", "file", "sha256", "size", "url"], `Standalone fixture seed ${index}`);
    const file = remoteFile({ file: seed.file, sha256: seed.sha256, size: seed.size, url: seed.url }, origin, null, `Standalone fixture seed ${index}`);
    if ((seed.component !== "standalone.launcher" && seed.component !== "standalone.resource")
      || seed.blobSha256 !== file.sha256 || files.has(file.file) || digests.has(file.sha256)) {
      throw new Error(`Standalone fixture seed ${index} binding is invalid`);
    }
    files.add(file.file);
    digests.add(file.sha256);
    if (seed.component === "standalone.launcher") launchers += 1;
    return Object.freeze({ ...file, blobSha256: file.sha256, component: seed.component });
  });
  if (launchers !== 1) throw new Error("Standalone fixture bootstrap must bind exactly one launcher seed");
  const capsule = input.capsule == null ? null : (() => {
    const value = record(input.capsule, "Electron fixture Capsule");
    exactKeys(value, ["archive", "manifest"], "Electron fixture Capsule");
    return Object.freeze({ manifest: remoteFile(value.manifest, origin, "capsule-manifest.json", "Electron Capsule manifest"),
      archive: remoteFile(value.archive, origin, "capsule.zip", "Electron Capsule archive") });
  })();
  return Object.freeze({
    schemaVersion: 2,
    capsule,
    channel: input.channel,
    releaseVersion: input.releaseVersion,
    channelHeadUrl: localHttpUrl(input.channelHeadUrl, origin, "Standalone fixture channel head"),
    content: remoteFile(input.content, origin, "standalone-content.json", "Standalone fixture content"),
    trust: remoteFile(input.trust, origin, "standalone-trust.json", "Standalone fixture trust"),
    seeds: Object.freeze(seeds),
  });
}


/** File inputs only: no Shell identity, installer, generation or runtime authority. */
export type StandaloneFixtureFiles = Readonly<{
  channel: string;
  releaseVersion: string;
  channelHeadUrl: string;
  contentFile: string;
  trustFile: string;
  capsule?: Readonly<{ manifestFile: string; archiveFile: string }>;
  seedFiles: readonly string[];
}>;

/** Scoped client for this tool's loopback fixture protocol; never a production updater. */
export async function withStandaloneExactFixture<T>(
  input: Readonly<{ bootstrapUrl: string; scratchRoot: string }>,
  consume: (files: StandaloneFixtureFiles) => Promise<T>,
): Promise<T> {
  if (resolve(input.scratchRoot) !== input.scratchRoot) throw new Error("fixture scratch root must be absolute");
  const url = localHttpUrl(input.bootstrapUrl, null, "Standalone fixture bootstrap");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("Standalone fixture bootstrap acquisition failed");
  const bootstrap = parseBootstrap(await response.json(), url);
  await mkdir(input.scratchRoot, { recursive: true });
  const stage = await mkdtemp(join(input.scratchRoot, "fixture-"));
  try {
    const files = [bootstrap.content, bootstrap.trust, ...bootstrap.seeds, ...(bootstrap.capsule == null ? [] : [bootstrap.capsule.manifest, bootstrap.capsule.archive])];
    if (new Set(files.map(file => file.file)).size !== files.length) throw new Error("Standalone fixture file names collide");
    const outcomes = await Promise.allSettled(files.map(async file => {
      const result = await downloadCopyAndClear({
        basePath: join(stage, "downloads"), bucket: "fixture", fileName: file.file,
        outputPath: join(stage, file.file), maxAttempts: 1,
        payload: { url: file.url, checksum: { algorithm: "sha256", value: file.sha256 } },
        fetch: (request, options) => fetch(request, { ...options, redirect: "error", signal: AbortSignal.timeout(30000) }),
      });
      if (result.bytes !== file.size) throw new Error(`Standalone fixture resource size mismatch: ${file.file}`);
    }));
    const failure = outcomes.find(outcome => outcome.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    return await consume(Object.freeze({
      channel: bootstrap.channel, releaseVersion: bootstrap.releaseVersion, channelHeadUrl: bootstrap.channelHeadUrl,
      contentFile: join(stage, bootstrap.content.file), trustFile: join(stage, bootstrap.trust.file),
      ...(bootstrap.capsule == null ? {} : { capsule: Object.freeze({ manifestFile: join(stage, bootstrap.capsule.manifest.file), archiveFile: join(stage, bootstrap.capsule.archive.file) }) }),
      seedFiles: Object.freeze(bootstrap.seeds.map(seed => join(stage, seed.file))),
    }));
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
