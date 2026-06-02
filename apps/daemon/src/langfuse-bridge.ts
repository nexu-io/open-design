// Daemon ↔ langfuse-trace bridge.
//
// langfuse-trace.ts is dependency-free and works on a flat ReportContext.
// This module is the glue that pulls the pieces from daemon-internal data
// sources (the runs map, SQLite, app-config.json) into that shape and fires
// the report. Lives here rather than inside langfuse-trace.ts so that the
// trace module stays unit-testable without booting a database.
//
// See: specs/change/20260507-langfuse-telemetry/spec.md

import os from 'node:os';

import { readAppConfig } from './app-config.js';
import type { AppVersionInfo } from './app-version.js';
import { listMessages } from './db.js';
import {
  readTelemetrySinkConfig,
  reportRunCompleted,
  reportRunFeedback,
  type ArtifactSummary,
  type EventsSummary,
  type FeedbackReportContext,
  type MessageSummary,
  type ReportContext,
  type RuntimeInfo,
  type ToolCallSummary,
  type TurnInfo,
} from './langfuse-trace.js';
import { redactSecrets } from './redact.js';
import {
  hasExplicitRequestedModelForAnalytics,
  scanRunEventsForUsageAnalytics,
  summarizeRunTimingAnalytics,
  type RunTelemetryTimestamps,
  type RunUsageAnalytics,
} from './run-analytics-observability.js';
import { collectStderrTailSummary } from './run-diagnostics.js';
import { classifyRunFailure } from './run-failure-classification.js';
import { deriveRunErrorCode, runResultFromStatus } from './run-result.js';

interface DaemonRunRecord {
  id: string;
  projectId: string | null;
  conversationId: string | null;
  assistantMessageId: string | null;
  agentId: string | null;
  status: string;
  exitCode?: number | null;
  signal?: string | null;
  error?: string | null;
  errorCode?: string | null;
  analyticsTelemetry?: RunTelemetryTimestamps | null;
  createdAt: number;
  updatedAt: number;
  events: Array<{
    id: number;
    event: string;
    data: unknown;
    timestamp?: number;
  }>;
  // The fields below are stashed by `startChatRun` (and the POST /api/runs
  // handler) at entry time so the report path doesn't need to reach back
  // into chatBody / req across the createChatRunService boundary.
  userPrompt?: string;
  model?: string;
  reasoning?: string;
  skillId?: string;
  designSystemId?: string;
  clientType?: 'desktop' | 'web' | 'unknown';
}

export interface ReportRunCompletedFromDaemonOpts {
  db: unknown;
  dataDir: string;
  run: DaemonRunRecord;
  persistedRunStatus?: string;
  persistedEndedAt?: number;
  /** App version info — collected once at daemon startup and reused. */
  appVersion?: AppVersionInfo | null;
  fetchImpl?: typeof fetch;
}

/**
 * Returns the host/runtime info that doesn't change inside one daemon
 * process. Cheap to call repeatedly — cached at module level.
 */
let cachedRuntime: RuntimeInfo | undefined;
function getRuntimeInfo(appVersion?: AppVersionInfo | null): RuntimeInfo {
  if (cachedRuntime && !appVersion) return cachedRuntime;
  const info: RuntimeInfo = {
    nodeVersion: process.version,
    os: os.platform(),
    osRelease: os.release(),
    arch: os.arch(),
  };
  if (appVersion) {
    info.appVersion = appVersion.version;
    info.appChannel = appVersion.channel;
    info.packaged = appVersion.packaged;
  }
  cachedRuntime = info;
  return info;
}

function turnInfoFromRun(
  run: DaemonRunRecord,
  agentReportedModel: string | null,
): TurnInfo | undefined {
  const turn: TurnInfo = {};
  // `run.model` is the request-side selection and can be the `default`
  // placeholder. When the request did not pin an explicit model, prefer the
  // model the agent actually reported so Langfuse traces are labeled with the
  // resolved model — matching the agent-reported fallback `server.ts` already
  // applies to PostHog `run_finished` (and so the two sinks agree per run).
  if (hasExplicitRequestedModelForAnalytics(run.model)) {
    turn.model = run.model;
  } else if (agentReportedModel && agentReportedModel.trim().length > 0) {
    turn.model = agentReportedModel.trim();
  }
  // No fallback to a non-explicit `run.model` here. When the request never
  // pinned a concrete model and the agent never reported one, forwarding the
  // request-side `default` placeholder would label the generation
  // `model: "default"` — and Langfuse treats `generation.model` as a
  // first-class grouping/cost dimension, so that creates a fake model bucket
  // instead of leaving the model unknown.
  if (run.reasoning) turn.reasoning = run.reasoning;
  if (run.skillId) turn.skillId = run.skillId;
  if (run.designSystemId) turn.designSystemId = run.designSystemId;
  return Object.keys(turn).length > 0 ? turn : undefined;
}

