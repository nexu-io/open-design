import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { SidecarControlError, type SidecarControlErrorCode } from "./error.js";
import type {
  SidecarControlIdentity,
  SidecarControlJsonValue,
  SidecarControlProjection,
  SidecarControlRoots,
  SidecarControlScope,
} from "./public-types.js";

const CONTROL_SCHEMA_VERSION = 1 as const;
const CONTROL_BOOTSTRAP_ENV = "OD_SIDECAR_CONTROL_BOOTSTRAP_V1";
const CONTROL_TOKEN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

export type PrivateLaunchMetadata = Readonly<{
  endpointPath: string;
  identity: SidecarControlIdentity;
  incarnation: string;
  projection: SidecarControlProjection;
  roots: SidecarControlRoots;
  schemaVersion: typeof CONTROL_SCHEMA_VERSION;
}>;

export type PrivateControlOperation =
  | Readonly<{ kind: "call"; input: unknown; method: string }>
  | Readonly<{ kind: "probe" }>
  | Readonly<{ kind: "request-stop" }>;

export type PrivateControlRequest = Readonly<{
  identity: SidecarControlIdentity;
  incarnation: string;
  operation: PrivateControlOperation;
  requestId: string;
  schemaVersion: typeof CONTROL_SCHEMA_VERSION;
}>;

export type PrivateControlResponse = Readonly<{
  error?: Readonly<{ code: SidecarControlErrorCode; message: string }>;
  identity: SidecarControlIdentity;
  incarnation: string;
  requestId: string;
  result?: unknown;
  schemaVersion: typeof CONTROL_SCHEMA_VERSION;
  status: "error" | "ok";
}>;

export type PrivateReadyDescriptor = PrivateLaunchMetadata;

function invalid(label: string, detail: string): never {
  throw new SidecarControlError("invalid-input", `${label} ${detail}`);
}

function normalizeToken(value: unknown, label: string): string {
  if (typeof value !== "string") invalid(label, "must be a string");
  if (!CONTROL_TOKEN.test(value)) invalid(label, "must be a lowercase control token");
  return value;
}

function normalizeRoot(value: unknown, label: string): string {
  if (typeof value !== "string") invalid(label, "must be a string");
  if (value.length === 0 || value.trim() !== value || value.includes("\0")) {
    invalid(label, "must be a non-empty canonical path");
  }
  if (!isAbsolute(value)) invalid(label, "must be absolute");
  return resolve(value);
}

export function normalizeControlScope(value: SidecarControlScope): SidecarControlScope {
  if (!Number.isSafeInteger(value.generation) || value.generation < 0) {
    invalid("sidecar generation", "must be a non-negative safe integer");
  }
  return Object.freeze({
    channel: normalizeToken(value.channel, "sidecar channel"),
    generation: value.generation,
    namespace: normalizeToken(value.namespace, "sidecar namespace"),
  });
}

export function normalizeControlIdentity(value: SidecarControlIdentity): SidecarControlIdentity {
  return Object.freeze({
    ...normalizeControlScope(value),
    service: normalizeToken(value.service, "sidecar service"),
  });
}

export function normalizeControlRoots(value: SidecarControlRoots): SidecarControlRoots {
  return Object.freeze({
    dataRoot: normalizeRoot(value.dataRoot, "sidecar dataRoot"),
    resourceRoot: normalizeRoot(value.resourceRoot, "sidecar resourceRoot"),
    runtimeRoot: normalizeRoot(value.runtimeRoot, "sidecar runtimeRoot"),
  });
}

function normalizeJsonValue(value: unknown, label: string, seen = new Set<object>()): SidecarControlJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid(label, "must contain only finite JSON numbers");
    return value;
  }
  if (typeof value !== "object") invalid(label, "must contain only JSON values");
  if (seen.has(value)) invalid(label, "must not contain cycles");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return Object.freeze(value.map((entry, index) =>
        normalizeJsonValue(entry, `${label}[${index}]`, seen),
      ));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      invalid(label, "objects must be plain JSON records");
    }
    return Object.freeze(Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeJsonValue(entry, `${label}.${key}`, seen)]),
    ));
  } finally {
    seen.delete(value);
  }
}

