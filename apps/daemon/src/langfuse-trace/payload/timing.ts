/** @module langfuse-trace/payload/timing
 * Per-phase timing span bodies for the Langfuse ingestion batch.
 * Imports `buildCostBreakdown` and `tokenUsageSummary` from `cost.ts` to annotate the agent-call
 * span, and `promptBuildSummary`/`objectRefSummary` from `summaries.ts` for the prompt-build span.
 */
import type { PromptStackTelemetry } from '../../prompt-telemetry.js';
import {
  cappedManifestEntries,
  manifestTruncated,
  validTimestamp,
} from '../core/index.js';
import type { ReportContext } from '../core/index.js';
import { buildCostBreakdown, tokenUsageSummary } from './cost.js';
import { objectRefSummary, promptBuildSummary } from './summaries.js';

/**
 * Validates start and end timestamps and returns a fully-formed Langfuse span body,
 * including a derived `duration_ms` field in both `output` and `metadata`.
 * Returns `null` when either timestamp is missing or `end` precedes `start`, so the
 * caller can filter out unmeasured phases without emitting malformed observations.
 *
 * @param input - Span definition: trace/parent/run IDs, phase name, timestamps, and optional I/O.
 * @returns A Langfuse-compatible span body record, or `null` if timestamps are invalid.
 */