function summarizeEvents(
  events: DaemonRunRecord['events'],
  durationMs: number,
): EventsSummary {
  let toolCalls = 0;
  let errors = 0;
  for (const rec of events) {
    const data = rec.data as { type?: string } | null | undefined;
    if (rec.event === 'agent') {
      const t = data?.type;
      if (t === 'tool_use') toolCalls += 1;
      else if (t === 'error') errors += 1;
    } else if (rec.event === 'error') {
      errors += 1;
    }
  }
  return { toolCalls, errors, durationMs };
}

function messageUsageFromAnalytics(
  usage: RunUsageAnalytics,
): MessageSummary['usage'] | undefined {
  // Gate on *any* token field being present, not just input/output. Providers
  // that only report a total (or only cache counts) still produce a usage
  // payload from `scanRunEventsForUsageAnalytics`; dropping it here would lose
  // token visibility in the per-trace Langfuse UI and drift from the
  // `run_finished` numbers PostHog already ships for the same run.
  const hasAnyTokenField =
    usage.input_tokens !== undefined ||
    usage.input_tokens_provider !== undefined ||
    usage.input_tokens_effective !== undefined ||
    usage.output_tokens !== undefined ||
    usage.total_tokens !== undefined ||
    usage.cache_read_input_tokens !== undefined ||
    usage.cache_creation_input_tokens !== undefined ||
    usage.uncached_input_tokens !== undefined ||
    usage.estimated_context_tokens !== undefined;
  if (!hasAnyTokenField) {
    return undefined;
  }
  const out: NonNullable<MessageSummary['usage']> = {};
  if (usage.input_tokens !== undefined) out.inputTokens = usage.input_tokens;
  if (usage.input_tokens_provider !== undefined) {
    out.inputTokensProvider = usage.input_tokens_provider;
  }
  if (usage.input_tokens_effective !== undefined) {
    out.inputTokensEffective = usage.input_tokens_effective;
  }
  if (usage.output_tokens !== undefined) out.outputTokens = usage.output_tokens;
  if (usage.total_tokens !== undefined) out.totalTokens = usage.total_tokens;
  if (usage.cache_read_input_tokens !== undefined) {
    out.cacheReadInputTokens = usage.cache_read_input_tokens;
  }
  if (usage.cache_creation_input_tokens !== undefined) {
    out.cacheCreationInputTokens = usage.cache_creation_input_tokens;
  }
  if (usage.uncached_input_tokens !== undefined) {
    out.uncachedInputTokens = usage.uncached_input_tokens;
  }
  if (usage.estimated_context_tokens !== undefined) {
    out.estimatedContextTokens = usage.estimated_context_tokens;
  }
  if (usage.cache_hit_ratio !== undefined) {
    out.cacheHitRatio = usage.cache_hit_ratio;
  }
  out.cacheTokenSource = usage.cache_token_source;
  return out;
}

function eventTimestamp(
  rec: DaemonRunRecord['events'][number],
  fallback: number,
): number {
  return typeof rec.timestamp === 'number' && Number.isFinite(rec.timestamp)
    ? rec.timestamp
    : fallback;
}

function serializeToolPayload(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return redactSecrets(value);
  try {
    return redactSecrets(JSON.stringify(value));
  } catch {
    return redactSecrets(String(value));
  }
}

function collectToolCalls(
  events: DaemonRunRecord['events'],
  runStartedAt: number,
  runEndedAt: number,
): ToolCallSummary[] {
  const tools = new Map<string, ToolCallSummary>();
  for (const rec of events) {
    if (rec.event !== 'agent') continue;
    const data = rec.data as
      | {
          type?: string;
          id?: unknown;
          name?: unknown;
          input?: unknown;
          toolUseId?: unknown;
          content?: unknown;
          isError?: unknown;
        }
      | null
      | undefined;
    if (data?.type === 'tool_use' && typeof data.id === 'string') {
      const timestamp = eventTimestamp(rec, runStartedAt + rec.id);
      const summary: ToolCallSummary = {
        id: data.id,
        name: typeof data.name === 'string' && data.name ? data.name : 'unknown',
        startedAt: timestamp,
        endedAt: timestamp,
      };
      const input = serializeToolPayload(data.input);
      if (input !== undefined) summary.input = input;
      tools.set(data.id, summary);
    } else if (
      data?.type === 'tool_result' &&
      typeof data.toolUseId === 'string'
    ) {
      const timestamp = eventTimestamp(rec, runStartedAt + rec.id);
      const existing = tools.get(data.toolUseId);
      const summary =
        existing ??
        ({
          id: data.toolUseId,
          name: 'unknown',
          startedAt: timestamp,
          endedAt: timestamp,
        } satisfies ToolCallSummary);
      summary.endedAt = Math.max(summary.startedAt, timestamp);
      const output = serializeToolPayload(data.content);
      if (output !== undefined) summary.output = output;
      summary.isError = data.isError === true;
      tools.set(data.toolUseId, summary);
    }
  }

  return [...tools.values()].map((tool) => {
    const startedAt = Math.min(Math.max(tool.startedAt, runStartedAt), runEndedAt);
    return {
      ...tool,
      startedAt,
      endedAt: Math.min(Math.max(tool.endedAt, startedAt), runEndedAt),
    };
  });
}

