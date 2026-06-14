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
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  defaultScenarioPluginIdForProjectMetadata,
  type ChatSessionMode,
  type ConnectorDetail,
  type InstalledPluginRecord,
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
import { recordAmrEntry, type AmrEntryAttribution } from '../analytics/amr-attribution';
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
import { Icon, type IconName } from './Icon';
import { AgentIcon } from './AgentIcon';
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
import { closeAmrActivationWindowBestEffort } from './AmrLoginPill';
import { AnimatePresence } from 'motion/react';
import { smoothScrollToTop } from '../utils/smoothScrollToTop';
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

const DISCORD_URL = 'https://discord.gg/mHAjSMV6gz';
const X_URL = 'https://x.com/nexudotio';
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
const ONBOARDING_AMR_MODEL_OPTIONS: NonNullable<AgentInfo['models']> = [
  { id: 'claude-opus-4.8', label: 'Claude Opus 4.8' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'glm-5.1', label: 'GLM 5.1' },
];

type OnboardingGoalId =
  | 'deck'
  | 'landing'
  | 'prototype'
  | 'dashboard'
  | 'marketing'
  | 'design-system';

type OnboardingMaterialKind = 'url' | 'upload' | 'prompt';

type OnboardingGoal = {
  id: OnboardingGoalId;
  icon: IconName;
  title: string;
  body: string;
  artifact: string;
  starterScope: string;
  styleHint: string;
  delivery: string;
  metadata: ProjectMetadata;
};

