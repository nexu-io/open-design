import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseReleaseVersion,
  releaseChannelDescriptor,
  releaseShellPrefix,
  type ReleaseChannel,
  type ReleaseTarget,
} from "@open-design/release";

import { resolveReleaseIdentity } from "../identity/resolution/resolve.ts";
import { contentType, githubInfo, normalizePublicUrl, optional, publicUrl, required, storageConfigFromEnv, writeJson } from "./common.ts";
import { getStorageObject, putStorageObjectWithStatus, type StorageConfig } from "./s3-upload.ts";

type Digest = `sha256:${string}`;
type ShellTarget = "darwin-arm64" | "darwin-x64" | "win32-x64";
type ShellIdentity = {
  buildDigest: Digest;
  capabilityDigest: Digest;
  carrierDigest: Digest;
  depsDigest: Digest;
  sourceDigest: Digest;
  type: string;
  version: string;
};

export type ShellBuildPlan = {
  artifacts: Record<string, string | null>;
  outputRoot: string;
  profile: Record<string, unknown>;
  releaseVersion: string | null;
  runtimeNamespaceRoot: string;
  schemaVersion: 4;
  shell: ShellIdentity;
  target: ShellTarget;
  to: string;
};

type BuildArtifact = { digest: Digest; path: string; size: number };
type ShellBuildReport = {
  artifacts: Record<string, BuildArtifact | null>;
  releaseVersion: string | null;
  shell: ShellIdentity;
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
  releaseDigest: Digest;
  schemaVersion: 4;
  shell: ShellIdentity;
  target: ShellTarget;
};

export type ShellSmokeProofRecord = {
  specDigest: Digest;
  channel: string;
  createdAt: string;
  matrix: string;
  provenance: Record<string, unknown>;
  releaseDigest: Digest;
  releaseVersion: string;
  scenarios: string[];
  schemaVersion: 5;
  shell: ShellIdentity;
  standaloneProtocolVersion: number;
  target: ShellTarget;
};

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const tokenPattern = /^[a-z][a-z0-9-]*$/;
const artifactKindPattern = /^[a-z][A-Za-z0-9]*$/;
const SHELL_BUILD_STORAGE_EPOCH = 1 as const;

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

export function shellBuildIndexObjectKey(
  channel: string,
  shellType: string,
  releaseDigest: Digest,
  target: ShellTarget,
): string {
  validateDigest(releaseDigest, "Shell release digest");
  if (!tokenPattern.test(shellType)) throw new Error(`invalid Shell type: ${shellType}`);
  const storageDigest = shellBuildStorageDigest(releaseDigest);
  return `${channel}/shells/${shellType}/builds/${storageDigest.slice("sha256:".length)}/artifacts/${target}.json`;
}

export function shellBuildStorageDigest(releaseDigest: Digest): Digest {
  validateDigest(releaseDigest, "Shell release digest");
  return sha256(Buffer.from(JSON.stringify({
    releaseDigest,
    storageEpoch: SHELL_BUILD_STORAGE_EPOCH,
  })));
}

export function shellBuildVersionPrefix(channel: string, shellType: string, version: string, target: ShellTarget): string {
  if (!tokenPattern.test(shellType)) throw new Error(`invalid Shell type: ${shellType}`);
  const releaseChannel = releaseChannelDescriptor(channel).channel;
  const releaseTarget: ReleaseTarget = target === "darwin-arm64"
    ? "mac_arm64"
    : target === "darwin-x64"
      ? "mac_x64"
      : "win_x64";
  return releaseShellPrefix(releaseChannel, version, releaseTarget, shellType);
}

