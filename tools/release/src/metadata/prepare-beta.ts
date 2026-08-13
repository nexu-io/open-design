import {
  compareReleaseBaseVersions,
  parseReleaseBaseVersion,
  type ReleaseBaseVersionTuple,
} from "@open-design/release";
import {
  nextCountedReleaseVersion,
  parseCountedReleaseMetadata,
  type CountedReleaseState,
} from "../channel/counted-version.ts";
import { countedReleaseChannelProfile } from "../channel/profiles.ts";
import {
  extractStableVersionFromTag,
  fetchGitTags,
  fetchOptionalHttpsTextWithRetries,
  readShellVersion,
  readStringField,
  setGitHubOutput as setOutput,
  validateHttpsUrl,
} from "../lib/release-script.ts";

type ParsedStableVersion = {
  parsed: ReleaseBaseVersionTuple;
  value: string;
};

function fail(message: string): never {
  console.error(`[release-beta] ${message}`);
  process.exit(1);
}

function parseStableMetadataJson(value: string): ParsedStableVersion {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.replace(/^\uFEFF/u, ""));
  } catch (error) {
    fail(`stable metadata.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
    fail("stable metadata.json must be a JSON object");
  }

  const record = parsed as Record<string, unknown>;
  const stableVersion = readStringField(record, "stableVersion") ?? readStringField(record, "releaseVersion");
  if (stableVersion == null) {
    fail("stable metadata.json must include stableVersion or releaseVersion");
  }

  const parsedStable = parseReleaseBaseVersion(stableVersion);
  if (parsedStable == null) {
    fail(`stable metadata.json stableVersion must be x.y.z; got ${stableVersion}`);
  }
  return { parsed: parsedStable, value: stableVersion };
}

async function fetchOptionalHttpsText(url: string): Promise<string | null> {
  return fetchOptionalHttpsTextWithRetries(url, {
    feedLabel: "beta",
    logPrefix: "release-beta",
  });
}

function readBooleanEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

const packagedVersion = await readShellVersion(fail);
const packagedParsed = parseReleaseBaseVersion(packagedVersion) ?? fail(`invalid packaged version: ${packagedVersion}`);
const force = readBooleanEnv("OPEN_DESIGN_RELEASE_FORCE") || readBooleanEnv("RELEASE_FORCE");
const profile = countedReleaseChannelProfile("beta");

let latestStable: ParsedStableVersion | null = null;
const stableMetadataUrl = process.env.OPEN_DESIGN_STABLE_METADATA_URL;
if (stableMetadataUrl != null && stableMetadataUrl.length > 0) {
  validateHttpsUrl(stableMetadataUrl, "OPEN_DESIGN_STABLE_METADATA_URL", fail);
  const stableMetadataJson = await fetchOptionalHttpsText(stableMetadataUrl);
  if (stableMetadataJson == null) {
    fail(`stable metadata.json was not found: ${stableMetadataUrl}`);
  }
  latestStable = parseStableMetadataJson(stableMetadataJson);
  console.log(`[release-beta] stable metadata.json version: ${latestStable.value}`);
} else {
  const tags = await fetchGitTags("open-design-v*");
  for (const tag of tags) {
    const stableVersion = extractStableVersionFromTag(tag);
    if (stableVersion == null) continue;

    if (latestStable == null || compareReleaseBaseVersions(stableVersion.parsed, latestStable.parsed) > 0) {
      latestStable = stableVersion;
    }
  }
}

if (latestStable != null && compareReleaseBaseVersions(packagedParsed, latestStable.parsed) <= 0) {
  if (!force) {
    fail(`packaged base version ${packagedVersion} must be strictly greater than latest stable ${latestStable.value}`);
  }
  console.warn(
    `[release-beta] force enabled: allowing packaged base version ${packagedVersion} against latest stable ${latestStable.value}`,
  );
}

const metadataUrl = process.env.OPEN_DESIGN_BETA_METADATA_URL;
if (metadataUrl == null || metadataUrl.length === 0) {
  fail("OPEN_DESIGN_BETA_METADATA_URL is required");
}
validateHttpsUrl(metadataUrl, "OPEN_DESIGN_BETA_METADATA_URL", fail);

let latestBeta: CountedReleaseState | null = null;
let stateSource = "beta metadata.json";
const latestMetadataJson = await fetchOptionalHttpsText(metadataUrl);
if (latestMetadataJson == null) {
  // Only HTTP 404 reaches this branch; other fetch failures throw above. This
  // is an intentional cold-start/reset behavior for a missing beta metadata
  // object, not a fallback to any updater feed or GitHub release state.
  latestBeta = {
    baseVersion: packagedVersion,
    releaseNumber: 0,
    releaseVersion: `${packagedVersion}-beta.0`,
  };
  stateSource = "missing beta metadata.json fallback beta.0";
  console.log("[release-beta] beta metadata.json: not found; using beta.0 fallback");
} else {
  try {
    latestBeta = parseCountedReleaseMetadata(profile, latestMetadataJson);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  console.log(`[release-beta] beta metadata.json version: ${latestBeta.releaseVersion}`);
}

if (latestBeta != null && force) {
  const existingBase = parseReleaseBaseVersion(latestBeta.baseVersion);
  if (existingBase != null && compareReleaseBaseVersions(packagedParsed, existingBase) < 0) {
    console.warn(`[release-beta] force enabled: ignoring current beta base version ${latestBeta.baseVersion} for packaged base version ${packagedVersion}`);
  }
}

let nextBeta: CountedReleaseState;
try {
  nextBeta = nextCountedReleaseVersion({ allowRegression: force, baseVersion: packagedVersion, latest: latestBeta, profile });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const betaNumber = nextBeta.releaseNumber;
const betaVersion = nextBeta.releaseVersion;
const branch = process.env.GITHUB_REF_NAME ?? "";
const commit = process.env.GITHUB_SHA ?? "";
const releaseName = `Open Design Beta ${betaVersion}`;

console.log(`[release-beta] channel: beta`);
console.log(`[release-beta] base version: ${packagedVersion}`);
console.log(`[release-beta] beta version: ${betaVersion}`);
console.log(`[release-beta] force: ${force ? "true" : "false"}`);
console.log(`[release-beta] beta state source: ${stateSource}`);
if (latestStable != null) console.log(`[release-beta] latest stable: ${latestStable.value}`);
if (latestBeta != null) console.log(`[release-beta] latest beta: ${latestBeta.releaseVersion}`);

setOutput("asset_version_suffix", "");
setOutput("base_version", packagedVersion);
setOutput("beta_number", String(betaNumber));
setOutput("beta_version", betaVersion);
setOutput("branch", branch);
setOutput("commit", commit);
setOutput("force", force ? "true" : "false");
setOutput("latest_stable", latestStable?.value ?? "");
setOutput("release_number", String(betaNumber));
setOutput("release_name", releaseName);
setOutput("release_version", betaVersion);
setOutput("state_source", stateSource);
