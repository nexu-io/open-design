import { compareLauncherVersions } from "@open-design/launcher-proto";
import type { ReleaseChannel } from "@open-design/release";

/**
 * Channel policy for the installer-reinstall floor published as
 * `control.launcher.version.{min,url}`.
 *
 * Operators manage one repo-vars pair per channel —
 * `RELEASE_LAUNCHER_VERSION_MIN_<CHANNEL>` plus
 * `RELEASE_LAUNCHER_VERSION_MIN_URL_<CHANNEL>` — and workflows pass those vars
 * through verbatim. This module is the single resolution and validation point:
 * a non-stable channel whose own `MIN` is unset falls back to the STABLE pair
 * as a unit (never mixing one channel's min with another's url), and every
 * consumer (publish, verify) applies the same format, URL, and floor checks.
 */
export type LauncherVersionFloor = {
  min: string;
  url?: string;
};

const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function channelEnvSuffix(channel: ReleaseChannel): string {
  return channel.toUpperCase();
}

function readPair(
  env: NodeJS.ProcessEnv,
  suffix: string,
): LauncherVersionFloor | null {
  const minKey = `RELEASE_LAUNCHER_VERSION_MIN_${suffix}`;
  const urlKey = `RELEASE_LAUNCHER_VERSION_MIN_URL_${suffix}`;
  const min = env[minKey]?.trim() ?? "";
  const url = env[urlKey]?.trim() ?? "";
  if (min.length === 0) {
    if (url.length > 0) {
      throw new Error(`RELEASE_LAUNCHER_VERSION_MIN_URL_${suffix} requires RELEASE_LAUNCHER_VERSION_MIN_${suffix}`);
    }
    return null;
  }
  if (!VERSION_PATTERN.test(min)) {
    throw new Error(`${minKey} is not a valid version: ${min}`);
  }
  if (url.length > 0) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`${urlKey} must be an http(s) URL: ${url}`);
    }
  }
  return { min, ...(url.length > 0 ? { url } : {}) };
}

export function resolveLauncherVersionFloor(
  channel: ReleaseChannel,
  env: NodeJS.ProcessEnv = process.env,
): LauncherVersionFloor | null {
  const own = readPair(env, channelEnvSuffix(channel));
  if (own != null) return own;
  if (channel === "stable") return null;
  return readPair(env, "STABLE");
}

/**
 * A floor the published release cannot satisfy would make the updater's
 * same-version reinstall offer nag forever; publication (and verification)
 * must refuse it.
 */
export function assertLauncherVersionFloorSatisfiable(
  floor: LauncherVersionFloor,
  releaseVersion: string,
): void {
  if (compareLauncherVersions(floor.min, releaseVersion) > 0) {
    throw new Error(
      `launcher version floor ${floor.min} exceeds release version ${releaseVersion}`,
    );
  }
}
