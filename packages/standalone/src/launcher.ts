import { compareVersions, StandaloneBootstrapError, type StandaloneScope, type StandaloneShellIdentity } from "./protocol.js";
import type { GenerationRecord, StandaloneStore } from "./store.js";
import { StandaloneFeedbackEmitter, type StandaloneFeedbackHandler } from "./feedback.js";
import { randomUUID } from "node:crypto";
import type { StandaloneLifecycleTransition, StandaloneLifecycleTransitionPort, StandaloneLifecycleTransitionResult } from "./shell-update.js";
import { createStandaloneGenerationBinding, type StandaloneGenerationBinding } from "./bootloader-handoff.js";

export type LifecycleAttachment = { id: string; shell: StandaloneShellIdentity };
export type LifecycleScope = StandaloneScope;
export type LifecycleLease = { heartbeatIntervalMs: number; expiresAt: string };
export type LifecycleStatus = {
  scope: LifecycleScope;
  state: "running" | "stopped";
  generationId: string | null;
  bindingDigest: string | null;
  instanceId: string | null;
  references: number;
  occupants: readonly Readonly<{ attachmentId: string; generationId: string; shell: StandaloneShellIdentity }>[];
  fence: number;
  lease: LifecycleLease | null;
};
export type LifecycleReadiness = Readonly<{ generationId: string; bindingDigest: string; instanceId: string; attachmentId: string }>;

export interface LifecyclePort {
  start(scope: LifecycleScope, generation: GenerationRecord, attachment: LifecycleAttachment, binding: StandaloneGenerationBinding): Promise<LifecycleStatus>;
  awaitReady(scope: LifecycleScope, readiness: LifecycleReadiness): Promise<LifecycleReadiness>;
  heartbeat(scope: LifecycleScope, attachment: LifecycleAttachment): Promise<LifecycleStatus>;
  release(scope: LifecycleScope, attachmentId: string): Promise<LifecycleStatus>;
  status(scope: LifecycleScope): Promise<LifecycleStatus>;
  stop(scope: LifecycleScope, fence: number): Promise<LifecycleStatus>;
  beginTransition?: StandaloneLifecycleTransitionPort["beginTransition"];
}

export type StandaloneGenerationStart = Readonly<{
  binding: StandaloneGenerationBinding;
  generation: GenerationRecord;
  attachment: LifecycleAttachment;
  start(): Promise<LifecycleStatus>;
}>;

/**
 * Mechanical generation boundary used by a fossil Shell. The continuation is
 * the only authority allowed to mutate the lifecycle, so normal starts and
 * transition-owned starts cannot drift into different activation paths.
 */
export interface StandaloneGenerationHandoffPort {
  start(input: StandaloneGenerationStart): Promise<LifecycleStatus>;
}

async function requireExactReadiness(
  lifecycle: LifecyclePort,
  scope: LifecycleScope,
  readiness: LifecycleReadiness,
): Promise<void> {
  const acknowledged = await lifecycle.awaitReady(scope, readiness);
  if (
    acknowledged.generationId !== readiness.generationId
    || acknowledged.bindingDigest !== readiness.bindingDigest
    || acknowledged.instanceId !== readiness.instanceId
    || acknowledged.attachmentId !== readiness.attachmentId
  ) throw new Error("lifecycle readiness acknowledgement is stale");
}

export class VersionedLauncher {
  private readonly attachment: LifecycleAttachment;
  private readonly scope: LifecycleScope;

  constructor(
    private readonly store: StandaloneStore,
    private readonly lifecycle: LifecyclePort,
    shell: StandaloneShellIdentity,
    attachmentId: string,
    feedback?: StandaloneFeedbackHandler,
    private readonly handoff?: StandaloneGenerationHandoffPort,
  ) {
    this.attachment = { id: attachmentId, shell };
    this.scope = { channel: store.channel, namespace: store.namespace };
    this.feedback = new StandaloneFeedbackEmitter(randomUUID(), this.scope, feedback);
  }

  private readonly feedback: StandaloneFeedbackEmitter;

  start(): Promise<LifecycleStatus> {
    return this.startWith((generation, attachment, binding) => this.lifecycle.start(this.scope, generation, attachment, binding));
  }

