import { createHash } from "node:crypto";
import { access, lstat, readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

import {
  LAUNCHER_SCHEMA_VERSION,
  compareLauncherVersions,
  validateLauncherRuntimeDescriptor,
  type LauncherRuntimeDescriptor,
} from "@open-design/launcher-proto";
import {
  DESKTOP_UPDATE_CHANNELS,
  DESKTOP_UPDATE_MODES,
  DESKTOP_UPDATE_STATES,
  type DesktopUpdateArtifactSnapshot,
  type DesktopUpdateChannel,
  type DesktopUpdateChecksumSnapshot,
  type DesktopUpdateErrorSnapshot,
  type DesktopUpdateReinstallSnapshot,
  type DesktopUpdateState,
} from "@open-design/sidecar-proto";

import { isDesktopUpdateChannel, type DesktopUpdaterConfig } from "./config.js";
import type { ResolvedChecksumSnapshot, UpdateReleaseRef } from "./store.js";
import {
  createError,
  isRecord,
  numberField,
  objectField,
  readJsonStrict,
  stringField,
} from "./support.js";

/**
 * @module updater/feed
 *
 * Release-feed interpretation for the desktop updater: metadata fetch and
 * parsing, per-channel version resolution, artifact selection with the
 * payload-to-installer fallback, checksum resolution, candidate/release
 * naming, and the installer-reinstall floor. Pure decision logic plus the
 * two feed HTTP fetches; no store writes.
 */

export type UpdateCandidate = {
  arch: string;
  artifact: DesktopUpdateArtifactSnapshot;
  checksum: DesktopUpdateChecksumSnapshot;
  channel: DesktopUpdateChannel;
  metadata: Record<string, unknown>;
  platformKey: string;
  version: string;
};

export function sanitizePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "update";
}

export function extensionForArtifact(name: string | undefined, type: string): string {
  const ext = name == null ? "" : extname(name).toLowerCase();
  if (ext === ".7z" || ext === ".dmg" || ext === ".zip" || ext === ".exe" || ext === ".appimage") return ext;
  if (type === "dmg") return ".dmg";
  if (type === "zip") return ".zip";
  if (type === "installer") return ".exe";
  return ".bin";
}

export function artifactFileName(candidate: UpdateCandidate): string {
  const ext = extensionForArtifact(candidate.artifact.name, candidate.artifact.type ?? "artifact");
  return [
    "open-design",
    sanitizePathSegment(candidate.version),
    sanitizePathSegment(candidate.platformKey),
    sanitizePathSegment(candidate.arch),
    sanitizePathSegment(candidate.artifact.type ?? "artifact"),
  ].join("-") + ext;
}

export function releaseKey(candidate: UpdateCandidate, checksum: DesktopUpdateChecksumSnapshot): string {
  const digest = checksum.value == null ? checksum.url ?? candidate.artifact.url : checksum.value;
  return [
    sanitizePathSegment(candidate.version),
    sanitizePathSegment(candidate.platformKey),
    sanitizePathSegment(candidate.arch),
    sanitizePathSegment(createHash("sha256").update(digest).digest("hex").slice(0, 12)),
  ].join("-");
}

export function releaseMatchesCandidate(
  saved: UpdateReleaseRef,
  candidate: UpdateCandidate,
): boolean {
  if (saved.channel !== candidate.channel) return false;
  if (saved.platformKey !== candidate.platformKey) return false;
  if (saved.arch !== candidate.arch) return false;
  if (saved.version !== candidate.version) return false;
  if (saved.artifact.url !== candidate.artifact.url) return false;
  if (saved.checksum.algorithm !== candidate.checksum.algorithm) return false;
  if (candidate.checksum.url != null && saved.checksum.url !== candidate.checksum.url) return false;
  if (candidate.checksum.value != null && saved.checksum.value !== candidate.checksum.value) return false;
  return true;
}

export function compareVersions(a: string, b: string): number {
  return compareLauncherVersions(a, b);
}

export function metadataChannel(metadata: Record<string, unknown>): DesktopUpdateChannel | null {
  const channel = stringField(metadata, "channel");
  return isDesktopUpdateChannel(channel) ? channel : null;
}

