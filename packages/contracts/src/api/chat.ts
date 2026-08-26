import type { ProjectFile, ProjectFileKind } from './files';
import type { RunResultPackageResponse, RunWorkspace } from './workspaces.js';
import type {
  PreviewCommentAttachment,
  PreviewCommentMember,
  PreviewCommentPosition,
  PreviewCommentSelectionKind,
  PreviewAnnotationStyle,
  PreviewVisualMarkKind,
} from './comments';
import type { ResearchOptions } from './research';
import type { RunContextSelection } from './context.js';
import type { MediaExecutionPolicy } from './media.js';
import type { AppliedPluginSnapshot } from '../plugins/apply.js';
import type { McpAuthMode, McpServerConfig, McpTransport } from './mcp';
import type {
  AnalyticsAttributionQuality,
  AnalyticsDistributionMechanism,
  AnalyticsEntrySurface,
  AnalyticsHostProduct,
  AnalyticsPublisherClass,
  TrackingRuntimeType,
} from '../analytics/public-params.js';
import type {
  TrackingRunCancelOrigin,
  TrackingRunFailureCategory,
  TrackingRunFailureDetail,
  TrackingRunRecoveryActionType,
  TrackingRunTerminalTrigger,
} from '../analytics/events.js';
import type { StrategyTaskProjectionV2 } from '../plugins/strategy-v2.js';
import type { OdNextRolloutDecision } from './strategy-rollout.js';

// The daemon's run-failure taxonomy, re-exported under product-facing names so
// the run-status/error surface can carry the specific cause the daemon already
// classified (see apps/daemon/src/run-failure-classification.ts) instead of
// only the coarse `errorCode`. Same string unions as the analytics events, so
// producer and consumer can't drift.
export type RunFailureCategory = TrackingRunFailureCategory;
export type RunFailureDetail = TrackingRunFailureDetail;
export type RunCancelOrigin = TrackingRunCancelOrigin;
export type RunTerminalTrigger = TrackingRunTerminalTrigger;
export type RunFailureAction = 'relogin' | 'recharge' | 'upgrade' | 'retry' | 'none';

export type ChatRole = 'user' | 'assistant';
export type ChatSessionMode = 'design' | 'chat' | 'plan';
export type ChatCommentSelectionKind = PreviewCommentSelectionKind | 'visual';
export type ByokChatProtocol =
  | 'anthropic'
  | 'openai'
  | 'azure'
  | 'google'
  | 'ollama'
  | 'senseaudio'
  | 'aihubmix';

export interface ByokChatProviderConfig {
  protocol: ByokChatProtocol;
  apiKey: string;
  baseUrl?: string;
  apiVersion?: string;
  /** Explicit run-scoped provider policy for presets that do not require bearer credentials. */
  requiresApiKey?: boolean;
  /**
   * Run-scoped chat model id selected in the chat UI. Forwarded to the daemon
   * so BYOK-backed utilities (e.g. memory extraction) can honor the user's
   * model picker instead of falling back to a hardcoded default. Optional
   * because some presets (e.g. Ollama) infer the model from baseUrl/protocol.
   */
  model?: string;
}

export interface ByokMediaDefaults {
  imageModel?: string;
  videoModel?: string;
  speechModel?: string;
  speechVoice?: string;
}

