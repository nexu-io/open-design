import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";

import { parseReleaseVersion, releaseChannelDescriptor, type ReleaseChannel } from "@open-design/release";

import { contentType, githubInfo, optional, publicUrl, required, storageConfigFromEnv, writeJson } from "./common.ts";
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

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const tokenPattern = /^[a-z][a-z0-9-]*$/;
const artifactKindPattern = /^[a-z][A-Za-z0-9]*$/;

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function validateDigest(value: unknown, label: string): asserts value is Digest {
  if (typeof value !== "string" || !digestPattern.test(value)) throw new Error(`${label} must be a lowercase sha256 digest`);
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
    artifacts[kind] = raw as ShellBuildArtifactRecord;
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

function createReusedBuildReport(plan: ShellBuildPlan, record: ShellBuildRecord): Record<string, unknown> {
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
      recordUrl: `${required("RELEASE_PUBLIC_ORIGIN").replace(/\/+$/, "")}/${shellBuildIndexObjectKey(record.channel, record.shell.type, record.shell.sourceDigest, record.target)}`,
      state: "reused",
    },
    runtimeNamespaceRoot: plan.runtimeNamespaceRoot,
    shell: record.shell,
    timings: [{ durationMs: 0, phase: "remote-shell-materialize" }],
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
  const channel = releaseChannelDescriptor(required("RELEASE_CHANNEL")).channel;
  const planPath = required("RELEASE_SHELL_PLAN_JSON_PATH");
  const outputPath = required("RELEASE_SHELL_BUILD_JSON_PATH");
  const plan = validateShellBuildPlan(JSON.parse(readFileSync(planPath, "utf8")) as unknown, channel);
  const storage = storageConfigFromEnv();
  const indexKey = shellBuildIndexObjectKey(channel, plan.shell.type, plan.shell.sourceDigest, plan.target);
  const object = await getStorageObject({ ...storage, objectKey: indexKey });
  if (object == null) {
    writeJson(outputPath, { indexKey, shell: plan.shell, state: "miss", target: plan.target });
    writeGithubOutput("state", "miss");
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
  writeJson(outputPath, createReusedBuildReport(plan, record));
  writeGithubOutput("state", "hit");
  writeGithubOutput("shell_version", record.shell.version);
  console.log(`Shell build hit: ${indexKey} (${record.shell.version})`);
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
      recordUrl: `${publicOrigin.replace(/\/+$/, "")}/${indexKey}`,
      state: "registered",
    },
  });
  console.log(`registered immutable Shell build: ${indexKey}`);
}
