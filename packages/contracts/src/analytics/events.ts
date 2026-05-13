// Typed catalog for the 17 P0 analytics events. Per-event prop shapes mirror
// the CSV tracking doc (Open Design 埋点文档 1.0). Enums map code-side values
// to the CSV's wire format via the `…ToTracking…` helpers below — when the
// product team finalizes BLOCKING decisions (see
// specs/change/20260511-posthog-analytics/tracking-doc-issues.md), revise
// those tables in one place.

// P0 events implemented in this branch. Two of the original CSV P0 events
// (project_open_result, settings_click byok_provider_option) are out of
// scope because the matching UI surfaces don't exist in this codebase —
// see specs/change/20260511-posthog-analytics/tracking-doc-issues.md.
export type AnalyticsEventName =
  | 'app_launch'
  | 'home_view'
  | 'home_click'
  | 'project_create_result'
  | 'settings_view'
  | 'settings_click'
  | 'settings_cli_test_result'
  | 'settings_byok_test_result'
  | 'studio_view'
  | 'studio_click'
  | 'run_created'
  | 'run_finished'
  | 'artifact_export_result';

// ---- Enums shared across events (CSV wire format) ------------------------

export type TrackingProjectKind =
  | 'prototype'
  | 'slide_deck'
  | 'template'
  | 'live_artifact'
  | 'image'
  | 'video'
  | 'audio';

export type TrackingSourceTab =
  | 'prototype'
  | 'slide_deck'
  | 'from_template'
  | 'live_artifact'
  | 'image'
  | 'video'
  | 'audio';

export type TrackingFidelity = 'wireframe' | 'high_fidelity' | 'not_applicable';

export type TrackingExecutionMode = 'local_cli' | 'byok';

export type TrackingConfiguredProviderType =
  | 'local_cli'
  | 'byok'
  | 'both'
  | 'none'
  | 'unknown';

export type TrackingExecutionAvailability =
  | 'available'
  | 'unavailable'
  | 'unknown';

export type TrackingPlatform = 'web' | 'desktop';

export type TrackingLaunchSource =
  | 'direct'
  | 'deeplink'
  | 'reload'
  | 'unknown';

export type TrackingTopTabId =
  | 'designs'
  | 'examples'
  | 'design_systems'
  | 'image_templates'
  | 'video_templates';

export type TrackingActiveSection =
  | 'execution_model'
  | 'media_providers'
  | 'language'
  | 'appearance'
  | 'pets'
  | 'about'
  // Worktree-branch sections that have no CSV counterpart yet. Emit them
  // verbatim so PostHog dashboards can group them once the CSV catches up
  // (tracking-doc-issues.md §2.6).
  | 'connectors'
  | 'mcp_client'
  | 'orbit'
  | 'routines'
  | 'integrations'
  | 'skills'
  | 'design_systems'
  | 'memory'
  | 'privacy'
  | 'notifications';

export type TrackingCliProviderId =
  | 'claude_code'
  | 'codex_cli'
  | 'devin_terminal'
  | 'gemini_cli'
  | 'opencode'
  | 'hermes'
  | 'kimi_cli'
  | 'cursor_agent'
  | 'qwen_code'
  | 'github_copilot_cli'
  | 'pi'
  | 'other';

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

export type TrackingRunResult = 'success' | 'failed' | 'cancelled';
export type TrackingCreateResult = 'success' | 'failed';
export type TrackingExportResult = 'success' | 'failed' | 'cancelled';

export type TrackingTokenCountSource =
  | 'provider_usage'
  | 'estimated'
  | 'unknown';

// ---- Per-event property shapes -------------------------------------------

export interface AppLaunchProps {
  page: 'app';
  launch_source: TrackingLaunchSource;
  platform: TrackingPlatform;
}

export interface HomeViewPageProps {
  page: 'home';
  has_available_cli: boolean;
  has_available_byok: boolean;
  configured_provider_type: TrackingConfiguredProviderType;
  execution_availability: TrackingExecutionAvailability;
}

export interface HomeViewAssetPanelProps {
  page: 'home';
  area: 'asset_panel';
  element: 'tab_content';
  view_type: 'tab_content';
  target_id: TrackingTopTabId;
  result_count: number;
  is_empty: boolean;
}

export interface HomeClickCreateButtonProps {
  page: 'home';
  area: 'create_panel';
  element: 'create_button';
  action: 'create_project';
  source_tab: TrackingSourceTab;
  project_kind: TrackingProjectKind;
  has_project_name: boolean;
}

export interface ProjectCreateResultProps {
  page: 'home';
  area: 'create_panel';
  action_source: 'create_button' | 'import_claude_design_zip' | 'open_folder';
  project_id: string | null;
  project_kind: TrackingProjectKind | null;
  creation_source: 'blank' | 'template' | 'zip' | 'folder';
  fidelity: TrackingFidelity;
  result: TrackingCreateResult;
  error_code?: string;
}

