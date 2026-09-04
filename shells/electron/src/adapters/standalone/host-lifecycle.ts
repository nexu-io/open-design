import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  SHARED_LIFECYCLE_ALGEBRA,
  type GenerationRecord,
  type LifecycleAttachment,
  type LifecycleReadiness,
  type LifecycleScope,
  type LifecycleStatus,
  type SharedLifecycleState,
  type StandaloneGenerationBinding,
} from "@open-design/standalone";

export type ElectronStandaloneHostStart = Readonly<{
  attachmentCapability: string;
  status: LifecycleStatus;
}>;

export type ElectronStandaloneLifecycleStatePort = Readonly<{
  read(): Promise<SharedLifecycleState | null>;
  write(state: SharedLifecycleState): Promise<void>;
}>;

export type ElectronStandaloneHostTransitionDescriptor = Readonly<{
  token: string;
  attemptId: string;
  fence: number;
  expiresAt: string;
  heartbeatIntervalMs: number;
  occupants: LifecycleStatus["occupants"];
  phase: "reserved" | "stopped-sealed";
}>;

export type ElectronStandaloneHostTransitionResult =
  | Readonly<{ state: "acquired"; transition: ElectronStandaloneHostTransitionDescriptor }>
  | Readonly<{ state: "blocked"; reason: "occupied" | "transition-active"; occupants: LifecycleStatus["occupants"] }>;

type Clock = () => Date;

function capabilityHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Sidecar-host-local logical lifecycle. The Sidecar endpoint is the only
 * process-wide writer; this queue also serializes overlapping IPC handlers.
 * Generation durability remains in StandaloneStore and physical lifecycle
 * remains in Sidecar's supervised generation.
 */
export class ElectronStandaloneHostLifecycle {
  readonly #clock: Clock;
  readonly #heartbeatIntervalMs: number;
  readonly #leaseDurationMs: number;
  readonly #transitionHeartbeatIntervalMs: number;
  readonly #transitionLeaseDurationMs: number;
  #state: SharedLifecycleState;
  readonly #statePort: ElectronStandaloneLifecycleStatePort | null;
  #tail: Promise<void> = Promise.resolve();

