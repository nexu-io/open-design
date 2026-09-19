import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink, writeFile, type FileHandle } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

import {
  SHA256_PATTERN,
  canonicalJson,
  compareVersions,
  validateChannelRelease,
  validateShellIdentity,
  validateStandaloneScope,
  verifyStandaloneMetadata,
  type SignedStandaloneMetadata,
  type StandaloneMaterialization,
  type StandaloneShellIdentity,
  type StandaloneTrustedKeyRing,
} from "./protocol.js";
import { ensureStandaloneBlob, materializeStandaloneBlob, type StandaloneBlobCandidate } from "./blob.js";
import { StandaloneFeedbackEmitter, type StandaloneFeedbackHandler } from "./feedback.js";
import { withStandaloneMaintenanceLock } from "./maintenance.js";
import {
  INITIAL_GENERATION_STATE,
  StandaloneStateConflictError,
  reduceGenerationState,
  validateGenerationState,
  type ActivationAuthority,
  type ActivationCause,
  type ActivationIntent,
  type ActivationLaunchProof,
  type GenerationState,
  type GenerationStateCommand,
} from "./state-machine.js";

export type { ActivationAuthority, ActivationCause, ActivationIntent, ActivationLaunchProof, GenerationState } from "./state-machine.js";

export type StandalonePrepareOptions = Readonly<{
  candidates?: Readonly<Record<string, readonly StandaloneBlobCandidate[]>>;
  feedback?: StandaloneFeedbackHandler;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}>;

export type GenerationRecord = {
  schemaVersion: 4;
  id: string;
  channel: string;
  releaseVersion: string;
  standaloneVersion: string;
  sourceCommit: string;
  minimumShellVersions: Record<string, string>;
  launcher: Readonly<{
    protocol: "standalone-launcher-v1";
    resourceId: string;
    blobSha256: string;
    entrypoint: string;
    path: string;
  }>;
  resources: Record<string, {
    component: "standalone.launcher" | "standalone.resource";
    blobSha256: string;
    entrypoint: string;
    materialization: StandaloneMaterialization;
    mediaType: string;
    path: string;
    size: number;
    sync: true;
  }>;
};

const GENERATION_RECORD_KEYS = "channel,id,launcher,minimumShellVersions,releaseVersion,resources,schemaVersion,sourceCommit,standaloneVersion";
const LAUNCHER_KEYS = "blobSha256,entrypoint,path,protocol,resourceId";
const RESOURCE_KEYS = "blobSha256,component,entrypoint,materialization,mediaType,path,size,sync";
const TOKEN_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9a-z]+(?:[.-][0-9a-z]+)*)?$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const MEDIA_TYPE_PATTERN = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: string, label: string): void {
  if (Object.keys(value).sort().join(",") !== expected) throw new Error(`invalid ${label}`);
}

function assertRelativePath(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/") || value.startsWith("\\") || value.split(/[\\/]/).includes("..")) {
    throw new Error(`unsafe ${label}`);
  }
}

function assertStorePath(value: unknown, root: string, label: string): asserts value is string {
  if (typeof value !== "string" || !isAbsolute(value)) throw new Error(`invalid ${label}`);
  const resolved = resolve(value);
  if (!resolved.startsWith(`${resolve(root)}${sep}`)) throw new Error(`unsafe ${label}`);
}

function assertMaterialization(value: unknown, label: string): asserts value is StandaloneMaterialization {
  if (!isPlainRecord(value)) throw new Error(`invalid ${label}`);
  if (value.type === "file") {
    assertExactKeys(value, "entrypoint,type", label);
  } else if (value.type === "zip") {
    assertExactKeys(value, "entrypoint,treeSha256,type", label);
    if (typeof value.treeSha256 !== "string" || !SHA256_PATTERN.test(value.treeSha256)) throw new Error(`invalid ${label}`);
  } else {
    throw new Error(`invalid ${label}`);
  }
  assertRelativePath(value.entrypoint, label);
}