export interface ChatRequest {
  agentId: string;
  message: string;
  /**
   * Explicit daemon-issued OD Next continuation handle. Omit for an ordinary
   * chat turn; callers must never infer this value from conversation order.
   */
  taskExecutionId?: string;
  /** The latest user turn only, used for per-turn telemetry content. */
  currentPrompt?: string;
  /**
   * Canonically framed conversation context before currentPrompt. OD Next uses
   * this explicit field instead of trying to subtract the latest turn from
   * message; ordinary runs continue to consume message unchanged.
   */
  priorTranscript?: string;
  systemPrompt?: string;
  projectId?: string | null;
  conversationId?: string | null;
  sessionMode?: ChatSessionMode;
  /** Client-minted id for the latest user turn. The daemon pins this row before
   * the assistant row so concurrent best-effort message persistence cannot
   * invert the visible turn order. */
  userMessageId?: string | null;
  assistantMessageId?: string | null;
  clientRequestId?: string | null;
  skillId?: string | null;
  // Per-turn skill ids picked via the composer's @-mention popover. The
  // daemon concatenates each skill's body into the system prompt for
  // this run only — they are NOT persisted on the project. Use this to
  // assemble multiple capabilities (e.g. @web-search + @summarize) for
  // a single turn without binding the project to one of them.
  skillIds?: string[];
  designSystemId?: string | null;
  attachments?: string[];
  commentAttachments?: ChatCommentAttachment[];
  model?: string | null;
  reasoning?: string | null;
  serviceTier?: string | null;
  /**
   * Run-scoped BYOK provider credentials for the daemon-backed OpenCode
   * adapter. The daemon must not persist this object; it is translated into
   * child env + OPENCODE_CONFIG_CONTENT for the current run only.
   */
  byokProvider?: ByokChatProviderConfig;
  /**
   * Run-scoped BYOK media defaults selected in the chat UI. The daemon uses
   * these to guide OpenCode-backed `od media generate` calls for this run only.
   */
  byokMediaDefaults?: ByokMediaDefaults;
  /** UI locale selected by the client, used by prompt composition for user-visible generated UI. */
  locale?: string;
  research?: ResearchOptions;
  context?: RunContextSelection;
  appliedPluginSnapshotId?: string | null;
  /**
   * Run-scoped media execution policy. Omitted means current OpenDesign
   * behavior: media generation is enabled and OD may execute its configured
   * local providers.
   */
  mediaExecution?: MediaExecutionPolicy;
  /**
   * Ask the selected run agent to emit a short title for this first turn.
   * The daemon strips the title marker from visible assistant text and falls
   * back to client-side naming when the marker is absent or malformed.
   */
  titleGeneration?: {
    enabled?: boolean;
  };
  /**
   * Run-scoped tool bundle supplied by an external orchestrator.
   * These servers are made available only to the spawned agent for this run
   * and are never written into the persistent Settings MCP registry.
   */
  toolBundle?: RunScopedToolBundle;
  /**
   * Optional analytics context for the current run_created / run_finished
   * events. The daemon never trusts these for behavior — they only
   * shape PostHog props. `entryFrom` is one of the documented
   * `entry_from` enums; `designSystemRunContext` carries the
   * DS-variant context (source counts, brand description length
   * bucket, DS origin) used by the design_system_project run shape.
   */
  analyticsHints?: ChatAnalyticsHints;
}

export type ChatAnalyticsEntryFrom =
  | 'new_project'
  | 'chat_composer'
  | 'design_system_create'
  | 'onboarding_design_system'
  | 'regenerate_from_review'
  // A turn started by the "Continue the run" affordance on a resumable failed
  // run. Lets run_created / run_finished isolate resume-continuations so the
  // recovery mechanism's usage and success rate are measurable.
  | 'resume_continue'
  // A turn started from a preview annotation: `comment` is the comment/board
  // pin flow (chat-new-line tool), `mark` is the Mark draw-overlay flow
  // (mark-pen tool). Both edit an existing artifact, so isolating them lets the
  // dashboard separate annotation-driven runs from plain composer sends.
  | 'comment'
  | 'mark'
  // A turn whose composer was seeded by a guided Next-step action (the
  // next-step card prefills a skill/prompt; the run fires on the following
  // Send). Best-effort: the pending tag is consumed by the next send.
  | 'next_step'
  // A turn that submits answers to an inline `<question-form>` clarification
  // (the question still being clarified, not a fresh create/edit intent).
  | 'question_answer';

export type ChatAnalyticsLengthBucket =
  | '0'
  | '1_50'
  | '51_200'
  | '201_500'
  | '500_plus';

export type ChatAnalyticsDesignSystemOrigin =
  | 'onboarding'
  | 'manual_create'
  | 'source_url'
  | 'github_repo'
  | 'local_code'
  | 'fig'
  | 'assets'
  | 'official_preset'
  | 'enterprise'
  | 'template'
  | 'mixed'
  | 'unknown';

export interface ChatAnalyticsDesignSystemRunContext {
  origin?: ChatAnalyticsDesignSystemOrigin;
  sourceCount?: number;
  hasBrandDescription?: boolean;
  brandDescriptionLengthBucket?: ChatAnalyticsLengthBucket;
  githubRepoCount?: number;
  localFolderCount?: number;
  figFileCount?: number;
  assetFileCount?: number;
}

