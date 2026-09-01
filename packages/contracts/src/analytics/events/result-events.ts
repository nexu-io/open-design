/**
 * @module analytics/events/result-events
 * *_result event prop types (run, feedback, settings, packaged).
 */
import type {
  AnalyticsAttributionQuality,
  AnalyticsDistributionMechanism,
  AnalyticsEntrySurface,
  AnalyticsHostProduct,
  AnalyticsPublisherClass,
  TrackingRuntimeType,
} from '../public-params.js';
import type { ReleaseChannel } from '@open-design/release';
import type { ArtifactOriginEntrySurface, ArtifactOriginStatus } from '../../api/files.js';
import type { AgentDiagnosticReason, AgentDiagnosticSeverity } from '../../api/registry.js';
import type { TrackingDesignSystemEditSurface, TrackingDesignSystemKind, TrackingDesignSystemLengthBucket, TrackingDesignSystemOrigin, TrackingDesignSystemRunEntryFrom } from './design-systems.js';
import type { TrackingSettingsPage } from './event-names.js';
import type { TrackingAmrOpenCodeErrorPhase, TrackingAmrOpenCodeLastEventType, TrackingAmrOpenCodeLastToolKind, TrackingAmrOpenCodeLastToolStatus, TrackingArtifactKind, TrackingArtifactWriteSource, TrackingArtifactWriteStatus, TrackingByokPreflightBlockReason, TrackingByokProviderId, TrackingCliProviderId, TrackingDesignSystemSource, TrackingExecutionMode, TrackingExportFormat, TrackingExportResult, TrackingFeedbackAction, TrackingFeedbackProviderId, TrackingFeedbackRating, TrackingFeedbackRatingWithNone, TrackingFeedbackReasonCode, TrackingFidelity, TrackingFileSizeBucket, TrackingFileType, TrackingFirstModelEventType, TrackingHarness, TrackingLabsItemId, TrackingLabsOptOutReason, TrackingLabsSystemReason, TrackingLabsToggleSource, TrackingLangfuseDeliveryStatus, TrackingLangfuseDropReason, TrackingLangfuseReportResult, TrackingLangfuseReportSkipReason, TrackingProjectKind, TrackingProjectSource, TrackingPublishErrorCode, TrackingResult, TrackingRunAdmissionPhase, TrackingRunPolicyReason, TrackingRunAdmissionStatus, TrackingRunCancelOrigin, TrackingRunCloseReason, TrackingRunDiagnosticSource, TrackingRunEvidenceLevel, TrackingRunFailureCategory, TrackingRunFailureDetail, TrackingRunFailureDomain, TrackingRunFailureMechanism, TrackingRunFailureStage, TrackingRunFailureUserAction, TrackingRunLifecyclePhase, TrackingRunPhaseTimingStatus, TrackingRunRepairOwner, TrackingRunResult, TrackingRunRetryFinalResult, TrackingRunRetryStrategy, TrackingRunRetrySuppressedReason, TrackingRunTerminalIntegrity, TrackingRunTerminalTrigger, TrackingStderrLineCountBucket, TrackingTestResult, TrackingTokenCountSource } from './shared-enums.js';
import type { ConversationForkAnalyticsContext, TrackingFileVersionSource, TrackingPluginImportSource, TrackingSessionMode, TrackingSettingsArea } from './ui-click.js';
// ---- Result events -------------------------------------------------------

// Final outcome for the paid provider submission. Keep this envelope free of
// prompts, response bodies, configured URLs, credentials, and output paths.
export interface MediaGenerationResultProps {
  page_name: 'studio';
  area: 'media_generation';
  project_id: string;
  task_id: string;
  run_id?: string;
  surface: 'image' | 'video' | 'audio';
  provider_id: string;
  model_id: string;
  result: 'success' | 'failed';
  initial_response_status?: number;
  response_status?: number;
  attempt_count: number;
  retry_count: number;
  retry_reason?: 'rate_limit_429' | 'service_unavailable_503';
  retry_after_ms?: number;
  retry_delay_ms?: number;
  retry_final_result: 'not_attempted' | 'success' | 'failed' | 'skipped_retry_after_budget';
  duration_ms: number;
  used_stub_fallback: boolean;
}

export interface ProjectCreateResultProps {
  page_name: 'home';
  area: 'new_project';
  project_source: TrackingProjectSource;
  project_id: string | null;
  project_kind: TrackingProjectKind | null;
  design_system?: string;
  target_platforms?: string;
  companion_surfaces?: string;
  fidelity: TrackingFidelity;
  connectors?: string;
  use_speaker_notes?: boolean;
  include_animations?: boolean;
  reference_template?: string;
  model_id?: string;
  aspect?: string;
  // The scenario plugin the send was routed through (when any), so a
  // successful/failed create can be attributed to a specific plugin —
  // e.g. an example-prompt preset or a community plugin the user applied.
  plugin_id?: string;
  plugin_type?: string;
  result: TrackingResult;
  error_code?: string;
}

export interface PluginReplacementResultProps {
  page_name: 'home';
  area: 'plugin_replacement';
  plugin_before: string;
  plugin_after: string;
  result: TrackingResult;
  error_code?: string;
}

// Outcome of persisting a slide's speaker notes back into the deck HTML.
// Fires when a save settles (success/failure), so we can measure how many
// users actually author speaker notes and how reliable the save is. Editing
// closes on blur/auto-save, so this is the completion event for the
// deck_viewer speaker_notes_edit click. `edit_surface` distinguishes the
// in-preview notes panel from the presenter popup; `has_content` is whether
// the saved note for that slide is non-empty (authoring vs. clearing).
export interface SpeakerNotesSaveResultProps {
  page_name: 'artifact';
  area: 'deck_viewer';
  edit_surface: 'preview' | 'presenter';
  artifact_id: string;
  artifact_kind: TrackingArtifactKind;
  project_id: string;
  project_kind: TrackingProjectKind;
  slide_count?: number;
  has_content?: boolean;
  result: TrackingResult;
  error_code?: string;
}

export type TrackingArtifactEditAction = 'apply' | 'undo' | 'redo';

export type TrackingArtifactEditKind =
  | 'text'
  | 'link'
  | 'image'
  | 'element_remove'
  | 'token'
  | 'style'
  | 'attributes'
  | 'html'
  | 'source';

// Terminal result for a direct Manual Edit mutation. The toolbar `edit` click
// measures entry; this event measures whether a concrete file mutation was
// actually persisted, including undo/redo. Content, selectors and filenames
// are intentionally excluded.
export interface ArtifactEditResultProps {
  page_name: 'artifact';
  area: 'manual_edit';
  action: TrackingArtifactEditAction;
  edit_kind: TrackingArtifactEditKind;
  artifact_id: string;
  artifact_kind: TrackingArtifactKind;
  project_id: string;
  project_kind: TrackingProjectKind;
  result: TrackingResult;
  error_code?:
    | 'edit_busy'
    | 'source_unavailable'
    | 'patch_invalid'
    | 'source_conflict'
    | 'save_failed'
    | 'unknown';
  duration_ms: number;
}

