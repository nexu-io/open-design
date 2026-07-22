// Langfuse trace forwarding for completed agent runs.
//
// This module is intentionally dependency-free (no `langfuse` SDK). It builds
// Langfuse ingestion batches for completed runs and sends them either to the
// official Open Design telemetry relay or, for local smoke tests, directly to
// Langfuse. Without OPEN_DESIGN_TELEMETRY_RELAY_URL or LANGFUSE_PUBLIC_KEY /
// LANGFUSE_SECRET_KEY in the env, every entry point becomes a no-op so that
// dev runs and forks of this open-source repo do not accidentally report.
//
// Privacy gates are layered: `prefs.metrics` is the master switch, and
// `prefs.content` is required for Langfuse traces because this sink is used
// for turn-quality evals. If either is off, no network call is made.
// Complete-context manifests are part of content telemetry: when metrics and
// content are both enabled, Langfuse receives the trace and associated object
// references. If either is off, no network call is made.
//
// See: specs/change/20260507-langfuse-telemetry/spec.md

import { createHash, randomUUID } from 'node:crypto';

import type { TelemetryPrefs } from './app-config.js';
import { normalizeOpenDesignTelemetryRelayUrl } from './integrations/telemetry-relay.js';
import { readVelaControlApiContext } from './integrations/vela.js';
import {
  buildPromptStackFlatMetadata,
  promptStackWithoutContent,
  structuredPromptStackInput,
  type PromptTelemetrySection,
  type PromptStackTelemetry,
} from './prompt-telemetry.js';
import type {
  RunTelemetryTimestamps,
  RunTimingAnalytics,
} from './run-analytics-observability.js';
import type { RunFailureClassification } from './run-failure-classification.js';
import { redactSecrets } from './redact.js';
import { readTelemetryEnvironment } from './telemetry-environment.js';

// Langfuse US region: confirmed by an end-to-end smoke on 2026-05-07 — the
// project's keys authenticate against `us.cloud.langfuse.com` only. EU host
// (`cloud.langfuse.com`) returns 401 with the matching error message.
// See specs/change/20260507-langfuse-telemetry/spec.md Q3.
const DEFAULT_BASE_URL = 'https://us.cloud.langfuse.com';

export const INPUT_MAX_BYTES = 64 * 1024;
const OUTPUT_MAX_BYTES = 64 * 1024;
const TOOL_INPUT_MAX_BYTES = 8 * 1024;
const TOOL_OUTPUT_MAX_BYTES = 8 * 1024;
const ARTIFACTS_MAX_ITEMS = 50;
const SESSION_ID_MAX = 200; // Langfuse drops sessionIds longer than this.
const HARD_BATCH_MAX_BYTES = 1024 * 1024;
const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
const DEFAULT_FETCH_RETRIES = 1;
const PROMPT_STACK_BLAME_MAX_SECTIONS = 8;
let missingTelemetrySinkWarned = false;

export interface LangfuseConfig {
  authHeader: string;
  baseUrl: string;
  timeoutMs: number;
  retries: number;
}

export type LangfuseDeliveryStatus =
  | 'not_expected'
  | 'queued'
  | 'accepted'
  | 'failed';

export type LangfuseDropReason =
  | 'metrics_consent_off'
  | 'content_consent_off'
  | 'missing_sink_config'
  | 'payload_too_large'
  | 'relay_429'
  | 'relay_413'
  | 'relay_5xx'
  | 'langfuse_4xx'
  | 'langfuse_5xx'
  | 'vela_400'
  | 'vela_401'
  | 'vela_403'
  | 'vela_413'
  | 'vela_429'
  | 'vela_5xx'
  | 'network_error';

export interface LangfuseDeliveryState {
  langfuse_expected: boolean;
  langfuse_delivery_status: LangfuseDeliveryStatus;
  langfuse_drop_reason?: LangfuseDropReason;
}

export type TelemetrySinkConfig =
  | {
      kind: 'relay';
      relayUrl: string;
      timeoutMs: number;
      retries: number;
    }
  | ({
      kind: 'langfuse';
    } & LangfuseConfig);

export interface VelaTelemetrySinkConfig {
  kind: 'vela';
  apiUrl: string;
  controlKey: string;
  timeoutMs: number;
  retries: number;
}

export type RunTelemetrySinkConfig =
  | TelemetrySinkConfig
  | VelaTelemetrySinkConfig;

export interface RunSummary {
  runId: string;
  status: 'succeeded' | 'failed' | 'canceled';
  startedAt: number;
  endedAt: number;
  error?: string;
  errorCode?: string;
  failure?: RunFailureClassification;
  timings?: RunTimingAnalytics;
  timingMarks?: RunTelemetryTimestamps;
  stderr?: {
    tail: string;
    lineCount: number;
    truncated: boolean;
  };
  stdout?: {
    tail: string;
    lineCount: number;
    truncated: boolean;
  };
  diagnostics?: unknown;
  retryAttemptCount?: number;
  retryFinalResult?: string;
  retrySuppressedReason?: string;
  retryOriginalFailure?: RunFailureClassification;
}

export interface MessageSummary {
  messageId: string;
  prompt: string;
  output: string;
  usage?: {
    inputTokens?: number;
    inputTokensProvider?: number;
    inputTokensEffective?: number;
    outputTokens?: number;
    totalTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
    uncachedInputTokens?: number;
    estimatedContextTokens?: number;
    cacheHitRatio?: number;
    cacheTokenSource?: 'anthropic' | 'openai' | 'unavailable';
  };
}

export interface ArtifactSummary {
  slug: string;
  type: string;
  sizeBytes: number;
  sha256?: string;
  createdAt?: string;
}

export type ObjectManifestCompleteness = 'complete' | 'partial' | 'unavailable';

export type ObjectManifestStatus = 'ok' | 'partial' | 'unavailable';

export type ObjectManifestSensitivity = 'public' | 'internal' | 'private' | 'sensitive';

export type ObjectManifestAccessScope = 'owner' | 'project' | 'workspace' | 'evaluator';

export type ObjectManifestRetentionPolicy =
  | 'ephemeral'
  | 'observability_90d'
  | 'project_lifetime'
  | 'eval_fixture'
  | 'legal_hold';

export interface TraceSafeObjectManifestBase {
  object_class: 'attachment' | 'artifact' | 'input_text_snapshot';
  storage_ref: string;
  status: ObjectManifestStatus;
  reason?: string;
  project_id: string | null;
  run_id: string;
  workspace_id: string | null;
  size_bytes?: number;
  sha256?: string;
  mime_type?: string;
  extension?: string;
  redacted: boolean;
  truncated: boolean;
  stored_in_open_design: boolean;
  retention_policy: ObjectManifestRetentionPolicy;
  access_scope: ObjectManifestAccessScope;
  sensitivity: ObjectManifestSensitivity;
  source: 'user_upload' | 'agent_generated' | 'user_prompt';
  expires_at: string | null;
  approved_by: string | null;
  open_in_open_design_url?: null;
  preview_status?: string;
  access_policy?: 'open_design_auth_required';
}

