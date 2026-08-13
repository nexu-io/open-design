import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { Buffer } from "node:buffer";

import {
  compareReleaseBaseVersions,
  formatReleaseVersion,
  parseReleaseBaseVersion,
  parseReleaseVersion,
  releaseChannelDescriptor,
  releaseNamespace,
  type ReleaseBaseVersionTuple,
  type ReleaseChannel,
} from "@open-design/release";
import { parseCountedReleaseMetadata } from "../channel/counted-version.ts";
import { countedReleaseChannelProfile } from "../channel/profiles.ts";
import { releaseParameterMatrixFromEnv } from "../channel/parameter-matrix.ts";
import { validateStableQualification } from "../storage/stable-qualification.ts";
import {
  fetchOptionalHttpsText as fetchOptionalHttpsTextRequest,
  readShellVersion,
  readStringField,
  setGitHubOutput as setOutput,
  validateHttpsUrl,
} from "../lib/release-script.ts";

const execFile = promisify(execFileCallback);

const stableReleaseBranchPattern = /^release\/v(\d+\.\d+\.\d+)$/;
const stableTagPattern = /^open-design-v(\d+\.\d+\.\d+)$/;

type GitHubRelease = {
  draft?: boolean;
  name?: string | null;
  prerelease?: boolean;
  tag_name?: string;
};

type ParsedStableVersion = {
  parsed: ReleaseBaseVersionTuple;
  source?: string;
  value: string;
};

type ParsedPrereleaseVersion = {
  baseVersion: string;
  prereleaseNumber: number;
  prereleaseVersion: string;
};

type ParsedPrereleaseMetadata = ParsedPrereleaseVersion & {
  source: "metadata-json";
};

type StablePrereleaseValidation = {
  metadataUrl: string;
  prereleaseVersion: string;
  qualificationUrl: string;
};

type ReleaseNamespaces = {
  mac: string;
  macIntel: string;
  win: string;
};

type StableDryRunMode = "metadata" | "prepublish" | "";

function fail(message: string): never {
  console.error(`[release-stable] ${message}`);
  process.exit(1);
}

function log(message: string): void {
  const prefix = process.env.OPEN_DESIGN_RELEASE_CHANNEL === "prerelease" ? "release-prerelease" : "release-stable";
  console.log(`[${prefix}] ${message}`);
}

async function execGh(args: string[]): Promise<{ stdout: string }> {
  const nodeScript = process.env.OPEN_DESIGN_GH_NODE_SCRIPT;
  if (nodeScript != null && nodeScript.length > 0) {
    return execFile(process.execPath, [nodeScript, ...args]);
  }
  return execFile(process.env.OPEN_DESIGN_GH_BIN ?? "gh", args);
}

function parseChannel(value: string | undefined): ReleaseChannel {
  const channel = value == null || value.length === 0 ? "stable" : value;
  const descriptor = releaseChannelDescriptor(channel);
  if (descriptor.channel !== "stable" && descriptor.channel !== "prerelease") {
    fail(`OPEN_DESIGN_RELEASE_CHANNEL must be stable or prerelease; got ${channel}`);
  }
  return descriptor.channel;
}

function parseStableDryRunMode(value: string | undefined): StableDryRunMode {
  if (value == null || value.length === 0 || value === "false") return "";
  if (value === "true" || value === "metadata") return "metadata";
  if (value === "prepublish") return "prepublish";
  fail("OPEN_DESIGN_RELEASE_DRY_RUN must be metadata, prepublish, true, or false");
}

function parseBaseVersionInput(value: string | undefined, sourceName: string): ParsedStableVersion | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) return null;

  const parsed = parseReleaseBaseVersion(trimmed);
  if (parsed == null) {
    fail(`${sourceName} must be a stable x.y.z version; got ${trimmed}`);
  }

  return { parsed, source: sourceName, value: trimmed };
}

function parseReleaseBranchVersion(branch: string): ParsedStableVersion | null {
  const branchMatch = stableReleaseBranchPattern.exec(branch);
  if (branchMatch?.[1] == null) {
    return null;
  }

  return {
    parsed: parseReleaseBaseVersion(branchMatch[1]) ?? fail(`invalid release branch version: ${branchMatch[1]}`),
    source: "GITHUB_REF_NAME",
    value: branchMatch[1],
  } satisfies ParsedStableVersion;
}

