/** @module langfuse-trace/payload/trace-payload
 * Main `buildTracePayload` assembler: composes the full Langfuse ingestion batch
 * (trace, agent-run span, optional generation or runtime span, timing spans,
 * agent-event events, tool spans, and artifact/error events) from a `ReportContext`.
 * Additionally imports from `config/` to derive Langfuse delivery state and read the sink config.
 */
import { randomUUID } from 'node:crypto';

import {
  buildPromptStackFlatMetadata,
  promptStackWithoutContent,
  structuredPromptStackInput,
} from '../../prompt-telemetry.js';
import { readTelemetryEnvironment } from '../../telemetry-environment.js';
import {
  deriveLangfuseDeliveryState,
  readTelemetrySinkConfig,
} from '../config/index.js';
import {
  ARTIFACTS_MAX_ITEMS,
  INPUT_MAX_BYTES,
  OUTPUT_MAX_BYTES,
  SESSION_ID_MAX,
  TOOL_INPUT_MAX_BYTES,
  TOOL_OUTPUT_MAX_BYTES,
  cappedManifestEntries,
  durationMs,
  manifestTruncated,
  redactArtifactBlocks,
  traceSafeToolPayload,
  truncate,
} from '../core/index.js';
import type { ReportContext } from '../core/index.js';
import { buildCostBreakdown, buildPromptStackBlameMetadata } from './cost.js';
import { buildPerformanceDiagnostics } from './diagnostics.js';
import { buildTagList, shouldCreateGenerationObservation } from './summaries.js';
import { buildTimingSpanBodies } from './timing.js';

/**
 * Assembles the complete Langfuse ingestion batch for one agent run.
 * The batch always contains a `trace-create` and an `agent-run` span-create.
 * When {@link shouldCreateGenerationObservation} is true, a `generation-create` is appended;
 * otherwise a plain `agent-runtime` span is used to preserve the observation hierarchy.
 * Phase timing spans (from {@link buildTimingSpanBodies}), per-event events,
 * per-tool spans, and optional artifact-summary and run-error events follow in order.
 * Content (prompt text, output, tool I/O) is only included when both
 * `ctx.prefs.metrics` and `ctx.prefs.content` are `true`.
 *
 * @param ctx - The run's {@link ReportContext}.
 * @returns An ordered array of Langfuse batch items ready for the ingestion API.
 */
