import { execFile as execFileCallback } from "node:child_process";
import { appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { get as httpsGet } from "node:https";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const stableVersionPattern = /^(\d+)\.(\d+)\.(\d+)$/;
const stableTagPattern = /^open-design-v(\d+\.\d+\.\d+)$/;
const previewReleaseBranchPattern = /^preview\/v(\d+\.\d+\.\d+)$/;
const previewVersionPattern = /^(\d+\.\d+\.\d+)-preview\.(\d+)$/;

type ParsedStableVersion = {
  parsed: [number, number, number];
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

function extractStableVersionFromTag(tag: string): ParsedStableVersion | null {
  const match = stableTagPattern.exec(tag);
  if (match?.[1] == null) return null;

  const parsed = parseStableVersion(match[1]);
  return parsed == null ? null : { parsed, value: match[1] };
}

function parsePreviewParts(baseVersion: string, previewNumber: string): ParsedPreviewVersion {
  const parsedPreviewNumber = Number(previewNumber);
  if (!Number.isSafeInteger(parsedPreviewNumber) || parsedPreviewNumber < 1) {
    fail(`invalid preview number in latest preview metadata: ${previewNumber}`);
  }

  return {
    baseVersion,
    previewNumber: parsedPreviewNumber,
    previewVersion: `${baseVersion}-preview.${previewNumber}`,
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
  const match = previewVersionPattern.exec(value);
  if (match?.[1] == null || match[2] == null) {
    fail(`${sourceName} previewVersion must be x.y.z-preview.N; got ${value}`);
  }
  return parsePreviewParts(match[1], match[2]);
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
  const previewVersion = readStringField(record, "previewVersion") ?? readStringField(record, "releaseVersion");
  const previewNumber = readNumberField(record, "previewNumber");
  const baseVersion = readStringField(record, "baseVersion");

  if (previewVersion != null) {
    const preview = parsePreviewVersion(previewVersion, "R2 preview metadata.json");
    if (baseVersion != null && baseVersion !== preview.baseVersion) {
      fail(`R2 preview metadata.json baseVersion ${baseVersion} does not match previewVersion ${preview.previewVersion}`);
    }
    if (previewNumber != null && previewNumber !== preview.previewNumber) {
      fail(`R2 preview metadata.json previewNumber ${previewNumber} does not match previewVersion ${preview.previewVersion}`);
    }
    return { ...preview, source: "metadata-json" };
  }

  if (baseVersion == null || previewNumber == null) {
    fail("R2 preview metadata.json must include previewVersion or baseVersion+previewNumber");
  }

  const parsedBase = parseStableVersion(baseVersion);
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

  if (!stableVersionPattern.test(packageJson.version)) {
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
const packagedParsed = parseStableVersion(packagedVersion) ?? fail(`invalid packaged version: ${packagedVersion}`);
const branch = process.env.GITHUB_REF_NAME ?? "";
const branchMatch = previewReleaseBranchPattern.exec(branch);
if (branchMatch?.[1] == null) {
  fail(`release-preview can only run from preview/vX.Y.Z branches; got ${branch || "(empty)"}`);
}
const branchVersion = branchMatch[1];
if (branchVersion !== packagedVersion) {
  fail(`preview branch version ${branchVersion} must match apps/packaged/package.json version ${packagedVersion}`);
}

const tags = await fetchGitTags("open-design-v*");
let latestStable: ParsedStableVersion | null = null;
for (const tag of tags) {
  const stableVersion = extractStableVersionFromTag(tag);
  if (stableVersion == null) continue;

  if (latestStable == null || compareVersions(stableVersion.parsed, latestStable.parsed) > 0) {
    latestStable = stableVersion;
  }
}

if (latestStable != null && compareVersions(packagedParsed, latestStable.parsed) <= 0) {
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
  const existingBase = parseStableVersion(preview.baseVersion);
  if (existingBase == null) {
    fail(`invalid preview base version in ${stateSource}: ${preview.baseVersion}`);
  }

  const ordering = compareVersions(packagedParsed, existingBase);
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
setOutput("release_name", releaseName);
setOutput("release_version", previewVersion);
setOutput("state_source", stateSource);