export interface SettingsViewProps {
  page: 'settings';
  area: 'settings_panel';
  element: 'page';
  view_type: 'page';
  active_section: TrackingActiveSection;
  execution_mode: TrackingExecutionMode;
  has_available_cli: boolean;
  selected_cli_id?: TrackingCliProviderId;
}

export interface SettingsClickExecutionModeTabProps {
  page: 'settings';
  area: 'execution_model';
  element: 'execution_mode_tab';
  action: 'switch_execution_mode';
  mode_before: TrackingExecutionMode;
  mode_after: TrackingExecutionMode;
  // BYOK sub-protocol is captured separately so the 2-value CSV enum stays
  // intact; a CSV revision could fold this back in later.
  byok_protocol_after?: 'anthropic' | 'openai';
}

export interface SettingsClickCliProviderCardProps {
  page: 'settings';
  area: 'execution_model';
  element: 'cli_provider_card';
  action: 'select_cli_provider';
  cli_provider_id: TrackingCliProviderId;
  install_status: 'installed' | 'not_installed' | 'unknown';
  is_selected: boolean;
}

export interface SettingsClickByokProviderOptionProps {
  page: 'settings';
  area: 'execution_model';
  element: 'byok_provider_option';
  action: 'select_byok_provider';
  // Code's `apiProtocol` matches the BYOK protocol chip Settings UI 1:1.
  // Tracking doc names azure/google/ollama as azure_openai/google_gemini/
  // ollama_cloud — we forward the code value verbatim and let dashboards
  // map; see tracking-doc-issues.md §2.5.
  provider_id: 'anthropic' | 'openai' | 'azure' | 'ollama' | 'google';
  // True when the clicked chip was already the active protocol (no-op
  // toggle); false when the click switches protocol.
  is_selected: boolean;
}

export interface SettingsClickByokFieldProps {
  page: 'settings';
  area: 'execution_model';
  element: 'byok_field';
  action: 'focus_byok_field';
  field_id: 'api_key' | 'base_url' | 'model';
  // Code's `apiProtocol` is wider than the CSV's BYOK provider enum
  // (anthropic|openai|azure|ollama|google). We forward the code value
  // verbatim so dashboards can group by the actual protocol; the CSV enum
  // is a strict subset the product team can revise.
  provider_id: 'anthropic' | 'openai' | 'azure' | 'ollama' | 'google';
  has_value: boolean;
}

export interface SettingsCliTestResultProps {
  page: 'settings';
  area: 'execution_model';
  cli_provider_id: TrackingCliProviderId;
  result: 'success' | 'failed' | 'timeout';
  error_code?: string;
  duration_ms: number;
}

export interface SettingsByokTestResultProps {
  page: 'settings';
  area: 'execution_model';
  provider_id: 'anthropic' | 'openai' | 'azure' | 'ollama' | 'google';
  result: 'success' | 'failed' | 'timeout';
  error_code?: string;
  duration_ms: number;
}

export interface StudioViewChatPanelProps {
  page: 'studio';
  area: 'chat_panel';
  element: 'chat_tab';
  view_type: 'panel';
  source: 'create_project' | 'template' | 'open_project';
  conversation_id: string | null;
}

export interface StudioClickChatComposerProps {
  page: 'studio';
  area: 'chat_composer';
  element:
    | 'prompt_template_card'
    | 'chat_composer_input'
    | 'composer_settings_button'
    | 'attachment_button'
    | 'send_button';
  action: 'click_composer_control';
  user_query_tokens: number;
  has_attachment: boolean;
}

export interface RunCreatedProps {
  page: 'studio';
  area: 'chat_composer';
  project_id: string;
  conversation_id: string | null;
  run_id: string;
  project_kind: TrackingProjectKind | null;
  design_system_id?: string;
  design_system_source:
    | 'default'
    | 'user_selected'
    | 'template_inherited'
    | 'project_saved'
    | 'not_applicable'
    | 'unknown';
  design_system_version?: string;
  has_attachment: boolean;
  user_query_tokens: number;
  model_id: string | null;
  agent_provider_id: string | null;
  skill_id: string | null;
  mcp_id: string | null;
  token_count_source: TrackingTokenCountSource;
}

export interface RunFinishedProps extends Omit<RunCreatedProps, 'area'> {
  // CSV specifies `area=chat_panel` for run_finished — note the divergence
  // from run_created's chat_composer (see tracking-doc-issues.md §4.3).
  area: 'chat_panel';
  result: TrackingRunResult;
  error_code?: string;
  artifact_count: number;
  // Token sub-fields (user_query/system_prompt/memory/context/attachment_context/
  // other_input) are omitted in v1; daemon parser does not expose them yet.
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  time_to_first_token_ms?: number;
  generation_duration_ms?: number;
  total_duration_ms: number;
}

export interface StudioViewArtifactProps {
  page: 'studio';
  area: 'artifact';
  element: 'artifact_view';
  view_type: 'artifact';
  // Anonymized stable id: sha256(projectId + ':' + fileName).slice(0,16) —
  // never the raw filename.
  artifact_id: string;
  artifact_kind: TrackingArtifactKind;
  project_id: string;
  project_kind: TrackingProjectKind;
}

