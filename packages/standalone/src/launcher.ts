import { compareVersions, StandaloneBootstrapError, type StandaloneShellIdentity } from "./protocol.js";
import type { GenerationRecord, RuntimeBinding, StandaloneStore } from "./store.js";

export type LifecycleAttachment = { id: string; shell: StandaloneShellIdentity };
export type LifecycleScope = { channel: string; namespace: string };
export type LifecycleLease = { heartbeatIntervalMs: number; expiresAt: string };
export type LifecycleStatus = {
  scope: LifecycleScope;
  state: "running" | "stopped";
  generationId: string | null;
  instanceId: string | null;
  references: number;
  fence: number;
  lease: LifecycleLease | null;
};

export interface LifecyclePort {
  start(scope: LifecycleScope, generation: GenerationRecord, attachment: LifecycleAttachment): Promise<LifecycleStatus>;
  heartbeat(scope: LifecycleScope, attachment: LifecycleAttachment): Promise<LifecycleStatus>;
  release(scope: LifecycleScope, attachmentId: string): Promise<LifecycleStatus>;
  status(scope: LifecycleScope): Promise<LifecycleStatus>;
  stop(scope: LifecycleScope, fence: number): Promise<LifecycleStatus>;
}

export class VersionedLauncher {
  private readonly attachment: LifecycleAttachment;
  private readonly scope: LifecycleScope;

  constructor(
    private readonly store: StandaloneStore,
    private readonly lifecycle: LifecyclePort,
    shell: StandaloneShellIdentity,
    attachmentId: string,
  ) {
    this.attachment = { id: attachmentId, shell };
    this.scope = { channel: store.channel, namespace: store.namespace };
  }

  async start(): Promise<LifecycleStatus> {
    const attempt = await this.store.beginActiveAttempt(this.attachment.shell);
    try {
      const status = await this.lifecycle.start(this.scope, attempt.generation, this.attachment);
      if (status.state !== "running" || status.generationId !== attempt.generation.id || status.references < 1) {
        throw new Error("lifecycle did not acknowledge the active generation attachment");
      }
      if (attempt.attempted) await this.store.confirmAttempt(attempt.binding);
      return status;
    } catch (error) {
      if (!attempt.attempted) throw error;
      const fallback = await this.store.rollbackFailedAttempt();
      if (fallback == null || fallback.id === attempt.generation.id) throw error;
      await this.stop();
      const recovered = await this.lifecycle.start(this.scope, fallback, this.attachment);
      if (recovered.state !== "running" || recovered.generationId !== fallback.id) throw error;
      return recovered;
    }
  }

  heartbeat(): Promise<LifecycleStatus> { return this.lifecycle.heartbeat(this.scope, this.attachment); }
  release(): Promise<LifecycleStatus> { return this.lifecycle.release(this.scope, this.attachment.id); }
  status(): Promise<LifecycleStatus> { return this.lifecycle.status(this.scope); }
  async stop(): Promise<LifecycleStatus> {
    const status = await this.lifecycle.status(this.scope);
    return this.lifecycle.stop(this.scope, status.fence);
  }
}

export class FossilBootloader {
  constructor(
    private readonly store: StandaloneStore,
    private readonly shell: StandaloneShellIdentity,
    private readonly loadVersionedLauncher: () => Promise<VersionedLauncher>,
  ) {}

  async start(): Promise<LifecycleStatus> {
    const prepared = await this.store.preparedGeneration();
    const state = await this.store.readState();
    if (prepared != null && state.activationIntent?.generationId === prepared.id) {
      const required = prepared.minimumShellVersions[this.shell.type];
      if (required == null || compareVersions(this.shell.version, required) < 0) {
        throw new StandaloneBootstrapError(
          "installer-required",
          required == null
            ? `generation ${prepared.id} does not support Shell ${this.shell.type}`
            : `Shell ${this.shell.type} ${this.shell.version} is below required ${required}`,
        );
      }
      await this.store.activatePrepared(this.shell);
    }
    let generation: GenerationRecord;
    try { generation = await this.store.activeGeneration(); }
    catch { throw new StandaloneBootstrapError("no-generation", "no active standalone generation"); }
    const minimum = generation.minimumShellVersions[this.shell.type];
    if (minimum == null || compareVersions(this.shell.version, minimum) < 0) {
      throw new StandaloneBootstrapError(
        "installer-required",
        minimum == null
          ? `generation ${generation.id} does not support Shell ${this.shell.type}`
          : `Shell ${this.shell.type} ${this.shell.version} is below required ${minimum}`,
      );
    }
    return (await this.loadVersionedLauncher()).start();
  }
}

export function runtimeBinding(generationId: string, shell: StandaloneShellIdentity): RuntimeBinding {
  return { generationId, shell: { ...shell } };
}
