// EntryShell — the centered-hero entry layout.
//
// This component owns the entire JSX render and local UI state for
// the redesigned home view (left rail + sticky settings cog + hero +
// recent projects + plugins section + new-project modal). It is
// intentionally a sibling of `EntryView` so that upstream `main`
// changes to `EntryView` (props, connector lifecycle, helpers, exports)
// can be rebased without touching this file. `EntryView` becomes a
// thin wrapper that passes data and callbacks through to this shell.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultScenarioPluginIdForKind,
  type ConnectorDetail,
  type InstalledPluginRecord,
} from '@open-design/contracts';
import { LOCALE_LABEL, LOCALES, useI18n, useT, type Locale } from '../i18n';
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
import { apiProtocolLabel } from '../utils/apiProtocol';
import { CenteredLoader } from './Loading';
import { DesignsTab } from './DesignsTab';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import { DesignSystemsTab } from './DesignSystemsTab';
import { EntryNavRail, type EntryView as EntryViewKind } from './EntryNavRail';
import { GithubStarBadge } from './GithubStarBadge';
import { formatStars, GITHUB_REPO_URL, useGithubStars } from './useGithubStars';
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
import type { CreateInput } from './NewProjectPanel';
import type { PluginLoopSubmit } from './PluginLoopHome';
import type {
  PluginShareAction,
  PluginShareProjectOutcome,
} from '../state/projects';
import { TasksView } from './TasksView';

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
// Mirrors the segmented control in `SettingsDialog` so the same three
// choices (System / Light / Dark) are available from both surfaces.
type AppearanceThemeLabel =
  | 'settings.themeSystem'
  | 'settings.themeLight'
  | 'settings.themeDark';

const APPEARANCE_THEMES: ReadonlyArray<{
  value: AppTheme;
  labelKey: AppearanceThemeLabel;
}> = [
  { value: 'system', labelKey: 'settings.themeSystem' },
  { value: 'light', labelKey: 'settings.themeLight' },
  { value: 'dark', labelKey: 'settings.themeDark' },
];

const APPEARANCE_LABEL: Record<AppTheme, AppearanceThemeLabel> = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
};

type Translator = ReturnType<typeof useT>;

// Mirrors the chip text the InlineModelSwitcher renders, so the
// collapsed menu item inside the settings dropdown can advertise
// the same active mode/agent/model without duplicating the
// labelling logic. Returned as a structured tuple so the menu can
// style the primary text and meta independently.
function describeModelChip(
  config: AppConfig,
  agents: AgentInfo[],
  t: Translator,
): { mode: string; primary: string; model: string } {
  const currentAgent = agents.find((a) => a.id === config.agentId) ?? null;
  const currentChoice =
    (config.agentId && config.agentModels?.[config.agentId]) || {};
  const currentModelId =
    currentChoice.model ?? currentAgent?.models?.[0]?.id ?? null;
  const currentModelLabel =
    currentAgent?.models?.find((m) => m.id === currentModelId)?.label ?? null;

  if (config.mode === 'daemon') {
    return {
      mode: t('inlineSwitcher.chipCli'),
      primary: currentAgent?.name ?? t('inlineSwitcher.noAgent'),
      model:
        currentModelLabel && currentModelId !== 'default'
          ? currentModelLabel
          : t('inlineSwitcher.modelDefault'),
    };
  }
  const apiProtocol = config.apiProtocol ?? 'anthropic';
  // KNOWN_PROVIDERS is consulted indirectly via apiProtocolLabel —
  // looking it up here for the menu meta would diverge from the
  // chip, so we keep the surface identical to InlineModelSwitcher.
  return {
    mode: t('inlineSwitcher.chipByok'),
    primary: apiProtocolLabel(apiProtocol),
    model: config.model.trim() || t('inlineSwitcher.modelDefault'),
  };
}

