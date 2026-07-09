/**
 * @module analytics/events/shared-enums
 * Shared tracking enums and value unions used across analytics events.
 */
// ---- Shared enums --------------------------------------------------------

export type TrackingProjectKind =
  | 'prototype'
  // `wireframe` / `mobile` / `live_artifact` are prototype-kind projects the
  // Home task rail (task_chip) offers as their own cards. They all reuse the
  // web-prototype seed (so the product `metadata.kind` stays `prototype`), but
  // the analytics dimension splits them out so a created project's
  // `project_kind` lines up 1:1 with the card the user picked:
  //   - `wireframe`     ← metadata.fidelity === 'wireframe'
  //   - `mobile`        ← metadata.platform/platformTargets is a mobile surface
  //   - `live_artifact` ← metadata.intent === 'live-artifact'
  // Derivation precedence (a prototype that matches several): live_artifact >
  // wireframe > mobile. See `projectKindToTracking`.
  | 'wireframe'
  | 'mobile'
  | 'live_artifact'
  | 'slide_deck'
  | 'template'
  // `document` is an `other`-kind project (resumes / reports / PDFs) the Home
  // `document` card creates. Tagged via `metadata.intent === 'document'` so it
  // splits out of generic `other` and matches its task_chip.
  | 'document'
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
  | 'chat_error_upgrade'
  | 'chat_balance_gate_upgrade'
  | 'home_balance_gate_upgrade'
  | 'chat_low_balance_warn_recharge'
  | 'home_low_balance_warn_recharge'
  | 'chat_balance_gate_sign_in'
  | 'home_balance_gate_sign_in'
  | 'chat_error_switch_retry_card'
  | 'generation_preview_authorize_retry'
  | 'generation_preview_recharge'
  | 'generation_preview_switch_retry_card'
  | 'settings_amr_upgrade'
  | 'inline_amr_upgrade'
  | 'avatar_amr_upgrade'
  | 'avatar_amr_agent_card';

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
  | 'entitlement_required'
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
  | 'amr_tier_upgrade_required'
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
export type TrackingRunLifecyclePhase =
  | 'queued'
  | 'prompt_build'
  | 'launch_preflight'
  | 'process_spawn'
  | 'stdin_write'
  | 'runtime_init'
  | 'first_token_wait'
  | 'stream_output'
  | 'tool_execution'
  | 'artifact_write'
  | 'finalize'
  | 'complete'
  | 'unknown';
export type TrackingRunPhaseTimingStatus =
  | 'complete'
  | 'partial'
  | 'missing';
export type TrackingArtifactWriteStatus =
  | 'none'
  | 'started'
  | 'completed'
  | 'failed';
export type TrackingArtifactWriteSource =
  | 'write_tool'
  | 'live_artifact'
  | 'design_system_file'
  | 'artifact_event'
  | 'unknown';
export type TrackingFirstModelEventType =
  | 'text_delta'
  | 'thinking_delta'
  | 'tool_use'
  | 'artifact';
export type TrackingRunFailureUserAction =
  | 'retry'
  | 'login'
  | 'recharge'
  | 'upgrade'
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
  | 'non_retryable_category'
  | 'unsafe_failure_stage'
  | 'missing_failure_signal'
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
