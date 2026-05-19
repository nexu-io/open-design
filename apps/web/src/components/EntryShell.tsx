// EntryShell — the centered-hero entry layout.
//
// This component owns the entire JSX render and local UI state for
// the redesigned home view (left rail + sticky settings cog + hero +
// recent projects + plugins section + new-project modal). It is
// intentionally a sibling of `EntryView` so that upstream `main`
// changes to `EntryView` (props, connector lifecycle, helpers, exports)
// can be rebased without touching this file. `EntryView` becomes a
// thin wrapper that passes data and callbacks through to this shell.

import { useEffect, useMemo, useState } from 'react';
import {
  defaultScenarioPluginIdForKind,
  type ConnectorDetail,
  type InstalledPluginRecord,
} from '@open-design/contracts';
import {
  isOpenDesignHostAvailable,
  pickAndImportHostProject,
  type OpenDesignHostProjectImportSuccess,
} from '@open-design/host';
import { useT } from '../i18n';
import { navigate, useRoute } from '../router';
import type {
  AgentInfo,
  ApiProtocol,
  AppConfig,
  AppTheme,
  DesignSystemSummary,
  ExecMode,
  Project,
  ProjectMetadata,
  ProjectTemplate,
  PromptTemplateSummary,
  SkillSummary,
} from '../types';
import { formatPickAndImportFailure } from '../utils/pickAndImportError';
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
import { Toast } from './Toast';

// The topbar chips (GitHub star, model switcher, Use everywhere)
// collapse into the settings dropdown when the viewport gets
// narrow. The transition is driven entirely by CSS @media queries
// in `entry-layout.css` so server and client render identical
// markup — both surfaces are always present, and CSS toggles
// `display` based on `--compact-topbar` breakpoint (900px).

// Default scenario plugin for each project kind. The mapping lives in
// `@open-design/contracts` so the daemon's `/api/projects` and
// `/api/runs` fallbacks resolve to the same plugin id when no
// `pluginId` is on the request body — plan §3.3 of
// `specs/current/plugin-driven-flow-plan.md`.
function defaultPluginIdForKind(metadata: ProjectMetadata): string | null {
  return defaultScenarioPluginIdForKind(metadata.kind);
}

function defaultPluginInputsForCreate(
  input: CreateInput,
  pluginId: string | null,
): Record<string, unknown> | null {
  if (pluginId !== 'od-media-generation') return null;
  const kind = input.metadata.kind;
  if (kind !== 'image' && kind !== 'video' && kind !== 'audio') return null;

  const promptTemplate = input.metadata.promptTemplate;
  const subject =
    promptTemplate?.prompt?.trim()
    || input.name.trim()
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
  ) => void;
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
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onChangeDefaultDesignSystem: (id: string) => void;
  onCreateDesignSystem?: () => void;
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
      | 'about',
  ) => void;
}

export function EntryShell({
  skills,
  designTemplates,
  designSystems,
  projects,
  templates,
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
  onOpenDesignSystem,
  onDesignSystemsRefresh,
  onPersistComposioKey,
  onOpenSettings,
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
  const [folderImportError, setFolderImportError] = useState<{
    message: string;
    details?: string;
  } | null>(null);
  const [chipImporting, setChipImporting] = useState(false);
  const [integrationTab, setIntegrationTab] = useState<IntegrationTab>(integrationInitialTab);
  const [homePromptHandoff, setHomePromptHandoff] = useState<HomePromptHandoff | null>(null);
  function changeView(next: EntryViewKind) {
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
    const pluginId = defaultPluginIdForKind(input.metadata);
    const pluginInputs = defaultPluginInputsForCreate(input, pluginId);
    onCreateProject({
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
    };
    onCreateProject({
      name,
      skillId: payload.skillId ?? null,
      designSystemId: null,
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

  // Stage B of plugin-driven-flow-plan: the rail's "From folder" chip
  // dispatcher. Prefers the Electron-native folder picker when
  // available so a single click lands the user in an imported
  // project. Browser-only shells fall back to the existing modal
  // path so the user can paste a baseDir.
  async function handleChipFolderImport() {
    if (chipImporting) return;
    // PR #974 trust boundary: the renderer cannot pick a folder directly
    // anymore — the host exposes `pickAndImport` instead (atomic pick +
    // HMAC-gated import). On the web, fall back to opening the New
    // Project modal so the user can paste a baseDir manually.
    if (
      isOpenDesignHostAvailable() &&
      onImportFolderResponse
    ) {
      setChipImporting(true);
      try {
        const result = await pickAndImportHostProject();
        if (!result || ('canceled' in result && result.canceled === true)) return;
        if (result.ok === true) {
          await onImportFolderResponse(result);
          return;
        }
        setFolderImportError(formatPickAndImportFailure(result));
      } finally {
        setChipImporting(false);
      }
      return;
    }
    openNewProject('prototype');
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
                onClick={() => openIntegrationTab('use-everywhere')}
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
                onSubmit={handlePluginLoopSubmit}
                onOpenProject={onOpenProject}
                onViewAllProjects={() => changeView('projects')}
                onBrowseRegistry={() => changeView('plugins')}
                onImportFolder={handleChipFolderImport}
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
        promptTemplates={promptTemplates}
        connectors={connectors}
        connectorsLoading={connectorsLoading}
        loading={skillsLoading}
        onCreate={handleCreate}
        onImportClaudeDesign={onImportClaudeDesign}
        {...(onImportFolder ? { onImportFolder } : {})}
        onOpenConnectorsTab={() => {
          setNewProjectOpen(false);
          openIntegrationTab('connectors');
        }}
        onClose={() => setNewProjectOpen(false)}
      />
      {folderImportError ? (
        <Toast
          message={folderImportError.message}
          details={folderImportError.details ?? null}
          role="alert"
          onDismiss={() => setFolderImportError(null)}
        />
      ) : null}
    </div>
  );
}
