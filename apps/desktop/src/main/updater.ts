import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  DESKTOP_UPDATE_CHANNELS,
  DESKTOP_UPDATE_MODES,
  DESKTOP_UPDATE_STATES,
  SIDECAR_SOURCES,
  type DesktopUpdateAction,
  type DesktopUpdateArtifactSnapshot,
  type DesktopUpdateChannel,
  type DesktopUpdateChecksumSnapshot,
  type DesktopUpdateErrorSnapshot,
  type DesktopUpdateMode,
  type DesktopUpdateProgressSnapshot,
  type DesktopUpdateStatusSnapshot,
  type DesktopUpdateState,
  type SidecarSource,
} from "@open-design/sidecar-proto";

export const DESKTOP_UPDATE_ENV = Object.freeze({
  ARCH: "OD_UPDATE_ARCH",
  AUTO_CHECK: "OD_UPDATE_AUTO_CHECK",
  AUTO_DOWNLOAD: "OD_UPDATE_AUTO_DOWNLOAD",
  AUTO_OPEN: "OD_UPDATE_AUTO_OPEN",
  CHANNEL: "OD_UPDATE_CHANNEL",
  CURRENT_VERSION: "OD_UPDATE_CURRENT_VERSION",
  DOWNLOAD_ROOT: "OD_UPDATE_DOWNLOAD_ROOT",
  ENABLED: "OD_UPDATE_ENABLED",
  METADATA_URL: "OD_UPDATE_METADATA_URL",
  MODE: "OD_UPDATE_MODE",
  OPEN_DRY_RUN: "OD_UPDATE_OPEN_DRY_RUN",
  PLATFORM: "OD_UPDATE_PLATFORM",
} as const);

const DEFAULT_RELEASE_ORIGIN = "https://releases.open-design.ai";
const OWNERSHIP_SENTINEL = ".open-design-updater-root.json";
const STATE_FILE = "state.json";
const UPDATE_ROOT_VERSION = 1;

export type DesktopUpdaterConfigInput = {
  appVersion?: string | null;
  arch?: string;
  currentVersion?: string | null;
  downloadRoot?: string | null;
  env?: NodeJS.ProcessEnv;
  mode?: DesktopUpdateMode;
  platform?: string;
  runtimeBase?: string | null;
  source: SidecarSource;
};

export type DesktopUpdaterConfig = {
  arch: string;
  autoCheck: boolean;
  autoDownload: boolean;
  autoOpen: boolean;
  channel: DesktopUpdateChannel;
  currentVersion: string;
  downloadRoot: string;
  enabled: boolean;
  metadataUrl: string;
  mode: DesktopUpdateMode;
  openDryRun: boolean;
  platform: string;
  source: SidecarSource;
};

export type DesktopUpdaterDeps = {
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  openPath?: (path: string) => Promise<string>;
};

type UpdateCandidate = {
  arch: string;
  artifact: DesktopUpdateArtifactSnapshot;
  checksum: DesktopUpdateChecksumSnapshot;
  channel: DesktopUpdateChannel;
  metadata: Record<string, unknown>;
  platformKey: string;
  version: string;
};

type PersistedUpdateState = {
  artifact: DesktopUpdateArtifactSnapshot;
  checksum: DesktopUpdateChecksumSnapshot;
  channel: DesktopUpdateChannel;
  downloadPath: string;
  downloadedAt: string;
  metadata: Record<string, unknown>;
  platform: string;
  platformKey: string;
  verified: true;
  version: 1;
  updateVersion: string;
};

type OwnedRoot =
  | { ok: true; manifestPath: string; realRoot: string }
  | { error: DesktopUpdateErrorSnapshot; ok: false };

type ActionOptions = {
  autoDownload?: boolean;
};

export type DesktopUpdater = {
  checkForUpdates(options?: ActionOptions): Promise<DesktopUpdateStatusSnapshot>;
  downloadUpdate(): Promise<DesktopUpdateStatusSnapshot>;
  handle(action: DesktopUpdateAction): Promise<DesktopUpdateStatusSnapshot>;
  installUpdate(): Promise<DesktopUpdateStatusSnapshot>;
  shouldAutoCheck(): boolean;
  snapshot(): DesktopUpdateStatusSnapshot;
  status(): Promise<DesktopUpdateStatusSnapshot>;
  subscribe(listener: () => void): () => void;
};

function isTruthyEnv(value: string | undefined): boolean | null {
  if (value == null || value.length === 0) return null;
  if (value === "1" || value === "true" || value === "yes") return true;
  if (value === "0" || value === "false" || value === "no") return false;
  throw new Error(`boolean env value must be one of 1/0/true/false/yes/no, got ${value}`);
}

