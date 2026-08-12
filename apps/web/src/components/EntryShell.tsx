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
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { createPortal } from 'react-dom';
import {
  defaultScenarioPluginIdForProjectMetadata,
  type AmrWalletSnapshot,
  type ChatSessionMode,
  type ConnectorDetail,
  type InstalledPluginRecord,
  type RunContextSelection,
  type WorkspaceProjectSummary,
} from '@open-design/contracts';
import type { OpenDesignHostProjectImportSuccess } from '@open-design/host';
import { useAnalytics } from '../analytics/provider';
import {
  trackHomeNavClick,
  trackHomeToolbarClick,
  trackOnboardingClick,
  trackOnboardingCompleteResult,
  trackOnboardingRuntimeScanResult,
  trackPageView,
  trackDeepSeekCampaignBadgeClick,
  trackDeepSeekCampaignBadgeSurfaceView,
} from '../analytics/events';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
  type AmrEntryAttribution,
} from '../analytics/amr-attribution';
import { getResolvedDeviceId } from '../analytics/client';
import {
  beginAmrAuthTracking,
  confirmAmrAuthTracking,
  observeAmrAuthTracking,
  reconcileAmrAuthAttemptId,
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
import { ProjectSearchModal } from './ProjectSearchModal';
import { CloudSignInTip, RailAccountSyncTip } from './CloudSignInTip';
import { resolveEntryRailAccountFooterState } from './entry-rail-account-state';
import { LibrarySection } from './LibrarySection';
import { UpdaterPopup } from './UpdaterPopup';
import { WhatsNewPopup } from './WhatsNewPopup';
import { AmrBalanceDialog } from './AmrBalanceDialog';
import { AmrLowBalanceDialog, type AmrLowBalanceDecision } from './AmrLowBalanceDialog';
import {
  amrBalanceGateScopeForWorkspaceContext,
  amrBalanceGateScopesMatch,
  checkAmrBalanceGate,
  type AmrBalanceGateScope,
} from '../runtime/amr-balance-gate';
import { isPaidAmrPlan, resolveAmrPlan } from '../runtime/amr-low-balance-plan';
import { HomeView, seedHomeComposerPrompt } from './HomeView';
import { EntryBlankState } from './EntryBlankState';
import { RecentProjectsStrip } from './RecentProjectsStrip';
import {
  createPluginAuthoringHandoff,
  createPluginUseHandoff,
  createSkillUseHandoff,
  takeHomePromptHandoff,
  type HomePromptHandoff,
} from './home-hero/plugin-authoring';
import type { OnboardingEntry } from '../onboarding/onboarding-entry';
import type { PluginUseAction } from './plugins-home/useActions';
import { Icon } from './Icon';
import { Button } from '@open-design/components';
import { defaultAgentModelId, effectiveAgentModelChoice } from './agentModelSelection';
import { AgentIcon } from './AgentIcon';
import { CommunityView } from './CommunityView';
import { TeamSlotPlaceholder } from './TeamSlotPlaceholder';
import {
  notifyTeamProjectsChanged,
  notifyWorkspaceBillingRefresh,
  notifyWorkspaceContextRefresh,
  currentWorkspaceAccountGeneration,
  useTeamProjects,
  useWorkspaceBillingResponse,
  useWorkspaceContext,
  workspaceBillingBalanceUsd,
  workspaceBillingSummaryForContext,
} from '../collab/useWorkspaceContext';
import { useWorkspaceInvalidation } from '../collab/workspace-events';
import { resolvePlanLabelTier } from '../collab/team-plan';
import { resolveDeepSeekV4FlashCampaignAudience } from '../campaigns/deepseek-v4-flash';
import { useDeepSeekV4FlashCampaignVisibility } from '../campaigns/use-deepseek-v4-flash-campaign';
import {
  beginWorkspaceScopedRead,
  workspaceIdentityCacheKey,
  workspaceProjectHeaders,
} from '../collab/workspace-identity';
import {
  buildAllProjectsList,
  buildDraftsList,
  createSharedProjectPredicate,
  reconcileSharedProjectCatalogFields,
} from '../collab/all-projects-list';
import {
  forgetOptimisticProjectOwnership,
  optimisticProjectOwnershipScopeKey,
  projectOwnerMemberIdsWithOptimisticWitnesses,
  reconcileOptimisticProjectOwnership,
  recordOptimisticProjectOwnership,
  type OptimisticProjectOwnershipWitnesses,
} from '../collab/optimistic-project-ownership';
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
import { type EntrySettingsSection } from './EntrySettingsMenu';
import { NewProjectModal } from './NewProjectModal';
import { ExtensionsMarketplace } from './PluginsView';
import type { CreateInput, CreateTab, ImportClaudeDesignOutcome } from './NewProjectPanel';
import type { PluginLoopSubmit } from './PluginLoopHome';
import {
  createProject,
  duplicatePluginAsProject,
  patchProject,
  resolvedWorkspaceContextForWrite,
  type PluginShareAction,
  type PluginShareProjectOutcome,
} from '../state/projects';
import { TasksView } from './TasksView';
import {
  API_KEY_PLACEHOLDERS,
  API_PROTOCOL_TABS,
  SUGGESTED_MODELS_BY_PROTOCOL,
} from '../state/apiProtocols';
import { defaultKnownProviderModel, KNOWN_PROVIDERS } from '../state/config';
import type { KnownProvider } from '../state/config';
import { testAgent, testApiProvider } from '../providers/connection-test';
import { fetchProviderModels } from '../providers/provider-models';
import { invalidateProjectFilesCache } from '../providers/registry';
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
import {
  ENTRY_RAIL_STATE_EVENT,
  ENTRY_RAIL_TOGGLE_EVENT,
  RAIL_OPEN_STORAGE_KEY,
  readStoredRailOpen,
} from './entryRailBridge';
import { enterpriseUrl } from './enterpriseUrl';
import { resolveByokModelPreference } from './byok/validation';
import onboardingSourceStyles from './OnboardingModelSource.module.css';

const DEEPSEEK_CAMPAIGN_PRICING_URL =
  'https://open-design.ai/zh/pricing/?source=desktop_campaign_badge';

// Persist the entry nav-rail open/collapsed state so it survives both a
// home -> project -> home navigation (EntryShell unmounts on the project
// route) and a full reload. Without this the rail always reset to its
// collapsed default on return. The storage key, the rail toggle/state window
// events, and the seed reader live in `entryRailBridge` so the pinned Home
// tab's sidebar toggle (WorkspaceTabsBar, a sibling React tree) can share
// them without importing this module's graph.
export { ENTRY_RAIL_STATE_EVENT, ENTRY_RAIL_TOGGLE_EVENT };

function writeStoredRailOpen(open: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RAIL_OPEN_STORAGE_KEY, open ? 'true' : 'false');
  } catch {
    /* ignore quota / disabled storage */
  }
}

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
const ONBOARDING_BYOK_AUTO_FETCH_DELAY_MS = 300;
const ONBOARDING_BYOK_AUTO_TEST_DELAY_MS = 500;

const ONBOARDING_AMR_MODEL_OPTIONS: NonNullable<AgentInfo['models']> = [
  { id: 'claude-opus-4.8', label: 'Claude Opus 4.8' },
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'glm-5.1', label: 'GLM 5.1' },
];

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
  /** Exact workspace/member authority checked by the Home AMR preflight. */
  amrGatePrecheckWitness?: AmrBalanceGateScope;
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

export interface ProjectTitleHint {
  name: string;
  /** Workspace whose catalog produced this hint; null for a local-only row. */
  workspaceId: string | null;
  /** Member authorization lifetime that produced the catalog row. */
  workspaceMemberId: string | null;
  /**
   * The team catalog is the title authority for a project shared by another
   * member. Own/private projects may still accept a newer local rename.
   */
  authoritative: boolean;
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
  // Local credential state is independent from the remote workspace read.
  // During a transient Cloud outage it prevents the rail from presenting a
  // still-signed-in user as signed out.
  amrLoggedIn?: boolean | null;
  /**
   * vela login-status account/user plan (ACCOUNT-scoped). Used for personal
   * workspaces so a confirmed free account is not stuck as campaign audience
   * `unknown` while billing summary leaves `membershipTier` empty.
   */
  amrAccountPlan?: string | null;
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string; serviceTier?: string },
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
  onOpenProject: (
    id: string,
    fileName?: string,
    projectTitleHint?: ProjectTitleHint,
  ) => Promise<boolean> | boolean | void;
  onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
  onDeleteProject: (id: string) => Promise<boolean | void> | boolean | void;
  onDuplicateProject?: (id: string) => Promise<void> | void;
  onRenameProject: (id: string, name: string) => void;
  onProjectsRefresh?: () => Promise<void> | void;
  onTeamProjectContentReady?: (
    projectId: string,
    workspaceId: string,
    workspaceMemberId: string,
  ) => Promise<boolean> | boolean;
  onChangeDefaultDesignSystem: (id: string) => void;
  onCreateDesignSystem?: () => void;
  // First-run onboarding intentionally stops after model-source setup.
  // Guided design-system creation stays reachable from the standalone
  // `design-system-create` route and the Design Systems tab.
  onOpenDesignSystem?: (id: string) => void;
  onDesignSystemsRefresh?: () => Promise<void> | void;
  onPersistComposioKey: (composio: AppConfig['composio']) => Promise<void> | void;
  onOpenSettings: (section?: EntrySettingsSection) => void;
  onCompleteOnboarding: () => void;
  onSignedOut?: () => void | Promise<void>;
  onAmrLoginStatusChange?: (status: VelaLoginStatus | null) => void;
  artifactUpgradeSlot?: ReactNode;
}

