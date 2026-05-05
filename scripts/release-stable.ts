import { execFile as execFileCallback } from "node:child_process";
import { appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const stableVersionPattern = /^(\d+)\.(\d+)\.(\d+)$/;
const stableTagPattern = /^open-design-v(\d+\.\d+\.\d+)$/;

type GitHubRelease = {
  draft?: boolean;
  name?: string | null;
  prerelease?: boolean;
  tag_name?: string;
};

type ParsedStableVersion = {
  parsed: [number, number, number];
  value: string;
};

function fail(message: string): never {
  console.error(`[release-stable] ${message}`);
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

function setOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath == null || outputPath.length === 0) return;
  appendFileSync(outputPath, `${name}=${value}\n`);
}

const repository = process.env.GITHUB_REPOSITORY ?? fail("GITHUB_REPOSITORY is required");
const stableVersion = await readPackagedVersion();
const stableParsed = parseStableVersion(stableVersion) ?? fail(`invalid packaged version: ${stableVersion}`);
const versionTag = `open-design-v${stableVersion}`;
const releases = await fetchReleases(repository);

let latestStable: ParsedStableVersion | null = null;
for (const release of releases) {
  if (release.draft === true || release.prerelease === true) continue;

  const parsedRelease = extractStableVersion(release);
  if (parsedRelease == null) continue;

  if (release.tag_name === versionTag) {
    fail(`stable release ${versionTag} already exists; bump apps/packaged/package.json before publishing`);
  }

  if (latestStable == null || compareVersions(parsedRelease.parsed, latestStable.parsed) > 0) {
    latestStable = parsedRelease;
  }
}

if (latestStable != null && compareVersions(stableParsed, latestStable.parsed) <= 0) {
  fail(`packaged stable version ${stableVersion} must be strictly greater than latest stable ${latestStable.value}`);
}

const branch = process.env.GITHUB_REF_NAME ?? "";
const commit = process.env.GITHUB_SHA ?? "";
const releaseName = `Open Design ${stableVersion}`;

console.log(`[release-stable] channel: stable`);
console.log(`[release-stable] version: ${stableVersion}`);
console.log(`[release-stable] version tag: ${versionTag}`);
if (latestStable != null) console.log(`[release-stable] previous stable: ${latestStable.value}`);

setOutput("base_version", stableVersion);
setOutput("branch", branch);
setOutput("commit", commit);
setOutput("previous_stable", latestStable?.value ?? "");
setOutput("release_name", releaseName);
setOutput("stable_version", stableVersion);
setOutput("version_tag", versionTag);
