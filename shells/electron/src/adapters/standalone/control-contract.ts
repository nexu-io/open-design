import {
  canonicalJson,
  createStandaloneGenerationBinding,
  validateShellIdentity,
  validateStandaloneScope,
  type GenerationRecord,
  type LifecycleAttachment,
  type LifecycleReadiness,
  type LifecycleScope,
  type StandaloneGenerationBinding,
  type StandaloneRuntimeCommand,
  type StandaloneShellIdentity,
  type StandaloneShellUpdaterAction,
} from "@open-design/standalone";

export const ELECTRON_STANDALONE_CONTROL_SCHEMA_VERSION = 1 as const;
export const ELECTRON_STANDALONE_CONTROL_ACTION = "electron.standalone.control.v1";

type TransitionOptions = Readonly<{
  attemptId?: string;
  ownerAttachmentId?: string;
  ownerShellType?: string;
  force?: boolean;
}>;

export type ElectronStandaloneControlRequest =
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
  const candidate = object(value, "Electron Standalone control scope");
  exactKeys(candidate, ["channel", "namespace"], "Electron Standalone control scope");
  const scope = validateStandaloneScope(candidate as LifecycleScope);
  if (scope.channel !== expected.channel || scope.namespace !== expected.namespace) throw new Error("Electron Standalone control request escaped its scope");
  return Object.freeze({ ...scope });
}

function attachment(value: unknown): LifecycleAttachment {
  const candidate = object(value, "Electron Standalone attachment");
  exactKeys(candidate, ["id", "shell"], "Electron Standalone attachment");
  if (typeof candidate.id !== "string" || !tokenPattern.test(candidate.id)) throw new Error("Electron Standalone attachment has an invalid id");
  const shell = object(candidate.shell, "Electron Standalone attachment Shell");
  exactKeys(shell, ["buildHash", "digest", "type", "version"], "Electron Standalone attachment Shell");
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
  if (canonicalJson(exact) !== canonicalJson(binding)) throw new Error("Electron Standalone control generation binding is not exact");
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
  return token(value, "Electron Standalone attachment capability");
}

