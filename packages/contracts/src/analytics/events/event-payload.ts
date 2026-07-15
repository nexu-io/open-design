/**
 * @module analytics/events/event-payload
 * Discriminated union of all analytics event payloads.
 */
import type { AnalyticsEventName } from './event-names.js';
import type { DesignSystemApplyResultProps, DesignSystemCreateResultProps, DesignSystemEnrichResultProps, DesignSystemReviewResultProps, DesignSystemSourceIngestResultProps, DesignSystemStatusResultProps } from './design-systems.js';
import type { OnboardingCompletedProps, OnboardingCompleteResultProps, OnboardingFirstGenerationCompletedProps, OnboardingFirstPromptSentProps, OnboardingPromptPrefilledProps, OnboardingRuntimeScanResultProps } from './onboarding.js';
import type { PageViewProps } from './page-view.js';
import type { ArtifactDeployResultProps, ArtifactExportResultProps, AssistantFeedbackClickProps, AssistantFeedbackReasonClickProps, AssistantFeedbackReasonSubmitProps, AssistantFeedbackReasonViewProps, ContextLinkResultProps, FeedbackSubmitResultProps, FileUploadResultProps, FileVersionRestoreResultProps, LangfuseReportResultProps, PackagedRuntimeFailedProps, PluginImportResultProps, PluginReplacementResultProps, ProjectCreateResultProps, RunCreatedProps, RunFinishedProps, RunRetryAttemptedProps, RunRetryFinishedProps, SettingsByokModelsFetchResultProps, SettingsByokTestResultProps, SettingsCliTestResultProps, SettingsConnectorAuthResultProps, SettingsViewProps, SketchExportResultProps, SketchSaveResultProps, SpeakerNotesSaveResultProps, UpdateApplyObservedProps, UpdateInstallResultProps } from './result-events.js';
import type { SurfaceViewProps } from './surface-view.js';
import type { AmrAuthResultProps, UiClickProps } from './ui-click.js';
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
  | { event: 'context_link_result'; props: ContextLinkResultProps }
  | { event: 'speaker_notes_save_result'; props: SpeakerNotesSaveResultProps }
  | { event: 'artifact_export_result'; props: ArtifactExportResultProps }
  | { event: 'artifact_deploy_result'; props: ArtifactDeployResultProps }
  | { event: 'sketch_save_result'; props: SketchSaveResultProps }
  | { event: 'sketch_export_result'; props: SketchExportResultProps }
  | { event: 'file_version_restore_result'; props: FileVersionRestoreResultProps }
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
  | { event: 'onboarding_prompt_prefilled'; props: OnboardingPromptPrefilledProps }
  | { event: 'onboarding_first_prompt_sent'; props: OnboardingFirstPromptSentProps }
  | {
      event: 'onboarding_first_generation_completed';
      props: OnboardingFirstGenerationCompletedProps;
    }
  | { event: 'onboarding_completed'; props: OnboardingCompletedProps }
  | {
      event: 'design_system_source_ingest_result';
      props: DesignSystemSourceIngestResultProps;
    }
  | { event: 'design_system_create_result'; props: DesignSystemCreateResultProps }
  | { event: 'design_system_review_result'; props: DesignSystemReviewResultProps }
  | { event: 'design_system_status_result'; props: DesignSystemStatusResultProps }
  | { event: 'design_system_apply_result'; props: DesignSystemApplyResultProps }
  | { event: 'design_system_enrich_result'; props: DesignSystemEnrichResultProps };

// Compile-time guard: `AnalyticsEventName` (event-names.ts) and the payload
// discriminants above must stay in sync. If a future catalog split drops or
// adds an event name on only one side, `AnalyticsEventCatalogDrift` stops being
// `never` and the assertion below fails to type-check — reconcile the two files
// rather than letting the public contract diverge. Downstream code that
// validates or switches on `AnalyticsEventName` relies on this parity.
type AnalyticsEventCatalogDrift =
  | Exclude<AnalyticsEventName, AnalyticsEventPayload['event']>
  | Exclude<AnalyticsEventPayload['event'], AnalyticsEventName>;
// The default type argument must satisfy `extends never`; any drift makes it a
// non-`never` union and turns this alias into a type error.
type AssertAnalyticsEventCatalogInSync<
  _Drift extends never = AnalyticsEventCatalogDrift,
> = _Drift;
