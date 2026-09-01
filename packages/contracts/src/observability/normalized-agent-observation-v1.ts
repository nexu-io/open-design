import { z } from 'zod';

import { StrategyInputStageV2Schema } from '../plugins/strategy-v2.js';

export const NORMALIZED_AGENT_OBSERVATION_V1_SCHEMA =
  'open-design.normalized-agent-observation/v1' as const;

const nonEmptyStringSchema = z.string().trim().min(1);
const nonNegativeNumberSchema = z.number().finite().nonnegative();
const nonNegativeIntegerSchema = z.number().int().nonnegative();
const limitationListSchema = z.array(nonEmptyStringSchema);

export const NormalizedAgentObservationKindV1Schema = z.enum([
  'task_run',
  'child_agent',
  'model_call',
  'tool',
]);
export type NormalizedAgentObservationKindV1 = z.infer<
  typeof NormalizedAgentObservationKindV1Schema
>;

export const NormalizedAgentObservationStatusV1Schema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'canceled',
  'unknown',
]);
export type NormalizedAgentObservationStatusV1 = z.infer<
  typeof NormalizedAgentObservationStatusV1Schema
>;

export const ObservationFactAvailabilityV1Schema = z.enum([
  'complete',
  'partial',
  'unavailable',
]);
export type ObservationFactAvailabilityV1 = z.infer<
  typeof ObservationFactAvailabilityV1Schema
>;

export const ChildEvidenceCoverageV1Schema = z.object({
  availability: ObservationFactAvailabilityV1Schema,
  source: nonEmptyStringSchema,
  /**
   * How many distinct Child agents the adapter observed — NOT how many times
   * they were invoked.
   *
   * A parent may re-enter the same Child repeatedly, and a runtime whose
   * evidence is turn-shaped (Codex opens a new rollout turn per invocation)
   * must fold those back to one before reporting here. Leaving the unit unsaid
   * let one adapter count invocations and another count Children, which made
   * the two runtimes' figures silently incomparable.
   */
  knownChildCount: nonNegativeIntegerSchema,
  explicitZero: z.boolean(),
  limitations: limitationListSchema,
  diagnosticCounts: z.array(z.object({
    code: nonEmptyStringSchema,
    count: z.number().int().positive(),
  }).strict()).max(64),
}).strict().superRefine((coverage, context) => {
  if (coverage.explicitZero && (
    coverage.availability !== 'complete' || coverage.knownChildCount !== 0
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['explicitZero'],
      message: 'Explicit zero child evidence requires complete coverage with zero known children.',
    });
  }
  if (
    coverage.availability === 'complete' &&
    coverage.knownChildCount === 0 &&
    !coverage.explicitZero
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['explicitZero'],
      message: 'Complete zero-child coverage must be explicitly observed.',
    });
  }
  if (coverage.availability !== 'complete' && coverage.limitations.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['limitations'],
      message: `${coverage.availability} child evidence requires a limitation.`,
    });
  }
});
export type ChildEvidenceCoverageV1 = z.infer<typeof ChildEvidenceCoverageV1Schema>;

export const ObservationIdentityV1Schema = z.object({
  observationId: nonEmptyStringSchema,
  taskExecutionId: nonEmptyStringSchema,
  runId: nonEmptyStringSchema,
  taskRunIndex: nonNegativeIntegerSchema,
  parentObservationId: nonEmptyStringSchema.optional(),
  runtimeSessionId: nonEmptyStringSchema.optional(),
}).passthrough().superRefine((identity, context) => {
  if (identity.parentObservationId === identity.observationId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['parentObservationId'],
      message: 'An observation cannot parent itself.',
    });
  }
});
export type ObservationIdentityV1 = z.infer<typeof ObservationIdentityV1Schema>;

export const PromptBoundaryAvailabilityV1Schema = z.enum([
  'exact',
  'partial',
  'unavailable',
  'unobservable',
]);
export type PromptBoundaryAvailabilityV1 = z.infer<
  typeof PromptBoundaryAvailabilityV1Schema
>;