export function buildTracePayload(ctx: ReportContext): unknown[] {
  const wantsContent = ctx.prefs.metrics === true && ctx.prefs.content === true;
  const wantsArtifacts = wantsContent;

  const sessionId =
    ctx.conversationId.length <= SESSION_ID_MAX ? ctx.conversationId : undefined;

  const startTimeIso = new Date(ctx.run.startedAt).toISOString();
  const endTimeIso = new Date(ctx.run.endedAt).toISOString();
  const nowIso = new Date().toISOString();

  const inputText = wantsContent
    ? truncate(ctx.message.prompt, INPUT_MAX_BYTES)
    : undefined;
  const outputText = wantsContent
    ? truncate(redactArtifactBlocks(ctx.message.output), OUTPUT_MAX_BYTES)
    : undefined;

  const artifactsList = wantsArtifacts
    ? ctx.artifacts.slice(0, ARTIFACTS_MAX_ITEMS)
    : undefined;
  const artifactsTruncated =
    wantsArtifacts && ctx.artifacts.length > ARTIFACTS_MAX_ITEMS
      ? true
      : undefined;
  const attachmentManifest = wantsArtifacts
    ? cappedManifestEntries(ctx.attachmentManifest)
    : undefined;
  const attachmentManifestTruncated = wantsArtifacts
    ? manifestTruncated(ctx.attachmentManifest)
    : undefined;
  const artifactManifest = wantsArtifacts
    ? cappedManifestEntries(ctx.artifactManifest)
    : undefined;
  const artifactManifestTruncated = wantsArtifacts
    ? manifestTruncated(ctx.artifactManifest)
    : undefined;
  const inputTextSnapshotManifest = wantsArtifacts && wantsContent
    ? cappedManifestEntries(ctx.inputTextSnapshotManifest)
    : undefined;
  const inputTextSnapshotManifestTruncated = wantsArtifacts && wantsContent
    ? manifestTruncated(ctx.inputTextSnapshotManifest)
    : undefined;

  const tokens = ctx.message.usage
    ? {
        input: ctx.message.usage.inputTokens,
        inputProvider: ctx.message.usage.inputTokensProvider,
        inputEffective: ctx.message.usage.inputTokensEffective,
        output: ctx.message.usage.outputTokens,
        total: ctx.message.usage.totalTokens,
        cacheReadInput: ctx.message.usage.cacheReadInputTokens,
        cacheCreationInput: ctx.message.usage.cacheCreationInputTokens,
        uncachedInput: ctx.message.usage.uncachedInputTokens,
        estimatedContext: ctx.message.usage.estimatedContextTokens,
        cacheHitRatio: ctx.message.usage.cacheHitRatio,
        cacheTokenSource: ctx.message.usage.cacheTokenSource,
      }
    : undefined;

  const usage = ctx.message.usage
    ? {
        input: ctx.message.usage.inputTokensEffective ?? ctx.message.usage.inputTokens,
        output: ctx.message.usage.outputTokens,
        total: ctx.message.usage.totalTokens,
        unit: 'TOKENS' as const,
      }
    : undefined;
  const costBreakdown = buildCostBreakdown(ctx);
  const performanceDiagnostics = buildPerformanceDiagnostics(ctx);

  const success = ctx.run.status === 'succeeded';
  const traceId = ctx.run.runId;
  const langfuseDelivery =
    ctx.langfuse ?? deriveLangfuseDeliveryState(ctx.prefs, readTelemetrySinkConfig());
  const agentSpanId = `${ctx.run.runId}-agent`;
  const generationId = `${ctx.run.runId}-gen`;
  const createGeneration = shouldCreateGenerationObservation(ctx);
  const operationSpanId = createGeneration
    ? generationId
    : `${ctx.run.runId}-runtime`;
  const promptStack = ctx.promptTelemetry
    ? wantsContent
      ? ctx.promptTelemetry
      : promptStackWithoutContent(ctx.promptTelemetry)
    : undefined;
  const promptStackFlatMetadata = promptStack
    ? buildPromptStackFlatMetadata(promptStack)
    : {};
  const promptStackBlameMetadata = buildPromptStackBlameMetadata(
    promptStack,
    ctx.message.usage,
    ctx.run.timings,
  );
  const generationInput = promptStack
    ? structuredPromptStackInput(promptStack)
    : inputText;

  // Trace metadata is the queryable + exportable fact-sheet for each turn.
  // Anything we want to slice on for evals or dataset construction lives
  // here. Fields are flat (Langfuse stores it as JSON but indexes shallow
  // keys best). All entries are anonymous — no PII, no credentials.
  const traceMetadata: Record<string, unknown> = {
    success,
    env: readTelemetryEnvironment(),
    status: ctx.run.status,
    error: ctx.run.error ?? undefined,
    error_code: ctx.run.errorCode,
    langfuse_trace_id: traceId,
    ...langfuseDelivery,
    ...(ctx.run.failure ?? {}),
    ...(ctx.run.timings ?? {}),
    stderr: ctx.run.stderr,
    stdout: ctx.run.stdout,
    diagnostics: ctx.run.diagnostics,
    eventsSummary: ctx.eventsSummary,
    tokens,
    cost_usd: costBreakdown.cost_usd,
    currency: costBreakdown.currency,
    pricing_version: costBreakdown.pricing_version,
    cost_source: costBreakdown.cost_source,
    cost_status: costBreakdown.cost_status,
    cost_breakdown: costBreakdown,
    performance_diagnostics: performanceDiagnostics,
    artifacts: artifactsList,
    artifactsTruncated,
    attachment_manifest: attachmentManifest,
    attachment_manifest_truncated: attachmentManifestTruncated,
    artifact_manifest: artifactManifest,
    artifact_manifest_truncated: artifactManifestTruncated,
    input_text_snapshot_manifest: inputTextSnapshotManifest,
    input_text_snapshot_manifest_truncated: inputTextSnapshotManifestTruncated,
    trace_object_summary: ctx.traceObjectSummary,
    manifest_completeness: wantsArtifacts
      ? (ctx.manifestCompleteness ?? 'unavailable')
      : undefined,
    projectId: ctx.projectId || undefined,
    agent: ctx.agentId,
    model: ctx.turn?.model,
    reasoning: ctx.turn?.reasoning,
    skillId: ctx.turn?.skillId,
    designSystemId: ctx.turn?.designSystemId,
    designSystemDigest: ctx.turn?.designSystemDigest,
    designSystemSelectionSource: ctx.turn?.designSystemSelectionSource,
    stablePromptHash: ctx.turn?.promptCache?.stablePromptHash,
    stablePromptCacheHit: ctx.turn?.promptCache?.hit,
    stablePromptCacheMissReason: ctx.turn?.promptCache?.missReason,
    appVersion: ctx.runtime?.appVersion,
    appChannel: ctx.runtime?.appChannel,
    packaged: ctx.runtime?.packaged,
    nodeVersion: ctx.runtime?.nodeVersion,
    os: ctx.runtime?.os,
    osRelease: ctx.runtime?.osRelease,
    arch: ctx.runtime?.arch,
    clientType: ctx.runtime?.clientType,
    ...promptStackFlatMetadata,
    ...promptStackBlameMetadata,
  };

  // Generation-level model parameters mirror the Langfuse schema so the UI
  // shows them in the dedicated Model Parameters card and filters work.
  const modelParameters: Record<string, unknown> | undefined =
    ctx.turn?.reasoning ? { reasoning: ctx.turn.reasoning } : undefined;
  const timingSpanBodies = buildTimingSpanBodies(ctx, operationSpanId, {
    modelCallName: createGeneration ? 'agent-call' : 'runtime-call',
    ...(promptStack ? { promptStack } : {}),
  });
  const toolParentObservationId = timingSpanBodies.some(
    (span) => span.name === 'agent-call',
  )
    ? `${ctx.run.runId}-phase-agent-call`
    : agentSpanId;
  const agentEventParentObservationId = toolParentObservationId;

  const batch: unknown[] = [
    {
      id: randomUUID(),
      type: 'trace-create',
      timestamp: nowIso,
      body: {
        id: traceId,
        name: 'open-design-turn',
        sessionId,
        userId: ctx.installationId ?? undefined,
        tags: buildTagList(ctx),
        input: inputText,
        output: outputText,
        metadata: traceMetadata,
        timestamp: startTimeIso,
      },
    },
    {
      id: randomUUID(),
      type: 'span-create',
      timestamp: nowIso,
      body: {
        id: agentSpanId,
        traceId,
        name: 'agent-run',
        startTime: startTimeIso,
        endTime: endTimeIso,
        input: inputText,
        output: outputText,
        level: success ? 'DEFAULT' : 'ERROR',
        statusMessage: ctx.run.error ?? undefined,
        metadata: {
          status: ctx.run.status,
          messageId: ctx.message.messageId || undefined,
          durationMs: ctx.eventsSummary.durationMs,
          toolCalls: ctx.eventsSummary.toolCalls,
          errors: ctx.eventsSummary.errors,
          cost_usd: costBreakdown.cost_usd,
          currency: costBreakdown.currency,
          cost_status: costBreakdown.cost_status,
        },
      },
    },
  ];

  if (createGeneration) {
    batch.push({
      id: randomUUID(),
      type: 'generation-create',
      timestamp: nowIso,
      body: {
        id: generationId,
        traceId,
        parentObservationId: agentSpanId,
        name: 'llm',
        // model / modelParameters are first-class on Langfuse generations
        // (used for token-cost lookup, UI grouping, eval filters), so set
        // them at the body level instead of stuffing them into metadata.
        model: ctx.turn?.model,
        modelParameters,
        startTime: startTimeIso,
        endTime: endTimeIso,
        input: generationInput,
        output: outputText,
        level: success ? 'DEFAULT' : 'ERROR',
        statusMessage: ctx.run.error ?? undefined,
        usage,
        metadata: {
          durationMs: ctx.eventsSummary.durationMs,
          cost_usd: costBreakdown.cost_usd,
          currency: costBreakdown.currency,
          pricing_version: costBreakdown.pricing_version,
          cost_source: costBreakdown.cost_source,
          cost_breakdown: costBreakdown,
          performance_diagnostics: performanceDiagnostics,
          ...promptStackFlatMetadata,
          ...promptStackBlameMetadata,
        },
      },
    });
  } else {
    batch.push({
      id: randomUUID(),
      type: 'span-create',
      timestamp: nowIso,
      body: {
        id: operationSpanId,
        traceId,
        parentObservationId: agentSpanId,
        name: 'agent-runtime',
        startTime: startTimeIso,
        endTime: endTimeIso,
        input: generationInput,
        output: outputText,
        level: 'ERROR',
        statusMessage: ctx.run.error ?? undefined,
        metadata: {
          durationMs: ctx.eventsSummary.durationMs,
          cost_usd: costBreakdown.cost_usd,
          currency: costBreakdown.currency,
          pricing_version: costBreakdown.pricing_version,
          cost_source: costBreakdown.cost_source,
          cost_breakdown: costBreakdown,
          performance_diagnostics: performanceDiagnostics,
          ...promptStackFlatMetadata,
          ...promptStackBlameMetadata,
          reason: 'no_model_generation',
        },
      },
    });
  }

  for (const span of timingSpanBodies) {
    batch.push({
      id: randomUUID(),
      type: 'span-create',
      timestamp: nowIso,
      body: span,
    });
  }

  if (ctx.agentEvents?.length) {
    for (const event of ctx.agentEvents) {
      batch.push({
        id: randomUUID(),
        type: 'event-create',
        timestamp: nowIso,
        body: {
          id: `${ctx.run.runId}-agent-event-${event.id}`,
          traceId,
          parentObservationId: agentEventParentObservationId,
          name: event.name,
          startTime: new Date(event.timestamp).toISOString(),
          input: event.input,
          output: event.output,
          level: event.level ?? 'DEFAULT',
          statusMessage: event.statusMessage,
          metadata: event.metadata,
        },
      });
    }
  }

  if (ctx.tools?.length) {
    for (const tool of ctx.tools) {
      const toolSpanId = `${ctx.run.runId}-tool-${tool.id}`;
      const toolStartedAt = new Date(tool.startedAt).toISOString();
      const toolEndedAt = new Date(tool.endedAt).toISOString();
      const toolDurationMs = durationMs(tool.startedAt, tool.endedAt);
      const toolInput = wantsContent
        ? truncate(
            traceSafeToolPayload(tool.name, 'input', tool.input),
            TOOL_INPUT_MAX_BYTES,
          )
        : undefined;
      const toolOutput = wantsContent
        ? truncate(
            traceSafeToolPayload(tool.name, 'output', tool.output),
            TOOL_OUTPUT_MAX_BYTES,
          )
        : undefined;
      batch.push({
        id: randomUUID(),
        type: 'span-create',
        timestamp: nowIso,
        body: {
          id: toolSpanId,
          traceId,
          parentObservationId: toolParentObservationId,
          name: `tool:${tool.name}`,
          startTime: toolStartedAt,
          endTime: toolEndedAt,
          input: toolInput,
          output: toolOutput,
          level: tool.isError ? 'ERROR' : 'DEFAULT',
          metadata: {
            toolCallId: tool.id,
            toolName: tool.name,
            durationMs: toolDurationMs,
            hasInput: tool.input !== undefined,
            hasOutput: tool.output !== undefined,
            isError: tool.isError === true,
            failureType: tool.isError === true ? 'tool_result_error' : 'none',
            retryCount: null,
            retryDetection: 'not_instrumented',
          },
        },
      });
    }
  }

  if (artifactsList && (artifactsList.length > 0 || artifactsTruncated)) {
    batch.push({
      id: randomUUID(),
      type: 'event-create',
      timestamp: nowIso,
      body: {
        id: `${ctx.run.runId}-artifacts`,
        traceId,
        parentObservationId: agentSpanId,
        name: 'artifact-summary',
        startTime: endTimeIso,
        input: {
          source: 'agent_generated_artifacts',
          artifact_count: artifactsList.length,
          artifact_manifest_enabled: wantsArtifacts,
        },
        output: {
          artifacts: artifactsList,
          artifactsTruncated,
          manifest_completeness: wantsArtifacts
            ? (ctx.manifestCompleteness ?? 'unavailable')
            : 'off',
        },
        metadata: {
          artifacts: artifactsList,
          artifactsTruncated,
          artifact_write_diagnostics: performanceDiagnostics.artifact_write,
        },
      },
    });
  }

  if (!success || ctx.eventsSummary.errors > 0) {
    batch.push({
      id: randomUUID(),
      type: 'event-create',
      timestamp: nowIso,
      body: {
        id: `${ctx.run.runId}-error`,
        traceId,
        parentObservationId: agentSpanId,
        name: success ? 'error-summary' : 'run-error',
        startTime: endTimeIso,
        level: 'ERROR',
        statusMessage: ctx.run.error ?? undefined,
        metadata: {
          status: ctx.run.status,
          errors: ctx.eventsSummary.errors,
        },
      },
    });
  }

  return batch;
}
