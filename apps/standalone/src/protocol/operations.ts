import { createHash } from "node:crypto";
import { isAbsolute, posix, win32 } from "node:path";

import {
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  STANDALONE_UPDATER_SCHEMA_VERSION,
  StandaloneHandoffEnvelope,
  StandaloneProtocolJsonValue,
  StandaloneShellCapabilityExchange,
  StandaloneShellCapabilityRequest,
  StandaloneShellCapabilityResult,
  isStandaloneShellCapability,
  StandaloneRuntimeCommandExchange,
  StandaloneRuntimeCommandRequest,
  StandaloneRuntimeCommandResult,
  StandaloneRuntimeStatus,
  StandaloneUpdaterProviderDescriptor,
  StandaloneUpdaterState,
  StandaloneUpdaterSnapshot,
  StandaloneUpdaterWaitRequest,
  StandaloneUpdaterActionRequest,
  StandaloneUpdaterActionResult,
  StandaloneProtocolError,
} from "./index.js";
import {
  requireRecord,
  normalizeToken,
  normalizeVersion,
  normalizeJsonValue,
  requireKnownKeys,
  requiredString,
  validateStandaloneShellCapabilityInput,
  validateStandaloneShellCapabilityOutput,
  sameStandaloneHandoffEnvelope,
  validateStandaloneHandoffEnvelope,
} from "./core-validation.js";

function validateCapabilityExchange(
  value: Record<string, unknown>,
  expected?: { attachmentId?: string; handoff?: StandaloneHandoffEnvelope; requestId?: string },
): StandaloneShellCapabilityExchange {
  if (value.schemaVersion !== STANDALONE_HANDOFF_SCHEMA_VERSION) {
    throw new StandaloneProtocolError("unsupported standalone capability schema version");
  }
  const handoff = validateStandaloneHandoffEnvelope(value.handoff, expected?.handoff);
  const attachmentId = normalizeToken(value.attachmentId, "standalone capability attachmentId");
  if (expected?.attachmentId != null && attachmentId !== expected.attachmentId) {
    throw new StandaloneProtocolError("standalone capability attachmentId does not match");
  }
  const requestId = normalizeToken(value.requestId, "standalone capability requestId");
  if (expected?.requestId != null && requestId !== expected.requestId) {
    throw new StandaloneProtocolError("standalone capability requestId does not match");
  }
  return { attachmentId, handoff, requestId, schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION };
}

function validateRuntimeCommandExchange(
  value: Record<string, unknown>,
  expected?: { attachmentId?: string; handoff?: StandaloneHandoffEnvelope; requestId?: string },
): StandaloneRuntimeCommandExchange {
  if (value.schemaVersion !== STANDALONE_HANDOFF_SCHEMA_VERSION) {
    throw new StandaloneProtocolError("unsupported standalone runtime command schema version");
  }
  const handoff = validateStandaloneHandoffEnvelope(value.handoff, expected?.handoff);
  const attachmentId = normalizeToken(value.attachmentId, "standalone runtime command attachmentId");
  if (expected?.attachmentId != null && attachmentId !== expected.attachmentId) {
    throw new StandaloneProtocolError("standalone runtime command attachmentId does not match");
  }
  const requestId = normalizeToken(value.requestId, "standalone runtime command requestId");
  if (expected?.requestId != null && requestId !== expected.requestId) {
    throw new StandaloneProtocolError("standalone runtime command requestId does not match");
  }
  return { attachmentId, handoff, requestId, schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION };
}

export function validateStandaloneShellCapabilityRequest(
  value: unknown,
  expected?: { attachmentId?: string; handoff?: StandaloneHandoffEnvelope },
): StandaloneShellCapabilityRequest {
  const request = requireRecord(value, "standalone shell capability request");
  const capability = normalizeToken(request.capability, "standalone shell capability");
  return {
    ...validateCapabilityExchange(request, expected),
    capability,
    input: isStandaloneShellCapability(capability)
      ? validateStandaloneShellCapabilityInput(capability, request.input) as StandaloneProtocolJsonValue
      : normalizeJsonValue(request.input, "standalone shell capability input"),
  };
}