/**
 * Validate a generation record read back from disk: exact field set, digest and
 * version shapes, and store-rooted absolute paths — a record whose resource
 * paths escape the store root is tampered, so the read fails closed instead of
 * feeding unchecked paths to materialization or sweeping.
 */
export function validateGenerationRecord(value: unknown, expected: Readonly<{ channel: string; id: string; root: string }>): GenerationRecord {
  const label = `generation record: ${expected.id}`;
  if (!SHA256_PATTERN.test(expected.id)) throw new Error(`invalid ${label}`);
  if (!isPlainRecord(value)) throw new Error(`invalid ${label}`);
  assertExactKeys(value, GENERATION_RECORD_KEYS, label);
  if (value.schemaVersion !== 4 || value.id !== expected.id || value.channel !== expected.channel) throw new Error(`invalid ${label}`);
  if (typeof value.releaseVersion !== "string") throw new Error(`invalid ${label}`);
  validateChannelRelease(expected.channel, value.releaseVersion);
  if (typeof value.standaloneVersion !== "string" || !VERSION_PATTERN.test(value.standaloneVersion)) throw new Error(`invalid ${label}`);
  if (typeof value.sourceCommit !== "string" || !COMMIT_PATTERN.test(value.sourceCommit)) throw new Error(`invalid ${label}`);

  const minimumShellVersions = value.minimumShellVersions;
  if (!isPlainRecord(minimumShellVersions)) throw new Error(`invalid ${label}`);
  const shellEntries = Object.entries(minimumShellVersions);
  if (shellEntries.length === 0) throw new Error(`invalid ${label}`);
  for (const [type, version] of shellEntries) {
    if (!TOKEN_PATTERN.test(type) || typeof version !== "string" || !VERSION_PATTERN.test(version)) throw new Error(`invalid ${label}`);
  }

  const launcher = value.launcher;
  if (!isPlainRecord(launcher)) throw new Error(`invalid ${label}`);
  assertExactKeys(launcher, LAUNCHER_KEYS, label);
  if (launcher.protocol !== "standalone-launcher-v1") throw new Error(`invalid ${label}`);
  if (typeof launcher.resourceId !== "string" || !TOKEN_PATTERN.test(launcher.resourceId)) throw new Error(`invalid ${label}`);
  if (typeof launcher.blobSha256 !== "string" || !SHA256_PATTERN.test(launcher.blobSha256)) throw new Error(`invalid ${label}`);
  assertStorePath(launcher.entrypoint, expected.root, label);
  assertStorePath(launcher.path, expected.root, label);

  const resources = value.resources;
  if (!isPlainRecord(resources)) throw new Error(`invalid ${label}`);
  const resourceEntries = Object.entries(resources);
  if (resourceEntries.length === 0) throw new Error(`invalid ${label}`);
  let launcherCount = 0;
  for (const [resourceId, resource] of resourceEntries) {
    if (!TOKEN_PATTERN.test(resourceId) || !isPlainRecord(resource)) throw new Error(`invalid ${label}`);
    assertExactKeys(resource, RESOURCE_KEYS, label);
    if (resource.component === "standalone.launcher") launcherCount += 1;
    else if (resource.component !== "standalone.resource") throw new Error(`invalid ${label}`);
    if (typeof resource.blobSha256 !== "string" || !SHA256_PATTERN.test(resource.blobSha256)) throw new Error(`invalid ${label}`);
    assertStorePath(resource.entrypoint, expected.root, label);
    assertStorePath(resource.path, expected.root, label);
    assertMaterialization(resource.materialization, label);
    if (typeof resource.mediaType !== "string" || !MEDIA_TYPE_PATTERN.test(resource.mediaType)) throw new Error(`invalid ${label}`);
    if (!Number.isSafeInteger(resource.size) || (resource.size as number) < 0 || resource.sync !== true) throw new Error(`invalid ${label}`);
  }
  if (launcherCount !== 1) throw new Error(`invalid ${label}`);

  const launcherResource = resources[launcher.resourceId];
  if (!isPlainRecord(launcherResource)
    || launcherResource.component !== "standalone.launcher"
    || launcherResource.blobSha256 !== launcher.blobSha256
    || launcherResource.entrypoint !== launcher.entrypoint
    || launcherResource.path !== launcher.path) {
    throw new Error(`invalid ${label}`);
  }
  return value as unknown as GenerationRecord;
}

