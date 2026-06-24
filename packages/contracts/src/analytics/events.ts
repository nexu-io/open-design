// Typed catalog for the v2 analytics schema. The wire format collapses to
// four core event names (`page_view`, `ui_click`, `surface_view`, plus the
// `*_result` family) and identifies the surface through the
// `page_name` + `area` + `element` triplet rather than the v1 per-page event
// names. Configure-state triplet (`has_available_configure_cli` /
// `configure_type` / `configure_availability`) is supplied via the global
// register in `apps/web/src/analytics/client.ts`; it does NOT appear in the
// per-event prop types below.

import type {
  AnalyticsConfigureGlobals,
  TrackingConfigureAvailability,
  TrackingConfigureType,
  TrackingRuntimeType,
} from './public-params.js';
import type { ReleaseChannel } from '@open-design/release';

// ---- Event names ---------------------------------------------------------

export type AnalyticsEventName =
  // Core triad
  | 'page_view'
  | 'ui_click'
  | 'surface_view'
  // Project lifecycle
  | 'project_create_result'
  | 'plugin_replacement_result'
  | 'plugin_import_result'
  // Run lifecycle (daemon authoritative)
  | 'run_created'
  | 'run_finished'
  | 'langfuse_report_result'
  | 'run_retry_attempted'
  | 'run_retry_finished'
  // Packaged updater lifecycle
  | 'update_install_result'
  | 'update_apply_observed'
  // Packaged startup failure — emitted by the packaged MAIN process (not the
  // daemon) when daemon/web sidecars die before reporting status, i.e. the
  // pre-daemon crash class that produces zero telemetry today (issue #4638).
  // A `captureSafety`-class stability event; see apps/packaged/src/startup-telemetry.ts.
  | 'packaged_runtime_failed'
  // File manager
  | 'file_upload_result'
  // Artifact
  | 'artifact_export_result'
  | 'artifact_deploy_result'
  // Feedback
  | 'feedback_submit_result'
  | 'assistant_feedback_click'
  | 'assistant_feedback_reason_view'
  | 'assistant_feedback_reason_click'
  | 'assistant_feedback_reason_submit'
  // Settings
  | 'settings_view'
  | 'settings_cli_test_result'
  | 'settings_byok_test_result'
  | 'settings_byok_models_fetch_result'
  | 'settings_connector_auth_result'
  // Onboarding-only result events. UI clicks + page_views inside the
  // onboarding flow reuse the generic `ui_click` / `page_view` shapes
  // with `page_name=onboarding`; the three `onboarding_*` names below
  // capture lifecycle moments that don't fit a click or a view.
  | 'onboarding_runtime_scan_result'
  | 'onboarding_complete_result'
  // Design-system lifecycle. Clicks + page_views inside DS surfaces
  // reuse `ui_click` / `page_view`; the five names below capture
  // ingest / create / review / status / picker-apply moments.
  | 'design_system_source_ingest_result'
  | 'design_system_create_result'
  | 'design_system_review_result'
  | 'design_system_status_result'
  | 'design_system_apply_result';

// ---- Pages ---------------------------------------------------------------

export type TrackingPageName =
  | 'home'
  | 'projects'
  | 'automations'
  | 'plugins'
  | 'design_systems'
  // `design_system_project` is the per-DS surface (preview / generation
  // dialog inside a specific design system). Distinct from the
  // `design_systems` list page.
  | 'design_system_project'
  | 'integrations'
  | 'chat_panel'
  | 'file_manager'
  | 'artifact'
  | 'onboarding'
  // `studio` is the in-project workspace that hosts the chat composer and
  // the design system picker. Reported when a DS picker / module renders
  // inside a project.
  | 'studio'
  | 'settings';

// Alias kept for backwards-compatibility inside the contracts file; v2 wire
// format uses the field name `page_name` for settings events too.
export type TrackingSettingsPage = 'settings';

// ---- Shared enums --------------------------------------------------------

export type TrackingProjectKind =
  | 'prototype'
  | 'live_artifact'
  | 'slide_deck'
  | 'template'
  | 'image'
  | 'video'
  // `hyperframes` is a `video` project rendered by the local HyperFrames
  // HTML→MP4 engine (`videoModel === 'hyperframes-html'`). The product
  // routes it as its own task type (a peer of Video, with its own Home
  // chip), and its cost/latency/success profile differs sharply from AI
  // video providers, so it is surfaced as a first-class project_kind
  // rather than collapsed into generic `video`. `model_id` still carries
  // `hyperframes-html` as a secondary anchor.
  | 'hyperframes'
  | 'audio'
  | 'brand'
  // `design_system` covers DS-as-project runs (creation + regeneration).
  // The dashboard reads it on run_created / run_finished to split the
  // DS generation funnel from regular artifact runs.
  | 'design_system'
  | 'other';

// Where a project originated. Matches CSV row 9 / row 17 enum.
export type TrackingProjectSource =
  | 'create_button'
  | 'import_claude_design_zip'
  | 'open_folder'
  | 'template'
  | 'chat_composer'
  | 'unknown';

export type TrackingAmrEntrySource =
  | 'onboarding_amr_card'
  | 'onboarding_amr_sign_in_continue'
  | 'inline_model_switcher_amr_row'
  | 'settings_amr_agent_card'
  | 'settings_amr_authorize'
  | 'settings_amr_console'
  | 'settings_amr_install'
  | 'avatar_amr_console'
  | 'handoff_amr_website'
  | 'chat_error_authorize_retry'
  | 'chat_error_recharge'
  | 'chat_error_switch_retry_card'
  | 'generation_preview_authorize_retry'
  | 'generation_preview_recharge'
  | 'generation_preview_switch_retry_card';

export interface AmrEntryAttribution {
  entryId: string;
  sourceProduct: 'open_design';
  sourceDetail: TrackingAmrEntrySource;
  occurredAt: string;
  // Open Design install/device id forwarded only on consent-gated AMR handoffs.
  odDeviceId?: string;
  // Self-reported onboarding profile, forwarded to AMR (anchored to entryId) so
  // AMR can segment paid conversion by who the visitor is. Open strings, not a
  // union: onboarding keeps these open so a new option never forces a contract
  // bump. Absent when the visitor skipped or never reached onboarding. useCase
  // is multi-select, hence an array.
  odRole?: string;
  odOrgSize?: string;
  odUseCase?: string[];
  odSource?: string;
}

// The six tabs inside the New project modal (CSV row 7 tab_name).
export type TrackingNewProjectTab =
  | 'prototype'
  | 'live_artifact'
  | 'slide_deck'
  | 'from_template'
  | 'media'
  | 'other';

export type TrackingFidelity =
  | 'wireframe'
  | 'high_fidelity'
  | 'not_applicable';

export type TrackingExecutionMode = 'local_cli' | 'byok';

// v2 BYOK provider catalogue (CSV row 65). Replaces v1's
// `anthropic|openai|azure|ollama|google`. `senseaudio` was added on
// `main` after the v2 doc was published; we forward it verbatim so
// dashboards can split it out even though the product CSV does not yet
// list it.
export type TrackingByokProviderId =
  | 'anthropic'
  | 'openai'
  | 'azure_openai'
  | 'google_gemini'
  | 'ollama_cloud'
  | 'senseaudio';

// v2 CLI provider catalogue (CSV row 63 + image 59). Adds `qoder_cli` and
// `kilo` over v1, plus `amr` (the vela CLI runtime) so AMR runs no longer
// fold into the `other` catch-all bucket.
export type TrackingCliProviderId =
  | 'claude_code'
  | 'codex_cli'
  | 'devin_for_terminal'
  | 'gemini_cli'
  | 'opencode'
  | 'hermes'
  | 'kimi_cli'
  | 'cursor_agent'
  | 'qwen_code'
  | 'qoder_cli'
  | 'github_copilot_cli'
  | 'pi'
  | 'kilo'
  | 'amr'
  | 'other';

export type TrackingFeedbackProviderId =
  | TrackingCliProviderId
  | TrackingByokProviderId;

export type TrackingArtifactKind =
  | 'html'
  | 'markdown'
  | 'image'
  | 'video'
  | 'audio'
  | 'doc'
  | 'unknown';

// NOTE: vercel / cloudflare_pages are intentionally NOT here. Deploy attempts
// used to ride artifact_export_result with those formats, but that only ever
// meant "deploy popover opened", never a real publish. Real deploys are now
// tracked exclusively by artifact_deploy_result (see TrackingDeployProvider).
export type TrackingExportFormat =
  | 'pdf'
  | 'pptx'
  | 'zip'
  | 'html'
  | 'image'
  | 'markdown'
  | 'template'
  | 'share_link'
  | 'share_page';

export type TrackingResult = 'success' | 'failed';
export type TrackingRunResult = 'success' | 'failed' | 'cancelled';
export type TrackingExportResult = 'success' | 'failed' | 'cancelled';
export type TrackingTestResult = 'success' | 'failed' | 'timeout';
export type TrackingRunFailureCategory =
  | 'auth'
  | 'rate_limit'
  | 'insufficient_balance'
  | 'model_unavailable'
  | 'prompt_too_large'
  | 'upstream_unavailable'
  | 'timeout'
  | 'empty_output'
  | 'tool_error'
  | 'process_exit'
  | 'user_cancel'
  | 'unknown';
export type TrackingRunFailureDetail =
  | 'auth_required'
  | 'stale_profile'
  | 'refresh_token_reused'
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'hard_quota'
  | 'workspace_credits_exhausted'
  | 'rate_limit_429'
  | 'amr_insufficient_balance'
  | 'model_not_found'
  | 'model_not_supported'
  | 'model_disabled'
  | 'local_model_not_loaded'
  | 'cli_version_incompatible'
  | 'prompt_too_large'
  | 'upstream_5xx'
  | 'upstream_client_error'
  | 'stream_disconnected'
  | 'network_error'
  | 'provider_high_demand'
  | 'provider_routing_error'
  | 'inactivity_timeout'
  | 'timeout'
  | 'empty_output'
  | 'tool_error'
  | 'plugin_artifact_missing'
  | 'cli_not_installed'
  | 'git_bash_missing'
  | 'agent_config_invalid'
  | 'spawn_failed'
  | 'spawn_enoexec'
  | 'spawn_ebadf'
  | 'spawn_eperm'
  | 'stdin_write_eof'
  | 'agent_protocol_error'
  | 'session_resume_expired'
  | 'fabricated_role_marker'
  | 'permission_request_not_found'
  | 'qoder_stop_sequence'
  | 'signal_killed'
  | 'process_crashed'
  | 'interrupted'
  | 'exit_code'
  | 'terminated_unknown'
  | 'stream_error'
  | 'exit_nonzero'
  | 'fatal_rpc_error'
  | 'execution_failed'
  | 'user_cancelled'
  | 'unknown';
export type TrackingRunFailureStage =
  | 'preflight'
  | 'spawn'
  | 'session_init'
  | 'model_select'
  | 'prompt_send'
  | 'first_token_wait'
  | 'tool_execution'
  | 'artifact_write'
  | 'child_close'
  | 'finalize';
export type TrackingRunFailureUserAction =
  | 'retry'
  | 'login'
  | 'recharge'
  | 'switch_model'
  | 'reduce_context'
  | 'install_cli'
  | 'fix_config'
  | 'none';
export type TrackingRunRetryStrategy = 'same_run_transient';
export type TrackingRunRetryFinalResult =
  | 'not_attempted'
  | 'success'
  | 'failed'
  | 'suppressed';
export type TrackingRunRetrySuppressedReason =
  | 'not_failed'
  | 'not_retryable'
  | 'unsupported_category'
  | 'hard_quota'
  | 'attempt_limit_reached'
  | 'cancel_requested'
  | 'user_visible_output_seen'
  | 'tool_call_seen'
  | 'artifact_write_seen'
  | 'live_artifact_seen';
export type TrackingRunDiagnosticSource =
  | 'error_event'
  | 'stderr'
  | 'exit_code'
  | 'signal'
  | 'unknown';
export type TrackingStderrLineCountBucket =
  | 'none'
  | '1_5'
  | '6_20'
  | '21_100'
  | 'gt_100';
export type TrackingRunCloseReason =
  | 'exit_0'
  | 'exit_nonzero'
  | 'signal'
  | 'cancel_requested'
  | 'stream_error'
  | 'fatal_rpc_error'
  | 'empty_output'
  | 'unknown';
export type TrackingLangfuseDeliveryStatus =
  | 'not_expected'
  | 'queued'
  | 'accepted'
  | 'failed';
export type TrackingLangfuseDropReason =
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
export type TrackingLangfuseReportResult =
  | 'accepted'
  | 'failed'
  | 'skipped';
export type TrackingLangfuseReportSkipReason =
  | 'run_not_found'
  | 'duplicate_run'
  | 'not_expected';

export type TrackingFeedbackRating = 'positive' | 'negative';
// Click events emit `none` when the user clears a previously-set rating, so
// `rating` (post-state) and `rating_before` (pre-state) on click both use
// this widened union. Reason events still require a concrete rating.
export type TrackingFeedbackRatingWithNone = 'positive' | 'negative' | 'none';
export type TrackingFeedbackAction =
  | 'submit_feedback_rating'
  | 'clear_feedback_rating';

