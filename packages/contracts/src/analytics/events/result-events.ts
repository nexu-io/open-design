/**
 * @module analytics/events/result-events
 * *_result event prop types (run, feedback, settings, packaged).
 */
import type { TrackingRuntimeType } from '../public-params.js';
import type { ReleaseChannel } from '@open-design/release';
import type { TrackingDesignSystemEditSurface, TrackingDesignSystemKind, TrackingDesignSystemLengthBucket, TrackingDesignSystemOrigin, TrackingDesignSystemRunEntryFrom } from './design-systems.js';
import type { TrackingSettingsPage } from './event-names.js';
import type { TrackingArtifactKind, TrackingArtifactWriteSource, TrackingArtifactWriteStatus, TrackingByokProviderId, TrackingCliProviderId, TrackingDesignSystemSource, TrackingExportFormat, TrackingExportResult, TrackingFeedbackAction, TrackingFeedbackProviderId, TrackingFeedbackRating, TrackingFeedbackRatingWithNone, TrackingFeedbackReasonCode, TrackingFidelity, TrackingFileSizeBucket, TrackingFileType, TrackingFirstModelEventType, TrackingLangfuseDeliveryStatus, TrackingLangfuseDropReason, TrackingLangfuseReportResult, TrackingLangfuseReportSkipReason, TrackingProjectKind, TrackingProjectSource, TrackingResult, TrackingRunCloseReason, TrackingRunDiagnosticSource, TrackingRunFailureCategory, TrackingRunFailureDetail, TrackingRunFailureStage, TrackingRunFailureUserAction, TrackingRunLifecyclePhase, TrackingRunPhaseTimingStatus, TrackingRunResult, TrackingRunRetryFinalResult, TrackingRunRetryStrategy, TrackingRunRetrySuppressedReason, TrackingStderrLineCountBucket, TrackingTestResult, TrackingTokenCountSource } from './shared-enums.js';
import type { TrackingFileVersionSource, TrackingPluginImportSource, TrackingSessionMode, TrackingSettingsArea } from './ui-click.js';
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
  slide_count?: number;
  has_content?: boolean;
  result: TrackingResult;
  error_code?: string;
}

// Outcome of an actual import attempt from the plugin import modal. Fires
// once per executed import (after the install/upload promise settles), not
// for clicks that no-op. `error_code` carries the backend failure message —
// the install pipeline has no structured codes (see PluginInstallOutcome).
export interface PluginImportResultProps {
  page_name: 'plugins';
  area: 'import_modal';
  import_source: TrackingPluginImportSource;
  result: TrackingResult;
  error_code?: string;
}

export interface UpdateInstallResultProps {
  page_name: 'home';
  area: 'update_prompt';
  result: TrackingResult;
  app_version_before?: string;
  app_version_after?: string;
  error_code?: string;
}

// run_created/finished merges CSV rows 17/18 (extended fields) and 44/45
// (current daemon-side authoritative emission). Daemon supplies token /
// duration data; entry surfaces propagate the optional context (entry_from,
// fidelity, etc.) via the create-run payload.
export interface RunCreatedProps {
  // `chat_panel` is the regular artifact-run surface; `design_system_project`
  // is the DS-as-project variant (DS creation + regeneration runs).
  page_name: 'chat_panel' | 'design_system_project';
  area: 'chat_composer' | 'design_system_generation';
  // Where the run was initiated from. The DS variant uses the
  // `TrackingDesignSystemRunEntryFrom` set; both unions stay
  // distinct so the dashboard can split funnels cleanly.
  entry_from?:
    | 'new_project'
    | 'chat_composer'
    // Preview-annotation entries: `comment` (comment/board pin flow) and
    // `mark` (Mark draw-overlay flow). Both run against an existing artifact.
    | 'comment'
    | 'mark'
    // `next_step`: composer seeded by a guided Next-step action (best-effort,
    // tagged on the following send). `question_answer`: submitting answers to
    // an inline `<question-form>` clarification.
    | 'next_step'
    | 'question_answer'
    | TrackingDesignSystemRunEntryFrom;
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
  // The plugin actively bound to this run (the applied plugin snapshot), or
  // null when the user ran with no active plugin.
  plugin_id?: string | null;
  // Per-turn capability context: the MCP servers and skills actually enabled
  // for this send. Multi-valued, so recorded as arrays alongside the legacy
  // singular `mcp_id` / `skill_id` (which stay for back-compat).
  mcp_ids?: string[];
  skill_ids?: string[];
  token_count_source: TrackingTokenCountSource;
}

export interface RunFinishedProps extends Omit<RunCreatedProps, 'area'> {
  area: 'chat_panel' | 'design_system_generation';
  result: TrackingRunResult;
  error_code?: string;
  failure_category?: TrackingRunFailureCategory;
  failure_detail?: TrackingRunFailureDetail;
  failure_stage?: TrackingRunFailureStage;
  retryable?: boolean;
  user_action?: TrackingRunFailureUserAction;
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
  // True when the run raised a `<question-form>` clarification. Such runs
  // are intent-clarification turns (the agent stops to ask the user a question)
  // and therefore inherently produce no artifact, so the dashboard can exclude
  // them from the "run finished -> has artifact" funnel instead of counting
  // them as artifact-generation failures.
  asked_user_question: boolean;
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
  tool_call_count?: number;
  tool_duration_ms?: number;
  artifact_write_duration_ms?: number;
  artifact_write_status?: TrackingArtifactWriteStatus;
  artifact_write_source?: TrackingArtifactWriteSource;
  finalize_duration_ms?: number;
  total_duration_ms: number;
  bottleneck_phase?: TrackingRunLifecyclePhase;
  last_observed_phase?: TrackingRunLifecyclePhase;
  phase_timing_status?: TrackingRunPhaseTimingStatus;
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
  error_code?: string;
}

export interface RunRetryAttemptedProps extends RunRetryBaseProps {
  retry_reason: 'transient_failure';
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
  artifact_type: 'dmg' | 'installer';
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
  artifact_id: string;
  artifact_kind: TrackingArtifactKind;
  export_format: TrackingExportFormat;
  result: TrackingExportResult;
  error_code?: string;
  export_duration_ms: number;
  project_id: string;
  project_kind: TrackingProjectKind | null;
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

// SETTINGS view + result events (page=settings)
export interface SettingsViewProps {
  page_name: TrackingSettingsPage;
  area: TrackingSettingsArea;
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
