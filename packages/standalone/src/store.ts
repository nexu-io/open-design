import { mkdir, open, readFile, rename, stat, unlink, writeFile, type FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";

import { canonicalJson, EXACT_CHANNEL_PATTERN, sha256Hex, verifyStandaloneMetadata, type SignedStandaloneMetadata, type StandaloneComponent, type StandaloneTrustedKeyRing } from "./protocol.js";

export type ArtifactReader = (url: string) => Promise<Uint8Array>;

export type GenerationRecord = {
  schemaVersion: 1;
  id: string;
  channel: string;
  releaseVersion: string;
  standaloneVersion: string;
  sourceCommit: string;
  components: Record<string, { entrypoint: string; mode: "required" | "lazy"; path: string; sha256: string; size: number; url: string }>;
};

export type GenerationState = {
  schemaVersion: 1;
  attempt: string | null;
  active: string | null;
  lastSuccessful: string | null;
};

const INITIAL_STATE: GenerationState = { schemaVersion: 1, attempt: null, active: null, lastSuccessful: null };
let atomicSequence = 0;

function assertNamespace(value: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value)) throw new Error(`invalid standalone namespace: ${value}`);
}

function versionOrder(value: string, channel: string): number[] {
  const match = new RegExp(`^(\\d+)\\.(\\d+)\\.(\\d+)-${channel}\\.(\\d+)$`).exec(value);
  if (match == null) throw new Error(`invalid ${channel} release version: ${value}`);
  return match.slice(1).map(Number);
}

