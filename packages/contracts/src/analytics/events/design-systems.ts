/**
 * @module analytics/events/design-systems
 * Design-system analytics enums and lifecycle result prop types.
 */
import type { TrackingProjectKind } from './shared-enums.js';
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
  // Preset-brand picker opened from the create form ("Start from a brand").
  // A brand here is one *source* for a design system, not a separate object.
  | 'preset_brand_picker'
  // AI-optimize (deep enrichment) banner on a DS-as-project.
  | 'design_system_enrich'
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
  // Created from inside a project's canvas / file workspace.
  | 'project_canvas'
  // Created from the Library surface.
  | 'library'
  | 'unknown';

// Origin of the design system itself. NOT the same field as
// `TrackingDesignSystemSource` on run_created/run_finished, which records
// *how the run picked* its DS. v2 doc reuses the field name
// `design_system_source` for both contexts; the value sets are disjoint.
export type TrackingDesignSystemOrigin =
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

export type TrackingDesignSystemStatus =
  | 'draft'
  | 'generating'
  | 'ready'
  | 'published'
  | 'default'
  | 'failed'
  | 'archived'
  | 'unknown';

// Whether a design system is an official/preset one or user-built. Derived
// from the design_system_id shape: `user:<id>` => custom, everything else
// (registry-backed presets) => official. `unknown` when no DS is in play.
export type TrackingDesignSystemKind = 'official' | 'custom' | 'unknown';

// Which surface initiated an edit of an existing design system. All of the
// non-`direct_module` surfaces ultimately route through the agent (a run);
// `direct_module` is an in-panel module button (some direct, some agent-routed).
export type TrackingDesignSystemEditSurface =
  | 'chat'
  | 'edit'
  | 'draw'
  | 'comment'
  | 'mark'
  | 'direct_module';

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
  | 'composer_picker'
  | 'project_settings'
  // Created from inside a project's canvas / file workspace.
  | 'project_canvas'
  // Created from the Library surface.
  | 'library'
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
  // Every source actually used, comma-joined (e.g. `source_url,local_code`),
  // so multi-source creates aren't flattened to the single `mixed` value of
  // `design_system_source`. Mirrors the multi-value convention of
  // target_platforms/connectors. See tracking spec dimension dict + comment ②.
  ds_source_origins?: string;
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

// AI optimize (deep enrichment) of a programmatically-extracted design system.
// `design_system_enrich` click = the user pressed "AI Optimize" on the banner;
// `design_system_enrich_result` = the enrichment run settled. Together they
// give the AI-conversion rate (clicked ÷ programmatic creates) and, with
// ProjectMetadata.enrichmentStatus, the programmatic-vs-ai_refined comparison.
export interface DesignSystemEnrichClickProps {
  page_name: 'design_system_project';
  area: 'design_system_enrich';
  element: 'ai_optimize';
  design_system_id?: string;
  project_kind?: TrackingProjectKind | null;
}

export interface DesignSystemEnrichResultProps {
  page_name: 'design_system_project';
  area: 'design_system_enrich';
  result: 'success' | 'failed' | 'cancelled';
  design_system_id?: string;
  project_id?: string;
  run_id?: string;
  error_code?: string;
  duration_ms?: number;
}