// Mirrors ChatMessageFeedbackReasonCode in packages/contracts/src/api/chat.ts.
// Kept independent so the analytics wire format can evolve without forcing
// a contract bump on the chat persistence shape.
export type TrackingFeedbackReasonCode =
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

// Product confirmed on 2026-05-13: custom_reason ships the raw text so
// analysts can read the actual feedback. The earlier length-bucket approach
// from the tracking doc draft is no longer in effect.

export type TrackingTokenCountSource =
  | 'provider_usage'
  | 'estimated'
  | 'unknown';

export type TrackingDesignSystemSource =
  | 'default'
  | 'user_selected'
  | 'template_inherited'
  | 'project_saved'
  | 'not_applicable'
  | 'unknown';

export type TrackingFileType =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'zip'
  | 'folder'
  | 'other';

export type TrackingFileSizeBucket =
  | '0_1mb'
  | '1_10mb'
  | '10_100mb'
  | '100mb_plus';

// ---- page_view ------------------------------------------------------------

// `source` is supplied only by the chat_panel page_view (CSV row 41), where
// it records which surface launched the studio.
export type TrackingChatPanelPageViewSource =
  | 'new_project'
  | 'chat_composer'
  | 'recent_project'
  | 'projects_list'
  | 'template'
  | 'automation'
  | 'deeplink'
  | 'reload'
  | 'unknown';

// --- Onboarding page_view (welcome flow) ---
//
// CSV row "Onboarding / page_view". Fires once per step exposure inside the
// welcome flow. The current first-run flow is Connect → About you →
// Newsletter → Brand extraction; the design-system and generation literals
// remain in the contract for historical rows and a future reintroduction.
// Each step's `step_index` / `step_name` must match the enum pairs below.
// `onboarding_session_id` is generated once per session so dashboards can
// stitch the funnel.
export type TrackingOnboardingArea =
  | 'runtime'
  | 'about_you'
  | 'newsletter'
  | 'brand'
  | 'design_system'
  | 'generation_progress';

// Mixed string enum: numeric steps render as the strings `'1' | '2' | '3' | '4'`
// and the generation phase as `'progress'`. Mirrors the v2 doc literally.
export type TrackingOnboardingStepIndex = '1' | '2' | '3' | '4' | 'progress';

export type TrackingOnboardingStepName =
  | 'connect'
  | 'about_you'
  | 'newsletter'
  | 'brand_extract'
  | 'design_system'
  | 'generation';

// How the user chose to connect to a model provider. `amr_cloud` is the
// hosted offering the doc references; today the UI ships only
// `local_cli` (Local Coding Agent) and `byok` (own model key). `none`
// stamps the click events fired before any runtime was picked.
// Onboarding's runtime pick is the same closed set as the global
// `runtime_type` public param; alias to the single source of truth so the
// two never drift.
export type TrackingOnboardingRuntimeType = TrackingRuntimeType;

// What kind of source material the user pinned in the design-system
// step. `text` covers the brand description textarea; `mixed` is
// reserved for batches that combined more than one type.
export type TrackingOnboardingSourceType =
  | 'text'
  | 'github_repo'
  | 'local_code'
  | 'fig'
  | 'assets'
  | 'mixed'
  | 'none';

// `completed`: user clicked through every step (with or without a DS).
// `cancelled`: user closed the onboarding tab / navigated away without
// finishing. `failed`: terminal error before completion.
// `skipped`: DEPRECATED — the onboarding "Skip for now" affordance was
// removed (Connect is now a required gate), so this is no longer emitted.
// Kept in the union for historical data / dashboard compatibility.
export type TrackingOnboardingCompletionResult =
  | 'completed'
  /** @deprecated no longer emitted — Skip was removed from onboarding. */
  | 'skipped'
  | 'cancelled'
  | 'failed';

export type TrackingOnboardingCompletionType =
  | 'completed_with_design_system'
  | 'completed_without_design_system'
  /** @deprecated no longer emitted — Skip was removed from onboarding. */
  | 'skipped';

// CLI scan terminal state. `success`: at least one CLI was detected;
// `failed`: scan errored or detected nothing; `timeout`: scan didn't
// settle inside the budget. Daemon doesn't currently surface timeouts
// for this scan; left in the type so a future watchdog can use it
// without a contract change.
export type TrackingOnboardingScanResult = 'success' | 'failed' | 'timeout';

// About-you step values. Surfaces from `onboardingRole*` /
// `onboardingOrg*` / `onboardingUse*` / `onboardingSource*` i18n
// keys; this enum is the wire-format shape the dashboard groups on.
// Kept as `string` rather than literal union because the product
// catalogue extends (e.g. add a new role) more often than the wire
// shape: a stricter union would force a contract bump for every new
// option. `unknown` covers the "user didn't pick / picked Other"
// path explicitly.
export type TrackingOnboardingOrganizationSize = string;
export type TrackingOnboardingUseCase = string;
export type TrackingOnboardingDiscoverySource = string;
// User's self-identified role. Same wire shape and rationale as the
// other About-you survey strings — `pm`, `designer`, `engineer`,
// `marketing`, `growth`, `ops`, `founder`, `student`, `other` are the
// current options from `apps/web/src/components/EntryShell.tsx`
// (`roleOptions`); the type stays open so adding a future role doesn't
// force a contract bump.
export type TrackingOnboardingRole = string;

export interface OnboardingPageViewProps {
  page_name: 'onboarding';
  area: TrackingOnboardingArea;
  step_index: TrackingOnboardingStepIndex;
  step_name: TrackingOnboardingStepName;
  onboarding_session_id: string;
}

// ---- Onboarding ui_click ------------------------------------------------
//
// One interface so every onboarding click site can write
// `trackOnboardingClick(...)`, regardless of which sub-surface. The doc
// pre-allocates a large element / action enum because the funnel needs
// to discriminate Skip from Back from Continue, runtime choice from
// source selection, etc.
export type TrackingOnboardingClickElement =
  // Runtime / connect step
  | 'amr_cloud'
  | 'local_coding_agent'
  | 'byok'
  // Action buttons
  | 'continue'
  | 'back'
  /** @deprecated no longer emitted — Skip was removed from onboarding. */
  | 'skip'
  | 'generate'
  // About you fields
  | 'role'
  | 'organization_size'
  | 'use_case'
  | 'hear_about_us'
  // Optional newsletter email captured on the About-you step
  | 'newsletter_email'
  // Fires once on Finish-setup, carrying the full survey snapshot
  // (role + organization_size + use_case + discovery_source) so the
  // funnel always has the user's final picks even when individual
  // dropdown clicks were dropped on a fast navigate.
  | 'about_you_submit'
  // Design system source options
  | 'github_repo'
  | 'local_code'
  | 'fig_upload'
  | 'assets_upload'
  | 'show_access_methods';

export type TrackingOnboardingClickAction =
  | 'select_runtime'
  | 'continue'
  | 'back'
  /** @deprecated no longer emitted — Skip was removed from onboarding. */
  | 'skip'
  | 'generate'
  | 'select_option'
  | 'add_source'
  | 'upload_source'
  | 'show_access_methods'
  | 'subscribe';

// All optional except the discriminators (area/element/action/step/
// session id). `role`/`organization_size`/`use_case`/`discovery_source`
// ride along on About-you clicks AND on the `about_you_submit` snapshot
// click. `source_type`/`has_brand_description`/`source_count` only on
// Design-system source clicks. `runtime_type`/`is_recommended` only on
// Connect clicks. Doc explicitly forbids brand text, GitHub URL, file
// name, or path values — all enum + bool + count, no free-text.
export interface OnboardingClickProps {
  page_name: 'onboarding';
  area: TrackingOnboardingArea;
  element: TrackingOnboardingClickElement;
  action: TrackingOnboardingClickAction;
  step_index: TrackingOnboardingStepIndex;
  step_name: TrackingOnboardingStepName;
  onboarding_session_id: string;
  runtime_type?: TrackingOnboardingRuntimeType;
  is_recommended?: boolean;
  role?: TrackingOnboardingRole;
  organization_size?: TrackingOnboardingOrganizationSize;
  use_case?: TrackingOnboardingUseCase;
  // Multi-pick variant of `use_case` for the survey-snapshot
  // `about_you_submit` click. Individual `use_case` picks still go
  // through the scalar field one row per option. The list captures
  // the final selection at Finish-setup time without firing N rows.
  use_cases?: TrackingOnboardingUseCase[];
  discovery_source?: TrackingOnboardingDiscoverySource;
  source_type?: TrackingOnboardingSourceType;
  has_brand_description?: boolean;
  source_count?: number;
  // True when the user left a (valid) newsletter email on the About-you
  // step. Boolean only — the email address itself is never sent here.
  newsletter_opt_in?: boolean;
}

// ---- Onboarding lifecycle result events ---------------------------------

export interface OnboardingRuntimeScanResultProps {
  page_name: 'onboarding';
  area: 'runtime';
  runtime_type: 'local_cli';
  result: TrackingOnboardingScanResult;
  detected_cli_count: number;
  available_cli_count: number;
  selected_cli_id?: TrackingCliProviderId;
  error_code?: string;
  duration_ms: number;
  onboarding_session_id: string;
}

export interface OnboardingCompleteResultProps {
  page_name: 'onboarding';
  area: 'onboarding';
  result: TrackingOnboardingCompletionResult;
  exit_step_name: TrackingOnboardingStepName;
  completion_type: TrackingOnboardingCompletionType;
  runtime_type: TrackingOnboardingRuntimeType;
  has_about_you: boolean;
  has_design_system_request: boolean;
  source_count: number;
  error_code?: string;
  duration_ms: number;
  onboarding_session_id: string;
  // Survey-snapshot fields. Mirror the values from
  // `about_you_submit` ui_click so dashboards can read the user's
  // picks even if the individual dropdown clicks were dropped on
  // navigate. `'unknown'` is the wire value for a field the user
  // never touched on the About-you step; missing field means the user
  // skipped the entire step.
  role?: TrackingOnboardingRole;
  organization_size?: TrackingOnboardingOrganizationSize;
  use_cases?: TrackingOnboardingUseCase[];
  discovery_source?: TrackingOnboardingDiscoverySource;
}

// --- Design systems page_view (multi-surface) ---
//
// Single shape covering the dedicated DS list / create / preview pages plus
// the DS picker / generation-dialog exposures rendered inside home and
// studio. `page_name` discriminates the host page; `area` + `view_type`
// discriminate the specific surface; the rest carry the DS context needed
// to stitch funnels (DS list → picker → project → run).
export type TrackingDesignSystemsArea =
  | 'design_system_list'
  | 'design_system_create'
  | 'design_system_generation'
  | 'design_system_preview'
  | 'design_system_picker'
  | 'composer';

export type TrackingDesignSystemsViewType =
  | 'page'
  | 'panel'
  | 'dialog'
  | 'popover'
  | 'module';

export type TrackingDesignSystemsEntryFrom =
  | 'onboarding'
  | 'design_systems_page'
  | 'home_card'
  | 'composer_picker'
  | 'project_settings'
  | 'unknown';

// Origin of the design system itself. NOT the same field as
// `TrackingDesignSystemSource` on run_created/run_finished, which records
// *how the run picked* its DS. v2 doc reuses the field name
// `design_system_source` for both contexts; the value sets are disjoint.
export type TrackingDesignSystemOrigin =
  | 'onboarding'
  | 'manual_create'
  | 'github_repo'
  | 'local_code'
  | 'fig'
  | 'assets'
  | 'official_preset'
  | 'enterprise'
  | 'template'
  | 'mixed'
  | 'unknown';

export type TrackingDesignSystemStatus =
  | 'draft'
  | 'generating'
  | 'ready'
  | 'published'
  | 'default'
  | 'failed'
  | 'archived'
  | 'unknown';

export interface DesignSystemsPageViewProps {
  page_name: 'design_systems' | 'design_system_project' | 'home' | 'studio';
  area: TrackingDesignSystemsArea;
  view_type: TrackingDesignSystemsViewType;
  entry_from: TrackingDesignSystemsEntryFrom;
  design_system_id?: string;
  // Re-uses the field name from the v2 doc; values are the
  // `TrackingDesignSystemOrigin` set, NOT the run-time
  // `TrackingDesignSystemSource` set.
  design_system_source?: TrackingDesignSystemOrigin;
  design_system_status?: TrackingDesignSystemStatus;
  project_id?: string;
  available_design_system_count?: number;
}

// ---- Design-system lifecycle enums ---------------------------------------
//
// Shared between source_ingest / create / review / status / apply result
// events. Buckets are deliberately string literals so the dashboard can
// group on them without bucket-vs-raw drift.
export type TrackingDesignSystemLengthBucket =
  | '0'
  | '1_50'
  | '51_200'
  | '201_500'
  | '500_plus';

export type TrackingDesignSystemFolderCountBucket =
  | '0'
  | '1_10'
  | '11_50'
  | '51_200'
  | '200_plus'
  | 'unknown';

export type TrackingDesignSystemTotalSizeBucket =
  | '0_1mb'
  | '1_10mb'
  | '10_50mb'
  | '50mb_plus'
  | 'unknown';