function summarizeProducedFiles(items: unknown): ArtifactSummary[] {
  if (!Array.isArray(items)) return [];
  const out: ArtifactSummary[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name : '';
    const filePath = typeof obj.path === 'string' ? obj.path : '';
    const slug = filePath || name;
    if (!slug) continue;
    out.push({
      slug,
      type: typeof obj.kind === 'string' ? obj.kind : 'unknown',
      sizeBytes: typeof obj.size === 'number' ? obj.size : 0,
    });
  }
  return out;
}

function pickRunError(
  run: DaemonRunRecord,
  status: ReportContext['run']['status'],
): string | undefined {
  if (status === 'succeeded') return undefined;
  for (let i = run.events.length - 1; i >= 0; i -= 1) {
    const rec = run.events[i]!;
    if (rec.event === 'error') {
      const data = rec.data as
        | { error?: { message?: unknown }; message?: unknown }
        | null
        | undefined;
      const msg =
        (data?.error && typeof data.error.message === 'string'
          ? data.error.message
          : undefined) ??
        (typeof data?.message === 'string' ? data.message : undefined);
      if (msg) return msg.slice(0, 1000);
    }
  }
  return undefined;
}

function normalizeStatus(s: string): ReportContext['run']['status'] {
  if (s === 'succeeded' || s === 'failed' || s === 'canceled') return s;
  return 'failed';
}

export async function reportRunCompletedFromDaemon(
  opts: ReportRunCompletedFromDaemonOpts,
): Promise<void> {
  try {
    const { db, dataDir, run } = opts;
    const cfg = await readAppConfig(dataDir);
    const prefs = cfg.telemetry ?? {};
    if (prefs.metrics !== true) return;
    const installationId = cfg.installationId ?? null;

    let messageContent = '';
    let producedFilesRaw: unknown = undefined;
    if (run.conversationId && run.assistantMessageId) {
      try {
        // Best-effort. Web persists assistant content via PUT /messages/:id
        // during the SSE stream, so by close time it is normally up to date,
        // but we tolerate a partial / missing message rather than throwing.
        const messages = (
          listMessages as (db: unknown, cid: string) => unknown[]
        )(db, run.conversationId);
        const m = (messages as Array<Record<string, unknown>>).find(
          (x) => x.id === run.assistantMessageId,
        );
        if (m) {
          messageContent = typeof m.content === 'string' ? m.content : '';
          // listMessages returns producedFiles already parsed (db.ts:965).
          producedFilesRaw = m.producedFiles;
        }
      } catch (err) {
        console.warn('[langfuse-bridge] message read failed:', String(err));
      }
    }

    const startedAt = run.createdAt;
    const endedAt =
      typeof opts.persistedEndedAt === 'number' ? opts.persistedEndedAt : run.updatedAt;
    const durationMs = Math.max(0, endedAt - startedAt);
    const status = normalizeStatus(opts.persistedRunStatus ?? run.status);

    const telemetryPrompt =
      typeof run.userPrompt === 'string' ? run.userPrompt : '';
    const userQueryTokens =
      telemetryPrompt.length > 0 ? Math.ceil(telemetryPrompt.length / 4) : 0;
    const usageAnalytics = scanRunEventsForUsageAnalytics(
      run.events,
      run.model,
      userQueryTokens,
    );
    const usage = messageUsageFromAnalytics(usageAnalytics);
    const error = pickRunError(run, status);
    const errorCode = deriveRunErrorCode({
      status,
      errorCode: run.errorCode ?? null,
      exitCode: run.exitCode ?? null,
      signal: run.signal ?? null,
    });
    const result = runResultFromStatus(status);
    const failure = classifyRunFailure({
      result,
      status: {
        status,
        error: run.error ?? error ?? null,
        errorCode: run.errorCode ?? null,
        exitCode: run.exitCode ?? null,
        signal: run.signal ?? null,
      },
      ...(errorCode ? { errorCode } : {}),
      agentId: run.agentId,
      events: run.events,
    });
    const timings = summarizeRunTimingAnalytics({
      runCreatedAt: run.createdAt,
      runUpdatedAt: run.updatedAt,
      analyticsCapturedAt: Date.now(),
      telemetry: run.analyticsTelemetry ?? null,
      events: run.events,
    });
    const stderr = status === 'succeeded'
      ? undefined
      : collectStderrTailSummary(run.events);
    const turn = turnInfoFromRun(run, usageAnalytics.agent_reported_model);
    const runtime: RuntimeInfo = {
      ...getRuntimeInfo(opts.appVersion ?? null),
      ...(run.clientType ? { clientType: run.clientType } : {}),
    };
    const ctx: ReportContext = {
      installationId,
      projectId: run.projectId ?? '',
      conversationId: run.conversationId ?? '',
      ...(run.agentId ? { agentId: run.agentId } : {}),
      run: {
        runId: run.id,
        status,
        startedAt,
        endedAt,
        ...(error ? { error } : {}),
        ...(errorCode ? { errorCode } : {}),
        ...(failure ? { failure } : {}),
        timings,
        ...(stderr ? { stderr } : {}),
      },
      message: {
        messageId: run.assistantMessageId ?? '',
        // Lexical scrub before send. Catches API keys / tokens / emails
        // / IPs / Luhn-valid credit cards in the prompt and assistant
        // text. See `redact.ts` for the full pattern set; the user-facing
        // privacy copy enumerates the same categories.
        prompt: redactSecrets(telemetryPrompt),
        output: redactSecrets(messageContent),
        ...(usage ? { usage } : {}),
      },
      artifacts: summarizeProducedFiles(producedFilesRaw),
      tools: collectToolCalls(run.events, startedAt, endedAt),
      eventsSummary: summarizeEvents(run.events, durationMs),
      prefs,
      ...(turn ? { turn } : {}),
      runtime,
    };

    await reportRunCompleted(
      ctx,
      opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {},
    );
  } catch (err) {
    console.warn('[langfuse-bridge] report failed:', String(err));
  }
}

