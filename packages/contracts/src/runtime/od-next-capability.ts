import { z } from 'zod';

import {
  NormalizedAgentObservationV1Schema,
  type NormalizedAgentObservationV1,
  type NormalizedAgentObservationStatusV1,
} from '../observability/normalized-agent-observation-v1.js';
import { CapabilitySupportV2Schema } from '../plugins/strategy-v2.js';

export const OD_NEXT_RUNTIME_FIXTURE_MANIFEST_V1_SCHEMA =
  'open-design.od-next-runtime-fixture-manifest/v1' as const;
export const OD_NEXT_RUNTIME_CAPABILITY_EVIDENCE_V1_SCHEMA =
  'open-design.od-next-runtime-capability-evidence/v1' as const;
export const OD_NEXT_RUNTIME_CAPABILITY_SNAPSHOT_V1_SCHEMA =
  'open-design.od-next-runtime-capability-snapshot/v1' as const;

const nonEmptyStringSchema = z.string().trim().min(1);
const sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const runtimePathSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export const RuntimeObservationEvidenceLevelV1Schema = z.enum([
  'L0',
  'L1',
  'L2',
  'L3',
]);
export type RuntimeObservationEvidenceLevelV1 = z.infer<
  typeof RuntimeObservationEvidenceLevelV1Schema
>;

export const RuntimeCapabilityFixtureCaseIdV1Schema = z.enum([
  'main_run',
  'tool',
  'child_success',
  'child_failure_parent_recovers',
  'cancel',
  'timeout',
  'resume',
]);
export type RuntimeCapabilityFixtureCaseIdV1 = z.infer<
  typeof RuntimeCapabilityFixtureCaseIdV1Schema
>;

export const OD_NEXT_RUNTIME_REQUIRED_FIXTURE_CASES_V1 = [
  'main_run',
  'tool',
  'child_success',
  'child_failure_parent_recovers',
  'cancel',
  'timeout',
  'resume',
] as const satisfies readonly RuntimeCapabilityFixtureCaseIdV1[];

const expectedEvidenceByCase = {
  main_run: 'L0',
  tool: 'L1',
  child_success: 'L2',
  child_failure_parent_recovers: 'L2',
  cancel: 'L0',
  timeout: 'L0',
  resume: 'L0',
} as const satisfies Record<
  RuntimeCapabilityFixtureCaseIdV1,
  RuntimeObservationEvidenceLevelV1
>;

export const RuntimeCapabilityFixtureCaseV1Schema = z.object({
  id: RuntimeCapabilityFixtureCaseIdV1Schema,
  expectedMinimumEvidence: RuntimeObservationEvidenceLevelV1Schema,
}).strict().superRefine((fixtureCase, context) => {
  const expected = expectedEvidenceByCase[fixtureCase.id];
  if (fixtureCase.expectedMinimumEvidence !== expected) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expectedMinimumEvidence'],
      message: `${fixtureCase.id} must require ${expected} evidence.`,
    });
  }
});
export type RuntimeCapabilityFixtureCaseV1 = z.infer<
  typeof RuntimeCapabilityFixtureCaseV1Schema
>;

export const RuntimeFixtureProvenanceV1Schema = z.union([
  z.object({
    kind: z.literal('contract_only'),
    reason: z.literal('x1_runtime_fixture_missing'),
  }).strict(),
  z.object({
    kind: z.literal('test_synthetic'),
    reason: nonEmptyStringSchema,
  }).strict(),
  z.object({
    kind: z.literal('sanitized_real'),
    recordingDigest: sha256Schema,
    anonymizationVersion: nonEmptyStringSchema,
    evidenceReview: z.literal('open_design_best_effort').optional(),
    /** @deprecated Older manifests may carry this review note. */
    runtimeOwnerAttestation: nonEmptyStringSchema.optional(),
  }).strict().superRefine((provenance, context) => {
    if (!provenance.evidenceReview && !provenance.runtimeOwnerAttestation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['evidenceReview'],
        message: 'Sanitized real fixtures require an Open Design evidence review.',
      });
    }
  }),
]);
export type RuntimeFixtureProvenanceV1 = z.infer<
  typeof RuntimeFixtureProvenanceV1Schema