// Outcome of an actual import attempt from the plugin import modal. Fires
// once per executed import (after the install/upload promise settles), not
// for clicks that no-op. `error_code` carries a bounded machine-readable
// backend code when available, with a stable HTTP/network fallback. Never put
// the free-form install message here: it can contain URLs, paths, or upstream
// response text and would create unbounded analytics cardinality.
export interface PluginImportResultProps {
  page_name: 'plugins';
  area: 'import_modal';
  import_source: TrackingPluginImportSource;
  result: TrackingResult;
  error_code?: string;
}

export interface UpdateInstallResultProps {
  page_name: 'home' | 'app';
  area: 'update_prompt' | 'update_dialog';
  result: TrackingResult;
  app_version_before?: string;
  app_version_after?: string;
  error_code?: string;
}

export interface UpdateCheckResultProps {
  page_name: 'app';
  area: 'update_dialog';
  result: 'available' | 'up_to_date' | 'failed';
  app_version_before?: string;
  app_version_after?: string;
  error_code?: string;
}

// run_created/finished merges CSV rows 17/18 (extended fields) and 44/45
// (current daemon-side authoritative emission). Daemon supplies token /
// duration data; entry surfaces propagate the optional context (entry_from,
// fidelity, etc.) via the create-run payload.
export type TrackingRunEntrySource =
  | 'new_project'
  | 'chat_composer'
  | 'comment'
  | 'mark'
  | 'next_step'
  | 'question_answer'
  | 'resume_continue'
  | TrackingDesignSystemRunEntryFrom;

export type TrackingRunRecoveryActionType =
  | 'manual_retry'
  | 'resume_run'
  | 'authorize_and_retry'
  | 'switch_model_retry'
  | 'switch_runtime_retry'
  | 'question_answer';

export interface RunTaskLineageProps {
  /** Stable id for one user intent across every recovery-created Run. */
  task_execution_id: string;
  /** First Run in the task. Equals run_id on task_run_index zero. */
  initial_run_id: string;
  /** Previous Run that directly triggered this recovery Run. */
  source_run_id?: string;
  /** Zero-based Run index inside the task; same-Run automatic retries do not increment it. */
  task_run_index: number;
  recovery_action_type?: TrackingRunRecoveryActionType;
  recovery_action_instance_id?: string;
}

export interface RunContextProps {
  session_run_index?: number;
  project_run_index?: number;
  has_existing_artifacts?: boolean;
  is_followup_run?: boolean;
}

export interface RunCapabilitiesProps {
  plugin_id?: string;
  skill_ids?: string[];
  mcp_server_ids?: string[];
}

export type TrackingInputAccountingMode = 'inclusive' | 'additive' | 'unknown';

export interface RunModelCallTokenProps {
  provider_input_tokens?: number;
  effective_input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
}

export interface RunTokenProps extends RunModelCallTokenProps {
  usage_count_source: TrackingTokenCountSource;
  cache_token_source?: 'anthropic' | 'openai' | 'unavailable';
  input_accounting_mode?: TrackingInputAccountingMode;
  user_query_tokens?: number;
  total_tokens?: number;
  first_model_call?: RunModelCallTokenProps;
}

export interface RunDesignSystemProps {
  selection_source?: string;
  edit_surface?: TrackingDesignSystemEditSurface;
  origin?: TrackingDesignSystemOrigin;
  input_source_count?: number;
  has_brand_description?: boolean;
  brand_description_length_bucket?: TrackingDesignSystemLengthBucket;
  github_repo_count?: number;
  local_folder_count?: number;
  fig_file_count?: number;
  asset_file_count?: number;
  change_type?: 'none' | 'created' | 'modified';
  preview_module_count?: number;
  missing_font_count?: number;
}

export interface RunTimingProps {
  total_duration_ms: number;
  queue_duration_ms?: number;
  process_spawn_duration_ms?: number;
  time_to_first_model_event_ms?: number;
  first_model_event_type?: TrackingFirstModelEventType;
  time_to_first_token_ms?: number;
  time_to_first_visible_output_ms?: number;
  time_to_first_artifact_ms?: number;
  generation_duration_ms?: number;
  // Model-active window: first model event of any kind (tool call, thinking,
  // text, artifact) to run end. Prefer this over `generation_duration_ms` when
  // comparing agents -- the latter starts at the first text token, so a
  // tool-first run reports only its closing message.
  model_active_duration_ms?: number;
  finalize_duration_ms?: number;
  collection_status?: TrackingRunPhaseTimingStatus;
}

export interface RunAutomaticRetryProps {
  retry_count: number;
  outcome: TrackingRunRetryFinalResult;
  suppressed_reason?: TrackingRunRetrySuppressedReason;
  last_attempt?: {
    index?: number;
    duration_ms?: number;
    time_to_first_token_ms?: number;
  };
}

export interface RunActivityProps {
  tools?: {
    call_count?: number;
    duration_ms?: number;
  };
  artifacts?: {
    changed_file_count?: number;
    created_file_count?: number;
    modified_file_count?: number;
    supporting_asset_files_changed_count?: number;
    write_duration_ms?: number;
    write_status?: TrackingArtifactWriteStatus;
    write_source?: TrackingArtifactWriteSource;
  };
}

export interface RunDiagnosticsProps {
  failure_signal_source?: TrackingRunDiagnosticSource;
  run_close_reason?: TrackingRunCloseReason;
  last_observed_phase?: TrackingRunLifecyclePhase;
  stderr_line_count_bucket?: TrackingStderrLineCountBucket;
  stdout_line_count_bucket?: TrackingStderrLineCountBucket;
  first_token_seen?: boolean;
  user_visible_output_seen?: boolean;
  tool_call_seen?: boolean;
  artifact_write_seen?: boolean;
  live_artifact_seen?: boolean;
  session_resume_fallback_used?: boolean;
  runtime_timing?: Record<string, number>;
}

export interface RunLangfuseDeliveryProps {
  delivery_status: TrackingLangfuseDeliveryStatus;
  drop_reason?: TrackingLangfuseDropReason;
}

