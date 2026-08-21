import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { Button } from '@open-design/components';
import { useAnalytics } from './analytics/provider';
import {
  trackExperienceSurveyDismissed,
  trackExperienceSurveySent,
  trackExperienceSurveyShown,
  trackFileUploadResult,
  trackProjectCreateResult,
} from './analytics/events';
import { deriveUploadCohort } from './analytics/upload-tracking';
import { setPendingDesignSystemCreateEntry } from './analytics/ds-create-entry';
import { detectClientType } from './analytics/identity';
import {
  stashOnboardingEntryForProject,
  type OnboardingEntry,
} from './onboarding/onboarding-entry';
import {
  deriveConfigureGlobals,
  projectKindFromMetadataToTracking,
  fidelityToTracking,
} from '@open-design/contracts/analytics';
import type {
  AmrModelsResponse,
  ChatSessionMode,
  LocalCatalogScope,
  RunContextSelection,
  TeamProject,
  WorkspaceCollabContext,
  WorkspaceInvalidationSsePayload,
  ProjectWorkspaceScope,
  WorkspaceProjectSummary,
} from '@open-design/contracts';
import { DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID } from '@open-design/contracts';
import { EntryView } from './components/EntryView';
import type { ProjectTitleHint } from './components/EntryShell';
import type { IntegrationTab } from './components/IntegrationsView';
import { MarketplaceView } from './components/MarketplaceView';
import { PluginDetailView } from './components/PluginDetailView';
import type { CreateInput, ImportClaudeDesignOutcome } from './components/NewProjectPanel';
import {
  MemoryToast,
  memoryToastSubscriptionMode,
} from './components/MemoryToast';
import { Toast } from './components/Toast';
import { CenteredLoader } from './components/Loading';
import { PetOverlay, type PetTaskCenter } from './components/pet/PetOverlay';
import { buildPetTaskCenter } from './components/pet/taskCenter';
import { migrateCustomPetAtlas } from './components/pet/pets';
import {
  ProjectView,
  type ProjectRenameFenceToken,
  type ProjectNameAuthorityResolution,
} from './components/ProjectView';
import { ProjectCreationPendingView } from './components/ProjectCreationPendingView';
import { AmrArtifactUpgradeGate } from './components/AmrArtifactUpgradeGate';
import { AmrArtifactUpgradeHomeCard } from './components/AmrArtifactUpgradeHomeCard';
import { ExperienceSurvey } from './components/ExperienceSurvey';
import { TooltipLayer } from './components/TooltipLayer';
import { UpdateDialog } from './components/UpdateDialog';
import { UpdaterPopup } from './components/UpdaterPopup';
import {
  openWorkspaceTab,
  removeWorkspaceProjectTabs,
  WorkspaceTabsBar,
} from './components/WorkspaceTabsBar';
import { WorkspaceTopRightAccountCluster } from './components/EntryNavRail';
import { ProjectWorkspaceRecoveryTip } from './components/ProjectWorkspaceRecoveryTip';
import {
  DesignSystemCreationFlow,
  DesignSystemDetailView,
} from './components/DesignSystemFlow';
import {
  IframeKeepAliveProvider,
  useIframeKeepAlivePool,
} from './components/IframeKeepAlivePool';
import {
  SettingsDialog,
  switchApiProtocolConfig,
  updateCurrentApiProtocolConfig,
  type SettingsSection,
  type SettingsHighlight,
} from './components/SettingsDialog';
import { PrivacyConsentModal } from './components/PrivacyConsentModal';
import {
  daemonIsLive,
  fetchAppVersionInfo,
  fetchAgentsStream,
  fetchDesignSystems,
  fetchDesignTemplates,
  invalidateProjectFilesCache,
  fetchPromptTemplates,
  fetchSkills,
  openExternalUrl,
  uploadProjectFiles,
  replaceProjectWorkingDir,
} from './providers/registry';
import { openFirstPartyExternalLinkFromClick } from './first-party-external-link';
import {
  RUNS_CHANGED_EVENT,
  fetchAmrModels,
  fetchVelaLoginStatus,
  listProjectRuns,
  type VelaLoginStatus,
} from './providers/daemon';
import {
  AMR_LOGIN_STATUS_EVENT,
  amrLoginStatusEventReason,
  isAmrSessionAuthenticated,
} from './components/amrLoginPolling';
import { CollabDemoView } from './collab/CollabDemoView';
import {
  WorkspaceMemberDirectoryPreloader,
} from './collab/WorkspaceMemberDirectoryPreloader';
import {
  beginTeamProjectMetadataRefresh,
  fetchTeamProjectCatalogEntry as fetchScopedTeamProjectCatalogEntry,
  fetchTeamProjectsCatalog,
} from './collab/team-projects-catalog';
import { useWorkspaceInvalidation } from './collab/workspace-events';
import { useWorkspaceSnapshotActivation } from './collab/workspace-snapshot-activation';
import { workspaceProjectHeaders } from './collab/workspace-identity';
import {
  beginWorkspaceScopedRead,
  currentWorkspaceAccountGeneration,
  notifyWorkspaceContextRefresh,
  resolveBoundProjectWorkspaceContext,
  resolveCurrentWorkspaceContextReadWitness,
  useWorkspaceBilling,
  useWorkspaceContext,
  workspaceIdentityCacheKey,
  workspaceResourceReadContext,
} from './collab/useWorkspaceContext';
import {
  projectResourceReadsCanStart,
  useProjectRouteWorkspaceContext,
} from './collab/useProjectRouteWorkspaceContext';
import { resolvePlanTier } from './collab/team-plan';
import { deriveTabIdentityScope, UNSET_ACCOUNT_BUCKET } from './collab/tab-scope';
import { CommunityView } from './components/CommunityView';
import { seedHomeComposerPrompt } from './components/HomeView';
import {
  createPluginUseHandoff,
  stashHomePromptHandoff,
} from './components/home-hero/plugin-authoring';
import { goBack, navigate, useRoute, type Route } from './router';
import {
  fetchDaemonConfig,
  DEFAULT_CONFIG,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PET,
  fetchMediaProvidersFromDaemon,
  hasAnyConfiguredProvider,
  fetchComposioConfigFromDaemon,
  loadConfig,
  mergeDaemonConfig,
  mergeDaemonMediaProviders,
  saveConfig,
  shouldSyncLocalMediaProvidersToDaemon,
  syncComposioConfigToDaemon,
  syncConfigToDaemon,
  syncMediaProvidersToDaemon,
} from './state/config';
import { createSilentUpdatePreferenceWriter } from './state/silent-update-preference';
import { applyAppearanceToDocument } from './state/appearance';
import { isMacPlatform } from './utils/platform';
import { randomUUID } from './utils/uuid';
import { summarizeProjectNameFromPrompt } from './utils/projectName';
import { armCompletionFeedbackOnFirstGesture } from './utils/notifications';
import {
  amrArtifactUpgradeHomeMockOffer,
  type AmrArtifactUpgradeHomeOffer,
} from './runtime/amr-artifact-upgrade';
import {
  amrBalanceGateScopeForWorkspaceContext,
  amrBalanceGateScopesMatch,
  type AmrBalanceGateScope,
} from './runtime/amr-balance-gate';
import {
  AMR_AUTH_RETRY_CONTINUATION_TTL_MS,
  routeStillMatchesAmrAuthRetryContinuation,
  type AmrAuthRetryContinuation,
} from './runtime/amr-auth-retry-continuation';
import { installFontRecovery } from './runtime/font-recovery';
import {
  bootstrapFirstOpenTeamProjectRoute,
  bootstrapProjectRoute,
  createDesignSystemProjectFromProject,
  createProject,
  createPluginShareProject,
  deleteProject as deleteProjectApi,
  duplicateProject,
  getProject,
  importClaudeDesignZip,
  importFolderProject,
  invalidatePluginCatalogCache,
  invalidateWorkspaceProjectLists,
  listWorkspaceProjectSummaries,
  listProjects,
  listTemplates,
  deleteTemplate,
  duplicatePluginAsProject,
  patchProject,
  resolvedWorkspaceContextForWrite,
} from './state/projects';
import { useModalWindowDragGuard } from './hooks/useModalWindowDragGuard';
import { resumeThumbnailLoads, suspendThumbnailLoads } from './lib/thumbnail-load-gate';
import type {
  PluginShareAction,
  PluginShareProjectOutcome,
  WorkspaceProjectListView,
} from './state/projects';
import {
  markProjectDisplaySnapshotsDirty,
  patchProjectDisplaySnapshots,
  projectDisplaySnapshotKey,
  readProjectDisplaySnapshot,
  removeProjectFromDisplaySnapshots,
  writeProjectDisplaySnapshot,
} from './state/project-display-cache';
import { getOpenDesignHost, type OpenDesignHostProjectImportSuccess } from '@open-design/host';
import { useI18n } from './i18n';
import { liveArtifactTabId } from './types';
import type {
  AgentInfo,
  AgentModelChoice,
  ApiProtocol,
  AppConfig,
  AppVersionInfo,
  ChatAttachment,
  DesignSystemGenerationJob,
  DesignSystemSummary,
  Project,
  ProjectMetadata,
  ProjectTemplate,
  ProviderModelOption,
  PromptTemplateSummary,
  SkillSummary,
} from './types';

type AppCreateProjectInput = Omit<CreateInput, 'metadata'> & {
  metadata?: CreateInput['metadata'];
  pendingPrompt?: string;
  pluginId?: string;
  pluginSource?: string;
  skillCatalogScope?: LocalCatalogScope | null;
  designSystemCatalogScope?: LocalCatalogScope | null;
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

interface PendingProjectCreation {
  projectId: string;
  prompt: string;
}

const APP_CONFIG_CHANGED_EVENT = 'open-design:app-config-changed';
const AMR_AGENT_ID = 'amr';
const AMR_PROFILE_ENV_KEY = 'OPEN_DESIGN_AMR_PROFILE';
const AGENT_FOCUS_REFRESH_THROTTLE_MS = 10_000;

/**
 * Whether this launch should hand the user to the first-run onboarding flow.
 *
 * Two conditions, both about the *user*, neither about where they happen to be
 * in the app: they have never completed onboarding (on either the local or the
 * daemon copy — `mergeDaemonConfig` ratchets the two before this runs), and
 * they did not arrive through an explicit deep link that onboarding must not
 * hijack (the collab demo and the community gallery are shareable URLs).
 *
 * Deliberately a pure predicate over a resolved config: the redirect belongs to
 * the one-shot boot pass, and expressing it as a function of "who the user is"
 * rather than "what just happened" keeps it from being re-decided mid-session.
 */
export function shouldRouteToFirstRunOnboarding(
  config: AppConfig,
  pathname: string,
): boolean {
  if (config.onboardingCompleted === true) return false;
  if (
    pathname.startsWith('/projects/')
    || pathname.startsWith('/collab-demo')
    || pathname.startsWith('/community')
  ) {
    return false;
  }
  return true;
}

function workspaceProjectListViewForRoute(route: Route): WorkspaceProjectListView {
  if (route.kind === 'home' && route.view === 'all-projects') return 'all';
  if (route.kind === 'home' && route.view === 'drafts') return 'drafts';
  if (route.kind === 'project') return 'all';
  return 'recent';
}

export function shouldSyncMediaProvidersOnSave(
  mediaProviders: AppConfig['mediaProviders'],
  options?: { force?: boolean },
): boolean {
  return Boolean(options?.force) || hasAnyConfiguredProvider(mediaProviders);
}

function normalizeSavedComposioConfig(config: AppConfig['composio']): AppConfig['composio'] {
  const apiKey = config?.apiKey?.trim() ?? '';
  if (apiKey) {
    return {
      ...config,
      apiKey: '',
      apiKeyConfigured: true,
      apiKeyTail: apiKey.slice(-4),
    };
  }
  return { ...(config ?? {}) };
}

function amrProfileForConfig(config: AppConfig): string | null {
  const profile = config.agentCliEnv?.[AMR_AGENT_ID]?.[AMR_PROFILE_ENV_KEY];
  return typeof profile === 'string' && profile ? profile : null;
}

function mergeLinkedDirsIntoMetadata(
  metadata: ProjectMetadata | undefined,
  linkedDirs?: string[] | null,
): ProjectMetadata | undefined {
  const nextDirs = (linkedDirs ?? []).map((dir) => dir.trim()).filter(Boolean);
  if (nextDirs.length === 0) return metadata;
  const baseMetadata = metadata ?? { kind: 'other' };
  return {
    ...baseMetadata,
    linkedDirs: Array.from(new Set([...(baseMetadata.linkedDirs ?? []), ...nextDirs])),
  };
}

function sameAgentModelChoice(
  left: AgentModelChoice | undefined,
  right: AgentModelChoice | undefined,
): boolean {
  return (left?.model ?? null) === (right?.model ?? null)
    && (left?.reasoning ?? null) === (right?.reasoning ?? null)
    && (left?.serviceTier ?? null) === (right?.serviceTier ?? null);
}

export function mergeAgentModelChoice(
  previous: AgentModelChoice | undefined,
  next: { model?: string; reasoning?: string; serviceTier?: string },
): AgentModelChoice {
  const merged = { ...(previous ?? {}), ...next };
  if (
    Object.prototype.hasOwnProperty.call(next, 'serviceTier') &&
    next.serviceTier === undefined
  ) {
    delete merged.serviceTier;
  }
  return merged;
}

function clearStaleAmrModelChoiceOnProfileChange(
  previous: AppConfig,
  next: AppConfig,
): AppConfig {
  if (amrProfileForConfig(previous) === amrProfileForConfig(next)) return next;

  const previousChoice = previous.agentModels?.[AMR_AGENT_ID];
  const nextChoice = next.agentModels?.[AMR_AGENT_ID];
  if (!nextChoice || !sameAgentModelChoice(previousChoice, nextChoice)) return next;

  const nextAgentModels = { ...(next.agentModels ?? {}) };
  delete nextAgentModels[AMR_AGENT_ID];
  return { ...next, agentModels: nextAgentModels };
}

/**
 * Active Cloud sign-out is an account boundary. Remove every saved execution
 * choice that could leak account A's Hosted/Local/BYOK setup into account B,
 * while preserving unrelated product preferences and authored content.
 */
export function resetExecutionConfigAfterSignOut(config: AppConfig): AppConfig {
  return {
    ...config,
    onboardingCompleted: false,
    mode: DEFAULT_CONFIG.mode,
    agentId: null,
    agentModels: {},
    agentCliEnv: {},
    agentCliEnvIntent: {},
    apiProtocol: DEFAULT_CONFIG.apiProtocol,
    apiKey: DEFAULT_CONFIG.apiKey,
    apiVersion: DEFAULT_CONFIG.apiVersion,
    baseUrl: DEFAULT_CONFIG.baseUrl,
    model: DEFAULT_CONFIG.model,
    byokImageModel: DEFAULT_CONFIG.byokImageModel,
    byokVideoModel: DEFAULT_CONFIG.byokVideoModel,
    byokSpeechModel: DEFAULT_CONFIG.byokSpeechModel,
    byokSpeechVoice: DEFAULT_CONFIG.byokSpeechVoice,
    byokProviderConfigDrafts: {},
    byokPendingProviderKey: undefined,
    maxTokens: DEFAULT_CONFIG.maxTokens,
    apiProviderBaseUrl: DEFAULT_CONFIG.apiProviderBaseUrl,
    apiProtocolConfigs: {},
  };
}

type ProjectListRequest = {
  generation: number;
  mutationVersion: number;
  accountGeneration: number;
  scopeKey: string;
  displayKey: string;
  workspaceView: WorkspaceProjectListView | undefined;
};

type PendingProjectNameProjection = {
  accountGeneration: number;
  scopeKey: string;
  project: Project;
  mutationVersion: number;
  confirmed: boolean;
};

type QueuedProjectRenameState = {
  generation: number;
  confirmed: Project;
  pending: number;
  tail: Promise<void>;
};

/**
 * The scope key for a caller with NO resolved workspace identity — either the
 * context has not landed yet (every fresh boot passes through this) or the
 * daemon has no workspace plane at all. It is deliberately NOT treated as "a
 * workspace you left": a boot that lists projects before the context resolves
 * did not read another workspace's data, so promoting `local` → `ws:member`
 * must not discard the list it just loaded.
 */
const UNRESOLVED_PROJECT_LIST_SCOPE = 'local';

function projectListScopeKey(context: WorkspaceCollabContext | null): string {
  return context
    ? `workspace:${workspaceIdentityCacheKey(context)}`
    : UNRESOLVED_PROJECT_LIST_SCOPE;
}

export function projectViewAuthorizationLifetimeKey(
  projectId: string,
  context: WorkspaceCollabContext | null,
): string {
  return `${projectListScopeKey(context)}:${projectId}`;
}

export async function persistComposioConfigChange(
  current: AppConfig,
  composio: AppConfig['composio'],
  sync: (config: AppConfig['composio']) => Promise<boolean> = syncComposioConfigToDaemon,
): Promise<AppConfig> {
  const saved = await sync(composio);
  if (!saved) throw new Error('Composio config save failed');
  return {
    ...current,
    composio: normalizeSavedComposioConfig(composio),
  };
}

export function buildPersistedConfig(next: AppConfig, current: AppConfig): AppConfig {
  const stalePrivacySnapshot =
    current.privacyDecisionAt != null && next.privacyDecisionAt == null;
  return {
    ...next,
    onboardingCompleted: current.onboardingCompleted ? true : next.onboardingCompleted,
    ...(stalePrivacySnapshot
      ? {
          installationId: current.installationId,
          privacyDecisionAt: current.privacyDecisionAt,
          telemetry: current.telemetry,
        }
      : {}),
    composio: next.composio
      ? {
          apiKey: '',
          apiKeyConfigured: Boolean(next.composio.apiKeyConfigured),
          apiKeyTail: next.composio.apiKeyTail ?? '',
        }
      : next.composio,
  };
}

/**
 * True when `next` and `last` produce an identical persisted shape —
 * i.e. the only diffs between them are fields that buildPersistedConfig
 * intentionally strips before disk/daemon writes (the Composio API key
 * draft today; any future save-on-explicit-confirm secrets later).
 *
 * The autosave loop in Settings uses this to skip the "All changes
 * saved" indicator transition when the user has only typed an unsaved
 * secret. Without it, autosave completes a no-op write and flashes
 * "Saved" — misleading users into trusting that a sensitive key has
 * been persisted when in fact only the section-local "Save key"
 * gesture commits it.
 */
export function isAutosaveDraftOnlyChange(next: AppConfig, last: AppConfig): boolean {
  return (
    JSON.stringify(buildPersistedConfig(next, next))
    === JSON.stringify(buildPersistedConfig(last, last))
  );
}

export function resolveSettingsCloseConfig(
  rendered: AppConfig,
  latestPersisted: AppConfig,
): AppConfig {
  const base = latestPersisted === rendered ? rendered : latestPersisted;
  return base.onboardingCompleted ? base : { ...base, onboardingCompleted: true };
}

function mergeAmrModelsIntoAgents(
  agents: AgentInfo[],
  amrModels: AmrModelsResponse | null,
): AgentInfo[] {
  if (!amrModels || amrModels.models.length === 0) return agents;
  return agents.map((agent) => {
    if (agent.id !== 'amr') return agent;
    const shouldPreferAgentModels =
      amrModels.source === 'preset' &&
      Array.isArray(agent.models) &&
      agent.models.length > 0;
    if (shouldPreferAgentModels) return agent;
    return { ...agent, models: amrModels.models, modelsSource: 'live' };
  });
}

const CANONICAL_AGENT_ORDER = [
  'amr',
  'claude',
  'codex',
  'devin',
  'gemini',
  'opencode',
  'hermes',
  'trae-cli',
  'grok-build',
  'kimi',
  'cursor-agent',
  'qwen',
  'qoder',
  'copilot',
  'pi',
  'kiro',
  'kilo',
  'vibe',
  'deepseek',
  'aider',
  'antigravity',
  'reasonix',
] as const;

const CANONICAL_AGENT_ORDER_INDEX = new Map<string, number>(
  CANONICAL_AGENT_ORDER.map((id, index) => [id, index]),
);

function orderAgentsByRegistry(agents: AgentInfo[]): AgentInfo[] {
  return agents
    .map((agent, index) => ({ agent, index }))
    .sort((left, right) => {
      const leftRank =
        CANONICAL_AGENT_ORDER_INDEX.get(left.agent.id) ??
        CANONICAL_AGENT_ORDER.length;
      const rightRank =
        CANONICAL_AGENT_ORDER_INDEX.get(right.agent.id) ??
        CANONICAL_AGENT_ORDER.length;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.index - right.index;
    })
    .map(({ agent }) => agent);
}

function upsertAgent(agents: AgentInfo[], agent: AgentInfo): AgentInfo[] {
  const index = agents.findIndex((item) => item.id === agent.id);
  if (index === -1) return [...agents, agent];
  const next = agents.slice();
  next[index] = agent;
  return next;
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'AbortError'
  );
}

/**
 * `isTeamShared` is the hub-backed truth: `/api/workspace/projects/team`
 * reads the team's resource-hub catalog directly (see
 * `apps/daemon/src/routes/collab-context.ts`), not this daemon's local
 * sqlite. It stays true the instant the hub confirms the project is shared
 * to the caller's team, well before the pull below has materialized a local
 * row. Callers that need to distinguish "not on the hub catalog" (genuinely
 * not shared / no access) from "on the catalog but the local mirror hasn't
 * landed yet" must branch on `isTeamShared`, not on `pulled` — a pull can
 * return `ok: true` with no bytes materialized yet (see collab-sync.ts's
 * `/collab/pull` handler, which only registers the local project once
 * `pullLatest` resolves a non-null version).
 */
type TeamSharedProjectPullOutcome = {
  isTeamShared: boolean;
  pulled: boolean;
};

type TeamProjectCatalogLookup =
  | { ok: true; project: TeamProject | null }
  | { ok: false };

async function fetchTeamProjectCatalogEntry(
  projectId: string,
  workspaceContext: WorkspaceCollabContext | null,
  coalesce = true,
): Promise<TeamProjectCatalogLookup> {
  if (!workspaceContext) return { ok: true, project: null };
  try {
    const projects = await fetchTeamProjectsCatalog({
      context: workspaceContext,
      coalesce,
    });
    return {
      ok: true,
      project: projects.find((project) => project.projectId === projectId) ?? null,
    };
  } catch {
    return { ok: false };
  }
}

