/** @module langfuse-trace/payload/diagnostics
 * Tool-performance, artifact-write, and semantic-phase diagnostics for the Langfuse trace.
 * Imports only from `core/`; consumed by `trace-payload.ts` through `buildPerformanceDiagnostics`.
 */
import {
  durationMs,
  validTimestamp,
} from '../core/index.js';
import type { ReportContext, ToolCallSummary } from '../core/index.js';

/**
 * Aggregates per-tool-name call counts, error counts, and duration stats
 * (min / max / avg / total) from the run's tool-call list.
 * Retry detection is marked `not_instrumented` because tool spans do not yet
 * carry retry-group or attempt indexes.
 *
 * @param tools - The run's raw tool-call summary records, or `undefined`.
 * @returns An aggregate performance record grouped by tool name.
 */
export function buildToolPerformanceDiagnostics(
  tools: ToolCallSummary[] | undefined,
): Record<string, unknown> {
  const list = tools ?? [];
  const byName = new Map<
    string,
    {
      tool_name: string;
      call_count: number;
      error_count: number;
      total_duration_ms: number;
      max_duration_ms: number;
      min_duration_ms: number;
      failure_types: Set<string>;
    }
  >();

  for (const tool of list) {
    const d = durationMs(tool.startedAt, tool.endedAt);
    const current =
      byName.get(tool.name) ??
      {
        tool_name: tool.name,
        call_count: 0,
        error_count: 0,
        total_duration_ms: 0,
        max_duration_ms: 0,
        min_duration_ms: Number.POSITIVE_INFINITY,
        failure_types: new Set<string>(),
      };
    current.call_count += 1;
    current.total_duration_ms += d;
    current.max_duration_ms = Math.max(current.max_duration_ms, d);
    current.min_duration_ms = Math.min(current.min_duration_ms, d);
    if (tool.isError === true) {
      current.error_count += 1;
      current.failure_types.add('tool_result_error');
    }
    byName.set(tool.name, current);
  }

  return {
    tool_call_count: list.length,
    total_tool_duration_ms: list.reduce(
      (sum, tool) => sum + durationMs(tool.startedAt, tool.endedAt),
      0,
    ),
    retry_count_available: false,
    retry_count: null,
    retry_detection: 'not_instrumented',
    retry_unavailable_reason:
      'tool spans do not yet carry retry-group or attempt indexes',
    by_tool: [...byName.values()].map((entry) => ({
      tool_name: entry.tool_name,
      call_count: entry.call_count,
      error_count: entry.error_count,
      total_duration_ms: entry.total_duration_ms,
      avg_duration_ms:
        entry.call_count > 0
          ? Math.round(entry.total_duration_ms / entry.call_count)
          : 0,
      max_duration_ms: entry.max_duration_ms,
      min_duration_ms:
        Number.isFinite(entry.min_duration_ms) ? entry.min_duration_ms : 0,
      retry_count_available: false,
      retry_count: null,
      failure_types:
        entry.failure_types.size > 0 ? [...entry.failure_types] : ['none'],
    })),
  };
}

/**
 * Correlates artifact records with Write tool spans to produce aggregate size,
 * duration, and bytes-per-ms throughput stats.
 * Correlation is heuristic — total Write time vs total artifact bytes — because
 * individual artifacts are not yet linked to individual Write call IDs.
 *
 * @param ctx - The run's {@link ReportContext}.
 * @returns An artifact-write diagnostic record including per-artifact slug/type/size.
 */
export function buildArtifactWriteDiagnostics(
  ctx: ReportContext,
): Record<string, unknown> {
  const writeTools = (ctx.tools ?? []).filter((tool) => tool.name === 'Write');
  const totalArtifactSizeBytes = ctx.artifacts.reduce(
    (sum, artifact) => sum + artifact.sizeBytes,
    0,
  );
  const writeDurationMs = writeTools.reduce(
    (sum, tool) => sum + durationMs(tool.startedAt, tool.endedAt),
    0,
  );
  return {
    artifact_count: ctx.artifacts.length,
    total_artifact_size_bytes: totalArtifactSizeBytes,
    write_tool_count: writeTools.length,
    write_tool_duration_ms: writeDurationMs,
    bytes_per_write_ms:
      writeDurationMs > 0
        ? Math.round(totalArtifactSizeBytes / writeDurationMs)
        : null,
    correlation_status:
      ctx.artifacts.length > 0 && writeTools.length > 0
        ? 'heuristic_by_write_tool_total'
        : 'unavailable',
    correlation_unavailable_reason:
      ctx.artifacts.length > 0 && writeTools.length > 0
        ? undefined
        : 'artifact files are not yet linked to individual Write tool ids',
    artifacts: ctx.artifacts.map((artifact) => ({
      slug: artifact.slug,
      type: artifact.type,
      size_bytes: artifact.sizeBytes,
    })),
  };
}