export function shellSmokeProofObjectKey(
  channel: string,
  shellType: string,
  releaseDigest: Digest,
  target: ShellTarget,
  matrix: string,
  specDigest: Digest,
  standaloneProtocolVersion: number,
): string {
  validateDigest(releaseDigest, "Shell release digest");
  validateDigest(specDigest, "Shell spec digest");
  if (!tokenPattern.test(shellType)) throw new Error(`invalid Shell type: ${shellType}`);
  if (!tokenPattern.test(matrix)) throw new Error(`invalid Shell smoke matrix: ${matrix}`);
  if (!Number.isSafeInteger(standaloneProtocolVersion) || standaloneProtocolVersion < 1) {
    throw new Error("Shell smoke Standalone protocol version must be a positive integer");
  }
  const storageDigest = shellBuildStorageDigest(releaseDigest);
  return `${channel}/shells/${shellType}/builds/${storageDigest.slice("sha256:".length)}/spec/${target}/${matrix}/standalone-v${standaloneProtocolVersion}/${specDigest.slice("sha256:".length)}.json`;
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
  if (matrix === "win-shell-v1") {
    return [
      { lane: "shell", step: "win-shell-lifecycle" },
      { lane: "shell", step: "win-shell-silent-update" },
      { lane: "shell", step: "win-shell-rollback" },
      { lane: "migration", step: "win-legacy-migration" },
    ];
  }
  if (matrix === "win-shell-v2") {
    return [
      { lane: "shell", step: "win-shell-lifecycle" },
      { lane: "shell", step: "win-shell-silent-update" },
      { lane: "shell", step: "win-shell-rollback" },
      { lane: "shell", step: "win-native-install-boundaries" },
      { lane: "migration", step: "win-legacy-migration" },
    ];
  }
  throw new Error(`unsupported Shell smoke matrix: ${matrix}`);
}

function requiredShellSmokeScenarios(matrix: string): string[] {
  return requiredShellSmokeScenarioEntries(matrix).map(({ step }) => step);
}