export interface ChatAnalyticsHints {
  entryFrom?: ChatAnalyticsEntryFrom;
  projectKind?:
    | 'prototype'
    | 'live_artifact'
    | 'slide_deck'
    | 'template'
    | 'image'
    | 'video'
    | 'audio'
    | 'design_system'
    | 'other';
  designSystemRunContext?: ChatAnalyticsDesignSystemRunContext;
  // Session-dimension run context, computed client-side and stamped onto
  // run_created / run_finished so a session's run sequence is analysable
  // ("did this session reach an artifact, and on which turn?").
  // `turnIndex` is 0-based within the browser analytics session;
  // `isFirstRun` === (turnIndex === 0). `hasExistingArtifact` is true when the
  // project already had a generated artifact when this run was started
  // (project-scoped) — the run is an edit rather than a first creation.
  turnIndex?: number;
  isFirstRun?: boolean;
  hasExistingArtifact?: boolean;
  // Per-project run turn index (0-based, project-lifetime on this device):
  // "within THIS project, which prompt / follow-up number is this?". Unlike
  // `turnIndex` (session-wide, spans all projects and resets each browser
  // session), this persists in localStorage keyed by project id. Optional:
  // omitted when storage is unavailable (SSR / privacy mode).
  projectTurnIndex?: number;
  /** Stable task lineage shared by the initial Run and all recovery Runs. */
  taskExecutionId?: string;
  initialRunId?: string;
  sourceRunId?: string;
  taskRunIndex?: number;
  recoveryActionType?: TrackingRunRecoveryActionType;
  recoveryActionInstanceId?: string;
  // Active execution runtime for THIS run, computed client-side at launch
  // (the only layer that can tell BYOK from amr_cloud). The daemon stamps it
  // onto run_created / run_finished, overriding its own BYOK-blind
  // derivation. Omitted means "let the daemon keep its derived value".
  runtimeType?: TrackingRuntimeType;
  // Analytics-only marker that THIS run is the AI-optimize ("enrich") pass on a
  // programmatically-extracted design system. The web AI-optimize path sets it;
  // the daemon uses it to emit `design_system_enrich_result` and to stamp the
  // `ai_refined` enrichment metadata on success. It carries no execution
  // semantics — omitting it just means the run is not an enrichment pass.
  dsEnrichment?: boolean;
  /** Bounded source attribution for local MCP/plugin initiated runs. */
  entrySurface?: AnalyticsEntrySurface;
  hostProduct?: AnalyticsHostProduct;
  externalPluginId?: string;
  externalPluginVersion?: string;
  distributionMechanism?: AnalyticsDistributionMechanism;
  publisherClass?: AnalyticsPublisherClass;
  attributionQuality?: AnalyticsAttributionQuality;
  pluginWorkflowId?: string;
  logicalRequestDigest?: string;
  logicalRequestDigestVersion?: number;
  /** Daemon-computed and frozen for Plugin generation maturity queries. */
  generationSloWindowMs?: number;
}

export interface RunScopedMcpServerConfig extends Omit<McpServerConfig, 'enabled'> {
  /**
   * Omitted means enabled for this run. The daemon normalizes run-scoped
   * inputs through the same sanitizer as persisted MCP config, but callers
   * should not need to send persisted-settings boilerplate for disposable
   * tool bundles.
   */
  enabled?: boolean;
}

export interface RunScopedToolBundle {
  mcpServers?: RunScopedMcpServerConfig[];
}

export interface RunScopedToolBundleSummary {
  mcpServers: Array<{
    id: string;
    label?: string;
    templateId?: string;
    transport: McpTransport;
    enabled: boolean;
    authMode?: McpAuthMode;
  }>;
}

export type BrowserUseUnavailableReason = 'no-matching-browser-backend';

export type BrowserUseProbeFailureCategory =
  | 'not-probed'
  | 'registry-missing'
  | 'registry-unreadable';

export interface BrowserUseDiscoveryFacts {
  registryPath: string;
  registryExists: boolean;
  socketCount: number;
  candidateCount: number;
  staleCount: number;
  currentSessionIdPresent: boolean | null;
  probeFailureCategory: BrowserUseProbeFailureCategory;
  newestSocketAgeMs?: number;
  staleThresholdMs: number;
}

export interface BrowserUseRunState {
  requested: boolean;
  available: boolean;
  reason?: BrowserUseUnavailableReason;
  diagnostics: BrowserUseDiscoveryFacts;
}

/**
 * Web chat POST /api/runs body. `conversationId` is required (web always has a
 * chat home). `assistantMessageId` is optional: when omitted the daemon mints
 * one so multi-turn native session resume still gets a pin cursor.
 */
export interface ChatRunCreateRequest extends ChatRequest {
  projectId: string;
  conversationId: string;
  /** Client pin id; daemon mints when omitted (API / omit-pin clients). */
  assistantMessageId?: string;
  clientRequestId: string;
}

/**
 * Minimal POST /api/runs shape accepted from MCP / SDK callers that do not
 * manage conversation state client-side. Only `projectId` is required;
 * `message` and `agentId` are optional — the daemon resolves `agentId` from
 * the saved app-config when it is omitted.
 *
 * Callers may optionally bind `conversationId` (and omit `assistantMessageId`);
 * the daemon mints the pin and seeds the user message when the conversation
 * is bound and owned by `projectId`.
 */
export interface McpRunCreateRequest {
  projectId: string;
  /** Optional bound conversation; when set without assistantMessageId the daemon mints a pin. */
  conversationId?: string;
  /** Optional client pin; omit to let the daemon mint when a conversation is bound. */
  assistantMessageId?: string;
  /** Stable id generated once per confirmed user action and reused on transport retry. */
  clientRequestId?: string;
  message?: string;
  agentId?: string;
  skillId?: string;
  /** Explicit per-run Skills. CLI --skill a,b and Web @Skill converge here. */
  skillIds?: string[];
  pluginId?: string;
  model?: string;
  serviceTier?: string;
  pluginInputs?: Record<string, unknown>;
  mediaExecution?: MediaExecutionPolicy;
  toolBundle?: RunScopedToolBundle;
  resume?: boolean;
  analyticsHints?: ChatAnalyticsHints;
}

