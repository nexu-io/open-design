import { execFile as execFileCallback } from "node:child_process";
import { appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { get as httpsGet } from "node:https";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  compareReleaseBaseVersions,
  formatReleaseVersion,
  parseCountedReleaseVersion,
  parseReleaseBaseVersion,
  type ReleaseBaseVersionTuple,
} from "@open-design/release";

const execFile = promisify(execFileCallback);

const stableTagPattern = /^open-design-v(\d+\.\d+\.\d+)$/;
const previewReleaseBranchPattern = /^preview\/v(\d+\.\d+\.\d+)$/;

type ParsedStableVersion = {
  parsed: ReleaseBaseVersionTuple;
  source?: string;
  value: string;
};

type ParsedPreviewVersion = {
  baseVersion: string;
  previewNumber: number;
  previewVersion: string;
};

type ParsedPreviewMetadata = ParsedPreviewVersion & {
  source: "metadata-json";
};

function fail(message: string): never {
  console.error(`[release-preview] ${message}`);
  process.exit(1);
}

function extractStableVersionFromTag(tag: string): ParsedStableVersion | null {
  const match = stableTagPattern.exec(tag);
  if (match?.[1] == null) return null;

  const parsed = parseReleaseBaseVersion(match[1]);
  return parsed == null ? null : { parsed, value: match[1] };
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
  return { parsed: packagedParsed, source: "apps/packaged/package.json", value: packagedVersion };
}

