/**
 * @module analytics/events/surface-view
 * surface_view event prop types and their union.
 */
import type { TrackingOnboardingFirstLoopStep, TrackingOnboardingProductType, TrackingOnboardingRole, TrackingOnboardingUseCase } from './onboarding.js';
import type { TrackingArtifactKind, TrackingNewProjectTab, TrackingProjectKind } from './shared-enums.js';
import type { DesignSystemsPresetBrandPickerSurfaceViewProps } from './ui-click.js';
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

// The "Reference project" picker modal opened from the composer "+" menu
// (Files group) on the home hero or the in-project chat composer. Exposure
// baseline for the reference-project funnel: surface_view → ui_click
// `plus_pick` (workspace/reference-project) → `context_link_result`.
export interface ProjectReferenceModalSurfaceViewProps {
  page_name: 'home' | 'chat_panel';
  area: 'project_reference_modal';
  project_id?: string;
}

// The "how to download a .fig" guide modal opened from the composer "+"
// menu's Designs group (the `figma_help` row) on either composer surface.
export interface FigmaHelpModalSurfaceViewProps {
  page_name: 'home' | 'chat_panel';
  area: 'figma_help_modal';
  project_id?: string;
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

// Post-update "what's new" card on the home surface; fires once per version
// when the card becomes visible after an update.
export interface WhatsNewPopupSurfaceViewProps {
  page_name: 'home';
  area: 'whats_new_popup';
  app_version: string;
  /** True when release-configured highlights were shown, false for the generic fallback copy. */
  has_release_notes: boolean;
}

// Impression of the HTML file version history modal. Fires once per open so
// the versions funnel has a denominator (toolbar clicks → exposures →
// version_item browsing → restore result). `entry_from` mirrors the opening
// toolbar click's dimension.
export interface FileVersionModalSurfaceViewProps {
  page_name: 'artifact';
  area: 'file_version_modal';
  entry_from: 'toolbar' | 'more_menu';
  artifact_id: string;
  artifact_kind: TrackingArtifactKind;
}

// Impression of the personalized first-run recommendation card on Home. Fires
// once per exposure so the funnel can divide `enter_studio` / `change` /
// `browse_all` clicks by how often the recommendation was actually seen.
export interface HomeRecommendationSurfaceViewProps {
  page_name: 'home';
  area: 'onboarding_recommendation';
  product_type: TrackingOnboardingProductType;
  recommendation_id: string;
  role?: TrackingOnboardingRole;
  use_cases?: TrackingOnboardingUseCase[];
}

// Impression of the one-time first-generation hint in Studio (spec §8.3).
export interface StudioOnboardingHintSurfaceViewProps {
  page_name: 'chat_panel';
  area: 'onboarding_first_artifact_hint';
  hint_type: 'view_artifact';
  studio_stage?: TrackingOnboardingFirstLoopStep;
  feature_id?: string;
}

export type SurfaceViewProps =
  | RunFailedToastSurfaceViewProps
  | HomeRecommendationSurfaceViewProps
  | StudioOnboardingHintSurfaceViewProps
  | HelpPopoverSurfaceViewProps
  | SettingsPopoverSurfaceViewProps
  | NewProjectModalSurfaceViewProps
  | PluginReplacementModalSurfaceViewProps
  | PluginDetailModalSurfaceViewProps
  | PluginImportModalSurfaceViewProps
  | ProjectReferenceModalSurfaceViewProps
  | FigmaHelpModalSurfaceViewProps
  | DesignSystemsTemplatesModalSurfaceViewProps
  | DesignSystemsPresetBrandPickerSurfaceViewProps
  | AssistantFeedbackReasonPanelSurfaceViewProps
  | QuestionsFormSurfaceViewProps
  | UpdateIndicatorSurfaceViewProps
  | ReferenceBoardSurfaceViewProps
  | UpdatePromptSurfaceViewProps
  | WhatsNewPopupSurfaceViewProps
  | FileVersionModalSurfaceViewProps;

