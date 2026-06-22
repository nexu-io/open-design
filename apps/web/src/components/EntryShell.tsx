// EntryShell — the centered-hero entry layout.
//
// This component owns the entire JSX render and local UI state for
// the redesigned home view (left rail + sticky settings cog + hero +
// recent projects + plugins section + new-project modal). It is
// intentionally a sibling of `EntryView` so that upstream `main`
// changes to `EntryView` (props, connector lifecycle, helpers, exports)
// can be rebased without touching this file. `EntryView` becomes a
// thin wrapper that passes data and callbacks through to this shell.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  defaultScenarioPluginIdForProjectMetadata,
  PROFILE_MEMORY_ID,
  type ChatSessionMode,
  type ConnectorDetail,
  type InstalledPluginRecord,
  type UpsertMemoryRequest,
} from '@open-design/contracts';
import type { OpenDesignHostProjectImportSuccess } from '@open-design/host';
import type { DesignSystemGenerateSnapshot } from './DesignSystemFlow';
import { useAnalytics } from '../analytics/provider';
import {
  trackHomeNavClick,
  trackHomeToolbarClick,
  trackOnboardingClick,
  trackOnboardingCompleteResult,
  trackOnboardingRuntimeScanResult,
  trackPageView,
} from '../analytics/events';
import {
  amrHandoffDeviceId,
  recordAmrEntry,
  syncAmrAttributionWithOnboardingProfile,
  type AmrEntryAttribution,
} from '../analytics/amr-attribution';
import { getResolvedDeviceId } from '../analytics/client';
import {
  beginAmrAuthTracking,
  resolveAmrAuthTracking,
} from '../analytics/amr-auth';
import {
  clearOnboardingSessionId,
  getOrCreateOnboardingSessionId,
} from '../analytics/onboarding-session';
import type {
  TrackingOnboardingArea,
  TrackingOnboardingStepIndex,
  TrackingOnboardingStepName,
  TrackingOnboardingClickElement,
  TrackingOnboardingClickAction,
  TrackingOnboardingRuntimeType,
  TrackingOnboardingCompletionResult,
  TrackingOnboardingCompletionType,
  TrackingCliProviderId,
} from '@open-design/contracts/analytics';
import { agentIdToTracking } from '@open-design/contracts/analytics';
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
import { BrandsTab } from './BrandsTab';
import { EntryNavRail, type EntryView as EntryViewKind } from './EntryNavRail';
import { UpdaterPopup } from './UpdaterPopup';
import { GithubStarBadge } from './GithubStarBadge';
import {
  formatDiscordPresenceCount,
  useDiscordPresence,
} from './useDiscordPresence';
import { HomeView } from './HomeView';
import {
  createPluginAuthoringHandoff,
  createPluginUseHandoff,
  type HomePromptHandoff,
} from './home-hero/plugin-authoring';
import type { PluginUseAction } from './plugins-home/useActions';
import { Icon } from './Icon';
import { AgentIcon } from './AgentIcon';
import { LanguageMenu } from './LanguageMenu';
import { IntegrationsView, type IntegrationTab } from './IntegrationsView';
import { InlineModelSwitcher } from './InlineModelSwitcher';
import {
  EntrySettingsMenu,
  type EntrySettingsSection,
} from './EntrySettingsMenu';
import { NewProjectModal } from './NewProjectModal';
import { PluginsView } from './PluginsView';
import type { CreateInput, CreateTab, ImportClaudeDesignOutcome } from './NewProjectPanel';
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
import { saveOnboardingProfile } from '../state/onboarding-profile';
import { testApiProvider } from '../providers/connection-test';
import { fetchProviderModels } from '../providers/provider-models';
import {
  cancelVelaLogin,
  fetchVelaLoginStatus,
  startVelaLogin,
  type VelaLoginStatus,
} from '../providers/daemon';
import {
  AMR_LOGIN_POLL_INTERVAL_MS,
  amrLoginPollOutcome,
  notifyAmrLoginStatusChanged,
} from './amrLoginPolling';
import { useBrandExtract } from '../runtime/useBrandExtract';
import type { BrandReference } from '../runtime/brand-references';
import { BrandReferencePicker } from './BrandReferencePicker';
import { closeAmrActivationWindowBestEffort } from './AmrLoginPill';
import { AnimatePresence } from 'motion/react';
import { smoothScrollToTop } from '../utils/smoothScrollToTop';
import { summarizeProjectNameFromPrompt } from '../utils/projectName';
import {
  providerModelsCacheKey,
  type ProviderModelsCache,
} from './providerModelsCache';

// Persist the entry nav-rail open/collapsed state so it survives both a
// home -> project -> home navigation (EntryShell unmounts on the project
// route) and a full reload. Without this the rail always reset to its
// collapsed default on return.
const RAIL_OPEN_STORAGE_KEY = 'od.entry.railOpen';

function readStoredRailOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(RAIL_OPEN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredRailOpen(open: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RAIL_OPEN_STORAGE_KEY, open ? 'true' : 'false');
  } catch {
    /* ignore quota / disabled storage */
  }
}

const DISCORD_URL = 'https://discord.gg/9ptkbbqRu';
const X_URL = 'https://x.com/OpenDesignHQ';
const ONBOARDING_DROPDOWN_OPEN_EVENT = 'open-design:onboarding-dropdown-open';

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
// Newsletter signup endpoint. Lives on the marketing site (Cloudflare Pages
// Function backed by KV), so this is a cross-origin POST from the desktop
// client. Overridable at build time via NEXT_PUBLIC_NEWSLETTER_URL — e.g. point
// it at a local `wrangler pages dev` instance during development.
const NEWSLETTER_SUBSCRIBE_URL =
  process.env.NEXT_PUBLIC_NEWSLETTER_URL ?? 'https://open-design.ai/subscribe';
const NEWSLETTER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ONBOARDING_BYOK_AUTO_FETCH_DELAY_MS = 300;
const ONBOARDING_BYOK_AUTO_TEST_DELAY_MS = 500;

type OnboardingProfileState = {
  role: string;
  orgSize: string;
  useCase: string[];
  source: string;
  email: string;
};

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
      slideCount: '10-15 pages',
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
  providerModelsCache?: ProviderModelsCache;
  onProviderModelsCacheChange?: Dispatch<SetStateAction<ProviderModelsCache>>;
  agents: AgentInfo[];
  // True while the cold-start agent detection stream is still in flight
  // (`fetchAgentsStream` has not reached its terminal `done`). Onboarding
  // uses this to show the AMR cloud card in a detecting/skeleton state
  // instead of hiding it during the seconds AMR's probe takes to settle.
  agentsLoading?: boolean;
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
      conversationMode?: ChatSessionMode;
      autoSendFirstMessage?: boolean;
      pendingFiles?: File[];
    },
  ) => Promise<boolean> | boolean | void;
  onCreatePluginShareProject: (
    pluginId: string,
    action: PluginShareAction,
    locale?: string,
  ) => Promise<PluginShareProjectOutcome>;
  onImportClaudeDesign: (
    file: File,
  ) => Promise<ImportClaudeDesignOutcome | void> | ImportClaudeDesignOutcome | void;
  onImportFolder?: (baseDir: string) => Promise<void> | void;
  onImportFolderResponse?: (response: OpenDesignHostProjectImportSuccess) => Promise<void> | void;
  onOpenProject: (id: string) => Promise<boolean> | boolean | void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => Promise<boolean | void> | boolean | void;
  onRenameProject: (id: string, name: string) => void;
  onProjectsRefresh?: () => Promise<void> | void;
  onChangeDefaultDesignSystem: (id: string) => void;
  onCreateDesignSystem?: () => void;
  // NOTE: first-run onboarding intentionally no longer hosts guided
  // design-system creation. The previous step-3 design-system surface was
  // replaced by the newsletter and brand-extraction steps, so EntryShell does
  // not accept a `renderDesignSystemCreation` renderer. Guided creation stays
  // reachable from the standalone `design-system-create` route and the
  // Design Systems tab; do not re-thread an onboarding renderer here.
  onOpenDesignSystem?: (id: string) => void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
  onPersistComposioKey: (composio: AppConfig['composio']) => Promise<void> | void;
  onOpenSettings: (section?: EntrySettingsSection) => void;
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
    case 'brands':
      // No dedicated brands analytics element yet; reuse the design_systems
      // slot since Brands replaces that nav destination.
      return 'design_systems';
    case 'integrations':
      return 'integrations';
    default:
      return null;
  }
}

