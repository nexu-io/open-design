// Typed catalog for the v2 analytics schema. The wire format collapses to
// four core event names (`page_view`, `ui_click`, `surface_view`, plus the
// `*_result` family) and identifies the surface through the
// `page_name` + `area` + `element` triplet rather than the v1 per-page event
// names. Configure-state triplet (`has_available_configure_cli` /
// `configure_type` / `configure_availability`) is supplied via the global
// register in `apps/web/src/analytics/client.ts`; it does NOT appear in the
// per-event prop types below.

import type {
  TrackingConfigureAvailability,
  TrackingConfigureType,
} from './public-params.js';

// ---- Event names ---------------------------------------------------------

export type AnalyticsEventName =
  // Core triad
  | 'page_view'
  | 'ui_click'
  | 'surface_view'
  // Project lifecycle
  | 'project_create_result'
  | 'plugin_replacement_result'
  // Run lifecycle (daemon authoritative)
  | 'run_created'
  | 'run_finished'
  // Packaged updater lifecycle
  | 'update_install_result'
  | 'update_apply_observed'
  // File manager
  | 'file_upload_result'
  // Artifact
  | 'artifact_export_result'
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
  | 'audio'
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
// `kilo` over v1.
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

export type TrackingExportFormat =
  | 'pdf'
  | 'pptx'
  | 'zip'
  | 'html'
  | 'markdown'
  | 'template'
  | 'vercel'
  | 'cloudflare_pages';

export type TrackingResult = 'success' | 'failed';
export type TrackingRunResult = 'success' | 'failed' | 'cancelled';
export type TrackingExportResult = 'success' | 'failed' | 'cancelled';
export type TrackingTestResult = 'success' | 'failed' | 'timeout';

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
// welcome flow. The current first-run flow is Connect → About you; the
// design-system and generation literals remain in the contract for historical
// rows and a future reintroduction. Each step's `step_index` / `step_name`
// must match the enum pairs below. `onboarding_session_id` is generated once
// per session so dashboards can stitch the funnel.
export type TrackingOnboardingArea =
  | 'runtime'
  | 'about_you'
  | 'design_system'
  | 'generation_progress';

// Mixed string enum: numeric steps render as the strings `'1' | '2' | '3'`
// and the generation phase as `'progress'`. Mirrors the v2 doc literally.
export type TrackingOnboardingStepIndex = '1' | '2' | '3' | 'progress';

export type TrackingOnboardingStepName =
  | 'connect'
  | 'about_you'
  | 'design_system'
  | 'generation';

// How the user chose to connect to a model provider. `amr_cloud` is the
// hosted offering the doc references; today the UI ships only
// `local_cli` (Local Coding Agent) and `byok` (own model key). `none`
// stamps the click events fired before any runtime was picked.
export type TrackingOnboardingRuntimeType =
  | 'amr_cloud'
  | 'local_cli'
  | 'byok'
  | 'none';

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
// `skipped`: user clicked Skip from any step. `cancelled`: user closed
// the onboarding tab / navigated away without finishing.
// `failed`: terminal error before completion.
export type TrackingOnboardingCompletionResult =
  | 'completed'
  | 'skipped'
  | 'cancelled'
  | 'failed';

export type TrackingOnboardingCompletionType =
  | 'completed_with_design_system'
  | 'completed_without_design_system'
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
  | 'skip'
  | 'generate'
  // About you fields
  | 'role'
  | 'organization_size'
  | 'use_case'
  | 'hear_about_us'
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
  | 'skip'
  | 'generate'
  | 'select_option'
  | 'add_source'
  | 'upload_source'
  | 'show_access_methods';

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
    | 'model_dropdown'
    | 'open_execution_settings';
}

export interface SettingsPopoverClickProps {
  page_name: 'home';
  area: 'settings_popover';
  element:
    | 'follow_x'
    | 'join_discord'
    | 'language'
    | 'appearance'
    | 'use_everywhere'
    | 'settings';
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
    | 'attachment';
  // For plugin / action chips, the specific id (e.g. `prototype`, `from_figma`).
  chip_id?: string;
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
    | 'save';
  type_id?: 'orbit' | 'routines' | 'schedules' | 'live_artifacts';
  filter_id?: 'all' | 'scheduled' | 'running' | 'done';
}

