import { validateShellIdentity, type StandaloneShellIdentity } from "./protocol.js";
import type { LifecycleAttachment, LifecycleReadiness, LifecycleScope, LifecycleStatus } from "./launcher.js";

export const STANDALONE_SHARED_LIFECYCLE_SCHEMA = 3 as const;

export type SharedLifecycleAttachment = LifecycleAttachment & { heartbeatAt: string; capabilityHash?: string };
export type SharedLifecycleTransitionState = {
  token: string;
  kind: "content-restart" | "shell-install";
  phase: "reserved" | "stopped-sealed";
  fence: number;
  acquiredAt: string;
  expiresAt: string;
};
export type SharedLifecycleState = {
  schemaVersion: typeof STANDALONE_SHARED_LIFECYCLE_SCHEMA;
  scope: LifecycleScope;
  state: "running" | "stopped";
  generationId: string | null;
  bindingDigest: string | null;
  instanceId: string | null;
  attachments: SharedLifecycleAttachment[];
  fence: number;
  leaseExpiresAt: string | null;
  stop: Readonly<{ requestedAt: string; fence: number }> | null;
  transition: SharedLifecycleTransitionState | null;
};

export type SharedLifecycleCommand =
  | Readonly<{ type: "tick"; now: string; leaseDurationMs: number }>
  | Readonly<{
      type: "start";
      generationId: string;
      bindingDigest: string;
      instanceId: string;
      attachment: LifecycleAttachment;
      heartbeatAt: string;
      leaseExpiresAt: string;
      capability?: Readonly<{ candidateHash: string; presentedHash: string | null }>;
    }>
  | Readonly<{ type: "heartbeat"; attachment: LifecycleAttachment; heartbeatAt: string; leaseExpiresAt: string; capabilityHash?: string }>
  | Readonly<{ type: "release-attachment"; attachmentId: string; capabilityHash?: string }>
  | Readonly<{ type: "reserve-transition"; transition: SharedLifecycleTransitionState }>
  | Readonly<{ type: "renew-transition"; token: string; fence: number; expiresAt: string }>
  | Readonly<{ type: "release-transition"; token: string; fence: number }>
  | Readonly<{ type: "force-stop"; token: string; fence: number; requestedAt: string; expiresAt: string }>
  | Readonly<{
      type: "complete-start";
      token: string;
      fence: number;
      generationId: string;
      bindingDigest: string;
      instanceId: string;
      attachment: LifecycleAttachment;
      heartbeatAt: string;
      leaseExpiresAt: string;
      capabilityHash?: string;
    }>
  | Readonly<{ type: "stop"; fence: number; requestedAt: string }>;

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function domainError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function validTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function initialSharedLifecycleState(scope: LifecycleScope): SharedLifecycleState {
  return {
    schemaVersion: STANDALONE_SHARED_LIFECYCLE_SCHEMA,
    scope: { ...scope },
    state: "stopped",
    generationId: null,
    bindingDigest: null,
    instanceId: null,
    attachments: [],
    fence: 0,
    leaseExpiresAt: null,
    stop: null,
    transition: null,
  };
}

export function validateSharedLifecycleState(value: unknown, expectedScope?: LifecycleScope): SharedLifecycleState {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid shared lifecycle state");
  const state = value as SharedLifecycleState;
  if (state.schemaVersion !== STANDALONE_SHARED_LIFECYCLE_SCHEMA) throw new Error("unsupported shared lifecycle state schema");
  if (expectedScope != null && (state.scope?.channel !== expectedScope.channel || state.scope?.namespace !== expectedScope.namespace)) throw new Error("shared lifecycle scope mismatch");
  if (state.state !== "running" && state.state !== "stopped") throw new Error("invalid shared lifecycle phase");
  if (!Number.isSafeInteger(state.fence) || state.fence < 0 || !Array.isArray(state.attachments)) throw new Error("invalid shared lifecycle fence or attachments");
  for (const attachment of state.attachments) {
    if (!TOKEN_PATTERN.test(attachment.id) || !validTime(attachment.heartbeatAt)) throw new Error("invalid shared lifecycle attachment");
    validateShellIdentity(attachment.shell);
    if (attachment.capabilityHash != null && !DIGEST_PATTERN.test(attachment.capabilityHash)) throw new Error("invalid attachment capability hash");
  }
  if (state.state === "running") {
    if (typeof state.generationId !== "string" || !DIGEST_PATTERN.test(state.generationId) || !DIGEST_PATTERN.test(state.bindingDigest ?? "") || !TOKEN_PATTERN.test(state.instanceId ?? "") || !validTime(state.leaseExpiresAt)) throw new Error("invalid running lifecycle identity");
  } else if (state.generationId != null || state.bindingDigest != null || state.instanceId != null || state.attachments.length !== 0 || state.leaseExpiresAt != null) {
    throw new Error("stopped lifecycle retains a running identity");
  }
  if (state.transition != null) {
    const transition = state.transition;
    if (!TOKEN_PATTERN.test(transition.token) || !["content-restart", "shell-install"].includes(transition.kind) || !["reserved", "stopped-sealed"].includes(transition.phase)) throw new Error("invalid shared lifecycle transition");
    if (transition.fence !== state.fence || !validTime(transition.acquiredAt) || !validTime(transition.expiresAt)) throw new Error("shared lifecycle transition is not fenced");
    if (transition.phase === "stopped-sealed" && state.state !== "stopped") throw new Error("sealed transition did not stop the instance");
  }
  return structuredClone(state);
}