// Tab views stay mounted (so previews/thumbnails survive a tab switch) but the
// inactive ones must leave layout, the accessibility tree, and tab order.
// `content-visibility: hidden` still reserves the hidden pane's block size,
// which pushes later sidebar destinations far below the sticky topbar.
function inactiveViewProps(active: boolean) {
  return {
    style: active ? undefined : ({ display: 'none' } as const),
    inert: !active,
    'aria-hidden': !active,
  };
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
  providerModelsCache: sharedProviderModelsCache,
  onProviderModelsCacheChange,
  agents,
  agentsLoading = false,
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
  onProjectsRefresh,
  onChangeDefaultDesignSystem,
  onCreateDesignSystem,
  onOpenDesignSystem,
  onDesignSystemsRefresh,
  onPersistComposioKey,
  onOpenSettings,
  onCompleteOnboarding,
}: Props) {
  const t = useT();
  const discordPresence = useDiscordPresence();
  // Each entry sub-view (home / projects / design-systems) is its own
  // URL now, so the browser back/forward buttons work and a deep link
  // to /design-systems lands on that section. We derive the active
  // view from the route rather than keeping it in component state.
  const route = useRoute();
  const view: EntryViewKind = route.kind === 'home' ? route.view : 'home';
  const [previewSystemId, setPreviewSystemId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  // The entry nav rail is collapsed by default (Manus-style) so the entry
  // view opens clean and full-width; the panel toggle in the topbar opens it
  // as an overlay that dismisses on selection / backdrop click / Escape.
  // Its open/collapsed state is persisted (localStorage) so it survives a
  // home -> project -> home round trip (EntryShell unmounts on the project
  // route) and a reload, instead of snapping back to collapsed.
  const [railOpen, setRailOpen] = useState<boolean>(readStoredRailOpen);
  useEffect(() => {
    writeStoredRailOpen(railOpen);
  }, [railOpen]);
  const [localProviderModelsCache, setLocalProviderModelsCache] =
    useState<ProviderModelsCache>({});
  const hasSharedProviderModelsCache =
    Boolean(sharedProviderModelsCache) && Boolean(onProviderModelsCacheChange);
  const activeProviderModelsCache =
    hasSharedProviderModelsCache
      ? sharedProviderModelsCache!
      : localProviderModelsCache;
  const activeSetProviderModelsCache =
    hasSharedProviderModelsCache
      ? onProviderModelsCacheChange!
      : setLocalProviderModelsCache;
  const [newProjectInitialTab, setNewProjectInitialTab] =
    useState<CreateTab>('prototype');
  const [integrationTab, setIntegrationTab] = useState<IntegrationTab>(integrationInitialTab);
  const [homePromptHandoff, setHomePromptHandoff] = useState<HomePromptHandoff | null>(null);
  const entryMainScrollRef = useRef<HTMLElement | null>(null);
  const analytics = useAnalytics();
  const discordOnlineLabel = discordPresence
    ? t('entry.discordOnlineLabel', {
        count: formatDiscordPresenceCount(discordPresence.onlineCount),
      })
    : null;
  const discordAriaLabel = discordOnlineLabel
    ? t('entry.discordAriaWithOnline', { online: discordOnlineLabel })
    : t('entry.discordAria');
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
    if (view !== 'home' || !homePromptHandoff) return;
    const frame = window.requestAnimationFrame(() => {
      const scrollContainer = entryMainScrollRef.current;
      if (!scrollContainer) return;
      smoothScrollToTop(scrollContainer);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [homePromptHandoff?.id, view]);

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
  // Forwards onCreateProject's result so HomeView can hold its sending
  // state until the creation roundtrip settles, and recover on failure
  // (#4082).
  function handlePluginLoopSubmit(payload: PluginLoopSubmit): Promise<boolean> | boolean | void {
    const summarizedName = summarizeProjectNameFromPrompt(payload.prompt);
    const head = payload.prompt.trim().split(/\s+/).slice(0, 8).join(' ');
    const firstAttachmentName = payload.attachments?.[0]?.name ?? '';
    const fallbackName =
      summarizedName || (head.length > 0 ? head : firstAttachmentName || 'Untitled');
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
      // The Home working-directory picker grants the agent read-only
      // awareness of a local folder (via `--add-dir`), it does NOT import
      // that folder into Design Files. So the picked path becomes the new
      // project's `linkedDirs` rather than its `baseDir`/`userWorkingDir`:
      // Design Files stays the managed `.od/projects/<id>` artifact store,
      // independent of the user's local files.
      ...(payload.workingDir ? { linkedDirs: [payload.workingDir] } : {}),
      ...(payload.examplePromptContext ? {
        examplePrompt: true,
        examplePromptTitle: payload.examplePromptContext.title,
        examplePromptBrief: payload.examplePromptContext.brief,
      } : {}),
    };
    return onCreateProject({
      name,
      skillId: payload.skillId ?? null,
      designSystemId: payload.designSystemId ?? null,
      metadata,
      pendingPrompt: payload.prompt,
      ...(payload.pluginId ? { pluginId: payload.pluginId } : {}),
      ...(payload.pluginType ? { pluginType: payload.pluginType } : {}),
      ...(payload.appliedPluginSnapshotId
        ? { appliedPluginSnapshotId: payload.appliedPluginSnapshotId }
        : {}),
      ...(payload.pluginInputs ? { pluginInputs: payload.pluginInputs } : {}),
      ...(payload.conversationMode ? { conversationMode: payload.conversationMode } : {}),
      ...(payload.attachments && payload.attachments.length > 0
        ? { pendingFiles: payload.attachments }
        : {}),
      // No `userWorkingDirToken`: linkedDirs grant read-only `--add-dir`
      // access and are validated by the daemon at create time, so they do
      // not need the desktop main-process trust token that baseDir imports
      // require for write access.
      autoSendFirstMessage: true,
    });
  }

  function finishOnboarding() {
    onCompleteOnboarding();
    changeView('home');
  }

  const avatarMenu = (
    <EntrySettingsMenu
      config={config}
      onThemeChange={onThemeChange}
      onOpenSettings={onOpenSettings}
      onTrackTriggerClick={() => {
        trackHomeToolbarClick(analytics.track, {
          page_name: 'home',
          area: 'toolbar',
          element: 'settings',
        });
      }}
    />
  );


  if (view === 'onboarding') {
    return (
      <div className="entry-shell entry-shell--no-header entry-shell--onboarding">
        <main className="entry-onboarding-modal" aria-label={t('settings.welcomeTitle')}>
          <OnboardingView
            config={config}
            agents={agents}
            agentsLoading={agentsLoading}
            providerModelsCache={activeProviderModelsCache}
            onProviderModelsCacheChange={activeSetProviderModelsCache}
            daemonLive={daemonLive}
            onModeChange={onModeChange}
            onAgentChange={onAgentChange}
            onAgentModelChange={onAgentModelChange}
            onApiProtocolChange={onApiProtocolChange}
            onApiModelChange={onApiModelChange}
            onConfigPersist={onConfigPersist}
            onRefreshAgents={onRefreshAgents}
            onFinish={finishOnboarding}
            onThemeChange={onThemeChange}
          />
        </main>
      </div>
    );
  }

  const executionSwitcher = (
    <InlineModelSwitcher
      config={config}
      agents={agents}
      providerModelsCache={activeProviderModelsCache}
      onProviderModelsCacheChange={activeSetProviderModelsCache}
      daemonLive={daemonLive}
      onModeChange={onModeChange}
      onAgentChange={onAgentChange}
      onAgentModelChange={onAgentModelChange}
      onApiProtocolChange={onApiProtocolChange}
      onApiModelChange={onApiModelChange}
      onOpenSettings={onOpenSettings}
    />
  );

  return (
    <div className="entry-shell entry-shell--no-header">
      <div className={`entry${railOpen ? ' entry--rail-open' : ''}`}>
        <EntryNavRail
          view={view}
          onViewChange={changeView}
          onNewProject={() => openNewProject()}
          open={railOpen}
          onClose={() => setRailOpen(false)}
        />
        <main className="entry-main entry-main--scroll" ref={entryMainScrollRef}>
          <div className="entry-main__topbar">
            <button
              type="button"
              className="entry-rail-toggle"
              onClick={() => setRailOpen((prev) => !prev)}
              aria-label={t('entry.navExpand')}
              aria-expanded={railOpen}
              data-testid="entry-rail-toggle"
            >
              <Icon name="panel-left" size={20} />
            </button>
            <div className="entry-main__topbar-chips entry-main__topbar-chips--icon-only">
              <GithubStarBadge />
              <a
                className="entry-discord-badge od-tooltip"
                href={DISCORD_URL}
                aria-label={discordAriaLabel}
                data-tooltip={discordAriaLabel}
                data-tooltip-placement="bottom"
                data-testid="entry-discord-badge"
              >
                <Icon name="discord" size={14} className="entry-discord-badge__icon" />
                <span className="entry-discord-badge__label">{t('entry.discordLabel')}</span>
                {discordOnlineLabel ? (
                  <>
                    <span className="entry-discord-badge__sep" aria-hidden>
                      ·
                    </span>
                    <span className="entry-discord-badge__online">
                      {discordOnlineLabel}
                    </span>
                  </>
                ) : null}
              </a>
              {executionSwitcher}
              <button
                type="button"
                className="use-everywhere-chip od-tooltip"
                onClick={() => {
                  trackHomeToolbarClick(analytics.track, {
                    page_name: 'home',
                    area: 'toolbar',
                    element: 'use_everywhere',
                  });
                  openIntegrationTab('use-everywhere');
                }}
                data-tooltip={t('entry.useEverywhereTitle')}
                data-tooltip-placement="bottom"
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
            <UpdaterPopup />
            {avatarMenu}
          </div>
          <div
            className={`entry-main__inner${
              view === 'home' ? '' : ' entry-main__inner--wide'
            }`}
          >
            <div data-testid="entry-view-home" data-active={view === 'home' ? 'true' : 'false'} {...inactiveViewProps(view === 'home')}>
              <HomeView
                isActive={view === 'home'}
                projects={projects}
                projectsLoading={projectsLoading}
                designSystems={designSystems}
                defaultDesignSystemId={defaultDesignSystemId}
                onSubmit={handlePluginLoopSubmit}
                onOpenProject={onOpenProject}
                onViewAllProjects={() => changeView('projects')}
                onBrowseRegistry={() => changeView('plugins')}
                onOpenIntegrations={() => openIntegrationTab('connectors')}
                onOpenMcp={() => openIntegrationTab('mcp')}
                onOpenNewProject={(tab) => {
                  openNewProject(tab);
                }}
                promptHandoff={homePromptHandoff}
                skills={skills}
                skillsLoading={skillsLoading}
                connectors={connectors}
                promptTemplates={promptTemplates}
              />
            </div>
            <div data-testid="entry-view-projects" data-active={view === 'projects' ? 'true' : 'false'} {...inactiveViewProps(view === 'projects')}>
              {projectsLoading || skillsLoading || designSystemsLoading ? (
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
                    onNewProject={() => openNewProject()}
                    onRefresh={onProjectsRefresh}
                    isActive={view === 'projects'}
                  />
                </div>
              )}
            </div>
            <div data-testid="entry-view-tasks" data-active={view === 'tasks' ? 'true' : 'false'} {...inactiveViewProps(view === 'tasks')}>
              <TasksView
                skills={skills}
                designTemplates={designTemplates}
                connectors={connectors}
                connectorsLoading={connectorsLoading}
              />
            </div>
            <div data-testid="entry-view-plugins" data-active={view === 'plugins' ? 'true' : 'false'} {...inactiveViewProps(view === 'plugins')}>
              <PluginsView
                onCreatePlugin={startPluginAuthoring}
                onUsePlugin={usePluginFromLibrary}
                onCreatePluginShareProject={onCreatePluginShareProject}
              />
            </div>
            <div data-testid="entry-view-design-systems" data-active={view === 'design-systems' ? 'true' : 'false'} {...inactiveViewProps(view === 'design-systems')}>
              {designSystemsLoading ? (
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
              )}
            </div>
            <div data-testid="entry-view-brands" data-active={view === 'brands' ? 'true' : 'false'} {...inactiveViewProps(view === 'brands')}>
              <BrandsTab
                onApplyDesignSystem={onChangeDefaultDesignSystem}
                onOpenProject={onOpenProject}
              />
            </div>
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
      <AnimatePresence>
        {previewSystem ? (
          <DesignSystemPreviewModal
            system={previewSystem}
            onClose={() => setPreviewSystemId(null)}
          />
        ) : null}
      </AnimatePresence>
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
  providerModelsCache: sharedProviderModelsCache,
  onProviderModelsCacheChange,
  agents,
  agentsLoading = false,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onConfigPersist,
  onRefreshAgents,
  onFinish,
  onThemeChange,
}: {
  config: AppConfig;
  providerModelsCache?: ProviderModelsCache;
  onProviderModelsCacheChange?: Dispatch<SetStateAction<ProviderModelsCache>>;
  agents: AgentInfo[];
  agentsLoading?: boolean;
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
  onFinish: () => void;
  onThemeChange: (theme: AppTheme) => void;
}) {
  const t = useT();
  const analytics = useAnalytics();
  const [step, setStep] = useState(0);
  const [runtime, setRuntime] = useState<'amr' | 'local' | 'byok' | null>(null);
  // Connect step (step 0) faces: the minimal cloud sign-in landing (null), or
  // a single dedicated setup page for the local CLI or BYOK that the landing's
  // two secondary links open directly. AMR has no card anymore — it signs in
  // straight from the landing's primary button.
  const [connectExpanded, setConnectExpanded] = useState<'local' | 'byok' | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [cliScanStatus, setCliScanStatus] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [amrStatus, setAmrStatus] = useState<VelaLoginStatus | null>(null);
  // 初始登录状态是否已拉到（无论登录与否）。登录页按钮用它判断是否还在「加载中…」。
  const [amrStatusResolved, setAmrStatusResolved] = useState(false);
  // True while the one-shot AMR re-probe (fired when the cold-start stream
  // settled without surfacing AMR) is in flight. Combined with
  // `agentsLoading`, this is the full window during which AMR availability
  // is still undecided — and the AMR cloud card renders its skeleton.
  const [amrLoginPending, setAmrLoginPending] = useState(false);
  const [amrLoginCancelPending, setAmrLoginCancelPending] = useState(false);
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);
  // Optional brand extraction on the final onboarding step. The hook
  // drives a 3-stage SSE progress model against POST /api/brands; the
  // local URL string is the only extra state the panel needs. Extraction
  // is entirely optional — it never blocks the Finish/Continue button
  // (see handlePrimaryAction, which has no brand awareness).
  const [brandUrl, setBrandUrl] = useState('');
  const {
    state: brandExtractState,
    run: runBrandExtract,
  } = useBrandExtract();
  const brandExtractActive = brandExtractState.phase === 'starting';
  const brandExtractDone = brandExtractState.phase === 'done';
  const brandExtractFailed = brandExtractState.phase === 'error';
  // Clicking Extract here behaves exactly like the Brands tab: stand up the
  // extraction project, then finish onboarding and open it so the agent runs
  // the extraction live (with a browser tab on the target site).
  const handleOnboardingBrandExtract = useCallback(
    async (explicitUrl?: string) => {
      // An explicit URL (a picked reference brand) wins over the input, whose
      // state update may not have committed yet when the picker fires.
      const trimmed = (explicitUrl ?? brandUrl).trim();
      if (!trimmed || brandExtractActive) return;
      const result = await runBrandExtract(trimmed);
      if (!result) return;
      try {
        window.sessionStorage.setItem(`od:auto-send-first:${result.projectId}`, '1');
      } catch {
        // Private-mode storage failures should not block navigation.
      }
      onFinish();
      navigate({
        kind: 'project',
        projectId: result.projectId,
        fileName: null,
        conversationId: result.conversationId,
      });
    },
    [brandUrl, brandExtractActive, runBrandExtract, onFinish],
  );

  // The onboarding picker fills the URL field and immediately starts extraction.
  const handleOnboardingPickReference = useCallback(
    (brand: BrandReference) => {
      if (brandExtractActive) return;
      setBrandUrl(brand.domain);
      void handleOnboardingBrandExtract(brand.domain);
    },
    [brandExtractActive, handleOnboardingBrandExtract],
  );
  const [amrLoginError, setAmrLoginError] = useState<string | null>(null);
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
  const [localProviderModelsCache, setLocalProviderModelsCache] =
    useState<ProviderModelsCache>({});
  const hasSharedProviderModelsCache =
    Boolean(sharedProviderModelsCache) && Boolean(onProviderModelsCacheChange);
  const activeProviderModelsCache =
    hasSharedProviderModelsCache
      ? sharedProviderModelsCache!
      : localProviderModelsCache;
  const activeSetProviderModelsCache =
    hasSharedProviderModelsCache
      ? onProviderModelsCacheChange!
      : setLocalProviderModelsCache;
  const [profile, setProfile] = useState<OnboardingProfileState>({
    role: '',
    orgSize: '',
    useCase: [] as string[],
    source: '',
    email: '',
  });
  // Live mirror of `profile` so closures that fire faster than React
  // commits (rapid dropdown picks, the Finish-setup click after the
  // last onChange) read the latest selection instead of the value the
  // closure captured at render-time. Multi-select use_case in
  // particular needed this: two quick adds within one commit cycle
  // both read `previous = new Set(profile.useCase = stale [])` and
  // emitted on both — fine — but reading any cumulative summary off
  // `profile` directly missed the second pick until the next commit.
  const profileRef = useRef(profile);
  const lastPersistedOnboardingProfileBodyRef = useRef<string>('');
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  const agentRevealTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const cliScanTokenRef = useRef(0);
  const cliScanTelemetryRef = useRef<{
    token: number;
    startedAt: number;
    onboardingSessionId: string;
  } | null>(null);
  const cliRefreshPendingTokenRef = useRef<number | null>(null);
  const amrLoginPollCancelledRef = useRef(false);
  const amrAgentRefreshAttemptedRef = useRef(false);
  const providerModelsAutoFetchKeyRef = useRef<string | null>(null);
  const providerAutoTestKeyRef = useRef<string | null>(null);
  const providerModelAutoSelectRef = useRef({
    model: config.model,
    providerModelsInputKey: '',
    runtime,
    step,
  });
  const apiProtocol = config.apiProtocol ?? 'anthropic';
  const providerTestInputKey = [
    apiProtocol,
    config.baseUrl.trim(),
    config.model.trim(),
    config.apiKey.trim(),
    config.apiVersion?.trim() ?? '',
  ].join('\n');
  const providerModelsInputKey = providerModelsCacheKey(
    apiProtocol,
    config.baseUrl,
    config.apiKey,
    config.apiVersion ?? '',
  );
  providerModelAutoSelectRef.current = {
    model: config.model,
    providerModelsInputKey,
    runtime,
    step,
  };
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
  const availableCliAgents = agents.filter((agent) => agent.available && agent.id !== 'amr');
  const visibleAgents = availableCliAgents.filter((agent) => visibleAgentIds.includes(agent.id));
  const amrAgent = agents.find((agent) => agent.id === 'amr' && agent.available) ?? null;
  const amrSignedIn = amrStatus?.loggedIn === true;
  const amrSelectedAndSignedOut = runtime === 'amr' && !amrSignedIn;
  const selectedAgent = visibleAgents.find((agent) => agent.id === config.agentId) ?? null;
  const selectedAgentChoice = selectedAgent ? (config.agentModels?.[selectedAgent.id] ?? {}) : {};
  // Connect-step (step 0) gate. Continue may only advance once the selected
  // runtime is actually usable: AMR signed in, an available local CLI chosen,
  // or a BYOK provider whose connection test passed. AMR-selected-but-signed-out
  // is the deliberate exception — there the primary CTA turns into "Sign in to
  // continue" and must stay enabled so the user can trigger the login that
  // satisfies the gate (see handlePrimaryAction / amrSelectedAndSignedOut).
  const byokConnectionVerified =
    visibleProviderTestState.status === 'done' && visibleProviderTestState.result.ok;
  const connectStepRuntimeReady =
    (runtime === 'amr' && amrSignedIn) ||
    (runtime === 'local' && selectedAgent !== null) ||
    (runtime === 'byok' && byokConnectionVerified);
  const connectStepBlocked =
    step === 0 && !amrSelectedAndSignedOut && !connectStepRuntimeReady;
  // Which Connect gate is in the way, for the Continue tooltip. The three
  // "blocked" reasons hold Continue disabled; `amr_signed_out` is the
  // "Sign in to continue" CTA — still clickable, but the tooltip explains why
  // the next steps need a runtime first.
  const connectGateReason: 'no_runtime' | 'amr_signed_out' | 'local_agent_unavailable' | 'byok_unverified' | null =
    step !== 0
      ? null
      : amrSelectedAndSignedOut
        ? 'amr_signed_out'
        : connectStepBlocked
          ? runtime === 'local'
            ? 'local_agent_unavailable'
            : runtime === 'byok'
              ? 'byok_unverified'
              : 'no_runtime'
          : null;
  const connectGateTooltip =
    connectGateReason === 'amr_signed_out'
      ? t('settings.onboardingGateTooltipAmr')
      : connectGateReason === 'local_agent_unavailable'
        ? t('settings.onboardingGateTooltipLocal')
        : connectGateReason === 'byok_unverified'
          ? t('settings.onboardingGateTooltipByok')
          : connectGateReason === 'no_runtime'
            ? t('settings.onboardingGateTooltipNoRuntime')
            : null;

  useEffect(() => {
    return () => {
      amrLoginPollCancelledRef.current = true;
      agentRevealTimersRef.current.forEach((timer) => clearTimeout(timer));
      agentRevealTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!amrAgent || runtime !== null) return;
    setRuntime('amr');
    onModeChange('daemon');
    onAgentChange('amr');
  }, [amrAgent, onAgentChange, onModeChange, runtime]);

  useEffect(() => {
    if (runtime !== 'local') return;
    const scanToken = cliScanTokenRef.current;
    if (cliRefreshPendingTokenRef.current === scanToken) return;
    const currentAvailableAgents = agents.filter(
      (agent) => agent.available && agent.id !== 'amr',
    );
    if (currentAvailableAgents.length > 0) {
      const selectedCliAgent = selectDefaultCliAgent(currentAvailableAgents);
      showCliAgents(scanToken, currentAvailableAgents, { stagger: false });
      setCliScanStatus('done');
      emitPendingCliScanResult(scanToken, {
        result: 'success',
        detected: agents.length,
        available: currentAvailableAgents.length,
        selectedCliId: selectedCliAgent ? agentIdToTracking(selectedCliAgent.id) : undefined,
      });
      return;
    }
    if (!agentsLoading && cliScanStatus === 'scanning') {
      setCliScanStatus('done');
      emitPendingCliScanResult(scanToken, {
        result: 'failed',
        detected: agents.length,
        available: 0,
        errorCode: 'NO_AVAILABLE_CLI',
      });
    }
  }, [agents, agentsLoading, cliScanStatus, config.agentId, runtime]);

  useEffect(() => {
    // The cold-start stream finished without AMR. Re-probe once before we
    // conclude AMR is unavailable, so the cloud sign-in stays usable even when
    // AMR was slow to surface in the initial agent list.
    if (amrAgent || amrAgentRefreshAttemptedRef.current || agentsLoading) return;
    amrAgentRefreshAttemptedRef.current = true;
    void Promise.resolve(onRefreshAgents()).catch(() => undefined);
  }, [amrAgent, agentsLoading, onRefreshAgents]);

  useEffect(() => {
    // 挂载时立即拉取登录状态（与 agent 列表加载并行，不再等 amrAgent），
    // 让登录页按钮尽快从「加载中…」settle 到「登录」/「继续（已登录）」。
    let cancelled = false;
    void fetchVelaLoginStatus()
      .then((next) => {
        if (!cancelled && next) setAmrStatus(next);
      })
      .finally(() => {
        if (!cancelled) setAmrStatusResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (runtime === 'amr') return;
    amrLoginPollCancelledRef.current = true;
    setAmrLoginPending(false);
    setAmrLoginCancelPending(false);
  }, [runtime]);

  // Onboarding step exposure. Design-system intake used to live here
  // as step 3, but it is temporarily removed from first-run
  // onboarding and remains available from the app surfaces.
  //
  // We do NOT clear on unmount: route changes can remount the shell
  // during first-run setup. Back / last-step Continue clear inline in
  // their respective handlers below; abandoned sessions clear on
  // sessionStorage tab close.
  const onboardingSessionIdRef = useRef<string>('');
  if (!onboardingSessionIdRef.current) {
    onboardingSessionIdRef.current = getOrCreateOnboardingSessionId();
  }
  useEffect(() => {
    const onboardingSessionId = onboardingSessionIdRef.current;
    if (!onboardingSessionId) return;
    const info = stepInfo(step);
    trackPageView(analytics.track, {
      page_name: 'onboarding',
      area: info.area,
      step_index: info.stepIndex,
      step_name: info.stepName,
      onboarding_session_id: onboardingSessionId,
    });
  }, [analytics.track, step]);

  // Onboarding analytics helpers. Wall-clock start so the lifecycle
  // result event can carry `duration_ms`; `runtime` state is the user's
  // current pick at click time so `runtime_type` rides along on every
  // click. The `_lifecycleReportedRef` guards against double-firing the
  // completion event if a submit path and unmount happen in the same tick
  // (the unmount path also clears the session id; see the PR #2453 follow-up).
  const onboardingStartedAtRef = useRef<number>(Date.now());
  const lifecycleReportedRef = useRef(false);
  // Guards `about_you_submit` to exactly one emit per onboarding session,
  // independent of how many times the user crosses the About-you step via
  // the clickable stepper or Back/Continue.
  const aboutYouReportedRef = useRef(false);
  function currentRuntimeType(): TrackingOnboardingRuntimeType {
    if (runtime === 'amr') return 'amr_cloud';
    if (runtime === 'local') return 'local_cli';
    if (runtime === 'byok') return 'byok';
    return 'none';
  }
  function stepInfo(stepIdx: number): {
    area: TrackingOnboardingArea;
    stepIndex: TrackingOnboardingStepIndex;
    stepName: TrackingOnboardingStepName;
  } {
    if (stepIdx === 0) return { area: 'runtime', stepIndex: '1', stepName: 'connect' };
    if (stepIdx === 1) return { area: 'about_you', stepIndex: '2', stepName: 'about_you' };
    if (stepIdx === 2) return { area: 'newsletter', stepIndex: '3', stepName: 'newsletter' };
    return { area: 'brand', stepIndex: '4', stepName: 'brand_extract' };
  }
  function emitOnboardingClick(
    element: TrackingOnboardingClickElement,
    action: TrackingOnboardingClickAction,
    extra: Partial<Omit<
      Parameters<typeof trackOnboardingClick>[1],
      'page_name' | 'area' | 'element' | 'action' | 'step_index' | 'step_name' | 'onboarding_session_id'
    >> = {},
  ): void {
    const onboardingSessionId = onboardingSessionIdRef.current;
    if (!onboardingSessionId) return;
    const info = stepInfo(step);
    trackOnboardingClick(analytics.track, {
      page_name: 'onboarding',
      area: info.area,
      element,
      action,
      step_index: info.stepIndex,
      step_name: info.stepName,
      onboarding_session_id: onboardingSessionId,
      ...extra,
    });
  }
  function emitOnboardingComplete(
    result: TrackingOnboardingCompletionResult,
    completionType: TrackingOnboardingCompletionType,
    extra: {
      errorCode?: string;
      // Generate-path callers pass the embedded DS creation flow's
      // snapshot so the wire row reflects the actual source-count
      // and brand-description the user typed, not the (always-null)
      // `designSource` card-pick state. E2E (2026-05-21) showed the
      // user can click Generate without first clicking one of the
      // three source-type cards — they go straight to typing a
      // brand prompt — so reading `designSource` alone yielded
      // `has_design_system_request: false` despite a real request.
      sourceSnapshot?: DesignSystemGenerateSnapshot;
    } = {},
  ): void {
    if (lifecycleReportedRef.current) return;
    const onboardingSessionId = onboardingSessionIdRef.current;
    if (!onboardingSessionId) return;
    lifecycleReportedRef.current = true;
    const info = stepInfo(step);
    const snapshot = extra.sourceSnapshot;
    // Onboarding no longer hosts a design-system step, so a completion
    // never carries a DS request unless a caller passes an explicit
    // snapshot (none do today).
    const hasRequest = snapshot
      ? snapshot.sourceCount > 0 || snapshot.hasBrandDescription
      : false;
    const sourceCount = snapshot ? snapshot.sourceCount : 0;
    // Read from `profileRef` for the same reason `emitAboutYouSubmit`
    // does: a Finish-setup click may fire before React commits the
    // latest dropdown pick, leaving `profile` (closure-captured at
    // render time) one tick behind.
    const liveProfile = profileRef.current;
    const hasAboutYou = Boolean(
      liveProfile.role
        || liveProfile.orgSize
        || liveProfile.useCase.length > 0
        || liveProfile.source,
    );
    trackOnboardingCompleteResult(analytics.track, {
      page_name: 'onboarding',
      area: 'onboarding',
      result,
      exit_step_name: info.stepName,
      completion_type: completionType,
      runtime_type: currentRuntimeType(),
      has_about_you: hasAboutYou,
      has_design_system_request: hasRequest,
      source_count: sourceCount,
      ...(extra.errorCode ? { error_code: extra.errorCode } : {}),
      duration_ms: Math.max(0, Date.now() - onboardingStartedAtRef.current),
      onboarding_session_id: onboardingSessionId,
      // Survey-snapshot mirror of `about_you_submit` so the funnel has
      // a second carrier for the user's picks. Only attached when the
      // user actually touched the About-you step.
      ...(hasAboutYou ? {
        role: liveProfile.role || 'unknown',
        organization_size: liveProfile.orgSize || 'unknown',
        use_cases: liveProfile.useCase.length > 0
          ? liveProfile.useCase
          : ['unknown'],
        discovery_source: liveProfile.source || 'unknown',
      } : {}),
    });
  }

  const steps = [
    t('settings.onboardingStepConnect'),
    t('settings.onboardingStepProfile'),
    t('settings.onboardingStepNewsletter'),
    t('newBrand.extract'),
  ];
  const isLastStep = step === steps.length - 1;

  const roleOptions = [
    { value: 'agency', label: t('settings.onboardingRoleAgency') },
    { value: 'pm', label: t('settings.onboardingRolePm') },
    { value: 'designer', label: t('settings.onboardingRoleDesigner') },
    { value: 'engineer', label: t('settings.onboardingRoleEngineer') },
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

  function cleanOnboardingOptionLabel(label: string): string {
    const trimmed = label.trim();
    return trimmed.replace(/^[^\p{L}\p{N}]+/u, '').trim() || trimmed;
  }

  function optionLabel(
    options: ReadonlyArray<{ value: string; label: string }>,
    value: string,
  ): string {
    const option = options.find((item) => item.value === value);
    return cleanOnboardingOptionLabel(option?.label ?? value);
  }

  function buildOnboardingProfileBody(snapshot: OnboardingProfileState): string {
    const fields: Array<[string, string]> = [];
    if (snapshot.role) {
      fields.push(['Role', optionLabel(roleOptions, snapshot.role)]);
    }
    if (snapshot.orgSize) {
      fields.push(['Organization size', optionLabel(orgSizeOptions, snapshot.orgSize)]);
    }
    if (snapshot.useCase.length > 0) {
      fields.push([
        'Use cases',
        snapshot.useCase.map((value) => optionLabel(useCaseOptions, value)).join(', '),
      ]);
    }
    if (snapshot.source) {
      fields.push(['Discovery source', optionLabel(sourceOptions, snapshot.source)]);
    }
    return fields.map(([label, value]) => `- ${label}: ${value}`).join('\n');
  }

  async function persistOnboardingProfileToMemory(): Promise<void> {
    const body = buildOnboardingProfileBody(profileRef.current);
    if (!body || body === lastPersistedOnboardingProfileBodyRef.current) return;
    const payload: UpsertMemoryRequest = {
      type: 'profile',
      name: t('settings.memoryProfileName'),
      description: t('settings.memoryProfileDescription'),
      body,
    };
    try {
      const resp = await fetch(`/api/memory/${encodeURIComponent(PROFILE_MEMORY_ID)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        lastPersistedOnboardingProfileBodyRef.current = body;
      }
    } catch {
      // Onboarding completion should not fail because local memory is unavailable.
    }
  }

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
  const fetchedProviderModels =
    activeProviderModelsCache[providerModelsInputKey] ?? [];
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

  function selectFirstProviderModelWhenEmpty(
    models: readonly ProviderModelOption[],
    expectedInputKey: string,
  ) {
    const firstModel = models[0];
    const current = providerModelAutoSelectRef.current;
    if (
      !firstModel ||
      current.runtime !== 'byok' ||
      current.step !== 0 ||
      current.providerModelsInputKey !== expectedInputKey ||
      current.model.trim()
    ) {
      return;
    }
    onApiModelChange(firstModel.id);
    updateApiConfig({ model: firstModel.id });
  }

  function clearAgentRevealTimers() {
    agentRevealTimersRef.current.forEach((timer) => clearTimeout(timer));
    agentRevealTimersRef.current = [];
  }

  function selectDefaultCliAgent(availableAgents: AgentInfo[]): AgentInfo | null {
    const selectedAgent =
      availableAgents.find((agent) => agent.id === config.agentId) ?? availableAgents[0] ?? null;
    if (!selectedAgent) return null;
    if (selectedAgent.id !== config.agentId) {
      onAgentChange(selectedAgent.id);
    }
    return selectedAgent;
  }

  function emitPendingCliScanResult(
    token: number,
    args: {
      result: 'success' | 'failed';
      detected: number;
      available: number;
      selectedCliId?: TrackingCliProviderId;
      errorCode?: string;
    },
  ): void {
    const telemetry = cliScanTelemetryRef.current;
    if (!telemetry || telemetry.token !== token) return;
    cliScanTelemetryRef.current = null;
    trackOnboardingRuntimeScanResult(analytics.track, {
      page_name: 'onboarding',
      area: 'runtime',
      runtime_type: 'local_cli',
      result: args.result,
      detected_cli_count: args.detected,
      available_cli_count: args.available,
      ...(args.selectedCliId ? { selected_cli_id: args.selectedCliId } : {}),
      ...(args.errorCode ? { error_code: args.errorCode } : {}),
      duration_ms: Math.max(0, Date.now() - telemetry.startedAt),
      onboarding_session_id: telemetry.onboardingSessionId,
    });
  }

  function beginCliScan(options: { clearVisible: boolean }): number {
    const scanToken = cliScanTokenRef.current + 1;
    cliScanTokenRef.current = scanToken;
    clearAgentRevealTimers();
    setRuntime('local');
    onModeChange('daemon');
    setCliScanStatus('scanning');
    if (options.clearVisible) setVisibleAgentIds([]);
    const onboardingSessionId = onboardingSessionIdRef.current;
    cliScanTelemetryRef.current = onboardingSessionId
      ? {
          token: scanToken,
          startedAt: Date.now(),
          onboardingSessionId,
        }
      : null;
    return scanToken;
  }

  function showCliAgents(
    token: number,
    availableAgents: AgentInfo[],
    options: { stagger: boolean },
  ): void {
    if (!options.stagger) {
      const nextIds = availableAgents.map((agent) => agent.id);
      setVisibleAgentIds((current) =>
        current.length === nextIds.length && current.every((id, index) => id === nextIds[index])
          ? current
          : nextIds,
      );
      return;
    }
    availableAgents.forEach((agent, index) => {
      const timer = setTimeout(() => {
        if (cliScanTokenRef.current !== token) return;
        setVisibleAgentIds((current) =>
          current.includes(agent.id) ? current : [...current, agent.id],
        );
        if (index === availableAgents.length - 1) {
          setCliScanStatus('done');
        }
      }, 110 * (index + 1));
      agentRevealTimersRef.current.push(timer);
    });
  }

  function handleBackWithTracking(): void {
    if (newsletterSubmitting) return;
    // The secondary button only renders for step > 0 — the Connect step has no
    // earlier step and no Skip affordance — so this is always a real Back.
    // (The former step-0 "Skip" path, which emitted the onboarding `skip` /
    // `skipped` events, was removed when Skip was dropped; those enums are now
    // deprecated and unused. See packages/contracts/src/analytics/events.ts.)
    emitOnboardingClick('back', 'back');
    setStep((current) => current - 1);
  }
  async function handlePrimaryAction() {
    if (newsletterSubmitting) return;
    // Connect gate: the button is `aria-disabled` (not natively disabled, so it
    // can still surface its tooltip on hover), so guard the click here — a
    // blocked Continue must not advance past the Connect step.
    if (connectStepBlocked) return;
    if (step === 0 && amrSelectedAndSignedOut) {
      const attribution = recordAmrEntry(
        analytics.track,
        'onboarding_amr_sign_in_continue',
        new Date(),
        {
          metricsConsent: config.telemetry?.metrics === true,
          reuseExistingFrom: ['onboarding_amr_card'],
        },
      );
      void handleAmrSignInToContinue(attribution);
      return;
    }
    if (isLastStep) {
      // Emit the About-you survey snapshot on the completion path, before
      // the continue/complete pair. Reading `profileRef` captures the
      // user's final role / org size / use case / discovery source picks
      // even on a fast Finish. Gating it here — rather than when the user
      // leaves the About-you step — keeps it exactly-once no matter how the
      // final step was reached: primary CTA, Back-then-Continue, or a
      // forward jump via the clickable stepper. `emitAboutYouSubmit` is
      // additionally idempotent per session (see its `aboutYouReportedRef`
      // guard). The snapshot click + the survey fields on
      // `onboarding_complete_result` give the funnel two independent
      // carriers for the same data.
      emitAboutYouSubmit();
      void persistOnboardingProfileToMemory();
      const newsletterEmail = profileRef.current.email;
      const shouldSubmitNewsletter =
        NEWSLETTER_EMAIL_RE.test(newsletterEmail.trim().toLowerCase());
      if (shouldSubmitNewsletter) {
        setNewsletterSubmitting(true);
        await submitNewsletterEmail(newsletterEmail);
      }
      emitOnboardingClick('continue', 'continue');
      // Last-step Continue without a DS generation = "completed
      // without design system". The Generate path inside the
      // embedded DesignSystemCreationFlow takes a different route
      // (navigation to project) and emits its own completion.
      emitOnboardingComplete('completed', 'completed_without_design_system');
      clearOnboardingSessionId();
      onFinish();
      return;
    }
    emitOnboardingClick('continue', 'continue');
    if (step === 1) {
      void persistOnboardingProfileToMemory();
    }
    setStep((current) => current + 1);
  }

  // Cloud-landing primary CTA: pick the AMR cloud runtime and kick off the
  // Open Design Cloud sign-in in one gesture. Mirrors the AMR card's
  // selection side effects (mode/agent) followed by the AMR-sign-in path that
  // the runtime chooser's gated Continue uses, so a successful login advances
  // to the next onboarding step exactly the same way.
  async function handleCloudSignIn() {
    if (amrLoginPending || amrLoginCancelPending) return;
    const cardAttribution = recordAmrEntry(
      analytics.track,
      'onboarding_amr_card',
      new Date(),
      { metricsConsent: config.telemetry?.metrics === true },
    );
    setRuntime('amr');
    onModeChange('daemon');
    onAgentChange('amr');
    const attribution = recordAmrEntry(
      analytics.track,
      'onboarding_amr_sign_in_continue',
      new Date(),
      {
        metricsConsent: config.telemetry?.metrics === true,
        reuseExistingFrom: ['onboarding_amr_card'],
      },
    ) ?? cardAttribution;
    await handleAmrSignInToContinue(attribution);
  }

  async function handleAmrSignInToContinue(
    attribution?: AmrEntryAttribution | null,
  ) {
    if (amrLoginPending || amrLoginCancelPending) return;
    amrLoginPollCancelledRef.current = false;
    setAmrLoginError(null);
    setAmrLoginPending(true);
    try {
      const currentStatus = await fetchVelaLoginStatus();
      if (amrLoginPollCancelledRef.current) return;
      if (currentStatus) setAmrStatus(currentStatus);
      if (currentStatus?.loggedIn) {
        setStep((current) => current + 1);
        return;
      }
      if (amrLoginPollCancelledRef.current) return;
      beginAmrAuthTracking(attribution);
      const odDeviceId = amrHandoffDeviceId({
        metricsConsent: config.telemetry?.metrics === true,
        resolvedDeviceId: getResolvedDeviceId(),
        installationId: config.installationId,
      });
      const loginResult = await startVelaLogin(attribution, odDeviceId);
      if (amrLoginPollCancelledRef.current) {
        resolveAmrAuthTracking(analytics.track, 'cancelled');
        if (loginResult.ok || loginResult.alreadyRunning) {
          const cancelResult = await cancelVelaLogin();
          closeAmrActivationWindowBestEffort();
          if (!cancelResult.ok) {
            setAmrLoginError(t('settings.amrLoginErrorCompact'));
            return;
          }
          notifyAmrLoginStatusChanged('login-canceled');
        }
        return;
      }
      if (!loginResult.ok && !loginResult.alreadyRunning) {
        resolveAmrAuthTracking(analytics.track, 'failed', 'spawn_failed');
        setAmrLoginError(loginResult.error || t('settings.amrLoginErrorCompact'));
        return;
      }
      if (await pollAmrLoginCompletion()) {
        setStep((current) => current + 1);
      }
    } finally {
      setAmrLoginPending(false);
    }
  }

  async function handleCancelAmrLogin() {
    if (!amrLoginPending || amrLoginCancelPending) return;
    amrLoginPollCancelledRef.current = true;
    resolveAmrAuthTracking(analytics.track, 'cancelled');
    setAmrLoginError(null);
    setAmrLoginCancelPending(true);
    setAmrStatus((current) => (
      current
        ? { ...current, loggedIn: false, loginInFlight: false, user: null }
        : current
    ));
    setAmrLoginPending(false);
    const result = await cancelVelaLogin();
    closeAmrActivationWindowBestEffort();
    setAmrLoginCancelPending(false);
    if (!result.ok) {
      setAmrLoginError(t('settings.amrLoginErrorCompact'));
      return;
    }
    notifyAmrLoginStatusChanged('login-canceled');
  }

  async function pollAmrLoginCompletion(): Promise<boolean> {
    const startedAt = Date.now();
    while (!amrLoginPollCancelledRef.current) {
      await new Promise((resolve) =>
        window.setTimeout(resolve, AMR_LOGIN_POLL_INTERVAL_MS),
      );
      if (amrLoginPollCancelledRef.current) return false;
      const nextStatus = await fetchVelaLoginStatus();
      if (nextStatus) setAmrStatus(nextStatus);
      const outcome = amrLoginPollOutcome(nextStatus, startedAt);
      if (outcome === 'signed-in') {
        resolveAmrAuthTracking(analytics.track, 'success', undefined, {
          signedInUserId: nextStatus?.user?.id ?? null,
        });
        notifyAmrLoginStatusChanged();
        return true;
      }
      if (outcome === 'stopped' || outcome === 'timed-out') {
        if (outcome === 'timed-out') {
          resolveAmrAuthTracking(analytics.track, 'timeout', 'login_timeout');
          void cancelVelaLogin();
        } else {
          resolveAmrAuthTracking(analytics.track, 'failed', 'login_stopped');
        }
        setAmrLoginError(t('settings.amrLoginErrorCompact'));
        return false;
      }
    }
    return false;
  }

  // Survey snapshot. Reads `profileRef.current` rather than `profile`
  // because Finish-setup may fire within the same render commit as the
  // user's last dropdown pick, before React has rebound the closure to
  // the latest state. `'unknown'` covers an untouched field on the
  // About-you step (the spec keeps the wire type open-string so a new
  // role / use-case option doesn't force a contract bump).
  //
  // This now fires from the completion path (the final brand-extraction step),
  // so it stamps the About-you step coordinates explicitly instead of
  // reading the live `step` via `emitOnboardingClick`: the event describes
  // the About-you submission, not whatever step the user finished on. The
  // `aboutYouReportedRef` guard keeps it exactly-once per session.
  function emitAboutYouSubmit(): void {
    if (aboutYouReportedRef.current) return;
    const onboardingSessionId = onboardingSessionIdRef.current;
    if (!onboardingSessionId) return;
    aboutYouReportedRef.current = true;
    const snapshot = profileRef.current;
    // Persist the survey so later AMR entries (outside onboarding) can forward
    // the visitor's profile to AMR for paid-conversion segmentation.
    saveOnboardingProfile({
      role: snapshot.role,
      orgSize: snapshot.orgSize,
      useCase: snapshot.useCase,
      source: snapshot.source,
    });
    syncAmrAttributionWithOnboardingProfile(
      {
        role: snapshot.role,
        orgSize: snapshot.orgSize,
        useCase: snapshot.useCase,
        source: snapshot.source,
      },
      {
        metricsConsent: config.telemetry?.metrics === true,
        odDeviceId: amrHandoffDeviceId({
          metricsConsent: config.telemetry?.metrics === true,
          resolvedDeviceId: getResolvedDeviceId(),
          installationId: config.installationId,
        }),
      },
    );
    trackOnboardingClick(analytics.track, {
      page_name: 'onboarding',
      area: 'about_you',
      element: 'about_you_submit',
      action: 'continue',
      step_index: '2',
      step_name: 'about_you',
      onboarding_session_id: onboardingSessionId,
      role: snapshot.role || 'unknown',
      organization_size: snapshot.orgSize || 'unknown',
      use_cases: snapshot.useCase.length > 0 ? snapshot.useCase : ['unknown'],
      discovery_source: snapshot.source || 'unknown',
    });
  }

  // Optional newsletter signup captured on the Newsletter step. The last-step
  // button shows loading while this settles; failures are swallowed so
  // onboarding completion never depends on the marketing site. A blank or
  // malformed email is simply skipped. Only a boolean opt-in is tracked — the
  // address itself is never sent to analytics.
  async function submitNewsletterEmail(rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    if (!email || !NEWSLETTER_EMAIL_RE.test(email)) return;
    emitOnboardingClick('newsletter_email', 'subscribe', { newsletter_opt_in: true });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(NEWSLETTER_SUBSCRIBE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'client' }),
        signal: controller.signal,
      });
    } catch {
      // Swallow — onboarding completion must not depend on the marketing site.
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function scanCliAgents(options: { preferExisting?: boolean } = {}) {
    const scanToken = beginCliScan({ clearVisible: !options.preferExisting });
    const currentAvailableAgents = agents.filter(
      (agent) => agent.available && agent.id !== 'amr',
    );
    if (options.preferExisting && currentAvailableAgents.length > 0) {
      const selectedCliAgent = selectDefaultCliAgent(currentAvailableAgents);
      showCliAgents(scanToken, currentAvailableAgents, { stagger: false });
      setCliScanStatus('done');
      emitPendingCliScanResult(scanToken, {
        result: 'success',
        detected: agents.length,
        available: currentAvailableAgents.length,
        selectedCliId: selectedCliAgent ? agentIdToTracking(selectedCliAgent.id) : undefined,
      });
      return currentAvailableAgents;
    }
    if (options.preferExisting && agentsLoading) {
      showCliAgents(scanToken, currentAvailableAgents, { stagger: false });
      return currentAvailableAgents;
    }
    cliRefreshPendingTokenRef.current = scanToken;
    try {
      const nextAgents = await onRefreshAgents();
      if (cliScanTokenRef.current !== scanToken) return;
      cliRefreshPendingTokenRef.current = null;
      const availableAgents = nextAgents.filter((agent) => agent.available && agent.id !== 'amr');
      const selectedCliAgent = selectDefaultCliAgent(availableAgents);
      // Scan-result semantics: zero available CLIs is a `failed` outcome
      // because the user's runtime path is blocked, even though the
      // detect call itself returned successfully. `detected_cli_count`
      // separately reports the raw catalog so the dashboard can split
      // "user has no CLI installed" from "detect crashed".
      if (availableAgents.length === 0) {
        setCliScanStatus('done');
        emitPendingCliScanResult(scanToken, {
          result: 'failed',
          detected: nextAgents.length,
          available: 0,
          errorCode: 'NO_AVAILABLE_CLI',
        });
        return;
      }
      emitPendingCliScanResult(scanToken, {
        result: 'success',
        detected: nextAgents.length,
        available: availableAgents.length,
        ...(selectedCliAgent
          ? { selectedCliId: agentIdToTracking(selectedCliAgent.id) }
          : {}),
      });
      showCliAgents(scanToken, availableAgents, { stagger: true });
    } catch (err) {
      if (cliScanTokenRef.current === scanToken) {
        cliRefreshPendingTokenRef.current = null;
        setCliScanStatus('done');
        emitPendingCliScanResult(scanToken, {
          result: 'failed',
          detected: 0,
          available: 0,
          errorCode: err instanceof Error ? err.message : 'AGENT_REFRESH_THREW',
        });
      }
    }
  }

  async function testProviderInline() {
    if (!canTestProvider || providerTestState.status === 'running') return;
    const inputKey = providerTestInputKey;
    providerAutoTestKeyRef.current = inputKey;
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
    providerModelsAutoFetchKeyRef.current = inputKey;
    const cachedModels = activeProviderModelsCache[inputKey];
    if (cachedModels) {
      selectFirstProviderModelWhenEmpty(cachedModels, inputKey);
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
        selectFirstProviderModelWhenEmpty(result.models, inputKey);
        activeSetProviderModelsCache((current) => ({
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

  useEffect(() => {
    if (runtime !== 'byok' || step !== 0) return;
    if (!canFetchProviderModels) return;
    if (providerModelsState.status === 'running') return;
    if (providerModelsAutoFetchKeyRef.current === providerModelsInputKey) return;
    const timer = window.setTimeout(() => {
      void fetchProviderModelsInline();
    }, ONBOARDING_BYOK_AUTO_FETCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [
    canFetchProviderModels,
    providerModelsInputKey,
    providerModelsState.status,
    runtime,
    step,
  ]);

  useEffect(() => {
    if (runtime !== 'byok' || step !== 0) return;
    if (!canTestProvider) return;
    if (providerTestState.status === 'running') return;
    if (providerAutoTestKeyRef.current === providerTestInputKey) return;
    const timer = window.setTimeout(() => {
      void testProviderInline();
    }, ONBOARDING_BYOK_AUTO_TEST_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [
    canTestProvider,
    providerTestInputKey,
    providerTestState.status,
    runtime,
    step,
  ]);

  const onboardingNavigationLocked = newsletterSubmitting;
  const primaryActionLabel = isLastStep && newsletterSubmitting
    ? t('common.loading')
    : step === 0 && amrLoginPending
    ? t('settings.amrSigningIn')
    : step === 0 && amrSelectedAndSignedOut
      ? t('settings.amrSignInToContinue')
    : isLastStep
      ? t('settings.onboardingFinish')
      : t('settings.onboardingContinue');

  // Connect step, default face: a minimal, centered Open Design Cloud sign-in
  // landing. No stepper, no runtime cards — just the cloud CTA, a secondary
  // link into the full runtime chooser, and a top-left language/theme bar.
  if (step === 0 && connectExpanded === null) {
    const activeTheme: AppTheme = config.theme ?? 'system';
    // Resolve what the user is actually *seeing* right now: an explicit dark,
    // or system that currently maps to the OS's dark preference. The toggle
    // then flips straight to the opposite explicit theme, so every click
    // produces a visible change — no dead first click on `system → light`
    // (both light) before `light → dark` finally darkens on the second.
    const resolvedDark =
      activeTheme === 'dark' ||
      (activeTheme === 'system' &&
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    const themeIcon: 'sun' | 'moon' = resolvedDark ? 'moon' : 'sun';
    const cloudBusy = amrLoginPending;
    // 登录态尚未拉到时显示「加载中…」并禁用，避免先闪一下「登录」再翻成「继续（已登录）」。
    // 现在状态在挂载时就并行拉取，所以这个窗口很短。
    const amrStatusResolving = !amrStatusResolved;
    return (
      <section
        className="onboarding-view onboarding-view--cloud"
        aria-label={t('settings.welcomeTitle')}
      >
        <div className="onboarding-cloud__topbar">
          <LanguageMenu compact />
          <button
            type="button"
            className="onboarding-cloud__theme"
            aria-label={resolvedDark ? t('settings.themeLight') : t('settings.themeDark')}
            title={resolvedDark ? t('settings.themeLight') : t('settings.themeDark')}
            onClick={() => onThemeChange(resolvedDark ? 'light' : 'dark')}
          >
            <Icon name={themeIcon} size={25} />
          </button>
        </div>
        <div className="onboarding-cloud__center">
          <span
            className="onboarding-cloud__logo"
            role="img"
            aria-label="Open Design"
          />
          <h1 className="onboarding-cloud__title">{t('settings.onboardingCloudTitle')}</h1>
          <p className="onboarding-cloud__body">{t('settings.onboardingCloudBody')}</p>
          <button
            type="button"
            className="onboarding-cloud__primary"
            onClick={() => {
              if (amrStatusResolving) return;
              if (amrSignedIn) {
                // 已登录：不再触发登录，但仍记一次 AMR 归因，否则
                // “已登录直接继续”的用户在 AMR 归因漏斗里会整段隐形
                // （登录流程的用户由 handleCloudSignIn 记录）。
                recordAmrEntry(analytics.track, 'onboarding_amr_card', new Date(), {
                  metricsConsent: config.telemetry?.metrics === true,
                });
                // Pin the runtime explicitly (mirroring handleCloudSignIn)
                // rather than leaning on the amrAgent effect, so the
                // completion event records runtime_type='amr_cloud' even if
                // amrAgent hasn't resolved yet when Continue is clicked.
                setRuntime('amr');
                onModeChange('daemon');
                onAgentChange('amr');
                recordAmrEntry(
                  analytics.track,
                  'onboarding_amr_sign_in_continue',
                  new Date(),
                  {
                    metricsConsent: config.telemetry?.metrics === true,
                    reuseExistingFrom: ['onboarding_amr_card'],
                  },
                );
                setStep((current) => current + 1);
                return;
              }
              void handleCloudSignIn();
            }}
            disabled={cloudBusy || amrLoginCancelPending || amrStatusResolving}
            aria-busy={cloudBusy || amrStatusResolving ? true : undefined}
          >
            <Icon name="orbit" size={17} />
            <span>
              {cloudBusy
                ? t('settings.amrSigningIn')
                : amrStatusResolving
                  ? t('common.loading')
                  : amrSignedIn
                    ? t('settings.onboardingCloudContinue')
                    : t('settings.onboardingCloudSignIn')}
            </span>
          </button>
          {amrLoginError ? (
            <span className="onboarding-cloud__error" role="alert">
              {amrLoginError}
            </span>
          ) : null}
          {cloudBusy ? (
            <button
              type="button"
              className="onboarding-cloud__cancel"
              onClick={handleCancelAmrLogin}
              disabled={amrLoginCancelPending}
            >
              {t('settings.amrCancelSignIn')}
            </button>
          ) : (
            <div className="onboarding-cloud__alts">
              <button
                type="button"
                className="onboarding-cloud__secondary"
                onClick={() => {
                  emitOnboardingClick('local_coding_agent', 'select_runtime', {
                    runtime_type: 'local_cli',
                  });
                  setRuntime('local');
                  onModeChange('daemon');
                  void scanCliAgents({ preferExisting: true });
                  setConnectExpanded('local');
                }}
              >
                {t('settings.onboardingLocalTitle')}
              </button>
              <span className="onboarding-cloud__alts-or">
                {t('settings.onboardingCloudOr')}
              </span>
              <button
                type="button"
                className="onboarding-cloud__secondary"
                onClick={() => {
                  emitOnboardingClick('byok', 'select_runtime', { runtime_type: 'byok' });
                  setRuntime('byok');
                  onModeChange('api');
                  setConnectExpanded('byok');
                }}
              >
                {t('settings.onboardingByokTitle')}
              </button>
            </div>
          )}
        </div>
        <footer className="onboarding-cloud__footer">
          © {new Date().getFullYear()} Open Design · {t('settings.onboardingCloudRights')}
        </footer>
      </section>
    );
  }

  return (
    <section className="onboarding-view" aria-label={t('settings.welcomeTitle')}>
      {t('settings.welcomeKicker') || t('settings.welcomeSubtitle') ? (
        <header className="onboarding-view__hero">
          {t('settings.welcomeKicker') ? (
            <span className="onboarding-view__kicker">{t('settings.welcomeKicker')}</span>
          ) : null}
          {t('settings.welcomeSubtitle') ? <p>{t('settings.welcomeSubtitle')}</p> : null}
        </header>
      ) : null}
      <div className="onboarding-view__body">
        <div className="onboarding-view__content">
          {step === 0 ? (
            <div className="onboarding-view__panel">
              <button
                type="button"
                className="onboarding-view__back-to-cloud"
                onClick={() => setConnectExpanded(null)}
              >
                <Icon name="chevron-left" size={14} />
                <span>{t('settings.onboardingBack')}</span>
              </button>
              <OnboardingPanelHeader
                title={
                  connectExpanded === 'byok'
                    ? t('settings.onboardingByokTitle')
                    : t('settings.onboardingLocalTitle')
                }
                body={
                  connectExpanded === 'byok'
                    ? t('settings.onboardingByokBody')
                    : t('settings.onboardingLocalBody')
                }
              />
              <div className="onboarding-view__runtime-stack">
                {connectExpanded === 'local' ? (
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
                {connectExpanded === 'byok' ? (
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
              <button
                type="button"
                className="onboarding-view__back-to-cloud"
                onClick={handleBackWithTracking}
                disabled={onboardingNavigationLocked}
              >
                <Icon name="chevron-left" size={14} />
                <span>{t('settings.onboardingBack')}</span>
              </button>
              <OnboardingPanelHeader
                title={t('settings.onboardingProfileTitle')}
                body={t('settings.onboardingProfileBody')}
              />
              <div className="onboarding-view__form-grid">
                <OnboardingChipField
                  label={t('settings.onboardingRoleLabel')}
                  value={profile.role}
                  options={roleOptions}
                  onChange={(value) => {
                    if (typeof value === 'string' && value) {
                      emitOnboardingClick('role', 'select_option', {
                        role: value,
                      });
                    }
                    setProfile((current) => ({ ...current, role: value }));
                  }}
                />
                <OnboardingChipField
                  label={t('settings.onboardingOrgSizeLabel')}
                  value={profile.orgSize}
                  options={orgSizeOptions}
                  onChange={(value) => {
                    if (typeof value === 'string' && value) {
                      emitOnboardingClick('organization_size', 'select_option', {
                        organization_size: value,
                      });
                    }
                    setProfile((current) => ({ ...current, orgSize: value }));
                  }}
                />
                <OnboardingChipField
                  label={t('settings.onboardingUseCaseLabel')}
                  value={profile.useCase}
                  options={useCaseOptions}
                  multiple
                  onChange={(value) => {
                    if (!Array.isArray(value)) return;
                    // Multi-select: emit one click per newly added
                    // value (delta), not per render of the whole
                    // selection. The dashboard then sees one row per
                    // use_case chosen. Compare against `profileRef`
                    // not `profile` — rapid picks can fire onChange
                    // before React commits the previous pick, so a
                    // closure-captured `profile.useCase` is one tick
                    // behind and re-emits the prior pick on every
                    // subsequent change.
                    const previousSet = new Set(profileRef.current.useCase);
                    for (const v of value) {
                      if (!previousSet.has(v)) {
                        emitOnboardingClick('use_case', 'select_option', { use_case: v });
                      }
                    }
                    setProfile((current) => ({ ...current, useCase: value }));
                  }}
                />
                <OnboardingChipField
                  label={t('settings.onboardingSourceLabel')}
                  value={profile.source}
                  options={sourceOptions}
                  onChange={(value) => {
                    if (typeof value === 'string' && value) {
                      emitOnboardingClick('hear_about_us', 'select_option', {
                        discovery_source: value,
                      });
                    }
                    setProfile((current) => ({ ...current, source: value }));
                  }}
                />
              </div>
              <div className="onboarding-view__memory-callout">
                <span className="onboarding-view__memory-callout-icon" aria-hidden>
                  <Icon name="sparkles" size={16} />
                </span>
                <div className="onboarding-view__memory-callout-body">
                  <strong>{t('settings.onboardingMemoryCalloutTitle')}</strong>
                  <p>{t('settings.onboardingMemoryCalloutBody')}</p>
                  <ul className="onboarding-view__memory-benefits">
                    <li>
                      <Icon name="check" size={13} aria-hidden />
                      <span>{t('settings.onboardingMemoryBenefitIntent')}</span>
                    </li>
                    <li>
                      <Icon name="check" size={13} aria-hidden />
                      <span>{t('settings.onboardingMemoryBenefitFewerQuestions')}</span>
                    </li>
                    <li>
                      <Icon name="check" size={13} aria-hidden />
                      <span>{t('settings.onboardingMemoryBenefitPersonalized')}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="onboarding-view__panel onboarding-view__panel--newsletter">
              <button
                type="button"
                className="onboarding-view__back-to-cloud"
                onClick={handleBackWithTracking}
                disabled={onboardingNavigationLocked}
              >
                <Icon name="chevron-left" size={14} />
                <span>{t('settings.onboardingBack')}</span>
              </button>
              <OnboardingPanelHeader
                title={t('settings.onboardingNewsletterTitle')}
                body={t('settings.onboardingNewsletterBody')}
              />
              <label className="onboarding-view__email-field">
                <span className="onboarding-view__email-label">
                  {t('newsletter.label')}
                </span>
                <input
                  className="onboarding-view__email-input"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={t('newsletter.placeholder')}
                  value={profile.email}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </label>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="onboarding-view__panel onboarding-view__panel--newsletter">
              <OnboardingPanelHeader
                title={t('onboarding.brandTitle')}
                body={t('onboarding.brandSubtitle')}
              />
              <label className="onboarding-view__email-field">
                <span className="onboarding-view__email-label">
                  {t('newBrand.urlLabel')}
                </span>
                <input
                  className="onboarding-view__brand-url-input"
                  type="url"
                  autoComplete="url"
                  inputMode="url"
                  placeholder={t('newBrand.urlPlaceholder')}
                  value={brandUrl}
                  disabled={brandExtractActive}
                  onChange={(event) => setBrandUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      brandUrl.trim() &&
                      !brandExtractActive
                    ) {
                      event.preventDefault();
                      void handleOnboardingBrandExtract();
                    }
                  }}
                />
              </label>
              <div className="onboarding-view__email-field">
                <button
                  type="button"
                  className={`onboarding-view__mini-button${brandExtractActive ? ' is-loading' : ''}`}
                  onClick={() => {
                    void handleOnboardingBrandExtract();
                  }}
                  disabled={!brandUrl.trim() || brandExtractActive}
                >
                  {brandExtractActive
                    ? t('brand.extracting')
                    : t('newBrand.extract')}
                </button>
                {brandExtractActive ? (
                  <span
                    className="onboarding-view__action-status"
                    role="status"
                  >
                    {t('brand.extracting')}
                  </span>
                ) : null}
                {brandExtractDone ? (
                  <span className="onboarding-view__action-status" role="status">
                    {t('onboarding.brandDone')}
                  </span>
                ) : null}
                {brandExtractFailed ? (
                  <span
                    className="onboarding-view__action-status is-error"
                    role="alert"
                  >
                    {brandExtractState.error || t('brand.failed')}
                  </span>
                ) : null}
              </div>
              <div
                style={{
                  marginTop: 22,
                  paddingTop: 18,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <BrandReferencePicker
                  variant="compact"
                  busy={brandExtractActive}
                  error={
                    brandExtractFailed
                      ? brandExtractState.error || t('brand.failed')
                      : null
                  }
                  onPick={handleOnboardingPickReference}
                />
              </div>
            </div>
          ) : null}

          <div className="onboarding-view__actions">
            {step === 0 && amrLoginError ? (
              <span className="onboarding-view__action-status is-error" role="alert">
                {amrLoginError}
              </span>
            ) : null}
            {step === 0 && amrLoginPending ? (
              <button
                type="button"
                className="onboarding-view__secondary"
                onClick={handleCancelAmrLogin}
                disabled={amrLoginCancelPending}
              >
                {t('settings.amrCancelSignIn')}
              </button>
            ) : null}
            <button
              type="button"
              className={`onboarding-view__primary${
                connectGateTooltip ? ' od-tooltip' : ''
              }`}
              onClick={handlePrimaryAction}
              // The Connect gate uses `aria-disabled`, not the native `disabled`
              // attribute, so the button still receives hover/focus and can show
              // its tooltip explaining what to configure. `handlePrimaryAction`
              // guards the click. Truly-busy states stay natively disabled.
              disabled={amrLoginPending || amrLoginCancelPending || newsletterSubmitting}
              aria-disabled={connectStepBlocked || undefined}
              data-tooltip={connectGateTooltip ?? undefined}
              data-tooltip-placement="top"
              aria-busy={newsletterSubmitting ? true : undefined}
            >
              <span>{primaryActionLabel}</span>
            </button>
          </div>
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
          searchable
          searchPlaceholder={t('newproj.modelSearch')}
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
        searchable
        searchPlaceholder={t('settings.quickFillProvider')}
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
            searchable
            searchPlaceholder={t('newproj.modelSearch')}
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

type OnboardingChipFieldProps =
  | {
      label: string;
      options: Array<{ value: string; label: string }>;
      value: string;
      onChange: (value: string) => void;
      multiple?: false;
    }
  | {
      label: string;
      options: Array<{ value: string; label: string }>;
      value: string[];
      onChange: (value: string[]) => void;
      multiple: true;
    };

// Profile fields render their options as a flat row of toggleable chips
// instead of a dropdown, so a pick is one tap with every choice already in
// view. Single-select chips behave as a radio (re-tapping clears); multi
// select chips toggle independently.
function OnboardingChipField(props: OnboardingChipFieldProps) {
  const { label, options } = props;
  const selected: string[] = props.multiple
    ? props.value
    : props.value
      ? [props.value]
      : [];
  return (
    <div className="onboarding-chip-field">
      <span className="onboarding-chip-field__label">{label}</span>
      <div className="onboarding-chip-field__chips">
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              type="button"
              key={option.value}
              className={`onboarding-chip${active ? ' is-selected' : ''}`}
              aria-pressed={active}
              onClick={() => {
                if (props.multiple) {
                  props.onChange(
                    active
                      ? props.value.filter((value) => value !== option.value)
                      : [...props.value, option.value],
                  );
                } else {
                  props.onChange(active ? '' : option.value);
                }
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type OnboardingDropdownBaseProps = {
  label: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  placement?: 'bottom' | 'top';
  searchable?: boolean;
  searchPlaceholder?: string;
  sourceTone?: string;
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

export function OnboardingDropdown(props: OnboardingDropdownProps) {
  const t = useT();
  const {
    label,
    placeholder,
    value,
    options,
    placement = 'bottom',
    multiple = false,
    searchable = false,
    searchPlaceholder,
    sourceTone,
  } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [resolvedPlacement, setResolvedPlacement] = useState(placement);
  const [menuMaxHeight, setMenuMaxHeight] = useState(240);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dropdownIdRef = useRef(`onboarding-dropdown-${Math.random().toString(36).slice(2)}`);
  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];
  const selectedOptions = options.filter((option) => selectedValues.includes(option.value));
  const selectedOption = selectedOptions[0];
  const hasValue = selectedOptions.length > 0;
  const selectedLabel = multiple
    ? selectedOptions.map((option) => option.label).join(', ')
    : selectedOption?.label;
  const triggerLabel = selectedLabel || placeholder;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions =
    searchable && normalizedQuery
      ? options.filter((option) =>
          `${option.label} ${option.value}`.toLowerCase().includes(normalizedQuery),
        )
      : options;
  const emptyMessage = searchable ? t('homeHero.footer.noMatches') : t('settings.fetchModelsEmpty');

  useLayoutEffect(() => {
    if (!open) return;

    function measureMenu() {
      const root = rootRef.current;
      if (!root) return;

      const rect = root.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const nextPlacement =
        placement === 'top' || (spaceBelow < 260 && spaceAbove > spaceBelow)
          ? 'top'
          : 'bottom';
      const availableSpace = nextPlacement === 'top' ? spaceAbove : spaceBelow;
      setResolvedPlacement(nextPlacement);
      setMenuMaxHeight(Math.max(48, Math.min(240, availableSpace - 16)));
    }

    measureMenu();
    window.addEventListener('resize', measureMenu);
    window.addEventListener('scroll', measureMenu, true);
    return () => {
      window.removeEventListener('resize', measureMenu);
      window.removeEventListener('scroll', measureMenu, true);
    };
  }, [open, placement, options.length]);

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

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    function handlePeerOpen(event: Event) {
      if ((event as CustomEvent<string>).detail !== dropdownIdRef.current) {
        setOpen(false);
      }
    }

    window.addEventListener(ONBOARDING_DROPDOWN_OPEN_EVENT, handlePeerOpen);
    return () => {
      window.removeEventListener(ONBOARDING_DROPDOWN_OPEN_EVENT, handlePeerOpen);
    };
  }, []);

  function toggleOpen() {
    setOpen((current) => {
      const nextOpen = !current;
      if (nextOpen) {
        window.dispatchEvent(
          new CustomEvent(ONBOARDING_DROPDOWN_OPEN_EVENT, {
            detail: dropdownIdRef.current,
          }),
        );
      }
      return nextOpen;
    });
  }

  return (
    <div
      className="onboarding-view__select-field"
      data-placement={resolvedPlacement}
      data-open={open || undefined}
      ref={rootRef}
    >
      <span
        className="onboarding-view__select-label"
        data-source-tone={sourceTone || undefined}
      >
        {label}
      </span>
      <button
        type="button"
        className={`onboarding-view__select-trigger${open ? ' is-open' : ''}${
          hasValue ? ' has-value' : ''
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={triggerLabel}
        onClick={toggleOpen}
      >
        <span>{triggerLabel}</span>
        <Icon name="chevron-down" size={16} />
      </button>
      {open ? (
        <div
          className="onboarding-view__select-menu"
          data-searchable={searchable || undefined}
          style={{ '--onboarding-select-menu-max-height': `${menuMaxHeight}px` } as CSSProperties}
        >
          {searchable ? (
            <label
              className="onboarding-view__select-search"
              onClick={(event) => event.stopPropagation()}
            >
              <Icon name="search" size={14} />
              <input
                type="search"
                value={query}
                placeholder={searchPlaceholder || placeholder}
                aria-label={searchPlaceholder || label}
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') {
                    event.stopPropagation();
                  }
                }}
              />
            </label>
          ) : null}
          <div
            className="onboarding-view__select-options"
            role="listbox"
            aria-label={label}
            aria-multiselectable={multiple || undefined}
          >
            {visibleOptions.map((option) => {
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
            {visibleOptions.length === 0 ? (
              <div className="onboarding-view__select-empty">{emptyMessage}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Placeholder for the AMR cloud card shown while AMR availability is still
// being probed (the cold-start detection stream / one-shot re-probe). It
// mirrors the real card's footprint exactly — same featured/amr grid, same
// 246px min-height — so resolving to the real card causes no layout jump.
// The AMR brand (icon + name) is known up-front and rendered solid; only the
// version meta, benefit list, and model picker — the parts that depend on the
// probe result — shimmer. Non-interactive and announced via role="status".
