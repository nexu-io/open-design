import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";

import { parseReleaseVersion, releaseChannelDescriptor, type ReleaseChannel } from "@open-design/release";

import { contentType, githubInfo, normalizePublicUrl, optional, publicUrl, required, storageConfigFromEnv, writeJson } from "./common.ts";
import { getStorageObject, putStorageObjectWithStatus, type StorageConfig } from "./s3-upload.ts";

type Digest = `sha256:${string}`;
type ShellTarget = "darwin-arm64" | "darwin-x64" | "win32-x64";

export type ShellBuildPlan = {
  artifacts: Record<string, string | null>;
  outputRoot: string;
  profileDigest: Digest;
  releaseVersion: string | null;
  runtimeNamespaceRoot: string;
  schemaVersion: 1;
  shell: { sourceDigest: Digest; type: string; version: string };
  target: ShellTarget;
  to: string;
};

type BuildArtifact = { digest: Digest; path: string; size: number };
type ShellBuildReport = {
  artifacts: Record<string, BuildArtifact | null>;
  releaseVersion: string | null;
  shell: { sourceDigest: Digest; type: string; version: string };
};

export type ShellBuildArtifactRecord = {
  contentType: string;
  digest: Digest;
  name: string;
  objectKey: string;
  size: number;
  url: string;
};

export type ShellBuildRecord = {
  artifacts: Record<string, ShellBuildArtifactRecord>;
  channel: string;
  createdAt: string;
  provenance: Record<string, unknown>;
  profileDigest: Digest;
  schemaVersion: 1;
  shell: { sourceDigest: Digest; type: string; version: string };
  target: ShellTarget;
};

export type ShellSmokeProofRecord = {
  acceptanceDigest: Digest;
  channel: string;
  createdAt: string;
  matrix: string;
  profileDigest: Digest;
  provenance: Record<string, unknown>;
  releaseVersion: string;
  scenarios: string[];
  schemaVersion: 2;
  shell: { sourceDigest: Digest; type: string; version: string };
  standaloneProtocolVersion: number;
  target: ShellTarget;
};

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const tokenPattern = /^[a-z][a-z0-9-]*$/;
const artifactKindPattern = /^[a-z][A-Za-z0-9]*$/;

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function validateDigest(value: unknown, label: string): asserts value is Digest {
  if (typeof value !== "string" || !digestPattern.test(value)) throw new Error(`${label} must be a lowercase sha256 digest`);
}

function requiredDigest(name: string): Digest {
  const value = required(name);
  validateDigest(value, name);
  return value;
}

