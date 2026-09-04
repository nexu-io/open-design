import {
  invokeSidecar,
  normalizeSidecarStamp,
  type SidecarStamp,
} from "@open-design/sidecar";
import type {
  GenerationRecord,
  LifecycleAttachment,
  LifecyclePort,
  LifecycleReadiness,
  LifecycleScope,
  LifecycleStatus,
  StandaloneGenerationBinding,
  StandaloneRuntimeCommand,
  StandaloneRuntimeCommandResult,
} from "@open-design/standalone";
import { canonicalJson } from "@open-design/standalone";

import {
  ELECTRON_STANDALONE_CONTROL_ACTION,
  ELECTRON_STANDALONE_CONTROL_SCHEMA_VERSION,
  validateElectronStandaloneControlRequest,
  validateElectronStandaloneLifecycleStatus,
  validateElectronStandaloneReadiness,
  type ElectronStandaloneControlRequest,
} from "./control-contract.js";

export type ElectronStandaloneControlTransport = (request: ElectronStandaloneControlRequest) => Promise<unknown>;

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
  if (typeof value !== "string" || !tokenPattern.test(value)) throw new Error("Electron Standalone host returned an invalid attachment capability");
  return value;
}

export function createElectronStandaloneControlTransport(stampInput: SidecarStamp): ElectronStandaloneControlTransport {
  const stamp = Object.freeze(normalizeSidecarStamp(stampInput));
  return async (request) => await invokeSidecar(stamp, ELECTRON_STANDALONE_CONTROL_ACTION, request);
}

export class ElectronStandaloneControlClient implements LifecyclePort {
  readonly #capabilities = new Map<string, string>();
  readonly #scope: LifecycleScope;

  constructor(scope: LifecycleScope, private readonly transport: ElectronStandaloneControlTransport) {
    this.#scope = Object.freeze({ ...scope });
  }

  async #request(request: ElectronStandaloneControlRequest): Promise<unknown> {
    const exact = validateElectronStandaloneControlRequest(request, this.#scope);
    return await this.transport(exact);
  }

  async start(
    scope: LifecycleScope,
    generation: GenerationRecord,
    attachment: LifecycleAttachment,
    binding: StandaloneGenerationBinding,
  ): Promise<LifecycleStatus> {
    const response = object(await this.#request({
      schemaVersion: ELECTRON_STANDALONE_CONTROL_SCHEMA_VERSION,
      operation: "lifecycle.start",
      scope,
      generation,
      binding,
      attachment,
      attachmentCapability: this.#capabilities.get(attachment.id) ?? null,
    }), "Electron Standalone lifecycle.start response");
    exactKeys(response, ["attachmentCapability", "status"], "Electron Standalone lifecycle.start response");
    const capability = attachmentCapability(response.attachmentCapability);
    const status = validateElectronStandaloneLifecycleStatus(response.status, this.#scope);
    if (status.generationId !== generation.id || status.bindingDigest !== binding.digest || !status.occupants.some(({ attachmentId }) => attachmentId === attachment.id)) {
      throw new Error("Electron Standalone host returned a different started generation");
    }
    this.#capabilities.set(attachment.id, capability);
    return status;
  }

  async awaitReady(scope: LifecycleScope, readiness: LifecycleReadiness): Promise<LifecycleReadiness> {
    const acknowledged = validateElectronStandaloneReadiness(await this.#request({
      schemaVersion: ELECTRON_STANDALONE_CONTROL_SCHEMA_VERSION,
      operation: "lifecycle.ready",
      scope,
      readiness,
    }));
    if (canonicalJson(acknowledged) !== canonicalJson(readiness)) throw new Error("Electron Standalone host returned stale readiness");
    return acknowledged;
  }

  async heartbeat(scope: LifecycleScope, attachment: LifecycleAttachment): Promise<LifecycleStatus> {
    const attachmentCapability = this.#requireCapability(attachment.id);
    return validateElectronStandaloneLifecycleStatus(await this.#request({
      schemaVersion: ELECTRON_STANDALONE_CONTROL_SCHEMA_VERSION,
      operation: "lifecycle.heartbeat",
      scope,
      attachment,
      attachmentCapability,
    }), this.#scope);
  }

  async release(scope: LifecycleScope, attachmentId: string): Promise<LifecycleStatus> {
    const attachmentCapability = this.#requireCapability(attachmentId);
    const status = validateElectronStandaloneLifecycleStatus(await this.#request({
      schemaVersion: ELECTRON_STANDALONE_CONTROL_SCHEMA_VERSION,
      operation: "lifecycle.release",
      scope,
      attachmentId,
      attachmentCapability,
    }), this.#scope);
    this.#capabilities.delete(attachmentId);
    return status;
  }

  async status(scope: LifecycleScope): Promise<LifecycleStatus> {
    return validateElectronStandaloneLifecycleStatus(await this.#request({
      schemaVersion: ELECTRON_STANDALONE_CONTROL_SCHEMA_VERSION,
      operation: "lifecycle.status",
      scope,
    }), this.#scope);
  }

  async stop(scope: LifecycleScope, fence: number): Promise<LifecycleStatus> {
    const status = validateElectronStandaloneLifecycleStatus(await this.#request({
      schemaVersion: ELECTRON_STANDALONE_CONTROL_SCHEMA_VERSION,
      operation: "lifecycle.stop",
      scope,
      fence,
    }), this.#scope);
    this.#capabilities.clear();
    return status;
  }

  async invoke(command: StandaloneRuntimeCommand): Promise<StandaloneRuntimeCommandResult> {
    const attachmentCapability = this.#requireCapability(command.attachmentId);
    const response = object(await this.#request({
      schemaVersion: ELECTRON_STANDALONE_CONTROL_SCHEMA_VERSION,
      operation: "runtime.invoke",
      scope: this.#scope,
      command,
      attachmentCapability,
    }), "Electron Standalone runtime.invoke response");
    const expected = Object.hasOwn(response, "output")
      ? ["attachmentId", "bindingDigest", "outcome", "output", "requestId"]
      : Object.hasOwn(response, "error")
        ? ["attachmentId", "bindingDigest", "error", "outcome", "requestId"]
        : ["attachmentId", "bindingDigest", "outcome", "requestId"];
    exactKeys(response, expected, "Electron Standalone runtime.invoke response");
    if (response.requestId !== command.requestId || response.attachmentId !== command.attachmentId || response.bindingDigest !== command.bindingDigest) {
      throw new Error("Electron Standalone runtime response escaped its command binding");
    }
    if (response.outcome !== "accepted" && response.outcome !== "unsupported" && response.outcome !== "failed") throw new Error("Electron Standalone runtime outcome is invalid");
    return Object.freeze({ ...response }) as StandaloneRuntimeCommandResult;
  }

  #requireCapability(attachmentId: string): string {
    const capability = this.#capabilities.get(attachmentId);
    if (capability == null) throw new Error(`Electron Standalone attachment capability is unavailable: ${attachmentId}`);
    return capability;
  }
}
