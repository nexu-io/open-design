import { z } from 'zod';

export const OD_NEXT_STRATEGY_ID = 'od-next-strategy' as const;
export const OD_NEXT_PROMPT_RECIPE_ID = 'od-next-plan-build-v2' as const;
export const OD_NEXT_APPLIED_STRATEGY_SCHEMA = 'open-design.applied-strategy/v2' as const;
export const OD_NEXT_PLAN_CONTRACT_SCHEMA = 'open-design.plan-contract/v2' as const;
export const OD_NEXT_RUNTIME_STATE_SCHEMA = 'open-design.strategy-state/v2' as const;
export const OD_NEXT_PLAN_CONTRACT_BLOCK = 'open-design-plan-contract' as const;
export const OD_NEXT_RUNTIME_STATE_BLOCK = 'open-design-runtime-state' as const;
export const OD_NEXT_BUNDLED_STRATEGY_SCHEMA = 'open-design.bundled-strategy/v2' as const;

/**
 * The reason a task carries when the agent itself declared the turn blocked and
 * raised no machine code of its own.
 *
 * Shared because it is the one blocked verdict whose visible text can be taken
 * as the explanation. Every other block is a gate the agent did not ask for —
 * a missing Runtime State, an unresolvable deliverable, an unproven session —
 * and the prose sitting next to it is the agent's ordinary reply, not an
 * account of the stop. Reading the code, rather than the presence of text,
 * keeps those two apart.
 */
export const OD_NEXT_AGENT_DECLARED_BLOCK_REASON = 'od_next_agent_declared_block' as const;

export const StrategyTaskTypeV2Schema = z.enum([
  'prototype',
  'ppt',
  'marketing',
  'hyperframes',
  'generic',
]);
export type StrategyTaskTypeV2 = z.infer<typeof StrategyTaskTypeV2Schema>;

export const StrategyInputStageV2Schema = z.enum([
  'request',
  'clarification',
  'contract_repair',
  'production',
]);
export type StrategyInputStageV2 = z.infer<typeof StrategyInputStageV2Schema>;

export const StrategyRouteV2Schema = z.enum(['direct_edit', 'full_plan']);
export type StrategyRouteV2 = z.infer<typeof StrategyRouteV2Schema>;

export const StrategyExecutionModeV2Schema = z.enum(['simple', 'complex']);
export type StrategyExecutionModeV2 = z.infer<typeof StrategyExecutionModeV2Schema>;

// `completed` means orchestration ended; physical Run status owns success/failure.
export const StrategyOutcomeV2Schema = z.enum([
  'clarification_required',
  'plan_ready',
  'completed',
  'blocked',
  'canceled',
]);
export type StrategyOutcomeV2 = z.infer<typeof StrategyOutcomeV2Schema>;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const relativeAssetPathSchema = z.string().min(1).refine(
  (path) => path.startsWith('./') && !path.includes('..'),
  { message: 'Strategy asset paths must be plugin-relative and may not traverse upward.' },
);

const forbiddenStrategyKeys = new Set([
  'acceptance',
  'acceptanceChecklist',
  'artifactRepair',
  'candidateEvidenceBundle',
  'completionGate',
  'critique',
  'evidencePlan',
  'finalEvidenceBundle',
  'judge',
  'judgeReport',
  'needs_repair',
  'qualityGate',
  'qualityScore',
  'repairAttempts',
  'repairPerformed',
  'repairRequired',
  'repaired_unverified',
  'repeat',
  'revalidation',
]);

function findForbiddenStrategyKey(
  value: unknown,
  path: Array<string | number> = [],
): { key: string; path: Array<string | number> } | undefined {
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      const found = findForbiddenStrategyKey(child, [...path, index]);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenStrategyKeys.has(key)) return { key, path: [...path, key] };
    const found = findForbiddenStrategyKey(child, [...path, key]);
    if (found) return found;
  }
  return undefined;
}

function rejectForbiddenStrategySemantics(
  value: unknown,
  context: z.RefinementCtx,
): void {
  const found = findForbiddenStrategyKey(value);
  if (!found) return;
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: found.path,
    message: `OD Next V2 does not allow post-Build field "${found.key}".`,
  });
}