// Map an EntryNavRail view id to the existing analytics `element` enum on
// `home/nav` ui_click. Keep this compatibility signal alongside the new
// Workspace navigation dimensions so established PostHog dashboards do not
// lose their historical series.
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
  amrLoggedIn = null,
  amrAccountPlan = null,
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
  onTeamProjectContentReady,
  onChangeDefaultDesignSystem,
  onCreateDesignSystem,
  onOpenDesignSystem,
  onDesignSystemsRefresh,
  onPersistComposioKey,
  onOpenSettings,
  onCompleteOnboarding,
  onSignedOut,
  onAmrLoginStatusChange,
  artifactUpgradeSlot,
}: Props) {
  const t = useT();
  // Each entry sub-view (home / projects / design-systems) is its own
  // URL now, so the browser back/forward buttons work and a deep link
  // to /design-systems lands on that section. We derive the active
  // view from the route rather than keeping it in component state.
  const route = useRoute();
  const view: EntryViewKind = route.kind === 'home' ? route.view : 'home';
  useEffect(() => {
    // The entry shell is the authenticated Home surface. A definitive
    // signed-out result returns it to the Cloud identity gate while leaving
    // the saved model source untouched for passive reauthentication.
    if (amrLoggedIn !== false || view === 'onboarding') return;
    navigate({ kind: 'home', view: 'onboarding' }, { replace: true });
  }, [amrLoggedIn, view]);
  // The one shared workspace context. Any non-null context is a real workspace
  // (personal or team); workspace surfaces gate on B's permission bits, not on
  // workspaceType.
  // The whole state (not just `context`) so workspace-scoped WRITES can go
  // through `resolvedWorkspaceContextForWrite`, which refuses to collapse an
  // unresolved or unavailable authority into an anonymous, unbound create.
  const workspaceContextState = useWorkspaceContext();
  const { context: workspaceContext, loading: workspaceLoading } = workspaceContextState;
  const accountFooterState = resolveEntryRailAccountFooterState(
    workspaceContextState,
    amrLoggedIn,
  );
  const workspaceContextRef = useRef(workspaceContext);
  workspaceContextRef.current = workspaceContext;
  const workspaceBillingResponse = useWorkspaceBillingResponse();
  // Plan and money are both workspace-scoped questions, so both go through a
  // context-partitioned projection. `response.summary` on its own is an ACCOUNT
  // read (`workspaceId: null` by contract) — feeding it to the rail's plan
  // nameplate is what kept a personal Plus badge on a 免费 workspace while the
  // 额度 row beside it correctly followed the switch.
  const workspaceBilling = workspaceBillingSummaryForContext(
    workspaceBillingResponse,
    workspaceContext,
  );
  const deepSeekCampaignVisibility = useDeepSeekV4FlashCampaignVisibility();
  // Same personal-vs-team accountPlan rule as App's `resolvedAmrPlan`.
  const deepSeekCampaignPlan = resolvePlanLabelTier({
    billing: workspaceBilling,
    context: workspaceContext,
    accountPlan:
      workspaceLoading || workspaceContext?.workspaceType === 'team'
        ? null
        : amrAccountPlan?.trim() || null,
  });
  const deepSeekV4FlashCampaignAudience = resolveDeepSeekV4FlashCampaignAudience({
    // Subscription is the only campaign segmentation axis. In particular,
    // `resolvePlanLabelTier` turns the backend-confirmed unsubscribed state into
    // `free`; wallet balance / historical recharge never upgrades this audience.
    plan: deepSeekCampaignPlan,
    loggedIn: amrLoggedIn,
    now: deepSeekCampaignVisibility.now,
  });
  const workspaceBalanceUsd = workspaceBillingBalanceUsd(
    workspaceBillingResponse,
    workspaceContext,
  );
  // Team-wide shared-project discovery for the "全部项目" view. The member's own
  // `projects` prop is only their LOCAL list; team-shared projects come from the
  // resource hub through the daemon. Empty off-team / when the hub is unconfigured.
  const teamProjects = useTeamProjects();
  const hasWorkspaceContext = Boolean(workspaceContext);
  // The "全部项目" grid is the SAME project-card grid used everywhere; its
  // membership rule lives in `buildAllProjectsList`. Rows flow through
  // `RecentProjectsStrip` like any other card — no custom section.
  const localProjectIds = new Set(projects.map((project) => project.id));
  // The optimistic share layer lives HERE, above every project strip, because a
  // share has to move TWO things at once: the card's 共享 badge and which grid
  // the card sits in. It used to live inside `RecentProjectsStrip`, so the badge
  // flipped on click while 草稿 kept the card until the next team-projects poll
  // (acceptance: 「转入团队空间, 怎么还显示在草稿里…切到全部项目再切回草稿它才消失」).
  const [sharedThisSession, setSharedThisSession] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [unsharedThisSession, setUnsharedThisSession] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const optimisticOwnershipScopeKey = optimisticProjectOwnershipScopeKey(
    workspaceContext,
    currentWorkspaceAccountGeneration(),
  );
  const [optimisticOwnershipWitnesses, setOptimisticOwnershipWitnesses] = useState<
    OptimisticProjectOwnershipWitnesses
  >(() => new Map());
  const markProjectShared = useCallback((project: WorkspaceProjectSummary) => {
    setSharedThisSession((prev) => new Set(prev).add(project.id));
    setUnsharedThisSession((prev) => {
      const next = new Set(prev);
      next.delete(project.id);
      return next;
    });
    setOptimisticOwnershipWitnesses((prev) => recordOptimisticProjectOwnership(prev, {
      scopeKey: optimisticOwnershipScopeKey,
      context: workspaceContext,
      project,
    }));
  }, [optimisticOwnershipScopeKey, workspaceContext]);
  const markProjectShareFailed = useCallback((projectId: string) => {
    setSharedThisSession((prev) => {
      if (!prev.has(projectId)) return prev;
      const next = new Set(prev);
      next.delete(projectId);
      return next;
    });
    setOptimisticOwnershipWitnesses((prev) =>
      forgetOptimisticProjectOwnership(prev, projectId));
  }, []);
  const markProjectUnshared = useCallback((projectId: string) => {
    setUnsharedThisSession((prev) => new Set(prev).add(projectId));
    setSharedThisSession((prev) => {
      const next = new Set(prev);
      next.delete(projectId);
      return next;
    });
    setOptimisticOwnershipWitnesses((prev) =>
      forgetOptimisticProjectOwnership(prev, projectId));
  }, []);
  useEffect(() => {
    setOptimisticOwnershipWitnesses((prev) => reconcileOptimisticProjectOwnership(prev, {
      scopeKey: optimisticOwnershipScopeKey,
      teamProjects: teamProjects.projects,
    }));
    const catalogProjectIds = new Set(
      teamProjects.projects.map((project) => project.projectId),
    );
    setSharedThisSession((prev) => {
      if (![...prev].some((projectId) => catalogProjectIds.has(projectId))) return prev;
      return new Set([...prev].filter((projectId) => !catalogProjectIds.has(projectId)));
    });
  }, [optimisticOwnershipScopeKey, teamProjects.projects]);
  // The single shared-state answer, handed to the grids AND to every strip.
  const isSharedProject = useMemo(
    () =>
      createSharedProjectPredicate({
        teamProjects: teamProjects.projects,
        localProjects: projects,
        workspaceContext,
        sharedThisSession,
        unsharedThisSession,
      }),
    [projects, teamProjects.projects, workspaceContext, sharedThisSession, unsharedThisSession],
  );
  // 草稿 is the complement of 全部项目: sharing moves a project from one to the
  // other, so a shared project must stop appearing here (acceptance #78).
  const draftProjectsList: Project[] = buildDraftsList({
    projects,
    teamProjects: teamProjects.projects,
    workspaceContext,
    isShared: isSharedProject,
  });
  const allProjectsList: Project[] = buildAllProjectsList({
    projects,
    teamProjects: teamProjects.projects,
    workspaceContext,
    sharedFallbackName: t('recentProjects.sharedProjectFallbackName'),
    isShared: isSharedProject,
  });
  const homeProjectsList = useMemo(
    () => reconcileSharedProjectCatalogFields({
      projects,
      teamProjects: teamProjects.projects,
      workspaceContext,
    }),
    [projects, teamProjects.projects, workspaceContext],
  );
  // projectId → sharing member id, so a card in the 全部项目 / 草稿 grids can
  // resolve "{creator}创建" against the member directory. A project absent here
  // is the member's own local project → "我创建".
  const teamProjectOwnerMemberIds = useMemo(
    () => projectOwnerMemberIdsWithOptimisticWitnesses({
      scopeKey: optimisticOwnershipScopeKey,
      teamProjects: teamProjects.projects,
      witnesses: optimisticOwnershipWitnesses,
    }),
    [optimisticOwnershipScopeKey, optimisticOwnershipWitnesses, teamProjects.projects],
  );
  const contentReadyProjectIdsRef = useRef(new Set<string>());
  const pendingContentReadyProjectIdsRef = useRef(
    new Map<string, { workspaceId: string; workspaceMemberId: string }>(),
  );
  const contentReadyHydrationRef = useRef(new Map<string, Promise<boolean>>());
  const teamProjectIdsRef = useRef(new Set<string>());
  teamProjectIdsRef.current = new Set(
    teamProjects.projects.map((project) => project.projectId),
  );
  const readyWorkspaceId = workspaceContext?.workspaceId ?? null;
  const readyWorkspaceMemberId = workspaceContext?.workspaceMemberId ?? null;
  const readyScopeKey = workspaceContext
    ? workspaceIdentityCacheKey(workspaceContext)
    : null;
  const contentReadyScopeKeyRef = useRef<string | null>(null);
  if (contentReadyScopeKeyRef.current !== readyScopeKey) {
    contentReadyScopeKeyRef.current = readyScopeKey;
    contentReadyProjectIdsRef.current.clear();
    pendingContentReadyProjectIdsRef.current.clear();
    contentReadyHydrationRef.current.clear();
  }
  const acceptContentReadyProject = useCallback((
    projectId: string,
    eventWorkspaceId: string,
    eventWorkspaceMemberId: string,
  ): Promise<boolean> => {
    const workspaceId = workspaceContext?.workspaceId;
    const workspaceMemberId = workspaceContext?.workspaceMemberId;
    if (
      !workspaceId ||
      !workspaceMemberId ||
      workspaceContext?.workspaceType !== 'team' ||
      workspaceId !== eventWorkspaceId ||
      workspaceMemberId !== eventWorkspaceMemberId ||
      !teamProjectIdsRef.current.has(projectId)
    ) {
      return Promise.resolve(false);
    }
    if (contentReadyProjectIdsRef.current.has(projectId)) {
      return Promise.resolve(true);
    }
    const scopeKey = readyScopeKey;
    if (!scopeKey) return Promise.resolve(false);
    const key = `${scopeKey}:${projectId}`;
    const existing = contentReadyHydrationRef.current.get(key);
    if (existing) return existing;
    if (!onTeamProjectContentReady) return Promise.resolve(false);
    const hydration = Promise.resolve(
      onTeamProjectContentReady(projectId, workspaceId, workspaceMemberId),
    )
      .then((hydrated) => {
        if (
          hydrated !== true ||
          contentReadyScopeKeyRef.current !== scopeKey ||
          !teamProjectIdsRef.current.has(projectId)
        ) {
          return false;
        }
        pendingContentReadyProjectIdsRef.current.delete(projectId);
        contentReadyProjectIdsRef.current.add(projectId);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        if (contentReadyHydrationRef.current.get(key) === hydration) {
          contentReadyHydrationRef.current.delete(key);
        }
      });
    contentReadyHydrationRef.current.set(key, hydration);
    return hydration;
  }, [
    onTeamProjectContentReady,
    readyScopeKey,
    workspaceContext?.workspaceMemberId,
    workspaceContext?.workspaceId,
    workspaceContext?.workspaceType,
  ]);
  useWorkspaceInvalidation({
    'team-project-content-ready': ({ projectId, workspaceId }) => {
      const currentWorkspaceId = workspaceContext?.workspaceId;
      const currentWorkspaceMemberId = workspaceContext?.workspaceMemberId;
      if (
        !currentWorkspaceId ||
        !currentWorkspaceMemberId ||
        currentWorkspaceId !== workspaceId
      ) {
        return;
      }
      pendingContentReadyProjectIdsRef.current.set(projectId, {
        workspaceId,
        workspaceMemberId: currentWorkspaceMemberId,
      });
      void acceptContentReadyProject(
        projectId,
        workspaceId,
        currentWorkspaceMemberId,
      );
    },
  }, { workspaceContext });
  useEffect(() => {
    if (!readyScopeKey) return;
    for (const [projectId, eventScope] of pendingContentReadyProjectIdsRef.current) {
      if (
        eventScope.workspaceId === readyWorkspaceId &&
        eventScope.workspaceMemberId === readyWorkspaceMemberId
      ) {
        void acceptContentReadyProject(
          projectId,
          eventScope.workspaceId,
          eventScope.workspaceMemberId,
        );
      }
    }
  }, [
    acceptContentReadyProject,
    readyScopeKey,
    readyWorkspaceId,
    readyWorkspaceMemberId,
    teamProjects.projects,
  ]);
  // Open handler for the "全部项目" grid. A project already in the member's local
  // list opens directly; a team-shared project the member has not pulled yet is
  // first pulled + registered on the daemon (materialize content + insert a local
  // project record) so it can open read-only — the member is not the owner, so
  // the useProjectCollab single-writer path keeps it read-only.
  const [pullingProjectId, setPullingProjectId] = useState<string | null>(null);
  async function handleOpenAllProjects(id: string): Promise<boolean> {
    // The grid already reconciled the local row with the authoritative team
    // catalog (notably the owner's current project name). Carry its title and
    // provenance into App before navigation. Passing only the id made App reopen its local
    // SQLite placeholder ("共享项目"), throwing away data already visible on the
    // list and leaving the project header stale until a later metadata event.
    const projectName = allProjectsList.find((project) => project.id === id)?.name.trim();
    const teamProject = teamProjects.projects.find((project) => project.projectId === id);
    const localProject = projects.find((project) => project.id === id);
    const projectTitleHint = projectName
      ? {
          name: projectName,
          workspaceId: workspaceContext?.workspaceId ?? null,
          workspaceMemberId: workspaceContext?.workspaceMemberId ?? null,
          // A member must render the owner's catalog title even when their
          // local mirror has a newer timestamp or an older non-placeholder
          // title. The owner may rename locally before the catalog catches up.
          authoritative: Boolean(
            teamProject
            && teamProject.ownerMemberId !== workspaceContext?.workspaceMemberId,
          ),
        }
      : undefined;
    const open = () => Promise.resolve(onOpenProject(id, undefined, projectTitleHint));
    if (contentReadyProjectIdsRef.current.has(id)) {
      await open();
      return true;
    }
    const scopeKey = contentReadyScopeKeyRef.current;
    const hydration = scopeKey
      ? contentReadyHydrationRef.current.get(`${scopeKey}:${id}`)
      : null;
    if (hydration) {
      const hydrated = await hydration;
      if (hydrated) {
        await open();
        return true;
      }
      if (contentReadyScopeKeyRef.current !== scopeKey) return false;
    }
    // The daemon explicitly stamps the local row created by a first Team
    // status read as a placeholder. Hydrate only that stamped row before
    // navigation; a normal local Team row is already materialized and must
    // keep its direct-open path (including unpublished owner changes).
    if (
      localProject?.metadata?.sharedProjectPlaceholderAt != null
      && teamProject
      && workspaceContext?.workspaceType === 'team'
      && workspaceContext.workspaceId
      && workspaceContext.workspaceMemberId
      && onTeamProjectContentReady
    ) {
      const hydrated = await acceptContentReadyProject(
        id,
        workspaceContext.workspaceId,
        workspaceContext.workspaceMemberId,
      );
      if (hydrated) {
        await open();
        return true;
      }
    } else if (localProjectIds.has(id)) {
      await open();
      return true;
    }
    // The pull materializes the whole project before it can open; surface it
    // on the card (spinner overlay) and swallow re-clicks meanwhile —
    // otherwise the first click reads as dead for the entire download.
    if (pullingProjectId) return false;
    const pullRead = beginWorkspaceScopedRead(workspaceContextRef.current);
    if (!pullRead.context) return false;
    setPullingProjectId(id);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(id)}/collab/pull`, {
        method: 'POST',
        headers: workspaceProjectHeaders(pullRead.context),
      });
      if (!pullRead.isStillCurrent(workspaceContextRef.current)) return false;
      if (!response.ok) return false;
      invalidateProjectFilesCache(id, pullRead.context);
      await Promise.resolve(onProjectsRefresh?.());
    } catch {
      return false;
    } finally {
      setPullingProjectId(null);
    }
    await open();
    return true;
  }
  // Workspace-only destinations. Personal and team workspaces both use these;
  // signed-out/local state falls back to home once the context has resolved.
  // `community` is allowed in both states, so it is not guarded.
  const isWorkspaceOnlyView =
    view === 'drafts' ||
    view === 'all-projects' ||
    view === 'members' ||
    view === 'board' ||
    view === 'workspace-settings';
  useEffect(() => {
    if (workspaceLoading) return;
    if (isWorkspaceOnlyView && !hasWorkspaceContext) {
      navigate({ kind: 'home', view: 'home' }, { replace: true });
    }
  }, [workspaceLoading, isWorkspaceOnlyView, hasWorkspaceContext]);
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
  // The entry nav rail is collapsed by default (Manus-style) so the entry
  // view opens clean and full-width; the panel toggle in the topbar opens it
  // as an overlay that dismisses on selection / backdrop click / Escape.
  // Its open/collapsed state is persisted (localStorage) so it survives a
  // home -> project -> home round trip (EntryShell unmounts on the project
  // route) and a reload, instead of snapping back to collapsed.
  const [railOpen, setRailOpen] = useState<boolean>(readStoredRailOpen);
  const [projectSearchOpen, setProjectSearchOpen] = useState(false);

  // ⌘K / Ctrl+K opens the project search palette — same as clicking the rail
  // search box.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        setProjectSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    writeStoredRailOpen(railOpen);
    // Broadcast the state so chrome outside this tree (the pinned Home tab's
    // sidebar toggle) can mirror it via aria-expanded.
    window.dispatchEvent(
      new CustomEvent(ENTRY_RAIL_STATE_EVENT, { detail: { open: railOpen } }),
    );
  }, [railOpen]);

  // The pinned Home tab (WorkspaceTabsBar) carries a sidebar toggle; it lives
  // in a sibling tree, so the request arrives as a window event.
  useEffect(() => {
    const onToggle = () => setRailOpen((v) => !v);
    window.addEventListener(ENTRY_RAIL_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(ENTRY_RAIL_TOGGLE_EVENT, onToggle);
  }, []);
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
  // Lazy initializer, so a handoff published by a surface that then navigated
  // here — the `/marketplace/<id>` detail route, which `App` renders outside
  // this shell — is claimed on the very first render and reaches HomeView in
  // the same commit as the mount. The read is destructive, so it applies once.
  const [homePromptHandoff, setHomePromptHandoff] = useState<HomePromptHandoff | null>(
    () => takeHomePromptHandoff(),
  );
  const entryMainScrollRef = useRef<HTMLElement | null>(null);
  // Entry views share this element, so route changes must not inherit the previous view's offset.
  useLayoutEffect(() => {
    const scrollContainer = entryMainScrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollTop = 0;
  }, [view]);
  const analytics = useAnalytics();
  useEffect(() => {
    if (view !== 'home' || deepSeekV4FlashCampaignAudience === 'unknown') return;
    trackDeepSeekCampaignBadgeSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'campaign_badge',
      element: 'deepseek_v4_flash',
      campaign_id: 'deepseek_v4_flash',
      user_state: deepSeekV4FlashCampaignAudience,
    });
  }, [analytics.track, deepSeekV4FlashCampaignAudience, view]);
  const openDeepSeekCampaignPricing = useCallback(() => {
    if (deepSeekV4FlashCampaignAudience === 'unknown') return;
    trackDeepSeekCampaignBadgeClick(analytics.track, {
      page_name: 'home',
      area: 'campaign_badge',
      element: 'open_pricing',
      campaign_id: 'deepseek_v4_flash',
      user_state: deepSeekV4FlashCampaignAudience,
    });
    const attribution = recordAmrEntry(
      analytics.track,
      'deepseek_workbench_badge',
      new Date(),
      {
        metricsConsent: config.telemetry?.metrics === true,
        campaignId: 'deepseek_v4_flash',
        conversionSource: 'deepseek_workbench_badge',
      },
    );
    const deviceId = amrHandoffDeviceId({
      metricsConsent: config.telemetry?.metrics === true,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId: config.installationId,
    });
    window.open(
      attributedAmrUrl(DEEPSEEK_CAMPAIGN_PRICING_URL, attribution, deviceId),
      '_blank',
      'noopener,noreferrer',
    );
  }, [
    analytics.track,
    config.installationId,
    config.telemetry?.metrics,
    deepSeekV4FlashCampaignAudience,
  ]);
  // 产品拍板 D5: the campaign modal's paid 立即使用 performs the REAL switch —
  // daemon execution mode + Cloud agent (amr) + DeepSeek V4 Flash — through
  // the same persistence callbacks the InlineModelSwitcher writes through.
  // Mode must flip first: a paid user still on BYOK (`mode === 'api'`) would
  // otherwise keep the BYOK provider even after agent/model ids change.
  const applyDeepSeekCampaignModel = useCallback(
    (agentId: string, modelId: string) => {
      onModeChange('daemon');
      onAgentChange(agentId);
      onAgentModelChange(agentId, { model: modelId });
    },
    [onAgentChange, onAgentModelChange, onModeChange],
  );
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

  // Project collection surfaces have no legacy page-level tracker. Community
  // is conditionally mounted and tracks its own visit; always-mounted library
  // surfaces receive an explicit isActive prop below.
  useEffect(() => {
    if (view === 'drafts') trackPageView(analytics.track, { page_name: 'drafts' });
    else if (view === 'all-projects') trackPageView(analytics.track, { page_name: 'all_projects' });
  }, [analytics.track, view]);

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

  function useSkillFromLibrary(skill: SkillSummary) {
    setHomePromptHandoff(createSkillUseHandoff(Date.now(), skill));
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

  // The frosted top edge exists to melt content that scrolls UP under the tab
  // strip. At rest nothing is under it, but it blurred anyway — and because
  // `.entry-main__inner` starts its content at 12px, every page's h2 sat inside
  // that 32px band and read as a smudged dark block behind the title
  // (acceptance #28). Gate the blur on actually being scrolled.
  useEffect(() => {
    const scrollContainer = entryMainScrollRef.current;
    if (!scrollContainer) return;
    const sync = () => {
      scrollContainer.classList.toggle('is-scrolled', scrollContainer.scrollTop > 0);
    };
    sync();
    scrollContainer.addEventListener('scroll', sync, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', sync);
  }, [view]);

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
        // No user-typed name exists yet — mark it `generated` (the same tag
        // `handleCreateProjectFromDesignSystem` and the New Project panel's
        // blank/no-name path use) so `canAutoRenameProjectFromPrompt` stays
        // eligible once the user's first in-project prompt or the agent's
        // own generated title arrives. Without this the project is stuck at
        // "未命名" forever: this rail (the Drafts / All-projects empty-state
        // "创建" button) is the only reachable way to open a truly metadata-
        // less blank project, and every other create path already tags its
        // fallback name with a `nameSource` the rename gate recognizes.
        metadata: { kind: 'other', nameSource: 'generated' },
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
  // projectKind='other', so the agent infers the task type and asks only
  // when the brief cannot be routed reliably.
  async function handlePluginLoopSubmit(payload: PluginLoopSubmit) {
    // Open Design Cloud pre-run balance gate: hard blocks (empty wallet or
    // signed out) and the soft low-balance reminder both fire BEFORE the
    // project is created, so the dialog appears right here on the home page
    // and the composer keeps its draft. In-project sends are gated separately
    // in ProjectView.handleSend.
    let amrGatePrecheckWitness: AmrBalanceGateScope | undefined;
    if (config.mode === 'daemon' && config.agentId === 'amr') {
      // Awaiting the wallet or either dialog can outlive a workspace switch.
      // Re-run once against the latest exact workspace/member authority; if it
      // changes again, fail closed instead of reusing a stale decision.
      for (let workspaceAttempt = 0; workspaceAttempt < 2; workspaceAttempt += 1) {
        const gateScope = amrBalanceGateScopeForWorkspaceContext(
          workspaceContextRef.current,
        );
        let gate = await checkAmrBalanceGate(gateScope);
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
          gate = await checkAmrBalanceGate(gateScope);
        }
        if (gate.kind === 'unavailable') return 'blocked' as const;
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
        const currentScope = amrBalanceGateScopeForWorkspaceContext(
          workspaceContextRef.current,
        );
        if (!amrBalanceGateScopesMatch(gateScope, currentScope)) continue;
        amrGatePrecheckWitness = gateScope;
        break;
      }
      if (!amrGatePrecheckWitness) {
        return 'blocked' as const;
      }
    }
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
      ...(amrGatePrecheckWitness ? { amrGatePrecheckWitness } : {}),
    });
  }

  /**
   * Re-read every workspace surface because onboarding just ended.
   *
   * Onboarding is where a signed-out user signs IN, so the workspace context
   * the shell resolved before it is stale by definition. Without this the rail
   * came back in its signed-out shape — no workspace switcher, no 草稿 / 全部项目
   * / Workspace 设置, and the "sign in to Open Design Cloud" callout still in
   * the bottom-left corner (#140) — until a focus or the 30s poll happened to
   * re-read it. `CloudSignInTip` fires the same three after its own sign-in.
   *
   * EVERY exit from onboarding must call this. It used to live inline in
   * `finishOnboarding` only, so the "go build a design system" door left the
   * shell on the stale signed-out context.
   */
  function refreshWorkspaceSurfacesAfterOnboarding() {
    notifyWorkspaceContextRefresh();
    notifyWorkspaceBillingRefresh();
    notifyTeamProjectsChanged();
  }

  function finishOnboarding() {
    onCompleteOnboarding();
    refreshWorkspaceSurfacesAfterOnboarding();
    changeView('home');
  }

  // #5517: the GitHub/Discord/X/mail badges and the settings chip leave the
  // rail footer. Socials live in the account menu, while settings stays
  // reachable through either the account menu or the signed-out rail item.
  //
  // The updater host has no topbar to live in any more (the rail toggle is the
  // pinned Home tab in the workspace tabs bar), so the rail owns it: it renders
  // in a right-aligned strip just above the account row, falling back to the
  // rail footer in the signed-out shell. `EntryNavRail` decides which — the
  // shell only supplies the host, which renders nothing until the real updater
  // reports a downloaded, unopened installer.
  const updaterSlot = (
    <UpdaterPopup
      allowSilentUpdates={config.allowSilentUpdates}
      silentUpdatePreferenceReady={daemonAppConfigReady}
      onAllowSilentUpdatesChange={
        onSilentUpdatePreferenceChange
          ?? ((allowSilentUpdates) => onConfigPersist({ ...config, allowSilentUpdates }))
      }
    />
  );

  // #5517 removes the entry top-bar settings cog: the nav-rail account menu owns
  // the settings entry (EntryNavRail onOpenSettings), so the top strip no longer
  // carries a redundant one.


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
            onAmrLoginStatusChange={onAmrLoginStatusChange}
            onFinish={finishOnboarding}
          />
        </main>
      </div>
    );
  }

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
      <div
        className={`entry${railOpen ? ' entry--rail-open' : ''}`}
        // The team/local shell is a labeled Manus-style rail, so widen the rail
        // track (the base 56px icon-rail clips the labels + team affordances).
        style={{ ['--entry-rail-width' as string]: '236px' }}
      >
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
          onOpenSearch={() => setProjectSearchOpen(true)}
          open={railOpen}
          context={workspaceContext}
          billing={workspaceBilling}
          balanceUsd={workspaceBalanceUsd}
          onOpenSettings={onOpenSettings}
          onInvite={() => changeView('members')}
          onSignInCloud={() => navigate({ kind: 'home', view: 'onboarding' })}
          onSignedOut={onSignedOut}
          updaterSlot={updaterSlot}
          // A loading or unavailable workspace read is not proof of sign-out.
          // Keep the account slot neutral until Cloud answers successfully;
          // only a successful null context (or known local sign-out) may show
          // the sign-in card.
          footerNotice={
            accountFooterState === 'syncing'
              ? <RailAccountSyncTip />
              : accountFooterState === 'sign-in'
                ? <CloudSignInTip />
                : null
          }
        />
        {projectSearchOpen ? (
          <ProjectSearchModal
            // The same merged catalog as the All Projects grid (own + team-
            // shared cards), opened through the pull-first handler so a shared
            // project the member has not pulled yet still opens.
            projects={allProjectsList}
            workspaceContext={workspaceContext}
            onOpenProject={handleOpenAllProjects}
            onClose={() => setProjectSearchOpen(false)}
          />
        ) : null}
        <main className="entry-main entry-main--scroll" ref={entryMainScrollRef}>
          {/* #5517: no entry topbar. The rail toggle is the pinned Home tab in
              the workspace tabs bar (entryRailBridge), the updater popup host
              lives in the rail footer, and everything below is fixed-position
              or portalled so it occupies no layout space here. */}
          <WhatsNewPopup active={view === 'home'} />
          {view === 'home'
            && deepSeekV4FlashCampaignAudience !== 'unknown'
            && typeof document !== 'undefined'
            ? createPortal(
              <button
                type="button"
                className="entry-deepseek-campaign-badge"
                onClick={openDeepSeekCampaignPricing}
                aria-label={t('campaign.deepseekV4Flash.workbenchBadgeAria')}
                data-testid="deepseek-campaign-pricing-badge"
              >
                <span>{t('campaign.deepseekV4Flash.workbenchBadge')}</span>
                <Icon name="arrow-right" size={13} />
              </button>,
              document.body,
            )
            : null}
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
          <div
            className={[
              'entry-main__inner',
              view === 'home' ? '' : 'entry-main__inner--wide',
            ].filter(Boolean).join(' ')}
          >
            <div className="entry-main__view-home" data-testid="entry-view-home" data-active={view === 'home' ? 'true' : 'false'} {...inactiveViewProps(view === 'home')}>
              <HomeView
                isActive={view === 'home'}
                projects={homeProjectsList}
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
                isSharedProject={isSharedProject}
                onProjectShared={markProjectShared}
                onProjectShareFailed={markProjectShareFailed}
                onProjectUnshared={markProjectUnshared}
                projectOwnerMemberIds={teamProjectOwnerMemberIds}
                skills={skills}
                skillsLoading={skillsLoading}
                connectors={connectors}
                promptTemplates={promptTemplates}
                executionSwitcher={view === 'home' ? homeExecutionSwitcher : undefined}
                artifactUpgradeSlot={artifactUpgradeSlot}
                deepSeekV4FlashCampaignAudience={deepSeekV4FlashCampaignAudience}
                onDeepSeekV4FlashCampaignUseNow={applyDeepSeekCampaignModel}
                deepSeekV4FlashCampaignMetricsConsent={config.telemetry?.metrics === true}
                deepSeekV4FlashCampaignInstallationId={config.installationId ?? null}
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
              <ExtensionsMarketplace
                isActive={view === 'plugins'}
                onCreatePlugin={startPluginAuthoring}
                onUsePlugin={usePluginFromLibrary}
                onUseSkill={useSkillFromLibrary}
              />
            </div>
            <div data-testid="entry-view-design-systems" data-active={view === 'design-systems' ? 'true' : 'false'} {...inactiveViewProps(view === 'design-systems')}>
              {designSystemsLoading ? (
                <div className="entry-section">
                  <DesignSystemsTab
                    isActive={view === 'design-systems'}
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
                  <DesignSystemsTab
                    isActive={view === 'design-systems'}
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
            {view === 'community' ? (
              <CommunityView
                onRemixTemplate={({ templateId, prompt }) => {
                  // Remix carries the template's PROJECT along, not just its
                  // prompt: duplicate the plugin's example artifact into a
                  // fresh project (the same daemon flow as the plugin
                  // gallery's 创建副本), seed the composer with the template
                  // prompt for review, then open it on the copied entry file.
                  // Templates without a duplicable artifact fall back to the
                  // old prompt-only project.
                  void (async () => {
                    const name =
                      summarizeProjectNameFromPrompt(prompt) || t('common.untitled');
                    try {
                      // One resolved authority for BOTH requests: the create
                      // binds the copied project to this workspace, and the
                      // seed patch is then authorized against that same
                      // binding. A headerless create is read by the daemon as a
                      // legacy caller and leaves the project bound to no
                      // workspace at all, which is what kept remixed projects
                      // out of the member's own 草稿 list.
                      const writeContext =
                        resolvedWorkspaceContextForWrite(workspaceContextState);
                      const result = await duplicatePluginAsProject(
                        templateId,
                        { name },
                        writeContext,
                      );
                      const seeded = await patchProject(
                        result.projectId,
                        { pendingPrompt: prompt },
                        writeContext,
                      );
                      if (!seeded) {
                        // The project itself exists and is bound — only the
                        // prompt seed was refused. Keep the user on it
                        // (retrying through the catch below would leave the
                        // copy orphaned and create a second, empty project)
                        // and surface the dropped seed instead of discarding
                        // it silently.
                        console.error('Community remix: could not seed the template prompt.');
                      }
                      await Promise.resolve(onOpenProject(result.projectId, result.relPath));
                    } catch {
                      await onCreateProject({
                        name,
                        skillId: null,
                        designSystemId: null,
                        metadata: { kind: 'other', nameSource: 'prompt' },
                        pendingPrompt: prompt,
                      });
                    }
                  })();
                }}
                onUsePrompt={(prompt) => {
                  // Seed the Home composer with the template's starting prompt,
                  // then switch to Home to review + send it (keep in sync with
                  // the standalone /community branch in App.tsx).
                  seedHomeComposerPrompt(prompt);
                  changeView('home');
                }}
                // The gallery card's full details modal routes Use through the
                // same Home hand-off the plugin library uses, so the plugin
                // becomes the composer's active driver instead of only seeding
                // prompt text.
                onUsePlugin={usePluginFromLibrary}
              />
            ) : null}
            {/* Team destinations — the entry shell owns the nav frame only; each
                view is provided by another lane (B = members/board, D = team
                project spaces / workspace settings), rendered as a placeholder
                until those land. */}
            {view === 'drafts' ? (
              projectsLoading ? (
                <div className="entry-section">
                  <CenteredLoader label={t('common.loading')} />
                </div>
              ) : draftProjectsList.length === 0 ? (
                <EntryBlankState
                  heading={t('entry.navDrafts')}
                  description={t('entry.blankDraftsDescription')}
                  actionLabel={t('entry.blankCreate')}
                  onCreate={() => startBlankProjectFromRail()}
                />
              ) : (
                <div className="entry-section">
                  <RecentProjectsStrip
                    projects={draftProjectsList}
                    designSystems={designSystems}
                    limit={1000}
                    heading={t('entry.navDrafts')}
                    space="drafts"
                    isSharedProject={isSharedProject}
                    onProjectShared={markProjectShared}
                    onProjectShareFailed={markProjectShareFailed}
                    onProjectUnshared={markProjectUnshared}
                    projectOwnerMemberIds={teamProjectOwnerMemberIds}
                    onOpen={(id) => onOpenProject(id)}
                    onViewAll={() => {}}
                    onDelete={onDeleteProject}
                    onRename={onRenameProject}
                  />
                </div>
              )
            ) : null}
            {view === 'all-projects' ? (
              // The all-projects grid is fed by `teamProjects`, which has its own
              // loading state and restarts from empty whenever the entry shell
              // remounts (e.g. returning from a project). Gating only on
              // `projectsLoading` flashed the "还没有团队项目" empty state during
              // that team read; wait for BOTH before deciding the grid is empty.
              projectsLoading || teamProjects.loading ? (
                <div className="entry-section">
                  <CenteredLoader label={t('common.loading')} />
                </div>
              ) : allProjectsList.length === 0 ? (
                <EntryBlankState
                  heading={t('entry.navAllProjects')}
                  description={t('entry.blankAllProjectsDescription')}
                  actionLabel={t('entry.blankCreate')}
                  onCreate={() => startBlankProjectFromRail()}
                />
              ) : (
                <div className="entry-section">
                  <RecentProjectsStrip
                    projects={allProjectsList}
                    designSystems={designSystems}
                    limit={1000}
                    heading={t('entry.navAllProjects')}
                    space="team"
                    isSharedProject={isSharedProject}
                    onProjectShared={markProjectShared}
                    onProjectShareFailed={markProjectShareFailed}
                    onProjectUnshared={markProjectUnshared}
                    projectOwnerMemberIds={teamProjectOwnerMemberIds}
                    openingProjectId={pullingProjectId}
                    onOpen={handleOpenAllProjects}
                    onViewAll={() => {}}
                    onDelete={onDeleteProject}
                    onRename={onRenameProject}
                    canAssignInviteRoles={workspaceContext?.permissions.canInviteMembers === true}
                    canManageProjectCollection={workspaceContext?.permissions.canShareProjects === true}
                  />
                </div>
              )
            ) : null}
            {view === 'members' ? (
              <TeamSlotPlaceholder icon="users" title={t('entry.navMembers')} />
            ) : null}
            {view === 'board' ? (
              <TeamSlotPlaceholder icon="kanban" title={t('entry.navBoard')} />
            ) : null}
            {view === 'workspace-settings' ? (
              <TeamSlotPlaceholder icon="settings" title={t('entry.navWorkspaceSettings')} />
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
  onAmrLoginStatusChange,
  onFinish,
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
    choice: { model?: string; reasoning?: string; serviceTier?: string },
  ) => void;
  onApiProtocolChange: (protocol: ApiProtocol) => void;
  onApiModelChange: (model: string) => void;
  onConfigPersist: (cfg: AppConfig) => Promise<void> | void;
  onRefreshAgents: () => Promise<AgentInfo[]> | AgentInfo[];
  onAmrLoginStatusChange?: (status: VelaLoginStatus | null) => void;
  onFinish: () => void;
}) {
  const t = useT();
  const analytics = useAnalytics();
  const [step, setStep] = useState(0);
  const [runtime, setRuntime] = useState<'amr' | 'local' | 'byok' | null>(null);
  const [modelSource, setModelSource] = useState<'amr' | 'local' | 'byok'>('amr');
  const modelSourceOptionRefs = useRef<
    Record<'amr' | 'local' | 'byok', HTMLButtonElement | null>
  >({ amr: null, local: null, byok: null });
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [cliScanStatus, setCliScanStatus] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [amrStatus, setAmrStatus] = useState<VelaLoginStatus | null>(null);
  // Initial login status fetch has settled, whether signed in or not. The
  // cloud landing uses this to avoid flashing "Sign in" before flipping to
  // "Continue" for already-authenticated users.
  const [amrStatusResolved, setAmrStatusResolved] = useState(false);
  const [amrLoginPending, setAmrLoginPending] = useState(false);
  const [amrLoginCancelPending, setAmrLoginCancelPending] = useState(false);
  const passiveReauthCompletedRef = useRef(false);
  const [amrLoginError, setAmrLoginError] = useState<string | null>(null);
  // Local dismissal for the cloud landing's activation-retry card only (its
  // own × close, distinct from "取消登录" which cancels the whole vela login).
  // Reset whenever a login attempt isn't in flight, so a canceled-then-retried
  // attempt shows the hint again instead of staying hidden from a prior dismiss.
  const [activationHintClosed, setActivationHintClosed] = useState(false);
  useEffect(() => {
    if (!amrLoginPending) setActivationHintClosed(false);
  }, [amrLoginPending]);
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
  const agentRevealTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const cliScanTokenRef = useRef(0);
  const cliScanTelemetryRef = useRef<{
    token: number;
    startedAt: number;
    onboardingSessionId: string;
  } | null>(null);
  const cliRefreshPendingTokenRef = useRef<number | null>(null);
  const amrLoginPollCancelledRef = useRef(false);
  const amrLoginStartPendingRef = useRef(false);
  const amrLoginCancelRequestedRef = useRef(false);
  const amrAuthAttemptIdRef = useRef<string | null>(null);
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
      (
        provider.baseUrl === (config.apiProviderBaseUrl ?? config.baseUrl) ||
        (apiProtocol === 'azure' && provider.baseUrl === '' && Boolean(config.baseUrl?.trim()))
      ),
  ) ?? null;
  const availableCliAgents = agents.filter((agent) => agent.available && agent.id !== 'amr');
  const visibleAgents = availableCliAgents.filter((agent) => visibleAgentIds.includes(agent.id));
  const amrSignedIn = amrStatus?.loggedIn === true;
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
  const runtimeSetupStep = step === 2;
  const byokConnectionVerified =
    visibleProviderTestState.status === 'done' && visibleProviderTestState.result.ok;
  const localConnectionVerified =
    visibleAgentTestState.status === 'done' && visibleAgentTestState.result.ok;
  const connectStepRuntimeReady =
    (runtime === 'local' && selectedAgent !== null && localConnectionVerified) ||
    (runtime === 'byok' && byokConnectionVerified);
  const connectStepBlocked = runtimeSetupStep && !connectStepRuntimeReady;
  const connectGateReason: 'no_runtime' | 'local_agent_unavailable' | 'byok_unverified' | null =
    !runtimeSetupStep
      ? null
      : connectStepBlocked
        ? runtime === 'local'
          ? 'local_agent_unavailable'
          : runtime === 'byok'
            ? 'byok_unverified'
            : 'no_runtime'
        : null;
  const connectGateTooltip =
    connectGateReason === 'local_agent_unavailable'
      ? t('settings.onboardingGateTooltipLocal')
      : connectGateReason === 'byok_unverified'
        ? t('settings.onboardingGateTooltipByok')
        : connectGateReason === 'no_runtime'
          ? t('settings.onboardingGateTooltipNoRuntime')
          : null;

  const hasRestorableModelSourceConfig =
    config.mode === 'api'
      ? Boolean(config.apiKey.trim() && config.baseUrl.trim() && config.model.trim())
      : config.agentId === 'amr'
        || Boolean(
          config.agentId
          && agents.some((agent) => agent.id === config.agentId && agent.available),
        );

  useEffect(() => {
    return () => {
      amrLoginPollCancelledRef.current = true;
      agentRevealTimersRef.current.forEach((timer) => clearTimeout(timer));
      agentRevealTimersRef.current = [];
    };
  }, []);

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
    // Fetch login status on mount in parallel with agent discovery so the
    // landing CTA settles quickly for already-authenticated users.
    let cancelled = false;
    void fetchVelaLoginStatus()
      .then((next) => {
        if (!cancelled && next) {
          setAmrStatus(next);
          onAmrLoginStatusChange?.(next);
        }
      })
      .finally(() => {
        if (!cancelled) setAmrStatusResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [onAmrLoginStatusChange]);

  useEffect(() => {
    if (
      !amrStatusResolved
      || !amrSignedIn
      || config.onboardingCompleted !== true
      || !hasRestorableModelSourceConfig
      || (config.mode === 'daemon' && config.agentId !== 'amr' && agentsLoading)
      || passiveReauthCompletedRef.current
    ) {
      return;
    }
    passiveReauthCompletedRef.current = true;
    clearOnboardingSessionId();
    onFinish();
  }, [
    agentsLoading,
    amrSignedIn,
    amrStatusResolved,
    config.agentId,
    config.mode,
    config.onboardingCompleted,
    hasRestorableModelSourceConfig,
    onFinish,
  ]);

  useEffect(() => {
    if (runtime === 'amr') return;
    amrLoginPollCancelledRef.current = true;
    setAmrLoginPending(false);
    setAmrLoginCancelPending(false);
  }, [runtime]);

  // Onboarding step exposure for identity, source choice, and optional setup.
  //
  // We do NOT clear on unmount: route changes can remount the shell
  // during first-run setup. Completion clears inline; abandoned sessions
  // clear on sessionStorage tab close.
  const onboardingSessionIdRef = useRef<string>('');
  if (!onboardingSessionIdRef.current && config.onboardingCompleted !== true) {
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
  // click. The lifecycle guard keeps rapid repeated completion actions from
  // double-firing the terminal event.
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
    if (stepIdx === 0) return { area: 'runtime', stepIndex: '1', stepName: 'connect' };
    if (stepIdx === 1) {
      return { area: 'model_source', stepIndex: '2', stepName: 'model_source' };
    }
    return { area: 'runtime_setup', stepIndex: '3', stepName: 'runtime_setup' };
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
      runtimeType?: TrackingOnboardingRuntimeType;
    } = {},
  ): void {
    if (lifecycleReportedRef.current) return;
    const onboardingSessionId = onboardingSessionIdRef.current;
    if (!onboardingSessionId) return;
    lifecycleReportedRef.current = true;
    const info = stepInfo(step);
    trackOnboardingCompleteResult(analytics.track, {
      page_name: 'onboarding',
      area: 'onboarding',
      result,
      exit_step_name: info.stepName,
      completion_type: completionType,
      runtime_type: extra.runtimeType ?? currentRuntimeType(),
      has_about_you: false,
      has_design_system_request: false,
      source_count: 0,
      ...(extra.errorCode ? { error_code: extra.errorCode } : {}),
      duration_ms: Math.max(0, Date.now() - onboardingStartedAtRef.current),
      onboarding_session_id: onboardingSessionId,
    });
  }
  const protocolProviders = KNOWN_PROVIDERS.filter((provider) => provider.protocol === apiProtocol);
  const hasProtocolOwnedEmptyProvider =
    apiProtocol === 'azure' && protocolProviders.some((provider) => provider.baseUrl === '');
  const byokProviderOptions = [
    ...(hasProtocolOwnedEmptyProvider
      ? []
      : [{ value: '', label: t('settings.customProvider') }]),
    ...protocolProviders.map((provider) => ({
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
      current.step !== 2 ||
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
    emitOnboardingClick('back', 'back');
    clearAgentRevealTimers();
    setRuntime(null);
    setStep(1);
  }

  function completeStreamlinedOnboarding(
    runtimeType: TrackingOnboardingRuntimeType,
  ): void {
    emitOnboardingComplete('completed', 'completed_without_design_system', {
      runtimeType,
    });
    clearOnboardingSessionId();
    onFinish();
  }

  function continueAfterCloudSignIn(): void {
    if (config.onboardingCompleted === true && hasRestorableModelSourceConfig) {
      if (passiveReauthCompletedRef.current) return;
      passiveReauthCompletedRef.current = true;
      clearOnboardingSessionId();
      onFinish();
      return;
    }
    setStep(1);
  }

  function handleModelSourceKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentSource: 'amr' | 'local' | 'byok',
  ): void {
    const sources = ['amr', 'local', 'byok'] as const;
    const currentIndex = sources.indexOf(currentSource);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % sources.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + sources.length) % sources.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = sources.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextSource = sources[nextIndex];
    if (!nextSource) return;
    setModelSource(nextSource);
    modelSourceOptionRefs.current[nextSource]?.focus();
  }

  function continueWithModelSource(): void {
    if (modelSource === 'amr') {
      emitOnboardingClick('amr_cloud', 'select_runtime', {
        runtime_type: 'amr_cloud',
        is_recommended: true,
      });
      setRuntime('amr');
      onModeChange('daemon');
      onAgentChange('amr');
      completeStreamlinedOnboarding('amr_cloud');
      return;
    }

    if (modelSource === 'local') {
      emitOnboardingClick('local_coding_agent', 'select_runtime', {
        runtime_type: 'local_cli',
      });
      setRuntime('local');
      void scanCliAgents({ preferExisting: true });
      setStep(2);
      return;
    }

    emitOnboardingClick('byok', 'select_runtime', { runtime_type: 'byok' });
    setRuntime('byok');
    setStep(2);
  }
  async function handlePrimaryAction() {
    if (connectStepBlocked) return;
    if (runtime === 'local' && selectedAgent) {
      await onConfigPersist({
        ...config,
        mode: 'daemon',
        agentId: selectedAgent.id,
      });
      emitOnboardingClick('continue', 'continue', { runtime_type: 'local_cli' });
      completeStreamlinedOnboarding('local_cli');
      return;
    }
    if (runtime === 'byok') {
      await onConfigPersist({ ...config, mode: 'api' });
      emitOnboardingClick('continue', 'continue', { runtime_type: 'byok' });
      completeStreamlinedOnboarding('byok');
      return;
    }
  }

  // Cloud login establishes identity only. The model source is deliberately
  // chosen on the following screen so signing in never overwrites a restored
  // Local/BYOK configuration.
  async function handleCloudSignIn() {
    if (amrLoginPending || amrLoginCancelPending) return;
    const cardAttribution = recordAmrEntry(
      analytics.track,
      'onboarding_amr_card',
      new Date(),
      { metricsConsent: config.telemetry?.metrics === true },
    );
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
    amrLoginCancelRequestedRef.current = false;
    setAmrLoginError(null);
    setAmrLoginPending(true);
    try {
      const currentStatus = await fetchVelaLoginStatus();
      if (amrLoginPollCancelledRef.current) return;
      if (currentStatus) {
        setAmrStatus(currentStatus);
        onAmrLoginStatusChange?.(currentStatus);
      }
      if (currentStatus?.loggedIn) {
        continueAfterCloudSignIn();
        return;
      }
      if (amrLoginPollCancelledRef.current) return;
      const provisionalAuthAttemptId = beginAmrAuthTracking(
        attribution,
        Date.now(),
      );
      amrAuthAttemptIdRef.current = provisionalAuthAttemptId;
      const odDeviceId = amrHandoffDeviceId({
        metricsConsent: config.telemetry?.metrics === true,
        resolvedDeviceId: getResolvedDeviceId(),
        installationId: config.installationId,
      });
      amrLoginStartPendingRef.current = true;
      const loginResult = await startVelaLogin(
        attribution,
        odDeviceId,
        provisionalAuthAttemptId,
      ).finally(() => {
        amrLoginStartPendingRef.current = false;
      });
      const authAttemptId = reconcileAmrAuthAttemptId(
        provisionalAuthAttemptId,
        loginResult.authAttemptId,
        { joinedExisting: loginResult.alreadyRunning === true },
      );
      amrAuthAttemptIdRef.current = authAttemptId;
      if (loginResult.ok || loginResult.alreadyRunning) {
        confirmAmrAuthTracking(analytics.track, authAttemptId, {
          joinedExisting: loginResult.alreadyRunning === true,
        });
      }
      observeAmrAuthTracking(analytics.track, loginResult, authAttemptId);
      if (
        amrLoginPollCancelledRef.current
        || amrLoginCancelRequestedRef.current
      ) {
        if (loginResult.ok || loginResult.alreadyRunning) {
          const cancelResult = await cancelVelaLogin(authAttemptId);
          if (!cancelResult.ok) {
            console.error('[amr-login] cancelVelaLogin failed', cancelResult);
            amrLoginCancelRequestedRef.current = false;
            setAmrLoginCancelPending(false);
            setAmrLoginError(t('settings.amrLoginErrorCompact'));
            return;
          }
          if (cancelResult.canceled !== true) {
            const nextStatus = await fetchVelaLoginStatus();
            if (nextStatus) {
              setAmrStatus(nextStatus);
              if (nextStatus.authAttemptId) {
                amrAuthAttemptIdRef.current = nextStatus.authAttemptId;
              }
            }
            amrLoginCancelRequestedRef.current = false;
            amrLoginPollCancelledRef.current = false;
            setAmrLoginCancelPending(false);
            if (!nextStatus?.loginInFlight) return;
          } else {
            resolveAmrAuthTracking(analytics.track, 'cancelled', undefined, {
              authAttemptId,
            });
            closeAmrActivationWindowBestEffort();
            notifyAmrLoginStatusChanged('login-canceled');
            amrLoginCancelRequestedRef.current = false;
            amrLoginPollCancelledRef.current = true;
            setAmrLoginCancelPending(false);
            setAmrStatus((current) => (
              current
                ? { ...current, loggedIn: false, loginInFlight: false, user: null }
                : current
            ));
            return;
          }
        } else {
          resolveAmrAuthTracking(analytics.track, 'cancelled', undefined, {
            authAttemptId,
          });
          if (amrLoginCancelRequestedRef.current) {
            amrLoginCancelRequestedRef.current = false;
            amrLoginPollCancelledRef.current = true;
            setAmrLoginCancelPending(false);
            setAmrStatus((current) => (
              current
                ? { ...current, loggedIn: false, loginInFlight: false, user: null }
                : current
            ));
          }
          return;
        }
      }
      if (!loginResult.ok && !loginResult.alreadyRunning) {
        resolveAmrAuthTracking(analytics.track, 'failed', 'spawn_failed', {
          authAttemptId,
        });
        console.error('[amr-login] startVelaLogin failed', loginResult);
        setAmrLoginError(loginResult.error || t('settings.amrLoginErrorCompact'));
        return;
      }
      if (await pollAmrLoginCompletion()) {
        continueAfterCloudSignIn();
      }
    } finally {
      setAmrLoginPending(false);
    }
  }

  async function handleCancelAmrLogin() {
    if (!amrLoginPending || amrLoginCancelPending) return;
    const loginStartPending = amrLoginStartPendingRef.current;
    const authAttemptId = amrAuthAttemptIdRef.current;
    setAmrLoginError(null);
    setAmrLoginCancelPending(true);
    if (!authAttemptId) {
      amrLoginPollCancelledRef.current = true;
      amrLoginCancelRequestedRef.current = false;
      setAmrLoginCancelPending(false);
      setAmrLoginPending(false);
      return;
    }
    const result = await cancelVelaLogin(authAttemptId);
    if (!result.ok) {
      setAmrLoginCancelPending(false);
      setAmrLoginPending(false);
      setAmrLoginError(t('settings.amrLoginErrorCompact'));
      return;
    }
    if (result.canceled !== true) {
      const nextStatus = await fetchVelaLoginStatus();
      if (nextStatus) {
        setAmrStatus(nextStatus);
        if (nextStatus.authAttemptId) {
          amrAuthAttemptIdRef.current = nextStatus.authAttemptId;
        }
      }
      if (loginStartPending && nextStatus?.loginInFlight !== true) {
        amrLoginCancelRequestedRef.current = true;
        return;
      }
      setAmrLoginCancelPending(false);
      if (!nextStatus?.loginInFlight) {
        setAmrLoginPending(false);
      }
      return;
    }
    setAmrLoginCancelPending(false);
    amrLoginPollCancelledRef.current = true;
    if (authAttemptId) {
      resolveAmrAuthTracking(analytics.track, 'cancelled', undefined, {
        authAttemptId,
      });
    }
    closeAmrActivationWindowBestEffort();
    setAmrStatus((current) => (
      current
        ? { ...current, loggedIn: false, loginInFlight: false, user: null }
        : current
    ));
    setAmrLoginPending(false);
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
      if (nextStatus) {
        setAmrStatus(nextStatus);
        onAmrLoginStatusChange?.(nextStatus);
      }
      const authAttemptId = amrAuthAttemptIdRef.current;
      if (nextStatus && authAttemptId) {
        observeAmrAuthTracking(analytics.track, nextStatus, authAttemptId);
      }
      const outcome = amrLoginPollOutcome(nextStatus, startedAt);
      if (outcome === 'signed-in') {
        if (authAttemptId) {
          resolveAmrAuthTracking(analytics.track, 'success', undefined, {
            authAttemptId,
            signedInUserId: nextStatus?.user?.id ?? null,
          });
        }
        notifyAmrLoginStatusChanged();
        // Onboarding may sit on this step for a while before finishOnboarding
        // fires refreshWorkspaceSurfacesAfterOnboarding() — without firing
        // these here too, Home's rail can render in its stale signed-out
        // shape (still showing the "sign in to Open Design Cloud" callout)
        // for however long that gap lasts. Mirrors CloudSignInTip's own
        // finishSignedIn().
        notifyWorkspaceContextRefresh();
        notifyWorkspaceBillingRefresh();
        notifyTeamProjectsChanged();
        return true;
      }
      if (outcome === 'stopped' || outcome === 'timed-out') {
        if (outcome === 'timed-out') {
          if (authAttemptId) {
            resolveAmrAuthTracking(analytics.track, 'timeout', 'login_timeout', {
              authAttemptId,
            });
            void cancelVelaLogin(authAttemptId);
          }
          console.error('[amr-login] poll timed out waiting for a signed-in status', { nextStatus });
        } else {
          if (authAttemptId) {
            resolveAmrAuthTracking(analytics.track, 'failed', 'login_stopped', {
              authAttemptId,
            });
          }
          console.error('[amr-login] poll loop stopped without a terminal status', { nextStatus });
        }
        setAmrLoginError(t('settings.amrLoginErrorCompact'));
        return false;
      }
    }
    return false;
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
    if (runtime !== 'byok' || !runtimeSetupStep) return;
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
    if (runtime !== 'byok' || !runtimeSetupStep) return;
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

  const primaryActionLabel = t('settings.onboardingContinue');

  // Step 1 is identity only: every user signs into Open Design Cloud before
  // choosing Hosted, Local, or BYOK on the next screen.
  if (step === 0) {
    const cloudBusy = amrLoginPending;
    const amrStatusResolving = !amrStatusResolved;
    return (
      <section
        className="onboarding-view onboarding-view--cloud"
        aria-label={t('settings.welcomeTitle')}
      >
        <div className="onboarding-cloud__pane">
          <div className="onboarding-cloud__center">
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
                  recordAmrEntry(
                    analytics.track,
                    'onboarding_amr_sign_in_continue',
                    new Date(),
                    {
                      metricsConsent: config.telemetry?.metrics === true,
                      reuseExistingFrom: ['onboarding_amr_card'],
                    },
                  );
                  continueAfterCloudSignIn();
                  return;
                }
                void handleCloudSignIn();
              }}
              disabled={cloudBusy || amrLoginCancelPending || amrStatusResolving}
              aria-busy={cloudBusy || amrStatusResolving ? true : undefined}
            >
              <Icon name="log-in" size={17} />
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
            {/* Manual device-auth fallback, mirroring Settings' AmrLoginPill:
                vela auto-opens the browser, but when that fails silently (e.g.
                corp-managed hosts) the pending login otherwise looks like a
                dead button — surface the activation link the status poll
                already carries. */}
            {cloudBusy && amrStatus?.activationUrl && !activationHintClosed ? (
              <div className="amr-login-activation onboarding-cloud__activation" role="group">
                <span className="amr-login-activation__hint">
                  {amrStatus.browserOpenFailed
                    ? t('settings.amrActivationBrowserFailed')
                    : t('settings.amrActivationHint')}
                </span>
                <div className="amr-login-activation__actions">
                  <a
                    className="amr-login-activation__open"
                    href={amrStatus.activationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('settings.amrActivationOpen')}
                  </a>
                  <button
                    type="button"
                    className="onboarding-cloud__activation-dismiss"
                    onClick={() => setActivationHintClosed(true)}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
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
            ) : null}
          </div>
          <footer className="onboarding-cloud__footer">
            <LanguageMenu placement="up" align="start" />
            <span>
              © {new Date().getFullYear()} Open Design · {t('settings.onboardingCloudRights')}
            </span>
          </footer>
        </div>
        <div className="onboarding-cloud__art" aria-hidden="true">
          <img src="/onboarding/onboarding-cloud-art.webp" alt="" />
        </div>
      </section>
    );
  }

  if (step === 1) {
    return (
      <section
        className="onboarding-view onboarding-view--cloud"
        aria-label={t('settings.onboardingExecutionTitle')}
      >
        <div className={`onboarding-cloud__pane ${onboardingSourceStyles.pane}`}>
          <div className={`onboarding-cloud__center ${onboardingSourceStyles.center}`}>
            <h1 className="onboarding-cloud__title">
              {t('settings.onboardingExecutionTitle')}
            </h1>
            <p className="onboarding-cloud__body">
              {t('settings.onboardingExecutionBody')}
            </p>
            <div
              className={onboardingSourceStyles.options}
              role="radiogroup"
              aria-label={t('settings.onboardingExecutionTitle')}
            >
              <Button
                ref={(node) => {
                  modelSourceOptionRefs.current.amr = node;
                }}
                variant="subtle"
                role="radio"
                aria-checked={modelSource === 'amr'}
                tabIndex={modelSource === 'amr' ? 0 : -1}
                className={`${onboardingSourceStyles.option} ${
                  onboardingSourceStyles.hostedOption
                } ${modelSource === 'amr' ? onboardingSourceStyles.optionActive : ''}`}
                onClick={() => setModelSource('amr')}
                onKeyDown={(event) => handleModelSourceKeyDown(event, 'amr')}
              >
                <span className={onboardingSourceStyles.optionIcon}>
                  <Icon name="sparkles" size={17} />
                </span>
                <span className={onboardingSourceStyles.optionCopy}>
                  <span className={onboardingSourceStyles.optionHeading}>
                    <strong className={onboardingSourceStyles.optionTitle}>
                      {t('settings.onboardingAmrModelSourceLabel')}
                    </strong>
                    <span className={onboardingSourceStyles.recommendedBadge}>
                      {t('settings.onboardingRecommended')}
                    </span>
                  </span>
                  <span className={onboardingSourceStyles.optionBody}>
                    {t('settings.onboardingAmrCloudBenefitModels')}
                  </span>
                </span>
                <span className={onboardingSourceStyles.radio} aria-hidden="true" />
              </Button>
              <Button
                ref={(node) => {
                  modelSourceOptionRefs.current.local = node;
                }}
                variant="subtle"
                role="radio"
                aria-checked={modelSource === 'local'}
                tabIndex={modelSource === 'local' ? 0 : -1}
                className={`${onboardingSourceStyles.option} ${
                  modelSource === 'local' ? onboardingSourceStyles.optionActive : ''
                }`}
                onClick={() => setModelSource('local')}
                onKeyDown={(event) => handleModelSourceKeyDown(event, 'local')}
              >
                <span className={onboardingSourceStyles.optionIcon}>
                  <Icon name="robot" size={17} />
                </span>
                <span className={onboardingSourceStyles.optionCopy}>
                  <strong className={onboardingSourceStyles.optionTitle}>
                    {t('settings.onboardingLocalTitle')}
                  </strong>
                  <span className={onboardingSourceStyles.optionBody}>
                    {t('settings.onboardingLocalBody')}
                  </span>
                </span>
                <span className={onboardingSourceStyles.radio} aria-hidden="true" />
              </Button>
              <Button
                ref={(node) => {
                  modelSourceOptionRefs.current.byok = node;
                }}
                variant="subtle"
                role="radio"
                aria-checked={modelSource === 'byok'}
                tabIndex={modelSource === 'byok' ? 0 : -1}
                className={`${onboardingSourceStyles.option} ${
                  modelSource === 'byok' ? onboardingSourceStyles.optionActive : ''
                }`}
                onClick={() => setModelSource('byok')}
                onKeyDown={(event) => handleModelSourceKeyDown(event, 'byok')}
              >
                <span className={onboardingSourceStyles.optionIcon}>
                  <Icon name="key" size={17} />
                </span>
                <span className={onboardingSourceStyles.optionCopy}>
                  <strong className={onboardingSourceStyles.optionTitle}>
                    {t('settings.onboardingByokTitle')}
                  </strong>
                  <span className={onboardingSourceStyles.optionBody}>
                    {t('settings.onboardingByokBody')}
                  </span>
                </span>
                <span className={onboardingSourceStyles.radio} aria-hidden="true" />
              </Button>
            </div>
            <button
              type="button"
              className="onboarding-cloud__primary"
              onClick={continueWithModelSource}
            >
              {t('settings.onboardingContinue')}
            </button>
          </div>
          <footer className="onboarding-cloud__footer">
            <LanguageMenu placement="up" align="start" />
            <span>
              © {new Date().getFullYear()} Open Design ·{' '}
              {t('settings.onboardingCloudRights')}
            </span>
          </footer>
        </div>
        <div className="onboarding-cloud__art" aria-hidden="true">
          <img src="/onboarding/onboarding-cloud-art.webp" alt="" />
        </div>
      </section>
    );
  }

  return (
    <section className="onboarding-view" aria-label={t('settings.welcomeTitle')}>
      <div className="onboarding-view__body">
        <div className="onboarding-view__content">
          <div className="onboarding-view__panel">
            <button
              type="button"
              className="onboarding-view__back-to-cloud"
              onClick={handleBackWithTracking}
            >
              <Icon name="chevron-left" size={14} />
              <span>{t('settings.onboardingBack')}</span>
            </button>
            <OnboardingPanelHeader
              title={
                runtime === 'byok'
                  ? t('settings.onboardingByokTitle')
                  : t('settings.onboardingLocalTitle')
              }
              body={
                runtime === 'byok'
                  ? t('settings.onboardingByokBody')
                  : t('settings.onboardingLocalBody')
              }
            />
            <div className="onboarding-view__runtime-stack">
              {runtime === 'local' ? (
                <OnboardingCliSetupPanel
                  agents={visibleAgents}
                  daemonLive={daemonLive}
                  selectedAgentId={config.agentId}
                  selectedAgent={selectedAgent}
                  selectedModel={
                    normalizedSelectedAgentChoice.model
                    ?? defaultAgentModelId(selectedAgent)
                    ?? ''
                  }
                  modelOptions={agentModelOptions}
                  scanStatus={cliScanStatus}
                  onRefresh={() => void scanCliAgents()}
                  onSelectAgent={(agentId) => {
                    onModeChange('daemon');
                    onAgentChange(agentId);
                  }}
                  onSelectModel={(model) => {
                    if (!selectedAgent) return;
                    onAgentModelChange(selectedAgent.id, {
                      model,
                      serviceTier: undefined,
                    });
                  }}
                  testState={visibleAgentTestState}
                  canTest={canTestAgent}
                  onTest={() => void testAgentInline()}
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
                  onProtocolChange={onApiProtocolChange}
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
                    updateApiConfig({
                      baseUrl,
                      apiProviderBaseUrl: apiProtocol === 'azure' ? '' : null,
                    })
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
          <div className="onboarding-view__actions">
            {amrLoginError ? (
              <span className="onboarding-view__action-status is-error" role="alert">
                {amrLoginError}
              </span>
            ) : null}
            <button
              type="button"
              className={`onboarding-view__primary${connectGateTooltip ? ' od-tooltip' : ''}`}
              onClick={handlePrimaryAction}
              disabled={amrLoginPending || amrLoginCancelPending}
              aria-disabled={connectStepBlocked || undefined}
              data-tooltip={connectGateTooltip ?? undefined}
              data-tooltip-placement="top"
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
  const useDeploymentInput = apiProtocol === 'azure';
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
        allowEmptyValue={apiProtocol === 'azure'}
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
        {modelOptions.length > 0 && !useDeploymentInput ? (
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
            <span>
              {useDeploymentInput
                ? t('settings.azureDeploymentModel')
                : t('settings.model')}
            </span>
            <input
              type="text"
              value={model}
              placeholder={
                useDeploymentInput
                  ? t('settings.azureDeploymentModel')
                  : defaultKnownProviderModel(selectedProvider) || 'claude-sonnet-4-5'
              }
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
  allowEmptyValue?: boolean;
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
    allowEmptyValue = false,
  } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [resolvedPlacement, setResolvedPlacement] = useState(placement);
  const [menuMaxHeight, setMenuMaxHeight] = useState(240);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dropdownIdRef = useRef(`onboarding-dropdown-${Math.random().toString(36).slice(2)}`);
  const selectedValues = Array.isArray(value)
    ? value
    : value || allowEmptyValue
      ? [value]
      : [];
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