export function validateElectronStandaloneControlRequest(
  input: unknown,
  expectedScope: LifecycleScope,
): ElectronStandaloneControlRequest {
  const value = object(input, "Electron Standalone control request");
  if (value.schemaVersion !== ELECTRON_STANDALONE_CONTROL_SCHEMA_VERSION || typeof value.operation !== "string") {
    throw new Error("unsupported Electron Standalone control request");
  }
  const base = { schemaVersion: ELECTRON_STANDALONE_CONTROL_SCHEMA_VERSION, operation: value.operation, scope: exactScope(value.scope, expectedScope) } as const;
  if (value.operation === "lifecycle.status") {
    exactKeys(value, ["operation", "schemaVersion", "scope"], "Electron Standalone lifecycle.status request");
    return Object.freeze({ ...base, operation: value.operation });
  }
  if (value.operation === "lifecycle.start") {
    exactKeys(value, ["attachment", "attachmentCapability", "binding", "generation", "operation", "schemaVersion", "scope"], "Electron Standalone lifecycle.start request");
    return Object.freeze({ ...base, operation: value.operation, ...generationStart(value, expectedScope), attachmentCapability: capability(value.attachmentCapability, true) });
  }
  if (value.operation === "lifecycle.ready") {
    exactKeys(value, ["operation", "readiness", "schemaVersion", "scope"], "Electron Standalone lifecycle.ready request");
    const readiness = object(value.readiness, "Electron Standalone readiness");
    exactKeys(readiness, ["attachmentId", "bindingDigest", "generationId", "instanceId"], "Electron Standalone readiness");
    token(readiness.attachmentId, "Electron Standalone readiness attachmentId");
    token(readiness.instanceId, "Electron Standalone readiness instanceId");
    if (typeof readiness.bindingDigest !== "string" || !digestPattern.test(readiness.bindingDigest)) throw new Error("Electron Standalone readiness bindingDigest is invalid");
    if (typeof readiness.generationId !== "string" || !digestPattern.test(readiness.generationId)) throw new Error("Electron Standalone readiness generationId is invalid");
    return Object.freeze({ ...base, operation: value.operation, readiness: Object.freeze(readiness as LifecycleReadiness) });
  }
  if (value.operation === "lifecycle.heartbeat") {
    exactKeys(value, ["attachment", "attachmentCapability", "operation", "schemaVersion", "scope"], "Electron Standalone lifecycle.heartbeat request");
    return Object.freeze({ ...base, operation: value.operation, attachment: attachment(value.attachment), attachmentCapability: capability(value.attachmentCapability)! });
  }
  if (value.operation === "lifecycle.release") {
    exactKeys(value, ["attachmentCapability", "attachmentId", "operation", "schemaVersion", "scope"], "Electron Standalone lifecycle.release request");
    return Object.freeze({ ...base, operation: value.operation, attachmentId: token(value.attachmentId, "Electron Standalone attachment id"), attachmentCapability: capability(value.attachmentCapability)! });
  }
  if (value.operation === "lifecycle.stop") {
    exactKeys(value, ["fence", "operation", "schemaVersion", "scope"], "Electron Standalone lifecycle.stop request");
    return Object.freeze({ ...base, operation: value.operation, fence: integer(value.fence, "Electron Standalone lifecycle fence") });
  }
  if (value.operation === "transition.begin") {
    exactKeys(value, ["kind", "operation", "options", "schemaVersion", "scope"], "Electron Standalone transition.begin request");
    if (value.kind !== "content-restart" && value.kind !== "shell-install") throw new Error("Electron Standalone transition kind is invalid");
    const options = object(value.options, "Electron Standalone transition options");
    const allowed = ["attemptId", "force", "ownerAttachmentId", "ownerShellType"];
    if (Object.keys(options).some((key) => !allowed.includes(key))) throw new Error("Electron Standalone transition options contain unsupported fields");
    if (options.attemptId != null) token(options.attemptId, "Electron Standalone transition attempt id");
    if (options.ownerAttachmentId != null) token(options.ownerAttachmentId, "Electron Standalone transition owner attachment id");
    if (options.ownerShellType != null && (typeof options.ownerShellType !== "string" || !shellTypePattern.test(options.ownerShellType))) throw new Error("Electron Standalone transition owner Shell type is invalid");
    if (options.force != null && typeof options.force !== "boolean") throw new Error("Electron Standalone transition force flag is invalid");
    return Object.freeze({ ...base, operation: value.operation, kind: value.kind, options: Object.freeze({ ...options }) as TransitionOptions });
  }
  if (["transition.renew", "transition.release", "transition.force-stop"].includes(value.operation)) {
    exactKeys(value, ["fence", "operation", "schemaVersion", "scope", "token"], `Electron Standalone ${value.operation} request`);
    return Object.freeze({ ...base, operation: value.operation as "transition.renew" | "transition.release" | "transition.force-stop", token: token(value.token, "Electron Standalone transition token"), fence: integer(value.fence, "Electron Standalone transition fence") });
  }
  if (value.operation === "transition.complete-start") {
    exactKeys(value, ["attachment", "binding", "fence", "generation", "operation", "schemaVersion", "scope", "token"], "Electron Standalone transition.complete-start request");
    return Object.freeze({ ...base, operation: value.operation, ...generationStart(value, expectedScope), token: token(value.token, "Electron Standalone transition token"), fence: integer(value.fence, "Electron Standalone transition fence") });
  }
  if (value.operation === "runtime.invoke") {
    exactKeys(value, ["attachmentCapability", "command", "operation", "schemaVersion", "scope"], "Electron Standalone runtime.invoke request");
    const command = object(value.command, "Electron Standalone runtime command");
    exactKeys(command, Object.hasOwn(command, "input") ? ["attachmentId", "bindingDigest", "command", "input", "requestId"] : ["attachmentId", "bindingDigest", "command", "requestId"], "Electron Standalone runtime command");
    for (const field of ["attachmentId", "bindingDigest", "command", "requestId"] as const) token(command[field], `Electron Standalone runtime command ${field}`);
    return Object.freeze({ ...base, operation: value.operation, command: Object.freeze({ ...command }) as StandaloneRuntimeCommand, attachmentCapability: capability(value.attachmentCapability)! });
  }
  if (value.operation === "updater.read") {
    exactKeys(value, ["operation", "schemaVersion", "scope", "shellType"], "Electron Standalone updater.read request");
    if (typeof value.shellType !== "string" || !shellTypePattern.test(value.shellType)) throw new Error("Electron Standalone updater Shell type is invalid");
    return Object.freeze({ ...base, operation: value.operation, shellType: value.shellType });
  }
  if (value.operation === "updater.wait") {
    exactKeys(value, ["afterRevision", "operation", "schemaVersion", "scope", "shellType", "timeoutMs"], "Electron Standalone updater.wait request");
    if (typeof value.shellType !== "string" || !shellTypePattern.test(value.shellType)) throw new Error("Electron Standalone updater Shell type is invalid");
    return Object.freeze({ ...base, operation: value.operation, shellType: value.shellType, afterRevision: integer(value.afterRevision, "Electron Standalone updater revision"), timeoutMs: integer(value.timeoutMs, "Electron Standalone updater timeout", 1) });
  }
  if (value.operation === "updater.invoke") {
    exactKeys(value, ["action", "operation", "schemaVersion", "scope", "shellType"], "Electron Standalone updater.invoke request");
    if (typeof value.shellType !== "string" || !shellTypePattern.test(value.shellType)) throw new Error("Electron Standalone updater Shell type is invalid");
    if (!["abandon", "check", "download", "force-stop-and-install", "install", "later"].includes(value.action as string)) throw new Error("Electron Standalone updater action is invalid");
    return Object.freeze({ ...base, operation: value.operation, shellType: value.shellType, action: value.action as StandaloneShellUpdaterAction["id"] });
  }
  if (value.operation === "updater.confirm-installed") {
    exactKeys(value, ["operation", "proof", "schemaVersion", "scope", "shellType"], "Electron Standalone updater.confirm-installed request");
    if (typeof value.shellType !== "string" || !shellTypePattern.test(value.shellType)) throw new Error("Electron Standalone updater Shell type is invalid");
    const proof = object(value.proof, "Electron Standalone installed Shell proof");
    exactKeys(proof, ["buildHash", "digest", "type", "version"], "Electron Standalone installed Shell proof");
    validateShellIdentity(proof as StandaloneShellIdentity);
    return Object.freeze({ ...base, operation: value.operation, shellType: value.shellType, proof: Object.freeze({ ...(proof as StandaloneShellIdentity) }) });
  }
  throw new Error(`unsupported Electron Standalone control operation: ${value.operation}`);
}