function normalizeMode(value: string | undefined, fallback: DesktopUpdateMode): DesktopUpdateMode {
  if (value == null || value.length === 0) return fallback;
  if (value === DESKTOP_UPDATE_MODES.PACKAGE_LAUNCHER || value === DESKTOP_UPDATE_MODES.JS_INCREMENTAL) return value;
  throw new Error(`unsupported desktop update mode: ${value}`);
}

function normalizeChannel(value: string | undefined, fallback: DesktopUpdateChannel): DesktopUpdateChannel {
  if (value == null || value.length === 0) return fallback;
  if (value === DESKTOP_UPDATE_CHANNELS.STABLE || value === DESKTOP_UPDATE_CHANNELS.BETA) return value;
  throw new Error(`unsupported desktop update channel: ${value}`);
}

function defaultMetadataUrl(channel: DesktopUpdateChannel): string {
  return `${DEFAULT_RELEASE_ORIGIN}/${channel}/latest/metadata.json`;
}

function normalizeDownloadRoot(value: string): string {
  if (value.includes("\0")) throw new Error("update download root must not contain null bytes");
  if (!isAbsolute(value)) throw new Error(`update download root must be absolute: ${value}`);
  return resolve(value);
}

export function resolveDesktopUpdaterConfig(input: DesktopUpdaterConfigInput): DesktopUpdaterConfig {
  const env = input.env ?? process.env;
  const mode = normalizeMode(env[DESKTOP_UPDATE_ENV.MODE], input.mode ?? DESKTOP_UPDATE_MODES.PACKAGE_LAUNCHER);
  const defaultEnabled = input.source === SIDECAR_SOURCES.PACKAGED;
  const enabled = isTruthyEnv(env[DESKTOP_UPDATE_ENV.ENABLED]) ?? defaultEnabled;
  const runtimeBase = input.runtimeBase == null ? process.cwd() : input.runtimeBase;
  const downloadRoot = normalizeDownloadRoot(
    env[DESKTOP_UPDATE_ENV.DOWNLOAD_ROOT] ??
      input.downloadRoot ??
      join(resolve(runtimeBase), "updates"),
  );
  const currentVersion =
    env[DESKTOP_UPDATE_ENV.CURRENT_VERSION] ??
    input.currentVersion ??
    input.appVersion ??
    "0.0.0";
  const channel = normalizeChannel(env[DESKTOP_UPDATE_ENV.CHANNEL], defaultChannelForVersion(currentVersion));

  return {
    arch: env[DESKTOP_UPDATE_ENV.ARCH] ?? input.arch ?? process.arch,
    autoCheck: isTruthyEnv(env[DESKTOP_UPDATE_ENV.AUTO_CHECK]) ?? enabled,
    autoDownload: isTruthyEnv(env[DESKTOP_UPDATE_ENV.AUTO_DOWNLOAD]) ?? true,
    autoOpen: isTruthyEnv(env[DESKTOP_UPDATE_ENV.AUTO_OPEN]) ?? false,
    channel,
    currentVersion,
    downloadRoot,
    enabled,
    metadataUrl: env[DESKTOP_UPDATE_ENV.METADATA_URL] ?? defaultMetadataUrl(channel),
    mode,
    openDryRun: isTruthyEnv(env[DESKTOP_UPDATE_ENV.OPEN_DRY_RUN]) ?? false,
    platform: env[DESKTOP_UPDATE_ENV.PLATFORM] ?? input.platform ?? process.platform,
    source: input.source,
  };
}

function capabilitiesFor(status: { mode: DesktopUpdateMode; platform: string; supported: boolean }) {
  const packageLauncher = status.mode === DESKTOP_UPDATE_MODES.PACKAGE_LAUNCHER && status.platform === "darwin" && status.supported;
  return {
    canApplyInPlace: false,
    canDownload: packageLauncher,
    canOpenInstaller: packageLauncher,
    requiresManualInstall: packageLauncher,
  };
}

