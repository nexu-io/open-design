// Daemon ↔ langfuse-trace bridge.
//
// langfuse-trace.ts is dependency-free and works on a flat ReportContext.
// This module is the glue that pulls the pieces from daemon-internal data
// sources (the runs map, SQLite, app-config.json) into that shape and fires
// the report. Lives here rather than inside langfuse-trace.ts so that the
// trace module stays unit-testable without booting a database.
//
// See: specs/change/20260507-langfuse-telemetry/spec.md

import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import { modelIdForTracking } from '@open-design/contracts/analytics';

import { readAppConfig } from './app-config.js';
import type { AppVersionInfo } from './app-version.js';
import { listMessages } from './db.js';
import {
  deriveLangfuseDeliveryState,
  readTelemetrySinkConfig,
  reportRunCompleted,
  reportRunFeedback,
  type AgentEventSummary,
  type ArtifactManifestEntry,
  type ArtifactSummary,
  type AttachmentManifestEntry,
  type EventsSummary,
  type FeedbackReportContext,
  type LangfuseDeliveryState,
  type InputTextSnapshotManifestEntry,
  type ObjectManifestCompleteness,
  type MessageSummary,
  type ReportContext,
  type RuntimeInfo,
  type TelemetrySinkConfig,
  type ToolCallSummary,
  type TurnInfo,
} from './langfuse-trace.js';
import type { PromptStackTelemetry } from './prompt-telemetry.js';
import { redactSecrets } from './redact.js';
import {
  hasExplicitRequestedModelForAnalytics,
  scanRunEventsForUsageAnalytics,
  summarizeRunTimingAnalytics,
  type RunTelemetryTimestamps,
  type RunUsageAnalytics,
} from './run-analytics-observability.js';
import {
  collectStderrTailSummary,
  collectStdoutTailSummary,
  summarizeRunDiagnosticsForAnalytics,
} from './run-diagnostics.js';
import { classifyRunFailure } from './run-failure-classification.js';
import { deriveRunErrorCode, runResultFromStatus } from './run-result.js';
import { buildTraceObjectManifests } from './trace-object-manifest.js';
import type { TraceArtifactObjectSource } from './trace-object-manifest.js';

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
  designSystemDigest?: string;
  designSystemSelectionSource?: string;
  promptCache?: {
    stablePromptHash: string;
    hit: boolean;
    missReason: string | null;
  };
  clientType?: 'desktop' | 'web' | 'unknown';
  promptTelemetry?: PromptStackTelemetry;
  projectAttachmentPaths?: string[];
  projectMetadata?: Record<string, unknown> | null;
}

interface TraceSafeManifestResult {
  attachmentManifest: AttachmentManifestEntry[];
  artifactManifest: ArtifactManifestEntry[];
  completeness: ObjectManifestCompleteness;
}

