/** @module langfuse-trace/core/types
 * Shared TypeScript interfaces and union types for the langfuse-trace domain.
 * Covers configuration shapes, delivery state, run/message/artifact summaries,
 * trace-safe object manifests, and the root ReportContext assembly envelope.
 * Part of the foundation kernel: imports only external daemon modules, never
 * a sibling subdirectory.
 */
import type { TelemetryPrefs } from '../../app-config.js';
import type { PromptStackTelemetry } from '../../prompt-telemetry.js';
import type {
  RunTelemetryTimestamps,
  RunTimingAnalytics,
} from '../../run-analytics-observability.js';
import type { RunFailureClassification } from '../../run-failure-classification.js';

/**
 * HTTP client configuration for reaching a Langfuse ingestion endpoint.
 * Used for both the relay path (relayUrl wraps the daemon) and the direct
 * Langfuse path; `authHeader` carries the Base64-encoded public:secret pair.
 */
export interface LangfuseConfig {
  authHeader: string;
  baseUrl: string;
  timeoutMs: number;
  retries: number;
}

/**
 * Lifecycle state of a single Langfuse delivery attempt.
 * `not_expected` means the run was never eligible (e.g. consent off at start);
 * `queued` / `accepted` / `failed` track the delivery progression.
 */
export type LangfuseDeliveryStatus =
  | 'not_expected'
  | 'queued'
  | 'accepted'
  | 'failed';

/**
 * Exhaustive reasons why a trace was not delivered to Langfuse.
 * Each code feeds observability dashboards so drop causes can be trended;
 * consent codes distinguish user choices from infra failures.
 * @see LangfuseDeliveryState
 */
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
  | 'network_error';

/**
 * Delivery outcome record attached to run telemetry.
 * `langfuse_expected` is false when the user opted out before the run completed,
 * distinguishing "never tried" from "tried and failed".
 */
export interface LangfuseDeliveryState {
  langfuse_expected: boolean;
  langfuse_delivery_status: LangfuseDeliveryStatus;
  langfuse_drop_reason?: LangfuseDropReason;
}

/**
 * Discriminated union selecting the telemetry delivery backend.
 * `relay` routes through the Open Design relay service (no Langfuse key in the
 * daemon); `langfuse` sends directly to Langfuse using the user's own project key.
 */
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

/**
 * Completed run lifecycle snapshot: the authoritative record of how a run ended.
 * Includes optional rich timing analytics, stderr/stdout tails for failure
 * diagnostics, and a structured failure classification when available.
 */
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
}

/**
 * One assistant generation turn: the prompt sent, the output received, and
 * the full token accounting needed for cache-efficiency and cost attribution.
 * Payloads are byte-capped by INPUT_MAX_BYTES / OUTPUT_MAX_BYTES before storage.
 */
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

/**
 * Lightweight artifact reference for a trace payload.
 * Carries only identity and size — never content — because artifact bodies
 * may be too large or privacy-sensitive for the telemetry channel.
 */
export interface ArtifactSummary {
  slug: string;
  type: string;
  sizeBytes: number;
  sha256?: string;
  createdAt?: string;
}

/**
 * Whether all objects in a run's manifest were successfully enumerated.
 * `partial` means some entries were skipped (e.g. DB query timeout);
 * `unavailable` means the manifest could not be fetched at all.
 */
export type ObjectManifestCompleteness = 'complete' | 'partial' | 'unavailable';

/**
 * Resolution status of an individual manifest entry.
 * `partial` signals that some metadata fields could not be populated.
 */
export type ObjectManifestStatus = 'ok' | 'partial' | 'unavailable';

/**
 * Privacy classification of an object forwarded to Langfuse.
 * Governs whether the entry is included and how much detail is retained;
 * `sensitive` entries are fully redacted before transmission.
 */
export type ObjectManifestSensitivity = 'public' | 'internal' | 'private' | 'sensitive';

/**
 * Who may access the object within Open Design's authorization model.
 * Used alongside sensitivity to decide trace-safe inclusion rules.
 */
export type ObjectManifestAccessScope = 'owner' | 'project' | 'workspace' | 'evaluator';