type OnboardingMaterialOption = {
  id: OnboardingMaterialKind;
  icon: IconName;
  title: string;
  body: string;
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

function goalProjectName(goal: OnboardingGoal, need: string, sourceUrl: string): string {
  const sourceHost = (() => {
    try {
      return new URL(sourceUrl.trim()).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();
  const words = need.trim().split(/\s+/).filter(Boolean).slice(0, 7).join(' ');
  if (sourceHost) return `${goal.artifact} for ${sourceHost}`;
  if (words) return words;
  return goal.artifact;
}

function onboardingMaterialSummary(args: {
  materialKind: OnboardingMaterialKind;
  sourceUrl: string;
  need: string;
  stagedFiles: File[];
}): string {
  if (args.materialKind === 'url') {
    return args.sourceUrl.trim() || 'Website URL to be added';
  }
  if (args.materialKind === 'upload') {
    return args.stagedFiles.length > 0
      ? args.stagedFiles.map((file) => file.name).join(', ')
      : 'Files, screenshots, PPT, or PDF to be added';
  }
  return args.need.trim() || 'One sentence brief to be added';
}

function buildOnboardingPrompt(args: {
  goal: OnboardingGoal;
  materialKind: OnboardingMaterialKind;
  sourceUrl: string;
  need: string;
  stagedFiles: File[];
}): string {
  const material =
    args.materialKind === 'url'
      ? `Website URL: ${args.sourceUrl.trim() || 'not provided'}`
      : args.materialKind === 'upload'
        ? `Uploaded files: ${
            args.stagedFiles.length > 0
              ? args.stagedFiles.map((file) => file.name).join(', ')
              : 'not provided'
          }`
        : `Written request: ${args.need.trim() || 'not provided'}`;
  const userNeed = args.need.trim();
  return [
    `Create a starter result for: ${args.goal.title}.`,
    '',
    'Use this onboarding brief:',
    `- Target artifact: ${args.goal.artifact}`,
    `- Starter scope: ${args.goal.starterScope}`,
    `- Style direction: ${args.goal.styleHint}`,
    `- Content source: ${material}`,
    `- Delivery format: ${args.goal.delivery}`,
    `- Design system or memory: ${
      args.goal.id === 'design-system'
        ? 'Create reusable brand/design-system foundations.'
        : 'Use existing project memory or design-system context only if available; do not block on it.'
    }`,
    userNeed ? `- User request: ${userNeed}` : '',
    '',
    'Important: produce a concrete first version inside the starter scope instead of trying to complete an unlimited full project. Make it useful enough to inspect, edit, export, or extend.',
  ].filter(Boolean).join('\n');
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
  onOpenProject: (id: string) => void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => Promise<boolean | void> | boolean | void;
  onRenameProject: (id: string, name: string) => void;
  onChangeDefaultDesignSystem: (id: string) => void;
  onCreateDesignSystem?: () => void;
  // NOTE: first-run onboarding intentionally no longer hosts guided
  // design-system creation as a separate embedded flow. The current path
  // turns "Design system / brand guideline" into a normal starter brief,
  // then generates the first result through AMR/CLI/BYOK like every other
  // goal. Guided creation stays reachable from the standalone
  // `design-system-create` route and the Design Systems tab.
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
    onCreateProject({
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
            defaultDesignSystemId={defaultDesignSystemId}
            onModeChange={onModeChange}
            onAgentChange={onAgentChange}
            onAgentModelChange={onAgentModelChange}
            onApiProtocolChange={onApiProtocolChange}
            onApiModelChange={onApiModelChange}
            onConfigPersist={onConfigPersist}
            onRefreshAgents={onRefreshAgents}
            onCreateProject={onCreateProject}
            onComplete={onCompleteOnboarding}
            onFinish={finishOnboarding}
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
  defaultDesignSystemId,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onConfigPersist,
  onRefreshAgents,
  onCreateProject,
  onComplete,
  onFinish,
}: {
  config: AppConfig;
  providerModelsCache?: ProviderModelsCache;
  onProviderModelsCacheChange?: Dispatch<SetStateAction<ProviderModelsCache>>;
  agents: AgentInfo[];
  agentsLoading?: boolean;
  daemonLive: boolean;
  defaultDesignSystemId: string | null;
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
  onComplete: () => void;
  onFinish: () => void;
}) {
  const t = useT();
  const analytics = useAnalytics();
  const [step, setStep] = useState(0);
  const [runtime, setRuntime] = useState<'amr' | 'local' | 'byok' | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [cliScanStatus, setCliScanStatus] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [amrStatus, setAmrStatus] = useState<VelaLoginStatus | null>(null);
  // True while the one-shot AMR re-probe (fired when the cold-start stream
  // settled without surfacing AMR) is in flight. Combined with
  // `agentsLoading`, this is the full window during which AMR availability
  // is still undecided — and the AMR cloud card renders its skeleton.
  const [amrRefreshPending, setAmrRefreshPending] = useState(false);
  const [amrLoginPending, setAmrLoginPending] = useState(false);
  const [amrLoginCancelPending, setAmrLoginCancelPending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [amrLoginError, setAmrLoginError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [visibleAgentIds, setVisibleAgentIds] = useState<string[]>([]);
  const [goal, setGoal] = useState<OnboardingGoalId>('prototype');
  const [materialKind, setMaterialKind] = useState<OnboardingMaterialKind>('prompt');
  const [sourceUrl, setSourceUrl] = useState('');
  const [need, setNeed] = useState('');
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
  const agentRevealTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const cliScanTokenRef = useRef(0);
  const amrLoginPollCancelledRef = useRef(false);
  const amrAgentRefreshAttemptedRef = useRef(false);
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
    (agent) => agent.available && agent.id !== 'amr' && visibleAgentIds.includes(agent.id),
  );
  const amrAgent = agents.find((agent) => agent.id === 'amr' && agent.available) ?? null;
  // AMR availability is still undecided while the cold-start stream runs or
  // the one-shot re-probe is in flight. During that window we show the AMR
  // cloud card in a skeleton state rather than hiding it (the gap users hit
  // today: card absent for several seconds, then it pops in). Once detection
  // settles, the card is either real (amrAgent) or omitted.
  const amrDetecting = !amrAgent && (agentsLoading || amrRefreshPending);
  const showAmrCloudOption = amrAgent !== null;
  const amrSignedIn = amrStatus?.loggedIn === true;
  const amrSelectedAndSignedOut = runtime === 'amr' && !amrSignedIn;
  const amrAgentChoice = config.agentModels?.amr ?? {};
  const amrModels =
    amrAgent?.models && amrAgent.models.length > 0
      ? amrAgent.models
      : ONBOARDING_AMR_MODEL_OPTIONS;
  const amrModelsSource =
    amrAgent?.models && amrAgent.models.length > 0
      ? amrAgent.modelsSource ?? 'fallback'
      : 'fallback';
  const amrKnownModelIds = amrModels.map((model) => model.id);
  const amrConfiguredModel =
    typeof amrAgentChoice.model === 'string' && amrAgentChoice.model
      ? amrAgentChoice.model
      : null;
  const amrSelectedModel =
    amrConfiguredModel && amrKnownModelIds.includes(amrConfiguredModel)
      ? amrConfiguredModel
      : amrModels[0]?.id ?? '';
  const selectedAgent = visibleAgents.find((agent) => agent.id === config.agentId) ?? null;
  const selectedAgentChoice = selectedAgent ? (config.agentModels?.[selectedAgent.id] ?? {}) : {};

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
    // The cold-start stream finished without AMR. Re-probe once before we
    // conclude AMR is unavailable, and keep the card in its skeleton state
    // for the duration so it doesn't flash out-and-back-in.
    if (amrAgent || amrAgentRefreshAttemptedRef.current || agentsLoading) return;
    amrAgentRefreshAttemptedRef.current = true;
    setAmrRefreshPending(true);
    void Promise.resolve(onRefreshAgents())
      .catch(() => undefined)
      .finally(() => setAmrRefreshPending(false));
  }, [amrAgent, agentsLoading, onRefreshAgents]);

  useEffect(() => {
    if (!amrAgent) return;
    let cancelled = false;
    void fetchVelaLoginStatus().then((next) => {
      if (!cancelled && next) setAmrStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [amrAgent]);

  useEffect(() => {
    if (runtime === 'amr') return;
    amrLoginPollCancelledRef.current = true;
    setAmrLoginPending(false);
    setAmrLoginCancelPending(false);
  }, [runtime]);

  // Onboarding step exposure. First-run now optimizes for completing a
  // starter artifact: goal -> material -> brief -> generation. About-you
  // and newsletter prompts are intentionally deferred until after the
  // first result, so no survey step blocks generation.
  const onboardingSessionIdRef = useRef<string>('');
  if (!onboardingSessionIdRef.current) {
    onboardingSessionIdRef.current = getOrCreateOnboardingSessionId();
  }
  useEffect(() => {
    const onboardingSessionId = onboardingSessionIdRef.current;
    if (!onboardingSessionId) return;
    const { area, stepIndex, stepName } = stepInfo(step);
    trackPageView(analytics.track, {
      page_name: 'onboarding',
      area,
      step_index: stepIndex,
      step_name: stepName,
      onboarding_session_id: onboardingSessionId,
    });
  }, [analytics.track, step]);

  // Onboarding analytics helpers. Wall-clock start so the lifecycle
  // result event can carry `duration_ms`; `runtime` state is the user's
  // current pick at click time so `runtime_type` rides along on every
  // click. The `_lifecycleReportedRef` guards against double-firing the
  // completion event when the user fires both Skip and unmount in the
  // same tick (the unmount path also clears the session id; see the
  // PR #2453 follow-up).
  const onboardingStartedAtRef = useRef<number>(Date.now());
  const lifecycleReportedRef = useRef(false);
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
    if (stepIdx === 0) return { area: 'goal', stepIndex: '1', stepName: 'goal' };
    if (stepIdx === 1) return { area: 'source', stepIndex: '2', stepName: 'source' };
    if (stepIdx === 2) return { area: 'brief', stepIndex: '3', stepName: 'brief' };
    if (stepIdx === 3) return { area: 'runtime', stepIndex: '4', stepName: 'connect' };
    return { area: 'generation_progress', stepIndex: 'progress', stepName: 'generation' };
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
      : selectedGoal.id === 'design-system';
    const starterSourceCount =
      stagedFiles.length > 0 ? stagedFiles.length : (sourceUrl.trim() || need.trim()) ? 1 : 0;
    const sourceCount = snapshot ? snapshot.sourceCount : starterSourceCount;
    trackOnboardingCompleteResult(analytics.track, {
      page_name: 'onboarding',
      area: 'onboarding',
      result,
      exit_step_name: info.stepName,
      completion_type: completionType,
      runtime_type: currentRuntimeType(),
      has_about_you: false,
      has_design_system_request: hasRequest,
      source_count: sourceCount,
      ...(extra.errorCode ? { error_code: extra.errorCode } : {}),
      duration_ms: Math.max(0, Date.now() - onboardingStartedAtRef.current),
      onboarding_session_id: onboardingSessionId,
    });
  }

  const steps = [
    t('settings.onboardingStepConnect'),
    t('settings.onboardingStepProfile'),
    t('settings.onboardingStepNewsletter'),
    t('settings.onboardingConnectTitle'),
    t('settings.onboardingStepDesignSystem'),
  ];
  const isLastStep = step === steps.length - 1;
  const isAmrConnectStep = step === 3;
  const isGenerateStep = isLastStep;
  const onboardingGoals: OnboardingGoal[] = [
    {
      id: 'deck',
      icon: 'present',
      title: t('settings.onboardingUseDeck'),
      body: 'Starter deck: outline plus 3-5 designed sample slides.',
      artifact: 'PPT / report / course deck',
      starterScope: '3-5 representative slides plus a clear deck structure',
      styleHint: 'presentation-ready, editorial, easy to export',
      delivery: 'Editable slide/deck project',
      metadata: { kind: 'deck', speakerNotes: false },
    },
    {
      id: 'landing',
      icon: 'globe',
      title: t('settings.onboardingUseLanding'),
      body: 'Starter landing page with first screen and one supporting section.',
      artifact: 'Landing page / official website',
      starterScope: 'hero section plus one content section',
      styleHint: 'brand-forward, responsive, conversion-aware',
      delivery: 'Editable web prototype',
      metadata: {
        kind: 'prototype',
        fidelity: 'high-fidelity',
        includeLandingPage: true,
        platform: 'responsive',
        platformTargets: ['responsive'],
      },
    },
    {
      id: 'prototype',
      icon: 'layers-filled',
      title: t('settings.onboardingUsePrototype'),
      body: 'Starter app prototype with the core flow and 3 key screens.',
      artifact: 'App / product prototype',
      starterScope: 'core user flow plus 3 key screens',
      styleHint: 'product-grade, coherent IA, ready to iterate',
      delivery: 'Editable app prototype',
      metadata: {
        kind: 'prototype',
        fidelity: 'high-fidelity',
        platform: 'responsive',
        platformTargets: ['responsive'],
      },
    },
    {
      id: 'dashboard',
      icon: 'kanban',
      title: t('settings.onboardingUseDashboard'),
      body: 'Starter internal tool with the main view and one detail state.',
      artifact: 'Dashboard / internal tool',
      starterScope: 'main dashboard plus one detail or empty state',
      styleHint: 'dense, operational, built for scanning',
      delivery: 'Editable dashboard prototype',
      metadata: {
        kind: 'prototype',
        fidelity: 'high-fidelity',
        platform: 'web-desktop',
        platformTargets: ['web-desktop'],
      },
    },
    {
      id: 'marketing',
      icon: 'image',
      title: t('settings.onboardingUseAds'),
      body: 'Starter social or marketing visual direction.',
      artifact: 'Social media / marketing asset',
      starterScope: 'one polished marketing visual direction',
      styleHint: 'campaign-ready, on-brand, high-impact',
      delivery: 'Editable image generation project',
      metadata: { kind: 'image', imageAspect: '16:9' },
    },
    {
      id: 'design-system',
      icon: 'palette',
      title: t('settings.onboardingUseDesignSystem'),
      body: 'Starter brand foundation with tokens and component direction.',
      artifact: 'Design system / brand guideline',
      starterScope: 'brand foundation, color/type tokens, component direction',
      styleHint: 'systematic, reusable, implementation-aware',
      delivery: 'Editable brand/design-system brief',
      metadata: { kind: 'other' },
    },
  ];
  const selectedGoal =
    onboardingGoals.find((item) => item.id === goal) ?? onboardingGoals[0]!;
  const materialOptions: OnboardingMaterialOption[] = [
    {
      id: 'url',
      icon: 'link',
      title: t('settings.onboardingGithubTitle'),
      body: 'Paste a product, docs, or brand website.',
    },
    {
      id: 'upload',
      icon: 'upload',
      title: t('settings.onboardingUploadTitle'),
      body: 'Add screenshots, PPT, PDF, docs, or reference images.',
    },
    {
      id: 'prompt',
      icon: 'sparkles',
      title: t('settings.onboardingPromptTitle'),
      body: 'Write one sentence and Open Design will structure the brief.',
    },
  ];
  const sourceSummary = onboardingMaterialSummary({
    materialKind,
    sourceUrl,
    need,
    stagedFiles,
  });
  const starterPrompt = buildOnboardingPrompt({
    goal: selectedGoal,
    materialKind,
    sourceUrl,
    need,
    stagedFiles,
  });

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
        emitOnboardingClick('local_coding_agent', 'select_runtime', {
          runtime_type: 'local_cli',
        });
        void scanCliAgents();
      },
    },
    {
      id: 'byok',
      icon: 'sliders',
      title: t('settings.onboardingByokTitle'),
      body: t('settings.onboardingByokBody'),
      onSelect: () => {
        emitOnboardingClick('byok', 'select_runtime', { runtime_type: 'byok' });
        setRuntime('byok');
        onModeChange('api');
      },
    },
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

  function clearAgentRevealTimers() {
    agentRevealTimersRef.current.forEach((timer) => clearTimeout(timer));
    agentRevealTimersRef.current = [];
  }

  function handleSkipWithTracking(): void {
    emitOnboardingClick('skip', 'skip');
    emitOnboardingComplete('skipped', 'skipped');
    clearOnboardingSessionId();
    onFinish();
  }
  function handleBackWithTracking(): void {
    if (generating) return;
    if (step === 0) {
      // Step 0 "Back" semantically maps to Skip — there's nowhere
      // earlier to go. Match the Skip telemetry shape rather than
      // emit a back-without-prior-step row.
      handleSkipWithTracking();
      return;
    }
    emitOnboardingClick('back', 'back');
    setStep((current) => current - 1);
  }
  async function handlePrimaryAction() {
    if (generating) return;
    setGenerateError(null);
    setAmrLoginError(null);
    if (!isLastStep) {
      if (isAmrConnectStep && runtime === 'amr' && amrSelectedAndSignedOut) {
        const attribution = recordAmrEntry(
          analytics.track,
          'onboarding_amr_sign_in_continue',
          new Date(),
          { reuseExistingFrom: ['onboarding_amr_card'] },
        );
        void handleAmrSignInToContinue(attribution);
        return;
      }
      emitOnboardingClick('continue', 'continue');
      setStep((current) => current + 1);
      return;
    }
    if (runtime === 'amr' && amrSelectedAndSignedOut) {
      setStep(3);
      setGenerateError('Log in to AMR and check starter credit before generating.');
      return;
    }
    await createStarterProject();
  }

  async function continueAfterAmrReady() {
    if (isGenerateStep) {
      await createStarterProject();
      return;
    }
    setStep((current) => current + 1);
  }

  async function createStarterProject() {
    if (generating) return;
    if (runtime === null) {
      setGenerateError('Starter AMR is still loading. Rescan, choose Local CLI/BYOK, or try again in a moment.');
      return;
    }
    if (runtime === 'local' && !selectedAgent) {
      setGenerateError('Pick a local CLI, rescan, or switch back to the starter AMR path.');
      return;
    }
    if (runtime === 'byok' && !canTestProvider) {
      setGenerateError('Fill API key, base URL, and model, or switch back to the starter AMR path.');
      return;
    }
    const completionType: TrackingOnboardingCompletionType =
      selectedGoal.id === 'design-system'
        ? 'completed_with_design_system'
        : 'completed_without_design_system';
    setGenerating(true);
    try {
      if (runtime === 'amr') {
        onModeChange('daemon');
        onAgentChange('amr');
      }
      const metadata: ProjectMetadata = {
        ...selectedGoal.metadata,
        nameSource: 'generated',
      };
      const name = goalProjectName(selectedGoal, need, sourceUrl);
      const createInput: CreateInput = {
        name,
        skillId: null,
        designSystemId:
          selectedGoal.id === 'design-system' ? null : defaultDesignSystemId,
        metadata,
      };
      const pluginId = defaultPluginIdForMetadata(metadata);
      const pluginInputs = defaultPluginInputsForCreate(createInput, pluginId);
      emitOnboardingClick('generate', 'generate');
      const created = await onCreateProject({
        ...createInput,
        pendingPrompt: starterPrompt,
        ...(pluginId ? { pluginId } : {}),
        ...(pluginInputs ? { pluginInputs } : {}),
        ...(stagedFiles.length > 0 ? { pendingFiles: stagedFiles } : {}),
        conversationMode: 'design',
        autoSendFirstMessage: true,
      });
      if (created === false) {
        setGenerateError('Could not create the starter project. Your brief is still here.');
        emitOnboardingComplete('failed', completionType, {
          errorCode: 'CREATE_PROJECT_FAILED',
        });
        return;
      }
      emitOnboardingComplete('completed', completionType);
      clearOnboardingSessionId();
      onComplete();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown create error';
      setGenerateError(message || 'Could not create the starter project. Your brief is still here.');
      emitOnboardingComplete('failed', completionType, {
        errorCode: message || 'CREATE_PROJECT_THREW',
      });
    } finally {
      setGenerating(false);
    }
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
        await continueAfterAmrReady();
        return;
      }
      if (amrLoginPollCancelledRef.current) return;
      beginAmrAuthTracking(attribution);
      const loginResult = await startVelaLogin(attribution);
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
        await continueAfterAmrReady();
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

  async function scanCliAgents() {
    const scanToken = cliScanTokenRef.current + 1;
    cliScanTokenRef.current = scanToken;
    clearAgentRevealTimers();
    setRuntime('local');
    onModeChange('daemon');
    setCliScanStatus('scanning');
    setVisibleAgentIds([]);
    const scanStartedAt = Date.now();
    const onboardingSessionId = onboardingSessionIdRef.current;
    const emitScanResult = (
      args: {
        result: 'success' | 'failed';
        detected: number;
        available: number;
        selectedCliId?: TrackingCliProviderId;
        errorCode?: string;
      },
    ): void => {
      if (!onboardingSessionId) return;
      trackOnboardingRuntimeScanResult(analytics.track, {
        page_name: 'onboarding',
        area: 'runtime',
        runtime_type: 'local_cli',
        result: args.result,
        detected_cli_count: args.detected,
        available_cli_count: args.available,
        ...(args.selectedCliId ? { selected_cli_id: args.selectedCliId } : {}),
        ...(args.errorCode ? { error_code: args.errorCode } : {}),
        duration_ms: Math.max(0, Date.now() - scanStartedAt),
        onboarding_session_id: onboardingSessionId,
      });
    };
    try {
      const nextAgents = await onRefreshAgents();
      if (cliScanTokenRef.current !== scanToken) return;
      const availableAgents = nextAgents.filter((agent) => agent.available && agent.id !== 'amr');
      // If the user previously had AMR selected (e.g. it was auto-picked once
      // we detected vela) and they have now chosen the Local CLI path, the
      // persisted agentId is still 'amr' and would survive Continue without
      // an explicit click on a local agent card. Switch the selection to the
      // first available local agent as soon as we have one, so the runtime
      // and the persisted agent always agree.
      if (config.agentId === 'amr' && availableAgents[0]) {
        onAgentChange(availableAgents[0].id);
      }
      // Scan-result semantics: zero available CLIs is a `failed` outcome
      // because the user's runtime path is blocked, even though the
      // detect call itself returned successfully. `detected_cli_count`
      // separately reports the raw catalog so the dashboard can split
      // "user has no CLI installed" from "detect crashed".
      if (availableAgents.length === 0) {
        setCliScanStatus('done');
        emitScanResult({
          result: 'failed',
          detected: nextAgents.length,
          available: 0,
          errorCode: 'NO_AVAILABLE_CLI',
        });
        return;
      }
      emitScanResult({
        result: 'success',
        detected: nextAgents.length,
        available: availableAgents.length,
        ...(availableAgents[0]
          ? { selectedCliId: agentIdToTracking(availableAgents[0].id) }
          : {}),
      });
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
    } catch (err) {
      if (cliScanTokenRef.current === scanToken) {
        setCliScanStatus('done');
        emitScanResult({
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
    const cachedModels = activeProviderModelsCache[inputKey];
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

  const onboardingNavigationLocked = generating || amrLoginPending || amrLoginCancelPending;
  const primaryActionLabel = isGenerateStep && generating
    ? t('common.loading')
    : isAmrConnectStep && amrLoginPending
    ? t('settings.amrSigningIn')
    : isAmrConnectStep && runtime === null
      ? 'Choose AMR, Local CLI, or BYOK'
    : isAmrConnectStep && runtime === 'amr' && amrSelectedAndSignedOut
      ? 'Log in to AMR and check credit'
    : isAmrConnectStep
      ? 'Continue to generation'
    : isGenerateStep && runtime === null
      ? 'Choose AMR, Local CLI, or BYOK'
    : isGenerateStep && runtime === 'amr' && amrSelectedAndSignedOut
      ? 'Log in to AMR first'
    : isGenerateStep
      ? 'Start generating'
      : t('settings.onboardingContinue');
  const primaryDisabled =
    onboardingNavigationLocked || ((isAmrConnectStep || isGenerateStep) && runtime === null);

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
            <button
              type="button"
              onClick={() => setStep(index)}
              disabled={onboardingNavigationLocked}
            >
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
                title="What do you want to make?"
                body="Pick the first concrete outcome. Open Design will generate a starter version first, then you can expand it."
              />
              <div className="onboarding-view__goal-grid">
                {onboardingGoals.map((item) => (
                  <OnboardingChoiceCard
                    key={item.id}
                    icon={item.icon}
                    title={item.title}
                    body={item.body}
                    selected={goal === item.id}
                    onClick={() => {
                      setGoal(item.id);
                      emitOnboardingClick('use_case', 'select_option', { use_case: item.id });
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="onboarding-view__panel">
              <OnboardingPanelHeader
                title="Give Open Design a little material"
                body="A URL, a file, or one sentence is enough. You can keep it rough; the brief is editable on the next screen."
              />
              <div className="onboarding-view__source-grid">
                {materialOptions.map((item) => (
                  <OnboardingChoiceCard
                    key={item.id}
                    icon={item.icon}
                    title={item.title}
                    body={item.body}
                    selected={materialKind === item.id}
                    onClick={() => {
                      setMaterialKind(item.id);
                      emitOnboardingClick(
                        item.id === 'url'
                          ? 'github_repo'
                          : item.id === 'upload'
                            ? 'assets_upload'
                            : 'source_prompt',
                        'select_option',
                        {
                          source_type: item.id === 'url'
                            ? 'github_repo'
                            : item.id === 'upload'
                              ? 'assets'
                              : 'text',
                        },
                      );
                    }}
                  />
                ))}
              </div>
              {materialKind === 'url' ? (
                <label className="onboarding-view__inline-field">
                  <span>Website URL</span>
                  <input
                    type="url"
                    inputMode="url"
                    placeholder="https://example.com"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                  />
                </label>
              ) : null}
              {materialKind === 'upload' ? (
                <label className="onboarding-view__upload-field">
                  <span>Upload file, screenshot, PPT, or PDF</span>
                  <input
                    type="file"
                    multiple
                    onChange={(event) => {
                      setStagedFiles(Array.from(event.currentTarget.files ?? []));
                    }}
                  />
                  {stagedFiles.length > 0 ? (
                    <small>{stagedFiles.map((file) => file.name).join(', ')}</small>
                  ) : (
                    <small>No files selected yet.</small>
                  )}
                </label>
              ) : null}
              <label className="onboarding-view__inline-field">
                <span>
                  {materialKind === 'prompt' ? 'Write one sentence' : 'Anything else to include?'}
                </span>
                <textarea
                  className="onboarding-view__textarea"
                  value={need}
                  onChange={(event) => setNeed(event.target.value)}
                  placeholder="Example: Create a modern dashboard for a small sales team."
                />
              </label>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="onboarding-view__panel">
              <OnboardingPanelHeader
                title="Confirm the starter brief"
                body="This is the saved brief. CLI or BYOK can fail later without losing it; you can switch back to AMR and continue."
              />
              <div className="onboarding-view__brief-grid">
                <div>
                  <span>Target artifact</span>
                  <strong>{selectedGoal.artifact}</strong>
                </div>
                <div>
                  <span>Starter scope</span>
                  <strong>{selectedGoal.starterScope}</strong>
                </div>
                <div>
                  <span>Brand / style</span>
                  <strong>{selectedGoal.styleHint}</strong>
                </div>
                <div>
                  <span>Content source</span>
                  <strong>{sourceSummary}</strong>
                </div>
                <div>
                  <span>Delivery format</span>
                  <strong>{selectedGoal.delivery}</strong>
                </div>
                <div>
                  <span>Design system / memory</span>
                  <strong>
                    {selectedGoal.id === 'design-system'
                      ? 'Create a reusable foundation'
                      : 'Use if available; do not block'}
                  </strong>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="onboarding-view__panel">
              <OnboardingPanelHeader
                title={t('settings.onboardingConnectTitle')}
                body="Connect AMR before generation so Open Design can claim or check starter credit for this brief. Local CLI and BYOK stay available as advanced options."
              />
              <div className="onboarding-view__runtime-stack">
                {showAmrCloudOption ? (
                  <div className="onboarding-view__amr-cloud-card">
                    <OnboardingChoiceCard
                      icon="orbit"
                      agentIconId="amr"
                      title={amrSignedIn ? 'AMR is connected' : 'Log in to AMR'}
                      body="No Open Design account needed. AMR login unlocks the built-in model and lets us check starter credit before the first run."
                      benefits={[
                        'No Open Design signup',
                        'No API key setup',
                        'Built-in model',
                        'Starter credit check',
                        'Recharge or switch if needed',
                      ]}
                      benefitPlacement="aside"
                      metaLabel={amrSignedIn ? 'Signed in' : 'Sign in required'}
                      modelSlot={
                        amrModels.length > 0 ? (
                          <OnboardingAmrModelSelect
                            models={amrModels}
                            modelsSource={amrModelsSource}
                            selectedModel={amrSelectedModel}
                            onSelectModel={(model) => onAgentModelChange('amr', { model })}
                          />
                        ) : null
                      }
                      variant="amr"
                      featured
                      selected={runtime === 'amr'}
                      onClick={() => {
                        recordAmrEntry(analytics.track, 'onboarding_amr_card');
                        setRuntime('amr');
                        onModeChange('daemon');
                        onAgentChange('amr');
                      }}
                    />
                  </div>
                ) : amrDetecting ? (
                  <OnboardingAmrCloudSkeleton />
                ) : (
                  <div className="onboarding-view__setup-panel">
                    <div className="onboarding-view__setup-head">
                      <div>
                        <strong>Starter AMR is not detected yet</strong>
                        <p>Use a local CLI or BYOK below, or rescan agents and return to starter AMR.</p>
                      </div>
                      <button
                        type="button"
                        className="onboarding-view__mini-button"
                        onClick={() => void onRefreshAgents()}
                      >
                        {t('settings.rescan')}
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="onboarding-view__advanced-toggle"
                  onClick={() => setAdvancedOpen((current) => !current)}
                >
                  <span>Local CLI / BYOK backup options</span>
                  <Icon name={advancedOpen ? 'chevron-down' : 'chevron-right'} size={16} />
                </button>
                {advancedOpen ? (
                  <>
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
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="onboarding-view__panel">
              <OnboardingPanelHeader
                title="Start generating"
                body="Your brief is saved. Open Design will create a first version in the starter scope, then you can edit, export, regenerate, or save it as a template."
              />
              <div className="onboarding-view__brief-grid">
                <div>
                  <span>Target artifact</span>
                  <strong>{selectedGoal.artifact}</strong>
                </div>
                <div>
                  <span>Starter scope</span>
                  <strong>{selectedGoal.starterScope}</strong>
                </div>
                <div>
                  <span>Content source</span>
                  <strong>{sourceSummary}</strong>
                </div>
                <div>
                  <span>Generation path</span>
                  <strong>
                    {runtime === 'amr'
                      ? 'AMR built-in model'
                      : runtime === 'local'
                        ? selectedAgent?.name ?? 'Local CLI'
                        : runtime === 'byok'
                          ? 'BYOK model provider'
                          : 'Not selected yet'}
                  </strong>
                </div>
                <div>
                  <span>AMR credit</span>
                  <strong>
                    {runtime === 'amr'
                      ? amrSignedIn
                        ? 'Ready to check on run start'
                        : 'Login required before run'
                      : runtime === null
                        ? 'Choose AMR, Local CLI, or BYOK first'
                        : 'Not used for this run'}
                  </strong>
                </div>
                <div>
                  <span>Fallback</span>
                  <strong>Brief stays saved if balance or setup blocks generation</strong>
                </div>
              </div>
              {runtime === 'amr' ? (
                <div className="onboarding-view__setup-panel">
                  <div className="onboarding-view__setup-head">
                    <div>
                      <strong>
                        {amrSignedIn ? 'AMR is ready for this brief' : 'AMR login is still needed'}
                      </strong>
                      <p>
                        {amrSignedIn
                          ? 'If this task needs more than the starter credit, Open Design will keep the brief and let you recharge or switch to CLI/BYOK.'
                          : 'Go back one step to log in to AMR, then return here to start generating.'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="onboarding-view__actions">
            {amrLoginError ? (
              <span className="onboarding-view__action-status is-error" role="alert">
                {amrLoginError}
              </span>
            ) : null}
            {generateError ? (
              <span className="onboarding-view__action-status is-error" role="alert">
                {generateError}
              </span>
            ) : null}
            <button
              type="button"
              className="onboarding-view__secondary"
              onClick={handleBackWithTracking}
              disabled={onboardingNavigationLocked}
            >
              {step === 0 ? t('settings.onboardingSkip') : t('settings.onboardingBack')}
            </button>
            {isLastStep && amrLoginPending ? (
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
              className="onboarding-view__primary"
              onClick={handlePrimaryAction}
              disabled={primaryDisabled}
              aria-busy={generating || amrLoginPending ? true : undefined}
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

function OnboardingAmrModelSelect({
  models,
  modelsSource,
  selectedModel,
  onSelectModel,
}: {
  models: NonNullable<AgentInfo['models']>;
  modelsSource: AgentInfo['modelsSource'];
  selectedModel: string;
  onSelectModel: (model: string) => void;
}) {
  const t = useT();
  const modelSource = modelsSource ?? 'fallback';
  const displayModels = models.map((model) => ({
    value: model.id,
    label: formatOnboardingAmrModelLabel(model),
  }));
  const modelSourceLabel = t('settings.onboardingAmrModelSourceLabel');
  return (
    <div
      className="onboarding-view__model-picker"
      onClick={(event) => event.stopPropagation()}
    >
      <OnboardingDropdown
        label={`${t('settings.modelPicker')} · ${modelSourceLabel}`}
        placeholder={t('settings.modelSourceFallback')}
        value={selectedModel}
        options={displayModels}
        onChange={onSelectModel}
        searchable
        searchPlaceholder={t('newproj.modelSearch')}
        sourceTone={modelSource}
      />
    </div>
  );
}

function formatOnboardingAmrModelLabel(
  model: NonNullable<AgentInfo['models']>[number],
): string {
  const label = model.label?.trim();
  if (label && label !== model.id && !/^[a-z0-9._-]+$/.test(label)) {
    return label;
  }
  return model.id
    .split('-')
    .filter(Boolean)
    .map(formatModelToken)
    .join(' ');
}

function formatModelToken(token: string): string {
  const lower = token.toLowerCase();
  const known: Record<string, string> = {
    claude: 'Claude',
    opus: 'Opus',
    sonnet: 'Sonnet',
    haiku: 'Haiku',
    deepseek: 'DeepSeek',
    gemini: 'Gemini',
    glm: 'GLM',
    gpt: 'GPT',
    oss: 'OSS',
    kimi: 'Kimi',
    minimax: 'MiniMax',
    mimo: 'MiMo',
    qwen3: 'Qwen3',
    seed: 'Seed',
  };
  if (known[lower]) return known[lower];
  if (/^v\d/i.test(token)) return token.toUpperCase();
  if (/^\d+b$/i.test(token) || /^a\d+b$/i.test(token)) return token.toUpperCase();
  if (/^\d+(\.\d+)*$/.test(token)) return token;
  return token.charAt(0).toUpperCase() + token.slice(1);
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
function OnboardingAmrCloudSkeleton() {
  const t = useT();
  return (
    <div className="onboarding-view__amr-cloud-card">
      <div
        className="onboarding-view__card onboarding-view__card--featured onboarding-view__card--amr onboarding-view__card--benefit-aside onboarding-view__card--skeleton"
        role="status"
        aria-busy="true"
        aria-label={t('common.loading')}
      >
        <span className="onboarding-view__identity">
          <span className="onboarding-view__icon onboarding-view__icon--asset">
            <AgentIcon id="amr" size={52} className="onboarding-view__agent-logo" />
          </span>
          <span className="onboarding-view__card-copy">
            <span className="onboarding-view__card-top">
              <strong>{t('settings.amrCloud')}</strong>
            </span>
            <span className="onboarding-view__skeleton-line onboarding-view__skeleton-line--meta" />
          </span>
        </span>
        <span className="onboarding-view__benefit-aside" aria-hidden="true">
          <span className="onboarding-view__benefit-stack onboarding-view__benefit-stack--skeleton">
            <span className="onboarding-view__skeleton-line onboarding-view__skeleton-line--benefit" />
            <span className="onboarding-view__skeleton-line onboarding-view__skeleton-line--benefit" />
            <span className="onboarding-view__skeleton-line onboarding-view__skeleton-line--benefit" />
            <span className="onboarding-view__skeleton-line onboarding-view__skeleton-line--benefit" />
          </span>
        </span>
        <span className="onboarding-view__card-model" aria-hidden="true">
          <span className="onboarding-view__skeleton-model">
            <span className="onboarding-view__skeleton-model-label" />
            <span className="onboarding-view__skeleton-model-bar" />
          </span>
        </span>
      </div>
    </div>
  );
}

function OnboardingChoiceCard({
  icon,
  agentIconId,
  title,
  body,
  benefits,
  upcomingLabel,
  upcomingBenefits,
  benefitPlacement = 'copy',
  metaLabel,
  modelSlot,
  actionLabel,
  selected,
  badge,
  statusSlot,
  featured,
  variant,
  onClick,
}: {
  icon: IconName;
  agentIconId?: string;
  title: string;
  body: string;
  benefits?: string[];
  upcomingLabel?: string;
  upcomingBenefits?: string[];
  benefitPlacement?: 'copy' | 'aside';
  metaLabel?: string;
  modelSlot?: ReactNode;
  actionLabel?: string;
  selected: boolean;
  badge?: string;
  statusSlot?: ReactNode;
  featured?: boolean;
  variant?: 'amr';
  onClick: () => void;
}) {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onClick();
  }

  const hasBenefits =
    (benefits && benefits.length > 0) ||
    (upcomingBenefits && upcomingBenefits.length > 0);
  const benefitStack = hasBenefits ? (
    <span className="onboarding-view__benefit-stack">
      {benefits && benefits.length > 0 ? (
        <span className="onboarding-view__benefits">
          {benefits.map((item, index) => (
            <span
              key={item}
              className={`onboarding-view__benefit${
                index >= 2 ? ' onboarding-view__benefit--hero' : ''
              }`}
            >
              {item}
            </span>
          ))}
        </span>
      ) : null}
      {upcomingBenefits && upcomingBenefits.length > 0 ? (
        <span className="onboarding-view__upcoming-benefits">
          {upcomingLabel ? (
            <span className="onboarding-view__upcoming-label">{upcomingLabel}</span>
          ) : null}
          {upcomingBenefits.map((item) => (
            <span key={item} className="onboarding-view__benefit onboarding-view__benefit--upcoming">
              {item}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  ) : null;
  const modelUnderLogo = variant === 'amr' && modelSlot;
  const iconNode = (
    <span
      className={
        'onboarding-view__icon' +
        (agentIconId ? ' onboarding-view__icon--asset' : '')
      }
    >
      {agentIconId ? (
        <AgentIcon
          id={agentIconId}
          size={featured ? 52 : 40}
          className="onboarding-view__agent-logo"
        />
      ) : (
        <Icon name={icon} size={18} />
      )}
    </span>
  );
  const copyNode = (
    <span className="onboarding-view__card-copy">
      <span className="onboarding-view__card-top">
        <strong>{title}</strong>
        {badge ? <span className="onboarding-view__badge">{badge}</span> : null}
      </span>
      {metaLabel ? <span className="onboarding-view__card-meta">{metaLabel}</span> : null}
      {modelUnderLogo ? null : modelSlot}
      {benefitPlacement === 'copy' && benefitStack ? (
        benefitStack
      ) : !modelSlot ? (
        <small>{body}</small>
      ) : null}
    </span>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={`onboarding-view__card${selected ? ' is-selected' : ''}${
        featured ? ' onboarding-view__card--featured' : ''
      }${variant ? ` onboarding-view__card--${variant}` : ''}${
        benefitPlacement === 'aside' ? ' onboarding-view__card--benefit-aside' : ''
      }`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-pressed={selected}
    >
      {variant === 'amr' ? (
        <span className="onboarding-view__identity">
          {iconNode}
          {copyNode}
        </span>
      ) : (
        <>
          {iconNode}
          {copyNode}
        </>
      )}
      {modelUnderLogo ? (
        <span className="onboarding-view__card-model">
          {modelSlot}
        </span>
      ) : null}
      {benefitPlacement === 'aside' && benefitStack ? (
        <span className="onboarding-view__benefit-aside">{benefitStack}</span>
      ) : null}
      {statusSlot ? (
        <span className="onboarding-view__card-status">
          {statusSlot}
        </span>
      ) : null}
      {actionLabel ? <span className="onboarding-view__card-action">{actionLabel}</span> : null}
      {selected ? (
        <span className="onboarding-view__check">
          <Icon name="check" size={14} />
        </span>
      ) : null}
    </div>
  );
}