function requiredPositiveInteger(name: string): number {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

export function shellBuildIndexObjectKey(channel: string, shellType: string, sourceDigest: Digest, target: ShellTarget): string {
  validateDigest(sourceDigest, "Shell source digest");
  if (!tokenPattern.test(shellType)) throw new Error(`invalid Shell type: ${shellType}`);
  return `${channel}/shells/${shellType}/builds/${sourceDigest.slice("sha256:".length)}/artifacts/${target}.json`;
}

export function shellBuildVersionPrefix(channel: string, shellType: string, version: string, target: ShellTarget): string {
  if (!tokenPattern.test(shellType)) throw new Error(`invalid Shell type: ${shellType}`);
  return `${channel}/shells/${shellType}/versions/${version}/${target}`;
}

export function shellSmokeProofObjectKey(
  channel: string,
  shellType: string,
  sourceDigest: Digest,
  target: ShellTarget,
  matrix: string,
  acceptanceDigest: Digest,
  standaloneProtocolVersion: number,
): string {
  validateDigest(sourceDigest, "Shell source digest");
  validateDigest(acceptanceDigest, "Shell smoke acceptance digest");
  if (!tokenPattern.test(shellType)) throw new Error(`invalid Shell type: ${shellType}`);
  if (!tokenPattern.test(matrix)) throw new Error(`invalid Shell smoke matrix: ${matrix}`);
  if (!Number.isSafeInteger(standaloneProtocolVersion) || standaloneProtocolVersion < 1) {
    throw new Error("Shell smoke Standalone protocol version must be a positive integer");
  }
  return `${channel}/shells/${shellType}/builds/${sourceDigest.slice("sha256:".length)}/acceptance/${target}/${matrix}/standalone-v${standaloneProtocolVersion}/${acceptanceDigest.slice("sha256:".length)}.json`;
}

function requiredShellSmokeScenarioEntries(matrix: string): Array<{ lane: "migration" | "shell"; step: string }> {
  if (matrix === "mac-shell-v2") {
    return [
      { lane: "shell", step: "mac-shell-lifecycle" },
      { lane: "shell", step: "mac-shell-silent-update" },
      { lane: "shell", step: "mac-shell-rollback" },
    ];
  }
  if (matrix === "mac-shell-v3") {
    return [
      { lane: "shell", step: "mac-shell-lifecycle" },
      { lane: "shell", step: "mac-shell-silent-update" },
      { lane: "shell", step: "mac-shell-rollback" },
      { lane: "migration", step: "mac-legacy-migration" },
    ];
  }
  throw new Error(`unsupported Shell smoke matrix: ${matrix}`);
}

function requiredShellSmokeScenarios(matrix: string): string[] {
  return requiredShellSmokeScenarioEntries(matrix).map(({ step }) => step);
}

export function validateShellSmokeProofRecord(
  value: unknown,
  expected: Pick<ShellBuildPlan, "profileDigest" | "shell" | "target">,
  channel: ReleaseChannel,
  matrix: string,
  acceptanceDigest: Digest,
  standaloneProtocolVersion: number,
): ShellSmokeProofRecord {
  assertRecord(value, "Shell smoke proof");
  assertRecord(value.shell, "Shell smoke proof shell");
  if (
    value.schemaVersion !== 2
    || value.channel !== channel
    || value.matrix !== matrix
    || value.acceptanceDigest !== acceptanceDigest
    || value.standaloneProtocolVersion !== standaloneProtocolVersion
    || value.target !== expected.target
    || value.profileDigest !== expected.profileDigest
    || value.shell.type !== expected.shell.type
    || value.shell.sourceDigest !== expected.shell.sourceDigest
  ) throw new Error("Shell smoke proof identity does not match the requested build");
  validateDigest(value.profileDigest, "Shell smoke proof profileDigest");
  validateDigest(value.acceptanceDigest, "Shell smoke proof acceptanceDigest");
  validateDigest(value.shell.sourceDigest, "Shell smoke proof sourceDigest");
  parseReleaseVersion(String(value.shell.version), channel);
  parseReleaseVersion(String(value.releaseVersion), channel);
  const requiredScenarios = requiredShellSmokeScenarios(matrix);
  if (
    !Array.isArray(value.scenarios)
    || value.scenarios.some((scenario) => typeof scenario !== "string")
    || JSON.stringify(value.scenarios) !== JSON.stringify(requiredScenarios)
  ) throw new Error("Shell smoke proof scenarios do not match the requested matrix");
  return value as ShellSmokeProofRecord;
}

export function validateShellBuildPlan(value: unknown, channel: ReleaseChannel): ShellBuildPlan {
  assertRecord(value, "Shell build plan");
  assertRecord(value.shell, "Shell build plan shell");
  assertRecord(value.artifacts, "Shell build plan artifacts");
  validateDigest(value.shell.sourceDigest, "Shell build plan sourceDigest");
  validateDigest(value.profileDigest, "Shell build plan profileDigest");
  if (value.schemaVersion !== 1) throw new Error("unsupported Shell build plan schemaVersion");
  if (!tokenPattern.test(String(value.shell.type))) throw new Error("invalid Shell build plan type");
  if (value.target !== "darwin-arm64" && value.target !== "darwin-x64" && value.target !== "win32-x64") {
    throw new Error(`unsupported Shell target: ${String(value.target)}`);
  }
  parseReleaseVersion(String(value.shell.version), channel);
  for (const [kind, path] of Object.entries(value.artifacts)) {
    if (!artifactKindPattern.test(kind) || (path !== null && typeof path !== "string")) {
      throw new Error(`invalid Shell build plan artifact ${kind}`);
    }
  }
  if (typeof value.outputRoot !== "string" || typeof value.runtimeNamespaceRoot !== "string" || typeof value.to !== "string") {
    throw new Error("Shell build plan paths and output target are required");
  }
  return value as ShellBuildPlan;
}

export function validateShellBuildRecord(value: unknown, expected: Pick<ShellBuildPlan, "profileDigest" | "shell" | "target">, channel: ReleaseChannel): ShellBuildRecord {
  assertRecord(value, "Shell build record");
  assertRecord(value.shell, "Shell build record shell");
  assertRecord(value.artifacts, "Shell build record artifacts");
  if (value.schemaVersion !== 1 || value.channel !== channel || value.target !== expected.target) {
    throw new Error("Shell build record scope does not match the requested build");
  }
  if (value.shell.type !== expected.shell.type || value.shell.sourceDigest !== expected.shell.sourceDigest) {
    throw new Error("Shell build record identity does not match the requested source");
  }
  validateDigest(value.shell.sourceDigest, "Shell build record sourceDigest");
  validateDigest(value.profileDigest, "Shell build record profileDigest");
  if (value.profileDigest !== expected.profileDigest) throw new Error("Shell build record profile does not match the requested build");
  parseReleaseVersion(String(value.shell.version), channel);
  const artifacts: Record<string, ShellBuildArtifactRecord> = {};
  for (const [kind, raw] of Object.entries(value.artifacts)) {
    assertRecord(raw, `Shell build record artifact ${kind}`);
    validateDigest(raw.digest, `Shell build record artifact ${kind} digest`);
    if (
      !artifactKindPattern.test(kind)
      || typeof raw.contentType !== "string"
      || typeof raw.name !== "string"
      || typeof raw.objectKey !== "string"
      || typeof raw.size !== "number"
      || !Number.isSafeInteger(raw.size)
      || raw.size <= 0
      || typeof raw.url !== "string"
    ) throw new Error(`invalid Shell build record artifact ${kind}`);
    artifacts[kind] = { ...(raw as ShellBuildArtifactRecord), url: normalizePublicUrl(raw.url) };
  }
  return { ...(value as ShellBuildRecord), artifacts };
}

function sha256(bytes: Buffer): Digest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function requirePlannedArtifacts(plan: ShellBuildPlan, artifacts: Record<string, ShellBuildArtifactRecord>): void {
  for (const [kind, path] of Object.entries(plan.artifacts)) {
    if (path != null && kind !== "app" && kind !== "unpacked" && artifacts[kind] == null) {
      throw new Error(`Shell build record is missing required ${kind} artifact`);
    }
  }
}

function writeGithubOutput(name: string, value: string): void {
  const path = optional("GITHUB_OUTPUT");
  if (path.length > 0) appendFileSync(path, `${name}=${value}\n`, "utf8");
}

function createReusedBuildReport(
  plan: ShellBuildPlan,
  record: ShellBuildRecord,
  durationMs: number,
  smokeProof: {
    acceptanceDigest: Digest;
    matrix: string;
    standaloneProtocolVersion: number;
    state: "hit" | "miss";
    url: string | null;
  } | null,
): Record<string, unknown> {
  const local = (kind: string): string | null => plan.artifacts[kind] ?? null;
  const artifact = (kind: string): BuildArtifact | null => {
    const path = local(kind);
    const source = record.artifacts[kind];
    return path == null || source == null ? null : { digest: source.digest, path, size: source.size };
  };
  return {
    appPath: local("app"),
    artifacts: {
      ...(plan.target.startsWith("darwin-")
        ? { dmg: artifact("dmg"), payload: artifact("payload"), zip: artifact("zip") }
        : { installer: artifact("installer"), payload: artifact("payload"), portableZip: artifact("portableZip") }),
    },
    cacheReport: { entries: [] },
    ...(plan.target.startsWith("darwin-")
      ? {
          dmgPath: local("dmg"),
          latestMacYmlPath: null,
          payloadPath: local("payload"),
          zipPath: local("zip"),
        }
      : {
          blockmapPath: null,
          installerPath: local("installer"),
          latestYmlPath: null,
          payloadPath: local("payload"),
          portableZipPath: local("portableZip"),
          unpackedPath: null,
        }),
    outputRoot: plan.outputRoot,
    releaseVersion: plan.releaseVersion,
    resolution: {
      artifacts: record.artifacts,
      recordUrl: publicUrl(
        required("RELEASE_PUBLIC_ORIGIN"),
        "",
        shellBuildIndexObjectKey(record.channel, record.shell.type, record.shell.sourceDigest, record.target),
      ),
      smokeProof,
      state: "reused",
    },
    runtimeNamespaceRoot: plan.runtimeNamespaceRoot,
    shell: record.shell,
    timings: [{ durationMs, phase: "remote-shell-materialize" }],
    to: plan.to,
  };
}

async function putImmutable(storage: StorageConfig, input: { body?: Buffer; bodyPath?: string; contentType: string; objectKey: string }): Promise<void> {
  const result = await putStorageObjectWithStatus({
    ...storage,
    ...(input.body == null ? { bodyPath: input.bodyPath } : { body: input.body }),
    cacheControl: "public, max-age=31536000, immutable",
    contentType: input.contentType,
    headers: { "if-none-match": "*" },
    objectKey: input.objectKey,
  });
  if (result.ok) return;
  if (result.status !== 412) throw new Error(`immutable Shell PUT failed with HTTP ${result.status}: ${result.body}`);
  const existing = await getStorageObject({ ...storage, objectKey: input.objectKey });
  if (existing == null) throw new Error(`immutable Shell object disappeared after conflict: ${input.objectKey}`);
  const expected = input.body ?? readFileSync(input.bodyPath ?? "");
  if (sha256(existing.bytes) !== sha256(expected)) throw new Error(`immutable Shell object conflicts: ${input.objectKey}`);
}

export async function resolveShellBuild(): Promise<void> {
  const startedAt = performance.now();
  const channel = releaseChannelDescriptor(required("RELEASE_CHANNEL")).channel;
  const planPath = required("RELEASE_SHELL_PLAN_JSON_PATH");
  const outputPath = required("RELEASE_SHELL_BUILD_JSON_PATH");
  const plan = validateShellBuildPlan(JSON.parse(readFileSync(planPath, "utf8")) as unknown, channel);
  const smokeMatrix = optional("RELEASE_SHELL_SMOKE_MATRIX");
  const smokeAcceptanceDigest = smokeMatrix.length > 0
    ? requiredDigest("RELEASE_SHELL_SMOKE_ACCEPTANCE_DIGEST")
    : null;
  const standaloneProtocolVersion = smokeMatrix.length > 0
    ? requiredPositiveInteger("RELEASE_STANDALONE_PROTOCOL_VERSION")
    : null;
  const storage = storageConfigFromEnv();
  const indexKey = shellBuildIndexObjectKey(channel, plan.shell.type, plan.shell.sourceDigest, plan.target);
  const object = await getStorageObject({ ...storage, objectKey: indexKey });
  if (object == null) {
    writeJson(outputPath, { indexKey, shell: plan.shell, state: "miss", target: plan.target });
    writeGithubOutput("state", "miss");
    if (optional("RELEASE_SHELL_SMOKE_MATRIX").length > 0) writeGithubOutput("smoke_proof", "miss");
    console.log(`Shell build miss: ${indexKey}`);
    return;
  }
  const record = validateShellBuildRecord(JSON.parse(object.text) as unknown, plan, channel);
  requirePlannedArtifacts(plan, record.artifacts);
  for (const [kind, artifact] of Object.entries(record.artifacts)) {
    const targetPath = plan.artifacts[kind];
    if (targetPath == null) continue;
    const remote = await getStorageObject({ ...storage, objectKey: artifact.objectKey });
    if (remote == null) throw new Error(`Shell ${kind} artifact is missing: ${artifact.objectKey}`);
    if (remote.bytes.byteLength !== artifact.size || sha256(remote.bytes) !== artifact.digest) {
      throw new Error(`Shell ${kind} artifact failed immutable digest verification`);
    }
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, remote.bytes);
  }
  let smokeProof: {
    acceptanceDigest: Digest;
    matrix: string;
    standaloneProtocolVersion: number;
    state: "hit" | "miss";
    url: string | null;
  } | null = null;
  if (smokeMatrix.length > 0) {
    const acceptanceDigest = smokeAcceptanceDigest!;
    const protocolVersion = standaloneProtocolVersion!;
    const proofKey = shellSmokeProofObjectKey(
      channel,
      plan.shell.type,
      plan.shell.sourceDigest,
      plan.target,
      smokeMatrix,
      acceptanceDigest,
      protocolVersion,
    );
    const proofObject = await getStorageObject({ ...storage, objectKey: proofKey });
    if (proofObject == null) {
      smokeProof = {
        acceptanceDigest,
        matrix: smokeMatrix,
        standaloneProtocolVersion: protocolVersion,
        state: "miss",
        url: null,
      };
      writeGithubOutput("smoke_proof", "miss");
    } else {
      validateShellSmokeProofRecord(
        JSON.parse(proofObject.text) as unknown,
        plan,
        channel,
        smokeMatrix,
        acceptanceDigest,
        protocolVersion,
      );
      const proofUrl = publicUrl(required("RELEASE_PUBLIC_ORIGIN"), "", proofKey);
      smokeProof = {
        acceptanceDigest,
        matrix: smokeMatrix,
        standaloneProtocolVersion: protocolVersion,
        state: "hit",
        url: proofUrl,
      };
      writeGithubOutput("smoke_proof", "hit");
      writeGithubOutput("smoke_proof_url", proofUrl);
    }
  }
  writeJson(
    outputPath,
    createReusedBuildReport(plan, record, Math.max(1, Math.round(performance.now() - startedAt)), smokeProof),
  );
  writeGithubOutput("state", "hit");
  writeGithubOutput("shell_version", record.shell.version);
  console.log(`Shell build hit: ${indexKey} (${record.shell.version})`);
}