function compareVersions(left: string, right: string, channel: string): number {
  const a = versionOrder(left, channel);
  const b = versionOrder(right, channel);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return 0;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.${atomicSequence++}.tmp`;
  await writeFile(temporary, canonicalJson(value), { encoding: "utf8", flag: "wx" });
  try { await replaceFile(temporary, path); }
  catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function replaceFile(from: string, to: string): Promise<void> {
  try { await rename(from, to); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform !== "win32" || (code !== "EPERM" && code !== "EEXIST")) throw error;
    await unlink(to).catch((unlinkError: NodeJS.ErrnoException) => {
      if (unlinkError.code !== "ENOENT") throw unlinkError;
    });
    await rename(from, to);
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

export class StandaloneStore {
  readonly root: string;
  readonly namespace: string;

  constructor(root: string, namespace: string) {
    assertNamespace(namespace);
    this.root = root;
    this.namespace = namespace;
  }

  private get statePath(): string { return join(this.root, "namespaces", this.namespace, "state.json"); }
  private get bindingPath(): string { return join(this.root, "namespaces", this.namespace, "binding.json"); }
  private get stateLockPath(): string { return join(this.root, "namespaces", this.namespace, "state.lock"); }
  private generationPath(id: string): string { return join(this.root, "generations", `${id}.json`); }
  private blobPath(sha256: string): string { return join(this.root, "blobs", "sha256", sha256); }

  private async withStateTransaction<T>(operation: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.stateLockPath), { recursive: true });
    let handle: FileHandle | undefined;
    for (let attempt = 0; attempt < 250; attempt += 1) {
      try {
        handle = await open(this.stateLockPath, "wx");
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let age: number;
        try { age = Date.now() - (await stat(this.stateLockPath)).mtimeMs; }
        catch (statError) {
          if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw statError;
        }
        if (age > 120_000) {
          await unlink(this.stateLockPath).catch(() => undefined);
          continue;
        }
        await delay(20);
      }
    }
    if (handle === undefined) throw new Error(`timed out acquiring generation state transaction: ${this.namespace}`);
    try {
      await handle.writeFile(canonicalJson({ pid: process.pid, acquiredAt: new Date().toISOString() }));
      return await operation();
    } finally {
      await handle.close();
      await unlink(this.stateLockPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  async readState(): Promise<GenerationState> {
    try { return await readJson<GenerationState>(this.statePath); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...INITIAL_STATE };
      throw error;
    }
  }

  async bindChannel(channel: string): Promise<void> {
    if (!EXACT_CHANNEL_PATTERN.test(channel) || channel === "local") throw new Error(`invalid exact channel binding: ${channel}`);
    try {
      await mkdir(dirname(this.bindingPath), { recursive: true });
      await writeFile(this.bindingPath, canonicalJson({ schemaVersion: 1, channel }), { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const binding = await readJson<{ schemaVersion: 1; channel: string }>(this.bindingPath);
    if (binding.schemaVersion !== 1 || binding.channel !== channel) throw new Error(`namespace ${this.namespace} is already bound to ${binding.channel}`);
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
    const bytes = await readArtifact(component.artifact.url);
    if (bytes.byteLength !== component.artifact.size) throw new Error(`artifact size mismatch: ${component.name}`);
    if (sha256Hex(bytes) !== component.artifact.sha256) throw new Error(`artifact digest mismatch: ${component.name}`);
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.${Date.now()}.${atomicSequence++}.tmp`;
    await writeFile(temporary, bytes, { flag: "wx" });
    try { await replaceFile(temporary, destination); }
    catch (error) {
      await unlink(temporary).catch(() => undefined);
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    return destination;
  }

  async prepare(envelope: SignedStandaloneMetadata, trustedKeys: StandaloneTrustedKeyRing, readArtifact: ArtifactReader): Promise<GenerationRecord> {
    verifyStandaloneMetadata(envelope, trustedKeys);
    await this.bindChannel(envelope.metadata.channel);
    const id = sha256Hex(canonicalJson(envelope.metadata));
    const components: GenerationRecord["components"] = {};
    for (const component of envelope.metadata.components) {
      const path = component.mode === "required" ? await this.materialize(component, readArtifact) : this.blobPath(component.artifact.sha256);
      components[component.name] = { entrypoint: component.artifact.entrypoint, mode: component.mode, path, sha256: component.artifact.sha256, size: component.artifact.size, url: component.artifact.url };
    }
    const generation: GenerationRecord = {
      schemaVersion: 1,
      id,
      channel: envelope.metadata.channel,
      releaseVersion: envelope.metadata.releaseVersion,
      standaloneVersion: envelope.metadata.standaloneVersion,
      sourceCommit: envelope.metadata.sourceCommit,
      components,
    };
    await writeJsonAtomic(this.generationPath(id), generation);
    await this.withStateTransaction(async () => {
      const state = await this.readState();
      for (const existingId of new Set([state.active, state.attempt])) {
        if (existingId === null || existingId === id) continue;
        const existing = await readJson<GenerationRecord>(this.generationPath(existingId));
        const order = compareVersions(existing.releaseVersion, generation.releaseVersion, generation.channel);
        if (order > 0) throw new Error(`channel head would downgrade ${existing.releaseVersion} to ${generation.releaseVersion}`);
        if (order === 0) throw new Error(`release version ${generation.releaseVersion} has conflicting metadata generations ${existing.id} and ${generation.id}`);
      }
      await writeJsonAtomic(this.statePath, { ...state, attempt: id });
    });
    return generation;
  }

  async commit(id: string): Promise<void> {
    await readJson<GenerationRecord>(this.generationPath(id));
    await this.withStateTransaction(async () => {
      const state = await this.readState();
      if (state.attempt !== id) throw new Error(`generation ${id} is not the prepared attempt`);
      await writeJsonAtomic(this.statePath, { ...state, active: id });
    });
  }

  async activatePrepared(): Promise<GenerationRecord | null> {
    return this.withStateTransaction(async () => {
      const state = await this.readState();
      if (state.attempt === null) return null;
      const generation = await readJson<GenerationRecord>(this.generationPath(state.attempt));
      await writeJsonAtomic(this.statePath, { ...state, active: state.attempt });
      return generation;
    });
  }

  async markSuccessful(id: string): Promise<void> {
    await this.withStateTransaction(async () => {
      const state = await this.readState();
      if (state.active !== id) throw new Error(`generation ${id} is not active`);
      await writeJsonAtomic(this.statePath, { ...state, attempt: null, lastSuccessful: id });
    });
  }

  async activeGeneration(): Promise<GenerationRecord> {
    const state = await this.readState();
    if (state.active === null) throw new Error("no active standalone generation");
    return readJson<GenerationRecord>(this.generationPath(state.active));
  }

  generation(id: string): Promise<GenerationRecord> {
    return readJson<GenerationRecord>(this.generationPath(id));
  }

  async resolveComponent(name: string, readArtifact: ArtifactReader): Promise<string> {
    const generation = await this.activeGeneration();
    const component = generation.components[name];
    if (component == null) throw new Error(`unknown standalone component: ${name}`);
    return this.materialize({ name, mode: component.mode, artifact: { entrypoint: component.entrypoint, sha256: component.sha256, size: component.size, url: component.url } }, readArtifact);
  }

  async rollbackFailedActivation(): Promise<GenerationRecord | null> {
    return this.withStateTransaction(async () => {
      const state = await this.readState();
      const fallback = state.lastSuccessful;
      const generation = fallback === null ? null : await readJson<GenerationRecord>(this.generationPath(fallback));
      await writeJsonAtomic(this.statePath, { ...state, attempt: null, active: fallback });
      return generation;
    });
  }

  async lastSuccessfulGeneration(): Promise<GenerationRecord | null> {
    const state = await this.readState();
    return state.lastSuccessful === null ? null : readJson<GenerationRecord>(this.generationPath(state.lastSuccessful));
  }
}