let atomicSequence = 0;

export async function replaceFile(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform !== "win32" || (code !== "EPERM" && code !== "EEXIST")) throw error;
    await unlink(to).catch((unlinkError: NodeJS.ErrnoException) => {
      if (unlinkError.code !== "ENOENT") throw unlinkError;
    });
    await rename(from, to);
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.${atomicSequence++}.tmp`;
  await writeFile(temporary, canonicalJson(value), { encoding: "utf8", flag: "wx" });
  try { await replaceFile(temporary, path); }
  catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

export class StandaloneStore {
  readonly root: string;
  readonly channel: string;
  readonly namespace: string;

  constructor(root: string, scope: Readonly<{ channel: string; namespace: string }>) {
    validateStandaloneScope(scope);
    this.root = resolve(root);
    this.channel = scope.channel;
    this.namespace = scope.namespace;
  }

  private get namespaceRoot(): string { return join(this.root, "channels", this.channel, "namespaces", this.namespace); }
  private get statePath(): string { return join(this.namespaceRoot, "state.json"); }
  private get stateLockPath(): string { return join(this.namespaceRoot, "state.lock"); }
  private generationPath(id: string): string { return join(this.root, "channels", this.channel, "generations", `${id}.json`); }

  private async withStateTransaction<T>(operation: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.stateLockPath), { recursive: true });
    let handle: FileHandle | undefined;
    const owner = canonicalJson({ owner: randomUUID(), pid: process.pid, acquiredAt: new Date().toISOString() });
    for (let attempt = 0; attempt < 250; attempt += 1) {
      try { handle = await open(this.stateLockPath, "wx"); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let age: number;
        try { age = Date.now() - (await stat(this.stateLockPath)).mtimeMs; }
        catch (statError) {
          if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw statError;
        }
        if (age > 120_000) { await unlink(this.stateLockPath).catch(() => undefined); continue; }
        await delay(20);
      }
    }
    if (handle === undefined) throw new Error(`timed out acquiring generation state transaction: ${this.channel}/${this.namespace}`);
    try {
      await handle.writeFile(owner);
      return await operation();
    } finally {
      await handle.close();
      const currentOwner = await readFile(this.stateLockPath, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (currentOwner === owner) await unlink(this.stateLockPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
  }

  async readState(): Promise<GenerationState> {
    try {
      return validateGenerationState(await readJson<unknown>(this.statePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(INITIAL_GENERATION_STATE);
      throw error;
    }
  }

  private async applyStateCommand(command: GenerationStateCommand): Promise<GenerationState> {
    const current = await this.readState();
    const next = reduceGenerationState(current, command);
    if (next !== current) await writeJsonAtomic(this.statePath, next);
    return next;
  }

  async readGeneration(id: string): Promise<GenerationRecord> {
    return validateGenerationRecord(await readJson<unknown>(this.generationPath(id)), { channel: this.channel, id, root: this.root });
  }

  async prepare(envelope: SignedStandaloneMetadata, trustedKeys: StandaloneTrustedKeyRing, options: StandalonePrepareOptions = {}): Promise<GenerationRecord> {
    verifyStandaloneMetadata(envelope, trustedKeys);
    if (envelope.metadata.channel !== this.channel) throw new Error(`metadata channel ${envelope.metadata.channel} escaped Store channel ${this.channel}`);
    return withStandaloneMaintenanceLock(this.root, () => this.prepareVerified(envelope, options));
  }

  private async prepareVerified(envelope: SignedStandaloneMetadata, options: StandalonePrepareOptions): Promise<GenerationRecord> {
    const id = createHash("sha256").update(canonicalJson(envelope.metadata)).digest("hex");
    const feedback = new StandaloneFeedbackEmitter(randomUUID(), { channel: this.channel, namespace: this.namespace }, options.feedback);
    const syncBlobs = new Set(envelope.metadata.resources.map((resource) => resource.blob));
    feedback.emit({ phase: "sync-planning", state: "complete", generationId: id, totalBytes: [...syncBlobs].reduce((total, digest) => total + envelope.metadata.blobs[digest]!.size, 0) });
    const resources: GenerationRecord["resources"] = {};
    for (const resource of envelope.metadata.resources) {
      const blob = envelope.metadata.blobs[resource.blob]!;
      const ensured = await ensureStandaloneBlob(this.root, blob, {
        candidates: options.candidates?.[blob.sha256],
        ...(options.fetch == null ? {} : { fetch: options.fetch }),
        ...(options.signal == null ? {} : { signal: options.signal }),
        feedback,
        resourceId: resource.id,
      });
      const materialized = await materializeStandaloneBlob(this.root, blob, ensured.path, resource.materialization, { feedback, resourceId: resource.id });
      resources[resource.id] = {
        component: resource.component,
        blobSha256: blob.sha256,
        entrypoint: materialized.entrypoint,
        materialization: resource.materialization,
        mediaType: blob.mediaType,
        path: materialized.path,
        size: blob.size,
        sync: true,
      };
    }
    feedback.emit({ phase: "sync-ready", state: "complete", generationId: id });
    const launcherEntry = Object.entries(resources).find(([, resource]) => resource.component === "standalone.launcher");
    if (launcherEntry == null) throw new Error("prepared generation lacks standalone.launcher");
    const [launcherResourceId, launcherResource] = launcherEntry;
    const generation: GenerationRecord = {
      schemaVersion: 4,
      id,
      channel: envelope.metadata.channel,
      releaseVersion: envelope.metadata.releaseVersion,
      standaloneVersion: envelope.metadata.standaloneVersion,
      sourceCommit: envelope.metadata.sourceCommit,
      minimumShellVersions: Object.fromEntries(envelope.metadata.shellRequirements.map(({ type, minVersion }) => [type, minVersion])),
      launcher: {
        protocol: "standalone-launcher-v1",
        resourceId: launcherResourceId,
        blobSha256: launcherResource.blobSha256,
        entrypoint: launcherResource.entrypoint,
        path: launcherResource.path,
      },
      resources,
    };
    await writeJsonAtomic(this.generationPath(id), generation);
    await this.withStateTransaction(async () => {
      const state = await this.readState();
      await this.applyStateCommand({ type: "prepare", expectedRevision: state.revision, generationId: id });
    });
    feedback.emit({ phase: "generation-prepared", state: "complete", generationId: id });
    return generation;
  }

  async authorizePrepared(
    expectedGenerationId: string,
    authority: ActivationAuthority,
    cause: ActivationCause,
    expectedRevision: number,
  ): Promise<ActivationIntent> {
    return this.withStateTransaction(async () => {
      await this.readGeneration(expectedGenerationId);
      const state = await this.applyStateCommand({
        type: "authorize",
        expectedRevision,
        generationId: expectedGenerationId,
        authority,
        cause,
        authorizedAt: new Date().toISOString(),
      });
      if (state.activationIntent == null) throw new Error("activation authorization was not retained");
      return state.activationIntent;
    });
  }

  async revokeSilentAuthorization(expectedGenerationId: string, expectedRevision: number): Promise<GenerationState> {
    return this.withStateTransaction(() => this.applyStateCommand({
      type: "revoke-silent",
      expectedRevision,
      generationId: expectedGenerationId,
    }));
  }

  async activatePrepared(expectedGenerationId: string, shell: StandaloneShellIdentity, expectedRevision: number): Promise<GenerationRecord> {
    validateShellIdentity(shell);
    return this.withStateTransaction(async () => {
      const state = await this.readState();
      if (state.revision !== expectedRevision) throw new StandaloneStateConflictError("revision-conflict", `stale generation state revision: expected ${expectedRevision}, current ${state.revision}`);
      const generation = await this.readGeneration(expectedGenerationId);
      const minimum = generation.minimumShellVersions[shell.type];
      if (minimum == null || compareVersions(shell.version, minimum) < 0) throw new Error(`Shell ${shell.type} ${shell.version} is incompatible with prepared generation`);
      await this.applyStateCommand({ type: "activate", expectedRevision, generationId: expectedGenerationId, attemptId: randomUUID() });
      return generation;
    });
  }

  async beginActiveAttempt(shell: StandaloneShellIdentity): Promise<{ proof: ActivationLaunchProof | null; generation: GenerationRecord; attempted: boolean }> {
    validateShellIdentity(shell);
    return this.withStateTransaction(async () => {
      let state = await this.readState();
      if (state.activationAttempt != null && state.activationAttempt.launchCount >= 2) {
        state = await this.applyStateCommand({ type: "rollback", expectedRevision: state.revision, attemptId: state.activationAttempt.attemptId });
      }
      if (state.active == null) throw new Error("no active standalone generation");
      const generation = await this.readGeneration(state.active);
      const minimum = generation.minimumShellVersions[shell.type];
      if (minimum == null || compareVersions(shell.version, minimum) < 0) throw new Error(`Shell ${shell.type} ${shell.version} is incompatible with active generation`);
      if (state.activationAttempt != null) {
        const launchId = randomUUID();
        const next = await this.applyStateCommand({
          type: "begin-launch",
          expectedRevision: state.revision,
          attemptId: state.activationAttempt.attemptId,
          launchId,
        });
        const attempt = next.activationAttempt!;
        return { proof: { attemptId: attempt.attemptId, generationId: attempt.generationId, launchId }, generation, attempted: true };
      }
      return { proof: null, generation, attempted: false };
    });
  }

  async confirmAttempt(proof: ActivationLaunchProof): Promise<void> {
    await this.withStateTransaction(async () => {
      const state = await this.readState();
      await this.applyStateCommand({ type: "confirm-launch", expectedRevision: state.revision, proof });
    });
  }

  async recoverInterruptedAttempt(): Promise<GenerationRecord | null> {
    return this.withStateTransaction(async () => {
      const state = await this.readState();
      if (state.activationAttempt == null) return state.active == null ? null : this.readGeneration(state.active);
      const fallback = state.lastHealthy;
      const generation = fallback == null ? null : await this.readGeneration(fallback);
      await this.applyStateCommand({ type: "rollback", expectedRevision: state.revision, attemptId: state.activationAttempt.attemptId });
      return generation;
    });
  }

  async rollbackFailedAttempt(proof: ActivationLaunchProof): Promise<GenerationRecord | null> {
    return this.withStateTransaction(async () => {
      const state = await this.readState();
      if (state.activationAttempt == null) return state.active == null ? null : this.readGeneration(state.active);
      const fallback = state.lastHealthy;
      const generation = fallback == null ? null : await this.readGeneration(fallback);
      if (state.activationAttempt.attemptId !== proof.attemptId || state.activationAttempt.launchId !== proof.launchId) {
        throw new StandaloneStateConflictError("identity-conflict", "activation launch proof is stale");
      }
      await this.applyStateCommand({ type: "rollback", expectedRevision: state.revision, attemptId: proof.attemptId });
      return generation;
    });
  }

  async preparedGeneration(): Promise<GenerationRecord | null> {
    const state = await this.readState();
    return state.prepared == null ? null : this.readGeneration(state.prepared);
  }

  async activeGeneration(): Promise<GenerationRecord> {
    const state = await this.readState();
    if (state.active == null) throw new Error("no active standalone generation");
    return this.readGeneration(state.active);
  }

  async lastHealthyGeneration(): Promise<GenerationRecord | null> {
    const state = await this.readState();
    return state.lastHealthy == null ? null : this.readGeneration(state.lastHealthy);
  }

  async resolveResource(name: string): Promise<string> {
    const generation = await this.activeGeneration();
    const resource = generation.resources[name];
    if (resource == null) throw new Error(`unknown standalone resource: ${name}`);
    return resource.entrypoint;
  }
}