export function validateStandaloneShellCapabilityResult(
  value: unknown,
  expected?: {
    capability?: string;
    attachmentId?: string;
    handoff?: StandaloneHandoffEnvelope;
    requestId?: string;
  },
): StandaloneShellCapabilityResult {
  const result = requireRecord(value, "standalone shell capability result");
  const exchange = validateCapabilityExchange(result, expected);
  if (result.outcome === "completed") {
    return {
      ...exchange,
      outcome: "completed",
      output: expected?.capability != null && isStandaloneShellCapability(expected.capability)
        ? validateStandaloneShellCapabilityOutput(expected.capability, result.output) as StandaloneProtocolJsonValue
        : normalizeJsonValue(result.output, "standalone shell capability output"),
    };
  }
  if (result.outcome === "unsupported") return { ...exchange, outcome: "unsupported" };
  if (result.outcome === "failed") {
    const error = requireRecord(result.error, "standalone shell capability error");
    return {
      ...exchange,
      error: { code: normalizeToken(error.code, "standalone shell capability error code") },
      outcome: "failed",
    };
  }
  throw new StandaloneProtocolError(
    `unsupported standalone shell capability outcome: ${String(result.outcome)}`,
  );
}

export function validateStandaloneRuntimeCommandRequest(
  value: unknown,
  expected?: { attachmentId?: string; handoff?: StandaloneHandoffEnvelope },
): StandaloneRuntimeCommandRequest {
  const request = requireRecord(value, "standalone runtime command request");
  return {
    ...validateRuntimeCommandExchange(request, expected),
    command: normalizeToken(request.command, "standalone runtime command"),
    input: normalizeJsonValue(request.input, "standalone runtime command input"),
  };
}

export function validateStandaloneRuntimeCommandResult(
  value: unknown,
  expected?: { attachmentId?: string; handoff?: StandaloneHandoffEnvelope; requestId?: string },
): StandaloneRuntimeCommandResult {
  const result = requireRecord(value, "standalone runtime command result");
  const exchange = validateRuntimeCommandExchange(result, expected);
  if (result.outcome === "completed") {
    return {
      ...exchange,
      outcome: "completed",
      output: normalizeJsonValue(result.output, "standalone runtime command output"),
    };
  }
  if (result.outcome === "unsupported") return { ...exchange, outcome: "unsupported" };
  if (result.outcome === "failed") {
    const error = requireRecord(result.error, "standalone runtime command error");
    return {
      ...exchange,
      error: { code: normalizeToken(error.code, "standalone runtime command error code") },
      outcome: "failed",
    };
  }
  throw new StandaloneProtocolError(
    `unsupported standalone runtime command outcome: ${String(result.outcome)}`,
  );
}

export function validateStandaloneRuntimeStatus(
  value: unknown,
  expected?: { handoff?: StandaloneHandoffEnvelope; state?: StandaloneRuntimeStatus["state"] },
): StandaloneRuntimeStatus {
  const status = requireRecord(value, "standalone runtime status");
  if (status.schemaVersion !== STANDALONE_HANDOFF_SCHEMA_VERSION) {
    throw new StandaloneProtocolError("unsupported standalone runtime status schema version");
  }
  const handoff = validateStandaloneHandoffEnvelope(status.handoff, expected?.handoff);
  if (
    typeof status.pid !== "number"
    || !Number.isSafeInteger(status.pid)
    || status.pid <= 0
  ) {
    throw new StandaloneProtocolError("standalone runtime pid must be a positive safe integer");
  }
  if (expected?.state != null && status.state !== expected.state) {
    throw new StandaloneProtocolError(
      `standalone runtime state ${String(status.state)} does not match ${expected.state}`,
    );
  }
  const base = {
    handoff,
    pid: status.pid,
    schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
  } as const;
  if (status.state === "running") {
    if (typeof status.daemonUrl !== "string" || !/^https?:\/\//u.test(status.daemonUrl)) {
      throw new StandaloneProtocolError("running standalone status must contain an http(s) daemonUrl");
    }
    if (typeof status.webUrl !== "string" || !/^https?:\/\//u.test(status.webUrl)) {
      throw new StandaloneProtocolError("running standalone status must contain an http(s) webUrl");
    }
    return { ...base, daemonUrl: status.daemonUrl, state: "running", webUrl: status.webUrl };
  }
  if (status.state === "stopped") return { ...base, state: "stopped" };
  if (status.state === "failed") {
    const error = requireRecord(status.error, "standalone runtime error");
    return {
      ...base,
      error: { code: normalizeToken(error.code, "standalone runtime error code") },
      state: "failed",
    };
  }
  throw new StandaloneProtocolError(`unsupported standalone runtime state: ${String(status.state)}`);
}