export interface AttachmentManifestEntry extends TraceSafeObjectManifestBase {
  object_class: 'attachment';
  attachment_id: string;
}

export interface ArtifactManifestEntry extends TraceSafeObjectManifestBase {
  object_class: 'artifact';
  artifact_id: string;
  type: string;
  artifact_kind?: string;
  build_status?: string;
  preview_status?: string;
  export_status?: string;
}

export interface InputTextSnapshotManifestEntry extends TraceSafeObjectManifestBase {
  object_class: 'input_text_snapshot';
  input_text_snapshot_id: string;
  type: 'text';
}

export interface TraceObjectSummary {
  new_file_count: number;
  modified_file_count: number;
  recovered_file_count: number;
  candidate_file_count: number;
  uploaded_file_count: number;
  skipped_file_count: number;
  skip_reasons: Record<string, number>;
}

export interface ToolCallSummary {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number;
  input?: string;
  output?: string;
  isError?: boolean;
}

export interface AgentEventSummary {
  id: string;
  name: string;
  timestamp: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  level?: 'DEFAULT' | 'WARNING' | 'ERROR';
  statusMessage?: string;
}

export interface EventsSummary {
  toolCalls: number;
  errors: number;
  durationMs: number;
}

export interface RuntimeInfo {
  /** Node.js runtime version (`process.version`, e.g. 'v22.22.0'). */
  nodeVersion?: string;
  /** OS family (`os.platform()`, e.g. 'darwin' | 'win32' | 'linux'). */
  os?: string;
  /** OS kernel/release version (`os.release()`). */
  osRelease?: string;
  /** CPU architecture (`os.arch()`, e.g. 'arm64' | 'x64'). */
  arch?: string;
  /** Open Design app version reported by the daemon. */
  appVersion?: string;
  /** Build channel (development / prerelease / beta / stable). */
  appChannel?: string;
  /** Whether the daemon is running inside a packaged build. */
  packaged?: boolean;
  /** Front-end carrier — `desktop` (Electron), `web` (browser), or unknown. */
  clientType?: 'desktop' | 'web' | 'unknown';
  /** Exact CLI version observed by the daemon's bounded detection probe. */
  agentCliVersion?: string;
  /** Optional companion runtime used behind the selected CLI (AMR → OpenCode). */
  runtimeCompanionName?: string;
  runtimeCompanionVersion?: string;
}

export interface TurnInfo {
  /** Model id at the time of this turn (e.g. 'claude-sonnet-4-5'). */
  model?: string;
  /** Reasoning level / effort knob if the agent supports it. */
  reasoning?: string;
  /** Skill id selected for this turn (if any). */
  skillId?: string;
  /** Design system id selected for this turn (if any). */
  designSystemId?: string;
  /** sha256 digest of the injected design-system prompt context. */
  designSystemDigest?: string;
  /** Source that supplied the effective design-system selection. */
  designSystemSelectionSource?: string;
  /** Resume-session stable prompt cache diagnostics. */
  promptCache?: {
    stablePromptHash: string;
    hit: boolean;
    missReason: string | null;
  };
}

export interface ReportContext {
  installationId: string | null;
  projectId: string;
  conversationId: string;
  agentId?: string;
  run: RunSummary;
  message: MessageSummary;
  artifacts: ArtifactSummary[];
  attachmentManifest?: AttachmentManifestEntry[];
  artifactManifest?: ArtifactManifestEntry[];
  inputTextSnapshotManifest?: InputTextSnapshotManifestEntry[];
  manifestCompleteness?: ObjectManifestCompleteness;
  traceObjectSummary?: TraceObjectSummary;
  tools?: ToolCallSummary[];
  agentEvents?: AgentEventSummary[];
  eventsSummary: EventsSummary;
  prefs: TelemetryPrefs;
  langfuse?: LangfuseDeliveryState;
  /** Per-turn config (model + skill + DS). May vary turn-to-turn within a session. */
  turn?: TurnInfo;
  /** Process- / build-level info collected once per daemon process. */
  runtime?: RuntimeInfo;
  /** Redacted section-level prompt diagnostics captured before agent spawn. */
  promptTelemetry?: PromptStackTelemetry;
  extraTags?: string[];
}

export interface ReportRunOpts {
  config?: RunTelemetrySinkConfig | LangfuseConfig | null;
  fetchImpl?: typeof fetch;
  /** App-config AMR env used only when resolving the completed-run Vela sink. */
  configuredEnv?: Record<string, string>;
  /** Keep object-authority registration anonymous and content-free. */
  deliveryPurpose?: 'final' | 'object-registration';
}

export interface ReportFeedbackOpts {
  config?: RunTelemetrySinkConfig | LangfuseConfig | null;
  fetchImpl?: typeof fetch;
  configuredEnv?: Record<string, string>;
}

/**
 * Payload sent to Langfuse when a user thumbs-up/down's an assistant turn.
 *
 * The `runId` doubles as the Langfuse trace id (same convention used by
 * buildTracePayload), so the score lands on the existing trace if the run
 * was previously reported. If the run wasn't reported (e.g. content
 * consent was off at run completion, then turned on before the user
 * scored), Langfuse will accept the score anyway and the trace will
 * materialize when/if the daemon backfills it.
 */
export interface FeedbackReportContext {
  runId: string;
  installationId: string | null;
  prefs: TelemetryPrefs;
  rating: 'positive' | 'negative';
  reasonCodes: string[];
  /** Raw "other" free text the user typed. Trimmed; empty string when absent. */
  customReason: string;
  hasCustomReason: boolean;
  /** Optional context bag that ends up in Langfuse score metadata. */
  metadata?: Record<string, unknown>;
}

export function readLangfuseConfig(
  env: NodeJS.ProcessEnv = process.env,
): LangfuseConfig | null {
  const publicKey = env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = env.LANGFUSE_SECRET_KEY?.trim();
  if (!publicKey || !secretKey) return null;
  const baseUrl = (env.LANGFUSE_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    '',
  );
  const authHeader =
    'Basic ' +
    Buffer.from(`${publicKey}:${secretKey}`, 'utf8').toString('base64');
  return {
    authHeader,
    baseUrl,
    timeoutMs: parsePositiveInt(
      env.LANGFUSE_TIMEOUT_MS,
      DEFAULT_FETCH_TIMEOUT_MS,
    ),
    retries: parseNonNegativeInt(env.LANGFUSE_RETRIES, DEFAULT_FETCH_RETRIES),
  };
}

