import { appendFileSync, readFileSync } from "node:fs";

type ReleaseBaseVersion = {
  major: number;
  minor: number;
  patch: number;
};

function fail(message: string): never {
  throw new Error(`[daily-beta] ${message}`);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value == null || value.length === 0) fail(`${name} is required`);
  return value;
}

function setOutput(name: string, value: string): void {
  appendFileSync(requiredEnv("GITHUB_OUTPUT"), `${name}=${value}\n`, "utf8");
}

function parseReleaseBaseVersion(value: string, source: string): ReleaseBaseVersion {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (match == null) fail(`${source} must be x.y.z; got ${value}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareReleaseBaseVersions(left: ReleaseBaseVersion, right: ReleaseBaseVersion): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function readPackagedVersion(): string {
  const direct = process.env.PACKAGED_VERSION?.trim();
  if (direct != null && direct.length > 0) return direct;

  const packageJsonPath = requiredEnv("PACKAGED_PACKAGE_JSON_PATH");
  const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as unknown;
  if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
    fail(`${packageJsonPath} must contain a JSON object`);
  }
  const version = (parsed as Record<string, unknown>).version;
  if (typeof version !== "string" || version.length === 0) {
    fail(`${packageJsonPath} must contain a string version`);
  }
  return version;
}

function readMetadataRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    fail("beta metadata.json must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function finish(force: boolean, promote: boolean, reason: string, releaseVersion = ""): void {
  console.log(
    `[daily-beta] force: ${force ? "true" : "false"}; promote: ${promote ? "true" : "false"} (${reason})`,
  );
  setOutput("force", force ? "true" : "false");
  setOutput("promote", promote ? "true" : "false");
  setOutput("reason", reason);
  setOutput("release_version", releaseVersion);
}

const buildRef = requiredEnv("BUILD_REF");
if (buildRef !== "main") {
  console.log(`[daily-beta] recovery disabled for non-main ref ${buildRef}`);
  finish(false, true, "non-main-ref");
  process.exit(0);
}

const packagedVersion = readPackagedVersion();
const packagedBase = parseReleaseBaseVersion(packagedVersion, "packaged version");
const metadataUrl = new URL(requiredEnv("OPEN_DESIGN_BETA_METADATA_URL"));
if (metadataUrl.protocol !== "https:") fail("OPEN_DESIGN_BETA_METADATA_URL must use https");

const response = await fetch(metadataUrl, {
  headers: { accept: "application/json" },
  redirect: "error",
});
if (response.status === 404) {
  finish(false, true, "beta-metadata-missing");
  process.exit(0);
}
if (!response.ok) fail(`beta metadata request failed with HTTP ${response.status}`);

const metadata = readMetadataRecord(await response.json());
const baseVersion = metadata.baseVersion;
if (typeof baseVersion !== "string") fail("beta metadata.json baseVersion must be a string");
const betaBase = parseReleaseBaseVersion(baseVersion, "beta metadata.json baseVersion");

const github = metadata.github;
const githubRecord = typeof github === "object" && github != null && !Array.isArray(github)
  ? github as Record<string, unknown>
  : {};
const branch = typeof githubRecord.branch === "string" ? githubRecord.branch.trim() : "";

if (compareReleaseBaseVersions(betaBase, packagedBase) <= 0) {
  finish(false, true, "beta-not-ahead");
  process.exit(0);
}
if (branch.length === 0 || branch === "main") {
  finish(false, true, "ahead-beta-owned-by-main-or-unknown");
  process.exit(0);
}

console.log(`[daily-beta] recovering shared beta from foreign branch ${branch}`);
console.log(`[daily-beta] packaged ${packagedVersion} is behind shared beta base ${baseVersion}`);
const runNumber = requiredEnv("GITHUB_RUN_NUMBER");
if (!/^[1-9]\d*$/.test(runNumber)) fail(`GITHUB_RUN_NUMBER must be a positive integer; got ${runNumber}`);
finish(true, false, "foreign-ahead-beta", `${packagedVersion}-beta.${runNumber}`);
