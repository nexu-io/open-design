import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";

import {
  SHARED_LIFECYCLE_ALGEBRA,
  type GenerationRecord,
  type LifecycleAttachment,
  type LifecyclePort,
  type LifecycleReadiness,
  type LifecycleScope,
  type LifecycleStatus,
  type StandaloneShellUpdaterPort,
  type StandaloneLifecycleTransitionResult,
  type SharedLifecycleState,
} from "@open-design/standalone";

type ReadyMessage = Readonly<{ type: "ready"; readiness: LifecycleReadiness }>;
type UpdaterRequest = Readonly<{
  type: "shell-updater-request";
  correlationId: string;
  operation: "read" | "wait" | "invoke" | "confirm-installed";
  afterRevision?: number;
  timeoutMs?: number;
  action?: Parameters<StandaloneShellUpdaterPort["invoke"]>[0];
  proof?: Parameters<StandaloneShellUpdaterPort["confirmInstalled"]>[0];
}>;

export class ElectronFixtureLifecyclePort implements LifecyclePort {
  private stateByScope = new Map<string, SharedLifecycleState>();
  private child: ChildProcess | null = null;
  private readiness: Promise<LifecycleReadiness> | null = null;
  private shellUpdater: StandaloneShellUpdaterPort | null = null;

  constructor(
    private readonly sidecarEntryPath: string,
    private readonly nodeExecutablePath: string,
    private readonly heartbeatIntervalMs = 1_000,
  ) {}

  private key(scope: LifecycleScope): string { return `${scope.channel}/${scope.namespace}`; }
  private state(scope: LifecycleScope): SharedLifecycleState {
    return this.stateByScope.get(this.key(scope)) ?? SHARED_LIFECYCLE_ALGEBRA.initial(scope);
  }
  private commit(scope: LifecycleScope, state: SharedLifecycleState): LifecycleStatus {
    this.stateByScope.set(this.key(scope), state);
    return SHARED_LIFECYCLE_ALGEBRA.project(state, this.heartbeatIntervalMs);
  }

  exposeShellUpdater(updater: StandaloneShellUpdaterPort): void {
    if (this.child != null) throw new Error("fixture Shell updater must be exposed before lifecycle start");
    if (this.shellUpdater != null) throw new Error("fixture Shell updater is already exposed");
    this.shellUpdater = updater;
  }

  private async handleUpdaterRequest(child: ChildProcess, message: UpdaterRequest): Promise<void> {
    if (this.shellUpdater == null) throw new Error("fixture Closure requested an unavailable Shell updater");
    let result: unknown;
    if (message.operation === "read") result = await this.shellUpdater.readSnapshot();
    else if (message.operation === "wait") {
      if (!Number.isSafeInteger(message.afterRevision) || !Number.isSafeInteger(message.timeoutMs)) throw new Error("invalid fixture updater wait request");
      result = await this.shellUpdater.waitForChange(message.afterRevision!, message.timeoutMs!);
    } else if (message.operation === "invoke") {
      if (message.action == null) throw new Error("invalid fixture updater invoke request");
      result = await this.shellUpdater.invoke(message.action);
    } else if (message.operation === "confirm-installed") {
      if (message.proof == null) throw new Error("invalid fixture updater confirmation request");
      result = await this.shellUpdater.confirmInstalled(message.proof);
    } else throw new Error("unsupported fixture updater request");
    if (child.connected) child.send({ type: "shell-updater-response", correlationId: message.correlationId, ok: true, result });
  }

  private spawnSidecar(readiness: LifecycleReadiness): void {
    if (this.child != null) throw new Error("fixture sidecar is already running");
    this.child = fork(this.sidecarEntryPath, [], {
      env: process.env,
      execPath: this.nodeExecutablePath,
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    });
    this.readiness = new Promise<LifecycleReadiness>((resolve, reject) => {
      const child = this.child!;
      const onMessage = (value: unknown) => {
        const updaterRequest = value as Partial<UpdaterRequest>;
        if (updaterRequest.type === "shell-updater-request" && typeof updaterRequest.correlationId === "string") {
          void this.handleUpdaterRequest(child, updaterRequest as UpdaterRequest).catch((error: unknown) => {
            if (!child.connected) return;
            child.send({
              type: "shell-updater-response",
              correlationId: updaterRequest.correlationId,
              ok: false,
              error: { code: "shell-updater-handler-failed", message: error instanceof Error ? error.message : String(error) },
            });
          });
          return;
        }
        const message = value as Partial<ReadyMessage>;
        if (message.type !== "ready" || message.readiness == null) return;
        child.off("error", reject);
        resolve(message.readiness);
      };
      child.on("message", onMessage);
      child.once("error", reject);
      child.once("exit", (code) => reject(new Error(`fixture sidecar exited before readiness (${code ?? "signal"})`)));
      child.send({ type: "start", readiness });
    });
  }

