// Stage a PUBLISHED release artifact for the packaged smoke, instead of a
// locally built one.
//
// The packaged smoke used to run on the same runner that produced the package,
// against `<toolsPackDir>/out/...` as electron-builder left it. That coupled the
// smoke to the build job — which is what kept the release workflow's
// repository-wide concurrency group held long after the package had shipped —
// and it tested a directory tree no user ever sees.
//
// `tools-pack <platform> install` reads exactly one file, at a path it derives
// from `--dir` and `--namespace` (tools/pack/src/{mac,win}/paths.ts). So the
// smoke can run anywhere: download that one artifact out of R2, write it to
// that path, and every later `tools-pack` verb behaves as if the build had
// happened here.
//
// Two modes:
//   plan  — read the published version metadata and report which targets exist
//   stage — download one target's artifact into the tools-pack layout
//
// Both read the metadata.json that `tools-release publish-metadata` wrote, so
// the artifact URL is the published one rather than a name reconstructed here.

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type ReleaseTarget = "mac_arm64" | "mac_x64" | "win_x64" | "linux_x64";

type AssetEntry = { name?: unknown; sha256Url?: unknown; size?: unknown; url?: unknown };
type TargetEntry = { artifacts?: Record<string, AssetEntry>; status?: unknown };
type VersionMetadata = {
  channel?: unknown;
  releaseVersion?: unknown;
  releaseTargets?: Record<string, TargetEntry>;
};

/**
 * The artifact each platform's smoke installs. Mac installs the DMG it mounts;
 * Windows installs the NSIS setup. The payload/zip artifacts are updater inputs
 * and belong to the `full` Windows profile, which builds its own fixture.
 */
const PRIMARY_ARTIFACT: Record<ReleaseTarget, string> = {
  mac_arm64: "dmg",
  mac_x64: "dmg",
  win_x64: "installer",
  linux_x64: "appImage",
};