  startDuringTransition(transition: StandaloneLifecycleTransition): Promise<LifecycleStatus> {
    return this.startWith((generation, attachment, binding) => transition.completeBoundStart(generation, attachment, binding));
  }

  private async startWith(
    start: (generation: GenerationRecord, attachment: LifecycleAttachment, binding: StandaloneGenerationBinding) => Promise<LifecycleStatus>,
  ): Promise<LifecycleStatus> {
    const attempt = await this.store.beginActiveAttempt(this.attachment.shell);
    const binding = createStandaloneGenerationBinding(attempt.generation, this.scope);
    this.feedback.emit({ phase: "closure-starting", state: "begin", generationId: attempt.generation.id });
    try {
      const current = await this.lifecycle.status(this.scope);
      for (const occupant of current.occupants) {
        const minimum = attempt.generation.minimumShellVersions[occupant.shell.type];
        if (minimum == null || compareVersions(occupant.shell.version, minimum) < 0) {
          throw new StandaloneBootstrapError(
            "shell-update-required",
            minimum == null
              ? `generation ${attempt.generation.id} does not support active ${occupant.shell.type} Shell`
              : `active ${occupant.shell.type} Shell ${occupant.shell.version} is below required ${minimum}`,
          );
        }
      }
      const continuation = () => start(attempt.generation, this.attachment, binding);
      const status = this.handoff == null
        ? await continuation()
        : await this.handoff.start({ binding, generation: attempt.generation, attachment: this.attachment, start: continuation });
      if (status.state !== "running" || status.generationId !== attempt.generation.id || status.bindingDigest !== binding.digest || status.references < 1) {
        throw new Error("lifecycle did not acknowledge the active generation attachment");
      }
      if (status.instanceId == null) throw new Error("lifecycle did not return a running instance identity");
      const readiness = { generationId: attempt.generation.id, bindingDigest: binding.digest, instanceId: status.instanceId, attachmentId: this.attachment.id };
      await requireExactReadiness(this.lifecycle, this.scope, readiness);
      if (attempt.proof != null) await this.store.confirmAttempt(attempt.proof);
      this.feedback.emit({ phase: "closure-ready", state: "complete", generationId: attempt.generation.id });
      return status;
    } catch (error) {
      if (!attempt.attempted) throw error;
      if (attempt.proof == null) throw error;
      const fallback = await this.store.rollbackFailedAttempt(attempt.proof);
      this.feedback.emit({ phase: "rollback", state: "begin", generationId: fallback?.id });
      this.feedback.emit({ phase: "rollback", state: "complete", generationId: fallback?.id });
      throw error;
    }
  }

  heartbeat(): Promise<LifecycleStatus> { return this.lifecycle.heartbeat(this.scope, this.attachment); }
  release(): Promise<LifecycleStatus> { return this.lifecycle.release(this.scope, this.attachment.id); }
  status(): Promise<LifecycleStatus> { return this.lifecycle.status(this.scope); }
  beginTransition(
    kind: "content-restart" | "shell-install",
    options: Readonly<{ force?: boolean }> = {},
  ): Promise<StandaloneLifecycleTransitionResult> {
    if (this.lifecycle.beginTransition == null) {
      return Promise.resolve({ state: "blocked", reason: "unavailable", occupants: [] });
    }
    return this.lifecycle.beginTransition(this.scope, kind, {
      ownerAttachmentId: this.attachment.id,
      ownerShellType: this.attachment.shell.type,
      ...options,
    });
  }
  async stop(): Promise<LifecycleStatus> {
    const status = await this.lifecycle.status(this.scope);
    return this.lifecycle.stop(this.scope, status.fence);
  }
}

export class FossilBootloader {
  constructor(
    private readonly store: StandaloneStore,
    private readonly shell: StandaloneShellIdentity,
    private readonly loadVersionedLauncher: (binding: StandaloneGenerationBinding) => Promise<VersionedLauncher>,
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
      await this.store.activatePrepared(prepared.id, this.shell, state.revision);
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
    const binding = createStandaloneGenerationBinding(generation, {
      channel: this.store.channel,
      namespace: this.store.namespace,
    });
    return (await this.loadVersionedLauncher(binding)).start();
  }
}
