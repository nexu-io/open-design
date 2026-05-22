// EntryShell — the centered-hero entry layout.
//
// This component owns the entire JSX render and local UI state for
// the redesigned home view (left rail + sticky settings cog + hero +
// recent projects + plugins section + new-project modal). It is
// intentionally a sibling of `EntryView` so that upstream `main`
// changes to `EntryView` (props, connector lifecycle, helpers, exports)
// can be rebased without touching this file. `EntryView` becomes a
// thin wrapper that passes data and callbacks through to this shell.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  defaultScenarioPluginIdForProjectMetadata,
  type ConnectorDetail,
  type InstalledPluginRecord,
} from '@open-design/contracts';
import type { OpenDesignHostProjectImportSuccess } from '@open-design/host';
import { useAnalytics } from '../analytics/provider';
import {
  trackHomeNavClick,
  trackHomeToolbarClick,
  trackPageView,
} from '../analytics/events';
import {
  clearOnboardingSessionId,
  getOrCreateOnboardingSessionId,
} from '../analytics/onboarding-session';
import type {
  TrackingOnboardingArea,
  TrackingOnboardingStepIndex,
  TrackingOnboardingStepName,
} from '@open-design/contracts/analytics';
import { useT } from '../i18n';
import { navigate, useRoute } from '../router';
import type {
  AgentInfo,
  ApiProtocol,
  ApiProtocolConfig,
  AppConfig,
  AppTheme,
  ConnectionTestResponse,
  DesignSystemSummary,
  ExecMode,
  Project,
  ProjectMetadata,
  ProjectTemplate,
  PromptTemplateSummary,
  ProviderModelOption,
  ProviderModelsResponse,
  SkillSummary,
} from '../types';
import { CenteredLoader } from './Loading';
import { DesignsTab } from './DesignsTab';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import { DesignSystemsTab } from './DesignSystemsTab';
import { EntryNavRail, type EntryView as EntryViewKind } from './EntryNavRail';
import { GithubStarBadge } from './GithubStarBadge';
import { HomeView } from './HomeView';
import {
  createPluginAuthoringHandoff,
  createPluginUseHandoff,
  type HomePromptHandoff,
} from './home-hero/plugin-authoring';
import type { PluginUseAction } from './plugins-home/useActions';
import { Icon } from './Icon';
import { AgentIcon } from './AgentIcon';
import { IntegrationsView, type IntegrationTab } from './IntegrationsView';
import { InlineModelSwitcher } from './InlineModelSwitcher';
import { NewProjectModal } from './NewProjectModal';
import { PluginsView } from './PluginsView';
import type { CreateInput, CreateTab } from './NewProjectPanel';
import type { PluginLoopSubmit } from './PluginLoopHome';
import type {
  PluginShareAction,
  PluginShareProjectOutcome,
} from '../state/projects';
import { TasksView } from './TasksView';
import {
  API_KEY_PLACEHOLDERS,
  API_PROTOCOL_TABS,
  SUGGESTED_MODELS_BY_PROTOCOL,
} from '../state/apiProtocols';
import { KNOWN_PROVIDERS } from '../state/config';
import type { KnownProvider } from '../state/config';
import { testApiProvider } from '../providers/connection-test';
import { fetchProviderModels } from '../providers/provider-models';

// The topbar chips (GitHub star, model switcher, Use everywhere)
// collapse into the settings dropdown when the viewport gets
// narrow. The transition is driven entirely by CSS @media queries
// in `entry-layout.css` so server and client render identical
// markup — both surfaces are always present, and CSS toggles
// `display` based on `--compact-topbar` breakpoint (900px).

// Default scenario plugin for each project kind/intent. The mapping
// lives in `@open-design/contracts` so the daemon's `/api/projects`
// and `/api/runs` fallbacks resolve to the same plugin id when no
// `pluginId` is on the request body — plan §3.3 of
// `specs/current/plugin-driven-flow-plan.md`.
function defaultPluginIdForMetadata(metadata: ProjectMetadata): string | null {
  return defaultScenarioPluginIdForProjectMetadata(metadata);
}

function defaultPluginInputsForCreate(
  input: CreateInput,
  pluginId: string | null,
): Record<string, unknown> | null {
  const kind = input.metadata.kind;
  const projectName = input.name.trim();

  if (pluginId === 'example-web-prototype') {
    return {
      artifactKind: input.metadata.includeLandingPage
        ? 'landing page'
        : 'web prototype',
      fidelity: input.metadata.fidelity ?? 'high-fidelity',
      audience: 'product evaluators',
      designSystem: 'the active project design system',
      template: input.metadata.templateLabel ?? 'the bundled web prototype seed',
    };
  }

  if (pluginId === 'example-simple-deck') {
    return {
      deckType: 'pitch deck',
      topic: projectName || 'the user brief',
      audience: 'decision makers',
      slideCount: 10,
      speakerNotes: input.metadata.speakerNotes
        ? 'include speaker notes'
        : 'no speaker notes',
      designSystem: 'the active project design system',
    };
  }

  if (pluginId === 'od-new-generation') {
    const templateLabel = input.metadata.templateLabel?.trim();
    const artifactKind =
      kind === 'template'
        ? 'artifact based on a saved template'
        : kind === 'other'
          ? 'custom design artifact'
          : `${kind} artifact`;
    return {
      artifactKind,
      audience: 'product and design reviewers',
      topic: templateLabel || projectName || 'the user brief',
    };
  }

  if (pluginId !== 'od-media-generation') return null;
  if (kind !== 'image' && kind !== 'video' && kind !== 'audio') return null;

  const promptTemplate = input.metadata.promptTemplate;
  const subject =
    promptTemplate?.prompt?.trim()
    || projectName
    || promptTemplate?.title?.trim()
    || `${kind} concept`;
  const style =
    promptTemplate?.summary?.trim()
    || 'cinematic, high-quality, on-brand';
  const aspect =
    kind === 'image'
      ? input.metadata.imageAspect
      : kind === 'video'
        ? input.metadata.videoAspect
        : undefined;

  return {
    mediaKind: kind,
    subject,
    style,
    ...(aspect ? { aspect } : {}),
  };
}

// Theme options exposed in the avatar-popover appearance submenu.