export function releaseVersionForChannel(metadata: Record<string, unknown>, channel: DesktopUpdateChannel): string | null {
  if (channel === DESKTOP_UPDATE_CHANNELS.BETA) return stringField(metadata, "releaseVersion") ?? stringField(metadata, "betaVersion");
  if (channel === DESKTOP_UPDATE_CHANNELS.BETAS) return stringField(metadata, "releaseVersion");
  if (channel === DESKTOP_UPDATE_CHANNELS.PRERELEASE) return stringField(metadata, "releaseVersion") ?? stringField(metadata, "prereleaseVersion");
  if (channel === DESKTOP_UPDATE_CHANNELS.PREVIEW) return stringField(metadata, "releaseVersion") ?? stringField(metadata, "previewVersion");
  return stringField(metadata, "releaseVersion") ?? stringField(metadata, "stableVersion");
}

export function selectedMacPlatformKey(arch: string): string {
  return arch === "x64" ? "macIntel" : "mac";
}

export function selectedWinPlatformKey(arch: string): string {
  if (arch === "x64") return "win";
  if (arch === "arm64") return "winArm64";
  if (arch === "ia32") return "winIa32";
  return `win-${sanitizePathSegment(arch)}`;
}

export function selectedPackageLauncherArtifact(config: DesktopUpdaterConfig, preferPayload = false): {
  artifactKey: "dmg" | "installer" | "payload";
  artifactType: "dmg" | "installer" | "payload";
  description: string;
  platformKey: string;
} | null {
  if (config.platform === "darwin") {
    const platformKey = selectedMacPlatformKey(config.arch);
    if (preferPayload) {
      return {
        artifactKey: "payload",
        artifactType: "payload",
        description: "mac launcher payload",
        platformKey,
      };
    }
    return {
      artifactKey: "dmg",
      artifactType: "dmg",
      description: "mac DMG",
      platformKey,
    };
  }
  if (config.platform === "win32") {
    const platformKey = selectedWinPlatformKey(config.arch);
    if (preferPayload) {
      return {
        artifactKey: "payload",
        artifactType: "payload",
        description: "Windows launcher payload",
        platformKey,
      };
    }
    return {
      artifactKey: "installer",
      artifactType: "installer",
      description: "Windows installer",
      platformKey,
    };
  }
  return null;
}

