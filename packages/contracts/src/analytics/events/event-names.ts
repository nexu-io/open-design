/**
 * @module analytics/events/event-names
 * Analytics event-name and page-name string-literal unions.
 */
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
  // Composer context sources — a reference-project / local-code linking
  // flow settled (success / cancelled / failed). The entry clicks are
  // `ui_click` `plus_pick` with `resource_kind: 'workspace'`.
  | 'context_link_result'
  | 'speaker_notes_save_result'
  // Artifact
  | 'artifact_export_result'
  | 'artifact_deploy_result'
  | 'file_version_restore_result'
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
  // AMR (hosted model) account auth result.
  | 'amr_auth_result'
  // Onboarding-only result events. UI clicks + page_views inside the
  // onboarding flow reuse the generic `ui_click` / `page_view` shapes
  // with `page_name=onboarding`; the three `onboarding_*` names below
  // capture lifecycle moments that don't fit a click or a view.
  | 'onboarding_runtime_scan_result'
  | 'onboarding_complete_result'
  // First-generation funnel (spec §11.1). Fire in Studio when the user, having
  // arrived from the Home recommendation, actually sends their first request
  // and when that first generation completes — the send-through and
  // completion rates the onboarding acceptance criteria track.
  | 'onboarding_prompt_prefilled'
  | 'onboarding_first_prompt_sent'
  | 'onboarding_first_generation_completed'
  | 'onboarding_completed'
  // Design-system lifecycle. Clicks + page_views inside DS surfaces
  // reuse `ui_click` / `page_view`; the five names below capture
  // ingest / create / review / status / picker-apply moments.
  | 'design_system_source_ingest_result'
  | 'design_system_create_result'
  | 'design_system_review_result'
  | 'design_system_status_result'
  | 'design_system_apply_result'
  // AI optimize (deep enrichment) of a programmatically-extracted DS.
  | 'design_system_enrich_result'
  // Manual save / PNG export from the Excalidraw sketch editor.
  | 'sketch_save_result'
  | 'sketch_export_result';

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

