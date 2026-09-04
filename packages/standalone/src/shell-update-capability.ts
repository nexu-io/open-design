import { validateShellIdentity, type StandaloneShellIdentity } from "./protocol.js";
import {
  validateShellUpdaterSnapshot,
  type StandaloneShellUpdaterAction,
  type StandaloneShellUpdaterActionResult,
  type StandaloneShellUpdaterPort,
  type StandaloneShellUpdaterSnapshot,
} from "./shell-update.js";
import type {
  StandaloneShellCapabilityPort,
  StandaloneShellCapabilityRequest,
  StandaloneShellCapabilityResult,
} from "./bootloader-handoff.js";

export const STANDALONE_SHELL_UPDATER_CAPABILITY = "standalone-shell-updater-v3" as const;
export const STANDALONE_SHELL_UPDATER_CAPABILITY_SCHEMA = 1 as const;

type CapabilityInput =
  | Readonly<{ schemaVersion: 1; operation: "read"; shellType: string }>
  | Readonly<{ schemaVersion: 1; operation: "wait"; shellType: string; afterRevision: number; timeoutMs: number }>
  | Readonly<{ schemaVersion: 1; operation: "invoke"; shellType: string; action: StandaloneShellUpdaterAction["id"] }>
  | Readonly<{ schemaVersion: 1; operation: "confirm-installed"; shellType: string; proof: StandaloneShellIdentity }>;

type CapabilityOutput =
  | Readonly<{ schemaVersion: 1; operation: "read" | "wait"; snapshot: StandaloneShellUpdaterSnapshot }>
  | Readonly<{ schemaVersion: 1; operation: "invoke" | "confirm-installed"; result: StandaloneShellUpdaterActionResult }>;

const shellTypePattern = /^[a-z][a-z0-9-]{0,63}$/;
const actions = new Set<StandaloneShellUpdaterAction["id"]>(["abandon", "check", "download", "force-stop-and-install", "install", "later"]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} fields are invalid`);
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} is invalid`);
  return value as number;
}

function validateInput(value: unknown): CapabilityInput {
  const input = record(value, "Shell updater capability input");
  if (input.schemaVersion !== STANDALONE_SHELL_UPDATER_CAPABILITY_SCHEMA) throw new Error("Shell updater capability schema is unsupported");
  if (typeof input.shellType !== "string" || !shellTypePattern.test(input.shellType)) throw new Error("Shell updater capability Shell type is invalid");
  if (input.operation === "read") {
    exactKeys(input, ["operation", "schemaVersion", "shellType"], "Shell updater read input");
    return Object.freeze({ schemaVersion: 1, operation: "read", shellType: input.shellType });
  }
  if (input.operation === "wait") {
    exactKeys(input, ["afterRevision", "operation", "schemaVersion", "shellType", "timeoutMs"], "Shell updater wait input");
    const timeoutMs = nonNegativeInteger(input.timeoutMs, "Shell updater capability timeout");
    if (timeoutMs < 1 || timeoutMs > 60_000) throw new Error("Shell updater capability timeout is outside its bounded range");
    return Object.freeze({ schemaVersion: 1, operation: "wait", shellType: input.shellType, afterRevision: nonNegativeInteger(input.afterRevision, "Shell updater capability revision"), timeoutMs });
  }
  if (input.operation === "invoke") {
    exactKeys(input, ["action", "operation", "schemaVersion", "shellType"], "Shell updater invoke input");
    if (!actions.has(input.action as StandaloneShellUpdaterAction["id"])) throw new Error("Shell updater capability action is invalid");
    return Object.freeze({ schemaVersion: 1, operation: "invoke", shellType: input.shellType, action: input.action as StandaloneShellUpdaterAction["id"] });
  }
  if (input.operation === "confirm-installed") {
    exactKeys(input, ["operation", "proof", "schemaVersion", "shellType"], "Shell updater confirm-installed input");
    const proof = record(input.proof, "Shell updater installed proof") as StandaloneShellIdentity;
    exactKeys(proof as unknown as Record<string, unknown>, ["buildHash", "digest", "type", "version"], "Shell updater installed proof");
    validateShellIdentity(proof);
    return Object.freeze({ schemaVersion: 1, operation: "confirm-installed", shellType: input.shellType, proof: Object.freeze({ ...proof }) });
  }
  throw new Error("Shell updater capability operation is unsupported");
}

function validateActionResult(value: unknown): StandaloneShellUpdaterActionResult {
  const result = record(value, "Shell updater capability result");
  exactKeys(result, ["outcome", "snapshot"], "Shell updater capability result");
  if (!new Set(["accepted", "blocked", "failed", "unsupported"]).has(result.outcome as string)) throw new Error("Shell updater capability outcome is invalid");
  return Object.freeze({ outcome: result.outcome, snapshot: validateShellUpdaterSnapshot(result.snapshot) }) as StandaloneShellUpdaterActionResult;
}

