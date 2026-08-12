import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isDeepStrictEqual } from "node:util";

import { putStorageObjectWithStatus, getStorageObject, type StorageConfig } from "./s3-upload.ts";
import { normalizePublicUrl, writeJson } from "./common.ts";
import { validateClosureDistributionPublication } from "./closure-distribution-metadata.ts";
import { publishLatestRelease, sha256Digest } from "./latest-publication.ts";

type JsonRecord = Record<string, unknown>;

export type PublicArtifactBinding = {
  digest: string;
  size: number;
  url: string;
};

export type PublicClosureBinding = {
  channel: "beta";
  digest: string;
  protocolVersion: 1;
  target: "win32-x64";
  version: string;
};

export type PublicAcceptancePlan = {
  closure: PublicClosureBinding;
  commit: string;
  installer: PublicArtifactBinding & { path: string };
  metadata: PublicArtifactBinding & { path: string };
  namespace: string;
  platformManifest: PublicArtifactBinding & { path: string };
  releaseVersion: string;
  schemaVersion: 2;
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
  schemaVersion: 2;
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

function publicClosureBinding(value: unknown, label: string): PublicClosureBinding {
  assertRecord(value, label);
  const channel = stringField(value, "channel", label);
  const digest = stringField(value, "digest", label);
  const protocolVersion = numberField(value, "protocolVersion", label);
  const target = stringField(value, "target", label);
  const version = stringField(value, "version", label);
  assertDigest(digest, `${label}.digest`);
  if (channel !== "beta" || protocolVersion !== 1 || target !== "win32-x64") {
    throw new Error(`${label} identity mismatch`);
  }
  return { channel, digest, protocolVersion, target, version };
}

function resolvePublicClosureBinding(input: {
  expectedVersion?: string;
  metadata: JsonRecord;
  publicOrigin: string;
}): PublicClosureBinding {
  const value = childRecord(input.metadata, "closure", "metadata");
  const identity = childRecord(value, "identity", "metadata.closure");
  const version = input.expectedVersion ?? stringField(identity, "version", "metadata.closure.identity");
  const closure = validateClosureDistributionPublication({
    channel: "beta",
    expectedTargets: ["win32-x64"],
    publicOrigin: input.publicOrigin,
    releaseVersion: version,
    value,
  });
  return {
    channel: "beta",
    digest: closure.identity.digest,
    protocolVersion: closure.identity.protocolVersion,
    target: "win32-x64",
    version: closure.identity.version,
  };
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
  const closure = resolvePublicClosureBinding({
    metadata,
    publicOrigin: input.publicOrigin,
  });
  assertPublicImmutableUrl(installer.url, input.publicOrigin, "installer URL");

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
    closure,
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
    schemaVersion: 2,
    target: "win_x64",
  };
  writeJson(input.buildJsonPath, { installerPath });
  writeJson(input.planPath, plan);
  return plan;
}

function parsePlan(value: unknown): PublicAcceptancePlan {
  assertRecord(value, "public acceptance plan");
  if (value.schemaVersion !== 2 || value.target !== "win_x64") {
    throw new Error("unsupported public acceptance plan identity");
  }
  publicClosureBinding(value.closure, "public acceptance plan.closure");
  return value as PublicAcceptancePlan;
}

function parseCredential(value: unknown): PublicAcceptanceCredential {
  assertRecord(value, "public acceptance credential");
  if (value.schemaVersion !== 2 || value.target !== "win_x64" || value.status !== "accepted") {
    throw new Error("unsupported public acceptance credential identity");
  }
  const closure = publicClosureBinding(value.closure, "public acceptance credential.closure");
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
    closure,
    commit,
    installer: artifactBinding(value.installer, "public acceptance credential.installer"),
    metadata: artifactBinding(value.metadata, "public acceptance credential.metadata"),
    namespace: stringField(value, "namespace", "credential"),
    platformManifest: artifactBinding(
      value.platformManifest,
      "public acceptance credential.platformManifest",
    ),
    releaseVersion,
    schemaVersion: 2,
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
    ["protocolVersion", plan.closure.protocolVersion],
    ["target", plan.closure.target],
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
    schemaVersion: 2,
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
  const publicClosure = resolvePublicClosureBinding({
    expectedVersion: credential.closure.version,
    metadata,
    publicOrigin: input.publicOrigin,
  });
  if (!isDeepStrictEqual(publicClosure, credential.closure)) {
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