export interface RunCreatedProps extends RunTaskLineageProps {
  // `chat_panel` is the regular artifact-run surface; `design_system_project`
  // is the DS-as-project variant (DS creation + regeneration runs).
  page_name: 'chat_panel' | 'design_system_project';
  area: 'chat_composer' | 'design_system_generation';
  // Where the run was initiated from. The DS variant uses the
  // `TrackingDesignSystemRunEntryFrom` set; both unions stay
  // distinct so the dashboard can split funnels cleanly.
  entry_from?: TrackingRunEntrySource;
  /** v4 name; entry_from remains during the compatibility window. */
  entry_source?: TrackingRunEntrySource;
  // Session-dimension run context (0-based `turn_index` within the browser
  // analytics session, `is_first_run` === turn_index 0). Lets the dashboard
  // sequence a session's runs and read "did this session reach an artifact,
  // and on which turn?". Optional: omitted when the client could not compute
  // them (e.g. storage unavailable).
  turn_index?: number;
  is_first_run?: boolean;
  // Per-project run turn index (0-based, project-lifetime per device): "within
  // THIS project, which prompt / follow-up number is this run?". Complements
  // the session-wide `turn_index` above (which spans all projects and resets
  // each browser session) — this one is scoped to a single project and
  // persists across sessions. Optional: omitted when the client could not
  // compute it (storage unavailable).
  project_turn_index?: number;
  // Current run's 0-based position within this `conversation_id`. Derived by
  // the daemon from persisted run-backed assistant messages, so it survives
  // browser-session resets and daemon restarts. The first run is 0.
  conversation_turn_index?: number;
  // True when the project already had a generated artifact when this run
  // started (project-scoped) — i.e. the run is an edit, not a first creation.
  has_existing_artifact?: boolean;
  project_source?: TrackingProjectSource;
  project_id: string;
  conversation_id: string | null;
  run_id: string;
  project_kind: TrackingProjectKind | null;
  design_system_id?: string;
  design_system_source: TrackingDesignSystemSource;
  // Official preset vs user-built; `design_system_slug` carries the concrete
  // preset id when official (never set for custom — only the id is sent there).
  design_system_kind?: TrackingDesignSystemKind;
  design_system_slug?: string;
  design_system_version?: string;
  // Which surface drove this run when it's editing an existing DS
  // (chat / edit / draw / comment / mark). Only on design_system_project runs.
  edit_surface?: TrackingDesignSystemEditSurface;
  // DS-variant context. `ds_source_origin` mirrors the
  // `TrackingDesignSystemOrigin` set used on DS page_views (where
  // the DS came from), separate from the runtime-selection
  // `design_system_source` field above. Optional on the chat_panel
  // shape; required-shaped data on the DS shape (callers populate
  // them when emitting the DS variant).
  ds_source_origin?: TrackingDesignSystemOrigin;
  source_count?: number;
  has_brand_description?: boolean;
  brand_description_length_bucket?: TrackingDesignSystemLengthBucket;
  github_repo_count?: number;
  local_folder_count?: number;
  fig_file_count?: number;
  asset_file_count?: number;
  // Optional context inherited from the originating surface.
  target_platforms?: string;
  companion_surfaces?: string;
  fidelity?: TrackingFidelity;
  connectors?: string;
  use_speaker_notes?: boolean;
  include_animations?: boolean;
  reference_template?: string;
  aspect?: string;
  has_attachment: boolean;
  /** v4 name; has_attachment remains during the compatibility window. */
  has_attachments: boolean;
  user_query_tokens: number;
  // `'default'` when the user did not pick a specific model and the agent's
  // own default was selected; use `modelIdForTracking` to bucket null/empty
  // into `'default'` at every emit site.
  model_id: string;
  // CLI providers for daemon-executed runs; BYOK providers for runs streamed
  // client-side against the user's own key (those never reach a local CLI).
  agent_provider_id: TrackingCliProviderId | TrackingByokProviderId;
  // The runtime this run launched with, stamped on the event so it cannot
  // drift. Normally `runtime_type` rides on the global super-property, but the
  // active runtime can change mid-stream (e.g. the user flips the avatar-menu
  // mode while a BYOK turn is in flight), which would split one run across
  // buckets. Client-side BYOK emits set this explicitly; daemon run events
  // already pin it. Omit to inherit the global value.
  runtime_type?: TrackingRuntimeType;
  skill_id: string | null;
  mcp_id: string | null;
  // Composer mode the prompt was sent in. `ask` is the lighter Q&A mode
  // (wire value `chat`); `design` is the full design-agent run. Optional so
  // DS-generation runs (which have no user-facing mode) can omit it.
  session_mode?: TrackingSessionMode;
  /** v4 name; session_mode remains during the compatibility window. */
  interaction_mode?: TrackingSessionMode;
  // The plugin actively bound to this run (the applied plugin snapshot), or
  // null when the user ran with no active plugin.
  plugin_id?: string | null;
  // Per-turn capability context: the MCP servers and skills actually enabled
  // for this send. Multi-valued, so recorded as arrays alongside the legacy
  // singular `mcp_id` / `skill_id` (which stay for back-compat).
  mcp_ids?: string[];
  skill_ids?: string[];
  token_count_source: TrackingTokenCountSource;
  /** v4 grouped domains. Old flat aliases remain during migration. */
  run_context?: RunContextProps;
  capabilities?: RunCapabilitiesProps;
  tokens: RunTokenProps;
  design_system?: RunDesignSystemProps;
  // External MCP/Plugin attribution. These fields are optional so existing UI
  // and CLI Run producers keep their current contract; the OpenDesign Cloud
  // Plugin path validates and supplies the complete subset.
  entry_surface?: AnalyticsEntrySurface;
  host_product?: AnalyticsHostProduct;
  external_plugin_id?: string;
  external_plugin_version?: string;
  distribution_mechanism?: AnalyticsDistributionMechanism;
  publisher_class?: AnalyticsPublisherClass;
  attribution_quality?: AnalyticsAttributionQuality;
  plugin_workflow_id?: string;
  logical_request_digest?: string;
  logical_request_digest_version?: 1;
  mcp_session_id?: string;
  brief_state?: 'confirmed' | 'skipped' | 'not_applicable';
  deduplicated?: boolean;
  resume?: boolean;
  attempt_count?: number;
  generation_slo_window_ms?: number;
  recharge_wait_duration_ms?: number;
  /**
   * Which harness actually produced this run.
   *
   * The whole point of the Labs switch is a before/after comparison, and that
   * comparison is only possible if every run says which side it is on. Read
   * from the run's own rollout decision rather than the live setting, because
   * the setting can change while the run is in flight.
   */
  harness?: TrackingHarness;
  /**
   * Why a run took the ordinary route while the user had the switch on.
   *
   * Answers the question a support thread cannot: "I enabled it and nothing
   * changed." The switch can be on and still not apply — the project's task
   * type, the selected agent, an explicitly chosen plugin, or an unverified
   * runtime capability each route back. Omitted when `harness` is `od_next`,
   * and when the user never opted in (there is nothing to explain).
   */
  harness_fallback_reason?: string;
}