function canonicalJson(value: SidecarControlJsonValue): string {
  return JSON.stringify(value);
}

export function normalizeControlProjection(value: SidecarControlProjection): SidecarControlProjection {
  if (typeof value !== "object" || value == null) invalid("sidecar projection", "must be present");
  const normalizedValue = normalizeJsonValue(value.value, "sidecar projection value");
  if (typeof value.digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value.digest)) {
    invalid("sidecar projection digest", "must be a lowercase sha256 digest");
  }
  const digest = `sha256:${createHash("sha256").update(canonicalJson(normalizedValue)).digest("hex")}` as const;
  if (value.digest !== digest) invalid("sidecar projection digest", "does not match its value");
  return Object.freeze({ digest, value: normalizedValue });
}

export function sameControlProjection(
  left: SidecarControlProjection,
  right: SidecarControlProjection,
): boolean {
  return left.digest === right.digest;
}

export function sameControlIdentity(
  left: SidecarControlIdentity,
  right: SidecarControlIdentity,
): boolean {
  return (
    left.channel === right.channel &&
    left.namespace === right.namespace &&
    left.generation === right.generation &&
    left.service === right.service
  );
}

export function sameControlRoots(left: SidecarControlRoots, right: SidecarControlRoots): boolean {
  return (
    left.dataRoot === right.dataRoot &&
    left.resourceRoot === right.resourceRoot &&
    left.runtimeRoot === right.runtimeRoot
  );
}

function controlKey(identity: SidecarControlIdentity, roots: SidecarControlRoots): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        identity.channel,
        identity.namespace,
        identity.generation,
        identity.service,
        roots.runtimeRoot,
      ]),
    )
    .digest("hex")
    .slice(0, 32);
}

export function privateControlPaths(
  identity: SidecarControlIdentity,
  roots: SidecarControlRoots,
): Readonly<{ descriptorPath: string; endpointPath: string }> {
  const key = controlKey(identity, roots);
  const controlRoot = join(roots.runtimeRoot, ".sidecar-control");
  return {
    descriptorPath: join(controlRoot, `${key}.json`),
    endpointPath:
      process.platform === "win32"
        ? `\\\\.\\pipe\\open-design-sidecar-${key}`
        : join(tmpdir(), `od-sidecar-${key}.sock`),
  };
}

export function createPrivateLaunchMetadata(input: {
  projection: SidecarControlProjection;
  roots: SidecarControlRoots;
  scope: SidecarControlScope;
  service: string;
}): PrivateLaunchMetadata {
  const roots = normalizeControlRoots(input.roots);
  const identity = normalizeControlIdentity({
    ...normalizeControlScope(input.scope),
    service: input.service,
  });
  return Object.freeze({
    endpointPath: privateControlPaths(identity, roots).endpointPath,
    identity,
    incarnation: randomUUID(),
    projection: normalizeControlProjection(input.projection),
    roots,
    schemaVersion: CONTROL_SCHEMA_VERSION,
  });
}

export function encodePrivateLaunchMetadata(metadata: PrivateLaunchMetadata): string {
  return Buffer.from(JSON.stringify(metadata), "utf8").toString("base64url");
}