function normalizeUpdaterSchemaVersion(value: unknown): typeof STANDALONE_UPDATER_SCHEMA_VERSION {
  if (value !== STANDALONE_UPDATER_SCHEMA_VERSION) {
    throw new StandaloneProtocolError(
      `unsupported standalone updater schema version: ${String(value)}`,
    );
  }
  return STANDALONE_UPDATER_SCHEMA_VERSION;
}

function normalizeRequiredNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new StandaloneProtocolError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizeRequiredPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new StandaloneProtocolError(`${label} must be a positive safe integer`);
  }
  return value;
}

function sameUpdaterProvider(
  left: StandaloneUpdaterProviderDescriptor,
  right: StandaloneUpdaterProviderDescriptor,
): boolean {
  return (
    left.owner === right.owner
    && left.providerId === right.providerId
    && left.incarnation === right.incarnation
    && sameStandaloneHandoffEnvelope(left.handoff, right.handoff)
    && (
      left.owner === "standalone"
      || (
        right.owner === "shell"
        && left.attachmentId === right.attachmentId
        && left.hostScope === right.hostScope
      )
    )
  );
}

export function validateStandaloneUpdaterProviderDescriptor(
  value: unknown,
  expected?: StandaloneUpdaterProviderDescriptor,
): StandaloneUpdaterProviderDescriptor {
  const provider = requireRecord(value, "standalone updater provider");
  normalizeUpdaterSchemaVersion(provider.schemaVersion);
  const base = {
    handoff: validateStandaloneHandoffEnvelope(provider.handoff, expected?.handoff),
    incarnation: normalizeToken(provider.incarnation, "standalone updater provider incarnation"),
    providerId: normalizeToken(provider.providerId, "standalone updater provider id"),
    schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
  } as const;
  let normalized: StandaloneUpdaterProviderDescriptor;
  if (provider.owner === "standalone") {
    requireKnownKeys(
      provider,
      ["handoff", "incarnation", "owner", "providerId", "schemaVersion"],
      "standalone-owned updater provider",
    );
    if (Object.hasOwn(provider, "attachmentId") || Object.hasOwn(provider, "hostScope")) {
      throw new StandaloneProtocolError(
        "standalone-owned updater provider must not contain Shell attachment fields",
      );
    }
    normalized = { ...base, owner: "standalone" };
  } else if (provider.owner === "shell") {
    requireKnownKeys(
      provider,
      ["attachmentId", "handoff", "hostScope", "incarnation", "owner", "providerId", "schemaVersion"],
      "standalone Shell updater provider",
    );
    normalized = {
      ...base,
      attachmentId: normalizeToken(
        provider.attachmentId,
        "standalone Shell updater attachmentId",
      ),
      hostScope: normalizeToken(provider.hostScope, "standalone Shell updater hostScope"),
      owner: "shell",
    };
  } else {
    throw new StandaloneProtocolError(
      `unsupported standalone updater provider owner: ${String(provider.owner)}`,
    );
  }
  if (expected != null && !sameUpdaterProvider(normalized, expected)) {
    throw new StandaloneProtocolError(
      "standalone updater provider does not match the expected provider incarnation",
    );
  }
  return normalized;
}