// `partial_success` reserved for ingests that captured some files but
// dropped others (e.g. a GitHub fetch that hit a per-file size cap on a
// subset). Daemon currently emits success/failed only; partial kept
// in the contract for the connector follow-up.
export type TrackingDesignSystemSourceIngestResult =
  | 'success'
  | 'partial_success'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export type TrackingDesignSystemIngestSourceType =
  | 'github_repo'
  | 'local_code'
  | 'fig'
  | 'assets'
  | 'mixed';

// `manual_text` covers the brand-description textarea fallback when
// no concrete file/repo ingest happened. `unknown` is the terminal
// failure path where the ingest never reached a method branch.
export type TrackingDesignSystemIngestMethod =
  | 'github_api'
  | 'git_clone'
  | 'local_snapshot'
  | 'fig_parse'
  | 'asset_upload'
  | 'manual_text'
  | 'unknown';

export type TrackingDesignSystemFallbackType =
  | 'none'
  | 'native_github_auth'
  | 'local_git_clone'
  | 'manual_upload'
  | 'unknown';

export type TrackingDesignSystemRepoHost =
  | 'github'
  | 'gitlab'
  | 'other'
  | 'unknown';

export type TrackingDesignSystemCreateEntryFrom =
  | 'onboarding'
  | 'design_systems_page'
  | 'home_card'
  | 'project_settings'
  | 'unknown';

export type TrackingDesignSystemSourceIngestEntryFrom =
  | 'onboarding'
  | 'design_systems_page'
  | 'project_settings'
  | 'unknown';

export type TrackingDesignSystemCreateResult = 'success' | 'failed' | 'cancelled';

export type TrackingDesignSystemReviewAction =
  | 'looks_good'
  | 'needs_work'
  | 'submit_revision'
  | 'regenerate';

export type TrackingDesignSystemReviewResult =
  | 'submitted'
  | 'generated'
  | 'failed'
  | 'cancelled';

export type TrackingDesignSystemModuleType =
  | 'typography'
  | 'colors'
  | 'spacing'
  | 'components'
  | 'brand_assets'
  | 'other';

export type TrackingDesignSystemStatusAction =
  | 'publish'
  | 'unpublish'
  | 'set_default'
  | 'unset_default'
  | 'archive'
  | 'delete';

export type TrackingDesignSystemStatusResult = 'success' | 'failed' | 'cancelled';

// Like `TrackingDesignSystemStatus` but adds `deleted` for the
// status_after side of a delete action.
export type TrackingDesignSystemStatusValue =
  | 'draft'
  | 'ready'
  | 'published'
  | 'default'
  | 'failed'
  | 'archived'
  | 'deleted'
  | 'unknown';

export type TrackingDesignSystemApplyAction =
  | 'select_design_system'
  | 'auto_select'
  | 'clear_selection'
  | 'apply_to_run';

export type TrackingDesignSystemApplyResult = 'success' | 'failed' | 'cancelled';

export type TrackingDesignSystemSelectionMode =
  | 'auto'
  | 'manual'
  | 'default'
  | 'none';

// Project kind values for the picker's target project. Wider than
// `TrackingProjectKind`'s prototype-side enum because the picker
// shows up in slide / image / video / audio / live-artifact composers
// too. `unknown` covers picker views with no project locked in.
export type TrackingDesignSystemApplyTargetKind =
  | 'prototype'
  | 'slide_deck'
  | 'image'
  | 'video'
  // HyperFrames projects can be a DS-apply target too; keep this in lockstep
  // with `TrackingProjectKind` so the picker reports them distinctly.
  | 'hyperframes'
  | 'audio'
  | 'live_artifact'
  | 'unknown';

// Entry from for the run_created / run_finished DS variant. Distinct
// from the chat-panel entry_from enum because DS runs don't originate
// from new_project / chat_composer at all.
export type TrackingDesignSystemRunEntryFrom =
  | 'design_system_create'
  | 'onboarding_design_system'
  | 'regenerate_from_review'
  | 'unknown';

// ---- Design-system lifecycle result props --------------------------------

export interface DesignSystemSourceIngestResultProps {
  page_name: 'design_systems' | 'design_system_project';
  area: 'design_system_create';
  entry_from: TrackingDesignSystemSourceIngestEntryFrom;
  source_type: TrackingDesignSystemIngestSourceType;
  ingest_method: TrackingDesignSystemIngestMethod;
  result: TrackingDesignSystemSourceIngestResult;
  has_fallback: boolean;
  fallback_type: TrackingDesignSystemFallbackType;
  repo_host: TrackingDesignSystemRepoHost;
  file_count: number;
  folder_file_count_bucket: TrackingDesignSystemFolderCountBucket;
  total_size_bucket: TrackingDesignSystemTotalSizeBucket;
  error_code?: string;
  duration_ms: number;
  project_id?: string;
  design_system_id?: string;
}

export interface DesignSystemCreateResultProps {
  page_name: 'design_systems';
  area: 'design_system_create';
  entry_from: TrackingDesignSystemCreateEntryFrom;
  result: TrackingDesignSystemCreateResult;
  project_id?: string;
  design_system_id?: string;
  design_system_source: TrackingDesignSystemOrigin;
  source_count: number;
  created_as_project: boolean;
  has_brand_description: boolean;
  brand_description_length_bucket: TrackingDesignSystemLengthBucket;
  notes_length_bucket: TrackingDesignSystemLengthBucket;
  error_code?: string;
  duration_ms: number;
}

export interface DesignSystemReviewResultProps {
  page_name: 'design_system_project';
  area: 'design_system_preview';
  review_action: TrackingDesignSystemReviewAction;
  result: TrackingDesignSystemReviewResult;
  design_system_id: string;
  project_id: string;
  // Stable identifier for the reviewed module. Derived from the
  // markdown section header slug (e.g. `typography`, `brand-assets`)
  // since DS sections don't have DB ids today. `module_index` makes
  // it unique when a DS has multiple sections sharing a header type.
  module_id: string;
  module_type: TrackingDesignSystemModuleType;
  module_index: number;
  feedback_length_bucket: TrackingDesignSystemLengthBucket;
  has_custom_feedback: boolean;
  run_id?: string;
  revision_run_id?: string;
  error_code?: string;
  duration_ms: number;
}

export interface DesignSystemStatusResultProps {
  page_name: 'design_systems' | 'design_system_project';
  area: 'design_system_status';
  action: TrackingDesignSystemStatusAction;
  result: TrackingDesignSystemStatusResult;
  design_system_id: string;
  project_id?: string;
  status_before: TrackingDesignSystemStatusValue;
  status_after: TrackingDesignSystemStatusValue;
  is_default_before: boolean;
  is_default_after: boolean;
  error_code?: string;
  duration_ms: number;
}

export interface DesignSystemApplyResultProps {
  page_name: 'home' | 'studio';
  area: 'design_system_picker' | 'composer';
  action: TrackingDesignSystemApplyAction;
  result: TrackingDesignSystemApplyResult;
  target_project_kind: TrackingDesignSystemApplyTargetKind;
  design_system_id?: string;
  design_system_source?: TrackingDesignSystemOrigin;
  design_system_status?: TrackingDesignSystemStatusValue;
  design_system_applied: boolean;
  design_system_selection_mode: TrackingDesignSystemSelectionMode;
  is_default: boolean;
  is_auto_selected: boolean;
  available_design_system_count: number;
  run_id?: string;
  error_code?: string;
  duration_ms: number;
}

// --- Generic page_view (existing surfaces) ---
//
// Covers all page-level page_views that don't carry surface-specific
// fields. `chat_panel` is the only one that uses the optional `source`.
export interface GenericPageViewProps {
  page_name: Exclude<
    TrackingPageName,
    'onboarding' | 'design_system_project' | 'studio'
  >;
  source?: TrackingChatPanelPageViewSource;
}

// Discriminated union by `page_name`. `home` and `design_systems` belong
// to BOTH `GenericPageViewProps` (page-level visit) and
// `DesignSystemsPageViewProps` (DS module / picker exposure on those
// pages); call sites that pass `area` get narrowed to the DS shape.
export type PageViewProps =
  | GenericPageViewProps
  | OnboardingPageViewProps
  | DesignSystemsPageViewProps;

// ---- ui_click ------------------------------------------------------------
//
// Each surface lives in its own `*ClickProps` interface so call sites stay
// strongly typed. The union below collects them for the central `track()`
// signature; helpers in apps/web/src/analytics/events.ts pick a specific
// interface per surface.

// HOME -- left nav / toolbar / center composer / recent projects / templates
export interface HomeNavClickProps {
  page_name: 'home';
  area: 'nav';
  element:
    | 'home'
    | 'projects'
    | 'automations'
    | 'plugins'
    | 'design_systems'
    | 'integrations'
    | 'new_project_plus'
    | 'help';
}

export interface HelpPopoverClickProps {
  page_name: 'home';
  area: 'help_resources_popover';
  element:
    | 'get_help_on_github'
    | 'submit_a_feature_request'
    | 'whats_new'
    | 'download_desktop_app';
  surface: 'popover';
}

export interface HomeToolbarClickProps {
  page_name: 'home';
  area: 'toolbar';
  element: 'star' | 'execution_settings' | 'use_everywhere' | 'settings';
}

export interface ExecutionSettingsPopoverClickProps {
  page_name: 'home';
  area: 'execution_settings_popover';
  element:
    | 'mode_local_cli'
    | 'mode_byok'
    | 'agent_card'
    // BYOK provider protocol tab inside the popover (Anthropic / OpenAI /
    // Azure / Google / AIHubMix). Mirrors Settings'
    // `byok_provider_option` so mode-switch funnels line up.
    | 'byok_provider_tab'
    | 'model_dropdown'
    | 'open_execution_settings';
  // `agent_card`: which CLI agent row was picked, normalized via
  // `agentIdToTracking` (never the raw kebab-case daemon id).
  cli_provider_id?: TrackingCliProviderId;
  // `byok_provider_tab` / BYOK `model_dropdown`: the protocol tab, mapped via
  // `byokProtocolToTracking`; omitted when the protocol is outside the v2
  // catalogue (e.g. aihubmix) so an unmapped value never ships.
  provider_id?: TrackingByokProviderId;
  // `model_dropdown`: the picked model id (`modelIdForTracking`).
  model_id?: string;
  // `model_dropdown`: which mode's dropdown was used.
  execution_mode?: TrackingExecutionMode;
}

// Items inside the header gear settings popover (EntrySettingsMenu): the
// interface-language select, the appearance (system/light/dark) radio row,
// the "Share Open Design" social grid, the Discord / follow-on-X links and
// the Settings → details entry. The same popover is mounted both on the home
// header and the in-project artifact header, hence the two-value page_name.
export interface SettingsPopoverClickProps {
  page_name: 'home' | 'artifact';
  area: 'settings_popover';
  element:
    | 'language_select'
    | 'appearance'
    | 'share_channel'
    | 'join_discord'
    | 'follow_x'
    | 'open_settings';
  // element=language_select → snake_cased locale (e.g. en, zh_cn, pt_br);
  // element=appearance → system | light | dark.
  value?: string;
  // element=share_channel only — which social network was clicked.
  channel?:
    | 'x'
    | 'linkedin'
    | 'facebook'
    | 'reddit'
    | 'telegram'
    | 'whatsapp'
    | 'weibo'
    | 'line'
    | 'instagram'
    | 'xiaohongshu';
}

export interface HomeChatComposerClickProps {
  page_name: 'home';
  area: 'chat_composer';
  element:
    | 'chat_input'
    | 'send_button'
    | 'plugin_chip'
    | 'action_chip'
    // Paperclip icon opening the file picker. Mirrors the chat_panel
    // composer's `element: 'attachment'` so the same dashboard counts
    // "user opened the file picker" across both surfaces.
    | 'attachment'
    // Local-storage / working-dir picker under the home composer; `task_chip`
    // is the task-type rail (原型 / 幻灯片 / HyperFrames / 视频 / …).
    | 'working_dir'
    | 'working_dir_clear'
    // The × on the active plugin chip above the composer (mirrors
    // `working_dir_clear`): removes the bound plugin, whether it was attached
    // from a Community card or an example-prompt preset. `chip_id` is the
    // plugin id.
    | 'plugin_chip_clear'
    // Re-selecting a previously used folder from the working-dir picker's
    // "Recent folders" submenu.
    | 'working_dir_recent'
    | 'task_chip'
    // Sub-category filter pill under the task rail (全部 / Landing / Brand /
    // Dashboards / …). `subcategory` carries the picked slug; '全部' sends
    // `subcategory: 'all'`. `chip_id` is the parent task type.
    | 'subcategory_chip'
    // An example-prompt card below the rail ("示例提示词"). `chip_id` is the
    // task type; for plugin-preset cards `plugin_id` / `plugin_type` identify
    // the preset. The raw prompt text is never sent (free text / PII rule).
    | 'example_prompt'
    // The "+" menu on the home composer (same control as the in-project
    // composer's `plus_*` events): opening it, inserting a
    // connector/plugin/mcp mention (`resource_kind` + `resource_id`), or
    // jumping to the add-resource surface (`resource_kind`).
    | 'plus_menu_open'
    | 'plus_pick'
    | 'plus_add';
  // For `plus_pick` / `plus_add`: which kind of resource (and its id on pick).
  resource_kind?: 'connector' | 'plugin' | 'mcp';
  resource_id?: string;
  // For plugin / action / task chips, the specific id (e.g. `prototype`,
  // `from_figma`, `hyperframes`).
  chip_id?: string;
  // For `subcategory_chip`: the picked sub-category slug ('all' on 全部).
  subcategory?: string;
  // For `example_prompt` cards backed by a plugin preset: which preset.
  plugin_id?: string;
  plugin_type?: string;
}