>;

export const RuntimeCapabilityFixtureManifestV1Schema = z.object({
  schema: z.literal(OD_NEXT_RUNTIME_FIXTURE_MANIFEST_V1_SCHEMA),
  fixtureVersion: nonEmptyStringSchema,
  runtimePath: runtimePathSchema,
  agentId: nonEmptyStringSchema,
  agentCliVersion: nonEmptyStringSchema.optional(),
  runtimeAdapterVersion: nonEmptyStringSchema,
  runtimeCompanionName: nonEmptyStringSchema.optional(),
  runtimeCompanionVersion: nonEmptyStringSchema.optional(),
  provenance: RuntimeFixtureProvenanceV1Schema,
  containsSensitiveContent: z.literal(false),
  cases: z.array(RuntimeCapabilityFixtureCaseV1Schema),
}).strict().superRefine((manifest, context) => {
  const ids = manifest.cases.map((fixtureCase) => fixtureCase.id);
  for (const required of OD_NEXT_RUNTIME_REQUIRED_FIXTURE_CASES_V1) {
    if (!ids.includes(required)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cases'],
        message: `Fixture manifest is missing required case ${required}.`,
      });
    }
  }
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cases'],
      message: 'Fixture manifest case ids must be unique.',
    });
  }
  if (manifest.provenance.kind === 'sanitized_real' && !manifest.agentCliVersion) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['agentCliVersion'],
      message: 'Sanitized real fixtures require the exact recorded Agent CLI version.',
    });
  }
  if (
    manifest.runtimeCompanionVersion !== undefined &&
    manifest.runtimeCompanionName === undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['runtimeCompanionName'],
      message: 'A runtime companion version requires its companion name.',
    });
  }
});
export type RuntimeCapabilityFixtureManifestV1 = z.infer<
  typeof RuntimeCapabilityFixtureManifestV1Schema
>;

export const RuntimeFixtureCaseResultV1Schema = z.object({
  id: RuntimeCapabilityFixtureCaseIdV1Schema,
  outcome: z.enum(['passed', 'failed', 'unavailable']),
}).strict();
export type RuntimeFixtureCaseResultV1 = z.infer<
  typeof RuntimeFixtureCaseResultV1Schema
>;

function caseOutcome(
  results: readonly RuntimeFixtureCaseResultV1[],
  id: RuntimeCapabilityFixtureCaseIdV1,
): RuntimeFixtureCaseResultV1['outcome'] | undefined {
  return results.find((result) => result.id === id)?.outcome;
}