function createError(code: string, message: string, details?: unknown): DesktopUpdateErrorSnapshot {
  return {
    code,
    ...(details === undefined ? {} : { details }),
    message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function objectField(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key];
  return isRecord(value) ? value : null;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "update";
}

function extensionForArtifact(name: string | undefined, type: string): string {
  const ext = name == null ? "" : extname(name).toLowerCase();
  if (ext === ".dmg" || ext === ".zip" || ext === ".exe" || ext === ".appimage") return ext;
  if (type === "dmg") return ".dmg";
  if (type === "zip") return ".zip";
  if (type === "installer") return ".exe";
  return ".bin";
}

function artifactFileName(candidate: UpdateCandidate): string {
  const ext = extensionForArtifact(candidate.artifact.name, candidate.artifact.type ?? "artifact");
  return [
    "open-design",
    sanitizePathSegment(candidate.version),
    sanitizePathSegment(candidate.platformKey),
    sanitizePathSegment(candidate.arch),
    sanitizePathSegment(candidate.artifact.type ?? "artifact"),
  ].join("-") + ext;
}

function containsPath(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel));
}

async function writeJson(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function directoryIsEmpty(path: string): Promise<boolean> {
  const entries = await readdir(path);
  return entries.length === 0;
}

async function ensureOwnedUpdateRoot(config: DesktopUpdaterConfig): Promise<OwnedRoot> {
  const root = normalizeDownloadRoot(config.downloadRoot);
  try {
    await mkdir(root, { recursive: true });
    const rootEntry = await lstat(root);
    if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
      return {
        ok: false,
        error: createError("update-root-not-owned", `update root is not an owned directory: ${root}`),
      };
    }
    const realRoot = await realpath(root);
    const sentinelPath = join(realRoot, OWNERSHIP_SENTINEL);
    const manifestPath = join(realRoot, STATE_FILE);
    const sentinel = await readJson<{ namespace?: string; version?: number }>(sentinelPath);
    if (sentinel != null) {
      if (sentinel.version !== UPDATE_ROOT_VERSION) {
        return {
          ok: false,
          error: createError("update-root-version-mismatch", `update root has unsupported ownership marker version at ${sentinelPath}`),
        };
      }
      return { ok: true, manifestPath, realRoot };
    }

    if (!(await directoryIsEmpty(realRoot))) {
      return {
        ok: false,
        error: createError(
          "update-root-not-owned",
          `update root is not empty and has no Open Design updater ownership marker: ${realRoot}`,
        ),
      };
    }

    await writeJson(sentinelPath, {
      createdAt: new Date().toISOString(),
      owner: "open-design-updater",
      source: config.source,
      version: UPDATE_ROOT_VERSION,
    });
    return { ok: true, manifestPath, realRoot };
  } catch (error) {
    return {
      ok: false,
      error: createError("update-root-unavailable", error instanceof Error ? error.message : String(error)),
    };
  }
}

type ParsedComparableVersion = {
  nums: [number, number, number];
  pre: string[];
};

function numberPart(value: string | undefined): number {
  return value != null && /^[0-9]+$/.test(value) ? Number(value) : 0;
}

function parseComparableVersion(value: string): ParsedComparableVersion {
  const cleaned = value.trim().replace(/^v/i, "").split("+", 1)[0] ?? "";
  const nightlyMatch = /^(\d+)\.(\d+)\.(\d+)\.nightly\.(\d+)$/i.exec(cleaned);
  if (nightlyMatch?.[1] != null && nightlyMatch[2] != null && nightlyMatch[3] != null && nightlyMatch[4] != null) {
    return {
      nums: [Number(nightlyMatch[1]), Number(nightlyMatch[2]), Number(nightlyMatch[3])],
      pre: ["nightly", nightlyMatch[4]],
    };
  }

  const prereleaseSeparator = cleaned.indexOf("-");
  const core = prereleaseSeparator === -1 ? cleaned : cleaned.slice(0, prereleaseSeparator);
  const prerelease = prereleaseSeparator === -1 ? "" : cleaned.slice(prereleaseSeparator + 1);
  const nums = core.split(".");
  return {
    nums: [numberPart(nums[0]), numberPart(nums[1]), numberPart(nums[2])],
    pre: prerelease.length === 0 ? [] : prerelease.split("."),
  };
}

function hasCountedPrerelease(version: string): boolean {
  const parsed = parseComparableVersion(version);
  const last = parsed.pre.at(-1);
  return parsed.pre.length >= 2 && last != null && /^[0-9]+$/.test(last);
}

function defaultChannelForVersion(version: string): DesktopUpdateChannel {
  return /(?:^|[-.])beta(?:[-.]|$)/i.test(version) || hasCountedPrerelease(version)
    ? DESKTOP_UPDATE_CHANNELS.BETA
    : DESKTOP_UPDATE_CHANNELS.STABLE;
}

