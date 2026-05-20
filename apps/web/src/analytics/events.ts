// Typed track* helpers for the v2 analytics schema. Each helper accepts a
// strongly typed props payload (from @open-design/contracts/analytics) and
// forwards it through the loosely typed `track()` from AnalyticsProvider.
// Keeping the event-name → prop-shape coupling in one place means call sites
// stay short and stay in lockstep with the daemon-side capture.

import type {
  // page_view / surface_view
  PageViewProps,
  HelpPopoverSurfaceViewProps,
  NewProjectModalSurfaceViewProps,
  PluginReplacementModalSurfaceViewProps,
  DesignSystemsTemplatesModalSurfaceViewProps,
  AssistantFeedbackReasonPanelSurfaceViewProps,
  // ui_click
  HomeNavClickProps,
  HelpPopoverClickProps,
  HomeToolbarClickProps,
  ExecutionSettingsPopoverClickProps,
  SettingsPopoverClickProps,
  HomeChatComposerClickProps,
  NewProjectModalTabClickProps,
  NewProjectModalElementClickProps,
  PluginReplacementModalClickProps,
  PrivacyModalClickProps,
  RecentProjectsClickProps,
  HomeTemplatesClickProps,
  HomeTemplatesDropdownClickProps,
  ProjectsListControlsClickProps,
  ProjectsListClickProps,
  ProjectsMorePopoverClickProps,
  AutomationsClickProps,
  PluginsTopClickProps,
  PluginsInstalledTabClickProps,
  PluginsTemplatesDropdownClickProps,
  PluginsAvailableTabClickProps,
  PluginsSourcesTabClickProps,
  DesignSystemsTopClickProps,
  DesignSystemsTemplateCardClickProps,
  DesignSystemsTemplatesModalClickProps,
  DesignSystemsTemplatesModalSharePopoverClickProps,
  IntegrationsTabClickProps,
  IntegrationsMcpTabClickProps,
  IntegrationsConnectorsTabClickProps,
  IntegrationsSkillsTabClickProps,
  IntegrationsUseEverywhereTabClickProps,
  ChatPanelClickProps,
  ChatPanelResourcesPopoverClickProps,
  FileManagerClickProps,
  ArtifactToolbarClickProps,
  TweaksPopoverClickProps,
  ArtifactHeaderClickProps,
  PresentPopoverClickProps,
  ShareOptionPopoverClickProps,
  AssistantFeedbackButtonClickProps,
  AssistantFeedbackReasonSubmitClickProps,
  SettingsSidebarClickProps,
  SettingsExecutionModeTabClickProps,
  SettingsLocalCliClickProps,
  SettingsByokProviderOptionClickProps,
  SettingsByokFieldClickProps,
  SettingsMediaProvidersClickProps,
  SettingsConnectorsClickProps,
  SettingsLanguageClickProps,
  SettingsAppearanceClickProps,
  SettingsNotificationsClickProps,
  SettingsPetsClickProps,
  SettingsPrivacyClickProps,
  // Result events
  ProjectCreateResultProps,
  PluginReplacementResultProps,
  RunCreatedProps,
  RunFinishedProps,
  FileUploadResultProps,
  ArtifactExportResultProps,
  FeedbackSubmitResultProps,
  SettingsViewProps,
  SettingsCliTestResultProps,
  SettingsByokTestResultProps,
  SettingsConnectorAuthResultProps,
} from '@open-design/contracts/analytics';

type TrackOptions = { requestId?: string; insertId?: string };
type Track = (
  event: string,
  properties: Record<string, unknown>,
  options?: TrackOptions,
) => void;

// Helper: forward a typed payload to the loose `track()` API. Centralized so
// every call site stays one-line.
function send<T extends object>(
  track: Track,
  event: string,
  props: T,
  options?: TrackOptions,
): void {
  track(event, props as unknown as Record<string, unknown>, options);
}

// ---- page_view -----------------------------------------------------------

export function trackPageView(track: Track, props: PageViewProps): void {
  send(track, 'page_view', props);
}

// ---- surface_view --------------------------------------------------------

export function trackHelpPopoverSurfaceView(
  track: Track,
  props: HelpPopoverSurfaceViewProps,
): void {
  send(track, 'surface_view', props);
}

export function trackNewProjectModalSurfaceView(
  track: Track,
  props: NewProjectModalSurfaceViewProps,
): void {
  send(track, 'surface_view', props);
}