function parsePreviewParts(baseVersion: string, previewNumber: string): ParsedPreviewVersion {
  const parsedPreviewNumber = Number(previewNumber);
  if (!Number.isSafeInteger(parsedPreviewNumber) || parsedPreviewNumber < 1) {
    fail(`invalid preview number in latest preview metadata: ${previewNumber}`);
  }

  return {
    baseVersion,
    previewNumber: parsedPreviewNumber,
    previewVersion: formatReleaseVersion("preview", baseVersion, parsedPreviewNumber),
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

function parsePreviewVersion(value: string, sourceName: string): ParsedPreviewVersion {
  const parsed = parseCountedReleaseVersion(value, "preview");
  if (parsed == null) {
    fail(`${sourceName} previewVersion must be x.y.z-preview.N; got ${value}`);
  }
  return {
    baseVersion: parsed.baseVersion,
    previewNumber: parsed.number,
    previewVersion: parsed.releaseVersion,
  };
}

function parsePreviewMetadataJson(value: string): ParsedPreviewMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    fail(`R2 preview metadata.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
    fail("R2 preview metadata.json must be a JSON object");
  }

  const record = parsed as Record<string, unknown>;
  const previewVersion = readStringField(record, "releaseVersion") ?? readStringField(record, "previewVersion");
  const previewNumber = readNumberField(record, "releaseNumber") ?? readNumberField(record, "previewNumber");
  const baseVersion = readStringField(record, "baseVersion");

  if (previewVersion != null) {
    const preview = parsePreviewVersion(previewVersion, "R2 preview metadata.json");
    if (baseVersion != null && baseVersion !== preview.baseVersion) {
      fail(`R2 preview metadata.json baseVersion ${baseVersion} does not match previewVersion ${preview.previewVersion}`);
    }
    if (previewNumber != null && previewNumber !== preview.previewNumber) {
      fail(`R2 preview metadata.json releaseNumber ${previewNumber} does not match releaseVersion ${preview.previewVersion}`);
    }
    return { ...preview, source: "metadata-json" };
  }

  if (baseVersion == null || previewNumber == null) {
    fail("R2 preview metadata.json must include releaseVersion or baseVersion+releaseNumber");
  }

  const parsedBase = parseReleaseBaseVersion(baseVersion);
  if (parsedBase == null) {
    fail(`R2 preview metadata.json baseVersion must be x.y.z; got ${baseVersion}`);
  }

  return { ...parsePreviewParts(baseVersion, String(previewNumber)), source: "metadata-json" };
}

async function readPackagedVersion(): Promise<string> {
  const packageJsonPath = join(process.cwd(), "apps", "packaged", "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };

  if (typeof packageJson.version !== "string") {
    fail(`missing version in ${packageJsonPath}`);
  }

  if (parseReleaseBaseVersion(packageJson.version) == null) {
    fail(`apps/packaged/package.json version must be a stable x.y.z base version; got ${packageJson.version}`);
  }

  return packageJson.version;
}

async function fetchGitTags(pattern: string): Promise<string[]> {
  const { stdout } = await execFile("git", ["tag", "--list", pattern]);
  return stdout
    .split("\n")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function fetchOptionalHttpsText(url: string, redirectCount = 0): Promise<string | null> {
  return new Promise((resolvePromise, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      reject(new Error(`expected HTTPS URL for preview feed lookup: ${parsed.protocol}`));
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
            reject(new Error("too many redirects while reading preview feed"));
            return;
          }
          const nextUrl = new URL(location, parsed).toString();
          fetchOptionalHttpsText(nextUrl, redirectCount + 1).then(resolvePromise, reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`preview feed request failed with HTTP ${statusCode}`));
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
      request.destroy(new Error("timed out while reading preview feed"));
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

const packagedVersion = await readPackagedVersion();
const branch = process.env.GITHUB_REF_NAME ?? "";
const previewBaseVersion = resolvePreviewBaseVersion(branch, process.env.OPEN_DESIGN_PREVIEW_VERSION, packagedVersion);
const packagedParsed = previewBaseVersion.parsed;
if (previewBaseVersion.value !== packagedVersion) {
  fail(
    `${previewBaseVersion.source ?? "preview base"} version ${previewBaseVersion.value} must match apps/packaged/package.json version ${packagedVersion}`,
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
validateHttpsUrl(metadataUrl, "OPEN_DESIGN_PREVIEW_METADATA_URL");

let previewNumber = 1;
let latestPreview: ParsedPreviewVersion | null = null;
let stateSource = "R2 metadata.json";
const latestMetadataJson = await fetchOptionalHttpsText(metadataUrl);
if (latestMetadataJson == null) {
  latestPreview = {
    baseVersion: packagedVersion,
    previewNumber: 0,
    previewVersion: `${packagedVersion}-preview.0`,
  };
  stateSource = "missing R2 metadata.json fallback preview.0";
  console.log("[release-preview] R2 preview metadata.json: not found; using preview.0 fallback");
} else {
  latestPreview = parsePreviewMetadataJson(latestMetadataJson);
  console.log(`[release-preview] R2 preview metadata.json version: ${latestPreview.previewVersion}`);
}

if (latestPreview != null) {
  const preview = latestPreview;
  const existingBase = parseReleaseBaseVersion(preview.baseVersion);
  if (existingBase == null) {
    fail(`invalid preview base version in ${stateSource}: ${preview.baseVersion}`);
  }

  const ordering = compareReleaseBaseVersions(packagedParsed, existingBase);
  if (ordering < 0) {
    fail(`packaged base version ${packagedVersion} regressed below current preview base version ${preview.baseVersion}`);
  }

  if (ordering === 0) {
    previewNumber = preview.previewNumber + 1;
  }
}

const previewVersion = `${packagedVersion}-preview.${previewNumber}`;
const commit = process.env.GITHUB_SHA ?? "";
const releaseName = `Open Design Preview ${previewVersion}`;

console.log("[release-preview] channel: preview");
console.log(`[release-preview] base version: ${packagedVersion}`);
console.log(`[release-preview] preview version: ${previewVersion}`);
console.log(`[release-preview] preview state source: ${stateSource}`);
if (latestStable != null) console.log(`[release-preview] latest stable: ${latestStable.value}`);
if (latestPreview != null) console.log(`[release-preview] latest preview: ${latestPreview.previewVersion}`);

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