const StrategyAssetDeclarationV2Schema = z.object({
  path: relativeAssetPathSchema,
  version: z.string().min(1),
}).strict();

const StrategyTaskProfileAssetDeclarationV2Schema = StrategyAssetDeclarationV2Schema.extend({
  taskType: StrategyTaskTypeV2Schema.exclude(['generic']),
  rollout: z.enum(['active', 'reserved']),
  projectKinds: z.array(z.string().min(1)).min(1),
  /**
   * Non-prompt files the task profile ships alongside its rule card — for
   * example the handheld device shells the prototype profile stages into the
   * project directory. They enter the package identity with the profile that
   * declares them, so a shell edit changes the package hash exactly like a
   * rule-card edit does, and they are never concatenated into the prompt head.
   */
  resources: z.array(StrategyAssetDeclarationV2Schema).optional(),
}).strict().superRefine((value, context) => {
  const paths = (value.resources ?? []).map((resource) => resource.path);
  if (new Set(paths).size !== paths.length || paths.includes(value.path)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resources'],
      message: 'Task profile resources must have unique paths distinct from the profile itself.',
    });
  }
});

export const BundledStrategyDeclarationV2Schema = z.object({
  schema: z.literal(OD_NEXT_BUNDLED_STRATEGY_SCHEMA),
  id: z.literal(OD_NEXT_STRATEGY_ID),
  promptRecipe: z.literal(OD_NEXT_PROMPT_RECIPE_ID),
  assets: z.object({
    core: StrategyAssetDeclarationV2Schema,
    orchestration: StrategyAssetDeclarationV2Schema,
    taskProfiles: z.array(StrategyTaskProfileAssetDeclarationV2Schema).length(4),
    taskProfileMapping: StrategyAssetDeclarationV2Schema,
  }).strict(),
}).strict().superRefine((value, context) => {
  const taskTypes = value.assets.taskProfiles.map((profile) => profile.taskType);
  if (new Set(taskTypes).size !== taskTypes.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['assets', 'taskProfiles'],
      message: 'Each declared strategy task profile must have a unique taskType.',
    });
  }
});
export type BundledStrategyDeclarationV2 = z.infer<typeof BundledStrategyDeclarationV2Schema>;

const StrategyAssetDigestV2Schema = z.object({
  path: relativeAssetPathSchema,
  sha256: sha256Schema,
}).strict();

const SelectedStrategyTaskProfileV2Schema = z.object({
  taskType: StrategyTaskTypeV2Schema.exclude(['generic']),
  version: z.string().min(1),
  path: relativeAssetPathSchema,
  sha256: sha256Schema,
}).strict();

export const AppliedStrategyBindingV2Schema = z.object({
  schema: z.literal(OD_NEXT_APPLIED_STRATEGY_SCHEMA),
  id: z.literal(OD_NEXT_STRATEGY_ID),
  version: z.string().min(1),
  packageHash: sha256Schema,
  assetDigests: z.array(StrategyAssetDigestV2Schema).min(1),
  selectedTaskProfile: SelectedStrategyTaskProfileV2Schema,
  taskProfileVersions: z.array(z.string().min(1)).min(1),
  promptRecipe: z.literal(OD_NEXT_PROMPT_RECIPE_ID),
}).strict().superRefine((value, context) => {
  const paths = value.assetDigests.map((asset) => asset.path);
  if (new Set(paths).size !== paths.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['assetDigests'],
      message: 'Applied strategy asset paths must be unique.',
    });
  }
  const sortedPaths = [...paths].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  if (paths.some((path, index) => path !== sortedPaths[index])) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['assetDigests'],
      message: 'Applied strategy asset digests must use stable path order.',
    });
  }
  const selectedDigest = value.assetDigests.find(
    (asset) => asset.path === value.selectedTaskProfile.path,
  );
  if (selectedDigest?.sha256 !== value.selectedTaskProfile.sha256) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['selectedTaskProfile'],
      message: 'Selected task profile digest must match the package asset roster.',
    });
  }
  if (!value.taskProfileVersions.includes(value.selectedTaskProfile.version)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['taskProfileVersions'],
      message: 'Selected task profile version must be recorded in taskProfileVersions.',
    });
  }
});
export type AppliedStrategyBindingV2 = z.infer<typeof AppliedStrategyBindingV2Schema>;