export function timingSpanBody(input: {
  traceId: string;
  parentObservationId: string;
  runId: string;
  name: string;
  start: number | undefined;
  end: number | undefined;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Record<string, unknown> | null {
  const start = validTimestamp(input.start);
  const end = validTimestamp(input.end);
  if (start === undefined || end === undefined || end < start) return null;
  const durationMs = Math.round(end - start);
  return {
    id: `${input.runId}-phase-${input.name}`,
    traceId: input.traceId,
    parentObservationId: input.parentObservationId,
    name: input.name,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    input: input.input,
    output: {
      duration_ms: durationMs,
      ...(input.output ?? {}),
    },
    metadata: {
      durationMs,
      ...(input.metadata ?? {}),
    },
  };
}

/**
 * Builds the complete ordered array of Langfuse phase timing spans for a completed run:
 * queue, prompt-build, launch-preflight, spawn, stdin-write,
 * runtime-init-to-first-model-event, runtime-init-to-first-token,
 * agent-call (or runtime-call when no generation observation is created),
 * stream-output, artifact-write, and finalize.
 * Each definition is passed through {@link timingSpanBody} and null results
 * (unmeasured phases) are filtered out before returning.
 *
 * @param ctx               - The run's {@link ReportContext}.
 * @param parentObservationId - ID of the parent span (generation or runtime span).
 * @param opts              - Optional model-call name override and prompt-stack for richer output.
 * @returns Array of non-null Langfuse span body records ready for `span-create` batch entries.
 */
export function buildTimingSpanBodies(
  ctx: ReportContext,
  parentObservationId: string,
  opts: {
    modelCallName?: string;
    promptStack?: PromptStackTelemetry;
  } = {},
): Record<string, unknown>[] {
  const marks = ctx.run.timingMarks ?? {};
  const runStart = ctx.run.startedAt;
  const runEnd = ctx.run.endedAt;
  const queueEnd = marks.promptBuildStartAt ?? marks.startChatRunStartedAt;
  const costBreakdown = buildCostBreakdown(ctx);
  const phaseCosts = costBreakdown.phase_costs as Record<string, unknown>;
  const definitions = [
    {
      name: 'queue',
      start: runStart,
      end: queueEnd,
      input: {
        phase: 'queue',
        from: 'run.startedAt',
        to: 'promptBuildStartAt',
      },
      output: {
        status: queueEnd === undefined ? 'unmeasured' : 'ready_for_prompt_build',
      },
      metadata: { boundary: 'run.startedAt -> promptBuildStartAt' },
    },
    {
      name: 'prompt-build',
      start: marks.promptBuildStartAt,
      end: marks.promptBuildEndAt,
      input: {
        phase: 'prompt-build',
        ingredients: {
          agent: ctx.agentId ?? 'unknown',
          model: ctx.turn?.model ?? 'unknown',
          skill_id: ctx.turn?.skillId ?? null,
          design_system_id: ctx.turn?.designSystemId ?? null,
          design_system_digest: ctx.turn?.designSystemDigest ?? null,
          prompt_cache_hit: ctx.turn?.promptCache?.hit ?? null,
          user_request_available: Boolean(ctx.message.prompt),
          attachment_refs:
            objectRefSummary(cappedManifestEntries(ctx.attachmentManifest)) ?? [],
          attachment_refs_truncated: manifestTruncated(ctx.attachmentManifest),
        },
      },
      output: {
        status:
          marks.promptBuildEndAt === undefined
            ? 'unmeasured'
            : 'prompt_stack_ready',
        content_policy: opts.promptStack
          ? 'redacted_prompt_stack_on_generation_input_with_object_refs'
          : 'metadata_only_or_unavailable',
        ...promptBuildSummary(ctx.promptTelemetry),
      },
      metadata: { boundary: 'promptBuildStartAt -> promptBuildEndAt' },
    },
    {
      name: 'launch-preflight',
      start: marks.launchPreflightStartAt,
      end: marks.launchPreflightEndAt,
      input: {
        phase: 'launch-preflight',
        from: 'promptBuildEndAt',
        to: 'processSpawnStartedAt',
      },
      output: {
        status:
          marks.launchPreflightEndAt === undefined
            ? 'unmeasured'
            : 'ready_to_spawn',
      },
      metadata: { boundary: 'launchPreflightStartAt -> launchPreflightEndAt' },
    },
    {
      name: 'spawn',
      start: marks.processSpawnStartedAt,
      end: marks.processSpawnedAt,
      input: {
        phase: 'spawn',
        agent: ctx.agentId ?? 'unknown',
        runtime: ctx.runtime?.clientType ?? 'unknown',
        cwd_ref: 'project',
        raw_path_included: false,
      },
      output: {
        status:
          marks.processSpawnedAt === undefined ? 'unmeasured' : 'process_spawned',
      },
      metadata: {
        boundary: 'processSpawnStartedAt -> processSpawnedAt',
      },
    },
    {
      name: 'stdin-write',
      start: marks.stdinWriteStartAt,
      end: marks.stdinWriteEndAt,
      input: {
        phase: 'stdin-write',
        prompt_input_format: 'redacted',
      },
      output: {
        status:
          marks.stdinWriteEndAt === undefined ? 'unmeasured' : 'prompt_sent',
      },
      metadata: { boundary: 'stdinWriteStartAt -> stdinWriteEndAt' },
    },
    {
      name: 'runtime-init-to-first-model-event',
      start: marks.stdinWriteEndAt ?? marks.modelCallStartAt ?? marks.processSpawnedAt,
      end: marks.firstModelEventAt,
      input: {
        phase: 'runtime-init-to-first-model-event',
        from: 'stdinWriteEndAt',
        to: 'firstModelEventAt',
      },
      output: {
        status:
          marks.firstModelEventAt === undefined
            ? 'unmeasured'
            : 'first_model_event_seen',
      },
      metadata: { boundary: 'stdinWriteEndAt/modelCallStartAt/processSpawnedAt -> firstModelEventAt' },
    },
    {
      name: 'runtime-init-to-first-token',
      start: marks.stdinWriteEndAt ?? marks.modelCallStartAt ?? marks.processSpawnedAt,
      end: marks.firstTokenAt,
      input: {
        phase: 'runtime-init-to-first-token',
        from: 'stdinWriteEndAt',
        to: 'firstTokenAt',
      },
      output: {
        status:
          marks.firstTokenAt === undefined ? 'unmeasured' : 'first_token_seen',
      },
      metadata: { boundary: 'stdinWriteEndAt/modelCallStartAt/processSpawnedAt -> firstTokenAt' },
    },
    {
      name: opts.modelCallName ?? 'agent-call',
      start: marks.modelCallStartAt,
      end: runEnd,
      input: {
        phase: opts.modelCallName ?? 'agent-call',
        model: ctx.turn?.model ?? 'unknown',
        agent: ctx.agentId ?? 'unknown',
        tool_call_count: ctx.eventsSummary.toolCalls,
        generation_observation:
          (opts.modelCallName ?? 'agent-call') === 'agent-call',
      },
      output: {
        status: ctx.run.status,
        error_code: ctx.run.errorCode,
        token_usage: tokenUsageSummary(ctx.message.usage),
        cost: phaseCosts.agent_call,
        tool_call_count: ctx.eventsSummary.toolCalls,
      },
      metadata: {
        boundary: 'modelCallStartAt -> run.endedAt',
        toolCallCount: ctx.eventsSummary.toolCalls,
      },
    },
    {
      name: 'stream-output',
      start: marks.firstTokenAt,
      end: marks.finalizeStartAt ?? runEnd,
      input: {
        phase: 'stream-output',
        from: 'firstTokenAt',
        to: 'finalizeStartAt',
      },
      output: {
        status: ctx.run.status,
        output_redacted: true,
        artifact_blocks_redacted: true,
      },
      metadata: { boundary: 'firstTokenAt -> finalizeStartAt' },
    },
    {
      name: 'artifact-write',
      start: marks.firstArtifactWriteAt,
      end: marks.finalizeStartAt ?? runEnd,
      input: {
        phase: 'artifact-write',
        from: 'firstArtifactWriteAt',
        to: 'finalizeStartAt',
      },
      output: {
        status:
          marks.firstArtifactWriteAt === undefined
            ? 'not_seen'
            : 'artifact_write_seen',
        artifact_count: ctx.artifacts.length,
      },
      metadata: { boundary: 'firstArtifactWriteAt -> finalizeStartAt' },
    },
    {
      name: 'finalize',
      start: marks.finalizeStartAt,
      end: runEnd,
      input: {
        phase: 'finalize',
        artifact_manifest_enabled: ctx.prefs.metrics === true && ctx.prefs.content === true,
      },
      output: {
        status: ctx.run.status,
        artifact_count: ctx.artifacts.length,
        attachment_count: ctx.attachmentManifest?.length ?? 0,
        manifest_completeness:
          ctx.manifestCompleteness ??
          (ctx.prefs.metrics === true && ctx.prefs.content === true ? 'unavailable' : 'off'),
      },
      metadata: { boundary: 'finalizeStartAt -> run.endedAt' },
    },
  ];

  return definitions
    .map((definition) =>
      timingSpanBody({
        traceId: ctx.run.runId,
        parentObservationId,
        runId: ctx.run.runId,
        ...definition,
      }),
    )
    .filter((body): body is Record<string, unknown> => body !== null);
}
