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
  PROFILE_MEMORY_ID,
  type AmrWalletSnapshot,
  type ChatSessionMode,
  type ConnectorDetail,
  type InstalledPluginRecord,
  type RunContextSelection,
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
import { setOnboardingAttributionPersonProperties } from '../analytics/source-attribution';
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
import { useT, useI18n } from '../i18n';
import { navigate, useRoute } from '../router';
import { setPendingDesignSystemCreateEntry } from '../analytics/ds-create-entry';
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
import { DesignSystemsTab } from './DesignSystemsTab';
import { BrandsTab } from './BrandsTab';
import { EntryNavRail, type EntryView as EntryViewKind } from './EntryNavRail';
import { LibrarySection } from './LibrarySection';
import { UpdaterPopup } from './UpdaterPopup';
import { WhatsNewPopup } from './WhatsNewPopup';
import { AmrBalanceDialog } from './AmrBalanceDialog';
import { AmrLowBalanceDialog, type AmrLowBalanceDecision } from './AmrLowBalanceDialog';
import { checkAmrBalanceGate } from '../runtime/amr-balance-gate';
import { isPaidAmrPlan, resolveAmrPlan } from '../runtime/amr-low-balance-plan';
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
import {
  buildRecommendation,
  type Recommendation,
} from '../onboarding/recommendation';
import type { OnboardingEntry } from '../onboarding/onboarding-entry';
import { ONBOARDING_ARTIFACT_CHIP_IDS } from './home-hero/chips';
import { homeHeroChipLabel } from './home-hero/chip-labels';
import type { PluginUseAction } from './plugins-home/useActions';
import { Icon } from './Icon';
import { defaultAgentModelId, effectiveAgentModelChoice } from './agentModelSelection';
import { AgentIcon } from './AgentIcon';
import {
  getModelCapabilityTag,
  getModelCostTier,
  MODEL_CAPABILITY_TAG_LABEL_KEYS,
  MODEL_COST_TIER_LABEL_KEYS,
  type ModelCapabilityTag,
} from './modelCapabilityTags';
import { LanguageMenu } from './LanguageMenu';
import { IntegrationsView, type IntegrationTab } from './IntegrationsView';
import { InlineModelSwitcher } from './InlineModelSwitcher';
import { enterpriseUrl } from './enterpriseUrl';
import {
  EntrySettingsMenu,
  type EntrySettingsSection,
} from './EntrySettingsMenu';
import { NewProjectModal } from './NewProjectModal';
import { PluginsView } from './PluginsView';
import type { CreateInput, CreateTab, ImportClaudeDesignOutcome } from './NewProjectPanel';
import type { PluginLoopSubmit } from './PluginLoopHome';
import {
  createProject,
  type PluginShareAction,
  type PluginShareProjectOutcome,
} from '../state/projects';
import { TasksView } from './TasksView';
import {
  API_KEY_PLACEHOLDERS,
  API_PROTOCOL_TABS,
  SUGGESTED_MODELS_BY_PROTOCOL,
} from '../state/apiProtocols';
import {
  defaultKnownProviderModel,
  KNOWN_PROVIDERS,
} from '../state/config';
import type { KnownProvider } from '../state/config';
import { saveOnboardingProfile } from '../state/onboarding-profile';
import { testAgent, testApiProvider } from '../providers/connection-test';
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
import { smoothScrollToTop } from '../utils/smoothScrollToTop';
import { summarizeProjectNameFromPrompt } from '../utils/projectName';
import { LIBRARY_UI_VISIBLE } from '../features/libraryUi';
import {
  providerModelsCacheKey,
  type ProviderModelsCache,
} from './providerModelsCache';
import { resolveByokModelPreference } from './byok/validation';

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
const X_URL = 'https://x.com/OpenDesignHQ';
const ONBOARDING_DROPDOWN_OPEN_EVENT = 'open-design:onboarding-dropdown-open';

type OnboardingAgentTestState =
  | { status: 'idle' }
  | { status: 'running'; inputKey: string }
  | { status: 'done'; inputKey: string; result: ConnectionTestResponse };

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

const ONBOARDING_AMR_MODEL_OPTIONS: NonNullable<AgentInfo['models']> = [
  { id: 'claude-opus-4.8', label: 'Claude Opus 4.8' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'glm-5.1', label: 'GLM 5.1' },
];

type OnboardingProfileState = {
  role: string;
  orgSize: string;
  useCase: string[];
  source: string;
  // Free-text detail when `source === 'other'`. Kept separate from `source`
  // so attribution can still aggregate on the 'other' bucket while capturing
  // the raw self-reported channel.
  sourceOther: string;
  email: string;
};