interface Props {
  skills: SkillSummary[];
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
  onImportFolder?: (baseDir: string) => Promise<boolean> | boolean;
  onOpenProject: (id: string) => void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => void;
  onChangeDefaultDesignSystem: (id: string) => void;
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
  onOpenProject,
  onOpenLiveArtifact,
  onDeleteProject,
  onChangeDefaultDesignSystem,
  onPersistComposioKey,
  onOpenSettings,
}: Props) {
  const t = useT();
  const { locale, setLocale } = useI18n();
  // Each entry sub-view (home / projects / design-systems) is its own
  // URL now, so the browser back/forward buttons work and a deep link
  // to /design-systems lands on that section. We derive the active
  // view from the route rather than keeping it in component state.
  const route = useRoute();
  const view: EntryViewKind = route.kind === 'home' ? route.view : 'home';
  const [previewSystemId, setPreviewSystemId] = useState<string | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [languageExpanded, setLanguageExpanded] = useState(false);
  const [appearanceExpanded, setAppearanceExpanded] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [integrationTab, setIntegrationTab] = useState<IntegrationTab>(integrationInitialTab);
  const [homePromptHandoff, setHomePromptHandoff] = useState<HomePromptHandoff | null>(null);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);
  // Star count + active-model summary are kept in render scope so
  // the dropdown's collapsed rows can mirror what the chips show
  // when CSS unhides them on narrow viewports. Both surfaces are
  // always rendered; only `display` flips per the media query.
  const starCount = useGithubStars();
  const modelSummary = useMemo(
    () => describeModelChip(config, agents, t),
    [config, agents, t],
  );

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
      kind: payload.projectKind ?? 'prototype',
      ...(payload.contextPlugins && payload.contextPlugins.length > 0
        ? { contextPlugins: payload.contextPlugins }
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
    // PR #974 trust boundary: the renderer cannot pick a folder directly
    // anymore — the bridge exposes `pickAndImport` instead (atomic
    // pick + HMAC-gated import). On the web (no electronAPI) or when
    // the bridge is older, fall back to opening the New Project modal
    // so the user can paste a baseDir manually.
    setNewProjectOpen(true);
  }

  // Dismiss the avatar dropdown on outside-click / Escape so it
  // behaves like the project-view AvatarMenu (which uses the same
  // shell CSS). Collapse the inline language list whenever the
  // dropdown is closed, so the next open starts compact again.
  useEffect(() => {
    if (!avatarMenuOpen) {
      setLanguageExpanded(false);
      setAppearanceExpanded(false);
      return;
    }
    const onClick = (e: MouseEvent) => {
      if (!avatarMenuRef.current) return;
      if (!avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAvatarMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [avatarMenuOpen]);

  const avatarMenu = (
    <div className="avatar-menu" ref={avatarMenuRef}>
      <button
        type="button"
        className="settings-icon-btn"
        onClick={() => setAvatarMenuOpen((v) => !v)}
        title={t('entry.openSettingsTitle')}
        aria-label={t('entry.openSettingsAria')}
        aria-haspopup="menu"
        aria-expanded={avatarMenuOpen}
      >
        <Icon name="settings" size={17} />
      </button>
      {avatarMenuOpen ? (
        <div className="avatar-popover" role="menu">
          {/* Collapsed-topbar rows. Always rendered so SSR and the
              client agree on the markup; CSS @media (max-width: 900px)
              flips their `display` so they only show when the
              matching topbar chips are themselves hidden. */}
          <a
            className="avatar-item avatar-item--compact-only"
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => setAvatarMenuOpen(false)}
            data-testid="entry-avatar-github"
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="github" size={14} />
            </span>
            <span>{t('entry.githubStarLabel')}</span>
            <span className="avatar-item-meta">
              {starCount === null ? '—' : formatStars(starCount)}
            </span>
          </a>
          <button
            type="button"
            className="avatar-item avatar-item--compact-only"
            onClick={() => {
              setAvatarMenuOpen(false);
              onOpenSettings('execution');
            }}
            data-testid="entry-avatar-model"
            title={t('inlineSwitcher.chipTitle')}
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="sparkles" size={14} />
            </span>
            <span className="avatar-item-stack">
              <span className="avatar-item-stack__top">
                {modelSummary.mode} · {modelSummary.primary}
              </span>
              <span className="avatar-item-stack__sub">
                {modelSummary.model}
              </span>
            </span>
          </button>
          <div
            className="avatar-popover__divider avatar-popover__divider--compact-only"
            aria-hidden
          />
          <a
            className="avatar-item"
            href="https://x.com/nexudotio"
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => setAvatarMenuOpen(false)}
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="external-link" size={14} />
            </span>
            <span>Follow @nexudotio on X</span>
          </a>
          <a
            className="avatar-item"
            href="https://discord.gg/BYShPgWpq"
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => setAvatarMenuOpen(false)}
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="external-link" size={14} />
            </span>
            <span>Join Discord</span>
          </a>
          <div style={{ height: 1, background: 'var(--border-soft)', margin: '4px 6px' }} />
          <button
            type="button"
            className="avatar-item"
            aria-haspopup="menu"
            aria-expanded={languageExpanded}
            onClick={() => setLanguageExpanded((v) => !v)}
            data-testid="entry-avatar-language"
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="languages" size={14} />
            </span>
            <span>{t('settings.language')}</span>
            <span className="avatar-item-meta">{LOCALE_LABEL[locale]}</span>
            <Icon
              name={languageExpanded ? 'chevron-down' : 'chevron-right'}
              size={11}
              className="avatar-item-chevron"
            />
          </button>
          {languageExpanded ? (
            <div className="avatar-language-list" role="group" aria-label={t('settings.language')}>
              {LOCALES.map((code) => {
                const active = locale === code;
                return (
                  <button
                    key={code}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`avatar-item avatar-item--lang${active ? ' is-active' : ''}`}
                    onClick={() => {
                      setLocale(code as Locale);
                      setAvatarMenuOpen(false);
                    }}
                  >
                    <span className="avatar-item-icon" aria-hidden>
                      {active ? <Icon name="check" size={14} /> : null}
                    </span>
                    <span>{LOCALE_LABEL[code]}</span>
                    <span className="avatar-item-meta">{code}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {/* Appearance — system / light / dark. Mirrors the language
              picker: a toggle row that expands a nested radio group so
              the dropdown can host quick theme switching without
              opening the full Settings dialog. The active theme is
              echoed in the meta slot so the row reads as status when
              collapsed. */}
          <button
            type="button"
            className="avatar-item"
            aria-haspopup="menu"
            aria-expanded={appearanceExpanded}
            onClick={() => setAppearanceExpanded((v) => !v)}
            data-testid="entry-avatar-appearance"
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="sun-moon" size={14} />
            </span>
            <span>{t('settings.appearance')}</span>
            <span className="avatar-item-meta">
              {t(APPEARANCE_LABEL[config.theme ?? 'system'])}
            </span>
            <Icon
              name={appearanceExpanded ? 'chevron-down' : 'chevron-right'}
              size={11}
              className="avatar-item-chevron"
            />
          </button>
          {appearanceExpanded ? (
            <div
              className="avatar-language-list"
              role="group"
              aria-label={t('settings.appearance')}
            >
              {APPEARANCE_THEMES.map(({ value, labelKey }) => {
                const active = (config.theme ?? 'system') === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`avatar-item avatar-item--lang${active ? ' is-active' : ''}`}
                    onClick={() => {
                      onThemeChange(value);
                      setAvatarMenuOpen(false);
                    }}
                  >
                    <span className="avatar-item-icon" aria-hidden>
                      {active ? <Icon name="check" size={14} /> : null}
                    </span>
                    <span>{t(labelKey)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div style={{ height: 1, background: 'var(--border-soft)', margin: '4px 6px' }} />
          <button
            type="button"
            className="avatar-item"
            onClick={() => {
              setAvatarMenuOpen(false);
              openIntegrationTab('use-everywhere');
            }}
            data-testid="entry-avatar-use-everywhere"
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="hammer" size={14} />
            </span>
            <span>{t('entry.useEverywhereTitle')}</span>
          </button>
          <button
            type="button"
            className="avatar-item"
            onClick={() => {
              setAvatarMenuOpen(false);
              onOpenSettings();
            }}
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="settings" size={14} />
            </span>
            <span>{t('avatar.settings')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="entry-shell entry-shell--no-header">
      <div className="entry">
        <EntryNavRail
          view={view}
          onViewChange={changeView}
          onNewProject={() => setNewProjectOpen(true)}
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
                  void tab;
                  setNewProjectOpen(true);
                }}
                promptHandoff={homePromptHandoff}
                skills={skills}
                skillsLoading={skillsLoading}
              />
            ) : null}
            {view === 'projects' ? (
              projectsLoading || skillsLoading || designSystemsLoading ? (
                <CenteredLoader label={t('common.loading')} />
              ) : (
                <div className="entry-section">
                  <header className="entry-section__head">
                    <h1 className="entry-section__title">Projects</h1>
                  </header>
                  <DesignsTab
                    projects={projects}
                    skills={skills}
                    designSystems={designSystems}
                    onOpen={onOpenProject}
                    onOpenLiveArtifact={onOpenLiveArtifact}
                    onDelete={onDeleteProject}
                  />
                </div>
              )
            ) : null}
            {view === 'tasks' ? (
              <TasksView
                config={config}
                onOpenOrbitSettings={() => onOpenSettings('orbit')}
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
                    <h1 className="entry-section__title">Design systems</h1>
                  </header>
                  <DesignSystemsTab
                    systems={designSystems}
                    selectedId={defaultDesignSystemId}
                    onSelect={onChangeDefaultDesignSystem}
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
    </div>
  );
}
