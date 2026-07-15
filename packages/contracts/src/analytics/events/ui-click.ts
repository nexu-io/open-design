/**
 * @module analytics/events/ui-click
 * ui_click event prop types and their union.
 */
import type { DesignSystemEnrichClickProps, TrackingDesignSystemEditSurface } from './design-systems.js';
import type { TrackingPageName, TrackingSettingsPage } from './event-names.js';
import type { OnboardingClickProps, TrackingOnboardingFirstLoopStep, TrackingOnboardingProductType, TrackingOnboardingRole, TrackingOnboardingUseCase } from './onboarding.js';
import type { TrackingAmrEntrySource, TrackingArtifactKind, TrackingByokProviderId, TrackingCliProviderId, TrackingExecutionMode, TrackingExportFormat, TrackingFeedbackProviderId, TrackingNewProjectTab, TrackingProjectKind, TrackingProjectSource } from './shared-enums.js';
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
  element: 'star' | 'execution_settings' | 'use_everywhere' | 'workspace_teams' | 'settings';
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
// the "Share Open Design" social grid, the Discord / social follow links and
// the Settings → details entry. The same popover is mounted both on the home
// header and the in-project artifact header, hence the two-value page_name.
export interface SettingsPopoverClickProps {
  page_name: 'home' | 'artifact';
  area: 'settings_popover';
  element:
    | 'language_select'
    | 'appearance'
    | 'share_channel'
    | 'workspace_teams'
    | 'join_discord'
    | 'follow_x'
    | 'follow_threads'
    | 'open_youtube'
    | 'follow_instagram'
    | 'follow_linkedin'
    | 'follow_xiaohongshu'
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
    // Opening the "Import from library" picker from the home composer's "+"
    // menu. Mirrors the chat_panel composer's `element: 'library'`.
    | 'library'
    // Opening the "Import from Figma" modal from the home composer's "+" menu
    // (offline .fig decode). Mirrors the chat_panel composer's `figma_import`.
    | 'figma_import'
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
    // The "Open as project" action on an example card — one-click remix that
    // creates and enters a project seeded from the example instead of only
    // loading it into the composer. Same `chip_id` / `plugin_id` / `plugin_type`
    // attribution as `example_prompt`.
    | 'example_open_project'
    // The "+" menu on the home composer (same control as the in-project
    // composer's `plus_*` events): opening it, inserting a
    // connector/plugin/skill/mcp mention (`resource_kind` + `resource_id`), or
    // jumping to the add-resource surface (`resource_kind`).
    | 'plus_menu_open'
    | 'plus_pick'
    | 'plus_add'
    // A "+"-menu submenu flyout opened (hover or click) — the funnel head
    // for "opened the list but picked nothing". `resource_kind` carries
    // which list (connector / plugin / skill / mcp). The Design-toolbox row
    // has its own `design_toolbox_open` and is excluded.
    | 'plus_submenu_open'
    // First keystroke in a submenu flyout's search box, once per open
    // (`resource_kind`: plugin / skill / mcp). The query text is never sent.
    | 'plus_search'
    // The "how to download a .fig" help row beside the "+" menu's Figma
    // import entry. Mirrors the chat_panel composer's `figma_help`.
    | 'figma_help'
    // Opening the design-system picker from the "+" menu's Designs group
    // (programmatically clicks the hero DS trigger). The actual apply stays
    // `design_system_apply_result` on the picker itself.
    | 'design_system_open'
    // Removing a staged context chip above the composer (plugin / MCP /
    // connector / workspace chips). Mirrors the chat_panel composer's
    // `context_remove` so one dashboard counts removals across surfaces.
    | 'context_remove';
  // For `plus_pick` / `plus_add` / `context_remove`: which kind of resource
  // (and its id on pick/remove). `workspace` covers the reference-project /
  // local-code context sources (`resource_id`: 'reference-project' or
  // 'local-code' on pick; the staged chip id on remove — mirrors the
  // chat_panel composer so cross-surface funnels line up).
  resource_kind?: 'connector' | 'plugin' | 'skill' | 'mcp' | 'workspace';
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

// Personalized first-run recommendation on Home (spec §7). One card, three
// actions: `enter_studio` (accept → open Studio with the first request
// pre-filled), `change` (换一个 → cycle to another starter in the same path),
// `browse_all` (浏览全部类型 → abandon the recommendation for the generic
// entry). `recommendation_id` is the stable starter id; `role` / `use_cases`
// echo the survey answers that produced the recommendation.
export interface HomeRecommendationClickProps {
  page_name: 'home';
  area: 'onboarding_recommendation';
  element: 'enter_studio' | 'change' | 'browse_all';
  product_type: TrackingOnboardingProductType;
  recommendation_id: string;
  role?: TrackingOnboardingRole;
  use_cases?: TrackingOnboardingUseCase[];
}

// One-time first-generation hint in Studio (spec §8.3). A single lightweight
// note shown when a new user's first previewable artifact appears, pointing
// them at view / edit / export. `open_artifact` = user acted on it; `dismiss` =
// user closed it. `hint_type` is fixed today but kept as a field so a future
// first-run hint can reuse the shape.
export interface StudioOnboardingHintClickProps {
  page_name: 'chat_panel';
  area: 'onboarding_first_artifact_hint';
  element: 'open_artifact' | 'dismiss';
  hint_type: 'view_artifact';
  // First-loop stage the hint belongs to and, for feature-specific hints
  // (spec §8.7), the capability being surfaced. Optional so the current
  // single view-stage hint stays source-compatible.
  studio_stage?: TrackingOnboardingFirstLoopStep;
  feature_id?: string;
}

export interface UpdateIndicatorClickProps {
  page_name: 'home';
  area: 'update_indicator' | 'update_prompt';
  element: 'ready_indicator' | 'later' | 'install_update';
  action: 'open_prompt' | 'dismiss' | 'install';
  app_version_before?: string;
  app_version_after?: string;
}

export interface WhatsNewPopupClickProps {
  page_name: 'home';
  area: 'whats_new_popup';
  element: 'see_whats_new' | 'dismiss';
  action: 'open_link' | 'dismiss';
  app_version: string;
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
  element: 'rename' | 'duplicate' | 'delete';
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
    | 'source_url_add'
    | 'figma_url_add'
    | 'show_access_methods'
    | 'browse_folder'
    | 'upload_fig'
    | 'add_assets'
    // Opens the preset-brand picker ("Start from a brand").
    | 'start_from_brand'
    | 'continue_to_generation'
    | 'back';
  // State *after* the toggle; only sent with element=show_access_methods.
  methods_expanded?: boolean;
}

// Preset-brand picker ("Start from a brand") on the /design-systems/create
// form. Picking a brand adds its site as a *source* for the design system —
// brand is an input here, not a separate object. Privacy: never send the raw
// brand domain/URL; only the curated category + quick-pick flag.
export interface DesignSystemsPresetBrandPickerClickProps {
  page_name: 'design_systems';
  area: 'preset_brand_picker';
  element: 'brand_pick' | 'quick_pick' | 'close';
  // Curated category bucket of the picked brand (e.g. `software`, `finance`).
  // Only on brand_pick / quick_pick. Never the domain.
  preset_brand_category?: string;
  // True when picked from the quick "popular brands" row rather than search.
  is_quick_pick?: boolean;
}

export interface DesignSystemsPresetBrandPickerSurfaceViewProps {
  page_name: 'design_systems';
  area: 'preset_brand_picker';
}

// Direct in-panel edits of an existing design system (tracking spec §3.6,
// E3). Covers the DS list general ops (edit-with-agent / refresh / download),
// the DesignKitView module buttons (logo / typography / palette / images /
// kit), and the brand preview card. `edit_surface` is always `direct_module`
// here; agent-routed edits (chat / draw / edit / comment / mark) ride on
// run_created.edit_surface instead. Never carries artifact content/URLs.
export interface DesignSystemEditClickProps {
  page_name: 'design_systems' | 'design_system_project';
  area: 'design_system_edit';
  element:
    | 'edit_with_agent'
    | 'refresh'
    | 'download'
    | 'logo_upload'
    | 'logo_delete'
    | 'design_md_copy'
    | 'design_md_edit'
    | 'design_md_upload'
    | 'font_upload'
    | 'color_edit'
    | 'image_upload'
    | 'image_delete'
    | 'kit_refresh'
    | 'kit_download'
    | 'kit_import'
    | 'kit_reset'
    | 'kit_open'
    | 'brand_card_use_in_chat'
    | 'brand_card_open_project'
    | 'brand_card_delete';
  module?:
    | 'logo'
    | 'design_md'
    | 'typography'
    | 'palette'
    | 'images'
    | 'kit'
    | 'brand_card'
    | 'general';
  edit_surface?: TrackingDesignSystemEditSurface;
  artifact_kind?: 'design_system';
  design_system_id?: string;
  project_id?: string;
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
    | 'library'
    // Opening the "Import from Figma" modal from the chat composer's "+" menu
    // (offline .fig decode). Sits beside `library` as a sibling import source.
    | 'figma_import'
    // The "how to download a .fig" help row beside `figma_import` in the
    // "+" menu's Designs group. Mirrors the home composer's `figma_help`.
    | 'figma_help'
    | 'send'
    | 'mention_popover_trigger'
    | 'resources_popover_trigger';
}

// Composer mode the user sends prompts in. `ask` is the lighter Q&A mode
// (the wire / DB value is `chat`; the UI labels it "Ask"); `design` is the
// full design-agent run. Map the wire `chat` → `ask` at every emit site via
// `sessionModeToTracking` so analytics speaks the product's language.
export type TrackingSessionMode = 'ask' | 'design' | 'plan';

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
    // A "+"-menu submenu flyout opened / first search keystroke in a flyout.
    // Same semantics as the home composer's elements of the same names.
    | 'plus_submenu_open'
    | 'plus_search'
    // Opening the design-system picker from the "+" menu's Designs group
    // (programmatically clicks the composer DS trigger); the actual switch
    // stays `design_system_switch` below.
    | 'design_system_open'
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
    // Opening an existing .sketch.json from the Design Files list — the
    // "come back to an earlier sketch" re-engagement entry (distinct from
    // `new_sketch` which creates a fresh one).
    | 'open_sketch'
    | 'new_browser'
    | 'create_design_system'
    | 'create_design_system_from_project'
    | 'duplicate_project'
    | 'paste'
    | 'upload'
    | 'library'
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
    | 'zoom_in'
    // Opens the HTML file version history modal (HTML files only). Fires from
    // both the inline toolbar button and the narrow-toolbar overflow menu —
    // `entry_from` splits the two so each entry's conversion is queryable.
    | 'versions';
  artifact_id?: string;
  artifact_kind?: TrackingArtifactKind;
  // Which surface hosted the click. Reported for element=versions (the only
  // toolbar action that also lives in the overflow menu).
  entry_from?: 'toolbar' | 'more_menu';
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
    | 'text'
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

// In-deck navigation and speaker-notes controls once a slide deck is open in
// the file viewer (area 'deck_viewer'). These sit downstream of the
// DeckViewerSurfaceView entry and measure how the deck is actually consumed:
// paging through slides, jumping via thumbnails, toggling the thumbnail rail,
// and opening a slide's speaker notes for editing. Entering an actual
// presentation surface (in-tab/fullscreen/new-tab) is NOT tracked here — that
// stays on PresentPopoverClickProps to avoid double-counting.
export interface DeckViewerClickProps {
  page_name: 'artifact';
  area: 'deck_viewer';
  element:
    // Prev/next slide, from any nav surface (toolbar, floating nav, more
    // menu, keyboard). Reported once per slide move via the shared handler.
    | 'slide_prev'
    | 'slide_next'
    // Reset/jump back to slide 1 (floating "Reset" button / keyboard R).
    | 'slide_reset'
    // Click a thumbnail in the left rail to jump to that slide.
    | 'thumbnail_select'
    // Expand/collapse the thumbnail rail from the top toolbar toggle.
    | 'thumbnail_rail_toggle'
    // Open a slide's speaker notes for in-place editing (preview panel).
    | 'speaker_notes_edit';
  artifact_id?: string;
  artifact_kind?: TrackingArtifactKind;
  // Only for thumbnail_rail_toggle: which way the toggle went.
  action?: 'expand' | 'collapse';
  // Active slide index (0-based) at the moment of the interaction, and the
  // deck's total slide count — lets us see where in a deck users navigate and
  // how deck length correlates with engagement.
  slide_index?: number;
  slide_count?: number;
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

// Provenance of an HTML file version, mirroring the daemon's
// ProjectFileVersion.source: 'ai' = written by a run, 'manual' = manual
// edit/undo/redo, 'restore' = created by restoring an older version.
export type TrackingFileVersionSource = 'ai' | 'manual' | 'restore';

// Clicks inside the HTML file version history modal (opened via the artifact
// toolbar `versions` element). `restore` opens the confirm popover;
// `restore_confirm` / `restore_cancel` are the popover's two outcomes — the
// restore call itself reports via file_version_restore_result.
export interface FileVersionModalClickProps {
  page_name: 'artifact';
  area: 'file_version_modal';
  element:
    // Switching to a different version in the sidebar list (clicks on the
    // already-selected version are not reported).
    | 'version_item'
    // Desktop/tablet/mobile preview switch inside the modal; the chosen
    // preset is carried in `viewport`.
    | 'viewport_toggle'
    // Opening the prompt popover (close is not reported).
    | 'prompt_toggle'
    | 'copy_prompt'
    | 'open_in_new_tab'
    | 'restore'
    | 'restore_confirm'
    | 'restore_cancel';
  artifact_id: string;
  artifact_kind: TrackingArtifactKind;
  // Provenance of the version the click targets (version_item: the clicked
  // version; restore*: the version being restored).
  version_source?: TrackingFileVersionSource;
  // version_item only: whether the clicked version is the current one.
  version_is_current?: boolean;
  // viewport_toggle only.
  viewport?: 'desktop' | 'tablet' | 'mobile';
  // List size when the click happened, so browsing depth is queryable
  // against how much history there was to browse.
  version_count?: number;
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
  | HomeRecommendationClickProps
  | StudioOnboardingHintClickProps
  | UpdateIndicatorClickProps
  | WhatsNewPopupClickProps
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
  | DesignSystemsPresetBrandPickerClickProps
  | DesignSystemEnrichClickProps
  | DesignSystemEditClickProps
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
  | DeckViewerClickProps
  | ShareOptionPopoverClickProps
  | FileVersionModalClickProps
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