/**
 * How long an object is retained before automated cleanup.
 * Included in the trace manifest so evaluators can reason about
 * data availability when replaying or auditing stored runs.
 */
export type ObjectManifestRetentionPolicy =
  | 'ephemeral'
  | 'observability_90d'
  | 'project_lifetime'
  | 'eval_fixture'
  | 'legal_hold';

/**
 * Privacy-filtered object metadata safe to forward to Langfuse.
 * Strips any field whose value could reconstruct user content while retaining
 * identity, size, storage ref, and policy fields needed for observability.
 * Concrete entries extend this base with their class-specific id field.
 */
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

/**
 * Trace-safe manifest entry for user-uploaded file attachments.
 * `attachment_id` is the Open Design identifier for the underlying object.
 */
export interface AttachmentManifestEntry extends TraceSafeObjectManifestBase {
  object_class: 'attachment';
  attachment_id: string;
}

/**
 * Trace-safe manifest entry for agent-generated artifacts.
 * Includes build/export/preview status so evaluators can observe
 * artifact lifecycle without accessing artifact content.
 */
export interface ArtifactManifestEntry extends TraceSafeObjectManifestBase {
  object_class: 'artifact';
  artifact_id: string;
  type: string;
  artifact_kind?: string;
  build_status?: string;
  preview_status?: string;
  export_status?: string;
}

/**
 * Trace-safe manifest entry for input text snapshots captured before agent spawn.
 * Always `type: 'text'`; the snapshot content itself is not forwarded.
 */
export interface InputTextSnapshotManifestEntry extends TraceSafeObjectManifestBase {
  object_class: 'input_text_snapshot';
  input_text_snapshot_id: string;
  type: 'text';
}

/**
 * Aggregate counts of file-level trace-object operations for a single run.
 * Provides a quick summary of how much data was stored, recovered, or skipped
 * during the trace-object upload phase; `skip_reasons` names each skip cause.
 */
export interface TraceObjectSummary {
  new_file_count: number;
  modified_file_count: number;
  recovered_file_count: number;
  candidate_file_count: number;
  uploaded_file_count: number;
  skipped_file_count: number;
  skip_reasons: Record<string, number>;
}

/**
 * A single tool invocation span with redacted payloads.
 * `input` and `output` are pre-redacted (via traceSafeToolPayload) and
 * byte-capped; `isError` distinguishes tool-level errors from run failures.
 */
export interface ToolCallSummary {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number;
  input?: string;
  output?: string;
  isError?: boolean;
}

/**
 * A single structured agent event or log entry emitted during a run.
 * `level` maps to Langfuse observation levels; `statusMessage` carries
 * human-readable event context for dashboard display.
 */
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

/**
 * Aggregate event counts for quick dashboarding of a completed run.
 * Lets Langfuse surface total tool-call volume and error counts without
 * expanding the full ToolCallSummary array.
 */
export interface EventsSummary {
  toolCalls: number;
  errors: number;
  durationMs: number;
}

/**
 * Process- and build-level execution context collected once at daemon startup.
 * Gives Langfuse the environment fingerprint for every trace produced in
 * a given daemon session, enabling fleet-level performance segmentation.
 */
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
}

/**
 * Per-turn configuration snapshot capturing what was active during a generation.
 * Values may change turn-to-turn within a session (e.g. skill or model switch),
 * so this is stored per-turn rather than per-run. `promptCache` diagnostics
 * let the platform team measure resume-prompt cache hit rates.
 */
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

/**
 * Root telemetry envelope assembled for a completed run.
 * This is the full data set that `buildTracePayload` draws from to produce
 * the Langfuse ingestion batch; every optional field is a progressive-enhancement
 * that enriches the trace when available but does not block delivery when absent.
 */
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

/**
 * Options bag for the `reportRun` top-level entry point.
 * `config` selects and configures the delivery backend; `fetchImpl` allows
 * test code to inject a fake fetch without patching globals.
 */
export interface ReportRunOpts {
  config?: TelemetrySinkConfig | LangfuseConfig | null;
  fetchImpl?: typeof fetch;
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