export function trackPluginReplacementModalSurfaceView(
  track: Track,
  props: PluginReplacementModalSurfaceViewProps,
): void {
  send(track, 'surface_view', props);
}

export function trackDesignSystemsTemplatesModalSurfaceView(
  track: Track,
  props: DesignSystemsTemplatesModalSurfaceViewProps,
): void {
  send(track, 'surface_view', props);
}

export function trackAssistantFeedbackReasonPanelSurfaceView(
  track: Track,
  props: AssistantFeedbackReasonPanelSurfaceViewProps,
): void {
  send(track, 'surface_view', props);
}

// ---- ui_click (home) -----------------------------------------------------

export function trackHomeNavClick(
  track: Track,
  props: HomeNavClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackHelpPopoverClick(
  track: Track,
  props: HelpPopoverClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackHomeToolbarClick(
  track: Track,
  props: HomeToolbarClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackExecutionSettingsPopoverClick(
  track: Track,
  props: ExecutionSettingsPopoverClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackSettingsPopoverClick(
  track: Track,
  props: SettingsPopoverClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackHomeChatComposerClick(
  track: Track,
  props: HomeChatComposerClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackNewProjectModalTabClick(
  track: Track,
  props: NewProjectModalTabClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackNewProjectModalElementClick(
  track: Track,
  props: NewProjectModalElementClickProps,
  options?: { requestId?: string },
): void {
  send(track, 'ui_click', props, options);
}

export function trackPluginReplacementModalClick(
  track: Track,
  props: PluginReplacementModalClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackPrivacyModalClick(
  track: Track,
  props: PrivacyModalClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackRecentProjectsClick(
  track: Track,
  props: RecentProjectsClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackHomeTemplatesClick(
  track: Track,
  props: HomeTemplatesClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackHomeTemplatesDropdownClick(
  track: Track,
  props: HomeTemplatesDropdownClickProps,
): void {
  send(track, 'ui_click', props);
}

// ---- ui_click (projects) -------------------------------------------------

export function trackProjectsListControlsClick(
  track: Track,
  props: ProjectsListControlsClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackProjectsListClick(
  track: Track,
  props: ProjectsListClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackProjectsMorePopoverClick(
  track: Track,
  props: ProjectsMorePopoverClickProps,
): void {
  send(track, 'ui_click', props);
}

// ---- ui_click (automations / plugins / design_systems / integrations) ----

export function trackAutomationsClick(
  track: Track,
  props: AutomationsClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackPluginsTopClick(
  track: Track,
  props: PluginsTopClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackPluginsInstalledTabClick(
  track: Track,
  props: PluginsInstalledTabClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackPluginsTemplatesDropdownClick(
  track: Track,
  props: PluginsTemplatesDropdownClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackPluginsAvailableTabClick(
  track: Track,
  props: PluginsAvailableTabClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackPluginsSourcesTabClick(
  track: Track,
  props: PluginsSourcesTabClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackDesignSystemsTopClick(
  track: Track,
  props: DesignSystemsTopClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackDesignSystemsTemplateCardClick(
  track: Track,
  props: DesignSystemsTemplateCardClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackDesignSystemsTemplatesModalClick(
  track: Track,
  props: DesignSystemsTemplatesModalClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackDesignSystemsTemplatesModalSharePopoverClick(
  track: Track,
  props: DesignSystemsTemplatesModalSharePopoverClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackIntegrationsTabClick(
  track: Track,
  props: IntegrationsTabClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackIntegrationsMcpTabClick(
  track: Track,
  props: IntegrationsMcpTabClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackIntegrationsConnectorsTabClick(
  track: Track,
  props: IntegrationsConnectorsTabClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackIntegrationsSkillsTabClick(
  track: Track,
  props: IntegrationsSkillsTabClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackIntegrationsUseEverywhereTabClick(
  track: Track,
  props: IntegrationsUseEverywhereTabClickProps,
): void {
  send(track, 'ui_click', props);
}

// ---- ui_click (chat panel) -----------------------------------------------

export function trackChatPanelClick(
  track: Track,
  props: ChatPanelClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackChatPanelResourcesPopoverClick(
  track: Track,
  props: ChatPanelResourcesPopoverClickProps,
): void {
  send(track, 'ui_click', props);
}

// ---- ui_click (file manager / artifact) ----------------------------------

export function trackFileManagerClick(
  track: Track,
  props: FileManagerClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackArtifactToolbarClick(
  track: Track,
  props: ArtifactToolbarClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackTweaksPopoverClick(
  track: Track,
  props: TweaksPopoverClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackArtifactHeaderClick(
  track: Track,
  props: ArtifactHeaderClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackPresentPopoverClick(
  track: Track,
  props: PresentPopoverClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackShareOptionPopoverClick(
  track: Track,
  props: ShareOptionPopoverClickProps,
  options?: { requestId: string },
): void {
  send(track, 'ui_click', props, options);
}

// ---- ui_click (feedback) -------------------------------------------------

export function trackAssistantFeedbackButtonClick(
  track: Track,
  props: AssistantFeedbackButtonClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackAssistantFeedbackReasonSubmitClick(
  track: Track,
  props: AssistantFeedbackReasonSubmitClickProps,
  options?: { requestId?: string },
): void {
  send(track, 'ui_click', props, options);
}

// ---- ui_click (settings) -------------------------------------------------

export function trackSettingsSidebarClick(
  track: Track,
  props: SettingsSidebarClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackSettingsExecutionModeTabClick(
  track: Track,
  props: SettingsExecutionModeTabClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackSettingsLocalCliClick(
  track: Track,
  props: SettingsLocalCliClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackSettingsByokProviderOptionClick(
  track: Track,
  props: SettingsByokProviderOptionClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackSettingsByokFieldClick(
  track: Track,
  props: SettingsByokFieldClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackSettingsMediaProvidersClick(
  track: Track,
  props: SettingsMediaProvidersClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackSettingsConnectorsClick(
  track: Track,
  props: SettingsConnectorsClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackSettingsLanguageClick(
  track: Track,
  props: SettingsLanguageClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackSettingsAppearanceClick(
  track: Track,
  props: SettingsAppearanceClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackSettingsNotificationsClick(
  track: Track,
  props: SettingsNotificationsClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackSettingsPetsClick(
  track: Track,
  props: SettingsPetsClickProps,
): void {
  send(track, 'ui_click', props);
}

export function trackSettingsPrivacyClick(
  track: Track,
  props: SettingsPrivacyClickProps,
): void {
  send(track, 'ui_click', props);
}

// ---- Result events -------------------------------------------------------

export function trackProjectCreateResult(
  track: Track,
  props: ProjectCreateResultProps,
  options?: { requestId?: string },
): void {
  send(track, 'project_create_result', props, options);
}

export function trackPluginReplacementResult(
  track: Track,
  props: PluginReplacementResultProps,
  options?: { requestId?: string },
): void {
  send(track, 'plugin_replacement_result', props, options);
}

export function trackRunCreated(
  track: Track,
  props: RunCreatedProps,
  options?: { requestId?: string },
): void {
  send(track, 'run_created', props, options);
}

export function trackRunFinished(
  track: Track,
  props: RunFinishedProps,
  options?: { requestId?: string },
): void {
  send(track, 'run_finished', props, options);
}

export function trackFileUploadResult(
  track: Track,
  props: FileUploadResultProps,
  options?: { requestId?: string },
): void {
  send(track, 'file_upload_result', props, options);
}

export function trackArtifactExportResult(
  track: Track,
  props: ArtifactExportResultProps,
  options?: { requestId?: string },
): void {
  send(track, 'artifact_export_result', props, options);
}

export function trackFeedbackSubmitResult(
  track: Track,
  props: FeedbackSubmitResultProps,
  options?: { requestId?: string },
): void {
  send(track, 'feedback_submit_result', props, options);
}

// ---- Settings view + test/auth result events -----------------------------

export function trackSettingsView(
  track: Track,
  props: SettingsViewProps,
): void {
  send(track, 'settings_view', props);
}

export function trackSettingsCliTestResult(
  track: Track,
  props: SettingsCliTestResultProps,
): void {
  send(track, 'settings_cli_test_result', props);
}

export function trackSettingsByokTestResult(
  track: Track,
  props: SettingsByokTestResultProps,
): void {
  send(track, 'settings_byok_test_result', props);
}

export function trackSettingsConnectorAuthResult(
  track: Track,
  props: SettingsConnectorAuthResultProps,
): void {
  send(track, 'settings_connector_auth_result', props);
}
