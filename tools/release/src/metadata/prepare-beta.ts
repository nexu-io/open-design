import {
  compareReleaseBaseVersions,
  formatReleaseVersion,
  parseCountedReleaseVersion,
  parseReleaseBaseVersion,
  type ReleaseBaseVersionTuple,
} from "@open-design/release";
import {
  extractStableVersionFromTag,
  fetchGitTags,
  fetchOptionalHttpsTextWithRetries,
  readNumberField,
  readShellVersion,
  readStringField,
  setGitHubOutput as setOutput,
  validateHttpsUrl,
} from "../lib/release-script.ts";

type ParsedStableVersion = {
  parsed: ReleaseBaseVersionTuple;
  value: string;
};

type ParsedBetaVersion = {
  baseVersion: string;
  betaNumber: number;
  betaVersion: string;
};

type ParsedBetaMetadata = ParsedBetaVersion & {
  source: "metadata-json";
};

function fail(message: string): never {
  console.error(`[release-beta] ${message}`);
  process.exit(1);
}

function parseBetaParts(baseVersion: string, betaNumber: string): ParsedBetaVersion {
  const parsedBetaNumber = Number(betaNumber);
  if (!Number.isSafeInteger(parsedBetaNumber) || parsedBetaNumber < 1) {
    fail(`invalid beta number in latest beta metadata: ${betaNumber}`);
  }

  return {
    baseVersion,
    betaNumber: parsedBetaNumber,
    betaVersion: formatReleaseVersion("beta", baseVersion, parsedBetaNumber),
  };
}

function parseBetaVersion(value: string, sourceName: string): ParsedBetaVersion {
  const parsed = parseCountedReleaseVersion(value, "beta");
  if (parsed == null) {
    fail(`${sourceName} betaVersion must be x.y.z-beta.N; got ${value}`);
  }
  return {
    baseVersion: parsed.baseVersion,
    betaNumber: parsed.number,
    betaVersion: parsed.releaseVersion,
  };
}

function parseBetaMetadataJson(value: string): ParsedBetaMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.replace(/^\uFEFF/u, ""));
  } catch (error) {
    fail(`beta metadata.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
    fail("beta metadata.json must be a JSON object");
  }

  const record = parsed as Record<string, unknown>;
  // The unified release publisher stamps beta metadata.json with generic
  // releaseVersion/releaseNumber fields, while the legacy publisher used
  // betaVersion/betaNumber. Accept either spelling so the daily beta reader
  // survives whichever publisher last wrote the feed.
  const betaVersion = readStringField(record, "releaseVersion") ?? readStringField(record, "betaVersion");
  const betaNumber = readNumberField(record, "releaseNumber") ?? readNumberField(record, "betaNumber");
  const baseVersion = readStringField(record, "baseVersion");

  if (betaVersion != null) {
    const beta = parseBetaVersion(betaVersion, "beta metadata.json");
    if (baseVersion != null && baseVersion !== beta.baseVersion) {
      fail(`beta metadata.json baseVersion ${baseVersion} does not match betaVersion ${beta.betaVersion}`);
    }
    if (betaNumber != null && betaNumber !== beta.betaNumber) {
      fail(`beta metadata.json releaseNumber ${betaNumber} does not match releaseVersion ${beta.betaVersion}`);
    }
    return { ...beta, source: "metadata-json" };
  }

  if (baseVersion == null || betaNumber == null) {
    fail("beta metadata.json must include betaVersion/releaseVersion or baseVersion+betaNumber/releaseNumber");
  }

  const parsedBase = parseReleaseBaseVersion(baseVersion);
  if (parsedBase == null) {
    fail(`beta metadata.json baseVersion must be x.y.z; got ${baseVersion}`);
  }

  return { ...parseBetaParts(baseVersion, String(betaNumber)), source: "metadata-json" };
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

let betaNumber = 1;
let latestBeta: ParsedBetaVersion | null = null;
let stateSource = "beta metadata.json";
const latestMetadataJson = await fetchOptionalHttpsText(metadataUrl);
if (latestMetadataJson == null) {
  // Only HTTP 404 reaches this branch; other fetch failures throw above. This
  // is an intentional cold-start/reset behavior for a missing beta metadata
  // object, not a fallback to any updater feed or GitHub release state.
  latestBeta = {
    baseVersion: packagedVersion,
    betaNumber: 0,
    betaVersion: `${packagedVersion}-beta.0`,
  };
  stateSource = "missing beta metadata.json fallback beta.0";
  console.log("[release-beta] beta metadata.json: not found; using beta.0 fallback");
} else {
  latestBeta = parseBetaMetadataJson(latestMetadataJson);
  console.log(`[release-beta] beta metadata.json version: ${latestBeta.betaVersion}`);
}

if (latestBeta != null) {
  const beta = latestBeta;
  const existingBase = parseReleaseBaseVersion(beta.baseVersion);
  if (existingBase == null) {
    fail(`invalid beta base version in ${stateSource}: ${beta.baseVersion}`);
  }

  const ordering = compareReleaseBaseVersions(packagedParsed, existingBase);
  if (ordering < 0) {
    if (!force) {
      fail(`packaged base version ${packagedVersion} regressed below current beta base version ${beta.baseVersion}`);
    }
    console.warn(
      `[release-beta] force enabled: ignoring current beta base version ${beta.baseVersion} for packaged base version ${packagedVersion}`,
    );
  }

  if (ordering === 0) {
    betaNumber = beta.betaNumber + 1;
  }
}

const betaVersion = `${packagedVersion}-beta.${betaNumber}`;
const branch = process.env.GITHUB_REF_NAME ?? "";
const commit = process.env.GITHUB_SHA ?? "";
const releaseName = `Open Design Beta ${betaVersion}`;

console.log(`[release-beta] channel: beta`);
console.log(`[release-beta] base version: ${packagedVersion}`);
console.log(`[release-beta] beta version: ${betaVersion}`);
console.log(`[release-beta] force: ${force ? "true" : "false"}`);
console.log(`[release-beta] beta state source: ${stateSource}`);
if (latestStable != null) console.log(`[release-beta] latest stable: ${latestStable.value}`);
if (latestBeta != null) console.log(`[release-beta] latest beta: ${latestBeta.betaVersion}`);

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