export function validateStandaloneUpdaterSnapshot(
  value: unknown,
  expected?: { provider?: StandaloneUpdaterProviderDescriptor },
): StandaloneUpdaterSnapshot {
  const snapshot = requireRecord(value, "standalone updater snapshot");
  requireKnownKeys(
    snapshot,
    ["actions", "presentation", "progress", "provider", "revision", "schemaVersion", "state"],
    "standalone updater snapshot",
  );
  normalizeUpdaterSchemaVersion(snapshot.schemaVersion);
  const provider = validateStandaloneUpdaterProviderDescriptor(snapshot.provider, expected?.provider);
  const states: readonly StandaloneUpdaterState[] = [
    "idle",
    "checking",
    "available",
    "downloading",
    "ready",
    "applying",
    "handed-off",
    "failed",
  ];
  if (!states.includes(snapshot.state as StandaloneUpdaterState)) {
    throw new StandaloneProtocolError(
      `unsupported standalone updater state: ${String(snapshot.state)}`,
    );
  }
  if (!Array.isArray(snapshot.actions)) {
    throw new StandaloneProtocolError("standalone updater snapshot actions must be an array");
  }
  const actions = snapshot.actions.map((rawAction) => {
    const action = requireRecord(rawAction, "standalone updater action presentation");
    requireKnownKeys(
      action,
      ["detail", "emphasis", "id", "label"],
      "standalone updater action presentation",
    );
    if (action.emphasis !== "primary" && action.emphasis !== "secondary" && action.emphasis !== "danger") {
      throw new StandaloneProtocolError("standalone updater action emphasis is unsupported");
    }
    return {
      ...(action.detail == null
        ? {}
        : { detail: requiredString(action.detail, "standalone updater action detail") }),
      emphasis: action.emphasis,
      id: normalizeToken(action.id, "standalone updater action id"),
      label: requiredString(action.label, "standalone updater action label"),
    } as const;
  });
  if (new Set(actions.map((action) => action.id)).size !== actions.length) {
    throw new StandaloneProtocolError("standalone updater action ids must be unique");
  }
  const presentation = requireRecord(snapshot.presentation, "standalone updater presentation");
  requireKnownKeys(presentation, ["detail", "title"], "standalone updater presentation");
  const normalizedPresentation = {
    ...(presentation.detail == null
      ? {}
      : { detail: requiredString(presentation.detail, "standalone updater presentation detail") }),
    title: requiredString(presentation.title, "standalone updater presentation title"),
  };
  let progress: { completed: number; total: number } | undefined;
  if (snapshot.progress != null) {
    const rawProgress = requireRecord(snapshot.progress, "standalone updater progress");
    requireKnownKeys(rawProgress, ["completed", "total"], "standalone updater progress");
    const completed = normalizeRequiredNonNegativeInteger(
      rawProgress.completed,
      "standalone updater progress completed",
    );
    const total = normalizeRequiredPositiveInteger(
      rawProgress.total,
      "standalone updater progress total",
    );
    if (completed > total) {
      throw new StandaloneProtocolError("standalone updater progress completed must not exceed total");
    }
    progress = { completed, total };
  }
  if (snapshot.state === "handed-off" && (actions.length > 0 || progress != null)) {
    throw new StandaloneProtocolError(
      "standalone updater handed-off state is terminal and must not expose actions or progress",
    );
  }
  return {
    actions,
    presentation: normalizedPresentation,
    ...(progress == null ? {} : { progress }),
    provider,
    revision: normalizeRequiredNonNegativeInteger(
      snapshot.revision,
      "standalone updater revision",
    ),
    schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
    state: snapshot.state as StandaloneUpdaterState,
  };
}

export function validateStandaloneUpdaterWaitRequest(
  value: unknown,
  expected?: { provider?: StandaloneUpdaterProviderDescriptor },
): StandaloneUpdaterWaitRequest {
  const request = requireRecord(value, "standalone updater wait request");
  requireKnownKeys(
    request,
    ["afterRevision", "provider", "schemaVersion", "timeoutMs"],
    "standalone updater wait request",
  );
  normalizeUpdaterSchemaVersion(request.schemaVersion);
  const timeoutMs = normalizeRequiredPositiveInteger(
    request.timeoutMs,
    "standalone updater wait timeoutMs",
  );
  if (timeoutMs > 30_000) {
    throw new StandaloneProtocolError("standalone updater wait timeoutMs must not exceed 30000");
  }
  return {
    afterRevision: normalizeRequiredNonNegativeInteger(
      request.afterRevision,
      "standalone updater wait afterRevision",
    ),
    provider: validateStandaloneUpdaterProviderDescriptor(request.provider, expected?.provider),
    schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
    timeoutMs,
  };
}

