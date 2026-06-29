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

type ParsedStableVersion = {
  parsed: ReleaseBaseVersionTuple;
  value: string;
};

type ParsedBetasVersion = {
  baseVersion: string;
  releaseNumber: number;
  releaseVersion: string;
};

type ParsedBetasMetadata = ParsedBetasVersion & {
  source: "metadata-json";
};

function fail(message: string): never {
  console.error(`[release-betas] ${message}`);
  process.exit(1);
}

function extractStableVersionFromTag(tag: string): ParsedStableVersion | null {
  const match = stableTagPattern.exec(tag);
  if (match?.[1] == null) return null;

  const parsed = parseReleaseBaseVersion(match[1]);
  return parsed == null ? null : { parsed, value: match[1] };
}

function parseBetasParts(baseVersion: string, betasNumber: string): ParsedBetasVersion {
  const parsedBetasNumber = Number(betasNumber);
  if (!Number.isSafeInteger(parsedBetasNumber) || parsedBetasNumber < 1) {
    fail(`invalid betas number in latest betas metadata: ${betasNumber}`);
  }

  return {
    baseVersion,
    releaseNumber: parsedBetasNumber,
    releaseVersion: formatReleaseVersion("betas", baseVersion, parsedBetasNumber),
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

function parseBetasVersion(value: string, sourceName: string): ParsedBetasVersion {
  const parsed = parseCountedReleaseVersion(value, "betas");
  if (parsed == null) {
    fail(`${sourceName} releaseVersion must be x.y.z-betas.N; got ${value}`);
  }
  return {
    baseVersion: parsed.baseVersion,
    releaseNumber: parsed.number,
    releaseVersion: parsed.releaseVersion,
  };
}

function parseBetasMetadataJson(value: string): ParsedBetasMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.replace(/^\uFEFF/u, ""));
  } catch (error) {
    fail(`betas metadata.json is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
    fail("betas metadata.json must be a JSON object");
  }

  const record = parsed as Record<string, unknown>;
  const releaseVersion = readStringField(record, "releaseVersion");
  const releaseNumber = readNumberField(record, "releaseNumber");
  const baseVersion = readStringField(record, "baseVersion");

  if (releaseVersion != null) {
    const betas = parseBetasVersion(releaseVersion, "betas metadata.json");
    if (baseVersion != null && baseVersion !== betas.baseVersion) {
      fail(`betas metadata.json baseVersion ${baseVersion} does not match releaseVersion ${betas.releaseVersion}`);
    }
    if (releaseNumber != null && releaseNumber !== betas.releaseNumber) {
      fail(`betas metadata.json releaseNumber ${releaseNumber} does not match releaseVersion ${betas.releaseVersion}`);
    }
    return { ...betas, source: "metadata-json" };
  }

  if (baseVersion == null || releaseNumber == null) {
    fail("betas metadata.json must include releaseVersion or baseVersion+releaseNumber");
  }

  const parsedBase = parseReleaseBaseVersion(baseVersion);
  if (parsedBase == null) {
    fail(`betas metadata.json baseVersion must be x.y.z; got ${baseVersion}`);
  }

  return { ...parseBetasParts(baseVersion, String(releaseNumber)), source: "metadata-json" };
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

function fetchOptionalHttpsTextOnce(url: string, redirectCount = 0): Promise<string | null> {
  return new Promise((resolvePromise, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      reject(new Error(`expected HTTPS URL for betas feed lookup: ${parsed.protocol}`));
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
        if (statusCode === 403 || statusCode === 404) {
          response.resume();
          resolvePromise(null);
          return;
        }

        const location = response.headers.location;
        if (statusCode >= 300 && statusCode < 400 && typeof location === "string") {
          response.resume();
          if (redirectCount >= 3) {
            reject(new Error("too many redirects while reading betas feed"));
            return;
          }
          const nextUrl = new URL(location, parsed).toString();
          fetchOptionalHttpsTextOnce(nextUrl, redirectCount + 1).then(resolvePromise, reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`betas feed request failed with HTTP ${statusCode}`));
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
      request.destroy(new Error("timed out while reading betas feed"));
    });
    request.on("error", reject);
  });
}

async function fetchOptionalHttpsText(url: string): Promise<string | null> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchOptionalHttpsTextOnce(url);
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      const delayMs = 1_000 * attempt;
      console.warn(
        `[release-betas] metadata request failed (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs}ms: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
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
const packagedParsed = parseReleaseBaseVersion(packagedVersion) ?? fail(`invalid packaged version: ${packagedVersion}`);

let latestStable: ParsedStableVersion | null = null;
const stableMetadataUrl = process.env.OPEN_DESIGN_STABLE_METADATA_URL;
if (stableMetadataUrl != null && stableMetadataUrl.length > 0) {
  validateHttpsUrl(stableMetadataUrl, "OPEN_DESIGN_STABLE_METADATA_URL");
  const stableMetadataJson = await fetchOptionalHttpsText(stableMetadataUrl);
  if (stableMetadataJson == null) {
    fail(`stable metadata.json was not found: ${stableMetadataUrl}`);
  }
  latestStable = parseStableMetadataJson(stableMetadataJson);
  console.log(`[release-betas] stable metadata.json version: ${latestStable.value}`);
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

const metadataUrl = process.env.OPEN_DESIGN_BETAS_METADATA_URL;
if (metadataUrl == null || metadataUrl.length === 0) {
  fail("OPEN_DESIGN_BETAS_METADATA_URL is required");
}
validateHttpsUrl(metadataUrl, "OPEN_DESIGN_BETAS_METADATA_URL");

let releaseNumber = 1;
let latestBetas: ParsedBetasVersion | null = null;
let stateSource = "betas metadata.json";
const latestMetadataJson = await fetchOptionalHttpsText(metadataUrl);
if (latestMetadataJson == null) {
  // Only HTTP 404 reaches this branch; other fetch failures throw above. This
  // is an intentional cold-start/reset behavior for a missing betas metadata
  // object, not a fallback to any updater feed or GitHub release state.
  latestBetas = {
    baseVersion: packagedVersion,
    releaseNumber: 0,
    releaseVersion: `${packagedVersion}-betas.0`,
  };
  stateSource = "missing betas metadata.json fallback betas.0";
  console.log("[release-betas] betas metadata.json: not found; using betas.0 fallback");
} else {
  latestBetas = parseBetasMetadataJson(latestMetadataJson);
  console.log(`[release-betas] betas metadata.json version: ${latestBetas.releaseVersion}`);
}

if (latestBetas != null) {
  const betas = latestBetas;
  const existingBase = parseReleaseBaseVersion(betas.baseVersion);
  if (existingBase == null) {
    fail(`invalid betas base version in ${stateSource}: ${betas.baseVersion}`);
  }

  const ordering = compareReleaseBaseVersions(packagedParsed, existingBase);
  if (ordering < 0) {
    fail(`packaged base version ${packagedVersion} regressed below current betas base version ${betas.baseVersion}`);
  }

  if (ordering === 0) {
    releaseNumber = betas.releaseNumber + 1;
  }
}

const releaseVersion = `${packagedVersion}-betas.${releaseNumber}`;
const branch = process.env.GITHUB_REF_NAME ?? "";
const commit = process.env.GITHUB_SHA ?? "";
const releaseName = `Open Design Betas ${releaseVersion}`;

console.log(`[release-betas] channel: betas`);
console.log(`[release-betas] base version: ${packagedVersion}`);
console.log(`[release-betas] release version: ${releaseVersion}`);
console.log(`[release-betas] state source: ${stateSource}`);
if (latestStable != null) console.log(`[release-betas] latest stable: ${latestStable.value}`);
if (latestBetas != null) console.log(`[release-betas] latest betas: ${latestBetas.releaseVersion}`);

setOutput("asset_version_suffix", "");
setOutput("base_version", packagedVersion);
setOutput("release_number", String(releaseNumber));
setOutput("release_version", releaseVersion);
setOutput("branch", branch);
setOutput("commit", commit);
setOutput("latest_stable", latestStable?.value ?? "");
setOutput("release_name", releaseName);
setOutput("state_source", stateSource);
