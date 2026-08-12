// InlineModelSwitcher — top-bar / home-composer chip for CLI/BYOK + model.
//
// Non-compact (entry top-bar): one chip opens a full popover (mode + agent /
// provider + model). Compact (home hero, #6501): a split chip — left icon
// opens local CLI agent switching only (BYOK provider UI deferred to
// Settings / maintainer follow-up), right status+model opens the model list.
// At ≤900px the chip collapses to a logo-only circle that opens the model
// list; CLI switching stays in Settings on that breakpoint.
// All persistence is delegated upward through the same callbacks `AvatarMenu`
// already uses, so the switcher inherits autosave + daemon sync without
// re-implementing it.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { AmrWalletSnapshot } from '@open-design/contracts';
import { VisuallyHidden } from '@open-design/components';
import { useT } from '../i18n';
import {
  agentIdToTracking,
  byokProtocolToTracking,
  modelIdForTracking,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
  type AmrEntryAttribution,
} from '../analytics/amr-attribution';
import { amrPlansUrlForProfile } from '../runtime/amr-guidance';
import { getResolvedDeviceId } from '../analytics/client';
import {
  trackDeepSeekCampaignModelBenefitSurfaceView,
  trackExecutionSettingsPopoverClick,
} from '../analytics/events';
import {
  beginAmrAuthTracking,
  confirmAmrAuthTracking,
  observeAmrAuthTracking,
  reconcileAmrAuthAttemptId,
  resolveAmrAuthTracking,
} from '../analytics/amr-auth';
import {
  useWorkspaceBillingResponse,
  useWorkspaceContext,
  workspaceBillingBalanceUsd,
} from '../collab/useWorkspaceContext';
import { KNOWN_PROVIDERS } from '../state/config';
import { fetchProviderModels } from '../providers/provider-models';
import { SUGGESTED_MODELS_BY_PROTOCOL } from '../state/apiProtocols';
import {
  canUpgradeVelaPlan,
  cancelVelaLogin,
  fetchAmrWalletSnapshot,
  fetchVelaLoginStatus,
  formatVelaBalanceUsd,
  startVelaLogin,
  type VelaLoginStatus,
} from '../providers/daemon';
import type { AgentInfo, ApiProtocol, AppConfig, ExecMode } from '../types';
import { apiProtocolLabel } from '../utils/apiProtocol';
import { isVisibleLocalCliAgent } from '../utils/visibleAgents';
import { AgentIcon } from './AgentIcon';
import { Icon } from './Icon';
import { modelProviderIconSrc } from './modelProviderIcon';
import { PlanBadge } from './PlanBadge';
import {
  AMR_LOGIN_STATUS_EVENT,
  AMR_LOGIN_POLL_INTERVAL_MS,
  AMR_LOGIN_STARTUP_SETTLE_MS,
  amrLoginPollOutcome,
  amrLoginStatusEventAuthAttemptId,
  amrLoginStatusEventReason,
  notifyAmrLoginStatusChanged,
} from './amrLoginPolling';
import { orderAgentsWithOpenDesignFirst } from './agentOrdering';
import {
  agentModelIsSelectable,
  defaultAgentModelId,
  effectiveAgentModelChoice,
  normalizeAgentModelChoice,
} from './agentModelSelection';
import {
  orderModelOptionsByAvailability,
  SearchableModelSelect,
} from './modelOptions';
import {
  mergeProviderModelOptions,
  providerModelsCacheKey,
  type ProviderModelsCache,
} from './providerModelsCache';
import { isDeepSeekV4FlashCampaignModel } from '../campaigns/deepseek-v4-flash';
import { useDeepSeekV4FlashCampaignVisibility } from '../campaigns/use-deepseek-v4-flash-campaign';

interface Props {
  config: AppConfig;
  agents: AgentInfo[];
  providerModelsCache?: ProviderModelsCache;
  compact?: boolean;
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string; serviceTier?: string },
  ) => void;
  onApiProtocolChange: (protocol: ApiProtocol) => void;
  onApiModelChange: (model: string) => void;
  /** Lets the home picker warm the shared cache itself. Without it the picker
   *  only READS the cache (warmed by Settings/onboarding), so on a fresh load
   *  the BYOK list falls back to the small static seed list. */
  onProviderModelsCacheChange?: Dispatch<SetStateAction<ProviderModelsCache>>;
  onOpenSettings: (
    section?:
      | 'execution'
      | 'media'
      | 'composio'
      | 'language'
      | 'appearance'
      | 'notifications'
      | 'pet'
      | 'about',
  ) => void;
}

const API_PROTOCOL_TABS: Array<{ id: ApiProtocol; title: string }> = [
  { id: 'anthropic', title: 'Anthropic' },
  { id: 'openai', title: 'OpenAI' },
  { id: 'azure', title: 'Azure' },
  { id: 'google', title: 'Google' },
  { id: 'aihubmix', title: 'AIHubMix' },
];

const AMR_REMINDER_SEEN_KEY = 'open-design:inline-amr-cli-reminder-seen:v2';
let amrReminderSeenFallback = false;

/** Which popover surface is open. Compact home uses a split chip: left opens
 *  local CLI agents only (BYOK / provider UI stays in Settings for now —
 *  #6501), right opens the model list. ≤900px collapses to a logo circle that
 *  opens the model list. Non-compact keeps a single `full` panel. */
type SwitcherPanel = 'full' | 'agent' | 'model';

/** Must stay aligned with `@media (max-width: 900px)` in home-hero.css. */
export const HOME_COMPACT_ICON_ONLY_QUERY = '(max-width: 900px)';

function subscribeMediaQuery(query: string, onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mql = window.matchMedia(query);
  const listener = () => onStoreChange();
  mql.addEventListener('change', listener);
  return () => mql.removeEventListener('change', listener);
}

function getMediaQuerySnapshot(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(query).matches;
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => subscribeMediaQuery(query, onStoreChange),
    () => getMediaQuerySnapshot(query),
    () => false,
  );
}

function readAmrReminderSeen(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage
      ? window.localStorage.getItem(AMR_REMINDER_SEEN_KEY) === '1'
      : amrReminderSeenFallback;
  } catch {
    return amrReminderSeenFallback;
  }
}

function markAmrReminderSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage) {
      window.localStorage.setItem(AMR_REMINDER_SEEN_KEY, '1');
      return;
    }
  } catch {
    // Ignore storage failures; the reminder is purely advisory UI.
  }
  amrReminderSeenFallback = true;
}

function displayAgentName(agent: Pick<AgentInfo, 'id' | 'name'>): string {
  return agent.id === 'amr' ? 'Open Design' : agent.name;
}

function displayAgentChipName(agent: Pick<AgentInfo, 'id' | 'name'>): string {
  return agent.id === 'amr' ? 'Open Design' : displayAgentName(agent);
}

/**
 * True when the user previously saved a model for this CLI that the compact
 * list can actually represent and honor. `default` only means the CLI's own
 * default, so it must still prompt the user instead of suppressing the list.
 * The same validity rule the model sink enforces applies here: a stale AMR id
 * (coerced back to the live default by `normalizeAgentModelChoice`) or a
 * custom id an adapter rejects (`supportsCustomModel: false`) would leave no
 * selectable row in `compactModelRows`, so it is treated as no saved choice
 * and the compact pick still opens the model list.
 */
function hasUsableSavedAgentModel(
  agentModels: AppConfig['agentModels'] | undefined,
  agent: AgentInfo | null,
): boolean {
  if (!agent) return false;
  const model = agentModels?.[agent.id]?.model;
  if (typeof model !== 'string') return false;
  const trimmed = model.trim();
  if (trimmed.length === 0 || trimmed === 'default') return false;
  if (!agentModelIsSelectable(agent, trimmed)) return false;
  // A custom id outside the catalog is only a real saved choice when this
  // adapter accepts custom ids — otherwise the compact list has no row for it.
  if (agent.id !== 'amr' && !(agent.models ?? []).some((m) => m.id === trimmed)) {
    return agent.supportsCustomModel !== false;
  }
  return true;
}