export interface UpdateIndicatorClickProps {
  page_name: 'home';
  area: 'update_indicator' | 'update_prompt';
  element: 'ready_indicator' | 'later' | 'install_update';
  action: 'open_prompt' | 'dismiss' | 'install';
  app_version_before?: string;
  app_version_after?: string;
}

export interface NewProjectModalTabClickProps {
  page_name: 'home';
  area: 'new_project_modal';
  element: 'tab';
  tab_name: TrackingNewProjectTab;
}

export interface NewProjectModalElementClickProps {
  page_name: 'home';
  area: 'new_project_modal';
  element:
    | 'project_name'
    | 'design_system'
    | 'target_platforms'
    | 'include_landing_page'
    | 'include_os_widgets'
    | 'wireframe'
    | 'high_fidelity'
    | 'create'
    | 'import_claude_design_zip'
    | 'open_folder'
    | 'path_input';
  tab_name: TrackingNewProjectTab;
}

export interface PluginReplacementModalClickProps {
  page_name: 'home';
  area: 'plugin_replacement_modal';
  element: 'cancel' | 'replace';
}

export interface PrivacyModalClickProps {
  page_name: 'home';
  area: 'privacy_modal';
  element: 'yes' | 'no';
}

export interface RecentProjectsClickProps {
  page_name: 'home';
  area: 'recent_projects';
  element: 'project_card' | 'view_all';
  project_id?: string;
  project_kind?: TrackingProjectKind;
  project_status?: string;
}

export interface HomeTemplatesClickProps {
  page_name: 'home';
  area: 'templates';
  element:
    | 'featured'
    | 'all'
    | 'clear_filters'
    | 'browse_registry'
    | 'search_input'
    | 'filter_chip'
    | 'templates_feature'
    | 'templates_details'
    | 'templates_use'
    | 'templates_use_dropdown'
    | 'create_templates';
  template_id?: string;
  template_type?: string;
  filter_name?: string;
}

export interface HomeTemplatesDropdownClickProps {
  page_name: 'home';
  area: 'templates_dropdown';
  element: 'use' | 'use_with_query';
  template_id?: string;
  template_type?: string;
}

// PROJECTS page
export interface ProjectsListControlsClickProps {
  page_name: 'projects';
  area: 'list_controls';
  element:
    | 'recent'
    | 'your_designs'
    | 'search_input'
    | 'select'
    | 'refresh'
    | 'create_project'
    | 'grid_view'
    | 'list_view';
}

export interface ProjectsListClickProps {
  page_name: 'projects';
  area: 'list';
  element: 'project_card' | 'more';
  project_id?: string;
  project_kind?: TrackingProjectKind;
  project_source?: TrackingProjectSource;
}

export interface ProjectsMorePopoverClickProps {
  page_name: 'projects';
  area: 'projects_more_popover';
  element: 'rename' | 'delete';
  project_id?: string;
  project_kind?: TrackingProjectKind;
}

// AUTOMATIONS
export interface AutomationsClickProps {
  page_name: 'automations';
  area: 'automations';
  element:
    | 'new_automation'
    | 'new'
    | 'view_progress'
    | 'run_now'
    | 'open_artifact'
    | 'type_card'
    | 'filter_tab'
    | 'edit'
    | 'pause'
    | 'resume'
    | 'delete'
    | 'history'
    | 'cancel'
    | 'create'
    | 'save'
    | 'crystallize'
    | 'proposal_apply'
    | 'proposal_reject';
  type_id?: 'orbit' | 'routines' | 'schedules' | 'live_artifacts';
  // filter_id mirrors the template category tabs actually rendered in the
  // Automations tab; the legacy run-status values stay for forward-compat.
  filter_id?:
    | 'all'
    | 'scheduled'
    | 'running'
    | 'done'
    | 'orbit'
    | 'live-artifact'
    | 'routine'
    | 'memory'
    | 'design-system'
    | 'skills'
    | 'connectors'
    | 'compression'
    | 'release'
    | 'quality';
  // Kind of the template whose card was clicked (element=type_card).
  template_kind?: 'orbit' | 'live-artifact' | 'routine';
}

// PLUGINS
export interface PluginsTopClickProps {
  page_name: 'plugins';
  area: 'plugins';
  element:
    | 'create_plugin'
    | 'import_plugin'
    | 'installed_tab'
    | 'available_tab'
    | 'sources_tab'
    | 'team_tab';
}

export interface PluginsInstalledTabClickProps {
  page_name: 'plugins';
  area: 'installed_tab';
  element:
    | 'clear_filters'
    | 'search_input'
    | 'filter_chip'
    | 'templates_details'
    | 'templates_use'
    | 'templates_use_dropdown'
    | 'templates_publish'
    | 'templates_contribute'
    | 'create_plugin';
  filter_key?: string;
  filter_name?: string;
  template_id?: string;
  template_type?: string;
}

export interface PluginsTemplatesDropdownClickProps {
  page_name: 'plugins';
  area: 'templates_dropdown';
  element: 'use' | 'use_with_query';
  template_id?: string;
  template_type?: string;
}

export interface PluginsAvailableTabClickProps {
  page_name: 'plugins';
  area: 'available_tab';
  element: 'search_input' | 'details' | 'install' | 'source_dropdown';
  plugin_id?: string;
  plugin_type?: string;
}

export interface PluginsSourcesTabClickProps {
  page_name: 'plugins';
  area: 'sources_tab';
  element: 'source_url_input' | 'add_source' | 'refresh' | 'remove';
  plugin_id?: string;
  plugin_type?: string;
}

// The plugin import modal's three intake paths (the source tabs):
// github = the "From GitHub" source-string flow, zip / folder = archive or
// directory upload. ImportKind in PluginsView.tsx uses the same literals.
export type TrackingPluginImportSource = 'github' | 'zip' | 'folder';

// "Import a plugin" modal opened from the Plugins page header.
export interface PluginImportModalClickProps {
  page_name: 'plugins';
  area: 'import_modal';
  element: 'source_tab' | 'import' | 'cancel';
  // For `source_tab` the tab being selected; for `import` the active intake
  // path the import runs through. Omitted for `cancel`.
  import_source?: TrackingPluginImportSource;
}

export interface PluginDetailClickProps {
  page_name: 'plugins';
  area: 'plugin_detail';
  element: 'back' | 'use_plugin';
  plugin_id?: string;
}

export interface PluginLoopClickProps {
  page_name: 'plugins';
  area: 'plugin_loop';
  element: 'clear_active' | 'submit' | 'card_details' | 'card_use';
  plugin_id?: string;
}

// COMMUNITY — the home "Community" gallery: a wall of live example.html
// preview tiles (PluginsHomeSection cardLayout="gallery"). `card` opens
// the plugin detail modal (tile body click or keyboard); `card_open_external`
// is the ↗ that opens the real example page in a new tab, bypassing the
// modal — a strong "go straight to the finished thing" intent signal.
export interface CommunityGalleryClickProps {
  page_name: 'home';
  area: 'community_gallery';
  // `use_plugin` is the user actually applying a community plugin into the
  // composer (from the gallery card's Use button or its detail modal), as
  // opposed to just opening the card. `action` distinguishes a plain apply
  // from use-with-query.
  element: 'card' | 'card_open_external' | 'use_plugin';
  plugin_id?: string;
  plugin_type?: string;
  action?: 'use' | 'use_with_query';
}

// HOME — clicks inside the plugin detail modal opened from the Community
// gallery (the surface PluginDetailModalSurfaceViewProps measures).
// `use_plugin` is the primary CTA face (action 'use'); `use_plugin_dropdown`
// is the split-menu "Replicate this content" variant (action 'use-with-query');
// `close` covers the close button, Esc and the backdrop. plugin_id /
// plugin_type mirror CommunityGalleryClickProps so the gallery → modal → use
// funnel joins on the same keys.
export interface PluginDetailModalClickProps {
  page_name: 'home';
  area: 'plugin_detail_modal';
  element: 'use_plugin' | 'use_plugin_dropdown' | 'close';
  plugin_id?: string;
  plugin_type?: string;
}

// HOME — the merged Share popover inside the plugin detail modal
// (PreviewModal chrome). Element values mirror design_systems'
// templates_modal_share_popover vocabulary: social intents, copy actions,
// then file exports.
export interface PluginDetailModalSharePopoverClickProps {
  page_name: 'home';
  area: 'plugin_detail_share_popover';
  element:
    | 'x'
    | 'reddit'
    | 'facebook'
    | 'linkedin'
    | 'instagram'
    | 'xiaohongshu'
    | 'copy_link'
    | 'copy_share_text'
    | 'pdf'
    | 'zip'
    | 'html'
    | 'image'
    | 'open_in_new_tab';
  plugin_id?: string;
  plugin_type?: string;
}

// DESIGN SYSTEMS
export interface DesignSystemsTopClickProps {
  page_name: 'design_systems';
  area: 'design_systems';
  element: 'search_input' | 'search_dropdown' | 'filter_chip';
  filter_name?: string;
}

export interface DesignSystemsTemplateCardClickProps {
  page_name: 'design_systems';
  area: 'templates_card';
  element: 'templates_card';
  templates_id?: string;
  templates_type?: string;
}

export interface DesignSystemsTemplatesModalClickProps {
  page_name: 'design_systems';
  area: 'templates_modal';
  element:
    | 'showcase'
    | 'tokens'
    | 'design_md'
    | 'open_design_set'
    | 'fullscreen'
    | 'share';
  templates_id?: string;
  templates_type?: string;
}

export interface DesignSystemsTemplatesModalSharePopoverClickProps {
  page_name: 'design_systems';
  area: 'templates_modal_share_popover';
  // Share popover element list is pending product confirmation; kept open so
  // the helper can ship now and the enum tightens later.
  element: string;
  templates_id?: string;
  templates_type?: string;
}

// Form-level intent clicks on the standalone /design-systems/create
// setup form ("Generate from your material"). The embedded onboarding
// variant is excluded — EntryShell/onboarding owns its own
// area=design_system clicks (same gating as the DS create page_view
// and the DS file_upload_result).
export interface DesignSystemsCreateClickProps {
  page_name: 'design_systems';
  area: 'design_system_create';
  element:
    | 'github_repo_add'
    | 'show_access_methods'
    | 'browse_folder'
    | 'upload_fig'
    | 'add_assets'
    | 'continue_to_generation'
    | 'back';
  // State *after* the toggle; only sent with element=show_access_methods.
  methods_expanded?: boolean;
}

// INTEGRATIONS
export interface IntegrationsTabClickProps {
  page_name: 'integrations';
  area: 'integrations_tab';
  element: 'mcp' | 'connectors' | 'skills' | 'use_everywhere';
}

// Shared element vocabulary for the External MCP panel. McpClientSection
// renders on two surfaces (Settings -> External MCP, Integrations -> MCP
// tab); both click payloads draw from this enum so funnels line up.
export type TrackingExternalMcpElement =
  | 'add_server'
  | 'pick_template'
  | 'pick_blank'
  | 'remove_server'
  | 'saved';

export interface IntegrationsMcpTabClickProps {
  page_name: 'integrations';
  area: 'mcp_tab';
  element: TrackingExternalMcpElement;
  // Catalog template id (hyphens mapped to underscores). Set for
  // `pick_template`, and for `remove_server` when the removed row came
  // from a template. Omitted for blank/custom rows.
  template_id?: string;
}

export interface IntegrationsConnectorsTabClickProps {
  page_name: 'integrations';
  area: 'connectors_tab';
  element:
    | 'api_key_input'
    | 'save_key'
    | 'clear'
    | 'get_api_key'
    | 'gate_card'
    | 'provider_chip'
    | 'search_connectors';
}

export interface IntegrationsSkillsTabClickProps {
  page_name: 'integrations';
  area: 'skills_tab';
  element: 'coming_soon';
}

export interface IntegrationsUseEverywhereTabClickProps {
  page_name: 'integrations';
  area: 'use_everywhere_tab';
  element:
    | 'overview'
    | 'cli_od'
    | 'mcp_server'
    | 'http_api'
    | 'skills_headless'
    | 'configure_mcp_server'
    | 'copy_guide_for_agent'
    | 'copy';
}

// CHAT PANEL (studio)
export interface ChatPanelClickProps {
  page_name: 'chat_panel';
  area: 'chat_panel';
  element:
    | 'history'
    | 'new_chat'
    | 'back'
    | 'template_card'
    | 'chat_input'
    | 'composer_settings'
    | 'attachment'
    | 'send'
    | 'mention_popover_trigger'
    | 'resources_popover_trigger';
}

