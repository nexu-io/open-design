import {
  NormalizedAgentObservationV1Schema,
  type NormalizedAgentObservationV1,
  type NormalizedAgentObservationStatusV1,
} from './normalized-agent-observation-v1.js';

/** Describes native observation completeness; never an execution prerequisite. */
export type RuntimeObservationEvidenceLevelV1 = 'L0' | 'L1' | 'L2' | 'L3';

export type RuntimeEvidenceGraphIssueCodeV1 =
  | 'invalid_observation'
  | 'missing_task_run'
  | 'observation_identity_changed'
  | 'observation_kind_changed'
  | 'child_parent_missing'
  | 'task_run_not_root'
  | 'parent_missing'
  | 'parent_identity_changed'
  | 'cross_run_parent'
  | 'parent_cycle'
  | 'status_regression'
  | 'terminal_status_changed'
  | 'child_started_missing'
  | 'child_terminal_missing'
  | 'turn_owner_missing'
  | 'turn_owner_mismatch'
  | 'turn_counted_more_than_once'
  | 'turn_excluded_copy_missing'
  | 'turn_owner_kind_invalid'
  | 'turn_owner_usage_not_independent'
  | 'turn_group_not_closed'
  | 'turn_child_group_count_invalid';

export interface RuntimeEvidenceGraphIssueV1 {
  code: RuntimeEvidenceGraphIssueCodeV1;
  observationId?: string;
  detail?: string;
}

export interface RuntimeEvidenceGraphEvaluationV1 {
  valid: boolean;
  evidenceLevel: RuntimeObservationEvidenceLevelV1;
  issues: RuntimeEvidenceGraphIssueV1[];
  childObservationIds: string[];
  countedTurnIds: string[];
}

const terminalStatuses = new Set<NormalizedAgentObservationStatusV1>([
  'completed',
  'failed',
  'canceled',
]);

function statusOrder(status: NormalizedAgentObservationStatusV1): number {
  if (status === 'queued') return 0;
  if (status === 'running') return 1;
  if (terminalStatuses.has(status)) return 2;
  return -1;
}

function sameRun(
  left: NormalizedAgentObservationV1,
  right: NormalizedAgentObservationV1,
): boolean {
  return left.identity.taskExecutionId === right.identity.taskExecutionId &&
    left.identity.runId === right.identity.runId &&
    left.identity.taskRunIndex === right.identity.taskRunIndex;
}

/**
 * Evaluate normalized replay events without consulting a provider or parser.
 * Input order is replay order and therefore owns lifecycle monotonicity.
 */