function compareIdentifier(a: string, b: string): number {
  const aNum = /^[0-9]+$/.test(a) ? Number(a) : null;
  const bNum = /^[0-9]+$/.test(b) ? Number(b) : null;
  if (aNum != null && bNum != null) return Math.sign(aNum - bNum);
  if (aNum != null) return -1;
  if (bNum != null) return 1;
  return a.localeCompare(b);
}

export function compareVersions(a: string, b: string): number {
  const left = parseComparableVersion(a);
  const right = parseComparableVersion(b);
  for (let index = 0; index < 3; index += 1) {
    const delta = (left.nums[index] ?? 0) - (right.nums[index] ?? 0);
    if (delta !== 0) return Math.sign(delta);
  }
  if (left.pre.length === 0 && right.pre.length === 0) return 0;
  if (left.pre.length === 0) return 1;
  if (right.pre.length === 0) return -1;
  const max = Math.max(left.pre.length, right.pre.length);
  for (let index = 0; index < max; index += 1) {
    const l = left.pre[index];
    const r = right.pre[index];
    if (l == null) return -1;
    if (r == null) return 1;
    const delta = compareIdentifier(l, r);
    if (delta !== 0) return delta;
  }
  return 0;
}

function releaseVersion(metadata: Record<string, unknown>): string | null {
  return (
    stringField(metadata, "releaseVersion") ??
    stringField(metadata, "betaVersion") ??
    stringField(metadata, "nightlyVersion") ??
    stringField(metadata, "stableVersion") ??
    stringField(metadata, "baseVersion")
  );
}

function selectedMacPlatformKey(platforms: Record<string, unknown>, arch: string): string {
  return arch === "x64" ? "macIntel" : "mac";
}

function selectUpdateCandidate(
  metadata: Record<string, unknown>,
  config: DesktopUpdaterConfig,
): { candidate: UpdateCandidate; ok: true } | { error: DesktopUpdateErrorSnapshot; ok: false; state: DesktopUpdateState } {
  if (config.mode === DESKTOP_UPDATE_MODES.JS_INCREMENTAL) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.UNSUPPORTED,
      error: createError("update-mode-not-implemented", "js-incremental updates are not implemented yet"),
    };
  }
  if (config.mode !== DESKTOP_UPDATE_MODES.PACKAGE_LAUNCHER) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.UNSUPPORTED,
      error: createError("update-mode-unsupported", `unsupported update mode: ${config.mode}`),
    };
  }
  if (config.platform !== "darwin") {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.UNSUPPORTED,
      error: createError("unsupported-platform", "package-launcher updates are currently mac-only"),
    };
  }

  const platforms = objectField(metadata, "platforms");
  if (platforms == null) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.ERROR,
      error: createError("metadata-missing-platforms", "release metadata does not include platform artifacts"),
    };
  }
  const platformKey = selectedMacPlatformKey(platforms, config.arch);
  const platform = objectField(platforms, platformKey);
  if (platform == null || platform.enabled !== true) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.ERROR,
      error: createError("no-compatible-artifact", `release metadata does not include an enabled ${platformKey} artifact`),
    };
  }
  const version = releaseVersion(metadata);
  if (version == null) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.ERROR,
      error: createError("metadata-missing-version", "release metadata does not include a release version"),
    };
  }
  const artifacts = objectField(platform, "artifacts");
  const dmg = artifacts == null ? null : objectField(artifacts, "dmg");
  const url = dmg == null ? null : stringField(dmg, "url");
  if (dmg == null || url == null) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.ERROR,
      error: createError("no-compatible-artifact", `release metadata does not include a mac DMG artifact for ${platformKey}`),
    };
  }

  const artifact: DesktopUpdateArtifactSnapshot = {
    ...(stringField(dmg, "name") == null ? {} : { name: stringField(dmg, "name") as string }),
    platformKey,
    ...(numberField(dmg, "size") == null ? {} : { size: numberField(dmg, "size") }),
    type: "dmg",
    url,
  };
  const sha256 = stringField(dmg, "sha256") ?? stringField(dmg, "sha256Digest");
  const sha512 = stringField(dmg, "sha512") ?? stringField(dmg, "sha512Digest");
  const checksum: DesktopUpdateChecksumSnapshot =
    sha512 != null
      ? { algorithm: "sha512", value: sha512 }
      : {
          algorithm: "sha256",
          ...(sha256 == null ? {} : { value: sha256 }),
          ...(stringField(dmg, "sha256Url") == null ? {} : { url: stringField(dmg, "sha256Url") as string }),
        };

  return {
    ok: true,
    candidate: {
      arch: stringField(platform, "arch") ?? config.arch,
      artifact,
      checksum,
      channel: config.channel,
      metadata,
      platformKey,
      version,
    },
  };
}

