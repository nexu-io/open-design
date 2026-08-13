import type { ReleaseChannel } from "@open-design/release";

/** Installer-only floor for the physically installed outer package. */
export type InstallationVersionFloor = {
  min: string;
  url?: string;
};

const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function channelEnvSuffix(channel: ReleaseChannel): string {
  return channel.toUpperCase();
}

function readPair(env: NodeJS.ProcessEnv, suffix: string): InstallationVersionFloor | null {
  const minKey = `RELEASE_INSTALLATION_VERSION_MIN_${suffix}`;
  const urlKey = `RELEASE_INSTALLATION_VERSION_MIN_URL_${suffix}`;
  const min = env[minKey]?.trim() ?? "";
  const url = env[urlKey]?.trim() ?? "";
  if (min.length === 0) {
    if (url.length > 0) throw new Error(`${urlKey} requires ${minKey}`);
    return null;
  }
  if (!VERSION_PATTERN.test(min)) throw new Error(`${minKey} is not a valid version: ${min}`);
  if (url.length > 0) {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`${urlKey} must be an http(s) URL: ${url}`);
    }
  }
  return { min, ...(url.length > 0 ? { url } : {}) };
}

export function resolveInstallationVersionFloor(
  channel: ReleaseChannel,
  env: NodeJS.ProcessEnv = process.env,
): InstallationVersionFloor | null {
  const own = readPair(env, channelEnvSuffix(channel));
  if (own != null) return own;
  return channel === "stable" ? null : readPair(env, "STABLE");
}

type SemanticVersion = { base: [number, number, number]; prerelease: string[] | null };

function parseSemanticVersion(value: string): SemanticVersion {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value);
  if (match?.[1] == null || match[2] == null || match[3] == null) {
    throw new Error(`invalid installation version: ${value}`);
  }
  return {
    base: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split(".") ?? null,
  };
}

function compareIdentifiers(left: string, right: string): number {
  const leftNumber = /^\d+$/.test(left) ? Number(left) : null;
  const rightNumber = /^\d+$/.test(right) ? Number(right) : null;
  if (leftNumber != null && rightNumber != null) return Math.sign(leftNumber - rightNumber);
  if (leftNumber != null) return -1;
  if (rightNumber != null) return 1;
  return left.localeCompare(right);
}

function compareVersions(leftValue: string, rightValue: string): number {
  const left = parseSemanticVersion(leftValue);
  const right = parseSemanticVersion(rightValue);
  for (let index = 0; index < left.base.length; index += 1) {
    const difference = (left.base[index] ?? 0) - (right.base[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  if (left.prerelease == null || right.prerelease == null) {
    if (left.prerelease == null && right.prerelease == null) return 0;
    return left.prerelease == null ? 1 : -1;
  }
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart == null || rightPart == null) return leftPart == null ? -1 : 1;
    const comparison = compareIdentifiers(leftPart, rightPart);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

export function assertInstallationVersionFloorSatisfiable(
  floor: InstallationVersionFloor,
  releaseVersion: string,
): void {
  if (compareVersions(floor.min, releaseVersion) > 0) {
    throw new Error(`installation version floor ${floor.min} exceeds release version ${releaseVersion}`);
  }
}