/**
 * Resolve telemetry delivery in release-safe order: hosted relay first,
 * direct Langfuse credentials second for local smoke tests, disabled last.
 */
export function readTelemetrySinkConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelemetrySinkConfig | null {
  const relayUrl = env.OPEN_DESIGN_TELEMETRY_RELAY_URL?.trim();
  if (relayUrl) {
    return {
      kind: 'relay',
      relayUrl: normalizeOpenDesignTelemetryRelayUrl(relayUrl),
      timeoutMs: parsePositiveInt(
        env.OPEN_DESIGN_TELEMETRY_TIMEOUT_MS ?? env.LANGFUSE_TIMEOUT_MS,
        DEFAULT_FETCH_TIMEOUT_MS,
      ),
      retries: parseNonNegativeInt(
        env.OPEN_DESIGN_TELEMETRY_RETRIES ?? env.LANGFUSE_RETRIES,
        DEFAULT_FETCH_RETRIES,
      ),
    };
  }

  const config = readLangfuseConfig(env);
  return config == null ? null : { kind: 'langfuse', ...config };
}

function isVelaTelemetryEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.OPEN_DESIGN_VELA_TELEMETRY?.trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

/**
 * Completed-run and feedback telemetry share the same sink selection: Vela when
 * a Control Key is present, otherwise the anonymous relay / direct Langfuse.
 * Feedback score-only batches keep the client run id as `data.traceId`; Vela
 * re-scopes it with the same account hash as the original run batch.
 */
export function readRunTelemetrySinkConfig(
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
): RunTelemetrySinkConfig | null {
  if (isVelaTelemetryEnabled(env)) {
    const context = readVelaControlApiContext(env, configuredEnv);
    const controlKey = context?.controlKey?.trim() ?? '';
    if (context && controlKey) {
      return {
        kind: 'vela',
        apiUrl: (context.apiUrl.trim() || 'https://amr-api.open-design.ai').replace(
          /\/+$/,
          '',
        ),
        controlKey,
        timeoutMs: parsePositiveInt(
          env.OPEN_DESIGN_TELEMETRY_TIMEOUT_MS ?? env.LANGFUSE_TIMEOUT_MS,
          DEFAULT_FETCH_TIMEOUT_MS,
        ),
        retries: parseNonNegativeInt(
          env.OPEN_DESIGN_TELEMETRY_RETRIES ?? env.LANGFUSE_RETRIES,
          DEFAULT_FETCH_RETRIES,
        ),
      };
    }
  }
  return readTelemetrySinkConfig(env);
}

/**
 * Feedback uses the same sink as completed-run telemetry. Vela accepts
 * score-only batches on the same endpoint and binds them via client run id.
 */
export function readFeedbackTelemetrySinkConfig(
  env: NodeJS.ProcessEnv = process.env,
  configuredEnv: Record<string, string> = {},
): RunTelemetrySinkConfig | null {
  return readRunTelemetrySinkConfig(env, configuredEnv);
}