export function projectSharedLifecycleStatus(stateInput: SharedLifecycleState, heartbeatIntervalMs: number): LifecycleStatus {
  const state = validateSharedLifecycleState(stateInput);
  return {
    scope: state.scope,
    state: state.state,
    generationId: state.generationId,
    bindingDigest: state.bindingDigest,
    instanceId: state.instanceId,
    references: state.attachments.length,
    occupants: state.attachments.map(({ id, shell }) => ({ attachmentId: id, generationId: state.generationId!, shell })),
    fence: state.fence,
    lease: state.state === "running" && state.leaseExpiresAt != null
      ? { heartbeatIntervalMs, expiresAt: state.leaseExpiresAt }
      : null,
  };
}

export function sharedLifecycleTransitionBlockers(
  state: SharedLifecycleState,
  _kind: "content-restart" | "shell-install",
  owner: Readonly<{ attachmentId?: string; shellType?: string }>,
): LifecycleStatus["occupants"] {
  const occupants = projectSharedLifecycleStatus(state, 1_000).occupants;
  return occupants.filter(({ attachmentId }) => attachmentId !== owner.attachmentId);
}

function expectTransition(state: SharedLifecycleState, token: string, fence: number): SharedLifecycleTransitionState {
  const transition = state.transition;
  if (transition == null || transition.token !== token || transition.fence !== fence || state.fence !== fence) throw domainError("stale-transition", "stale shared lifecycle transition");
  return transition;
}