export const ObservationEvidenceSourceV1Schema = z.enum([
  'daemon',
  'provider_stream',
  'rollout',
  'acp',
  'runtime',
  'derived',
  'unknown',
]);
export type ObservationEvidenceSourceV1 = z.infer<
  typeof ObservationEvidenceSourceV1Schema
>;

export const PromptBoundaryEvidenceV1Schema = z.object({
  availability: PromptBoundaryAvailabilityV1Schema,
  source: ObservationEvidenceSourceV1Schema.optional(),
  hash: nonEmptyStringSchema.optional(),
  bytes: nonNegativeIntegerSchema.optional(),
  safePayload: z.record(z.unknown()).optional(),
  limitations: limitationListSchema,
}).passthrough().superRefine((evidence, context) => {
  if (evidence.availability === 'exact') {
    if (!evidence.source || evidence.source === 'unknown' || evidence.source === 'derived') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source'],
        message: 'Exact Prompt evidence requires a source.',
      });
    }
    if (
      !evidence.hash ||
      evidence.bytes === undefined ||
      !evidence.safePayload ||
      Object.keys(evidence.safePayload).length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Exact Prompt evidence requires hash, bytes, and a safe payload.',
      });
    }
  }

  if (evidence.availability === 'partial') {
    if (!evidence.source || evidence.source === 'unknown' || evidence.source === 'derived') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source'],
        message: 'Partial Prompt evidence requires a source.',
      });
    }
    if (
      evidence.hash === undefined &&
      evidence.bytes === undefined &&
      evidence.safePayload === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Partial Prompt evidence requires at least one observed value.',
      });
    }
    if (evidence.limitations.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['limitations'],
        message: 'Partial Prompt evidence requires a limitation.',
      });
    }
  }

  if (
    (evidence.availability === 'unavailable' || evidence.availability === 'unobservable') &&
    (evidence.hash !== undefined ||
      evidence.bytes !== undefined ||
      evidence.safePayload !== undefined)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${evidence.availability} Prompt evidence must not carry Prompt values.`,
    });
  }
  if (evidence.availability === 'unobservable' && evidence.source !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['source'],
      message: 'Unobservable Prompt evidence must not claim a source.',
    });
  }
  if (
    (evidence.availability === 'unavailable' || evidence.availability === 'unobservable') &&
    evidence.limitations.length === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['limitations'],
      message: `${evidence.availability} Prompt evidence requires a limitation.`,
    });
  }
});
export type PromptBoundaryEvidenceV1 = z.infer<typeof PromptBoundaryEvidenceV1Schema>;

export const NormalizedPromptEvidenceV1Schema = z.object({
  hostComposed: PromptBoundaryEvidenceV1Schema,
  childInjected: PromptBoundaryEvidenceV1Schema,
  agentEffectiveContext: PromptBoundaryEvidenceV1Schema,
}).passthrough();
export type NormalizedPromptEvidenceV1 = z.infer<typeof NormalizedPromptEvidenceV1Schema>;

export const ObservationUsageAccountingModeV1Schema = z.enum([
  'inclusive',
  'additive',
  'unknown',
]);
export type ObservationUsageAccountingModeV1 = z.infer<
  typeof ObservationUsageAccountingModeV1Schema
>;

export const ObservationUsageSourceV1Schema = z.enum([
  'provider_stream',
  'rollout',
  'acp',
  'runtime',
  'derived',
  'unknown',
]);
export type ObservationUsageSourceV1 = z.infer<typeof ObservationUsageSourceV1Schema>;

export const ObservationUsageValuesV1Schema = z.object({
  inputTokens: nonNegativeNumberSchema.optional(),
  effectiveInputTokens: nonNegativeNumberSchema.optional(),
  outputTokens: nonNegativeNumberSchema.optional(),
  totalTokens: nonNegativeNumberSchema.optional(),
  thoughtTokens: nonNegativeNumberSchema.optional(),
  cacheReadTokens: nonNegativeNumberSchema.optional(),
  cacheWriteTokens: nonNegativeNumberSchema.optional(),
  uncachedInputTokens: nonNegativeNumberSchema.optional(),
  estimatedContextTokens: nonNegativeNumberSchema.optional(),
}).passthrough().superRefine((values, context) => {
  if (!Object.values(values).some((value) => (
    typeof value === 'number' && Number.isFinite(value) && value >= 0
  ))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Available usage requires at least one reported value.',
    });
  }
});
export type ObservationUsageValuesV1 = z.infer<typeof ObservationUsageValuesV1Schema>;

export const ObservationUsageValueSourcesV1Schema = z.record(
  ObservationUsageSourceV1Schema,
);
export type ObservationUsageValueSourcesV1 = z.infer<
  typeof ObservationUsageValueSourcesV1Schema
>;

export const NormalizedUsageEvidenceV1Schema = z.object({
  availability: ObservationFactAvailabilityV1Schema,
  source: ObservationUsageSourceV1Schema,
  accountingMode: ObservationUsageAccountingModeV1Schema,
  values: ObservationUsageValuesV1Schema.optional(),
  valueSources: ObservationUsageValueSourcesV1Schema.optional(),
  limitations: limitationListSchema,
}).passthrough().superRefine((usage, context) => {
  if (
    usage.availability === 'unavailable' &&
    (usage.values !== undefined || usage.valueSources !== undefined)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['values'],
      message: 'Unavailable usage must not carry values or value sources.',
    });
  }
  if (
    usage.availability === 'unavailable' &&
    (usage.source !== 'unknown' || usage.accountingMode !== 'unknown')
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Unavailable usage requires unknown source and accounting mode.',
    });
  }
  if (usage.availability !== 'unavailable' && usage.values === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['values'],
      message: `${usage.availability} usage requires reported values.`,
    });
  }
  if (usage.availability !== 'unavailable' && usage.valueSources === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['valueSources'],
      message: `${usage.availability} usage requires per-value sources.`,
    });
  }
  if (usage.values && usage.valueSources) {
    for (const [key, value] of Object.entries(usage.values)) {
      if (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        usage.valueSources[key] === undefined
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['valueSources', key],
          message: `Usage value ${key} requires an explicit source.`,
        });
      }
    }
    for (const key of Object.keys(usage.valueSources)) {
      if (typeof usage.values[key] !== 'number') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['valueSources', key],
          message: `Usage source ${key} has no matching numeric value.`,
        });
      }
    }
    if (usage.valueSources.totalTokens === 'derived') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valueSources', 'totalTokens'],
        message: 'Total tokens must not be inferred when the producer did not report them.',
      });
    }
    if (
      Object.values(usage.valueSources).includes('derived') &&
      usage.limitations.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['limitations'],
        message: 'Derived usage values require a limitation.',
      });
    }
  }
  if (usage.availability === 'complete') {
    if (
      usage.source === 'unknown' ||
      usage.source === 'derived' ||
      usage.values?.inputTokens === undefined ||
      usage.values.outputTokens === undefined ||
      usage.valueSources?.inputTokens !== usage.source ||
      usage.valueSources?.outputTokens !== usage.source
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Complete usage requires a structured provider/runtime source plus input and output values.',
      });
    }
  }
  if (
    usage.accountingMode === 'unknown' &&
    usage.availability !== 'unavailable' &&
    usage.limitations.length === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['limitations'],
      message: 'Observed usage with unknown accounting mode requires a limitation.',
    });
  }
  if (
    usage.availability !== 'complete' &&
    usage.limitations.length === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['limitations'],
      message: `${usage.availability} usage requires a limitation.`,
    });
  }
});
export type NormalizedUsageEvidenceV1 = z.infer<typeof NormalizedUsageEvidenceV1Schema>;

export const ObservationTimingSourceV1Schema = z.enum([
  'host_monotonic',
  'host_wall_clock',
  'runtime',
  'provider',
  'unknown',
]);
export type ObservationTimingSourceV1 = z.infer<typeof ObservationTimingSourceV1Schema>;

export const TimingEvidenceV1Schema = z.object({
  source: ObservationTimingSourceV1Schema,
  clockDomain: nonEmptyStringSchema,
  startedAtMs: nonNegativeNumberSchema.optional(),
  endedAtMs: nonNegativeNumberSchema.optional(),
  durationMs: nonNegativeNumberSchema.optional(),
  measurements: z.record(nonNegativeNumberSchema).optional(),
  limitations: limitationListSchema.optional(),
}).passthrough().superRefine((evidence, context) => {
  if (
    (evidence.source === 'host_monotonic' && evidence.clockDomain !== 'monotonic_ms') ||
    (evidence.source === 'host_wall_clock' && evidence.clockDomain !== 'unix_epoch_ms') ||
    (evidence.source === 'unknown' && evidence.clockDomain !== 'unknown')
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['clockDomain'],
      message: `Timing source ${evidence.source} conflicts with clock domain ${evidence.clockDomain}.`,
    });
  }
  if (
    evidence.startedAtMs === undefined &&
    evidence.endedAtMs === undefined &&
    evidence.durationMs === undefined &&
    (evidence.measurements === undefined || Object.keys(evidence.measurements).length === 0)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Timing evidence requires a timestamp, duration, or measurement.',
    });
  }
  if (
    evidence.startedAtMs !== undefined &&
    evidence.endedAtMs !== undefined &&
    evidence.endedAtMs < evidence.startedAtMs
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endedAtMs'],
      message: 'Timing evidence cannot end before it starts within one clock domain.',
    });
  }
  if (
    evidence.startedAtMs !== undefined &&
    evidence.endedAtMs !== undefined &&
    evidence.durationMs !== undefined &&
    Math.abs((evidence.endedAtMs - evidence.startedAtMs) - evidence.durationMs) > 1 &&
    (evidence.limitations?.length ?? 0) === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['durationMs'],
      message: 'Same-clock start/end and duration disagree without a limitation.',
    });
  }
});
export type TimingEvidenceV1 = z.infer<typeof TimingEvidenceV1Schema>;

export const NormalizedTimingEvidenceV1Schema = z.object({
  availability: ObservationFactAvailabilityV1Schema,
  evidence: z.array(TimingEvidenceV1Schema).min(1).optional(),
  limitations: limitationListSchema,
}).passthrough().superRefine((timing, context) => {
  if (timing.availability === 'unavailable' && timing.evidence !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidence'],
      message: 'Unavailable timing must not carry evidence.',
    });
  }
  if (timing.availability !== 'unavailable' && timing.evidence === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidence'],
      message: `${timing.availability} timing requires evidence.`,
    });
  }
  if (
    timing.availability === 'complete' &&
    !timing.evidence?.some((evidence) => (
      evidence.durationMs !== undefined ||
      (evidence.startedAtMs !== undefined && evidence.endedAtMs !== undefined)
    ))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidence'],
      message: 'Complete timing requires a duration or same-clock start/end evidence.',
    });
  }
  if (
    timing.availability === 'complete' &&
    timing.evidence?.some((evidence) => (
      evidence.source === 'unknown' || evidence.clockDomain === 'unknown'
    ))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidence'],
      message: 'Complete timing requires known evidence sources.',
    });
  }
  if (
    timing.availability !== 'complete' &&
    timing.limitations.length === 0
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['limitations'],
      message: `${timing.availability} timing requires a limitation.`,
    });
  }
});
export type NormalizedTimingEvidenceV1 = z.infer<typeof NormalizedTimingEvidenceV1Schema>;

/**
 * Identifies one provider/runtime turn for usage aggregation.
 *
 * Some runtimes repeat a child turn in a parent or sibling stream. Keeping the
 * owner/excluded decision beside the normalized fact lets downstream readers
 * avoid counting the inherited copy without guessing from provider event
 * names. The field is optional for V1 producers that cannot observe this
 * boundary; absence must remain partial/unavailable rather than being inferred.
 */
export const ObservationTurnAccountingV1Schema = z.object({
  turnId: nonEmptyStringSchema,
  disposition: z.enum(['owner', 'exclude_inherited']),
  ownerObservationId: nonEmptyStringSchema,
}).passthrough();
export type ObservationTurnAccountingV1 = z.infer<
  typeof ObservationTurnAccountingV1Schema
>;

export const SAFE_RUN_QUALITY_V1_SCHEMA = 'open-design.safe-run-quality/v1' as const;

export const SafeObservationTextV1Schema = z.object({
  text: z.string(),
  redacted: z.literal(true),
  truncated: z.boolean(),
}).strict();
export type SafeObservationTextV1 = z.infer<typeof SafeObservationTextV1Schema>;

const safeQualityIdentifierSchema = z.string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);

export const SafeObservationErrorV1Schema = z.object({
  message: SafeObservationTextV1Schema.optional(),
  code: safeQualityIdentifierSchema.optional(),
  category: safeQualityIdentifierSchema.optional(),
  detail: safeQualityIdentifierSchema.optional(),
  stage: safeQualityIdentifierSchema.optional(),
}).strict();
export type SafeObservationErrorV1 = z.infer<typeof SafeObservationErrorV1Schema>;

export const SafeObservationToolV1Schema = z.object({
  callHash: z.string().regex(/^[a-f0-9]{64}$/),
  name: safeQualityIdentifierSchema,
  input: SafeObservationTextV1Schema.optional(),
  output: SafeObservationTextV1Schema.optional(),
  status: z.enum(['running', 'completed', 'failed', 'unknown']),
  isError: z.boolean(),
  startedAtMs: nonNegativeNumberSchema.optional(),
  endedAtMs: nonNegativeNumberSchema.optional(),
}).strict();
export type SafeObservationToolV1 = z.infer<typeof SafeObservationToolV1Schema>;

export const SafeObservationManifestEntryV1Schema = z.object({
  object_class: z.enum(['attachment', 'artifact', 'input_text_snapshot']),
  storage_ref: nonEmptyStringSchema,
  status: z.enum(['ok', 'partial', 'unavailable']),
  reason: nonEmptyStringSchema.optional(),
  project_id: z.string().nullable().optional(),
  run_id: nonEmptyStringSchema.optional(),
  workspace_id: z.string().nullable().optional(),
  size_bytes: nonNegativeNumberSchema.optional(),
  sha256: nonEmptyStringSchema.optional(),
  mime_type: nonEmptyStringSchema.optional(),
  extension: nonEmptyStringSchema.optional(),
  redacted: z.boolean(),
  truncated: z.boolean(),
  stored_in_open_design: z.boolean().optional(),
  retention_policy: nonEmptyStringSchema.optional(),
  access_scope: nonEmptyStringSchema.optional(),
  sensitivity: nonEmptyStringSchema.optional(),
  source: nonEmptyStringSchema.optional(),
  expires_at: z.string().nullable().optional(),
  approved_by: z.string().nullable().optional(),
  attachment_id: nonEmptyStringSchema.optional(),
  artifact_id: nonEmptyStringSchema.optional(),
  input_text_snapshot_id: nonEmptyStringSchema.optional(),
  type: nonEmptyStringSchema.optional(),
  artifact_kind: nonEmptyStringSchema.optional(),
  build_status: nonEmptyStringSchema.optional(),
  preview_status: nonEmptyStringSchema.optional(),
  export_status: nonEmptyStringSchema.optional(),
  open_in_open_design_url: z.string().nullable().optional(),
  access_policy: nonEmptyStringSchema.optional(),
}).strict();
export type SafeObservationManifestEntryV1 = z.infer<
  typeof SafeObservationManifestEntryV1Schema
>;

/**
 * Bounded process-stream tail for one failed Run.
 *
 * The tail is optional so a producer can still report the observed line count
 * and truncation flag when consent does not permit shipping the text itself.
 * Every tail that IS shipped must already be redacted and byte-capped by its
 * producer; the schema only enforces the shape.
 */
export const SafeObservationStreamTailV1Schema = z.object({
  tail: SafeObservationTextV1Schema.optional(),
  lineCount: nonNegativeIntegerSchema,
  truncated: z.boolean(),
  limitations: limitationListSchema.optional(),
}).strict().superRefine((stream, context) => {
  if (stream.tail === undefined && (stream.limitations?.length ?? 0) === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['limitations'],
      message: 'A stream summary without its tail text requires a limitation.',
    });
  }
});
export type SafeObservationStreamTailV1 = z.infer<
  typeof SafeObservationStreamTailV1Schema
>;

const safeDiagnosticKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);

/**
 * Host-derived close/diagnostic facts for one Run.
 *
 * Values are deliberately restricted to booleans and bounded identifiers
 * (buckets, enum codes). Free text never enters this record — a producer that
 * wants to ship text must route it through `SafeObservationTextV1` so the
 * redaction and truncation rules apply.
 */
export const SafeRunDiagnosticsV1Schema = z.record(
  safeDiagnosticKeySchema,
  z.union([z.boolean(), safeQualityIdentifierSchema]),
).superRefine((diagnostics, context) => {
  if (Object.keys(diagnostics).length > 64) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Run diagnostics must stay bounded to 64 fields.',
    });
  }
});
export type SafeRunDiagnosticsV1 = z.infer<typeof SafeRunDiagnosticsV1Schema>;

/**
 * Terminal process outcome for one Run: how the child exited and what it wrote
 * to its diagnostic streams.
 *
 * This is the evidence a failed Run needs and that failure *classification*
 * alone cannot supply — an exit code, a fatal signal, and the stderr tail that
 * explains both.
 */
export const SafeRunProcessOutcomeV1Schema = z.object({
  exitCode: z.number().int().optional(),
  signal: safeQualityIdentifierSchema.optional(),
  stderr: SafeObservationStreamTailV1Schema.optional(),
  stdout: SafeObservationStreamTailV1Schema.optional(),
  diagnostics: SafeRunDiagnosticsV1Schema.optional(),
}).strict();
export type SafeRunProcessOutcomeV1 = z.infer<typeof SafeRunProcessOutcomeV1Schema>;

export const SafeRunQualityV1Schema = z.object({
  schema: z.literal(SAFE_RUN_QUALITY_V1_SCHEMA),
  result: z.object({
    output: SafeObservationTextV1Schema.optional(),
    error: SafeObservationErrorV1Schema.optional(),
  }).strict().optional(),
  tools: z.array(SafeObservationToolV1Schema).max(256).optional(),
  manifests: z.object({
    completeness: ObservationFactAvailabilityV1Schema,
    attachments: z.array(SafeObservationManifestEntryV1Schema).max(50),
    artifacts: z.array(SafeObservationManifestEntryV1Schema).max(50),
    inputTextSnapshots: z.array(SafeObservationManifestEntryV1Schema).max(50),
  }).strict().optional(),
  process: SafeRunProcessOutcomeV1Schema.optional(),
}).strict();
export type SafeRunQualityV1 = z.infer<typeof SafeRunQualityV1Schema>;

export const NormalizedAgentObservationV1Schema = z.object({
  schema: z.literal(NORMALIZED_AGENT_OBSERVATION_V1_SCHEMA),
  identity: ObservationIdentityV1Schema,
  kind: NormalizedAgentObservationKindV1Schema,
  stage: StrategyInputStageV2Schema,
  status: NormalizedAgentObservationStatusV1Schema,
  prompt: NormalizedPromptEvidenceV1Schema,
  usage: NormalizedUsageEvidenceV1Schema,
  timing: NormalizedTimingEvidenceV1Schema,
  childEvidenceCoverage: ChildEvidenceCoverageV1Schema.optional(),
  turnAccounting: ObservationTurnAccountingV1Schema.optional(),
  quality: SafeRunQualityV1Schema.optional(),
  limitations: limitationListSchema,
  attributes: z.record(z.unknown()).optional(),
}).passthrough().superRefine((observation, context) => {
  if (observation.childEvidenceCoverage && observation.kind !== 'task_run') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['childEvidenceCoverage'],
      message: 'Child evidence coverage belongs only on physical task Run observations.',
    });
  }
  if (
    observation.kind !== 'task_run' &&
    observation.identity.parentObservationId === undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['identity', 'parentObservationId'],
      message: `${observation.kind} observations require a parentObservationId.`,
    });
  }
  if (
    observation.turnAccounting?.disposition === 'owner' &&
    observation.turnAccounting.ownerObservationId !== observation.identity.observationId
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['turnAccounting', 'ownerObservationId'],
      message: 'A Turn accounting owner must bind its own observationId.',
    });
  }
  if (
    observation.turnAccounting?.disposition === 'exclude_inherited' &&
    observation.turnAccounting.ownerObservationId === observation.identity.observationId
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['turnAccounting', 'ownerObservationId'],
      message: 'An excluded inherited Turn copy must bind a distinct owner observation.',
    });
  }
});
export type NormalizedAgentObservationV1 = z.infer<
  typeof NormalizedAgentObservationV1Schema
>;

const unavailablePrompt = (boundary: 'host' | 'child'): PromptBoundaryEvidenceV1 => ({
  availability: 'unavailable',
  source: boundary === 'host' ? 'unknown' : 'runtime',
  limitations: [boundary === 'host' ? 'host_prompt_not_observed' : 'child_prompt_not_observed'],
});

const unobservableEffectiveContext = (): PromptBoundaryEvidenceV1 => ({
  availability: 'unobservable',
  limitations: ['agent_effective_context_unobservable'],
});

function normalizeStatus(value: unknown): {
  status: NormalizedAgentObservationStatusV1;
  limitation?: string;
} {
  if (value === 'cancelled') return { status: 'canceled' };
  if (value === 'succeeded' || value === 'success' || value === 'done') {
    return { status: 'completed' };
  }
  if (value === 'started' || value === 'in_progress') return { status: 'running' };
  const parsed = NormalizedAgentObservationStatusV1Schema.safeParse(value);
  if (parsed.success) return { status: parsed.data };
  const raw = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 64)
    : '';
  return {
    status: 'unknown',
    limitation: raw ? `unrecognized_status:${raw}` : 'status_not_observed',
  };
}

/**
 * Normalize one adapter-produced fact object without consulting task stores,
 * provider SDKs, the filesystem, or delivery state.
 *
 * Missing Prompt/usage/timing facts become explicit unavailable evidence. No
 * token, Prompt, parent, or cross-clock value is inferred. Passthrough fields
 * remain intact so later runtime adapters can add versioned evidence without
 * breaking V1 readers.
 */
export function normalizeAgentObservationV1(input: unknown): NormalizedAgentObservationV1 {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Normalized observation input must be an object.');
  }
  const record = input as Record<string, unknown>;
  const status = normalizeStatus(record.status);
  const prompt = record.prompt && typeof record.prompt === 'object' && !Array.isArray(record.prompt)
    ? record.prompt as Record<string, unknown>
    : {};
  const limitations = Array.isArray(record.limitations)
    ? record.limitations.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  return NormalizedAgentObservationV1Schema.parse({
    ...record,
    schema: NORMALIZED_AGENT_OBSERVATION_V1_SCHEMA,
    status: status.status,
    prompt: {
      ...prompt,
      hostComposed: prompt.hostComposed ?? unavailablePrompt('host'),
      childInjected: prompt.childInjected ?? unavailablePrompt('child'),
      agentEffectiveContext:
        prompt.agentEffectiveContext ?? unobservableEffectiveContext(),
    },
    usage: record.usage ?? {
      availability: 'unavailable',
      source: 'unknown',
      accountingMode: 'unknown',
      limitations: ['usage_not_observed'],
    },
    timing: record.timing ?? {
      availability: 'unavailable',
      limitations: ['timing_not_observed'],
    },
    limitations: [...new Set([
      ...limitations,
      ...(status.limitation ? [status.limitation] : []),
    ])],
  });
}