function required(name: string): string {
  const value = process.env[name];
  if (value == null || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function optional(name: string, fallback = ""): string {
  const value = process.env[name];
  return value == null || value.length === 0 ? fallback : value;
}

function setOutput(key: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  console.log(`${key}=${value}`);
  if (file == null || file.length === 0) return;
  appendFileSync(file, `${key}=${value}\n`, "utf8");
}

function sanitizeNamespace(value: string): string {
  // Mirrors sanitizeNamespace in tools/pack/src/{mac,win}/paths.ts. The token is
  // what ends up in the artifact filename tools-pack looks for.
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

async function fetchJson(url: string): Promise<VersionMetadata> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`GET ${url} failed: HTTP ${response.status}`);
  return (await response.json()) as VersionMetadata;
}

function publishedTargets(metadata: VersionMetadata): ReleaseTarget[] {
  const targets = metadata.releaseTargets ?? {};
  const published: ReleaseTarget[] = [];
  for (const target of ["mac_arm64", "mac_x64", "win_x64", "linux_x64"] as const) {
    const entry = targets[target];
    // A target that did not build carries `{status: "missing"|"failed"}` with no
    // `artifacts` key at all, so `status` is the only safe thing to branch on.
    if (entry?.status === "published" && entry.artifacts != null) published.push(target);
  }
  return published;
}

function assetOf(metadata: VersionMetadata, target: ReleaseTarget): { name: string; sha256Url: string; url: string } {
  const entry = metadata.releaseTargets?.[target];
  if (entry?.status !== "published" || entry.artifacts == null) {
    throw new Error(`release target ${target} is not published in this metadata (status=${String(entry?.status)})`);
  }
  const key = PRIMARY_ARTIFACT[target];
  const asset = entry.artifacts[key];
  if (asset == null || typeof asset.url !== "string" || asset.url.length === 0) {
    throw new Error(`release target ${target} has no ${key} artifact url`);
  }
  return {
    name: typeof asset.name === "string" ? asset.name : key,
    sha256Url: typeof asset.sha256Url === "string" ? asset.sha256Url : "",
    url: asset.url,
  };
}

/**
 * Where `tools-pack <platform> install` looks. Keep in lockstep with
 * resolveMacPaths().dmgPath and resolveWinPaths().setupPath.
 */
function artifactDestination(target: ReleaseTarget, toolsPackDir: string, namespace: string): string {
  const token = sanitizeNamespace(namespace);
  if (target === "win_x64") {
    return join(toolsPackDir, "out", "win", "namespaces", namespace, "builder", `Open Design-${token}-setup.exe`);
  }
  if (target === "linux_x64") {
    return join(toolsPackDir, "out", "linux", "namespaces", namespace, "builder", `Open Design-${token}.AppImage`);
  }
  return join(toolsPackDir, "out", "mac", "namespaces", namespace, "dmg", `Open Design-${token}.dmg`);
}

async function download(url: string, destination: string): Promise<{ bytes: number; sha256: string }> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`GET ${url} failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, buffer);
  return { bytes: buffer.byteLength, sha256: createHash("sha256").update(buffer).digest("hex") };
}

async function verifyChecksum(sha256Url: string, actual: string): Promise<void> {
  if (sha256Url.length === 0) {
    console.warn(`::warning::published artifact carries no sha256 sidecar; downloaded bytes were not verified`);
    return;
  }
  const response = await fetch(sha256Url, { redirect: "follow" });
  if (!response.ok) throw new Error(`GET ${sha256Url} failed: HTTP ${response.status}`);
  // `shasum -a 256 <name>` / PowerShell both write "<hash>  <name>".
  const expected = (await response.text()).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (expected.length === 0) throw new Error(`sha256 sidecar at ${sha256Url} was empty`);
  if (expected !== actual) {
    throw new Error(`downloaded artifact sha256 ${actual} does not match published ${expected}`);
  }
  console.log(`sha256 verified: ${actual}`);
}

/**
 * `e2e/scripts/release-smoke.ts` refuses to start without a readable build json,
 * and `tools-release write-report` throws on a zero-byte one. Nothing on the
 * core smoke path parses its contents, so a stand-in only has to be honest
 * about where the artifact came from and be valid JSON.
 */
function writeBuildJson(path: string, body: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

async function plan(): Promise<void> {
  const metadataUrl = required("VERSION_METADATA_URL");
  const metadata = await fetchJson(metadataUrl);
  const expectedVersion = optional("EXPECTED_VERSION");
  if (expectedVersion.length > 0 && metadata.releaseVersion !== expectedVersion) {
    throw new Error(
      `version metadata is for ${String(metadata.releaseVersion)}, not the dispatched ${expectedVersion}`,
    );
  }
  const published = publishedTargets(metadata);
  console.log(`published targets: ${published.join(", ") || "<none>"}`);
  for (const target of ["mac_arm64", "mac_x64", "win_x64", "linux_x64"] as const) {
    setOutput(target, published.includes(target) ? "true" : "false");
  }
  setOutput("channel", typeof metadata.channel === "string" ? metadata.channel : "");
  setOutput("release_version", typeof metadata.releaseVersion === "string" ? metadata.releaseVersion : "");
}

async function stage(): Promise<void> {
  const metadataUrl = required("VERSION_METADATA_URL");
  const target = required("RELEASE_TARGET") as ReleaseTarget;
  if (!(target in PRIMARY_ARTIFACT)) throw new Error(`unsupported RELEASE_TARGET: ${target}`);
  const toolsPackDir = required("TOOLS_PACK_DIR");
  const namespace = required("RELEASE_NAMESPACE");
  const buildJsonPath = required("BUILD_JSON_PATH");

  const metadata = await fetchJson(metadataUrl);
  const asset = assetOf(metadata, target);
  const destination = artifactDestination(target, toolsPackDir, namespace);
  console.log(`staging ${asset.url}\n     -> ${destination}`);
  const { bytes, sha256 } = await download(asset.url, destination);
  await verifyChecksum(asset.sha256Url, sha256);

  writeBuildJson(buildJsonPath, {
    source: "published-artifact",
    generatedAt: new Date().toISOString(),
    outputRoot: join(toolsPackDir, "out"),
    releaseTarget: target,
    releaseVersion: metadata.releaseVersion ?? null,
    channel: metadata.channel ?? null,
    namespace,
    publishedArtifact: { bytes, name: asset.name, sha256, url: asset.url },
    ...(target === "win_x64" ? { installerPath: destination } : {}),
    ...(target === "linux_x64" ? { appImagePath: destination } : {}),
    ...(target === "mac_arm64" || target === "mac_x64" ? { dmgPath: destination } : {}),
    cacheReport: { entries: [] },
    timings: [],
  });

  setOutput("artifact_path", destination);
  setOutput("artifact_url", asset.url);
  setOutput("artifact_bytes", String(bytes));
}

const mode = process.argv[2];
if (mode === "plan") {
  await plan();
} else if (mode === "stage") {
  await stage();
} else {
  throw new Error("usage: smoke-artifacts.ts <plan|stage>");
}
