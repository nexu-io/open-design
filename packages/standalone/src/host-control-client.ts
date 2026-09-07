import { canonicalJson } from "./protocol.js";
import type { GenerationRecord } from "./store.js";
import type { LifecycleAttachment, LifecyclePort, LifecycleReadiness, LifecycleScope, LifecycleStatus } from "./launcher.js";
import type { StandaloneGenerationBinding, StandaloneRuntimeCommand, StandaloneRuntimeCommandResult } from "./bootloader-handoff.js";
import { STANDALONE_HOST_CONTROL_SCHEMA_VERSION, validateStandaloneHostControlRequest, validateStandaloneHostLifecycleStatus, validateStandaloneHostReadiness, type StandaloneHostControlRequest } from "./host-control.js";

export type StandaloneHostControlTransport = (request: StandaloneHostControlRequest) => Promise<unknown>;

export function standaloneHostControlRequestTimeoutMs(request: Readonly<{ operation: string; timeoutMs?: number }>): number {
  if (request.operation === "lifecycle.start" || request.operation === "transition.complete-start" || request.operation === "runtime.invoke") return 120_000;
  if (request.operation === "lifecycle.release" || request.operation === "lifecycle.stop" || request.operation === "transition.force-stop") return 60_000;
  if (request.operation === "updater.invoke") return 10 * 60_000;
  if (request.operation === "updater.wait") return (request.timeoutMs ?? 0) + 2_000;
  return 5_000;
}

const tokenPattern = /^[A-Za-z0-9._-]{1,128}$/u;

function object(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} fields are invalid`);
}

function attachmentCapability(value: unknown): string {
  if (typeof value !== "string" || !tokenPattern.test(value)) throw new Error("Standalone host returned an invalid attachment capability");
  return value;
}

export class StandaloneHostControlClient implements LifecyclePort {
  readonly #capabilities = new Map<string, string>();
  readonly #scope: LifecycleScope;

  constructor(scope: LifecycleScope, private readonly transport: StandaloneHostControlTransport) {
    this.#scope = Object.freeze({ ...scope });
  }

  async #request(request: StandaloneHostControlRequest): Promise<unknown> {
    const exact = validateStandaloneHostControlRequest(request, this.#scope);
    return await this.transport(exact);
  }

  async start(
    scope: LifecycleScope,
    generation: GenerationRecord,
    attachment: LifecycleAttachment,
    binding: StandaloneGenerationBinding,
  ): Promise<LifecycleStatus> {
    const response = object(await this.#request({
      schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION,
      operation: "lifecycle.start",
      scope,
      generation,
      binding,
      attachment,
      attachmentCapability: this.#capabilities.get(attachment.id) ?? null,
    }), "Standalone host lifecycle.start response");
    exactKeys(response, ["attachmentCapability", "status"], "Standalone host lifecycle.start response");
    const capability = attachmentCapability(response.attachmentCapability);
    const status = validateStandaloneHostLifecycleStatus(response.status, this.#scope);
    if (status.generationId !== generation.id || status.bindingDigest !== binding.digest || !status.occupants.some(({ attachmentId }) => attachmentId === attachment.id)) {
      throw new Error("Standalone host returned a different started generation");
    }
    this.#capabilities.set(attachment.id, capability);
    return status;
  }

  async awaitReady(scope: LifecycleScope, readiness: LifecycleReadiness): Promise<LifecycleReadiness> {
    const acknowledged = validateStandaloneHostReadiness(await this.#request({
      schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION,
      operation: "lifecycle.ready",
      scope,
      readiness,
    }));
    if (canonicalJson(acknowledged) !== canonicalJson(readiness)) throw new Error("Standalone host returned stale readiness");
    return acknowledged;
  }

  async heartbeat(scope: LifecycleScope, attachment: LifecycleAttachment): Promise<LifecycleStatus> {
    const attachmentCapability = this.#requireCapability(attachment.id);
    return validateStandaloneHostLifecycleStatus(await this.#request({
      schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION,
      operation: "lifecycle.heartbeat",
      scope,
      attachment,
      attachmentCapability,
    }), this.#scope);
  }

  async release(scope: LifecycleScope, attachmentId: string): Promise<LifecycleStatus> {
    const attachmentCapability = this.#requireCapability(attachmentId);
    const status = validateStandaloneHostLifecycleStatus(await this.#request({
      schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION,
      operation: "lifecycle.release",
      scope,
      attachmentId,
      attachmentCapability,
    }), this.#scope);
    this.#capabilities.delete(attachmentId);
    return status;
  }

  async status(scope: LifecycleScope): Promise<LifecycleStatus> {
    return validateStandaloneHostLifecycleStatus(await this.#request({
      schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION,
      operation: "lifecycle.status",
      scope,
    }), this.#scope);
  }

  async stop(scope: LifecycleScope, fence: number): Promise<LifecycleStatus> {
    const status = validateStandaloneHostLifecycleStatus(await this.#request({
      schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION,
      operation: "lifecycle.stop",
      scope,
      fence,
    }), this.#scope);
    this.#capabilities.clear();
    return status;
  }

  async completeTransitionStart(
    token: string,
    fence: number,
    generation: GenerationRecord,
    attachment: LifecycleAttachment,
    binding: StandaloneGenerationBinding,
  ): Promise<LifecycleStatus> {
    const response = object(await this.#request({
      schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION,
      operation: "transition.complete-start",
      scope: this.#scope,
      token,
      fence,
      generation,
      binding,
      attachment,
    }), "Standalone host transition.complete-start response");
    exactKeys(response, ["attachmentCapability", "status"], "Standalone host transition.complete-start response");
    const capability = attachmentCapability(response.attachmentCapability);
    const status = validateStandaloneHostLifecycleStatus(response.status, this.#scope);
    if (status.generationId !== generation.id || status.bindingDigest !== binding.digest || !status.occupants.some(({ attachmentId }) => attachmentId === attachment.id)) {
      throw new Error("Standalone host completed a different transition generation");
    }
    this.#capabilities.set(attachment.id, capability);
    return status;
  }

  async invoke(command: StandaloneRuntimeCommand): Promise<StandaloneRuntimeCommandResult> {
    const attachmentCapability = this.#requireCapability(command.attachmentId);
    const response = object(await this.#request({
      schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION,
      operation: "runtime.invoke",
      scope: this.#scope,
      command,
      attachmentCapability,
    }), "Standalone host runtime.invoke response");
    const expected = Object.hasOwn(response, "output")
      ? ["attachmentId", "bindingDigest", "outcome", "output", "requestId"]
      : Object.hasOwn(response, "error")
        ? ["attachmentId", "bindingDigest", "error", "outcome", "requestId"]
        : ["attachmentId", "bindingDigest", "outcome", "requestId"];
    exactKeys(response, expected, "Standalone host runtime.invoke response");
    if (response.requestId !== command.requestId || response.attachmentId !== command.attachmentId || response.bindingDigest !== command.bindingDigest) {
      throw new Error("Standalone host runtime response escaped its command binding");
    }
    if (response.outcome !== "accepted" && response.outcome !== "unsupported" && response.outcome !== "failed") throw new Error("Standalone host runtime outcome is invalid");
    return Object.freeze({ ...response }) as StandaloneRuntimeCommandResult;
  }

  #requireCapability(attachmentId: string): string {
    const capability = this.#capabilities.get(attachmentId);
    if (capability == null) throw new Error(`Standalone host attachment capability is unavailable: ${attachmentId}`);
    return capability;
  }
}