export function evaluateRuntimeEvidenceGraphV1(
  input: readonly unknown[],
): RuntimeEvidenceGraphEvaluationV1 {
  const issues: RuntimeEvidenceGraphIssueV1[] = [];
  const observations: NormalizedAgentObservationV1[] = [];
  for (const value of input) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const raw = value as {
        kind?: unknown;
        identity?: { observationId?: unknown; parentObservationId?: unknown };
      };
      const observationId = typeof raw.identity?.observationId === 'string'
        ? raw.identity.observationId
        : undefined;
      if (raw.kind === 'child_agent' && raw.identity?.parentObservationId === undefined) {
        issues.push({
          code: 'child_parent_missing',
          ...(observationId ? { observationId } : {}),
        });
      }
      if (raw.kind !== 'task_run' && raw.identity?.parentObservationId === undefined) {
        issues.push({
          code: 'parent_missing',
          ...(observationId ? { observationId } : {}),
        });
      }
      if (raw.kind === 'task_run' && raw.identity?.parentObservationId !== undefined) {
        issues.push({
          code: 'task_run_not_root',
          ...(observationId ? { observationId } : {}),
        });
      }
    }
    const parsed = NormalizedAgentObservationV1Schema.safeParse(value);
    if (!parsed.success) {
      issues.push({ code: 'invalid_observation', detail: parsed.error.message });
      continue;
    }
    observations.push(parsed.data);
  }

  const byId = new Map<string, NormalizedAgentObservationV1[]>();
  for (const observation of observations) {
    const id = observation.identity.observationId;
    const sequence = byId.get(id) ?? [];
    sequence.push(observation);
    byId.set(id, sequence);
  }

  if (!observations.some((observation) => observation.kind === 'task_run')) {
    issues.push({ code: 'missing_task_run' });
  }

  const parentById = new Map<string, string>();
  for (const [id, sequence] of byId) {
    const first = sequence[0];
    if (!first) continue;
    if (!sequence.every((observation) => sameRun(observation, first))) {
      issues.push({ code: 'observation_identity_changed', observationId: id });
    }
    if (!sequence.every((observation) => observation.kind === first.kind)) {
      issues.push({ code: 'observation_kind_changed', observationId: id });
    }
    const parentIds = new Set(
      sequence.map((observation) => observation.identity.parentObservationId ?? '<root>'),
    );
    if (parentIds.size > 1) {
      issues.push({ code: 'parent_identity_changed', observationId: id });
      continue;
    }
    const parentId = [...parentIds][0];
    if (!parentId || parentId === '<root>') continue;
    parentById.set(id, parentId);
    const parent = byId.get(parentId)?.[0];
    if (!parent) {
      issues.push({ code: 'parent_missing', observationId: id, detail: parentId });
    } else if (!sequence.every((observation) => sameRun(observation, parent))) {
      issues.push({ code: 'cross_run_parent', observationId: id, detail: parentId });
    }
  }

  for (const id of byId.keys()) {
    const seen = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined) {
      if (seen.has(current)) {
        issues.push({ code: 'parent_cycle', observationId: id });
        break;
      }
      seen.add(current);
      current = parentById.get(current);
    }
  }

  for (const [id, sequence] of byId) {
    for (let index = 1; index < sequence.length; index += 1) {
      const previous = sequence[index - 1]?.status;
      const current = sequence[index]?.status;
      if (!previous || !current) continue;
      if (terminalStatuses.has(previous) && current !== previous) {
        issues.push({ code: 'terminal_status_changed', observationId: id });
      } else if (statusOrder(current) < statusOrder(previous)) {
        issues.push({ code: 'status_regression', observationId: id });
      }
    }
  }

  const childObservationIds: string[] = [];
  for (const [id, sequence] of byId) {
    if (!sequence.some((observation) => observation.kind === 'child_agent')) continue;
    childObservationIds.push(id);
    if (!sequence.some((observation) => observation.status === 'running')) {
      issues.push({ code: 'child_started_missing', observationId: id });
    }
    if (!sequence.some((observation) => terminalStatuses.has(observation.status))) {
      issues.push({ code: 'child_terminal_missing', observationId: id });
    }
  }

  const turnGroups = new Map<string, NormalizedAgentObservationV1[]>();
  for (const observation of observations) {
    const accounting = observation.turnAccounting;
    if (!accounting) continue;
    const runScopedTurnId = [
      observation.identity.taskExecutionId,
      observation.identity.runId,
      observation.identity.taskRunIndex,
      accounting.turnId,
    ].join('\u0000');
    const sequence = turnGroups.get(runScopedTurnId) ?? [];
    sequence.push(observation);
    turnGroups.set(runScopedTurnId, sequence);
  }
  const closedTurnGroups: Array<{
    childObservationId: string;
    countedTurnId: string;
  }> = [];
  for (const [runScopedTurnId, sequence] of turnGroups) {
    const turnId = sequence[0]?.turnAccounting?.turnId ?? runScopedTurnId;
    const ownerEvents = sequence.filter((observation) => (
      observation.turnAccounting?.disposition === 'owner'
    ));
    if (ownerEvents.length === 0) {
      issues.push({ code: 'turn_owner_missing', detail: turnId });
      continue;
    }
    if (ownerEvents.length > 1) {
      issues.push({ code: 'turn_counted_more_than_once', detail: turnId });
      continue;
    }
    const owner = ownerEvents[0];
    if (!owner) continue;
    const ownerId = owner.identity.observationId;
    let groupValid = true;
    for (const observation of sequence) {
      if (observation.turnAccounting?.ownerObservationId !== ownerId) {
        issues.push({
          code: 'turn_owner_mismatch',
          observationId: observation.identity.observationId,
          detail: turnId,
        });
        groupValid = false;
      }
    }
    if (!sequence.some((observation) => (
      observation.turnAccounting?.disposition === 'exclude_inherited'
    ))) {
      issues.push({ code: 'turn_excluded_copy_missing', detail: turnId });
      groupValid = false;
    }
    if (owner.kind !== 'child_agent' && owner.kind !== 'model_call') {
      issues.push({
        code: 'turn_owner_kind_invalid',
        observationId: ownerId,
        detail: turnId,
      });
      groupValid = false;
    }
    if (
      owner.usage.availability === 'unavailable' ||
      owner.usage.accountingMode !== 'additive'
    ) {
      issues.push({
        code: 'turn_owner_usage_not_independent',
        observationId: ownerId,
        detail: turnId,
      });
      groupValid = false;
    }

    let childObservationId: string | undefined;
    if (owner.kind === 'child_agent') {
      childObservationId = ownerId;
    } else if (owner.kind === 'model_call') {
      const parentId = owner.identity.parentObservationId;
      if (parentId && byId.get(parentId)?.[0]?.kind === 'child_agent') {
        childObservationId = parentId;
      }
    }
    const groupIsClosed = childObservationId !== undefined &&
      sequence.some((observation) => (
        observation.kind === 'child_agent' &&
        observation.identity.observationId === childObservationId
      )) &&
      sequence.some((observation) => (
        observation.kind === 'model_call' &&
        observation.identity.parentObservationId === childObservationId
      )) &&
      sequence.every((observation) => (
        (
          observation.kind === 'child_agent' &&
          observation.identity.observationId === childObservationId
        ) || (
          observation.kind === 'model_call' &&
          observation.identity.parentObservationId === childObservationId
        )
      ));
    if (!groupIsClosed || !childObservationId) {
      issues.push({ code: 'turn_group_not_closed', detail: turnId });
      groupValid = false;
    }
    if (groupValid && childObservationId) {
      const ownerIdentity = owner.identity;
      closedTurnGroups.push({
        childObservationId,
        countedTurnId:
          `${ownerIdentity.taskExecutionId}/${ownerIdentity.runId}/` +
          `${ownerIdentity.taskRunIndex}/${turnId}`,
      });
    }
  }

  const closedTurnGroupCountByChild = new Map<string, number>();
  for (const group of closedTurnGroups) {
    closedTurnGroupCountByChild.set(
      group.childObservationId,
      (closedTurnGroupCountByChild.get(group.childObservationId) ?? 0) + 1,
    );
  }
  for (const [childObservationId, count] of closedTurnGroupCountByChild) {
    if (count > 1) {
      issues.push({
        code: 'turn_child_group_count_invalid',
        observationId: childObservationId,
        detail: String(count),
      });
    }
  }
  const closedCountedTurnIds = closedTurnGroups
    .filter((group) => closedTurnGroupCountByChild.get(group.childObservationId) === 1)
    .map((group) => group.countedTurnId);
  const hasTurnIssue = issues.some((issue) => issue.code.startsWith('turn_'));

  let evidenceLevel: RuntimeObservationEvidenceLevelV1 = 'L0';
  if (observations.some((observation) => (
    observation.kind === 'tool' || observation.kind === 'model_call'
  ))) {
    evidenceLevel = 'L1';
  }
  const childIssueCodes = new Set<RuntimeEvidenceGraphIssueCodeV1>([
    'invalid_observation',
    'missing_task_run',
    'observation_identity_changed',
    'observation_kind_changed',
    'child_parent_missing',
    'task_run_not_root',
    'parent_missing',
    'parent_identity_changed',
    'cross_run_parent',
    'parent_cycle',
    'status_regression',
    'terminal_status_changed',
    'child_started_missing',
    'child_terminal_missing',
  ]);
  const hasValidChildLifecycle = childObservationIds.length > 0 &&
    !issues.some((issue) => childIssueCodes.has(issue.code));
  if (hasValidChildLifecycle) evidenceLevel = 'L2';

  if (hasValidChildLifecycle) {
    const fullyAccounted = childObservationIds.every((childId) => {
      const sequence = byId.get(childId) ?? [];
      const terminal = [...sequence]
        .reverse()
        .find((observation) => terminalStatuses.has(observation.status));
      if (!terminal) return false;
      const promptObserved = terminal.prompt.childInjected.availability === 'exact' ||
        terminal.prompt.childInjected.availability === 'partial';
      const hasModelCall = observations.some((observation) => (
        observation.kind === 'model_call' &&
        observation.identity.parentObservationId === childId
      ));
      return promptObserved &&
        terminal.usage.availability !== 'unavailable' &&
        terminal.timing.availability !== 'unavailable' &&
        hasModelCall;
    });
    if (
      fullyAccounted &&
      !hasTurnIssue &&
      closedCountedTurnIds.length === childObservationIds.length &&
      childObservationIds.every((childId) => (
        closedTurnGroupCountByChild.get(childId) === 1
      ))
    ) {
      evidenceLevel = 'L3';
    }
  }

  return {
    valid: issues.length === 0,
    evidenceLevel,
    issues,
    childObservationIds: childObservationIds.sort(),
    countedTurnIds: evidenceLevel === 'L3' ? closedCountedTurnIds.sort() : [],
  };
}
