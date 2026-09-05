import { isAbsolute, resolve } from "node:path";

import { canonicalJson, validateStandaloneScope, type StandaloneScope } from "./protocol.js";
import type {
  StandaloneShellCapabilityPort,
  StandaloneShellCapabilityRequest,
  StandaloneShellCapabilityResult,
} from "./bootloader-handoff.js";

export const STANDALONE_RUNTIME_LAYOUT_CAPABILITY = "standalone-runtime-layout-v1" as const;
export const STANDALONE_RUNTIME_LAYOUT_CAPABILITY_SCHEMA = 1 as const;

export type StandaloneRuntimeLayout = Readonly<{
  dataRoot: string;
  logsRoot: string;
  runtimeRoot: string;
}>;

type LayoutInput = Readonly<{
  operation: "read";
  schemaVersion: typeof STANDALONE_RUNTIME_LAYOUT_CAPABILITY_SCHEMA;
  scope: StandaloneScope;
}>;

type LayoutOutput = Readonly<LayoutInput & { layout: StandaloneRuntimeLayout }>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) throw new Error(`${label} fields are invalid`);
}

function exactScope(value: unknown, expected: StandaloneScope): StandaloneScope {
  const scope = record(value, "Standalone runtime layout scope");
  exactKeys(scope, ["channel", "namespace"], "Standalone runtime layout scope");
  const valid = validateStandaloneScope(scope as StandaloneScope);
  if (canonicalJson(valid) !== canonicalJson(expected)) throw new Error("Standalone runtime layout escaped its scope");
  return Object.freeze({ ...valid });
}

export function validateStandaloneRuntimeLayout(value: unknown): StandaloneRuntimeLayout {
  const layout = record(value, "Standalone runtime layout");
  exactKeys(layout, ["dataRoot", "logsRoot", "runtimeRoot"], "Standalone runtime layout");
  if (typeof layout.dataRoot !== "string" || typeof layout.logsRoot !== "string" || typeof layout.runtimeRoot !== "string") {
    throw new Error("Standalone runtime layout paths must be strings");
  }
  const paths: readonly string[] = [layout.dataRoot, layout.logsRoot, layout.runtimeRoot];
  if (paths.some((path) => !isAbsolute(path) || resolve(path) !== path)) {
    throw new Error("Standalone runtime layout paths must be absolute and normalized");
  }
  if (new Set(paths).size !== paths.length) throw new Error("Standalone runtime layout paths must be distinct");
  return Object.freeze({ dataRoot: paths[0]!, logsRoot: paths[1]!, runtimeRoot: paths[2]! });
}

function validateInput(value: unknown, scope: StandaloneScope): LayoutInput {
  const input = record(value, "Standalone runtime layout input");
  exactKeys(input, ["operation", "schemaVersion", "scope"], "Standalone runtime layout input");
  if (input.schemaVersion !== STANDALONE_RUNTIME_LAYOUT_CAPABILITY_SCHEMA || input.operation !== "read") {
    throw new Error("Standalone runtime layout capability is unsupported");
  }
  return Object.freeze({ schemaVersion: 1, operation: "read", scope: exactScope(input.scope, scope) });
}

function validateOutput(value: unknown, scope: StandaloneScope): LayoutOutput {
  const output = record(value, "Standalone runtime layout output");
  exactKeys(output, ["layout", "operation", "schemaVersion", "scope"], "Standalone runtime layout output");
  if (output.schemaVersion !== STANDALONE_RUNTIME_LAYOUT_CAPABILITY_SCHEMA || output.operation !== "read") {
    throw new Error("Standalone runtime layout capability output is unsupported");
  }
  return Object.freeze({
    schemaVersion: 1,
    operation: "read",
    scope: exactScope(output.scope, scope),
    layout: validateStandaloneRuntimeLayout(output.layout),
  });
}

function base(request: StandaloneShellCapabilityRequest) {
  return Object.freeze({ requestId: request.requestId, attachmentId: request.attachmentId, bindingDigest: request.bindingDigest });
}

/** Bind one Shell-owned writable layout to its exact Standalone scope. */
export function createStandaloneRuntimeLayoutCapabilityHandler(input: Readonly<{
  layout: StandaloneRuntimeLayout;
  scope: StandaloneScope;
}>): StandaloneShellCapabilityPort {
  const scope = Object.freeze(validateStandaloneScope(input.scope));
  const layout = validateStandaloneRuntimeLayout(input.layout);
  return Object.freeze({
    async invoke(request: StandaloneShellCapabilityRequest): Promise<StandaloneShellCapabilityResult> {
      if (request.capability !== STANDALONE_RUNTIME_LAYOUT_CAPABILITY) return Object.freeze({ ...base(request), outcome: "unsupported" });
      try {
        validateInput(request.input, scope);
        return Object.freeze({
          ...base(request),
          outcome: "accepted" as const,
          output: Object.freeze({ schemaVersion: 1, operation: "read", scope, layout }),
        });
      } catch {
        return Object.freeze({ ...base(request), outcome: "failed" as const, error: Object.freeze({ code: "runtime-layout-capability-invalid" }) });
      }
    },
  });
}

/** Read the writable layout through one attachment/binding-fenced capability. */
export async function readStandaloneRuntimeLayoutCapability(input: Readonly<{
  attachmentId: string;
  bindingDigest: string;
  capabilities: StandaloneShellCapabilityPort;
  requestId: string;
  scope: StandaloneScope;
}>): Promise<StandaloneRuntimeLayout> {
  if (input.attachmentId.length === 0 || input.requestId.length === 0 || !/^[a-f0-9]{64}$/u.test(input.bindingDigest)) {
    throw new Error("Standalone runtime layout client binding is invalid");
  }
  const scope = Object.freeze(validateStandaloneScope(input.scope));
  const result = await input.capabilities.invoke({
    requestId: input.requestId,
    attachmentId: input.attachmentId,
    bindingDigest: input.bindingDigest,
    capability: STANDALONE_RUNTIME_LAYOUT_CAPABILITY,
    input: Object.freeze({ schemaVersion: 1, operation: "read", scope }),
  });
  if (result.requestId !== input.requestId || result.attachmentId !== input.attachmentId || result.bindingDigest !== input.bindingDigest) {
    throw new Error("Standalone runtime layout result escaped its binding");
  }
  if (result.outcome !== "accepted") throw new Error(`Standalone runtime layout capability ${result.outcome}`);
  return validateOutput(result.output, scope).layout;
}