export function validateShellSmokeProofRecord(
  value: unknown,
  expected: Pick<ShellBuildPlan, "shell" | "target">,
  channel: ReleaseChannel,
  releaseDigest: Digest,
  matrix: string,
  specDigest: Digest,
  standaloneProtocolVersion: number,
): ShellSmokeProofRecord {
  assertRecord(value, "Shell smoke proof");
  assertRecord(value.shell, "Shell smoke proof shell");
  if (
    value.schemaVersion !== 5
    || value.channel !== channel
    || value.releaseDigest !== releaseDigest
    || value.matrix !== matrix
    || value.specDigest !== specDigest
    || value.standaloneProtocolVersion !== standaloneProtocolVersion
    || value.target !== expected.target
    || value.shell.type !== expected.shell.type
  ) throw new Error("Shell smoke proof identity does not match the requested build");
  validateDigest(value.releaseDigest, "Shell smoke proof releaseDigest");
  validateDigest(value.specDigest, "Shell smoke proof specDigest");
  validateDigest(value.shell.buildDigest, "Shell smoke proof buildDigest");
  validateDigest(value.shell.capabilityDigest, "Shell smoke proof capabilityDigest");
  validateDigest(value.shell.carrierDigest, "Shell smoke proof carrierDigest");
  validateDigest(value.shell.depsDigest, "Shell smoke proof depsDigest");
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
  assertRecord(value.profile, "Shell build plan profile");
  validateDigest(value.shell.buildDigest, "Shell build plan buildDigest");
  validateDigest(value.shell.capabilityDigest, "Shell build plan capabilityDigest");
  validateDigest(value.shell.carrierDigest, "Shell build plan carrierDigest");
  validateDigest(value.shell.depsDigest, "Shell build plan depsDigest");
  validateDigest(value.shell.sourceDigest, "Shell build plan sourceDigest");
  if (value.schemaVersion !== 4) throw new Error("unsupported Shell build plan schemaVersion");
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

export function validateShellBuildRecord(
  value: unknown,
  expected: Pick<ShellBuildPlan, "shell" | "target">,
  channel: ReleaseChannel,
  releaseDigest: Digest,
): ShellBuildRecord {
  assertRecord(value, "Shell build record");
  assertRecord(value.shell, "Shell build record shell");
  assertRecord(value.artifacts, "Shell build record artifacts");
  if (
    value.schemaVersion !== 4
    || value.channel !== channel
    || value.releaseDigest !== releaseDigest
    || value.target !== expected.target
  ) {
    throw new Error("Shell build record scope does not match the requested build");
  }
  if (value.shell.type !== expected.shell.type) {
    throw new Error("Shell build record identity does not match the requested source");
  }
  validateDigest(value.releaseDigest, "Shell build record releaseDigest");
  validateDigest(value.shell.buildDigest, "Shell build record buildDigest");
  validateDigest(value.shell.capabilityDigest, "Shell build record capabilityDigest");
  validateDigest(value.shell.carrierDigest, "Shell build record carrierDigest");
  validateDigest(value.shell.depsDigest, "Shell build record depsDigest");
  validateDigest(value.shell.sourceDigest, "Shell build record sourceDigest");
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

export async function resolveShellReleaseDigest(
  plan: Pick<ShellBuildPlan, "profile" | "target">,
  workspaceRoot = fileURLToPath(new URL("../../../..", import.meta.url)),
): Promise<Digest> {
  return (await resolveReleaseIdentity({
    id: `shell.build.${plan.target}`,
    parameters: { profile: plan.profile, target: plan.target },
    workspaceRoot,
  })).digest;
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
    specDigest: Digest;
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
      createdAt: record.createdAt,
      recordUrl: publicUrl(
        required("RELEASE_PUBLIC_ORIGIN"),
        "",
        shellBuildIndexObjectKey(
          record.channel,
          record.shell.type,
          record.releaseDigest,
          record.target,
        ),
      ),
      smokeProof,
      state: "reused",
    },
    runtimeNamespaceRoot: plan.runtimeNamespaceRoot,
    shell: { ...plan.shell, version: record.shell.version },
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
  const shellSpecDigest = smokeMatrix.length > 0
    ? requiredDigest("RELEASE_SHELL_SPEC_DIGEST")
    : null;
  const standaloneProtocolVersion = smokeMatrix.length > 0
    ? requiredPositiveInteger("RELEASE_STANDALONE_PROTOCOL_VERSION")
    : null;
  const releaseDigest = await resolveShellReleaseDigest(plan);
  const storage = storageConfigFromEnv();
  const indexKey = shellBuildIndexObjectKey(
    channel,
    plan.shell.type,
    releaseDigest,
    plan.target,
  );
  const object = await getStorageObject({ ...storage, objectKey: indexKey });
  if (object == null) {
    writeJson(outputPath, { indexKey, shell: plan.shell, state: "miss", target: plan.target });
    writeGithubOutput("state", "miss");
    if (optional("RELEASE_SHELL_SMOKE_MATRIX").length > 0) writeGithubOutput("smoke_proof", "miss");
    console.log(`Shell build miss: ${indexKey}`);
    return;
  }
  const record = validateShellBuildRecord(JSON.parse(object.text) as unknown, plan, channel, releaseDigest);
  requirePlannedArtifacts(plan, record.artifacts);
  for (const [kind, artifact] of Object.entries(record.artifacts)) {
    const targetPath = plan.artifacts[kind];
    if (targetPath == null) continue;
    const remote = await getStorageObject({ ...storage, objectKey: artifact.objectKey });
    if (remote == null) {
      throw new Error(`immutable Shell ${kind} artifact is missing: ${artifact.objectKey}`);
    }
    if (remote.bytes.byteLength !== artifact.size || sha256(remote.bytes) !== artifact.digest) {
      throw new Error(`immutable Shell ${kind} artifact failed digest verification: ${artifact.objectKey}`);
    }
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, remote.bytes);
  }
  let smokeProof: {
    specDigest: Digest;
    matrix: string;
    standaloneProtocolVersion: number;
    state: "hit" | "miss";
    url: string | null;
  } | null = null;
  if (smokeMatrix.length > 0) {
    const specDigest = shellSpecDigest!;
    const protocolVersion = standaloneProtocolVersion!;
    const proofKey = shellSmokeProofObjectKey(
      channel,
      plan.shell.type,
      releaseDigest,
      plan.target,
      smokeMatrix,
      specDigest,
      protocolVersion,
    );
    const proofObject = await getStorageObject({ ...storage, objectKey: proofKey });
    if (proofObject == null) {
      smokeProof = {
        specDigest,
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
        releaseDigest,
        smokeMatrix,
        specDigest,
        protocolVersion,
      );
      const proofUrl = publicUrl(required("RELEASE_PUBLIC_ORIGIN"), "", proofKey);
      smokeProof = {
        specDigest,
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
  const specDigest = requiredDigest("RELEASE_SHELL_SPEC_DIGEST");
  const standaloneProtocolVersion = requiredPositiveInteger("RELEASE_STANDALONE_PROTOCOL_VERSION");
  const plan = validateShellBuildPlan(
    JSON.parse(readFileSync(required("RELEASE_SHELL_PLAN_JSON_PATH"), "utf8")) as unknown,
    channel,
  );
  const build = JSON.parse(readFileSync(required("RELEASE_SHELL_BUILD_JSON_PATH"), "utf8")) as ShellBuildReport;
  if (
    build.shell?.type !== plan.shell.type
    || build.shell?.buildDigest !== plan.shell.buildDigest
    || build.shell?.capabilityDigest !== plan.shell.capabilityDigest
    || build.shell?.carrierDigest !== plan.shell.carrierDigest
    || build.shell?.depsDigest !== plan.shell.depsDigest
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
  const releaseDigest = await resolveShellReleaseDigest(plan);
  const record: ShellSmokeProofRecord = {
    specDigest,
    channel,
    createdAt: new Date().toISOString(),
    matrix,
    provenance: githubInfo(),
    releaseDigest,
    releaseVersion,
    scenarios,
    schemaVersion: 5,
    shell: build.shell,
    standaloneProtocolVersion,
    target: plan.target,
  };
  const storage = storageConfigFromEnv();
  const objectKey = shellSmokeProofObjectKey(
    channel,
    build.shell.type,
    releaseDigest,
    plan.target,
    matrix,
    specDigest,
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
      releaseDigest,
      matrix,
      specDigest,
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
    || build.shell?.buildDigest !== plan.shell.buildDigest
    || build.shell?.capabilityDigest !== plan.shell.capabilityDigest
    || build.shell?.carrierDigest !== plan.shell.carrierDigest
    || build.shell?.depsDigest !== plan.shell.depsDigest
    || build.shell?.sourceDigest !== plan.shell.sourceDigest
    || typeof build.shell.version !== "string"
  ) throw new Error("built Shell report does not match the resolved Shell source identity");
  parseReleaseVersion(build.shell.version, channel);
  const releaseDigest = await resolveShellReleaseDigest(plan);
  const storage = storageConfigFromEnv();
  if (plan.releaseVersion == null) {
    throw new Error("public Shell registration requires a release version");
  }
  const indexKey = shellBuildIndexObjectKey(
    channel,
    build.shell.type,
    releaseDigest,
    plan.target,
  );
  const prefix = `${indexKey.slice(0, -".json".length)}/blobs`;
  const artifacts: Record<string, ShellBuildArtifactRecord> = {};
  for (const [kind, raw] of Object.entries(build.artifacts ?? {})) {
    if (raw == null) continue;
    if (!existsSync(raw.path) || !statSync(raw.path).isFile()) throw new Error(`built Shell ${kind} path is missing: ${raw.path}`);
    const bytes = readFileSync(raw.path);
    const digest = sha256(bytes);
    if (digest !== raw.digest || bytes.byteLength !== raw.size) throw new Error(`built Shell ${kind} descriptor does not match bytes`);
    const name = basename(raw.path);
    const objectKey = `${prefix}/${digest.slice("sha256:".length)}-${name}`;
    await putImmutable(storage, { bodyPath: raw.path, contentType: contentType(name), objectKey });
    artifacts[kind] = { contentType: contentType(name), digest, name, objectKey, size: raw.size, url: publicUrl(publicOrigin, "", objectKey) };
  }
  requirePlannedArtifacts(plan, artifacts);
  const record: ShellBuildRecord = {
    artifacts,
    channel,
    createdAt: new Date().toISOString(),
    provenance: githubInfo(),
    releaseDigest,
    schemaVersion: 4,
    shell: build.shell,
    target: plan.target,
  };
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
    const current = validateShellBuildRecord(JSON.parse(existing.text) as unknown, plan, channel, releaseDigest);
    const comparable = (value: ShellBuildRecord) => JSON.stringify({
      artifacts: value.artifacts,
      channel: value.channel,
      releaseDigest: value.releaseDigest,
      schemaVersion: value.schemaVersion,
      shellType: value.shell.type,
      target: value.target,
    });
    if (comparable(current) !== comparable(record)) throw new Error(`Shell build record conflicts: ${indexKey}`);
    committedRecord = current;
  }
  writeJson(required("RELEASE_SHELL_BUILD_JSON_PATH"), {
    ...build,
    resolution: {
      artifacts: committedRecord.artifacts,
      createdAt: committedRecord.createdAt,
      recordUrl: publicUrl(publicOrigin, "", indexKey),
      state: "registered",
    },
  });
  console.log(`registered immutable Shell build: ${indexKey}`);
}