export interface RunFinishedProps extends Omit<RunCreatedProps, 'area'> {
  area: 'chat_panel' | 'design_system_generation';
  result: TrackingRunResult;
  error_code?: string;
  /** Only `user_stop` proves the user explicitly cancelled the run. */
  cancel_origin?: TrackingRunCancelOrigin;
  /** Lifecycle or watchdog mechanism that forced the terminal state. */
  terminal_trigger?: TrackingRunTerminalTrigger;
  failure_category?: TrackingRunFailureCategory;
  failure_detail?: TrackingRunFailureDetail;
  /** v4 name; failure_detail remains during the compatibility window. */
  failure_reason?: TrackingRunFailureDetail;
  failure_stage?: TrackingRunFailureStage;
  /** Versioned causal classification added alongside the legacy category/detail. */
  failure_mechanism?: TrackingRunFailureMechanism;
  failure_domain?: TrackingRunFailureDomain;
  evidence_level?: TrackingRunEvidenceLevel;
  repair_owner?: TrackingRunRepairOwner;
  admission_status?: TrackingRunAdmissionStatus;
  /** Independent of policy reason; never inferred from missing tokens. */
  admission_phase?: TrackingRunAdmissionPhase;
  policy_reason?: TrackingRunPolicyReason;
  terminal_integrity?: TrackingRunTerminalIntegrity;
  classifier_version?: 'run-failure-v2' | 'run-failure-v3';
  retryable?: boolean;
  /** v4 name; retryable remains during the compatibility window. */
  is_automatic_retry_eligible?: boolean;
  user_action?: TrackingRunFailureUserAction;
  // A daemon boot repaired a terminal state that was interrupted before the
  // normal PostHog/Langfuse finalization path completed.
  terminal_reconciled?: boolean;
  terminal_recovery_reason?: 'daemon_restart' | 'analytics_incomplete';
  langfuse_trace_id?: string;
  langfuse_expected?: boolean;
  langfuse_drop_reason?: TrackingLangfuseDropReason;
  langfuse_delivery_status?: TrackingLangfuseDeliveryStatus;
  diagnostic_source?: TrackingRunDiagnosticSource;
  stderr_present?: boolean;
  stderr_line_count_bucket?: TrackingStderrLineCountBucket;
  stdout_present?: boolean;
  stdout_line_count_bucket?: TrackingStderrLineCountBucket;
  rpc_close_reason?: TrackingRunCloseReason;
  first_token_seen?: boolean;
  user_visible_output_seen?: boolean;
  tool_call_seen?: boolean;
  artifact_write_seen?: boolean;
  live_artifact_seen?: boolean;
  /** Bounded summary of Vela/OpenCode v1 tool-execution lifecycle diagnostics. */
  tool_execution_lifecycle_seen?: boolean;
  tool_execution_lifecycle_count_bucket?: '1' | '2_5' | '6_20' | 'gt_20';
  tool_execution_trigger?: 'exit' | 'abort' | 'deadline' | 'mixed' | 'unknown';
  tool_execution_terminal?: 'running' | 'returned' | 'failed' | 'interrupted' | 'mixed' | 'unknown';
  tool_terminal_source?: 'tool_result' | 'tool_error' | 'processor_cleanup' | 'mixed' | 'unknown';
  tool_kill_outcome?: 'none' | 'requested' | 'sent' | 'failed';
  tool_child_close_seen?: boolean;
  tool_stdout_close_seen?: boolean;
  tool_stderr_close_seen?: boolean;
  tool_execution_evidence_incomplete?: boolean;
  deliverable_valid?: boolean;
  deliverable_validation?: 'valid' | 'invalid';
  artifact_origin_status?: ArtifactOriginStatus;
  artifact_version_id?: string;
  // Distinct artifact files this run produced OR edited (created + modified),
  // measured agent-agnostically by a filesystem snapshot diff in the daemon
  // (`run-artifact-fs.ts`). An edit-only turn that rewrites an existing file
  // still reports >0 — the directory's file count is unchanged but the run did
  // produce artifact work. Replaces the tool-stream-derived count, which only
  // `claude_code` reported in a recognized shape.
  artifact_count: number;
  // Breakdown of `artifact_count`. `artifacts_created` (new files) approximates
  // an activation signal; `artifacts_modified` (existing files edited)
  // approximates an iteration / engagement signal. Optional: emitted only when
  // the daemon captured a baseline snapshot for the run.
  artifacts_created?: number;
  artifacts_modified?: number;
  // Distinct files of ANY type this run created or modified — markdown briefs,
  // docx exports, JSON data, code, plus everything `artifact_count` covers.
  // `artifact_count` deliberately counts only renderable outputs (HTML +
  // image/video/audio), which made a run whose deliverable was `PROMPTS.md`
  // or `report.docx` indistinguishable from a pure chat turn (sampled 2026-08:
  // ~1/3 of "artifact_count = 0" successes had written such files). Primary
  // source is the filesystem snapshot diff; when no baseline exists the
  // tool-stream fallback reports it with the usual per-agent blind spots.
  files_written_count?: number;
  // True when the run raised a `<question-form>` clarification. Such runs
  // are intent-clarification turns (the agent stops to ask the user a question)
  // and therefore inherently produce no artifact, so the dashboard can exclude
  // them from the "run finished -> has artifact" funnel instead of counting
  // them as artifact-generation failures.
  asked_user_question: boolean;
  /** v4 name; asked_user_question remains during the compatibility window. */
  clarification_requested: boolean;
  /** Main user-visible artifact outcome; omitted for Ask, clarification and DS Runs. */
  primary_artifact_change?: 'none' | 'created' | 'modified';
  input_tokens?: number;
  input_tokens_provider?: number;
  input_tokens_effective?: number;
  output_tokens?: number;
  total_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  uncached_input_tokens?: number;
  estimated_context_tokens?: number;
  cache_hit_ratio?: number;
  // Cache-hit of the turn's FIRST model call (vs `cache_hit_ratio`, which is the
  // last/aggregate call). The first call is the session-reuse signal: within a
  // turn, later calls re-read the growing cached prefix and inflate the
  // aggregate regardless of reuse. Per-call-usage agents (claude/opencode/
  // codebuddy/pi) source this from the stream; codex from its rollout.
  first_call_input_tokens?: number;
  first_call_cache_read_input_tokens?: number;
  first_call_cache_hit_ratio?: number;
  // Whether this run is a non-first turn (a prior completed assistant turn
  // exists). Slice first_call_cache_hit_ratio by this to isolate the turns
  // where session reuse applies.
  is_followup_turn?: boolean;
  cache_token_source?: 'anthropic' | 'openai' | 'unavailable';
  queue_duration_ms?: number;
  pre_spawn_duration_ms?: number;
  prompt_build_duration_ms?: number;
  launch_preflight_duration_ms?: number;
  process_spawn_duration_ms?: number;
  stdin_write_duration_ms?: number;
  time_to_first_model_event_ms?: number;
  first_model_event_type?: TrackingFirstModelEventType;
  time_to_first_token_ms?: number;
  time_to_first_visible_output_ms?: number;
  runtime_init_to_first_token_ms?: number;
  // Runtime init measured to the first model event of any kind rather than to
  // the first text token. On a tool-first run the first-token variant absorbs
  // the whole tool loop and reads as slow startup.
  runtime_init_to_first_model_response_ms?: number;
  spawn_to_first_token_ms?: number;
  time_to_first_artifact_ms?: number;
  // `spawn_to_first_token_ms` split into auditable subsegments so dashboards
  // can separate local CLI startup from session handshake from provider
  // first-token latency. The four parts sum back to `spawn_to_first_token_ms`
  // (absent subsegments count as 0 and roll into the remainder).
  cli_ready_ms?: number;
  session_init_ms?: number;
  model_first_token_ms?: number;
  spawn_to_first_token_remainder_ms?: number;
  generation_duration_ms?: number;
  // See `RunTimingProps.model_active_duration_ms`.
  model_active_duration_ms?: number;
  tool_call_count?: number;
  tool_duration_ms?: number;
  artifact_write_duration_ms?: number;
  artifact_write_status?: TrackingArtifactWriteStatus;
  artifact_write_source?: TrackingArtifactWriteSource;
  finalize_duration_ms?: number;
  total_duration_ms: number;
  timing: RunTimingProps;
  automatic_retry?: RunAutomaticRetryProps;
  run_activity?: RunActivityProps;
  diagnostics?: RunDiagnosticsProps;
  langfuse_delivery?: RunLangfuseDeliveryProps;
  bottleneck_phase?: TrackingRunLifecyclePhase;
  // Which phase-boundary definition produced `bottleneck_phase`. Absent on
  // rows written before the definition was versioned. Rows from different
  // versions are not comparable -- filter to one, do not average across.
  phase_schema_version?: number;
  last_observed_phase?: TrackingRunLifecyclePhase;
  phase_timing_status?: TrackingRunPhaseTimingStatus;
  // E-lite root-cause discriminators. `last_observed_phase` tells us WHICH phase
  // a stalled run died in (e.g. `tool_execution`); these four tell us WHY, which
  // the phase alone cannot separate:
  // - `approval_requested`: an approval/permission gate fired. Only the ACP path
  //   is daemon-observable — stream/CLI runtimes pass a skip-permissions flag so
  //   no gate fires, and `false` there means "not observed", not "no approval".
  // - `stdin_backpressure`: writing the prompt to the child's stdin was queued
  //   because the OS pipe buffer was full (the child was not draining stdin).
  // - `tool_result_sent`: every committed tool_use received a matching
  //   tool_result (paired by id, or by count for degraded events that carry a
  //   null id on both sides). A stall with `tool_call_seen &&
  //   !tool_result_sent` means a tool result was never delivered (our bug) vs a
  //   provider that stalled after every tool result was delivered.
  // - `last_progress_age_ms`: age of the last agent activity at finish. Near the
  //   inactivity ceiling on a stall; near zero on a clean finish.
  approval_requested?: boolean;
  stdin_backpressure?: boolean;
  tool_result_sent?: boolean;
  last_progress_age_ms?: number;
  // Vela's OpenCode bridge attaches this context to `error.data` when an AMR
  // prompt fails. Keep only fixed enums in analytics: session/tool call ids,
  // paths, titles, inputs, and outputs are deliberately not copied.
  // Together these fields distinguish "tool still pending/running" from
  // "tool completed, but the agent stream never reached done".
  amr_opencode_error_phase?: TrackingAmrOpenCodeErrorPhase;
  amr_opencode_last_event_type?: TrackingAmrOpenCodeLastEventType;
  amr_opencode_last_tool_status?: TrackingAmrOpenCodeLastToolStatus;
  amr_opencode_last_tool_kind?: TrackingAmrOpenCodeLastToolKind;
  attempt_index?: number;
  attempt_duration_ms?: number;
  attempt_time_to_first_token_ms?: number;
  attempt_terminal_phase?: TrackingRunLifecyclePhase;
  // DS-variant outcome fields. `design_system_created` is true when
  // the run produced a stored DESIGN.md; `preview_module_count` and
  // `missing_font_count` give the dashboard a coarse quality read
  // without inspecting the artifact contents.
  design_system_created?: boolean;
  preview_module_count?: number;
  missing_font_count?: number;
  retry_attempt_count?: number;
  retry_final_result?: TrackingRunRetryFinalResult;
  retry_suppressed_reason?: TrackingRunRetrySuppressedReason;
  agent_cli_version?: string;
  runtime_companion_name?: string;
  runtime_companion_version?: string;
  /** Current assistant-message event persistence path for rollout comparison. */
  message_event_storage_mode?: 'events_json_snapshot' | 'append_only';
  /** Persistable agent events observed before batching or compaction. */
  message_event_input_count?: number;
  message_event_delta_count?: number;
  /** Approximate UTF-16 character volume accepted by the persistence path. */
  message_event_input_char_count?: number;
  /** Synchronous message persistence batches attempted during this run. */
  message_event_flush_count?: number;
  /** Events handed to storage after in-memory adjacent-delta compaction. */
  message_event_batch_event_count?: number;
  /** Final compacted event count observed after the last successful flush. */
  message_event_persisted_count?: number;
  message_event_flush_total_ms?: number;
  message_event_flush_max_ms?: number;
  message_event_pending_char_peak?: number;
  /** Number and cost of terminal append-only batch folds. */
  message_event_finalize_count?: number;
  message_event_finalize_total_ms?: number;
  message_event_finalize_max_ms?: number;
  /** Compacted event count in the terminal message snapshot. */
  message_event_final_event_count?: number;
  message_event_persistence_error_count?: number;
  retry_original_failure_category?: TrackingRunFailureCategory;
  retry_original_failure_detail?: TrackingRunFailureDetail;
  retry_original_failure_stage?: TrackingRunFailureStage;
}