// Composer mode the user sends prompts in. `ask` is the lighter Q&A mode
// (the wire / DB value is `chat`; the UI labels it "Ask"); `design` is the
// full design-agent run. Map the wire `chat` → `ask` at every emit site via
// `sessionModeToTracking` so analytics speaks the product's language.
export type TrackingSessionMode = 'ask' | 'design';

// Toggling the ask/design switch in the chat composer.
export interface ComposerSessionModeClickProps {
  // The composer renders on both the home hero and the in-project chat panel;
  // the toggle is the same control on both surfaces.
  page_name: 'home' | 'chat_panel';
  area: 'chat_composer';
  element: 'session_mode_toggle';
  mode_before: TrackingSessionMode;
  mode_after: TrackingSessionMode;
  project_id?: string;
}

// The "设计百宝箱" (Design toolbox) flyout inside the composer's "+" menu.
// `design_toolbox_open` fires when the panel is opened; `..._action` when a
// predefined follow-up action is picked (`toolbox_action_id`); `..._resource`
// when a skill / plugin / mcp / connector / file is inserted
// (`resource_kind` + `resource_id`).
export interface DesignToolboxClickProps {
  page_name: 'chat_panel';
  area: 'chat_composer';
  element:
    | 'design_toolbox_open'
    | 'design_toolbox_action'
    | 'design_toolbox_resource';
  toolbox_action_id?: string;
  resource_kind?:
    | 'skill'
    | 'plugin'
    | 'mcp'
    | 'mcp-template'
    | 'connector'
    | 'file';
  resource_id?: string;
  project_id?: string;
}

// The rest of the in-project composer bottom bar (not the mode toggle or the
// design toolbox, which have their own events above):
//   - `plus_menu_open` / `plus_pick` / `plus_add`: the "+" menu — opening it,
//     inserting a connector/plugin/mcp mention (`resource_kind` + `resource_id`),
//     or jumping to the add-resource surface (`resource_kind`).
//   - `design_system_switch`: picked a design system from the composer
//     (`design_system_id`).
//   - `working_dir` / `working_dir_recent` / `working_dir_clear`: the
//     working-dir picker under the composer — picking a new folder, re-selecting
//     one from the "Recent folders" submenu, or clearing the bound dir. Fires on
//     the click itself (intent), identical timing/semantics to the home
//     composer's `working_dir*` elements, so one dashboard counts the action
//     across both surfaces.
//   - `agent_selector_open` / `agent_select` / `agent_model_select`: the CLI/
//     agent/model dropdown (`agent_id` / `model_id`).
//   - `context_remove`: removed a staged context chip (`resource_kind` +
//     `resource_id`).
export interface ComposerBarClickProps {
  page_name: 'chat_panel';
  area: 'chat_composer';
  element:
    | 'plus_menu_open'
    | 'plus_pick'
    | 'plus_add'
    | 'design_system_switch'
    | 'working_dir'
    | 'working_dir_recent'
    | 'working_dir_clear'
    | 'agent_selector_open'
    | 'agent_select'
    | 'agent_model_select'
    | 'context_remove';
  resource_kind?:
    | 'connector'
    | 'plugin'
    | 'mcp'
    | 'skill'
    | 'workspace'
    | 'attachment';
  resource_id?: string;
  agent_id?: string;
  model_id?: string;
  design_system_id?: string;
  project_id?: string;
}

// Next-step action affordance shown under the last successful assistant
// message. `next_step_exposed` fires once when the affordance becomes visible
// so the funnel can divide clicks by exposure; the action elements drive the
// "second-turn rate" / "share rate" acceptance metrics. The featured
// design-toolbox rows (`toolbox_action`, with `chip_id` carrying the action id)
// and `toolbox_more` replaced the former recommended chips as the card's
// primary iteration entry. `chip` remains for back-compat on legacy events.
export interface NextStepActionClickProps {
  page_name: 'chat_panel';
  area: 'next_step';
  element:
    | 'next_step_exposed'
    | 'share'
    | 'chip'
    | 'toolbox_action'
    | 'toolbox_more'
    | 'share_to_open_design';
  chip_id?: string;
}

// Studio Questions tab discovery form (the agent-emitted <question-form>
// rendered in the right-hand panel before generation starts). The form body
// is model-generated JSON, so chips are question options, not fixed UI:
//   - `task_type_chip`: a pick on the `taskType` radio (Prototype / Live
//     artifact / Slide deck / Image / Video / HyperFrames / Audio / Other).
//   - `brand_bg_chip`: a pick on the `brand` radio (pick_direction /
//     brand_spec / reference_match).
//   - `skip`: the Skip button or the auto-continue countdown elapsing
//     (`skip_source` says which). The countdown honours any picks the user
//     made, so skip also carries the counts.
//   - `submit`: the Continue CTA (or the form's own submit).
// `chip_id` / `form_id` are normalized via `questionsFormTrackingId`
// ("Live artifact" → "live_artifact"; non-latin localized labels → "unknown").
export interface QuestionsFormClickProps {
  page_name: 'chat_panel';
  area: 'questions_form';
  element: 'task_type_chip' | 'brand_bg_chip' | 'skip' | 'submit';
  // task_type_chip / brand_bg_chip only: the picked option value, snake_case.
  chip_id?: string;
  // skip only: user pressed the button vs the countdown elapsed.
  skip_source?: 'button' | 'countdown';
  // skip / submit: questions carrying a non-empty answer vs left blank.
  answered_count?: number;
  skipped_count?: number;
  // 'task_type' (single-shot default-router brief) | 'discovery' | other.
  form_id?: string;
  project_id: string;
}

// Hosted-AMR nudge shown under a non-AMR agent's model/auth/quota failure.
// `go_amr` is the link that opens https://open-design.ai/amr.
export interface RunFailedToastClickProps {
  page_name: 'chat_panel';
  area: 'chat_panel';
  element: 'go_amr';
}

export interface AmrEntryClickProps {
  page_name: TrackingPageName;
  area: 'amr_entry';
  element: TrackingAmrEntrySource;
  action: 'click_amr_entry';
  entry_id: string;
  source_product: 'open_design';
  source_detail: TrackingAmrEntrySource;
  entry_occurred_at: string;
}

// Terminal outcome of one AMR (vela) sign-in attempt, fired exactly once
// per attempt when the login poll loop settles. This is the main-app-side
// completion signal that pairs with the amr_entry click: dashboards count
// AMR-authorized users from this event without joining the separate AMR
// PostHog project. `result` semantics:
//   success   — poll observed loggedIn=true within the budget
//   failed    — `vela login` failed to spawn or exited before sign-in
//   cancelled — the user clicked Cancel (or backed out mid-start)
//   timeout   — the 5-minute poll budget elapsed
export interface AmrAuthResultProps {
  page_name: TrackingPageName;
  area: 'amr_auth';
  result: 'success' | 'failed' | 'cancelled' | 'timeout';
  error_code?: string;
  duration_ms: number;
  // Attribution carried over from the amr_entry click that started this
  // attempt; absent when login was started without a recorded entry.
  entry_id?: string;
  source_detail?: TrackingAmrEntrySource;
}

export interface ChatPanelResourcesPopoverClickProps {
  page_name: 'chat_panel';
  area: 'resources_popover';
  element:
    | 'plugins_tab'
    | 'skills_tab'
    | 'mcp_tab'
    | 'users_tab'
    | 'files_tab'
    | 'official'
    | 'my_plugins'
    | 'search_input'
    | 'template_card'
    | 'customize_in_settings';
}

// Actions on the queued-send strip ("N queued · to send") that sits above
// the chat composer while a run is in flight: re-open a queued prompt in the
// composer (`edit`), promote it to send immediately (`send_now`), or drop it
// from the queue (`delete`). `queue_length` is the queue size at click time,
// before the action applies.
export interface ChatPanelMessageQueueClickProps {
  page_name: 'chat_panel';
  area: 'message_queue';
  element: 'edit' | 'send_now' | 'delete';
  project_id: string;
  queue_length: number;
}

// FILE MANAGER
export interface FileManagerClickProps {
  page_name: 'file_manager';
  area: 'file_manager';
  element:
    | 'new_sketch'
    | 'paste'
    | 'upload'
    | 'select_all_on_page'
    | 'select_everything'
    | 'download_as_zip'
    | 'delete'
    | 'previous'
    | 'next'
    | 'per_page_dropdown';
}

// The workspace tab strip's "+" launcher — a command-palette popover for
// opening tabs. `open` fires when the menu is opened; `filter` when a file-kind
// chip is picked (`kind_filter`); `create` when a "New …" action runs
// (`action_id` = new-terminal | new-browser | …); `open_file` when a project
// file is opened as a tab (`file_kind`); `open_tab` when an already-open tab is
// focused (`tab_kind` = browser | terminal | design-files | …).
export interface TabLauncherClickProps {
  page_name: 'file_manager';
  area: 'tab_launcher';
  element: 'open' | 'filter' | 'create' | 'open_file' | 'open_tab';
  action_id?: string;
  kind_filter?: string;
  file_kind?: string;
  tab_kind?: string;
  project_id?: string;
}

// REFERENCE BOARD — the Design browser's blank-tab start page: a curated
// catalogue of reference sites with category filter chips, a search box,
// and per-site Open buttons. `category_id` mirrors `REFERENCE_GROUPS[].id`
// in DesignBrowserPanel plus the synthetic `all` chip; `site_id` is the
// site hostname slugged to snake_case with the TLD dropped
// (`dribbble.com` → `dribbble`, `land-book.com` → `land_book`,
// `fonts.google.com` → `fonts_google`).
export type TrackingReferenceBoardCategory =
  | 'all'
  | 'inspiration'
  | 'interfaces'
  | 'motion'
  | 'color'
  | 'type'
  | 'icons'
  | 'illustration'
  | 'photography'
  | '3d'
  | 'mockups'
  | 'systems'
  | 'components'
  | 'guidelines'
  | 'tools';

export interface ReferenceBoardClickProps {
  page_name: 'file_manager';
  area: 'reference_board';
  element: 'category_chip' | 'open_site' | 'search_input';
  // Sent with element=category_chip.
  category_id?: TrackingReferenceBoardCategory;
  // Sent with element=open_site: the hostname slug (see above).
  site_id?: string;
  project_id?: string;
}

// ARTIFACT
export interface ArtifactToolbarClickProps {
  page_name: 'artifact';
  area: 'artifact_toolbar';
  element:
    | 'reload'
    | 'preview'
    | 'source'
    // Copies a screenshot of the current preview to the clipboard (does not
    // start a run). Tracked so the preview-export tool's usage is measurable.
    | 'screenshot'
    | 'tweaks'
    // The Mark (mark-pen) annotation tool. Renamed from `draw` to match the
    // product label users see; the draw-overlay sub-toolbar keeps area
    // `draw_toolbar`.
    | 'mark'
    | 'comment'
    | 'pods'
    | 'inspect'
    | 'edit'
    | 'zoom_out'
    | 'zoom_level_dropdown'
    | 'zoom_in';
  artifact_id?: string;
  artifact_kind?: TrackingArtifactKind;
}

// The Draw (mark-pen) annotation overlay's floating toolbar inside the
// artifact preview. `rect` / `pen` switch the mark tool (the component's
// internal MarkTool value 'box' maps to `rect`); `undo` / `redo` cover both
// the toolbar buttons and the Cmd/Ctrl+Z(+Shift) shortcuts; `attach_image`
// opens the image picker; `annotation_submit` fires once per submit with
// `submit_action` distinguishing add-to-input (`draft`) / queue / send —
// including the Enter key in the note input; `exit` is the toolbar close
// button.
export interface DrawToolbarClickProps {
  page_name: 'artifact';
  area: 'draw_toolbar';
  element:
    | 'rect'
    | 'pen'
    | 'undo'
    | 'redo'
    | 'attach_image'
    | 'annotation_submit'
    | 'exit';
  submit_action?: 'draft' | 'queue' | 'send';
  artifact_id?: string;
  artifact_kind?: TrackingArtifactKind;
}

export interface TweaksPopoverClickProps {
  page_name: 'artifact';
  area: 'tweaks_popover';
  element: 'variant_option';
  variant_name?: string;
  artifact_id?: string;
  artifact_kind?: TrackingArtifactKind;
  status_before: 'on' | 'off';
  status_after: 'on' | 'off';
}

export interface CommentPopoverClickProps {
  page_name: 'artifact';
  area: 'comment_popover';
  element: 'save_comment' | 'send_to_chat' | 'add_note';
  artifact_id?: string;
  artifact_kind?: TrackingArtifactKind;
}

export interface ArtifactHeaderClickProps {
  page_name: 'artifact';
  area: 'artifact_header';
  element:
    | 'back'
    | 'edit'
    | 'present_dropdown'
    // `download_dropdown` distinguishes the Download split button from the
    // Share button; before, both reported `share_dropdown` and were
    // indistinguishable in the funnel.
    | 'download_dropdown'
    | 'share_dropdown'
    | 'settings';
  artifact_id?: string;
  artifact_kind?: TrackingArtifactKind;
}