export const CHAT_RUN_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
] as const;

export type ChatRunStatus = (typeof CHAT_RUN_STATUSES)[number];

/** User-facing result delivery, kept separate from agent-process runStatus. */
export type ResultDeliveryState = 'delivered' | 'no_result' | 'delivery_failed';

export type ChatMessageFeedbackRating = 'positive' | 'negative';

export type ChatMessageFeedbackReasonCode =
  | 'matched_request'
  | 'strong_visual'
  | 'useful_structure'
  | 'easy_to_continue'
  | 'followed_design_system'
  | 'missed_request'
  | 'weak_visual'
  | 'incomplete_output'
  | 'hard_to_use'
  | 'missed_design_system'
  | 'other';

export interface ChatMessageFeedback {
  rating: ChatMessageFeedbackRating;
  reasonCodes?: ChatMessageFeedbackReasonCode[];
  customReason?: string;
  reasonsSubmittedAt?: number;
  createdAt: number;
  updatedAt?: number;
}

/**
 * POST /api/runs/:runId/feedback — relays the user's assistant-turn rating
 * to Langfuse as a `score-create` so evals can filter traces by feedback.
 * The daemon is the single network egress point for telemetry (web never
 * talks to Langfuse directly), and gates this on `telemetry.metrics +
 * telemetry.content` consent independently of what the browser thinks.
 *
 * `customReason` ships the raw free text the user typed in the "other"
 * input (trimmed). Product confirmed on 2026-05-13 that analysts need the
 * text to make sense of the feedback; this is consent-gated behind
 * `telemetry.content` like the rest of the message-content telemetry.
 */
export interface ChatRunFeedbackRequest {
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  rating: ChatMessageFeedbackRating;
  reasonCodes: ChatMessageFeedbackReasonCode[];
  hasCustomReason: boolean;
  /** Raw "other" free text (trimmed). Empty string when no custom reason. */
  customReason: string;
}

export interface ChatRunFeedbackResponse {
  /** `'accepted'` once the daemon has enqueued (or skipped due to consent). */
  status: 'accepted' | 'skipped_consent' | 'skipped_no_sink';
}

export interface ChatRunCreateResponse {
  runId: string;
  /** Present only when this physical Run belongs to a strategy task chain. */
  taskExecutionId?: string;
  // Daemon-resolved conversation/message ids — populated for MCP /
  // SDK callers that POST /api/runs with only projectId. The web flow
  // normally sends these in already; daemon falls back to the
  // project's default conversation otherwise.
  conversationId?: string | null;
  assistantMessageId?: string | null;
  appliedPluginSnapshotId?: string | null;
  pluginId?: string | null;
  /** Analytics-only data-quality signal; it never changes run reuse semantics. */
  analyticsAttributionMismatch?: boolean;
  strategyTask?: StrategyTaskProjectionV2;
}

/**
 * `ApiError.details` for `DESIGN_SYSTEM_ENRICHMENT_IN_PROGRESS` (HTTP 409 from
 * `POST /api/runs` and `POST /api/chat`): the run that already owns the
 * conversation's enrichment pass. Clients should treat the rejected request
 * as a no-op and keep following `runId` rather than surfacing a failure.
 */
export interface DesignSystemEnrichmentInProgressDetails {
  kind: 'design_system_enrichment_in_progress';
  runId: string;
  conversationId: string;
}

export type NativeSessionRecoveryState =
  | 'not_applicable'
  | 'no_recoverable_session'
  | 'captured_not_resumed'
  | 'resume_attempted'
  | 'resumed'
  | 'resume_skipped'
  | 'auto_reseeded';

export type NativeSessionHandleKind =
  | 'opaque-id'
  | 'cli-thread-id'
  | 'acp-session-handle'
  | 'profile-session-id'
  | 'session-file-path'
  | 'unknown';

export type NativeSessionAcquisitionMode =
  | 'daemon-specified'
  | 'stream-captured'
  | 'acp-session-load'
  | 'profile-session-frame'
  | 'session-file-discovered'
  | 'none'
  | 'unknown';

export type NativeSessionContinuationMode =
  | 'native-resume-by-id'
  | 'acp-session-load'
  | 'profile-stdio-resume'
  | 'session-file-resume'
  | 'none'
  | 'unknown';

export type NativeSessionRecoveryReason =
  | 'model_changed'
  | 'cwd_changed'
  | 'conversation_advanced'
  | 'missing_cursor'
  | 'resume_failed'
  | 'unsupported'
  | 'none';