export interface LangfuseReportResultProps {
  page_name: 'chat_panel' | 'design_system_project';
  area: 'chat_panel' | 'design_system_generation';
  project_id: string | null;
  conversation_id: string | null;
  run_id: string;
  langfuse_trace_id: string;
  langfuse_expected: boolean;
  langfuse_delivery_status: TrackingLangfuseDeliveryStatus;
  langfuse_drop_reason?: TrackingLangfuseDropReason;
  langfuse_report_result: TrackingLangfuseReportResult;
  langfuse_report_trigger: 'final_message' | 'terminal_fallback';
  langfuse_report_skip_reason?: TrackingLangfuseReportSkipReason;
  report_duration_ms?: number;
  result?: TrackingRunResult;
  error_code?: string;
  agent_provider_id?: TrackingCliProviderId;
  model_id?: string;
}

export interface RunRetryBaseProps {
  page_name: 'chat_panel' | 'design_system_project';
  area: 'chat_panel' | 'design_system_generation';
  project_id: string;
  conversation_id: string | null;
  run_id: string;
  retry_of_run_id: string;
  retry_attempt_index: number;
  retry_max_attempts: number;
  retry_strategy: TrackingRunRetryStrategy;
  agent_provider_id: TrackingCliProviderId;
  model_id: string;
  failure_category?: TrackingRunFailureCategory;
  failure_detail?: TrackingRunFailureDetail;
  failure_stage?: TrackingRunFailureStage;
  terminal_trigger?: TrackingRunTerminalTrigger;
  error_code?: string;
}

export interface RunRetryAttemptedProps extends RunRetryBaseProps {
  retry_reason: 'transient_failure' | 'post_tool_resume';
  // Backoff delay (ms) waited before this retry attempt was restarted.
  retry_delay_ms?: number;
}