export async function registerShellSmokeProof(): Promise<void> {
  const channel = releaseChannelDescriptor(required("RELEASE_CHANNEL")).channel;
  const matrix = required("RELEASE_SHELL_SMOKE_MATRIX");
  const acceptanceDigest = requiredDigest("RELEASE_SHELL_SMOKE_ACCEPTANCE_DIGEST");
  const standaloneProtocolVersion = requiredPositiveInteger("RELEASE_STANDALONE_PROTOCOL_VERSION");
  const plan = validateShellBuildPlan(
    JSON.parse(readFileSync(required("RELEASE_SHELL_PLAN_JSON_PATH"), "utf8")) as unknown,
    channel,
  );
  const build = JSON.parse(readFileSync(required("RELEASE_SHELL_BUILD_JSON_PATH"), "utf8")) as ShellBuildReport;
  if (
    build.shell?.type !== plan.shell.type
    || build.shell?.sourceDigest !== plan.shell.sourceDigest
    || typeof build.shell.version !== "string"
  ) throw new Error("Shell smoke build report does not match the resolved Shell source identity");
  const summary = JSON.parse(readFileSync(required("RELEASE_SHELL_SMOKE_SUMMARY_PATH"), "utf8")) as unknown;
  assertRecord(summary, "Shell smoke summary");
  assertRecord(summary.plan, "Shell smoke summary plan");
  const scenarioEntries = requiredShellSmokeScenarioEntries(matrix);
  const requiredLanes = [...new Set(scenarioEntries.map(({ lane }) => lane))];
  const selectedLanes = summary.plan.selectedLanes;
  if (
    !Array.isArray(selectedLanes)
    || requiredLanes.some((lane) => !selectedLanes.includes(lane))
  ) {
    throw new Error(`Shell smoke summary did not select required lanes: ${requiredLanes.join(", ")}`);
  }
  if (!Array.isArray(summary.timings)) throw new Error("Shell smoke summary timings are required");
  const expectedLanes = new Map(scenarioEntries.map(({ lane, step }) => [step, lane]));
  const successful = new Set(
    summary.timings.flatMap((entry) => {
      if (entry == null || typeof entry !== "object" || Array.isArray(entry)) return [];
      const timing = entry as Record<string, unknown>;
      return typeof timing.step === "string"
        && timing.lane === expectedLanes.get(timing.step)
        && timing.status === "success"
        ? [timing.step]
        : [];
    }),
  );
  const scenarios = scenarioEntries.map(({ step }) => step);
  const missing = scenarios.filter((scenario) => !successful.has(scenario));
  if (missing.length > 0) throw new Error(`Shell smoke proof is missing successful scenarios: ${missing.join(", ")}`);
  const releaseVersion = String(build.releaseVersion ?? plan.releaseVersion ?? "");
  parseReleaseVersion(releaseVersion, channel);
  const record: ShellSmokeProofRecord = {
    acceptanceDigest,
    channel,
    createdAt: new Date().toISOString(),
    matrix,
    profileDigest: plan.profileDigest,
    provenance: githubInfo(),
    releaseVersion,
    scenarios,
    schemaVersion: 2,
    shell: build.shell,
    standaloneProtocolVersion,
    target: plan.target,
  };
  const storage = storageConfigFromEnv();
  const objectKey = shellSmokeProofObjectKey(
    channel,
    build.shell.type,
    build.shell.sourceDigest,
    plan.target,
    matrix,
    acceptanceDigest,
    standaloneProtocolVersion,
  );
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
  const result = await putStorageObjectWithStatus({
    ...storage,
    body: bytes,
    cacheControl: "public, max-age=31536000, immutable",
    contentType: "application/json; charset=utf-8",
    headers: { "if-none-match": "*" },
    objectKey,
  });
  if (!result.ok) {
    if (result.status !== 412) throw new Error(`Shell smoke proof PUT failed with HTTP ${result.status}: ${result.body}`);
    const existing = await getStorageObject({ ...storage, objectKey });
    if (existing == null) throw new Error(`Shell smoke proof disappeared after conflict: ${objectKey}`);
    validateShellSmokeProofRecord(
      JSON.parse(existing.text) as unknown,
      plan,
      channel,
      matrix,
      acceptanceDigest,
      standaloneProtocolVersion,
    );
  }
  console.log(`registered immutable Shell smoke proof: ${objectKey}`);
}