async function fetchJson(fetchImpl: typeof globalThis.fetch, url: string): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`metadata request returned HTTP ${response.status}`);
  const body = await response.json();
  if (!isRecord(body)) throw new Error("metadata response was not a JSON object");
  return body;
}

function parseChecksumText(text: string, algorithm: "sha256" | "sha512"): string {
  const length = algorithm === "sha256" ? 64 : 128;
  const match = text.match(new RegExp(`\\b[0-9a-fA-F]{${length}}\\b`));
  if (match == null) throw new Error(`checksum file does not include a ${algorithm} digest`);
  return match[0].toLowerCase();
}

async function resolveChecksum(fetchImpl: typeof globalThis.fetch, checksum: DesktopUpdateChecksumSnapshot): Promise<DesktopUpdateChecksumSnapshot> {
  if (checksum.value != null) return checksum;
  if (checksum.url == null) throw new Error("artifact checksum is missing");
  const response = await fetchImpl(checksum.url);
  if (!response.ok) throw new Error(`checksum request returned HTTP ${response.status}`);
  return {
    ...checksum,
    value: parseChecksumText(await response.text(), checksum.algorithm),
  };
}

async function hashFile(path: string, algorithm: "sha256" | "sha512"): Promise<string> {
  const hash = createHash(algorithm);
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function downloadToFile(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  path: string,
  onProgress: (progress: DesktopUpdateProgressSnapshot) => void,
): Promise<void> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`artifact request returned HTTP ${response.status}`);
  if (response.body == null) throw new Error("artifact response did not include a body");
  await mkdir(dirname(path), { recursive: true });
  const totalRaw = response.headers.get("content-length");
  const parsedTotalBytes = totalRaw == null ? undefined : Number(totalRaw);
  const totalBytes = parsedTotalBytes != null && Number.isFinite(parsedTotalBytes) && parsedTotalBytes > 0
    ? parsedTotalBytes
    : undefined;
  let receivedBytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.byteLength;
      onProgress({ receivedBytes, ...(totalBytes == null ? {} : { totalBytes }) });
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body as never),
    meter,
    createWriteStream(path, { flags: "wx" }),
  );
}

async function removeContainedEntry(root: string, path: string): Promise<boolean> {
  const resolved = resolve(path);
  if (!containsPath(root, resolved)) return false;
  let entry;
  try {
    entry = await lstat(resolved);
  } catch {
    return false;
  }
  if (entry.isSymbolicLink()) return false;
  if (entry.isDirectory()) {
    const real = await realpath(resolved).catch(() => null);
    if (real == null || !containsPath(root, real)) return false;
  }
  await rm(resolved, { force: true, recursive: true });
  return true;
}

async function ensureOwnedSubdir(root: string, name: string): Promise<string> {
  if (name.length === 0 || name.includes("\0") || /[\\/]/.test(name)) {
    throw new Error(`update subdirectory must be a simple path segment: ${name}`);
  }
  const dir = join(root, name);
  if (!containsPath(root, dir)) throw new Error(`update subdirectory escaped update root: ${dir}`);
  await mkdir(dir, { recursive: true });
  const entry = await lstat(dir);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error(`update subdirectory is not an owned directory: ${dir}`);
  }
  const realDir = await realpath(dir);
  if (!containsPath(root, realDir)) throw new Error(`update subdirectory realpath escaped update root: ${realDir}`);
  return realDir;
}

async function existingOwnedSubdir(root: string, name: string): Promise<string | null> {
  const dir = join(root, name);
  let entry;
  try {
    entry = await lstat(dir);
  } catch {
    return null;
  }
  if (!entry.isDirectory() || entry.isSymbolicLink()) return null;
  const realDir = await realpath(dir).catch(() => null);
  if (realDir == null || !containsPath(root, realDir)) return null;
  return realDir;
}

async function cleanupOwnedUpdateRoot(root: string, keepPaths: readonly string[]): Promise<void> {
  const keep = new Set(keepPaths.map((path) => resolve(path)));
  for (const child of ["tmp", "artifacts"]) {
    const dir = await existingOwnedSubdir(root, child);
    if (dir == null) continue;
    const entries = await readdir(dir).catch(() => []);
    for (const entry of entries) {
      const path = join(dir, entry);
      if (keep.has(resolve(path))) continue;
      await removeContainedEntry(root, path).catch(() => false);
    }
  }
}

