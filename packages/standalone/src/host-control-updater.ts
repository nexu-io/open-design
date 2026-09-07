import {
  validateShellUpdaterSnapshot,
  type StandaloneShellUpdaterAction,
  type StandaloneShellUpdaterActionResult,
  type StandaloneShellUpdaterPort,
  type StandaloneShellUpdaterSnapshot,
} from "./shell-update.js";

import {
  STANDALONE_HOST_CONTROL_SCHEMA_VERSION,
  validateStandaloneHostControlRequest,
  type StandaloneHostControlRequest,
} from "./host-control.js";
import type { StandaloneHostControlTransport } from "./host-control-client.js";
import type { LifecycleScope } from "./launcher.js";
import type { StandaloneShellIdentity } from "./protocol.js";

function snapshot(value: unknown, shellType: string): StandaloneShellUpdaterSnapshot {
  const result = validateShellUpdaterSnapshot(value);
  if (result.shellType !== shellType) throw new Error("Standalone host updater result escaped its Shell type");
  return result;
}

function actionResult(value: unknown, shellType: string): StandaloneShellUpdaterActionResult {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("Standalone host updater result is invalid");
  const result = value as Record<string, unknown>;
  const keys = Object.keys(result).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["outcome", "snapshot"])) throw new Error("Standalone host updater result fields are invalid");
  if (!["accepted", "blocked", "failed", "unsupported"].includes(result.outcome as string)) throw new Error("Standalone host updater outcome is invalid");
  return Object.freeze({ outcome: result.outcome, snapshot: snapshot(result.snapshot, shellType) }) as StandaloneShellUpdaterActionResult;
}

export class StandaloneHostControlUpdater implements StandaloneShellUpdaterPort {
  constructor(
    readonly shellType: string,
    private readonly scope: LifecycleScope,
    private readonly transport: StandaloneHostControlTransport,
  ) {
    this.scope = Object.freeze({ ...scope });
    validateStandaloneHostControlRequest({ schemaVersion: 1, operation: "updater.read", scope: this.scope, shellType }, this.scope);
  }

  #request(request: StandaloneHostControlRequest): Promise<unknown> {
    return this.transport(validateStandaloneHostControlRequest(request, this.scope));
  }

  async readSnapshot(): Promise<StandaloneShellUpdaterSnapshot> {
    return snapshot(await this.#request({ schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION, operation: "updater.read", scope: this.scope, shellType: this.shellType }), this.shellType);
  }

  async waitForChange(afterRevision: number, timeoutMs: number): Promise<StandaloneShellUpdaterSnapshot> {
    return snapshot(await this.#request({ schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION, operation: "updater.wait", scope: this.scope, shellType: this.shellType, afterRevision, timeoutMs }), this.shellType);
  }

  async invoke(action: StandaloneShellUpdaterAction["id"]): Promise<StandaloneShellUpdaterActionResult> {
    return actionResult(await this.#request({ schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION, operation: "updater.invoke", scope: this.scope, shellType: this.shellType, action }), this.shellType);
  }

  async confirmInstalled(proof: StandaloneShellIdentity): Promise<StandaloneShellUpdaterActionResult> {
    return actionResult(await this.#request({ schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION, operation: "updater.confirm-installed", scope: this.scope, shellType: this.shellType, proof }), this.shellType);
  }
}
