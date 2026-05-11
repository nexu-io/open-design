import { execFile as execFileCallback } from "node:child_process";
import { appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { get as httpsGet } from "node:https";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const stableVersionPattern = /^(\d+)\.(\d+)\.(\d+)$/;
const stableReleaseBranchPattern = /^release\/v(\d+\.\d+\.\d+)$/;
const stableTagPattern = /^open-design-v(\d+\.\d+\.\d+)$/;
const nightlyVersionPattern = /^(\d+\.\d+\.\d+)\.nightly\.(\d+)$/;

type ReleaseChannel = "nightly" | "stable";

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

type ParsedNightlyVersion = {
  baseVersion: string;
  nightlyNumber: number;
  nightlyVersion: string;
};

type ParsedNightlyMetadata = ParsedNightlyVersion & {
  source: "metadata-json";
};

type StableNightlyValidation = {
  metadataUrl: string;
  nightlyVersion: string;
};

function fail(message: string): never {
  console.error(`[release-stable] ${message}`);
  process.exit(1);
}

function parseChannel(value: string | undefined): ReleaseChannel {
  if (value == null || value.length === 0 || value === "stable") return "stable";
  if (value === "nightly") return "nightly";
  fail(`OPEN_DESIGN_RELEASE_CHANNEL must be stable or nightly; got ${value}`);
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

function parseNightlyParts(baseVersion: string, nightlyNumber: string): ParsedNightlyVersion {
  const parsedNightlyNumber = Number(nightlyNumber);
  if (!Number.isSafeInteger(parsedNightlyNumber) || parsedNightlyNumber < 1) {
    fail(`invalid nightly number in latest nightly metadata: ${nightlyNumber}`);
  }

  return {
    baseVersion,
    nightlyNumber: parsedNightlyNumber,
    nightlyVersion: `${baseVersion}.nightly.${nightlyNumber}`,
  };
}

function readStringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumberField(record: Record<string, unknown>, field: string): number | null {
  const value = record[field];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function readBooleanField(record: Record<string, unknown>, field: string): boolean | null {
  const value = record[field];
  return typeof value === "boolean" ? value : null;
}

function readObjectField(record: Record<string, unknown>, field: string): Record<string, unknown> | null {
  const value = record[field];
  return typeof value === "object" && value != null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseJsonRecord(value: string, sourceName: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    fail(`${sourceName} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
    fail(`${sourceName} must be a JSON object`);
  }

  return parsed as Record<string, unknown>;
}

function parseNightlyVersion(value: string, sourceName: string): ParsedNightlyVersion {
  const match = nightlyVersionPattern.exec(value);
  if (match?.[1] == null || match[2] == null) {
    fail(`${sourceName} nightlyVersion must be x.y.z.nightly.N; got ${value}`);
  }
  return parseNightlyParts(match[1], match[2]);
}

function parseNightlyMetadataJson(value: string): ParsedNightlyMetadata {
  const record = parseJsonRecord(value, "R2 nightly metadata.json");
  const nightlyVersion = readStringField(record, "nightlyVersion");
  const nightlyNumber = readNumberField(record, "nightlyNumber");
  const baseVersion = readStringField(record, "baseVersion");

  if (nightlyVersion != null) {
    const nightly = parseNightlyVersion(nightlyVersion, "R2 nightly metadata.json");
    if (baseVersion != null && baseVersion !== nightly.baseVersion) {
      fail(`R2 nightly metadata.json baseVersion ${baseVersion} does not match nightlyVersion ${nightly.nightlyVersion}`);
    }
    if (nightlyNumber != null && nightlyNumber !== nightly.nightlyNumber) {
      fail(`R2 nightly metadata.json nightlyNumber ${nightlyNumber} does not match nightlyVersion ${nightly.nightlyVersion}`);
    }
    return { ...nightly, source: "metadata-json" };
  }

  if (baseVersion == null || nightlyNumber == null) {
    fail("R2 nightly metadata.json must include nightlyVersion or baseVersion+nightlyNumber");
  }

  const parsedBase = parseStableVersion(baseVersion);
  if (parsedBase == null) {
    fail(`R2 nightly metadata.json baseVersion must be x.y.z; got ${baseVersion}`);
  }

  return { ...parseNightlyParts(baseVersion, String(nightlyNumber)), source: "metadata-json" };
}

function requireObjectField(record: Record<string, unknown>, field: string, sourceName: string): Record<string, unknown> {
  const value = readObjectField(record, field);
  if (value == null) {
    fail(`${sourceName}.${field} must be a JSON object`);
  }
  return value;
}

function requireStringField(record: Record<string, unknown>, field: string, sourceName: string): string {
  const value = readStringField(record, field);
  if (value == null) {
    fail(`${sourceName}.${field} is required`);
  }
  return value;
}

function expectStringField(record: Record<string, unknown>, field: string, expected: string, sourceName: string): void {
  const value = readStringField(record, field);
  if (value !== expected) {
    fail(`${sourceName}.${field} must be ${expected}; got ${value ?? "(missing)"}`);
  }
}

function expectBooleanField(record: Record<string, unknown>, field: string, expected: boolean, sourceName: string): void {
  const value = readBooleanField(record, field);
  if (value !== expected) {
    fail(`${sourceName}.${field} must be ${String(expected)}; got ${value == null ? "(missing)" : String(value)}`);
  }
}

function requireVersionedUrlField(
  record: Record<string, unknown>,
  field: string,
  expectedVersionUrl: string,
  sourceName: string,
): void {
  const value = requireStringField(record, field, sourceName);
  validateHttpsUrl(value, `${sourceName}.${field}`);
  if (!value.startsWith(`${expectedVersionUrl}/`)) {
    fail(`${sourceName}.${field} must point under ${expectedVersionUrl}/; got ${value}`);
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

async function validateStableNightlyMetadata(options: {
  branch: string;
  commit: string;
  nightlyVersionInput: string | undefined;
  packagedVersion: string;
  publicOrigin: string | undefined;
  repository: string;
}): Promise<StableNightlyValidation> {
  if (options.commit.length === 0) {
    fail("GITHUB_SHA is required to validate the stable channel nightly gate");
  }

  const nightlyVersionInput = options.nightlyVersionInput?.trim() ?? "";
  if (nightlyVersionInput.length === 0) {
    fail("OPEN_DESIGN_STABLE_NIGHTLY_VERSION is required when channel=stable; pass the exact validated nightly version");
  }

  const nightly = parseNightlyVersion(nightlyVersionInput, "OPEN_DESIGN_STABLE_NIGHTLY_VERSION");
  if (nightly.baseVersion !== options.packagedVersion) {
    fail(
      `stable channel nightly gate requires base version ${options.packagedVersion}; got ${nightly.nightlyVersion}`,
    );
  }

  const publicOrigin = trimTrailingSlash(
    options.publicOrigin ?? fail("OPEN_DESIGN_RELEASES_PUBLIC_ORIGIN is required when channel=stable"),
  );
  validateHttpsUrl(publicOrigin, "OPEN_DESIGN_RELEASES_PUBLIC_ORIGIN");

  const expectedVersionPrefix = `nightly/versions/${nightly.nightlyVersion}`;
  const expectedVersionUrl = `${publicOrigin}/${expectedVersionPrefix}`;
  const metadataUrl = `${expectedVersionUrl}/metadata.json`;
  const metadataJson = await fetchOptionalHttpsText(metadataUrl);
  if (metadataJson == null) {
    fail(`required nightly metadata was not found: ${metadataUrl}`);
  }

  const sourceName = "R2 stable-channel nightly metadata";
  const metadata = parseJsonRecord(metadataJson, sourceName);
  const parsedNightly = parseNightlyMetadataJson(metadataJson);
  if (parsedNightly.nightlyVersion !== nightly.nightlyVersion) {
    fail(`${sourceName}.nightlyVersion must be ${nightly.nightlyVersion}; got ${parsedNightly.nightlyVersion}`);
  }

  expectStringField(metadata, "channel", "nightly", sourceName);
  expectStringField(metadata, "releaseVersion", nightly.nightlyVersion, sourceName);
  expectStringField(metadata, "nightlyVersion", nightly.nightlyVersion, sourceName);
  expectStringField(metadata, "baseVersion", options.packagedVersion, sourceName);
  expectStringField(metadata, "stableVersion", options.packagedVersion, sourceName);
  expectBooleanField(metadata, "signed", true, sourceName);

  const github = requireObjectField(metadata, "github", sourceName);
  expectStringField(github, "branch", options.branch, `${sourceName}.github`);
  expectStringField(github, "commit", options.commit, `${sourceName}.github`);
  expectStringField(github, "repository", options.repository, `${sourceName}.github`);
  expectStringField(github, "workflow", "release-stable", `${sourceName}.github`);

  const r2 = requireObjectField(metadata, "r2", sourceName);
  expectStringField(r2, "versionPrefix", expectedVersionPrefix, `${sourceName}.r2`);
  expectStringField(r2, "versionMetadataUrl", metadataUrl, `${sourceName}.r2`);
  expectStringField(r2, "reportZipUrl", `${expectedVersionUrl}/report.zip`, `${sourceName}.r2`);
  const report = requireObjectField(r2, "report", `${sourceName}.r2`);
  expectStringField(report, "type", "zip", `${sourceName}.r2.report`);
  expectStringField(report, "url", `${expectedVersionUrl}/report.zip`, `${sourceName}.r2.report`);

  const platforms = requireObjectField(metadata, "platforms", sourceName);
  const mac = requireObjectField(platforms, "mac", `${sourceName}.platforms`);
  expectBooleanField(mac, "enabled", true, `${sourceName}.platforms.mac`);
  expectStringField(mac, "arch", "arm64", `${sourceName}.platforms.mac`);
  expectBooleanField(mac, "signed", true, `${sourceName}.platforms.mac`);
  const macArtifacts = requireObjectField(mac, "artifacts", `${sourceName}.platforms.mac`);
  const macDmg = requireObjectField(macArtifacts, "dmg", `${sourceName}.platforms.mac.artifacts`);
  requireVersionedUrlField(macDmg, "url", expectedVersionUrl, `${sourceName}.platforms.mac.artifacts.dmg`);
  requireVersionedUrlField(macDmg, "sha256Url", expectedVersionUrl, `${sourceName}.platforms.mac.artifacts.dmg`);
  const macZip = requireObjectField(macArtifacts, "zip", `${sourceName}.platforms.mac.artifacts`);
  requireVersionedUrlField(macZip, "url", expectedVersionUrl, `${sourceName}.platforms.mac.artifacts.zip`);
  requireVersionedUrlField(macZip, "sha256Url", expectedVersionUrl, `${sourceName}.platforms.mac.artifacts.zip`);

  const macIntel = requireObjectField(platforms, "macIntel", `${sourceName}.platforms`);
  expectBooleanField(macIntel, "enabled", true, `${sourceName}.platforms.macIntel`);
  expectStringField(macIntel, "arch", "x64", `${sourceName}.platforms.macIntel`);
  expectBooleanField(macIntel, "signed", true, `${sourceName}.platforms.macIntel`);
  const macIntelArtifacts = requireObjectField(macIntel, "artifacts", `${sourceName}.platforms.macIntel`);
  const macIntelDmg = requireObjectField(macIntelArtifacts, "dmg", `${sourceName}.platforms.macIntel.artifacts`);
  requireVersionedUrlField(macIntelDmg, "url", expectedVersionUrl, `${sourceName}.platforms.macIntel.artifacts.dmg`);
  requireVersionedUrlField(macIntelDmg, "sha256Url", expectedVersionUrl, `${sourceName}.platforms.macIntel.artifacts.dmg`);
  const macIntelZip = requireObjectField(macIntelArtifacts, "zip", `${sourceName}.platforms.macIntel.artifacts`);
  requireVersionedUrlField(macIntelZip, "url", expectedVersionUrl, `${sourceName}.platforms.macIntel.artifacts.zip`);
  requireVersionedUrlField(macIntelZip, "sha256Url", expectedVersionUrl, `${sourceName}.platforms.macIntel.artifacts.zip`);

  const win = requireObjectField(platforms, "win", `${sourceName}.platforms`);
  expectBooleanField(win, "enabled", true, `${sourceName}.platforms.win`);
  expectStringField(win, "arch", "x64", `${sourceName}.platforms.win`);
  const winArtifacts = requireObjectField(win, "artifacts", `${sourceName}.platforms.win`);
  const winInstaller = requireObjectField(winArtifacts, "installer", `${sourceName}.platforms.win.artifacts`);
  requireVersionedUrlField(winInstaller, "url", expectedVersionUrl, `${sourceName}.platforms.win.artifacts.installer`);
  requireVersionedUrlField(winInstaller, "sha256Url", expectedVersionUrl, `${sourceName}.platforms.win.artifacts.installer`);

  return {
    metadataUrl,
    nightlyVersion: nightly.nightlyVersion,
  };
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

function fetchOptionalHttpsText(url: string, redirectCount = 0): Promise<string | null> {
  return new Promise((resolvePromise, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      reject(new Error(`expected HTTPS URL for nightly feed lookup: ${parsed.protocol}`));
      return;
    }

    const request = httpsGet(
      parsed,
      {
        headers: {
          "Cache-Control": "no-cache",
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        if (statusCode === 404) {
          response.resume();
          resolvePromise(null);
          return;
        }

        const location = response.headers.location;
        if (statusCode >= 300 && statusCode < 400 && typeof location === "string") {
          response.resume();
          if (redirectCount >= 3) {
            reject(new Error("too many redirects while reading nightly feed"));
            return;
          }
          const nextUrl = new URL(location, parsed).toString();
          fetchOptionalHttpsText(nextUrl, redirectCount + 1).then(resolvePromise, reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`nightly feed request failed with HTTP ${statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolvePromise(Buffer.concat(chunks).toString("utf8"));
        });
      },
    );

    request.setTimeout(10_000, () => {
      request.destroy(new Error("timed out while reading nightly feed"));
    });
    request.on("error", reject);
  });
}