export async function registerShellBuild(): Promise<void> {
  const channel = releaseChannelDescriptor(required("RELEASE_CHANNEL")).channel;
  const publicOrigin = required("RELEASE_PUBLIC_ORIGIN");
  const plan = validateShellBuildPlan(
    JSON.parse(readFileSync(required("RELEASE_SHELL_PLAN_JSON_PATH"), "utf8")) as unknown,
    channel,
  );
  const build = JSON.parse(readFileSync(required("RELEASE_SHELL_BUILD_JSON_PATH"), "utf8")) as ShellBuildReport;
  if (
    build.shell?.type !== plan.shell.type
    || build.shell?.sourceDigest !== plan.shell.sourceDigest
    || typeof build.shell.version !== "string"
  ) throw new Error("built Shell report does not match the resolved Shell source identity");
  parseReleaseVersion(build.shell.version, channel);
  const storage = storageConfigFromEnv();
  const prefix = shellBuildVersionPrefix(channel, build.shell.type, build.shell.version, plan.target);
  const artifacts: Record<string, ShellBuildArtifactRecord> = {};
  for (const [kind, raw] of Object.entries(build.artifacts ?? {})) {
    if (raw == null) continue;
    if (!existsSync(raw.path) || !statSync(raw.path).isFile()) throw new Error(`built Shell ${kind} path is missing: ${raw.path}`);
    const bytes = readFileSync(raw.path);
    const digest = sha256(bytes);
    if (digest !== raw.digest || bytes.byteLength !== raw.size) throw new Error(`built Shell ${kind} descriptor does not match bytes`);
    const name = basename(raw.path);
    const objectKey = `${prefix}/${name}`;
    await putImmutable(storage, { bodyPath: raw.path, contentType: contentType(name), objectKey });
    artifacts[kind] = { contentType: contentType(name), digest, name, objectKey, size: raw.size, url: publicUrl(publicOrigin, prefix, name) };
  }
  requirePlannedArtifacts(plan, artifacts);
  const record: ShellBuildRecord = {
    artifacts,
    channel,
    createdAt: new Date().toISOString(),
    provenance: githubInfo(),
    profileDigest: plan.profileDigest,
    schemaVersion: 1,
    shell: build.shell,
    target: plan.target,
  };
  const indexKey = shellBuildIndexObjectKey(channel, build.shell.type, build.shell.sourceDigest, plan.target);
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
  const result = await putStorageObjectWithStatus({
    ...storage,
    body: bytes,
    cacheControl: "public, max-age=31536000, immutable",
    contentType: "application/json; charset=utf-8",
    headers: { "if-none-match": "*" },
    objectKey: indexKey,
  });
  let committedRecord = record;
  if (!result.ok) {
    if (result.status !== 412) throw new Error(`Shell build record PUT failed with HTTP ${result.status}: ${result.body}`);
    const existing = await getStorageObject({ ...storage, objectKey: indexKey });
    if (existing == null) throw new Error(`Shell build record disappeared after conflict: ${indexKey}`);
    const current = validateShellBuildRecord(JSON.parse(existing.text) as unknown, plan, channel);
    const comparable = (value: ShellBuildRecord) => JSON.stringify({ artifacts: value.artifacts, channel: value.channel, profileDigest: value.profileDigest, schemaVersion: value.schemaVersion, shell: value.shell, target: value.target });
    if (comparable(current) !== comparable(record)) throw new Error(`Shell build record conflicts: ${indexKey}`);
    committedRecord = current;
  }
  writeJson(required("RELEASE_SHELL_BUILD_JSON_PATH"), {
    ...build,
    resolution: {
      artifacts: committedRecord.artifacts,
      recordUrl: publicUrl(publicOrigin, "", indexKey),
      state: "registered",
    },
  });
  console.log(`registered immutable Shell build: ${indexKey}`);
}