export interface ReportRunFeedbackFromDaemonOpts {
  dataDir: string;
  runId: string;
  rating: 'positive' | 'negative';
  reasonCodes: string[];
  hasCustomReason: boolean;
  /** Raw "other" free text. Empty when no custom reason. */
  customReason: string;
  /** Extra context for Langfuse score metadata (projectId / conversationId / assistantMessageId). */
  scoreMetadata?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}

/**
 * Result for the POST /api/runs/:id/feedback handler. Telemetry is
 * best-effort and the network call runs after the response is sent, but
 * the handler still tells the caller whether the report was at least
 * enqueued — useful for QA and e2e.
 */
export type FeedbackReportOutcome =
  | { status: 'accepted' }
  | { status: 'skipped_consent' }
  | { status: 'skipped_no_sink' };

export async function reportRunFeedbackFromDaemon(
  opts: ReportRunFeedbackFromDaemonOpts,
): Promise<FeedbackReportOutcome> {
  let cfg;
  try {
    cfg = await readAppConfig(opts.dataDir);
  } catch (err) {
    console.warn('[langfuse-bridge] feedback config read failed:', String(err));
    return { status: 'skipped_no_sink' };
  }
  const prefs = cfg.telemetry ?? {};
  if (prefs.metrics !== true || prefs.content !== true) {
    return { status: 'skipped_consent' };
  }
  // Pre-resolve the sink before claiming `accepted`. Avoids advertising a
  // successful enqueue to callers when there's no Langfuse endpoint
  // configured to ship the score to.
  const sink = readTelemetrySinkConfig();
  if (!sink) {
    return { status: 'skipped_no_sink' };
  }
  const ctx: FeedbackReportContext = {
    runId: opts.runId,
    installationId: cfg.installationId ?? null,
    prefs,
    rating: opts.rating,
    reasonCodes: opts.reasonCodes,
    hasCustomReason: opts.hasCustomReason,
    customReason: opts.customReason,
    ...(opts.scoreMetadata ? { metadata: opts.scoreMetadata } : {}),
  };
  // Fire-and-forget the actual network send so the route can respond
  // immediately. The handler's response already encodes the consent +
  // sink-presence outcome above; failures inside the send are operational
  // telemetry, not a client-facing signal.
  void reportRunFeedback(
    ctx,
    opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {},
  ).catch((err) => {
    console.warn('[langfuse-bridge] feedback report failed:', String(err));
  });
  return { status: 'accepted' };
}
