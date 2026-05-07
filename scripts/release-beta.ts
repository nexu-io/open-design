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

function fail(message: string): never {
  console.error(`[release-beta] ${message}`);
  process.exit(1);
}

function parseStableVersion(value: string): [number, number, number] | null {
  const match = stableVersionPattern.exec(value);
  if (match == null) return null;

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left: [number, number, number], right: [number, number, number]): number {
  const [leftMajor, leftMinor, leftPatch] = left;
  const [rightMajor, rightMinor, rightPatch] = right;
  const pairs = [
    [leftMajor, rightMajor],
    [leftMinor, rightMinor],
    [leftPatch, rightPatch],
  ] as const;

  for (const [leftPart, rightPart] of pairs) {
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

function extractStableVersion(release: GitHubRelease): ParsedStableVersion | null {
  const candidates = [release.tag_name, release.name].filter((value): value is string => typeof value === "string");

  for (const candidate of candidates) {
    const tagMatch = stableTagPattern.exec(candidate);
    const value = tagMatch?.[1] ?? candidate.match(/\b(\d+\.\d+\.\d+)\b/)?.[1];
    if (value == null) continue;

    const parsed = parseStableVersion(value);
    if (parsed != null) return { parsed, value };
  }

  return null;
}

function parseBetaParts(baseVersion: string, betaNumber: string): ParsedBetaVersion {
  return {
    baseVersion,
    betaNumber: Number(betaNumber),
    betaVersion: `${baseVersion}-beta.${betaNumber}`,
  };
}

function extractBetaVersion(release: GitHubRelease): ParsedBetaVersion | null {
  const tagMatch = typeof release.tag_name === "string" ? betaTagPattern.exec(release.tag_name) : null;
  if (tagMatch?.[1] != null && tagMatch[2] != null) {
    return parseBetaParts(tagMatch[1], tagMatch[2]);
  }

  const candidates = [release.name, release.body].filter((value): value is string => typeof value === "string");
  for (const candidate of candidates) {
    const match = candidate.match(/(\d+\.\d+\.\d+)-beta\.(\d+)/);
    if (match?.[1] != null && match[2] != null) {
      return parseBetaParts(match[1], match[2]);
    }
  }

  return null;
}

function extractBetaVersionFromLatestMacYml(value: string): ParsedBetaVersion | null {
  const match = value.match(/^version:\s*["']?([^"'\n]+)["']?\s*$/m);
  if (match?.[1] == null) return null;

  const betaMatch = betaVersionPattern.exec(match[1]);
  if (betaMatch?.[1] == null || betaMatch[2] == null) return null;

  return parseBetaParts(betaMatch[1], betaMatch[2]);
}

async function readPackagedVersion(): Promise<string> {
  const packageJsonPath = join(process.cwd(), "apps", "packaged", "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };

  if (typeof packageJson.version !== "string") {
    fail(`missing version in ${packageJsonPath}`);
  }

  if (!stableVersionPattern.test(packageJson.version)) {
    fail(`apps/packaged/package.json version must be a stable x.y.z base version; got ${packageJson.version}`);
  }

  return packageJson.version;
}

async function fetchReleases(repository: string): Promise<GitHubRelease[]> {
  const releases: GitHubRelease[] = [];
  for (let page = 1; ; page += 1) {
    const { stdout } = await execFile("gh", ["api", `repos/${repository}/releases?per_page=100&page=${page}`]);
    const batch = JSON.parse(stdout) as GitHubRelease[];
    if (batch.length === 0) break;
    releases.push(...batch);
  }
  return releases;
}

async function fetchReleaseAssetText(repository: string, assetId: number): Promise<string> {
  const { stdout } = await execFile("gh", [
    "api",
    `repos/${repository}/releases/assets/${assetId}`,
    "--header",
    "Accept: application/octet-stream",
  ]);
  return stdout;
}

function setOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath == null || outputPath.length === 0) return;
  appendFileSync(outputPath, `${name}=${value}\n`);
}

const repository = process.env.GITHUB_REPOSITORY ?? fail("GITHUB_REPOSITORY is required");
const signed = process.env.OPEN_DESIGN_RELEASE_SIGNED !== "false";
const packagedVersion = await readPackagedVersion();
const packagedParsed = parseStableVersion(packagedVersion) ?? fail(`invalid packaged version: ${packagedVersion}`);
const releases = await fetchReleases(repository);

let latestStable: ParsedStableVersion | null = null;
for (const release of releases) {
  if (release.draft === true || release.prerelease === true) continue;

  const stableVersion = extractStableVersion(release);
  if (stableVersion == null) continue;

  if (latestStable == null || compareVersions(stableVersion.parsed, latestStable.parsed) > 0) {
    latestStable = stableVersion;
  }
}

if (latestStable != null && compareVersions(packagedParsed, latestStable.parsed) <= 0) {
  fail(`packaged base version ${packagedVersion} must be strictly greater than latest stable ${latestStable.value}`);
}

const betaCandidates: ParsedBetaVersion[] = [];
for (const release of releases) {
  const beta = extractBetaVersion(release);
  if (beta != null) betaCandidates.push(beta);
}

const existingBetaRelease = releases.find((release) => release.tag_name === BETA_TAG);
const latestMacAsset = existingBetaRelease?.assets?.find((asset) => asset.name === "latest-mac.yml");
if (latestMacAsset?.id != null) {
  const beta = extractBetaVersionFromLatestMacYml(await fetchReleaseAssetText(repository, latestMacAsset.id));
  if (beta != null) betaCandidates.push(beta);
}

let betaNumber = 1;
for (const beta of betaCandidates) {
  const existingBase = parseStableVersion(beta.baseVersion);
  if (existingBase == null) continue;

  const ordering = compareVersions(packagedParsed, existingBase);
  if (ordering < 0) {
    fail(`packaged base version ${packagedVersion} regressed below current beta base version ${beta.baseVersion}`);
  }

  if (ordering === 0) {
    betaNumber = Math.max(betaNumber, beta.betaNumber + 1);
  }
}

const betaVersion = `${packagedVersion}-beta.${betaNumber}`;
const unsignedSuffix = signed ? "" : ".unsigned";
const versionTag = `open-design-v${betaVersion}${unsignedSuffix}`;
const branch = process.env.GITHUB_REF_NAME ?? "";
const commit = process.env.GITHUB_SHA ?? "";
const releaseName = `Open Design Beta ${betaVersion}${signed ? "" : " (unsigned)"}`;

console.log(`[release-beta] channel: beta`);
console.log(`[release-beta] base version: ${packagedVersion}`);
console.log(`[release-beta] beta version: ${betaVersion}`);
console.log(`[release-beta] signed: ${signed ? "true" : "false"}`);
console.log(`[release-beta] fixed beta tag: ${BETA_TAG}`);
console.log(`[release-beta] immutable beta tag: ${versionTag}`);
if (latestStable != null) console.log(`[release-beta] latest stable: ${latestStable.value}`);

setOutput("asset_version_suffix", unsignedSuffix);
setOutput("base_version", packagedVersion);
setOutput("beta_number", String(betaNumber));
setOutput("beta_tag", BETA_TAG);
setOutput("beta_version", betaVersion);
setOutput("branch", branch);
setOutput("commit", commit);
setOutput("latest_stable", latestStable?.value ?? "");
setOutput("release_name", releaseName);
setOutput("signed", signed ? "true" : "false");
setOutput("version_tag", versionTag);
