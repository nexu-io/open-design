import { canonicalJson, validateShellIdentity, validateStandaloneScope, type StandaloneShellIdentity } from "./protocol.js";
import { createStandaloneGenerationBinding, type StandaloneGenerationBinding, type StandaloneRuntimeCommand } from "./bootloader-handoff.js";
import type { GenerationRecord } from "./store.js";
import type { LifecycleAttachment, LifecycleReadiness, LifecycleScope, LifecycleStatus } from "./launcher.js";
import type { StandaloneShellUpdaterAction } from "./shell-update.js";
import type { StandaloneHostTransitionDescriptor, StandaloneHostTransitionResult } from "./host-lifecycle.js";

export const STANDALONE_HOST_CONTROL_SCHEMA_VERSION = 1 as const;
export const STANDALONE_HOST_CONTROL_ACTION = "standalone.host.control.v1";

type TransitionOptions = Readonly<{
  attemptId?: string;
  ownerAttachmentId?: string;
  ownerShellType?: string;
  force?: boolean;
}>;

export type StandaloneHostControlRequest =
  | Readonly<{ schemaVersion: 1; operation: "lifecycle.start"; scope: LifecycleScope; generation: GenerationRecord; binding: StandaloneGenerationBinding; attachment: LifecycleAttachment; attachmentCapability: string | null }>
  | Readonly<{ schemaVersion: 1; operation: "lifecycle.ready"; scope: LifecycleScope; readiness: LifecycleReadiness }>
  | Readonly<{ schemaVersion: 1; operation: "lifecycle.heartbeat"; scope: LifecycleScope; attachment: LifecycleAttachment; attachmentCapability: string }>
  | Readonly<{ schemaVersion: 1; operation: "lifecycle.release"; scope: LifecycleScope; attachmentId: string; attachmentCapability: string }>
  | Readonly<{ schemaVersion: 1; operation: "lifecycle.status"; scope: LifecycleScope }>
  | Readonly<{ schemaVersion: 1; operation: "lifecycle.stop"; scope: LifecycleScope; fence: number }>
  | Readonly<{ schemaVersion: 1; operation: "transition.begin"; scope: LifecycleScope; kind: "content-restart" | "shell-install"; options: TransitionOptions }>
  | Readonly<{ schemaVersion: 1; operation: "transition.renew" | "transition.release" | "transition.force-stop"; scope: LifecycleScope; token: string; fence: number }>
  | Readonly<{ schemaVersion: 1; operation: "transition.complete-start"; scope: LifecycleScope; token: string; fence: number; generation: GenerationRecord; binding: StandaloneGenerationBinding; attachment: LifecycleAttachment }>
  | Readonly<{ schemaVersion: 1; operation: "runtime.invoke"; scope: LifecycleScope; command: StandaloneRuntimeCommand; attachmentCapability: string }>
  | Readonly<{ schemaVersion: 1; operation: "updater.read"; scope: LifecycleScope; shellType: string }>
  | Readonly<{ schemaVersion: 1; operation: "updater.wait"; scope: LifecycleScope; shellType: string; afterRevision: number; timeoutMs: number }>
  | Readonly<{ schemaVersion: 1; operation: "updater.invoke"; scope: LifecycleScope; shellType: string; action: StandaloneShellUpdaterAction["id"] }>
  | Readonly<{ schemaVersion: 1; operation: "updater.confirm-installed"; scope: LifecycleScope; shellType: string; proof: StandaloneShellIdentity }>;

const tokenPattern = /^[A-Za-z0-9._-]{1,128}$/u;
const shellTypePattern = /^[a-z][a-z0-9-]{0,63}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;