export function deriveLangfuseDeliveryState(
  prefs: TelemetryPrefs,
  sink: RunTelemetrySinkConfig | null,
): LangfuseDeliveryState {
  if (prefs.metrics !== true) {
    return {
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'metrics_consent_off',
    };
  }
  if (prefs.content !== true) {
    return {
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'content_consent_off',
    };
  }
  if (!sink) {
    return {
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'missing_sink_config',
    };
  }
  return {
    langfuse_expected: true,
    langfuse_delivery_status: 'queued',
  };
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

// Byte-aware UTF-8 truncation. JS String.length counts UTF-16 code units,
// not bytes — non-ASCII text (CJK, emoji) can occupy 2-4× as many bytes as
// characters, so a `value.length > max` cap silently lets oversized prompts
// through. We truncate on a UTF-8 byte boundary so the result is still
// valid Unicode (no half-encoded characters).
function truncate(value: string | undefined, maxBytes: number): string | undefined {
  if (!value) return undefined;
  const buf = Buffer.from(value, 'utf8');
  if (buf.length <= maxBytes) return value;
  let cut = maxBytes;
  // UTF-8 continuation bytes have the bit pattern 10xxxxxx. Walk backwards
  // until we land on a leading byte (0xxxxxxx, 110xxxxx, 1110xxxx, 11110xxx)
  // so the slice doesn't end mid-character.
  while (cut > 0 && (buf[cut]! & 0xc0) === 0x80) cut -= 1;
  return buf.subarray(0, cut).toString('utf8');
}

function buildTagList(ctx: ReportContext): string[] {
  const tags = ['open-design', `project:${ctx.projectId}`];
  if (ctx.agentId) tags.push(`agent:${ctx.agentId}`);
  if (ctx.turn?.model) tags.push(`model:${ctx.turn.model}`);
  if (ctx.turn?.skillId) tags.push(`skill:${ctx.turn.skillId}`);
  if (ctx.turn?.designSystemId) tags.push(`ds:${ctx.turn.designSystemId}`);
  if (ctx.runtime?.os) tags.push(`os:${ctx.runtime.os}`);
  if (ctx.runtime?.clientType && ctx.runtime.clientType !== 'unknown') {
    tags.push(`client:${ctx.runtime.clientType}`);
  }
  if (ctx.extraTags?.length) tags.push(...ctx.extraTags);
  return tags;
}

function validTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function timingSpanBody(input: {
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

function promptBuildSummary(
  promptTelemetry: PromptStackTelemetry | undefined,
): Record<string, unknown> {
  if (!promptTelemetry) {
    return {
      prompt_stack_available: false,
    };
  }
  return {
    prompt_stack_available: true,
    section_count: promptTelemetry.sectionCount,
    stack_fingerprint: promptTelemetry.stackFingerprint,
    prompt_fingerprint: promptTelemetry.promptFingerprint,
    raw_bytes: promptTelemetry.rawBytes,
    redacted_bytes: promptTelemetry.redactedBytes,
    redacted_content_bytes: promptTelemetry.redactedContentBytes,
  };
}

function objectRefSummary(
  entries: Array<AttachmentManifestEntry | ArtifactManifestEntry> | undefined,
): Array<Record<string, unknown>> | undefined {
  if (!entries?.length) return undefined;
  return entries.map((entry) => ({
    object_class: entry.object_class,
    storage_ref: entry.storage_ref,
    status: entry.status,
    size_bytes: entry.size_bytes,
    sha256: entry.sha256,
    mime_type: entry.mime_type,
    extension: entry.extension,
    redacted: entry.redacted,
    truncated: entry.truncated,
    retention_policy: entry.retention_policy,
    access_scope: entry.access_scope,
    sensitivity: entry.sensitivity,
    source: entry.source,
    ...(entry.object_class === 'attachment'
      ? { attachment_id: entry.attachment_id }
      : { artifact_id: entry.artifact_id, type: entry.type }),
  }));
}

function cappedManifestEntries<T>(entries: T[] | undefined): T[] | undefined {
  return entries ? entries.slice(0, ARTIFACTS_MAX_ITEMS) : undefined;
}

function manifestTruncated(entries: unknown[] | undefined): true | undefined {
  return entries && entries.length > ARTIFACTS_MAX_ITEMS ? true : undefined;
}

function tokenUsageSummary(
  usage: MessageSummary['usage'],
): Record<string, unknown> | undefined {
  if (!usage) return undefined;
  return {
    input: usage.inputTokens,
    input_provider: usage.inputTokensProvider,
    input_effective: usage.inputTokensEffective,
    output: usage.outputTokens,
    total: usage.totalTokens,
    cache_read_input: usage.cacheReadInputTokens,
    cache_creation_input: usage.cacheCreationInputTokens,
    uncached_input: usage.uncachedInputTokens,
    cache_hit_ratio: usage.cacheHitRatio,
    cache_token_source: usage.cacheTokenSource,
  };
}

function latestAgentCostUsd(ctx: ReportContext): number | undefined {
  if (!ctx.agentEvents?.length) return undefined;
  for (let i = ctx.agentEvents.length - 1; i >= 0; i -= 1) {
    const event = ctx.agentEvents[i]!;
    const cost = event.output?.cost_usd;
    if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
      return cost;
    }
  }
  return undefined;
}

function phaseCost(
  phase: string,
  costUsd: number | null,
  status: string,
  source: string,
  note?: string,
): Record<string, unknown> {
  return {
    phase,
    cost_usd: costUsd,
    cost_status: status,
    cost_source: source,
    ...(note ? { note } : {}),
  };
}

function buildCostBreakdown(ctx: ReportContext): Record<string, unknown> {
  const costUsd = latestAgentCostUsd(ctx);
  const hasCost = costUsd !== undefined;
  return {
    cost_usd: costUsd ?? null,
    currency: 'USD',
    pricing_version: hasCost ? 'provider_reported' : 'unavailable',
    cost_source: hasCost ? 'agent_usage_event' : 'unavailable',
    cost_status: hasCost ? 'available' : 'unavailable',
    unavailable_reason: hasCost
      ? undefined
      : 'agent runtime did not report total_cost_usd',
    token_usage: tokenUsageSummary(ctx.message.usage),
    phase_costs: {
      prompt_build: phaseCost(
        'prompt-build',
        null,
        'not_metered',
        'not_applicable',
        'local prompt assembly; no provider call in this phase',
      ),
      agent_call: phaseCost(
        'agent-call',
        costUsd ?? null,
        hasCost ? 'available' : 'unavailable',
        hasCost ? 'agent_usage_event' : 'unavailable',
        hasCost
          ? 'provider-reported total for the agent call; not split across stream/tools/artifact internally'
          : 'runtime did not report total_cost_usd',
      ),
      tool_execution: phaseCost(
        'tool-execution',
        null,
        'included_in_agent_call_or_not_metered',
        'not_split',
        'tool spans are local process/tool time; provider token cost is only available at agent-call granularity',
      ),
      artifact_generation: phaseCost(
        'artifact-generation',
        null,
        'included_in_agent_call',
        'not_split',
        'artifact output is generated inside the agent call and is not separately priced',
      ),
      verification: phaseCost(
        'verification',
        null,
        'not_instrumented',
        'unavailable',
        'preview/screenshot/responsive verification is not yet emitted as a structured measured phase',
      ),
    },
  };
}

function cleanNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function sectionAttributionBytes(section: PromptTelemetrySection): number {
  return cleanNumber(section.redactedBytes) ?? cleanNumber(section.rawBytes) ?? 0;
}

function redactedContentBytes(section: PromptTelemetrySection): number {
  return Buffer.byteLength(section.redactedContent ?? '', 'utf8');
}

function allocateProportionalTokens(
  total: number | undefined,
  sections: Array<{ section: PromptTelemetrySection; weightBytes: number }>,
): Map<PromptTelemetrySection, number> {
  const out = new Map<PromptTelemetrySection, number>();
  const cleanTotal = cleanNumber(total);
  if (cleanTotal === undefined || cleanTotal <= 0) return out;
  const totalWeight = sections.reduce((sum, item) => sum + item.weightBytes, 0);
  if (totalWeight <= 0) return out;

  let assigned = 0;
  let largest: { section: PromptTelemetrySection; tokens: number } | null = null;
  for (const item of sections) {
    const exact = (cleanTotal * item.weightBytes) / totalWeight;
    const rounded = Math.floor(exact);
    out.set(item.section, rounded);
    assigned += rounded;
    if (!largest || item.weightBytes > sectionAttributionBytes(largest.section)) {
      largest = { section: item.section, tokens: rounded };
    }
  }
  const remainder = Math.round(cleanTotal) - assigned;
  if (largest && remainder > 0) {
    out.set(largest.section, (out.get(largest.section) ?? 0) + remainder);
  }
  return out;
}

function buildPromptStackBlameMetadata(
  promptStack: PromptStackTelemetry | undefined,
  usage: MessageSummary['usage'] | undefined,
  timings: RunTimingAnalytics | undefined,
): Record<string, unknown> {
  if (!promptStack || promptStack.sections.length === 0) return {};
  const weightedSections = promptStack.sections
    .map((section) => ({
      section,
      weightBytes: sectionAttributionBytes(section),
    }))
    .filter((item) => item.weightBytes > 0);
  if (weightedSections.length === 0) return {};

  const totalBytes = weightedSections.reduce((sum, item) => sum + item.weightBytes, 0);
  const sorted = [...weightedSections].sort(
    (a, b) => b.weightBytes - a.weightBytes || a.section.ordinal - b.section.ordinal,
  );
  const cacheCreationBySection = allocateProportionalTokens(
    usage?.cacheCreationInputTokens,
    weightedSections,
  );
  const cacheReadBySection = allocateProportionalTokens(
    usage?.cacheReadInputTokens,
    weightedSections,
  );
  const inputEffectiveBySection = allocateProportionalTokens(
    usage?.inputTokensEffective ?? usage?.inputTokens,
    weightedSections,
  );
  const uncachedBySection = allocateProportionalTokens(
    usage?.uncachedInputTokens,
    weightedSections,
  );

  const sectionRow = ({ section, weightBytes }: { section: PromptTelemetrySection; weightBytes: number }) => {
    const share = totalBytes > 0 ? weightBytes / totalBytes : 0;
    return {
      kind: section.kind,
      ordinal: section.ordinal,
      contentMode: section.contentMode,
      rawBytes: section.rawBytes,
      redactedBytes: section.redactedBytes,
      redactedContentBytes: redactedContentBytes(section),
      attributionBytes: weightBytes,
      attributionShare: Number(share.toFixed(6)),
      truncated: section.truncated,
      ...(section.truncationReason ? { truncationReason: section.truncationReason } : {}),
      estimatedInputEffectiveTokens: inputEffectiveBySection.get(section) ?? undefined,
      estimatedCacheCreationInputTokens: cacheCreationBySection.get(section) ?? undefined,
      estimatedCacheReadInputTokens: cacheReadBySection.get(section) ?? undefined,
      estimatedUncachedInputTokens: uncachedBySection.get(section) ?? undefined,
    };
  };

  const primary = sorted[0]!;
  const primaryShare = totalBytes > 0 ? primary.weightBytes / totalBytes : 0;
  return {
    promptStack_topSectionsByBytes: sorted
      .slice(0, PROMPT_STACK_BLAME_MAX_SECTIONS)
      .map(sectionRow),
    cacheCreationTokensBySection: sorted
      .filter(({ section }) => (cacheCreationBySection.get(section) ?? 0) > 0)
      .map(({ section, weightBytes }) => ({
        kind: section.kind,
        ordinal: section.ordinal,
        attributionBytes: weightBytes,
        estimatedCacheCreationInputTokens: cacheCreationBySection.get(section) ?? 0,
      })),
    promptStack_ttftAttribution: {
      method: 'proportional_by_prompt_section_redacted_bytes',
      estimation_warning:
        'Provider reports aggregate prompt/cache tokens only; section token values are estimates for diagnosis, not billing truth.',
      time_to_first_token_ms: timings?.time_to_first_token_ms,
      spawn_to_first_token_ms: timings?.spawn_to_first_token_ms,
      totalAttributionBytes: totalBytes,
      sectionCount: weightedSections.length,
      primarySectionKind: primary.section.kind,
      primarySectionOrdinal: primary.section.ordinal,
      primarySectionAttributionBytes: primary.weightBytes,
      primarySectionAttributionShare: Number(primaryShare.toFixed(6)),
      primarySectionEstimatedInputEffectiveTokens:
        inputEffectiveBySection.get(primary.section) ?? undefined,
      primarySectionEstimatedCacheCreationInputTokens:
        cacheCreationBySection.get(primary.section) ?? undefined,
      primarySectionEstimatedCacheReadInputTokens:
        cacheReadBySection.get(primary.section) ?? undefined,
      cacheTokenSource: usage?.cacheTokenSource,
    },
  };
}

function durationMs(startedAt: number, endedAt: number): number {
  return Math.max(0, Math.round(endedAt - startedAt));
}

function buildToolPerformanceDiagnostics(
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

function buildArtifactWriteDiagnostics(
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

function buildSemanticPhaseDiagnostics(ctx: ReportContext): Record<string, unknown> {
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

function buildPerformanceDiagnostics(ctx: ReportContext): Record<string, unknown> {
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

function buildTimingSpanBodies(
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

function usageTotal(usage: MessageSummary['usage']): number {
  if (!usage) return 0;
  const values = [
    usage.inputTokens,
    usage.inputTokensProvider,
    usage.inputTokensEffective,
    usage.outputTokens,
    usage.totalTokens,
    usage.cacheReadInputTokens,
    usage.cacheCreationInputTokens,
    usage.uncachedInputTokens,
    usage.estimatedContextTokens,
  ];
  let total = 0;
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) total += value;
  }
  return total;
}

function redactArtifactBlocks(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.replace(
    /<artifact\b([^>]*)>[\s\S]*?<\/artifact>/gi,
    (_match, attrs: string) =>
      `<artifact${attrs}>[REDACTED:artifact_content]</artifact>`,
  );
}

const CONTENT_TOOL_NAMES = new Set([
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
]);

function redactLocalPaths(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value
    .replace(/\/Users\/[^/\s"']+(?:\/[^ \n\r\t"'`<>)]*)?/g, '[REDACTED:local_path]')
    .replace(/[A-Za-z]:\\Users\\[^\\\s"']+(?:\\[^ \n\r\t"'`<>)]*)?/g, '[REDACTED:local_path]');
}

function traceSafeToolPayload(
  toolName: string,
  direction: 'input' | 'output',
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  if (CONTENT_TOOL_NAMES.has(toolName)) {
    return `[REDACTED:tool_${direction}:content_tool:${toolName}]`;
  }
  return redactLocalPaths(redactArtifactBlocks(value));
}

function shouldCreateGenerationObservation(ctx: ReportContext): boolean {
  if (ctx.run.status === 'succeeded') return true;
  if (usageTotal(ctx.message.usage) > 0) return true;
  if (ctx.eventsSummary.toolCalls > 0) return true;
  return ctx.run.failure?.failure_stage !== 'session_init';
}

export function buildTracePayload(ctx: ReportContext): unknown[] {
  const wantsContent = ctx.prefs.metrics === true && ctx.prefs.content === true;
  const wantsArtifacts = wantsContent;
  const safeRunError =
    ctx.run.error === undefined ? undefined : redactSecrets(ctx.run.error);

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
    ctx.langfuse ??
    deriveLangfuseDeliveryState(ctx.prefs, readRunTelemetrySinkConfig());
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
    error: safeRunError,
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
    agentCliVersion: ctx.runtime?.agentCliVersion,
    runtimeCompanionName: ctx.runtime?.runtimeCompanionName,
    runtimeCompanionVersion: ctx.runtime?.runtimeCompanionVersion,
    retryAttemptCount: ctx.run.retryAttemptCount,
    retryFinalResult: ctx.run.retryFinalResult,
    retrySuppressedReason: ctx.run.retrySuppressedReason,
    retryOriginalFailureCategory:
      ctx.run.retryOriginalFailure?.failure_category,
    retryOriginalFailureDetail:
      ctx.run.retryOriginalFailure?.failure_detail,
    retryOriginalFailureStage:
      ctx.run.retryOriginalFailure?.failure_stage,
    ...promptStackFlatMetadata,
    ...promptStackBlameMetadata,
  };

  const observationVersion =
    ctx.runtime?.agentCliVersion ?? ctx.runtime?.appVersion;

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
        release: ctx.runtime?.appVersion,
        version: observationVersion,
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
        statusMessage: safeRunError,
        version: observationVersion,
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
        statusMessage: safeRunError,
        version: observationVersion,
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
        statusMessage: safeRunError,
        version: observationVersion,
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
        statusMessage: safeRunError,
        metadata: {
          status: ctx.run.status,
          errors: ctx.eventsSummary.errors,
        },
      },
    });
  }

  return batch;
}

async function postLangfuseBatch(
  config: LangfuseConfig,
  batch: unknown[],
  fetchImpl: typeof fetch,
): Promise<LangfuseDeliveryState> {
  const attempts = config.retries + 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(`${config.baseUrl}/api/public/ingestion`, {
        method: 'POST',
        headers: {
          Authorization: config.authHeader,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(config.timeoutMs),
        body: JSON.stringify({ batch }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        if (
          attempt < attempts &&
          (response.status === 429 || response.status >= 500)
        ) {
          await waitBeforeRetry(attempt);
          continue;
        }
        console.warn(
          `[langfuse-trace] Ingestion failed ${response.status}: ${body.slice(0, 200)}`,
        );
        return {
          langfuse_expected: true,
          langfuse_delivery_status: 'failed',
          langfuse_drop_reason: ingestionDropReasonFromStatus(
            response.status,
            'langfuse',
          ),
        };
      }
      // Langfuse legacy ingestion responds with HTTP 207 Multi-Status whose
      // body shape is `{ successes: [...], errors: [...] }`. `response.ok`
      // is true for 207, so per-event validation errors slip through unless
      // we look at the body. Surface them so a malformed payload doesn't
      // silently disappear server-side.
      const body = await response.text().catch(() => '');
      if (body && warnPerEventErrors(body, 'Per-event errors')) {
        return {
          langfuse_expected: true,
          langfuse_delivery_status: 'failed',
          langfuse_drop_reason: dropReasonFromPerEventErrors(body, 'langfuse'),
        };
      }
      return {
        langfuse_expected: true,
        langfuse_delivery_status: 'accepted',
      };
    } catch (error) {
      if (attempt < attempts) {
        await waitBeforeRetry(attempt);
        continue;
      }
      console.warn(`[langfuse-trace] Fetch error: ${String(error)}`);
      return {
        langfuse_expected: true,
        langfuse_delivery_status: 'failed',
        langfuse_drop_reason: 'network_error',
      };
    }
  }
  return {
    langfuse_expected: true,
    langfuse_delivery_status: 'failed',
    langfuse_drop_reason: 'network_error',
  };
}

async function postRelayBatch(
  config: Extract<TelemetrySinkConfig, { kind: 'relay' }>,
  body: string,
  fetchImpl: typeof fetch,
): Promise<LangfuseDeliveryState> {
  const attempts = config.retries + 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(config.relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Open-Design-Telemetry': 'langfuse-ingestion-v1',
        },
        signal: AbortSignal.timeout(config.timeoutMs),
        body,
      });
      if (!response.ok) {
        const responseBody = await response.text().catch(() => '');
        if (
          attempt < attempts &&
          (response.status === 429 || response.status >= 500)
        ) {
          await waitBeforeRetry(attempt);
          continue;
        }
        console.warn(
          `[langfuse-trace] Relay failed ${response.status}: ${responseBody.slice(0, 200)}`,
        );
        return {
          langfuse_expected: true,
          langfuse_delivery_status: 'failed',
          langfuse_drop_reason: ingestionDropReasonFromStatus(
            response.status,
            'relay',
          ),
        };
      }

      const responseBody = await response.text().catch(() => '');
      if (
        responseBody &&
        warnPerEventErrors(responseBody, 'Relay per-event errors')
      ) {
        return {
          langfuse_expected: true,
          langfuse_delivery_status: 'failed',
          langfuse_drop_reason: dropReasonFromPerEventErrors(
            responseBody,
            'relay',
          ),
        };
      }
      return {
        langfuse_expected: true,
        langfuse_delivery_status: 'accepted',
      };
    } catch (error) {
      if (attempt < attempts) {
        await waitBeforeRetry(attempt);
        continue;
      }
      console.warn(`[langfuse-trace] Relay fetch error: ${String(error)}`);
      return {
        langfuse_expected: true,
        langfuse_delivery_status: 'failed',
        langfuse_drop_reason: 'network_error',
      };
    }
  }
  return {
    langfuse_expected: true,
    langfuse_delivery_status: 'failed',
    langfuse_drop_reason: 'network_error',
  };
}

const LANGFUSE_TYPE_TO_VELA_KIND = {
  'trace-create': 'trace',
  'span-create': 'span',
  'generation-create': 'generation',
  'event-create': 'event',
  'score-create': 'score',
} as const;

type VelaSourceEventType = keyof typeof LANGFUSE_TYPE_TO_VELA_KIND;

interface VelaSourceEvent {
  type: VelaSourceEventType;
  timestamp: string;
  body: Record<string, unknown>;
}

interface VelaTelemetryEnvelope {
  version: 1;
  installationId: string;
  events: Array<{
    id: string;
    kind: (typeof LANGFUSE_TYPE_TO_VELA_KIND)[VelaSourceEventType];
    timestamp: string;
    data: Record<string, unknown>;
  }>;
}

function asVelaSourceEvents(batch: unknown[]): VelaSourceEvent[] {
  return batch.filter((item): item is VelaSourceEvent => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const event = item as Partial<VelaSourceEvent>;
    return (
      typeof event.type === 'string' &&
      event.type in LANGFUSE_TYPE_TO_VELA_KIND &&
      typeof event.timestamp === 'string' &&
      !!event.body &&
      typeof event.body === 'object' &&
      !Array.isArray(event.body)
    );
  });
}