export const RuntimeCapabilityEvidenceV1Schema = z.object({
  schema: z.literal(OD_NEXT_RUNTIME_CAPABILITY_EVIDENCE_V1_SCHEMA),
  source: z.enum(['fixture_replay', 'runtime_advertisement', 'test_synthetic']),
  nativeSessionContinuation: z.object({
    support: CapabilitySupportV2Schema,
    evidenceLevel: RuntimeObservationEvidenceLevelV1Schema,
  }).strict(),
  nativeSubagents: z.object({
    support: CapabilitySupportV2Schema,
    evidenceLevel: RuntimeObservationEvidenceLevelV1Schema,
  }).strict(),
  caseResults: z.array(RuntimeFixtureCaseResultV1Schema),
}).strict().superRefine((evidence, context) => {
  const ids = evidence.caseResults.map((result) => result.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['caseResults'],
      message: 'Fixture replay case ids must be unique.',
    });
  }
  if (evidence.source === 'fixture_replay') {
    for (const required of OD_NEXT_RUNTIME_REQUIRED_FIXTURE_CASES_V1) {
      if (!ids.includes(required)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['caseResults'],
          message: `Fixture replay is missing required case ${required}.`,
        });
      }
    }
  }
  if (
    (evidence.nativeSessionContinuation.support === 'verified' ||
      evidence.nativeSubagents.support === 'verified') &&
    evidence.source !== 'fixture_replay'
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['source'],
      message: 'Verified capabilities require fixture replay evidence.',
    });
  }
  if (evidence.nativeSessionContinuation.support === 'verified') {
    for (const required of ['main_run', 'cancel', 'timeout', 'resume'] as const) {
      if (caseOutcome(evidence.caseResults, required) !== 'passed') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['caseResults'],
          message: `Verified native continuation requires a passed ${required} case.`,
        });
      }
    }
  }
  if (evidence.nativeSessionContinuation.support === 'unsupported') {
    if (
      evidence.source !== 'fixture_replay' ||
      caseOutcome(evidence.caseResults, 'resume') !== 'failed'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nativeSessionContinuation', 'support'],
        message: 'Unsupported native continuation requires a failed resume fixture replay.',
      });
    }
  }
  if (evidence.nativeSubagents.support === 'verified') {
    if (
      evidence.nativeSubagents.evidenceLevel !== 'L2' &&
      evidence.nativeSubagents.evidenceLevel !== 'L3'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nativeSubagents', 'evidenceLevel'],
        message: 'Verified native Subagents require L2 or L3 structured child evidence.',
      });
    }
    for (const required of [
      'child_success',
      'child_failure_parent_recovers',
      'cancel',
      'timeout',
    ] as const) {
      if (caseOutcome(evidence.caseResults, required) !== 'passed') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['caseResults'],
          message: `Verified native Subagents require a passed ${required} case.`,
        });
      }
    }
  }
  if (evidence.nativeSubagents.support === 'unsupported') {
    if (
      evidence.source !== 'fixture_replay' ||
      caseOutcome(evidence.caseResults, 'child_success') !== 'failed'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nativeSubagents', 'support'],
        message: 'Unsupported native Subagents require a failed child fixture replay.',
      });
    }
  }
});
export type RuntimeCapabilityEvidenceV1 = z.infer<
  typeof RuntimeCapabilityEvidenceV1Schema
>;

export const RuntimeCapabilityRegistryEntryV1Schema = z.object({
  runtimePath: runtimePathSchema,
  agentId: nonEmptyStringSchema,
  /** Exact CLI version that produced the reviewed fixture; not an admission pin. */
  recordedAgentCliVersion: nonEmptyStringSchema,
  runtimeAdapterVersion: nonEmptyStringSchema,
  recordedRuntimeCompanionName: nonEmptyStringSchema.optional(),
  recordedRuntimeCompanionVersion: nonEmptyStringSchema.optional(),
  fixtureVersion: nonEmptyStringSchema,
  fixtureHash: sha256Schema,
  evidence: RuntimeCapabilityEvidenceV1Schema,
}).strict().superRefine((entry, context) => {
  if (
    entry.recordedRuntimeCompanionVersion !== undefined &&
    entry.recordedRuntimeCompanionName === undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recordedRuntimeCompanionName'],
      message: 'A recorded runtime companion version requires its companion name.',
    });
  }
});
export type RuntimeCapabilityRegistryEntryV1 = z.infer<
  typeof RuntimeCapabilityRegistryEntryV1Schema
>;

export const RuntimeCapabilitySnapshotSourceV1Schema = z.enum([
  'sanitized_fixture_replay',
  'runtime_advertisement',
  'test_synthetic',
  'unverified',
]);
export type RuntimeCapabilitySnapshotSourceV1 = z.infer<
  typeof RuntimeCapabilitySnapshotSourceV1Schema
>;

