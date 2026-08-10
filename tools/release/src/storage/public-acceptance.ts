import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isDeepStrictEqual } from "node:util";

import { putStorageObjectWithStatus, getStorageObject, type StorageConfig } from "./s3-upload.ts";
import { normalizePublicUrl, writeJson } from "./common.ts";
import { publishLatestRelease, sha256Digest } from "./latest-publication.ts";

type JsonRecord = Record<string, unknown>;

export type PublicArtifactBinding = {
  digest: string;
  size: number;
  url: string;
};

export type PublicAcceptancePlan = {
  closure: PublicArtifactBinding & {
    channel: "beta";
    platform: "win32-x64";
    version: string;
  };
  commit: string;
  installer: PublicArtifactBinding & { path: string };
  metadata: PublicArtifactBinding & { path: string };
  namespace: string;
  platformManifest: PublicArtifactBinding & { path: string };
  releaseVersion: string;
  schemaVersion: 1;
  target: "win_x64";
};

export type PublicAcceptanceCredential = {
  acceptedAt: string;
  closure: PublicAcceptancePlan["closure"];
  commit: string;
  installer: PublicArtifactBinding;
  metadata: PublicArtifactBinding;
  namespace: string;
  platformManifest: PublicArtifactBinding;
  releaseVersion: string;
  schemaVersion: 1;
  smoke: {
    profile: string;
    selectedLanes: string[];
    status: "success";
    summaryDigest: string;
  };
  status: "accepted";
  target: "win_x64";
};

function assertRecord(value: unknown, label: string): asserts value is JsonRecord {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function stringField(record: JsonRecord, name: string, label: string): string {
  const value = record[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}.${name} must be a non-empty string`);
  }
  return value;
}

function numberField(record: JsonRecord, name: string, label: string): number {
  const value = record[name];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label}.${name} must be a non-negative safe integer`);
  }
  return value;
}