function stableVelaEventId(event: VelaSourceEvent): string {
  const bodyId =
    typeof event.body.id === 'string' && event.body.id.trim()
      ? event.body.id.trim()
      : JSON.stringify(event.body);
  return `od-${createHash('sha256')
    .update(`${event.type}\n${bodyId}`, 'utf8')
    .digest('hex')}`;
}

function buildVelaEnvelope(
  batch: unknown[],
  installationId: string,
): VelaTelemetryEnvelope {
  return {
    version: 1,
    installationId,
    events: asVelaSourceEvents(batch).map((event) => ({
      id: stableVelaEventId(event),
      kind: LANGFUSE_TYPE_TO_VELA_KIND[event.type],
      timestamp: event.timestamp,
      data: event.body,
    })),
  };
}

function velaIdempotencyKey(envelope: VelaTelemetryEnvelope): string {
  // Wrapper timestamps are excluded: rebuilding an otherwise identical run
  // should retain its key, while any changed trace/observation body gets a new
  // key. Retries of this request reuse the same serialized envelope and key.
  const canonical = {
    version: envelope.version,
    installationId: envelope.installationId,
    events: envelope.events.map(({ id, kind, data }) => ({ id, kind, data })),
  };
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

async function postVelaBatch(
  config: VelaTelemetrySinkConfig,
  batch: unknown[],
  installationId: string,
  fetchImpl: typeof fetch,
  opts: { allowAnonymousAuthFallback?: boolean } = {},
): Promise<LangfuseDeliveryState> {
  // Completed-run batches may fall back to the anonymous relay when Vela
  // rejects auth (expired Control Key, etc.). Score-only feedback must not:
  // the matching trace is account-scoped on Vela, so anonymous delivery would
  // orphan the scores while the feedback route has already reported accepted.
  const allowAnonymousAuthFallback = opts.allowAnonymousAuthFallback !== false;
  const envelope = buildVelaEnvelope(batch, installationId);
  const body = JSON.stringify(envelope);
  const idempotencyKey = velaIdempotencyKey(envelope);
  const attempts = config.retries + 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(
        `${config.apiUrl}/api/v1/open-design/telemetry`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.controlKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          signal: AbortSignal.timeout(config.timeoutMs),
          body,
        },
      );
      if (response.status === 202) {
        return {
          langfuse_expected: true,
          langfuse_delivery_status: 'accepted',
        };
      }

      await response.text().catch(() => '');
      if (
        allowAnonymousAuthFallback &&
        (response.status === 401 || response.status === 403)
      ) {
        const fallback = readTelemetrySinkConfig();
        if (fallback) {
          const serialized = JSON.stringify({ batch });
          return fallback.kind === 'relay'
            ? postRelayBatch(fallback, serialized, fetchImpl)
            : postLangfuseBatch(fallback, batch, fetchImpl);
        }
      }
      if (
        attempt < attempts &&
        (response.status === 429 || response.status >= 500)
      ) {
        await waitBeforeRetry(attempt);
        continue;
      }
      console.warn(
        `[langfuse-trace] Vela telemetry failed status=${response.status}`,
      );
      return {
        langfuse_expected: true,
        langfuse_delivery_status: 'failed',
        langfuse_drop_reason: ingestionDropReasonFromStatus(
          response.status,
          'vela',
        ),
      };
    } catch (error) {
      if (attempt < attempts) {
        await waitBeforeRetry(attempt);
        continue;
      }
      console.warn(`[langfuse-trace] Vela telemetry fetch error: ${String(error)}`);
      return {
        langfuse_expected: true,
        langfuse_delivery_status: 'failed',
        langfuse_drop_reason: 'network_error',
      };
    }
  }

  return {
    langfuse_expected: true,
    langfuse_delivery_status: 'failed',
    langfuse_drop_reason: 'network_error',
  };
}