function resolvePrereleaseBaseVersion(branch: string, inputValue: string | undefined): ParsedStableVersion {
  const branchVersion = parseReleaseBranchVersion(branch);
  const inputVersion = parseBaseVersionInput(inputValue, "OPEN_DESIGN_STABLE_VERSION");

  if (branchVersion != null) {
    if (inputVersion != null && inputVersion.value !== branchVersion.value) {
      fail(
        `OPEN_DESIGN_STABLE_VERSION ${inputVersion.value} must match release branch version ${branchVersion.value} when both are provided`,
      );
    }
    return branchVersion;
  }

  if (inputVersion != null) return inputVersion;

  fail("release-prerelease requires either a release/vX.Y.Z branch or OPEN_DESIGN_STABLE_VERSION");
}

function resolveStableBaseVersion(branch: string): ParsedStableVersion {
  const branchVersion = parseReleaseBranchVersion(branch);
  if (branchVersion == null) {
    fail(`release-stable requires GITHUB_REF_NAME to be release/vX.Y.Z; got ${branch.length > 0 ? branch : "(empty)"}`);
  }
  return branchVersion;
}

function releaseNamespaces(channel: ReleaseChannel): ReleaseNamespaces {
  return {
    mac: releaseNamespace(channel, "mac"),
    macIntel: releaseNamespace(channel, "macIntel"),
    win: releaseNamespace(channel, "win"),
  };
}