function validateOutput(value: unknown, operation: CapabilityInput["operation"]): CapabilityOutput {
  const output = record(value, "Shell updater capability output");
  if (output.schemaVersion !== STANDALONE_SHELL_UPDATER_CAPABILITY_SCHEMA || output.operation !== operation) throw new Error("Shell updater capability output identity is invalid");
  if (operation === "read" || operation === "wait") {
    exactKeys(output, ["operation", "schemaVersion", "snapshot"], "Shell updater capability output");
    return Object.freeze({ schemaVersion: 1, operation, snapshot: validateShellUpdaterSnapshot(output.snapshot) });
  }
  exactKeys(output, ["operation", "result", "schemaVersion"], "Shell updater capability output");
  return Object.freeze({ schemaVersion: 1, operation, result: validateActionResult(output.result) });
}

function base(request: StandaloneShellCapabilityRequest) {
  return Object.freeze({ requestId: request.requestId, attachmentId: request.attachmentId, bindingDigest: request.bindingDigest });
}

/** Adapt one Shell-owned updater to the finite generation-facing capability. */
export function createStandaloneShellUpdaterCapabilityHandler(updater: StandaloneShellUpdaterPort): StandaloneShellCapabilityPort {
  return Object.freeze({
    async invoke(request: StandaloneShellCapabilityRequest): Promise<StandaloneShellCapabilityResult> {
      if (request.capability !== STANDALONE_SHELL_UPDATER_CAPABILITY) return Object.freeze({ ...base(request), outcome: "unsupported" });
      let input: CapabilityInput;
      try {
        input = validateInput(request.input);
        if (input.shellType !== updater.shellType || (input.operation === "confirm-installed" && input.proof.type !== updater.shellType)) {
          throw new Error("Shell updater capability crossed its Shell identity");
        }
      } catch {
        return Object.freeze({ ...base(request), outcome: "failed", error: Object.freeze({ code: "shell-updater-capability-invalid" }) });
      }
      try {
        const output: CapabilityOutput = input.operation === "read"
          ? { schemaVersion: 1, operation: input.operation, snapshot: await updater.readSnapshot() }
          : input.operation === "wait"
            ? { schemaVersion: 1, operation: input.operation, snapshot: await updater.waitForChange(input.afterRevision, input.timeoutMs) }
            : input.operation === "invoke"
              ? { schemaVersion: 1, operation: input.operation, result: await updater.invoke(input.action) }
              : { schemaVersion: 1, operation: input.operation, result: await updater.confirmInstalled(input.proof) };
        return Object.freeze({ ...base(request), outcome: "accepted", output: validateOutput(output, input.operation) });
      } catch {
        return Object.freeze({ ...base(request), outcome: "failed", error: Object.freeze({ code: "shell-updater-capability-failed" }) });
      }
    },
  });
}

/** Recover the typed updater inside an exact generation handoff. */
export function createStandaloneShellUpdaterCapabilityClient(input: Readonly<{
  shellType: string;
  attachmentId: string;
  bindingDigest: string;
  capabilities: StandaloneShellCapabilityPort;
  nextRequestId?: () => string;
}>): StandaloneShellUpdaterPort {
  if (!shellTypePattern.test(input.shellType) || input.attachmentId.length === 0 || !/^[a-f0-9]{64}$/.test(input.bindingDigest)) throw new Error("Shell updater capability client binding is invalid");
  let sequence = 0;
  const nextRequestId = input.nextRequestId ?? (() => `shell-updater-${++sequence}`);
  const invoke = async (requestInput: CapabilityInput): Promise<CapabilityOutput> => {
    const requestId = nextRequestId();
    if (requestId.length === 0) throw new Error("Shell updater capability request id is invalid");
    const result = await input.capabilities.invoke({
      requestId,
      attachmentId: input.attachmentId,
      bindingDigest: input.bindingDigest,
      capability: STANDALONE_SHELL_UPDATER_CAPABILITY,
      input: requestInput,
    });
    if (result.requestId !== requestId || result.attachmentId !== input.attachmentId || result.bindingDigest !== input.bindingDigest) throw new Error("Shell updater capability result escaped its binding");
    if (result.outcome !== "accepted") throw Object.assign(new Error(`Shell updater capability ${result.outcome}`), { code: result.error?.code ?? `shell-updater-capability-${result.outcome}` });
    return validateOutput(result.output, requestInput.operation);
  };
  return Object.freeze({
    shellType: input.shellType,
    async readSnapshot() {
      const output = await invoke({ schemaVersion: 1, operation: "read", shellType: input.shellType });
      if (!("snapshot" in output)) throw new Error("Shell updater read capability returned an action result");
      return output.snapshot;
    },
    async waitForChange(afterRevision: number, timeoutMs: number) {
      const output = await invoke({ schemaVersion: 1, operation: "wait", shellType: input.shellType, afterRevision, timeoutMs });
      if (!("snapshot" in output)) throw new Error("Shell updater wait capability returned an action result");
      return output.snapshot;
    },
    async invoke(action: StandaloneShellUpdaterAction["id"]) {
      const output = await invoke({ schemaVersion: 1, operation: "invoke", shellType: input.shellType, action });
      if (!("result" in output)) throw new Error("Shell updater invoke capability returned a snapshot");
      return output.result;
    },
    async confirmInstalled(proof: StandaloneShellIdentity) {
      const output = await invoke({ schemaVersion: 1, operation: "confirm-installed", shellType: input.shellType, proof });
      if (!("result" in output)) throw new Error("Shell updater confirm capability returned a snapshot");
      return output.result;
    },
  });
}