export interface RunRetryFinishedProps extends RunRetryBaseProps {
  retry_result: 'success' | 'failed' | 'suppressed';
  retry_suppressed_reason?: TrackingRunRetrySuppressedReason;
}

export type TrackingUpdateApplyResult = 'success' | 'not_applied' | 'unknown';

export type TrackingUpdateApplyReason =
  | 'app_version_matches'
  | 'app_version_unchanged'
  | 'expired'
  | 'identity_mismatch';

export type TrackingUpdateApplyElapsedBucket =
  | 'lt_5m'
  | '5m_1h'
  | '1h_6h'
  | '6h_24h'
  | '1d_7d'
  | 'gt_7d'
  | 'unknown';

export interface UpdateApplyObservedProps {
  flow_id: string;
  channel: ReleaseChannel;
  namespace: string;
  platform: string;
  arch: string;
  artifact_type: 'dmg' | 'installer' | 'payload';
  from_version: string;
  to_version: string;
  result: TrackingUpdateApplyResult;
  reason: TrackingUpdateApplyReason;
  elapsed_bucket: TrackingUpdateApplyElapsedBucket;
}

// Discriminated union over the four surfaces that fire
// `file_upload_result`. The `file_manager` shape is the original (Files
// panel Upload button). `home` / `chat_panel` were added in PR #2459 so
// the home + chat composer paperclip uploads stop being silent. The
// `onboarding` shape covers the Design-system step's source ingest:
// `source_type` is required so the dashboard can split the funnel by
// source kind without inspecting `file_type`.
export type TrackingFileUploadSurface =
  | { page_name: 'file_manager'; area: 'file_manager'; project_id: string }
  | { page_name: 'chat_panel'; area: 'chat_composer'; project_id: string }
  | { page_name: 'home'; area: 'chat_composer'; project_id: string }
  | {
      page_name: 'onboarding';
      area: 'design_system_source';
      source_type: 'local_code' | 'fig' | 'assets';
      onboarding_session_id: string;
      // Onboarding uploads happen BEFORE a project exists, so
      // `project_id` is optional and present only when the upload was
      // re-issued after a project landed (rare in the onboarding flow).
      project_id?: string;
    }
  | {
      // DS create page upload (Design systems → New design system →
      // source dropzones). Distinct from the onboarding shape because
      // the funnel splits by entry surface; both share `source_type`
      // so the dashboard can union on it when needed.
      page_name: 'design_systems';
      area: 'design_system_source';
      source_type: 'local_code' | 'fig' | 'assets';
      design_system_id?: string;
      project_id?: string;
    };

// A composer context-source linking flow settled. Fired once per attempt
// from the composer "+" menu's Files/Code entries:
//   - `context_kind: 'project'` — the Reference-project modal: `success`
//     when the picked projects were staged as context chips (`count` =
//     projects linked in this confirm), `cancelled` when the modal closed
//     without confirming, `failed` when resolving/linking a project dir
//     errored.
//   - `context_kind: 'local_code'` — the native folder picker: `success`
//     when the folder was staged (`count` = 1), `cancelled` when the picker
//     was dismissed, `failed` when linking the dir errored (chat_panel).
// Entry clicks are `ui_click` `plus_pick` (workspace/reference-project or
// workspace/local-code); this event closes that funnel.
export interface ContextLinkResultProps {
  page_name: 'home' | 'chat_panel';
  area: 'chat_composer';
  context_kind: 'project' | 'local_code';
  result: 'success' | 'cancelled' | 'failed';
  count?: number;
  project_id?: string;
}

export type FileUploadResultProps = TrackingFileUploadSurface & {
  file_count: number;
  file_type: TrackingFileType;
  file_size_bucket: TrackingFileSizeBucket;
  result: TrackingRunResult;
  error_code?: string;
  duration_ms?: number;
};

export interface ArtifactExportResultProps {
  page_name: 'artifact';
  area: 'share_option_popover';
  entry_surface: 'open_design_ui';
  artifact_id: string;
  artifact_kind: TrackingArtifactKind;
  export_format: TrackingExportFormat;
  result: TrackingExportResult;
  error_code?: string;
  export_duration_ms: number;
  project_id: string;
  project_kind: TrackingProjectKind | null;
  artifact_origin_status: ArtifactOriginStatus;
  artifact_version_id?: string;
  origin_entry_surface: ArtifactOriginEntrySurface;
  origin_external_plugin_id?: string;
  origin_plugin_workflow_id?: string;
  origin_run_id?: string;
}

// Fired when the user explicitly clicks "Save" in the Excalidraw sketch editor
// — NOT the background autosave (which carries no user intent and is not
// tracked). `result` is 'success' once the sketch file is persisted, 'failed'
// on a write error. Together with `sketch_export_result` this is the
// completion signal for the sketch flow that starts at `new_sketch`.
export interface SketchSaveResultProps {
  page_name: 'file_manager';
  area: 'sketch_editor';
  result: TrackingExportResult;
  error_code?: string;
  project_id: string;
  project_kind: TrackingProjectKind;
}

// Fired when the user exports a sketch to a PNG from the sketch editor, which
// writes the image into the project's files — the sketch's real "output" (the
// drawing becomes a project asset that can then be attached to a run). This is
// the strongest completion signal for the sketch flow. `result` is 'success'
// once the PNG is written, 'failed' on a write error.
export interface SketchExportResultProps {
  page_name: 'file_manager';
  area: 'sketch_editor';
  result: TrackingExportResult;
  error_code?: string;
  project_id: string;
  project_kind: TrackingProjectKind;
}

export type TrackingDeployProvider = 'vercel' | 'cloudflare_pages';

// Fired from the deploy modal when a real publish attempt resolves — NOT when
// the modal merely opens (that path is `artifact_export_result` with
// export_format vercel/cloudflare_pages and only means "popover opened").
// `result` is 'success' once the provider accepts the deploy (the link may
// still be delayed/protected), 'failed' on a hard error or missing config.
export interface ArtifactDeployResultProps {
  page_name: 'artifact';
  area: 'deploy_modal';
  artifact_id: string;
  artifact_kind: TrackingArtifactKind;
  provider: TrackingDeployProvider;
  result: TrackingExportResult;
  // True when this attempt saved a new/changed token (the user actually
  // entered a key this run), so "configured a key AND deployed" is queryable.
  saved_new_token: boolean;
  // True when the provider had no saved, configured credentials before this
  // attempt — i.e. this is a first-time setup-and-deploy.
  first_configure: boolean;
  error_code?: string;
  deploy_duration_ms: number;
  project_id: string;
  project_kind: TrackingProjectKind | null;
}