export function reduceSharedLifecycleState(stateInput: SharedLifecycleState, command: SharedLifecycleCommand): SharedLifecycleState {
  const state = validateSharedLifecycleState(stateInput);
  if (command.type === "tick") {
    const now = Date.parse(command.now);
    if (!Number.isFinite(now) || !Number.isSafeInteger(command.leaseDurationMs) || command.leaseDurationMs <= 0) throw new Error("invalid lifecycle clock");
    if (state.transition != null && Date.parse(state.transition.expiresAt) <= now) {
      state.transition = null;
      state.fence += 1;
    }
    if (state.state === "running") {
      state.attachments = state.attachments.filter(({ heartbeatAt }) => now - Date.parse(heartbeatAt) <= command.leaseDurationMs);
      if (state.attachments.length === 0 && (state.leaseExpiresAt == null || Date.parse(state.leaseExpiresAt) <= now)) {
        state.state = "stopped";
        state.generationId = null;
        state.bindingDigest = null;
        state.instanceId = null;
        state.leaseExpiresAt = null;
        state.transition = null;
        state.fence += 1;
      }
    }
    return validateSharedLifecycleState(state);
  }
  if (command.type === "start") {
    if (state.transition != null) throw domainError("standalone-transition-active", "shared lifecycle transition is active");
    if (state.state === "running" && (state.generationId !== command.generationId || state.bindingDigest !== command.bindingDigest)) {
      throw domainError("standalone-occupied", "another generation binding owns the shared instance");
    }
    if (state.state !== "running") {
      state.state = "running";
      state.generationId = command.generationId;
      state.bindingDigest = command.bindingDigest;
      state.instanceId = command.instanceId;
      state.attachments = [];
      state.fence += 1;
      state.stop = null;
    }
    const existing = state.attachments.find(({ id }) => id === command.attachment.id);
    if (command.capability != null && existing != null && existing.capabilityHash !== command.capability.presentedHash) throw domainError("attachment-capability-required", "shared lifecycle attachment capability is invalid");
    state.attachments = state.attachments.filter(({ id }) => id !== command.attachment.id);
    state.attachments.push({
      ...command.attachment,
      heartbeatAt: command.heartbeatAt,
      ...(command.capability == null ? {} : { capabilityHash: existing?.capabilityHash ?? command.capability.candidateHash }),
    });
    state.leaseExpiresAt = command.leaseExpiresAt;
    return validateSharedLifecycleState(state);
  }
  if (command.type === "heartbeat") {
    const existing = state.attachments.find(({ id }) => id === command.attachment.id);
    if (state.state !== "running" || existing == null) throw new Error("shared lifecycle attachment is unavailable");
    if (command.capabilityHash != null && existing.capabilityHash !== command.capabilityHash) throw domainError("attachment-capability-required", "shared lifecycle attachment capability is invalid");
    Object.assign(existing, command.attachment, { heartbeatAt: command.heartbeatAt });
    state.leaseExpiresAt = command.leaseExpiresAt;
    return validateSharedLifecycleState(state);
  }
  if (command.type === "release-attachment") {
    const existing = state.attachments.find(({ id }) => id === command.attachmentId);
    if (command.capabilityHash != null && existing?.capabilityHash !== command.capabilityHash) throw domainError("attachment-capability-required", "shared lifecycle attachment capability is invalid");
    state.attachments = state.attachments.filter(({ id }) => id !== command.attachmentId);
    return validateSharedLifecycleState(state);
  }
  if (command.type === "reserve-transition") {
    if (state.transition != null) throw domainError("transition-active", "shared lifecycle transition is active");
    if (command.transition.fence !== state.fence || command.transition.phase !== "reserved") throw new Error("invalid transition reservation");
    state.transition = command.transition;
    return validateSharedLifecycleState(state);
  }
  if (command.type === "renew-transition") {
    const transition = expectTransition(state, command.token, command.fence);
    state.transition = { ...transition, expiresAt: command.expiresAt };
    return validateSharedLifecycleState(state);
  }
  if (command.type === "release-transition") {
    const transition = expectTransition(state, command.token, command.fence);
    if (transition.phase !== "reserved") throw domainError("sealed-transition", "a stopped sealed transition cannot be released");
    state.transition = null;
    return validateSharedLifecycleState(state);
  }
  if (command.type === "force-stop") {
    const transition = expectTransition(state, command.token, command.fence);
    if (transition.phase !== "reserved") return state;
    state.stop = { requestedAt: command.requestedAt, fence: state.fence + 1 };
    state.state = "stopped";
    state.generationId = null;
    state.bindingDigest = null;
    state.instanceId = null;
    state.attachments = [];
    state.leaseExpiresAt = null;
    state.fence += 1;
    state.transition = { ...transition, phase: "stopped-sealed", fence: state.fence, expiresAt: command.expiresAt };
    return validateSharedLifecycleState(state);
  }
  if (command.type === "complete-start") {
    const transition = expectTransition(state, command.token, command.fence);
    if (transition.phase !== "stopped-sealed") throw domainError("transition-not-sealed", "shared lifecycle transition has not stopped the instance");
    state.state = "running";
    state.generationId = command.generationId;
    state.bindingDigest = command.bindingDigest;
    state.instanceId = command.instanceId;
    state.attachments = [{ ...command.attachment, heartbeatAt: command.heartbeatAt, ...(command.capabilityHash == null ? {} : { capabilityHash: command.capabilityHash }) }];
    state.leaseExpiresAt = command.leaseExpiresAt;
    state.transition = null;
    state.stop = null;
    return validateSharedLifecycleState(state);
  }
  if (state.transition != null) throw domainError("standalone-transition-active", "shared lifecycle transition is active");
  if (state.fence !== command.fence) throw domainError("stale-stop-fence", "stale shared lifecycle stop fence");
  state.stop = { requestedAt: command.requestedAt, fence: state.fence + 1 };
  state.state = "stopped";
  state.generationId = null;
  state.bindingDigest = null;
  state.instanceId = null;
  state.attachments = [];
  state.leaseExpiresAt = null;
  state.fence += 1;
  return validateSharedLifecycleState(state);
}

export function assertSharedLifecycleReadiness(state: SharedLifecycleState, readiness: LifecycleReadiness): LifecycleReadiness {
  const status = projectSharedLifecycleStatus(state, 1_000);
  if (
    status.state !== "running"
    || status.generationId !== readiness.generationId
    || status.bindingDigest !== readiness.bindingDigest
    || status.instanceId !== readiness.instanceId
    || !status.occupants.some(({ attachmentId }) => attachmentId === readiness.attachmentId)
  ) throw new Error("shared lifecycle readiness acknowledgement is stale");
  return { ...readiness };
}

export const SHARED_LIFECYCLE_ALGEBRA = Object.freeze({
  initial: initialSharedLifecycleState,
  validate: validateSharedLifecycleState,
  reduce: reduceSharedLifecycleState,
  project: projectSharedLifecycleStatus,
  blockers: sharedLifecycleTransitionBlockers,
  ready: assertSharedLifecycleReadiness,
});