interface FinalTraceSafeManifests {
  attachmentManifest: AttachmentManifestEntry[];
  artifactManifest: ArtifactManifestEntry[];
  inputTextSnapshotManifest?: InputTextSnapshotManifestEntry[];
  completeness: ObjectManifestCompleteness;
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

function deriveManifestCompleteness(
  entries: Array<
    AttachmentManifestEntry | ArtifactManifestEntry | InputTextSnapshotManifestEntry
  >,
  fallbackUnavailableSelected: boolean,
): ObjectManifestCompleteness {
  if (fallbackUnavailableSelected) return 'unavailable';
  if (entries.length === 0) return 'unavailable';
  if (entries.some((entry) => entry.status === 'unavailable')) return 'unavailable';
  if (entries.some((entry) => entry.status === 'partial')) return 'partial';
  return 'complete';
}

function mergeTraceSafeManifests(
  fallback: TraceSafeManifestResult,
  uploaded: Awaited<ReturnType<typeof buildTraceObjectManifests>>,
): FinalTraceSafeManifests {
  const attachmentManifest = uploaded?.attachmentManifest ?? fallback.attachmentManifest;
  const artifactManifest = uploaded?.artifactManifest ?? fallback.artifactManifest;
  const inputTextSnapshotManifest = uploaded?.inputTextSnapshotManifest;
  const entries = [
    ...attachmentManifest,
    ...artifactManifest,
    ...(inputTextSnapshotManifest ?? []),
  ];
  const selectedFallbackUnavailable =
    fallback.completeness === 'unavailable' &&
    (uploaded === undefined ||
      (uploaded.attachmentManifest === undefined && fallback.attachmentManifest.length > 0) ||
      (uploaded.artifactManifest === undefined && fallback.artifactManifest.length > 0));
  return {
    attachmentManifest,
    artifactManifest,
    ...(inputTextSnapshotManifest ? { inputTextSnapshotManifest } : {}),
    completeness: deriveManifestCompleteness(entries, selectedFallbackUnavailable),
  };
}

function inferObjectRegistrationRelayUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const objectRelayUrl = env.OPEN_DESIGN_OBJECT_RELAY_URL?.trim();
  if (!objectRelayUrl) {
    const telemetryRelayUrl = env.OPEN_DESIGN_TELEMETRY_RELAY_URL?.trim();
    return telemetryRelayUrl ? telemetryRelayUrl.replace(/\/+$/, '') : null;
  }
  try {
    const url = new URL(objectRelayUrl);
    url.pathname = url.pathname.replace(/\/api\/objects\/batch\/?$/, '/api/langfuse');
    return url.toString().replace(/\/+$/, '');
  } catch {
    return objectRelayUrl.replace(/\/api\/objects\/batch\/?$/, '/api/langfuse').replace(/\/+$/, '');
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function objectRegistrationTelemetryConfig(
  env: NodeJS.ProcessEnv = process.env,
): Extract<TelemetrySinkConfig, { kind: 'relay' }> | null {
  const relayUrl = inferObjectRegistrationRelayUrl(env);
  if (!relayUrl) return null;
  return {
    kind: 'relay',
    relayUrl,
    timeoutMs: parsePositiveInt(
      env.OPEN_DESIGN_OBJECT_RELAY_TIMEOUT_MS ?? env.OPEN_DESIGN_TELEMETRY_TIMEOUT_MS,
      20_000,
    ),
    retries: parseNonNegativeInt(env.OPEN_DESIGN_TELEMETRY_RETRIES, 1),
  };
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
  } else {
    // Keep Langfuse aligned with PostHog's model bucket when the user selected
    // "Default (CLI config)" and the runtime did not emit a resolved model.
    turn.model = modelIdForTracking(agentReportedModel);
  }
  if (run.reasoning) turn.reasoning = run.reasoning;
  if (run.skillId) turn.skillId = run.skillId;
  if (run.designSystemId) turn.designSystemId = run.designSystemId;
  if (run.designSystemDigest) turn.designSystemDigest = run.designSystemDigest;
  if (run.designSystemSelectionSource) {
    turn.designSystemSelectionSource = run.designSystemSelectionSource;
  }
  if (run.promptCache) turn.promptCache = run.promptCache;
  return Object.keys(turn).length > 0 ? turn : undefined;
}

function summarizeEvents(
  events: DaemonRunRecord['events'],
  durationMs: number,
): EventsSummary {
  const toolCallIds = new Set<string>();
  let errors = 0;
  for (const rec of events) {
    const data = rec.data as { type?: string; id?: unknown } | null | undefined;
    if (rec.event === 'agent') {
      const t = data?.type;
      if (t === 'tool_use') {
        const toolId = data?.id;
        if (typeof toolId === 'string' && toolId.length > 0) {
          toolCallIds.add(toolId);
        } else {
          toolCallIds.add(`event-${rec.id}`);
        }
      } else if (t === 'error') {
        errors += 1;
      }
    } else if (rec.event === 'error') {
      errors += 1;
    }
  }
  return { toolCalls: toolCallIds.size, errors, durationMs };
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

const CONTENT_TOOL_NAMES = new Set([
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
]);

function redactLocalPaths(value: string): string {
  return value
    .replace(/\/Users\/[^/\s"']+(?:\/[^ \n\r\t"'`<>)]*)?/g, '[REDACTED:local_path]')
    .replace(/[A-Za-z]:\\Users\\[^\\\s"']+(?:\\[^ \n\r\t"'`<>)]*)?/g, '[REDACTED:local_path]');
}

function serializeToolPayload(
  value: unknown,
  opts: { toolName: string; direction: 'input' | 'output' },
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (CONTENT_TOOL_NAMES.has(opts.toolName)) {
    return `[REDACTED:tool_${opts.direction}:content_tool:${opts.toolName}]`;
  }
  if (typeof value === 'string') return redactLocalPaths(redactSecrets(value));
  try {
    return redactLocalPaths(redactSecrets(JSON.stringify(value)));
  } catch {
    return redactLocalPaths(redactSecrets(String(value)));
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
      const input = serializeToolPayload(data.input, {
        toolName: summary.name,
        direction: 'input',
      });
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
      const output = serializeToolPayload(data.content, {
        toolName: summary.name,
        direction: 'output',
      });
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

function collectAgentEvents(
  events: DaemonRunRecord['events'],
  runStartedAt: number,
  runEndedAt: number,
  agentId: string | null | undefined,
): AgentEventSummary[] {
  const out: AgentEventSummary[] = [];
  const statusCounts = new Map<string, number>();
  const diagnosticCounts = new Map<string, number>();
  let thinkingCount = 0;
  let usageCount = 0;
  const source =
    typeof agentId === 'string' && agentId.trim().length > 0
      ? agentId.trim()
      : undefined;
  const eventInput = (eventType: string): Record<string, unknown> => ({
    ...(source ? { source } : {}),
    event_type: eventType,
  });
  for (const rec of events) {
    if (rec.event !== 'agent') continue;
    const data = rec.data as
      | {
          type?: string;
          label?: unknown;
          model?: unknown;
          ttftMs?: unknown;
          usage?: unknown;
          costUsd?: unknown;
          durationMs?: unknown;
          stopReason?: unknown;
          name?: unknown;
          source?: unknown;
          reason?: unknown;
          shape?: unknown;
          elapsedMs?: unknown;
          suppressedChars?: unknown;
          suppressedChunks?: unknown;
          openedBlocks?: unknown;
          closedBlocks?: unknown;
          fileCount?: unknown;
          files?: unknown;
          pendingCandidateChars?: unknown;
          suppressing?: unknown;
        }
      | null
      | undefined;
    const type = data?.type;
    const timestamp = Math.min(
      Math.max(eventTimestamp(rec, runStartedAt + rec.id), runStartedAt),
      runEndedAt,
    );
    if (type === 'status') {
      if (!data) continue;
      const label =
        typeof data.label === 'string' && data.label.length > 0
          ? data.label
          : 'working';
      const index = statusCounts.get(label) ?? 0;
      statusCounts.set(label, index + 1);
      out.push({
        id: `status-${label}-${index}`,
        name: `agent-status:${label}`,
        timestamp,
        input: eventInput('status'),
        output: {
          label,
          ...(typeof data.model === 'string' ? { model: data.model } : {}),
          ...(typeof data.ttftMs === 'number' ? { ttft_ms: data.ttftMs } : {}),
        },
      });
    } else if (type === 'thinking_start') {
      const index = thinkingCount;
      thinkingCount += 1;
      out.push({
        id: `thinking-start-${index}`,
        name: 'agent-thinking-start',
        timestamp,
        input: eventInput('thinking_start'),
        output: {
          status: 'started',
        },
      });
    } else if (type === 'usage') {
      if (!data) continue;
      const index = usageCount;
      usageCount += 1;
      out.push({
        id: `usage-${index}`,
        name: 'agent-usage',
        timestamp,
        input: eventInput('usage'),
        output: {
          usage: data.usage,
          ...(typeof data.costUsd === 'number' ? { cost_usd: data.costUsd } : {}),
          ...(typeof data.durationMs === 'number'
            ? { duration_ms: data.durationMs }
            : {}),
          ...(typeof data.stopReason === 'string'
            ? { stop_reason: data.stopReason }
            : {}),
        },
      });
    } else if (type === 'diagnostic') {
      if (!data) continue;
      const diagnosticName =
        typeof data.name === 'string' && data.name.length > 0
          ? data.name
          : 'runtime_diagnostic';
      const index = diagnosticCounts.get(diagnosticName) ?? 0;
      diagnosticCounts.set(diagnosticName, index + 1);
      out.push({
        id: `diagnostic-${diagnosticName}-${index}`,
        name: `agent-diagnostic:${diagnosticName}`,
        timestamp,
        input: eventInput('diagnostic'),
        output: {
          name: diagnosticName,
          ...(typeof data.source === 'string' ? { source: data.source } : {}),
          ...(typeof data.reason === 'string' ? { reason: data.reason } : {}),
          ...(typeof data.elapsedMs === 'number' ? { elapsed_ms: data.elapsedMs } : {}),
          ...(typeof data.suppressedChars === 'number' ? { suppressed_chars: data.suppressedChars } : {}),
          ...(typeof data.suppressedChunks === 'number' ? { suppressed_chunks: data.suppressedChunks } : {}),
          ...(typeof data.openedBlocks === 'number' ? { opened_blocks: data.openedBlocks } : {}),
          ...(typeof data.closedBlocks === 'number' ? { closed_blocks: data.closedBlocks } : {}),
          ...(typeof data.fileCount === 'number' ? { file_count: data.fileCount } : {}),
          ...(Array.isArray(data.files)
            ? { files: data.files.filter((file) => typeof file === 'string').slice(0, 8) }
            : {}),
          ...(typeof data.pendingCandidateChars === 'number'
            ? { pending_candidate_chars: data.pendingCandidateChars }
            : {}),
          ...(typeof data.suppressing === 'boolean' ? { suppressing: data.suppressing } : {}),
          ...(data.shape && typeof data.shape === 'object' ? { shape: data.shape } : {}),
        },
        metadata: {
          diagnostic_name: diagnosticName,
        },
      });
    }
  }
  return out;
}

function stableObjectId(prefix: 'att' | 'art', parts: unknown[]): string {
  const h = createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('hex')
    .slice(0, 16);
  return `${prefix}_${h}`;
}

function extensionFromName(value: string): string | undefined {
  const basename = value.split(/[\\/]/).pop() ?? '';
  const dot = basename.lastIndexOf('.');
  if (dot <= 0 || dot === basename.length - 1) return undefined;
  return basename.slice(dot + 1).toLowerCase();
}

function safeSha256(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith('sha256:') ? trimmed : `sha256:${trimmed}`;
}

function safeStatus(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, 64)
    : undefined;
}

function objectStorageRef(args: {
  projectId: string | null | undefined;
  runId: string;
  objectClass: 'attachment' | 'artifact';
  objectId: string;
}): string {
  const projectId = typeof args.projectId === 'string' && args.projectId
    ? args.projectId
    : 'unknown-project';
  return [
    'od://objects',
    'workspaces',
    'unknown',
    'projects',
    encodeURIComponent(projectId),
    'runs',
    encodeURIComponent(args.runId),
    args.objectClass,
    encodeURIComponent(args.objectId),
  ].join('/');
}

function statusForSize(size: unknown): {
  status: 'ok' | 'partial';
  reason?: string;
  sizeBytes?: number;
} {
  if (typeof size === 'number' && Number.isFinite(size) && size >= 0) {
    return { status: 'ok', sizeBytes: Math.floor(size) };
  }
  return { status: 'partial', reason: 'size_unavailable' };
}

function sanitizeProducedFileSlug(item: Record<string, unknown>): string {
  const filePath = typeof item.path === 'string' ? item.path : '';
  const name = typeof item.name === 'string' ? item.name : '';
  const raw = filePath || name;
  if (!raw) return '';
  // Keep the legacy field for existing dashboards, but never leak local
  // absolute paths through Langfuse.
  return raw.split(/[\\/]/).filter(Boolean).pop() ?? raw;
}

function summarizeProducedFiles(items: unknown): ArtifactSummary[] {
  if (!Array.isArray(items)) return [];
  const out: ArtifactSummary[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const slug = sanitizeProducedFileSlug(obj);
    if (!slug) continue;
    out.push({
      slug,
      type: typeof obj.kind === 'string' ? obj.kind : 'unknown',
      sizeBytes: typeof obj.size === 'number' ? obj.size : 0,
    });
  }
  return out;
}

function buildTraceObjectArtifactSources(items: unknown): TraceArtifactObjectSource[] {
  if (!Array.isArray(items)) return [];
  const out: TraceArtifactObjectSource[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const slug = sanitizeProducedFileSlug(obj);
    if (!slug) continue;
    const rawPath = typeof obj.path === 'string' && obj.path.trim()
      ? obj.path
      : typeof obj.name === 'string' && obj.name.trim()
        ? obj.name
        : undefined;
    out.push({
      summary: {
        slug,
        type: typeof obj.kind === 'string' ? obj.kind : 'unknown',
        sizeBytes: typeof obj.size === 'number' ? obj.size : 0,
      },
      ...(rawPath ? { sourcePath: rawPath } : {}),
    });
  }
  return out;
}

function collectPriorUserAttachments(
  messages: Array<Record<string, unknown>>,
  assistantIndex: number,
): unknown {
  const attachments: unknown[] = [];
  const priorMessages = messages.slice(
    0,
    assistantIndex >= 0 ? assistantIndex : messages.length,
  );
  for (const message of priorMessages) {
    if (message.role !== 'user') continue;
    const raw = message.attachments;
    if (!Array.isArray(raw)) continue;
    attachments.push(...raw);
  }
  return attachments.length > 0 ? attachments : undefined;
}

function buildTraceSafeManifests(args: {
  projectId: string | null | undefined;
  runId: string;
  attachmentsRaw: unknown;
  producedFilesRaw: unknown;
}): TraceSafeManifestResult {
  const attachmentManifest: AttachmentManifestEntry[] = [];
  const artifactManifest: ArtifactManifestEntry[] = [];
  let partial = false;
  let unavailable = false;

  if (Array.isArray(args.attachmentsRaw)) {
    for (const [index, raw] of args.attachmentsRaw.entries()) {
      const obj = typeof raw === 'string'
        ? { path: raw, name: raw }
        : raw && typeof raw === 'object' && !Array.isArray(raw)
          ? raw as Record<string, unknown>
          : null;
      if (!obj) {
        partial = true;
        continue;
      }
      const pathValue = typeof obj.path === 'string' ? obj.path : '';
      const nameValue = typeof obj.name === 'string' ? obj.name : pathValue;
      const attachmentId = stableObjectId('att', [
        args.projectId ?? null,
        args.runId,
        pathValue || nameValue,
        index,
      ]);
      const sizeInfo = statusForSize(obj.size);
      if (sizeInfo.status === 'partial') partial = true;
      const sha256 = safeSha256(obj.sha256 ?? obj.hash);
      const extension = extensionFromName(nameValue || pathValue);
      attachmentManifest.push({
        attachment_id: attachmentId,
        object_class: 'attachment',
        storage_ref: objectStorageRef({
          projectId: args.projectId,
          runId: args.runId,
          objectClass: 'attachment',
          objectId: attachmentId,
        }),
        status: sizeInfo.status,
        ...(sizeInfo.reason ? { reason: sizeInfo.reason } : {}),
        project_id: args.projectId ?? null,
        run_id: args.runId,
        workspace_id: null,
        ...(sizeInfo.sizeBytes !== undefined ? { size_bytes: sizeInfo.sizeBytes } : {}),
        ...(sha256 ? { sha256 } : {}),
        ...(typeof obj.mime === 'string' ? { mime_type: obj.mime } : {}),
        ...(extension ? { extension } : {}),
        redacted: false,
        truncated: false,
        stored_in_open_design: true,
        retention_policy: 'project_lifetime',
        access_scope: 'project',
        sensitivity: 'private',
        source: 'user_upload',
        expires_at: null,
        approved_by: null,
      });
    }
  } else if (args.attachmentsRaw !== undefined && args.attachmentsRaw !== null) {
    unavailable = true;
  }

  if (Array.isArray(args.producedFilesRaw)) {
    for (const [index, raw] of args.producedFilesRaw.entries()) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        partial = true;
        continue;
      }
      const obj = raw as Record<string, unknown>;
      const slug = sanitizeProducedFileSlug(obj);
      if (!slug) {
        partial = true;
        continue;
      }
      const manifest = obj.artifactManifest && typeof obj.artifactManifest === 'object'
        && !Array.isArray(obj.artifactManifest)
        ? obj.artifactManifest as Record<string, unknown>
        : {};
      const artifactId = stableObjectId('art', [
        args.projectId ?? null,
        args.runId,
        slug,
        index,
      ]);
      const sizeInfo = statusForSize(obj.size);
      if (sizeInfo.status === 'partial') partial = true;
      const type =
        typeof obj.kind === 'string'
          ? obj.kind
          : typeof manifest.kind === 'string'
            ? manifest.kind
            : 'unknown';
      const sha256 = safeSha256(obj.sha256 ?? obj.hash);
      const extension = extensionFromName(slug);
      const buildStatus = safeStatus(manifest.status);
      artifactManifest.push({
        artifact_id: artifactId,
        object_class: 'artifact',
        type,
        storage_ref: objectStorageRef({
          projectId: args.projectId,
          runId: args.runId,
          objectClass: 'artifact',
          objectId: artifactId,
        }),
        status: sizeInfo.status,
        ...(sizeInfo.reason ? { reason: sizeInfo.reason } : {}),
        project_id: args.projectId ?? null,
        run_id: args.runId,
        workspace_id: null,
        ...(sizeInfo.sizeBytes !== undefined ? { size_bytes: sizeInfo.sizeBytes } : {}),
        ...(sha256 ? { sha256 } : {}),
        ...(typeof obj.mime === 'string' ? { mime_type: obj.mime } : {}),
        ...(extension ? { extension } : {}),
        ...(typeof manifest.artifactKind === 'string' ? { artifact_kind: manifest.artifactKind } : {}),
        ...(buildStatus ? { build_status: buildStatus } : {}),
        preview_status: 'unavailable',
        ...(Array.isArray(manifest.exports) && manifest.exports.length > 0
          ? { export_status: 'available' }
          : { export_status: 'unavailable' }),
        redacted: false,
        truncated: false,
        stored_in_open_design: true,
        retention_policy: 'project_lifetime',
        access_scope: 'project',
        sensitivity: 'private',
        source: 'agent_generated',
        expires_at: null,
        approved_by: null,
      });
    }
  } else if (args.producedFilesRaw !== undefined && args.producedFilesRaw !== null) {
    unavailable = true;
  }

  return {
    attachmentManifest,
    artifactManifest,
    completeness: unavailable ? 'unavailable' : partial ? 'partial' : 'complete',
  };
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
): Promise<LangfuseDeliveryState> {
  try {
    const { db, dataDir, run } = opts;
    const cfg = await readAppConfig(dataDir);
    const prefs = cfg.telemetry ?? {};
    if (prefs.metrics !== true) {
      return deriveLangfuseDeliveryState(prefs, null);
    }
    const installationId = cfg.installationId ?? null;

    let messageContent = '';
    let producedFilesRaw: unknown = undefined;
    let attachmentsRaw: unknown = undefined;
    if (run.conversationId && run.assistantMessageId) {
      try {
        // Best-effort. Web persists assistant content via PUT /messages/:id
        // during the SSE stream, so by close time it is normally up to date,
        // but we tolerate a partial / missing message rather than throwing.
        const messages = (
          listMessages as (db: unknown, cid: string) => unknown[]
        )(db, run.conversationId);
        const allMessages = messages as Array<Record<string, unknown>>;
        const assistantIndex = allMessages.findIndex(
          (x) => x.id === run.assistantMessageId,
        );
        const m = assistantIndex >= 0 ? allMessages[assistantIndex] : undefined;
        if (m) {
          messageContent = typeof m.content === 'string' ? m.content : '';
          // listMessages returns producedFiles already parsed (db.ts:965).
          producedFilesRaw = m.producedFiles;
          attachmentsRaw = collectPriorUserAttachments(allMessages, assistantIndex);
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
    const stdout = status === 'succeeded'
      ? undefined
      : collectStdoutTailSummary(run.events);
    const turn = turnInfoFromRun(run, usageAnalytics.agent_reported_model);
    const runtime: RuntimeInfo = {
      ...getRuntimeInfo(opts.appVersion ?? null),
      ...(run.clientType ? { clientType: run.clientType } : {}),
    };
    const artifacts = summarizeProducedFiles(producedFilesRaw);
    const diagnostics = summarizeRunDiagnosticsForAnalytics({
      events: run.events,
      exitCode: run.exitCode ?? null,
      signal: run.signal ?? null,
      cancelRequested: run.status === 'canceled',
      firstTokenSeen: Boolean(run.analyticsTelemetry?.firstTokenAt),
      artifactWriteSeen: artifacts.length > 0,
    });
    const manifests = buildTraceSafeManifests({
      projectId: run.projectId,
      runId: run.id,
      attachmentsRaw,
      producedFilesRaw,
    });
    const objectManifestOptions = {
      installationId,
      projectId: run.projectId ?? '',
      runId: run.id,
      projectsRoot: path.join(dataDir, 'projects'),
      ...(run.projectMetadata ? { projectMetadata: run.projectMetadata } : {}),
      ...(run.projectAttachmentPaths ? { attachmentPaths: run.projectAttachmentPaths } : {}),
      artifacts: buildTraceObjectArtifactSources(producedFilesRaw),
      prompt: telemetryPrompt,
      prefs,
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    } satisfies Parameters<typeof buildTraceObjectManifests>[0];
    const buildContext = (finalManifests: FinalTraceSafeManifests): ReportContext => ({
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
        ...(run.analyticsTelemetry ? { timingMarks: run.analyticsTelemetry } : {}),
        ...(stderr ? { stderr } : {}),
        ...(stdout ? { stdout } : {}),
        diagnostics,
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
      artifacts,
      attachmentManifest: finalManifests.attachmentManifest,
      artifactManifest: finalManifests.artifactManifest,
      ...(finalManifests.inputTextSnapshotManifest
        ? { inputTextSnapshotManifest: finalManifests.inputTextSnapshotManifest }
        : {}),
      manifestCompleteness: finalManifests.completeness,
      tools: collectToolCalls(run.events, startedAt, endedAt),
      agentEvents: collectAgentEvents(run.events, startedAt, endedAt, run.agentId),
      eventsSummary: summarizeEvents(run.events, durationMs),
      prefs,
      ...(turn ? { turn } : {}),
      runtime,
      ...(run.promptTelemetry ? { promptTelemetry: run.promptTelemetry } : {}),
    });

    const registrationManifests = await buildTraceObjectManifests({
      ...objectManifestOptions,
      uploadMode: 'manifest-only',
    });
    if (registrationManifests) {
      await reportRunCompleted(
        buildContext(mergeTraceSafeManifests(manifests, registrationManifests)),
        {
          config: objectRegistrationTelemetryConfig(),
          ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
        },
      );
    }

    const uploadedManifests = await buildTraceObjectManifests(objectManifestOptions);
    const finalManifests = mergeTraceSafeManifests(manifests, uploadedManifests);
    return await reportRunCompleted(
      buildContext(finalManifests),
      opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {},
    );
  } catch (err) {
    console.warn('[langfuse-bridge] report failed:', String(err));
    return {
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'network_error',
    };
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