/**
 * Maps low-level timing marks to named product phases and documents which
 * semantic phases (plan, critique, repair, etc.) are not yet instrumented.
 * Each measurable phase gets a `{ duration_ms, status: "measured" }` entry;
 * unmeasured phases get `{ duration_ms: null, status: "unmeasured" }`.
 *
 * @param ctx - The run's {@link ReportContext}.
 * @returns A record of measured phases plus a list of missing semantic phases.
 */
export function buildSemanticPhaseDiagnostics(ctx: ReportContext): Record<string, unknown> {
  const marks = ctx.run.timingMarks ?? {};
  const measured: Record<string, unknown> = {};
  const addMeasured = (
    name: string,
    start: number | undefined,
    end: number | undefined,
  ) => {
    const s = validTimestamp(start);
    const e = validTimestamp(end);
    measured[name] =
      s !== undefined && e !== undefined && e >= s
        ? { duration_ms: Math.round(e - s), status: 'measured' }
        : { duration_ms: null, status: 'unmeasured' };
  };
  addMeasured('prompt-build', marks.promptBuildStartAt, marks.promptBuildEndAt);
  addMeasured('launch-preflight', marks.launchPreflightStartAt, marks.launchPreflightEndAt);
  addMeasured('process-spawn', marks.processSpawnStartedAt, marks.processSpawnedAt);
  addMeasured('stdin-write', marks.stdinWriteStartAt, marks.stdinWriteEndAt);
  addMeasured('runtime-init-to-first-model-event', marks.stdinWriteEndAt ?? marks.modelCallStartAt ?? marks.processSpawnedAt, marks.firstModelEventAt);
  addMeasured('runtime-init-to-first-token', marks.stdinWriteEndAt ?? marks.modelCallStartAt ?? marks.processSpawnedAt, marks.firstTokenAt);
  addMeasured('agent-call', marks.modelCallStartAt, ctx.run.endedAt);
  addMeasured('stream-output', marks.firstTokenAt, marks.finalizeStartAt ?? ctx.run.endedAt);
  addMeasured('artifact-write', marks.firstArtifactWriteAt, marks.finalizeStartAt ?? ctx.run.endedAt);
  addMeasured('finalize', marks.finalizeStartAt, ctx.run.endedAt);
  return {
    measured,
    semantic_phase_timing_status: 'partial',
    missing_semantic_phases: [
      'brief-intake',
      'route-task-kind',
      'resolve-skill',
      'resolve-design-system',
      'plan',
      'generate-artifact',
      'critique',
      'repair',
      'preview-verify',
      'export-finalize',
      'evaluator',
    ],
    missing_reason:
      'runtime currently emits low-level timing marks but not all product semantic phase boundaries',
  };
}

/**
 * Top-level diagnostic aggregator: combines raw run timings, tool-performance
 * stats, artifact-write diagnostics, preview-verify status (not yet instrumented),
 * and semantic-phase diagnostics into one object.
 * Placed in both the generation metadata and the trace metadata by `trace-payload.ts`.
 *
 * @param ctx - The run's {@link ReportContext}.
 * @returns A composite performance-diagnostics record.
 */
export function buildPerformanceDiagnostics(ctx: ReportContext): Record<string, unknown> {
  return {
    timings: ctx.run.timings,
    tool_performance: buildToolPerformanceDiagnostics(ctx.tools),
    artifact_write: buildArtifactWriteDiagnostics(ctx),
    preview_verify: {
      status: 'not_instrumented',
      screenshot_check: 'not_reported',
      responsive_check: 'not_reported',
      html_parse_check: 'not_reported',
      note: 'artifact self-checks may appear in assistant output, but are not yet structured observations',
    },
    semantic_phases: buildSemanticPhaseDiagnostics(ctx),
  };
}