// Fired when a "Publish this file for everyone" attempt from the Share tab
// resolves — publishing and unpublishing share the event, split by `action`.
// Fires when the daemon call settles (success once the public URL is returned
// for publish, or removal is confirmed for unpublish), regardless of whether a
// newer request superseded this one in the UI. Clicking the publish button
// reports separately as ui_click element 'publish_file'.
export interface ArtifactPublishResultProps {
  page_name: 'artifact';
  area: 'share_option_popover';
  artifact_id: string;
  artifact_kind: TrackingArtifactKind;
  action: 'publish' | 'unpublish';
  result: TrackingExportResult;
  // 'workspace_identity_required' when the workspace context could not be
  // confirmed (the one actionable failure), 'publish_failed' otherwise.
  error_code?: TrackingPublishErrorCode;
  publish_duration_ms: number;
  project_id: string;
  project_kind: TrackingProjectKind | null;
}

// Outcome of an HTML file version restore from the version history modal.
// Fires once per confirmed restore attempt (after the restore API settles) —
// opening the confirm popover or cancelling it only reports ui_click.
// `result` is 'success' whenever the file content was written back, including
// the degraded case where version bookkeeping raised a warning (the warning
// code is then carried in `error_code`).
export interface FileVersionRestoreResultProps {
  page_name: 'artifact';
  area: 'file_version_modal';
  artifact_id: string;
  artifact_kind: TrackingArtifactKind;
  project_id: string;
  project_kind: TrackingProjectKind | null;
  // Provenance of the version being restored (what kind of state users
  // reach back for: ai output, a manual edit, or an earlier restore).
  version_source: TrackingFileVersionSource;
  // How many versions back from the newest the restored version sits
  // (newest = 0), i.e. how far users roll back.
  version_gap: number;
  // List size at restore time.
  version_count: number;
  result: TrackingResult;
  error_code?: string;
  restore_duration_ms: number;
}

export interface FeedbackSubmitResultProps {
  page_name: 'chat_panel';
  area: 'chat_panel';
  element: 'assistant_feedback_reason_submit';
  action: 'submit_feedback_reason';
  project_id: string;
  project_kind: TrackingProjectKind | null;
  conversation_id: string | null;
  assistant_message_id: string;
  run_id: string;
  // `model_id` uses `modelIdForTracking` to bucket null/empty into the real
  // `'default'` bucket (user accepted the agent's own default), so the
  // PostHog `model_id` column never carries the analyst-hostile mix of
  // "no selection" and "join failed" that `null/unknown` used to mean.
  // `agent_provider_id` carries the BYOK provider when the agent maps to
  // one, so reason × provider analyses can split CLI vs API surfaces.
  model_id: string;
  agent_provider_id: TrackingFeedbackProviderId;
  rating: 'positive' | 'negative';
  reason?: string;
  reason_count: number;
  has_custom_reason: boolean;
  custom_reason?: string;
  result: TrackingResult;
}

export type TrackingConversationForkErrorCode =
  | 'bad_request'
  | 'permission_denied'
  | 'fork_source_not_found'
  | 'payload_too_large'
  | 'server_error'
  | 'http_error'
  | 'network_error'
  | 'empty_response'
  | 'unknown_error';

export interface ConversationForkResultProps extends ConversationForkAnalyticsContext {
  target_conversation_id: string | null;
  result: TrackingResult;
  error_code?: TrackingConversationForkErrorCode;
  duration_ms: number;
}

interface AssistantFeedbackBase {
  page: 'studio';
  area: 'chat_panel';
  project_id: string;
  project_kind: TrackingProjectKind;
  conversation_id: string;
  assistant_message_id: string;
  // run_id may be absent for messages whose run record is missing or pruned,
  // but the product funnel keys off this; we emit `null` rather than dropping
  // the field so PostHog can distinguish "no run id" from "field forgotten".
  run_id: string | null;
  // Same rationale as `FeedbackSubmitResultProps`: carry agent/model on the
  // event itself so reason × agent / reason × model analyses don't depend
  // on joining back to `run_created`. Buckets via `modelIdForTracking` and
  // `feedbackAgentProviderIdToTracking` at every emit site.
  agent_provider_id: TrackingFeedbackProviderId;
  model_id: string;
  rating: TrackingFeedbackRating;
}

// Click events override `rating` to allow `'none'` because the user can
// clear a previously-set rating; reason_* events still inherit the
// stricter `positive | negative` base since they only fire after the user
// commits to a thumb.
export interface AssistantFeedbackClickProps
  extends Omit<AssistantFeedbackBase, 'rating'> {
  element: 'assistant_feedback_button';
  action: TrackingFeedbackAction;
  /** Post-action state. `'none'` when the user just cleared their rating. */
  rating: TrackingFeedbackRatingWithNone;
  /** Pre-action state. Renamed from `previous_rating` for symmetry with `rating`. */
  rating_before: TrackingFeedbackRatingWithNone;
  has_produced_files: boolean;
}

export interface AssistantFeedbackReasonViewProps extends AssistantFeedbackBase {
  element: 'assistant_feedback_reason_panel';
  view_type: 'panel';
}

// Shape shared by reason_click (button click) and reason_submit (result).
// Both fire from the same submit handler with the same payload, threaded by
// request_id so PostHog can stitch click→result.
interface AssistantFeedbackReasonResultBase extends AssistantFeedbackBase {
  reason: TrackingFeedbackReasonCode[];
  reason_count: number;
  has_custom_reason: boolean;
  /** Raw free-text the user typed in the "other" input. Empty string when
   * the user didn't select "other" or left the field blank. Product
   * confirmed on 2026-05-13 that the raw text ships (no length bucketing). */
  custom_reason: string;
}

export interface AssistantFeedbackReasonClickProps
  extends AssistantFeedbackReasonResultBase {
  element: 'assistant_feedback_reason_submit_button';
  action: 'click_submit_feedback_reason';
}

export interface AssistantFeedbackReasonSubmitProps
  extends AssistantFeedbackReasonResultBase {
  element: 'assistant_feedback_reason_submit';
  action: 'submit_feedback_reason';
}

/**
 * One Labs experiment switch moved.
 *
 * Generic on purpose: the experiment is a property (`item_id`), not part of the
 * event name, so a second experiment reuses this event and every existing
 * PostHog query keeps working.
 *
 * Direction and reason ride on the same event because the dashboard reads them
 * together — opt-out rate is `to: 'off'` split by `reason`. The reason panel
 * appears *after* the switch moves, so an opt-out emits twice: once
 * immediately without a reason, once more if the user gives one. Count
 * opt-outs from the first, read reasons from the second.
 */
export interface LabsItemToggledProps {
  item_id: TrackingLabsItemId;
  to: 'on' | 'off';
  source: TrackingLabsToggleSource;
  /** Only when `source` is `system`. */
  system_reason?: TrackingLabsSystemReason;
  /** Only on the follow-up emit after an opt-out, once the user answers. */
  reason?: TrackingLabsOptOutReason[];
  has_custom_reason?: boolean;
  /** Raw free text from the "other" field. Empty when unused. */
  custom_reason?: string;
}

// SETTINGS view + result events (page=settings)
export interface SettingsViewProps {
  page_name: TrackingSettingsPage;
  area: TrackingSettingsArea;
}

