import {
  validateShellUpdaterSnapshot,
  type LifecycleScope,
  type StandaloneShellIdentity,
  type StandaloneShellUpdaterAction,
  type StandaloneShellUpdaterActionResult,
  type StandaloneShellUpdaterPort,
  type StandaloneShellUpdaterSnapshot,
} from "@open-design/standalone";

import {
  STANDALONE_HOST_CONTROL_SCHEMA_VERSION,
  validateStandaloneHostControlRequest,
  type StandaloneHostControlRequest,
} from "@open-design/standalone";
import type { StandaloneHostControlTransport } from "@open-design/standalone";

function actionResult(value: unknown): StandaloneShellUpdaterActionResult {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("Standalone host updater result is invalid");
  const result = value as Record<string, unknown>;
  const keys = Object.keys(result).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["outcome", "snapshot"])) throw new Error("Standalone host updater result fields are invalid");
  if (!["accepted", "blocked", "failed", "unsupported"].includes(result.outcome as string)) throw new Error("Standalone host updater outcome is invalid");
  return Object.freeze({ outcome: result.outcome, snapshot: validateShellUpdaterSnapshot(result.snapshot) }) as StandaloneShellUpdaterActionResult;
}

export class ElectronStandaloneControlUpdater implements StandaloneShellUpdaterPort {
  constructor(
    readonly shellType: string,
    private readonly scope: LifecycleScope,
    private readonly transport: StandaloneHostControlTransport,
  ) {}

  #request(request: StandaloneHostControlRequest): Promise<unknown> {
    return this.transport(validateStandaloneHostControlRequest(request, this.scope));
  }

  async readSnapshot(): Promise<StandaloneShellUpdaterSnapshot> {
    return validateShellUpdaterSnapshot(await this.#request({ schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION, operation: "updater.read", scope: this.scope, shellType: this.shellType }));
  }

  async waitForChange(afterRevision: number, timeoutMs: number): Promise<StandaloneShellUpdaterSnapshot> {
    return validateShellUpdaterSnapshot(await this.#request({ schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION, operation: "updater.wait", scope: this.scope, shellType: this.shellType, afterRevision, timeoutMs }));
  }

  async invoke(action: StandaloneShellUpdaterAction["id"]): Promise<StandaloneShellUpdaterActionResult> {
    return actionResult(await this.#request({ schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION, operation: "updater.invoke", scope: this.scope, shellType: this.shellType, action }));
  }

  async confirmInstalled(proof: StandaloneShellIdentity): Promise<StandaloneShellUpdaterActionResult> {
    return actionResult(await this.#request({ schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION, operation: "updater.confirm-installed", scope: this.scope, shellType: this.shellType, proof }));
  }
}
