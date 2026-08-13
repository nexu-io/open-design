import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isDeepStrictEqual } from "node:util";

import {
  resolveClosureDistributionColdStartBudget,
  type ClosureDistributionColdStartBudget,
} from "@open-design/closure/protocol";

import {
  isReleaseChannel,
  releaseChannelFromVersion,
  type CountedReleaseChannel,
  type ReleaseTarget,
} from "@open-design/release";

import { normalizePublicUrl, writeJson } from "./common.ts";
import {
  createPublicColdStartEvidence,
  parsePublicColdStartBudget,
  parsePublicColdStartEvidence,
  type PublicColdStartEvidence,
} from "./cold-start-evidence.ts";
import { validateClosureDistributionPublication } from "./closure-distribution-metadata.ts";
import { sha256Digest } from "./latest-publication.ts";
import {
  publicAcceptanceTargets as targetDefinitions,
  type ClosureTarget,
  type PublicArtifactKind,
} from "./public-acceptance-targets.ts";

export type JsonRecord = Record<string, unknown>;

export type PublicArtifactBinding = {
  digest: string;
  size: number;
  url: string;
};

export type PublicClosureBinding = {
  channel: CountedReleaseChannel;
  digest: string;
  protocolVersion: 1;
  target: ClosureTarget;
  version: string;
};

export type PublicAcceptancePlan = {
  artifact: PublicArtifactBinding & { path: string };
  artifactKind: PublicArtifactKind;
  closure: PublicClosureBinding;
  coldStart: ClosureDistributionColdStartBudget;
  commit: string;
  metadata: PublicArtifactBinding & { path: string };
  namespace: string;
  platformManifest: PublicArtifactBinding & { path: string };
  releaseGeneratedAt: string;
  releaseVersion: string;
  schemaVersion: 3;
  target: ReleaseTarget;
};

export type PublicAcceptanceCredential = {
  acceptedAt: string;
  artifact: PublicArtifactBinding;
  artifactKind: PublicArtifactKind;
  closure: PublicAcceptancePlan["closure"];
  coldStart: PublicColdStartEvidence;
  commit: string;
  metadata: PublicArtifactBinding;
  namespace: string;
  platformManifest: PublicArtifactBinding;
  releaseVersion: string;
  schemaVersion: 3;
  smoke: {
    profile: string;
    selectedLanes: string[];
    status: "success";
    summaryDigest: string;
  };
  status: "accepted";
  target: ReleaseTarget;
};