export function selectUpdateCandidate(
  metadata: Record<string, unknown>,
  config: DesktopUpdaterConfig,
  preferPayload = false,
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
  const artifactSelection = selectedPackageLauncherArtifact(config, preferPayload);
  if (artifactSelection == null) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.UNSUPPORTED,
      error: createError("unsupported-platform", "package-launcher updates are currently supported on macOS and Windows only"),
    };
  }

  const channel = metadataChannel(metadata);
  if (channel == null) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.ERROR,
      error: createError("metadata-channel-unsupported", "release metadata does not include a supported update channel"),
    };
  }
  if (channel !== config.channel) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.ERROR,
      error: createError(
        "metadata-channel-mismatch",
        `release metadata channel ${channel} does not match configured update channel ${config.channel}`,
      ),
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
  const platformKey = artifactSelection.platformKey;
  const platform = objectField(platforms, platformKey);
  if (platform == null || platform.enabled !== true) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.ERROR,
      error: createError("no-compatible-artifact", `release metadata does not include an enabled ${platformKey} artifact`),
    };
  }
  const version = releaseVersionForChannel(metadata, config.channel);
  if (version == null) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.ERROR,
      error: createError("metadata-missing-version", `release metadata does not include a ${config.channel} update version`),
    };
  }
  const artifacts = objectField(platform, "artifacts");
  const artifactRecord = artifacts == null ? null : objectField(artifacts, artifactSelection.artifactKey);
  const url = artifactRecord == null ? null : stringField(artifactRecord, "url");
  if (artifactRecord == null || url == null) {
    return {
      ok: false,
      state: DESKTOP_UPDATE_STATES.ERROR,
      error: createError(
        "no-compatible-artifact",
        `release metadata does not include a ${artifactSelection.description} artifact for ${platformKey}`,
      ),
    };
  }

  const artifact: DesktopUpdateArtifactSnapshot = {
    ...(stringField(artifactRecord, "name") == null ? {} : { name: stringField(artifactRecord, "name") as string }),
    platformKey,
    ...(numberField(artifactRecord, "size") == null ? {} : { size: numberField(artifactRecord, "size") }),
    type: artifactSelection.artifactType,
    url,
  };
  const sha256 = stringField(artifactRecord, "sha256") ?? stringField(artifactRecord, "sha256Digest");
  const sha512 = stringField(artifactRecord, "sha512") ?? stringField(artifactRecord, "sha512Digest");
  const checksum: DesktopUpdateChecksumSnapshot =
    sha512 != null
      ? { algorithm: "sha512", value: sha512 }
      : {
          algorithm: "sha256",
          ...(sha256 == null ? {} : { value: sha256 }),
          ...(stringField(artifactRecord, "sha256Url") == null ? {} : { url: stringField(artifactRecord, "sha256Url") as string }),
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

export function selectUpdateCandidateWithFallback(
  metadata: Record<string, unknown>,
  config: DesktopUpdaterConfig,
  preferPayload: boolean,
): { candidate: UpdateCandidate; ok: true } | { error: DesktopUpdateErrorSnapshot; ok: false; state: DesktopUpdateState } {
  if (!preferPayload) return selectUpdateCandidate(metadata, config);
  const payload = selectUpdateCandidate(metadata, config, true);
  if (payload.ok || payload.error.code !== "no-compatible-artifact") return payload;
  return selectUpdateCandidate(metadata, config);
}

export function controlLauncherVersion(metadata: Record<string, unknown>): Record<string, unknown> | null {
  const control = objectField(metadata, "control");
  const launcher = control == null ? null : objectField(control, "launcher");
  return launcher == null ? null : objectField(launcher, "version");
}

export function controlLauncherVersionMin(metadata: Record<string, unknown>): string | null {
  const version = controlLauncherVersion(metadata);
  return version == null ? null : stringField(version, "min");
}

export function controlLauncherVersionUrl(metadata: Record<string, unknown>): string | null {
  const version = controlLauncherVersion(metadata);
  return version == null ? null : stringField(version, "url");
}

/**
 * Resolve the version of the PHYSICALLY INSTALLED outer package. This is
 * distinct from `config.currentVersion`: after a payload update the running
 * version is the payload's, while the installed outer bundle on disk stays at
 * its install-time version and is the thing an installer reinstall replaces.
 * The outer bundle's own `open-design-config.json` is the only fleet-wide
 * source (every packaged generation ships it), anchored by the launcher
 * launch path from `install.json`. Returns null when unreadable.
 */
export async function resolveInstalledOuterVersion(config: DesktopUpdaterConfig): Promise<string | null> {
  if (config.installedVersionOverride != null) return config.installedVersionOverride;
  if (config.launcherLaunchPath == null) return null;
  const outerConfigPath =
    config.platform === "darwin"
      ? join(config.launcherLaunchPath, "Contents", "Resources", "open-design-config.json")
      : join(dirname(config.launcherLaunchPath), "resources", "open-design-config.json");
  try {
    const raw: unknown = JSON.parse(await readFile(outerConfigPath, "utf8"));
    if (!isRecord(raw)) return null;
    return stringField(raw, "appVersion");
  } catch {
    return null;
  }
}

/**
 * Installed-base escape hatch: decide whether the remote release is beyond what
 * this install can adopt as an in-place payload update, forcing a full
 * installer instead. Two orthogonal guardrails, either of which trips →
 * installer:
 *
 *  - `launcher.schema` (ABI axis): the release declares a launcher-contract schema
 *    number this build cannot interpret (`feed.launcher.schema >
 *    LAUNCHER_SCHEMA_VERSION`). This is the reseed boundary — a pure int compare.
 *  - `control.launcher.version.min` (recency axis): the release requires a
 *    physically installed outer package at least this new (`min >
 *    installedOuterVersion`). Payload updates never touch the outer bundle, so
 *    the comparison basis is the installed outer version, NOT the running
 *    version — a broken outer generation must reach the installer path even
 *    when its payload is current. When min is set but the outer version cannot
 *    be read, the gate trips conservatively: local state that cannot be
 *    identified is itself a reinstall signal.
 *
 * Missing/malformed metadata fields are ignored (fail-open) so older feeds keep
 * updating seamlessly. Returns the reinstall requirement for the status
 * snapshot, or null when an in-place payload update is acceptable.
 */
export function remoteRequiresReinstall(
  metadata: Record<string, unknown>,
  config: DesktopUpdaterConfig,
  installedOuterVersion: string | null,
): DesktopUpdateReinstallSnapshot | null {
  const minVersion = controlLauncherVersionMin(metadata);
  const url = controlLauncherVersionUrl(metadata);
  const shared = {
    ...(minVersion == null ? {} : { minVersion }),
    ...(url == null ? {} : { url }),
  };
  const launcher = objectField(metadata, "launcher");
  const remoteLauncherSchema = launcher == null ? undefined : numberField(launcher, "schema");
  if (remoteLauncherSchema != null && remoteLauncherSchema > LAUNCHER_SCHEMA_VERSION) {
    return {
      ...(installedOuterVersion == null ? {} : { installedVersion: installedOuterVersion }),
      reason: "launcher-schema",
      ...shared,
    };
  }
  if (minVersion == null) return null;
  if (installedOuterVersion == null) {
    return { reason: "outer-version-unreadable", ...shared };
  }
  if (compareVersions(minVersion, installedOuterVersion) > 0) {
    return { installedVersion: installedOuterVersion, reason: "outer-below-min", ...shared };
  }
  return null;
}

export async function fetchJson(fetchImpl: typeof globalThis.fetch, url: string): Promise<Record<string, unknown>> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`metadata request returned HTTP ${response.status}`);
  const body = await response.json();
  if (!isRecord(body)) throw new Error("metadata response was not a JSON object");
  return body;
}