// Canonical, bounded set of hand-off `target_id` values: the editor /
// file-manager ids (mirrors `HostEditorId` in `../api/host-tools`) plus the
// tracked code-agent CLI ids. Single source of truth for both the type and
// the runtime allow-list in `handoffTargetIdToTracking`. Keep in sync with
// `HostEditorId` and `HandoffButton`'s CLI_ORDER; unknown runtime ids
// normalize to `'other'` so the schema never leaks an editor label, binary
// name, or other free-form / PII value.
export const TRACKING_HANDOFF_TARGET_IDS = [
  // editors / file managers (HostEditorId)
  'cursor', 'vscode', 'windsurf', 'zed', 'qoder', 'antigravity', 'webstorm',
  'idea', 'xcode', 'finder', 'explorer', 'file-manager', 'terminal', 'warp',
  // code-agent CLIs (HandoffButton CLI_ORDER; qoder / antigravity already above)
  'amr', 'claude', 'codex', 'opencode', 'cursor-agent', 'gemini', 'qwen',
  'copilot', 'grok-build', 'deepseek', 'kimi', 'hermes', 'devin', 'kiro',
  'kilo', 'vibe', 'aider', 'trae-cli', 'pi', 'reasonix',
] as const;

export type TrackingHandoffTargetId =
  | (typeof TRACKING_HANDOFF_TARGET_IDS)[number]
  | 'other';

// Normalize a runtime editor / CLI id to the bounded tracking enum. Unknown
// ids (e.g. a CLI the daemon adds later) collapse to `'other'` rather than
// shipping a free-form value, keeping the no-PII guarantee enforced in code.
export function handoffTargetIdToTracking(
  id: string | null | undefined,
): TrackingHandoffTargetId {
  return (TRACKING_HANDOFF_TARGET_IDS as readonly string[]).includes(id ?? '')
    ? (id as TrackingHandoffTargetId)
    : 'other';
}

// Hand-off button in the workspace header (open the project folder in a local
// editor, or copy a hand-off prompt for a code-agent CLI). Lives under
// `page_name=artifact` / `area=handoff` so it sits next to the other header
// actions (present/share/download/settings) in the funnel.
export interface HandoffClickProps {
  page_name: 'artifact';
  area: 'handoff';
  element:
    // Primary split button — launches the preferred editor, or toggles the
    // picker when there is no preferred target yet.
    | 'trigger'
    // Caret next to the primary button — toggles the picker menu.
    | 'caret'
    // Switch between the Editor and CLI tabs inside the picker.
    | 'tab'
    // Choose a target framework chip for the CLI hand-off prompt.
    | 'framework'
    // Copy the absolute project path.
    | 'copy_path'
    // Launch a specific editor target (or the Finder/Explorer fallback).
    | 'open_editor'
    // Copy the hand-off prompt for a specific CLI agent.
    | 'copy_cli_prompt'
    // Open the Open Design AMR website link.
    | 'amr_website';
  // Bounded enum id of the editor / CLI target, present for `open_editor`,
  // `copy_cli_prompt`, and for `trigger` when it directly launches the
  // preferred editor. Normalized via `handoffTargetIdToTracking` so it is
  // never a free path or display name (`'other'` for unknown ids).
  target_id?: TrackingHandoffTargetId;
  // Whether the chosen editor / CLI target was detected as installed.
  target_available?: boolean;
  // Which hand-off tab the click relates to (tab switches and CLI copies).
  handoff_tab?: 'editor' | 'cli';
  // Selected framework id for CLI prompt copies / framework chip selection.
  framework?: 'react' | 'vue' | 'svelte' | 'solid' | 'next' | 'vanilla';
  artifact_id?: string;
  artifact_kind?: TrackingArtifactKind;
}

export interface PresentPopoverClickProps {
  page_name: 'artifact';
  area: 'present_popover';
  element: 'in_this_tab' | 'fullscreen' | 'new_tab';
  artifact_id?: string;
  artifact_kind?: TrackingArtifactKind;
}

export interface ShareOptionPopoverClickProps {
  page_name: 'artifact';
  area: 'share_option_popover';
  // Export/share formats, plus 'publish_required_guide' for the share-intent
  // signal: the user opened Share wanting a link but the artifact isn't
  // deployed yet, so only the "publish online first" guide row is shown.
  element: TrackingExportFormat | 'publish_required_guide';
  artifact_id: string;
  artifact_kind: TrackingArtifactKind;
  project_id: string;
  project_kind: TrackingProjectKind | null;
}

// FEEDBACK clicks (CSV rows 56 / 58)
// `agent_provider_id` / `model_id` are carried on every feedback event so
// `reason × agent` and `reason × model` analyses don't need to join back to
// `run_created` (which loses rows when the feedback is given to a message
// whose run is outside the query window — the dominant source of "unknown"
// in earlier reports). `model_id` uses `'default'` instead of null when the
// user did not pick a specific model; see `modelIdForTracking`.
export interface AssistantFeedbackButtonClickProps {
  page_name: 'chat_panel';
  area: 'chat_panel';
  element: 'assistant_feedback_button';
  action: 'submit_feedback_rating' | 'clear_feedback_rating';
  project_id: string;
  project_kind: TrackingProjectKind | null;
  conversation_id: string | null;
  assistant_message_id: string;
  run_id: string;
  agent_provider_id: TrackingFeedbackProviderId;
  model_id: string;
  // For `clear_feedback_rating`, `rating` carries the rating that was
  // cleared (not the previous-before-clear value, which lives in
  // `rating_before`). Mason flagged the v1 emission supplied the wrong
  // value here; v2 corrects that.
  rating: 'positive' | 'negative';
  rating_before: 'positive' | 'negative' | 'none';
  has_produced_files: boolean;
}

export interface AssistantFeedbackReasonSubmitClickProps {
  page_name: 'chat_panel';
  area: 'chat_panel';
  element: 'assistant_feedback_reason_submit_button';
  action: 'click_submit_feedback_reason';
  project_id: string;
  project_kind: TrackingProjectKind | null;
  conversation_id: string | null;
  assistant_message_id: string;
  run_id: string;
  agent_provider_id: TrackingFeedbackProviderId;
  model_id: string;
  rating: 'positive' | 'negative';
  reason?: string;
  reason_count: number;
  has_custom_reason: boolean;
  custom_reason?: string;
}

// SETTINGS clicks
export type TrackingSettingsArea =
  | 'configure_execution_mode'
  | 'configure_execution_mode_local_cli'
  | 'configure_execution_mode_byok'
  | 'instructions'
  | 'memory'
  | 'media_providers'
  | 'skills'
  | 'design_review'
  | 'external_mcp'
  | 'connectors'
  | 'orbit'
  | 'mcp_server'
  | 'language'
  | 'appearance'
  | 'notifications'
  | 'pets'
  | 'design_systems'
  | 'project_locations'
  | 'privacy'
  | 'about';

export interface SettingsSidebarClickProps {
  page_name: TrackingSettingsPage;
  area: 'settings_sidebar';
  element: TrackingSettingsArea;
}

export interface SettingsExecutionModeTabClickProps {
  page_name: TrackingSettingsPage;
  area: 'configure_execution_mode';
  element: 'execution_mode_tab';
  action: 'switch_execution_mode';
  mode_before: TrackingExecutionMode;
  mode_after: TrackingExecutionMode;
}

export interface SettingsLocalCliClickProps {
  page_name: TrackingSettingsPage;
  area: 'configure_execution_mode_local_cli';
  element: 'test' | 'rescan' | 'cli_provider' | 'install' | 'docs';
  cli_provider_id?: TrackingCliProviderId;
  install_status?: 'installed' | 'not_installed' | 'unknown';
}

export interface SettingsByokProviderOptionClickProps {
  page_name: TrackingSettingsPage;
  area: 'configure_execution_mode_byok';
  element: 'byok_provider_option';
  action: 'select_byok_provider';
  provider_id: TrackingByokProviderId;
  is_selected: boolean;
}

export interface SettingsByokFieldClickProps {
  page_name: TrackingSettingsPage;
  area: 'configure_execution_mode_byok';
  element:
    | 'fetch_models'
    | 'test'
    | 'quick_fill_provider'
    | 'api_key'
    | 'model'
    | 'memory_model'
    | 'base_url';
  provider_id: TrackingByokProviderId;
  // Only set for `api_key` / `base_url` / `model` focus events.
  has_value?: boolean;
}

export interface SettingsMediaProvidersClickProps {
  page_name: TrackingSettingsPage;
  area: 'media_providers';
  element: 'reload' | 'key_input' | 'url_input' | 'clear';
  providers_id?: string;
  is_configured?: boolean;
}

export interface SettingsConnectorsClickProps {
  page_name: TrackingSettingsPage;
  area: 'connectors';
  element:
    | 'api_key_input'
    | 'save_key'
    | 'clear'
    | 'get_api_key'
    | 'gate_card'
    | 'provider_chip'
    | 'search_connectors';
  connector_id?: string;
}

export interface SettingsLanguageClickProps {
  page_name: TrackingSettingsPage;
  area: 'language';
  // Locale id, e.g. `english`, `bahasa_indonesia`, `zh_cn`.
  element: string;
}

export interface SettingsAppearanceClickProps {
  page_name: TrackingSettingsPage;
  area: 'appearance';
  element: 'system' | 'light' | 'dark' | 'accent_color';
  color?: string;
}

export interface SettingsNotificationsClickProps {
  page_name: TrackingSettingsPage;
  area: 'notifications';
  element:
    | 'completion_sound'
    | 'desktop_notification'
    | 'send_test'
    | 'success_sound'
    | 'failure_sound';
  // For sound selection events, the chosen tone id.
  sound_id?: 'ding' | 'chime' | 'two_tone_up' | 'pluck' | 'buzz' | 'two_tone_down' | 'thud';
  completion_sound_status?: 'on' | 'off';
  desktop_notification_status?: 'on' | 'off';
}

export interface SettingsPetsClickProps {
  page_name: TrackingSettingsPage;
  area: 'pets';
  element:
    | 'tuck_away'
    | 'built_in'
    | 'custom'
    | 'community'
    | 'custom_card'
    | 'adopt';
  pet_id?: string;
}

export interface SettingsPrivacyClickProps {
  page_name: TrackingSettingsPage;
  area: 'privacy';
  element:
    | 'anonymous_metrics'
    | 'conversation_and_tool_content'
    | 'delete_my_data';
  anonymous_metrics_status?: 'on' | 'off';
  conversation_and_tool_content_status?: 'on' | 'off';
}

export interface SettingsDesignReviewClickProps {
  page_name: TrackingSettingsPage;
  area: 'design_review';
  element: 'enable_toggle';
  status_before: 'on' | 'off';
  status_after: 'on' | 'off';
  // True when Settings was opened from /projects/:id so the toggle also
  // persisted to the project's metadata (the daemon-side rollout gate),
  // not just localStorage.
  has_active_project: boolean;
}

export interface SettingsExternalMcpClickProps {
  page_name: TrackingSettingsPage;
  area: 'external_mcp';
  element: TrackingExternalMcpElement;
  // Same semantics as IntegrationsMcpTabClickProps.template_id.
  template_id?: string;
}

// Discriminated union of every supported ui_click payload.
export type UiClickProps =
  | HomeNavClickProps
  | HelpPopoverClickProps
  | HomeToolbarClickProps
  | ExecutionSettingsPopoverClickProps
  | SettingsPopoverClickProps
  | HomeChatComposerClickProps
  | UpdateIndicatorClickProps
  | NewProjectModalTabClickProps
  | NewProjectModalElementClickProps
  | PluginReplacementModalClickProps
  | PrivacyModalClickProps
  | RecentProjectsClickProps
  | HomeTemplatesClickProps
  | HomeTemplatesDropdownClickProps
  | ProjectsListControlsClickProps
  | ProjectsListClickProps
  | ProjectsMorePopoverClickProps
  | AutomationsClickProps
  | PluginsTopClickProps
  | PluginsInstalledTabClickProps
  | PluginsTemplatesDropdownClickProps
  | PluginsAvailableTabClickProps
  | PluginsSourcesTabClickProps
  | PluginImportModalClickProps
  | PluginDetailClickProps
  | PluginLoopClickProps
  | CommunityGalleryClickProps
  | PluginDetailModalClickProps
  | PluginDetailModalSharePopoverClickProps
  | DesignSystemsTopClickProps
  | DesignSystemsTemplateCardClickProps
  | DesignSystemsTemplatesModalClickProps
  | DesignSystemsTemplatesModalSharePopoverClickProps
  | DesignSystemsCreateClickProps
  | IntegrationsTabClickProps
  | IntegrationsMcpTabClickProps
  | IntegrationsConnectorsTabClickProps
  | IntegrationsSkillsTabClickProps
  | IntegrationsUseEverywhereTabClickProps
  | ChatPanelClickProps
  | ComposerSessionModeClickProps
  | DesignToolboxClickProps
  | ComposerBarClickProps
  | NextStepActionClickProps
  | QuestionsFormClickProps
  | RunFailedToastClickProps
  | AmrEntryClickProps
  | ChatPanelResourcesPopoverClickProps
  | ChatPanelMessageQueueClickProps
  | FileManagerClickProps
  | TabLauncherClickProps
  | ReferenceBoardClickProps
  | ArtifactToolbarClickProps
  | DrawToolbarClickProps
  | TweaksPopoverClickProps
  | CommentPopoverClickProps
  | ArtifactHeaderClickProps
  | HandoffClickProps
  | PresentPopoverClickProps
  | ShareOptionPopoverClickProps
  | AssistantFeedbackButtonClickProps
  | AssistantFeedbackReasonSubmitClickProps
  | SettingsSidebarClickProps
  | SettingsExecutionModeTabClickProps
  | SettingsLocalCliClickProps
  | SettingsByokProviderOptionClickProps
  | SettingsByokFieldClickProps
  | SettingsMediaProvidersClickProps
  | SettingsConnectorsClickProps
  | SettingsLanguageClickProps
  | SettingsAppearanceClickProps
  | SettingsNotificationsClickProps
  | SettingsPetsClickProps
  | SettingsPrivacyClickProps
  | SettingsDesignReviewClickProps
  | SettingsExternalMcpClickProps
  | OnboardingClickProps;