export function validateStandaloneUpdaterActionRequest(
  value: unknown,
  expected?: { provider?: StandaloneUpdaterProviderDescriptor },
): StandaloneUpdaterActionRequest {
  const request = requireRecord(value, "standalone updater action request");
  requireKnownKeys(
    request,
    ["actionId", "provider", "requestId", "schemaVersion"],
    "standalone updater action request",
  );
  normalizeUpdaterSchemaVersion(request.schemaVersion);
  return {
    actionId: normalizeToken(request.actionId, "standalone updater action id"),
    provider: validateStandaloneUpdaterProviderDescriptor(request.provider, expected?.provider),
    requestId: normalizeToken(request.requestId, "standalone updater action requestId"),
    schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
  };
}

export function validateStandaloneUpdaterActionResult(
  value: unknown,
  expected?: {
    actionId?: string;
    provider?: StandaloneUpdaterProviderDescriptor;
    requestId?: string;
  },
): StandaloneUpdaterActionResult {
  const result = requireRecord(value, "standalone updater action result");
  normalizeUpdaterSchemaVersion(result.schemaVersion);
  const actionId = normalizeToken(result.actionId, "standalone updater action id");
  if (expected?.actionId != null && actionId !== expected.actionId) {
    throw new StandaloneProtocolError("standalone updater action id does not match");
  }
  const provider = validateStandaloneUpdaterProviderDescriptor(result.provider, expected?.provider);
  const requestId = normalizeToken(result.requestId, "standalone updater action requestId");
  if (expected?.requestId != null && requestId !== expected.requestId) {
    throw new StandaloneProtocolError("standalone updater action requestId does not match");
  }
  const exchange = {
    actionId,
    provider,
    requestId,
    schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
  } as const;
  if (result.outcome === "accepted") {
    requireKnownKeys(
      result,
      ["actionId", "operationId", "outcome", "provider", "requestId", "schemaVersion"],
      "standalone updater accepted action result",
    );
    return {
      ...exchange,
      operationId: normalizeToken(result.operationId, "standalone updater operationId"),
      outcome: "accepted",
    };
  }
  if (result.outcome === "unsupported") {
    requireKnownKeys(
      result,
      ["actionId", "outcome", "provider", "requestId", "schemaVersion"],
      "standalone updater unsupported action result",
    );
    return { ...exchange, outcome: "unsupported" };
  }
  if (result.outcome === "failed") {
    requireKnownKeys(
      result,
      ["actionId", "error", "outcome", "provider", "requestId", "schemaVersion"],
      "standalone updater failed action result",
    );
    const error = requireRecord(result.error, "standalone updater action error");
    return {
      ...exchange,
      error: { code: normalizeToken(error.code, "standalone updater action error code") },
      outcome: "failed",
    };
  }
  throw new StandaloneProtocolError(
    `unsupported standalone updater action outcome: ${String(result.outcome)}`,
  );
}

type ComparableVersion = Readonly<{
  core: readonly [number, number, number];
  prerelease: string[];
}>;

function comparableVersion(value: string): ComparableVersion {
  const validated = normalizeVersion(value, "standalone version");
  const normalized = validated.replace(/^v/iu, "").split("+", 1)[0] ?? "";
  const prereleaseSeparator = normalized.indexOf("-");
  const core = prereleaseSeparator === -1 ? normalized : normalized.slice(0, prereleaseSeparator);
  const prerelease = prereleaseSeparator === -1 ? "" : normalized.slice(prereleaseSeparator + 1);
  const parts = core.split(".").map(Number);
  return {
    core: [parts[0]!, parts[1]!, parts[2]!],
    prerelease: prerelease.length === 0 ? [] : prerelease.split("."),
  };
}

function compareIdentifier(left: string, right: string): number {
  const leftNumber = /^\d+$/u.test(left) ? Number(left) : null;
  const rightNumber = /^\d+$/u.test(right) ? Number(right) : null;
  if (leftNumber != null && rightNumber != null) return Math.sign(leftNumber - rightNumber);
  if (leftNumber != null) return -1;
  if (rightNumber != null) return 1;
  return left.localeCompare(right);
}

export function compareStandaloneVersions(left: string, right: string): number {
  const a = comparableVersion(left);
  const b = comparableVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const comparison = Math.sign((a.core[index] ?? 0) - (b.core[index] ?? 0));
    if (comparison !== 0) return comparison;
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  const count = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < count; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart == null) return -1;
    if (rightPart == null) return 1;
    const comparison = compareIdentifier(leftPart, rightPart);
    if (comparison !== 0) return comparison;
  }
  return 0;
}