  private async requestChild(type: "heartbeat" | "stop", acknowledgement: "heartbeat-ack" | "stopped"): Promise<void> {
    const child = this.child;
    if (child == null || !child.connected) throw new Error("fixture sidecar is unavailable");
    const correlationId = randomUUID();
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        child.off("message", onMessage);
        child.off("error", onError);
      };
      const onMessage = (value: unknown) => {
        const message = value as { type?: string; correlationId?: string };
        if (message.type !== acknowledgement || message.correlationId !== correlationId) return;
        cleanup();
        resolve();
      };
      const onError = (error: Error) => { cleanup(); reject(error); };
      const timeout = setTimeout(() => { cleanup(); reject(new Error(`fixture sidecar ${type} timed out`)); }, 2_000);
      child.on("message", onMessage);
      child.once("error", onError);
      child.send({ type, correlationId });
    });
  }

  private async stopChild(): Promise<void> {
    const child = this.child;
    if (child == null) return;
    try { await this.requestChild("stop", "stopped"); }
    catch { child.kill(); }
    this.child = null;
    this.readiness = null;
  }

  async start(scope: LifecycleScope, generation: GenerationRecord, attachment: LifecycleAttachment): Promise<LifecycleStatus> {
    if (this.child != null) throw new Error("fixture sidecar is already running");
    const heartbeatAt = new Date().toISOString();
    const instanceId = randomUUID();
    const state = SHARED_LIFECYCLE_ALGEBRA.reduce(this.state(scope), {
      type: "start",
      generationId: generation.id,
      instanceId,
      attachment,
      heartbeatAt,
      leaseExpiresAt: new Date(Date.parse(heartbeatAt) + 15_000).toISOString(),
    });
    const readiness = { generationId: generation.id, instanceId, attachmentId: attachment.id };
    this.spawnSidecar(readiness);
    return this.commit(scope, state);
  }

  async awaitReady(scope: LifecycleScope, readiness: LifecycleReadiness): Promise<LifecycleReadiness> {
    const actual = await this.readiness;
    if (actual == null || JSON.stringify(actual) !== JSON.stringify(readiness)) throw new Error("fixture readiness does not match the lifecycle attachment");
    return SHARED_LIFECYCLE_ALGEBRA.ready(this.state(scope), readiness);
  }

  async heartbeat(scope: LifecycleScope, attachment: LifecycleAttachment): Promise<LifecycleStatus> {
    await this.requestChild("heartbeat", "heartbeat-ack");
    const heartbeatAt = new Date().toISOString();
    return this.commit(scope, SHARED_LIFECYCLE_ALGEBRA.reduce(this.state(scope), {
      type: "heartbeat",
      attachment,
      heartbeatAt,
      leaseExpiresAt: new Date(Date.parse(heartbeatAt) + 15_000).toISOString(),
    }));
  }

  async release(scope: LifecycleScope, attachmentId: string): Promise<LifecycleStatus> {
    return this.commit(scope, SHARED_LIFECYCLE_ALGEBRA.reduce(this.state(scope), { type: "release-attachment", attachmentId }));
  }

  status(scope: LifecycleScope): Promise<LifecycleStatus> {
    return Promise.resolve(SHARED_LIFECYCLE_ALGEBRA.project(this.state(scope), this.heartbeatIntervalMs));
  }

  async beginTransition(
    scope: LifecycleScope,
    kind: "content-restart" | "shell-install",
    options: Readonly<{ ownerAttachmentId?: string; ownerShellType?: string; force?: boolean }> = {},
  ): Promise<StandaloneLifecycleTransitionResult> {
    let state = this.state(scope);
    if (state.transition != null) {
      return { state: "blocked", reason: "transition-active", occupants: SHARED_LIFECYCLE_ALGEBRA.project(state, this.heartbeatIntervalMs).occupants };
    }
    const blockers = SHARED_LIFECYCLE_ALGEBRA.blockers(state, kind, {
      attachmentId: options.ownerAttachmentId,
      shellType: options.ownerShellType,
    });
    if (blockers.length > 0 && options.force !== true) return { state: "blocked", reason: "occupied", occupants: blockers };
    const token = randomUUID();
    const acquiredAt = new Date().toISOString();
    let fence = state.fence;
    let expiresAt = new Date(Date.parse(acquiredAt) + 30_000).toISOString();
    state = SHARED_LIFECYCLE_ALGEBRA.reduce(state, {
      type: "reserve-transition",
      transition: { token, kind, phase: "reserved", fence, acquiredAt, expiresAt },
    });
    this.commit(scope, state);
    return {
      state: "acquired",
      transition: {
        get fence() { return fence; },
        get expiresAt() { return expiresAt; },
        heartbeatIntervalMs: 5_000,
        occupants: SHARED_LIFECYCLE_ALGEBRA.project(state, this.heartbeatIntervalMs).occupants,
        renew: async () => {
          expiresAt = new Date(Date.now() + 30_000).toISOString();
          this.commit(scope, SHARED_LIFECYCLE_ALGEBRA.reduce(this.state(scope), { type: "renew-transition", token, fence, expiresAt }));
        },
        release: async () => {
          this.commit(scope, SHARED_LIFECYCLE_ALGEBRA.reduce(this.state(scope), { type: "release-transition", token, fence }));
        },
        forceStop: async () => {
          expiresAt = new Date(Date.now() + 30_000).toISOString();
          const stopped = SHARED_LIFECYCLE_ALGEBRA.reduce(this.state(scope), { type: "force-stop", token, fence, requestedAt: new Date().toISOString(), expiresAt });
          fence = stopped.fence;
          this.commit(scope, stopped);
          await this.stopChild();
        },
        completeStart: async (generation, attachment) => {
          const heartbeatAt = new Date().toISOString();
          const instanceId = randomUUID();
          const running = SHARED_LIFECYCLE_ALGEBRA.reduce(this.state(scope), {
            type: "complete-start",
            token,
            fence,
            generationId: generation.id,
            instanceId,
            attachment,
            heartbeatAt,
            leaseExpiresAt: new Date(Date.parse(heartbeatAt) + 15_000).toISOString(),
          });
          this.spawnSidecar({ generationId: generation.id, instanceId, attachmentId: attachment.id });
          return this.commit(scope, running);
        },
      },
    };
  }

  async stop(scope: LifecycleScope, fence: number): Promise<LifecycleStatus> {
    const next = SHARED_LIFECYCLE_ALGEBRA.reduce(this.state(scope), { type: "stop", fence, requestedAt: new Date().toISOString() });
    await this.stopChild();
    return this.commit(scope, next);
  }
}