const snapshotCapabilitySchema = z.object({
  support: CapabilitySupportV2Schema,
  evidenceLevel: RuntimeObservationEvidenceLevelV1Schema,
  source: RuntimeCapabilitySnapshotSourceV1Schema,
}).strict();

export const OdNextRuntimeCapabilitySnapshotV1Schema = z.object({
  schema: z.literal(OD_NEXT_RUNTIME_CAPABILITY_SNAPSHOT_V1_SCHEMA),
  runtimePath: runtimePathSchema,
  agentId: nonEmptyStringSchema,
  /** Current probe output. Optional diagnostic metadata, never an admission pin. */
  agentCliVersion: nonEmptyStringSchema.optional(),
  runtimeAdapterVersion: nonEmptyStringSchema,
  runtimeCompanionName: nonEmptyStringSchema.optional(),
  runtimeCompanionVersion: nonEmptyStringSchema.optional(),
  /** Exact versions captured by the fixture that backs the capability assertion. */
  recordedAgentCliVersion: nonEmptyStringSchema.optional(),
  recordedRuntimeCompanionName: nonEmptyStringSchema.optional(),
  recordedRuntimeCompanionVersion: nonEmptyStringSchema.optional(),
  fixtureVersion: nonEmptyStringSchema,
  fixtureHash: sha256Schema.optional(),
  nativeSessionContinuation: snapshotCapabilitySchema,
  nativeSubagents: snapshotCapabilitySchema,
  capturedAt: z.number().int().nonnegative(),
  snapshotHash: sha256Schema,
}).strict().superRefine((snapshot, context) => {
  const hasFixtureBackedAssertion = [
    snapshot.nativeSessionContinuation.support,
    snapshot.nativeSubagents.support,
  ].some((support) => support === 'verified' || support === 'unsupported');
  if (hasFixtureBackedAssertion && !snapshot.recordedAgentCliVersion) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recordedAgentCliVersion'],
      message: 'Verified or unsupported capability snapshots require the exact recorded Agent CLI version.',
    });
  }
  if (hasFixtureBackedAssertion && !snapshot.fixtureHash) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fixtureHash'],
      message: 'Verified or unsupported capability snapshots require the exact Fixture hash.',
    });
  }
  if (
    snapshot.recordedRuntimeCompanionVersion !== undefined &&
    snapshot.recordedRuntimeCompanionName === undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['recordedRuntimeCompanionName'],
      message: 'A recorded runtime companion version requires its companion name.',
    });
  }
  for (const [key, capability] of [
    ['nativeSessionContinuation', snapshot.nativeSessionContinuation],
    ['nativeSubagents', snapshot.nativeSubagents],
  ] as const) {
    if (
      (capability.support === 'verified' || capability.support === 'unsupported') &&
      capability.source !== 'sanitized_fixture_replay'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key, 'source'],
        message: 'Verified or unsupported capability snapshots require sanitized real fixture replay.',
      });
    }
  }
  if (
    snapshot.nativeSubagents.support === 'verified' &&
    snapshot.nativeSubagents.evidenceLevel !== 'L2' &&
    snapshot.nativeSubagents.evidenceLevel !== 'L3'
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['nativeSubagents', 'evidenceLevel'],
      message: 'Verified native Subagents require L2 or L3 evidence.',
    });
  }
});
export type OdNextRuntimeCapabilitySnapshotV1 = z.infer<
  typeof OdNextRuntimeCapabilitySnapshotV1Schema
>;

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