function waitBeforeRetry(attempt: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, Math.min(250 * attempt, 1000)),
  );
}

function normalizeRunTelemetrySinkConfig(
  config: RunTelemetrySinkConfig | LangfuseConfig,
): RunTelemetrySinkConfig {
  if ('kind' in config) return config;
  return { kind: 'langfuse', ...config };
}

function resolveRunReportConfig(
  opts: ReportRunOpts,
): RunTelemetrySinkConfig | null {
  if (opts.config === undefined) {
    return readRunTelemetrySinkConfig(process.env, opts.configuredEnv ?? {});
  }
  if (opts.config == null) return null;
  return normalizeRunTelemetrySinkConfig(opts.config);
}

function resolveFeedbackReportConfig(
  opts: ReportFeedbackOpts,
): RunTelemetrySinkConfig | null {
  if (opts.config === undefined) {
    return readFeedbackTelemetrySinkConfig(
      process.env,
      opts.configuredEnv ?? {},
    );
  }
  if (opts.config == null) return null;
  return normalizeRunTelemetrySinkConfig(opts.config);
}

function ingestionDropReasonFromStatus(
  status: number,
  sinkKind: RunTelemetrySinkConfig['kind'],
): LangfuseDropReason {
  if (sinkKind === 'vela') {
    if (status === 401) return 'vela_401';
    if (status === 403) return 'vela_403';
    if (status === 413) return 'vela_413';
    if (status === 429) return 'vela_429';
    if (status >= 500) return 'vela_5xx';
    return 'vela_400';
  }
  if (sinkKind === 'relay') {
    if (status === 429) return 'relay_429';
    if (status === 413) return 'relay_413';
    if (status >= 500) return 'relay_5xx';
    return 'langfuse_4xx';
  }
  if (status >= 500) return 'langfuse_5xx';
  return 'langfuse_4xx';
}

