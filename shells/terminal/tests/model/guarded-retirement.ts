export type AttemptId = "attempt-a" | "attempt-b";
export type ResourceId = "daemon" | "web";

export type RetirementCertificate = Readonly<{
  attemptId: AttemptId;
  logicalFence: number;
  physicalEpoch: number;
  resourceSetId: string;
  retired: Readonly<Record<ResourceId, string | null>>;
}>;

type Transition = Readonly<{
  attemptId: AttemptId;
  fence: number;
  phase: "reserved" | "stopped-sealed";
}>;

type PhysicalEvidence = Readonly<{
  attemptId: AttemptId;
  observed: Readonly<Record<ResourceId, string | null>> | null;
  certificate: RetirementCertificate | null;
}>;

export type GuardedRetirementState = Readonly<{
  logical: Readonly<{
    attachments: readonly string[];
    fence: number;
    phase: "running" | "stopped";
    transition: Transition | null;
  }>;
  physical: Readonly<{
    epoch: number;
    evidence: PhysicalEvidence | null;
    generations: Readonly<Record<ResourceId, string | null>>;
    guardOwner: AttemptId | null;
    resourceSetId: string;
  }>;
  handoff: RetirementCertificate | null;
}>;

export type GuardedRetirementCommand =
  | Readonly<{ type: "reserve"; attemptId: AttemptId }>
  | Readonly<{ type: "acquire-guard"; attemptId: AttemptId }>
  | Readonly<{ type: "observe"; attemptId: AttemptId }>
  | Readonly<{ type: "retire"; attemptId: AttemptId }>
  | Readonly<{ type: "verify"; attemptId: AttemptId }>
  | Readonly<{ type: "commit"; attemptId: AttemptId }>
  | Readonly<{ type: "persist-handoff"; attemptId: AttemptId }>
  | Readonly<{ type: "release-guard"; attemptId: AttemptId }>
  | Readonly<{ type: "abort"; attemptId: AttemptId }>
  | Readonly<{ type: "expire-transition" }>
  | Readonly<{ type: "crash-owner"; attemptId: AttemptId }>
  | Readonly<{ type: "start-resource"; resource: ResourceId; generation: string }>;

export type GuardedRetirementResult = Readonly<{
  code?: string;
  outcome: "applied" | "replayed" | "rejected";
  state: GuardedRetirementState;
}>;

const resources: readonly ResourceId[] = ["daemon", "web"];

export function initialGuardedRetirementState(): GuardedRetirementState {
  return {
    logical: {
      attachments: ["terminal-a", "electron-a"],
      fence: 1,
      phase: "running",
      transition: null,
    },
    physical: {
      epoch: 1,
      evidence: null,
      generations: { daemon: "daemon-generation-1", web: "web-generation-1" },
      guardOwner: null,
      resourceSetId: "fixture-product-set-v1",
    },
    handoff: null,
  };
}

function accepted(state: GuardedRetirementState, outcome: "applied" | "replayed" = "applied"): GuardedRetirementResult {
  assertGuardedRetirementInvariants(state);
  return { outcome, state };
}

function rejected(state: GuardedRetirementState, code: string): GuardedRetirementResult {
  assertGuardedRetirementInvariants(state);
  return { code, outcome: "rejected", state };
}

function ownsReservedTransition(state: GuardedRetirementState, attemptId: AttemptId): boolean {
  return state.logical.transition?.attemptId === attemptId
    && state.logical.transition.phase === "reserved"
    && state.logical.transition.fence === state.logical.fence;
}

function ownsRecoverableTransition(state: GuardedRetirementState, attemptId: AttemptId): boolean {
  const transition = state.logical.transition;
  return transition?.attemptId === attemptId
    && transition.fence === state.logical.fence
    && (transition.phase === "reserved" || (transition.phase === "stopped-sealed" && state.handoff == null));
}

function ownsGuard(state: GuardedRetirementState, attemptId: AttemptId): boolean {
  return state.physical.guardOwner === attemptId;
}

function withoutPhysicalAuthority(state: GuardedRetirementState): GuardedRetirementState["physical"] {
  return { ...state.physical, evidence: null, guardOwner: null };
}