export interface NativeSessionRecoveryHandle {
  present: boolean;
  kind: NativeSessionHandleKind;
  /** Always null unless a future per-agent rule declares the handle safe. */
  display: string | null;
  /** Stable correlation value for support without exposing the raw handle. */
  sha256: string | null;
  redacted: boolean;
}

export interface NativeSessionRecoveryMetadata {
  agentId: string | null;
  state: NativeSessionRecoveryState;
  acquisition: NativeSessionAcquisitionMode;
  continuation: NativeSessionContinuationMode;
  handle: NativeSessionRecoveryHandle;
  guardReason: NativeSessionRecoveryReason | null;
  fallbackReason: NativeSessionRecoveryReason | null;
  updatedAt: number;
}

export type ChatRunDiagnosticEvidence = 'measured' | 'computed' | 'indirect';
export type ChatRunDiagnosticState =
  | 'available'
  | 'not_collected'
  | 'unsupported'
  | 'upstream_unavailable';

/** One diagnostic value with enough provenance to distinguish a real zero from missing data. */
export interface ChatRunDiagnosticValue<T> {
  state: ChatRunDiagnosticState;
  value?: T;
  evidence?: ChatRunDiagnosticEvidence;
  source: 'open-design-daemon' | 'agent-runtime' | 'model-provider';
  complete?: boolean;
  definition?: string;
  missingReason?: string;
}

/**
 * Redacted run diagnostics exposed to evaluation clients after a run reaches a
 * terminal state. This intentionally contains counters and durations only: no
 * reasoning text, full tool input/output, credentials, or local paths.
 */
export interface ChatRunExecutionDiagnostics {
  schemaVersion: 1;
  collectorVersion:
    | 'open-design-execution-diagnostics-v1'
    | 'open-design-execution-diagnostics-v2';
  collectedAt: number;
  eventStreamCompleteness: 'complete' | 'partial';
  timing: {
    queueDurationMs: ChatRunDiagnosticValue<number>;
    promptBuildDurationMs: ChatRunDiagnosticValue<number>;
    launchPreflightDurationMs: ChatRunDiagnosticValue<number>;
    processSpawnDurationMs: ChatRunDiagnosticValue<number>;
    stdinWriteDurationMs: ChatRunDiagnosticValue<number>;
    firstModelEventWaitMs: ChatRunDiagnosticValue<number>;
    firstVisibleOutputWaitMs: ChatRunDiagnosticValue<number>;
    agentExecutionDurationMs: ChatRunDiagnosticValue<number>;
    toolDurationMs: ChatRunDiagnosticValue<number>;
    artifactWriteDurationMs: ChatRunDiagnosticValue<number>;
    totalDurationMs: ChatRunDiagnosticValue<number>;
    phaseTimingStatus?: string;
    bottleneckPhase?: string;
  };
  modelSteps: {
    count: ChatRunDiagnosticValue<number>;
    totalDurationMs: ChatRunDiagnosticValue<number>;
    averageDurationMs: ChatRunDiagnosticValue<number>;
    p50DurationMs: ChatRunDiagnosticValue<number>;
    p90DurationMs: ChatRunDiagnosticValue<number>;
    maxDurationMs: ChatRunDiagnosticValue<number>;
    over60sCount: ChatRunDiagnosticValue<number>;
    durationSampleCount: ChatRunDiagnosticValue<number>;
    completed: ChatRunDiagnosticValue<number>;
    failed: ChatRunDiagnosticValue<number>;
    cancelled: ChatRunDiagnosticValue<number>;
    incomplete: ChatRunDiagnosticValue<number>;
    retryCount: ChatRunDiagnosticValue<number>;
    reasoningTokens: ChatRunDiagnosticValue<number>;
    reasoningDurationMs: ChatRunDiagnosticValue<number>;
  };
  assistantMessages: {
    count: ChatRunDiagnosticValue<number>;
    totalDurationMs: ChatRunDiagnosticValue<number>;
    averageDurationMs: ChatRunDiagnosticValue<number>;
    maxDurationMs: ChatRunDiagnosticValue<number>;
    durationSampleCount: ChatRunDiagnosticValue<number>;
    completed: ChatRunDiagnosticValue<number>;
    failed: ChatRunDiagnosticValue<number>;
    cancelled: ChatRunDiagnosticValue<number>;
    incomplete: ChatRunDiagnosticValue<number>;
  };
  anomalies: {
    retryCount: ChatRunDiagnosticValue<number>;
    rateLimitedCount: ChatRunDiagnosticValue<number>;
    timeoutCount: ChatRunDiagnosticValue<number>;
    upstreamErrorCount: ChatRunDiagnosticValue<number>;
  };
  tools: {
    total: ChatRunDiagnosticValue<number>;
    succeeded: ChatRunDiagnosticValue<number>;
    failed: ChatRunDiagnosticValue<number>;
    unknown: ChatRunDiagnosticValue<number>;
    durationMs: ChatRunDiagnosticValue<number>;
    byName: ChatRunDiagnosticValue<Record<string, number>>;
  };
  cache: {
    inputTokensEffective: ChatRunDiagnosticValue<number>;
    cacheReadInputTokens: ChatRunDiagnosticValue<number>;
    cacheCreationInputTokens: ChatRunDiagnosticValue<number>;
    uncachedInputTokens: ChatRunDiagnosticValue<number>;
    cacheHitRatio: ChatRunDiagnosticValue<number>;
    firstCallInputTokens: ChatRunDiagnosticValue<number>;
    firstCallCacheReadInputTokens: ChatRunDiagnosticValue<number>;
    firstCallCacheHitRatio: ChatRunDiagnosticValue<number>;
    stablePromptCacheHit: ChatRunDiagnosticValue<boolean>;
    stablePromptCacheMissReason: ChatRunDiagnosticValue<string>;
  };
  environment: {
    agentId: ChatRunDiagnosticValue<string>;
    provider: ChatRunDiagnosticValue<string>;
    requestedModel: ChatRunDiagnosticValue<string>;
    resolvedModel: ChatRunDiagnosticValue<string>;
    reasoning: ChatRunDiagnosticValue<string>;
    agentCliVersion: ChatRunDiagnosticValue<string>;
  };
}

