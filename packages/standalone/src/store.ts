import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink, writeFile, type FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  canonicalJson,
  compareVersions,
  EXACT_CHANNEL_PATTERN,
  sha256Hex,
  validateShellIdentity,
  verifyStandaloneMetadata,
  type ArtifactReference,
  type SignedStandaloneMetadata,
  type StandaloneComponent,
  type StandaloneShellIdentity,
  type StandaloneTrustedKeyRing,
} from "./protocol.js";

export type ArtifactReader = (artifact: ArtifactReference) => Promise<Uint8Array>;

export type GenerationRecord = {
  schemaVersion: 2;
  id: string;
  channel: string;
  releaseVersion: string;
  standaloneVersion: string;
  sourceCommit: string;
  minimumShellVersions: Record<string, string>;
  components: Record<string, { entrypoint: string; mode: "required" | "lazy"; path: string; sha256: string; size: number; url: string }>;
};

export type RuntimeBinding = { generationId: string; shell: StandaloneShellIdentity };
export type ActivationSource = "initial-bootstrap" | "repair" | "silent-policy" | "user-restart";
export type ActivationIntent = { generationId: string; source: ActivationSource; authorizedAt: string };
export type GenerationState = {
  schemaVersion: 2;
  prepared: string | null;
  activationIntent: ActivationIntent | null;
  attempt: RuntimeBinding | null;
  active: RuntimeBinding | null;
  lastSuccessful: RuntimeBinding | null;
};

const INITIAL_STATE: GenerationState = { schemaVersion: 2, prepared: null, activationIntent: null, attempt: null, active: null, lastSuccessful: null };
let atomicSequence = 0;

function assertNamespace(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) throw new Error(`invalid standalone namespace: ${value}`);
}

function sameShell(left: StandaloneShellIdentity, right: StandaloneShellIdentity): boolean {
  return left.type === right.type && left.version === right.version && left.digest === right.digest;
}

