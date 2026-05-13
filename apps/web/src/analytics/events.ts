// Typed track* helpers — one per P0 event. The helpers themselves don't
// hit PostHog directly; they marshal the typed props into the loosely-typed
// `track()` from the AnalyticsProvider so the event names + property shapes
// live in @open-design/contracts/analytics and stay in lockstep with the
// daemon side.

import type {
  AppLaunchProps,
  ArtifactExportResultProps,
  HomeClickCreateButtonProps,
  HomeViewAssetPanelProps,
  HomeViewPageProps,
  ProjectCreateResultProps,
  RunCreatedProps,
  RunFinishedProps,
  SettingsByokTestResultProps,
  SettingsClickByokFieldProps,
  SettingsClickByokProviderOptionProps,
  SettingsClickCliProviderCardProps,
  SettingsClickExecutionModeTabProps,
  SettingsCliTestResultProps,
  SettingsViewProps,
  StudioClickChatComposerProps,
  StudioClickShareOptionProps,
  StudioViewArtifactProps,
  StudioViewChatPanelProps,
} from '@open-design/contracts/analytics';

type Track = (
  event: string,
  properties: Record<string, unknown>,
  options?: { requestId?: string; insertId?: string },
) => void;

export function trackAppLaunch(track: Track, props: AppLaunchProps) {
  track('app_launch', props as unknown as Record<string, unknown>);
}

export function trackHomeViewPage(track: Track, props: HomeViewPageProps) {
  track('home_view', props as unknown as Record<string, unknown>);
}

export function trackHomeViewAssetPanel(
  track: Track,
  props: HomeViewAssetPanelProps,
) {
  track('home_view', props as unknown as Record<string, unknown>);
}

export function trackHomeClickCreateButton(
  track: Track,
  props: HomeClickCreateButtonProps,
  options?: { requestId: string },
) {
  track('home_click', props as unknown as Record<string, unknown>, options);
}

export function trackProjectCreateResult(
  track: Track,
  props: ProjectCreateResultProps,
  options?: { requestId?: string },
) {
  track(
    'project_create_result',
    props as unknown as Record<string, unknown>,
    options,
  );
}

export function trackSettingsView(track: Track, props: SettingsViewProps) {
  track('settings_view', props as unknown as Record<string, unknown>);
}

export function trackSettingsClickExecutionModeTab(
  track: Track,
  props: SettingsClickExecutionModeTabProps,
) {
  track('settings_click', props as unknown as Record<string, unknown>);
}

export function trackSettingsClickCliProviderCard(
  track: Track,
  props: SettingsClickCliProviderCardProps,
) {
  track('settings_click', props as unknown as Record<string, unknown>);
}

export function trackSettingsClickByokField(
  track: Track,
  props: SettingsClickByokFieldProps,
) {
  track('settings_click', props as unknown as Record<string, unknown>);
}

export function trackSettingsClickByokProviderOption(
  track: Track,
  props: SettingsClickByokProviderOptionProps,
) {
  track('settings_click', props as unknown as Record<string, unknown>);
}

export function trackSettingsCliTestResult(
  track: Track,
  props: SettingsCliTestResultProps,
) {
  track(
    'settings_cli_test_result',
    props as unknown as Record<string, unknown>,
  );
}

export function trackSettingsByokTestResult(
  track: Track,
  props: SettingsByokTestResultProps,
) {
  track(
    'settings_byok_test_result',
    props as unknown as Record<string, unknown>,
  );
}

export function trackStudioViewChatPanel(
  track: Track,
  props: StudioViewChatPanelProps,
) {
  track('studio_view', props as unknown as Record<string, unknown>);
}

export function trackStudioClickChatComposer(
  track: Track,
  props: StudioClickChatComposerProps,
) {
  track('studio_click', props as unknown as Record<string, unknown>);
}

export function trackStudioViewArtifact(
  track: Track,
  props: StudioViewArtifactProps,
) {
  track('studio_view', props as unknown as Record<string, unknown>);
}

export function trackStudioClickShareOption(
  track: Track,
  props: StudioClickShareOptionProps,
  options?: { requestId: string },
) {
  track('studio_click', props as unknown as Record<string, unknown>, options);
}

export function trackArtifactExportResult(
  track: Track,
  props: ArtifactExportResultProps,
  options?: { requestId?: string },
) {
  track(
    'artifact_export_result',
    props as unknown as Record<string, unknown>,
    options,
  );
}

export function trackRunCreated(
  track: Track,
  props: RunCreatedProps,
  options?: { requestId?: string },
) {
  track('run_created', props as unknown as Record<string, unknown>, options);
}

export function trackRunFinished(
  track: Track,
  props: RunFinishedProps,
  options?: { requestId?: string },
) {
  track('run_finished', props as unknown as Record<string, unknown>, options);
}