export interface ChatRunStatusResponse {
  id: string;
  projectId: string | null;
  conversationId: string | null;
  assistantMessageId: string | null;
  /** Stable caller request id used to suppress duplicate logical runs. */
  clientRequestId?: string | null;
  agentId: string | null;
  /** Design system whose prompt context was actually injected for this run. */
  designSystemId?: string | null;
  /** Selected design system before usability/body checks; useful for diagnostics. */
  designSystemRequestedId?: string | null;
  /** Source that supplied the effective design-system selection. */
  designSystemSelectionSource?: 'request' | 'plugin' | 'project' | 'app-default' | 'none' | null;
  /** sha256 digest of the injected DESIGN.md/tokens/component context. */
  designSystemDigest?: string | null;
  appliedPluginSnapshotId?: string | null;
  pluginId?: string | null;
  /** Immutable OD Next routing decision captured for this logical Run. */
  strategyRolloutDecision?: OdNextRolloutDecision | null;
  status: ChatRunStatus;
  createdAt: number;
  updatedAt: number;
  cancelRequested?: boolean;
  /**
   * Actor or lifecycle path that requested cancellation. Only `user_stop`
   * proves the user explicitly stopped this run; older daemons may omit it.
   */
  cancelOrigin?: RunCancelOrigin | null;
  /** Structured lifecycle or watchdog mechanism that forced termination. */
  terminalTrigger?: RunTerminalTrigger | null;
  childPid?: number | null;
  processGroupId?: number | null;
  childExited?: boolean;
  childExitObservedAt?: number | null;
  exitCode?: number | null;
  signal?: string | null;
  error?: string | null;
  errorCode?: string | null;
  /** Coarse failure family the daemon classified this failure into (auth,
   *  rate_limit, model_unavailable, …). Lets the UI refine guidance beyond the
   *  raw `errorCode` — e.g. distinguishing a transient 429 from a hard quota
   *  that share `errorCode: 'RATE_LIMITED'`. Absent on success / older daemons. */
  failureCategory?: RunFailureCategory | null;
  /** Fine-grained failure cause within the category (hard_quota,
   *  cli_not_installed, invalid_api_key, …). Primary key the UI maps to a named
   *  failure type + fix. Absent on success / older daemons. */
  failureDetail?: RunFailureDetail | null;
  /** Recommended recovery action derived from the same failure classification. */
  failureAction?: RunFailureAction | null;
  /** True when this terminal failure can be recovered by resuming the agent's
   *  existing CLI session (a transient upstream drop / inactivity timeout on a
   *  session-resuming runtime), rather than only restarting from scratch. The
   *  chat uses it to offer a Continue affordance; the next turn in the same
   *  conversation resumes the persisted session. Absent/false on success,
   *  non-resumable failures, and runtimes without CLI session resume. */
  resumable?: boolean;
  /** True when a terminal `succeeded` run ended with its declared work
   *  unfinished — the agent left a TodoWrite task in a non-`completed` state
   *  (pending / in_progress / stopped) or the turn was truncated mid-generation
   *  (max_tokens). Lets every status surface (Pet task center, project pill, CLI
   *  --json) avoid reading an incomplete run as "Completed" (#1247 / #1060).
   *  Absent/false = finished, so older daemons stay "Completed" (backward-compat).
   *  Judged by the canonical `todoSnapshotHasUnfinishedWork` predicate so it can
   *  never diverge from the chat footer's `unfinishedTodosFromEvents`. */
  endedWithUnfinishedWork?: boolean;
  /** Authoritative artifact files created or modified by this run. Mirrors
   *  ChatSseEndPayload.artifactCount and run_finished.artifact_count. */
  artifactCount?: number;
  /** Authoritative project-relative artifact files created or modified by
   *  this run. Unlike a before/after browser snapshot, this includes edits to
   *  existing files and excludes untouched reference inputs. */
  artifactPaths?: string[];
  /** Filesystem-backed validation of the one canonical artifact entry this
   *  run can deliver. Present for terminal runs when the daemon can inspect
   *  the project; callers must not infer validity from artifactCount alone. */
  deliverableValid?: boolean;
  deliverableValidation?:
    | 'valid'
    | 'not_succeeded'
    | 'no_artifact'
    | 'project_missing'
    | 'entry_missing'
    | 'entry_not_touched'
    | 'entry_unreadable'
    | 'type_mismatch';
  /** Canonical project-relative file selected by deliverable validation. */
  deliverableEntryFile?: string;
  /** File kind of deliverableEntryFile, derived from the daemon file index. */
  deliverableArtifactKind?: ProjectFileKind;
  /** Absolute path to the per-run JSONL event log the daemon mirrors
   *  the SSE stream to (see runs.ts `runsLogDir`). Null when the
   *  daemon was launched without event persistence configured. */
  eventsLogPath?: string | null;
  /** Present on daemon run status responses that know the effective run policy. */
  mediaExecution?: MediaExecutionPolicy;
  /** Run-scoped tool bundle summary with secrets and command details redacted. */
  toolBundle?: RunScopedToolBundleSummary;
  /** Prompt cache diagnostics for resume-capable runtime sessions. */
  promptCache?: {
    stablePromptHash: string;
    hit: boolean;
    missReason: 'new-session' | 'missing-stored-hash' | 'stable-prompt-changed' | null;
  };
  /** Sanitized native-session recovery state for resume-capable agents. */
  nativeSessionRecovery?: NativeSessionRecoveryMetadata;
  /** Browser Use availability for runs that requested in-app browser automation. */
  browserUse?: BrowserUseRunState;
  /** Effective storage/provenance for the workspace used by this run. */
  workspace?: RunWorkspace;
  /** Available only after terminal completion; safe for eval/observability clients. */
  executionDiagnostics?: ChatRunExecutionDiagnostics;
  strategyTask?: StrategyTaskProjectionV2;
}

