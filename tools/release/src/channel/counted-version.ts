import {
  compareReleaseBaseVersions,
  formatReleaseVersion,
  parseCountedReleaseVersion,
  parseReleaseBaseVersion,
} from "@open-design/release";

import { readNumberField, readStringField } from "../lib/release-script.ts";
import type { CountedReleaseChannelProfile } from "./profiles.ts";

export type CountedReleaseState = {
  baseVersion: string;
  releaseNumber: number;
  releaseVersion: string;
};

export function parseCountedReleaseMetadata(
  profile: CountedReleaseChannelProfile,
  value: string,
): CountedReleaseState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.replace(/^\uFEFF/u, ""));
  } catch (error) {
    throw new Error(`${profile.metadataSource} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
    throw new Error(`${profile.metadataSource} must be a JSON object`);
  }

  const record = parsed as Record<string, unknown>;
  const releaseVersion = readStringField(record, "releaseVersion")
    ?? (profile.legacyVersionField == null ? null : readStringField(record, profile.legacyVersionField));
  const releaseNumber = readNumberField(record, "releaseNumber")
    ?? (profile.legacyNumberField == null ? null : readNumberField(record, profile.legacyNumberField));
  const baseVersion = readStringField(record, "baseVersion");

  if (releaseVersion != null) {
    const parsedVersion = parseCountedReleaseVersion(releaseVersion, profile.channel);
    if (parsedVersion == null) {
      throw new Error(`${profile.metadataSource} releaseVersion must be x.y.z-${profile.channel}.N; got ${releaseVersion}`);
    }
    if (baseVersion != null && baseVersion !== parsedVersion.baseVersion) {
      throw new Error(`${profile.metadataSource} baseVersion ${baseVersion} does not match releaseVersion ${releaseVersion}`);
    }
    if (releaseNumber != null && releaseNumber !== parsedVersion.number) {
      throw new Error(`${profile.metadataSource} releaseNumber ${releaseNumber} does not match releaseVersion ${releaseVersion}`);
    }
    return { baseVersion: parsedVersion.baseVersion, releaseNumber: parsedVersion.number, releaseVersion };
  }

  if (baseVersion == null || releaseNumber == null) {
    throw new Error(`${profile.metadataSource} must include releaseVersion or baseVersion+releaseNumber`);
  }
  if (parseReleaseBaseVersion(baseVersion) == null) {
    throw new Error(`${profile.metadataSource} baseVersion must be x.y.z; got ${baseVersion}`);
  }
  return {
    baseVersion,
    releaseNumber,
    releaseVersion: formatReleaseVersion(profile.channel, baseVersion, releaseNumber),
  };
}

export function nextCountedReleaseVersion(options: {
  allowRegression: boolean;
  baseVersion: string;
  latest: CountedReleaseState | null;
  profile: CountedReleaseChannelProfile;
}): CountedReleaseState {
  const base = parseReleaseBaseVersion(options.baseVersion);
  if (base == null) throw new Error(`invalid packaged base version: ${options.baseVersion}`);
  let releaseNumber = 1;
  if (options.latest != null) {
    const latestBase = parseReleaseBaseVersion(options.latest.baseVersion);
    if (latestBase == null) {
      throw new Error(`invalid ${options.profile.channel} base version: ${options.latest.baseVersion}`);
    }
    const ordering = compareReleaseBaseVersions(base, latestBase);
    if (ordering < 0 && !options.allowRegression) {
      throw new Error(
        `packaged base version ${options.baseVersion} regressed below current ${options.profile.channel} base version ${options.latest.baseVersion}`,
      );
    }
    if (ordering === 0) releaseNumber = options.latest.releaseNumber + 1;
  }
  return {
    baseVersion: options.baseVersion,
    releaseNumber,
    releaseVersion: formatReleaseVersion(options.profile.channel, options.baseVersion, releaseNumber),
  };
}