interface Props {
  skills: SkillSummary[];
  designTemplates: SkillSummary[];
  designSystems: DesignSystemSummary[];
  projects: Project[];
  templates: ProjectTemplate[];
  onDeleteTemplate?: (id: string) => Promise<boolean>;
  promptTemplates: PromptTemplateSummary[];
  defaultDesignSystemId: string | null;
  connectors: ConnectorDetail[];
  connectorsLoading: boolean;
  integrationInitialTab?: IntegrationTab;
  composioConfigLoading?: boolean;
  skillsLoading?: boolean;
  designSystemsLoading?: boolean;
  projectsLoading?: boolean;
  // Execution / model-switching context. Threaded down from `App` so the
  // top-bar `InlineModelSwitcher` can render the active mode/agent/model
  // and persist changes through the same callbacks the project view uses.
  config: AppConfig;
  agents: AgentInfo[];
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string },
  ) => void;
  onApiProtocolChange: (protocol: ApiProtocol) => void;
  onApiModelChange: (model: string) => void;
  onConfigPersist: (cfg: AppConfig) => Promise<void> | void;
  onRefreshAgents: () => Promise<AgentInfo[]> | AgentInfo[];
  // Quick theme switch from the avatar-popover dropdown. Lets the user
  // flip between system / light / dark without opening the full Settings
  // dialog. App owns persistence; this component just calls the callback.
  onThemeChange: (theme: AppTheme) => void;
  onCreateProject: (
    input: CreateInput & {
      pendingPrompt?: string;
      pluginId?: string;
      appliedPluginSnapshotId?: string;
      pluginInputs?: Record<string, unknown>;
      autoSendFirstMessage?: boolean;
      pendingFiles?: File[];
    },
  ) => Promise<boolean> | boolean | void;
  onCreatePluginShareProject: (
    pluginId: string,
    action: PluginShareAction,
    locale?: string,
  ) => Promise<PluginShareProjectOutcome>;
  onImportClaudeDesign: (file: File) => Promise<void> | void;
  onImportFolder?: (baseDir: string) => Promise<void> | void;
  onImportFolderResponse?: (response: OpenDesignHostProjectImportSuccess) => Promise<void> | void;
  onOpenProject: (id: string) => void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => Promise<boolean | void> | boolean | void;
  onRenameProject: (id: string, name: string) => void;
  onChangeDefaultDesignSystem: (id: string) => void;
  onCreateDesignSystem?: () => void;
  renderDesignSystemCreation?: (onBack: () => void) => ReactNode;
  onOpenDesignSystem?: (id: string) => void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
  onPersistComposioKey: (composio: AppConfig['composio']) => Promise<void> | void;
  onOpenSettings: (
    section?:
      | 'execution'
      | 'media'
      | 'composio'
      | 'orbit'
      | 'integrations'
      | 'mcpClient'
      | 'language'
      | 'appearance'
      | 'notifications'
      | 'pet'
      | 'library'
      | 'about'
      | 'memory'
      | 'designSystems',
  ) => void;
  onCompleteOnboarding: () => void;
}

// Map an EntryNavRail view id to the analytics `element` enum on
// `home/nav` ui_click. Returns `null` for views without a dedicated nav
// button (the rail's "Home" target is the brand logo, which gets its own
// element value via the logo click handler — not the changeView path).
function navElementForView(
  next: EntryViewKind,
):
  | 'home'
  | 'projects'
  | 'automations'
  | 'plugins'
  | 'design_systems'
  | 'integrations'
  | null {
  switch (next) {
    case 'home':
      return 'home';
    case 'projects':
      return 'projects';
    case 'tasks':
      return 'automations';
    case 'plugins':
      return 'plugins';
    case 'design-systems':
      return 'design_systems';
    case 'integrations':
      return 'integrations';
    default:
      return null;
  }
}