  constructor(
    readonly scope: LifecycleScope,
    options: Readonly<{
      clock?: Clock;
      heartbeatIntervalMs?: number;
      leaseDurationMs?: number;
      statePort?: ElectronStandaloneLifecycleStatePort;
      transitionHeartbeatIntervalMs?: number;
      transitionLeaseDurationMs?: number;
    }> = {},
  ) {
    this.#clock = options.clock ?? (() => new Date());
    this.#heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5_000;
    this.#leaseDurationMs = options.leaseDurationMs ?? 30_000;
    this.#statePort = options.statePort ?? null;
    this.#transitionHeartbeatIntervalMs = options.transitionHeartbeatIntervalMs ?? 5_000;
    // Installer arming crosses physical process retirement. Keep the durable
    // reservation long enough for that guarded continuation without relying on
    // a heartbeat from the host that is about to be retired.
    this.#transitionLeaseDurationMs = options.transitionLeaseDurationMs ?? 10 * 60_000;
    if (!Number.isSafeInteger(this.#heartbeatIntervalMs) || this.#heartbeatIntervalMs < 100) throw new Error("invalid Electron Standalone heartbeat interval");
    if (!Number.isSafeInteger(this.#leaseDurationMs) || this.#leaseDurationMs <= this.#heartbeatIntervalMs * 2) throw new Error("invalid Electron Standalone lease duration");
    if (!Number.isSafeInteger(this.#transitionHeartbeatIntervalMs) || this.#transitionHeartbeatIntervalMs < 100) throw new Error("invalid Electron Standalone transition heartbeat interval");
    if (!Number.isSafeInteger(this.#transitionLeaseDurationMs) || this.#transitionLeaseDurationMs <= this.#transitionHeartbeatIntervalMs * 2) throw new Error("invalid Electron Standalone transition lease duration");
    this.#state = SHARED_LIFECYCLE_ALGEBRA.initial(scope);
  }

  #iso(): string { return this.#clock().toISOString(); }

  #lease(now: string): string {
    return new Date(Date.parse(now) + this.#leaseDurationMs).toISOString();
  }

  async #transaction<T>(operation: (state: SharedLifecycleState) => Readonly<{ state: SharedLifecycleState; result: T }>): Promise<T> {
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const persisted = await this.#statePort?.read();
      const source = persisted ?? this.#state;
      const now = this.#iso();
      const current = SHARED_LIFECYCLE_ALGEBRA.reduce(source, { type: "tick", now, leaseDurationMs: this.#leaseDurationMs });
      const next = operation(current);
      this.#state = SHARED_LIFECYCLE_ALGEBRA.validate(next.state, this.scope);
      await this.#statePort?.write(this.#state);
      return next.result;
    } finally {
      release();
    }
  }

  #project(state: SharedLifecycleState): LifecycleStatus {
    return SHARED_LIFECYCLE_ALGEBRA.project(state, this.#heartbeatIntervalMs);
  }

  async start(
    generation: GenerationRecord,
    attachment: LifecycleAttachment,
    binding: StandaloneGenerationBinding,
    presentedCapability: string | null,
  ): Promise<ElectronStandaloneHostStart> {
    return await this.#transaction((state) => {
      const existing = state.attachments.find(({ id }) => id === attachment.id);
      const attachmentCapability = existing == null ? randomBytes(32).toString("hex") : presentedCapability;
      if (attachmentCapability == null) throw Object.assign(new Error("Electron Standalone attachment capability is required"), { code: "attachment-capability-required" });
      const now = this.#iso();
      const next = SHARED_LIFECYCLE_ALGEBRA.reduce(state, {
        type: "start",
        generationId: generation.id,
        bindingDigest: binding.digest,
        instanceId: state.instanceId ?? randomUUID(),
        attachment,
        heartbeatAt: now,
        leaseExpiresAt: this.#lease(now),
        capability: {
          candidateHash: capabilityHash(attachmentCapability),
          presentedHash: presentedCapability == null ? null : capabilityHash(presentedCapability),
        },
      });
      return { state: next, result: Object.freeze({ attachmentCapability, status: this.#project(next) }) };
    });
  }

  async awaitReady(readiness: LifecycleReadiness): Promise<LifecycleReadiness> {
    return await this.#transaction((state) => ({ state, result: SHARED_LIFECYCLE_ALGEBRA.ready(state, readiness) }));
  }

  async heartbeat(attachment: LifecycleAttachment, attachmentCapability: string): Promise<LifecycleStatus> {
    return await this.#transaction((state) => {
      const now = this.#iso();
      const next = SHARED_LIFECYCLE_ALGEBRA.reduce(state, {
        type: "heartbeat",
        attachment,
        heartbeatAt: now,
        leaseExpiresAt: this.#lease(now),
        capabilityHash: capabilityHash(attachmentCapability),
      });
      return { state: next, result: this.#project(next) };
    });
  }

  async release(attachmentId: string, attachmentCapability: string): Promise<LifecycleStatus> {
    return await this.#transaction((state) => {
      const next = SHARED_LIFECYCLE_ALGEBRA.reduce(state, {
        type: "release-attachment",
        attachmentId,
        capabilityHash: capabilityHash(attachmentCapability),
      });
      return { state: next, result: this.#project(next) };
    });
  }

  async status(): Promise<LifecycleStatus> {
    return await this.#transaction((state) => ({ state, result: this.#project(state) }));
  }

  async stop(fence: number): Promise<LifecycleStatus> {
    return await this.#transaction((state) => {
      const next = SHARED_LIFECYCLE_ALGEBRA.reduce(state, { type: "stop", fence, requestedAt: this.#iso() });
      return { state: next, result: this.#project(next) };
    });
  }

  #transitionDescriptor(state: SharedLifecycleState): ElectronStandaloneHostTransitionDescriptor {
    const transition = state.transition;
    if (transition == null) throw new Error("Electron Standalone lifecycle transition is unavailable");
    return Object.freeze({
      token: transition.token,
      attemptId: transition.token,
      fence: transition.fence,
      expiresAt: transition.expiresAt,
      heartbeatIntervalMs: this.#transitionHeartbeatIntervalMs,
      occupants: Object.freeze([...this.#project(state).occupants]),
      phase: transition.phase,
    });
  }

  async beginTransition(
    kind: "content-restart" | "shell-install",
    options: Readonly<{ attemptId?: string; ownerAttachmentId?: string; ownerShellType?: string; force?: boolean }> = {},
  ): Promise<ElectronStandaloneHostTransitionResult> {
    return await this.#transaction<ElectronStandaloneHostTransitionResult>((state) => {
      const occupants = SHARED_LIFECYCLE_ALGEBRA.blockers(state, kind, { attachmentId: options.ownerAttachmentId, shellType: options.ownerShellType });
      if (state.transition != null) {
        if (options.attemptId === state.transition.token && state.transition.kind === kind) return { state, result: Object.freeze({ state: "acquired" as const, transition: this.#transitionDescriptor(state) }) };
        return { state, result: Object.freeze({ state: "blocked" as const, reason: "transition-active" as const, occupants: Object.freeze(occupants) }) };
      }
      if (occupants.length > 0 && options.force !== true) return { state, result: Object.freeze({ state: "blocked" as const, reason: "occupied" as const, occupants: Object.freeze(occupants) }) };
      const acquiredAt = this.#iso();
      const next = SHARED_LIFECYCLE_ALGEBRA.reduce(state, {
        type: "reserve-transition",
        transition: {
          token: options.attemptId ?? randomUUID(),
          kind,
          phase: "reserved",
          fence: state.fence,
          acquiredAt,
          expiresAt: new Date(Date.parse(acquiredAt) + this.#transitionLeaseDurationMs).toISOString(),
        },
      });
      return { state: next, result: Object.freeze({ state: "acquired" as const, transition: this.#transitionDescriptor(next) }) };
    });
  }

  async renewTransition(token: string, fence: number): Promise<ElectronStandaloneHostTransitionDescriptor> {
    return await this.#transaction((state) => {
      const next = SHARED_LIFECYCLE_ALGEBRA.reduce(state, { type: "renew-transition", token, fence, expiresAt: new Date(this.#clock().getTime() + this.#transitionLeaseDurationMs).toISOString() });
      return { state: next, result: this.#transitionDescriptor(next) };
    });
  }

  async releaseTransition(token: string, fence: number): Promise<Readonly<{ released: true }>> {
    return await this.#transaction((state) => ({ state: SHARED_LIFECYCLE_ALGEBRA.reduce(state, { type: "release-transition", token, fence }), result: Object.freeze({ released: true as const }) }));
  }

  async forceStopTransition(token: string, fence: number): Promise<ElectronStandaloneHostTransitionDescriptor> {
    return await this.#transaction((state) => {
      const now = this.#iso();
      const next = SHARED_LIFECYCLE_ALGEBRA.reduce(state, { type: "force-stop", token, fence, requestedAt: now, expiresAt: new Date(Date.parse(now) + this.#transitionLeaseDurationMs).toISOString() });
      return { state: next, result: this.#transitionDescriptor(next) };
    });
  }

  async completeTransitionStart(
    token: string,
    fence: number,
    generation: GenerationRecord,
    attachment: LifecycleAttachment,
    binding: StandaloneGenerationBinding,
  ): Promise<ElectronStandaloneHostStart> {
    return await this.#transaction((state) => {
      const attachmentCapability = randomBytes(32).toString("hex");
      const now = this.#iso();
      const next = SHARED_LIFECYCLE_ALGEBRA.reduce(state, {
        type: "complete-start",
        token,
        fence,
        generationId: generation.id,
        bindingDigest: binding.digest,
        instanceId: randomUUID(),
        attachment,
        heartbeatAt: now,
        leaseExpiresAt: this.#lease(now),
        capabilityHash: capabilityHash(attachmentCapability),
      });
      return { state: next, result: Object.freeze({ attachmentCapability, status: this.#project(next) }) };
    });
  }

  /**
   * Resume only a durable stopped-sealed transition after its previous host
   * died. Inspection and completion share one ledger transaction, so a cold
   * start cannot race a lease expiry or another transition owner.
   */
  async completeStoppedTransitionStart(
    kind: "content-restart" | "shell-install",
    expectedAttemptId: string | null,
    generation: GenerationRecord,
    attachment: LifecycleAttachment,
    binding: StandaloneGenerationBinding,
  ): Promise<ElectronStandaloneHostStart | null> {
    return await this.#transaction((state) => {
      const transition = state.transition;
      if (transition == null || transition.kind !== kind || transition.phase !== "stopped-sealed"
        || (expectedAttemptId != null && transition.token !== expectedAttemptId)) {
        return { state, result: null };
      }
      const attachmentCapability = randomBytes(32).toString("hex");
      const now = this.#iso();
      const next = SHARED_LIFECYCLE_ALGEBRA.reduce(state, {
        type: "complete-start",
        token: transition.token,
        fence: transition.fence,
        generationId: generation.id,
        bindingDigest: binding.digest,
        instanceId: randomUUID(),
        attachment,
        heartbeatAt: now,
        leaseExpiresAt: this.#lease(now),
        capabilityHash: capabilityHash(attachmentCapability),
      });
      return { state: next, result: Object.freeze({ attachmentCapability, status: this.#project(next) }) };
    });
  }
}
