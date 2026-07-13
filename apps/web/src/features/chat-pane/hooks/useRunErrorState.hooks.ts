import { useCallback, useEffect, useRef, useState } from 'react';
import type { TrackingProjectKind } from '@open-design/contracts/analytics';
import { amrHandoffDeviceId, attributedAmrUrl, recordAmrEntry } from '../../../analytics/amr-attribution';
import { getResolvedDeviceId } from '../../../analytics/client';
import { trackRunFailedToastSurfaceView } from '../../../analytics/events';
import {
  AMR_LOGIN_STATUS_EVENT,
  amrLoginStatusEventReason,
} from '../../../components/amrLoginPolling';
import { copyToClipboard } from '../../../lib/copy-to-clipboard';
import {
  amrPlansUrlForProfile,
  amrRechargeUrlForProfile,
  resolveRunFailureUi,
} from '../../../runtime/amr-guidance';
import { agentDisplayName } from '../../../utils/agentLabels';
import type { Dict } from '../../../i18n/types';
import type { AppConfig, ChatMessage } from '../../../types';
import { amrLoginPort, chatPaneDomPort } from '../dependencies';
import type { AmrLoginPort, ChatPaneDomPort } from '../ports';
import { buildRunErrorDiagnosticText, isActiveRunStatus, retryableAssistantMessage } from '../rules';
import type { VelaLoginStatus } from '../types';

const AMR_PROFILE_ENV_KEY = 'OPEN_DESIGN_AMR_PROFILE';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;
type Track = (
  event: string,
  properties: Record<string, unknown>,
  options?: { requestId?: string; insertId?: string },
) => void;