function dropReasonFromPerEventErrors(
  responseBody: string,
  sinkKind: TelemetrySinkConfig['kind'],
): LangfuseDropReason {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return sinkKind === 'relay' ? 'relay_5xx' : 'langfuse_5xx';
  }
  const errors =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as { errors?: unknown }).errors
      : undefined;
  if (!Array.isArray(errors)) {
    return sinkKind === 'relay' ? 'relay_5xx' : 'langfuse_5xx';
  }
  for (const error of errors) {
    if (!error || typeof error !== 'object' || Array.isArray(error)) continue;
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number' && Number.isFinite(status)) {
      return ingestionDropReasonFromStatus(status, sinkKind);
    }
  }
  return sinkKind === 'relay' ? 'relay_5xx' : 'langfuse_4xx';
}

function warnPerEventErrors(responseBody: string, label: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return false;
  }
  const errors =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as { errors?: unknown }).errors
      : undefined;
  if (Array.isArray(errors) && errors.length > 0) {
    console.warn(
      `[langfuse-trace] ${label} (${errors.length}): ${JSON.stringify(errors).slice(0, 500)}`,
    );
    return true;
  }
  return false;
}

function objectRegistrationBatch(batch: unknown[]): unknown[] {
  const trace = batch.find((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    return (item as { type?: unknown }).type === 'trace-create';
  });
  if (!trace || typeof trace !== 'object' || Array.isArray(trace)) return [];
  const source = trace as {
    id?: unknown;
    type?: unknown;
    timestamp?: unknown;
    body?: unknown;
  };
  if (!source.body || typeof source.body !== 'object' || Array.isArray(source.body)) {
    return [];
  }
  const body = source.body as Record<string, unknown>;
  const sourceMetadata =
    body.metadata &&
    typeof body.metadata === 'object' &&
    !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : {};
  return [
    {
      id: source.id,
      type: source.type,
      timestamp: source.timestamp,
      body: {
        id: body.id,
        name: body.name,
        userId: body.userId,
        metadata: {
          projectId: sourceMetadata.projectId,
          attachment_manifest: sourceMetadata.attachment_manifest,
          artifact_manifest: sourceMetadata.artifact_manifest,
          input_text_snapshot_manifest:
            sourceMetadata.input_text_snapshot_manifest,
          registration_only: true,
        },
      },
    },
  ];
}