export interface StudioClickShareOptionProps {
  page: 'studio';
  area: 'app_header';
  artifact_id: string;
  element: 'share_option';
  action: 'select_share_option';
  share_context: 'artifact';
  export_format: TrackingExportFormat;
  project_id: string;
  project_kind: TrackingProjectKind;
}

export interface ArtifactExportResultProps {
  page: 'studio';
  area: 'app_header';
  artifact_id: string;
  project_id: string;
  project_kind: TrackingProjectKind;
  export_format: TrackingExportFormat;
  result: TrackingExportResult;
  error_code?: string;
  export_duration_ms: number;
}

// ---- Discriminated union of all P0 event payloads ------------------------

export type AnalyticsEventPayload =
  | { event: 'app_launch'; props: AppLaunchProps }
  | { event: 'home_view'; props: HomeViewPageProps | HomeViewAssetPanelProps }
  | { event: 'home_click'; props: HomeClickCreateButtonProps }
  | { event: 'project_create_result'; props: ProjectCreateResultProps }
  | { event: 'settings_view'; props: SettingsViewProps }
  | {
      event: 'settings_click';
      props:
        | SettingsClickExecutionModeTabProps
        | SettingsClickCliProviderCardProps
        | SettingsClickByokProviderOptionProps
        | SettingsClickByokFieldProps;
    }
  | { event: 'settings_cli_test_result'; props: SettingsCliTestResultProps }
  | { event: 'settings_byok_test_result'; props: SettingsByokTestResultProps }
  | { event: 'studio_view'; props: StudioViewChatPanelProps | StudioViewArtifactProps }
  | { event: 'studio_click'; props: StudioClickChatComposerProps | StudioClickShareOptionProps }
  | { event: 'run_created'; props: RunCreatedProps }
  | { event: 'run_finished'; props: RunFinishedProps }
  | { event: 'artifact_export_result'; props: ArtifactExportResultProps };

// ---- Enum mapping helpers (code ↔ CSV wire format) -----------------------
//
// These translate the code-side values (which use hyphens, different ids,
// and richer enums) to the CSV's underscored wire format. When the product
// team revises the CSV per tracking-doc-issues.md, revise these in one
// place.

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
      return 'live_artifact';
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    default:
      return null;
  }
}

// Code `CreateTab` from apps/web/src/components/NewProjectPanel.tsx:
//   'prototype' | 'live-artifact' | 'deck' | 'template' | 'image' | 'video' | 'audio' | 'other'
export function createTabToTracking(tab: string): TrackingSourceTab {
  switch (tab) {
    case 'prototype':
      return 'prototype';
    case 'deck':
      return 'slide_deck';
    case 'template':
      return 'from_template';
    case 'live-artifact':
    case 'other':
      return 'live_artifact';
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
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

// Code top-tab from apps/web/src/components/EntryView.tsx:
//   'designs' | 'templates' | 'design-systems' | 'image-templates' | 'video-templates'
// Note: the entry tab labelled 'Templates' in this branch corresponds to
// what the CSV calls 'examples' — the surface that was historically the
// curated examples gallery.
export function topTabToTracking(tab: string): TrackingTopTabId {
  switch (tab) {
    case 'designs':
      return 'designs';
    case 'templates':
    case 'examples':
      return 'examples';
    case 'design-systems':
      return 'design_systems';
    case 'image-templates':
      return 'image_templates';
    case 'video-templates':
      return 'video_templates';
    default:
      return 'designs';
  }
}

// Code `SettingsSection` from apps/web/src/components/SettingsDialog.tsx
// (16 sections in this worktree branch). Sections that have no CSV
// counterpart still get emitted under the same event so dashboards can
// group them once the CSV catches up.
export function settingsSectionToTracking(
  section: string,
): TrackingActiveSection {
  switch (section) {
    case 'execution':
      return 'execution_model';
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
      return 'integrations';
    case 'mcpClient':
      return 'mcp_client';
    case 'orbit':
      return 'orbit';
    case 'routines':
      return 'routines';
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
    default:
      return 'execution_model';
  }
}

// Code `mode` ('daemon' | 'api') → CSV execution_mode.
export function executionModeToTracking(
  mode: string | null | undefined,
): TrackingExecutionMode {
  return mode === 'daemon' ? 'local_cli' : 'byok';
}

// Daemon agent id (apps/daemon/src/agents.ts) → CSV cli_provider_id. `kiro`
// is in code but not CSV → 'other'; CSV `qoder_cli` is reserved for future.
export function agentIdToTracking(agentId: string | null | undefined): TrackingCliProviderId {
  switch (agentId) {
    case 'claude':
      return 'claude_code';
    case 'codex':
      return 'codex_cli';
    case 'devin':
      return 'devin_terminal';
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
    case 'copilot':
      return 'github_copilot_cli';
    case 'pi':
      return 'pi';
    default:
      return 'other';
  }
}

// FileViewer renderer.id / file.kind → CSV artifact_kind (see
// apps/web/src/components/FileViewer.tsx:67-119 for the dispatch table).
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