export async function hasValidLauncherPayloadContext(config: DesktopUpdaterConfig): Promise<boolean> {
  if (config.launcherRoot == null || config.launcherLaunchPath == null || config.launcherRuntimePath == null || config.namespace == null) {
    return false;
  }
  try {
    await access(config.launcherLaunchPath);
    const launcherTarget = await lstat(config.launcherLaunchPath);
    if (launcherTarget.isSymbolicLink() || (!launcherTarget.isFile() && !launcherTarget.isDirectory())) {
      return false;
    }
    const runtime = await readJsonStrict<LauncherRuntimeDescriptor>(config.launcherRuntimePath);
    validateLauncherRuntimeDescriptor(runtime, { channel: config.channel, namespace: config.namespace });
    return true;
  } catch {
    return false;
  }
}

export function parseChecksumText(text: string, algorithm: "sha256" | "sha512"): string {
  const length = algorithm === "sha256" ? 64 : 128;
  const match = text.match(new RegExp(`\\b[0-9a-fA-F]{${length}}\\b`));
  if (match == null) throw new Error(`checksum file does not include a ${algorithm} digest`);
  return match[0].toLowerCase();
}

export async function resolveChecksum(fetchImpl: typeof globalThis.fetch, checksum: DesktopUpdateChecksumSnapshot): Promise<DesktopUpdateChecksumSnapshot> {
  if (checksum.value != null) return checksum;
  if (checksum.url == null) throw new Error("artifact checksum is missing");
  const response = await fetchImpl(checksum.url);
  if (!response.ok) throw new Error(`checksum request returned HTTP ${response.status}`);
  return {
    ...checksum,
    value: parseChecksumText(await response.text(), checksum.algorithm),
  };
}

export function checksumMatchesCandidate(checksum: ResolvedChecksumSnapshot, candidate: UpdateCandidate): boolean {
  if (checksum.algorithm !== candidate.checksum.algorithm) return false;
  if (candidate.checksum.url != null && checksum.url !== candidate.checksum.url) return false;
  if (candidate.checksum.value != null && checksum.value.toLowerCase() !== candidate.checksum.value.toLowerCase()) return false;
  return true;
}

