import { z } from 'zod';

export const OD_NEXT_STRATEGY_ID = 'od-next-strategy' as const;
export const OD_NEXT_PROMPT_RECIPE_ID = 'od-next-plan-build-v2' as const;
export const OD_NEXT_APPLIED_STRATEGY_SCHEMA = 'open-design.applied-strategy/v2' as const;
export const OD_NEXT_PLAN_CONTRACT_SCHEMA = 'open-design.plan-contract/v2' as const;
export const OD_NEXT_RUNTIME_STATE_SCHEMA = 'open-design.strategy-state/v2' as const;
export const OD_NEXT_PLAN_CONTRACT_BLOCK = 'open-design-plan-contract' as const;
export const OD_NEXT_RUNTIME_STATE_BLOCK = 'open-design-runtime-state' as const;
export const OD_NEXT_BUNDLED_STRATEGY_SCHEMA = 'open-design.bundled-strategy/v2' as const;

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

/**
 * How a settled OD Next task ended, recorded once per task when the daemon
 * decides "wait / done / build one more round" from host-observed facts.
 *
 * Every value is a low-cardinality bucket for analytics; none carries prose.
 *
 * - `question`: the round rendered a question form; the user's answer is the
 *   next message and opens a new task.
 * - `deliverable_changed`: a round of this task wrote a deliverable (any
 *   non-Markdown file, or DESIGN.md on a design-system project).
 * - `non_design`: the model declared the message is not a design request.
 * - `no_file_writes`: the model declared the user wants discussion or a plan
 *   only, and nothing was written.
 * - `note_only`, `text_only`, `todo_unfinished`, `truncated`,
 *   `write_evidence_unknown`: why the last round was NOT proof of delivery.
 *   On the planning round these start the one automatic build round; after
 *   that round they settle the task and are what the "continue remaining
 *   tasks" button and the reason-code buckets read.
 */
export const StrategyTaskSettlementReasonV2Schema = z.enum([
  'question',
  'deliverable_changed',
  'non_design',
  'no_file_writes',
  'note_only',
  'text_only',
  'todo_unfinished',
  'truncated',
  'write_evidence_unknown',
]);
export type StrategyTaskSettlementReasonV2 = z.infer<typeof StrategyTaskSettlementReasonV2Schema>;

/**
 * The two optional light signals a model may leave in its closing
 * `open-design-runtime-state` block. They are declarations, not a contract:
 * the daemon reads them leniently, never validates them, and a missing block
 * is the ordinary case. Host-observed file writes outrank both.
 *
 * Older strategy packages wrote a richer block; two of its fields map onto
 * these signals so a task frozen on an older package still settles the same
 * way: `outcome: "blocked"` was the non-design answer (#7725) and
 * `executionIntent: "plan_only"` was the discussion-only answer.
 */
export interface StrategyTaskDeclarationsV2 {
  nonDesignRequest: boolean;
  noFileWrites: boolean;
}

export const OD_NEXT_NO_DECLARATIONS_V2: Readonly<StrategyTaskDeclarationsV2> = Object.freeze({
  nonDesignRequest: false,
  noFileWrites: false,
});

/**
 * Read the declarations out of whatever the model put inside the block.
 * Anything that is not a JSON object yields no declarations; unknown fields
 * are ignored; no shape is required.
 */
export function readStrategyTaskDeclarationsV2(value: unknown): StrategyTaskDeclarationsV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...OD_NEXT_NO_DECLARATIONS_V2 };
  }
  const record = value as Record<string, unknown>;
  return {
    nonDesignRequest: record['nonDesignRequest'] === true || record['outcome'] === 'blocked',
    noFileWrites: record['noFileWrites'] === true || record['executionIntent'] === 'plan_only',
  };
}

export const CapabilitySupportV2Schema = z.enum([
  'unsupported',
  'unknown',
  'advertised',
  'verified',
]);
export type CapabilitySupportV2 = z.infer<typeof CapabilitySupportV2Schema>;

const StrategyTaskProjectionIdentityV2Schema = z.object({
  id: z.literal(OD_NEXT_STRATEGY_ID),
  version: z.string().min(1),
  packageHash: sha256Schema,
  snapshotId: z.string().min(1),
}).strict();

/**
 * Client-facing attribution for a blocked task projection: the reason codes
 * the daemon recorded when the task's Run failed before the round settled
 * (`od_next_physical_run_interrupted`), plus the agent-visible text of that
 * turn (null when it had none). Mirrors the daemon task store's persisted
 * `blockedContext`; present only when the projected outcome is `blocked`, so
 * the failure card can name the reason when the Run's own error frame was
 * lost.
 */
const StrategyTaskBlockedContextV2Schema = z.object({
  reasonCodes: z.array(z.string().min(1)).min(1),
  visibleText: z.string().nullable(),
}).strict();
export type StrategyTaskBlockedContextV2 = z.infer<typeof StrategyTaskBlockedContextV2Schema>;

export const StrategyTaskProjectionV2Schema = z.object({
  taskExecutionId: z.string().min(1),
  strategy: StrategyTaskProjectionIdentityV2Schema,
  inputStage: StrategyInputStageV2Schema,
  outcome: z.union([z.literal('running'), StrategyOutcomeV2Schema]),
  route: StrategyRouteV2Schema.nullable(),
  executionMode: StrategyExecutionModeV2Schema.nullable(),
  activeRunId: z.string().min(1),
  nextRunId: z.string().min(1).optional(),
  /** Daemon-owned positions for the viewed, active and next physical Runs.
   * Optional for old daemon compatibility; never infer positions from stages.
   */
  runMappings: z.array(z.object({
    runId: z.string().min(1),
    taskRunIndex: z.number().int().nonnegative(),
  }).strict()).max(3).optional(),
  terminal: z.boolean(),
  blockedContext: StrategyTaskBlockedContextV2Schema.optional(),
  /**
   * A round of this task wrote a deliverable — the host-observed fact the
   * "delivered" stamp and the completeness predicate read. It is independent
   * of `outcome`: a task can settle `completed` after its one automatic build
   * round without this being true, and then the chat still offers to continue
   * the remaining work.
   */
  deliverableWritten: z.boolean(),
  /** Why the task settled the way it did; absent while it is still running. */
  settlementReason: StrategyTaskSettlementReasonV2Schema.optional(),
  /** Rounds the daemon started on its own for this task (at most one today). */
  autoRoundCount: z.number().int().nonnegative(),
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
  if (value.settlementReason !== undefined && value.outcome !== 'completed') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['settlementReason'],
      message: 'A settlement reason belongs to a completed task.',
    });
  }
});
export type StrategyTaskProjectionV2 = z.infer<typeof StrategyTaskProjectionV2Schema>;