export function decodePrivateLaunchMetadata(value: unknown): PrivateLaunchMetadata {
  if (typeof value !== "string" || value.length === 0) {
    invalid("sidecar launch metadata", "is unavailable");
  }
  let parsed: Partial<PrivateLaunchMetadata>;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<PrivateLaunchMetadata>;
  } catch (error) {
    throw new SidecarControlError("invalid-input", "sidecar launch metadata is invalid", { cause: error });
  }
  if (parsed.schemaVersion !== CONTROL_SCHEMA_VERSION) {
    invalid("sidecar launch metadata schemaVersion", "is unsupported");
  }
  if (typeof parsed.identity !== "object" || parsed.identity == null) {
    invalid("sidecar launch identity", "must be present");
  }
  if (typeof parsed.roots !== "object" || parsed.roots == null) {
    invalid("sidecar launch roots", "must be present");
  }
  if (typeof parsed.projection !== "object" || parsed.projection == null) {
    invalid("sidecar launch projection", "must be present");
  }
  if (typeof parsed.incarnation !== "string" || parsed.incarnation.length === 0) {
    invalid("sidecar launch incarnation", "must be present");
  }
  const identity = normalizeControlIdentity(parsed.identity as SidecarControlIdentity);
  const projection = normalizeControlProjection(parsed.projection as SidecarControlProjection);
  const roots = normalizeControlRoots(parsed.roots as SidecarControlRoots);
  const expectedEndpoint = privateControlPaths(identity, roots).endpointPath;
  if (parsed.endpointPath !== expectedEndpoint) {
    invalid("sidecar launch endpoint", "does not match the normalized identity");
  }
  return Object.freeze({
    endpointPath: expectedEndpoint,
    identity,
    incarnation: parsed.incarnation,
    projection,
    roots,
    schemaVersion: CONTROL_SCHEMA_VERSION,
  });
}

export function readPrivateLaunchMetadata(env: NodeJS.ProcessEnv = process.env): PrivateLaunchMetadata {
  return decodePrivateLaunchMetadata(env[CONTROL_BOOTSTRAP_ENV]);
}

export function installPrivateLaunchMetadata(
  metadata: PrivateLaunchMetadata,
  env: NodeJS.ProcessEnv = process.env,
): () => void {
  const previous = env[CONTROL_BOOTSTRAP_ENV];
  env[CONTROL_BOOTSTRAP_ENV] = encodePrivateLaunchMetadata(metadata);
  return () => {
    if (previous == null) delete env[CONTROL_BOOTSTRAP_ENV];
    else env[CONTROL_BOOTSTRAP_ENV] = previous;
  };
}

export function createPrivateLaunchEnv(
  metadata: PrivateLaunchMetadata,
  extraEnv: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...extraEnv,
    [CONTROL_BOOTSTRAP_ENV]: encodePrivateLaunchMetadata(metadata),
  };
}

export function createPrivateRequest(
  metadata: PrivateReadyDescriptor,
  operation: PrivateControlOperation,
): PrivateControlRequest {
  return {
    identity: metadata.identity,
    incarnation: metadata.incarnation,
    operation,
    requestId: randomUUID(),
    schemaVersion: CONTROL_SCHEMA_VERSION,
  };
}

export function privateResponse(
  request: PrivateControlRequest,
  metadata: PrivateLaunchMetadata,
  value:
    | Readonly<{ error: Readonly<{ code: SidecarControlErrorCode; message: string }>; status: "error" }>
    | Readonly<{ result: unknown; status: "ok" }>,
): PrivateControlResponse {
  return {
    ...value,
    identity: metadata.identity,
    incarnation: metadata.incarnation,
    requestId: request.requestId,
    schemaVersion: CONTROL_SCHEMA_VERSION,
  };
}

export function normalizePrivateReadyDescriptor(value: unknown): PrivateReadyDescriptor {
  const descriptor = decodePrivateLaunchMetadata(
    typeof value === "object" && value != null
      ? Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
      : value,
  );
  return descriptor;
}

export function assertPrivateResponse(
  request: PrivateControlRequest,
  response: PrivateControlResponse,
): unknown {
  if (
    typeof response !== "object" ||
    response == null ||
    response.schemaVersion !== CONTROL_SCHEMA_VERSION ||
    response.requestId !== request.requestId ||
    !sameControlIdentity(response.identity, request.identity) ||
    response.incarnation !== request.incarnation
  ) {
    throw new SidecarControlError("peer-mismatch", "stale sidecar peer rejected by control fencing");
  }
  if (response.status === "error") {
    throw new SidecarControlError(
      response.error?.code ?? "request-failed",
      response.error?.message ?? "sidecar control request failed",
    );
  }
  return response.result;
}