function assertDigest(value: string, label: string): void {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be a lowercase sha256 digest`);
  }
}

function artifactBinding(value: unknown, label: string): PublicArtifactBinding {
  assertRecord(value, label);
  const binding = {
    digest: stringField(value, "digest", label),
    size: numberField(value, "size", label),
    url: normalizePublicUrl(stringField(value, "url", label)),
  };
  assertDigest(binding.digest, `${label}.digest`);
  return binding;
}

function childRecord(record: JsonRecord, name: string, label: string): JsonRecord {
  const child = record[name];
  assertRecord(child, `${label}.${name}`);
  return child;
}

function assertPublicImmutableUrl(url: string, publicOrigin: string, label: string): void {
  const parsed = new URL(normalizePublicUrl(url));
  const origin = new URL(normalizePublicUrl(publicOrigin));
  if (parsed.origin !== origin.origin || !parsed.pathname.startsWith(origin.pathname.replace(/\/$/u, ""))) {
    throw new Error(`${label} must be under the configured public origin`);
  }
  if (!parsed.pathname.includes("/versions/") || parsed.pathname.includes("/latest/")) {
    throw new Error(`${label} must identify an immutable version object`);
  }
}

function assertIdentity(input: {
  commit: string;
  metadata: JsonRecord;
  platform: JsonRecord;
  releaseVersion: string;
}): void {
  if (stringField(input.metadata, "releaseVersion", "metadata") !== input.releaseVersion) {
    throw new Error("public metadata releaseVersion mismatch");
  }
  if (stringField(input.metadata, "releaseState", "metadata") !== "complete") {
    throw new Error("public metadata must be complete before acceptance");
  }
  const metadataGithub = childRecord(input.metadata, "github", "metadata");
  if (stringField(metadataGithub, "commit", "metadata.github") !== input.commit) {
    throw new Error("public metadata commit mismatch");
  }
  if (stringField(input.platform, "releaseVersion", "platform") !== input.releaseVersion) {
    throw new Error("public Windows platform releaseVersion mismatch");
  }
  if (stringField(input.platform, "platformKey", "platform") !== "win_x64") {
    throw new Error("public Windows platform target mismatch");
  }
  if (stringField(input.platform, "status", "platform") !== "published") {
    throw new Error("public Windows platform must be published");
  }
  const platformGithub = childRecord(input.platform, "github", "platform");
  if (stringField(platformGithub, "commit", "platform.github") !== input.commit) {
    throw new Error("public Windows platform commit mismatch");
  }
}

function parseJsonBytes(bytes: Buffer, label: string): JsonRecord {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, "")) as unknown;
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  assertRecord(value, label);
  return value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPublic(url: string, fetchImpl: typeof fetch): Promise<Response> {
  let lastStatus = 0;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetchImpl(url, { redirect: "follow" });
      lastStatus = response.status;
      if (response.ok) return response;
      await response.body?.cancel().catch(() => undefined);
      if (response.status !== 404 && response.status !== 429 && response.status < 500) {
        throw new Error(`public object returned HTTP ${response.status}: ${url}`);
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < 5) await delay(Math.min(8_000, 500 * 2 ** (attempt - 1)));
  }
  const cause = lastError instanceof Error ? lastError.message : `HTTP ${lastStatus}`;
  throw new Error(`public object did not become readable after 5 attempts: ${url} (${cause})`);
}

async function fetchBytes(url: string, fetchImpl: typeof fetch): Promise<Buffer> {
  const response = await fetchPublic(url, fetchImpl);
  return Buffer.from(await response.arrayBuffer());
}

async function downloadBoundArtifact(input: {
  binding: PublicArtifactBinding;
  fetchImpl: typeof fetch;
  path: string;
}): Promise<void> {
  await mkdir(dirname(input.path), { recursive: true });
  const response = await fetchPublic(input.binding.url, input.fetchImpl);
  if (response.body == null) throw new Error(`public artifact response has no body: ${input.binding.url}`);
  const hash = createHash("sha256");
  let size = 0;
  const observer = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      size += chunk.byteLength;
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.from(response.body as AsyncIterable<Uint8Array>),
    observer,
    createWriteStream(input.path, { flags: "wx" }),
  );
  const digest = `sha256:${hash.digest("hex")}`;
  if (size !== input.binding.size || digest !== input.binding.digest) {
    throw new Error(
      `downloaded public artifact mismatch for ${input.binding.url}: `
      + `expected ${input.binding.digest}/${input.binding.size}, got ${digest}/${size}`,
    );
  }
}

async function describeFile(path: string): Promise<{ digest: string; size: number }> {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) hash.update(chunk);
  return {
    digest: `sha256:${hash.digest("hex")}`,
    size: (await stat(path)).size,
  };
}

function assertFileBinding(
  actual: { digest: string; size: number },
  expected: PublicArtifactBinding,
  label: string,
): void {
  if (actual.digest !== expected.digest || actual.size !== expected.size) {
    throw new Error(
      `${label} no longer matches public binding: expected ${expected.digest}/${expected.size}, `
      + `got ${actual.digest}/${actual.size}`,
    );
  }
}

export async function preparePublicWindowsAcceptance(input: {
  buildJsonPath: string;
  commit: string;
  downloadDir: string;
  fetchImpl?: typeof fetch;
  metadataUrl: string;
  namespace: string;
  planPath: string;
  publicOrigin: string;
  releaseVersion: string;
}): Promise<PublicAcceptancePlan> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const metadataUrl = normalizePublicUrl(input.metadataUrl);
  assertPublicImmutableUrl(metadataUrl, input.publicOrigin, "metadata URL");
  const metadataBytes = await fetchBytes(metadataUrl, fetchImpl);
  const metadata = parseJsonBytes(metadataBytes, "public metadata");
  const releaseTargets = childRecord(metadata, "releaseTargets", "metadata");
  const embeddedPlatform = childRecord(releaseTargets, "win_x64", "metadata.releaseTargets");
  const platformR2 = childRecord(embeddedPlatform, "r2", "metadata.releaseTargets.win_x64");
  const platformUrl = normalizePublicUrl(stringField(platformR2, "versionManifestUrl", "platform.r2"));
  assertPublicImmutableUrl(platformUrl, input.publicOrigin, "Windows platform manifest URL");
  const platformBytes = await fetchBytes(platformUrl, fetchImpl);
  const platform = parseJsonBytes(platformBytes, "public Windows platform manifest");
  assertIdentity({
    commit: input.commit,
    metadata,
    platform,
    releaseVersion: input.releaseVersion,
  });
  if (!isDeepStrictEqual(embeddedPlatform, platform)) {
    throw new Error("combined metadata Windows target differs from its immutable platform manifest");
  }

  const artifacts = childRecord(platform, "artifacts", "platform");
  const installer = artifactBinding(artifacts.installer, "platform.artifacts.installer");
  const closure = childRecord(platform, "closure", "platform");
  const closureAssets = childRecord(closure, "assets", "platform.closure");
  const closureArchive = artifactBinding(closureAssets.archive, "platform.closure.assets.archive");
  const closureManifest = childRecord(closure, "manifest", "platform.closure");
  const closureIdentity = childRecord(closureManifest, "identity", "platform.closure.manifest");
  const closureVersion = stringField(closureIdentity, "version", "closure.identity");
  if (
    stringField(closureIdentity, "channel", "closure.identity") !== "beta"
    || stringField(closureIdentity, "platform", "closure.identity") !== "win32-x64"
  ) {
    throw new Error("public Windows Closure identity mismatch");
  }
  if (stringField(closureIdentity, "digest", "closure.identity") !== closureArchive.digest) {
    throw new Error("public Windows Closure identity digest mismatch");
  }
  const closureArtifact = artifactBinding(closureManifest.artifact, "platform.closure.manifest.artifact");
  if (!isDeepStrictEqual(closureArchive, closureArtifact)) {
    throw new Error("public Windows Closure archive differs from its candidate manifest artifact");
  }
  for (const [label, binding] of [
    ["installer URL", installer],
    ["Closure archive URL", closureArchive],
  ] as const) {
    assertPublicImmutableUrl(binding.url, input.publicOrigin, label);
  }

  const installerName = decodeURIComponent(basename(new URL(installer.url).pathname));
  const installerPath = join(input.downloadDir, installerName);
  await downloadBoundArtifact({ binding: installer, fetchImpl, path: installerPath });
  const metadataPath = join(input.downloadDir, "public-metadata.json");
  const platformPath = join(input.downloadDir, "public-win_x64.json");
  await mkdir(input.downloadDir, { recursive: true });
  await Promise.all([
    writeFile(metadataPath, metadataBytes, { flag: "wx" }),
    writeFile(platformPath, platformBytes, { flag: "wx" }),
  ]);

  const plan: PublicAcceptancePlan = {
    closure: {
      ...closureArchive,
      channel: "beta",
      platform: "win32-x64",
      version: closureVersion,
    },
    commit: input.commit,
    installer: { ...installer, path: installerPath },
    metadata: {
      digest: sha256Digest(metadataBytes),
      path: metadataPath,
      size: metadataBytes.byteLength,
      url: metadataUrl,
    },
    namespace: input.namespace,
    platformManifest: {
      digest: sha256Digest(platformBytes),
      path: platformPath,
      size: platformBytes.byteLength,
      url: platformUrl,
    },
    releaseVersion: input.releaseVersion,
    schemaVersion: 1,
    target: "win_x64",
  };
  writeJson(input.buildJsonPath, { installerPath });
  writeJson(input.planPath, plan);
  return plan;
}

function parsePlan(value: unknown): PublicAcceptancePlan {
  assertRecord(value, "public acceptance plan");
  if (value.schemaVersion !== 1 || value.target !== "win_x64") {
    throw new Error("unsupported public acceptance plan identity");
  }
  return value as PublicAcceptancePlan;
}

function parseCredential(value: unknown): PublicAcceptanceCredential {
  assertRecord(value, "public acceptance credential");
  if (value.schemaVersion !== 1 || value.target !== "win_x64" || value.status !== "accepted") {
    throw new Error("unsupported public acceptance credential identity");
  }
  const closureRecord = childRecord(value, "closure", "public acceptance credential");
  const closureArtifact = artifactBinding(closureRecord, "public acceptance credential.closure");
  const closureChannel = stringField(closureRecord, "channel", "credential.closure");
  const closurePlatform = stringField(closureRecord, "platform", "credential.closure");
  if (closureChannel !== "beta" || closurePlatform !== "win32-x64") {
    throw new Error("public acceptance credential Closure identity mismatch");
  }
  const smoke = childRecord(value, "smoke", "public acceptance credential");
  if (
    smoke.status !== "success"
    || smoke.profile !== "core"
    || !Array.isArray(smoke.selectedLanes)
    || smoke.selectedLanes.length !== 1
    || smoke.selectedLanes[0] !== "shell"
  ) {
    throw new Error("public acceptance credential smoke proof is invalid");
  }
  const summaryDigest = stringField(smoke, "summaryDigest", "credential.smoke");
  assertDigest(summaryDigest, "credential.smoke.summaryDigest");
  const releaseVersion = stringField(value, "releaseVersion", "credential");
  const commit = stringField(value, "commit", "credential");
  if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error("public acceptance credential commit must be a full SHA");
  return {
    acceptedAt: stringField(value, "acceptedAt", "credential"),
    closure: {
      ...closureArtifact,
      channel: "beta",
      platform: "win32-x64",
      version: stringField(closureRecord, "version", "credential.closure"),
    },
    commit,
    installer: artifactBinding(value.installer, "public acceptance credential.installer"),
    metadata: artifactBinding(value.metadata, "public acceptance credential.metadata"),
    namespace: stringField(value, "namespace", "credential"),
    platformManifest: artifactBinding(
      value.platformManifest,
      "public acceptance credential.platformManifest",
    ),
    releaseVersion,
    schemaVersion: 1,
    smoke: {
      profile: "core",
      selectedLanes: ["shell"],
      status: "success",
      summaryDigest,
    },
    status: "accepted",
    target: "win_x64",
  };
}

export async function issuePublicWindowsAcceptance(input: {
  credentialPath: string;
  planPath: string;
  smokeSummaryPath: string;
  suiteResultPath: string;
}): Promise<PublicAcceptanceCredential> {
  const [planBytes, summaryBytes, suiteResultBytes] = await Promise.all([
    readFile(input.planPath),
    readFile(input.smokeSummaryPath),
    readFile(input.suiteResultPath),
  ]);
  const plan = parsePlan(parseJsonBytes(planBytes, "public acceptance plan"));
  const summary = parseJsonBytes(summaryBytes, "public smoke summary");
  const suiteResult = parseJsonBytes(suiteResultBytes, "public smoke suite result");
  if (suiteResult.status !== "success" || suiteResult.exitCode !== 0) {
    throw new Error("public Windows smoke suite did not succeed");
  }
  const planSummary = childRecord(summary, "plan", "smoke summary");
  const profile = stringField(planSummary, "profile", "smoke summary.plan");
  const selectedLanes = planSummary.selectedLanes;
  if (profile !== "core" || !Array.isArray(selectedLanes) || selectedLanes.length !== 1 || selectedLanes[0] !== "shell") {
    throw new Error("public Windows acceptance requires the core shell smoke plan");
  }
  if (!Array.isArray(summary.timings)) throw new Error("public smoke summary timings are required");
  const lifecycle = summary.timings.find((entry) => {
    return entry != null && typeof entry === "object" && (entry as JsonRecord).step === "win-shell-lifecycle";
  });
  assertRecord(lifecycle, "public shell lifecycle timing");
  if (lifecycle.status !== "success") throw new Error("public Windows shell lifecycle did not succeed");

  const closureBinding = childRecord(summary, "closureBinding", "smoke summary");
  const committed = childRecord(closureBinding, "committed", "smoke summary.closureBinding");
  if (stringField(committed, "releaseVersion", "closure committed") !== plan.releaseVersion) {
    throw new Error("public smoke committed Closure releaseVersion mismatch");
  }
  const standalone = childRecord(committed, "standalone", "closure committed");
  for (const [name, expected] of [
    ["channel", plan.closure.channel],
    ["digest", plan.closure.digest],
    ["platform", plan.closure.platform],
    ["version", plan.closure.version],
    ["namespace", plan.namespace],
  ] as const) {
    if (standalone[name] !== expected) {
      throw new Error(`public smoke committed Closure ${name} mismatch`);
    }
  }

  const [metadataFile, platformFile, installerFile] = await Promise.all([
    describeFile(plan.metadata.path),
    describeFile(plan.platformManifest.path),
    describeFile(plan.installer.path),
  ]);
  assertFileBinding(metadataFile, plan.metadata, "public metadata");
  assertFileBinding(platformFile, plan.platformManifest, "public Windows platform manifest");
  assertFileBinding(installerFile, plan.installer, "public Windows installer");

  const credential: PublicAcceptanceCredential = {
    acceptedAt: new Date().toISOString(),
    closure: plan.closure,
    commit: plan.commit,
    installer: {
      digest: plan.installer.digest,
      size: plan.installer.size,
      url: plan.installer.url,
    },
    metadata: {
      digest: plan.metadata.digest,
      size: plan.metadata.size,
      url: plan.metadata.url,
    },
    namespace: plan.namespace,
    platformManifest: {
      digest: plan.platformManifest.digest,
      size: plan.platformManifest.size,
      url: plan.platformManifest.url,
    },
    releaseVersion: plan.releaseVersion,
    schemaVersion: 1,
    smoke: {
      profile,
      selectedLanes: ["shell"],
      status: "success",
      summaryDigest: sha256Digest(summaryBytes),
    },
    status: "accepted",
    target: "win_x64",
  };
  writeJson(input.credentialPath, credential);
  return credential;
}

function objectKeyFromPublicUrl(url: string, publicOrigin: string): string {
  const parsed = new URL(normalizePublicUrl(url));
  const origin = new URL(normalizePublicUrl(publicOrigin));
  const originPath = origin.pathname.replace(/\/+$/u, "");
  if (parsed.origin !== origin.origin || !parsed.pathname.startsWith(`${originPath}/`)) {
    throw new Error(`public URL is outside the configured origin: ${url}`);
  }
  return decodeURIComponent(parsed.pathname.slice(originPath.length + 1));
}

async function uploadImmutableCredential(input: {
  credentialBytes: Buffer;
  credentialPath: string;
  objectKey: string;
  storage: StorageConfig;
}): Promise<void> {
  const result = await putStorageObjectWithStatus({
    ...input.storage,
    bodyPath: input.credentialPath,
    cacheControl: "public, max-age=31536000, immutable",
    contentType: "application/json; charset=utf-8",
    headers: { "if-none-match": "*" },
    objectKey: input.objectKey,
  });
  if (result.ok) return;
  if (result.status !== 412) {
    throw new Error(`acceptance credential PUT failed with HTTP ${result.status}: ${result.body}`);
  }
  const existing = await getStorageObject({ ...input.storage, objectKey: input.objectKey });
  if (existing == null || !existing.bytes.equals(input.credentialBytes)) {
    throw new Error(`immutable acceptance credential conflict: ${input.objectKey}`);
  }
}

export async function activateAcceptedPublicRelease(input: {
  credentialPath: string;
  fetchImpl?: typeof fetch;
  publicOrigin: string;
  storage: StorageConfig;
  workDir: string;
}): Promise<{ acceptanceUrl: string; latestMetadataUrl: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const credentialBytes = await readFile(input.credentialPath);
  const credential = parseCredential(parseJsonBytes(credentialBytes, "public acceptance credential"));
  for (const [label, binding] of [
    ["credential metadata URL", credential.metadata],
    ["credential Windows platform manifest URL", credential.platformManifest],
    ["credential installer URL", credential.installer],
    ["credential Closure URL", credential.closure],
  ] as const) {
    assertPublicImmutableUrl(binding.url, input.publicOrigin, label);
  }
  const [metadataBytes, winPlatformBytes] = await Promise.all([
    fetchBytes(credential.metadata.url, fetchImpl),
    fetchBytes(credential.platformManifest.url, fetchImpl),
  ]);
  assertFileBinding(
    { digest: sha256Digest(metadataBytes), size: metadataBytes.byteLength },
    credential.metadata,
    "public metadata",
  );
  assertFileBinding(
    { digest: sha256Digest(winPlatformBytes), size: winPlatformBytes.byteLength },
    credential.platformManifest,
    "public Windows platform manifest",
  );
  const metadata = parseJsonBytes(metadataBytes, "public metadata");
  const winPlatform = parseJsonBytes(winPlatformBytes, "public Windows platform manifest");
  assertIdentity({
    commit: credential.commit,
    metadata,
    platform: winPlatform,
    releaseVersion: credential.releaseVersion,
  });
  const metadataR2 = childRecord(metadata, "r2", "metadata");
  if (stringField(metadataR2, "versionMetadataUrl", "metadata.r2") !== credential.metadata.url) {
    throw new Error("accepted metadata URL no longer matches its public metadata identity");
  }
  const embeddedWindows = childRecord(
    childRecord(metadata, "releaseTargets", "metadata"),
    "win_x64",
    "metadata.releaseTargets",
  );
  const embeddedWindowsR2 = childRecord(embeddedWindows, "r2", "metadata.releaseTargets.win_x64");
  if (
    stringField(embeddedWindowsR2, "versionManifestUrl", "win_x64.r2")
    !== credential.platformManifest.url
  ) {
    throw new Error("accepted Windows platform URL no longer matches public metadata");
  }
  const publicInstaller = artifactBinding(
    childRecord(winPlatform, "artifacts", "platform").installer,
    "platform.artifacts.installer",
  );
  if (!isDeepStrictEqual(publicInstaller, credential.installer)) {
    throw new Error("accepted installer binding no longer matches public Windows metadata");
  }
  const publicClosure = childRecord(winPlatform, "closure", "platform");
  const publicClosureArchive = artifactBinding(
    childRecord(publicClosure, "assets", "platform.closure").archive,
    "platform.closure.assets.archive",
  );
  const publicClosureIdentity = childRecord(
    childRecord(publicClosure, "manifest", "platform.closure"),
    "identity",
    "platform.closure.manifest",
  );
  if (
    !isDeepStrictEqual(publicClosureArchive, {
      digest: credential.closure.digest,
      size: credential.closure.size,
      url: credential.closure.url,
    })
    || publicClosureIdentity.channel !== credential.closure.channel
    || publicClosureIdentity.digest !== credential.closure.digest
    || publicClosureIdentity.platform !== credential.closure.platform
    || publicClosureIdentity.version !== credential.closure.version
  ) {
    throw new Error("accepted Closure binding no longer matches public Windows metadata");
  }

  const releaseTargets = childRecord(metadata, "releaseTargets", "metadata");
  const platformInputs: Record<string, { manifest: JsonRecord; path: string }> = {};
  await mkdir(input.workDir, { recursive: true });
  for (const [target, embedded] of Object.entries(releaseTargets)) {
    assertRecord(embedded, `metadata.releaseTargets.${target}`);
    if (embedded.status !== "published") continue;
    const r2 = childRecord(embedded, "r2", `metadata.releaseTargets.${target}`);
    const url = normalizePublicUrl(stringField(r2, "versionManifestUrl", `${target}.r2`));
    assertPublicImmutableUrl(url, input.publicOrigin, `${target} platform manifest URL`);
    const bytes = target === "win_x64" ? winPlatformBytes : await fetchBytes(url, fetchImpl);
    const manifest = parseJsonBytes(bytes, `${target} public platform manifest`);
    if (!isDeepStrictEqual(embedded, manifest)) {
      throw new Error(`combined metadata ${target} differs from its immutable platform manifest`);
    }
    const path = join(input.workDir, `${target}.json`);
    await writeFile(path, bytes);
    platformInputs[target] = { manifest, path };
  }
  if (platformInputs.win_x64 == null) throw new Error("accepted release no longer publishes win_x64");

  const versionPrefix = stringField(metadataR2, "versionPrefix", "metadata.r2");
  if (versionPrefix !== `beta/versions/${credential.releaseVersion}`) {
    throw new Error(`accepted metadata has unexpected version prefix: ${versionPrefix}`);
  }
  const credentialKey = `${versionPrefix}/acceptance/win_x64.json`;
  await uploadImmutableCredential({
    credentialBytes,
    credentialPath: input.credentialPath,
    objectKey: credentialKey,
    storage: input.storage,
  });
  const metadataPath = join(input.workDir, "metadata.json");
  await writeFile(metadataPath, metadataBytes);
  await publishLatestRelease({
    channel: "beta",
    metadataDir: input.workDir,
    metadataPath,
    platforms: platformInputs,
    releaseVersion: credential.releaseVersion,
    storage: input.storage,
  });
  return {
    acceptanceUrl: normalizePublicUrl(`${input.publicOrigin.replace(/\/+$/u, "")}/${credentialKey}`),
    latestMetadataUrl: normalizePublicUrl(`${input.publicOrigin.replace(/\/+$/u, "")}/beta/latest/metadata.json`),
  };
}

export const publicAcceptanceInternals = {
  artifactBinding,
  assertPublicImmutableUrl,
  objectKeyFromPublicUrl,
  parseCredential,
  parsePlan,
};