export type ChatRunResultPackageResponse = RunResultPackageResponse;

export interface ChatRunListResponse {
  runs: ChatRunStatusResponse[];
}

export interface ChatRunCancelResponse {
  ok: true;
  run?: ChatRunStatusResponse;
}

export interface ChatAttachment {
  path: string;
  name: string;
  kind: 'image' | 'file';
  size?: number;
  /**
   * User-visible attachment order for this turn. Older messages may omit it;
   * consumers should fall back to array position.
   */
  order?: number;
}

export interface ChatCommentAttachment {
  id: string;
  order: number;
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  comment: string;
  currentText: string;
  pagePosition: PreviewCommentPosition;
  htmlHint: string;
  style?: PreviewAnnotationStyle;
  selectionKind?: ChatCommentSelectionKind;
  memberCount?: number;
  podMembers?: PreviewCommentMember[];
  // Zero-based slide the marked element lives on, for deck artifacts. Carried
  // so the host can flip the preview to that slide when the send starts.
  slideIndex?: number;
  screenshotPath?: string;
  markKind?: PreviewVisualMarkKind;
  intent?: string;
  imageAttachments?: PreviewCommentAttachment[];
  /** `'query'` means `comment` was promoted to the message text; keep target data as context only. */
  commentContext?: 'context' | 'query';
  source?: 'saved-comment' | 'board-batch';
}