// ---- surface_view --------------------------------------------------------

export interface HelpPopoverSurfaceViewProps {
  page_name: 'home';
  area: 'help_resources_popover';
}

// Impression of the header gear settings popover. Mirrors
// HelpPopoverSurfaceViewProps: fires once each time the popover opens so the
// share / language / appearance funnels have a denominator.
export interface SettingsPopoverSurfaceViewProps {
  page_name: 'home' | 'artifact';
  area: 'settings_popover';
}

export interface NewProjectModalSurfaceViewProps {
  page_name: 'home';
  area: 'new_project_modal';
  tab_name: TrackingNewProjectTab;
}

export interface PluginReplacementModalSurfaceViewProps {
  page_name: 'home';
  area: 'plugin_replacement_modal';
}

// Impression of the plugin detail modal opened from the home Community
// gallery. Fires once per open so the gallery → detail funnel has a
// denominator (card clicks) and a numerator (modal exposures).
export interface PluginDetailModalSurfaceViewProps {
  page_name: 'home';
  area: 'plugin_detail_modal';
  plugin_id?: string;
  plugin_type?: string;
}

// Impression of the "Import a plugin" modal on the Plugins page. Fires once
// per open so the import funnel has a denominator for source_tab / import
// clicks and plugin_import_result.
export interface PluginImportModalSurfaceViewProps {
  page_name: 'plugins';
  area: 'import_modal';
}

export interface DesignSystemsTemplatesModalSurfaceViewProps {
  page_name: 'design_systems';
  area: 'templates_modal';
  templates_id?: string;
  templates_type?: string;
}

// Impression of the hosted-AMR nudge under a failed run's error toast. Fires
// once per render of the toast for a non-AMR agent whose failure is a
// model/auth/quota error (`error_code` carries the specific class).
export interface RunFailedToastSurfaceViewProps {
  page_name: 'chat_panel';
  area: 'chat_panel';
  element: 'run_failed_toast';
  error_code: string;
  project_id: string;
  project_kind: TrackingProjectKind | null;
  conversation_id: string | null;
  assistant_message_id: string;
  run_id: string | null;
}

export interface AssistantFeedbackReasonPanelSurfaceViewProps {
  page_name: 'chat_panel';
  area: 'chat_panel';
  element: 'assistant_feedback_reason_panel';
  view_type: 'panel';
  project_id: string;
  project_kind: TrackingProjectKind | null;
  conversation_id: string | null;
  assistant_message_id: string;
  run_id: string;
  rating: 'positive' | 'negative';
}

// Exposure of the Questions tab discovery form — fires once per form
// occurrence when a parseable form first becomes visible (the tab is
// conditionally mounted, so emit sites dedupe by the occurrence key).
// Denominator for the questions_form click events above.
export interface QuestionsFormSurfaceViewProps {
  page_name: 'chat_panel';
  area: 'questions_form';
  project_id: string;
  form_id?: string;
}

// Impression of the Reference Board: fires once each time a blank Browser
// tab renders the start page, so chip/site clicks have a denominator.
export interface ReferenceBoardSurfaceViewProps {
  page_name: 'file_manager';
  area: 'reference_board';
  project_id?: string;
}

// Packaged updater UI surfaces. The download pipeline is intentionally
// silent; these fire only when a verified update is installable and when the
// user opens the final confirmation prompt.
export interface UpdateIndicatorSurfaceViewProps {
  page_name: 'home';
  area: 'update_indicator';
  app_version_before?: string;
  app_version_after?: string;
}

export interface UpdatePromptSurfaceViewProps {
  page_name: 'home';
  area: 'update_prompt';
  app_version_before?: string;
  app_version_after?: string;
}

export type SurfaceViewProps =
  | RunFailedToastSurfaceViewProps
  | HelpPopoverSurfaceViewProps
  | SettingsPopoverSurfaceViewProps
  | NewProjectModalSurfaceViewProps
  | PluginReplacementModalSurfaceViewProps
  | PluginDetailModalSurfaceViewProps
  | PluginImportModalSurfaceViewProps
  | DesignSystemsTemplatesModalSurfaceViewProps
  | AssistantFeedbackReasonPanelSurfaceViewProps
  | QuestionsFormSurfaceViewProps
  | UpdateIndicatorSurfaceViewProps
  | ReferenceBoardSurfaceViewProps
  | UpdatePromptSurfaceViewProps;

// ---- Result events -------------------------------------------------------

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
  design_system_version?: string;
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
  cache_token_source?: 'anthropic' | 'openai' | 'unavailable';
  queue_duration_ms?: number;
  pre_spawn_duration_ms?: number;
  process_spawn_duration_ms?: number;
  time_to_first_token_ms?: number;
  spawn_to_first_token_ms?: number;
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
  finalize_duration_ms?: number;
  total_duration_ms: number;
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
  // Scrubbed of the user's home dir before send.
  log_path: string | null;
  app_version: string | null;
  namespace: string;
  source: string;
  platform: string;
}

// ---- Discriminated union of all event payloads ---------------------------

export type AnalyticsEventPayload =
  | { event: 'packaged_runtime_failed'; props: PackagedRuntimeFailedProps }
  | { event: 'page_view'; props: PageViewProps }
  | { event: 'ui_click'; props: UiClickProps }
  | { event: 'surface_view'; props: SurfaceViewProps }
  | { event: 'project_create_result'; props: ProjectCreateResultProps }
  | { event: 'plugin_replacement_result'; props: PluginReplacementResultProps }
  | { event: 'plugin_import_result'; props: PluginImportResultProps }
  | { event: 'run_created'; props: RunCreatedProps }
  | { event: 'run_finished'; props: RunFinishedProps }
  | { event: 'langfuse_report_result'; props: LangfuseReportResultProps }
  | { event: 'run_retry_attempted'; props: RunRetryAttemptedProps }
  | { event: 'run_retry_finished'; props: RunRetryFinishedProps }
  | { event: 'update_install_result'; props: UpdateInstallResultProps }
  | { event: 'update_apply_observed'; props: UpdateApplyObservedProps }
  | { event: 'file_upload_result'; props: FileUploadResultProps }
  | { event: 'artifact_export_result'; props: ArtifactExportResultProps }
  | { event: 'artifact_deploy_result'; props: ArtifactDeployResultProps }
  | { event: 'feedback_submit_result'; props: FeedbackSubmitResultProps }
  | { event: 'assistant_feedback_click'; props: AssistantFeedbackClickProps }
  | {
      event: 'assistant_feedback_reason_view';
      props: AssistantFeedbackReasonViewProps;
    }
  | {
      event: 'assistant_feedback_reason_click';
      props: AssistantFeedbackReasonClickProps;
    }
  | {
      event: 'assistant_feedback_reason_submit';
      props: AssistantFeedbackReasonSubmitProps;
    }
  | { event: 'settings_view'; props: SettingsViewProps }
  | { event: 'settings_cli_test_result'; props: SettingsCliTestResultProps }
  | { event: 'settings_byok_test_result'; props: SettingsByokTestResultProps }
  | {
      event: 'settings_byok_models_fetch_result';
      props: SettingsByokModelsFetchResultProps;
    }
  | { event: 'settings_connector_auth_result'; props: SettingsConnectorAuthResultProps }
  | { event: 'amr_auth_result'; props: AmrAuthResultProps }
  | { event: 'onboarding_runtime_scan_result'; props: OnboardingRuntimeScanResultProps }
  | { event: 'onboarding_complete_result'; props: OnboardingCompleteResultProps }
  | {
      event: 'design_system_source_ingest_result';
      props: DesignSystemSourceIngestResultProps;
    }
  | { event: 'design_system_create_result'; props: DesignSystemCreateResultProps }
  | { event: 'design_system_review_result'; props: DesignSystemReviewResultProps }
  | { event: 'design_system_status_result'; props: DesignSystemStatusResultProps }
  | { event: 'design_system_apply_result'; props: DesignSystemApplyResultProps };

// ---- Enum mapping helpers (code ↔ CSV wire format) -----------------------

// Map the wire `ChatSessionMode` ('design' | 'chat') to the analytics enum.
// The composer's "Ask" mode is `chat` on the wire; analytics uses `ask` so
// the dashboards read in the product's own language. Anything that isn't a
// recognized design mode buckets into `ask` (the lighter default).
export function sessionModeToTracking(
  mode: string | null | undefined,
): TrackingSessionMode {
  return mode === 'design' ? 'design' : 'ask';
}

// Code `ProjectKind` from packages/contracts/src/api/projects.ts:
//   'prototype' | 'deck' | 'template' | 'other' | 'brand' | 'image' | 'video' | 'audio'
// Discriminates HyperFrames from generic AI video. A HyperFrames project is
// stored as `kind: 'video'` with `metadata.videoModel === 'hyperframes-html'`
// (the local HTML→MP4 renderer); callers pass that videoModel through so the
// analytics layer can split it out into its own `project_kind`. See the
// `'hyperframes'` member docblock on `TrackingProjectKind`.
const HYPERFRAMES_VIDEO_MODEL = 'hyperframes-html';

export function projectKindToTracking(
  kind: string | null | undefined,
  videoModel?: string | null,
): TrackingProjectKind | null {
  switch (kind) {
    case 'prototype':
      return 'prototype';
    case 'deck':
      return 'slide_deck';
    case 'template':
      return 'template';
    case 'other':
      return 'other';
    case 'image':
      return 'image';
    case 'video':
      // HyperFrames rides on the `video` kind; the local-render engine is the
      // only thing that distinguishes it, so route on videoModel here.
      return videoModel === HYPERFRAMES_VIDEO_MODEL ? 'hyperframes' : 'video';
    case 'audio':
      return 'audio';
    case 'brand':
      return 'brand';
    case 'live-artifact':
    case 'live_artifact':
      return 'live_artifact';
    default:
      return null;
  }
}

// Code `CreateTab` from apps/web/src/components/NewProjectPanel.tsx:
//   'prototype' | 'live-artifact' | 'deck' | 'template' | 'image' | 'video' | 'audio' | 'other'
export function createTabToTracking(tab: string): TrackingNewProjectTab {
  switch (tab) {
    case 'prototype':
      return 'prototype';
    case 'deck':
      return 'slide_deck';
    case 'template':
      return 'from_template';
    case 'live-artifact':
      return 'live_artifact';
    case 'image':
    case 'video':
    case 'audio':
      return 'media';
    case 'other':
      return 'other';
    default:
      return 'prototype';
  }
}

// Code `fidelity` is 'wireframe' | 'high-fidelity'; the CSV uses underscore.
export function fidelityToTracking(
  fidelity: string | null | undefined,
): TrackingFidelity {
  if (fidelity === 'wireframe') return 'wireframe';
  if (fidelity === 'high-fidelity') return 'high_fidelity';
  return 'not_applicable';
}

// Code `mode` ('daemon' | 'api') → CSV execution_mode.
export function executionModeToTracking(
  mode: string | null | undefined,
): TrackingExecutionMode {
  return mode === 'daemon' ? 'local_cli' : 'byok';
}

// Model id bucket for analytics. `'default'` represents "user did not pick
// a specific model — went with the agent's own default". This is a real,
// analysable bucket, distinct from `null/unknown` which previously masked
// both "no selection" and "join failed". Callers that have a non-empty
// model string pass it through unchanged.
export function modelIdForTracking(model: string | null | undefined): string {
  const trimmed = typeof model === 'string' ? model.trim() : '';
  return trimmed.length > 0 ? trimmed : 'default';
}

// Daemon agent id (apps/daemon/src/agents.ts) → CSV cli_provider_id.
export function agentIdToTracking(agentId: string | null | undefined): TrackingCliProviderId {
  switch (agentId) {
    case 'claude':
      return 'claude_code';
    case 'codex':
      return 'codex_cli';
    case 'devin':
      return 'devin_for_terminal';
    case 'gemini':
      return 'gemini_cli';
    case 'opencode':
      return 'opencode';
    case 'hermes':
      return 'hermes';
    case 'kimi':
      return 'kimi_cli';
    case 'cursor-agent':
      return 'cursor_agent';
    case 'qwen':
      return 'qwen_code';
    case 'qoder':
      return 'qoder_cli';
    case 'copilot':
      return 'github_copilot_cli';
    case 'pi':
      return 'pi';
    case 'kilo':
      return 'kilo';
    case 'amr':
      return 'amr';
    default:
      return 'other';
  }
}