export function useRunErrorState(
  displayMessages: ChatMessage[],
  streaming: boolean,
  error: string | null,
  {
    projectId,
    activeConversationId,
    projectKindForTracking,
    config,
    analyticsTrack,
    onRetry,
    showByokRecoveryAction,
    onSwitchToLocalCli,
    onSwitchToAmrAndRetry,
    onOpenAmrSettings,
    t,
  }: {
    projectId: string | null;
    activeConversationId: string | null;
    projectKindForTracking: TrackingProjectKind | null;
    config: AppConfig | undefined;
    analyticsTrack: Track;
    onRetry: ((assistantMessage: ChatMessage) => void) | undefined;
    showByokRecoveryAction: boolean;
    onSwitchToLocalCli: (() => void) | undefined;
    onSwitchToAmrAndRetry: ((failedAssistant: ChatMessage) => void) | undefined;
    onOpenAmrSettings: (() => void) | undefined;
    t: TranslateFn;
  },
  domPort: ChatPaneDomPort = chatPaneDomPort,
  loginPort: AmrLoginPort = amrLoginPort,
) {
  const amrProfile = config?.agentCliEnv?.amr?.[AMR_PROFILE_ENV_KEY] ?? null;
  const [inlineAmrLoginStatus, setInlineAmrLoginStatus] =
    useState<VelaLoginStatus | null>(null);
  // Guards the inline AMR sign-in card so a successful login auto-retries the
  // failed run exactly once (the pill's onStatusChange fires loggedIn on every
  // poll). Keyed by the failed assistant's id.
  const amrAuthRetriedRef = useRef<string | null>(null);
  // Tracks the last observed AMR login state so we retry only on a real
  // signed-out -> signed-in transition. Without this, a run that keeps failing
  // AMR_AUTH_REQUIRED while /status already reports signed-in would auto-retry
  // forever (each retry is a new assistant id, so the id guard alone never
  // converges).
  const amrAuthPrevLoggedInRef = useRef<boolean | undefined>(undefined);
  const runFailedToastSurfaceKeysRef = useRef<Set<string>>(new Set());

  const refreshInlineAmrLoginStatus = useCallback(async (options: { refresh?: boolean } = {}) => {
    const next = await loginPort.fetchVelaLoginStatus(options).catch(() => null);
    if (next) setInlineAmrLoginStatus(next);
    return next;
  }, [loginPort]);

  useEffect(() => {
    void refreshInlineAmrLoginStatus();
    return domPort.subscribeWindowEvent(AMR_LOGIN_STATUS_EVENT, (event) => {
      const reason = amrLoginStatusEventReason(event);
      if (reason === 'login-canceled') return;
      void refreshInlineAmrLoginStatus();
    });
  }, [domPort, refreshInlineAmrLoginStatus]);

  // Re-check login status when the user returns to this tab (e.g. after
  // completing sign-in in an external AMR tab) — focus/visibilitychange don't
  // otherwise trigger a refresh, so a completed external sign-in would
  // silently sit stale until the next poll tick.
  useEffect(
    () =>
      domPort.subscribeVisibleFocusOrVisibilityChange(() => {
        void refreshInlineAmrLoginStatus({ refresh: true });
      }),
    [domPort, refreshInlineAmrLoginStatus],
  );

  const lastAssistantId = (() => {
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      if (displayMessages[i]!.role === 'assistant') return displayMessages[i]!.id;
    }
    return undefined;
  })();
  const hasActiveRunMessage = displayMessages.some(
    (m) => m.role === 'assistant' && isActiveRunStatus(m.runStatus),
  );
  const retryAssistant = retryableAssistantMessage(displayMessages, lastAssistantId, streaming);
  // The failed run's error event lives on the (persisted) assistant message, so
  // the error card + AMR card survive a reload — unlike the ephemeral global
  // `error` state. Drive both off this event.
  const failedRunErrorEvent = (() => {
    const evs = retryAssistant?.events ?? [];
    for (let i = evs.length - 1; i >= 0; i--) {
      const ev = evs[i];
      if (ev?.kind === 'status' && ev.label === 'error') return ev;
    }
    return null;
  })();
  // Per-case failure UI (button + copy + whether to promote AMR). Only
  // meaningful for a failed run (retryAssistant present).
  const runFailureUi = retryAssistant
    ? resolveRunFailureUi(
        failedRunErrorEvent?.code,
        failedRunErrorEvent?.failureDetail,
        retryAssistant.agentId,
      )
    : null;
  const hasInlineAmrAuthorizeFailure = Boolean(
    retryAssistant && onRetry && runFailureUi?.primaryAction === 'authorize',
  );

  // Shared signed-out -> signed-in transition detector, driven either by the
  // 500ms poll below or by the inline AmrLoginPill's own onStatusChange event.
  const attemptAmrRetryOnSignIn = useCallback((next: VelaLoginStatus | null) => {
    if (!retryAssistant || !onRetry) return;
    if (next?.loggedIn === true) {
      const wasSignedOut = amrAuthPrevLoggedInRef.current === false;
      amrAuthPrevLoggedInRef.current = true;
      if (wasSignedOut && amrAuthRetriedRef.current !== retryAssistant.id) {
        amrAuthRetriedRef.current = retryAssistant.id;
        onRetry(retryAssistant);
      }
    } else if (next && next.loggedIn === false) {
      amrAuthPrevLoggedInRef.current = false;
    }
  }, [onRetry, retryAssistant]);

  useEffect(() => {
    if (!hasInlineAmrAuthorizeFailure || !retryAssistant || !onRetry) return;
    let stopped = false;
    const retryIfSignedIn = async () => {
      const next = await refreshInlineAmrLoginStatus();
      if (stopped) return;
      attemptAmrRetryOnSignIn(next);
    };
    void retryIfSignedIn();
    return domPort.scheduleInterval(() => {
      void retryIfSignedIn();
    }, 500);
  }, [
    attemptAmrRetryOnSignIn,
    domPort,
    hasInlineAmrAuthorizeFailure,
    onRetry,
    refreshInlineAmrLoginStatus,
    retryAssistant,
  ]);

  // The inline AmrLoginPill's own status-change event (fires on every poll it
  // runs itself) — reuses the same transition detector as the effect above.
  const handleAmrLoginStatusChange = useCallback((next: VelaLoginStatus | null) => {
    attemptAmrRetryOnSignIn(next);
  }, [attemptAmrRetryOnSignIn]);

  // Offer Continue (resume) when the failed run is resumable AND the active
  // agent still matches the agent that produced it. The daemon stores a
  // resumable session per (conversation, agent); after an agent switch the new
  // agent has no id for that session, so a resume would silently start fresh —
  // fall back to the from-scratch Retry instead. We do NOT require `onResumeRun`
  // here: because the daemon persists the resumable session, the plain Retry
  // path (which re-sends the original prompt) would itself silently resume that
  // session and double the work. So every ChatPane surface must offer Continue
  // for a resumable failure — `onResumeRun` when wired (primary chat, carries
  // the resume_continue analytics), otherwise a plain `onSend` of the canonical
  // continue prompt (resumes the session without re-sending the original turn).
  const canResumeFailedRun =
    !!retryAssistant?.resumable &&
    !!retryAssistant?.agentId &&
    retryAssistant.agentId === config?.agentId;
  // Prefer a case-specific message (AMR auth / balance) over the raw upstream
  // string; fall back to the live global error (also covers conversation-load
  // / audio errors) then the persisted run error so a reload still shows it.
  const rawError = error ?? failedRunErrorEvent?.detail ?? null;
  // Friendly agent name for {agent} interpolation in failure copy (e.g. the
  // sign-in messages). Falls back to a neutral word when unreadable, never null.
  const failedAgentLabel =
    agentDisplayName(retryAssistant?.agentId, retryAssistant?.agentName) ??
    t('chat.runError.agentFallback');
  const displayError = runFailureUi?.messageKey
    ? t(runFailureUi.messageKey, { agent: failedAgentLabel })
    : rawError;
  const errorDiagnosticText = displayError
    ? buildRunErrorDiagnosticText({
        message: displayError,
        rawMessage: rawError,
        errorCode: failedRunErrorEvent?.code,
        traceId: retryAssistant?.runId,
        projectId,
        conversationId: activeConversationId,
        assistantMessageId: retryAssistant?.id,
        agentId: retryAssistant?.agentId,
      })
    : null;
  // First non-empty line of the diagnostics — shown as the one-line peek when
  // the error-source area is collapsed.
  const errorSourcePeek =
    errorDiagnosticText?.split('\n').find((line) => line.trim().length > 0)?.trim() ?? null;
  // Status-dot tone for the unified card. Brand (accent) for AMR sign-in/top-up
  // — the commercial recovery path; warn (amber) for the self-healing
  // connection drop; error (red) for everything else. Purely visual.
  const runErrorTone: 'error' | 'warn' | 'brand' =
    runFailureUi?.primaryAction === 'authorize' ||
    runFailureUi?.primaryAction === 'recharge' ||
    runFailureUi?.primaryAction === 'upgrade'
      ? 'brand'
      : failedRunErrorEvent?.code === 'AGENT_CONNECTION_DROPPED'
        ? 'warn'
        : 'error';
  const [copiedErrorDiagnostic, setCopiedErrorDiagnostic] = useState(false);
  // Collapsed by default: the error source area shows one line until expanded.
  const [errorSourceOpen, setErrorSourceOpen] = useState(false);
  const errorDiagnosticCopyTimerRef = useRef<(() => void) | null>(null);
  const copyErrorDiagnostic = useCallback(async () => {
    if (!errorDiagnosticText) return;
    const ok = await copyToClipboard(errorDiagnosticText);
    if (!ok) return;
    errorDiagnosticCopyTimerRef.current?.();
    setCopiedErrorDiagnostic(true);
    errorDiagnosticCopyTimerRef.current = domPort.scheduleTimeout(() => {
      errorDiagnosticCopyTimerRef.current = null;
      setCopiedErrorDiagnostic(false);
    }, 1600);
  }, [domPort, errorDiagnosticText]);
  useEffect(() => () => {
    errorDiagnosticCopyTimerRef.current?.();
    errorDiagnosticCopyTimerRef.current = null;
  }, []);
  // The "recharge" run-error action: records AMR entry attribution, forwards
  // the telemetry device id on opt-in, and opens the recharge URL.
  const handleAmrRecharge = useCallback(() => {
    const attribution = recordAmrEntry(
      analyticsTrack,
      'chat_error_recharge',
      new Date(),
      { metricsConsent: config?.telemetry?.metrics === true },
    );
    // Forward the canonical telemetry device id to AMR only on metrics
    // opt-in (see amrHandoffDeviceId). Sourced from the current
    // config.installationId / resolved device id, not the mount-time
    // bootstrap UUID, so the join key matches the telemetry identity even
    // across a Delete-my-data rotation.
    const deviceId = amrHandoffDeviceId({
      metricsConsent: config?.telemetry?.metrics === true,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId: config?.installationId,
    });
    domPort.openExternalUrl(
      attributedAmrUrl(amrRechargeUrlForProfile(amrProfile), attribution, deviceId),
    );
  }, [amrProfile, analyticsTrack, config?.installationId, config?.telemetry?.metrics, domPort]);
  // The "upgrade" run-error action: same attribution/device-id handoff as
  // recharge, but points at the plans page (tier entitlement, not balance).
  const handleAmrUpgrade = useCallback(() => {
    const attribution = recordAmrEntry(
      analyticsTrack,
      'chat_error_upgrade',
      new Date(),
      { metricsConsent: config?.telemetry?.metrics === true },
    );
    const deviceId = amrHandoffDeviceId({
      metricsConsent: config?.telemetry?.metrics === true,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId: config?.installationId,
    });
    domPort.openExternalUrl(
      attributedAmrUrl(amrPlansUrlForProfile(amrProfile), attribution, deviceId),
    );
  }, [amrProfile, analyticsTrack, config?.installationId, config?.telemetry?.metrics, domPort]);
  // Guards the inline AMR sign-in pill's re-poll: once the user clicks through
  // to start an external sign-in, force the transition detector back to
  // "was signed out" so the eventual signed-in poll result is treated as a
  // real transition (and retries), even if the pill's last observed status
  // before the click happened to already read signed-in from a stale poll.
  const handleAmrSignInStarted = useCallback(() => {
    amrAuthPrevLoggedInRef.current = false;
  }, []);
  // The hosted-AMR promotion card's activate action: switch-and-retry when
  // wired, otherwise fall back to opening AMR settings.
  const handleAmrSwitchActivate = useCallback(() => {
    if (retryAssistant && onSwitchToAmrAndRetry) {
      onSwitchToAmrAndRetry(retryAssistant);
    } else {
      onOpenAmrSettings?.();
    }
  }, [onOpenAmrSettings, onSwitchToAmrAndRetry, retryAssistant]);
  // The failed run whose error this top-level card represents. AssistantMessage
  // suppresses only THIS message's per-message error pill (to avoid the
  // duplicate); other failed turns — older history, or once a follow-up makes
  // this no longer the last assistant — keep their pill so the error survives.
  const errorCardOwnerId =
    retryAssistant && failedRunErrorEvent ? retryAssistant.id : null;
  // AMR promotion card payload (only the non-AMR model/auth/quota case).
  const amrSwitchPayload =
    runFailureUi?.showSwitchCard
    && failedRunErrorEvent?.code !== 'UPSTREAM_UNAVAILABLE'
    && retryAssistant
    && failedRunErrorEvent?.code
      ? {
          errorCode: failedRunErrorEvent.code,
          projectId: projectId ?? '',
          projectKind: projectKindForTracking,
          conversationId: activeConversationId,
          assistantMessageId: retryAssistant.id,
          runId: retryAssistant.runId ?? null,
        }
      : null;
  const showByokRecoveryCta = showByokRecoveryAction && Boolean(onSwitchToLocalCli);
  // A `primaryAction: 'none'` failure (e.g. a hard quota where retrying is
  // futile) contributes no button of its own — it relies on the AMR switch card
  // below. Only claim the actions row when a real control will render, so a
  // no-action card doesn't leave an empty flex row (and a dangling column gap).
  const runFailureHasAction = Boolean(
    retryAssistant &&
      onRetry &&
      runFailureUi &&
      (runFailureUi.primaryAction !== 'none' ||
        runFailureUi.secondaryRetry ||
        canResumeFailedRun),
  );
  const showErrorActions = showByokRecoveryCta || runFailureHasAction;
  useEffect(() => {
    if (!displayError || !failedRunErrorEvent?.code || !retryAssistant) return;
    // The hosted-AMR nudge owns this same surface_view when it renders below
    // the error card. For all other failed-run guidance (AMR auth/balance,
    // Antigravity auth/quota, upstream outage, generic retry), the chat error
    // card itself is the visible run_failed_toast surface.
    if (amrSwitchPayload) return;

    const key = [
      projectId ?? '',
      activeConversationId ?? '',
      retryAssistant.id,
      retryAssistant.runId ?? '',
      failedRunErrorEvent.code,
    ].join(':');
    if (runFailedToastSurfaceKeysRef.current.has(key)) return;
    runFailedToastSurfaceKeysRef.current.add(key);

    trackRunFailedToastSurfaceView(analyticsTrack, {
      page_name: 'chat_panel',
      area: 'chat_panel',
      element: 'run_failed_toast',
      error_code: failedRunErrorEvent.code,
      project_id: projectId ?? '',
      project_kind: projectKindForTracking,
      conversation_id: activeConversationId,
      assistant_message_id: retryAssistant.id,
      run_id: retryAssistant.runId ?? null,
    });
  }, [
    activeConversationId,
    analyticsTrack,
    amrSwitchPayload,
    displayError,
    failedRunErrorEvent?.code,
    projectId,
    projectKindForTracking,
    retryAssistant,
  ]);

  return {
    lastAssistantId,
    hasActiveRunMessage,
    retryAssistant,
    runFailureUi,
    canResumeFailedRun,
    displayError,
    errorDiagnosticText,
    errorSourcePeek,
    runErrorTone,
    errorCardOwnerId,
    amrSwitchPayload,
    showByokRecoveryCta,
    showErrorActions,
    copiedErrorDiagnostic,
    errorSourceOpen,
    setErrorSourceOpen,
    copyErrorDiagnostic,
    inlineAmrLoginStatus,
    handleAmrLoginStatusChange,
    handleAmrRecharge,
    handleAmrUpgrade,
    handleAmrSignInStarted,
    handleAmrSwitchActivate,
  };
}
