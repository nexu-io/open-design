import { execFile as execFileCallback } from "node:child_process";
import { appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const BETA_TAG = "open-design-beta";
const stableVersionPattern = /^(\d+)\.(\d+)\.(\d+)$/;
const stableTagPattern = /^open-design-v(\d+\.\d+\.\d+)$/;
const betaVersionPattern = /^(\d+\.\d+\.\d+)-beta\.(\d+)$/;
const betaTagPattern = /^open-design-v(\d+\.\d+\.\d+)-beta\.(\d+)(?:\.unsigned)?$/;

type GitHubReleaseAsset = {
  id?: number;
  name?: string;
};

type GitHubRelease = {
  assets?: GitHubReleaseAsset[];
  body?: string | null;
  draft?: boolean;
  name?: string | null;
  prerelease?: boolean;
  tag_name?: string;
};

type ParsedStableVersion = {
  parsed: [number, number, number];
  value: string;
};

type ParsedBetaVersion = {
  baseVersion: string;
  betaNumber: number;
  betaVersion: string;
};

type ReleaseSummary = {
  latestStable: string | null;
  latestBeta: string | null;
  totalStable: number;
  totalBeta: number;
};

function fail(message: string): never {
  console.error(`[release-beta] ${message}`);
  process.exit(1);
}

function parseStableVersion(value: string): [number, number, number] | null {
  const match = stableVersionPattern.exec(value);
  if (!match) return null;

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(
  left: [number, number, number],
  right: [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    if (left[i] > right[i]) return 1;
    if (left[i] < right[i]) return -1;
  }

  return 0;
}

function extractStableVersion(release: GitHubRelease): ParsedStableVersion | null {
  const values = [release.tag_name, release.name].filter(
    (item): item is string => typeof item === "string",
  );

  for (const item of values) {
    const found = stableTagPattern.exec(item);
    const version = found?.[1] ?? item.match(/\b(\d+\.\d+\.\d+)\b/)?.[1];

    if (!version) continue;

    const parsed = parseStableVersion(version);
    if (parsed) {
      return {
        parsed,
        value: version,
      };
    }
  }

  return null;
}

function extractBetaVersion(release: GitHubRelease): ParsedBetaVersion | null {
  const values = [release.tag_name, release.name].filter(
    (item): item is string => typeof item === "string",
  );

  for (const item of values) {
    const found = betaTagPattern.exec(item) ?? betaVersionPattern.exec(item);

    if (!found) continue;

    return {
      baseVersion: found[1],
      betaNumber: Number(found[2]),
      betaVersion: `${found[1]}-beta.${found[2]}`,
    };
  }

  return null;
}

function summarizeReleases(releases: GitHubRelease[]): ReleaseSummary {
  let latestStable: ParsedStableVersion | null = null;
  let latestBeta: ParsedBetaVersion | null = null;
  let totalStable = 0;
  let totalBeta = 0;

  for (const release of releases) {
    const stable = extractStableVersion(release);
    const beta = extractBetaVersion(release);

    if (stable) {
      totalStable++;

      if (
        !latestStable ||
        compareVersions(stable.parsed, latestStable.parsed) > 0
      ) {
        latestStable = stable;
      }
    }

    if (beta) {
      totalBeta++;

      const current = parseStableVersion(beta.baseVersion)!;
      const previous = latestBeta
        ? parseStableVersion(latestBeta.baseVersion)!
        : null;

      if (
        !latestBeta ||
        compareVersions(current, previous!) > 0 ||
        (beta.baseVersion === latestBeta.baseVersion &&
          beta.betaNumber > latestBeta.betaNumber)
      ) {
        latestBeta = beta;
      }
    }
  }

  return {
    latestStable: latestStable?.value ?? null,
    latestBeta: latestBeta?.betaVersion ?? null,
    totalStable,
    totalBeta,
  };
}

// Example usage
const releases: GitHubRelease[] = [
  { tag_name: "open-design-v1.2.0" },
  { tag_name: "open-design-v1.3.0-beta.1" },
  { tag_name: "open-design-v1.3.0-beta.2" },
  { tag_name: "open-design-v1.1.5" },
];

console.log(summarizeReleases(releases));