export function InlineModelSwitcher({
  config,
  agents,
  providerModelsCache,
  compact = false,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onProviderModelsCacheChange,
  onOpenSettings,
}: Props) {
  const t = useT();
  const analytics = useAnalytics();
  const iconOnlyNarrow = useMediaQuery(HOME_COMPACT_ICON_ONLY_QUERY);
  const compactIconOnly = compact && iconOnlyNarrow;
  // Both flags are reserved presentation branches with no trigger wired yet:
  // `campaignRestricted` (已暂停 badge) is reserved for the backend
  // usage-limit signal — no trigger wired yet — and `campaignNeedsUpgrade`
  // (升级可用 badge) is reserved for a real unpaid-audience signal reaching
  // this component. Until those land, every campaign badge renders the paid
  // state.
  const campaignRestricted = false;
  const campaignNeedsUpgrade = false;
  const campaignVisibility = useDeepSeekV4FlashCampaignVisibility();
  const campaignModelBadge = campaignRestricted
    ? t('campaign.deepseekV4Flash.restricted.modelBadge')
    : campaignNeedsUpgrade
      ? t('campaign.deepseekV4Flash.unpaid.modelBadge')
      : t('campaign.deepseekV4Flash.paid.modelBadge');
  const campaignModelTooltip = campaignRestricted
    ? t('campaign.deepseekV4Flash.restricted.tooltip')
    : campaignNeedsUpgrade
      ? t('campaign.deepseekV4Flash.unpaid.tooltip')
      : t('campaign.deepseekV4Flash.ruleSummary');
  const campaignBadgeStateClass = campaignRestricted
    ? ' is-restricted'
    : campaignNeedsUpgrade
      ? ' is-unpaid'
      : '';
  // recvqfYKutwWlQ: gate the AMR upgrade entry on billing permission below,
  // not just plan tier — a team member without `canManageBilling` (owner-only)
  // can't act on an upgrade even when the tier itself is upgradeable.
  const {
    context: workspaceContext,
    loading: workspaceContextLoading,
  } = useWorkspaceContext();
  const workspaceBillingResponse = useWorkspaceBillingResponse();
  const [panel, setPanel] = useState<SwitcherPanel | null>(null);
  const open = panel !== null;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const campaignBenefitTrackedForOpenRef = useRef(false);
  // Viewport clamp for the popover (issue #99): the anchor chip can sit
  // anywhere on screen (home hero mid-page, chat composer at the bottom), so
  // a fixed downward placement runs past the screen edge once the model list
  // is long. Measured on open: cap the height to the space on the chosen
  // side and flip upward when below is tight.
  const [popoverPlacement, setPopoverPlacement] = useState<{
    up: boolean;
    maxHeight: number;
  } | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setPopoverPlacement(null);
      return;
    }
    const update = () => {
      const anchor = wrapRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const viewportHeight = window.innerHeight;
      const below = viewportHeight - anchor.bottom - 16;
      const above = anchor.top - 16;
      const up = below < 280 && above > below;
      setPopoverPlacement({ 
        up,
        maxHeight: Math.max(160, Math.min(560, up ? above : below)),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);
  const chipRef = useRef<HTMLElement | null>(null);
  const providerModelsFetchingRef = useRef<Set<string>>(new Set());
  const [amrStatus, setAmrStatus] = useState<VelaLoginStatus | null>(null);
  const [amrWalletSnapshot, setAmrWalletSnapshot] =
    useState<AmrWalletSnapshot | null>(null);
  const [amrWalletReady, setAmrWalletReady] = useState(false);
  const [amrLoginPending, setAmrLoginPending] = useState(false);
  const [amrLoginError, setAmrLoginError] = useState<string | null>(null);
  // One-shot signal that a compact AMR cancel has completed. The agent panel
  // was closed before login started, so a completed cancel must reopen it (to
  // show the post-cancel AMR row). The reopen itself lives in an effect keyed
  // on the CURRENT `compact` / `config.agentId` — writing it inline after
  // `await cancelVelaLogin` would read stale closure values (the callback's
  // dep list omits those props), reopening the agent panel over a different
  // agent the user picked while the cancel was in flight.
  const [amrCancelCompleted, setAmrCancelCompleted] = useState(false);
  const [amrReminderSeen, setAmrReminderSeen] = useState(readAmrReminderSeen);
  const [showAmrReminderInPopover, setShowAmrReminderInPopover] =
    useState(false);
  const amrPollRef = useRef<number | null>(null);
  // Bumped by `stopAmrPolling()` and `startAmrPolling()`. A poll `tick()`
  // captures its generation before awaiting `refreshAmrStatus()` and bails
  // after the await if the generation moved on — `stopAmrPolling()` cannot
  // cancel an already-in-flight tick, so a stale tick must never act on
  // terminal state that now belongs to a newer attempt.
  const amrPollGenerationRef = useRef(0);
  const amrLoginStartedAtRef = useRef<number | null>(null);
  const amrLoginStartPendingRef = useRef(false);
  const amrLoginCancelRequestedRef = useRef(false);
  const amrAuthAttemptIdRef = useRef<string | null>(null);
  /** Compact home: resume after AMR sign-in. The carried `agentId` scopes
   *  the handoff to the agent that started login — if the user switches to a
   *  different CLI while AMR is signing in, the resume no-ops and the
   *  unrelated agent's panel state is left alone. */
  const pendingCompactAmrPickRef = useRef<{ agentId: 'amr'; mode: 'model' | 'close' } | null>(null);
  /** Stale-continuation guard for `handleAgentButtonClick('amr')`. The path
   *  awaits `refreshAmrStatus()` after `onAgentChange('amr')`, which means a
   *  second pick (Codex, then back to AMR) can re-enter the handler while the
   *  first pick's continuation is still suspended on the await. Without a
   *  token, the first continuation wakes up, sees a stale "logged-out" status,
   *  and forces `pendingCompactAmrPickRef` / `setPanel(null)` / `handleAmrSignIn`
   *  for an agent the user has already moved on from. Each pick increments
   *  the ref; the continuation compares the token and bails if it no longer
   *  matches (any newer pick — even another AMR pick — has bumped it). */
  const amrPickTokenRef = useRef(0);

  const getModelPopoverBoundary = useCallback(() => {
    const scrollContainer = wrapRef.current?.closest<HTMLElement>(
      '.entry-main--scroll',
    );
    const scrollRect = scrollContainer?.getBoundingClientRect();
    const topbarRect = scrollContainer
      ?.querySelector<HTMLElement>('.entry-main__topbar')
      ?.getBoundingClientRect();
    return {
      top: Math.max(8, (topbarRect?.bottom ?? scrollRect?.top ?? 0) + 8),
      right: Math.min(
        window.innerWidth - 8,
        (scrollRect?.right ?? window.innerWidth) - 8,
      ),
      bottom: Math.min(
        window.innerHeight - 8,
        (scrollRect?.bottom ?? window.innerHeight) - 8,
      ),
      left: Math.max(8, (scrollRect?.left ?? 0) + 8),
    };
  }, []);

  const stopAmrPolling = useCallback(() => {
    amrPollGenerationRef.current += 1;
    if (amrPollRef.current !== null) {
      window.clearInterval(amrPollRef.current);
      amrPollRef.current = null;
    }
  }, []);

  /**
   * Compact home: after picking a CLI, reuse `agentModels[agentId]` when the
   * user already chose a model the compact list can represent; otherwise open
   * the model list so they do not silently run on the catalog default.
   */
  const finishCompactAgentPick = useCallback(
    (agentId: string) => {
      if (!compact) return;
      const agent = agents.find((a) => a.id === agentId) ?? null;
      setPanel(
        hasUsableSavedAgentModel(config.agentModels, agent) ? null : 'model',
      );
    },
    [agents, compact, config.agentModels],
  );

  const clearPendingCompactAmrPick = useCallback(() => {
    pendingCompactAmrPickRef.current = null;
  }, []);

  // The polling tick and `handleAmrSignin`'s post-await branch both need the
  // latest `finishCompactAgentPick` closure (it reads `config.agentModels`),
  // but neither callback lists `finishCompactAgentPick` in its deps so they
  // would otherwise capture the first-render closure. The `useRef` +
  // `ref.current =` indirection reaches the latest closure on every call.
  const finishCompactAgentPickRef = useRef(finishCompactAgentPick);
  finishCompactAgentPickRef.current = finishCompactAgentPick;

  // Current-agent ref: `tryCompleteCompactAmrPick` runs from closures created
  // before an agent switch (poll tick, immediate continuation, event effect).
  // Reading the ref — not the captured `config.agentId` — keeps the resume
  // gate on the CURRENT selection so a stale finalizer can never reopen or
  // close an unrelated agent's panel.
  const currentAgentIdRef = useRef(config.agentId);
  currentAgentIdRef.current = config.agentId;

  // Resume the pending compact AMR pick, if one exists. Three paths observe
  // the signed-in transition — polling tick, handleAmrSignin post-await, and
  // the login-status event useEffect — and each must re-evaluate the
  // saved-model decision at sign-in time with the freshest
  // `config.agentModels` (not the pick-time frozen value). The ref
  // indirection keeps every path on the latest `finishCompactAgentPick`
  // closure regardless of each callback's deps.
  const tryCompleteCompactAmrPick = useCallback(() => {
    // Only a compact pick that closed the agent panel to start login may
    // resume it. A sign-in started from the AMR account row (the agent panel
    // stays open) never sets the pending handoff, so it must not jump the
    // panel to the saved-model decision. Consume the handoff first: when the
    // poll tick and the immediate/event continuations race to finalize the
    // same sign-in, the second caller finds the ref empty and no-ops instead
    // of re-opening the panel twice.
    if (!pendingCompactAmrPickRef.current) return;
    clearPendingCompactAmrPick();
    // Gate on the CURRENT agent via the ref, not the closure's
    // `config.agentId`: an old poll tick created while AMR was active keeps
    // `config.agentId === 'amr'` even after the user selects Codex and would
    // otherwise overwrite the new agent's panel. The agentId-change effect
    // clears the pending ref on the common path; this ref check closes the
    // render-to-effect window as defense in depth.
    if (currentAgentIdRef.current !== 'amr' || !compact) return;
    finishCompactAgentPickRef.current('amr');
  }, [compact, finishCompactAgentPickRef]);

  // Every path that observes the signed-in transition — the polling tick,
  // `handleAmrSignIn`'s post-await refresh, and the login-status event —
  // must end the login identically: resolve the auth analytics with success
  // (with the observed user id), wake other AMR surfaces via the status
  // event, stop polling, clear login state, and resume the pending compact
  // pick. Without this shared finalizer, a login that completes before the
  // next poll tick would skip `amr_auth_result` and leave App and other AMR
  // surfaces stale until an unrelated refresh.
  const finalizeAmrSignIn = useCallback(
    (
      authAttemptId: string | null,
      signedInUserId: string | null | undefined,
    ) => {
      if (authAttemptId) {
        resolveAmrAuthTracking(analytics.track, 'success', undefined, {
          authAttemptId,
          signedInUserId: signedInUserId ?? null,
        });
      }
      notifyAmrLoginStatusChanged('status-changed', authAttemptId);
      stopAmrPolling();
      amrLoginStartedAtRef.current = null;
      setAmrLoginPending(false);
      tryCompleteCompactAmrPick();
    },
    [analytics.track, stopAmrPolling, tryCompleteCompactAmrPick],
  );

  const refreshAmrStatus = useCallback(async (
    guard?: { generation?: number; authAttemptId?: string | null },
  ) => {
    const next = await fetchVelaLoginStatus();
    // Reject a stale response BEFORE committing anything: a poll/event
    // request from a superseded attempt that resolves after polling restarted
    // for a newer attempt must not attribute its payload to the current
    // attempt (analytics), overwrite the current status, or clear the newer
    // attempt's login bookkeeping. The guard only checks continuity (did the
    // world move on while we fetched?), never the response body's attempt id —
    // `observeAmrAuthTracking` self-validates that. Callers that only observe
    // (e.g. the open/agents effect) deliberately pass no guard.
    if (guard) {
      if (
        guard.generation !== undefined &&
        guard.generation !== amrPollGenerationRef.current
      ) {
        return null;
      }
      if (
        guard.authAttemptId !== undefined &&
        guard.authAttemptId !== amrAuthAttemptIdRef.current
      ) {
        return null;
      }
    }
    // Do NOT write `amrAuthAttemptIdRef` here: this callback runs on every
    // status read, including stale ones from a superseded attempt, and would
    // otherwise reassign the current-attempt identity used by the signed-in
    // finalization guards. The ref is owned by the login flow
    // (`handleAmrSignIn` and `startAmrPolling`).
    const authAttemptId = amrAuthAttemptIdRef.current;
    if (next && authAttemptId) {
      observeAmrAuthTracking(analytics.track, next, authAttemptId);
    }
    if (next) {
      setAmrStatus(next);
      const pendingStartup =
        amrLoginStartedAtRef.current !== null &&
        Date.now() - amrLoginStartedAtRef.current < AMR_LOGIN_STARTUP_SETTLE_MS;
      if (next.loggedIn) {
        amrLoginStartedAtRef.current = null;
        setAmrLoginPending(false);
      } else if (next.loginInFlight) {
        setAmrLoginPending(true);
      } else if (!pendingStartup) {
        amrLoginStartedAtRef.current = null;
        setAmrLoginPending(false);
      }
    }
    return next;
  }, [analytics.track]);

  const startAmrPolling = useCallback((
    startedAt = Date.now(),
    authAttemptId = amrAuthAttemptIdRef.current,
  ) => {
    stopAmrPolling();
    // This poll's generation. A tick from an earlier poll — one whose
    // `refreshAmrStatus()` was still awaiting when the poll was restarted —
    // compares its captured generation after the await and bails so it
    // cannot act on state that now belongs to a newer attempt.
    const generation = ++amrPollGenerationRef.current;
    amrLoginStartedAtRef.current = startedAt;
    if (authAttemptId) amrAuthAttemptIdRef.current = authAttemptId;
    const tick = async () => {
      const next = await refreshAmrStatus({
        generation,
        authAttemptId: authAttemptId ?? undefined,
      });
      // Stale tick: a newer poll owns the terminal state now. Do not touch
      // the pending handoff, the interval, or the login bookkeeping. The
      // attempt half of the guard is belt-and-suspenders — the generation and
      // `amrAuthAttemptIdRef` change together — but it keeps a tick from a
      // superseded attempt from acting even if a restart somehow left the
      // generation untouched.
      if (
        generation !== amrPollGenerationRef.current ||
        (authAttemptId !== null && authAttemptId !== amrAuthAttemptIdRef.current)
      ) {
        return;
      }
      const outcome = amrLoginPollOutcome(next, startedAt);
      if (outcome === 'signed-in') {
        finalizeAmrSignIn(authAttemptId, next?.user?.id ?? null);
        return;
      }
      if (outcome === 'stopped' || outcome === 'timed-out') {
        stopAmrPolling();
        clearPendingCompactAmrPick();
        if (outcome === 'timed-out') {
          if (authAttemptId) {
            resolveAmrAuthTracking(analytics.track, 'timeout', 'login_timeout', {
              authAttemptId,
            });
            // `stopAmrPolling()` above already bumped the generation; capture
            // it AFTER that bump. If a newer attempt restarts polling while
            // this cancel is in flight, the broadcast must not fire — the
            // event handler's `login-canceled` writes are synchronous and
            // would kill the newer attempt's poll/pending before its guarded
            // status read can reject anything.
            const cancelGeneration = amrPollGenerationRef.current;
            void cancelVelaLogin(authAttemptId).then((result) => {
              if (
                authAttemptId &&
                authAttemptId !== amrAuthAttemptIdRef.current
              ) {
                return;
              }
              if (cancelGeneration !== amrPollGenerationRef.current) return;
              notifyAmrLoginStatusChanged(
                result.canceled === true ? 'login-canceled' : 'status-changed',
                authAttemptId,
              );
            });
          }
          console.error('[amr-login] poll timed out waiting for a signed-in status');
        } else {
          if (authAttemptId) {
            resolveAmrAuthTracking(analytics.track, 'failed', 'login_stopped', {
              authAttemptId,
            });
          }
          console.error('[amr-login] poll loop stopped without a terminal status');
        }
        amrLoginStartedAtRef.current = null;
        setAmrLoginPending(false);
        setAmrLoginError(t('settings.amrLoginErrorCompact'));
      }
    };
    amrPollRef.current = window.setInterval(() => {
      void tick();
    }, AMR_LOGIN_POLL_INTERVAL_MS);
  }, [
    analytics.track,
    clearPendingCompactAmrPick,
    finalizeAmrSignIn,
    refreshAmrStatus,
    stopAmrPolling,
    t,
  ]);

  const handleAmrSignIn = useCallback(async (
    attribution?: AmrEntryAttribution | null,
  ) => {
    const startedAt = Date.now();
    amrLoginStartedAtRef.current = startedAt;
    amrLoginCancelRequestedRef.current = false;
    setAmrLoginError(null);
    setAmrLoginPending(true);
    const provisionalAuthAttemptId = beginAmrAuthTracking(
      attribution,
      startedAt,
    );
    amrAuthAttemptIdRef.current = provisionalAuthAttemptId;
    const odDeviceId = amrHandoffDeviceId({
      metricsConsent: config.telemetry?.metrics === true,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId: config.installationId,
    });
    amrLoginStartPendingRef.current = true;
    const result = await startVelaLogin(
      attribution,
      odDeviceId,
      provisionalAuthAttemptId,
    ).finally(() => {
      amrLoginStartPendingRef.current = false;
    });
    const authAttemptId = reconcileAmrAuthAttemptId(
      provisionalAuthAttemptId,
      result.authAttemptId,
      { joinedExisting: result.alreadyRunning === true },
    );
    // Spawn-continuation ownership: while the spawn POST was in flight, the
    // login-started event path may have adopted a different attempt (another
    // surface's login). Only take over when the daemon confirms we joined
    // that same attempt (`authAttemptId === amrAuthAttemptIdRef.current`); a
    // confirmed-own response that conflicts with the adopted attempt means
    // this continuation is stale — leave the current owner to settle it
    // instead of overwriting its ref, broadcasting login-started, or
    // stealing its poll.
    if (
      amrAuthAttemptIdRef.current !== provisionalAuthAttemptId &&
      authAttemptId !== amrAuthAttemptIdRef.current
    ) {
      return;
    }
    amrAuthAttemptIdRef.current = authAttemptId;
    if (result.ok || result.alreadyRunning) {
      confirmAmrAuthTracking(analytics.track, authAttemptId, {
        joinedExisting: result.alreadyRunning === true,
      });
    }
    observeAmrAuthTracking(analytics.track, result, authAttemptId);
    if (amrLoginCancelRequestedRef.current) {
      if (result.ok || result.alreadyRunning) {
        const cancelResult = await cancelVelaLogin(authAttemptId);
        // Stale continuation: a newer attempt took over while the cancel was
        // in flight — it owns polling/pending/error/handoff now. Do not clear
        // its state or surface an error over it from this superseded context.
        if (authAttemptId !== amrAuthAttemptIdRef.current) return;
        if (!cancelResult.ok) {
          amrLoginCancelRequestedRef.current = false;
          amrLoginStartedAtRef.current = null;
          setAmrLoginPending(false);
          clearPendingCompactAmrPick();
          setAmrLoginError(t('settings.amrLoginErrorCompact'));
          return;
        }
        if (cancelResult.canceled !== true) {
          const next = await refreshAmrStatus({ authAttemptId });
          // Stale continuation: this instance started a newer sign-in while
          // the cancel + status read was in flight (`amrAuthAttemptIdRef` was
          // reassigned below for the new attempt). Do not start a poll or
          // clear the pending handoff for that newer attempt from this
          // superseded context.
          if (authAttemptId !== amrAuthAttemptIdRef.current) return;
          amrLoginCancelRequestedRef.current = false;
          if (next?.loginInFlight) {
            startAmrPolling(
              startedAt,
              next.authAttemptId ?? authAttemptId,
            );
          } else {
            clearPendingCompactAmrPick();
          }
          return;
        }
        resolveAmrAuthTracking(analytics.track, 'cancelled', undefined, {
          authAttemptId,
        });
        amrLoginCancelRequestedRef.current = false;
        amrLoginStartedAtRef.current = null;
        setAmrLoginPending(false);
        clearPendingCompactAmrPick();
        setAmrStatus((current) => (
          current
            ? { ...current, loggedIn: false, loginInFlight: false, user: null }
            : current
        ));
        // Reopen the compact agent panel so the post-cancel AMR row is
        // visible, mirroring `handleAmrCancelLogin`'s confirmed-cancel path
        // (this path is reached when the cancel intent was preserved across
        // the spawn — the panel was closed before login started).
        setAmrCancelCompleted(true);
        notifyAmrLoginStatusChanged('login-canceled', authAttemptId);
        return;
      }
      resolveAmrAuthTracking(analytics.track, 'cancelled', undefined, {
        authAttemptId,
      });
      amrLoginCancelRequestedRef.current = false;
      amrLoginStartedAtRef.current = null;
      setAmrLoginPending(false);
      clearPendingCompactAmrPick();
      return;
    }
    if (!result.ok && !result.alreadyRunning) {
      resolveAmrAuthTracking(analytics.track, 'failed', 'spawn_failed', {
        authAttemptId,
      });
      console.error('[amr-login] startVelaLogin failed', result);
      amrLoginStartedAtRef.current = null;
      setAmrLoginPending(false);
      clearPendingCompactAmrPick();
      setAmrLoginError(result.error || t('settings.amrLoginErrorCompact'));
      return;
    }
    notifyAmrLoginStatusChanged('login-started', authAttemptId);
    startAmrPolling(startedAt, authAttemptId);
    // Compact home may already be signed-in by the time the login spawn
    // returns (or a follow-up status refresh races ahead of the poll tick).
    // Finish the pending pick immediately so we do not wait on the interval.
    // Guard with this poll's generation + attempt so a continuation that
    // resolves after a cancel/re-login restart cannot commit stale status or
    // finalize the newer login.
    const signedIn = await refreshAmrStatus({
      generation: amrPollGenerationRef.current,
      authAttemptId,
    });
    if (signedIn?.loggedIn) {
      // Only finalize a sign-in this switcher is still polling for and that is
      // still the current attempt. The finalizer broadcasts `status-changed`
      // (waking other AMR surfaces), which re-enters the login-status event
      // handler — and `refreshAmrStatus()` clears `amrLoginStartedAtRef` on a
      // signed-in read, so the poll ref is the reliable in-progress signal.
      // The attempt check drops a continuation from a superseded attempt that
      // resolves after a restart (e.g. cancel + re-login as a new attempt).
      if (
        amrPollRef.current !== null &&
        authAttemptId === amrAuthAttemptIdRef.current
      ) {
        finalizeAmrSignIn(authAttemptId, signedIn?.user?.id ?? null);
      }
    }
  }, [
    analytics.track,
    clearPendingCompactAmrPick,
    config.installationId,
    config.telemetry?.metrics,
    finalizeAmrSignIn,
    refreshAmrStatus,
    startAmrPolling,
    t,
  ]);

  const handleAmrCancelLogin = useCallback(async () => {
    const loginStartPending = amrLoginStartPendingRef.current;
    const authAttemptId = amrAuthAttemptIdRef.current;
    stopAmrPolling();
    setAmrLoginError(null);
    if (!loginStartPending) {
      // Only drop the compact handoff once the cancel outcome is settled.
      // For a cancel issued while `startVelaLogin` is still in flight, the
      // handoff must survive until the start continuation resolves and
      // honors the intent (its cancel-completion path clears it).
      clearPendingCompactAmrPick();
    }
    const result = authAttemptId
      ? await cancelVelaLogin(authAttemptId)
      : { ok: false, canceled: false };
    // Stale continuation: a newer AMR attempt superseded this one while the
    // cancel was in flight (e.g. another surface restarted login). Its
    // post-await terminal writes (pending/error/status/reopen) would clobber
    // the newer attempt's state, so bail before touching anything.
    if (authAttemptId && authAttemptId !== amrAuthAttemptIdRef.current) return;
    if (!result.ok) {
      if (loginStartPending) {
        // The spawn is still in flight and the daemon could not cancel the
        // provisional attempt yet. Preserve the cancel intent so
        // `handleAmrSignIn`'s post-await issues the canonical cancel for the
        // resolved attempt instead of proceeding into login-started/polling.
        amrLoginCancelRequestedRef.current = true;
        return;
      }
      amrLoginStartedAtRef.current = null;
      setAmrLoginPending(false);
      setAmrLoginError(t('settings.amrLoginErrorCompact'));
      return;
    }
    if (result.canceled !== true) {
      const next = await refreshAmrStatus({
        authAttemptId: authAttemptId ?? undefined,
      });
      // Stale continuation: a newer AMR attempt took over while the status
      // read was in flight — it owns polling/pending/error now.
      if (authAttemptId && authAttemptId !== amrAuthAttemptIdRef.current) return;
      if (loginStartPending && next?.loginInFlight !== true) {
        amrLoginCancelRequestedRef.current = true;
        return;
      }
      if (next?.loggedIn) {
        // The login completed while the cancel was being processed (the
        // cancel raced with completion). Finalize it exactly like the poll
        // tick would, so analytics, other AMR surfaces, and the compact
        // handoff still settle.
        finalizeAmrSignIn(
          next.authAttemptId ?? authAttemptId,
          next?.user?.id ?? null,
        );
        return;
      }
      if (amrLoginStartedAtRef.current !== null) {
        // The daemon did not confirm the cancel, and the follow-up status is
        // either a transient null or `loginInFlight: false` inside the
        // startup settle window. `stopAmrPolling()` already killed the only
        // interval and `clearPendingCompactAmrPick()` already dropped the
        // handoff at the top of this handler, so without restarting here a
        // later signed-in/canceled status is never observed and the chip
        // stays "Signing in" forever. Keep the attempt alive while it is
        // still believed pending.
        startAmrPolling(
          amrLoginStartedAtRef.current,
          next?.authAttemptId ?? authAttemptId,
        );
      } else {
        clearPendingCompactAmrPick();
      }
      return;
    }
    if (loginStartPending) {
      // The spawn is still in flight; the provisional cancel confirmed, but
      // the start continuation must not take ownership. Keep the intent so
      // `handleAmrSignIn`'s post-await issues the canonical cancel for the
      // resolved attempt and settles the terminal state.
      amrLoginCancelRequestedRef.current = true;
      return;
    }
    if (authAttemptId) {
      resolveAmrAuthTracking(analytics.track, 'cancelled', undefined, {
        authAttemptId,
      });
    }
    amrLoginStartedAtRef.current = null;
    setAmrLoginPending(false);
    // Compact home closed the agent panel before login started; the cancel
    // completion effect below reopens it so the user sees the post-cancel AMR
    // row (Sign-in affordance + any error), matching the visibility invariant
    // that the `amrLoginError` effect enforces on the failure paths. The
    // effect — not this post-await continuation — decides the reopen, because
    // this callback's closure captures `compact` / `config.agentId` from its
    // last creation and the user may have switched agents while the cancel
    // was in flight.
    setAmrCancelCompleted(true);
    setAmrStatus((current) => (
      current
        ? { ...current, loggedIn: false, loginInFlight: false, user: null }
        : current
    ));
    notifyAmrLoginStatusChanged('login-canceled', authAttemptId);
  }, [
    analytics.track,
    clearPendingCompactAmrPick,
    finalizeAmrSignIn,
    refreshAmrStatus,
    startAmrPolling,
    stopAmrPolling,
    t,
  ]);

  const handleAgentButtonClick = useCallback(
    async (agentId: string) => {
      trackExecutionSettingsPopoverClick(analytics.track, {
        page_name: 'home',
        area: 'execution_settings_popover',
        element: 'agent_card',
        cli_provider_id: agentIdToTracking(agentId),
      });
      // Stale-continuation guard: stamp this pick with a fresh token. The path
      // below awaits `refreshAmrStatus()` after `onAgentChange(agentId)`, so
      // a faster second pick (Codex, then back to AMR) can re-enter this
      // handler and bump the ref while this continuation is still suspended.
      // When this continuation wakes up, a mismatched token means the user
      // has moved on; bail before touching `pendingCompactAmrPickRef`,
      // `setPanel`, or `handleAmrSignIn`.
      const pickToken = ++amrPickTokenRef.current;
      // Compact home lists CLI agents even when the active mode is BYOK
      // (BYOK provider UI is not on that surface yet). Picking an agent
      // must return execution to Local CLI.
      if (config.mode === 'api') onModeChange?.('daemon');
      onAgentChange?.(agentId);
      if (agentId !== 'amr') {
        finishCompactAgentPick(agentId);
        return;
      }
      if (amrLoginPending) {
        await handleAmrCancelLogin();
        return;
      }
      const attribution = recordAmrEntry(
        analytics.track,
        'inline_model_switcher_amr_row',
        new Date(),
        { metricsConsent: config.telemetry?.metrics === true },
      );
      const latest = await refreshAmrStatus({
        generation: amrPollGenerationRef.current,
        authAttemptId: amrAuthAttemptIdRef.current ?? undefined,
      });
      // A faster pick has bumped the token, or the active agent moved on via
      // a prop-driven change (another surface) that no click touched — the
      // token does not advance for prop changes, so the current-agent ref is
      // the second half of this invariant. Either way the user's choice has
      // moved on: this continuation must not write the pending handoff,
      // close the panel, or start an AMR login for the no-longer-active pick.
      if (
        amrPickTokenRef.current !== pickToken ||
        currentAgentIdRef.current !== agentId
      ) {
        return;
      }
      if (latest?.loggedIn) {
        finishCompactAgentPick(agentId);
        return;
      }
      // Login required — close the agent panel; resume after sign-in using the
      // pick-time saved-model decision so an unset agentModels[amr] still opens
      // the model list. The carried `agentId: 'amr'` scopes the resume — if
      // the user switches to another CLI mid-login, the resume is dropped.
      if (compact) {
        pendingCompactAmrPickRef.current = {
          agentId: 'amr',
          mode: hasUsableSavedAgentModel(
            config.agentModels,
            agents.find((a) => a.id === agentId) ?? null,
          )
            ? 'close'
            : 'model',
        };
        setPanel(null);
      }
      await handleAmrSignIn(attribution);
    },
    [
      amrLoginPending,
      analytics.track,
      agents,
      compact,
      config.agentModels,
      config.mode,
      config.telemetry?.metrics,
      finishCompactAgentPick,
      handleAmrCancelLogin,
      handleAmrSignIn,
      onAgentChange,
      onModeChange,
      refreshAmrStatus,
    ],
  );

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      const target = e.target as Node;
      if (wrapRef.current.contains(target)) return;
      // The model picker (`SearchableModelSelect`) renders its option list in a
      // portal on `document.body`, so a click on an option lands OUTSIDE
      // `wrapRef`. Without this guard the mousedown would close the whole
      // switcher panel before the option's click fires, unmounting the picker
      // and dropping the selection — the model would never change.
      if (
        target instanceof Element &&
        target.closest('.model-select-searchable__popover')
      ) {
        return;
      }
      setPanel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanel(null);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const scrollContainer = wrapRef.current?.closest('.entry-main--scroll');
    if (!(scrollContainer instanceof HTMLElement)) return;
    let frame = 0;
    const updateAnchorVisibility = () => {
      frame = 0;
      const trigger = chipRef.current;
      const triggerRect = trigger?.getBoundingClientRect();
      if (!triggerRect) return;
      const scrollRect = scrollContainer.getBoundingClientRect();
      const topbar = scrollContainer.querySelector<HTMLElement>('.entry-main__topbar');
      const anchorInTopbar = trigger ? topbar?.contains(trigger) === true : false;
      const topbarBottom = topbar?.getBoundingClientRect().bottom;
      const safeTop = anchorInTopbar
        ? scrollRect.top
        : Math.max(scrollRect.top, topbarBottom ?? scrollRect.top);
      const safeBottom = Math.min(window.innerHeight, scrollRect.bottom);
      const safeLeft = Math.max(0, scrollRect.left);
      const safeRight = Math.min(window.innerWidth, scrollRect.right);
      if (
        triggerRect.bottom <= safeTop ||
        triggerRect.top >= safeBottom ||
        triggerRect.right <= safeLeft ||
        triggerRect.left >= safeRight
      ) {
        setPanel(null);
      }
    };
    const scheduleVisibilityUpdate = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(updateAnchorVisibility);
    };
    updateAnchorVisibility();
    scrollContainer.addEventListener('scroll', scheduleVisibilityUpdate, {
      passive: true,
    });
    window.addEventListener('resize', scheduleVisibilityUpdate);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      scrollContainer.removeEventListener('scroll', scheduleVisibilityUpdate);
      window.removeEventListener('resize', scheduleVisibilityUpdate);
    };
  }, [open]);

  useEffect(() => {
    if (open && agents.some((agent) => agent.id === 'amr' && agent.available)) {
      // Passive observer read, guarded like every other status read: a
      // response that resolves after a newer attempt/poll took over must not
      // commit `setAmrStatus` or login bookkeeping onto the newer state.
      // Also adopt an in-flight server attempt nobody claimed yet (e.g. the
      // panel was opened after another surface started login, or a previous
      // follow-up read only saw a transient null): the compact cancel/retry
      // UI needs a real attempt id and a poll to observe the outcome.
      // `authAttemptId` here is deliberately NOT `?? undefined`: `null` is an
      // explicit expected owner (no attempt captured yet). Passing the raw
      // ref keeps `refreshAmrStatus`'s attempt comparison active even when it
      // is null — a local sign-in that sets a provisional attempt id while
      // this read is in flight then rejects the stale response, which the
      // `?? undefined` form would skip.
      void refreshAmrStatus({
        generation: amrPollGenerationRef.current,
        authAttemptId: amrAuthAttemptIdRef.current,
      }).then((next) => {
        if (next?.loginInFlight && amrPollRef.current === null) {
          amrLoginStartedAtRef.current ??= Date.now();
          startAmrPolling(
            amrLoginStartedAtRef.current,
            next.authAttemptId ?? null,
          );
        }
      });
    }
  }, [agents, open, refreshAmrStatus, startAmrPolling]);

  // Stop polling only on unmount. Polling has its own lifecycle (started by
  // `startAmrPolling`, ended by terminal `signed-in` / `stopped` / `timed-out`
  // outcomes) and must NOT be coupled to the panel opening or closing — in
  // compact mode `handleAgentButtonClick('amr')` closes the agent panel
  // before login starts, so this unmount-only cleanup is what keeps the
  // background polling alive while the user waits for sign-in.
  useEffect(() => {
    return () => stopAmrPolling();
  }, [stopAmrPolling]);

  useEffect(() => {
    const onStatusChange = (event: Event) => {
      const reason = amrLoginStatusEventReason(event);
      if (reason === 'login-started') {
        // Intentionally NOT gated on the broadcast attempt id, unlike
        // `login-canceled` below: `login-started` is an ADOPT signal — it may
        // arrive with an attempt id this component does not track yet (a
        // login started on another surface), and the follow-up read below is
        // what claims it. Gating here would break that adoption. Stale
        // `login-started` broadcasts are instead prevented at the senders:
        // every spawn continuation (InlineModelSwitcher, AmrLoginPill,
        // EntryShell) validates it still owns the attempt before emitting,
        // and the timeout-cancel continuation gates its own broadcast.
        // Adopt the event's canonical id into the ref so the follow-up guard
        // and any poll target the STARTED attempt, not the previously observed
        // one (which may be a superseded attempt A while B just started).
        const startedId = amrLoginStatusEventAuthAttemptId(event);
        if (startedId) amrAuthAttemptIdRef.current = startedId;
        const startedAt = Date.now();
        amrLoginStartedAtRef.current = startedAt;
        setAmrLoginError(null);
        setAmrLoginPending(true);
        // A poll is started below when the follow-up status reports in-flight,
        // or by handleAmrSignIn's own startAmrPolling; the idempotent fallback
        // covers the startup-settle window where status is neither in-flight
        // nor signed-in yet.
      } else if (reason === 'login-canceled') {
        const broadcastAttemptId = amrLoginStatusEventAuthAttemptId(event);
        // Only a broadcast that still owns the current attempt may
        // synchronously reset local login state. A stale `login-canceled`
        // from a superseded attempt (e.g. a delayed timeout cancel on
        // another surface) must not kill a newer login's poll/pending —
        // these writes run before this handler's guarded status read.
        // Broadcasts without an attempt id keep the legacy behavior.
        if (
          broadcastAttemptId === undefined ||
          broadcastAttemptId === amrAuthAttemptIdRef.current
        ) {
          amrLoginStartedAtRef.current = null;
          stopAmrPolling();
          clearPendingCompactAmrPick();
          setAmrLoginPending(false);
          // A matching `login-canceled` is authoritative for THIS attempt:
          // trust it locally and skip the follow-up read, mirroring
          // AmrLoginPill. `cancelVelaLogin()` only sends SIGTERM and keeps
          // the child in `activeLoginProcs` until it actually exits, so an
          // immediate `/api/integrations/vela/status` read can legally still
          // return `loginInFlight: true` — falling through to the guarded
          // refresh would re-commit `setAmrLoginPending(true)` and leave the
          // account row stuck on "Signing in…" with no poll to ever resolve
          // it. The next explicit refresh (mount, panel reopen, focus, or a
          // `status-changed` event) picks up the daemon's confirmed state.
          return;
        }
      }
      // Continuity guard for the follow-up read below: captured AFTER the
      // login-started/login-canceled branches so the guard uses the attempt id
      // adopted from the login-started event (not the pre-event ref, which may
      // still hold a superseded attempt A) and the post-reset poll generation.
      const statusGeneration = amrPollGenerationRef.current;
      const statusAttemptId = amrAuthAttemptIdRef.current;
      void refreshAmrStatus({
        generation: statusGeneration,
        authAttemptId: statusAttemptId ?? undefined,
      }).then((next) => {
        if (next?.loggedIn) {
          // Compact home may have closed the agent panel before login; finish
          // the pending pick here too — the poll tick is not the only path that
          // observes signed-in (login-started's follow-up refresh can win the race).
          // Only finalize a sign-in this switcher is polling for AND that is
          // still the current attempt: the finalizer broadcasts
          // `status-changed`, which re-enters this handler, and
          // `refreshAmrStatus()` clears `amrLoginStartedAtRef` on a signed-in
          // read — so the poll ref is the reliable in-progress signal and
          // `amrAuthAttemptIdRef` (maintained by startAmrPolling / handleAmrSignIn,
          // not by this continuation) identifies the attempt. A continuation
          // from a superseded attempt must not finalize the newer login.
          if (
            amrPollRef.current !== null &&
            (next.authAttemptId ?? amrAuthAttemptIdRef.current) ===
              amrAuthAttemptIdRef.current
          ) {
            finalizeAmrSignIn(
              next.authAttemptId ?? amrAuthAttemptIdRef.current,
              next?.user?.id ?? null,
            );
          }
          return;
        }
        if (next?.loginInFlight && amrLoginStartedAtRef.current !== null) {
          startAmrPolling(
            amrLoginStartedAtRef.current ?? Date.now(),
            next.authAttemptId ?? null,
          );
          return;
        }
        // A `login-started` broadcast whose follow-up status is neither
        // signed-in nor in-flight (the AMR contract explicitly allows
        // `loginInFlight: false` during the startup settle window) must not
        // strand this mounted switcher without a poll — the surface that
        // started the login may have unmounted, so nothing else would ever
        // observe the eventual signed-in state. Start one idempotently:
        // `amrPollRef` is already non-null on the direct `handleAmrSignIn`
        // path (it starts its own poll synchronously), and a cancel or
        // settle-window expiry clears `amrLoginStartedAtRef`, so this can
        // neither duplicate nor resurrect a login that is no longer pending.
        // `fetchVelaLoginStatus` returns null on transient HTTP/network
        // errors; that null is also a legitimate "neither signed-in nor
        // in-flight, but a login is still being awaited" signal and must
        // not strand the switcher in Signing in forever.
        // Deliberate blind-observer fallback: when the follow-up read was a
        // transient null there is no attempt id to carry, yet a login may
        // still be pending — starting the poll with `null` keeps observing
        // until the daemon reports a terminal state. Its finalize is safe
        // without an attempt: `finalizeAmrSignIn` skips analytics when the
        // attempt is null, and the status-changed broadcast + compact resume
        // only reflect a genuinely-observed signed-in state. (This is the
        // #8 edge documented in the review plan; tightening it would break
        // the pinned transient-null observer test.)
        if (
          amrPollRef.current === null &&
          amrLoginStartedAtRef.current !== null
        ) {
          startAmrPolling(
            amrLoginStartedAtRef.current,
            next?.authAttemptId ?? null,
          );
        }
      });
    };
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, onStatusChange);
    return () => {
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, onStatusChange);
    };
  }, [
    clearPendingCompactAmrPick,
    finalizeAmrSignIn,
    refreshAmrStatus,
    startAmrPolling,
    stopAmrPolling,
  ]);

  const installedAgents = useMemo(
    () =>
      orderAgentsWithOpenDesignFirst(
        agents.filter((a) => a.available && isVisibleLocalCliAgent(a)),
      ),
    [agents],
  );
  const currentAgent = useMemo(
    () => agents.find((a) => a.id === config.agentId) ?? null,
    [agents, config.agentId],
  );
  const amrInstalled = installedAgents.some((a) => a.id === 'amr');
  const shouldOfferAmrReminder =
    config.mode === 'daemon' && config.agentId !== 'amr' && amrInstalled;
  const showAmrReminder = shouldOfferAmrReminder && !amrReminderSeen;

  const currentChoice =
    (config.agentId && config.agentModels?.[config.agentId]) || {};
  const normalizedCurrentChoice = normalizeAgentModelChoice(currentAgent, currentChoice);
  const effectiveCurrentChoice = effectiveAgentModelChoice(currentAgent, currentChoice) ?? currentChoice;
  const currentAgentId = currentAgent?.id ?? null;
  const normalizedCurrentModelId = normalizedCurrentChoice?.model ?? null;
  const normalizedCurrentReasoning = normalizedCurrentChoice?.reasoning;
  const normalizedCurrentServiceTier = normalizedCurrentChoice?.serviceTier;
  const currentAgentModels = currentAgent?.models ?? [];
  const currentAgentModelIds = currentAgentModels.map((m) => m.id);
  const configuredModelId =
    typeof effectiveCurrentChoice.model === 'string' && effectiveCurrentChoice.model
      ? effectiveCurrentChoice.model
      : null;
  const currentModelId =
    currentAgent?.id === 'amr' &&
    configuredModelId &&
    configuredModelId !== 'default' &&
    !currentAgentModelIds.includes(configuredModelId)
      ? defaultAgentModelId(currentAgent)
      : configuredModelId ?? defaultAgentModelId(currentAgent);
  const currentModelOption =
    currentAgentModels.find((m) => m.id === currentModelId) ?? null;
  const isSupportedCustomModel =
    currentAgent?.id !== 'amr' &&
    currentAgent?.supportsCustomModel !== false &&
    !!currentModelId &&
    currentModelId !== 'default' &&
    !currentAgentModels.some((m) => m.id === currentModelId);

  const currentModelLabel =
    currentModelOption?.label ??
    (isSupportedCustomModel ? currentModelId : null);

  useEffect(() => {
    if (!currentAgentId || !normalizedCurrentModelId) return;
    const nextChoice: {
      model: string;
      reasoning?: string;
      serviceTier?: string;
    } = {
      model: normalizedCurrentModelId,
      reasoning: normalizedCurrentReasoning,
    };
    if (normalizedCurrentServiceTier !== undefined) {
      nextChoice.serviceTier = normalizedCurrentServiceTier;
    }
    onAgentModelChange(currentAgentId, nextChoice);
  }, [
    currentAgentId,
    normalizedCurrentModelId,
    normalizedCurrentReasoning,
    normalizedCurrentServiceTier,
    onAgentModelChange,
  ]);

  const inlineAgentModelOptions = useMemo(() => {
    const models = currentAgentModels;
    if (currentAgent?.id !== 'amr') return models;
    return orderModelOptionsByAvailability(models);
  }, [currentAgent?.id, currentAgentModels]);

  /**
   * The ONLY path from a model row to `onAgentModelChange` in this component.
   * Both model lists (the compact home list and the execution-settings picker)
   * write through here, so the availability gate cannot be forgotten by a list
   * added later — there is no second sink to forget it in. Returns false when
   * the pick was refused, which is the signal a row should not close the panel
   * or report a selection that did not happen.
   */
  const applyAgentModel = useCallback(
    (modelId: string, extra?: { serviceTier?: string }) => {
      const agentId = currentAgent?.id;
      if (!agentId) return false;
      if (!agentModelIsSelectable(currentAgent, modelId)) {
        return false;
      }
      onAgentModelChange?.(agentId, { model: modelId, ...extra });
      return true;
    },
    [currentAgent, onAgentModelChange],
  );

  /**
   * Compact-list rows carry the same verdict the sink enforces, so a locked row
   * is rendered as locked instead of as a normal row whose click silently
   * reverts (issue: clicking a model in the home list did nothing).
   */
  const compactModelRows = useMemo(
    () => {
      const rows = inlineAgentModelOptions.map((model) => ({
        model,
        selectable: agentModelIsSelectable(currentAgent, model.id),
      }));
      if (isSupportedCustomModel && currentModelId) {
        rows.push({
          model: {
            id: currentModelId,
            label: `${currentModelId} ${t('inlineSwitcher.customSuffix')}`,
            enabled: true,
          },
          selectable: true,
        });
      }
      return rows;
    },
    [currentAgent, currentModelId, inlineAgentModelOptions, isSupportedCustomModel, t],
  );

  useEffect(() => {
    if (!open) {
      campaignBenefitTrackedForOpenRef.current = false;
      return;
    }
    if (
      !compact
      || !campaignVisibility.visible
      || campaignBenefitTrackedForOpenRef.current
      || !compactModelRows.some(({ model }) => isDeepSeekV4FlashCampaignModel(model.id))
    ) {
      return;
    }
    campaignBenefitTrackedForOpenRef.current = true;
    trackDeepSeekCampaignModelBenefitSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'execution_settings_popover',
      element: 'deepseek_v4_flash_benefit',
      campaign_id: 'deepseek_v4_flash',
      user_state: campaignNeedsUpgrade ? 'unpaid' : 'paid',
      model_id: 'deepseek-v4-flash',
    });
  }, [
    analytics.track,
    campaignNeedsUpgrade,
    campaignVisibility.visible,
    compact,
    compactModelRows,
    open,
  ]);

  /** Where a refused model pick sends the user instead — the same plans
   *  destination the settings picker's upgrade lock already opens. */
  const openAmrModelUpgrade = useCallback(() => {
    const attribution = recordAmrEntry(
      analytics.track,
      campaignNeedsUpgrade
        ? 'deepseek_model_switcher_upgrade'
        : 'inline_amr_upgrade',
      new Date(),
      {
        metricsConsent: config.telemetry?.metrics === true,
        ...(campaignNeedsUpgrade
          ? {
              campaignId: 'deepseek_v4_flash' as const,
              conversionSource: 'deepseek_model_switcher_upgrade' as const,
            }
          : {}),
      },
    );
    const deviceId = amrHandoffDeviceId({
      metricsConsent: config.telemetry?.metrics === true,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId: config.installationId,
    });
    window.open(
      attributedAmrUrl(
        amrPlansUrlForProfile(
          amrStatus?.profile ?? config.agentCliEnv?.amr?.OPEN_DESIGN_AMR_PROFILE,
        ),
        attribution,
        deviceId,
      ),
      '_blank',
      'noopener,noreferrer',
    );
  }, [
    amrStatus?.profile,
    analytics.track,
    campaignNeedsUpgrade,
    config.agentCliEnv?.amr?.OPEN_DESIGN_AMR_PROFILE,
    config.installationId,
    config.telemetry?.metrics,
  ]);
  const amrLoggedIn = amrStatus?.loggedIn === true;

  // Drop the pending AMR handoff the moment the active agent leaves AMR — a
  // mid-login switch to another CLI must not leave the new agent's panel
  // state hostage to the AMR sign-in completing. Without this, the resume
  // path runs at login-settled time and reopens the unrelated panel.
  useEffect(() => {
    if (config.agentId !== 'amr') {
      pendingCompactAmrPickRef.current = null;
    }
  }, [config.agentId]);

  // AMR terminal failures (spawn failure, cancel failure, poll stop/timeout)
  // all set `amrLoginError`, but that string is rendered only inside the AMR
  // account row of the agent panel — and `handleAgentButtonClick('amr')`
  // closes that panel before login starts. Without this effect, the user sees
  // an empty chip with no error and no retry affordance. When the error
  // appears and the active agent is still AMR, surface the agent panel so the
  // error becomes visible (and the existing Sign-in button becomes clickable
  // for a retry).
  // Track the previous error so the reopen below fires only on the
  // no-error → new-error transition. Keying the reopen on `panel` (as the
  // original effect did) made the agent panel fight any navigation or
  // dismissal while an error was showing: clicking the compact model segment,
  // pressing Escape, or clicking outside re-asserted `setPanel('agent')`, so
  // the model list was unreachable and the error could not be dismissed.
  const previousAmrLoginErrorRef = useRef(amrLoginError);
  useEffect(() => {
    const hasNewError =
      amrLoginError !== null && previousAmrLoginErrorRef.current === null;
    previousAmrLoginErrorRef.current = amrLoginError;
    if (hasNewError && compact && config.agentId === 'amr') {
      setPanel('agent');
    }
  }, [amrLoginError, compact, config.agentId]);

  // `handleAmrCancelLogin`'s post-await continuation must not reopen the
  // compact agent panel itself: by the time `cancelVelaLogin` resolves the
  // user may have switched agents, and the callback's closure holds stale
  // `compact` / `config.agentId` (its dep list omits them). Record the
  // completion in state and let this effect — keyed on the CURRENT props —
  // decide, mirroring the `amrLoginError` effect above. The signal is
  // consumed once so it cannot re-open the panel on a later unrelated
  // panel/agent change.
  useEffect(() => {
    if (!amrCancelCompleted) return;
    if (compact && config.agentId === 'amr') {
      setPanel('agent');
    }
    setAmrCancelCompleted(false);
  }, [amrCancelCompleted, compact, config.agentId]);

  useEffect(() => {
    if (!amrLoggedIn || workspaceContext?.workspaceType === 'team') {
      setAmrWalletSnapshot(null);
      setAmrWalletReady(workspaceContext?.workspaceType === 'team');
      return;
    }
    let cancelled = false;
    setAmrWalletReady(false);
    void fetchAmrWalletSnapshot().then((next) => {
      if (cancelled) return;
      setAmrWalletSnapshot(next);
      setAmrWalletReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    amrLoggedIn,
    amrStatus?.profile,
    amrStatus?.user?.id,
    amrStatus?.user?.email,
    workspaceContext?.workspaceType,
  ]);

  // Signed-in rows show the current plan instead of a redundant "Signed in" +
  // check mark. When the plan can't be resolved (free user, stale local config,
  // upstream not yet fetched), show no status at all. Signed-in-without-plan is
  // distinguished from signed-out (which keeps the sign-in CTA) by `amrLoggedIn`,
  // never by plan presence.
  const amrPlanLabel = amrLoggedIn
    ? amrStatus?.account?.plan?.trim() || null
    : null;
  const scopedWorkspaceBalance = formatVelaBalanceUsd(
    workspaceBillingBalanceUsd(workspaceBillingResponse, workspaceContext),
  );
  const amrBalanceLabel = amrLoggedIn && !workspaceContextLoading
    ? workspaceContext?.workspaceType === 'team'
      ? scopedWorkspaceBalance
      : scopedWorkspaceBalance ??
        formatVelaBalanceUsd(amrStatus?.account?.balanceUsd) ??
        (amrWalletSnapshot?.status === 'available'
          ? formatVelaBalanceUsd(amrWalletSnapshot.balanceUsd)
          : null)
    : null;
  const amrBalanceDisplayLabel = amrLoggedIn
    ? amrBalanceLabel ??
      (
        workspaceContextLoading
          ? t('common.loading')
          : workspaceContext?.workspaceType === 'team'
            ? workspaceBillingResponse
              ? t('settings.amrWalletUnavailable')
              : t('common.loading')
            : amrWalletReady
              ? t('settings.amrWalletUnavailable')
              : t('common.loading')
      )
    : null;
  // Personal workspaces always resolve `canManageBilling` true (the user is
  // their own owner), so this does not affect the personal-workspace upgrade
  // path.
  const amrCanUpgrade =
    amrLoggedIn &&
    canUpgradeVelaPlan(amrStatus?.account?.plan) &&
    Boolean(workspaceContext?.permissions?.canManageBilling);
  const amrActionLabel = amrLoginPending
    ? t('settings.amrSigningIn')
    : amrLoggedIn
      ? amrPlanLabel ?? ''
      : t('settings.amrSignIn');
  const amrPendingHoverLabel = t('settings.amrCancelSignIn');
  // Visually hidden state for screen readers keeps announcing "signed in" even
  // when no plan label is shown.
  const amrInlineStatus = amrLoginError
    ? amrLoginError
    : amrLoggedIn
      ? amrPlanLabel ?? t('settings.amrSignedIn')
      : amrLoginPending
        ? t('settings.amrSigningIn')
        : t('settings.amrSignIn');
  const amrStatusIconName = amrLoginPending ? 'spinner' : null;

  const apiProtocol = config.apiProtocol ?? 'anthropic';
  const providerForProtocol = useMemo(
    () =>
      KNOWN_PROVIDERS.find(
        (p) =>
          p.protocol === apiProtocol &&
          (config.apiProviderBaseUrl
            ? p.baseUrl === config.apiProviderBaseUrl
            : false),
      ) ?? KNOWN_PROVIDERS.find((p) => p.protocol === apiProtocol),
    [apiProtocol, config.apiProviderBaseUrl],
  );
  const providerModelsKey = useMemo(
    () =>
      providerModelsCacheKey(
        apiProtocol,
        config.baseUrl,
        config.apiKey,
        config.apiVersion ?? '',
      ),
    [apiProtocol, config.apiKey, config.apiVersion, config.baseUrl],
  );
  const fetchedApiModelOptions = providerModelsCache?.[providerModelsKey] ?? [];

  // Warm the shared provider-models cache from the home picker itself. The
  // picker otherwise depends on Settings/onboarding having fetched first, so on
  // a fresh load the BYOK list shows only the small static seed list instead of
  // the live catalogue. We fetch when the panel is open in BYOK mode and the
  // preconditions for the active protocol are met (AIHubMix's catalogue is
  // public, so it needs no key; every other protocol needs one). Results are
  // keyed identically to Settings (`providerModelsKey`), so a single fetch
  // serves both surfaces and replaces any stale slot.
  useEffect(() => {
    if (!open || config.mode !== 'api' || !onProviderModelsCacheChange) return;
    if (apiProtocol === 'azure' || apiProtocol === 'ollama') return;
    if (apiProtocol !== 'aihubmix' && !config.apiKey.trim()) return;
    const baseUrl = config.baseUrl.trim();
    if (!/^https?:\/\//i.test(baseUrl)) return;
    const key = providerModelsKey;
    if (fetchedApiModelOptions.length) return;
    if (providerModelsFetchingRef.current.has(key)) return;
    providerModelsFetchingRef.current.add(key);
    let active = true;
    void fetchProviderModels({
      protocol: apiProtocol,
      baseUrl,
      apiKey: config.apiKey,
    })
      .then((result) => {
        if (active && result.ok && result.models?.length) {
          onProviderModelsCacheChange((current) => ({
            ...current,
            [key]: result.models ?? [],
          }));
        }
      })
      .catch(() => {
        // Non-fatal: the picker falls back to the static seed list.
      })
      .finally(() => {
        providerModelsFetchingRef.current.delete(key);
      });
    return () => {
      active = false;
    };
  }, [
    open,
    config.mode,
    config.apiKey,
    config.baseUrl,
    apiProtocol,
    providerModelsKey,
    fetchedApiModelOptions.length,
    onProviderModelsCacheChange,
  ]);

  const suggestedApiModelIds = useMemo(
    () =>
      Array.from(
        new Set(
          providerForProtocol?.preferredModels.length
            ? providerForProtocol.preferredModels
            : SUGGESTED_MODELS_BY_PROTOCOL[apiProtocol],
        ),
      ),
    [apiProtocol, providerForProtocol],
  );
  const apiModelOptions = useMemo(
    () => mergeProviderModelOptions(fetchedApiModelOptions, suggestedApiModelIds),
    [fetchedApiModelOptions, suggestedApiModelIds],
  );
  const apiModelIds = useMemo(
    () => apiModelOptions.map((model) => model.id),
    [apiModelOptions],
  );
  const apiModelChoices = useMemo(
    () => apiModelOptions.map((model) => ({ ...model, label: model.label })),
    [apiModelOptions],
  );

  // Chip text — keep it tight so the pill doesn't wrap on small viewports.
  // CLI: "Claude · Sonnet 4.5"; BYOK: "Anthropic · sonnet-4.5".
  const chipMode =
    config.mode === 'daemon'
      ? t('inlineSwitcher.chipCli')
      : t('inlineSwitcher.chipByok');
  const chipPrimary =
    config.mode === 'daemon'
      ? currentAgent
        ? displayAgentChipName(currentAgent)
        : t('inlineSwitcher.noAgent')
      : apiProtocolLabel(apiProtocol);
  const chipModel =
    config.mode === 'daemon'
      ? isDeepSeekV4FlashCampaignModel(currentModelId)
        ? currentModelLabel ?? 'DeepSeek V4 Flash'
        : currentModelLabel && currentModelId !== 'default'
          ? currentModelLabel
          : t('inlineSwitcher.modelDefault')
      : config.model.trim() || t('inlineSwitcher.modelDefault');

  // Compact home chip surfaces the selected model name + a connection-status
  // dot; label/tooltip fall back to the agent name. In CLI mode the agent's
  // `available` flag is the connection signal (reachable on PATH); API/BYOK is
  // a user-configured endpoint, treated as connected.
  const chipConnected =
    config.mode === 'daemon' ? currentAgent?.available === true : true;
  const chipAgentLabel = currentAgent
    ? displayAgentName(currentAgent)
    : t('inlineSwitcher.chipTitle');

  const handleChipClick = useCallback(() => {
    const nextOpen = panel !== 'full';
    if (nextOpen && showAmrReminder) {
      setShowAmrReminderInPopover(true);
      setAmrReminderSeen(true);
      markAmrReminderSeen();
    } else if (!nextOpen) {
      setShowAmrReminderInPopover(false);
    }
    setPanel(nextOpen ? 'full' : null);
  }, [panel, showAmrReminder]);

  /** Compact home split chip: left opens local CLI agents, right opens models.
   *  Icon-only (≤900px) routes the remaining logo circle to the model list. */
  const handleCompactSegmentClick = useCallback(
    (next: 'agent' | 'model') => {
      const closing = panel === next;
      if (!closing && showAmrReminder && next === 'agent') {
        setShowAmrReminderInPopover(true);
        setAmrReminderSeen(true);
        markAmrReminderSeen();
      } else if (closing || next !== 'agent') {
        setShowAmrReminderInPopover(false);
      }
      setPanel(closing ? null : next);
    },
    [panel, showAmrReminder],
  );

  const handleCompactAgentSegmentClick = useCallback(() => {
    handleCompactSegmentClick(compactIconOnly ? 'model' : 'agent');
  }, [compactIconOnly, handleCompactSegmentClick]);

  useEffect(() => {
    if (!open || config.mode !== 'daemon' || config.agentId === 'amr') {
      setShowAmrReminderInPopover(false);
    }
  }, [config.agentId, config.mode, open]);

  return (
    <div
      className={`inline-switcher${compact ? ' inline-switcher--compact' : ''}`}
      ref={wrapRef}
      data-testid="inline-model-switcher"
    >
      {compact ? (
        <div
          ref={(node) => {
            chipRef.current = node;
          }}
          className={
            'inline-switcher__chip inline-switcher__chip--split inline-switcher__chip--icon' +
            (showAmrReminder ? ' has-amr-reminder' : '')
          }
          data-testid="inline-model-switcher-chip"
        >
          {showAmrReminder ? (
            <span
              className="inline-switcher__amr-reminder-dot inline-switcher__amr-reminder-dot--chip"
              data-testid="inline-model-switcher-amr-reminder"
              aria-hidden="true"
            />
          ) : null}
          <button
            type="button"
            className={
              'inline-switcher__chip-seg inline-switcher__chip-seg--agent od-tooltip' +
              ((compactIconOnly ? panel === 'model' : panel === 'agent')
                ? ' is-expanded'
                : '')
            }
            data-testid="inline-model-switcher-chip-agent"
            onClick={handleCompactAgentSegmentClick}
            aria-haspopup="menu"
            aria-expanded={compactIconOnly ? panel === 'model' : panel === 'agent'}
            aria-label={
              compactIconOnly
                ? `${t('inlineSwitcher.modelLabel')}: ${chipModel}`
                : t('inlineSwitcher.agentLabel')
            }
            data-tooltip={
              compactIconOnly ? `${chipAgentLabel} · ${chipModel}` : chipAgentLabel
            }
            data-tooltip-placement="bottom"
          >
            <span className="inline-switcher__chip-icon" aria-hidden="true">
              {config.mode === 'daemon' && currentAgent ? (
                <AgentIcon id={currentAgent.id} size={18} />
              ) : (
                <span className="inline-switcher__byok-glyph">
                  <Icon name="link" size={14} />
                </span>
              )}
            </span>
          </button>
          <span className="inline-switcher__chip-divider" aria-hidden="true" />
          <button
            type="button"
            className={
              'inline-switcher__chip-seg inline-switcher__chip-seg--model od-tooltip' +
              (panel === 'model' ? ' is-expanded' : '')
            }
            data-testid="inline-model-switcher-chip-model"
            onClick={() => handleCompactSegmentClick('model')}
            aria-haspopup="menu"
            aria-expanded={panel === 'model'}
            aria-label={`${t('inlineSwitcher.modelLabel')}: ${chipModel}`}
            data-tooltip={`${chipAgentLabel} · ${chipModel}`}
            data-tooltip-placement="bottom"
          >
            <span
              className="inline-switcher__chip-conn"
              data-connected={chipConnected ? 'true' : 'false'}
              aria-hidden="true"
            />
            <span className="inline-switcher__chip-model-name">{chipModel}</span>
            {campaignVisibility.visible && isDeepSeekV4FlashCampaignModel(currentModelId) ? (
              <span
                className={`inline-switcher__campaign-badge od-tooltip${campaignBadgeStateClass}`}
                data-tooltip={campaignModelTooltip}
                data-tooltip-placement="top"
                aria-label={campaignModelTooltip}
              >
                {campaignModelBadge}
              </span>
            ) : null}
          </button>
        </div>
      ) : (
      <button
        ref={(node) => {
          chipRef.current = node;
        }}
        type="button"
        className={
          'inline-switcher__chip od-tooltip' +
          (showAmrReminder ? ' has-amr-reminder' : '')
        }
        data-testid="inline-model-switcher-chip"
        onClick={handleChipClick}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${chipMode} · ${chipPrimary} · ${chipModel}`}
        data-tooltip={`${chipMode} · ${chipPrimary} · ${chipModel}`}
        data-tooltip-placement="bottom"
      >
        {showAmrReminder ? (
          <span
            className="inline-switcher__amr-reminder-dot inline-switcher__amr-reminder-dot--chip"
            data-testid="inline-model-switcher-amr-reminder"
            aria-hidden="true"
          />
        ) : null}
            <span className="inline-switcher__chip-icon" aria-hidden="true">
              {config.mode === 'daemon' && currentAgent ? (
                <AgentIcon id={currentAgent.id} size={18} />
              ) : (
                <span className="inline-switcher__byok-glyph">
                  <Icon name="link" size={14} />
                </span>
              )}
            </span>
            <span className="inline-switcher__chip-text">
              <span className="inline-switcher__chip-mode">{chipMode}</span>
              <span className="inline-switcher__chip-sep" aria-hidden="true">
                ·
              </span>
              <span className="inline-switcher__chip-primary">{chipPrimary}</span>
              <span className="inline-switcher__chip-sep" aria-hidden="true">
                ·
              </span>
              <span className="inline-switcher__chip-model">{chipModel}</span>
            </span>
            <Icon
              name="chevron-down"
              size={12}
              className="inline-switcher__chip-chevron"
            />
      </button>
      )}

      {open ? (
        <div
          ref={popoverRef}
          className={`inline-switcher__popover${popoverPlacement?.up ? ' inline-switcher__popover--up' : ''}${compact && panel === 'agent' ? ' inline-switcher__popover--agent' : ''}${compact && panel === 'model' ? ' inline-switcher__popover--model' : ''}`}
          role="menu"
          data-testid="inline-model-switcher-popover"
          style={popoverPlacement ? { maxHeight: `${popoverPlacement.maxHeight}px`, overflowY: 'auto' } : undefined}
        >
          {!compact ? (
          <div className="inline-switcher__row">
            <span className="inline-switcher__label">
              {t('inlineSwitcher.modeLabel')}
            </span>
            <div className="inline-switcher__seg" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={config.mode === 'daemon'}
                className={
                  'inline-switcher__seg-btn' +
                  (config.mode === 'daemon' ? ' is-active' : '')
                }
                data-testid="inline-model-switcher-mode-daemon"
                disabled={!daemonLive && config.mode !== 'daemon'}
                onClick={() => {
                  trackExecutionSettingsPopoverClick(analytics.track, {
                    page_name: 'home',
                    area: 'execution_settings_popover',
                    element: 'mode_local_cli',
                  });
                  // Optional-call so a transient Fast Refresh state where a
                  // parent has not yet re-rendered with the new prop signature
                  // does not crash the entire entry view. The same defensive
                  // pattern is applied to every callback below.
                  onModeChange?.('daemon');
                  if (!daemonLive) {
                    setPanel(null);
                    onOpenSettings?.('execution');
                  }
                }}
                title={
                  !daemonLive
                    ? t('inlineSwitcher.daemonOffline')
                    : t('inlineSwitcher.useCli')
                }
              >
                {t('inlineSwitcher.chipCli')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={config.mode === 'api'}
                className={
                  'inline-switcher__seg-btn' +
                  (config.mode === 'api' ? ' is-active' : '')
                }
                data-testid="inline-model-switcher-mode-api"
                onClick={() => {
                  trackExecutionSettingsPopoverClick(analytics.track, {
                    page_name: 'home',
                    area: 'execution_settings_popover',
                    element: 'mode_byok',
                  });
                  onModeChange?.('api');
                }}
                title={t('inlineSwitcher.useByok')}
              >
                {t('inlineSwitcher.chipByok')}
              </button>
            </div>
          </div>
          ) : null}

          {compact && panel === 'model' ? (
            <>
              {/* Compact home — right segment: models for the ACTIVE mode.
                  Daemon → current CLI agent catalog; BYOK → configured API
                  provider catalog (not leftover CLI rows). */}
              <div className="inline-switcher__row">
              {config.mode === 'api' ? (
                apiModelOptions.length > 0 ? (
                  <SearchableModelSelect
                    className="inline-switcher__select"
                    popoverClassName="inline-model-popover"
                    data-testid="inline-model-switcher-api-model"
                    searchInputTestId="inline-model-switcher-api-model-search"
                    popoverTestId="inline-model-switcher-api-model-popover"
                    searchPlaceholder={t('designs.searchPlaceholder')}
                    getPopoverBoundary={getModelPopoverBoundary}
                    aria-label={t('inlineSwitcher.modelLabel')}
                    models={apiModelChoices}
                    value={config.model}
                    onChange={(nextValue) => {
                      trackExecutionSettingsPopoverClick(analytics.track, {
                        page_name: 'home',
                        area: 'execution_settings_popover',
                        element: 'model_dropdown',
                        execution_mode: 'byok',
                        provider_id:
                          byokProtocolToTracking(apiProtocol) ?? undefined,
                        model_id: modelIdForTracking(nextValue),
                      });
                      onApiModelChange?.(nextValue);
                    }}
                    additionalOptions={
                      config.model && !apiModelIds.includes(config.model)
                        ? [
                            {
                              value: config.model,
                              label: `${config.model} ${t('inlineSwitcher.customSuffix')}`,
                            },
                          ]
                        : undefined
                    }
                  />
                ) : (
                  <span className="inline-switcher__hint">
                    {t('inlineSwitcher.openSettingsForModel')}
                  </span>
                )
              ) : currentAgent && compactModelRows.length > 0 ? (
                <div className="inline-switcher__agent-grid" role="radiogroup">
                  {compactModelRows.map(({ model: m, selectable }) => {
                    const active = currentModelId === m.id;
                    // A model above the caller's plan is shown, but honestly:
                    // disabled with the reason the settings picker already uses,
                    // never as a normal row whose click silently gets reverted.
                    const campaignModel = campaignVisibility.visible
                      && isDeepSeekV4FlashCampaignModel(m.id);
                    const lockedHint = selectable
                      ? null
                      : t('settings.amrModelUpgradeHint');
                    return (
                      <div key={m.id} className="inline-switcher__agent-row">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-disabled={selectable ? undefined : 'true'}
                          title={lockedHint ?? undefined}
                          className={
                            'inline-switcher__agent' +
                            (active ? ' is-active' : '') +
                            (selectable ? '' : ' is-locked')
                          }
                          data-testid={`inline-model-switcher-compact-model-${m.id}`}
                          onClick={() => {
                            // The sink is the authority, not the row's styling:
                            // a refused pick routes to the plans page (same as
                            // the settings picker's lock) instead of writing a
                            // choice the config would revert.
                            // `serviceTier: undefined` is load-bearing exactly
                            // like the full picker: `mergeAgentModelChoice`
                            // reads the own property to DROP a stale tier from
                            // the previous model, so the key must survive the
                            // hand-off when switching to a model without tiers.
                            if (!applyAgentModel(m.id, { serviceTier: undefined })) {
                              if (amrCanUpgrade || campaignNeedsUpgrade) {
                                openAmrModelUpgrade();
                              }
                              return;
                            }
                            trackExecutionSettingsPopoverClick(analytics.track, {
                              page_name: 'home',
                              area: 'execution_settings_popover',
                              element: 'model_dropdown',
                              execution_mode: 'local_cli',
                              model_id: modelIdForTracking(m.id),
                            });
                            setPanel(null);
                          }}
                        >
                          <span
                            className="inline-switcher__agent-logo"
                            aria-hidden="true"
                          >
                            {(() => {
                              const src = modelProviderIconSrc(m.id);
                              return src ? (
                                <img
                                  src={src}
                                  alt=""
                                  width={16}
                                  height={16}
                                />
                              ) : (
                                <AgentIcon id={currentAgent.id} size={16} />
                              );
                            })()}
                          </span>
                          <span className="inline-switcher__agent-name">
                            {m.label}
                          </span>
                          {campaignModel ? (
                            <span
                              className={`inline-switcher__campaign-badge od-tooltip${campaignBadgeStateClass}`}
                              data-tooltip={campaignModelTooltip}
                              data-tooltip-placement="top"
                              aria-label={campaignModelTooltip}
                            >
                              {campaignModelBadge}
                            </span>
                          ) : null}
                          {lockedHint ? (
                            <span
                              className="inline-switcher__agent-lock"
                              data-testid={`inline-model-switcher-compact-model-lock-${m.id}`}
                            >
                              <Icon name="lock" size={12} />
                              <VisuallyHidden>{lockedHint}</VisuallyHidden>
                            </span>
                          ) : null}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <span className="inline-switcher__hint">
                  {t('inlineSwitcher.openSettingsForModel')}
                </span>
              )}
            </div>
            {config.mode === 'api' && !config.apiKey.trim() ? (
              <div className="inline-switcher__warn" role="status">
                {t('inlineSwitcher.missingApiKey')}
              </div>
            ) : null}
            </>
          ) : (!compact && config.mode === 'daemon') ||
            (compact && panel === 'agent') ? (
            <>
              <div className="inline-switcher__row">
                <span className="inline-switcher__label">
                  {t('inlineSwitcher.agentLabel')}
                </span>
                {installedAgents.length === 0 ? (
                  <span className="inline-switcher__hint">
                    {t('inlineSwitcher.noAgentsDetected')}
                  </span>
                ) : (
                  <div
                    className="inline-switcher__agent-grid"
                    role="radiogroup"
                  >
                    {installedAgents
                      .filter((a) => a.id !== 'amr')
                      .map((a) => {
                      const active = config.agentId === a.id;
                      const agentName = displayAgentChipName(a);
                      const showAgentReminder =
                        a.id === 'amr' &&
                        showAmrReminderInPopover &&
                        config.agentId !== 'amr';
                      return (
                        <div
                          key={a.id}
                          className="inline-switcher__agent-row"
                        >
                          <button
                            type="button"
                            role="radio"
                            aria-checked={active}
                            aria-label={
                              a.id === 'amr'
                                ? `${agentName} ${amrInlineStatus}`
                                : agentName
                            }
                            className={
                              'inline-switcher__agent' +
                              (active ? ' is-active' : '') +
                              (showAgentReminder ? ' has-amr-reminder' : '')
                            }
                            data-testid={`inline-model-switcher-agent-${a.id}`}
                            onClick={() => void handleAgentButtonClick(a.id)}
                            title={
                              a.id === 'amr' && amrLoginPending
                                ? amrPendingHoverLabel
                                : a.id !== 'amr' && a.version
                                  ? `${agentName} · ${a.version}`
                                  : agentName
                            }
                          >
                            <AgentIcon id={a.id} size={20} />
                            {showAgentReminder ? (
                              <span
                                className="inline-switcher__amr-reminder-dot inline-switcher__amr-reminder-dot--agent"
                                data-testid="inline-model-switcher-agent-amr-reminder"
                                aria-hidden="true"
                              />
                            ) : null}
                            <span className="inline-switcher__agent-name">
                              {agentName}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

              {amrInstalled ? (
                <div
                  className={
                    'inline-switcher__account' +
                    (config.agentId === 'amr' ? ' is-active' : '')
                  }
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={config.agentId === 'amr'}
                    aria-label={`Open Design ${amrInlineStatus}`}
                    className="inline-switcher__account-id inline-switcher__account-select"
                    data-testid="inline-model-switcher-agent-amr"
                    title={amrLoginPending ? amrPendingHoverLabel : undefined}
                    onClick={() => void handleAgentButtonClick('amr')}
                  >
                    <span className="inline-switcher__account-id-icon">
                      <AgentIcon id="amr" size={24} />
                      {showAmrReminderInPopover && config.agentId !== 'amr' ? (
                        <span
                          className="inline-switcher__amr-reminder-dot inline-switcher__amr-reminder-dot--account"
                          data-testid="inline-model-switcher-account-amr-reminder"
                          aria-hidden="true"
                        />
                      ) : null}
                    </span>
                    <span className="inline-switcher__account-text">
                      <span className="inline-switcher__account-name-row">
                        <span className="inline-switcher__account-name">
                          Open Design
                        </span>
                        {amrLoggedIn ? (
                          <PlanBadge plan={amrPlanLabel} size="md" />
                        ) : null}
                      </span>
                      {amrLoggedIn && amrBalanceDisplayLabel ? (
                        <span className="inline-switcher__account-subtitle">
                          <span className="inline-switcher__account-stat">
                            <span className="inline-switcher__account-stat-label">
                              {t('settings.amrBalance')}
                            </span>
                            <span className="inline-switcher__account-stat-value">
                              {amrBalanceDisplayLabel}
                            </span>
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </button>
                  {amrLoginError ? (
                    <span className="inline-switcher__account-status is-error">
                      {amrLoginError}
                    </span>
                  ) : amrLoggedIn ? (
                    amrCanUpgrade ? (
                      <button
                        type="button"
                        className="inline-switcher__account-upgrade"
                        data-testid="inline-model-switcher-account-upgrade"
                        onClick={(e) => {
                          e.stopPropagation();
                          const attribution = recordAmrEntry(
                            analytics.track,
                            'inline_amr_upgrade',
                            new Date(),
                            { metricsConsent: config.telemetry?.metrics === true },
                          );
                          const deviceId = amrHandoffDeviceId({
                            metricsConsent: config.telemetry?.metrics === true,
                            resolvedDeviceId: getResolvedDeviceId(),
                            installationId: config.installationId,
                          });
                          window.open(
                            attributedAmrUrl(
                              amrPlansUrlForProfile(
                                amrStatus?.profile ??
                                  config.agentCliEnv?.amr?.OPEN_DESIGN_AMR_PROFILE,
                              ),
                              attribution,
                              deviceId,
                            ),
                            '_blank',
                            'noopener,noreferrer',
                          );
                        }}
                      >
                        {t('settings.amrUpgrade')}
                      </button>
                    ) : null
                  ) : (
                    <button
                      type="button"
                      className="inline-switcher__account-action"
                      data-testid="inline-model-switcher-account-action"
                      title={amrLoginPending ? amrPendingHoverLabel : undefined}
                      onClick={() => {
                        if (amrLoginPending) {
                          void handleAmrCancelLogin();
                          return;
                        }
                        const attribution = recordAmrEntry(
                          analytics.track,
                          'inline_model_switcher_amr_row',
                          new Date(),
                          { metricsConsent: config.telemetry?.metrics === true },
                        );
                        void handleAmrSignIn(attribution);
                      }}
                    >
                      {amrStatusIconName ? (
                        <Icon name={amrStatusIconName} size={13} />
                      ) : null}
                      {amrActionLabel}
                    </button>
                  )}
                </div>
              ) : null}
              </div>

              {panel === 'full' &&
              currentAgent &&
              currentAgent.models &&
              currentAgent.models.length > 0 ? (
                <div className="inline-switcher__row">
                  <span className="inline-switcher__label">
                    {t('inlineSwitcher.modelLabel')}
                  </span>
                  <SearchableModelSelect
                    className="inline-switcher__select"
                    popoverClassName="inline-model-popover"
                    data-testid="inline-model-switcher-agent-model"
                    searchInputTestId="inline-model-switcher-agent-model-search"
                    popoverTestId="inline-model-switcher-agent-model-popover"
                    searchPlaceholder={t('designs.searchPlaceholder')}
                    getPopoverBoundary={getModelPopoverBoundary}
                    aria-label={t('inlineSwitcher.modelLabel')}
                    models={inlineAgentModelOptions}
                    // Only AMR's catalog genuinely spans multiple model
                    // vendors — every other agent's model list is one
                    // provider's own ids (o1/o3/o4-mini alongside gpt-*,
                    // for instance), which the company heuristic would
                    // otherwise split into misleading fake "companies".
                    groupByCompany={currentAgent?.id === 'amr'}
                    value={currentModelId ?? ''}
                    onChange={(nextValue) => {
                      // Same sink as the compact list — `serviceTier: undefined`
                      // is load-bearing here: `mergeAgentModelChoice` reads the
                      // own property to DROP a stale tier from the previous
                      // model, so the key must survive the hand-off.
                      if (
                        !applyAgentModel(nextValue, { serviceTier: undefined })
                      ) {
                        return;
                      }
                      trackExecutionSettingsPopoverClick(analytics.track, {
                        page_name: 'home',
                        area: 'execution_settings_popover',
                        element: 'model_dropdown',
                        execution_mode: 'local_cli',
                        model_id: modelIdForTracking(nextValue),
                      });
                    }}
                    additionalOptions={
                      currentAgent.id !== 'amr' &&
                      currentModelId &&
                      !currentAgent.models.some((m) => m.id === currentModelId)
                        ? [
                            {
                              value: currentModelId,
                              label: `${currentModelId} ${t('inlineSwitcher.customSuffix')}`,
                            },
                          ]
                        : undefined
                    }
                    disabledOptionHint={
                      currentAgent?.id === 'amr'
                        ? (option) =>
                            option.enabled === false
                              ? t('settings.amrModelUpgradeHint')
                              : null
                        : undefined
                    }
                    onDisabledOptionUpgrade={
                      currentAgent?.id === 'amr'
                        ? openAmrModelUpgrade
                        : undefined
                    }
                  />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="inline-switcher__row">
                <span className="inline-switcher__label">
                  {t('inlineSwitcher.providerLabel')}
                </span>
                <div className="inline-switcher__chips" role="tablist">
                  {API_PROTOCOL_TABS.map((tab) => {
                    const active = apiProtocol === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={
                          'inline-switcher__chip-tab' +
                          (active ? ' is-active' : '')
                        }
                        data-testid={`inline-model-switcher-provider-${tab.id}`}
                        onClick={() => {
                          // Unlike Settings (which skips unmapped protocols),
                          // report the click even when the protocol has no v2
                          // provider_id (e.g. aihubmix) — just omit the field.
                          trackExecutionSettingsPopoverClick(analytics.track, {
                            page_name: 'home',
                            area: 'execution_settings_popover',
                            element: 'byok_provider_tab',
                            provider_id:
                              byokProtocolToTracking(tab.id) ?? undefined,
                          });
                          onApiProtocolChange?.(tab.id);
                        }}
                      >
                        {tab.title}
                      </button>
                    );
                  })}
                </div>
              </div>

              {panel === 'full' ? (
              <div className="inline-switcher__row">
                <span className="inline-switcher__label">
                  {t('inlineSwitcher.modelLabel')}
                </span>
                {apiModelOptions.length > 0 ? (
                  <SearchableModelSelect
                    className="inline-switcher__select"
                    popoverClassName="inline-model-popover"
                    data-testid="inline-model-switcher-api-model"
                    searchInputTestId="inline-model-switcher-api-model-search"
                    popoverTestId="inline-model-switcher-api-model-popover"
                    searchPlaceholder={t('designs.searchPlaceholder')}
                    getPopoverBoundary={getModelPopoverBoundary}
                    aria-label={t('inlineSwitcher.modelLabel')}
                    models={apiModelChoices}
                    value={config.model}
                    onChange={(nextValue) => {
                      trackExecutionSettingsPopoverClick(analytics.track, {
                        page_name: 'home',
                        area: 'execution_settings_popover',
                        element: 'model_dropdown',
                        execution_mode: 'byok',
                        provider_id:
                          byokProtocolToTracking(apiProtocol) ?? undefined,
                        model_id: modelIdForTracking(nextValue),
                      });
                      onApiModelChange?.(nextValue);
                    }}
                    additionalOptions={
                      config.model && !apiModelIds.includes(config.model)
                        ? [
                            {
                              value: config.model,
                              label: `${config.model} ${t('inlineSwitcher.customSuffix')}`,
                            },
                          ]
                        : undefined
                    }
                  />
                ) : (
                  <span className="inline-switcher__hint">
                    {t('inlineSwitcher.openSettingsForModel')}
                  </span>
                )}
              </div>
              ) : null}

              {panel === 'full' && !config.apiKey ? (
                <div className="inline-switcher__warn" role="status">
                  {t('inlineSwitcher.missingApiKey')}
                </div>
              ) : null}
            </>
          )}

          <button
            type="button"
            className="inline-switcher__more"
            data-testid="inline-model-switcher-open-settings"
            onClick={() => {
              trackExecutionSettingsPopoverClick(analytics.track, {
                page_name: 'home',
                area: 'execution_settings_popover',
                element: 'open_execution_settings',
              });
              setPanel(null);
              onOpenSettings?.('execution');
            }}
          >
            <Icon name="settings" size={13} />
            <span>{t('inlineSwitcher.openFullSettings')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
