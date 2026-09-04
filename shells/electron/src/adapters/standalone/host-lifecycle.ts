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
  #state: SharedLifecycleState;
  #tail: Promise<void> = Promise.resolve();

  constructor(
    readonly scope: LifecycleScope,
    options: Readonly<{ clock?: Clock; heartbeatIntervalMs?: number; leaseDurationMs?: number }> = {},
  ) {
    this.#clock = options.clock ?? (() => new Date());
    this.#heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5_000;
    this.#leaseDurationMs = options.leaseDurationMs ?? 30_000;
    if (!Number.isSafeInteger(this.#heartbeatIntervalMs) || this.#heartbeatIntervalMs < 100) throw new Error("invalid Electron Standalone heartbeat interval");
    if (!Number.isSafeInteger(this.#leaseDurationMs) || this.#leaseDurationMs <= this.#heartbeatIntervalMs * 2) throw new Error("invalid Electron Standalone lease duration");
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
      const now = this.#iso();
      const current = SHARED_LIFECYCLE_ALGEBRA.reduce(this.#state, { type: "tick", now, leaseDurationMs: this.#leaseDurationMs });
      const next = operation(current);
      this.#state = SHARED_LIFECYCLE_ALGEBRA.validate(next.state, this.scope);
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
}