async function pullTeamSharedProjectIfAvailable(
  projectId: string,
  workspaceContext: WorkspaceCollabContext | null,
): Promise<TeamSharedProjectPullOutcome> {
  if (!workspaceContext) return { isTeamShared: false, pulled: false };
  const lookup = await fetchTeamProjectCatalogEntry(projectId, workspaceContext);
  if (!lookup.ok || !lookup.project) return { isTeamShared: false, pulled: false };
  try {
    const pullResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/collab/pull`, {
      method: 'POST',
      headers: workspaceProjectHeaders(workspaceContext),
    });
    if (pullResponse.ok) {
      invalidateProjectFilesCache(projectId, workspaceContext);
    }
    return { isTeamShared: true, pulled: pullResponse.ok };
  } catch {
    return { isTeamShared: false, pulled: false };
  }
}

// A member's first-ever open of a just-shared project races the daemon's
// local materialization (POST /collab/pull's registerPulledProject, or
// ProjectView's own /collab/status poll firing ensureSharedProjectPlaceholder
// — see collab-sync.ts) against the deep-link bootstrap effect below. Give
// that materialization a bounded window instead of trusting a single
// immediate miss.
//
// 21 attempts * 600ms = ~12s total. The original budget here was 4 * 600ms =
// ~2.4s, sized well under the real /collab/pull latency observed against a
// live vela-backed hub (up to ~10s for a fresh project's first pull) —
// exhausting the window and falling through to "not found" while the pull
// was still genuinely in flight is a false negative, not a correctness
// backstop. ~12s matches the budget ProjectView's own
// CONVERSATION_LOAD_RETRY_DELAYS_MS already established for the identical
// "team-shared project not yet materialized locally" race on the
// conversations-list read, so both retry loops now cover the same worst
// case instead of one giving up 5x sooner than the other. This is still a
// BOUNDED retry, not an unconditional hang: `everConfirmedTeamShared`
// already keeps the caller from navigating home the moment the hub confirms
// team membership even once (see `still-materializing` below), so widening
// this window only helps the case where the hub itself is slow to reflect a
// share, not a genuinely-missing/no-access project — that path still falls
// through to the not-found/navigate-home handling unchanged.
const DEEP_LINK_TEAM_SHARE_RETRY_ATTEMPTS = 21;
const DEEP_LINK_TEAM_SHARE_RETRY_DELAY_MS = 600;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type DeepLinkedProjectResolution =
  | { kind: 'found'; project: Project }
  // The hub confirmed team membership at least once during the retry window:
  // the project exists and the caller has access. Local materialization is
  // still catching up — the caller must NOT treat this as "not found".
  | { kind: 'still-materializing' }
  // Never confirmed as team-shared within the retry window (or genuinely not
  // shared at all) — the caller's existing not-found handling applies.
  | { kind: 'not-found' };

export type ProjectRouteSurfaceState =
  | 'ready'
  | 'loading-projects'
  | 'resolving-deep-link'
  | 'missing'
  | 'materialization-failed'
  | 'daemon-unavailable';

interface SettingsReturnTarget {
  route: Extract<Route, { kind: 'project' }>;
  accountGeneration: number;
  identityScopeKey: string;
}

/**
 * The project route must never use `!activeProject` as an unbounded loading
 * condition. Once the initial list is complete, every absent-project path is
 * either a bounded deep-link resolution or an explicit terminal surface.
 */
export function projectRouteSurfaceState(input: {
  projectsLoading: boolean;
  hasActiveProject: boolean;
  daemonLive: boolean;
  resolutionFailure?: 'missing' | 'materialization-failed';
}): ProjectRouteSurfaceState {
  if (input.hasActiveProject) return 'ready';
  if (input.projectsLoading) return 'loading-projects';
  if (!input.daemonLive) return 'daemon-unavailable';
  if (input.resolutionFailure) return input.resolutionFailure;
  return 'resolving-deep-link';
}

/**
 * Resolves a project a member has just deep-linked to but has no local
 * record of yet. Bounded-retries `getProject` + `pullTeamSharedProjectIfAvailable`
 * so a first-ever open of a freshly team-shared project survives the local
 * materialization race instead of being misread as "doesn't exist" on the
 * first miss. Pulled out of the App.tsx bootstrap effect as a plain async
 * function (no React, no timers beyond the injected `delay`) so the retry
 * decision — when does "not found yet" become "still materializing" versus
 * "genuinely not found" — is unit-testable without mounting the component.
 */
export async function resolveDeepLinkedTeamSharedProject(
  projectId: string,
  deps: {
    getProject: (id: string) => Promise<Project | null>;
    pullTeamSharedProjectIfAvailable: (id: string) => Promise<TeamSharedProjectPullOutcome>;
    delay: (ms: number) => Promise<void>;
    retryAttempts?: number;
    retryDelayMs?: number;
    isCancelled?: () => boolean;
  },
): Promise<DeepLinkedProjectResolution> {
  const attempts = deps.retryAttempts ?? DEEP_LINK_TEAM_SHARE_RETRY_ATTEMPTS;
  const retryDelayMs = deps.retryDelayMs ?? DEEP_LINK_TEAM_SHARE_RETRY_DELAY_MS;
  const isCancelled = () => deps.isCancelled?.() ?? false;
  let everConfirmedTeamShared = false;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await deps.delay(retryDelayMs);
      if (isCancelled()) return { kind: 'still-materializing' };
    }
    const project = await deps.getProject(projectId).catch(() => null);
    if (isCancelled()) return { kind: 'still-materializing' };
    if (project) return { kind: 'found', project };
    const { isTeamShared, pulled } = await deps.pullTeamSharedProjectIfAvailable(projectId);
    if (isCancelled()) return { kind: 'still-materializing' };
    if (isTeamShared) everConfirmedTeamShared = true;
    if (pulled) {
      const pulledProject = await deps.getProject(projectId).catch(() => null);
      if (isCancelled()) return { kind: 'still-materializing' };
      if (pulledProject) return { kind: 'found', project: pulledProject };
    }
  }
  return everConfirmedTeamShared ? { kind: 'still-materializing' } : { kind: 'not-found' };
}

export async function hydrateReadyTeamProject(
  projectId: string,
  workspaceId: string,
  deps: {
    getWorkspaceContext: () => WorkspaceCollabContext | null;
    listWorkspaceProjects: (
      context: WorkspaceCollabContext,
    ) => Promise<WorkspaceProjectSummary[]>;
    onReady?: (project: Project, context: WorkspaceCollabContext) => void;
    applyProject: (project: Project) => void;
  },
): Promise<Project | null> {
  const initialContext = deps.getWorkspaceContext();
  if (
    !initialContext ||
    initialContext.workspaceType !== 'team' ||
    initialContext.workspaceId !== workspaceId ||
    initialContext.memberStatus !== 'active' ||
    initialContext.lifecycleState !== 'active'
  ) {
    return null;
  }
  const contextMatches = () => {
    const context = deps.getWorkspaceContext();
    return Boolean(
      context &&
      context.workspaceType === 'team' &&
      context.workspaceId === initialContext.workspaceId &&
      context.workspaceMemberId === initialContext.workspaceMemberId &&
      context.memberStatus === 'active' &&
      context.lifecycleState === 'active' &&
      (context.teamId ?? context.workspaceId) ===
        (initialContext.teamId ?? initialContext.workspaceId)
    );
  };
  const summaries = await deps.listWorkspaceProjects(initialContext).catch(() => []);
  if (!contextMatches()) return null;
  const summary = summaries.find((candidate) =>
    candidate.id === projectId &&
    candidate.project.id === projectId
  );
  const hasMaterializedTeamBinding = Boolean(
    summary &&
    summary.workspaceId === workspaceId &&
    summary.project.workspaceId === workspaceId &&
    summary.visibility === 'team' &&
    summary.resourceState === 'active' &&
    summary.cloudTombstonedAt == null &&
    summary.currentUserAccess.canOpen === true &&
    typeof summary.resourceHubResourceId === 'string' &&
    summary.resourceHubResourceId.trim() &&
    summary.syncState === 'synced'
  );
  if (!summary || !hasMaterializedTeamBinding) return null;
  deps.onReady?.(summary.project, initialContext);
  deps.applyProject(summary.project);
  return summary.project;
}

export function App() {
  // `reducedMotion="user"` makes every motion/react component honor the OS
  // `prefers-reduced-motion` setting: transform/layout animations are zeroed
  // out while opacity-only changes are kept. The CSS `@media (prefers-reduced-
  // motion: reduce)` block covers the CSS-keyframe surfaces, but the dialogs,
  // toasts and popovers that moved to motion/react need this gate too — without
  // it they keep springing/sliding for users who asked us not to animate.
  return (
    <MotionConfig reducedMotion="user">
      <IframeKeepAliveProvider>
        <WorkspaceMemberDirectoryPreloader />
        <AppInner />
      </IframeKeepAliveProvider>
    </MotionConfig>
  );
}

function AppInner() {
  const { t } = useI18n();
  const iframeKeepAlivePool = useIframeKeepAlivePool();
  const clientType = useMemo(() => detectClientType(), []);
  const hostPlatform = useMemo(() => getOpenDesignHost()?.client.platform, []);
  useModalWindowDragGuard();
  const workspaceContextState = useWorkspaceContext();
  const {
    context: workspaceContext,
    loading: workspaceContextLoading,
  } = workspaceContextState;
  const currentWorkspaceIdentity = workspaceIdentityCacheKey(workspaceContext);
  const workspaceAccountGeneration = currentWorkspaceAccountGeneration();
  // Catalog display state is account-scoped in addition to Workspace-scoped.
  // During an unseeded identity transition the hook intentionally retains the
  // previous context while the replacement account is resolved; a pending
  // sentinel makes that retained context unusable for display immediately.
  const currentWorkspaceCatalogIdentity = JSON.stringify(
    workspaceContextState.identityChangePending
      ? ['pending-account', workspaceAccountGeneration]
      : ['workspace-account', workspaceAccountGeneration, currentWorkspaceIdentity],
  );
  const workspaceBilling = useWorkspaceBilling();
  const workspaceContextRef = useRef<WorkspaceCollabContext | null>(null);
  const workspaceContextStateRef = useRef(workspaceContextState);
  const projectRouteWorkspaceContextRef = useRef<WorkspaceCollabContext | null>(null);
  const projectOpenWorkspaceWitnessRef = useRef<{
    projectId: string;
    projectWorkspaceId: string;
    context: WorkspaceCollabContext;
    accountGeneration: number;
  } | null>(null);
  workspaceContextRef.current = workspaceContext;
  workspaceContextStateRef.current = workspaceContextState;
  const listCurrentWorkspaceProjects = useCallback(
    (options?: { throwOnError?: boolean; workspaceView?: WorkspaceProjectListView }) => {
      const context = workspaceContextRef.current;
      return listProjects({
        ...options,
        workspaceContext: context,
        workspaceView: context ? options?.workspaceView ?? 'recent' : undefined,
      });
    },
    [],
  );
  useEffect(() => {
    const onFirstPartyExternalLink = (event: MouseEvent) => openFirstPartyExternalLinkFromClick(
      event,
      (url) => { void openExternalUrl(url); },
    );
    // React handlers append AMR attribution while the event bubbles; bridge the final URL afterwards.
    document.addEventListener('click', onFirstPartyExternalLink);
    return () => document.removeEventListener('click', onFirstPartyExternalLink);
  }, []);
  // Icon fonts whose startup fetch lost a race stay tofu forever without
  // this — see runtime/font-recovery.ts.
  useEffect(() => installFontRecovery(), []);
  // Observability marker. `apps/web/src/observability/white-screen.ts`
  // keys its "app actually mounted" success condition on this attribute
  // because the dynamic-import loading shell (`<div class="od-loading-shell">
  // Loading OpenDesign…</div>`) is itself >MIN_VISIBLE_TEXT and would
  // otherwise be mistaken for a real mount. Survives subsequent render
  // crashes — once App has mounted at least once, it's no longer a white
  // screen (subsequent failures show up as `$exception`).
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-od-app-mounted', '1');
      document.querySelectorAll('.od-loading-shell').forEach((node) => node.remove());
    }
  }, []);
  // Desktop vibrancy focus response: an unfocused window drops the cream
  // scrim to let the wallpaper show through more clearly; on focus the scrim
  // returns to full strength (app-wash.css keys off this class).
  useEffect(() => {
    if (
      clientType !== 'desktop'
      || hostPlatform !== 'darwin'
      || typeof window === 'undefined'
    ) return undefined;
    const root = document.documentElement;
    const sync = () => root.classList.toggle('is-window-blurred', !document.hasFocus());
    sync();
    window.addEventListener('focus', sync);
    window.addEventListener('blur', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('blur', sync);
      root.classList.remove('is-window-blurred');
    };
  }, [clientType, hostPlatform]);
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());
  const configRef = useRef(config);
  configRef.current = config;
  const latestPersistedConfigRef = useRef(config);
  latestPersistedConfigRef.current = config;
  const settingsDraftConfigRef = useRef<AppConfig | null>(null);
  const completionFeedbackGestureConsumedRef = useRef(false);
  useEffect(() => {
    if (completionFeedbackGestureConsumedRef.current) return undefined;
    const notifications = config.notifications ?? DEFAULT_NOTIFICATIONS;
    if (!notifications.soundEnabled && !notifications.desktopEnabled) return undefined;
    return armCompletionFeedbackOnFirstGesture(notifications, ({ desktopPermission }) => {
      completionFeedbackGestureConsumedRef.current = true;
      if (
        !notifications.desktopEnabled
        || desktopPermission === null
        || desktopPermission === 'granted'
      ) return;
      // The product default expresses intent, but an unsupported/denied browser
      // permission cannot honestly remain Active. Reconcile only the desktop
      // switch; the independent completion-sound preference stays enabled.
      setConfig((previous) => {
        const previousNotifications = previous.notifications ?? DEFAULT_NOTIFICATIONS;
        if (!previousNotifications.desktopEnabled) return previous;
        const next: AppConfig = {
          ...previous,
          notifications: { ...previousNotifications, desktopEnabled: false },
        };
        latestPersistedConfigRef.current = next;
        saveConfig(next);
        return next;
      });
    });
  }, [config.notifications?.desktopEnabled, config.notifications?.soundEnabled]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [amrArtifactUpgradeHomeMockConfig] = useState<AmrArtifactUpgradeHomeOffer | null>(
    () => process.env.NODE_ENV === 'development' && typeof window !== 'undefined'
      ? amrArtifactUpgradeHomeMockOffer(window.location.search)
      : null,
  );
  const amrArtifactUpgradeHomeMock = amrArtifactUpgradeHomeMockConfig !== null;
  const [amrArtifactUpgradeHomeOffer, setAmrArtifactUpgradeHomeOffer] =
    useState<AmrArtifactUpgradeHomeOffer | null>(() => amrArtifactUpgradeHomeMockConfig);
  // Surfaced when a Home-picked working dir could not be applied to a freshly
  // created project (expired/invalid desktop token, daemon rejection). Without
  // this the failure was swallowed and the user believed their folder was in
  // effect while the project actually stayed in the managed root.
  const [workingDirError, setWorkingDirError] = useState<string | null>(null);
  const [projectCreateError, setProjectCreateError] = useState<string | null>(null);
  const [projectOpenError, setProjectOpenError] = useState<string | null>(null);
  const [deepLinkResolutionFailure, setDeepLinkResolutionFailure] = useState<{
    projectId: string;
    failure: 'missing' | 'materialization-failed';
  } | null>(null);
  const [deepLinkRetryRevision, setDeepLinkRetryRevision] = useState(0);
  const [settingsWelcome, setSettingsWelcome] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('execution');
  const [settingsHighlight, setSettingsHighlight] = useState<SettingsHighlight>(null);
  const [integrationInitialTab, setIntegrationInitialTab] = useState<IntegrationTab>('mcp');
  const [daemonLive, setDaemonLive] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const amrModelsRef = useRef<AmrModelsResponse | null>(null);
  const amrPollGenerationRef = useRef(0);
  const agentStreamRequestSeqRef = useRef(0);
  const agentStreamAbortRef = useRef<AbortController | null>(null);
  const agentFocusRefreshLastRunRef = useRef(Date.now());
  const [amrPollRestartToken, setAmrPollRestartToken] = useState(0);
  const [providerModelsCache, setProviderModelsCache] = useState<
    Record<string, ProviderModelOption[]>
  >({});
  // Functional skills (capabilities the agent invokes mid-task) — stays
  // small and lives under the Settings → Skills surface.
  const [workspaceSkills, setWorkspaceSkills] = useState<{
    identity: string;
    items: SkillSummary[];
  }>(() => ({
    identity: currentWorkspaceCatalogIdentity,
    items: [],
  }));
  // A workspace-scoped response is safe to render only under the exact
  // identity it was fetched for. The replacement read starts in an effect, so
  // clearing in that effect would still paint one frame of A's skills under B.
  // Derive the visible catalog during render instead: an identity mismatch is
  // a fail-closed empty list until B's own response commits.
  const skills =
    workspaceSkills.identity === currentWorkspaceCatalogIdentity
      ? workspaceSkills.items
      : [];
  // Design templates (rendering catalogue: decks, prototypes, image/video/
  // audio templates) — sourced from /api/design-templates and shown in the
  // EntryView Templates tab. See specs/current/skills-and-design-templates.md.
  const [designTemplates, setDesignTemplates] = useState<SkillSummary[]>([]);
  const [workspaceDesignSystems, setWorkspaceDesignSystems] = useState<{
    identity: string;
    items: DesignSystemSummary[];
  }>(() => ({
    identity: currentWorkspaceCatalogIdentity,
    items: [],
  }));
  // Like skills and projects, a design-system catalog belongs to one exact
  // Workspace membership. Effects refresh after React commits, so merely
  // guarding late responses is not enough: without this render-time identity
  // check, switching A -> B paints A's systems under B until B's request
  // finishes. Fail closed during that gap; opening the picker still reuses the
  // already-loaded list instantly when the identity has not changed.
  const designSystems = workspaceDesignSystems.identity === currentWorkspaceCatalogIdentity
    ? workspaceDesignSystems.items
    : [];
  const skillsRequestGenerationRef = useRef<Map<string, number>>(new Map());
  const designSystemsRequestGenerationRef = useRef<Map<string, number>>(new Map());
  const [pendingDesignSystemRevisionJobs, setPendingDesignSystemRevisionJobs] = useState<
    Record<string, DesignSystemGenerationJob>
  >({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [pendingProjectCreation, setPendingProjectCreation] =
    useState<PendingProjectCreation | null>(null);
  const [appliedProjectListWitness, setAppliedProjectListWitness] = useState<{
    scopeKey: string;
    generation: number;
    workspaceView: WorkspaceProjectListView | undefined;
    projectIds: ReadonlySet<string>;
  } | null>(null);
  const projectsRef = useRef<Project[]>(projects);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  // Project names from another member's team-catalog row are authoritative:
  // the local mirror can carry an older real name (not only "共享项目") with a
  // newer local timestamp. Scope keys prevent a project id observed in one
  // workspace/member context from leaking its title authority into another.
  const [authoritativeProjectNames, setAuthoritativeProjectNames] = useState<
    Record<string, string>
  >({});
  const authoritativeProjectNamesRef = useRef(authoritativeProjectNames);
  authoritativeProjectNamesRef.current = authoritativeProjectNames;
  const projectNameAuthorityRequestGenerationRef = useRef<Map<string, number>>(new Map());
  const refreshTargetedProjectMetadata = useCallback(async (
    payload: Extract<WorkspaceInvalidationSsePayload, { type: 'team-projects-changed' }>,
  ) => {
    const projectId = payload.projectId;
    if (!projectId) return;
    const issuedContext = workspaceContextRef.current;
    if (!issuedContext) return;
    const issuedAccountGeneration = currentWorkspaceAccountGeneration();
    const issuedIdentity = workspaceIdentityCacheKey(issuedContext);
    const metadataRefresh = beginTeamProjectMetadataRefresh({
      accountGeneration: issuedAccountGeneration,
      context: issuedContext,
      projectId,
      event: payload,
    });
    const metadataRequestIsCurrent = () =>
      currentWorkspaceAccountGeneration() === issuedAccountGeneration
      && workspaceIdentityCacheKey(workspaceContextRef.current) === issuedIdentity
      && metadataRefresh.isLatest();
    try {
      const catalogProject = await fetchScopedTeamProjectCatalogEntry({
        context: issuedContext,
        projectId,
        force: true,
        cacheDiscriminator: metadataRefresh.cacheDiscriminator,
      });
      if (
        !catalogProject
        || !metadataRequestIsCurrent()
      ) return;
      const name = catalogProject.name?.trim();
      if (!name) return;
      setProjects((current) => {
        if (!metadataRequestIsCurrent()) return current;
        return current.map((project) =>
          project.id === projectId
          && project.workspaceId === issuedContext.workspaceId
            ? { ...project, name }
            : project
        );
      });
      if (!metadataRequestIsCurrent()) return;
      patchProjectDisplaySnapshots({
        accountGeneration: issuedAccountGeneration,
        context: issuedContext,
        patch: (projects) => projects.map((project) =>
          project.id === projectId
            ? {
                ...project,
                name,
                ...(catalogProject.metadata ? { metadata: catalogProject.metadata } : {}),
                ...(catalogProject.updatedAt !== undefined
                  ? { updatedAt: catalogProject.updatedAt }
                  : {}),
              }
            : project),
      });
      // Another member's catalog row is title authority over a stale local
      // mirror. The creator's own local row remains authoritative, but still
      // receives the exact hub-confirmed projection update above (for another
      // window/device logged into the same member).
      if (catalogProject.ownerMemberId !== issuedContext.workspaceMemberId) {
        const authorityKey = projectViewAuthorizationLifetimeKey(projectId, issuedContext);
        setAuthoritativeProjectNames((current) => {
          if (!metadataRequestIsCurrent()) return current;
          return current[authorityKey] === name
            ? current
            : { ...current, [authorityKey]: name };
        });
      }
    } catch {
      // Keep the last-good projection. Reconnect/poll performs full catch-up.
    }
  }, []);
  const refreshProjectCatalogRef = useRef<() => void>(() => {});
  const teamResourceRefreshRefs = useRef<{
    skill: (resourceId?: string) => void;
    designSystem: (resourceId?: string) => void;
    plugin: (
      context: WorkspaceCollabContext | null,
      accountGeneration: number,
    ) => void;
    catchUp: () => void;
  }>({
    skill: () => {},
    designSystem: () => {},
    plugin: () => {},
    catchUp: () => {},
  });
  const invalidationWorkspaceContext = workspaceContext;
  const invalidationAccountGeneration = workspaceAccountGeneration;
  const resourceStreamIdentity = JSON.stringify([
    invalidationAccountGeneration,
    workspaceIdentityCacheKey(invalidationWorkspaceContext),
  ]);
  const handleTeamResourceStreamActive = useWorkspaceSnapshotActivation({
    enabled: invalidationWorkspaceContext?.workspaceType === 'team',
    identity: resourceStreamIdentity,
    refresh: () => teamResourceRefreshRefs.current.catchUp(),
  });
  useWorkspaceInvalidation({
    'team-projects-changed': (payload) => {
      if (payload.kind === 'metadata' && payload.projectId) {
        void refreshTargetedProjectMetadata(payload);
        return;
      }
      refreshProjectCatalogRef.current();
    },
    'team-resources-changed': (payload) => {
      if (payload.resourceKind === 'skill') {
        teamResourceRefreshRefs.current.skill(payload.resourceId);
        return;
      }
      if (payload.resourceKind === 'design_system') {
        teamResourceRefreshRefs.current.designSystem(payload.resourceId);
        return;
      }
      teamResourceRefreshRefs.current.plugin(
        invalidationWorkspaceContext,
        invalidationAccountGeneration,
      );
    },
  }, {
    workspaceContext,
    onActive: handleTeamResourceStreamActive,
  });
  const [petTaskCenter, setPetTaskCenter] = useState<PetTaskCenter>({
    running: [],
    queued: [],
    recent: [],
  });
  const [projectRunActivity, setProjectRunActivity] = useState<{
    projectId: string | null;
    active: boolean;
  }>({ projectId: null, active: false });
  const handleProjectRunActivityChange = useCallback(
    (projectId: string, active: boolean) => {
      setProjectRunActivity({ projectId, active });
    },
    [],
  );
  const pendingLocalProjectIdsRef = useRef<Set<string>>(new Set());
  const currentProjectListScope = projectListScopeKey(workspaceContext);
  const currentPendingLocalProjectScope = [
    currentWorkspaceAccountGeneration(),
    currentProjectListScope,
  ].join(':');
  const pendingLocalProjectScopeRef = useRef(currentPendingLocalProjectScope);
  const projectAuthorizationScopeRef = useRef(currentProjectListScope);
  const projectAuthorizationGenerationRef = useRef(0);
  if (projectAuthorizationScopeRef.current !== currentProjectListScope) {
    projectAuthorizationScopeRef.current = currentProjectListScope;
    projectAuthorizationGenerationRef.current += 1;
  }
  if (pendingLocalProjectScopeRef.current !== currentPendingLocalProjectScope) {
    pendingLocalProjectScopeRef.current = currentPendingLocalProjectScope;
    pendingLocalProjectIdsRef.current.clear();
  }
  const locallyDeletedProjectIdsRef = useRef<Map<string, number>>(new Map());
  const projectListMutationVersionRef = useRef(0);
  const projectRenameStatesRef = useRef<Map<string, QueuedProjectRenameState>>(new Map());
  const pendingProjectNameProjectionsRef = useRef<Map<string, PendingProjectNameProjection>>(
    new Map(),
  );
  const projectListRequestGenerationRef = useRef(0);
  const latestAppliedProjectListGenerationRef = useRef(0);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<
    PromptTemplateSummary[]
  >([]);
  const [appVersionInfo, setAppVersionInfo] = useState<AppVersionInfo | null>(
    null,
  );
  const [daemonMediaProviders, setDaemonMediaProviders] = useState<
    AppConfig['mediaProviders'] | null
  >(null);
  const [daemonMediaProvidersFetchState, setDaemonMediaProvidersFetchState] = useState<
    'idle' | 'ok' | 'error'
  >('idle');
  const [mediaProvidersNotice, setMediaProvidersNotice] = useState<string | null>(null);
  // Per-resource loading flags. Each goes false the moment its own fetch
  // resolves so each entry-view tab can render as its data lands instead of
  // every tab waiting on the slowest endpoint (typically `/api/agents`,
  // which probes CLI versions and can take seconds on cold start). The entry
  // view picks the right flag for whichever tab the user is currently on.
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [skillsLoading, setSkillsLoading] = useState(true);
  // Functional skills and design templates are two independent registry reads
  // that gate ONE loader: the EntryView must not stop spinning until both have
  // answered, or whichever tab the user is on renders an incomplete catalog as
  // if it were final. They are now read from two different places (the boot pass
  // reads templates; the workspace-keyed effect reads skills once the caller's
  // identity is known), so the pair of flags lives here rather than inside one
  // effect's closure.
  const skillRegistriesReadyRef = useRef({ functional: false, templates: false });
  const markSkillRegistryReady = useCallback((half: 'functional' | 'templates') => {
    skillRegistriesReadyRef.current[half] = true;
    const { functional, templates } = skillRegistriesReadyRef.current;
    if (functional && templates) setSkillsLoading(false);
  }, []);
  const [dsLoading, setDsLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [promptTemplatesLoading, setPromptTemplatesLoading] = useState(true);
  // Goes true once the daemon-persisted config (agentId/designSystemId/etc.)
  // has merged into local state. Auto-selection effects below wait on this
  // so they don't race ahead of the daemon-stored choice and overwrite it
  // with a freshly picked first-available agent.
  const [daemonConfigLoaded, setDaemonConfigLoaded] = useState(false);
  // True only when GET /api/app-config returned a real config object. Used to
  // gate silent-update default seeding: a failed/null fetch must not be treated
  // as "no preference yet" or we would overwrite a daemon-backed opt-out.
  const [daemonAppConfigReady, setDaemonAppConfigReady] = useState(false);
  // Narrower flag dedicated to the Composio API key hydration. The key is
  // persisted by the daemon (and only reflected back via apiKeyConfigured
  // + apiKeyTail), so after a dev-server restart there is a window where
  // the dialog can render an empty Composio input even though a saved key
  // exists. Settings → Connectors uses this to render a skeleton over the
  // input + buttons instead of an empty input that the user might
  // mistake for "no key saved" — and to disable Save/Clear so a misclick
  // can't overwrite the saved state with `''` before hydration lands.
  const [composioConfigLoading, setComposioConfigLoading] = useState(true);
  const route = useRoute();
  const routeRef = useRef(route);
  routeRef.current = route;
  const settingsReturnTargetRef = useRef<SettingsReturnTarget | null>(null);
  const workspaceProjectView = workspaceProjectListViewForRoute(route);
  // Read-only mirror for the boot effect. The boot pass needs to know which
  // project list to seed, but it must NOT restart when that answer changes:
  // see the "boot is a one-shot" note on the bootstrap effect below. A
  // dedicated effect already re-lists projects whenever the view or the
  // workspace changes, so nothing is lost by the boot pass not reacting.
  const workspaceProjectViewRef = useRef(workspaceProjectView);
  workspaceProjectViewRef.current = workspaceProjectView;
  // `listCurrentWorkspaceProjects` already collapses `workspaceView` to
  // `undefined` when there is no resolved `workspaceContext` (see its
  // `context ? options?.workspaceView ?? 'recent' : undefined` above), so the
  // request it sends never actually varies by home tab outside a workspace.
  // But the raw route-derived `workspaceProjectView` still changes string
  // value on every 最近/全部/草稿 tab switch, and that alone is enough to
  // re-run the effect below (dependency arrays compare the value passed in,
  // not what the callback does with it) — re-fetching the identical list on
  // every click. Mirror the callback's own collapse here so the effect's
  // dependency is stable outside a workspace, matching the fetch it triggers.
  const effectiveWorkspaceProjectView = workspaceContext ? workspaceProjectView : undefined;
  const projectDisplayAccountGeneration = currentWorkspaceAccountGeneration();
  const currentProjectDisplayKey = projectDisplaySnapshotKey({
    accountGeneration: projectDisplayAccountGeneration,
    context: workspaceContext,
    view: effectiveWorkspaceProjectView,
  });
  // Display snapshots are deliberately separate from authorization. They may
  // prevent a warm view from flashing a loader, but every network read and
  // mutation still carries the current request's independently verified
  // Workspace context. An exact account/workspace/member+view hit is safe to
  // render while it revalidates; any other identity is cleared before paint.
  const projectListScopeRef = useRef(currentProjectListScope);
  const projectDisplayKeyRef = useRef(currentProjectDisplayKey);
  if (projectDisplayKeyRef.current !== currentProjectDisplayKey) {
    const leftAResolvedWorkspace =
      projectListScopeRef.current !== UNRESOLVED_PROJECT_LIST_SCOPE;
    const snapshot = readProjectDisplaySnapshot(currentProjectDisplayKey);
    // A create/import is immediately projected into `projects`, but opening
    // that project changes the list projection from Home's `recent` to `all`.
    // An older exact-scope `all` snapshot must not erase the pending local row:
    // ProjectView can keep rendering from its route snapshot, while later
    // rename callbacks then have no list row to update and Back restores the
    // stale Home cards. Personal creates belong to recent/all/drafts; Team is
    // intentionally excluded until the share mutation is authoritative.
    const pendingProjects = effectiveWorkspaceProjectView === 'team'
      ? []
      : projects.filter((project) =>
          pendingLocalProjectScopeRef.current === currentPendingLocalProjectScope
          && pendingLocalProjectIdsRef.current.has(project.id)
          && (
            workspaceContext === null
              ? project.workspaceId == null
              : project.workspaceId === workspaceContext.workspaceId
          ));
    projectListScopeRef.current = currentProjectListScope;
    projectDisplayKeyRef.current = currentProjectDisplayKey;
    if (snapshot) {
      const snapshotIds = new Set(snapshot.projects.map((project) => project.id));
      const preserved = pendingProjects.filter((project) => !snapshotIds.has(project.id));
      setProjects(preserved.length > 0 ? [...preserved, ...snapshot.projects] : snapshot.projects);
      setProjectsLoading(false);
    } else if (leftAResolvedWorkspace) {
      setProjects(pendingProjects);
      setProjectsLoading(true);
    }
  }
  const projectScopeRefreshMountedRef = useRef(false);
  const analytics = useAnalytics();

  // Single-flight guard for `/api/agents?stream=1`: beginning a new request
  // physically aborts the previous stream, not just invalidates its
  // callbacks. Stacked live streams are what deadlocked the packaged app —
  // each navigation/focus refresh opened another slow cold-probe stream,
  // and once they pinned every upstream connection slot the whole od://
  // proxy starved (see apps/packaged/src/index.ts ignore-connections-limit
  // note for the other half of that fix).
  const beginAgentStreamRequest = useCallback(() => {
    agentStreamAbortRef.current?.abort();
    agentStreamAbortRef.current = new AbortController();
    agentStreamRequestSeqRef.current += 1;
    return agentStreamRequestSeqRef.current;
  }, []);

  const isCurrentAgentStreamRequest = useCallback((requestId: number) => {
    return agentStreamRequestSeqRef.current === requestId;
  }, []);

  const restartAmrPolling = useCallback(() => {
    amrPollGenerationRef.current += 1;
    setAmrPollRestartToken((current) => current + 1);
  }, []);

  // v2 schema removed the standalone `app_launch` event; the initial
  // page_view fires from each top-level page surface (home / projects /
  // automations / plugins / design_systems / integrations) instead.
  // `detectClientType` still feeds analytics identity via the provider.
  void detectClientType;

  const rememberLocalProject = useCallback((projectId: string) => {
    pendingLocalProjectIdsRef.current.add(projectId);
    locallyDeletedProjectIdsRef.current.delete(projectId);
    projectListMutationVersionRef.current += 1;
    const context = workspaceContextRef.current;
    if (context) {
      markProjectDisplaySnapshotsDirty({
        accountGeneration: currentWorkspaceAccountGeneration(),
        context,
      });
    }
  }, []);

  const handleTeamProjectContentReady = useCallback(async (
    projectId: string,
    workspaceId: string,
    workspaceMemberId: string,
  ): Promise<boolean> => {
    if (workspaceContextRef.current?.workspaceMemberId !== workspaceMemberId) {
      return false;
    }
    const project = await hydrateReadyTeamProject(projectId, workspaceId, {
      getWorkspaceContext: () => workspaceContextRef.current,
      listWorkspaceProjects: (context) =>
        listWorkspaceProjectSummaries({
          context,
          workspaceView: 'team',
          throwOnError: true,
        }),
      onReady: (_project, context) => {
        invalidateProjectFilesCache(projectId, context);
      },
      applyProject: (project) => {
        rememberLocalProject(projectId);
        setProjects((current) => [
          project,
          ...current.filter((candidate) => candidate.id !== projectId),
        ]);
      },
    });
    return project != null;
  }, [rememberLocalProject]);

  const clearLocalProject = useCallback((projectId: string, options?: { deleted?: boolean }) => {
    pendingLocalProjectIdsRef.current.delete(projectId);
    projectListMutationVersionRef.current += 1;
    if (options?.deleted) {
      locallyDeletedProjectIdsRef.current.set(
        projectId,
        projectListMutationVersionRef.current,
      );
    }
  }, []);

  const beginProjectListRequest = useCallback((
    workspaceView: WorkspaceProjectListView | undefined,
  ): ProjectListRequest => {
    projectListRequestGenerationRef.current += 1;
    const issuedContext = workspaceContextRef.current;
    const accountGeneration = currentWorkspaceAccountGeneration();
    const effectiveView = issuedContext ? workspaceView ?? 'recent' : undefined;
    return {
      generation: projectListRequestGenerationRef.current,
      mutationVersion: projectListMutationVersionRef.current,
      accountGeneration,
      scopeKey: projectListScopeKey(issuedContext),
      displayKey: projectDisplaySnapshotKey({
        accountGeneration,
        context: issuedContext,
        view: effectiveView,
      }),
      workspaceView: effectiveView,
    };
  }, []);

  const reconcileFetchedProjects = useCallback((list: Project[], request: ProjectListRequest) => {
    if (
      request.accountGeneration !== currentWorkspaceAccountGeneration()
      || request.scopeKey !== projectListScopeKey(workspaceContextRef.current)
    ) {
      return false;
    }
    const projectedList = list.map((project) => {
      const key = JSON.stringify([
        request.accountGeneration,
        request.scopeKey,
        project.id,
      ]);
      const pending = pendingProjectNameProjectionsRef.current.get(key);
      if (!pending) return project;
      if (
        pending.confirmed
        && request.mutationVersion >= pending.mutationVersion
      ) {
        // A request issued after the local mutation settled is authoritative,
        // even when another tab has already committed a newer name. The fence
        // only protects requests that were already in flight when the local
        // optimistic rename began; keeping it past the first post-write read
        // would permanently hide later remote renames.
        pendingProjectNameProjectionsRef.current.delete(key);
        return project;
      }
      return {
        ...project,
        name: pending.project.name,
        metadata: pending.project.metadata,
        updatedAt: Math.max(project.updatedAt, pending.project.updatedAt),
      };
    });
    const pendingLocalProjectIds = pendingLocalProjectIdsRef.current;
    const locallyDeletedProjectIds = locallyDeletedProjectIdsRef.current;
    const fetchedIds = new Set(projectedList.map((project) => project.id));
    if (request.generation < latestAppliedProjectListGenerationRef.current) {
      const visibleList =
        locallyDeletedProjectIds.size > 0
          ? projectedList.filter((project) => !locallyDeletedProjectIds.has(project.id))
          : projectedList;
      if (visibleList.length === 0) return false;
      const hydratableProjects = visibleList.filter(
        (project) =>
          pendingLocalProjectIds.has(project.id),
      );
      if (hydratableProjects.length === 0) return false;
      const hydratableById = new Map(
        hydratableProjects.map((project) => [project.id, project]),
      );
      for (const project of hydratableProjects) {
        pendingLocalProjectIds.delete(project.id);
      }
      setProjects((current) => {
        let changed = false;
        const currentIds = new Set<string>();
        const next = current.map((project) => {
          currentIds.add(project.id);
          const hydrated = hydratableById.get(project.id);
          if (!hydrated) return project;
          changed = true;
          hydratableById.delete(project.id);
          return hydrated;
        });
        for (const project of hydratableById.values()) {
          if (currentIds.has(project.id)) continue;
          changed = true;
          next.push(project);
        }
        return changed ? next : current;
      });
      return true;
    }
    latestAppliedProjectListGenerationRef.current = request.generation;
    setAppliedProjectListWitness({
      scopeKey: request.scopeKey,
      generation: request.generation,
      workspaceView: request.workspaceView,
      projectIds: fetchedIds,
    });
    for (const id of fetchedIds) pendingLocalProjectIds.delete(id);
    for (const [id, deletedAtMutationVersion] of locallyDeletedProjectIds) {
      if (
        request.mutationVersion >= deletedAtMutationVersion
        && !fetchedIds.has(id)
      ) {
        locallyDeletedProjectIds.delete(id);
      }
    }
    const activeDeletedProjectIds = new Set(locallyDeletedProjectIds.keys());
    const visibleList =
      activeDeletedProjectIds.size > 0
        ? projectedList.filter((project) => !activeDeletedProjectIds.has(project.id))
        : projectedList;
    const visibleFetchedIds =
      activeDeletedProjectIds.size > 0
        ? new Set(visibleList.map((project) => project.id))
        : fetchedIds;
    writeProjectDisplaySnapshot({
      accountGeneration: request.accountGeneration,
      context: workspaceContextRef.current,
      view: request.workspaceView,
    }, visibleList);
    setProjects((current) => {
      const preserved = current.filter(
        (project) =>
          pendingLocalProjectIds.has(project.id) &&
          !visibleFetchedIds.has(project.id) &&
          !activeDeletedProjectIds.has(project.id),
      );
      return preserved.length > 0 ? [...preserved, ...visibleList] : visibleList;
    });
    return true;
  }, []);

  // Propagate the Privacy toggle through to PostHog without a reload —
  // posthog-js's opt_out_capturing flips a localStorage flag that makes
  // every subsequent capture() a no-op. When the user opts back in we
  // call opt_in_capturing to resume.
  useEffect(() => {
    analytics.setConsent(config.telemetry?.metrics === true);
  }, [analytics.setConsent, config.telemetry?.metrics]);

  // Sync PostHog's distinct_id with the anonymous installationId, both on
  // first opt-in (when the daemon stamps a fresh id) and on Delete-my-data
  // rotation (when PrivacySection.tsx generates a new one). posthog-js
  // caches the previous id in localStorage; identify() alone would stitch
  // the two ids together, so applyIdentity() does reset() first to
  // guarantee the new session is fully decoupled from the deleted one.
  useEffect(() => {
    if (config.telemetry?.metrics !== true) return;
    analytics.setIdentity(config.installationId ?? null);
  }, [analytics.setIdentity, config.installationId, config.telemetry?.metrics]);

  // App-level AMR sign-in state — declared here because the configure
  // globals effect below reads it; the sync effects live next to the
  // other AMR plumbing further down.
  const [amrLoginStatus, setAmrLoginStatus] = useState<VelaLoginStatus | null>(null);
  // Inline AMR auth can invalidate the caller identity and intentionally tear
  // down ProjectView before the login poll reports success. Keep only the
  // exact failed-turn continuation above that authorization lifetime; the
  // fresh ProjectView must prove the same route + Workspace authority before
  // it may consume this one-shot retry.
  const [amrAuthRetryContinuation, setAmrAuthRetryContinuation] =
    useState<AmrAuthRetryContinuation | null>(null);
  const amrAuthRetryContinuationRef = useRef<AmrAuthRetryContinuation | null>(null);
  const clearAmrAuthRetryContinuation = useCallback((expected?: AmrAuthRetryContinuation) => {
    if (expected && amrAuthRetryContinuationRef.current !== expected) return;
    amrAuthRetryContinuationRef.current = null;
    setAmrAuthRetryContinuation(null);
  }, []);
  const armAmrAuthRetryContinuation = useCallback((
    input: Omit<AmrAuthRetryContinuation, 'accountIdAtArm' | 'createdAtMs'>,
  ) => {
    const next: AmrAuthRetryContinuation = {
      ...input,
      accountIdAtArm:
        isAmrSessionAuthenticated(amrLoginStatusRef.current)
          ? amrLoginStatusRef.current?.user?.id ?? null
          : null,
      createdAtMs: Date.now(),
    };
    amrAuthRetryContinuationRef.current = next;
    setAmrAuthRetryContinuation(next);
  }, []);
  const consumeAmrAuthRetryContinuation = useCallback((
    expected: AmrAuthRetryContinuation,
  ): boolean => {
    if (amrAuthRetryContinuationRef.current !== expected) return false;
    clearAmrAuthRetryContinuation(expected);
    return true;
  }, [clearAmrAuthRetryContinuation]);
  useEffect(() => {
    if (!amrAuthRetryContinuation) return;
    const remainingMs =
      amrAuthRetryContinuation.createdAtMs
      + AMR_AUTH_RETRY_CONTINUATION_TTL_MS
      - Date.now();
    if (remainingMs <= 0) {
      clearAmrAuthRetryContinuation(amrAuthRetryContinuation);
      return;
    }
    const timeout = window.setTimeout(() => {
      clearAmrAuthRetryContinuation(amrAuthRetryContinuation);
    }, remainingMs);
    return () => window.clearTimeout(timeout);
  }, [amrAuthRetryContinuation, clearAmrAuthRetryContinuation]);
  // The plan that gates free-tier surfaces (today: the post-generation artifact
  // upsell). vela's login status is ACCOUNT-scoped, so a member whose plan is
  // held by the team workspace reads `free` there and used to be shown the
  // free-user banner; the workspace context's plan id is authoritative and
  // wins. See resolvePlanTier for the full precedence rule.
  const resolvedAmrPlan = resolvePlanTier({
    billing: workspaceBilling,
    context: workspaceContext,
    accountPlan:
      workspaceContextLoading || workspaceContext?.workspaceType === 'team'
        ? null
        : amrLoginStatus?.account?.plan?.trim()
          || amrLoginStatus?.user?.plan?.trim()
          || null,
  });
  // Child surfaces report status snapshots, not login events. Deduplicate the
  // signed-in transition here: restarting the model poll for every Settings
  // snapshot updates `agents`, which makes Settings fetch status again and
  // creates a status -> models -> agents request loop.
  const amrLoginStatusRef = useRef<VelaLoginStatus | null>(null);
  const applyAmrLoginStatus = useCallback((
    status: VelaLoginStatus,
    options: { forceModelRefresh?: boolean; restartOnSignIn?: boolean } = {},
  ) => {
    const previousStatus = amrLoginStatusRef.current;
    const wasLoggedIn = isAmrSessionAuthenticated(previousStatus);
    const isLoggedIn = isAmrSessionAuthenticated(status);
    const pendingRetry = amrAuthRetryContinuationRef.current;
    const accountChangedWhileAuthorizing = Boolean(
      pendingRetry
      && (
        (wasLoggedIn && !isLoggedIn)
        || (
          isLoggedIn
          && pendingRetry.accountIdAtArm !== null
          && status.user?.id !== pendingRetry.accountIdAtArm
        )
      )
    );
    if (accountChangedWhileAuthorizing && pendingRetry) {
      clearAmrAuthRetryContinuation(pendingRetry);
    }
    amrLoginStatusRef.current = status;
    setAmrLoginStatus(status);
    const currentRoute = routeRef.current;
    if (
      pendingRetry
      && !accountChangedWhileAuthorizing
      && isLoggedIn
      && status.user?.id
      && (
        pendingRetry.accountIdAtArm === null
        || pendingRetry.accountIdAtArm === status.user.id
      )
      && currentRoute.kind === 'home'
      && currentRoute.view === 'settings'
    ) {
      // The Settings page intentionally unmounts ProjectView while AMR login
      // completes. Return only to the exact failed conversation carried by the
      // App-owned continuation; the fresh ProjectView must still prove its
      // persisted Workspace authority before ChatPane may consume the retry.
      settingsReturnTargetRef.current = null;
      navigate({
        kind: 'project',
        projectId: pendingRetry.projectId,
        conversationId: pendingRetry.conversationId,
        fileName: null,
      }, { replace: true });
    }
    if (
      isLoggedIn
      && (
        options.forceModelRefresh === true
        || (options.restartOnSignIn === true && !wasLoggedIn)
      )
    ) {
      restartAmrPolling();
    }
  }, [clearAmrAuthRetryContinuation, restartAmrPolling]);

  // Tab-scope identity key, fed to WorkspaceTabsBar so it can close every open
  // tab down to a single fresh Home tab whenever the caller's identity
  // changes — signing out, signing in as a different account, switching
  // workspace, or simply never having signed into AMR at all are each their
  // own scope, and a tab opened under one must not silently keep pointing at
  // a project/section the next identity has no standing to see (see
  // WorkspaceTabsBar's own doc, and deriveTabIdentityScope's, for the full
  // design rationale — notably why the workspace half of the key LATCHES
  // across a null `workspaceContext` instead of reacting to it directly, and
  // why `workspaceContextLoading` must ride along: on every fresh boot
  // (first load OR a plain refresh) `amrLoginStatus` and `workspaceContext`
  // resolve on independent timers, and without the loading flag the
  // in-between "logged in, workspace context not landed yet" tick reads as a
  // confirmed no-workspace baseline — so the real workspace context landing a
  // beat later looks exactly like a workspace switch and bounces a team
  // member's own deep-linked/refreshed project back to Home).
  const tabScopeWorkspaceIdRef = useRef<string>('none');
  const tabScopeAccountIdRef = useRef<string>(UNSET_ACCOUNT_BUCKET);
  const {
    scopeKey: identityScopeKey,
    nextWorkspaceBucket: nextTabScopeWorkspaceId,
    nextAccountBucket: nextTabScopeAccountId,
  } = deriveTabIdentityScope({
    amrLoginStatus,
    workspaceContext,
    workspaceContextLoading,
    previousWorkspaceBucket: tabScopeWorkspaceIdRef.current,
    previousAccountBucket: tabScopeAccountIdRef.current,
  });
  tabScopeWorkspaceIdRef.current = nextTabScopeWorkspaceId;
  tabScopeAccountIdRef.current = nextTabScopeAccountId;

  // v2 analytics requires every event to carry the configure-state
  // triplet (has_available_configure_cli / configure_type /
  // configure_availability). We push it into the PostHog global register
  // whenever the user's execution-mode config or the detected agent list
  // changes; the next capture inherits the fresh values, so dashboards
  // can segment by execution setup without per-helper boilerplate.
  //
  // Gated on `agentsLoading` so the cold-start probe (`fetchAgentsStream()`
  // lands asynchronously after this effect's first run) does not stamp
  // the first home/projects/plugins page_view with
  // has_available_configure_cli=false / configure_availability=unavailable
  // on machines that DO have an installed CLI. While the probe is in
  // flight we leave the boot defaults ('unknown'/'unknown') in place,
  // matching what the helper would return for an empty agent list with
  // no mode pinned.
  useEffect(() => {
    if (agentsLoading) return;
    const byokConfigured = (() => {
      const protocols = config.apiProtocolConfigs;
      if (!protocols) return Boolean(config.apiKey?.trim());
      return Object.values(protocols).some(
        (cfg) => Boolean(cfg?.apiKey?.trim()),
      );
    })();
    const globals = deriveConfigureGlobals({
      mode: config.mode,
      agentId: config.agentId,
      agents: agents.map((a) => ({ id: a.id, available: a.available })),
      byokConfigured,
      amrAuthorized: isAmrSessionAuthenticated(amrLoginStatus),
    });
    analytics.setConfigureGlobals(globals);
  }, [
    analytics.setConfigureGlobals,
    agentsLoading,
    amrLoginStatus,
    config.mode,
    config.agentId,
    config.apiKey,
    config.apiProtocolConfigs,
    agents,
  ]);

  // Stamp the app appearance onto the <html> element so CSS variables pick it
  // up. The theme itself is a constant (light-only), but the accent still comes
  // from config, and the stamp must be re-applied whenever that changes.
  // useLayoutEffect (vs useEffect) fires before the browser paints, so no
  // 1-frame flash. Safe here because the component tree is ssr:false.
  useLayoutEffect(() => {
    applyAppearanceToDocument({ accentColor: config.accentColor });
  }, [config.accentColor]);

  // Tell the daemon what the user is currently looking at, so the MCP
  // server can surface it as `get_active_context` to a coding agent in
  // another repo. Best-effort fire-and-forget; the daemon holds it in
  // memory with a short TTL and the MCP layer falls back to
  // {active:false} if this hasn't run.
  const activeProjectId = route.kind === 'project' ? route.projectId : null;
  const activeFileName = route.kind === 'project' ? route.fileName : null;
  // While a project route is active, background home-surface thumbnail
  // documents must not compete with the project's own foreground reads; the
  // card-click handler suspends the gate synchronously and this effect keeps
  // it authoritative for every other entry path (deep links, quick switcher)
  // and resumes it when the user returns home (Batch A §4.2).
  useEffect(() => {
    if (route.kind === 'project') suspendThumbnailLoads();
    else resumeThumbnailLoads();
  }, [route.kind]);
  // Gate the privacy banner on three things:
  //   1. Daemon config has hydrated (privacyDecisionAt is daemon-owned).
  //   2. The user has not yet made a privacy decision.
  //   3. Onboarding is complete (Skip and design-system creation both flip
  //      onboardingCompleted to true; see handleCompleteOnboarding wiring).
  // Once onboarding is done the banner is allowed on any route — including
  // the project view the design-system finish path drops the user into, so
  // they can read and acknowledge the disclosure while the first generation
  // is running. Settings is irrelevant to visibility; the banner sits above
  // the modal-backdrop layer in index.css so opening Settings does not hide
  // it.
  const showPrivacyConsent =
    daemonConfigLoaded &&
    config.privacyDecisionAt == null &&
    config.onboardingCompleted === true;
  useEffect(() => {
    const body = activeProjectId
      ? { projectId: activeProjectId, fileName: activeFileName }
      : { active: false };
    fetch('/api/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {
      // Daemon down or transient network — not worth surfacing.
    });
  }, [activeProjectId, activeFileName]);

  useEffect(() => {
    if (!daemonLive) return;
    let cancelled = false;
    let timer: number | null = null;
    const pollGeneration = amrPollGenerationRef.current + 1;
    amrPollGenerationRef.current = pollGeneration;
    const pollDelayMs = 1_000;
    const maxPresetPolls = 10;
    let presetPolls = 0;

    const applyAmrModels = async () => {
      const result = await fetchAmrModels();
      if (
        cancelled ||
        amrPollGenerationRef.current !== pollGeneration ||
        !result ||
        !Array.isArray(result.models) ||
        result.models.length === 0
      ) {
        return;
      }
      amrModelsRef.current = result;
      setAgents((current) => mergeAmrModelsIntoAgents(current, result));
      const shouldPollPreset =
        result.source === 'preset' &&
        !result.remoteError &&
        presetPolls < maxPresetPolls;
      if (shouldPollPreset) {
        presetPolls += 1;
        timer = window.setTimeout(() => {
          void applyAmrModels();
        }, pollDelayMs);
      }
    };

    void applyAmrModels();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [amrPollRestartToken, daemonLive]);

  // App-level AMR sign-in state. Feeds two analytics globals: the
  // `amr` configure_type bucket (deriveConfigureGlobals below) and the
  // `user_id` public param (the AMR account id is the only join key
  // between this PostHog project and the AMR-side one). Child surfaces
  // push status changes up via onAmrLoginStatusChange; the global
  // AMR_LOGIN_STATUS_EVENT covers logins finishing in surfaces that
  // unmounted before their poll settled.
  useEffect(() => {
    let cancelled = false;
    const sync = async (
      options: { refresh?: boolean } = {},
      restartOnSignIn = false,
    ) => {
      const status = await fetchVelaLoginStatus(options);
      if (!cancelled && status) {
        applyAmrLoginStatus(status, {
          forceModelRefresh: options.refresh === true,
          restartOnSignIn,
        });
      }
    };
    void sync();
    const onStatusEvent = (event: Event) => {
      if (amrLoginStatusEventReason(event) === 'login-canceled') {
        clearAmrAuthRetryContinuation();
      }
      void sync({}, true);
    };
    const onReturnToApp = () => {
      if (document.visibilityState === 'hidden') return;
      void sync({ refresh: true });
    };
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, onStatusEvent);
    window.addEventListener('focus', onReturnToApp);
    document.addEventListener('visibilitychange', onReturnToApp);
    return () => {
      cancelled = true;
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, onStatusEvent);
      window.removeEventListener('focus', onReturnToApp);
      document.removeEventListener('visibilitychange', onReturnToApp);
    };
  }, [applyAmrLoginStatus, clearAmrAuthRetryContinuation, daemonLive]);

  useEffect(() => {
    analytics.setUserId(
      isAmrSessionAuthenticated(amrLoginStatus) ? amrLoginStatus?.user?.id ?? null : null,
    );
  }, [analytics.setUserId, amrLoginStatus]);

  const handleAmrLoginStatusChange = useCallback((status: VelaLoginStatus | null) => {
    if (status) applyAmrLoginStatus(status, { restartOnSignIn: true });
  }, [applyAmrLoginStatus]);

  useEffect(() => {
    const usesOpenDesignCloud =
      config.mode === 'daemon'
      && config.agentId === AMR_AGENT_ID;
    const cloudIdentityRejected =
      workspaceContextState.failure === 'reauth-required'
      || (
        usesOpenDesignCloud
        && (
          amrLoginStatus?.loggedIn === false
          || amrLoginStatus?.sessionState === 'reauth_required'
        )
      );
    if (!cloudIdentityRejected) return;
    if (route.kind === 'home' && route.view === 'onboarding') return;
    navigate({ kind: 'home', view: 'onboarding' }, { replace: true });
  }, [
    amrLoginStatus,
    config.agentId,
    config.mode,
    route,
    workspaceContextState.failure,
  ]);

  // Bootstrap — detect daemon, then fan out independent fetches so each
  // entry-view tab can render the moment its own data lands. Earlier this
  // was one Promise.all behind a global "Loading workspace…" placeholder,
  // which made the slowest endpoint (typically `/api/agents` on cold start)
  // gate every tab including the ones that don't need agents at all.
  //
  // Boot is a ONE-SHOT: every dependency below is a stable callback, so this
  // runs once per app launch and never again. That is load-bearing, not
  // incidental — this pass owns the first-run onboarding routing decision and
  // rewrites the merged config back to localStorage + the daemon. Re-running it
  // on navigation replays both: a user is re-judged against a config read that
  // may lag their own completion, and gets bounced into the first-run flow they
  // already finished. Anything route- or workspace-derived that boot needs must
  // be read through a ref (see `workspaceProjectViewRef`), and anything that
  // must react to those changes belongs in its own effect.
  useEffect(() => {
    let cancelled = false;
    let effectAgentStreamAbort: AbortController | null = null;
    (async () => {
      const alive = await daemonIsLive();
      if (cancelled) return;
      setDaemonLive(alive);
      if (!alive) {
        // No daemon — clear every loading flag so empty states render
        // instead of the entry view sitting on indefinite spinners.
        setAgentsLoading(false);
        setSkillsLoading(false);
        setDsLoading(false);
        setProjectsLoading(false);
        setPromptTemplatesLoading(false);
        setDaemonConfigLoaded(true);
        setDaemonAppConfigReady(false);
        // Composio hydration also depends on the daemon. With no daemon
        // we just keep whatever localStorage already held; drop the
        // skeleton so the Settings → Connectors input reflects state.
        setComposioConfigLoading(false);
        return;
      }

      const agentRequestId = beginAgentStreamRequest();
      effectAgentStreamAbort = agentStreamAbortRef.current;
      void fetchAgentsStream({
        signal: effectAgentStreamAbort?.signal,
        onAgent: (agent) => {
          if (cancelled || !isCurrentAgentStreamRequest(agentRequestId)) return;
          setAgents((current) =>
            mergeAmrModelsIntoAgents(
              upsertAgent(current, agent),
              amrModelsRef.current,
            ),
          );
        },
      })
        .then((list) => {
          if (cancelled || !isCurrentAgentStreamRequest(agentRequestId)) return;
          setAgents(
            mergeAmrModelsIntoAgents(
              orderAgentsByRegistry(list),
              amrModelsRef.current,
            ),
          );
        })
        .catch((err) => {
          if (
            cancelled ||
            isAbortError(err) ||
            !isCurrentAgentStreamRequest(agentRequestId)
          ) {
            return;
          }
          setAgents([]);
        })
        .finally(() => {
          if (cancelled || !isCurrentAgentStreamRequest(agentRequestId)) return;
          setAgentsLoading(false);
        });

      // Functional skills + design templates land independently. Both
      // gate `skillsLoading` together so the EntryView stops rendering
      // its loader once both registries respond — neither tab would have
      // a complete picture if we cleared the flag on the first reply.
      //
      // Only the TEMPLATE half is read here. Functional skills are
      // workspace-scoped on the daemon and must carry the caller's identity
      // headers, which do not exist until `/api/workspace/context` settles —
      // so that read belongs to the workspace-keyed effect below, which owns
      // the `functional` half of this gate. Reading it here as well would
      // spend a second `/api/skills` request per launch, and the first one
      // would be the headerless (fail-closed) answer.
      void fetchDesignTemplates().then((list) => {
        if (cancelled) return;
        setDesignTemplates(list);
        markSkillRegistryReady('templates');
      });

      const designSystemsContext = workspaceContextRef.current;
      // A cached Team identity already has an SSE lifecycle owner below. Do
      // not race an eager bootstrap snapshot against its first onActive; the
      // 250ms fallback covers shells where the stream never opens.
      if (designSystemsContext?.workspaceType !== 'team') {
        const designSystemsWorkspaceIdentity = workspaceIdentityCacheKey(designSystemsContext);
        const designSystemsAccountGeneration = currentWorkspaceAccountGeneration();
        const designSystemsCatalogIdentity = JSON.stringify([
          'workspace-account',
          designSystemsAccountGeneration,
          designSystemsWorkspaceIdentity,
        ]);
        const designSystemsRequestGeneration =
          (designSystemsRequestGenerationRef.current.get(designSystemsCatalogIdentity) ?? 0) + 1;
        designSystemsRequestGenerationRef.current.set(
          designSystemsCatalogIdentity,
          designSystemsRequestGeneration,
        );
        void fetchDesignSystems(designSystemsContext).then((list) => {
          if (
            cancelled ||
            workspaceContextStateRef.current.identityChangePending ||
            designSystemsRequestGenerationRef.current.get(designSystemsCatalogIdentity)
              !== designSystemsRequestGeneration ||
            currentWorkspaceAccountGeneration() !== designSystemsAccountGeneration ||
            workspaceIdentityCacheKey(workspaceContextRef.current)
              !== designSystemsWorkspaceIdentity
          ) return;
          setWorkspaceDesignSystems({
            identity: designSystemsCatalogIdentity,
            items: list,
          });
          setDsLoading(false);
        });
      }

      const request = beginProjectListRequest(workspaceProjectViewRef.current);
      void listCurrentWorkspaceProjects({
        workspaceView: workspaceProjectViewRef.current,
      }).then((list) => {
        if (cancelled) return;
        reconcileFetchedProjects(list, request);
        setProjectsLoading(false);
      });

      void listTemplates().then((list) => {
        if (cancelled) return;
        setTemplates(list);
      });

      void fetchPromptTemplates().then((list) => {
        if (cancelled) return;
        setPromptTemplates(list);
        setPromptTemplatesLoading(false);
      });

      void fetchAppVersionInfo().then((info) => {
        if (cancelled) return;
        setAppVersionInfo(info);
      });

      // Daemon-persisted config + composio config + media provider config land
      // together so the welcome-modal decision and daemon-backed settings
      // apply in one merge, avoiding a flash where local-only state is shown
      // before daemon overrides it.
      void Promise.all([
        fetchDaemonConfig(),
        fetchComposioConfigFromDaemon(),
        fetchMediaProvidersFromDaemon(),
      ]).then(async ([
        daemonConfig,
        daemonComposioConfig,
        daemonMediaProvidersResult,
      ]) => {
        if (cancelled) return;
        const daemonMediaProvidersLoaded =
          daemonMediaProvidersResult.status === 'ok'
            ? daemonMediaProvidersResult.providers
            : null;
        setDaemonMediaProviders(daemonMediaProvidersLoaded);
        setDaemonMediaProvidersFetchState(daemonMediaProvidersResult.status);
        setMediaProvidersNotice(
          daemonMediaProvidersResult.status === 'error'
            ? t('settings.mediaProviderLoadError')
            : null,
        );
        // Settings remain interactive while daemon hydration is in flight.
        // Rebase the daemon response on the latest persisted state so a
        // completed user write cannot be overwritten by the boot snapshot.
        const baseConfig = latestPersistedConfigRef.current;
        const migratedLocalMediaProviders = shouldSyncLocalMediaProvidersToDaemon(
          baseConfig.mediaProviders,
          daemonMediaProvidersLoaded,
        );
        const next = mergeDaemonMediaProviders(
          clearStaleAmrModelChoiceOnProfileChange(
            baseConfig,
            mergeDaemonConfig(baseConfig, daemonConfig),
          ),
          daemonMediaProvidersLoaded,
        );
        const hasLocalComposioKey = Boolean(next.composio?.apiKey?.trim());
        if (!hasLocalComposioKey && daemonComposioConfig) {
          next.composio = daemonComposioConfig;
        }
        // The Composio PUT treats an explicit empty apiKey as a destructive
        // clear. Bootstrap used to issue that write unconditionally, which
        // allowed the empty startup request to arrive after the user's first
        // explicit Save and erase the freshly stored key (plus connector
        // credentials). Startup only needs to write when migrating a legacy
        // plaintext key. Keep the credentials surface locked until that one
        // migration settles so an older key cannot race a user replacement.
        if (hasLocalComposioKey) {
          const migrated = await syncComposioConfigToDaemon(next.composio);
          if (cancelled) return;
          // Only remove the legacy plaintext after the daemon confirms it was
          // stored. A failed migration deliberately leaves the existing local
          // draft intact so the user can retry Save instead of losing the only
          // remaining copy of the credential.
          if (migrated) {
            next.composio = normalizeSavedComposioConfig(next.composio);
          }
        }
        saveConfig(next);
        if (
          daemonMediaProvidersResult.status === 'ok'
          && migratedLocalMediaProviders
          && hasAnyConfiguredProvider(next.mediaProviders)
        ) {
          void syncMediaProvidersToDaemon(next.mediaProviders, {
            daemonProviders: daemonMediaProvidersLoaded,
          });
        }
        // Migrate localStorage prefs to daemon on first boot with the new
        // endpoint. If daemon already had values the merge above used them;
        // writing back is idempotent and keeps both sides in sync.
        void syncConfigToDaemon(next);
        latestPersistedConfigRef.current = next;
        setConfig(next);

        // Route first-run users through the global onboarding panel.
        // The onboarding panel and the privacy banner have independent
        // lifecycles: onboarding keys off `onboardingCompleted`, the
        // banner keys off `privacyDecisionAt`. They may coexist on the
        // first launch; the banner sits above the modal layer so it
        // stays actionable regardless of the active view.
        if (shouldRouteToFirstRunOnboarding(next, window.location.pathname)) {
          navigate({ kind: 'home', view: 'onboarding' }, { replace: true });
        }
        setDaemonConfigLoaded(true);
        // Only a non-null GET payload means we actually observed daemon prefs.
        setDaemonAppConfigReady(daemonConfig != null);
        // Composio key hydration is part of this same daemon-config
        // fetch — by the time we land here the daemon has either
        // returned the saved-key shape (apiKeyConfigured + tail) or
        // it errored and we kept whatever localStorage held. Either
        // way it is safe to drop the skeleton.
        setComposioConfigLoading(false);
      });
    })();
    return () => {
      cancelled = true;
      effectAgentStreamAbort?.abort();
    };
    // `workspaceProjectView` is intentionally absent: it is route-derived, and
    // depending on it would turn this one-shot boot pass into a per-navigation
    // one. It is read through `workspaceProjectViewRef` instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    beginAgentStreamRequest,
    beginProjectListRequest,
    isCurrentAgentStreamRequest,
    listCurrentWorkspaceProjects,
    reconcileFetchedProjects,
  ]);

  // Keep the active projection's last-good display in sync with optimistic
  // local mutations (rename/delete/create). Related projections are marked
  // dirty by the mutation helpers and still revalidate when selected.
  useEffect(() => {
    if (projectsLoading) return;
    writeProjectDisplaySnapshot({
      accountGeneration: projectDisplayAccountGeneration,
      context: workspaceContext,
      view: effectiveWorkspaceProjectView,
    }, projects);
  }, [
    currentProjectDisplayKey,
    effectiveWorkspaceProjectView,
    projectDisplayAccountGeneration,
    projects,
    projectsLoading,
    workspaceContext,
  ]);

  // Auto-pick the first available agent once both the daemon-stored config
  // and the agents listing have landed. Splitting this out of bootstrap
  // avoids racing the local-config initial value against a slow agents
  // probe — by the time this runs, daemonConfig has already overlaid the
  // user's previous choice, so we only fill an empty slot.
  //
  // First-run onboarding is the one time we must NOT do this: the onboarding
  // flow is the sole authority for the initial agent pick (AMR is the
  // recommended default there), and AMR (vela) detection is asynchronous. If
  // this fallback fires during onboarding while AMR is still being detected it
  // snaps the slot to the registry-first *detected* agent (Claude) and
  // persists it to the daemon, which then races and clobbers the user's AMR
  // selection on the next launch. Gate on onboardingCompleted so this only
  // backfills an empty slot for returning users.
  useEffect(() => {
    if (!daemonConfigLoaded || agentsLoading) return;
    if (config.onboardingCompleted !== true) return;
    if (config.agentId) return;
    const firstAvailable = agents.find((a) => a.available);
    if (!firstAvailable) return;
    setConfig((prev) => {
      if (prev.agentId) return prev;
      const next: AppConfig = { ...prev, agentId: firstAvailable.id };
      saveConfig(next);
      void syncConfigToDaemon(next);
      return next;
    });
  }, [
    daemonConfigLoaded,
    agentsLoading,
    agents,
    config.agentId,
    config.onboardingCompleted,
  ]);

  // Auto-pick the default design system the same way — only after daemon
  // config has merged so we never overwrite a daemon-stored selection.
  useEffect(() => {
    if (!daemonConfigLoaded || dsLoading) return;
    if (config.designSystemId) return;
    if (designSystems.length === 0) return;
    const id =
      designSystems.find((d) => d.id === 'default')?.id ?? designSystems[0]!.id;
    setConfig((prev) => {
      if (prev.designSystemId) return prev;
      const next: AppConfig = { ...prev, designSystemId: id };
      saveConfig(next);
      void syncConfigToDaemon(next);
      return next;
    });
  }, [daemonConfigLoaded, dsLoading, designSystems, config.designSystemId]);

  // One-shot self-healing migration for pets adopted before the
  // overlay learned atlas-row switching. If the stored pet is a
  // custom / codex pet whose imageUrl is a single-row strip
  // (no atlas), we silently re-download the full spritesheet so
  // hover, drag, and idle-ambient variety all light up on next render.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const upgraded = await migrateCustomPetAtlas(config);
      if (!upgraded || cancelled) return;
      setConfig((prev) => {
        if (!prev.pet) return prev;
        const next: AppConfig = {
          ...prev,
          pet: { ...prev.pet, custom: upgraded },
        };
        saveConfig(next);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // Snapshot the config at mount; migration is one-shot per session
    // and should not re-run every time config changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshProjects = useCallback(async () => {
    const request = beginProjectListRequest(workspaceProjectView);
    const list = await listCurrentWorkspaceProjects({ workspaceView: workspaceProjectView });
    reconcileFetchedProjects(list, request);
  }, [beginProjectListRequest, listCurrentWorkspaceProjects, reconcileFetchedProjects, workspaceProjectView]);

  const refreshProjectsStrict = useCallback(async () => {
    const request = beginProjectListRequest(workspaceProjectView);
    const list = await listCurrentWorkspaceProjects({
      throwOnError: true,
      workspaceView: workspaceProjectView,
    });
    reconcileFetchedProjects(list, request);
  }, [beginProjectListRequest, listCurrentWorkspaceProjects, reconcileFetchedProjects, workspaceProjectView]);

  const refreshProjectsAfterTeamCatalogChange = useCallback(() => {
    const context = workspaceContextRef.current;
    if (!context) return;
    invalidateWorkspaceProjectLists(
      context,
      currentWorkspaceAccountGeneration(),
    );
    // Preserve the exact principal's last-good rows while the authoritative
    // list reconciles. The request/reconcile pair independently captures and
    // rechecks account + Workspace identity, so a late response cannot cross a
    // switch boundary.
    void refreshProjectsStrict().catch((error: unknown) => {
      console.error('[projects] failed to refresh after team catalog change', error);
    });
  }, [refreshProjectsStrict]);
  refreshProjectCatalogRef.current = refreshProjectsAfterTeamCatalogChange;

  useEffect(() => {
    // Bootstrap already reads this exact scope on mount. Only re-list after
    // the resolved workspace identity or a workspace-specific route changes;
    // local navigation does not alter the unscoped project catalogue.
    if (!projectScopeRefreshMountedRef.current) {
      projectScopeRefreshMountedRef.current = true;
      return;
    }
    let cancelled = false;
    const request = beginProjectListRequest(effectiveWorkspaceProjectView);
    const snapshot = readProjectDisplaySnapshot(request.displayKey);
    if (snapshot) {
      setProjects(snapshot.projects);
      setProjectsLoading(false);
    } else {
      setProjectsLoading(true);
    }
    (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const list = await listCurrentWorkspaceProjects({
            throwOnError: true,
            workspaceView: effectiveWorkspaceProjectView,
          });
          if (!cancelled) reconcileFetchedProjects(list, request);
          return;
        } catch (err) {
          if (cancelled) return;
          if (attempt === 0) {
            // Switching into a team workspace can race the daemon's remote
            // team-project-catalog session warming up for it (recvqaeREM6pdv:
            // a transient 502 here used to be silently downgraded to an empty
            // list, which HomeView cannot tell apart from a genuinely empty
            // workspace and renders as the first-run empty state). Retry once
            // before giving up instead of reconciling a failure as "no
            // projects".
            await new Promise((resolve) => setTimeout(resolve, 1200));
            continue;
          }
          console.error('[projects] failed to refresh after workspace switch', err);
        }
      }
    })().finally(() => {
      if (!cancelled) setProjectsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    workspaceContext?.workspaceId,
    beginProjectListRequest,
    currentProjectDisplayKey,
    effectiveWorkspaceProjectView,
    listCurrentWorkspaceProjects,
    reconcileFetchedProjects,
  ]);

  const refreshDesignSystems = useCallback(async (options?: {
    forceTeamMaterialization?: boolean;
    materializedTeamIds?: readonly string[];
  }) => {
    // Carry the captured Workspace/member identity on the request. The daemon
    // verifies that exact membership instead of consulting mutable ambient
    // Workspace state, and the same identity key prevents an A response from
    // committing after the UI has moved to B.
    if (workspaceContextStateRef.current.identityChangePending) return;
    const issuedContext = workspaceContextRef.current;
    const issuedIdentity = workspaceIdentityCacheKey(issuedContext);
    const issuedAccountGeneration = currentWorkspaceAccountGeneration();
    const issuedCatalogIdentity = JSON.stringify([
      'workspace-account',
      issuedAccountGeneration,
      issuedIdentity,
    ]);
    const requestGeneration =
      (designSystemsRequestGenerationRef.current.get(issuedCatalogIdentity) ?? 0) + 1;
    designSystemsRequestGenerationRef.current.set(issuedCatalogIdentity, requestGeneration);
    const list = await fetchDesignSystems(issuedContext, options);
    if (
      workspaceContextStateRef.current.identityChangePending
      || designSystemsRequestGenerationRef.current.get(issuedCatalogIdentity)
        !== requestGeneration
      || currentWorkspaceAccountGeneration() !== issuedAccountGeneration
      || workspaceIdentityCacheKey(workspaceContextRef.current) !== issuedIdentity
    ) return;
    setWorkspaceDesignSystems({ identity: issuedCatalogIdentity, items: list });
    // Bootstrap and this workspace-scoped refresh can overlap on launch.
    // Either response is a complete catalog for the active daemon identity,
    // so do not leave a successful refresh hidden behind bootstrap's loader
    // when that duplicate request is cancelled or stalls.
    setDsLoading(false);
  }, []);

  // The design-system catalog is verified against the exact Workspace/member
  // identity. Re-read whenever either half changes; a role replacement can
  // reuse the Workspace id while changing the authoritative membership.
  useEffect(() => {
    if (workspaceContextState.identityChangePending) return;
    if (workspaceContext?.workspaceType === 'team') return;
    void refreshDesignSystems();
  }, [
    currentWorkspaceCatalogIdentity,
    refreshDesignSystems,
    workspaceContext?.workspaceType,
    workspaceContextState.identityChangePending,
  ]);

  const refreshSkills = useCallback(async () => {
    // Always scoped. `GET /api/skills` is fail-closed on a missing
    // `x-od-workspace-id` (`skills.ts`: `if (!scopeId) return !ownerId;`), so a
    // headerless read is not the "unfiltered" list — it is the list with every
    // workspace-claimed skill removed, including the ones claimed by the
    // workspace the user is actually in.
    if (workspaceContextStateRef.current.identityChangePending) return;
    const issuedAccountGeneration = currentWorkspaceAccountGeneration();
    const read = beginWorkspaceScopedRead(workspaceContextRef.current);
    const issuedCatalogIdentity = JSON.stringify([
      'workspace-account',
      issuedAccountGeneration,
      workspaceIdentityCacheKey(read.context),
    ]);
    const requestGeneration =
      (skillsRequestGenerationRef.current.get(issuedCatalogIdentity) ?? 0) + 1;
    skillsRequestGenerationRef.current.set(issuedCatalogIdentity, requestGeneration);
    const list = await fetchSkills(read.context);
    // A read for the workspace the user has since LEFT must not restore that
    // workspace's catalog over the current one — see `beginWorkspaceScopedRead`.
    // Skipping the gate too is deliberate: this response is not an answer about
    // the current identity, and the newer read that replaced it will mark it.
    if (
      workspaceContextStateRef.current.identityChangePending
      || skillsRequestGenerationRef.current.get(issuedCatalogIdentity) !== requestGeneration
      || currentWorkspaceAccountGeneration() !== issuedAccountGeneration
      || !read.isStillCurrent(workspaceContextRef.current)
    ) return;
    setWorkspaceSkills({
      identity: issuedCatalogIdentity,
      items: list,
    });
    markSkillRegistryReady('functional');
  }, [markSkillRegistryReady]);

  // The skills catalog is workspace-scoped on the daemon exactly like the
  // design-system catalog above, and needs the same workspace-keyed refresh for
  // the same reason: the switcher lives ON the home view, so `route.kind` stays
  // 'home' and no route change fires.
  //
  // It additionally waits for `workspaceContextLoading` to settle, because
  // unlike design systems (whose scope the daemon resolves from its own vela
  // session) this read carries the identity in REQUEST HEADERS — there is
  // nothing correct to send until the context has resolved. Gating on it also
  // keeps launch at exactly one `/api/skills` request: the boot pass no longer
  // reads skills, this effect performs the first read, and a switch performs
  // one more.
  // Keyed on the SAME digest the commit guard compares, not just `workspaceId`.
  // The guard discards a response whenever `workspaceIdentityCacheKey` moves —
  // which includes member id, role, status, lifecycle and the two permission
  // bits. A trigger that only watched `workspaceId` would therefore discard a
  // response without starting its successor: two accounts active in the same
  // shared team workspace differ only by membership, so A's pending read would
  // be dropped for B while the workspace id, being unchanged, suppressed B's
  // replacement read — leaving the functional registry loading forever on
  // startup, or holding A's list later. "Discarded and never replaced" is a
  // worse outcome than the staleness it replaced, so every transition that
  // invalidates a response must also start its successor.
  const skillsReadIdentity = currentWorkspaceCatalogIdentity;
  const skillsReadIdentityRef = useRef<string | null>(null);
  useEffect(() => {
    if (workspaceContextLoading || workspaceContextState.identityChangePending) return;
    if (skillsReadIdentityRef.current === skillsReadIdentity) return;
    skillsReadIdentityRef.current = skillsReadIdentity;
    if (workspaceContext?.workspaceType === 'team') return;
    void refreshSkills();
  }, [
    workspaceContextLoading,
    workspaceContextState.identityChangePending,
    skillsReadIdentity,
    refreshSkills,
    workspaceContext?.workspaceType,
  ]);

  const refreshTemplates = useCallback(async () => {
    const list = await listTemplates();
    setTemplates(list);
  }, []);

  const handleDeleteTemplate = useCallback(async (id: string) => {
    const ok = await deleteTemplate(id);
    if (ok) await refreshTemplates();
    return ok;
  }, [refreshTemplates]);

  const reloadMediaProvidersFromDaemon = useCallback(async () => {
    const result = await fetchMediaProvidersFromDaemon();
    if (result.status !== 'ok') {
      setDaemonMediaProvidersFetchState('error');
      setMediaProvidersNotice(
        t('settings.mediaProviderLoadError'),
      );
      return null;
    }
    setDaemonMediaProviders(result.providers);
    setDaemonMediaProvidersFetchState('ok');
    setMediaProvidersNotice(null);
    setConfig((prev) => {
      const merged = mergeDaemonMediaProviders(prev, result.providers);
      saveConfig(merged);
      return merged;
    });
    return result.providers;
  }, []);

  /**
   * Non-optimistic, serialized write for the daemon-owned silent-update
   * preference. Concurrent Settings / popup toggles cannot commit out of
   * order: only the latest request applies to app state after its daemon
   * write succeeds.
   */
  const silentUpdatePreferenceWriterRef = useRef(
    createSilentUpdatePreferenceWriter<AppConfig>({
      readBase: () => latestPersistedConfigRef.current,
      writeDaemon: async (next) => {
        await syncConfigToDaemon(next, { throwOnError: true });
      },
      commit: (allowSilentUpdates) => {
        const next: AppConfig = {
          ...latestPersistedConfigRef.current,
          allowSilentUpdates,
        };
        latestPersistedConfigRef.current = next;
        setConfig((prev) => ({ ...prev, allowSilentUpdates }));
        // saveConfig strips daemon-owned keys from localStorage; in-memory
        // config still carries allowSilentUpdates for the rest of the session.
        saveConfig(next);
      },
    }),
  );
  const handleSilentUpdatePreferenceChange = useCallback(async (allowSilentUpdates: boolean) => {
    await silentUpdatePreferenceWriterRef.current.write(allowSilentUpdates);
  }, []);

  /**
   * Autosave-driven persistence path. The settings dialog calls this on
   * every committed edit (via a debounced effect) so localStorage and
   * the daemon stay in lock-step with the user's draft. We deliberately
   * do NOT touch the Composio secret here — it has its own gesture
   * (handleConfigPersistComposioKey) so partial keys never leave the
   * browser. Onboarding is also left alone; the dialog's close path
   * is the canonical "I'm done" signal.
   */
  const handleConfigPersist = useCallback(async (
    next: AppConfig,
    options?: { forceMediaProviderSync?: boolean },
  ) => {
    // Strip the in-flight Composio secret before anything hits disk so
    // a half-typed key can't survive in localStorage. If the dialog is
    // closing, preserve any onboarding completion that the close gesture
    // already committed so an unmount autosave cannot re-open the welcome flow.
    // allowSilentUpdates is daemon-owned and must not be applied optimistically:
    // keep the previous value in memory until the daemon write succeeds.
    const prevSilent = latestPersistedConfigRef.current.allowSilentUpdates;
    const nextSilent = next.allowSilentUpdates;
    const silentChanged = nextSilent !== prevSilent;
    const nextForOptimistic = silentChanged
      ? { ...next, allowSilentUpdates: prevSilent }
      : next;
    const persisted = buildPersistedConfig(nextForOptimistic, configRef.current);
    latestPersistedConfigRef.current = persisted;
    saveConfig(persisted);
    setConfig(persisted);
    const shouldSyncMediaProviders =
      daemonMediaProvidersFetchState === 'ok'
      && shouldSyncMediaProvidersOnSave(persisted.mediaProviders, {
        force: options?.forceMediaProviderSync,
      });
    const daemonPayload = silentChanged
      ? { ...persisted, allowSilentUpdates: nextSilent }
      : persisted;
    await Promise.all([
      shouldSyncMediaProviders
        ? syncMediaProvidersToDaemon(persisted.mediaProviders, {
            force: options?.forceMediaProviderSync,
            daemonProviders: daemonMediaProviders,
            throwOnError: options?.forceMediaProviderSync,
          })
        : Promise.resolve(),
      syncConfigToDaemon(daemonPayload, { throwOnError: true }),
    ]);
    if (silentChanged) {
      latestPersistedConfigRef.current = {
        ...latestPersistedConfigRef.current,
        allowSilentUpdates: nextSilent,
      };
      setConfig((curr) => ({ ...curr, allowSilentUpdates: nextSilent }));
    }
  }, [daemonMediaProviders, daemonMediaProvidersFetchState]);

  const handleSettingsDraftChange = useCallback((draft: AppConfig) => {
    settingsDraftConfigRef.current = draft;
  }, []);

  const handlePrivacyConsentChoice = useCallback((share: boolean) => {
    const base = settingsDraftConfigRef.current ?? latestPersistedConfigRef.current;
    const installationId = share
      ? base.installationId ?? generateInstallationIdSafe()
      : null;
    void handleConfigPersist({
      ...base,
      installationId,
      privacyDecisionAt: Date.now(),
      telemetry: {
        ...(base.telemetry ?? {}),
        metrics: share,
        content: share,
      },
    });
  }, [handleConfigPersist]);

  /**
   * Explicit Composio API-key save. Called from the section-local
   * "Save key" button so secrets never ride the autosave keystroke
   * loop. Once the daemon confirms, we normalize the saved config
   * (strip the secret, store apiKeyConfigured + apiKeyTail) and feed
   * it back into local state so the saved-key badge appears.
   */
  const handleConfigPersistComposioKey = useCallback(
    async (composio: AppConfig['composio']) => {
      const next = await persistComposioConfigChange(
        latestPersistedConfigRef.current,
        composio,
      );
      latestPersistedConfigRef.current = next;
      saveConfig(next);
      setConfig(next);
    },
    [],
  );

  const handleModeChange = useCallback(
    (mode: AppConfig['mode']) => {
      const next = { ...latestPersistedConfigRef.current, mode };
      latestPersistedConfigRef.current = next;
      saveConfig(next);
      setConfig(next);
    },
    [],
  );

  const handleAgentChange = useCallback(
    (agentId: string) => {
      const next = { ...latestPersistedConfigRef.current, agentId };
      latestPersistedConfigRef.current = next;
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [],
  );

  const handleAgentModelChange = useCallback(
    (agentId: string, choice: { model?: string; reasoning?: string; serviceTier?: string }) => {
      const current = latestPersistedConfigRef.current;
      const prev = current.agentModels?.[agentId] ?? {};
      const merged = mergeAgentModelChoice(prev, choice);
      const nextAgentModels = {
        ...(current.agentModels ?? {}),
        [agentId]: merged,
      };
      const next = { ...current, agentModels: nextAgentModels };
      latestPersistedConfigRef.current = next;
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [],
  );

  // BYOK protocol switch — also flips `mode` to 'api' so the user does
  // not have to take a second step after picking a provider from the
  // inline switcher. The helper preserves any per-protocol fields the
  // user had previously configured for the target protocol.
  const handleApiProtocolChange = useCallback(
    (protocol: ApiProtocol) => {
      const next = switchApiProtocolConfig(
        latestPersistedConfigRef.current,
        protocol,
      );
      latestPersistedConfigRef.current = next;
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [],
  );

  // BYOK model picker — patches `model` (and the per-protocol shadow
  // copy) without touching apiKey/baseUrl so the user can swap models
  // mid-session without retyping their key.
  const handleApiModelChange = useCallback(
    (model: string) => {
      const next = updateCurrentApiProtocolConfig(
        latestPersistedConfigRef.current,
        { model },
      );
      latestPersistedConfigRef.current = next;
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [],
  );

  const handleChangeDefaultDesignSystem = useCallback(
    (designSystemId: string | null) => {
      const next = {
        ...latestPersistedConfigRef.current,
        designSystemId,
      };
      latestPersistedConfigRef.current = next;
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    },
    [],
  );

  const refreshAgents = useCallback(
    async (options?: { throwOnError?: boolean; agentCliEnv?: AppConfig['agentCliEnv'] }) => {
      if (options && Object.prototype.hasOwnProperty.call(options, 'agentCliEnv')) {
        const current = latestPersistedConfigRef.current;
        const nextConfig = clearStaleAmrModelChoiceOnProfileChange(current, {
          ...current,
          agentCliEnv: options.agentCliEnv ?? {},
        });
        latestPersistedConfigRef.current = nextConfig;
        amrModelsRef.current = null;
        saveConfig(nextConfig);
        setConfig(nextConfig);
        await syncConfigToDaemon(nextConfig);
      }
      const agentRequestId = beginAgentStreamRequest();
      setAgentsLoading(true);
      try {
        const next = await fetchAgentsStream({
          signal: agentStreamAbortRef.current?.signal,
          onAgent: (agent) => {
            if (!isCurrentAgentStreamRequest(agentRequestId)) return;
            setAgents((current) =>
              mergeAmrModelsIntoAgents(
                upsertAgent(current, agent),
                amrModelsRef.current,
              ),
            );
          },
        });
        const ordered = orderAgentsByRegistry(next);
        if (isCurrentAgentStreamRequest(agentRequestId)) {
          setAgents(mergeAmrModelsIntoAgents(ordered, amrModelsRef.current));
          setAgentsLoading(false);
        }
        return ordered;
      } catch (err) {
        if (!isCurrentAgentStreamRequest(agentRequestId)) return [];
        setAgentsLoading(false);
        if (options?.throwOnError) throw err;
        setAgents([]);
        return [];
      }
    },
    [beginAgentStreamRequest, isCurrentAgentStreamRequest],
  );

  useEffect(() => {
    if (!daemonLive || agentsLoading) return;

    const refreshIfDue = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - agentFocusRefreshLastRunRef.current < AGENT_FOCUS_REFRESH_THROTTLE_MS) return;
      agentFocusRefreshLastRunRef.current = now;
      void refreshAgents();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshIfDue();
    };

    window.addEventListener('focus', refreshIfDue);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', refreshIfDue);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [agentsLoading, daemonLive, refreshAgents]);

  useEffect(() => {
    const handleAppConfigChanged = () => {
      void fetchDaemonConfig().then((daemonConfig) => {
        const previous = latestPersistedConfigRef.current;
        const next = clearStaleAmrModelChoiceOnProfileChange(
          previous,
          mergeDaemonConfig(previous, daemonConfig),
        );
        const amrProfileChanged = amrProfileForConfig(previous) !== amrProfileForConfig(next);
        latestPersistedConfigRef.current = next;
        saveConfig(next);
        setConfig(next);
        // The native Develop menu changes the complete AMR account boundary,
        // not only the agent model catalog. Retire the old workspace selection,
        // context, directory and every account-scoped cache before refreshing
        // the new profile; otherwise prod workspace links remain mounted while
        // status/models/billing already point at feature-test.
        if (amrProfileChanged) notifyWorkspaceContextRefresh();
        amrModelsRef.current = null;
        restartAmrPolling();
        void refreshAgents();
      });
    };
    window.addEventListener(APP_CONFIG_CHANGED_EVENT, handleAppConfigChanged);
    return () => window.removeEventListener(APP_CONFIG_CHANGED_EVENT, handleAppConfigChanged);
  }, [refreshAgents, restartAmrPolling]);

  const handleCreateProject = useCallback(
    async (
      input: AppCreateProjectInput,
    ): Promise<boolean> => {
      // Honor an explicit `null` design system — the create panel defaults
      // to "None" for every kind now, and the user expects that to land
      // as a no-design-system project rather than silently inheriting the
      // workspace default.
      const derivedPendingPrompt =
      input.pendingPrompt ??
      (input.metadata?.promptTemplate?.prompt?.trim() || undefined);

      const metadata = mergeLinkedDirsIntoMetadata(input.metadata, input.linkedDirs);
      const kind = metadata?.kind ?? null;
      const fidelity = fidelityToTracking(metadata?.fidelity ?? null);
      const creationSource: 'blank' | 'template' | 'zip' | 'folder' =
        kind === 'template' ? 'template' : 'blank';
      let createWorkspaceContext: WorkspaceCollabContext | null = null;
      let optimisticProjectId: string | null = null;
      let result;
      try {
        // PRODUCT INVARIANT: ordinary project creation is local. Reuse a
        // current in-memory Workspace snapshot for `personal` + `local_only`
        // attribution when available, but never start identity discovery or
        // block creation on Workspace availability. Remote share/sync/move
        // operations retain their authoritative gates.
        const createWorkspaceState = workspaceContextStateRef.current;
        createWorkspaceContext = createWorkspaceState.failure === 'unsupported'
          ? null
          : workspaceResourceReadContext(createWorkspaceState);
        if (
          input.amrGatePrecheckWitness &&
          !amrBalanceGateScopesMatch(
            input.amrGatePrecheckWitness,
            amrBalanceGateScopeForWorkspaceContext(createWorkspaceContext),
          )
        ) {
          throw new Error('AMR_WORKSPACE_GATE_STALE');
        }
        // Home already accepted the run (including its balance gate), so move
        // into the project frame immediately. The id is client-owned and the
        // daemon already accepts that exact id for idempotent retries. Keep the
        // real ProjectView unmounted until the response settles; the pending
        // surface is deliberately read-free so an unpersisted project cannot
        // fan out unauthorized conversation/file/presence requests.
        if (input.autoSendFirstMessage) {
          optimisticProjectId = randomUUID();
          const now = Date.now();
          const optimisticProject: Project = {
            id: optimisticProjectId,
            name: input.name.trim(),
            skillId: input.skillId,
            designSystemId: input.designSystemId,
            createdAt: now,
            updatedAt: now,
            ...(derivedPendingPrompt ? { pendingPrompt: derivedPendingPrompt } : {}),
            ...(metadata ? { metadata } : {}),
            ...(input.appliedPluginSnapshotId
              ? { appliedPluginSnapshotId: input.appliedPluginSnapshotId }
              : {}),
            ...(createWorkspaceContext?.workspaceId
              ? { workspaceId: createWorkspaceContext.workspaceId }
              : {}),
          };
          rememberLocalProject(optimisticProjectId);
          flushSync(() => {
            setPendingProjectCreation({
              projectId: optimisticProjectId!,
              prompt: derivedPendingPrompt ?? '',
            });
            setProjects((current) => [
              optimisticProject,
              ...current.filter((project) => project.id !== optimisticProjectId),
            ]);
          });
          const optimisticRoute = {
            kind: 'project',
            projectId: optimisticProjectId,
            fileName: null,
          } as const;
          openWorkspaceTab(optimisticRoute);
          navigate(optimisticRoute);
        }
        result = await createProject({
          ...(optimisticProjectId ? { id: optimisticProjectId } : {}),
          name: input.name,
          skillId: input.skillId,
          ...(input.skillCatalogScope
            ? { skillCatalogScope: input.skillCatalogScope }
            : {}),
          designSystemId: input.designSystemId,
          ...(input.designSystemCatalogScope
            ? { designSystemCatalogScope: input.designSystemCatalogScope }
            : {}),
          pendingPrompt: derivedPendingPrompt,
          metadata,
          ...(input.conversationMode ? { conversationMode: input.conversationMode } : {}),
          ...(input.pluginId ? { pluginId: input.pluginId } : {}),
          ...(input.pluginSource ? { pluginSource: input.pluginSource } : {}),
          ...(input.appliedPluginSnapshotId
            ? { appliedPluginSnapshotId: input.appliedPluginSnapshotId }
            : {}),
          ...(input.pluginInputs ? { pluginInputs: input.pluginInputs } : {}),
          workspaceContext: createWorkspaceContext,
        });
      } catch (err) {
        const errorCode =
          err instanceof Error && err.message.trim()
            ? err.message
            : 'CREATE_REQUEST_FAILED';
        trackProjectCreateResult(
          analytics.track,
          {
            page_name: 'home',
            area: 'new_project',
            project_source: 'create_button',
            project_id: null,
            project_kind: projectKindFromMetadataToTracking(metadata),
            fidelity,
            result: 'failed',
            error_code: errorCode,
          },
          { requestId: input.requestId },
        );
        if (optimisticProjectId) {
          clearLocalProject(optimisticProjectId);
          removeWorkspaceProjectTabs(optimisticProjectId);
          setProjects((current) => current.filter((project) => project.id !== optimisticProjectId));
          setPendingProjectCreation((current) =>
            current?.projectId === optimisticProjectId ? null : current);
          if (
            routeRef.current.kind === 'project'
            && routeRef.current.projectId === optimisticProjectId
          ) {
            navigate({ kind: 'home', view: 'home' });
          }
          setProjectCreateError(errorCode);
          return false;
        }
        throw err;
      }
      if (!result) {
        trackProjectCreateResult(
          analytics.track,
          {
            page_name: 'home',
            area: 'new_project',
            project_source: 'create_button',
            project_id: null,
            project_kind: projectKindFromMetadataToTracking(metadata),
            fidelity,
            ...(input.pluginId ? { plugin_id: input.pluginId } : {}),
            ...(input.pluginType ? { plugin_type: input.pluginType } : {}),
            result: 'failed',
            error_code: 'CREATE_REQUEST_FAILED',
          },
          { requestId: input.requestId },
        );
        return false;
      }
      const project = result.appliedPluginSnapshotId
        ? {
            ...result.project,
            appliedPluginSnapshotId: result.appliedPluginSnapshotId,
          }
        : result.project;
      if (optimisticProjectId) {
        rememberLocalProject(project.id);
        flushSync(() => {
          setProjects((curr) => [
            project,
            ...curr.filter((candidate) => candidate.id !== project.id),
          ]);
        });
      }
      try {
        const pendingFiles = Array.isArray(input.pendingFiles)
          ? input.pendingFiles.filter((file): file is File => file instanceof File)
          : [];
        // Flip the project onto the user-picked working directory BEFORE
        // uploading staged Home attachments. `replaceProjectWorkingDir` changes
        // `metadata.baseDir`, so the project starts reading from the external
        // folder. If we uploaded first, the staged files would land in the
        // temporary managed `.od/projects/<id>` root and then silently vanish
        // from Design Files and the first auto-send context once the working
        // dir flips. Doing the handoff first means the initial upload lands in
        // the final tree.
        const userWorkingDir = metadata?.userWorkingDir;
        let workingDirHandoffFailed = false;
        if (userWorkingDir) {
          try {
            await replaceProjectWorkingDir(
              result.project.id,
              userWorkingDir,
              input.userWorkingDirToken,
              createWorkspaceContext,
            );
          } catch (err) {
            // The desktop working-dir token is short-lived (~60s TTL); if the
            // user lingered on Home or the POST was otherwise rejected, the
            // handoff fails AFTER the project already exists. Do NOT swallow
            // this and do NOT proceed: uploading staged attachments or
            // auto-sending the first message would target the managed
            // `.od/projects/<id>` root the user did not choose. Mark the
            // handoff as failed so the upload + auto-send branches below are
            // skipped, then surface a create-time error so the user can
            // re-pick the working directory from inside the project.
            console.warn('Failed to set working directory for new project', userWorkingDir, err);
            workingDirHandoffFailed = true;
            setWorkingDirError(
              `Couldn't apply the chosen folder "${userWorkingDir}". The project was created in the default location — re-pick the working directory from the project before uploading files or sending a message.`,
            );
          }
        }
        let firstMessageAttachments: ChatAttachment[] = [];
        if (!workingDirHandoffFailed && pendingFiles.length > 0) {
          // Home composer attaches stay client-side until submit lands a
          // project; the actual upload happens here. v2 doc wants one
          // file_upload_result per surface — `page_name='home'` /
          // `area='chat_composer'` so it's distinguishable from the
          // file_manager Upload button and the chat_panel composer.
          const cohort = deriveUploadCohort(pendingFiles);
          const uploadResult = await uploadProjectFiles(
            result.project.id,
            pendingFiles,
            undefined,
            createWorkspaceContext,
          );
          firstMessageAttachments = uploadResult.uploaded;
          const partial = uploadResult.failed.length > 0;
          if (partial) {
            console.warn('Some Home attachments failed to upload', uploadResult.failed);
          }
          trackFileUploadResult(analytics.track, {
            page_name: 'home',
            area: 'chat_composer',
            project_id: result.project.id,
            ...cohort,
            result: partial ? 'failed' : 'success',
            ...(partial && uploadResult.error
              ? { error_code: uploadResult.error }
              : {}),
          });
        }
        trackProjectCreateResult(
          analytics.track,
          {
            page_name: 'home',
            area: 'new_project',
            project_source: 'create_button',
            project_id: result.project.id,
            project_kind: projectKindFromMetadataToTracking(metadata),
            fidelity,
            ...(input.pluginId ? { plugin_id: input.pluginId } : {}),
            ...(input.pluginType ? { plugin_type: input.pluginType } : {}),
            result: 'success',
          },
          { requestId: input.requestId },
        );
        // PluginLoopHome flow: the user already typed (or accepted) the
        // first message on Home. Mark this project so ProjectView fires
        // sendMessage(pendingPrompt) once on mount instead of just
        // pre-filling the composer. Scoped to sessionStorage so a page
        // reload after the run has started does not refire.
        if (
          !workingDirHandoffFailed &&
          input.autoSendFirstMessage &&
          (derivedPendingPrompt !== undefined || firstMessageAttachments.length > 0)
        ) {
          try {
            window.sessionStorage.setItem(
              `od:auto-send-first:${result.project.id}`,
              '1',
            );
            if (derivedPendingPrompt !== undefined) {
              window.sessionStorage.setItem(
                `od:auto-send-prompt:${result.project.id}`,
                derivedPendingPrompt,
              );
            } else {
              window.sessionStorage.removeItem(
                `od:auto-send-prompt:${result.project.id}`,
              );
            }
            if (input.amrGatePrecheckWitness) {
              window.sessionStorage.setItem(
                `od:auto-send-amr-gate-witness:${result.project.id}`,
                JSON.stringify(input.amrGatePrecheckWitness),
              );
            } else {
              window.sessionStorage.removeItem(
                `od:auto-send-amr-gate-witness:${result.project.id}`,
              );
            }
            window.sessionStorage.removeItem(
              `od:auto-send-amr-gate-ok:${result.project.id}`,
            );
            if (firstMessageAttachments.length > 0) {
              window.sessionStorage.setItem(
                `od:auto-send-attachments:${result.project.id}`,
                JSON.stringify(firstMessageAttachments),
              );
            } else {
              window.sessionStorage.removeItem(
                `od:auto-send-attachments:${result.project.id}`,
              );
            }
            if (input.initialRunContext && Object.keys(input.initialRunContext).length > 0) {
              window.sessionStorage.setItem(
                `od:auto-send-context:${result.project.id}`,
                JSON.stringify(input.initialRunContext),
              );
            } else {
              window.sessionStorage.removeItem(
                `od:auto-send-context:${result.project.id}`,
              );
            }
          } catch {
            /* sessionStorage may be unavailable (e.g. SSR / private mode); fall
               back to manual send. */
          }
        }
        // Home recommendation handoff: now that the project exists and its id is
        // known, stash the onboarding entry keyed by that id. Studio consumes it
        // by the same id on mount. Keying by id (instead of a single global slot
        // written before create) removes the race where opening an unrelated
        // project mid-create could steal the personalized funnel context, and
        // means a failed/aborted create leaves nothing behind.
        if (input.onboardingEntry) {
          // Cache the prefilled seed prompt WITH the entry so the first-prompt
          // funnel's `has_prefilled_prompt` comparison base survives a
          // reopen-before-send (project.pendingPrompt is wiped on first mount).
          stashOnboardingEntryForProject(result.project.id, {
            ...input.onboardingEntry,
            ...(derivedPendingPrompt
              ? { seedPrompt: derivedPendingPrompt.trim() }
              : {}),
          });
        }
        if (!optimisticProjectId) {
          rememberLocalProject(project.id);
          flushSync(() => {
            setProjects((curr) => [
              project,
              ...curr.filter((candidate) => candidate.id !== project.id),
            ]);
          });
        }
      } catch (err) {
        if (!optimisticProjectId) throw err;
        const errorCode =
          err instanceof Error && err.message.trim() ? err.message : 'PROJECT_SETUP_FAILED';
        console.warn('Failed to finish setting up new project', project.id, err);
        setProjectCreateError(errorCode);
      } finally {
        setPendingProjectCreation((current) =>
          current?.projectId === optimisticProjectId ? null : current,
        );
      }
      const projectRoute = {
        kind: 'project',
        projectId: project.id,
        fileName: null,
      } as const;
      // The Home auto-send path already owns this route from the optimistic
      // handoff. Do not re-navigate after persistence: if the user deliberately
      // backed out while creation finished, reopening the project would steal
      // focus. Non-optimistic creation paths retain the existing navigation.
      if (!optimisticProjectId) {
        openWorkspaceTab(projectRoute);
        navigate(projectRoute);
      }
      return true;
    },
    [analytics.track, clearLocalProject, rememberLocalProject],
  );

  const handleCreateProjectFromDesignSystem = useCallback(
    async (designSystemId: string, designSystemTitle: string) => {
      // "Create with this design system" must NOT assume a prototype. Route
      // the click through the hidden default design router (od-default) —
      // exactly like a free-form Home prompt. The preset prompt seeds the
      // conversation and is auto-sent so the router can infer the task type
      // from the brief, asking only when the route remains ambiguous. `kind`
      // stays the neutral 'other' so no surface-specific default leaks back
      // in on the daemon side.
      const presetPrompt = t('nextStep.brandCreateDesignPrompt', {
        designSystem: designSystemTitle,
      });
      await handleCreateProject({
        name: t('common.untitled'),
        skillId: null,
        designSystemId,
        pluginId: DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
        pluginInputs: { prompt: presetPrompt },
        pendingPrompt: presetPrompt,
        autoSendFirstMessage: true,
        conversationMode: 'design',
        metadata: {
          kind: 'other',
          nameSource: 'generated',
        },
      });
    },
    [handleCreateProject, t],
  );

  const resolveSourceProjectWorkspaceContext = useCallback(async (
    sourceProjectId: string,
  ): Promise<WorkspaceCollabContext | null> => {
    const routeProject = routeProjectSnapshotRef.current?.project;
    const sourceProject =
      routeProject?.id === sourceProjectId
        ? routeProject
        : projects.find((project) => project.id === sourceProjectId);
    const persistedWorkspaceId = sourceProject?.workspaceId?.trim() ?? '';
    if (!persistedWorkspaceId) return null;

    const routeContext = projectRouteWorkspaceContextRef.current;
    if (routeContext?.workspaceId === persistedWorkspaceId) return routeContext;
    const ambientContext = workspaceContextRef.current;
    if (ambientContext?.workspaceId === persistedWorkspaceId) return ambientContext;

    const resolved = await resolveBoundProjectWorkspaceContext(persistedWorkspaceId);
    if (!resolved) {
      throw new Error('source project Workspace authority is unavailable');
    }
    return resolved;
  }, [projects]);

  const handleCreateDesignSystemFromProject = useCallback(
    async (
      sourceProjectId: string,
      input: { name?: string; pendingPrompt?: string },
    ) => {
      const sourceWorkspaceContext =
        await resolveSourceProjectWorkspaceContext(sourceProjectId);
      const result = await createDesignSystemProjectFromProject(
        sourceProjectId,
        input,
        sourceWorkspaceContext,
      );
      try {
        window.sessionStorage.setItem(`od:auto-send-first:${result.project.id}`, '1');
        const pendingPrompt = input.pendingPrompt ?? result.project.pendingPrompt;
        if (pendingPrompt !== undefined) {
          window.sessionStorage.setItem(
            `od:auto-send-prompt:${result.project.id}`,
            pendingPrompt,
          );
        }
      } catch {
        // If sessionStorage is unavailable, the project still opens with the
        // pending prompt ready for the user to send manually.
      }
      rememberLocalProject(result.project.id);
      setProjects((curr) => [
        result.project,
        ...curr.filter((p) => p.id !== result.project.id),
      ]);
      void refreshDesignSystems();
      navigate({
        kind: 'project',
        projectId: result.project.id,
        conversationId: result.conversationId,
        fileName: null,
      });
    },
    [refreshDesignSystems, rememberLocalProject, resolveSourceProjectWorkspaceContext],
  );

  const handleDuplicateProject = useCallback(
    async (sourceProjectId: string, input: { name?: string } = {}) => {
      const sourceWorkspaceContext =
        await resolveSourceProjectWorkspaceContext(sourceProjectId);
      const result = await duplicateProject(sourceProjectId, input, sourceWorkspaceContext);
      rememberLocalProject(result.project.id);
      setProjects((curr) => [
        result.project,
        ...curr.filter((p) => p.id !== result.project.id),
      ]);
      navigate({
        kind: 'project',
        projectId: result.project.id,
        conversationId: result.conversationId,
        fileName: null,
      });
    },
    [rememberLocalProject, resolveSourceProjectWorkspaceContext],
  );

  const handleCreatePluginShareProject = useCallback(
    async (
      pluginId: string,
      action: PluginShareAction,
      locale?: string,
    ): Promise<PluginShareProjectOutcome> => {
      // Best-effort, NOT `resolvedWorkspaceContextForWrite`: that helper throws
      // while the identity read is in flight, and refusing this create would be
      // a new block on a path that works today. Sending the context whenever it
      // is known is a strict improvement — this call used to send none, ever —
      // and the daemon binds a headerless create to its own signed-in workspace
      // (`createdProjectWorkspaceHome`), so the loading window no longer
      // produces an orphan either way.
      const outcome = await createPluginShareProject(
        pluginId,
        action,
        locale,
        workspaceContextStateRef.current.context,
      );
      if (!outcome.ok) return outcome;
      try {
        window.sessionStorage.setItem(
          `od:auto-send-first:${outcome.project.id}`,
          '1',
        );
        if (outcome.project.pendingPrompt !== undefined) {
          window.sessionStorage.setItem(
            `od:auto-send-prompt:${outcome.project.id}`,
            outcome.project.pendingPrompt,
          );
        }
      } catch {
        // If sessionStorage is unavailable, the project still opens with
        // the prepared prompt in the composer.
      }
      const project = outcome.appliedPluginSnapshotId
        ? {
            ...outcome.project,
            appliedPluginSnapshotId: outcome.appliedPluginSnapshotId,
          }
        : outcome.project;
      rememberLocalProject(project.id);
      setProjects((curr) => [
        project,
        ...curr.filter((p) => p.id !== project.id),
      ]);
      navigate({
        kind: 'project',
        projectId: project.id,
        fileName: null,
      });
      return outcome;
    },
    [rememberLocalProject],
  );

  const handleImportClaudeDesign = useCallback(async (
    file: File,
  ): Promise<ImportClaudeDesignOutcome> => {
    try {
      const result = await importClaudeDesignZip(
        file,
        resolvedWorkspaceContextForWrite(workspaceContextStateRef.current),
      );
      rememberLocalProject(result.project.id);
      setProjects((curr) => [
        result.project,
        ...curr.filter((p) => p.id !== result.project.id),
      ]);
      navigate({
        kind: 'project',
        projectId: result.project.id,
        fileName: result.entryFile,
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'The ZIP could not be imported.',
      };
    }
  }, [rememberLocalProject]);

  const handleImportFolder = useCallback(async (baseDir: string) => {
    const result = await importFolderProject(
      { baseDir },
      resolvedWorkspaceContextForWrite(workspaceContextStateRef.current),
    );
    rememberLocalProject(result.project.id);
    setProjects((curr) => [result.project, ...curr.filter((p) => p.id !== result.project.id)]);
    navigate({
      kind: 'project',
      projectId: result.project.id,
      fileName: null,
    });
  }, [rememberLocalProject]);

  // PR #974: on desktop, the host bridge owns the picker and import POST
  // atomically. The renderer never sees the path, token, or daemon DTO;
  // it receives host-owned project identifiers and refreshes project state
  // through the normal daemon API.
  const handleImportFolderResponse = useCallback(async (result: OpenDesignHostProjectImportSuccess) => {
    rememberLocalProject(result.projectId);
    const importedProjectContext = workspaceContextRef.current;
    const project = await getProject(result.projectId, importedProjectContext);
    if (project != null) {
      setProjects((curr) => [project, ...curr.filter((p) => p.id !== project.id)]);
    } else {
      // Daemon hasn't materialized the full record yet (race between the
      // host's import POST and our /api/projects read). Seed a minimal
      // placeholder so the route stays alive and ProjectView mounts; the
      // pending-local id keeps reconcileFetchedProjects from evicting the
      // stub until a project-list snapshot actually includes it, and the
      // next refresh swaps it for the real Project record. Without the
      // stub, a stale `[]` list response would replace `projects` with `[]`
      // and the route-guard effect would bounce the user back to Home.
      const stub: Project = {
        id: result.projectId,
        name: '',
        skillId: null,
        designSystemId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setProjects((curr) => [stub, ...curr.filter((p) => p.id !== stub.id)]);
      const request = beginProjectListRequest(workspaceProjectView);
      const list = await listCurrentWorkspaceProjects({ workspaceView: workspaceProjectView });
      reconcileFetchedProjects(list, request);
    }
    navigate({
      kind: 'project',
      projectId: result.projectId,
      fileName: null,
    });
  }, [beginProjectListRequest, listCurrentWorkspaceProjects, rememberLocalProject, reconcileFetchedProjects, workspaceProjectView]);

  const rememberAuthoritativeProjectName = useCallback((
    key: string,
    name: string | null,
    isCurrent: () => boolean = () => true,
  ) => {
    setAuthoritativeProjectNames((current) => {
      if (!isCurrent()) return current;
      if (name) {
        if (current[key] === name) return current;
        return { ...current, [key]: name };
      }
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const resolveAuthoritativeProjectName = useCallback(async (
    projectId: string,
    expectedAuthorizationKey: string,
  ): Promise<ProjectNameAuthorityResolution> => {
    const context = projectRouteWorkspaceContextRef.current;
    const key = projectViewAuthorizationLifetimeKey(projectId, context);
    if (key !== expectedAuthorizationKey) return { kind: 'stale' };
    const authorizationGeneration = projectAuthorizationGenerationRef.current;
    const requestGeneration =
      (projectNameAuthorityRequestGenerationRef.current.get(key) ?? 0) + 1;
    projectNameAuthorityRequestGenerationRef.current.set(key, requestGeneration);
    const authorityRequestIsCurrent = () =>
      projectAuthorizationGenerationRef.current === authorizationGeneration
      && projectNameAuthorityRequestGenerationRef.current.get(key) === requestGeneration
      && projectViewAuthorizationLifetimeKey(
        projectId,
        projectRouteWorkspaceContextRef.current,
      ) === key;
    const lookup = await fetchTeamProjectCatalogEntry(projectId, context, false);
    if (!authorityRequestIsCurrent()) {
      // Workspace/member changed while the catalog request was in flight.
      // A newer same-key request also supersedes this response, so an older
      // catalog snapshot cannot roll back a rename that resolved first.
      return { kind: 'stale' };
    }
    if (!lookup.ok) {
      // A transport failure is not evidence that ownership/title authority
      // changed. Keep the last catalog title until a successful read says so.
      return {
        kind: 'resolved',
        name: authoritativeProjectNamesRef.current[key] ?? null,
      };
    }
    const catalogProject = lookup.project;
    const catalogName = catalogProject?.name?.trim() || null;
    const belongsToAnotherMember = Boolean(
      catalogProject
      && catalogProject.ownerMemberId !== context?.workspaceMemberId,
    );
    const authoritativeName = belongsToAnotherMember ? catalogName : null;
    rememberAuthoritativeProjectName(key, authoritativeName, authorityRequestIsCurrent);
    if (authoritativeName) {
      // Merge title only into the already-authorized local row; never construct
      // a catalog-shaped Project because catalog rows do not carry workspace
      // binding or the full project metadata.
      setProjects((current) => {
        if (!authorityRequestIsCurrent()) return current;
        return current.map((project) =>
          project.id === projectId
            && project.workspaceId
            && (!context?.workspaceId || project.workspaceId === context.workspaceId)
            ? { ...project, name: authoritativeName }
            : project);
      });
    }
    return { kind: 'resolved', name: authoritativeName };
  }, [rememberAuthoritativeProjectName]);

  const handleOpenProject = useCallback(async (
    id: string,
    fileName?: string,
    projectTitleHint?: ProjectTitleHint,
  ): Promise<boolean> => {
    const routeFileName = fileName ?? null;
    const hintedProjectName = projectTitleHint?.name.trim() || null;
    const requiresBoundCatalogProject = projectTitleHint?.authoritative === true;
    const openingAccountGeneration = currentWorkspaceAccountGeneration();
    let openingContext = workspaceContextRef.current;
    const knownUnboundLocalProject = !requiresBoundCatalogProject
      && projectsRef.current.some((project) =>
        project.id === id && !project.workspaceId?.trim()
      );
    let pendingContextWitness: Awaited<
      ReturnType<typeof resolveCurrentWorkspaceContextReadWitness>
    > | null = null;
    if (
      !knownUnboundLocalProject
      && (
        !openingContext
        || workspaceContextStateRef.current.identityChangePending === true
      )
    ) {
      try {
        pendingContextWitness = await resolveCurrentWorkspaceContextReadWitness();
      } catch {
        pendingContextWitness = null;
      }
      if (currentWorkspaceAccountGeneration() !== openingAccountGeneration) return false;
      if (pendingContextWitness) {
        if (!pendingContextWitness.isStillCurrent()) return false;
        openingContext = pendingContextWitness.context;
      } else {
        // The richer hook may have settled while the directory read failed or
        // was invalidated. Reuse it only when no identity change remains in
        // flight; otherwise a cached pre-switch context is not authority.
        const liveState = workspaceContextStateRef.current;
        openingContext = liveState.identityChangePending ? null : liveState.context;
      }
    }
    const openingAuthorizationGeneration = projectAuthorizationGenerationRef.current;
    const openingScopeKey = projectListScopeKey(openingContext);
    const expectedWorkspaceId = openingContext?.workspaceId ?? null;
    const hintMatchesOpeningScope =
      !projectTitleHint
      || Boolean(
        expectedWorkspaceId
        && openingContext?.workspaceMemberId
        && projectTitleHint.workspaceId === expectedWorkspaceId
        && projectTitleHint.workspaceMemberId === openingContext.workspaceMemberId,
      );
    if (requiresBoundCatalogProject && !hintMatchesOpeningScope) return false;
    // A stale non-authoritative card may still open the current local row, but
    // its old-workspace title must never overwrite that row. Authoritative
    // catalog cards fail closed above; own/local cards simply drop the hint.
    const catalogName = hintMatchesOpeningScope ? hintedProjectName : null;
    const titleAuthorityKey = projectViewAuthorizationLifetimeKey(
      id,
      openingContext,
    );
    const openingScopeIsCurrent = () => {
      if (currentWorkspaceAccountGeneration() !== openingAccountGeneration) return false;
      if (!pendingContextWitness) {
        return projectAuthorizationGenerationRef.current === openingAuthorizationGeneration
          && projectListScopeKey(workspaceContextRef.current) === openingScopeKey;
      }
      if (!pendingContextWitness.isStillCurrent()) return false;
      const liveState = workspaceContextStateRef.current;
      const liveContext = liveState.context ?? liveState.resourceReadIdentity?.context ?? null;
      if (!openingContext) {
        return liveContext === null && liveState.identityChangePending !== true;
      }
      return liveContext
        ? workspaceIdentityCacheKey(liveContext) === workspaceIdentityCacheKey(openingContext)
        : liveState.loading === true || liveState.identityChangePending === true;
    };
    const canUseLocalProject = (project: Project) => {
      if (project.workspaceId) return project.workspaceId === expectedWorkspaceId;
      return !requiresBoundCatalogProject;
    };
    const navigateToOpenedProject = (project: Project) => {
      const projectWorkspaceId = project.workspaceId?.trim() ?? '';
      projectOpenWorkspaceWitnessRef.current =
        projectWorkspaceId
        && openingContext?.workspaceId === projectWorkspaceId
        && openingContext.workspaceMemberId.trim().length > 0
        && openingContext.memberStatus === 'active'
        && openingContext.lifecycleState !== 'deleted'
          ? {
              projectId: project.id,
              projectWorkspaceId,
              context: openingContext,
              accountGeneration: openingAccountGeneration,
            }
          : null;
      navigate({ kind: 'project', projectId: id, fileName: routeFileName });
      return true;
    };
    const rememberHintAuthority = () => {
      if (projectTitleHint?.authoritative && catalogName && openingScopeIsCurrent()) {
        // A catalog card is an authority response too. Invalidate any older
        // deep-link/metadata lookup that started before this newer UI snapshot
        // was accepted, otherwise its late response could roll the title back.
        const nextRequestGeneration =
          (projectNameAuthorityRequestGenerationRef.current.get(titleAuthorityKey) ?? 0) + 1;
        projectNameAuthorityRequestGenerationRef.current.set(
          titleAuthorityKey,
          nextRequestGeneration,
        );
        rememberAuthoritativeProjectName(
          titleAuthorityKey,
          catalogName,
          openingScopeIsCurrent,
        );
      }
    };
    // EntryShell's shared-project grid has already reconciled local SQLite with
    // the workspace catalog. Preserve its authoritative display name during the
    // route transition instead of reopening the stale local placeholder by id.
    //
    // The catalog row is NOT a local project record: it may omit workspaceId
    // and other binding fields. Treat it as a name hint only, and merge it into
    // an already-bound local row. If App has not observed that row yet, keep
    // loading through GET/pull/list below instead of inserting an unbound
    // catalog-shaped Project into local state.
    if (
      catalogName
      && projectsRef.current.some((project) => project.id === id && canUseLocalProject(project))
    ) {
      setProjects((current) => {
        if (!openingScopeIsCurrent()) return current;
        const existingIndex = current.findIndex(
          (project) => project.id === id && canUseLocalProject(project),
        );
        if (existingIndex < 0) return current;
        const existing = current[existingIndex]!;
        if (existing.name === catalogName) return current;
        const next = [...current];
        next[existingIndex] = {
          ...existing,
          name: catalogName,
        };
        return next;
      });
      rememberHintAuthority();
      const localProject = projectsRef.current.find(
        (project) => project.id === id && canUseLocalProject(project),
      );
      return localProject ? navigateToOpenedProject(localProject) : false;
    }
    if (
      !catalogName
      && projectsRef.current.some(
        (project) => project.id === id && canUseLocalProject(project),
      )
    ) {
      const localProject = projectsRef.current.find(
        (project) => project.id === id && canUseLocalProject(project),
      );
      return localProject ? navigateToOpenedProject(localProject) : false;
    }
    try {
      const project = await getProject(id, openingContext);
      if (!openingScopeIsCurrent()) return false;
      if (project && canUseLocalProject(project)) {
        const openedProject = catalogName ? { ...project, name: catalogName } : project;
        setProjects((curr) => openingScopeIsCurrent()
          ? [
              openedProject,
              ...curr.filter((candidate) => candidate.id !== openedProject.id),
            ]
          : curr);
        rememberHintAuthority();
        return navigateToOpenedProject(openedProject);
      }
      const { pulled } = await pullTeamSharedProjectIfAvailable(id, openingContext);
      if (!openingScopeIsCurrent()) return false;
      if (pulled) {
        const pulledProject = await getProject(id, openingContext);
        if (!openingScopeIsCurrent()) return false;
        if (pulledProject && canUseLocalProject(pulledProject)) {
          const openedProject = catalogName
            ? { ...pulledProject, name: catalogName }
            : pulledProject;
          setProjects((curr) => openingScopeIsCurrent()
            ? [
                openedProject,
                ...curr.filter((candidate) => candidate.id !== openedProject.id),
              ]
            : curr);
          rememberHintAuthority();
          return navigateToOpenedProject(openedProject);
        }
      }
      const request = beginProjectListRequest('all');
      const list = await listCurrentWorkspaceProjects({ workspaceView: 'all' });
      if (!openingScopeIsCurrent()) return false;
      const reconciledList = catalogName
        ? list.map((candidate) =>
            candidate.id === id && canUseLocalProject(candidate)
              ? { ...candidate, name: catalogName }
              : candidate)
        : list;
      reconcileFetchedProjects(reconciledList, request);
      const fetchedProject = locallyDeletedProjectIdsRef.current.has(id)
        ? undefined
        : reconciledList.find(
            (candidate) => candidate.id === id && canUseLocalProject(candidate),
          );
      if (fetchedProject) {
        rememberHintAuthority();
        return navigateToOpenedProject(fetchedProject);
      }
    } catch {
      // Fall through to the same visible missing-project state. The daemon can
      // return 404 or transiently fail while reconciling a deleted backing
      // project; either way the user needs feedback instead of a silent bounce.
    }
    if (!openingScopeIsCurrent()) return false;
    setProjectOpenError(t('project.missing'));
    return false;
  }, [
    beginProjectListRequest,
    listCurrentWorkspaceProjects,
    reconcileFetchedProjects,
    rememberAuthoritativeProjectName,
    t,
  ]);

  useEffect(() => {
    if (!config.pet?.enabled || !daemonLive) {
      setPetTaskCenter({ running: [], queued: [], recent: [] });
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      const runs = await listProjectRuns();
      if (cancelled) return;
      setPetTaskCenter(buildPetTaskCenter(projects, runs));
    };
    const handleRunsChanged = () => {
      void refresh();
    };

    void refresh();
    window.addEventListener(RUNS_CHANGED_EVENT, handleRunsChanged);
    const id = window.setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      window.removeEventListener(RUNS_CHANGED_EVENT, handleRunsChanged);
      window.clearInterval(id);
    };
  }, [config.pet?.enabled, daemonLive, projects]);

  const handleOpenLiveArtifact = useCallback((projectId: string, artifactId: string) => {
    navigate({ kind: 'project', projectId, fileName: liveArtifactTabId(artifactId) });
  }, []);

  const handleDeleteProject = useCallback(async (id: string) => {
    // Carry the active workspace identity so the daemon's cross-workspace
    // ownership check actually runs — see deleteProject's docblock
    // (recvq5ecTkar91: a leaked-in project was really deletable, not just
    // visible, because this call sent no workspace headers at all).
    const mutationContext = workspaceContextRef.current;
    const mutationAccountGeneration = currentWorkspaceAccountGeneration();
    await deleteProjectApi(id, mutationContext);
    if (mutationContext) {
      removeProjectFromDisplaySnapshots({
        accountGeneration: mutationAccountGeneration,
        context: mutationContext,
        projectId: id,
      });
    }
    clearLocalProject(id, { deleted: true });
    removeWorkspaceProjectTabs(id);
    iframeKeepAlivePool.evictProject(id, { includeActive: true });
    setProjects((curr) => curr.filter((p) => p.id !== id));
    if (route.kind === 'project' && route.projectId === id) {
      navigate({ kind: 'home', view: 'home' });
    }
    return true;
  }, [clearLocalProject, iframeKeepAlivePool, route]);

  const handleRenameProject = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const previous = projectsRef.current.find((project) => project.id === id) ?? null;
    const renameContext = workspaceContextRef.current;
    const renameAccountGeneration = currentWorkspaceAccountGeneration();
    const renameScopeKey = projectListScopeKey(renameContext);
    const renameProjectionKey = JSON.stringify([
      renameAccountGeneration,
      renameScopeKey,
      id,
    ]);
    let renameState = projectRenameStatesRef.current.get(renameProjectionKey);
    if (!renameState || renameState.pending === 0) {
      if (!previous) return;
      renameState = {
        generation: 0,
        confirmed: previous,
        pending: 0,
        tail: Promise.resolve(),
      };
      projectRenameStatesRef.current.set(renameProjectionKey, renameState);
    }
    const renameGeneration = ++renameState.generation;
    renameState.pending += 1;
    projectListMutationVersionRef.current += 1;
    const renameMutationVersion = projectListMutationVersionRef.current;
    const optimistic = { ...(previous ?? renameState.confirmed), name: trimmed };
    pendingProjectNameProjectionsRef.current.set(renameProjectionKey, {
      accountGeneration: renameAccountGeneration,
      scopeKey: renameScopeKey,
      project: optimistic,
      mutationVersion: renameMutationVersion,
      confirmed: false,
    });
    setProjects((curr) =>
      curr.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
    );
    if (renameContext) {
      patchProjectDisplaySnapshots({
        accountGeneration: renameAccountGeneration,
        context: renameContext,
        patch: (cachedProjects) => cachedProjects.map((project) =>
          project.id === id ? { ...project, name: trimmed } : project),
      });
    }
    const runRename = async () => {
      const persisted = await patchProject(id, { name: trimmed }, renameContext);
      if (persisted) renameState.confirmed = persisted;
      const isLatestQueuedRename =
        projectRenameStatesRef.current.get(renameProjectionKey) === renameState
        && renameState.generation === renameGeneration;
      if (!isLatestQueuedRename) return;
      const nextProject = persisted ?? renameState.confirmed;
      const pendingProjection = pendingProjectNameProjectionsRef.current.get(renameProjectionKey);
      if (pendingProjection?.mutationVersion === renameMutationVersion) {
        pendingProjection.project = nextProject;
        pendingProjection.confirmed = true;
      }
      if (renameContext) {
        patchProjectDisplaySnapshots({
          accountGeneration: renameAccountGeneration,
          context: renameContext,
          patch: (cachedProjects) => cachedProjects.map((project) =>
            project.id === id && (persisted || project.name === trimmed)
              ? {
                  ...project,
                  name: nextProject.name,
                  metadata: nextProject.metadata,
                  updatedAt: nextProject.updatedAt,
                }
              : project),
        });
      }
      const isCurrentScope =
        currentWorkspaceAccountGeneration() === renameAccountGeneration
        && projectListScopeKey(workspaceContextRef.current) === renameScopeKey;
      if (!isCurrentScope) return;
      if (!persisted) {
        setProjects((current) => current.map((project) =>
          project.id === id && project.name === trimmed
            ? {
                ...project,
                name: nextProject.name,
                metadata: nextProject.metadata,
                updatedAt: nextProject.updatedAt,
              }
            : project
        ));
        await refreshProjects();
        return;
      }
      setProjects((current) => current.map((project) =>
        project.id === id
          ? {
              ...project,
              name: persisted.name,
              metadata: persisted.metadata,
              updatedAt: persisted.updatedAt,
            }
          : project
      ));
      await refreshProjects();
    };
    const queued = renameState.tail.then(runRename, runRename);
    renameState.tail = queued.then(
      () => undefined,
      () => undefined,
    ).finally(() => {
      renameState.pending -= 1;
      if (
        renameState.pending === 0
        && projectRenameStatesRef.current.get(renameProjectionKey) === renameState
      ) {
        projectRenameStatesRef.current.delete(renameProjectionKey);
      }
    });
    await queued;
  }, [refreshProjects]);

  // The project header back button is an escape hatch back to Home. Avoid
  // depending on browser history here: tab restores and template-create flows
  // can leave an in-app history entry that points back to the same project.
  const handleBack = useCallback(() => {
    const currentProjectId = route.kind === 'project' ? route.projectId : null;
    navigate({ kind: 'home', view: 'home' }, {
      onCommit: () => {
        if (!currentProjectId) return;
        iframeKeepAlivePool.evictProject(currentProjectId, { includeActive: true });
      },
    });
  }, [iframeKeepAlivePool, route]);

  const handleClearPendingPrompt = useCallback(() => {
    const projectId = route.kind === 'project' ? route.projectId : null;
    if (!projectId) return;
    setProjects((curr) =>
      curr.map((p) =>
        p.id === projectId ? { ...p, pendingPrompt: undefined } : p,
      ),
    );
    const mutationContext = workspaceContextRef.current;
    if (mutationContext) {
      patchProjectDisplaySnapshots({
        accountGeneration: currentWorkspaceAccountGeneration(),
        context: mutationContext,
        patch: (cachedProjects) => cachedProjects.map((project) =>
          project.id === projectId ? { ...project, pendingPrompt: undefined } : project),
      });
    }
    void patchProject(projectId, { pendingPrompt: null }, mutationContext);
  }, [route]);

  const handleTouchProject = useCallback(() => {
    const projectId = route.kind === 'project' ? route.projectId : null;
    if (!projectId) return;
    const updatedAt = Date.now();
    setProjects((curr) =>
      curr.map((p) => (p.id === projectId ? { ...p, updatedAt } : p)),
    );
    const mutationContext = workspaceContextRef.current;
    if (mutationContext) {
      patchProjectDisplaySnapshots({
        accountGeneration: currentWorkspaceAccountGeneration(),
        context: mutationContext,
        patch: (cachedProjects) => cachedProjects.map((project) =>
          project.id === projectId ? { ...project, updatedAt } : project),
      });
    }
    void patchProject(projectId, { updatedAt }, mutationContext);
  }, [route]);

  const handleProjectChange = useCallback((updated: Project) => {
    // ProjectView is pinned to the opened project's persisted Workspace, which
    // can differ from the shell's ambient selection while a switch settles.
    // Patch every list projection for that exact principal so an inline rename
    // cannot restore an old title when the user next opens Personal or Team.
    const projectContext = projectRouteWorkspaceContextRef.current;
    const accountGeneration = currentWorkspaceAccountGeneration();
    // A cold deep link can mount from this route-owned snapshot before the
    // ambient project list resolves. Keep that independent row current too,
    // but only under the exact account + Workspace principal that opened it.
    const routeSnapshot = routeProjectSnapshotRef.current;
    const routeSnapshotContext =
      routeSnapshot?.workspaceContext
      ?? routeSnapshot?.workspaceScope?.context
      ?? null;
    const routeSnapshotMatches =
      routeRef.current.kind === 'project'
      && routeRef.current.projectId === updated.id
      && routeSnapshot?.project.id === updated.id
      && routeSnapshot.accountGeneration === accountGeneration
      && (routeSnapshot.project.workspaceId ?? null) === (updated.workspaceId ?? null)
      && (
        routeSnapshotContext === null && projectContext === null
        || (
          routeSnapshotContext !== null
          && projectContext !== null
          && workspaceIdentityCacheKey(routeSnapshotContext)
            === workspaceIdentityCacheKey(projectContext)
        )
      );
    if (routeSnapshotMatches) {
      routeProjectSnapshotRef.current = {
        ...routeSnapshot,
        project: updated,
      };
      setRouteProjectSnapshotRevision((current) => current + 1);
    }
    setProjects((curr) => {
      const previous = curr.find((p) => p.id === updated.id);
      if (
        previous
        && (
          previous.skillId !== updated.skillId
          || previous.designSystemId !== updated.designSystemId
          || previous.customInstructions !== updated.customInstructions
        )
      ) {
        iframeKeepAlivePool.evictProject(updated.id, { includeActive: true });
      }
      return curr.map((p) => (p.id === updated.id ? updated : p));
    });
    if (projectContext) {
      patchProjectDisplaySnapshots({
        accountGeneration,
        context: projectContext,
        patch: (cachedProjects) => cachedProjects.map((project) =>
          project.id === updated.id ? { ...project, ...updated } : project),
      });
    }
  }, [iframeKeepAlivePool]);

  const handleProjectRenameStarted = useCallback((
    optimistic: Project,
  ): ProjectRenameFenceToken => {
    const context = projectRouteWorkspaceContextRef.current;
    const accountGeneration = currentWorkspaceAccountGeneration();
    const scopeKey = projectListScopeKey(context);
    projectListMutationVersionRef.current += 1;
    const mutationVersion = projectListMutationVersionRef.current;
    const key = JSON.stringify([accountGeneration, scopeKey, optimistic.id]);
    pendingProjectNameProjectionsRef.current.set(
      key,
      {
        accountGeneration,
        scopeKey,
        project: optimistic,
        mutationVersion,
        confirmed: false,
      },
    );
    return {
      accountGeneration,
      scopeKey,
      projectId: optimistic.id,
      mutationVersion,
    };
  }, []);

  const handleProjectRenameSettled = useCallback((
    token: ProjectRenameFenceToken | null,
    confirmed: Project,
  ) => {
    if (!token || token.projectId !== confirmed.id) return;
    const key = JSON.stringify([token.accountGeneration, token.scopeKey, token.projectId]);
    const pending = pendingProjectNameProjectionsRef.current.get(key);
    if (!pending || pending.mutationVersion !== token.mutationVersion) return;
    pending.project = confirmed;
    pending.confirmed = true;
  }, []);

  // ProjectView's prompt-context signature derives from SkillSummary /
  // DesignSystemSummary fields, so a body-only registry edit (same name,
  // description, etc.) leaves every signature unchanged and the active
  // preview keeps serving stale prompt context. Settings → Skills /
  // Settings → Design Systems call back through these handlers after
  // every successful mutation; we drop any pool entry whose project
  // depends on the affected id — active or parked — so the next mount
  // recomposes the system prompt with the new body.

  const handleSkillsChanged = useCallback(
    (affectedSkillId?: string) => {
      void refreshSkills();
      void fetchDesignTemplates().then((list) => setDesignTemplates(list));
      iframeKeepAlivePool.evictMatching(
        (entry) => {
          const proj = projectsRef.current.find((p) => p.id === entry.projectId);
          if (!proj) return false;
          if (affectedSkillId) return proj.skillId === affectedSkillId;
          return proj.skillId != null;
        },
        { includeActive: true },
      );
    },
    [iframeKeepAlivePool, refreshSkills],
  );

  const handleDesignSystemsChanged = useCallback(
    (affectedDesignSystemId?: string) => {
      void refreshDesignSystems({ forceTeamMaterialization: true });
      iframeKeepAlivePool.evictMatching(
        (entry) => {
          const proj = projectsRef.current.find((p) => p.id === entry.projectId);
          if (!proj) return false;
          if (affectedDesignSystemId) {
            return proj.designSystemId === affectedDesignSystemId;
          }
          return proj.designSystemId != null;
        },
        { includeActive: true },
      );
    },
    [iframeKeepAlivePool, refreshDesignSystems],
  );

  const handlePluginsChanged = useCallback((
    context: WorkspaceCollabContext | null,
    accountGeneration: number,
  ) => {
    invalidatePluginCatalogCache({ workspaceContext: context, accountGeneration });
    window.dispatchEvent(new CustomEvent('open-design:plugins-changed'));
  }, []);

  teamResourceRefreshRefs.current.skill = handleSkillsChanged;
  teamResourceRefreshRefs.current.designSystem = handleDesignSystemsChanged;
  teamResourceRefreshRefs.current.plugin = handlePluginsChanged;
  teamResourceRefreshRefs.current.catchUp = () => {
    // Focus/reconnect is snapshot catch-up, not a mutation. Keep project
    // previews intact and never fan out the plugin mutation CustomEvent.
    void refreshSkills();
    void refreshDesignSystems({ forceTeamMaterialization: true });
  };
  const handleDesignSystemImportRebuildJob = useCallback(
    (designSystemId: string, job: DesignSystemGenerationJob) => {
      setPendingDesignSystemRevisionJobs((current) => ({
        ...current,
        [designSystemId]: job,
      }));
    },
    [],
  );
  const handleDesignSystemRevisionJobConsumed = useCallback((designSystemId: string, jobId: string) => {
    setPendingDesignSystemRevisionJobs((current) => {
      if (current[designSystemId]?.id !== jobId) return current;
      const next = { ...current };
      delete next[designSystemId];
      return next;
    });
  }, []);

  // The project list belongs to the shell's ambient Workspace and is cleared
  // immediately when the navigation rail switches A -> B. An already-open
  // project is not ambient: retain its persisted row independently so that
  // clearing/replacing the Home catalog cannot tear down ProjectView, lose the
  // exact A authority, or reinterpret the same route under B.
  const routeProjectSnapshotRef = useRef<{
    project: Project;
    accountGeneration: number;
    capturedAfterListGeneration: number;
    workspaceScope?: ProjectWorkspaceScope;
    resolvedDir?: string | null;
    workspaceContext?: WorkspaceCollabContext;
    awaitingFirstMaterialization?: boolean;
  } | null>(null);
  const [, setRouteProjectSnapshotRevision] = useState(0);
  const activeAccountGeneration = currentWorkspaceAccountGeneration();
  let loadedActiveProject: Project | null = null;
  if (route.kind === 'project') {
    const listedProject = projects.find((project) => project.id === route.projectId);
    if (listedProject) {
      const previous = routeProjectSnapshotRef.current;
      const openingWitness = projectOpenWorkspaceWitnessRef.current;
      const exactOpeningContext =
        openingWitness?.projectId === listedProject.id
        && openingWitness.projectWorkspaceId === listedProject.workspaceId
        && openingWitness.accountGeneration === activeAccountGeneration
          ? openingWitness.context
          : null;
      const preservesBootstrapWitness =
        previous?.project.id === listedProject.id
        && previous.accountGeneration === activeAccountGeneration
        && previous.project.workspaceId === listedProject.workspaceId;
      routeProjectSnapshotRef.current = {
        project: listedProject,
        accountGeneration: activeAccountGeneration,
        capturedAfterListGeneration: latestAppliedProjectListGenerationRef.current,
        ...(preservesBootstrapWitness && previous.workspaceScope
          ? { workspaceScope: previous.workspaceScope }
          : {}),
        ...(preservesBootstrapWitness && previous.resolvedDir !== undefined
          ? { resolvedDir: previous.resolvedDir }
          : {}),
        ...(preservesBootstrapWitness && previous.workspaceContext
          ? { workspaceContext: previous.workspaceContext }
          : exactOpeningContext
            ? { workspaceContext: exactOpeningContext }
            : {}),
        ...((preservesBootstrapWitness && previous.awaitingFirstMaterialization)
          || listedProject.metadata?.sharedProjectPlaceholderAt != null
          ? { awaitingFirstMaterialization: true }
          : {}),
      };
      if (exactOpeningContext) projectOpenWorkspaceWitnessRef.current = null;
    } else if (
      routeProjectSnapshotRef.current?.project.id !== route.projectId
      || routeProjectSnapshotRef.current.accountGeneration !== activeAccountGeneration
      || (
        appliedProjectListWitness?.scopeKey === currentProjectListScope
        && appliedProjectListWitness.workspaceView === 'all'
        && appliedProjectListWitness.generation
          > routeProjectSnapshotRef.current.capturedAfterListGeneration
        && !appliedProjectListWitness.projectIds.has(route.projectId)
        && workspaceContext?.workspaceId
          === routeProjectSnapshotRef.current.project.workspaceId
      )
    ) {
      routeProjectSnapshotRef.current = null;
    }
    loadedActiveProject =
      listedProject
      ?? routeProjectSnapshotRef.current?.project
      ?? null;
  } else {
    routeProjectSnapshotRef.current = null;
  }
  // A fresh project deep link starts before the shell's ambient Workspace
  // context has resolved. Derive the exact caller from the persisted project
  // binding + signed-in account directory instead; this is independent of
  // whichever Workspace another tab or the navigation rail currently selects.
  const projectRouteWorkspaceContext = useProjectRouteWorkspaceContext(
    loadedActiveProject?.workspaceId,
    workspaceContextState,
    routeProjectSnapshotRef.current?.project.id === loadedActiveProject?.id
      ? routeProjectSnapshotRef.current?.workspaceContext
        ?? routeProjectSnapshotRef.current?.workspaceScope?.context
      : null,
  );
  // Never mount ProjectView around the synthetic "Untitled" placeholder. Its
  // effects immediately fan out project-owned reads, but before the project
  // list lands there is no persisted Workspace id with which to scope them.
  // Waiting for the real row is the authorization gate that turns the cold
  // start from two headerless 400 waves plus a scoped retry into one scoped
  // wave. Unbound local projects still mount as soon as their real row lands.
  const activeProject = loadedActiveProject;
  const activeProjectWorkspaceContext = activeProject
    ? projectRouteWorkspaceContext.context
    : null;
  projectRouteWorkspaceContextRef.current = activeProjectWorkspaceContext;
  useEffect(() => {
    const pending = amrAuthRetryContinuationRef.current;
    if (!pending) return;
    if (route.kind === 'home' && route.view === 'settings') {
      // This is the one permitted non-project route: the failed-turn CTA
      // deliberately opens AMR Settings and ProjectView unmounts while the
      // authorization attempt is in flight. Every other route exit clears the
      // continuation below.
      return;
    }
    if (!routeStillMatchesAmrAuthRetryContinuation(pending, route)) {
      clearAmrAuthRetryContinuation(pending);
      return;
    }
    if (projectRouteWorkspaceContext.failure) {
      clearAmrAuthRetryContinuation(pending);
      return;
    }
    // A null context is the expected fail-closed refresh window. Wait for the
    // fresh exact witness rather than borrowing or latching the old one.
    if (
      activeProjectWorkspaceContext
      && workspaceIdentityCacheKey(activeProjectWorkspaceContext)
        !== pending.workspaceIdentityKey
    ) {
      clearAmrAuthRetryContinuation(pending);
    }
  }, [
    activeProjectWorkspaceContext,
    amrAuthRetryContinuation,
    clearAmrAuthRetryContinuation,
    projectRouteWorkspaceContext.failure,
    route,
  ]);
  // Project tabs belong to the project's persisted Workspace authority, not
  // the shell's ambient selection. On a cold deep link the ambient context can
  // settle (or switch A -> B) after the exact project scope has already loaded;
  // handing that B key to WorkspaceTabsBar makes its legitimate scope-change
  // cleanup navigate to B's saved Home tab, unmounting the healthy A project
  // and emitting a misleading presence/leave. Keep tab reconciliation
  // deferred until the project row + exact membership witness exist, then pin
  // it to that Workspace. Truly unbound local projects retain the ambient
  // account/workspace tab behavior.
  const workspaceTabsIdentityScopeKey =
    route.kind === 'project'
      ? activeProject === null
        ? null
        : activeProject.workspaceId
          ? activeProjectWorkspaceContext && identityScopeKey !== null
            ? `${nextTabScopeAccountId}::${activeProjectWorkspaceContext.workspaceId}`
            : null
          : identityScopeKey
      : identityScopeKey;
  const activeAuthoritativeProjectName =
    route.kind === 'project'
      ? authoritativeProjectNames[
          projectViewAuthorizationLifetimeKey(
            route.projectId,
            activeProjectWorkspaceContext,
          )
        ]
      : undefined;
  const activeProjectAuthorizationKey =
    route.kind === 'project'
      ? projectViewAuthorizationLifetimeKey(
          route.projectId,
          activeProjectWorkspaceContext,
        )
      : null;

  // A full-page refresh/deep link does not pass through EntryShell's card
  // click, and the local list may already contain a stale shared-project row.
  // Calibrate that bound row from the hub catalog as soon as both the route and
  // workspace identity have settled. This closes the path where the effect
  // below skipped resolution merely because SQLite returned "some" row.
  useEffect(() => {
    if (route.kind !== 'project') return;
    if (!loadedActiveProject?.workspaceId) return;
    if (!activeProjectWorkspaceContext) return;
    if (!activeProjectAuthorizationKey || activeAuthoritativeProjectName) return;
    void resolveAuthoritativeProjectName(route.projectId, activeProjectAuthorizationKey);
  }, [
    route.kind,
    route.kind === 'project' ? route.projectId : null,
    loadedActiveProject?.id,
    loadedActiveProject?.workspaceId,
    activeAuthoritativeProjectName,
    activeProjectAuthorizationKey,
    activeProjectWorkspaceContext,
    resolveAuthoritativeProjectName,
  ]);

  // Deep-linked route to a project we don't have yet (e.g. after a refresh
  // that finishes after the project list comes back, OR a member's first-ever
  // open of a project their team just shared with them). Fetch it in the
  // background so the view can render rather than bouncing to home.
  //
  // A member's first open of a freshly-shared project is a genuine race: the
  // hub already confirms the project belongs to their team, but the local
  // sqlite mirror (materialized by POST /collab/pull's registerPulledProject,
  // or by ProjectView's own /collab/status poll firing
  // ensureSharedProjectPlaceholder — see collab-sync.ts) hasn't landed yet. A
  // single immediate miss used to be indistinguishable from "this project
  // doesn't exist / I have no access", and navigated the member straight back
  // to Home mid-sync. `pullTeamSharedProjectIfAvailable`'s
  // `isTeamShared` is the reliable signal here: it comes from the hub-backed
  // `/api/workspace/projects/team` catalog, not from local sqlite state that
  // can simply be running behind. Retry on that signal for a short bounded
  // window, and once the hub has confirmed team membership even once, never
  // fall through to the not-found/navigate-home path for this project — only
  // a hub-confirmed absence does.
  useEffect(() => {
    if (route.kind !== 'project') return;
    if (loadedActiveProject) return;
    if (projects.some((p) => p.id === route.projectId)) return;
    let cancelled = false;
    const projectId = route.projectId;
    setDeepLinkResolutionFailure((current) =>
      current?.projectId === projectId ? null : current
    );
    const deepLinkContext = workspaceContextRef.current;
    const deepLinkIdentity = workspaceIdentityCacheKey(deepLinkContext);
    const identityChanged = () =>
      workspaceIdentityCacheKey(workspaceContextRef.current) !== deepLinkIdentity;
    const accountGeneration = currentWorkspaceAccountGeneration();
    const accountChanged = () =>
      currentWorkspaceAccountGeneration() !== accountGeneration;
    void (async () => {
      const openingWitness = projectOpenWorkspaceWitnessRef.current;
      const exactOpenContext =
        openingWitness?.projectId === projectId
        && openingWitness.accountGeneration === accountGeneration
          ? openingWitness.context
          : null;
      const bootstrap = await bootstrapProjectRoute(projectId, {
        accountGeneration,
        exactContext: exactOpenContext,
      });
      // This scope came from the project's persisted binding, not the shell's
      // selection. Ambient null -> B settlement and A -> B navigation cannot
      // invalidate it; only a real account boundary can.
      if (cancelled || accountChanged()) return;
      if (bootstrap.kind === 'found') {
        routeProjectSnapshotRef.current = {
          project: bootstrap.project,
          accountGeneration,
          capturedAfterListGeneration: latestAppliedProjectListGenerationRef.current,
          workspaceScope: bootstrap.scope,
          resolvedDir: bootstrap.resolvedDir,
          awaitingFirstMaterialization:
            bootstrap.project.metadata?.sharedProjectPlaceholderAt != null,
        };
        setRouteProjectSnapshotRevision((current) => current + 1);
        return;
      }
      if (bootstrap.kind === 'forbidden') {
        setDeepLinkResolutionFailure({ projectId, failure: 'missing' });
        return;
      }
      if (bootstrap.kind === 'unavailable') {
        // The optimistic bootstrap races the daemon health/list boot on purpose.
        // A transport miss before those settle is not terminal; the dependency
        // change below retries the bootstrap through its evicted failure key.
        if (projectsLoading || !daemonLive) return;
        setDeepLinkResolutionFailure({
          projectId,
          failure: 'materialization-failed',
        });
        return;
      }
      // A verified Team identity can bootstrap independently of the shell's
      // project list, so begin local authority + background content work now.
      const firstOpenTeamContext = exactOpenContext ?? deepLinkContext;
      if (
        firstOpenTeamContext?.workspaceType === 'team'
        && firstOpenTeamContext.memberStatus === 'active'
        && firstOpenTeamContext.lifecycleState === 'active'
      ) {
        const progressive = await bootstrapFirstOpenTeamProjectRoute(projectId, {
          accountGeneration,
          exactContext: firstOpenTeamContext,
        });
        if (
          cancelled
          || accountChanged()
          || (!exactOpenContext && identityChanged())
        ) return;
        if (progressive.kind === 'found') {
          routeProjectSnapshotRef.current = {
            project: progressive.project,
            accountGeneration,
            capturedAfterListGeneration: latestAppliedProjectListGenerationRef.current,
            workspaceScope: progressive.scope,
            resolvedDir: progressive.resolvedDir,
            workspaceContext: firstOpenTeamContext,
            awaitingFirstMaterialization:
              progressive.awaitingFirstMaterialization,
          };
          setRouteProjectSnapshotRevision((current) => current + 1);
          return;
        }
        if (progressive.kind === 'forbidden') {
          setDeepLinkResolutionFailure({ projectId, failure: 'missing' });
          return;
        }
        // `not-found` can be a hub propagation race and `unavailable` includes
        // old daemons that registered an unbound placeholder. Both retain the
        // proven, bounded full-pull fallback below.
      }
      // The exact Team bootstrap above is independent of the shell project
      // list, so it intentionally starts while that list is still loading.
      // Only the legacy catalog+blocking-pull fallback waits for ambient boot.
      if (projectsLoading || !daemonLive) return;
      const resolution = await resolveDeepLinkedTeamSharedProject(projectId, {
        getProject: (id) => getProject(id, deepLinkContext),
        pullTeamSharedProjectIfAvailable: (id) =>
          pullTeamSharedProjectIfAvailable(id, deepLinkContext),
        delay,
        isCancelled: () => cancelled || identityChanged(),
      });
      if (cancelled || identityChanged()) return;
      if (resolution.kind === 'found') {
        const fetched = resolution.project;
        setProjects((curr) => {
          const existingIndex = curr.findIndex((candidate) => candidate.id === fetched.id);
          if (existingIndex < 0) {
            return [...curr, fetched];
          }
          return curr.map((candidate) => (candidate.id === fetched.id ? fetched : candidate));
        });
        return;
      }
      // The hub confirmed at least once during the retry window that this
      // project belongs to the caller's team: it exists and they have access.
      // Local materialization is just still catching up — leave the route
      // alone instead of bouncing the member off a project they can see, but
      // stop the spinner and offer an explicit retry after the bounded window.
      if (resolution.kind === 'still-materializing') {
        setDeepLinkResolutionFailure({
          projectId,
          failure: 'materialization-failed',
        });
        return;
      }
      const request = beginProjectListRequest('all');
      let list: Project[];
      try {
        list = await listCurrentWorkspaceProjects({
          throwOnError: true,
          workspaceView: 'all',
        });
      } catch {
        setDeepLinkResolutionFailure({
          projectId,
          failure: 'materialization-failed',
        });
        return;
      }
      if (cancelled || identityChanged()) return;
      const applied = reconcileFetchedProjects(list, request);
      if (!applied) return;
      const fetchedProject = locallyDeletedProjectIdsRef.current.has(projectId)
        ? undefined
        : list.find((p) => p.id === projectId);
      const staleRequest = request.mutationVersion < projectListMutationVersionRef.current;
      const knownLocalProject =
        staleRequest && pendingLocalProjectIdsRef.current.has(projectId);
      if (!fetchedProject && !knownLocalProject) {
        setDeepLinkResolutionFailure({ projectId, failure: 'missing' });
      }
    })().catch(() => {
      if (cancelled || identityChanged()) return;
      setDeepLinkResolutionFailure({
        projectId,
        failure: 'materialization-failed',
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    route,
    loadedActiveProject,
    projects,
    projectsLoading,
    daemonLive,
    deepLinkRetryRevision,
    beginProjectListRequest,
    listCurrentWorkspaceProjects,
    reconcileFetchedProjects,
  ]);

  const openSettings = useCallback((
    section: SettingsSection = 'execution',
    opts?: { highlight?: SettingsHighlight },
  ) => {
    if (section === 'composio' || section === 'mcpClient' || section === 'integrations') {
      settingsReturnTargetRef.current = null;
      setIntegrationInitialTab(
        section === 'composio'
          ? 'connectors'
          : section === 'mcpClient'
            ? 'mcp'
            : 'use-everywhere',
      );
      navigate({ kind: 'home', view: 'integrations' });
      return;
    }
    const currentRoute = routeRef.current;
    settingsReturnTargetRef.current =
      currentRoute.kind === 'project' && identityScopeKey !== null
        ? {
            route: { ...currentRoute },
            accountGeneration: currentWorkspaceAccountGeneration(),
            identityScopeKey,
          }
        : null;
    setSettingsWelcome(false);
    setSettingsInitialSection(section);
    setSettingsHighlight(opts?.highlight ?? null);
    navigate({ kind: 'home', view: 'settings' });
  }, [identityScopeKey]);

  // Entry point from the failed-run AMR nudge: open Settings on the execution
  // section and flag the AMR agent card for a one-shot scroll-into-view +
  // highlight (and a sign-in coachmark when not yet authorized).
  const openAmrSettings = useCallback(() => {
    openSettings('execution', { highlight: 'amr' });
  }, [openSettings]);

  const openPetSettings = useCallback(() => {
    const currentRoute = routeRef.current;
    settingsReturnTargetRef.current =
      currentRoute.kind === 'project' && identityScopeKey !== null
        ? {
            route: { ...currentRoute },
            accountGeneration: currentWorkspaceAccountGeneration(),
            identityScopeKey,
          }
        : null;
    setSettingsWelcome(false);
    setSettingsInitialSection('pet');
    setSettingsHighlight(null);
    navigate({ kind: 'home', view: 'settings' });
  }, [identityScopeKey]);

  const openMcpSettings = useCallback(() => {
    setIntegrationInitialTab('mcp');
    navigate({ kind: 'home', view: 'integrations' });
  }, []);

  // The composer "+" menu's "add plugin" / "add connector" rows route to the
  // home plugin-registry / connector-integration surfaces.
  const openPluginRegistry = useCallback(() => {
    navigate({ kind: 'home', view: 'plugins' });
  }, []);

  const openConnectorIntegrations = useCallback(() => {
    setIntegrationInitialTab('connectors');
    navigate({ kind: 'home', view: 'integrations' });
  }, []);

  const handleCompleteOnboarding = useCallback(() => {
    const current = latestPersistedConfigRef.current;
    if (current.onboardingCompleted) return;
    const next: AppConfig = { ...current, onboardingCompleted: true };
    latestPersistedConfigRef.current = next;
    saveConfig(next);
    void syncConfigToDaemon(next);
    setConfig(next);
  }, []);

  // Cmd+, (mac) / Ctrl+, (win/linux) opens Settings. Capture phase so we
  // beat the browser's default Preferences dialog. Platform-gated so
  // meta/ctrl don't conflict across OS.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const primary = isMacPlatform() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (primary && !e.shiftKey && !e.altKey && e.key === ',') {
        if (e.isComposing) return;
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [openSettings]);

  // Explicit enabled toggle — true = wake, false = tuck. Persists to
  // localStorage so the overlay state survives across reloads. We keep
  // `adopted` untouched so the entry-view CTA does not regress to
  // "adopt me" once the user has already chosen.
  const handleSetPetEnabled = useCallback((enabled: boolean) => {
    setConfig((curr) => {
      const prev = curr.pet ?? DEFAULT_PET;
      const next: AppConfig = { ...curr, pet: { ...prev, enabled } };
      saveConfig(next);
      return next;
    });
  }, []);

  const handleTuckPet = useCallback(
    () => handleSetPetEnabled(false),
    [handleSetPetEnabled],
  );

  // Toggle wake/tuck — used by the pet rail and the composer button.
  const handleTogglePet = useCallback(() => {
    setConfig((curr) => {
      const prev = curr.pet ?? DEFAULT_PET;
      const next: AppConfig = {
        ...curr,
        pet: { ...prev, enabled: !prev.enabled },
      };
      saveConfig(next);
      return next;
    });
  }, []);

  // Inline adopt — the right-hand pet rail and the composer's pet menu
  // both call this to switch pets without bouncing the user into
  // Settings. It always wakes the overlay so the change is visible.
  const handleAdoptPet = useCallback((petId: string) => {
    setConfig((curr) => {
      const prev = curr.pet ?? DEFAULT_PET;
      const next: AppConfig = {
        ...curr,
        pet: { ...prev, adopted: true, enabled: true, petId },
      };
      saveConfig(next);
      return next;
    });
  }, []);

  // When the user lands on the entry view (route.kind === 'home'), pull
  // a fresh template list. The template store is global — if they just
  // saved a template inside a project, returning home should reflect it
  // immediately in the From-template tab without forcing a page reload.
  // Same rationale for design systems: a brand extraction (or any in-project
  // design-system creation) registers a `user:<id>` system out of band, so the
  // Design systems tab must re-fetch to show it — and the brand-ready prompt
  // relies on the new system being present so it can preselect it.
  useEffect(() => {
    if (route.kind !== 'home') return;
    void refreshTemplates();
    if (workspaceContext?.workspaceType !== 'team') void refreshDesignSystems();
  }, [route.kind, refreshTemplates, refreshDesignSystems, workspaceContext?.workspaceType]);

  // Existing card grids (DesignsTab, ProjectView), pickers (NewProjectPanel,
  // ChatComposer mention) all look skills up by id without caring whether
  // the id resolves to a functional skill or a design template. Pass them
  // the union so the post-split refactor stays invisible to those callers.
  const allSkillSummaries = useMemo(
    () => [...skills, ...designTemplates],
    [skills, designTemplates],
  );
  const enabledSkills = useMemo(
    () =>
      allSkillSummaries.filter(
        (s) => !(config.disabledSkills ?? []).includes(s.id),
      ),
    [allSkillSummaries, config.disabledSkills],
  );
  // Functional-skills-only enabled subset — what ProjectView's chat
  // composer @-picker should see. Without this, a skill the user has
  // disabled in Settings still appears in an existing project's @-mention
  // popover and can ride along to the daemon via skillIds, breaking the
  // Library toggle for projects opened on the post-split branch.
  const enabledFunctionalSkills = useMemo(
    () =>
      skills.filter(
        (s) => !(config.disabledSkills ?? []).includes(s.id),
      ),
    [skills, config.disabledSkills],
  );
  // Templates-only enabled subset — what the EntryView Templates gallery
  // actually renders. Filtering in App keeps the EntryView prop surface
  // narrow ("here are the templates the user has not disabled").
  const enabledDesignTemplates = useMemo(
    () =>
      designTemplates.filter(
        (s) => !(config.disabledSkills ?? []).includes(s.id),
      ),
    [designTemplates, config.disabledSkills],
  );
  const enabledDS = useMemo(
    () =>
      designSystems.filter(
        (d) => !(config.disabledDesignSystems ?? []).includes(d.id),
      ),
    [designSystems, config.disabledDesignSystems],
  );

  const handleCloseSettings = () => {
    // Closing Settings is still the canonical "I'm done" gesture now that
    // there is no global Save button. The same close path is shared by the
    // legacy modal and the full-page route. We mark onboardingCompleted on
    // close so the welcome modal stops re-prompting on every refresh,
    // regardless of whether the user changed anything during the session.
    const next = resolveSettingsCloseConfig(config, latestPersistedConfigRef.current);
    if (!next.onboardingCompleted || !config.onboardingCompleted) {
      latestPersistedConfigRef.current = next;
      saveConfig(next);
      void syncConfigToDaemon(next);
      setConfig(next);
    }
    setSettingsOpen(false);
    settingsDraftConfigRef.current = null;
    setSettingsHighlight(null);
    if (route.kind === 'home' && route.view === 'settings') {
      const returnTarget = settingsReturnTargetRef.current;
      settingsReturnTargetRef.current = null;
      const returnIdentityStillMatches = Boolean(
        returnTarget
        && returnTarget.accountGeneration === currentWorkspaceAccountGeneration()
        && returnTarget.identityScopeKey === identityScopeKey
      );
      navigate(
        returnIdentityStillMatches && returnTarget
          ? returnTarget.route
          : { kind: 'home', view: 'home' },
      );
    }
  };

  const handleResetOnboarding = useCallback((next: AppConfig) => {
    latestPersistedConfigRef.current = next;
    saveConfig(next);
    void syncConfigToDaemon(next, { allowOnboardingReset: true });
    setConfig(next);
    setSettingsOpen(false);
    settingsDraftConfigRef.current = null;
    setSettingsHighlight(null);
    navigate({ kind: 'home', view: 'onboarding' });
  }, []);

  const handleActiveCloudSignOut = useCallback(async () => {
    const next = resetExecutionConfigAfterSignOut(latestPersistedConfigRef.current);
    latestPersistedConfigRef.current = next;
    saveConfig(next);
    setConfig(next);
    setProviderModelsCache({});
    setSettingsOpen(false);
    settingsDraftConfigRef.current = null;
    setSettingsHighlight(null);
    navigate({ kind: 'home', view: 'onboarding' });
    await syncConfigToDaemon(next, { allowOnboardingReset: true });
  }, []);

  const renderSettingsSurface = (presentation: 'modal' | 'page') => (
    <SettingsDialog
      presentation={presentation}
      initial={config}
      agents={agents}
      agentsLoading={agentsLoading}
      daemonLive={daemonLive}
      appVersionInfo={appVersionInfo}
      welcome={presentation === 'modal' ? settingsWelcome : false}
      initialSection={settingsInitialSection}
      initialHighlight={settingsHighlight}
      persistedProjectWorkspaceId={
        route.kind === 'project'
          ? projects.find((project) => project.id === route.projectId)?.workspaceId ?? null
          : null
      }
      composioConfigLoading={composioConfigLoading}
      onPersist={handleConfigPersist}
      onSilentUpdatePreferenceChange={handleSilentUpdatePreferenceChange}
      onDraftChange={handleSettingsDraftChange}
      onPersistComposioKey={handleConfigPersistComposioKey}
      onClose={handleCloseSettings}
      onResetOnboarding={handleResetOnboarding}
      onAmrSignedOut={handleActiveCloudSignOut}
      onRefreshAgents={refreshAgents}
      onAmrLoginStatusChange={handleAmrLoginStatusChange}
      daemonMediaProviders={daemonMediaProviders}
      daemonMediaProvidersFetchState={daemonMediaProvidersFetchState}
      mediaProvidersNotice={mediaProvidersNotice}
      onReloadMediaProviders={reloadMediaProvidersFromDaemon}
      onProjectsRefresh={refreshProjects}
      onSkillsChanged={handleSkillsChanged}
      onDesignSystemsChanged={handleDesignSystemsChanged}
      onDesignSystemImportRebuildJob={handleDesignSystemImportRebuildJob}
      providerModelsCache={providerModelsCache}
      onProviderModelsCacheChange={setProviderModelsCache}
    />
  );

  // Phase 2B / spec §11.6 — marketplace deep UI dispatch. The
  // /marketplace and /marketplace/:id routes render outside the
  // EntryView / ProjectView split so the discovery surface stays
  // independent of any active project.
  let appMain: ReactNode;
  const pendingFirstRunOnboardingRoute =
    route.kind === 'home' &&
    route.view === 'home' &&
    config.onboardingCompleted !== true &&
    !daemonConfigLoaded;
  if (pendingFirstRunOnboardingRoute) {
    appMain = (
      <div className="entry-shell entry-shell--no-header">
        <CenteredLoader label={t('entry.loadingWorkspace')} />
      </div>
    );
  } else if (route.kind === 'marketplace') {
    appMain = <MarketplaceView />;
  } else if (route.kind === 'marketplace-detail') {
    appMain = (
      <PluginDetailView
        pluginId={route.pluginId}
        workspaceContextState={workspaceContextState}
      />
    );
  } else if (route.kind === 'collab-demo') {
    appMain = <CollabDemoView projectId={route.projectId} />;
  } else if (route.kind === 'community') {
    appMain = (
      <CommunityView
        onRemixTemplate={({ templateId, prompt }) => {
          // Remix carries the template's PROJECT along, not just its prompt:
          // duplicate the plugin's example artifact into a fresh project,
          // seed the composer with the template prompt, then open it on the
          // copied entry file (keep in sync with the EntryShell-embedded
          // community tab). Templates without a duplicable artifact fall
          // back to the old prompt-only project.
          void (async () => {
            const name = summarizeProjectNameFromPrompt(prompt) || t('common.untitled');
            try {
              // One resolved authority for BOTH requests: the create binds the
              // copied project to this workspace, and the seed patch is then
              // authorized against that same binding. A headerless create is
              // read by the daemon as a legacy caller and leaves the project
              // bound to no workspace at all, which is what kept remixed
              // projects out of the member's own 草稿 list.
              const writeContext = resolvedWorkspaceContextForWrite(workspaceContextState);
              const result = await duplicatePluginAsProject(templateId, { name }, writeContext);
              const seeded = await patchProject(
                result.projectId,
                { pendingPrompt: prompt },
                writeContext,
              );
              if (!seeded) {
                // The project itself exists and is bound — only the prompt seed
                // was refused. Keep the user on it (retrying through the catch
                // below would leave the copy orphaned and create a second,
                // empty project) and surface the dropped seed instead of
                // discarding it silently.
                console.error('Community remix: could not seed the template prompt.');
              }
              navigate({
                kind: 'project',
                projectId: result.projectId,
                conversationId: result.conversationId,
                fileName: result.relPath,
              });
            } catch {
              await handleCreateProject({
                name,
                skillId: null,
                designSystemId: null,
                metadata: { kind: 'other', nameSource: 'prompt' },
                pendingPrompt: prompt,
              });
            }
          })();
        }}
        onUsePrompt={(target) => {
          seedHomeComposerPrompt(target.prompt);
          stashHomePromptHandoff(createPluginUseHandoff(Date.now(), target.templateId, {
            action: 'use',
            chipId: target.chipId,
            projectKind: target.projectKind,
          }));
          navigate({ kind: 'home', view: 'home' });
        }}
        onUsePlugin={(record, action, target) => {
          stashHomePromptHandoff(createPluginUseHandoff(Date.now(), record.id, {
            action,
            chipId: target.chipId,
            projectKind: target.projectKind,
          }));
          navigate({ kind: 'home', view: 'home' });
        }}
      />
    );
  } else if (route.kind === 'design-system-create') {
    appMain = (
      <DesignSystemCreationFlow
        onBack={() => navigate({ kind: 'home', view: 'design-systems' })}
        designSystems={enabledDS}
        onCreated={(projectId, project, conversationId) => {
          if (project) {
            setProjects((curr) => [
              project,
              ...curr.filter((p) => p.id !== project.id),
            ]);
          }
          navigate({ kind: 'project', projectId, conversationId: conversationId ?? null, fileName: null });
        }}
        onProjectPrepared={(project) => {
          setProjects((curr) => [
            project,
            ...curr.filter((p) => p.id !== project.id),
          ]);
        }}
        onSystemsRefresh={refreshDesignSystems}
        config={config}
        onOpenConnectorsTab={() => openSettings('composio')}
      />
    );
  } else if (route.kind === 'design-system-detail') {
    appMain = (
      <DesignSystemDetailView
        id={route.designSystemId}
        selectedId={config.designSystemId}
        config={config}
        agents={agents}
        onBack={() => navigate({ kind: 'home', view: 'design-systems' })}
        onOpenProject={(projectId) => void handleOpenProject(projectId)}
        onSetDefault={handleChangeDefaultDesignSystem}
        onSystemsRefresh={refreshDesignSystems}
        onProjectsRefresh={refreshProjects}
        initialRevisionJob={pendingDesignSystemRevisionJobs[route.designSystemId] ?? null}
        onInitialRevisionJobConsumed={(jobId) =>
          handleDesignSystemRevisionJobConsumed(route.designSystemId, jobId)
        }
      />
    );
  } else if (route.kind === 'home' && route.view === 'settings') {
    appMain = renderSettingsSurface('page');
  } else if (route.kind === 'project') {
    const pendingCreation =
      activeProject && pendingProjectCreation?.projectId === activeProject.id
        ? pendingProjectCreation
        : null;
    const routeSurfaceState = projectRouteSurfaceState({
      projectsLoading,
      hasActiveProject: activeProject !== null,
      daemonLive,
      resolutionFailure:
        deepLinkResolutionFailure?.projectId === route.projectId
          ? deepLinkResolutionFailure.failure
          : undefined,
    });
    if (pendingCreation && activeProject) {
      // Same `div.app` element as the ProjectView branch below, deliberately.
      // React reconciles one element across the pending -> real hand-off, so
      // the `.app` entrance animation plays once for the whole transition
      // instead of restarting when ProjectView takes over (the pending surface
      // lives ~150ms, shorter than the 180ms animation, so a second mount read
      // as the project frame flashing twice).
      appMain = (
        <div className="app">
          <ProjectCreationPendingView
            project={activeProject}
            prompt={pendingCreation.prompt}
            agentId={config.agentId}
            onBack={handleBack}
          />
        </div>
      );
    } else if (
      routeSurfaceState === 'loading-projects'
      || routeSurfaceState === 'resolving-deep-link'
      || (
        activeProject
        && !projectResourceReadsCanStart(
          activeProject.workspaceId,
          projectRouteWorkspaceContext,
        )
        && projectRouteWorkspaceContext.loading
      )
    ) {
      appMain = (
        <div className="entry-shell entry-shell--no-header">
          <CenteredLoader label={t('entry.loadingWorkspace')} />
        </div>
      );
    } else if (routeSurfaceState !== 'ready') {
      const canRetry = routeSurfaceState === 'materialization-failed';
      appMain = (
        <div className="entry-shell entry-shell--no-header">
          <div className="centered-loader">
            <span role="alert">
              {routeSurfaceState === 'missing'
                ? t('project.missing')
                : t('connectors.unavailable')}
            </span>
            <Button
              onClick={
                canRetry
                  ? () => setDeepLinkRetryRevision((current) => current + 1)
                  : handleBack
              }
            >
              {canRetry
                ? t('promptTemplates.retry')
                : t('project.backToProjects')}
            </Button>
          </div>
        </div>
      );
    } else if (
      activeProject
      && projectRouteWorkspaceContext.failure
      && (
        projectRouteWorkspaceContext.failure === 'forbidden'
        || activeProjectWorkspaceContext === null
      )
    ) {
      appMain = (
        <div className="entry-shell entry-shell--no-header">
          <div className="centered-loader">
            <span role="alert">
              {projectRouteWorkspaceContext.failure === 'forbidden'
                ? t('project.missing')
                : t('connectors.unavailable')}
            </span>
            <Button onClick={projectRouteWorkspaceContext.retry}>
              {t('promptTemplates.retry')}
            </Button>
          </div>
        </div>
      );
    } else if (activeProject) {
      appMain = (
        <div className="app">
        <ProjectView
          key={projectViewAuthorizationLifetimeKey(
            activeProject.id,
            activeProjectWorkspaceContext,
          )}
          project={activeProject}
          workspaceContextOverride={
            activeProject.workspaceId
              ? activeProjectWorkspaceContext
              : undefined
          }
          initialWorkspaceScope={
            routeProjectSnapshotRef.current?.project.id === activeProject.id
              ? routeProjectSnapshotRef.current.workspaceScope
              : undefined
          }
          initialProjectDetail={
            routeProjectSnapshotRef.current?.project.id === activeProject.id
            && routeProjectSnapshotRef.current.resolvedDir !== undefined
              ? {
                  project: routeProjectSnapshotRef.current.project,
                  resolvedDir: routeProjectSnapshotRef.current.resolvedDir,
                }
              : undefined
          }
          initialMaterializationPending={
            routeProjectSnapshotRef.current?.project.id === activeProject.id
              ? routeProjectSnapshotRef.current.awaitingFirstMaterialization
                ?? (activeProject.metadata?.sharedProjectPlaceholderAt != null)
              : undefined
          }
          projectAuthorizationKey={
            activeProjectAuthorizationKey ?? activeProject.id
          }
          amrAuthRetryContinuation={amrAuthRetryContinuation}
          onArmAmrAuthRetryContinuation={armAmrAuthRetryContinuation}
          onConsumeAmrAuthRetryContinuation={consumeAmrAuthRetryContinuation}
          onDiscardAmrAuthRetryContinuation={clearAmrAuthRetryContinuation}
          authoritativeProjectName={activeAuthoritativeProjectName}
          resolveAuthoritativeProjectName={resolveAuthoritativeProjectName}
          routeFileName={route.fileName}
          routeConversationId={route.conversationId ?? null}
          config={config}
          agents={agents}
          skills={enabledFunctionalSkills}
          designTemplates={designTemplates}
          designSystems={designSystems}
          daemonLive={daemonLive}
          onModeChange={handleModeChange}
          onAgentChange={handleAgentChange}
          onAgentModelChange={handleAgentModelChange}
          onApiModelChange={handleApiModelChange}
          onRefreshAgents={refreshAgents}
          onOpenSettings={openSettings}
          onOpenAmrSettings={openAmrSettings}
          onOpenMcpSettings={openMcpSettings}
          onBrowsePlugins={openPluginRegistry}
          onOpenConnectors={openConnectorIntegrations}
          onAdoptPetInline={handleAdoptPet}
          onTogglePet={handleTogglePet}
          onOpenPetSettings={openPetSettings}
          onBack={handleBack}
          onClearPendingPrompt={handleClearPendingPrompt}
          onTouchProject={handleTouchProject}
          onProjectChange={handleProjectChange}
          onProjectRenameStarted={handleProjectRenameStarted}
          onProjectRenameSettled={handleProjectRenameSettled}
          onProjectsRefresh={refreshProjects}
          onDeleteProject={handleDeleteProject}
          onChangeDefaultDesignSystem={handleChangeDefaultDesignSystem}
          onDesignSystemsRefresh={refreshDesignSystems}
          onCreateProjectFromDesignSystem={handleCreateProjectFromDesignSystem}
          onCreateDesignSystemFromProject={handleCreateDesignSystemFromProject}
          onDuplicateProject={handleDuplicateProject}
          onRunActivityChange={handleProjectRunActivityChange}
        />
        </div>
      );
    }
  } else {
    appMain = (
      <EntryView
        skills={enabledSkills}
        designTemplates={enabledDesignTemplates}
        designSystems={enabledDS}
        projects={projects}
        templates={templates}
        onDeleteTemplate={handleDeleteTemplate}
        promptTemplates={promptTemplates}
        defaultDesignSystemId={config.designSystemId}
        agents={agents}
        agentsLoading={agentsLoading}
        amrLoggedIn={amrLoginStatus?.loggedIn ?? null}
        amrSessionState={amrLoginStatus?.sessionState}
        amrAccountPlan={
          amrLoginStatus?.account?.plan?.trim()
          || amrLoginStatus?.user?.plan?.trim()
          || null
        }
        config={config}
        providerModelsCache={providerModelsCache}
        onProviderModelsCacheChange={setProviderModelsCache}
        integrationInitialTab={integrationInitialTab}
        composioConfigLoading={composioConfigLoading}
        daemonLive={daemonLive}
        onModeChange={handleModeChange}
        onAgentChange={handleAgentChange}
        onAgentModelChange={handleAgentModelChange}
        onApiProtocolChange={handleApiProtocolChange}
        onApiModelChange={handleApiModelChange}
        onConfigPersist={handleConfigPersist}
        daemonAppConfigReady={daemonAppConfigReady}
        onSilentUpdatePreferenceChange={handleSilentUpdatePreferenceChange}
        onSkillsRefresh={refreshSkills}
        onSkillsChanged={handleSkillsChanged}
        onRefreshAgents={refreshAgents}
        skillsLoading={
          workspaceSkills.identity !== currentWorkspaceCatalogIdentity || skillsLoading
        }
        designSystemsLoading={
          workspaceDesignSystems.identity !== currentWorkspaceCatalogIdentity || dsLoading
        }
        projectsLoading={projectsLoading}
        promptTemplatesLoading={promptTemplatesLoading}
        onCreateProject={handleCreateProject}
        onCreatePluginShareProject={handleCreatePluginShareProject}
        onImportClaudeDesign={handleImportClaudeDesign}
        onImportFolder={handleImportFolder}
        onImportFolderResponse={handleImportFolderResponse}
        onOpenProject={handleOpenProject}
        onOpenLiveArtifact={handleOpenLiveArtifact}
        onDeleteProject={handleDeleteProject}
        onDuplicateProject={handleDuplicateProject}
        onRenameProject={handleRenameProject}
        onProjectsRefresh={refreshProjectsStrict}
        onTeamProjectContentReady={handleTeamProjectContentReady}
        onChangeDefaultDesignSystem={handleChangeDefaultDesignSystem}
        onCreateDesignSystem={() => {
          setPendingDesignSystemCreateEntry('design_systems_page');
          navigate({ kind: 'design-system-create' });
        }}
        onOpenDesignSystem={(id: string) => navigate({ kind: 'design-system-detail', designSystemId: id })}
        onDesignSystemsRefresh={refreshDesignSystems}
        onPersistComposioKey={handleConfigPersistComposioKey}
        onOpenSettings={openSettings}
        onCompleteOnboarding={handleCompleteOnboarding}
        onSignedOut={handleActiveCloudSignOut}
        onAmrLoginStatusChange={handleAmrLoginStatusChange}
        artifactUpgradeSlot={
          amrArtifactUpgradeHomeOffer ? (
            <AmrArtifactUpgradeHomeCard
              key={amrArtifactUpgradeHomeOffer.sessionKey}
              profile={amrLoginStatus?.profile ?? null}
              metricsConsent={config.telemetry?.metrics === true}
              installationId={config.installationId}
              onViewArtifact={() => {
                if (
                  !amrArtifactUpgradeHomeOffer.projectId
                  || !amrArtifactUpgradeHomeOffer.conversationId
                ) {
                  navigate({ kind: 'home', view: 'projects' });
                  return;
                }
                navigate({
                  kind: 'project',
                  projectId: amrArtifactUpgradeHomeOffer.projectId,
                  conversationId: amrArtifactUpgradeHomeOffer.conversationId,
                  fileName: amrArtifactUpgradeHomeOffer.fileName,
                });
              }}
              onDismiss={() => {
                if (amrArtifactUpgradeHomeMock) return;
                setAmrArtifactUpgradeHomeOffer((current) =>
                  current?.sessionKey === amrArtifactUpgradeHomeOffer.sessionKey
                    ? null
                    : current,
                );
              }}
            />
          ) : undefined
        }
      />
    );
  }
  return (
    <>
      <div
        className={`workspace-shell workspace-shell--${clientType}`}
        data-client-type={clientType}
        data-host-platform={hostPlatform}
      >
        <WorkspaceTabsBar
          route={route}
          // The ambient list may still be loading (or belong to a different
          // selected Workspace) while a deep-linked project is already open.
          // Supply only that route-owned row to chrome; never insert it into
          // the ambient Home catalogue.
          projects={
            activeProject && !projects.some((project) => project.id === activeProject.id)
              ? [...projects, activeProject]
              : projects
          }
          activeProjectWorkspaceId={
            route.kind === 'project' && activeProject
              ? activeProject.workspaceId ?? null
              : undefined
          }
          onboardingCompleted={config.onboardingCompleted === true}
          identityScopeKey={workspaceTabsIdentityScopeKey}
        />
        {/* Avatar + credits keep their home-view spot (the fixed top-right
            corner over the tabs chrome) while a project tab is open, even
            though EntryShell — the cluster's usual owner — is unmounted here.
            Home and the other entry views mount theirs through EntryNavRail;
            the routes are mutually exclusive, so exactly one is on screen. */}
        {route.kind === 'project' ? (
          <WorkspaceTopRightAccountCluster
            onOpenSettings={openSettings}
            onSignedOut={handleActiveCloudSignOut}
            updaterSlot={
              <UpdaterPopup
                allowSilentUpdates={config.allowSilentUpdates}
                silentUpdatePreferenceReady={daemonAppConfigReady}
                onAllowSilentUpdatesChange={handleSilentUpdatePreferenceChange}
              />
            }
            workspaceContextOverride={
              activeProject?.workspaceId
                ? activeProjectWorkspaceContext
                : undefined
            }
            workspaceContextLoading={
              activeProject?.workspaceId
                ? projectRouteWorkspaceContext.loading
                : undefined
            }
            amrLoggedIn={amrLoginStatus?.loggedIn ?? null}
            amrAccountPlan={
              amrLoginStatus?.account?.plan?.trim()
              || amrLoginStatus?.user?.plan?.trim()
              || null
            }
            metricsConsent={config.telemetry?.metrics === true}
            installationId={config.installationId}
          />
        ) : null}
        {route.kind === 'project'
          && activeProjectWorkspaceContext
          && projectRouteWorkspaceContext.failure === 'unavailable' ? (
          <ProjectWorkspaceRecoveryTip />
        ) : null}
        <div className="workspace-shell__body">
          {appMain}
        </div>
      </div>
      {clientType === 'desktop' ? null : (
        <PetOverlay
          pet={config.pet?.enabled ? config.pet : undefined}
          taskCenter={petTaskCenter}
          onOpenProject={handleOpenProject}
          dockLine
        />
      )}
      <TooltipLayer />
      <UpdateDialog />
      {/* Mounted at shell level, outside the route views, so a survey armed by
          an export inside a project stays on screen when the user navigates
          back to home. */}
      <ExperienceSurvey
        metricsConsent={config.telemetry?.metrics === true}
        onExposure={() => trackExperienceSurveyShown(analytics.track)}
        onDismiss={() => trackExperienceSurveyDismissed(analytics.track)}
        onSubmit={(answers) => trackExperienceSurveySent(analytics.track, answers)}
      />
      <AmrArtifactUpgradeGate
        cloudModelSelected={config.mode === 'daemon' && config.agentId === 'amr'}
        homeVisible={route.kind === 'home' && route.view === 'home'}
        activeProjectId={route.kind === 'project' ? route.projectId : null}
        activeConversationId={
          route.kind === 'project' ? route.conversationId ?? null : null
        }
        activeFileName={route.kind === 'project' ? route.fileName : null}
        plan={resolvedAmrPlan}
        planResolved={
          amrLoginStatus !== null
          && (!isAmrSessionAuthenticated(amrLoginStatus) || resolvedAmrPlan !== null)
        }
        profile={amrLoginStatus?.profile ?? null}
        metricsConsent={config.telemetry?.metrics === true}
        installationId={config.installationId}
        onHomeOfferChange={
          amrArtifactUpgradeHomeMock
            ? undefined
            : setAmrArtifactUpgradeHomeOffer
        }
      />
      <AnimatePresence>
      {settingsOpen ? (
        renderSettingsSurface('modal')
      ) : null}
      </AnimatePresence>
      <MemoryToast
        onOpenMemory={() => openSettings('memory')}
        subscriptionMode={memoryToastSubscriptionMode({
          routeKind: route.kind,
          projectRunActive:
            route.kind === 'project'
            && projectRunActivity.projectId === route.projectId
            && projectRunActivity.active,
          memorySurfaceOpen:
            settingsInitialSection === 'memory'
            && (
              settingsOpen
              || (route.kind === 'home' && route.view === 'settings')
            ),
        })}
      />
      {workingDirError ? (
        <Toast
          message={workingDirError}
          role="alert"
          onDismiss={() => setWorkingDirError(null)}
        />
      ) : null}
      {projectCreateError ? (
        <Toast
          message={projectCreateError}
          role="alert"
          tone="error"
          onDismiss={() => setProjectCreateError(null)}
        />
      ) : null}
      {projectOpenError ? (
        <Toast
          message={projectOpenError}
          role="alert"
          tone="error"
          onDismiss={() => setProjectOpenError(null)}
        />
      ) : null}
      {/* First-run privacy consent banner. It waits for daemon config
          hydration because privacyDecisionAt is daemon-owned and stripped
          from localStorage. It waits for `onboardingCompleted` so first-run
          users see the welcome panel before the disclosure (Skip and
          finish both flip the flag). Independent of Settings: z-index in
          index.css sits above modal backdrops so opening Settings does
          not hide the banner. */}
      <AnimatePresence>
      {showPrivacyConsent ? (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        >
        <PrivacyConsentModal
          onShare={() => {
            // The banner owns only the privacy decision; it does not drive
            // navigation. Choosing Share keeps the current anonymous identity
            // when one already exists and enables the telemetry surface.
            handlePrivacyConsentChoice(true);
          }}
          onDecline={() => {
            handlePrivacyConsentChoice(false);
          }}
        />
      </motion.div>
      ) : null}
      </AnimatePresence>
    </>
  );
}

function generateInstallationIdSafe(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