/** Historical storage only. New runs never read or validate model-authored plans. */
export interface OpenDesignPlanContractV2 {
  schema: 'open-design.plan-contract/v2';
  strategy: { id: 'od-next-strategy'; version: string; packageHash: string; snapshotId: string };
  taskProfile: {
    schemaVersion: '2'; taskType: StrategyTaskTypeV2; taskProfileVersion: string;
    goal: string; contextAndAudience: string; inputsAndReferences: string[]; constraints: string[];
    canonicalDeliverable: { id: string; kind: string; format: string };
    requiredDeliverables: { id: string; kind: string; derivesFrom?: string }[];
    designSpec: { source: 'existing-artifact' | 'brand' | 'resolved-baseline'; version: string; decisions: Record<string, unknown> };
    buildRequirements: { id: string; text: string }[];
    assumptions: string[]; risks: string[]; taskSpecific: Record<string, unknown>;
  };
  fullPlan: {
    executionMode: StrategyExecutionModeV2;
    steps: { id: string; objective: string; outputs: string[]; dependsOn?: string[] }[];
    readinessArtifacts: { id: string; version: string; digest: string }[];
    buildPackages: { id: string; objective: string; inputs: string[]; outputs: string[]; sharedConstraints: string[]; dependsOn: string[]; allowedResources: string[] }[];
  };
  runManifest: {
    selectedAgentId: string; capabilitySnapshotHash: string; inputRefs: string[]; baselineArtifactRef?: string;
    productionRoutes: string[]; preflight: { intake: 'passed'; execution: 'passed' };
  };
  decisionSummary: { goal: string; deliverables: string[]; keyConstraints: string[]; assumptions: string[]; risks: string[]; openDecisions: string[] };
}

export const StrategyExecutionIntentV2Schema = z.enum(['produce', 'plan_only']);
export type StrategyExecutionIntentV2 = z.infer<typeof StrategyExecutionIntentV2Schema>;

export const CapabilitySupportV2Schema = z.enum([
  'unsupported',
  'unknown',
  'advertised',
  'verified',
]);
export type CapabilitySupportV2 = z.infer<typeof CapabilitySupportV2Schema>;

export const AgentCapabilitySnapshotV2Schema = z.object({
  agentId: z.string().min(1),
  agentVersion: z.string().min(1).optional(),
  nativeSessionContinuation: CapabilitySupportV2Schema,
  nativeSubagents: z.object({
    support: CapabilitySupportV2Schema,
    evidenceLevel: z.enum(['unavailable', 'tool_only', 'structured']),
    source: z.string().min(1),
  }).strict(),
  capturedAt: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (
    value.nativeSubagents.support === 'verified'
    && value.nativeSubagents.evidenceLevel !== 'structured'
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['nativeSubagents', 'evidenceLevel'],
      message: 'Verified native Subagents require structured lifecycle evidence.',
    });
  }
});
export type AgentCapabilitySnapshotV2 = z.infer<typeof AgentCapabilitySnapshotV2Schema>;

export const ChildAgentEvidenceV2Schema = z.object({
  childId: z.string().min(1),
  parentId: z.string().min(1).optional(),
  packageId: z.string().min(1).optional(),
  state: z.enum(['started', 'completed', 'failed']),
  source: z.string().min(1),
  sourceEventType: z.string().min(1),
  startedAt: z.number().int().nonnegative().optional(),
  endedAt: z.number().int().nonnegative().optional(),
}).strict().superRefine((value, context) => {
  if (
    value.startedAt !== undefined
    && value.endedAt !== undefined
    && value.endedAt < value.startedAt
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endedAt'],
      message: 'Child terminal time may not precede its start time.',
    });
  }
});
export type ChildAgentEvidenceV2 = z.infer<typeof ChildAgentEvidenceV2Schema>;

const StrategyTaskProjectionIdentityV2Schema = z.object({
  id: z.literal(OD_NEXT_STRATEGY_ID),
  version: z.string().min(1),
  packageHash: sha256Schema,
  snapshotId: z.string().min(1),
}).strict();