export function EntryShell({
  skills,
  designTemplates,
  designSystems,
  projects,
  templates,
  onDeleteTemplate,
  promptTemplates,
  defaultDesignSystemId,
  connectors,
  connectorsLoading,
  integrationInitialTab = 'mcp',
  composioConfigLoading = false,
  skillsLoading = false,
  designSystemsLoading = false,
  projectsLoading = false,
  config,
  agents,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onConfigPersist,
  onRefreshAgents,
  onThemeChange,
  onCreateProject,
  onCreatePluginShareProject,
  onImportClaudeDesign,
  onImportFolder,
  onImportFolderResponse,
  onOpenProject,
  onOpenLiveArtifact,
  onDeleteProject,
  onRenameProject,
  onChangeDefaultDesignSystem,
  onCreateDesignSystem,
  renderDesignSystemCreation,
  onOpenDesignSystem,
  onDesignSystemsRefresh,
  onPersistComposioKey,
  onOpenSettings,
  onCompleteOnboarding,
}: Props) {
  const t = useT();
  // Each entry sub-view (home / projects / design-systems) is its own
  // URL now, so the browser back/forward buttons work and a deep link
  // to /design-systems lands on that section. We derive the active
  // view from the route rather than keeping it in component state.
  const route = useRoute();
  const view: EntryViewKind = route.kind === 'home' ? route.view : 'home';
  const [previewSystemId, setPreviewSystemId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectInitialTab, setNewProjectInitialTab] =
    useState<CreateTab>('prototype');
  const [integrationTab, setIntegrationTab] = useState<IntegrationTab>(integrationInitialTab);
  const [homePromptHandoff, setHomePromptHandoff] = useState<HomePromptHandoff | null>(null);
  const analytics = useAnalytics();
  function changeView(next: EntryViewKind) {
    const navElement = navElementForView(next);
    if (navElement) {
      trackHomeNavClick(analytics.track, {
        page_name: 'home',
        area: 'nav',
        element: navElement,
      });
    }
    navigate({ kind: 'home', view: next });
  }

  function startPluginAuthoring(goal?: string) {
    setHomePromptHandoff(
      createPluginAuthoringHandoff(Date.now(), goal),
    );
    changeView('home');
  }

  function usePluginFromLibrary(
    record: InstalledPluginRecord,
    action: PluginUseAction = 'use',
  ) {
    setHomePromptHandoff(
      createPluginUseHandoff(Date.now(), record.id, { action }),
    );
    changeView('home');
  }

  useEffect(() => {
    setIntegrationTab(integrationInitialTab);
  }, [integrationInitialTab]);

  function openIntegrationTab(tab: IntegrationTab) {
    setIntegrationTab(tab);
    changeView('integrations');
  }

  function openNewProject(tab: CreateTab = 'prototype') {
    setNewProjectInitialTab(tab);
    setNewProjectOpen(true);
  }

  const previewSystem = useMemo(
    () => (previewSystemId ? designSystems.find((d) => d.id === previewSystemId) ?? null : null),
    [designSystems, previewSystemId],
  );

  function handleCreate(input: CreateInput) {
    // The NewProjectModal no longer asks the user to pick a plugin.
    // Each project kind is silently bound to its default scenario
    // pipeline at creation time so the user lands in a running flow
    // without having to reason about pipeline internals. The mapping
    // is intentionally explicit so future kind-specific scenarios
    // (e.g. a deck- or image-specialized pipeline) can take over a
    // single row without touching the form.
    const pluginId = defaultPluginIdForMetadata(input.metadata);
    const pluginInputs = defaultPluginInputsForCreate(input, pluginId);
    return onCreateProject({
      ...input,
      ...(pluginId ? { pluginId } : {}),
      ...(pluginInputs ? { pluginInputs } : {}),
    });
  }

  // Plan §3.F5 — the home prompt-loop submit path. The user picks a
  // plugin (which calls /api/plugins/:id/apply and binds a snapshot),
  // edits the rendered example query if any, then presses Enter. We
  // derive a project name from the active plugin (or prompt head),
  // forward the pluginId so POST /api/projects pins the snapshot to
  // project + conversation, and request auto-send of the first
  // message so the user lands inside a running pipeline.
  //
  // Stage B of plugin-driven-flow-plan: the rail can stamp a
  // `projectKind` on the payload so the created project records the
  // chosen surface (image / video / audio, etc.). Free-form Home
  // submits now arrive with the hidden od-default router plugin and
  // projectKind='other', so the agent asks for the exact task type
  // before continuing.
  function handlePluginLoopSubmit(payload: PluginLoopSubmit) {
    const head = payload.prompt.trim().split(/\s+/).slice(0, 8).join(' ');
    const firstAttachmentName = payload.attachments?.[0]?.name ?? '';
    const fallbackName = head.length > 0 ? head : firstAttachmentName || 'Untitled';
    const name =
      payload.pluginTitle && payload.pluginTitle.trim().length > 0
        ? payload.pluginTitle.trim()
        : fallbackName;
    const metadata: ProjectMetadata = {
      ...(payload.projectMetadata ?? {}),
      kind: payload.projectKind ?? payload.projectMetadata?.kind ?? 'prototype',
      nameSource: 'prompt',
      ...(payload.contextPlugins && payload.contextPlugins.length > 0
        ? { contextPlugins: payload.contextPlugins }
        : {}),
      ...(payload.contextMcpServers && payload.contextMcpServers.length > 0
        ? { contextMcpServers: payload.contextMcpServers }
        : {}),
      ...(payload.contextConnectors && payload.contextConnectors.length > 0
        ? { contextConnectors: payload.contextConnectors }
        : {}),
      ...(payload.workingDir ? { userWorkingDir: payload.workingDir } : {}),
    };
    onCreateProject({
      name,
      skillId: payload.skillId ?? null,
      designSystemId: payload.designSystemId ?? null,
      metadata,
      pendingPrompt: payload.prompt,
      ...(payload.pluginId ? { pluginId: payload.pluginId } : {}),
      ...(payload.appliedPluginSnapshotId
        ? { appliedPluginSnapshotId: payload.appliedPluginSnapshotId }
        : {}),
      ...(payload.pluginInputs ? { pluginInputs: payload.pluginInputs } : {}),
      ...(payload.attachments && payload.attachments.length > 0
        ? { pendingFiles: payload.attachments }
        : {}),
      autoSendFirstMessage: true,
    });
  }

  function finishOnboarding() {
    onCompleteOnboarding();
    changeView('home');
  }

  const avatarMenu = (
    <button
      type="button"
      className="settings-icon-btn"
      onClick={() => onOpenSettings()}
      title={t('entry.openSettingsTitle')}
      aria-label={t('entry.openSettingsAria')}
    >
      <Icon name="settings" size={17} />
    </button>
  );


  if (view === 'onboarding') {
    return (
      <div className="entry-shell entry-shell--no-header entry-shell--onboarding">
        <main className="entry-onboarding-modal" aria-label={t('settings.welcomeTitle')}>
          <OnboardingView
            config={config}
            agents={agents}
            daemonLive={daemonLive}
            onModeChange={onModeChange}
            onAgentChange={onAgentChange}
            onAgentModelChange={onAgentModelChange}
            onApiProtocolChange={onApiProtocolChange}
            onApiModelChange={onApiModelChange}
            onConfigPersist={onConfigPersist}
            onRefreshAgents={onRefreshAgents}
            renderDesignSystemCreation={renderDesignSystemCreation}
            onFinish={finishOnboarding}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="entry-shell entry-shell--no-header">
      <div className="entry">
        <EntryNavRail
          view={view}
          onViewChange={changeView}
          onNewProject={() => openNewProject()}
        />
        <main className="entry-main entry-main--scroll">
          <div className="entry-main__topbar">
            <div className="entry-main__topbar-chips">
              <GithubStarBadge />
              <a
                className="entry-discord-badge"
                href="https://discord.gg/mHAjSMV6gz"
                aria-label="Join the Open Design Discord"
                title="Join the Open Design Discord"
                data-testid="entry-discord-badge"
              >
                <Icon name="discord" size={14} className="entry-discord-badge__icon" />
                <span className="entry-discord-badge__label">Join Discord</span>
              </a>
              <InlineModelSwitcher
                config={config}
                agents={agents}
                daemonLive={daemonLive}
                onModeChange={onModeChange}
                onAgentChange={onAgentChange}
                onAgentModelChange={onAgentModelChange}
                onApiProtocolChange={onApiProtocolChange}
                onApiModelChange={onApiModelChange}
                onOpenSettings={onOpenSettings}
              />
              <button
                type="button"
                className="use-everywhere-chip"
                onClick={() => {
                  trackHomeToolbarClick(analytics.track, {
                    page_name: 'home',
                    area: 'toolbar',
                    element: 'use_everywhere',
                  });
                  openIntegrationTab('use-everywhere');
                }}
                title={t('entry.useEverywhereTitle')}
                aria-label={t('entry.useEverywhereAria')}
                data-testid="entry-use-everywhere-button"
              >
                <span className="use-everywhere-chip__icon" aria-hidden>
                  <Icon name="hammer" size={13} />
                </span>
                <span className="use-everywhere-chip__label">
                  {t('entry.useEverywhereTitle')}
                </span>
              </button>
            </div>
            {avatarMenu}
          </div>
          <div
            className={`entry-main__inner${
              view === 'home' ? '' : ' entry-main__inner--wide'
            }`}
          >
            {view === 'home' ? (
              <HomeView
                projects={projects}
                projectsLoading={projectsLoading}
                designSystems={designSystems}
                defaultDesignSystemId={defaultDesignSystemId}
                onSubmit={handlePluginLoopSubmit}
                onOpenProject={onOpenProject}
                onViewAllProjects={() => changeView('projects')}
                onBrowseRegistry={() => changeView('plugins')}
                onOpenNewProject={(tab) => {
                  // Stage B of plugin-driven-flow-plan: the rail's
                  // "From template" chip wires through here so the
                  // existing modal-based create flow still owns the
                  // template picker UI. Future tabs (e.g. live-artifact
                  // import) can reuse the same callback.
                  openNewProject(tab);
                }}
                promptHandoff={homePromptHandoff}
                skills={skills}
                skillsLoading={skillsLoading}
                connectors={connectors}
                promptTemplates={promptTemplates}
              />
            ) : null}
            {view === 'projects' ? (
              projectsLoading || skillsLoading || designSystemsLoading ? (
                <CenteredLoader label={t('common.loading')} />
              ) : (
                <div className="entry-section">
                  <header className="entry-section__head">
                    <h1 className="entry-section__title">{t('entry.navProjects')}</h1>
                  </header>
                  <DesignsTab
                    projects={projects}
                    skills={skills}
                    designSystems={designSystems}
                    onOpen={onOpenProject}
                    onOpenLiveArtifact={onOpenLiveArtifact}
                    onDelete={onDeleteProject}
                    onRename={onRenameProject}
                  />
                </div>
              )
            ) : null}
            {view === 'tasks' ? (
              <TasksView
                skills={skills}
                designTemplates={designTemplates}
                connectors={connectors}
                connectorsLoading={connectorsLoading}
              />
            ) : null}
            {view === 'plugins' ? (
              <PluginsView
                onCreatePlugin={startPluginAuthoring}
                onUsePlugin={usePluginFromLibrary}
                onCreatePluginShareProject={onCreatePluginShareProject}
              />
            ) : null}
            {view === 'design-systems' ? (
              designSystemsLoading ? (
                <CenteredLoader label={t('common.loading')} />
              ) : (
                <div className="entry-section">
                  <header className="entry-section__head">
                    <h1 className="entry-section__title">{t('entry.navDesignSystems')}</h1>
                  </header>
                  <DesignSystemsTab
                    systems={designSystems}
                    templates={templates}
                    selectedId={defaultDesignSystemId}
                    onSelect={onChangeDefaultDesignSystem}
                    onCreate={onCreateDesignSystem}
                    onOpenSystem={onOpenDesignSystem}
                    onSystemsRefresh={onDesignSystemsRefresh}
                    onPreview={(id) => setPreviewSystemId(id)}
                  />
                </div>
              )
            ) : null}
            {view === 'integrations' ? (
              <IntegrationsView
                config={config}
                initialTab={integrationTab}
                composioConfigLoading={composioConfigLoading}
                onPersistComposioKey={onPersistComposioKey}
              />
            ) : null}
          </div>
        </main>
      </div>
      {previewSystem ? (
        <DesignSystemPreviewModal
          system={previewSystem}
          onClose={() => setPreviewSystemId(null)}
        />
      ) : null}
      <NewProjectModal
        open={newProjectOpen}
        initialTab={newProjectInitialTab}
        skills={skills}
        designSystems={designSystems}
        defaultDesignSystemId={defaultDesignSystemId}
        templates={templates}
        {...(onDeleteTemplate ? { onDeleteTemplate } : {})}
        promptTemplates={promptTemplates}
        mediaProviders={config.mediaProviders}
        connectors={connectors}
        connectorsLoading={connectorsLoading}
        loading={skillsLoading}
        onCreate={handleCreate}
        onImportClaudeDesign={onImportClaudeDesign}
        {...(onImportFolder ? { onImportFolder } : {})}
        {...(onImportFolderResponse ? { onImportFolderResponse } : {})}
        onOpenConnectorsTab={() => {
          setNewProjectOpen(false);
          openIntegrationTab('connectors');
        }}
        onClose={() => setNewProjectOpen(false)}
      />
    </div>
  );
}

function OnboardingView({
  config,
  agents,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onConfigPersist,
  onRefreshAgents,
  renderDesignSystemCreation,
  onFinish,
}: {
  config: AppConfig;
  agents: AgentInfo[];
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string },
  ) => void;
  onApiProtocolChange: (protocol: ApiProtocol) => void;
  onApiModelChange: (model: string) => void;
  onConfigPersist: (cfg: AppConfig) => Promise<void> | void;
  onRefreshAgents: () => Promise<AgentInfo[]> | AgentInfo[];
  renderDesignSystemCreation?: (onBack: () => void) => ReactNode;
  onFinish: () => void;
}) {
  const t = useT();
  const analytics = useAnalytics();
  const [step, setStep] = useState(0);
  const [runtime, setRuntime] = useState<'local' | 'byok' | null>(null);
  const [designSource, setDesignSource] = useState<'github' | 'upload' | 'prompt' | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [cliScanStatus, setCliScanStatus] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [visibleAgentIds, setVisibleAgentIds] = useState<string[]>([]);
  const [providerTestState, setProviderTestState] = useState<
    | { status: 'idle' }
    | { status: 'running'; inputKey: string }
    | { status: 'done'; inputKey: string; result: ConnectionTestResponse }
  >({ status: 'idle' });
  const [providerModelsState, setProviderModelsState] = useState<
    | { status: 'idle' }
    | { status: 'running'; inputKey: string }
    | { status: 'done'; inputKey: string; result: ProviderModelsResponse }
  >({ status: 'idle' });
  const [providerModelsCache, setProviderModelsCache] = useState<
    Record<string, ProviderModelOption[]>
  >({});
  const [profile, setProfile] = useState({
    role: '',
    orgSize: '',
    useCase: [] as string[],
    source: '',
  });
  const agentRevealTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const cliScanTokenRef = useRef(0);
  const apiProtocol = config.apiProtocol ?? 'anthropic';
  const providerTestInputKey = [
    apiProtocol,
    config.baseUrl.trim(),
    config.model.trim(),
    config.apiKey.trim(),
    config.apiVersion?.trim() ?? '',
  ].join('\n');
  const providerModelsInputKey = [
    apiProtocol,
    config.baseUrl.trim().replace(/\/+$/, ''),
    config.apiKey.trim(),
    config.apiVersion?.trim() ?? '',
  ].join('\n');
  const canTestProvider =
    Boolean(config.apiKey.trim()) &&
    Boolean(config.baseUrl.trim()) &&
    Boolean(config.model.trim());
  const canFetchProviderModels =
    apiProtocol !== 'azure' &&
    apiProtocol !== 'ollama' &&
    Boolean(config.apiKey.trim()) &&
    Boolean(config.baseUrl.trim()) &&
    isLikelyHttpUrl(config.baseUrl);
  const visibleProviderTestState =
    providerTestState.status !== 'idle' &&
    providerTestState.inputKey === providerTestInputKey
      ? providerTestState
      : { status: 'idle' as const };
  const visibleProviderModelsState =
    providerModelsState.status !== 'idle' &&
    providerModelsState.inputKey === providerModelsInputKey
      ? providerModelsState
      : { status: 'idle' as const };
  const selectedProvider = KNOWN_PROVIDERS.find(
    (provider) =>
      provider.protocol === apiProtocol &&
      provider.baseUrl === (config.apiProviderBaseUrl ?? config.baseUrl),
  ) ?? null;
  const visibleAgents = agents.filter(
    (agent) => agent.available && visibleAgentIds.includes(agent.id),
  );
  const selectedAgent = visibleAgents.find((agent) => agent.id === config.agentId) ?? null;
  const selectedAgentChoice = selectedAgent ? (config.agentModels?.[selectedAgent.id] ?? {}) : {};

  useEffect(() => {
    return () => {
      agentRevealTimersRef.current.forEach((timer) => clearTimeout(timer));
      agentRevealTimersRef.current = [];
    };
  }, []);

  // Onboarding 4-step funnel (v2 doc). Fires one `page_view` per step
  // exposure. The fourth step (`generation`) lives in
  // `DesignSystemDetailView` because the user navigates out of this
  // component once the design system project opens; that emission
  // reads the same `onboarding_session_id` from sessionStorage.
  // `clearOnboardingSessionId` runs on `onFinish` / unmount so a
  // later DS visit unrelated to onboarding doesn't inherit the id.
  const onboardingSessionIdRef = useRef<string>('');
  if (!onboardingSessionIdRef.current) {
    onboardingSessionIdRef.current = getOrCreateOnboardingSessionId();
  }
  useEffect(() => {
    return () => {
      clearOnboardingSessionId();
    };
  }, []);
  useEffect(() => {
    const onboardingSessionId = onboardingSessionIdRef.current;
    if (!onboardingSessionId) return;
    let area: TrackingOnboardingArea;
    let stepIndex: TrackingOnboardingStepIndex;
    let stepName: TrackingOnboardingStepName;
    if (step === 0) {
      area = 'runtime';
      stepIndex = '1';
      stepName = 'connect';
    } else if (step === 1) {
      area = 'about_you';
      stepIndex = '2';
      stepName = 'about_you';
    } else {
      area = 'design_system';
      stepIndex = '3';
      stepName = 'design_system';
    }
    trackPageView(analytics.track, {
      page_name: 'onboarding',
      area,
      step_index: stepIndex,
      step_name: stepName,
      onboarding_session_id: onboardingSessionId,
    });
  }, [analytics.track, step]);

  const steps = [
    t('settings.onboardingStepConnect'),
    t('settings.onboardingStepProfile'),
    t('settings.onboardingStepDesignSystem'),
  ];
  const isLastStep = step === steps.length - 1;

  const runtimeItems: Array<{
    id: 'local' | 'byok';
    icon: 'hammer' | 'sliders';
    title: string;
    body: string;
    onSelect: () => void;
  }> = [
    {
      id: 'local',
      icon: 'hammer',
      title: t('settings.onboardingLocalTitle'),
      body: t('settings.onboardingLocalBody'),
      onSelect: () => {
        void scanCliAgents();
      },
    },
    {
      id: 'byok',
      icon: 'sliders',
      title: t('settings.onboardingByokTitle'),
      body: t('settings.onboardingByokBody'),
      onSelect: () => {
        setRuntime('byok');
        onModeChange('api');
      },
    },
  ];

  const designItems: Array<{
    id: 'github' | 'upload' | 'prompt';
    icon: 'github' | 'upload' | 'sparkles';
    title: string;
    body: string;
    onSelect: () => void;
  }> = [
    {
      id: 'github',
      icon: 'github',
      title: t('settings.onboardingGithubTitle'),
      body: t('settings.onboardingGithubBody'),
      onSelect: () => setDesignSource('github'),
    },
    {
      id: 'upload',
      icon: 'upload',
      title: t('settings.onboardingUploadTitle'),
      body: t('settings.onboardingUploadBody'),
      onSelect: () => setDesignSource('upload'),
    },
    {
      id: 'prompt',
      icon: 'sparkles',
      title: t('settings.onboardingPromptTitle'),
      body: t('settings.onboardingPromptBody'),
      onSelect: () => setDesignSource('prompt'),
    },
  ];
  const roleOptions = [
    { value: 'pm', label: t('settings.onboardingRolePm') },
    { value: 'designer', label: t('settings.onboardingRoleDesigner') },
    { value: 'engineer', label: t('settings.onboardingRoleEngineer') },
    { value: 'marketing', label: t('settings.onboardingRoleMarketing') },
    { value: 'growth', label: t('settings.onboardingRoleGrowth') },
    { value: 'ops', label: t('settings.onboardingRoleOps') },
    { value: 'founder', label: t('settings.onboardingRoleFounder') },
    { value: 'student', label: t('settings.onboardingRoleStudent') },
    { value: 'other', label: t('settings.onboardingRoleOther') },
  ];
  const orgSizeOptions = [
    { value: 'solo', label: t('settings.onboardingOrgSolo') },
    { value: 'team', label: t('settings.onboardingOrgTeam') },
    { value: 'startup', label: t('settings.onboardingOrgStartup') },
    { value: 'growth', label: t('settings.onboardingOrgGrowth') },
    { value: 'midmarket', label: t('settings.onboardingOrgMidMarket') },
    { value: 'enterprise', label: t('settings.onboardingOrgEnterprise') },
  ];
  const useCaseOptions = [
    { value: 'product', label: t('settings.onboardingUseProduct') },
    { value: 'design-system', label: t('settings.onboardingUseDesignSystem') },
    { value: 'prototype', label: t('settings.onboardingUsePrototype') },
    { value: 'landing', label: t('settings.onboardingUseLanding') },
    { value: 'marketing', label: t('settings.onboardingUseMarketing') },
    { value: 'ads', label: t('settings.onboardingUseAds') },
    { value: 'dashboard', label: t('settings.onboardingUseDashboard') },
    { value: 'deck', label: t('settings.onboardingUseDeck') },
    { value: 'engineering', label: t('settings.onboardingUseEngineering') },
    { value: 'agency', label: t('settings.onboardingUseAgency') },
  ];
  const sourceOptions = [
    { value: 'github', label: t('settings.onboardingSourceGithub') },
    { value: 'friend', label: t('settings.onboardingSourceFriend') },
    { value: 'social', label: t('settings.onboardingSourceSocial') },
    { value: 'product-hunt', label: t('settings.onboardingSourceProductHunt') },
    { value: 'community', label: t('settings.onboardingSourceCommunity') },
    { value: 'youtube', label: t('settings.onboardingSourceYoutube') },
    { value: 'blog', label: t('settings.onboardingSourceBlog') },
    { value: 'ai-tool', label: t('settings.onboardingSourceAiTool') },
    { value: 'search', label: t('settings.onboardingSourceSearch') },
    { value: 'event', label: t('settings.onboardingSourceEvent') },
  ];
  const byokProviderOptions = [
    { value: '', label: t('settings.customProvider') },
    ...KNOWN_PROVIDERS.filter((provider) => provider.protocol === apiProtocol).map((provider) => ({
      value: provider.baseUrl,
      label: provider.label,
    })),
  ];
  const agentModelOptions =
    selectedAgent?.models?.map((model) => ({
      value: model.id,
      label: model.label ?? model.id,
    })) ?? [];
  const fetchedProviderModels = providerModelsCache[providerModelsInputKey] ?? [];
  const byokModelOptions = mergeOnboardingProviderModelOptions(
    fetchedProviderModels,
    SUGGESTED_MODELS_BY_PROTOCOL[apiProtocol],
    config.model,
  ).map((model) => ({
    value: model.id,
    label: onboardingProviderModelLabel(model),
  }));

  function updateApiConfig(patch: Partial<ApiProtocolConfig>) {
    const protocol = config.apiProtocol ?? 'anthropic';
    const currentConfig: ApiProtocolConfig = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      apiVersion: config.apiVersion ?? '',
      apiProviderBaseUrl: config.apiProviderBaseUrl ?? null,
    };
    const nextProtocolConfig: ApiProtocolConfig = {
      ...currentConfig,
      ...patch,
    };
    const nextConfig: AppConfig = {
      ...config,
      mode: 'api',
      apiProtocol: protocol,
      apiKey: nextProtocolConfig.apiKey,
      baseUrl: nextProtocolConfig.baseUrl,
      model: nextProtocolConfig.model,
      apiVersion: protocol === 'azure' ? (nextProtocolConfig.apiVersion ?? '') : '',
      apiProviderBaseUrl: nextProtocolConfig.apiProviderBaseUrl ?? null,
      apiProtocolConfigs: {
        ...(config.apiProtocolConfigs ?? {}),
        [protocol]: nextProtocolConfig,
      },
    };
    void onConfigPersist(nextConfig);
  }

  function clearAgentRevealTimers() {
    agentRevealTimersRef.current.forEach((timer) => clearTimeout(timer));
    agentRevealTimersRef.current = [];
  }

  function handlePrimaryAction() {
    if (isLastStep) {
      onFinish();
      return;
    }
    setStep((current) => current + 1);
  }

  async function scanCliAgents() {
    const scanToken = cliScanTokenRef.current + 1;
    cliScanTokenRef.current = scanToken;
    clearAgentRevealTimers();
    setRuntime('local');
    onModeChange('daemon');
    setCliScanStatus('scanning');
    setVisibleAgentIds([]);
    try {
      const nextAgents = await onRefreshAgents();
      if (cliScanTokenRef.current !== scanToken) return;
      const availableAgents = nextAgents.filter((agent) => agent.available);
      if (availableAgents.length === 0) {
        setCliScanStatus('done');
        return;
      }
      availableAgents.forEach((agent, index) => {
        const timer = setTimeout(() => {
          if (cliScanTokenRef.current !== scanToken) return;
          setVisibleAgentIds((current) =>
            current.includes(agent.id) ? current : [...current, agent.id],
          );
          if (index === availableAgents.length - 1) {
            setCliScanStatus('done');
          }
        }, 110 * (index + 1));
        agentRevealTimersRef.current.push(timer);
      });
    } catch {
      if (cliScanTokenRef.current === scanToken) {
        setCliScanStatus('done');
      }
    }
  }

  async function testProviderInline() {
    if (!canTestProvider || providerTestState.status === 'running') return;
    const inputKey = providerTestInputKey;
    setProviderTestState({ status: 'running', inputKey });
    try {
      const result = await testApiProvider({
        protocol: apiProtocol,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        apiVersion:
          apiProtocol === 'azure'
            ? config.apiVersion?.trim() || undefined
            : undefined,
      });
      setProviderTestState({ status: 'done', inputKey, result });
    } catch (error) {
      setProviderTestState({
        status: 'done',
        inputKey,
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          model: config.model,
          detail: error instanceof Error ? error.message : 'Test request failed',
        },
      });
    }
  }

  async function fetchProviderModelsInline() {
    if (!canFetchProviderModels || providerModelsState.status === 'running') return;
    const inputKey = providerModelsInputKey;
    const cachedModels = providerModelsCache[inputKey];
    if (cachedModels) {
      setProviderModelsState({
        status: 'done',
        inputKey,
        result: {
          ok: true,
          kind: 'success',
          latencyMs: 0,
          models: cachedModels,
        },
      });
      return;
    }
    setProviderModelsState({ status: 'running', inputKey });
    try {
      const result = await fetchProviderModels({
        protocol: apiProtocol,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      });
      if (result.ok && result.models?.length) {
        setProviderModelsCache((current) => ({
          ...current,
          [inputKey]: result.models ?? [],
        }));
      }
      setProviderModelsState({ status: 'done', inputKey, result });
    } catch (error) {
      setProviderModelsState({
        status: 'done',
        inputKey,
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          detail: error instanceof Error ? error.message : 'Model list request failed',
        },
      });
    }
  }

  const primaryActionLabel = isLastStep
    ? t('settings.onboardingFinish')
    : t('settings.onboardingContinue');

  return (
    <section className="onboarding-view" aria-labelledby="onboarding-title">
      <header className="onboarding-view__hero">
        {t('settings.welcomeKicker') ? (
          <span className="onboarding-view__kicker">{t('settings.welcomeKicker')}</span>
        ) : null}
        <h1 id="onboarding-title">{t('settings.welcomeTitle')}</h1>
        {t('settings.welcomeSubtitle') ? <p>{t('settings.welcomeSubtitle')}</p> : null}
      </header>
      <ol className="onboarding-view__steps" aria-label={t('settings.welcomeTitle')}>
        {steps.map((label, index) => (
          <li key={label} className={index === step ? 'is-active' : index < step ? 'is-done' : ''}>
            <span>{index + 1}</span>
            <button type="button" onClick={() => setStep(index)}>
              {label}
            </button>
          </li>
        ))}
      </ol>
      <div className="onboarding-view__body">
        <div className="onboarding-view__content">
          {step === 0 ? (
            <div className="onboarding-view__panel">
              <OnboardingPanelHeader
                title={t('settings.onboardingConnectTitle')}
                body={t('settings.onboardingConnectBody')}
              />
              <div className="onboarding-view__runtime-stack">
                <div className="onboarding-view__alternatives">
                  {runtimeItems.map((item) => (
                    <OnboardingChoiceCard
                      key={item.id}
                      icon={item.icon}
                      title={item.title}
                      body={item.body}
                      selected={runtime === item.id}
                      onClick={item.onSelect}
                    />
                  ))}
                </div>
                {runtime === 'local' ? (
                  <OnboardingCliSetupPanel
                    agents={visibleAgents}
                    daemonLive={daemonLive}
                    selectedAgentId={config.agentId}
                    selectedAgent={selectedAgent}
                    selectedModel={selectedAgentChoice.model ?? selectedAgent?.models?.[0]?.id ?? ''}
                    modelOptions={agentModelOptions}
                    scanStatus={cliScanStatus}
                    onRefresh={() => void scanCliAgents()}
                    onSelectAgent={(agentId) => {
                      onModeChange('daemon');
                      onAgentChange(agentId);
                    }}
                    onSelectModel={(model) => {
                      if (!selectedAgent) return;
                      onAgentModelChange(selectedAgent.id, { model });
                    }}
                  />
                ) : null}
                {runtime === 'byok' ? (
                  <OnboardingByokSetupPanel
                    apiProtocol={apiProtocol}
                    apiKey={config.apiKey}
                    baseUrl={config.baseUrl}
                    model={config.model}
                    selectedProvider={selectedProvider}
                    providerOptions={byokProviderOptions}
                    apiKeyVisible={apiKeyVisible}
                    onToggleApiKey={() => setApiKeyVisible((current) => !current)}
                    onProtocolChange={(protocol) => {
                      onApiProtocolChange(protocol);
                    }}
                    onProviderChange={(baseUrl) => {
                      const provider = KNOWN_PROVIDERS.find(
                        (item) => item.protocol === apiProtocol && item.baseUrl === baseUrl,
                      );
                      updateApiConfig({
                        baseUrl: provider?.baseUrl ?? '',
                        model: provider?.model ?? '',
                        apiProviderBaseUrl: provider?.baseUrl ?? null,
                      });
                    }}
                    onApiKeyChange={(apiKey) => updateApiConfig({ apiKey })}
                    onModelChange={(model) => {
                      onApiModelChange(model);
                      updateApiConfig({ model });
                    }}
                    onBaseUrlChange={(baseUrl) =>
                      updateApiConfig({ baseUrl, apiProviderBaseUrl: null })
                    }
                    modelOptions={byokModelOptions}
                    testState={visibleProviderTestState}
                    canTest={canTestProvider}
                    onTest={() => void testProviderInline()}
                    modelsState={visibleProviderModelsState}
                    canFetchModels={canFetchProviderModels}
                    onFetchModels={() => void fetchProviderModelsInline()}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="onboarding-view__panel">
              <OnboardingPanelHeader
                title={t('settings.onboardingProfileTitle')}
                body={t('settings.onboardingProfileBody')}
              />
              <div className="onboarding-view__form-grid">
                <OnboardingDropdown
                  label={t('settings.onboardingRoleLabel')}
                  placeholder={t('settings.onboardingSelectPlaceholder')}
                  value={profile.role}
                  options={roleOptions}
                  onChange={(value) => setProfile((current) => ({ ...current, role: value }))}
                />
                <OnboardingDropdown
                  label={t('settings.onboardingOrgSizeLabel')}
                  placeholder={t('settings.onboardingSelectPlaceholder')}
                  value={profile.orgSize}
                  options={orgSizeOptions}
                  onChange={(value) => setProfile((current) => ({ ...current, orgSize: value }))}
                />
                <OnboardingDropdown
                  label={t('settings.onboardingUseCaseLabel')}
                  placeholder={t('settings.onboardingSelectMultiplePlaceholder')}
                  value={profile.useCase}
                  options={useCaseOptions}
                  multiple
                  onChange={(value) => {
                    if (!Array.isArray(value)) return;
                    setProfile((current) => ({ ...current, useCase: value }));
                  }}
                />
                <OnboardingDropdown
                  label={t('settings.onboardingSourceLabel')}
                  placeholder={t('settings.onboardingSelectPlaceholder')}
                  value={profile.source}
                  options={sourceOptions}
                  onChange={(value) => setProfile((current) => ({ ...current, source: value }))}
                />
              </div>
            </div>
          ) : null}

          {step === 2 && renderDesignSystemCreation ? (
            <div className="onboarding-view__design-system-create">
              <div className="onboarding-view__ds-intro">
                <OnboardingPanelHeader
                  title={t('settings.onboardingDesignTitle')}
                  body={t('settings.onboardingDesignBody')}
                />
                <div className="onboarding-view__ds-points">
                  <div>
                    <strong>{t('settings.onboardingDesignIntroGenerateTitle')}</strong>
                    <span>{t('settings.onboardingDesignIntroGenerateBody')}</span>
                  </div>
                  <div>
                    <strong>{t('settings.onboardingDesignIntroReuseTitle')}</strong>
                    <span>{t('settings.onboardingDesignIntroReuseBody')}</span>
                  </div>
                </div>
                <button type="button" className="onboarding-view__ds-skip" onClick={onFinish}>
                  {t('settings.onboardingSkip')}
                </button>
              </div>
              {renderDesignSystemCreation(() => setStep(1))}
            </div>
          ) : null}

          {step === 2 && !renderDesignSystemCreation ? (
            <div className="onboarding-view__panel">
              <OnboardingPanelHeader
                title={t('settings.onboardingDesignTitle')}
                body={t('settings.onboardingDesignBody')}
              />
              <div className="onboarding-view__grid">
                {designItems.map((item) => (
                  <OnboardingChoiceCard
                    key={item.id}
                    icon={item.icon}
                    title={item.title}
                    body={item.body}
                    selected={designSource === item.id}
                    onClick={item.onSelect}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {step === 2 && renderDesignSystemCreation ? null : (
            <div className="onboarding-view__actions">
              <button
                type="button"
                className="onboarding-view__secondary"
                onClick={() => (step === 0 ? onFinish() : setStep((current) => current - 1))}
              >
                {step === 0 ? t('settings.onboardingSkip') : t('settings.onboardingBack')}
              </button>
              <button
                type="button"
                className="onboarding-view__primary"
                onClick={handlePrimaryAction}
              >
                <span>{primaryActionLabel}</span>
                <Icon name={isLastStep ? 'check' : 'chevron-right'} size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function OnboardingCliSetupPanel({
  agents,
  daemonLive,
  selectedAgentId,
  selectedAgent,
  selectedModel,
  modelOptions,
  scanStatus,
  onRefresh,
  onSelectAgent,
  onSelectModel,
}: {
  agents: AgentInfo[];
  daemonLive: boolean;
  selectedAgentId: string | null;
  selectedAgent: AgentInfo | null;
  selectedModel: string;
  modelOptions: Array<{ value: string; label: string }>;
  scanStatus: 'idle' | 'scanning' | 'done';
  onRefresh: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectModel: (model: string) => void;
}) {
  const t = useT();
  const scanning = scanStatus === 'scanning';
  const showEmpty = scanStatus === 'done' && agents.length === 0;
  return (
    <div className="onboarding-view__setup-panel">
      <div className="onboarding-view__setup-head">
        <div>
          <strong>{t('settings.localCli')}</strong>
          <p>{daemonLive ? t('settings.codeAgentHint') : t('settings.modeDaemonOffline')}</p>
        </div>
        <button
          type="button"
          className={`onboarding-view__mini-button${scanning ? ' is-loading' : ''}`}
          onClick={onRefresh}
          disabled={scanning}
        >
          {scanning ? t('settings.rescanRunning') : t('settings.rescan')}
        </button>
      </div>
      {scanning ? (
        <div className="onboarding-view__scan-copy" role="status">
          <p className="onboarding-view__scan-status">
            <Icon name="spinner" size={13} className="icon-spin" />
            <span>{t('settings.rescanRunning')}</span>
          </p>
          <p className="onboarding-view__scan-hint">
            {t('settings.onboardingCliScanHint')}
          </p>
        </div>
      ) : null}
      {agents.length > 0 ? (
        <div className="onboarding-view__agent-strip">
          {agents.map((agent, index) => (
            <button
              key={agent.id}
              type="button"
              className={`onboarding-view__agent-chip${
                selectedAgentId === agent.id ? ' is-selected' : ''
              }`}
              style={{ animationDelay: `${index * 45}ms` }}
              onClick={() => onSelectAgent(agent.id)}
              aria-pressed={selectedAgentId === agent.id}
            >
              <AgentIcon id={agent.id} size={22} />
              <span>
                <strong>{agent.name}</strong>
                <small>{agent.version ?? t('common.installed')}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {showEmpty ? (
        <div className="onboarding-view__empty-slice">
          {t('settings.noAgentsDetected')}
        </div>
      ) : null}
      {selectedAgent && modelOptions.length > 0 ? (
        <OnboardingDropdown
          label={`${t('settings.modelPicker')} · ${selectedAgent.name}`}
          placeholder={t('settings.modelSourceFallback')}
          value={selectedModel}
          options={modelOptions}
          onChange={onSelectModel}
        />
      ) : null}
    </div>
  );
}

function OnboardingByokSetupPanel({
  apiProtocol,
  apiKey,
  baseUrl,
  model,
  selectedProvider,
  providerOptions,
  apiKeyVisible,
  onToggleApiKey,
  onProtocolChange,
  onProviderChange,
  onApiKeyChange,
  onModelChange,
  onBaseUrlChange,
  modelOptions,
  testState,
  canTest,
  onTest,
  modelsState,
  canFetchModels,
  onFetchModels,
}: {
  apiProtocol: ApiProtocol;
  apiKey: string;
  baseUrl: string;
  model: string;
  selectedProvider: KnownProvider | null;
  providerOptions: Array<{ value: string; label: string }>;
  modelOptions: Array<{ value: string; label: string }>;
  apiKeyVisible: boolean;
  onToggleApiKey: () => void;
  onProtocolChange: (protocol: ApiProtocol) => void;
  onProviderChange: (baseUrl: string) => void;
  onApiKeyChange: (apiKey: string) => void;
  onModelChange: (model: string) => void;
  onBaseUrlChange: (baseUrl: string) => void;
  testState:
    | { status: 'idle' }
    | { status: 'running'; inputKey: string }
    | { status: 'done'; inputKey: string; result: ConnectionTestResponse };
  canTest: boolean;
  onTest: () => void;
  modelsState:
    | { status: 'idle' }
    | { status: 'running'; inputKey: string }
    | { status: 'done'; inputKey: string; result: ProviderModelsResponse };
  canFetchModels: boolean;
  onFetchModels: () => void;
}) {
  const t = useT();
  const running = testState.status === 'running';
  const fetchingModels = modelsState.status === 'running';
  return (
    <div className="onboarding-view__setup-panel">
      <div className="onboarding-view__setup-head">
        <div>
          <strong>{t('settings.modeApiMeta')}</strong>
          <p>{t('settings.modeApi')}</p>
        </div>
        <div className="onboarding-view__setup-head-actions">
          <button
            type="button"
            className={`onboarding-view__mini-button${fetchingModels ? ' is-loading' : ''}`}
            onClick={onFetchModels}
            disabled={fetchingModels || !canFetchModels}
            title={t('settings.fetchModelsTitle')}
          >
            {fetchingModels ? t('settings.fetchModelsRunning') : t('settings.fetchModels')}
          </button>
          <button
            type="button"
            className={`onboarding-view__mini-button${running ? ' is-loading' : ''}`}
            onClick={onTest}
            disabled={running || !canTest}
            title={t('settings.testTitle')}
          >
            {running ? t('settings.testRunning') : t('settings.test')}
          </button>
        </div>
      </div>
      <div
        className="onboarding-view__protocol-strip"
        role="tablist"
        aria-label={t('settings.protocolAria')}
      >
        {API_PROTOCOL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={apiProtocol === tab.id}
            className={apiProtocol === tab.id ? 'is-selected' : ''}
            onClick={() => onProtocolChange(tab.id)}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <OnboardingDropdown
        label={t('settings.quickFillProvider')}
        placeholder={t('settings.customProvider')}
        value={selectedProvider?.baseUrl ?? ''}
        options={providerOptions}
        onChange={onProviderChange}
      />
      <label className="onboarding-view__inline-field">
        <span>{t('settings.apiKey')}</span>
        <span className="onboarding-view__field-row">
          <input
            type={apiKeyVisible ? 'text' : 'password'}
            placeholder={API_KEY_PLACEHOLDERS[apiProtocol]}
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
          />
          <button type="button" onClick={onToggleApiKey}>
            {apiKeyVisible ? t('settings.hide') : t('settings.show')}
          </button>
        </span>
      </label>
      <div className="onboarding-view__compact-fields">
        <label className="onboarding-view__inline-field">
          <span>{t('settings.baseUrl')}</span>
          <input
            type="url"
            inputMode="url"
            value={baseUrl}
            placeholder={selectedProvider?.baseUrl ?? 'https://api.anthropic.com'}
            onChange={(event) => onBaseUrlChange(event.target.value)}
          />
        </label>
        {modelOptions.length > 0 ? (
          <OnboardingDropdown
            label={t('settings.model')}
            placeholder={selectedProvider?.model ?? 'claude-sonnet-4-5'}
            value={model}
            options={modelOptions}
            onChange={onModelChange}
            placement="top"
          />
        ) : (
          <label className="onboarding-view__inline-field">
            <span>{t('settings.model')}</span>
            <input
              type="text"
              value={model}
              placeholder={selectedProvider?.model ?? 'claude-sonnet-4-5'}
              onChange={(event) => onModelChange(event.target.value.trim())}
            />
          </label>
        )}
      </div>
      {modelsState.status === 'running' ? (
        <p className="onboarding-view__test-status is-running" role="status">
          {t('settings.fetchModelsRunning')}
        </p>
      ) : modelsState.status === 'done' ? (
        <p
          className={`onboarding-view__test-status is-${onboardingProviderModelsVariant(
            modelsState.result,
          )}`}
          role={modelsState.result.ok ? 'status' : 'alert'}
        >
          {renderOnboardingProviderModelsMessage(t, modelsState.result)}
        </p>
      ) : null}
      {testState.status === 'running' ? (
        <p className="onboarding-view__test-status is-running" role="status">
          {t('settings.testRunning')}
        </p>
      ) : testState.status === 'done' ? (
        <p
          className={`onboarding-view__test-status is-${onboardingTestVariant(
            testState.result,
          )}`}
          role={testState.result.ok ? 'status' : 'alert'}
        >
          {renderOnboardingProviderTestMessage(t, testState.result, model)}
        </p>
      ) : null}
    </div>
  );
}

function onboardingTestVariant(
  result: ConnectionTestResponse,
): 'success' | 'warn' | 'error' {
  if (result.ok) return 'success';
  if (result.kind === 'rate_limited') return 'warn';
  return 'error';
}

function onboardingProviderModelsVariant(
  result: ProviderModelsResponse,
): 'success' | 'warn' | 'error' {
  if (result.ok) return 'success';
  if (result.kind === 'rate_limited' || result.kind === 'no_models') return 'warn';
  return 'error';
}

function isLikelyHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function mergeOnboardingProviderModelOptions(
  fetchedModels: readonly ProviderModelOption[],
  suggestedModelIds: readonly string[],
  currentModel: string,
): ProviderModelOption[] {
  const seen = new Set<string>();
  const out: ProviderModelOption[] = [];
  const add = (model: ProviderModelOption) => {
    const id = model.id.trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, label: model.label.trim() || id });
  };
  for (const model of fetchedModels) add(model);
  for (const id of suggestedModelIds) add({ id, label: id });
  if (currentModel.trim()) add({ id: currentModel.trim(), label: currentModel.trim() });
  return out;
}

function onboardingProviderModelLabel(model: ProviderModelOption): string {
  return model.label && model.label !== model.id
    ? `${model.label} (${model.id})`
    : model.id;
}

function renderOnboardingProviderTestMessage(
  t: ReturnType<typeof useT>,
  result: ConnectionTestResponse,
  fallbackModel: string,
): string {
  const ms = Math.max(0, Math.round(result.latencyMs));
  const sample = result.sample ?? '';
  const testedModel = result.model ?? fallbackModel;
  if (result.ok) {
    const baseMessage = t('settings.testSuccessApi', { ms, sample });
    return result.detail ? `${baseMessage} ${result.detail}` : baseMessage;
  }
  switch (result.kind) {
    case 'auth_failed':
      return t('settings.testAuthFailed');
    case 'forbidden':
      return t('settings.testForbidden');
    case 'not_found_model':
      return t('settings.testNotFoundModel', { model: testedModel });
    case 'invalid_model_id':
      return t('settings.testInvalidModelId', { model: testedModel });
    case 'invalid_base_url':
      return t('settings.testInvalidBaseUrl');
    case 'rate_limited':
      return t('settings.testRateLimited');
    case 'upstream_unavailable':
      return t('settings.testUpstream', { status: result.status ?? 0 });
    case 'timeout':
      return t('settings.testTimeout', { ms });
    default:
      return t('settings.testUnknown', { detail: result.detail ?? '' });
  }
}

function renderOnboardingProviderModelsMessage(
  t: ReturnType<typeof useT>,
  result: ProviderModelsResponse,
): string {
  if (result.ok) {
    return t('settings.fetchModelsSuccess', {
      count: result.models?.length ?? 0,
    });
  }
  switch (result.kind) {
    case 'auth_failed':
      return t('settings.testAuthFailed');
    case 'forbidden':
      return t('settings.testForbidden');
    case 'invalid_base_url':
      return t('settings.testInvalidBaseUrl');
    case 'rate_limited':
      return t('settings.testRateLimited');
    case 'upstream_unavailable':
      return t('settings.testUpstream', { status: result.status ?? 0 });
    case 'timeout':
      return t('settings.testTimeout', {
        ms: Math.max(0, Math.round(result.latencyMs)),
      });
    case 'no_models':
      return t('settings.fetchModelsEmpty');
    case 'unsupported_protocol':
      return t('settings.fetchModelsUnsupported');
    default:
      return t('settings.fetchModelsFailed', { detail: result.detail ?? '' });
  }
}

function OnboardingPanelHeader({ title, body }: { title: string; body: string }) {
  return (
    <div className="onboarding-view__panel-head">
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

type OnboardingDropdownBaseProps = {
  label: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  placement?: 'bottom' | 'top';
};

type OnboardingDropdownProps =
  | (OnboardingDropdownBaseProps & {
      value: string;
      onChange: (value: string) => void;
      multiple?: false;
    })
  | (OnboardingDropdownBaseProps & {
      value: string[];
      onChange: (value: string[]) => void;
      multiple: true;
    });

function OnboardingDropdown(props: OnboardingDropdownProps) {
  const {
    label,
    placeholder,
    value,
    options,
    placement = 'bottom',
    multiple = false,
  } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];
  const selectedOptions = options.filter((option) => selectedValues.includes(option.value));
  const selectedOption = selectedOptions[0];
  const hasValue = selectedOptions.length > 0;
  const selectedLabel = multiple
    ? selectedOptions.map((option) => option.label).join(', ')
    : selectedOption?.label;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="onboarding-view__select-field" data-placement={placement} ref={rootRef}>
      <span className="onboarding-view__select-label">{label}</span>
      <button
        type="button"
        className={`onboarding-view__select-trigger${open ? ' is-open' : ''}${
          hasValue ? ' has-value' : ''
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedLabel || placeholder}</span>
        <Icon name="chevron-down" size={16} />
      </button>
      {open ? (
        <div
          className="onboarding-view__select-menu"
          role="listbox"
          aria-label={label}
          aria-multiselectable={multiple || undefined}
        >
          {options.map((option) => {
            const selected = selectedValues.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                className={`onboarding-view__select-option${selected ? ' is-selected' : ''}`}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  if (props.multiple) {
                    props.onChange(
                      selected
                        ? selectedValues.filter((selectedValue) => selectedValue !== option.value)
                        : [...selectedValues, option.value],
                    );
                    return;
                  }
                  props.onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {selected ? <Icon name="check" size={15} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function OnboardingChoiceCard({
  icon,
  title,
  body,
  actionLabel,
  selected,
  badge,
  featured,
  onClick,
}: {
  icon: 'orbit' | 'hammer' | 'sliders' | 'github' | 'upload' | 'sparkles';
  title: string;
  body: string;
  actionLabel?: string;
  selected: boolean;
  badge?: string;
  featured?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`onboarding-view__card${selected ? ' is-selected' : ''}${
        featured ? ' onboarding-view__card--featured' : ''
      }`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className="onboarding-view__icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="onboarding-view__card-copy">
        <span className="onboarding-view__card-top">
          <strong>{title}</strong>
          {badge ? <span className="onboarding-view__badge">{badge}</span> : null}
        </span>
        <small>{body}</small>
      </span>
      {actionLabel ? <span className="onboarding-view__card-action">{actionLabel}</span> : null}
      {selected ? (
        <span className="onboarding-view__check">
          <Icon name="check" size={14} />
        </span>
      ) : null}
    </button>
  );
}