type EntryCreateProjectInput = Omit<CreateInput, 'metadata'> & {
  metadata?: CreateInput['metadata'];
  pendingPrompt?: string;
  pluginId?: string;
  pluginType?: string;
  appliedPluginSnapshotId?: string;
  pluginInputs?: Record<string, unknown>;
  initialRunContext?: RunContextSelection | null;
  conversationMode?: ChatSessionMode;
  autoSendFirstMessage?: boolean;
  /** The home submit already ran the Open Design Cloud balance gate; the
   *  project's first auto-send must not re-gate. */
  amrGatePrechecked?: boolean;
  requestId?: string;
  pendingFiles?: File[];
  userWorkingDirToken?: string;
  linkedDirs?: string[] | null;
  onboardingEntry?: OnboardingEntry;
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
  /** True only when GET /api/app-config returned a real config object. */
  daemonAppConfigReady?: boolean;
  /** Non-optimistic daemon write for the silent-update preference. */
  onSilentUpdatePreferenceChange?: (allowSilentUpdates: boolean) => Promise<void>;
  onSkillsRefresh?: () => Promise<void> | void;
  onSkillsChanged?: (affectedSkillId?: string) => void;
  onRefreshAgents: () => Promise<AgentInfo[]> | AgentInfo[];
  // Quick theme switch from the avatar-popover dropdown. Lets the user
  // flip between system / light / dark without opening the full Settings
  // dialog. App owns persistence; this component just calls the callback.
  onThemeChange: (theme: AppTheme) => void;
  onCreateProject: (input: EntryCreateProjectInput) => Promise<boolean> | boolean | void;
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
  onOpenProject: (id: string, fileName?: string) => Promise<boolean> | boolean | void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => Promise<boolean | void> | boolean | void;
  onDuplicateProject?: (id: string) => Promise<void> | void;
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
  artifactUpgradeSlot?: ReactNode;
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
  daemonAppConfigReady = false,
  onSilentUpdatePreferenceChange,
  onSkillsRefresh,
  onSkillsChanged,
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
  onDuplicateProject,
  onRenameProject,
  onProjectsRefresh,
  onChangeDefaultDesignSystem,
  onCreateDesignSystem,
  onOpenDesignSystem,
  onDesignSystemsRefresh,
  onPersistComposioKey,
  onOpenSettings,
  onCompleteOnboarding,
  artifactUpgradeSlot,
}: Props) {
  const t = useT();
  const { locale: uiLocale } = useI18n();
  const discordPresence = useDiscordPresence();
  // Each entry sub-view (home / projects / design-systems) is its own
  // URL now, so the browser back/forward buttons work and a deep link
  // to /design-systems lands on that section. We derive the active
  // view from the route rather than keeping it in component state.
  const route = useRoute();
  const view: EntryViewKind = route.kind === 'home' ? route.view : 'home';
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  // Hard block from the pre-run balance gate on a home submit (empty wallet
  // or signed out); non-null renders the AmrBalanceDialog on the home page —
  // the project is never created, so the composer draft stays put. The dialog
  // resolves the promise the submit handler is awaiting: 'retry' (sign-in
  // completed / recharge landed) re-runs the gate and continues the very same
  // create-and-run; 'dismiss' hands the composer back to the user.
  const [amrBalanceGateBlock, setAmrBalanceGateBlock] = useState<
    {
      reason: 'insufficient' | 'signed_out';
      snapshot: AmrWalletSnapshot;
      resolve: (decision: 'retry' | 'dismiss') => void;
    } | null
  >(null);
  // Soft low-balance warning holding a pending home submit: the dialog
  // resolves the promise the submit handler is awaiting ('proceed' continues
  // the very same create-and-run).
  const [amrLowBalanceWarn, setAmrLowBalanceWarn] = useState<
    {
      snapshot: AmrWalletSnapshot;
      resolve: (decision: AmrLowBalanceDecision) => void;
    } | null
  >(null);
  useEffect(() => {
    if (view !== 'design-systems') return;
    void onDesignSystemsRefresh?.();
  }, [onDesignSystemsRefresh, view]);
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
  // Personalized first-run starting point. Computed once, in memory, when the
  // user finishes the About-you survey with real answers (see
  // `finishOnboarding`); null for returning users, skipped/blank surveys, and
  // after any page refresh (deliberately not persisted, per onboarding spec
  // §7.1). Cleared as soon as the user takes any concrete entry (spec §7.4).
  const [onboardingRec, setOnboardingRec] = useState<Recommendation | null>(null);
  const entryMainScrollRef = useRef<HTMLElement | null>(null);
  // Entry views share this element, so route changes must not inherit the previous view's offset.
  useLayoutEffect(() => {
    const scrollContainer = entryMainScrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollTop = 0;
  }, [view]);
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

  function startBlankProjectFromRail() {
    void Promise.resolve(
      onCreateProject({
        name: t('common.untitled'),
        skillId: null,
        designSystemId: null,
      }),
    ).catch((err) => {
      console.warn('Failed to create blank project from entry rail', err);
    });
  }

  function handleCreate(input: CreateInput) {
    // The NewProjectModal no longer asks the user to pick a plugin.
    // Each project kind is silently bound to its default scenario
    // pipeline at creation time so the user lands in a running flow
    // without having to reason about pipeline internals. The mapping
    // is intentionally explicit so future kind-specific scenarios
    // (e.g. a deck- or image-specialized pipeline) can take over a
    // single row without touching the form.
    // New-project modal / template / import is a concrete entry — retire any
    // pending Home recommendation (spec §7.1 / §7.4).
    dismissRecommendation();
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
  async function handlePluginLoopSubmit(payload: PluginLoopSubmit) {
    // Open Design Cloud pre-run balance gate: hard blocks (empty wallet or
    // signed out) and the soft low-balance reminder both fire BEFORE the
    // project is created, so the dialog appears right here on the home page
    // and the composer keeps its draft. In-project sends are gated separately
    // in ProjectView.handleSend.
    let amrGatePrechecked = false;
    if (config.mode === 'daemon' && config.agentId === 'amr') {
      let gate = await checkAmrBalanceGate();
      // Hard blocks hold THIS submit open: the dialog resolves 'retry' when
      // its blocking condition clears (sign-in completed, recharge landed)
      // and the gate re-runs, so the task auto-continues through the normal
      // accept path. Still hard after the re-check (e.g. signed in but the
      // wallet is empty) → the dialog re-shows with the fresh snapshot.
      while (gate.kind === 'hard') {
        const blocked = gate;
        const decision = await new Promise<'retry' | 'dismiss'>((resolve) => {
          setAmrBalanceGateBlock({
            reason: blocked.reason,
            snapshot: blocked.snapshot,
            resolve,
          });
        });
        setAmrBalanceGateBlock(null);
        if (decision === 'dismiss') return 'blocked' as const;
        gate = await checkAmrBalanceGate();
      }
      if (gate.kind === 'soft') {
        // Hold THIS submit while the reminder waits for a decision; 'proceed'
        // resumes the same create-and-run below, so HomeView's normal accept
        // path (draft clearing, context consumption) still applies.
        const plan = await resolveAmrPlan(gate.snapshot);
        if (isPaidAmrPlan(plan)) {
          const decision = await new Promise<AmrLowBalanceDecision>((resolve) => {
            setAmrLowBalanceWarn({ snapshot: gate.snapshot, resolve });
          });
          setAmrLowBalanceWarn(null);
          if (decision !== 'proceed') return 'blocked' as const;
        }
      }
      // The decision (or clean pass) carries into the created project's first
      // auto-send, which must not re-prompt what the user just answered.
      amrGatePrechecked = true;
    }
    // Starting from the Home composer is a concrete entry — retire the
    // recommendation (spec §7.4). Done only once the submit actually proceeds
    // to create (past any AMR balance gate) so a blocked/cancelled submit
    // leaves the recommendation intact for the user.
    dismissRecommendation();
    const summarizedName = summarizeProjectNameFromPrompt(payload.prompt);
    const head = payload.prompt.trim().split(/\s+/).slice(0, 8).join(' ');
    const firstAttachmentName = payload.attachments?.[0]?.name ?? '';
    const fallbackName =
      summarizedName || (head.length > 0 ? head : firstAttachmentName || 'Untitled');
    const name =
      payload.pluginTitle && payload.pluginTitle.trim().length > 0
        ? payload.pluginTitle.trim()
        : fallbackName;
    const linkedDirs = Array.from(
      new Set(
        [
          ...(payload.workingDir ? [payload.workingDir] : []),
          ...(payload.linkedDirs ?? []),
        ].map((dir) => dir.trim()).filter(Boolean),
      ),
    );
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
      ...(linkedDirs.length > 0 ? { linkedDirs } : {}),
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
      ...(payload.initialRunContext ? { initialRunContext: payload.initialRunContext } : {}),
      ...(payload.conversationMode ? { conversationMode: payload.conversationMode } : {}),
      ...(payload.attachments && payload.attachments.length > 0
        ? { pendingFiles: payload.attachments }
        : {}),
      // No `userWorkingDirToken`: linkedDirs grant read-only `--add-dir`
      // access and are validated by the daemon at create time, so they do
      // not need the desktop main-process trust token that baseDir imports
      // require for write access.
      autoSendFirstMessage: true,
      amrGatePrechecked,
    });
  }

  // Called when the welcome flow ends. `survey` is present on the About-you
  // completion paths; we only build a recommendation when the user actually
  // provided a role or use-case, so a skipped/blank survey lands on the
  // generic Home entry (spec §6.2 / §7.1).
  function finishOnboarding(survey?: { role: string; useCases: string[] }) {
    if (survey && (survey.role.trim() || survey.useCases.length > 0)) {
      setOnboardingRec(buildRecommendation(survey));
    }
    onCompleteOnboarding();
    changeView('home');
  }

  // Drop the personalized recommendation. Fired when the user browses all
  // types, or as soon as they take any other concrete entry, so Home never
  // re-shows a recommendation the user has moved past (spec §7.4).
  function dismissRecommendation() {
    setOnboardingRec((current) => (current ? null : current));
  }

  // "进入 Studio" from the Home recommendation. Creates the project with the
  // recommended first request pre-filled into the composer but NOT auto-sent —
  // the user keeps control and can edit or clear it (spec §7.4 / §8.2).
  async function handleRecommendationStart(input: {
    name: string;
    prompt: string;
    metadata: ProjectMetadata;
    onboardingEntry: OnboardingEntry;
  }): Promise<boolean> {
    const pluginId = defaultPluginIdForMetadata(input.metadata);
    // Create FIRST, then tear down the recommendation only once it actually
    // opened. Dismissing up-front turned a transient create/navigation failure
    // into an onboarding dead-end: the user dropped back to generic Home with
    // no way to retry the starter they just picked. On failure we keep the
    // recommendation mounted. The onboarding entry rides along so the create
    // success path stashes it keyed by the created project id — nothing is
    // written on failure.
    //
    // Do NOT swallow the failure here: `onCreateProject` throws on real create
    // failures, and a silent `catch` would leave the CTA looking clickable with
    // no feedback. Let the error propagate so Home surfaces it in the same
    // error channel the other entry actions use (HomeView owns `setError`), and
    // return `false` for a clean no-project result so the caller can retry.
    const ok =
      (await onCreateProject({
        name: input.name,
        skillId: null,
        designSystemId: null,
        metadata: input.metadata,
        pendingPrompt: input.prompt,
        ...(pluginId ? { pluginId } : {}),
        autoSendFirstMessage: false,
        onboardingEntry: input.onboardingEntry,
      })) !== false;
    if (ok) dismissRecommendation();
    return ok;
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
            onGoBuild={() => {
              onCompleteOnboarding();
              setPendingDesignSystemCreateEntry('onboarding');
              navigate({ kind: 'design-system-create' });
            }}
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
  const homeExecutionSwitcher = (
    <InlineModelSwitcher
      compact
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
          onNewProject={() => {
            trackHomeNavClick(analytics.track, {
              page_name: 'home',
              area: 'nav',
              element: 'new_project_plus',
            });
            openNewProject();
          }}
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
                className="entry-workspace-chip od-tooltip"
                href={enterpriseUrl(uiLocale)}
                target="_blank"
                rel="noreferrer noopener"
                onClick={() => {
                  trackHomeToolbarClick(analytics.track, {
                    page_name: 'home',
                    area: 'toolbar',
                    element: 'workspace_teams',
                  });
                }}
                data-tooltip={t('entry.workspaceTeamsTitle')}
                data-tooltip-placement="bottom"
                aria-label={t('entry.workspaceTeamsAria')}
                data-testid="entry-workspace-teams"
              >
                <Icon
                  name="sparkles"
                  size={14}
                  className="entry-workspace-chip__icon"
                />
                <span className="entry-workspace-chip__label">
                  {t('entry.workspaceTeamsLabel')}
                </span>
              </a>
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
              {view === 'home' ? null : executionSwitcher}
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
            <UpdaterPopup
              allowSilentUpdates={config.allowSilentUpdates}
              silentUpdatePreferenceReady={daemonAppConfigReady}
              onAllowSilentUpdatesChange={
                onSilentUpdatePreferenceChange
                  ?? ((allowSilentUpdates) => onConfigPersist({ ...config, allowSilentUpdates }))
              }
            />
            <WhatsNewPopup active={view === 'home'} />
            {avatarMenu}
            {amrBalanceGateBlock ? (
              <AmrBalanceDialog
                reason={amrBalanceGateBlock.reason}
                balanceUsd={amrBalanceGateBlock.snapshot.balanceUsd}
                profile={amrBalanceGateBlock.snapshot.profile}
                entrySource="home_balance_gate_upgrade"
                metricsConsent={config.telemetry?.metrics === true}
                installationId={config.installationId}
                onClose={() => amrBalanceGateBlock.resolve('dismiss')}
                onResolved={() => amrBalanceGateBlock.resolve('retry')}
              />
            ) : null}
            {amrLowBalanceWarn ? (
              <AmrLowBalanceDialog
                balanceUsd={amrLowBalanceWarn.snapshot.balanceUsd}
                profile={amrLowBalanceWarn.snapshot.profile}
                entrySource="home_low_balance_warn_recharge"
                metricsConsent={config.telemetry?.metrics === true}
                installationId={config.installationId}
                onDecision={amrLowBalanceWarn.resolve}
              />
            ) : null}
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
                onDeleteProject={onDeleteProject}
                onDuplicateProject={onDuplicateProject}
                onRenameProject={onRenameProject}
                onBrowseRegistry={() => changeView('plugins')}
                onOpenIntegrations={() => openIntegrationTab('connectors')}
                onOpenMcp={() => openIntegrationTab('mcp')}
                onOpenNewProject={(tab) => {
                  openNewProject(tab);
                }}
                onStartBlankProject={startBlankProjectFromRail}
                promptHandoff={homePromptHandoff}
                skills={skills}
                skillsLoading={skillsLoading}
                connectors={connectors}
                promptTemplates={promptTemplates}
                recommendation={onboardingRec}
                onRecommendationStart={handleRecommendationStart}
                onRecommendationDismiss={dismissRecommendation}
                executionSwitcher={view === 'home' ? homeExecutionSwitcher : undefined}
                artifactUpgradeSlot={artifactUpgradeSlot}
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
                    onDuplicate={onDuplicateProject}
                    onRename={onRenameProject}
                    onRefresh={onProjectsRefresh}
                    isActive={view === 'projects'}
                    onNewProject={() => {
                      openNewProject();
                    }}
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
                <div className="entry-section">
                  <header className="entry-section__head">
                    <h1 className="entry-section__title">{t('entry.navDesignSystems')}</h1>
                  </header>
                  <DesignSystemsTab
                    loading
                    systems={[]}
                    templates={templates}
                    selectedId={defaultDesignSystemId}
                    onSelect={onChangeDefaultDesignSystem}
                    onCreate={onCreateDesignSystem}
                    onOpenSystem={onOpenDesignSystem}
                    onSystemsRefresh={onDesignSystemsRefresh}
                  />
                </div>
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
                  />
                </div>
              )}
            </div>
            {LIBRARY_UI_VISIBLE ? (
              <div data-testid="entry-view-library" data-active={view === 'library' ? 'true' : 'false'} {...inactiveViewProps(view === 'library')}>
                <LibrarySection
                  active={view === 'library'}
                  onOpenProject={(projectId, fileName) =>
                    navigate({ kind: 'project', projectId, conversationId: null, fileName: fileName ?? null })
                  }
                />
              </div>
            ) : null}
            <div data-testid="entry-view-brands" data-active={view === 'brands' ? 'true' : 'false'} {...inactiveViewProps(view === 'brands')}>
              <BrandsTab
                onApplyDesignSystem={onChangeDefaultDesignSystem}
                onOpenProject={onOpenProject}
                onDesignSystemsRefresh={onDesignSystemsRefresh}
              />
            </div>
            {view === 'integrations' ? (
              <IntegrationsView
                config={config}
                initialTab={integrationTab}
                composioConfigLoading={composioConfigLoading}
                onConfigPersist={onConfigPersist}
                onPersistComposioKey={onPersistComposioKey}
                onSkillsRefresh={onSkillsRefresh}
                onSkillsChanged={onSkillsChanged}
              />
            ) : null}
          </div>
        </main>
      </div>
      <NewProjectModal
        open={newProjectOpen}
        initialTab={newProjectInitialTab}
        skills={skills}
        designTemplates={designTemplates}
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
  onGoBuild,
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
  // `survey` is passed on the About-you completion paths (not on skip) so the
  // shell can build a personalized Home recommendation.
  onFinish: (survey?: { role: string; useCases: string[] }) => void;
  onThemeChange: (theme: AppTheme) => void;
  onGoBuild: () => void;
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
  // Initial login status fetch has settled, whether signed in or not. The
  // cloud landing uses this to avoid flashing "Sign in" before flipping to
  // "Continue" for already-authenticated users.
  const [amrStatusResolved, setAmrStatusResolved] = useState(false);
  const [amrLoginPending, setAmrLoginPending] = useState(false);
  const [amrLoginCancelPending, setAmrLoginCancelPending] = useState(false);
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);
  const [amrLoginError, setAmrLoginError] = useState<string | null>(null);
  const [visibleAgentIds, setVisibleAgentIds] = useState<string[]>([]);
  const [providerTestState, setProviderTestState] = useState<
    | { status: 'idle' }
    | { status: 'running'; inputKey: string }
    | { status: 'done'; inputKey: string; result: ConnectionTestResponse }
  >({ status: 'idle' });
  const [agentTestState, setAgentTestState] = useState<OnboardingAgentTestState>({
    status: 'idle',
  });
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
    sourceOther: '',
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
  // Update the About-you profile through this helper (not `setProfile`
  // directly) whenever the value feeds an imperative read. It mirrors the new
  // value into `profileRef.current` synchronously, so paths that read the live
  // ref before React's state→ref sync effect runs — `emitAboutYouSubmit`, the
  // Memory note, the newsletter submit — never see a stale field even when the
  // user changes an answer and immediately continues.
  const updateProfile = useCallback(
    (producer: (current: OnboardingProfileState) => OnboardingProfileState) => {
      const next = producer(profileRef.current);
      profileRef.current = next;
      setProfile(next);
    },
    [],
  );
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
  const normalizedSelectedAgentChoice = effectiveAgentModelChoice(selectedAgent, selectedAgentChoice) ?? selectedAgentChoice;
  const selectedAgentTestModel = normalizedSelectedAgentChoice.model ?? defaultAgentModelId(selectedAgent) ?? '';
  const selectedAgentTestReasoning = selectedAgentChoice.reasoning ?? '';
  const agentTestInputKey = [
    selectedAgent?.id ?? '',
    selectedAgentTestModel,
    selectedAgentTestReasoning,
    JSON.stringify(config.agentCliEnv ?? {}),
  ].join('\n');
  const visibleAgentTestState =
    agentTestState.status === 'running' ||
    (agentTestState.status !== 'idle' && agentTestState.inputKey === agentTestInputKey)
      ? agentTestState
      : { status: 'idle' as const };
  const canTestAgent = Boolean(selectedAgent) && daemonLive;
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
    // Fetch login status on mount in parallel with agent discovery so the
    // landing CTA settles quickly for already-authenticated users.
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
  // during first-run setup. Skip / Back / last-step Continue clear
  // inline in their respective handlers below; abandoned sessions clear
  // on sessionStorage tab close.
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
  // completion event when the user fires both Skip and unmount in the
  // same tick (the unmount path also clears the session id; see the
  // PR #2453 follow-up).
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
    return { area: 'design_system', stepIndex: '4', stepName: 'design_system' };
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
        // Only the enumerated bucket ships to analytics. The raw "Other"
        // free-text is deliberately NOT forwarded here: analytics events must
        // stay free-text/PII-free (see the contract note on OnboardingClickProps),
        // and the scrubber does not sanitize arbitrary event properties. The
        // typed detail lives only in app-owned local storage (Memory note).
        discovery_source: liveProfile.source || 'unknown',
      } : {}),
    });
  }

  const isLastStep = step === 3;

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
    { value: 'x', label: t('settings.onboardingSourceX') },
    { value: 'github', label: t('settings.onboardingSourceGithub') },
    { value: 'youtube', label: t('settings.onboardingSourceYoutube') },
    { value: 'tiktok', label: t('settings.onboardingSourceTiktok') },
    { value: 'reddit', label: t('settings.onboardingSourceReddit') },
    { value: 'linkedin', label: t('settings.onboardingSourceLinkedin') },
    { value: 'meta_social', label: t('settings.onboardingSourceMetaSocial') },
    { value: 'search', label: t('settings.onboardingSourceSearch') },
    { value: 'ai_tool', label: t('settings.onboardingSourceAiTool') },
    { value: 'friend', label: t('settings.onboardingSourceFriend') },
    { value: 'community', label: t('settings.onboardingSourceCommunity') },
    { value: 'email', label: t('settings.onboardingSourceEmail') },
    { value: 'blog', label: t('settings.onboardingSourceBlog') },
    { value: 'other', label: t('settings.onboardingSourceOther') },
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
      const sourceLabel = optionLabel(sourceOptions, snapshot.source);
      const custom = snapshot.source === 'other' ? snapshot.sourceOther.trim() : '';
      fields.push([
        'Discovery source',
        custom ? `${sourceLabel} (${custom})` : sourceLabel,
      ]);
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
    selectedProvider?.preferredModels.length
      ? selectedProvider.preferredModels
      : SUGGESTED_MODELS_BY_PROTOCOL[apiProtocol],
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

  function selectPreferredProviderModelWhenEmpty(
    models: readonly ProviderModelOption[],
    expectedInputKey: string,
  ) {
    const current = providerModelAutoSelectRef.current;
    if (
      current.runtime !== 'byok' ||
      current.step !== 0 ||
      current.providerModelsInputKey !== expectedInputKey ||
      current.model.trim()
    ) {
      return;
    }
    const preference = resolveByokModelPreference({
      currentModel: '',
      accountModels: models,
      providerPreferredModels: selectedProvider?.preferredModels ?? [],
    });
    if (!preference.model) return;
    onApiModelChange(preference.model);
    updateApiConfig({ model: preference.model });
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
      await runOnboardingCompletion('completed_without_design_system');
      onFinish({
        role: profileRef.current.role,
        useCases: profileRef.current.useCase,
      });
      return;
    }
    emitOnboardingClick('continue', 'continue');
    if (step === 1) {
      void persistOnboardingProfileToMemory();
    }
    setStep((current) => current + 1);
  }

  // Cloud-landing primary CTA: pick the AMR cloud runtime and kick off the
  // Open Design Cloud sign-in in one gesture. Mirrors the old AMR card's
  // selection side effects (mode/agent) followed by the sign-in path, so a
  // successful login advances to the next onboarding step exactly the same way.
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

  // Shared finish work for the final step, independent of where the user lands
  // next. Emits the About-you snapshot + completion analytics exactly once
  // (both are idempotent per session), submits the newsletter if an email was
  // entered, then clears the session. Reading `profileRef` captures the user's
  // final picks even on a fast click before React commits the latest state.
  // Callers pick the destination: home (`onFinish`) or the design-system
  // create flow (`onGoBuild`).
  // `completionType` distinguishes the final-step fork (C2, tracking spec §3.1):
  // 'completed_with_design_system' when the user chose "Build a design system",
  // 'completed_without_design_system' when they went straight Home. Lets the
  // funnel measure how many users skip DS creation at onboarding.
  async function runOnboardingCompletion(
    completionType: TrackingOnboardingCompletionType,
  ): Promise<void> {
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
    emitOnboardingComplete('completed', completionType);
    clearOnboardingSessionId();
  }

  async function handleFinishToHome(): Promise<void> {
    if (newsletterSubmitting) return;
    await runOnboardingCompletion('completed_without_design_system');
    onFinish({
      role: profileRef.current.role,
      useCases: profileRef.current.useCase,
    });
  }

  async function handleFinishToBuild(): Promise<void> {
    if (newsletterSubmitting) return;
    await runOnboardingCompletion('completed_with_design_system');
    onGoBuild();
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
    const submittedAt = new Date();
    // The raw "Other" free-text is intentionally excluded from the attribution
    // profile: it flows into analytics (person properties) and AMR, which must
    // stay free-text/PII-free. Only the enumerated `source` bucket is carried.
    // The typed detail is preserved solely in the app-owned Memory note below.
    const attributionProfile = {
      role: snapshot.role,
      orgSize: snapshot.orgSize,
      useCase: snapshot.useCase,
      source: snapshot.source,
      completedAt: submittedAt.toISOString(),
    };
    // Persist the survey so later AMR entries (outside onboarding) can forward
    // the visitor's profile to AMR for paid-conversion segmentation.
    saveOnboardingProfile(attributionProfile, submittedAt);
    setOnboardingAttributionPersonProperties(attributionProfile, submittedAt);
    syncAmrAttributionWithOnboardingProfile(
      attributionProfile,
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

  async function testAgentInline() {
    if (!selectedAgent || !canTestAgent || agentTestState.status === 'running') return;
    const inputKey = agentTestInputKey;
    const agent = selectedAgent;
    const model = selectedAgentTestModel;
    const reasoning = selectedAgentTestReasoning;
    setAgentTestState({ status: 'running', inputKey });
    try {
      const result = await testAgent({
        agentId: agent.id,
        model: model || undefined,
        reasoning: reasoning || undefined,
        agentCliEnv: config.agentCliEnv ?? {},
      });
      setAgentTestState({ status: 'done', inputKey, result });
    } catch (error) {
      setAgentTestState({
        status: 'done',
        inputKey,
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          model: model || 'default',
          agentName: agent.name,
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
      selectPreferredProviderModelWhenEmpty(cachedModels, inputKey);
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
        selectPreferredProviderModelWhenEmpty(result.models, inputKey);
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
    const resolvedDark =
      activeTheme === 'dark' ||
      (activeTheme === 'system' &&
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    const themeIcon: 'sun' | 'moon' = resolvedDark ? 'moon' : 'sun';
    const cloudBusy = amrLoginPending;
    const amrStatusResolving = !amrStatusResolved;
    return (
      <section
        className="onboarding-view onboarding-view--cloud"
        aria-label={t('settings.welcomeTitle')}
      >
        <div className="onboarding-cloud__topbar">
          <LanguageMenu compact placement="down" align="end" />
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
            className="onboarding-cloud__logo od-brand-glyph"
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
                recordAmrEntry(analytics.track, 'onboarding_amr_card', new Date(), {
                  metricsConsent: config.telemetry?.metrics === true,
                });
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
                    selectedModel={normalizedSelectedAgentChoice.model ?? defaultAgentModelId(selectedAgent) ?? ''}
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
                    testState={visibleAgentTestState}
                    canTest={canTestAgent}
                    onTest={() => void testAgentInline()}
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
                        model: defaultKnownProviderModel(provider),
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
                    updateProfile((current) => ({ ...current, role: value }));
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
                    updateProfile((current) => ({ ...current, orgSize: value }));
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
                    updateProfile((current) => ({ ...current, useCase: value }));
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
                    // Clear the free-text detail whenever the chip changes away
                    // from 'Other' so a stale custom value never leaks into
                    // attribution for a different bucket. Routed through
                    // updateProfile so the live ref reflects the cleared value
                    // immediately, even if the user changes chip then continues.
                    updateProfile((current) => ({
                      ...current,
                      source: typeof value === 'string' ? value : current.source,
                      sourceOther: value === 'other' ? current.sourceOther : '',
                    }));
                  }}
                  trailing={
                    profile.source === 'other' ? (
                      <input
                        type="text"
                        className="onboarding-chip-field__other-input"
                        maxLength={64}
                        autoComplete="off"
                        autoFocus
                        placeholder={t('settings.onboardingSourceOtherPlaceholder')}
                        aria-label={t('settings.onboardingSourceOtherPlaceholder')}
                        value={profile.sourceOther}
                        onChange={(event) => {
                          const next = event.target.value;
                          // updateProfile keeps profileRef in sync synchronously
                          // so the Memory note (written from the live ref) never
                          // drops the latest keystrokes on a fast type-then-
                          // Continue.
                          updateProfile((current) => ({ ...current, sourceOther: next }));
                        }}
                      />
                    ) : null
                  }
                />
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
                    updateProfile((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </label>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="onboarding-view__panel onboarding-view__build">
              <span className="onboarding-view__build-badge">
                <Icon name="sparkles" size={13} aria-hidden />
                <span>{t('settings.onboardingDesignTitle')}</span>
              </span>
              <div className="onboarding-view__build-layout">
                <div className="onboarding-view__build-copy">
                  <div className="onboarding-view__build-head">
                    <h2>{t('onboarding.buildTitle')}</h2>
                    <p>{t('onboarding.buildBody')}</p>
                  </div>
                  <div className="onboarding-view__build-benefits">
                    <div>
                      <Icon name="file-text" size={15} aria-hidden />
                      <strong>{t('onboarding.buildBenefitMemoryTitle')}</strong>
                      <span>{t('onboarding.buildBenefitMemoryBody')}</span>
                    </div>
                    <div>
                      <Icon name="swatchbook" size={15} aria-hidden />
                      <strong>{t('onboarding.buildBenefitAlignedTitle')}</strong>
                      <span>{t('onboarding.buildBenefitAlignedBody')}</span>
                    </div>
                    <div>
                      <Icon name="github" size={15} aria-hidden />
                      <strong>{t('onboarding.buildBenefitSourcesTitle')}</strong>
                      <span>{t('onboarding.buildBenefitSourcesBody')}</span>
                    </div>
                  </div>
                </div>
                <div className="onboarding-view__build-preview" aria-hidden>
                  <div className="onboarding-view__build-preview-head">
                    <span />
                    <span />
                    <span />
                    <strong>DESIGN.md</strong>
                  </div>
                  <div className="onboarding-view__build-preview-body">
                    <small>{t('onboarding.buildPreviewLabel')}</small>
                    <div className="onboarding-view__build-preview-swatches">
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="onboarding-view__build-preview-type">
                      <strong>Aa</strong>
                      <span>Aa</span>
                      <em>Aa</em>
                    </div>
                    <div className="onboarding-view__build-preview-lines">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              </div>
              <ul className="onboarding-view__build-chips">
                {ONBOARDING_ARTIFACT_CHIP_IDS.map((chipId) => (
                  <li key={chipId}>{homeHeroChipLabel(chipId, t)}</li>
                ))}
              </ul>
              <div className="onboarding-view__build-actions">
                <button
                  type="button"
                  className="onboarding-view__ghost onboarding-view__build-back"
                  onClick={handleBackWithTracking}
                  disabled={onboardingNavigationLocked}
                >
                  {t('settings.onboardingBack')}
                </button>
                <button
                  type="button"
                  className="onboarding-view__secondary"
                  onClick={() => {
                    void handleFinishToHome();
                  }}
                  disabled={newsletterSubmitting}
                >
                  {t('onboarding.buildHome')}
                </button>
                <button
                  type="button"
                  className="onboarding-view__primary"
                  onClick={() => {
                    void handleFinishToBuild();
                  }}
                  disabled={newsletterSubmitting}
                  aria-busy={newsletterSubmitting ? true : undefined}
                >
                  <span>{t('onboarding.buildStart')}</span>
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? null : (
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
                disabled={amrLoginPending || amrLoginCancelPending || newsletterSubmitting}
                aria-disabled={connectStepBlocked || undefined}
                data-tooltip={connectGateTooltip ?? undefined}
                data-tooltip-placement="top"
                aria-busy={newsletterSubmitting ? true : undefined}
              >
                <span>{primaryActionLabel}</span>
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
  testState,
  canTest,
  onTest,
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
  testState: OnboardingAgentTestState;
  canTest: boolean;
  onTest: () => void;
}) {
  const t = useT();
  const scanning = scanStatus === 'scanning';
  const running = testState.status === 'running';
  const showEmpty = scanStatus === 'done' && agents.length === 0;
  return (
    <div className="onboarding-view__setup-panel">
      <div className="onboarding-view__setup-head">
        <div>
          <strong>{t('settings.localCli')}</strong>
          <p>{daemonLive ? t('settings.codeAgentHint') : t('settings.modeDaemonOffline')}</p>
        </div>
        <div className="onboarding-view__setup-head-actions">
          <button
            type="button"
            className={`onboarding-view__mini-button${scanning ? ' is-loading' : ''}`}
            onClick={onRefresh}
            disabled={scanning}
          >
            {scanning ? t('settings.rescanRunning') : t('settings.rescan')}
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
          {renderOnboardingAgentTestMessage(
            t,
            testState.result,
            selectedAgent?.name ?? '',
          )}
        </p>
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
  const displayModels = models.map((model) => {
    const capability = onboardingModelCapabilityLabel(t, model);
    const cost = onboardingModelCostLabel(t, model);
    return {
      value: model.id,
      label: formatOnboardingAmrModelLabel(model),
      tag: capability?.label,
      tagKind: capability?.kind,
      meta: cost?.label,
    };
  });
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

function onboardingModelCapabilityLabel(
  t: ReturnType<typeof useT>,
  model: Pick<NonNullable<AgentInfo['models']>[number], 'id' | 'metadata'>,
): { label: string; kind: ModelCapabilityTag } | undefined {
  const tag = getModelCapabilityTag(model);
  return tag ? { label: t(MODEL_CAPABILITY_TAG_LABEL_KEYS[tag]), kind: tag } : undefined;
}

function onboardingModelCostLabel(
  t: ReturnType<typeof useT>,
  model: Pick<NonNullable<AgentInfo['models']>[number], 'id' | 'metadata'>,
): { label: string } | undefined {
  const tier = getModelCostTier(model);
  return tier ? { label: t(MODEL_COST_TIER_LABEL_KEYS[tier]) } : undefined;
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
            placeholder={defaultKnownProviderModel(selectedProvider) || 'claude-sonnet-4-5'}
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
              placeholder={defaultKnownProviderModel(selectedProvider) || 'claude-sonnet-4-5'}
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
    case 'upstream_unavailable': {
      const baseMessage = t('settings.testUpstream', {
        status: result.status ?? 0,
      });
      return result.detail ? `${baseMessage} ${result.detail}` : baseMessage;
    }
    case 'timeout':
      return t('settings.testTimeout', { ms });
    default:
      return t('settings.testUnknown', { detail: result.detail ?? '' });
  }
}

function renderOnboardingAgentTestMessage(
  t: ReturnType<typeof useT>,
  result: ConnectionTestResponse,
  fallbackAgentName: string,
): string {
  const ms = Math.max(0, Math.round(result.latencyMs));
  const sample = result.sample ?? '';
  const agentName = result.agentName ?? fallbackAgentName;
  if (result.ok) {
    const baseMessage = t('settings.testSuccessCli', { agentName, ms, sample });
    return result.detail ? `${baseMessage} ${result.detail}` : baseMessage;
  }
  switch (result.kind) {
    case 'agent_not_installed':
      return t('settings.testAgentMissing', { agentName });
    case 'agent_auth_required':
      return result.detail || 'Agent authentication is required.';
    case 'agent_spawn_failed':
      return t('settings.testAgentSpawn', {
        agentName,
        detail: result.detail ?? '',
      });
    case 'rate_limited':
      return t('settings.testRateLimited');
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
    case 'upstream_unavailable': {
      const baseMessage = t('settings.testUpstream', {
        status: result.status ?? 0,
      });
      return result.detail ? `${baseMessage} ${result.detail}` : baseMessage;
    }
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

type OnboardingChipFieldProps = (
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
    }
) & {
  // Optional element rendered inline at the end of the chip row (e.g. a
  // free-text input revealed by an "Other" pick), so it reads as attached
  // to the last chip rather than floating below the group.
  trailing?: ReactNode;
};

// Profile fields render their options as flat toggleable chips so every choice
// is visible and a selection takes one tap instead of opening a dropdown first.
function OnboardingChipField(props: OnboardingChipFieldProps) {
  const { label, options, trailing } = props;
  const selected = props.multiple
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
        {trailing}
      </div>
    </div>
  );
}

type OnboardingDropdownOption = {
  value: string;
  label: string;
  tag?: string;
  tagKind?: ModelCapabilityTag;
  meta?: string;
};

type OnboardingDropdownBaseProps = {
  label: string;
  placeholder: string;
  options: OnboardingDropdownOption[];
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
  const selectedTag = multiple ? undefined : selectedOption?.tag;
  const selectedTagKind = multiple ? undefined : selectedOption?.tagKind;
  const selectedTagDescriptionId = selectedTag
    ? `${dropdownIdRef.current}-selected-tag`
    : undefined;
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
        aria-label={triggerLabel}
        aria-describedby={selectedTagDescriptionId}
        title={triggerLabel}
        onClick={toggleOpen}
      >
        <span className="onboarding-view__select-trigger-value">
          <span>{triggerLabel}</span>
          {selectedTag ? (
            <span
              className="onboarding-view__select-badge"
              data-tag={selectedTagKind}
              id={selectedTagDescriptionId}
            >
              {selectedTag}
            </span>
          ) : null}
        </span>
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
            {visibleOptions.map((option, index) => {
              const selected = selectedValues.includes(option.value);
              const optionId = `${dropdownIdRef.current}-option-${index}`;
              const optionLabelId = `${optionId}-label`;
              const optionMetaId = option.meta ? `${optionId}-meta` : undefined;
              const optionTagId = option.tag ? `${optionId}-tag` : undefined;
              const optionDescriptionIds = [optionMetaId, optionTagId]
                .filter(Boolean)
                .join(' ') || undefined;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`onboarding-view__select-option${selected ? ' is-selected' : ''}`}
                  role="option"
                  aria-selected={selected}
                  aria-labelledby={optionLabelId}
                  aria-describedby={optionDescriptionIds}
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
                  <span className="onboarding-view__select-option-content">
                    <span className="onboarding-view__select-option-copy">
                      <span id={optionLabelId}>{option.label}</span>
                      {option.meta ? (
                        <span
                          className="onboarding-view__select-option-meta"
                          id={optionMetaId}
                        >
                          {option.meta}
                        </span>
                      ) : null}
                    </span>
                    {option.tag ? (
                      <span
                        className="onboarding-view__select-badge"
                        data-tag={option.tagKind}
                        id={optionTagId}
                      >
                        {option.tag}
                      </span>
                    ) : null}
                  </span>
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
  icon: 'orbit' | 'hammer' | 'sliders' | 'github' | 'upload' | 'sparkles';
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