export async function reportRunCompleted(
  ctx: ReportContext,
  opts: ReportRunOpts = {},
): Promise<LangfuseDeliveryState> {
  const notExpected = deriveLangfuseDeliveryState(ctx.prefs, null);
  if (ctx.prefs.metrics !== true) return notExpected;
  if (ctx.prefs.content !== true) return notExpected;

  const config = resolveRunReportConfig(opts);
  const langfuseDelivery = deriveLangfuseDeliveryState(ctx.prefs, config);
  if (!config) {
    if (!missingTelemetrySinkWarned) {
      // Warn once per daemon process; packaged config is loaded at process
      // start, so repeated run-level warnings would only add noise.
      missingTelemetrySinkWarned = true;
      console.warn(
        '[langfuse-trace] Telemetry metrics are enabled but no relay or Langfuse credentials are configured',
      );
    }
    return langfuseDelivery;
  }

  let batch: unknown[];
  try {
    batch = buildTracePayload({ ...ctx, langfuse: langfuseDelivery });
    if (opts.deliveryPurpose === 'object-registration') {
      batch = objectRegistrationBatch(batch);
    }
  } catch (error) {
    console.warn(`[langfuse-trace] Payload build error: ${String(error)}`);
    return {
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'payload_too_large',
    };
  }

  const serialized = JSON.stringify({ batch });
  // Compare actual UTF-8 byte length, not String.length (UTF-16 code units),
  // so the cap matches the byte-oriented contract documented in the spec
  // (and the byte-oriented limit Langfuse enforces server-side).
  const serializedBytes = Buffer.byteLength(serialized, 'utf8');
  if (serializedBytes > HARD_BATCH_MAX_BYTES) {
    console.warn(
      `[langfuse-trace] Batch too large (${serializedBytes}B > ${HARD_BATCH_MAX_BYTES}B), dropping trace ${ctx.run.runId}`,
    );
    return {
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'payload_too_large',
    };
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (config.kind === 'vela') {
    const installationId = ctx.installationId?.trim() ?? '';
    if (!installationId) {
      const fallback = readTelemetrySinkConfig();
      if (!fallback) {
        return {
          langfuse_expected: false,
          langfuse_delivery_status: 'not_expected',
          langfuse_drop_reason: 'missing_sink_config',
        };
      }
      return fallback.kind === 'relay'
        ? postRelayBatch(fallback, serialized, fetchImpl)
        : postLangfuseBatch(fallback, batch, fetchImpl);
    }
    return postVelaBatch(config, batch, installationId, fetchImpl);
  }
  if (config.kind === 'relay') {
    return postRelayBatch(config, serialized, fetchImpl);
  }
  return postLangfuseBatch(config, batch, fetchImpl);
}

// Build a Langfuse `score-create` batch for a user-supplied turn rating.
//
// Langfuse scores let evals filter traces by user feedback. We emit one
// NUMERIC score (`user_rating`, +1 / -1) plus optional CATEGORICAL scores
// for each reason code, so the Langfuse UI's score filters work out of
// the box. Raw custom-reason text rides in the score metadata when the
// user opted into telemetry.content; the consent gate lives in
// reportRunFeedback below, so this builder stays content-agnostic.
//
// Limitation: stable score ids (`${traceId}-rating`, `${traceId}-reason-${code}`)
// mean re-submission overwrites cleanly, but reason codes the user removes
// in a follow-up submission do not get a tombstone. A future change can
// thread `removedReasonCodes` through and emit overwriting "cleared"
// scores for them; not done here to keep this PR scoped to the bridge.
export function buildFeedbackPayload(ctx: FeedbackReportContext): unknown[] {
  const traceId = ctx.runId;
  const nowIso = new Date().toISOString();
  const batch: unknown[] = [];

  const ratingMetadata: Record<string, unknown> = {
    reasonCodes: ctx.reasonCodes,
    reasonCount: ctx.reasonCodes.length,
    hasCustomReason: ctx.hasCustomReason,
    // Raw text — gated upstream by telemetry.content consent.
    customReason: ctx.customReason || undefined,
    installationId: ctx.installationId ?? undefined,
    ...(ctx.metadata ?? {}),
  };

  batch.push({
    id: randomUUID(),
    type: 'score-create',
    timestamp: nowIso,
    body: {
      id: `${traceId}-rating`,
      traceId,
      name: 'user_rating',
      value: ctx.rating === 'positive' ? 1 : -1,
      dataType: 'NUMERIC',
      comment: ctx.rating,
      metadata: ratingMetadata,
    },
  });

  for (const code of ctx.reasonCodes) {
    batch.push({
      id: randomUUID(),
      type: 'score-create',
      timestamp: nowIso,
      body: {
        // Stable per (run, code) so re-submission overwrites cleanly.
        id: `${traceId}-reason-${code}`,
        traceId,
        name: 'user_rating_reason',
        value: code,
        dataType: 'CATEGORICAL',
        // Group the reason under the rating it was submitted with so a
        // "matched_request" tag on a thumbs-down run is still visibly
        // negative in the Langfuse UI.
        comment: ctx.rating,
      },
    });
  }

  return batch;
}

export async function reportRunFeedback(
  ctx: FeedbackReportContext,
  opts: ReportFeedbackOpts = {},
): Promise<void> {
  if (ctx.prefs.metrics !== true) return;
  if (ctx.prefs.content !== true) return;

  const config = resolveFeedbackReportConfig(opts);
  if (!config) return;

  let batch: unknown[];
  try {
    batch = buildFeedbackPayload(ctx);
  } catch (error) {
    console.warn(`[langfuse-trace] Feedback payload build error: ${String(error)}`);
    return;
  }

  const serialized = JSON.stringify({ batch });
  const serializedBytes = Buffer.byteLength(serialized, 'utf8');
  if (serializedBytes > HARD_BATCH_MAX_BYTES) {
    console.warn(
      `[langfuse-trace] Feedback batch too large (${serializedBytes}B > ${HARD_BATCH_MAX_BYTES}B), dropping feedback for ${ctx.runId}`,
    );
    return;
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (config.kind === 'vela') {
    const installationId = ctx.installationId?.trim() ?? '';
    if (!installationId) {
      const fallback = readTelemetrySinkConfig();
      if (!fallback) return;
      if (fallback.kind === 'relay') {
        await postRelayBatch(fallback, serialized, fetchImpl);
        return;
      }
      await postLangfuseBatch(fallback, batch, fetchImpl);
      return;
    }
    // Never fall back to anonymous sinks for feedback: scores need the
    // account-scoped Vela trace from the completed run.
    await postVelaBatch(config, batch, installationId, fetchImpl, {
      allowAnonymousAuthFallback: false,
    });
    return;
  }
  if (config.kind === 'relay') {
    await postRelayBatch(config, serialized, fetchImpl);
    return;
  }
  await postLangfuseBatch(config, batch, fetchImpl);
}