export function assertRecord(value: unknown, label: string): asserts value is JsonRecord {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

export function stringField(record: JsonRecord, name: string, label: string): string {
  const value = record[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}.${name} must be a non-empty string`);
  }
  return value;
}

export function numberField(record: JsonRecord, name: string, label: string): number {
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

export function artifactBinding(value: unknown, label: string): PublicArtifactBinding {
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
  if (
    !isReleaseChannel(channel)
    || channel === "stable"
    || protocolVersion !== 1
    || releaseChannelFromVersion(version) !== channel
    || !Object.values(targetDefinitions).some((definition) => definition.closureTarget === target)
  ) {
    throw new Error(`${label} identity mismatch`);
  }
  return { channel, digest, protocolVersion, target: target as ClosureTarget, version };
}

export function resolvePublicClosure(input: {
  expectedVersion?: string;
  metadata: JsonRecord;
  publicOrigin: string;
  target: ReleaseTarget;
}): { binding: PublicClosureBinding; coldStart: ClosureDistributionColdStartBudget } {
  const value = childRecord(input.metadata, "closure", "metadata");
  const identity = childRecord(value, "identity", "metadata.closure");
  const version = input.expectedVersion ?? stringField(identity, "version", "metadata.closure.identity");
  const channel = stringField(identity, "channel", "metadata.closure.identity");
  if (!isReleaseChannel(channel) || channel === "stable" || releaseChannelFromVersion(version) !== channel) {
    throw new Error("metadata exact release identity mismatch");
  }
  if (typeof input.metadata.channel === "string" && input.metadata.channel !== channel) {
    throw new Error("metadata channel differs from Closure identity");
  }
  const closure = validateClosureDistributionPublication({
    channel,
    expectedTargets: [targetDefinitions[input.target].closureTarget],
    publicOrigin: input.publicOrigin,
    releaseVersion: version,
    value,
  });
  const target = targetDefinitions[input.target].closureTarget;
  return {
    binding: {
      channel,
      digest: closure.identity.digest,
      protocolVersion: closure.identity.protocolVersion,
      target,
      version: closure.identity.version,
    },
    coldStart: resolveClosureDistributionColdStartBudget(closure, target),
  };
}

export function childRecord(record: JsonRecord, name: string, label: string): JsonRecord {
  const child = record[name];
  assertRecord(child, `${label}.${name}`);
  return child;
}

export function assertPublicImmutableUrl(url: string, publicOrigin: string, label: string): void {
  const parsed = new URL(normalizePublicUrl(url));
  const origin = new URL(normalizePublicUrl(publicOrigin));
  if (parsed.origin !== origin.origin || !parsed.pathname.startsWith(origin.pathname.replace(/\/$/u, ""))) {
    throw new Error(`${label} must be under the configured public origin`);
  }
  if (!parsed.pathname.includes("/versions/") || parsed.pathname.includes("/latest/")) {
    throw new Error(`${label} must identify an immutable version object`);
  }
}

export function assertIdentity(input: {
  commit: string;
  metadata: JsonRecord;
  platform: JsonRecord;
  releaseVersion: string;
  target: ReleaseTarget;
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
    throw new Error(`public ${input.target} platform releaseVersion mismatch`);
  }
  if (stringField(input.platform, "platformKey", "platform") !== input.target) {
    throw new Error(`public ${input.target} platform target mismatch`);
  }
  if (stringField(input.platform, "status", "platform") !== "published") {
    throw new Error(`public ${input.target} platform must be published`);
  }
  const platformGithub = childRecord(input.platform, "github", "platform");
  if (stringField(platformGithub, "commit", "platform.github") !== input.commit) {
    throw new Error(`public ${input.target} platform commit mismatch`);
  }
}

export function parseJsonBytes(bytes: Buffer, label: string): JsonRecord {
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

export async function fetchBytes(url: string, fetchImpl: typeof fetch): Promise<Buffer> {
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

export function assertFileBinding(
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

export async function preparePublicAcceptance(input: {
  buildJsonPath: string;
  commit: string;
  downloadDir: string;
  fetchImpl?: typeof fetch;
  metadataUrl: string;
  namespace: string;
  planPath: string;
  publicOrigin: string;
  releaseVersion: string;
  target: ReleaseTarget;
}): Promise<PublicAcceptancePlan> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const metadataUrl = normalizePublicUrl(input.metadataUrl);
  assertPublicImmutableUrl(metadataUrl, input.publicOrigin, "metadata URL");
  const metadataBytes = await fetchBytes(metadataUrl, fetchImpl);
  const metadata = parseJsonBytes(metadataBytes, "public metadata");
  const releaseTargets = childRecord(metadata, "releaseTargets", "metadata");
  const definition = targetDefinitions[input.target];
  const embeddedPlatform = childRecord(releaseTargets, input.target, "metadata.releaseTargets");
  const platformR2 = childRecord(embeddedPlatform, "r2", `metadata.releaseTargets.${input.target}`);
  const platformUrl = normalizePublicUrl(stringField(platformR2, "versionManifestUrl", "platform.r2"));
  assertPublicImmutableUrl(platformUrl, input.publicOrigin, `${input.target} platform manifest URL`);
  const platformBytes = await fetchBytes(platformUrl, fetchImpl);
  const platform = parseJsonBytes(platformBytes, `public ${input.target} platform manifest`);
  assertIdentity({
    commit: input.commit,
    metadata,
    platform,
    releaseVersion: input.releaseVersion,
    target: input.target,
  });
  if (!isDeepStrictEqual(embeddedPlatform, platform)) {
    throw new Error(`combined metadata ${input.target} differs from its immutable platform manifest`);
  }

  const artifacts = childRecord(platform, "artifacts", "platform");
  const artifact = artifactBinding(
    artifacts[definition.artifactKind],
    `platform.artifacts.${definition.artifactKind}`,
  );
  const resolvedClosure = resolvePublicClosure({
    metadata,
    publicOrigin: input.publicOrigin,
    target: input.target,
  });
  assertPublicImmutableUrl(artifact.url, input.publicOrigin, `${definition.artifactKind} URL`);

  const artifactName = decodeURIComponent(basename(new URL(artifact.url).pathname));
  const artifactPath = join(input.downloadDir, artifactName);
  await downloadBoundArtifact({ binding: artifact, fetchImpl, path: artifactPath });
  const metadataPath = join(input.downloadDir, "public-metadata.json");
  const platformPath = join(input.downloadDir, `public-${input.target}.json`);
  await mkdir(input.downloadDir, { recursive: true });
  await Promise.all([
    writeFile(metadataPath, metadataBytes, { flag: "wx" }),
    writeFile(platformPath, platformBytes, { flag: "wx" }),
  ]);

  const plan: PublicAcceptancePlan = {
    artifact: { ...artifact, path: artifactPath },
    artifactKind: definition.artifactKind,
    closure: resolvedClosure.binding,
    coldStart: resolvedClosure.coldStart,
    commit: input.commit,
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
    releaseGeneratedAt: stringField(metadata, "generatedAt", "metadata"),
    releaseVersion: input.releaseVersion,
    schemaVersion: 3,
    target: input.target,
  };
  writeJson(input.buildJsonPath, { [definition.buildJsonField]: artifactPath });
  writeJson(input.planPath, plan);
  return plan;
}

export async function preparePublicWindowsAcceptance(
  input: Omit<Parameters<typeof preparePublicAcceptance>[0], "target">,
): Promise<PublicAcceptancePlan> {
  return preparePublicAcceptance({ ...input, target: "win_x64" });
}

function parsePlan(value: unknown): PublicAcceptancePlan {
  assertRecord(value, "public acceptance plan");
  if (value.schemaVersion !== 3 || typeof value.target !== "string" || !(value.target in targetDefinitions)) {
    throw new Error("unsupported public acceptance plan identity");
  }
  const closure = publicClosureBinding(value.closure, "public acceptance plan.closure");
  const coldStart = parsePublicColdStartBudget(value.coldStart);
  const definition = targetDefinitions[value.target as ReleaseTarget];
  if (
    closure.target !== definition.closureTarget
    || coldStart.target !== definition.closureTarget
    || value.artifactKind !== definition.artifactKind
  ) {
    throw new Error("public acceptance plan target binding is invalid");
  }
  if (!Number.isFinite(Date.parse(stringField(value, "releaseGeneratedAt", "public acceptance plan")))) {
    throw new Error("public acceptance plan releaseGeneratedAt is invalid");
  }
  return { ...value, closure, coldStart } as PublicAcceptancePlan;
}

export function parseCredential(value: unknown): PublicAcceptanceCredential {
  assertRecord(value, "public acceptance credential");
  if (
    value.schemaVersion !== 3
    || typeof value.target !== "string"
    || !(value.target in targetDefinitions)
    || value.status !== "accepted"
  ) {
    throw new Error("unsupported public acceptance credential identity");
  }
  const target = value.target as ReleaseTarget;
  const definition = targetDefinitions[target];
  const closure = publicClosureBinding(value.closure, "public acceptance credential.closure");
  if (closure.target !== definition.closureTarget || value.artifactKind !== definition.artifactKind) {
    throw new Error("public acceptance credential target binding is invalid");
  }
  const smoke = childRecord(value, "smoke", "public acceptance credential");
  const coldStart = parsePublicColdStartEvidence(value.coldStart);
  if (coldStart.target !== closure.target) {
    throw new Error("public acceptance coldStart target binding is invalid");
  }
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
    artifact: artifactBinding(value.artifact, "public acceptance credential.artifact"),
    artifactKind: definition.artifactKind,
    closure,
    coldStart,
    commit,
    metadata: artifactBinding(value.metadata, "public acceptance credential.metadata"),
    namespace: stringField(value, "namespace", "credential"),
    platformManifest: artifactBinding(
      value.platformManifest,
      "public acceptance credential.platformManifest",
    ),
    releaseVersion,
    schemaVersion: 3,
    smoke: {
      profile: "core",
      selectedLanes: ["shell"],
      status: "success",
      summaryDigest,
    },
    status: "accepted",
    target,
  };
}

export async function issuePublicAcceptance(input: {
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
  const definition = targetDefinitions[plan.target];
  const summary = parseJsonBytes(summaryBytes, "public smoke summary");
  const suiteResult = parseJsonBytes(suiteResultBytes, "public smoke suite result");
  if (suiteResult.status !== "success" || suiteResult.exitCode !== 0) {
    throw new Error(`public ${plan.target} smoke suite did not succeed`);
  }
  const planSummary = childRecord(summary, "plan", "smoke summary");
  const profile = stringField(planSummary, "profile", "smoke summary.plan");
  const selectedLanes = planSummary.selectedLanes;
  if (profile !== "core" || !Array.isArray(selectedLanes) || selectedLanes.length !== 1 || selectedLanes[0] !== "shell") {
    throw new Error(`public ${plan.target} acceptance requires the core shell smoke plan`);
  }
  if (!Array.isArray(summary.timings)) throw new Error("public smoke summary timings are required");
  const lifecycle = summary.timings.find((entry) => {
    return entry != null && typeof entry === "object" && (entry as JsonRecord).step === definition.lifecycleStep;
  });
  assertRecord(lifecycle, "public shell lifecycle timing");
  if (lifecycle.status !== "success") throw new Error(`public ${plan.target} shell lifecycle did not succeed`);

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

  const [metadataFile, platformFile, artifactFile] = await Promise.all([
    describeFile(plan.metadata.path),
    describeFile(plan.platformManifest.path),
    describeFile(plan.artifact.path),
  ]);
  assertFileBinding(metadataFile, plan.metadata, "public metadata");
  assertFileBinding(platformFile, plan.platformManifest, `public ${plan.target} platform manifest`);
  assertFileBinding(artifactFile, plan.artifact, `public ${plan.target} ${plan.artifactKind}`);

  const credential: PublicAcceptanceCredential = {
    acceptedAt: plan.releaseGeneratedAt,
    artifact: {
      digest: plan.artifact.digest,
      size: plan.artifact.size,
      url: plan.artifact.url,
    },
    artifactKind: plan.artifactKind,
    closure: plan.closure,
    coldStart: createPublicColdStartEvidence(plan.coldStart, summary.coldStart),
    commit: plan.commit,
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
    schemaVersion: 3,
    smoke: {
      profile,
      selectedLanes: ["shell"],
      status: "success",
      summaryDigest: sha256Digest(summaryBytes),
    },
    status: "accepted",
    target: plan.target,
  };
  writeJson(input.credentialPath, credential);
  return credential;
}

export const issuePublicWindowsAcceptance = issuePublicAcceptance;

export const publicAcceptanceInternals = {
  artifactBinding,
  assertPublicImmutableUrl,
  parseCredential,
  parsePlan,
};