/**
 * One diagnostic detection produced for one agent CLI. Answers, fleet-wide, the
 * question a single bug report can only answer for one machine: how many
 * installs of an agent someone installed cannot actually be used, and why.
 *
 * Carries no `page_name` on purpose. Detection is a daemon fact reported to
 * whichever surface asked for the agent list; the surface is incidental to the
 * failure and splitting by it would fragment the only number that matters.
 *
 * Carries no resolved path on purpose either — an agent binary path contains
 * the OS username.
 */
export interface AgentDetectDiagnosticProps {
  area: 'runtime_detection';
  cli_provider_id: TrackingCliProviderId;
  reason: AgentDiagnosticReason;
  severity: AgentDiagnosticSeverity;
  /** Warnings are not blocking, so availability is what separates them. */
  agent_available: boolean;
  /** The version detection read, when it read one. */
  agent_version?: string;
  /** A row with no path is hidden entirely — the user sees nothing to fix. */
  has_path: boolean;
}

export interface SettingsCliTestResultProps {
  page_name: TrackingSettingsPage;
  area: 'configure_execution_mode';
  cli_provider_id: TrackingCliProviderId;
  result: TrackingTestResult;
  error_code?: string;
  duration_ms: number;
}

export interface SettingsByokTestResultProps {
  page_name: TrackingSettingsPage;
  // CSV row 67 names this area `execution_model`; keep that spelling so the
  // wire format matches the doc.
  area: 'execution_model';
  provider_id: TrackingByokProviderId;
  result: TrackingTestResult;
  error_code?: string;
  error_kind?: string;
  field_missing?: 'api_key' | 'base_url' | 'model' | 'multiple' | 'none';
  config_key_changed?: boolean;
  success_after_action?: boolean;
  duration_ms: number;
}

export interface SettingsByokModelsFetchResultProps {
  page_name: TrackingSettingsPage;
  area: 'configure_execution_mode_byok';
  provider_id: TrackingByokProviderId;
  result: TrackingResult;
  trigger: 'auto' | 'manual';
  source: 'network' | 'cache';
  error_code?: string;
  error_kind?: string;
  field_missing?: 'api_key' | 'base_url' | 'model' | 'multiple' | 'none';
  model_count?: number;
  duration_ms: number;
}

export interface ByokPreflightBlockedProps {
  source: 'settings' | 'run';
  reason: TrackingByokPreflightBlockReason;
  provider_id: TrackingByokProviderId | 'unknown';
  active_execution_mode: TrackingExecutionMode;
}

export interface SettingsConnectorAuthResultProps {
  page_name: TrackingSettingsPage;
  area: 'connectors';
  connector_id: string;
  action: 'connect' | 'disconnect' | 'refresh';
  result: TrackingRunResult;
  error_code?: string;
}

// ---- Packaged startup failure --------------------------------------------

export type PackagedStartupFailureKind =
  | 'daemon-start'
  | 'web-start'
  | 'path-access'
  // A sidecar that never reported ready within the status-wait budget — the
  // pipe/socket never bound in time (e.g. win32 first-launch AV scanning slowing
  // the daemon cold start), as opposed to a sidecar that exited (`daemon-start` /
  // `web-start`). Split out so this bucket stops hiding inside `unknown`.
  | 'status-timeout'
  // The sidecar process could not be created at all — Node rejected the spawn
  // itself (win32 CreateProcess denied by AV quarantine, a locked/partially
  // written exe, a missing interpreter). Distinct from a sidecar that started
  // and then died (`daemon-start`) and from one that never reported ready
  // (`status-timeout`); it used to land in `unknown` with the real cause sitting
  // unread on the error's `code`/`errno`/`syscall`.
  | 'spawn-failed'
  | 'unknown';

// Event-specific props for `packaged_runtime_failed`. Emitted by the packaged
// MAIN process (apps/packaged/src/startup-telemetry.ts) over a direct PostHog
// capture when daemon/web sidecars die before reporting status — the pre-daemon
// crash class that otherwise produces no telemetry (issue #4638). The shared
// safety-event envelope (event_schema_version / env / device_id / client_type /
// capture_source / $insert_id / $os) is stamped at emit time, mirroring
// `captureSafety` in apps/daemon/src/analytics.ts; these are the event-specific
// fields on top of it.
export interface PackagedRuntimeFailedProps {
  failure_kind: PackagedStartupFailureKind;
  exit_code: number | null;
  signal: string | null;
  error_name: string;
  // Pulled from the dead sidecar's log tail (e.g. `ERR_MODULE_NOT_FOUND`).
  error_code: string | null;
  // The unresolved module when error_code is a module-resolution failure
  // (e.g. `better-sqlite3` for #4638).
  missing_module: string | null;
  // The sidecar's own fatal line from the same log tail (e.g.
  // `SqliteError: database disk image is malformed`), for the daemons that die
  // of something the `ERR_*` match cannot name. Without it a daemon that threw
  // any non-`ERR_` error reported error_code=null AND missing_module=null even
  // though the reason was sitting in a log we had already read. Scrubbed and
  // truncated like the other free-form fields.
  daemon_error?: string | null;
  // The scrubbed, bounded tail of that same log, sent ONLY when the parse above
  // produced nothing (no error_code, no missing_module, no daemon_error). That
  // all-null combination is the largest startup-failure bucket in production
  // (macOS daemon-start, 968 events / 293 people over the 14 days to
  // 2026-08-22) and was previously undiagnosable: the reason was printed in a
  // log we had already read and discarded because it matched no known pattern.
  // Narrow by design — when the cause is already named, the raw tail is bytes
  // and privacy surface for nothing, so a present value also *means* "this log
  // defeated the parser".
  daemon_log_tail?: string | null;
  // Node's system-error triplet read off the THROWN error object, as opposed to
  // `error_code`, which is parsed out of the sidecar log. A failed spawn or
  // socket op carries its real cause here (`UNKNOWN`/-4094/`spawn`,
  // `ENOSPC`/-28/`write`) while `.message` stays generic, so dropping these
  // collapsed distinct OS-level failures into one opaque bucket.
  sys_code?: string | null;
  sys_errno?: number | null;
  sys_syscall?: string | null;
  // Crash-scene evidence added for the field-crash subset (#4638 follow-up): the
  // shipped build is verified-good, so these separate a machine-side "module
  // missing/unloadable" from a code path, and give the Windows `unknown` bucket
  // (which has no daemon log to parse) its only signal. All scrubbed of the
  // user's home dir and truncated before send.
  //
  // Free-form error text off the top-level thrown error (not the log tail).
  error_message?: string | null;
  error_stack?: string | null;
  // Probe of the daemon's better-sqlite3 native binding on THIS machine.
  // present=null when no path was supplied; size is bytes when present.
  native_module_present?: boolean | null;
  native_module_size?: number | null;
  native_module_path?: string | null;
  // Scrubbed of the user's home dir before send.
  log_path: string | null;
  app_version: string | null;
  namespace: string;
  source: string;
  platform: string;
}