export function reduceGuardedRetirement(
  state: GuardedRetirementState,
  command: GuardedRetirementCommand,
): GuardedRetirementResult {
  assertGuardedRetirementInvariants(state);

  if (command.type === "reserve") {
    const transition = state.logical.transition;
    if (transition?.attemptId === command.attemptId) return accepted(state, "replayed");
    if (transition != null || state.handoff != null) return rejected(state, "transition-unavailable");
    return accepted({
      ...state,
      logical: {
        ...state.logical,
        transition: { attemptId: command.attemptId, fence: state.logical.fence, phase: "reserved" },
      },
    });
  }

  if (command.type === "acquire-guard") {
    if (!ownsRecoverableTransition(state, command.attemptId)) return rejected(state, "stale-transition");
    if (state.physical.guardOwner === command.attemptId) return accepted(state, "replayed");
    if (state.physical.guardOwner != null) return rejected(state, "physical-guard-held");
    return accepted({
      ...state,
      physical: {
        ...state.physical,
        evidence: { attemptId: command.attemptId, observed: null, certificate: null },
        guardOwner: command.attemptId,
      },
    });
  }

  if (command.type === "observe") {
    if (!ownsRecoverableTransition(state, command.attemptId) || !ownsGuard(state, command.attemptId)) {
      return rejected(state, "physical-authority-required");
    }
    if (state.physical.evidence?.observed != null) return accepted(state, "replayed");
    return accepted({
      ...state,
      physical: {
        ...state.physical,
        evidence: {
          attemptId: command.attemptId,
          certificate: null,
          observed: { ...state.physical.generations },
        },
      },
    });
  }

  if (command.type === "retire") {
    if (!ownsRecoverableTransition(state, command.attemptId) || !ownsGuard(state, command.attemptId)) {
      return rejected(state, "physical-authority-required");
    }
    const evidence = state.physical.evidence;
    if (evidence?.attemptId !== command.attemptId || evidence.observed == null) {
      return rejected(state, "observation-required");
    }
    const generations = { ...state.physical.generations };
    let changed = false;
    for (const resource of resources) {
      if (generations[resource] === evidence.observed[resource] && generations[resource] != null) {
        generations[resource] = null;
        changed = true;
      }
    }
    return accepted({
      ...state,
      physical: {
        ...state.physical,
        epoch: state.physical.epoch + (changed ? 1 : 0),
        generations,
      },
    }, changed ? "applied" : "replayed");
  }

  if (command.type === "verify") {
    if (!ownsRecoverableTransition(state, command.attemptId) || !ownsGuard(state, command.attemptId)) {
      return rejected(state, "physical-authority-required");
    }
    const evidence = state.physical.evidence;
    if (evidence?.attemptId !== command.attemptId || evidence.observed == null) {
      return rejected(state, "observation-required");
    }
    if (resources.some((resource) => state.physical.generations[resource] != null)) {
      return rejected(state, "physical-survivor");
    }
    if (evidence.certificate != null) return accepted(state, "replayed");
    const transition = state.logical.transition!;
    const certificate: RetirementCertificate = {
      attemptId: command.attemptId,
      logicalFence: transition.phase === "stopped-sealed" ? transition.fence - 1 : transition.fence,
      physicalEpoch: state.physical.epoch,
      resourceSetId: state.physical.resourceSetId,
      retired: { ...evidence.observed },
    };
    return accepted({
      ...state,
      physical: { ...state.physical, evidence: { ...evidence, certificate } },
    });
  }

  if (command.type === "commit") {
    const transition = state.logical.transition;
    if (transition?.attemptId === command.attemptId && transition.phase === "stopped-sealed") {
      return accepted(state, "replayed");
    }
    if (!ownsReservedTransition(state, command.attemptId) || !ownsGuard(state, command.attemptId)) {
      return rejected(state, "commit-authority-required");
    }
    const certificate = state.physical.evidence?.certificate;
    if (
      certificate?.attemptId !== command.attemptId
      || certificate.logicalFence !== state.logical.fence
      || certificate.physicalEpoch !== state.physical.epoch
      || certificate.resourceSetId !== state.physical.resourceSetId
    ) {
      return rejected(state, "retirement-certificate-required");
    }
    const fence = state.logical.fence + 1;
    return accepted({
      ...state,
      logical: {
        attachments: [],
        fence,
        phase: "stopped",
        transition: { attemptId: command.attemptId, fence, phase: "stopped-sealed" },
      },
    });
  }

  if (command.type === "persist-handoff") {
    const transition = state.logical.transition;
    const certificate = state.physical.evidence?.certificate;
    if (state.handoff?.attemptId === command.attemptId) return accepted(state, "replayed");
    if (
      !ownsGuard(state, command.attemptId)
      || transition?.attemptId !== command.attemptId
      || transition.phase !== "stopped-sealed"
      || certificate?.attemptId !== command.attemptId
      || certificate.logicalFence + 1 !== transition.fence
    ) {
      return rejected(state, "sealed-retirement-required");
    }
    return accepted({ ...state, handoff: certificate });
  }

  if (command.type === "release-guard") {
    if (!ownsGuard(state, command.attemptId)) return rejected(state, "physical-guard-not-owned");
    return accepted({ ...state, physical: withoutPhysicalAuthority(state) });
  }

  if (command.type === "crash-owner") {
    if (!ownsGuard(state, command.attemptId)) return accepted(state, "replayed");
    return accepted({ ...state, physical: withoutPhysicalAuthority(state) });
  }

  if (command.type === "abort") {
    const transition = state.logical.transition;
    if (transition == null) return accepted(state, "replayed");
    if (transition.attemptId !== command.attemptId || transition.phase !== "reserved") {
      return rejected(state, "transition-not-releasable");
    }
    return accepted({
      ...state,
      logical: { ...state.logical, transition: null },
      physical: ownsGuard(state, command.attemptId) ? withoutPhysicalAuthority(state) : state.physical,
    });
  }

  if (command.type === "expire-transition") {
    const transition = state.logical.transition;
    if (transition == null) return accepted(state, "replayed");
    return accepted({
      ...state,
      logical: { ...state.logical, fence: state.logical.fence + 1, transition: null },
      physical: state.physical.guardOwner === transition.attemptId
        ? withoutPhysicalAuthority(state)
        : state.physical,
    });
  }

  if (state.physical.guardOwner != null) return rejected(state, "physical-guard-held");
  if (state.physical.generations[command.resource] === command.generation) return accepted(state, "replayed");
  return accepted({
    ...state,
    physical: {
      ...state.physical,
      epoch: state.physical.epoch + 1,
      evidence: null,
      generations: { ...state.physical.generations, [command.resource]: command.generation },
    },
  });
}