function validateHttpsUrl(value: string, name: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${name} must be an HTTPS URL; got ${value}`);
  }

  if (parsed.protocol !== "https:") {
    fail(`${name} must be an HTTPS URL; got ${value}`);
  }
}

function setOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath == null || outputPath.length === 0) return;
  appendFileSync(outputPath, `${name}=${value}\n`);
}

const repository = process.env.GITHUB_REPOSITORY ?? fail("GITHUB_REPOSITORY is required");
const channel = parseChannel(process.env.OPEN_DESIGN_RELEASE_CHANNEL);
const packagedVersion = await readPackagedVersion();
const packagedParsed = parseStableVersion(packagedVersion) ?? fail(`invalid packaged version: ${packagedVersion}`);
const commit = process.env.GITHUB_SHA ?? "";
const branch = process.env.GITHUB_REF_NAME ?? "";
const branchMatch = stableReleaseBranchPattern.exec(branch);
if (branchMatch?.[1] == null) {
  fail(`release-stable can only run from release/vX.Y.Z branches; got ${branch || "(empty)"}`);
}
const branchVersion = branchMatch[1];
if (branchVersion !== packagedVersion) {
  fail(`release branch version ${branchVersion} must match apps/packaged/package.json version ${packagedVersion}`);
}

const releases = await fetchReleases(repository);
const versionTag = `open-design-v${packagedVersion}`;

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

if (latestStable != null && compareVersions(packagedParsed, latestStable.parsed) <= 0) {
  fail(`packaged stable version ${packagedVersion} must be strictly greater than latest stable ${latestStable.value}`);
}

let releaseVersion = packagedVersion;
let releaseName = `Open Design ${packagedVersion}`;
let nightlyNumber = "";
let stateSource = channel === "nightly" ? "R2 metadata.json" : "GitHub Releases";

if (channel === "nightly") {
  const metadataUrl = process.env.OPEN_DESIGN_NIGHTLY_METADATA_URL;
  if (metadataUrl == null || metadataUrl.length === 0) {
    fail("OPEN_DESIGN_NIGHTLY_METADATA_URL is required for nightly channel");
  }
  validateHttpsUrl(metadataUrl, "OPEN_DESIGN_NIGHTLY_METADATA_URL");

  let nextNightlyNumber = 1;
  let latestNightly: ParsedNightlyVersion | null = null;
  const latestMetadataJson = await fetchOptionalHttpsText(metadataUrl);
  if (latestMetadataJson == null) {
    latestNightly = {
      baseVersion: packagedVersion,
      nightlyNumber: 0,
      nightlyVersion: `${packagedVersion}.nightly.0`,
    };
    stateSource = "missing R2 metadata.json fallback nightly.0";
    console.log("[release-stable] R2 nightly metadata.json: not found; using nightly.0 fallback");
  } else {
    latestNightly = parseNightlyMetadataJson(latestMetadataJson);
    console.log(`[release-stable] R2 nightly metadata.json version: ${latestNightly.nightlyVersion}`);
  }

  const existingBase = parseStableVersion(latestNightly.baseVersion);
  if (existingBase == null) {
    fail(`invalid nightly base version in ${stateSource}: ${latestNightly.baseVersion}`);
  }

  const ordering = compareVersions(packagedParsed, existingBase);
  if (ordering < 0) {
    fail(`packaged base version ${packagedVersion} regressed below current nightly base version ${latestNightly.baseVersion}`);
  }
  if (ordering === 0) {
    nextNightlyNumber = latestNightly.nightlyNumber + 1;
  }

  nightlyNumber = String(nextNightlyNumber);
  releaseVersion = `${packagedVersion}.nightly.${nightlyNumber}`;
  releaseName = `Open Design Nightly ${releaseVersion}`;
  console.log(`[release-stable] latest nightly: ${latestNightly.nightlyVersion}`);
} else {
  const stableNightly = await validateStableNightlyMetadata({
    branch,
    commit,
    nightlyVersionInput: process.env.OPEN_DESIGN_STABLE_NIGHTLY_VERSION,
    packagedVersion,
    publicOrigin: process.env.OPEN_DESIGN_RELEASES_PUBLIC_ORIGIN,
    repository,
  });
  stateSource = `R2 nightly metadata ${stableNightly.nightlyVersion}`;
  console.log(`[release-stable] validated nightly: ${stableNightly.nightlyVersion}`);
  console.log(`[release-stable] validated nightly metadata: ${stableNightly.metadataUrl}`);
}

console.log(`[release-stable] channel: ${channel}`);
console.log(`[release-stable] base version: ${packagedVersion}`);
console.log(`[release-stable] release version: ${releaseVersion}`);
if (channel === "stable") console.log(`[release-stable] version tag: ${versionTag}`);
console.log(`[release-stable] state source: ${stateSource}`);
if (latestStable != null) console.log(`[release-stable] previous stable: ${latestStable.value}`);

setOutput("base_version", packagedVersion);
setOutput("branch", branch);
setOutput("channel", channel);
setOutput("commit", commit);
setOutput("github_release_enabled", channel === "stable" ? "true" : "false");
setOutput("nightly_number", nightlyNumber);
setOutput("previous_stable", latestStable?.value ?? "");
setOutput("release_name", releaseName);
setOutput("release_version", releaseVersion);
setOutput("stable_version", packagedVersion);
setOutput("state_source", stateSource);
setOutput("version_tag", channel === "stable" ? versionTag : "");
