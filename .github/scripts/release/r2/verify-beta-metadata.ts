function required(name) {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optional(name, fallback = "") {
  const value = process.env[name];
  return value == null || value.length === 0 ? fallback : value;
}

function enabled(name) {
  return process.env[name] === "true";
}

async function fetchText(url) {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}run=${process.env.GITHUB_RUN_ID ?? "local"}`, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}`);
  }
  return await response.text();
}

async function head(url) {
  const response = await fetch(url, { method: "HEAD" });
  if (!response.ok) {
    throw new Error(`HEAD ${url} failed with HTTP ${response.status}`);
  }
}

function joinUrl(base, path) {
  return `${base.replace(/\/+$/, "")}/${path}`;
}

function reportFilesFor(key) {
  if (key === "mac") {
    return [
      "manifest.json",
      "screenshots/open-design-mac-smoke.png",
      "suite-result.json",
      "tools-pack.json",
      "tools-pack.log",
      "vitest.log",
    ];
  }
  if (key === "win") {
    return [
      "manifest.json",
      "screenshots/open-design-win-smoke.png",
      "suite-result.json",
      "tools-pack.json",
      "vitest.log",
    ];
  }
  if (key === "linux") {
    return ["manifest.json", "screenshots/open-design-linux-smoke.png", "vitest.log"];
  }
  return [];
}

async function verifyReport(def, platform) {
  const expectedFiles = reportFilesFor(def.key);
  if (expectedFiles.length === 0) return;
  if (platform.report == null || platform.report.type !== "directory" || platform.report.url == null) {
    throw new Error(`${def.key} is missing release report metadata`);
  }
  if (typeof platform.report.fileCount !== "number" || platform.report.fileCount <= 0) {
    throw new Error(`${def.key} release report has no files`);
  }
  for (const file of expectedFiles) {
    await head(joinUrl(platform.report.url, file));
  }
}

const metadataUrl = required("R2_METADATA_URL");
const releaseVersion = required("RELEASE_VERSION");
const metadata = JSON.parse(await fetchText(metadataUrl));

if (metadata.channel !== "beta") {
  throw new Error(`unexpected metadata channel: ${metadata.channel}`);
}
if (metadata.betaVersion !== releaseVersion) {
  throw new Error(`unexpected metadata betaVersion: ${metadata.betaVersion}`);
}

const platformDefs = [
  { env: "ENABLE_MAC", key: "mac", result: optional("MAC_RESULT", "skipped") },
  { env: "ENABLE_WIN", key: "win", result: optional("WIN_RESULT", "skipped") },
  { env: "ENABLE_LINUX", key: "linux", result: optional("LINUX_RESULT", "skipped") },
  { env: "ENABLE_MAC_INTEL", key: "macIntel", result: optional("MAC_INTEL_RESULT", "skipped") },
];
const expected = platformDefs.filter((def) => enabled(def.env));
const expectedKeys = expected.map((def) => def.key).sort();
const metadataExpected = [...(metadata.expectedPlatforms ?? [])].sort();
if (JSON.stringify(expectedKeys) !== JSON.stringify(metadataExpected)) {
  throw new Error(`unexpected expectedPlatforms: ${JSON.stringify(metadata.expectedPlatforms)}`);
}

const expectedReady = expected.filter((def) => def.result === "success").map((def) => def.key).sort();
const metadataReady = [...(metadata.readyPlatforms ?? [])].sort();
if (JSON.stringify(expectedReady) !== JSON.stringify(metadataReady)) {
  throw new Error(`unexpected readyPlatforms: ${JSON.stringify(metadata.readyPlatforms)}`);
}

const expectedReleaseState =
  expectedReady.length === expected.length ? "complete" : expectedReady.length > 0 ? "partial" : "failed";
if (metadata.releaseState !== expectedReleaseState) {
  throw new Error(`unexpected releaseState: ${metadata.releaseState}; expected ${expectedReleaseState}`);
}

for (const def of expected) {
  const platform = metadata.platforms?.[def.key];
  if (platform == null) {
    throw new Error(`metadata missing platform ${def.key}`);
  }
  if (def.result !== "success") {
    if (platform.status !== "failed" && platform.status !== "missing") {
      throw new Error(`unexpected failed platform status for ${def.key}: ${platform.status}`);
    }
    continue;
  }
  if (platform.status !== "published") {
    throw new Error(`unexpected platform status for ${def.key}: ${platform.status}`);
  }
  for (const artifact of Object.values(platform.artifacts ?? {})) {
    await head(artifact.url);
    if (artifact.sha256Url != null) {
      await head(artifact.sha256Url);
    }
  }
  if (platform.feed?.latestUrl != null) {
    const feed = await fetchText(platform.feed.latestUrl);
    if (!feed.includes(`version: "${releaseVersion}"`)) {
      throw new Error(`${def.key} feed does not reference ${releaseVersion}`);
    }
  }
  if (platform.r2?.versionManifestUrl != null) {
    await head(platform.r2.versionManifestUrl);
  }
  if (platform.r2?.latestManifestUrl != null) {
    await head(platform.r2.latestManifestUrl);
  }
  await verifyReport(def, platform);
}

console.log(`verified beta metadata ${metadataUrl} (${metadata.releaseState})`);