export function assertGuardedRetirementInvariants(state: GuardedRetirementState): void {
  const transition = state.logical.transition;
  if (state.logical.phase === "stopped" && state.logical.attachments.length !== 0) {
    throw new Error("stopped logical instance retained attachments");
  }
  if (transition?.phase === "stopped-sealed") {
    if (state.logical.phase !== "stopped" || transition.fence !== state.logical.fence) {
      throw new Error("sealed transition is not the current stopped fence");
    }
  }
  const evidence = state.physical.evidence;
  if ((state.physical.guardOwner == null) !== (evidence == null)) {
    throw new Error("physical evidence escaped its guard");
  }
  if (evidence != null && evidence.attemptId !== state.physical.guardOwner) {
    throw new Error("physical evidence belongs to another attempt");
  }
  if (evidence?.certificate != null) {
    if (
      evidence.observed == null
      || evidence.certificate.attemptId !== evidence.attemptId
      || evidence.certificate.resourceSetId !== state.physical.resourceSetId
      || evidence.certificate.physicalEpoch !== state.physical.epoch
      || resources.some((resource) => state.physical.generations[resource] != null)
    ) {
      throw new Error("retirement certificate does not prove the guarded physical epoch");
    }
  }
  if (state.handoff != null) {
    if (
      state.logical.phase !== "stopped"
      || state.handoff.resourceSetId !== state.physical.resourceSetId
      || (transition != null && (
        transition.phase !== "stopped-sealed"
        || transition.attemptId !== state.handoff.attemptId
        || transition.fence !== state.handoff.logicalFence + 1
      ))
    ) {
      throw new Error("installer handoff lacks a matching sealed retirement");
    }
  }
}

export function canonicalModelState(state: GuardedRetirementState): string {
  return JSON.stringify(state);
}