export interface RuntimeFixtureCaseEvaluationV1 {
  id: RuntimeCapabilityFixtureCaseIdV1;
  outcome: 'passed' | 'failed';
  graph: RuntimeEvidenceGraphEvaluationV1;
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

function hasLifecycle(
  observations: readonly NormalizedAgentObservationV1[],
  observationId: string,
  terminal: NormalizedAgentObservationStatusV1,
): boolean {
  const sequence = observations.filter((observation) => (
    observation.identity.observationId === observationId
  ));
  return sequence.some((observation) => observation.status === 'running') &&
    sequence.some((observation) => observation.status === terminal);
}

/**
 * Validate one provider-neutral fixture case after an adapter has normalized
 * it. The replay remains offline; adapter-specific raw-event checks belong to
 * the runtime units that consume this shared case contract.
 */
export function evaluateRuntimeFixtureCaseV1(
  id: RuntimeCapabilityFixtureCaseIdV1,
  input: readonly unknown[],
): RuntimeFixtureCaseEvaluationV1 {
  const graph = evaluateRuntimeEvidenceGraphV1(input);
  const indexedObservations = input.flatMap((value, index) => {
    const parsed = NormalizedAgentObservationV1Schema.safeParse(value);
    return parsed.success ? [{ index, observation: parsed.data }] : [];
  });
  const observations = indexedObservations.map(({ observation }) => observation);
  const taskRuns = observations.filter((observation) => observation.kind === 'task_run');
  const children = observations.filter((observation) => observation.kind === 'child_agent');
  let passed = false;

  if (id === 'main_run') {
    passed = taskRuns.some((run) => (
      terminalStatuses.has(run.status) &&
      hasLifecycle(observations, run.identity.observationId, run.status)
    ));
  } else if (id === 'tool') {
    passed = observations.some((observation) => (
      observation.kind === 'tool' &&
      observation.identity.parentObservationId !== undefined
    ));
  } else if (id === 'child_success') {
    passed = children.some((child) => (
      child.status === 'completed' &&
      hasLifecycle(observations, child.identity.observationId, 'completed')
    ));
  } else if (id === 'child_failure_parent_recovers') {
    passed = indexedObservations.some(({ index: failedAt, observation: child }) => {
      if (child.kind !== 'child_agent' || child.status !== 'failed') return false;
      const childStartedBeforeFailure = indexedObservations.some(({ index, observation }) => (
        index < failedAt &&
        observation.identity.observationId === child.identity.observationId &&
        observation.status === 'running'
      ));
      const parentId = child.identity.parentObservationId;
      if (!childStartedBeforeFailure || parentId === undefined) return false;
      const firstParentTerminal = indexedObservations.find(({ observation: parent }) => (
        parent.identity.observationId === parentId &&
        terminalStatuses.has(parent.status)
      ));
      return firstParentTerminal !== undefined &&
        firstParentTerminal.index > failedAt &&
        firstParentTerminal.observation.status === 'completed';
    });
  } else if (id === 'cancel') {
    passed = taskRuns.some((run) => (
      run.status === 'canceled' &&
      hasLifecycle(observations, run.identity.observationId, 'canceled')
    ));
  } else if (id === 'timeout') {
    passed = taskRuns.some((run) => (
      run.status === 'failed' &&
      hasLifecycle(observations, run.identity.observationId, 'failed') &&
      run.attributes?.terminationReason === 'timeout'
    ));
  } else if (id === 'resume') {
    const resumed = indexedObservations.filter(({ observation }) => (
      observation.kind === 'task_run' &&
      observation.attributes?.nativeSessionResume === true
    ));
    passed = resumed.some(({ index: resumedAt, observation: resumedRun }) => (
      indexedObservations.some(({ index, observation: priorRun }) => (
        index < resumedAt &&
        priorRun.kind === 'task_run' &&
        priorRun.identity.runId !== resumedRun.identity.runId &&
        priorRun.identity.taskExecutionId === resumedRun.identity.taskExecutionId &&
        priorRun.identity.taskRunIndex < resumedRun.identity.taskRunIndex &&
        priorRun.identity.runtimeSessionId !== undefined &&
        priorRun.identity.runtimeSessionId === resumedRun.identity.runtimeSessionId
      ))
    ));
  }

  return {
    id,
    outcome: graph.valid && passed ? 'passed' : 'failed',
    graph,
  };
}