export type PersistedAgentEvent =
  // `code` carries the structured API error code for `label: 'error'`
  // status events (e.g. AGENT_AUTH_REQUIRED, RATE_LIMITED). Clients use it to
  // decide error-specific affordances such as the hosted-AMR nudge.
  // `failureCategory` / `failureDetail` carry the daemon's finer classification
  // for the same failure, so the error card can name a specific type + fix even
  // when many causes share one `code` (e.g. hard_quota vs a transient 429).
  | {
      kind: 'status';
      label: string;
      detail?: string;
      code?: string;
      failureCategory?: RunFailureCategory;
      failureDetail?: RunFailureDetail;
    }
  | { kind: 'text'; text: string }
  | { kind: 'conversation_title'; title: string }
  | { kind: 'thinking'; text: string }
  | {
      kind: 'live_artifact';
      action: 'created' | 'updated' | 'deleted';
      projectId: string;
      artifactId: string;
      title: string;
      refreshStatus?: string;
    }
  | {
      kind: 'live_artifact_refresh';
      phase: 'started' | 'succeeded' | 'failed';
      projectId: string;
      artifactId: string;
      refreshId?: string;
      title?: string;
      refreshedSourceCount?: number;
      error?: string;
    }
  | {
      kind: 'tool_use';
      id: string;
      name: string;
      input: unknown;
      /** Optional wall-clock ms when the tool first started (e.g. ACP first frame). */
      startedAt?: number;
    }
  | { kind: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | {
      kind: 'diagnostic';
      name: string;
      source?: string;
      elapsedMs?: number;
      reason?: string;
      suppressedChars?: number;
      suppressedChunks?: number;
      openedBlocks?: number;
      closedBlocks?: number;
      fileCount?: number;
      files?: string[];
      pendingCandidateChars?: number;
      suppressing?: boolean;
      shape?: Record<string, unknown>;
    }
  | {
      kind: 'plugin_candidate';
      candidateId: string;
      title: string;
      description?: string;
      confidence?: number;
      draftPath?: string | null;
    }
  | {
      kind: 'usage';
      inputTokens?: number;
      outputTokens?: number;
      costUsd?: number;
      durationMs?: number;
      /** Terminal turn stop reason (e.g. `max_tokens`). Persisted so the project
       *  projection can read a truncation as incomplete after reload (#1247). */
      stopReason?: string;
    }
  | { kind: 'raw'; line: string };

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  agentId?: string;
  agentName?: string;
  events?: PersistedAgentEvent[];
  createdAt?: number;
  runId?: string;
  runStatus?: ChatRunStatus;
  resultDeliveryState?: ResultDeliveryState;
  /** True when this message's failed run can be recovered by resuming the
   *  agent's CLI session (transient upstream drop / inactivity on a
   *  session-resuming runtime). Drives the chat's Continue affordance; mirrors
   *  ChatRunStatusResponse.resumable. */
  resumable?: boolean;
  lastRunEventId?: string;
  startedAt?: number;
  endedAt?: number;
  sessionMode?: ChatSessionMode;
  runContext?: RunContextSelection;
  /**
   * Daemon-issued logical task handle for an OD Next assistant turn. Unlike
   * taskAnalytics, this value is behavioral: question-form answers pass it
   * back explicitly and reload recovery follows its active physical Run.
   */
  strategyTaskExecutionId?: string;
  /**
   * Position of this message's Run within its logical task chain. A Full Plan
   * turn spans several physical Runs (request -> production) that the user
   * asked for once, so only index 0 opens a conversation turn; later indices
   * continue the same one and must not be drawn as separate answers.
   */
  strategyTaskRunIndex?: number;
  /** Number of leading visible characters owned by completed predecessor Runs. */
  strategyTaskPrefixLength?: number;
  /** Number of leading normalized events owned by completed predecessor Runs. */
  strategyTaskPrefixEventCount?: number;
  /**
   * True once the daemon's OD Next protocol gate settled this turn's strategy
   * task as `blocked` — a sticky terminal verdict. Question forms rendered by
   * this turn must stop accepting submissions (the daemon rejects any further
   * continuation with 409 STRATEGY_TASK_STATE_MISMATCH).
   */
  strategyTaskBlocked?: boolean;
  /** Agent-visible text persisted with the blocked verdict; preferred notice
   *  copy when present (null when the gate left no visible text). */
  strategyTaskBlockedText?: string | null;
  /**
   * True once this turn's strategy task settled `completed` — the daemon
   * verified both a succeeded process and the canonical deliverable on disk.
   * The turn's TodoWrite snapshot may still show pending items the agent forgot
   * to flip; this flag is what lets the chat stop offering to "continue"
   * already-delivered work (see continuableUnfinishedTodos).
   */
  strategyTaskDelivered?: boolean;
  /** Analytics-only task lineage persisted with the message so retries,
   *  resumes and clarification answers survive reloads without splitting one
   *  user intent into unrelated failures. */
  taskAnalytics?: ChatTaskExecutionAnalytics;
  appliedPluginSnapshot?: AppliedPluginSnapshot;
  attachments?: ChatAttachment[];
  commentAttachments?: ChatCommentAttachment[];
  producedFiles?: ProjectFile[];
  traceObjectFiles?: ProjectFile[];
  // Diff baseline so reattach can rebuild producedFiles after reload.
  preTurnFileNames?: string[];
  feedback?: ChatMessageFeedback;
  /**
   * Request-only marker for the final assistant-message persistence pass.
   * The daemon does not store or return this field; it only uses it to
   * avoid telemetry reads before content and producedFiles are finalized.
   */
  telemetryFinalized?: boolean;
}

export interface ChatTaskExecutionAnalytics {
  taskExecutionId: string;
  initialRunId?: string;
  sourceRunId?: string;
  taskRunIndex: number;
  recoveryActionType?: TrackingRunRecoveryActionType;
  recoveryActionInstanceId?: string;
}
