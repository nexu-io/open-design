import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink, writeFile, type FileHandle } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  canonicalJson,
  compareVersions,
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
    const generation = await readJson<GenerationRecord>(this.generationPath(id));
    if (generation.schemaVersion !== 4 || generation.id !== id || generation.channel !== this.channel) throw new Error(`invalid generation record: ${id}`);
    return generation;
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