function persistedState(value: unknown): PersistedUpdateState | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1 || value.verified !== true) return null;
  if (typeof value.updateVersion !== "string" || typeof value.downloadPath !== "string") return null;
  if (typeof value.platform !== "string" || typeof value.platformKey !== "string") return null;
  if (value.channel !== DESKTOP_UPDATE_CHANNELS.STABLE && value.channel !== DESKTOP_UPDATE_CHANNELS.BETA) return null;
  if (!isRecord(value.metadata) || !isRecord(value.artifact) || !isRecord(value.checksum)) return null;
  const artifact = value.artifact as DesktopUpdateArtifactSnapshot;
  const checksum = value.checksum as DesktopUpdateChecksumSnapshot;
  if (typeof artifact.url !== "string" || artifact.url.length === 0) return null;
  if (checksum.algorithm !== "sha256" && checksum.algorithm !== "sha512") return null;
  return value as PersistedUpdateState;
}

export function createDesktopUpdater(
  configInput: DesktopUpdaterConfigInput,
  deps: DesktopUpdaterDeps = {},
): DesktopUpdater {
  const config = resolveDesktopUpdaterConfig(configInput);
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? (() => new Date());
  const openPath = deps.openPath ?? (async () => "openPath is not available");
  const listeners = new Set<() => void>();
  let candidate: UpdateCandidate | null = null;
  let downloadPath: string | null = null;
  let checksum: DesktopUpdateChecksumSnapshot | null = null;
  let metadata: Record<string, unknown> | null = null;
  let lastCheckedAt: string | undefined;
  let installResult: DesktopUpdateStatusSnapshot["installResult"];
  let progress: DesktopUpdateProgressSnapshot | undefined;
  let state: DesktopUpdateState = DESKTOP_UPDATE_STATES.IDLE;
  let error: DesktopUpdateErrorSnapshot | undefined;
  let operation: Promise<unknown> = Promise.resolve();

  function supported(): boolean {
    return config.enabled && config.mode === DESKTOP_UPDATE_MODES.PACKAGE_LAUNCHER && config.platform === "darwin";
  }

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function setState(next: DesktopUpdateState, nextError?: DesktopUpdateErrorSnapshot): DesktopUpdateStatusSnapshot {
    state = next;
    error = nextError;
    const status = snapshot();
    emit();
    return status;
  }

  function snapshot(): DesktopUpdateStatusSnapshot {
    const statusSupported = supported();
    return {
      arch: config.arch,
      ...(candidate?.artifact == null ? {} : { artifact: candidate.artifact }),
      ...(candidate?.artifact.url == null ? {} : { artifactUrl: candidate.artifact.url }),
      ...(candidate?.version == null ? {} : { availableVersion: candidate.version }),
      capabilities: capabilitiesFor({ mode: config.mode, platform: config.platform, supported: statusSupported }),
      channel: config.channel,
      ...(checksum == null ? {} : { checksum }),
      currentVersion: config.currentVersion,
      ...(downloadPath == null ? {} : { downloadPath }),
      enabled: config.enabled,
      ...(error == null ? {} : { error }),
      ...(installResult == null ? {} : { installResult }),
      ...(lastCheckedAt == null ? {} : { lastCheckedAt }),
      ...(metadata == null ? {} : { metadata }),
      mode: config.mode,
      paths: { downloadRoot: config.downloadRoot },
      platform: config.platform,
      ...(progress == null ? {} : { progress }),
      state,
      supported: statusSupported,
    };
  }

  function unsupportedStatus(): DesktopUpdateStatusSnapshot | null {
    if (!config.enabled) {
      return setState(DESKTOP_UPDATE_STATES.IDLE);
    }
    if (config.mode === DESKTOP_UPDATE_MODES.JS_INCREMENTAL) {
      return setState(
        DESKTOP_UPDATE_STATES.UNSUPPORTED,
        createError("update-mode-not-implemented", "js-incremental updates are not implemented yet"),
      );
    }
    if (config.platform !== "darwin") {
      return setState(
        DESKTOP_UPDATE_STATES.UNSUPPORTED,
        createError("unsupported-platform", "package-launcher updates are currently mac-only"),
      );
    }
    return null;
  }

  async function restoreDownloadedState(): Promise<DesktopUpdateStatusSnapshot | null> {
    const root = await ensureOwnedUpdateRoot(config);
    if (!root.ok) return setState(DESKTOP_UPDATE_STATES.ERROR, root.error);
    const saved = persistedState(await readJson(root.manifestPath));
    if (saved == null) return null;
    const resolvedDownload = resolve(saved.downloadPath);
    if (!containsPath(root.realRoot, resolvedDownload)) {
      return setState(DESKTOP_UPDATE_STATES.ERROR, createError("download-path-escaped", "saved update path is outside the update root"));
    }
    try {
      await access(resolvedDownload);
      const file = await stat(resolvedDownload);
      if (!file.isFile()) return null;
    } catch {
      return null;
    }
    candidate = {
      arch: config.arch,
      artifact: saved.artifact,
      checksum: saved.checksum,
      channel: saved.channel,
      metadata: saved.metadata,
      platformKey: saved.platformKey,
      version: saved.updateVersion,
    };
    checksum = saved.checksum;
    metadata = saved.metadata;
    downloadPath = resolvedDownload;
    return setState(DESKTOP_UPDATE_STATES.DOWNLOADED);
  }

  async function checkForCandidate(options: ActionOptions = {}): Promise<DesktopUpdateStatusSnapshot> {
    const unsupported = unsupportedStatus();
    if (unsupported != null) return unsupported;
    setState(DESKTOP_UPDATE_STATES.CHECKING);
    try {
      const body = await fetchJson(fetchImpl, config.metadataUrl);
      lastCheckedAt = now().toISOString();
      metadata = body;
      const selected = selectUpdateCandidate(body, config);
      if (!selected.ok) return setState(selected.state, selected.error);
      if (compareVersions(selected.candidate.version, config.currentVersion) <= 0) {
        candidate = null;
        checksum = null;
        downloadPath = null;
        return setState(DESKTOP_UPDATE_STATES.NOT_AVAILABLE);
      }
      candidate = selected.candidate;
      checksum = selected.candidate.checksum;
      downloadPath = null;
      const available = setState(DESKTOP_UPDATE_STATES.AVAILABLE);
      if (options.autoDownload ?? config.autoDownload) return await downloadUpdate();
      return available;
    } catch (checkError) {
      return setState(
        DESKTOP_UPDATE_STATES.ERROR,
        createError("metadata-unreachable", checkError instanceof Error ? checkError.message : String(checkError)),
      );
    }
  }

  async function downloadUpdate(): Promise<DesktopUpdateStatusSnapshot> {
    const unsupported = unsupportedStatus();
    if (unsupported != null) return unsupported;
    if (candidate == null) {
      const checked = await checkForCandidate({ autoDownload: false });
      if (checked.state !== DESKTOP_UPDATE_STATES.AVAILABLE || candidate == null) return checked;
    }
    const root = await ensureOwnedUpdateRoot(config);
    if (!root.ok) return setState(DESKTOP_UPDATE_STATES.ERROR, root.error);
    setState(DESKTOP_UPDATE_STATES.DOWNLOADING);
    const nextCandidate = candidate;
    const outputName = artifactFileName(nextCandidate);
    let tmpPath: string | null = null;
    try {
      const artifactsDir = await ensureOwnedSubdir(root.realRoot, "artifacts");
      const tmpDir = await ensureOwnedSubdir(root.realRoot, "tmp");
      const finalPath = join(artifactsDir, outputName);
      tmpPath = join(tmpDir, `${outputName}.${process.pid}.${Date.now()}.download`);
      if (!containsPath(root.realRoot, finalPath) || !containsPath(root.realRoot, tmpPath)) {
        return setState(DESKTOP_UPDATE_STATES.ERROR, createError("download-path-escaped", "resolved update download path escaped update root"));
      }
      const resolvedChecksum = await resolveChecksum(fetchImpl, nextCandidate.checksum);
      checksum = resolvedChecksum;
      await rm(tmpPath, { force: true });
      await downloadToFile(fetchImpl, nextCandidate.artifact.url, tmpPath, (nextProgress) => {
        progress = nextProgress;
        emit();
      });
      const digest = await hashFile(tmpPath, resolvedChecksum.algorithm);
      if (resolvedChecksum.value == null || digest.toLowerCase() !== resolvedChecksum.value.toLowerCase()) {
        await rm(tmpPath, { force: true });
        return setState(
          DESKTOP_UPDATE_STATES.ERROR,
          createError("checksum-mismatch", "downloaded update checksum did not match release metadata", {
            actual: digest,
            expected: resolvedChecksum.value,
          }),
        );
      }
      await mkdir(dirname(finalPath), { recursive: true });
      await rm(finalPath, { force: true });
      await rename(tmpPath, finalPath);
      downloadPath = finalPath;
      progress = undefined;
      const persisted: PersistedUpdateState = {
        artifact: nextCandidate.artifact,
        checksum: resolvedChecksum,
        channel: nextCandidate.channel,
        downloadPath: finalPath,
        downloadedAt: now().toISOString(),
        metadata: nextCandidate.metadata,
        platform: config.platform,
        platformKey: nextCandidate.platformKey,
        updateVersion: nextCandidate.version,
        verified: true,
        version: 1,
      };
      await writeJson(root.manifestPath, persisted);
      await cleanupOwnedUpdateRoot(root.realRoot, [finalPath, root.manifestPath]);
      const downloaded = setState(DESKTOP_UPDATE_STATES.DOWNLOADED);
      if (config.autoOpen) return await installUpdate();
      return downloaded;
    } catch (downloadError) {
      if (tmpPath != null) await rm(tmpPath, { force: true }).catch(() => undefined);
      return setState(
        DESKTOP_UPDATE_STATES.ERROR,
        createError("download-failed", downloadError instanceof Error ? downloadError.message : String(downloadError)),
      );
    }
  }

  async function installUpdate(): Promise<DesktopUpdateStatusSnapshot> {
    const unsupported = unsupportedStatus();
    if (unsupported != null) return unsupported;
    if (downloadPath == null) {
      const restored = await restoreDownloadedState();
      if (restored == null || downloadPath == null) {
        return setState(DESKTOP_UPDATE_STATES.ERROR, createError("update-not-downloaded", "no downloaded update package is available"));
      }
    }
    const root = await ensureOwnedUpdateRoot(config);
    if (!root.ok) return setState(DESKTOP_UPDATE_STATES.ERROR, root.error);
    const resolvedDownload = resolve(downloadPath);
    if (!containsPath(root.realRoot, resolvedDownload)) {
      return setState(DESKTOP_UPDATE_STATES.ERROR, createError("download-path-escaped", "download path is outside the update root"));
    }
    setState(DESKTOP_UPDATE_STATES.INSTALLING);
    const installChecksum = checksum;
    if (installChecksum?.value == null) {
      return setState(DESKTOP_UPDATE_STATES.ERROR, createError("checksum-missing", "downloaded update checksum is missing"));
    }
    let digest: string;
    try {
      digest = await hashFile(resolvedDownload, installChecksum.algorithm);
    } catch (hashError) {
      return setState(
        DESKTOP_UPDATE_STATES.ERROR,
        createError("download-unavailable", hashError instanceof Error ? hashError.message : String(hashError)),
      );
    }
    if (digest.toLowerCase() !== installChecksum.value.toLowerCase()) {
      return setState(
        DESKTOP_UPDATE_STATES.ERROR,
        createError("checksum-mismatch", "downloaded update checksum changed before install", {
          actual: digest,
          expected: installChecksum.value,
        }),
      );
    }
    try {
      const openedAt = now().toISOString();
      if (!config.openDryRun) {
        const openError = await openPath(resolvedDownload);
        if (openError.length > 0) {
          return setState(DESKTOP_UPDATE_STATES.ERROR, createError("open-installer-failed", openError));
        }
      }
      installResult = {
        ...(config.openDryRun ? { dryRun: true } : {}),
        openedAt,
        path: resolvedDownload,
      };
      return setState(DESKTOP_UPDATE_STATES.DOWNLOADED);
    } catch (installError) {
      return setState(
        DESKTOP_UPDATE_STATES.ERROR,
        createError("open-installer-failed", installError instanceof Error ? installError.message : String(installError)),
      );
    }
  }

  async function serialized(run: () => Promise<DesktopUpdateStatusSnapshot>): Promise<DesktopUpdateStatusSnapshot> {
    const next = operation.catch(() => undefined).then(run);
    operation = next.catch(() => undefined);
    return await next;
  }

  return {
    checkForUpdates: (options) => serialized(() => checkForCandidate(options)),
    downloadUpdate: () => serialized(downloadUpdate),
    handle(action) {
      switch (action) {
        case "status":
          return this.status();
        case "check":
          return this.checkForUpdates();
        case "download":
          return this.downloadUpdate();
        case "install":
          return this.installUpdate();
      }
    },
    installUpdate: () => serialized(installUpdate),
    shouldAutoCheck: () => config.enabled && config.autoCheck,
    snapshot,
    async status() {
      const unsupported = unsupportedStatus();
      if (unsupported != null) return unsupported;
      if (state === DESKTOP_UPDATE_STATES.IDLE) {
        const restored = await restoreDownloadedState();
        if (restored != null) return restored;
      }
      return snapshot();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