export function feedbackAgentProviderIdToTracking(
  agentId: string | null | undefined,
): TrackingFeedbackProviderId {
  switch (agentId) {
    case 'anthropic-api':
      return byokProtocolToTracking('anthropic') ?? 'other';
    case 'openai-api':
      return byokProtocolToTracking('openai') ?? 'other';
    case 'azure-openai-api':
      return byokProtocolToTracking('azure') ?? 'other';
    case 'google-gemini-api':
      return byokProtocolToTracking('google') ?? 'other';
    case 'ollama-cloud-api':
      return byokProtocolToTracking('ollama') ?? 'other';
    case 'senseaudio-api':
      return byokProtocolToTracking('senseaudio') ?? 'other';
    default:
      return agentIdToTracking(agentId);
  }
}

// Code `apiProtocol` → v2 BYOK provider_id. The v1 wire values
// (azure / ollama / google) get the v2 spelling here.
export function byokProtocolToTracking(
  protocol: string | null | undefined,
): TrackingByokProviderId | null {
  switch (protocol) {
    case 'anthropic':
      return 'anthropic';
    case 'openai':
      return 'openai';
    case 'azure':
    case 'azure_openai':
      return 'azure_openai';
    case 'google':
    case 'google_gemini':
      return 'google_gemini';
    case 'ollama':
    case 'ollama_cloud':
      return 'ollama_cloud';
    case 'senseaudio':
      return 'senseaudio';
    default:
      return null;
  }
}

// Code `SettingsSection` from apps/web/src/components/SettingsDialog.tsx
// (the v0.8 settings sidebar). Sections that have no CSV counterpart still
// get emitted under the same event so dashboards can group them.
export function settingsSectionToTracking(
  section: string,
): TrackingSettingsArea {
  switch (section) {
    case 'execution':
      return 'configure_execution_mode';
    case 'instructions':
      return 'instructions';
    case 'media':
      return 'media_providers';
    case 'language':
      return 'language';
    case 'appearance':
      return 'appearance';
    case 'pet':
      return 'pets';
    case 'about':
      return 'about';
    case 'composio':
    case 'integrations':
    case 'connectors':
      return 'connectors';
    case 'mcpClient':
      return 'external_mcp';
    case 'mcp_server':
      return 'mcp_server';
    case 'orbit':
      return 'orbit';
    case 'skills':
      return 'skills';
    case 'designSystems':
      return 'design_systems';
    case 'critiqueTheater':
      return 'design_review';
    case 'projectLocations':
      return 'project_locations';
    case 'memory':
      return 'memory';
    case 'privacy':
      return 'privacy';
    case 'notifications':
      return 'notifications';
    case 'externalMcp':
      return 'external_mcp';
    default:
      return 'configure_execution_mode';
  }
}

// FileViewer renderer.id / file.kind → CSV artifact_kind.
export function artifactKindToTracking(args: {
  rendererId?: string | null;
  fileKind?: string | null;
}): TrackingArtifactKind {
  const { rendererId, fileKind } = args;
  if (rendererId === 'html' || rendererId === 'deck-html' || rendererId === 'react-component') {
    return 'html';
  }
  if (rendererId === 'markdown') return 'markdown';
  if (rendererId === 'svg') return 'image';
  if (fileKind === 'image' || fileKind === 'sketch') return 'image';
  if (fileKind === 'video') return 'video';
  if (fileKind === 'audio') return 'audio';
  if (
    fileKind === 'pdf' ||
    fileKind === 'document' ||
    fileKind === 'presentation' ||
    fileKind === 'spreadsheet'
  ) {
    return 'doc';
  }
  return 'unknown';
}

// Bytes → CSV file_size_bucket (CSV row 48). 1 MB == 1024 * 1024 bytes.
export function fileSizeBucketToTracking(bytes: number): TrackingFileSizeBucket {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return '0_1mb';
  if (mb < 10) return '1_10mb';
  if (mb < 100) return '10_100mb';
  return '100mb_plus';
}

// MIME / extension → CSV file_type.
export function fileTypeToTracking(args: {
  mime?: string | null;
  isFolder?: boolean;
  isZip?: boolean;
}): TrackingFileType {
  if (args.isFolder) return 'folder';
  if (args.isZip) return 'zip';
  const m = args.mime ?? '';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'pdf';
  return 'other';
}

// Pure helper deriving the v2 configure-state triplet from the execution
// config + detected agent list. Used both by the web client (to re-register
// the PostHog globals when the user switches mode / agent / BYOK
// credentials) and by the daemon `/api/runs` handler (so the
// authoritative run_created/finished captures carry consistent values).
//
// Inputs are intentionally narrow — caller passes only the bits that
// matter for analytics — so the helper has no coupling to the web's
// `AppConfig` shape or the daemon's `detectAgents` return type.
export interface DeriveConfigureGlobalsInput {
  // 'daemon' = Local CLI execution mode; 'api' = BYOK execution mode.
  // Anything else is treated as unknown.
  mode?: string | null;
  // Currently selected CLI agent id, if any.
  agentId?: string | null;
  // Available CLI agents detected on the user's machine. Only the
  // `available` flag is read; the helper does not care about ids.
  agents?: ReadonlyArray<{ id: string; available?: boolean }>;
  // Whether a BYOK key/url has been saved (web client only — daemon
  // can leave this undefined).
  byokConfigured?: boolean;
  // Whether the user has completed AMR (vela) sign-in. AMR ships with the
  // app, so authorization — not installation — is its "configured" signal.
  amrAuthorized?: boolean;
}

export function deriveConfigureGlobals(
  input: DeriveConfigureGlobalsInput,
): AnalyticsConfigureGlobals {
  const agents = input.agents ?? [];
  // The AMR runtime is bundled with the app, so its agent row must not
  // count as a user-configured local CLI: with it included every install
  // reports 'local_cli' and the 'amr'/'none' buckets can never appear.
  // AMR's configured signal is `amrAuthorized` (sign-in), not detection.
  const cliAgents = agents.filter((a) => a.id !== 'amr');
  const hasAvailableCli = cliAgents.some((a) => a.available === true);
  const selectedAgent = input.agentId
    ? agents.find((a) => a.id === input.agentId)
    : undefined;
  const selectedAgentAvailable = selectedAgent?.available === true;
  const byokConfigured = input.byokConfigured === true;
  const amrAuthorized = input.amrAuthorized === true;

  // 'api' mode means BYOK is the active execution path, so treat it as a
  // configured BYOK signal even when the caller cannot see the saved key
  // (the daemon never can). 'daemon' mode used to hardcode 'local_cli',
  // which made 'none' unreachable on desktop; the type now follows what
  // is actually configured, with mode only steering availability below.
  const byokSignal = byokConfigured || input.mode === 'api';
  let configureType: TrackingConfigureType;
  if (hasAvailableCli && byokSignal) {
    configureType = 'both';
  } else if (hasAvailableCli) {
    configureType = 'local_cli';
  } else if (byokSignal) {
    configureType = 'byok';
  } else if (amrAuthorized) {
    configureType = 'amr';
  } else {
    configureType = 'none';
  }

  let configureAvailability: TrackingConfigureAvailability;
  if (input.mode === 'daemon') {
    configureAvailability = selectedAgentAvailable
      ? 'available'
      : 'unavailable';
  } else if (input.mode === 'api') {
    configureAvailability = byokConfigured ? 'available' : 'unavailable';
  } else if (hasAvailableCli || byokConfigured || amrAuthorized) {
    configureAvailability = 'available';
  } else {
    configureAvailability = 'unknown';
  }

  // The single active runtime — NOT the configure cascade, so there is no
  // 'both'. The active execution path is steered by `mode` (the user's
  // selected execution mode) first, then the selected agent: the bundled
  // `amr` agent id means AMR cloud; otherwise local CLI when one is the
  // selected/available runtime. BYOK only surfaces when `mode === 'api'` or a
  // saved key is visible — the daemon never sees a key (mode is pinned to
  // 'daemon' there), so daemon-side run events rely on the web client's
  // run-request override to report 'byok'. Falls back through the same
  // capability signals as configure_type for the ambient (no-mode) case.
  let runtimeType: TrackingRuntimeType;
  if (input.mode === 'api') {
    // `api` mode IS the active BYOK execution path. It must win over a
    // remembered `agentId === 'amr'`: switching AMR → BYOK only flips
    // `config.mode` and leaves `config.agentId` as 'amr' (see App.tsx mode
    // switch), so checking agentId first would mislabel live BYOK runs as
    // amr_cloud.
    runtimeType = 'byok';
  } else if (input.agentId === 'amr') {
    runtimeType = 'amr_cloud';
  } else if (input.mode === 'daemon' && selectedAgentAvailable) {
    runtimeType = 'local_cli';
  } else if (hasAvailableCli) {
    runtimeType = 'local_cli';
  } else if (byokSignal) {
    runtimeType = 'byok';
  } else if (amrAuthorized) {
    runtimeType = 'amr_cloud';
  } else {
    runtimeType = 'none';
  }

  return {
    has_available_configure_cli: hasAvailableCli,
    configure_type: configureType,
    configure_availability: configureAvailability,
    runtime_type: runtimeType,
    // Independent per-path runnable flags (no cascade masking — see
    // AnalyticsConfigureGlobals). `cli_runnable` mirrors
    // `has_available_configure_cli`; `byok_runnable` uses the actually-saved
    // key signal (not the `mode === 'api'` fallback, which can be true with no
    // key yet); `amr_runnable` is sign-in.
    cli_runnable: hasAvailableCli,
    byok_runnable: byokConfigured,
    amr_runnable: amrAuthorized,
  };
}

// Normalize the "other" custom-reason free text for transport. Trims
// whitespace and returns empty string when the field is blank or the user
// didn't select the "other" option. Callers should pass the raw text only
// when `has_custom_reason` is true; the helper itself is permissive.
export function normalizeCustomReason(
  text: string | null | undefined,
): string {
  return (text ?? '').trim();
}

// ---- Design-system tracking helpers --------------------------------------

// `length` is a character count (after trimming). Buckets match the
// v2 doc literally so brand description / notes / feedback all share
// the same shape.
export function designSystemLengthBucket(
  text: string | null | undefined,
): TrackingDesignSystemLengthBucket {
  const length = (text ?? '').trim().length;
  if (length === 0) return '0';
  if (length <= 50) return '1_50';
  if (length <= 200) return '51_200';
  if (length <= 500) return '201_500';
  return '500_plus';
}

export function designSystemFolderCountBucket(
  count: number | null | undefined,
): TrackingDesignSystemFolderCountBucket {
  if (count === null || count === undefined || !Number.isFinite(count)) {
    return 'unknown';
  }
  if (count <= 0) return '0';
  if (count <= 10) return '1_10';
  if (count <= 50) return '11_50';
  if (count <= 200) return '51_200';
  return '200_plus';
}

export function designSystemTotalSizeBucket(
  bytes: number | null | undefined,
): TrackingDesignSystemTotalSizeBucket {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return 'unknown';
  }
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return '0_1mb';
  if (mb < 10) return '1_10mb';
  if (mb < 50) return '10_50mb';
  return '50mb_plus';
}

// Slugifies a DESIGN.md section header (`## Typography & Type Scale`)
// into a stable module id (`typography-type-scale`). Lowercases, strips
// punctuation, collapses whitespace to `-`. Empty input → 'unknown'.
export function designSystemModuleSlug(
  header: string | null | undefined,
): string {
  const trimmed = (header ?? '').trim().replace(/^#+\s*/, '');
  if (!trimmed) return 'unknown';
  return (
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9\s-]+/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'unknown'
  );
}

// Normalizes a question-form option value or form id into a snake_case
// tracking token: "Live artifact" → "live_artifact", "HyperFrames" →
// "hyperframes", "task-type" → "task_type". Values that slug to nothing
// (e.g. fully localized non-latin labels) collapse to 'unknown'.
export function questionsFormTrackingId(
  raw: string | null | undefined,
): string {
  const slug = (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return slug || 'unknown';
}

// Maps a DESIGN.md section slug to one of the six review module
// types. Heuristic keyword match; defaults to `'other'`.
export function designSystemModuleType(
  slug: string | null | undefined,
): TrackingDesignSystemModuleType {
  const s = (slug ?? '').toLowerCase();
  if (!s) return 'other';
  if (/(typography|type|font)/.test(s)) return 'typography';
  if (/(color|palette)/.test(s)) return 'colors';
  if (/(spacing|layout|grid|radius|shadow|elevation)/.test(s)) {
    return 'spacing';
  }
  if (/(component|button|input|form|icon|widget)/.test(s)) return 'components';
  if (/(brand|asset|logo|image|illustration)/.test(s)) return 'brand_assets';
  return 'other';
}

// Maps a repository URL host to the tracking enum. Unparseable URLs
// → `'unknown'`. Non-github/gitlab hosts → `'other'`.
export function designSystemRepoHostFromUrl(
  url: string | null | undefined,
): TrackingDesignSystemRepoHost {
  const raw = (url ?? '').trim();
  if (!raw) return 'unknown';
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host === 'github.com' || host.endsWith('.github.com')) return 'github';
    if (host === 'gitlab.com' || host.endsWith('.gitlab.com')) return 'gitlab';
    return 'other';
  } catch {
    return 'unknown';
  }
}