function sameBinding(left: RuntimeBinding | null, right: RuntimeBinding): boolean {
  return left != null && left.generationId === right.generationId && sameShell(left.shell, right.shell);
}

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
    if (!EXACT_CHANNEL_PATTERN.test(scope.channel) || scope.channel === "local") throw new Error(`invalid exact channel binding: ${scope.channel}`);
    assertNamespace(scope.namespace);
    this.root = root;
    this.channel = scope.channel;
    this.namespace = scope.namespace;
  }

  private get namespaceRoot(): string { return join(this.root, "channels", this.channel, "namespaces", this.namespace); }
  private get statePath(): string { return join(this.namespaceRoot, "state.json"); }
  private get stateLockPath(): string { return join(this.namespaceRoot, "state.lock"); }
  private generationPath(id: string): string { return join(this.root, "channels", this.channel, "generations", `${id}.json`); }
  private blobPath(sha256: string): string { return join(this.root, "blobs", "sha256", sha256); }

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
      const state = await readJson<GenerationState>(this.statePath);
      if (state.schemaVersion !== 2) throw new Error("unsupported generation state schema");
      return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(INITIAL_STATE);
      throw error;
    }
  }

  async readGeneration(id: string): Promise<GenerationRecord> {
    const generation = await readJson<GenerationRecord>(this.generationPath(id));
    if (generation.schemaVersion !== 2 || generation.id !== id || generation.channel !== this.channel) throw new Error(`invalid generation record: ${id}`);
    return generation;
  }

  private async materialize(component: StandaloneComponent, readArtifact: ArtifactReader): Promise<string> {
    const destination = this.blobPath(component.artifact.sha256);
    try {
      const existing = await readFile(destination);
      if (existing.byteLength !== component.artifact.size || sha256Hex(existing) !== component.artifact.sha256) throw new Error(`existing blob failed verification: ${component.name}`);
      return destination;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const bytes = await readArtifact(component.artifact);
    if (bytes.byteLength !== component.artifact.size) throw new Error(`artifact size mismatch: ${component.name}`);
    if (sha256Hex(bytes) !== component.artifact.sha256) throw new Error(`artifact digest mismatch: ${component.name}`);
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.${Date.now()}.${atomicSequence++}.tmp`;
    await writeFile(temporary, bytes, { flag: "wx" });
    try {
      try { await rename(temporary, destination); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    } finally { await unlink(temporary).catch(() => undefined); }
    const installed = await readFile(destination);
    if (installed.byteLength !== component.artifact.size || sha256Hex(installed) !== component.artifact.sha256) throw new Error(`materialized blob failed verification: ${component.name}`);
    return destination;
  }

  async prepare(envelope: SignedStandaloneMetadata, trustedKeys: StandaloneTrustedKeyRing, readArtifact: ArtifactReader): Promise<GenerationRecord> {
    verifyStandaloneMetadata(envelope, trustedKeys);
    if (envelope.metadata.channel !== this.channel) throw new Error(`metadata channel ${envelope.metadata.channel} escaped Store channel ${this.channel}`);
    const id = sha256Hex(canonicalJson(envelope.metadata));
    const components: GenerationRecord["components"] = {};
    for (const component of envelope.metadata.components) {
      const path = component.mode === "required" ? await this.materialize(component, readArtifact) : this.blobPath(component.artifact.sha256);
      components[component.name] = { entrypoint: component.artifact.entrypoint, mode: component.mode, path, sha256: component.artifact.sha256, size: component.artifact.size, url: component.artifact.url };
    }
    const generation: GenerationRecord = {
      schemaVersion: 2,
      id,
      channel: envelope.metadata.channel,
      releaseVersion: envelope.metadata.releaseVersion,
      standaloneVersion: envelope.metadata.standaloneVersion,
      sourceCommit: envelope.metadata.sourceCommit,
      minimumShellVersions: Object.fromEntries(envelope.metadata.shellRequirements.map(({ type, minVersion }) => [type, minVersion])),
      components,
    };
    await writeJsonAtomic(this.generationPath(id), generation);
    await this.withStateTransaction(async () => {
      const state = await this.readState();
      if (state.attempt != null) throw new Error("cannot replace prepared generation during an unfinished activation attempt");
      await writeJsonAtomic(this.statePath, { ...state, prepared: id, activationIntent: null });
    });
    return generation;
  }

  async authorizePrepared(source: ActivationSource): Promise<ActivationIntent> {
    return this.withStateTransaction(async () => {
      const state = await this.readState();
      if (state.prepared == null) throw new Error("no prepared generation to authorize");
      await this.readGeneration(state.prepared);
      const intent = { generationId: state.prepared, source, authorizedAt: new Date().toISOString() } satisfies ActivationIntent;
      await writeJsonAtomic(this.statePath, { ...state, activationIntent: intent });
      return intent;
    });
  }

  async activatePrepared(shell: StandaloneShellIdentity): Promise<GenerationRecord | null> {
    validateShellIdentity(shell);
    return this.withStateTransaction(async () => {
      const state = await this.readState();
      if (state.prepared == null) return null;
      if (state.attempt != null) throw new Error("cannot activate while another attempt is unfinished");
      if (state.activationIntent?.generationId !== state.prepared) throw new Error("prepared generation is not authorized for activation");
      const generation = await this.readGeneration(state.prepared);
      const minimum = generation.minimumShellVersions[shell.type];
      if (minimum == null || compareVersions(shell.version, minimum) < 0) throw new Error(`Shell ${shell.type} ${shell.version} is incompatible with prepared generation`);
      const binding = { generationId: generation.id, shell: { ...shell } } satisfies RuntimeBinding;
      await writeJsonAtomic(this.statePath, { ...state, prepared: null, activationIntent: null, attempt: binding, active: binding });
      return generation;
    });
  }

  async beginActiveAttempt(shell: StandaloneShellIdentity): Promise<{ binding: RuntimeBinding; generation: GenerationRecord; attempted: boolean }> {
    validateShellIdentity(shell);
    return this.withStateTransaction(async () => {
      const state = await this.readState();
      if (state.active == null) throw new Error("no active standalone generation");
      const generation = await this.readGeneration(state.active.generationId);
      const minimum = generation.minimumShellVersions[shell.type];
      if (minimum == null || compareVersions(shell.version, minimum) < 0) throw new Error(`Shell ${shell.type} ${shell.version} is incompatible with active generation`);
      const binding = { generationId: generation.id, shell: { ...shell } } satisfies RuntimeBinding;
      if (state.attempt != null) {
        if (!sameBinding(state.attempt, binding)) throw new Error("another activation attempt is unfinished");
        return { binding: state.attempt, generation, attempted: true };
      }
      if (sameBinding(state.lastSuccessful, binding)) return { binding, generation, attempted: false };
      await writeJsonAtomic(this.statePath, { ...state, active: binding, attempt: binding });
      return { binding, generation, attempted: true };
    });
  }

  async confirmAttempt(binding: RuntimeBinding): Promise<void> {
    await this.withStateTransaction(async () => {
      const state = await this.readState();
      if (!sameBinding(state.attempt, binding) || !sameBinding(state.active, binding)) throw new Error("runtime binding is not the active attempt");
      await writeJsonAtomic(this.statePath, { ...state, attempt: null, lastSuccessful: binding });
    });
  }

  async recoverInterruptedAttempt(): Promise<GenerationRecord | null> {
    return this.withStateTransaction(async () => {
      const state = await this.readState();
      if (state.attempt == null) return state.active == null ? null : this.readGeneration(state.active.generationId);
      const fallback = state.lastSuccessful;
      const generation = fallback == null ? null : await this.readGeneration(fallback.generationId);
      await writeJsonAtomic(this.statePath, { ...state, active: fallback, attempt: null, prepared: null, activationIntent: null });
      return generation;
    });
  }

  async rollbackFailedAttempt(): Promise<GenerationRecord | null> {
    return this.withStateTransaction(async () => {
      const state = await this.readState();
      if (state.attempt == null) return state.active == null ? null : this.readGeneration(state.active.generationId);
      const fallback = state.lastSuccessful;
      const generation = fallback == null ? null : await this.readGeneration(fallback.generationId);
      await writeJsonAtomic(this.statePath, { ...state, attempt: null, active: fallback, prepared: null, activationIntent: null });
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
    return this.readGeneration(state.active.generationId);
  }

  async lastSuccessfulGeneration(): Promise<GenerationRecord | null> {
    const state = await this.readState();
    return state.lastSuccessful == null ? null : this.readGeneration(state.lastSuccessful.generationId);
  }

  async resolveComponent(name: string, readArtifact: ArtifactReader): Promise<string> {
    const generation = await this.activeGeneration();
    const component = generation.components[name];
    if (component == null) throw new Error(`unknown standalone component: ${name}`);
    return this.materialize({ name, mode: component.mode, artifact: { entrypoint: component.entrypoint, sha256: component.sha256, size: component.size, url: component.url } }, readArtifact);
  }
}
