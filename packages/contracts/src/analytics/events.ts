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
  // File manager
  | 'file_upload_result'
  // Artifact
  | 'artifact_export_result'
  // Feedback
  | 'feedback_submit_result'
  // Settings
  | 'settings_view'
  | 'settings_cli_test_result'
  | 'settings_byok_test_result'
  | 'settings_connector_auth_result';

// ---- Pages ---------------------------------------------------------------

export type TrackingPageName =
  | 'home'
  | 'projects'
  | 'automations'
  | 'plugins'
  | 'design_systems'
  | 'integrations'
  | 'chat_panel'
  | 'file_manager'
  | 'artifact';

// Settings events use `page=settings` (mirrors the CSV). Kept distinct from
// `TrackingPageName` so the discriminator stays unambiguous between the
// product surfaces and the settings dialog.
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

export interface PageViewProps {
  page_name: TrackingPageName;
  // `source` is supplied only by the chat_panel page_view (CSV row 41), where
  // it records which surface launched the studio. The other page_view
  // emissions leave it undefined.
  source?:
    | 'new_project'
    | 'chat_composer'
    | 'recent_project'
    | 'projects_list'
    | 'template'
    | 'automation'
    | 'deeplink'
    | 'reload'
    | 'unknown';
}

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
    | 'action_chip';
  // For plugin / action chips, the specific id (e.g. `prototype`, `from_figma`).
  chip_id?: string;
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
    | 'filter_tab';
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
  page: TrackingSettingsPage;
  area: 'settings_sidebar';
  element: TrackingSettingsArea;
}

export interface SettingsExecutionModeTabClickProps {
  page: TrackingSettingsPage;
  area: 'configure_execution_mode';
  element: 'execution_mode_tab';
  action: 'switch_execution_mode';
  mode_before: TrackingExecutionMode;
  mode_after: TrackingExecutionMode;
}

export interface SettingsLocalCliClickProps {
  page: TrackingSettingsPage;
  area: 'configure_execution_mode_local_cli';
  element: 'test' | 'rescan' | 'cli_provider' | 'install' | 'docs';
  cli_provider_id?: TrackingCliProviderId;
  install_status?: 'installed' | 'not_installed' | 'unknown';
}

export interface SettingsByokProviderOptionClickProps {
  page: TrackingSettingsPage;
  area: 'configure_execution_mode_byok';
  element: 'byok_provider_option';
  action: 'select_byok_provider';
  provider_id: TrackingByokProviderId;
  is_selected: boolean;
}

export interface SettingsByokFieldClickProps {
  page: TrackingSettingsPage;
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
  page: TrackingSettingsPage;
  area: 'media_providers';
  element: 'reload' | 'key_input' | 'url_input' | 'clear';
  providers_id?: string;
  is_configured?: boolean;
}

export interface SettingsConnectorsClickProps {
  page: TrackingSettingsPage;
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
  page: TrackingSettingsPage;
  area: 'language';
  // Locale id, e.g. `english`, `bahasa_indonesia`, `zh_cn`.
  element: string;
}

export interface SettingsAppearanceClickProps {
  page: TrackingSettingsPage;
  area: 'appearance';
  element: 'system' | 'light' | 'dark' | 'accent_color';
  color?: string;
}

export interface SettingsNotificationsClickProps {
  page: TrackingSettingsPage;
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
  page: TrackingSettingsPage;
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
  page: TrackingSettingsPage;
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
  | ChatPanelResourcesPopoverClickProps
  | FileManagerClickProps
  | ArtifactToolbarClickProps
  | TweaksPopoverClickProps
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
  | SettingsPrivacyClickProps;

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

export type SurfaceViewProps =
  | HelpPopoverSurfaceViewProps
  | NewProjectModalSurfaceViewProps
  | PluginReplacementModalSurfaceViewProps
  | DesignSystemsTemplatesModalSurfaceViewProps
  | AssistantFeedbackReasonPanelSurfaceViewProps;

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

// run_created/finished merges CSV rows 17/18 (extended fields) and 44/45
// (current daemon-side authoritative emission). Daemon supplies token /
// duration data; entry surfaces propagate the optional context (entry_from,
// fidelity, etc.) via the create-run payload.
export interface RunCreatedProps {
  page_name: 'chat_panel';
  area: 'chat_composer';
  // Where the run was initiated from.
  entry_from?: 'new_project' | 'chat_composer';
  project_source?: TrackingProjectSource;
  project_id: string;
  conversation_id: string | null;
  run_id: string;
  project_kind: TrackingProjectKind | null;
  design_system_id?: string;
  design_system_source: TrackingDesignSystemSource;
  design_system_version?: string;
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
  area: 'chat_panel';
  result: TrackingRunResult;
  error_code?: string;
  artifact_count: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  time_to_first_token_ms?: number;
  generation_duration_ms?: number;
  total_duration_ms: number;
}

export interface FileUploadResultProps {
  page_name: 'file_manager';
  area: 'file_manager';
  project_id: string;
  file_count: number;
  file_type: TrackingFileType;
  file_size_bucket: TrackingFileSizeBucket;
  result: TrackingRunResult;
  error_code?: string;
}

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
  rating: 'positive' | 'negative';
  reason?: string;
  reason_count: number;
  has_custom_reason: boolean;
  custom_reason?: string;
  result: TrackingResult;
}

// SETTINGS view + result events (page=settings)
export interface SettingsViewProps {
  page: TrackingSettingsPage;
  area: TrackingSettingsArea;
}

export interface SettingsCliTestResultProps {
  page: TrackingSettingsPage;
  area: 'configure_execution_mode';
  cli_provider_id: TrackingCliProviderId;
  result: TrackingTestResult;
  error_code?: string;
  duration_ms: number;
}

export interface SettingsByokTestResultProps {
  page: TrackingSettingsPage;
  // CSV row 67 names this area `execution_model`; keep that spelling so the
  // wire format matches the doc.
  area: 'execution_model';
  provider_id: TrackingByokProviderId;
  result: TrackingTestResult | 'not_ready';
  error_code?: string;
  duration_ms: number;
}

export interface SettingsConnectorAuthResultProps {
  page: TrackingSettingsPage;
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
  | { event: 'file_upload_result'; props: FileUploadResultProps }
  | { event: 'artifact_export_result'; props: ArtifactExportResultProps }
  | { event: 'feedback_submit_result'; props: FeedbackSubmitResultProps }
  | { event: 'settings_view'; props: SettingsViewProps }
  | { event: 'settings_cli_test_result'; props: SettingsCliTestResultProps }
  | { event: 'settings_byok_test_result'; props: SettingsByokTestResultProps }
  | { event: 'settings_connector_auth_result'; props: SettingsConnectorAuthResultProps };

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
