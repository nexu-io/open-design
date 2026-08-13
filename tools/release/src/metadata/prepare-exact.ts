import {
  compareReleaseBaseVersions,
  parseReleaseBaseVersion,
  releaseChannelDescriptor,
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
  console.error(`[release-exact] ${message}`);
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

async function fetchOptionalHttpsText(url: string, channel: string): Promise<string | null> {
  return fetchOptionalHttpsTextWithRetries(url, {
    feedLabel: channel,
    logPrefix: "release-exact",
  });
}

const channel = releaseChannelDescriptor(process.env.RELEASE_CHANNEL ?? "").channel;
if (channel === "stable" || channel === "prerelease") fail(`exact name cannot be reserved: ${channel}`);
const packagedVersion = await readShellVersion(fail);
const packagedParsed = parseReleaseBaseVersion(packagedVersion) ?? fail(`invalid packaged version: ${packagedVersion}`);
const profile = countedReleaseChannelProfile(channel);

let latestStable: ParsedStableVersion | null = null;
const stableMetadataUrl = process.env.OPEN_DESIGN_STABLE_METADATA_URL;
if (stableMetadataUrl != null && stableMetadataUrl.length > 0) {
  validateHttpsUrl(stableMetadataUrl, "OPEN_DESIGN_STABLE_METADATA_URL", fail);
  const stableMetadataJson = await fetchOptionalHttpsText(stableMetadataUrl, channel);
  if (stableMetadataJson == null) {
    fail(`stable metadata.json was not found: ${stableMetadataUrl}`);
  }
  latestStable = parseStableMetadataJson(stableMetadataJson);
  console.log(`[release-exact] stable metadata.json version: ${latestStable.value}`);
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
  fail(`packaged base version ${packagedVersion} must be strictly greater than latest stable ${latestStable.value}`);
}

const metadataUrl = process.env.OPEN_DESIGN_EXACT_METADATA_URL;
if (metadataUrl == null || metadataUrl.length === 0) {
  fail("OPEN_DESIGN_EXACT_METADATA_URL is required");
}
validateHttpsUrl(metadataUrl, "OPEN_DESIGN_EXACT_METADATA_URL", fail);

let latestExact: CountedReleaseState | null = null;
let stateSource = `${channel} metadata.json`;
const latestMetadataJson = await fetchOptionalHttpsText(metadataUrl, channel);
if (latestMetadataJson == null) {
  // Only HTTP 404 reaches this branch; other fetch failures throw above. This
  // is an intentional cold-start/reset behavior for a missing beta metadata
  // object, not a fallback to any updater feed or GitHub release state.
  latestExact = {
    baseVersion: packagedVersion,
    releaseNumber: 0,
    releaseVersion: `${packagedVersion}-${channel}.0`,
  };
  stateSource = `missing ${channel} metadata.json fallback ${channel}.0`;
  console.log(`[release-exact] ${channel} metadata.json: not found; using ${channel}.0 fallback`);
} else {
  try {
    latestExact = parseCountedReleaseMetadata(profile, latestMetadataJson);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  console.log(`[release-exact] ${channel} metadata.json version: ${latestExact.releaseVersion}`);
}

let nextExact: CountedReleaseState;
try {
  nextExact = nextCountedReleaseVersion({ allowRegression: false, baseVersion: packagedVersion, latest: latestExact, profile });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const releaseNumber = nextExact.releaseNumber;
const releaseVersion = nextExact.releaseVersion;
const branch = process.env.GITHUB_REF_NAME ?? "";
const commit = process.env.GITHUB_SHA ?? "";
const releaseName = `${releaseChannelDescriptor(channel).productName} ${releaseVersion}`;

console.log(`[release-exact] name: ${channel}`);
console.log(`[release-exact] base version: ${packagedVersion}`);
console.log(`[release-exact] version: ${releaseVersion}`);
console.log(`[release-exact] state source: ${stateSource}`);
if (latestStable != null) console.log(`[release-exact] latest stable: ${latestStable.value}`);
if (latestExact != null) console.log(`[release-exact] latest ${channel}: ${latestExact.releaseVersion}`);

setOutput("asset_version_suffix", "");
setOutput("base_version", packagedVersion);
setOutput("branch", branch);
setOutput("channel", channel);
setOutput("commit", commit);
setOutput("latest_stable", latestStable?.value ?? "");
setOutput("release_number", String(releaseNumber));
setOutput("release_name", releaseName);
setOutput("release_version", releaseVersion);
setOutput("state_source", stateSource);