function object(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields must be exactly ${wanted.join(",")}`);
  }
}

function exactScope(value: unknown, expected: LifecycleScope): LifecycleScope {
  const candidate = object(value, "Standalone host control scope");
  exactKeys(candidate, ["channel", "namespace"], "Standalone host control scope");
  const scope = validateStandaloneScope(candidate as LifecycleScope);
  if (scope.channel !== expected.channel || scope.namespace !== expected.namespace) throw new Error("Standalone host control request escaped its scope");
  return Object.freeze({ ...scope });
}

function attachment(value: unknown): LifecycleAttachment {
  const candidate = object(value, "Standalone host attachment");
  exactKeys(candidate, ["id", "shell"], "Standalone host attachment");
  if (typeof candidate.id !== "string" || !tokenPattern.test(candidate.id)) throw new Error("Standalone host attachment has an invalid id");
  const shell = object(candidate.shell, "Standalone host attachment Shell");
  exactKeys(shell, ["buildHash", "digest", "type", "version"], "Standalone host attachment Shell");
  validateShellIdentity(shell as StandaloneShellIdentity);
  return Object.freeze({ id: candidate.id, shell: Object.freeze({ ...(shell as StandaloneShellIdentity) }) });
}

function generationStart(value: Record<string, unknown>, expectedScope: LifecycleScope): Readonly<{
  generation: GenerationRecord;
  binding: StandaloneGenerationBinding;
  attachment: LifecycleAttachment;
}> {
  const generation = value.generation as GenerationRecord;
  const binding = value.binding as StandaloneGenerationBinding;
  const exact = createStandaloneGenerationBinding(generation, expectedScope);
  if (canonicalJson(exact) !== canonicalJson(binding)) throw new Error("Standalone host control generation binding is not exact");
  return Object.freeze({ generation, binding, attachment: attachment(value.attachment) });
}

function token(value: unknown, label: string): string {
  if (typeof value !== "string" || !tokenPattern.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error(`${label} is invalid`);
  return value as number;
}

function capability(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  return token(value, "Standalone host attachment capability");
}

function transitionOccupants(input: unknown): LifecycleStatus["occupants"] {
  if (!Array.isArray(input)) throw new Error("Standalone host transition occupants are invalid");
  const seen = new Set<string>();
  return Object.freeze(input.map((entry) => {
    const value = object(entry, "Standalone host transition occupant");
    exactKeys(value, ["attachmentId", "generationId", "shell"], "Standalone host transition occupant");
    const identity = attachment({ id: value.attachmentId, shell: value.shell });
    if (seen.has(identity.id) || typeof value.generationId !== "string" || !digestPattern.test(value.generationId)) throw new Error("Standalone host transition occupant is invalid");
    seen.add(identity.id);
    return Object.freeze({ attachmentId: identity.id, shell: identity.shell, generationId: value.generationId });
  }));
}

export function validateStandaloneHostTransitionDescriptor(input: unknown): StandaloneHostTransitionDescriptor {
  const value = object(input, "Standalone host transition descriptor");
  exactKeys(value, ["token", "attemptId", "fence", "expiresAt", "heartbeatIntervalMs", "occupants", "phase"], "Standalone host transition descriptor");
  if (typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))) throw new Error("Standalone host transition expiry is invalid");
  if (value.phase !== "reserved" && value.phase !== "stopped-sealed") throw new Error("Standalone host transition phase is invalid");
  return Object.freeze({
    token: token(value.token, "Standalone host transition token"),
    attemptId: token(value.attemptId, "Standalone host transition attempt id"),
    fence: integer(value.fence, "Standalone host transition fence"),
    expiresAt: value.expiresAt,
    heartbeatIntervalMs: integer(value.heartbeatIntervalMs, "Standalone host transition heartbeat", 1),
    occupants: transitionOccupants(value.occupants),
    phase: value.phase,
  });
}

export function validateStandaloneHostTransitionResult(input: unknown): StandaloneHostTransitionResult {
  const value = object(input, "Standalone host transition result");
  if (value.state === "acquired") {
    exactKeys(value, ["state", "transition"], "Standalone host acquired transition");
    return Object.freeze({ state: "acquired", transition: validateStandaloneHostTransitionDescriptor(value.transition) });
  }
  exactKeys(value, ["state", "reason", "occupants"], "Standalone host blocked transition");
  if (value.state !== "blocked" || (value.reason !== "occupied" && value.reason !== "transition-active")) throw new Error("Standalone host blocked transition is invalid");
  return Object.freeze({ state: "blocked", reason: value.reason, occupants: transitionOccupants(value.occupants) });
}

export function validateStandaloneHostLifecycleStatus(input: unknown, expectedScope: LifecycleScope): LifecycleStatus {
  const value = object(input, "Standalone host lifecycle status");
  exactKeys(value, ["bindingDigest", "fence", "generationId", "instanceId", "lease", "occupants", "references", "scope", "state"], "Standalone host lifecycle status");
  const scope = exactScope(value.scope, expectedScope);
  if (value.state !== "running" && value.state !== "stopped") throw new Error("Standalone host lifecycle state is invalid");
  const fence = integer(value.fence, "Standalone host lifecycle fence");
  const references = integer(value.references, "Standalone host lifecycle references");
  if (!Array.isArray(value.occupants)) throw new Error("Standalone host lifecycle occupants are invalid");
  const occupants = value.occupants.map((input, index) => {
    const occupant = object(input, `Standalone host lifecycle occupant ${index}`);
    exactKeys(occupant, ["attachmentId", "generationId", "shell"], `Standalone host lifecycle occupant ${index}`);
    const identity = attachment({ id: occupant.attachmentId, shell: occupant.shell });
    if (typeof occupant.generationId !== "string" || !digestPattern.test(occupant.generationId)) throw new Error(`Standalone host lifecycle occupant ${index} generation is invalid`);
    return Object.freeze({ attachmentId: identity.id, generationId: occupant.generationId, shell: identity.shell });
  });
  if (references !== occupants.length) throw new Error("Standalone host lifecycle references do not match its occupants");
  if (value.state === "stopped") {
    if (value.bindingDigest !== null || value.generationId !== null || value.instanceId !== null || value.lease !== null || references !== 0) {
      throw new Error("stopped Standalone host lifecycle retains a running identity");
    }
    return Object.freeze({ scope, state: value.state, generationId: null, bindingDigest: null, instanceId: null, references, occupants: Object.freeze(occupants), fence, lease: null });
  }
  for (const field of ["bindingDigest", "generationId"] as const) {
    if (typeof value[field] !== "string" || !digestPattern.test(value[field])) throw new Error(`Standalone host lifecycle ${field} is invalid`);
  }
  const instanceId = token(value.instanceId, "Standalone host lifecycle instance id");
  const lease = object(value.lease, "Standalone host lifecycle lease");
  exactKeys(lease, ["expiresAt", "heartbeatIntervalMs"], "Standalone host lifecycle lease");
  if (typeof lease.expiresAt !== "string" || !Number.isFinite(Date.parse(lease.expiresAt))) throw new Error("Standalone host lifecycle lease expiry is invalid");
  const heartbeatIntervalMs = integer(lease.heartbeatIntervalMs, "Standalone host lifecycle heartbeat interval", 1);
  if (occupants.some(({ generationId }) => generationId !== value.generationId)) throw new Error("Standalone host lifecycle occupants escaped its generation");
  return Object.freeze({
    scope,
    state: value.state,
    generationId: value.generationId as string,
    bindingDigest: value.bindingDigest as string,
    instanceId,
    references,
    occupants: Object.freeze(occupants),
    fence,
    lease: Object.freeze({ expiresAt: lease.expiresAt, heartbeatIntervalMs }),
  });
}

export function validateStandaloneHostReadiness(input: unknown): LifecycleReadiness {
  const value = object(input, "Standalone host readiness");
  exactKeys(value, ["attachmentId", "bindingDigest", "generationId", "instanceId"], "Standalone host readiness");
  const attachmentId = token(value.attachmentId, "Standalone host readiness attachmentId");
  const instanceId = token(value.instanceId, "Standalone host readiness instanceId");
  if (typeof value.bindingDigest !== "string" || !digestPattern.test(value.bindingDigest)) throw new Error("Standalone host readiness bindingDigest is invalid");
  if (typeof value.generationId !== "string" || !digestPattern.test(value.generationId)) throw new Error("Standalone host readiness generationId is invalid");
  return Object.freeze({ attachmentId, instanceId, bindingDigest: value.bindingDigest, generationId: value.generationId });
}

export function validateStandaloneHostControlRequest(
  input: unknown,
  expectedScope: LifecycleScope,
): StandaloneHostControlRequest {
  const value = object(input, "Standalone host control request");
  if (value.schemaVersion !== STANDALONE_HOST_CONTROL_SCHEMA_VERSION || typeof value.operation !== "string") {
    throw new Error("unsupported Standalone host control request");
  }
  const base = { schemaVersion: STANDALONE_HOST_CONTROL_SCHEMA_VERSION, operation: value.operation, scope: exactScope(value.scope, expectedScope) } as const;
  if (value.operation === "lifecycle.status") {
    exactKeys(value, ["operation", "schemaVersion", "scope"], "Standalone host lifecycle.status request");
    return Object.freeze({ ...base, operation: value.operation });
  }
  if (value.operation === "lifecycle.start") {
    exactKeys(value, ["attachment", "attachmentCapability", "binding", "generation", "operation", "schemaVersion", "scope"], "Standalone host lifecycle.start request");
    return Object.freeze({ ...base, operation: value.operation, ...generationStart(value, expectedScope), attachmentCapability: capability(value.attachmentCapability, true) });
  }
  if (value.operation === "lifecycle.ready") {
    exactKeys(value, ["operation", "readiness", "schemaVersion", "scope"], "Standalone host lifecycle.ready request");
    return Object.freeze({ ...base, operation: value.operation, readiness: validateStandaloneHostReadiness(value.readiness) });
  }
  if (value.operation === "lifecycle.heartbeat") {
    exactKeys(value, ["attachment", "attachmentCapability", "operation", "schemaVersion", "scope"], "Standalone host lifecycle.heartbeat request");
    return Object.freeze({ ...base, operation: value.operation, attachment: attachment(value.attachment), attachmentCapability: capability(value.attachmentCapability)! });
  }
  if (value.operation === "lifecycle.release") {
    exactKeys(value, ["attachmentCapability", "attachmentId", "operation", "schemaVersion", "scope"], "Standalone host lifecycle.release request");
    return Object.freeze({ ...base, operation: value.operation, attachmentId: token(value.attachmentId, "Standalone host attachment id"), attachmentCapability: capability(value.attachmentCapability)! });
  }
  if (value.operation === "lifecycle.stop") {
    exactKeys(value, ["fence", "operation", "schemaVersion", "scope"], "Standalone host lifecycle.stop request");
    return Object.freeze({ ...base, operation: value.operation, fence: integer(value.fence, "Standalone host lifecycle fence") });
  }
  if (value.operation === "transition.begin") {
    exactKeys(value, ["kind", "operation", "options", "schemaVersion", "scope"], "Standalone host transition.begin request");
    if (value.kind !== "content-restart" && value.kind !== "shell-install") throw new Error("Standalone host transition kind is invalid");
    const options = object(value.options, "Standalone host transition options");
    const allowed = ["attemptId", "force", "ownerAttachmentId", "ownerShellType"];
    if (Object.keys(options).some((key) => !allowed.includes(key))) throw new Error("Standalone host transition options contain unsupported fields");
    if (options.attemptId != null) token(options.attemptId, "Standalone host transition attempt id");
    if (options.ownerAttachmentId != null) token(options.ownerAttachmentId, "Standalone host transition owner attachment id");
    if (options.ownerShellType != null && (typeof options.ownerShellType !== "string" || !shellTypePattern.test(options.ownerShellType))) throw new Error("Standalone host transition owner Shell type is invalid");
    if (options.force != null && typeof options.force !== "boolean") throw new Error("Standalone host transition force flag is invalid");
    return Object.freeze({ ...base, operation: value.operation, kind: value.kind, options: Object.freeze({ ...options }) as TransitionOptions });
  }
  if (["transition.renew", "transition.release", "transition.force-stop"].includes(value.operation)) {
    exactKeys(value, ["fence", "operation", "schemaVersion", "scope", "token"], `Standalone host ${value.operation} request`);
    return Object.freeze({ ...base, operation: value.operation as "transition.renew" | "transition.release" | "transition.force-stop", token: token(value.token, "Standalone host transition token"), fence: integer(value.fence, "Standalone host transition fence") });
  }
  if (value.operation === "transition.complete-start") {
    exactKeys(value, ["attachment", "binding", "fence", "generation", "operation", "schemaVersion", "scope", "token"], "Standalone host transition.complete-start request");
    return Object.freeze({ ...base, operation: value.operation, ...generationStart(value, expectedScope), token: token(value.token, "Standalone host transition token"), fence: integer(value.fence, "Standalone host transition fence") });
  }
  if (value.operation === "runtime.invoke") {
    exactKeys(value, ["attachmentCapability", "command", "operation", "schemaVersion", "scope"], "Standalone host runtime.invoke request");
    const command = object(value.command, "Standalone host runtime command");
    exactKeys(command, Object.hasOwn(command, "input") ? ["attachmentId", "bindingDigest", "command", "input", "requestId"] : ["attachmentId", "bindingDigest", "command", "requestId"], "Standalone host runtime command");
    for (const field of ["attachmentId", "bindingDigest", "command", "requestId"] as const) token(command[field], `Standalone host runtime command ${field}`);
    return Object.freeze({ ...base, operation: value.operation, command: Object.freeze({ ...command }) as StandaloneRuntimeCommand, attachmentCapability: capability(value.attachmentCapability)! });
  }
  if (value.operation === "updater.read") {
    exactKeys(value, ["operation", "schemaVersion", "scope", "shellType"], "Standalone host updater.read request");
    if (typeof value.shellType !== "string" || !shellTypePattern.test(value.shellType)) throw new Error("Standalone host updater Shell type is invalid");
    return Object.freeze({ ...base, operation: value.operation, shellType: value.shellType });
  }
  if (value.operation === "updater.wait") {
    exactKeys(value, ["afterRevision", "operation", "schemaVersion", "scope", "shellType", "timeoutMs"], "Standalone host updater.wait request");
    if (typeof value.shellType !== "string" || !shellTypePattern.test(value.shellType)) throw new Error("Standalone host updater Shell type is invalid");
    const timeoutMs = integer(value.timeoutMs, "Standalone host updater timeout", 1);
    if (timeoutMs > 60_000) throw new Error("Standalone host updater timeout is too large");
    return Object.freeze({ ...base, operation: value.operation, shellType: value.shellType, afterRevision: integer(value.afterRevision, "Standalone host updater revision"), timeoutMs });
  }
  if (value.operation === "updater.invoke") {
    exactKeys(value, ["action", "operation", "schemaVersion", "scope", "shellType"], "Standalone host updater.invoke request");
    if (typeof value.shellType !== "string" || !shellTypePattern.test(value.shellType)) throw new Error("Standalone host updater Shell type is invalid");
    if (!["abandon", "check", "download", "force-stop-and-install", "install", "later"].includes(value.action as string)) throw new Error("Standalone host updater action is invalid");
    return Object.freeze({ ...base, operation: value.operation, shellType: value.shellType, action: value.action as StandaloneShellUpdaterAction["id"] });
  }
  if (value.operation === "updater.confirm-installed") {
    exactKeys(value, ["operation", "proof", "schemaVersion", "scope", "shellType"], "Standalone host updater.confirm-installed request");
    if (typeof value.shellType !== "string" || !shellTypePattern.test(value.shellType)) throw new Error("Standalone host updater Shell type is invalid");
    const proof = object(value.proof, "Standalone host installed Shell proof");
    exactKeys(proof, ["buildHash", "digest", "type", "version"], "Standalone host installed Shell proof");
    validateShellIdentity(proof as StandaloneShellIdentity);
    if (proof.type !== value.shellType) throw new Error("Standalone host installed proof escaped its Shell type");
    return Object.freeze({ ...base, operation: value.operation, shellType: value.shellType, proof: Object.freeze({ ...(proof as StandaloneShellIdentity) }) });
  }
  throw new Error(`unsupported Standalone host control operation: ${value.operation}`);
}
