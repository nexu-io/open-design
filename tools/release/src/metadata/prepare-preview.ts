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
  fetchOptionalHttpsText as fetchOptionalHttpsTextRequest,
  readShellVersion,
  setGitHubOutput as setOutput,
  validateHttpsUrl,
} from "../lib/release-script.ts";

const previewReleaseBranchPattern = /^preview\/v(\d+\.\d+\.\d+)$/;

type ParsedStableVersion = {
  parsed: ReleaseBaseVersionTuple;
  source?: string;
  value: string;
};

function fail(message: string): never {
  console.error(`[release-preview] ${message}`);
  process.exit(1);
}

function parsePreviewBaseVersionInput(value: string | undefined, sourceName: string): ParsedStableVersion | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) return null;

  const parsed = parseReleaseBaseVersion(trimmed);
  if (parsed == null) {
    fail(`${sourceName} must be a stable x.y.z version; got ${trimmed}`);
  }

  return { parsed, source: sourceName, value: trimmed };
}

function resolvePreviewBaseVersion(branch: string, inputValue: string | undefined, packagedVersion: string): ParsedStableVersion {
  const branchMatch = previewReleaseBranchPattern.exec(branch);
  const branchVersion =
    branchMatch?.[1] == null
      ? null
      : ({
          parsed: parseReleaseBaseVersion(branchMatch[1]) ?? fail(`invalid preview branch version: ${branchMatch[1]}`),
          source: "GITHUB_REF_NAME",
          value: branchMatch[1],
        } satisfies ParsedStableVersion);
  const inputVersion = parsePreviewBaseVersionInput(inputValue, "OPEN_DESIGN_PREVIEW_VERSION");

  if (branchVersion != null) {
    if (inputVersion != null && inputVersion.value !== branchVersion.value) {
      fail(
        `OPEN_DESIGN_PREVIEW_VERSION ${inputVersion.value} must match preview branch version ${branchVersion.value} when both are provided`,
      );
    }
    return branchVersion;
  }

  if (inputVersion != null) return inputVersion;

  const packagedParsed = parseReleaseBaseVersion(packagedVersion) ?? fail(`invalid packaged version: ${packagedVersion}`);
  return { parsed: packagedParsed, source: "shells/electron/package.json", value: packagedVersion };
}

function fetchOptionalHttpsText(url: string, redirectCount = 0): Promise<string | null> {
  return fetchOptionalHttpsTextRequest(url, { feedLabel: "preview" }, redirectCount);
}

const packagedVersion = await readShellVersion(fail);
const branch = process.env.GITHUB_REF_NAME ?? "";
const profile = countedReleaseChannelProfile("preview");
const previewBaseVersion = resolvePreviewBaseVersion(branch, process.env.OPEN_DESIGN_PREVIEW_VERSION, packagedVersion);
const packagedParsed = previewBaseVersion.parsed;
if (previewBaseVersion.value !== packagedVersion) {
  fail(
    `${previewBaseVersion.source ?? "preview base"} version ${previewBaseVersion.value} must match shells/electron/package.json version ${packagedVersion}`,
  );
}

const tags = await fetchGitTags("open-design-v*");
let latestStable: ParsedStableVersion | null = null;
for (const tag of tags) {
  const stableVersion = extractStableVersionFromTag(tag);
  if (stableVersion == null) continue;

  if (latestStable == null || compareReleaseBaseVersions(stableVersion.parsed, latestStable.parsed) > 0) {
    latestStable = stableVersion;
  }
}

if (latestStable != null && compareReleaseBaseVersions(packagedParsed, latestStable.parsed) <= 0) {
  fail(`packaged base version ${packagedVersion} must be strictly greater than latest stable ${latestStable.value}`);
}

const metadataUrl = process.env.OPEN_DESIGN_PREVIEW_METADATA_URL;
if (metadataUrl == null || metadataUrl.length === 0) {
  fail("OPEN_DESIGN_PREVIEW_METADATA_URL is required");
}
validateHttpsUrl(metadataUrl, "OPEN_DESIGN_PREVIEW_METADATA_URL", fail);

let latestPreview: CountedReleaseState | null = null;
let stateSource = "R2 metadata.json";
const latestMetadataJson = await fetchOptionalHttpsText(metadataUrl);
if (latestMetadataJson == null) {
  latestPreview = {
    baseVersion: packagedVersion,
    releaseNumber: 0,
    releaseVersion: `${packagedVersion}-preview.0`,
  };
  stateSource = "missing R2 metadata.json fallback preview.0";
  console.log("[release-preview] R2 preview metadata.json: not found; using preview.0 fallback");
} else {
  try {
    latestPreview = parseCountedReleaseMetadata(profile, latestMetadataJson);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  console.log(`[release-preview] R2 preview metadata.json version: ${latestPreview.releaseVersion}`);
}

let nextPreview: CountedReleaseState;
try {
  nextPreview = nextCountedReleaseVersion({ allowRegression: false, baseVersion: packagedVersion, latest: latestPreview, profile });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const previewNumber = nextPreview.releaseNumber;
const previewVersion = nextPreview.releaseVersion;
const commit = process.env.GITHUB_SHA ?? "";
const releaseName = `Open Design Preview ${previewVersion}`;

console.log("[release-preview] channel: preview");
console.log(`[release-preview] base version: ${packagedVersion}`);
console.log(`[release-preview] preview version: ${previewVersion}`);
console.log(`[release-preview] preview state source: ${stateSource}`);
if (latestStable != null) console.log(`[release-preview] latest stable: ${latestStable.value}`);
if (latestPreview != null) console.log(`[release-preview] latest preview: ${latestPreview.releaseVersion}`);

setOutput("asset_version_suffix", "");
setOutput("base_version", packagedVersion);
setOutput("branch", branch);
setOutput("channel", "preview");
setOutput("commit", commit);
setOutput("github_release_enabled", "false");
setOutput("latest_stable", latestStable?.value ?? "");
setOutput("preview_number", String(previewNumber));
setOutput("preview_version", previewVersion);
setOutput("release_number", String(previewNumber));
setOutput("release_name", releaseName);
setOutput("release_version", previewVersion);
setOutput("state_source", stateSource);