/**
 * Client-facing attribution for a blocked task projection: the protocol gate's
 * reason codes plus the agent-visible text of the rejected turn (null when the
 * turn had no visible text). Mirrors the daemon task store's persisted
 * `blockedContext`; present only when the projected outcome is `blocked`, so
 * the UI can terminate the turn's form interaction and explain why.
 */
const StrategyTaskBlockedContextV2Schema = z.object({
  reasonCodes: z.array(z.string().min(1)).min(1),
  visibleText: z.string().nullable(),
}).strict();
export type StrategyTaskBlockedContextV2 = z.infer<typeof StrategyTaskBlockedContextV2Schema>;

/** The host's routing action; independent of execution success and file facts. */
export const StrategySettlementReasonV2Schema = z.enum(['question', 'continued', 'ended']);
export type StrategySettlementReasonV2 = z.infer<typeof StrategySettlementReasonV2Schema>;

/** Unknown historical facts stay absent rather than being inferred from an outcome. */
export const StrategySettlementFactsV2Schema = z.object({
  physicalStatus: z.enum(['succeeded', 'failed', 'canceled']).optional(),
  deliverableValid: z.boolean().optional(),
  truncated: z.boolean().optional(),
  todoUnfinished: z.boolean().optional(),
  askedUserQuestion: z.boolean().optional(),
  productionReady: z.boolean().optional(),
  emptyReply: z.boolean().optional(),
  executionIntent: StrategyExecutionIntentV2Schema.optional(),
}).strict();
export type StrategySettlementFactsV2 = z.infer<typeof StrategySettlementFactsV2Schema>;

/** Read old persisted reasons without continuing to write overlapping categories. */
export function normalizeStrategySettlementReason(value: unknown): StrategySettlementReasonV2 {
  if (value === 'production_ready') return 'continued';
  if (['deliverable_valid', 'plan_only', 'truncated', 'todo_unfinished', 'text_only',
    'empty_reply', 'run_failed', 'canceled', 'interrupted'].includes(String(value))) return 'ended';
  return StrategySettlementReasonV2Schema.parse(value);
}

export const StrategyTaskProjectionV2Schema = z.object({
  taskExecutionId: z.string().min(1),
  strategy: StrategyTaskProjectionIdentityV2Schema,
  inputStage: StrategyInputStageV2Schema,
  outcome: z.union([z.literal('running'), StrategyOutcomeV2Schema]),
  route: StrategyRouteV2Schema.nullable(),
  executionMode: StrategyExecutionModeV2Schema.nullable(),
  executionIntent: StrategyExecutionIntentV2Schema.optional(),
  activeRunId: z.string().min(1),
  nextRunId: z.string().min(1).optional(),
  /** Daemon-owned positions for the viewed, active and next physical Runs.
   * Optional for old daemon compatibility; never infer positions from stages.
   */
  runMappings: z.array(z.object({
    runId: z.string().min(1),
    taskRunIndex: z.number().int().nonnegative(),
  }).strict()).max(3).optional(),
  /** Host file observation, independent of terminal turn status. Absent on old tasks. */
  deliverableValid: z.boolean().optional(),
  /** Reason for the viewed physical round ending; absent before settlement. */
  settlementReason: z.preprocess(normalizeStrategySettlementReason, StrategySettlementReasonV2Schema).optional(),
  settlementFacts: StrategySettlementFactsV2Schema.optional(),
  terminal: z.boolean(),
  blockedContext: StrategyTaskBlockedContextV2Schema.optional(),
}).strict().superRefine((value, context) => {
  const isTerminalOutcome = ['completed', 'blocked', 'canceled'].includes(value.outcome);
  if (value.terminal !== isTerminalOutcome) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['terminal'],
      message: 'Task projection terminal must match the logical task outcome.',
    });
  }
  if (value.terminal && value.nextRunId !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['nextRunId'],
      message: 'Terminal task projections may not advertise a next Run.',
    });
  }

});
export type StrategyTaskProjectionV2 = z.infer<typeof StrategyTaskProjectionV2Schema>;
