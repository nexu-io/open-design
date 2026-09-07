import { FossilHandoffHost, type StandaloneHandoffRequest, type StandaloneRuntimeHandle, type StandaloneShellCapabilityPort } from "./bootloader-handoff.js";
import { StandaloneHostLifecycle } from "./host-lifecycle.js";
import { validateStandaloneHostControlRequest } from "./host-control.js";
import type { LifecycleScope } from "./launcher.js";
import type { StandaloneShellUpdaterPort } from "./shell-update.js";

export type StandaloneHostRuntimeOptions = Readonly<{
  scope: LifecycleScope;
  lifecycle: StandaloneHostLifecycle;
  resolveGeneration: ConstructorParameters<typeof FossilHandoffHost>[0];
  capabilities(request: Pick<StandaloneHandoffRequest, "attachment" | "binding">): StandaloneShellCapabilityPort;
  updater?(shellType: string): StandaloneShellUpdaterPort | undefined;
}>;

export class StandaloneHostRuntime {
  readonly lifecycle: StandaloneHostLifecycle;
  readonly #handoff: FossilHandoffHost;
  readonly #handles = new Map<string, Readonly<{
    attachment: StandaloneHandoffRequest["attachment"];
    handle: StandaloneRuntimeHandle;
  }>>();

  constructor(private readonly options: StandaloneHostRuntimeOptions) {
    this.lifecycle = options.lifecycle;
    this.#handoff = new FossilHandoffHost(options.resolveGeneration);
  }

  async request(input: unknown): Promise<unknown> {
    const request = validateStandaloneHostControlRequest(input, this.options.scope);
    if (request.operation === "lifecycle.status") return await this.lifecycle.status();
    if (request.operation === "lifecycle.ready") return await this.lifecycle.awaitReady(request.readiness);
    if (request.operation === "lifecycle.heartbeat") return await this.lifecycle.heartbeat(request.attachment, request.attachmentCapability);
    if (request.operation === "lifecycle.release") {
      const status = await this.lifecycle.release(request.attachmentId, request.attachmentCapability);
      const active = this.#handles.get(request.attachmentId);
      if (active != null) {
        await active.handle.close();
        this.#handles.delete(request.attachmentId);
      }
      return status;
    }
    if (request.operation === "lifecycle.stop") {
      const status = await this.lifecycle.stop(request.fence);
      await Promise.all([...this.#handles.values()].map(({ handle }) => handle.close().catch(() => undefined)));
      this.#handles.clear();
      return status;
    }
    if (request.operation === "lifecycle.start") return await this.#start(request);
    if (request.operation === "runtime.invoke") {
      const active = this.#handles.get(request.command.attachmentId);
      if (active == null) throw new Error("Standalone host runtime attachment is unavailable");
      await this.lifecycle.heartbeat(active.attachment, request.attachmentCapability);
      return await active.handle.invoke(request.command);
    }
    if (request.operation === "transition.begin") return await this.lifecycle.beginTransition(request.kind, request.options);
    if (request.operation === "transition.renew") return await this.lifecycle.renewTransition(request.token, request.fence);
    if (request.operation === "transition.release") return await this.lifecycle.releaseTransition(request.token, request.fence);
    if (request.operation === "transition.force-stop") {
      const transition = await this.lifecycle.forceStopTransition(request.token, request.fence);
      await Promise.all([...this.#handles.values()].map(({ handle }) => handle.close().catch(() => undefined)));
      this.#handles.clear();
      return transition;
    }
    if (request.operation === "transition.complete-start") {
      return await this.#completeTransitionStart(request);
    }
    if (request.operation === "updater.read") {
      const updater = this.#updater(request.shellType);
      return await updater.readSnapshot();
    }
    if (request.operation === "updater.wait") {
      const updater = this.#updater(request.shellType);
      return await updater.waitForChange(request.afterRevision, request.timeoutMs);
    }
    if (request.operation === "updater.invoke") {
      const updater = this.#updater(request.shellType);
      return await updater.invoke(request.action);
    }
    if (request.operation === "updater.confirm-installed") {
      const updater = this.#updater(request.shellType);
      return await updater.confirmInstalled(request.proof);
    }
    throw new Error(`Standalone host operation is not implemented: ${request.operation}`);
  }

  async #start(request: Extract<ReturnType<typeof validateStandaloneHostControlRequest>, { operation: "lifecycle.start" }>) {
    return await this.#boundStart(request, () => this.#startLifecycle(request));
  }

  async #completeTransitionStart(request: Extract<ReturnType<typeof validateStandaloneHostControlRequest>, { operation: "transition.complete-start" }>) {
    return await this.#boundStart(request, () => this.lifecycle.completeTransitionStart(
      request.token,
      request.fence,
      request.generation,
      request.attachment,
      request.binding,
    ));
  }

  async #boundStart(
    request: Readonly<{
      attachment: StandaloneHandoffRequest["attachment"];
      binding: StandaloneHandoffRequest["binding"];
      generation: Parameters<StandaloneHostLifecycle["start"]>[0];
    }>,
    startLifecycle: () => Promise<Awaited<ReturnType<StandaloneHostLifecycle["start"]>>>,
  ) {
    // Authenticate or reserve the attachment before touching a cached handle.
    // A rejected caller must never close another caller's live runtime.
    const existing = this.#handles.get(request.attachment.id);
    const started = await startLifecycle();
    let handle: StandaloneRuntimeHandle | undefined;
    try {
      handle = await this.#handoff.handoff({
        binding: request.binding,
        attachment: request.attachment,
        capabilities: this.options.capabilities(request),
      });
      const exact = await handle.readStatus();
      if (exact.state !== "running" || exact.generationId !== request.generation.id || exact.bindingDigest !== request.binding.digest) {
        throw new Error("Standalone host launcher did not acknowledge the exact Sidecar generation");
      }
      this.#handles.set(request.attachment.id, Object.freeze({ attachment: request.attachment, handle }));
      return started;
    } catch (error) {
      if (existing == null) {
        const cleanup = await Promise.allSettled([
          handle?.close(),
          this.lifecycle.release(request.attachment.id, started.attachmentCapability),
        ]);
        const failures = cleanup.filter((result) => result.status === "rejected").map((result) => result.reason);
        if (failures.length > 0) throw new AggregateError([error, ...failures], "Standalone host start and cleanup failed");
      }
      throw error;
    }
  }

  async #startLifecycle(request: Extract<ReturnType<typeof validateStandaloneHostControlRequest>, { operation: "lifecycle.start" }>) {
    const updater = await this.options.updater?.(request.attachment.shell.type)?.readSnapshot();
    if (updater?.state === "installed" && updater.installAttemptId != null) {
      const recovered = await this.lifecycle.completeStoppedTransitionStart("shell-install", updater.installAttemptId, request.generation, request.attachment, request.binding);
      if (recovered != null) return recovered;
    }
    const recoveredContent = await this.lifecycle.completeStoppedTransitionStart("content-restart", null, request.generation, request.attachment, request.binding);
    if (recoveredContent != null) return recoveredContent;
    return await this.lifecycle.start(request.generation, request.attachment, request.binding, request.attachmentCapability);
  }

  #updater(shellType: string): StandaloneShellUpdaterPort {
    const updater = this.options.updater?.(shellType);
    if (updater == null || updater.shellType !== shellType) throw new Error("Standalone host updater Shell type is unavailable");
    return updater;
  }

  async stop(): Promise<void> {
    const current = await this.lifecycle.status();
    if (current.references === 0 && current.state === "running") await this.lifecycle.stop(current.fence);
  }
}