// PLUGINS
export interface PluginsTopClickProps {
  page_name: 'plugins';
  area: 'plugins';
  element:
    | 'create_plugin'
    | 'import_plugin'
    | 'agent_context'
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

// INTEGRATIONS
export interface IntegrationsTabClickProps {
  page_name: 'integrations';
  area: 'integrations_tab';
  element: 'mcp' | 'connectors' | 'skills' | 'use_everywhere';
}

export interface IntegrationsMcpTabClickProps {
  page_name: 'integrations';
  area: 'mcp_tab';
  element: 'add_server' | 'saved';
}

export interface IntegrationsConnectorsTabClickProps {
  page_name: 'integrations';
  area: 'connectors_tab';
  element:
    | 'api_key_input'
    | 'save_key'
    | 'clear'
    | 'get_api_key'
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
    | 'resources_popover_trigger';
}

// Hosted-AMR nudge shown under a non-AMR agent's model/auth/quota failure.
// `go_amr` is the link that opens https://open-design.ai/amr.
export interface RunFailedToastClickProps {
  page_name: 'chat_panel';
  area: 'chat_panel';
  element: 'go_amr';
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

// ARTIFACT
export interface ArtifactToolbarClickProps {
  page_name: 'artifact';
  area: 'artifact_toolbar';
  element:
    | 'reload'
    | 'preview'
    | 'source'
    | 'tweaks'
    | 'draw'
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
    | 'share_dropdown'
    | 'settings';
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
  element: TrackingExportFormat;
  artifact_id: string;
  artifact_kind: TrackingArtifactKind;
  project_id: string;
  project_kind: TrackingProjectKind | null;
}

// FEEDBACK clicks (CSV rows 56 / 58)
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
  | 'external_mcp'
  | 'connectors'
  | 'orbit'
  | 'mcp_server'
  | 'language'
  | 'appearance'
  | 'notifications'
  | 'pets'
  | 'design_systems'
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
    | 'project_artifacts_manifest'
    | 'delete_my_data';
  anonymous_metrics_status?: 'on' | 'off';
  conversation_and_tool_content_status?: 'on' | 'off';
  project_artifacts_manifest_status?: 'on' | 'off';
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
  | PluginDetailClickProps
  | PluginLoopClickProps
  | DesignSystemsTopClickProps
  | DesignSystemsTemplateCardClickProps
  | DesignSystemsTemplatesModalClickProps
  | DesignSystemsTemplatesModalSharePopoverClickProps
  | IntegrationsTabClickProps
  | IntegrationsMcpTabClickProps
  | IntegrationsConnectorsTabClickProps
  | IntegrationsSkillsTabClickProps
  | IntegrationsUseEverywhereTabClickProps
  | ChatPanelClickProps
  | RunFailedToastClickProps
  | ChatPanelResourcesPopoverClickProps
  | FileManagerClickProps
  | ArtifactToolbarClickProps
  | TweaksPopoverClickProps
  | CommentPopoverClickProps
  | ArtifactHeaderClickProps
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
  | OnboardingClickProps;

// ---- surface_view --------------------------------------------------------

export interface HelpPopoverSurfaceViewProps {
  page_name: 'home';
  area: 'help_resources_popover';
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
  | NewProjectModalSurfaceViewProps
  | PluginReplacementModalSurfaceViewProps
  | DesignSystemsTemplatesModalSurfaceViewProps
  | AssistantFeedbackReasonPanelSurfaceViewProps
  | UpdateIndicatorSurfaceViewProps
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
    | TrackingDesignSystemRunEntryFrom;
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
  model_id: string | null;
  agent_provider_id: string | null;
  skill_id: string | null;
  mcp_id: string | null;
  token_count_source: TrackingTokenCountSource;
}

export interface RunFinishedProps extends Omit<RunCreatedProps, 'area'> {
  area: 'chat_panel' | 'design_system_generation';
  result: TrackingRunResult;
  error_code?: string;
  artifact_count: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  time_to_first_token_ms?: number;
  generation_duration_ms?: number;
  total_duration_ms: number;
  // DS-variant outcome fields. `design_system_created` is true when
  // the run produced a stored DESIGN.md; `preview_module_count` and
  // `missing_font_count` give the dashboard a coarse quality read
  // without inspecting the artifact contents.
  design_system_created?: boolean;
  preview_module_count?: number;
  missing_font_count?: number;
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
  channel: 'stable' | 'beta' | 'nightly' | 'preview';
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
  model_id: string | null;
  agent_provider_id: TrackingFeedbackProviderId | null;
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
  result: TrackingTestResult | 'not_ready';
  error_code?: string;
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

// ---- Discriminated union of all event payloads ---------------------------

export type AnalyticsEventPayload =
  | { event: 'page_view'; props: PageViewProps }
  | { event: 'ui_click'; props: UiClickProps }
  | { event: 'surface_view'; props: SurfaceViewProps }
  | { event: 'project_create_result'; props: ProjectCreateResultProps }
  | { event: 'plugin_replacement_result'; props: PluginReplacementResultProps }
  | { event: 'run_created'; props: RunCreatedProps }
  | { event: 'run_finished'; props: RunFinishedProps }
  | { event: 'update_install_result'; props: UpdateInstallResultProps }
  | { event: 'update_apply_observed'; props: UpdateApplyObservedProps }
  | { event: 'file_upload_result'; props: FileUploadResultProps }
  | { event: 'artifact_export_result'; props: ArtifactExportResultProps }
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
  | { event: 'settings_connector_auth_result'; props: SettingsConnectorAuthResultProps }
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

// Code `ProjectKind` from packages/contracts/src/api/projects.ts:
//   'prototype' | 'deck' | 'template' | 'other' | 'image' | 'video' | 'audio'
export function projectKindToTracking(
  kind: string | null | undefined,
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
      return 'video';
    case 'audio':
      return 'audio';
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
    default:
      return 'other';
  }
}

export function feedbackAgentProviderIdToTracking(
  agentId: string | null | undefined,
): TrackingFeedbackProviderId | null {
  switch (agentId) {
    case 'anthropic-api':
      return byokProtocolToTracking('anthropic');
    case 'openai-api':
      return byokProtocolToTracking('openai');
    case 'azure-openai-api':
      return byokProtocolToTracking('azure');
    case 'google-gemini-api':
      return byokProtocolToTracking('google');
    case 'ollama-cloud-api':
      return byokProtocolToTracking('ollama');
    case 'senseaudio-api':
      return byokProtocolToTracking('senseaudio');
    default:
      return agentId ? agentIdToTracking(agentId) : null;
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
    case 'mcp_server':
      return 'mcp_server';
    case 'orbit':
      return 'orbit';
    case 'skills':
      return 'skills';
    case 'designSystems':
      return 'design_systems';
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
}

export function deriveConfigureGlobals(
  input: DeriveConfigureGlobalsInput,
): {
  has_available_configure_cli: boolean;
  configure_type: TrackingConfigureType;
  configure_availability: TrackingConfigureAvailability;
} {
  const agents = input.agents ?? [];
  const hasAvailableCli = agents.some((a) => a.available === true);
  const selectedAgent = input.agentId
    ? agents.find((a) => a.id === input.agentId)
    : undefined;
  const selectedAgentAvailable = selectedAgent?.available === true;
  const byokConfigured = input.byokConfigured === true;

  let configureType: TrackingConfigureType;
  if (input.mode === 'daemon') {
    configureType = byokConfigured ? 'both' : 'local_cli';
  } else if (input.mode === 'api') {
    configureType = hasAvailableCli ? 'both' : 'byok';
  } else if (hasAvailableCli && byokConfigured) {
    configureType = 'both';
  } else if (hasAvailableCli) {
    configureType = 'local_cli';
  } else if (byokConfigured) {
    configureType = 'byok';
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
  } else if (hasAvailableCli || byokConfigured) {
    configureAvailability = 'available';
  } else {
    configureAvailability = 'unknown';
  }

  return {
    has_available_configure_cli: hasAvailableCli,
    configure_type: configureType,
    configure_availability: configureAvailability,
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