function extractStableVersion(release: GitHubRelease): ParsedStableVersion | null {
  const candidates = [release.tag_name, release.name].filter((value): value is string => typeof value === "string");

  for (const candidate of candidates) {
    const tagMatch = stableTagPattern.exec(candidate);
    const value = tagMatch?.[1] ?? candidate.match(/\b(\d+\.\d+\.\d+)\b/)?.[1];
    if (value == null) continue;

    const parsed = parseReleaseBaseVersion(value);
    if (parsed != null) return { parsed, value };
  }

  return null;
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

function parsePrereleaseVersion(value: string, sourceName: string): ParsedPrereleaseVersion {
  let parsed: ReturnType<typeof parseReleaseVersion>;
  try {
    parsed = parseReleaseVersion(value, "prerelease");
  } catch {
    fail(`${sourceName} prereleaseVersion must be x.y.z-prerelease.N; got ${value}`);
  }
  if (parsed.channel !== "prerelease") {
    fail(`${sourceName} prereleaseVersion must be x.y.z-prerelease.N; got ${value}`);
  }
  return {
    baseVersion: parsed.baseVersion,
    prereleaseNumber: parsed.number,
    prereleaseVersion: parsed.releaseVersion,
  };
}

function parsePrereleaseMetadataJson(value: string): ParsedPrereleaseMetadata {
  let parsed;
  try {
    parsed = parseCountedReleaseMetadata(countedReleaseChannelProfile("prerelease"), value);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  return {
    baseVersion: parsed.baseVersion,
    prereleaseNumber: parsed.releaseNumber,
    prereleaseVersion: parsed.releaseVersion,
    source: "metadata-json",
  };
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
  validateHttpsUrl(value, `${sourceName}.${field}`, fail);
  if (!value.startsWith(`${expectedVersionUrl}/`)) {
    fail(`${sourceName}.${field} must point under ${expectedVersionUrl}/; got ${value}`);
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

async function validateStablePrereleaseMetadata(options: {
  branch: string;
  commit: string;
  packagedVersion: string;
  prereleaseVersionInput: string | undefined;
  publicOrigin: string | undefined;
  repository: string;
}): Promise<StablePrereleaseValidation> {
  if (options.commit.length === 0) {
    fail("GITHUB_SHA is required to validate the stable channel prerelease gate");
  }

  const prereleaseVersionInput = options.prereleaseVersionInput?.trim() ?? "";
  if (prereleaseVersionInput.length === 0) {
    fail("OPEN_DESIGN_STABLE_PRERELEASE_VERSION is required when channel=stable; pass the exact validated prerelease version");
  }

  const prerelease = parsePrereleaseVersion(prereleaseVersionInput, "OPEN_DESIGN_STABLE_PRERELEASE_VERSION");
  if (prerelease.baseVersion !== options.packagedVersion) {
    fail(
      `stable channel prerelease gate requires base version ${options.packagedVersion}; got ${prerelease.prereleaseVersion}`,
    );
  }

  const publicOrigin = trimTrailingSlash(
    options.publicOrigin ?? fail("OPEN_DESIGN_RELEASES_PUBLIC_ORIGIN is required when channel=stable"),
  );
  validateHttpsUrl(publicOrigin, "OPEN_DESIGN_RELEASES_PUBLIC_ORIGIN", fail);

  const expectedVersionPrefix = `prerelease/versions/${prerelease.prereleaseVersion}`;
  const expectedVersionUrl = `${publicOrigin}/${expectedVersionPrefix}`;
  const metadataUrl = `${expectedVersionUrl}/metadata.json`;
  const metadataJson = await fetchOptionalHttpsText(metadataUrl);
  if (metadataJson == null) {
    fail(`required prerelease metadata was not found: ${metadataUrl}`);
  }

  const sourceName = "R2 stable-channel prerelease metadata";
  const metadata = parseJsonRecord(metadataJson, sourceName);
  const parsedPrerelease = parsePrereleaseMetadataJson(metadataJson);
  if (parsedPrerelease.prereleaseVersion !== prerelease.prereleaseVersion) {
    fail(
      `${sourceName}.releaseVersion must be ${prerelease.prereleaseVersion}; got ${parsedPrerelease.prereleaseVersion}`,
    );
  }

  expectStringField(metadata, "channel", "prerelease", sourceName);
  expectStringField(metadata, "releaseVersion", prerelease.prereleaseVersion, sourceName);
  expectStringField(metadata, "baseVersion", options.packagedVersion, sourceName);
  expectStringField(metadata, "releaseState", "complete", sourceName);
  expectStringField(metadata, "amrProfile", "prod", sourceName);

  const parameterMatrix = requireObjectField(metadata, "parameterMatrix", sourceName);
  const requestedMatrix = releaseParameterMatrixFromEnv();
  if (
    requestedMatrix.mac_arm64.signMode !== "notarized"
    || requestedMatrix.mac_x64.signMode !== "notarized"
  ) {
    fail("stable release requires notarized mac_arm64 and mac_x64 parameters");
  }
  const macArm64Parameters = requireObjectField(parameterMatrix, "mac_arm64", `${sourceName}.parameterMatrix`);
  const macX64Parameters = requireObjectField(parameterMatrix, "mac_x64", `${sourceName}.parameterMatrix`);
  const winX64Parameters = requireObjectField(parameterMatrix, "win_x64", `${sourceName}.parameterMatrix`);
  expectStringField(macArm64Parameters, "signMode", requestedMatrix.mac_arm64.signMode, `${sourceName}.parameterMatrix.mac_arm64`);
  expectStringField(macX64Parameters, "signMode", requestedMatrix.mac_x64.signMode, `${sourceName}.parameterMatrix.mac_x64`);
  expectStringField(winX64Parameters, "signMode", requestedMatrix.win_x64.signMode, `${sourceName}.parameterMatrix.win_x64`);

  const github = requireObjectField(metadata, "github", sourceName);
  expectStringField(github, "branch", options.branch, `${sourceName}.github`);
  expectStringField(github, "commit", options.commit, `${sourceName}.github`);
  expectStringField(github, "repository", options.repository, `${sourceName}.github`);
  expectStringField(github, "workflow", "release-prerelease", `${sourceName}.github`);

  const r2 = requireObjectField(metadata, "r2", sourceName);
  expectStringField(r2, "versionPrefix", expectedVersionPrefix, `${sourceName}.r2`);
  expectStringField(r2, "versionMetadataUrl", metadataUrl, `${sourceName}.r2`);
  const report = requireObjectField(r2, "report", `${sourceName}.r2`);
  const reportType = readStringField(report, "type");
  if (reportType !== "zip" && reportType !== "directory") {
    fail(`${sourceName}.r2.report.type must be zip or directory; got ${reportType ?? "(missing)"}`);
  }
  requireVersionedUrlField(report, "url", expectedVersionUrl, `${sourceName}.r2.report`);
  const reportZipUrl = readStringField(r2, "reportZipUrl");
  if (reportZipUrl != null) {
    validateHttpsUrl(reportZipUrl, `${sourceName}.r2.reportZipUrl`, fail);
    if (!reportZipUrl.startsWith(`${expectedVersionUrl}/`)) {
      fail(`${sourceName}.r2.reportZipUrl must point under ${expectedVersionUrl}/; got ${reportZipUrl}`);
    }
  }

  const platforms = requireObjectField(metadata, "platforms", sourceName);
  const mac = requireObjectField(platforms, "mac", `${sourceName}.platforms`);
  expectBooleanField(mac, "enabled", true, `${sourceName}.platforms.mac`);
  expectStringField(mac, "arch", "arm64", `${sourceName}.platforms.mac`);
  expectStringField(mac, "signMode", requestedMatrix.mac_arm64.signMode, `${sourceName}.platforms.mac`);
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
  expectStringField(macIntel, "signMode", requestedMatrix.mac_x64.signMode, `${sourceName}.platforms.macIntel`);
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
  expectStringField(win, "signMode", requestedMatrix.win_x64.signMode, `${sourceName}.platforms.win`);
  const winArtifacts = requireObjectField(win, "artifacts", `${sourceName}.platforms.win`);
  const winInstaller = requireObjectField(winArtifacts, "installer", `${sourceName}.platforms.win.artifacts`);
  requireVersionedUrlField(winInstaller, "url", expectedVersionUrl, `${sourceName}.platforms.win.artifacts.installer`);
  requireVersionedUrlField(winInstaller, "sha256Url", expectedVersionUrl, `${sourceName}.platforms.win.artifacts.installer`);

  const qualificationUrl = `${expectedVersionUrl}/qualification.json`;
  const qualificationJson = await fetchOptionalHttpsText(qualificationUrl);
  if (qualificationJson == null) {
    fail(`required stable qualification was not found: ${qualificationUrl}`);
  }
  try {
    validateStableQualification({
      metadataBytes: Buffer.from(metadataJson, "utf8"),
      metadataUrl,
      qualification: parseJsonRecord(qualificationJson, "R2 stable qualification"),
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  return {
    metadataUrl,
    prereleaseVersion: prerelease.prereleaseVersion,
    qualificationUrl,
  };
}

async function fetchReleases(repository: string): Promise<GitHubRelease[]> {
  const releases: GitHubRelease[] = [];
  for (let page = 1; ; page += 1) {
    const { stdout } = await execGh(["api", `repos/${repository}/releases?per_page=100&page=${page}`]);
    const batch = JSON.parse(stdout) as GitHubRelease[];
    if (batch.length === 0) break;
    releases.push(...batch);
  }
  return releases;
}

function fetchOptionalHttpsText(url: string, redirectCount = 0): Promise<string | null> {
  return fetchOptionalHttpsTextRequest(url, { feedLabel: "prerelease" }, redirectCount);
}

const repository = process.env.GITHUB_REPOSITORY ?? fail("GITHUB_REPOSITORY is required");
const channel = parseChannel(process.env.OPEN_DESIGN_RELEASE_CHANNEL);
const stableDryRunMode = channel === "stable" ? parseStableDryRunMode(process.env.OPEN_DESIGN_RELEASE_DRY_RUN) : "";
const dryRun = stableDryRunMode.length > 0;
const runPrepublishJobs = channel !== "stable" || stableDryRunMode === "prepublish" || stableDryRunMode === "";
const publishSideEffectsEnabled = channel !== "stable" || stableDryRunMode === "";
if (
  channel === "stable"
  && publishSideEffectsEnabled
  && process.env.OPEN_DESIGN_STABLE_WIN_X64_SMOKE_MODE === "skip"
) {
  fail("stable publish requires win_x64_smoke_mode core or full");
}
const namespaces = releaseNamespaces(channel);
const packagedVersion = await readShellVersion(fail);
const commit = process.env.GITHUB_SHA ?? "";
const branch = process.env.GITHUB_REF_NAME ?? "";
const stableBaseVersion =
  channel === "stable"
    ? resolveStableBaseVersion(branch)
    : resolvePrereleaseBaseVersion(branch, process.env.OPEN_DESIGN_STABLE_VERSION);
const packagedParsed = stableBaseVersion.parsed;
if (stableBaseVersion.value !== packagedVersion) {
  fail(
    `${stableBaseVersion.source ?? "release base"} version ${stableBaseVersion.value} must match shells/electron/package.json version ${packagedVersion}`,
  );
}

const releases = await fetchReleases(repository);
const versionTag = `open-design-v${packagedVersion}`;

let latestStable: ParsedStableVersion | null = null;
for (const release of releases) {
  if (release.draft === true || release.prerelease === true) continue;

  const parsedRelease = extractStableVersion(release);
  if (parsedRelease == null) continue;

  if (release.tag_name === versionTag) {
    fail(`stable release ${versionTag} already exists; bump shells/electron/package.json before publishing`);
  }

  if (latestStable == null || compareReleaseBaseVersions(parsedRelease.parsed, latestStable.parsed) > 0) {
    latestStable = parsedRelease;
  }
}

if (latestStable != null && compareReleaseBaseVersions(packagedParsed, latestStable.parsed) <= 0) {
  fail(`packaged stable version ${packagedVersion} must be strictly greater than latest stable ${latestStable.value}`);
}

let releaseVersion = packagedVersion;
let releaseName = `Open Design ${packagedVersion}`;
let prereleaseNumber = "";
let stateSource = channel === "prerelease" ? "R2 metadata.json" : "GitHub Releases";

if (channel === "prerelease") {
  const metadataUrl = process.env.OPEN_DESIGN_PRERELEASE_METADATA_URL;
  if (metadataUrl == null || metadataUrl.length === 0) {
    fail("OPEN_DESIGN_PRERELEASE_METADATA_URL is required for prerelease channel");
  }
  validateHttpsUrl(metadataUrl, "OPEN_DESIGN_PRERELEASE_METADATA_URL", fail);

  let nextPrereleaseNumber = 1;
  let latestPrerelease: ParsedPrereleaseVersion | null = null;
  const latestMetadataJson = await fetchOptionalHttpsText(metadataUrl);
  if (latestMetadataJson == null) {
    latestPrerelease = {
      baseVersion: packagedVersion,
      prereleaseNumber: 0,
      prereleaseVersion: `${packagedVersion}-prerelease.0`,
    };
    stateSource = "missing R2 metadata.json fallback prerelease.0";
    log("R2 prerelease metadata.json: not found; using prerelease.0 fallback");
  } else {
    latestPrerelease = parsePrereleaseMetadataJson(latestMetadataJson);
    log(`R2 prerelease metadata.json version: ${latestPrerelease.prereleaseVersion}`);
  }

  const existingBase = parseReleaseBaseVersion(latestPrerelease.baseVersion);
  if (existingBase == null) {
    fail(`invalid prerelease base version in ${stateSource}: ${latestPrerelease.baseVersion}`);
  }

  const ordering = compareReleaseBaseVersions(packagedParsed, existingBase);
  if (ordering < 0) {
    fail(`packaged base version ${packagedVersion} regressed below current prerelease base version ${latestPrerelease.baseVersion}`);
  }
  if (ordering === 0) {
    nextPrereleaseNumber = latestPrerelease.prereleaseNumber + 1;
  }

  prereleaseNumber = String(nextPrereleaseNumber);
  releaseVersion = formatReleaseVersion("prerelease", packagedVersion, nextPrereleaseNumber);
  releaseName = `Open Design Prerelease ${releaseVersion}`;
  log(`latest prerelease: ${latestPrerelease.prereleaseVersion}`);
} else {
  const stablePrerelease = await validateStablePrereleaseMetadata({
    branch: `release/v${stableBaseVersion.value}`,
    commit,
    packagedVersion,
    prereleaseVersionInput: process.env.OPEN_DESIGN_STABLE_PRERELEASE_VERSION,
    publicOrigin: process.env.OPEN_DESIGN_RELEASES_PUBLIC_ORIGIN,
    repository,
  });
  stateSource = `R2 prerelease metadata ${stablePrerelease.prereleaseVersion}`;
  log(`validated prerelease: ${stablePrerelease.prereleaseVersion}`);
  log(`validated prerelease metadata: ${stablePrerelease.metadataUrl}`);
  log(`validated stable qualification: ${stablePrerelease.qualificationUrl}`);
}

log(`channel: ${channel}`);
log(`base version: ${packagedVersion}`);
log(`release version: ${releaseVersion}`);
log(`namespace: ${namespaces.mac}`);
log(`dry run: ${String(dryRun)}`);
if (channel === "stable" && stableDryRunMode.length > 0) log(`dry run mode: ${stableDryRunMode}`);
if (channel === "stable") log(`version tag: ${versionTag}`);
log(`state source: ${stateSource}`);
if (latestStable != null) log(`previous stable: ${latestStable.value}`);

setOutput("base_version", packagedVersion);
setOutput("branch", branch);
setOutput("channel", channel);
setOutput("commit", commit);
setOutput("dry_run", dryRun ? "true" : "false");
setOutput("dry_run_mode", stableDryRunMode);
setOutput("github_release_enabled", channel === "stable" && publishSideEffectsEnabled ? "true" : "false");
setOutput("mac_intel_namespace", namespaces.macIntel);
setOutput("namespace", namespaces.mac);
setOutput("publish_side_effects_enabled", publishSideEffectsEnabled ? "true" : "false");
setOutput("prerelease_number", prereleaseNumber);
setOutput("previous_stable", latestStable?.value ?? "");
setOutput("release_number", prereleaseNumber);
setOutput("release_name", releaseName);
setOutput("release_version", releaseVersion);
setOutput("run_prepublish_jobs", runPrepublishJobs ? "true" : "false");
setOutput("stable_version", packagedVersion);
setOutput("state_source", stateSource);
setOutput("version_tag", channel === "stable" ? versionTag : "");
setOutput("win_namespace", namespaces.win);
