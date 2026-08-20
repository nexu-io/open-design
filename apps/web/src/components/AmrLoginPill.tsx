import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  cancelVelaLogin,
  fetchVelaLoginStatus,
  startVelaLogin,
  velaLogout,
  type VelaLoginStatus,
} from '../providers/daemon';
import { openExternalUrl } from '../providers/registry';
import { useAnalytics } from '../analytics/provider';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
  type TrackingAmrEntrySource,
} from '../analytics/amr-attribution';
import { getResolvedDeviceId } from '../analytics/client';
import {
  beginAmrAuthTracking,
  confirmAmrAuthTracking,
  observeAmrAuthTracking,
  reconcileAmrAuthAttemptId,
  resolveAmrAuthTracking,
} from '../analytics/amr-auth';
import { useI18n } from '../i18n';
import {
  AMR_LOGIN_STATUS_EVENT,
  AMR_LOGIN_POLL_INTERVAL_MS,
  AMR_LOGIN_STARTUP_SETTLE_MS,
  amrLoginPollOutcome,
  amrLoginStatusEventReason,
  isAmrSessionAuthenticated,
  notifyAmrLoginStatusChanged,
} from './amrLoginPolling';
import {
  notifyTeamProjectsChanged,
  notifyWorkspaceBillingRefresh,
  notifyWorkspaceContextRefresh,
} from '../collab/useWorkspaceContext';
import { Icon, type IconName } from './Icon';
import { SignOutConfirmDialog } from './SignOutConfirmDialog';
import { amrConsoleUrlForProfile, amrProfileBadgeLabel } from '../runtime/amr-guidance';

interface AmrLoginPillProps {
  className?: string;
  hideSignedOutStatus?: boolean;
  hideSignedInStatus?: boolean;
  initialStatus?: VelaLoginStatus | null;
  skipInitialRefresh?: boolean;
  signInLabel?: string;
  signInIcon?: IconName;
  amrEntrySourceDetail?: TrackingAmrEntrySource;
  metricsConsent?: boolean;
  installationId?: string | null;
  showActivationDetails?: boolean;
  revealPendingCancelAction?: boolean;
  showConsoleAction?: boolean;
  iconOnlySignOut?: boolean;
  onSignInStarted?: () => void;
  onStatusChange?: (status: VelaLoginStatus | null) => void;
  onSignedOut?: () => void | Promise<void>;
}

const AMR_LOGIN_REUSE_ENTRY_SOURCES: readonly TrackingAmrEntrySource[] = [
  'settings_amr_agent_card',
  'chat_error_authorize_retry',
  'generation_preview_authorize_retry',
];

export type AmrAccountControlStatus =
  | 'signed-out'
  | 'signing-in'
  | 'canceled'
  | 'signed-in'
  | 'error';

export interface AmrAccountControlProps {
  status: AmrAccountControlStatus;
  className?: string;
  compact?: boolean;
  email?: string;
  errorMessage?: string | null;
  profile?: string;
  showProfileBadge?: boolean;
  showSignInAction?: boolean;
  hideSignedOutStatus?: boolean;
  hideSignedInStatus?: boolean;
  signInLabel?: string;
  signInIcon?: IconName;
  showConsoleAction?: boolean;
  consoleUrl?: string;
  iconOnlySignOut?: boolean;
  showCancelSignInAction?: boolean;
  // Activation URL surfaced while signing in, so the user can re-open the
  // sign-in page when the browser did not auto-open. The URL already carries
  // the device code (see parseVelaLoginActivation in the daemon's vela.ts), so
  // no separate code needs to be shown.
  activationUrl?: string;
  browserOpenFailed?: boolean;
  onSignIn?: (event: MouseEvent<HTMLButtonElement>) => void;
  onSignOut?: (event: MouseEvent<HTMLButtonElement>) => void;
  onCancelSignIn?: (event: MouseEvent<HTMLButtonElement>) => void;
  onConsoleClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  signInDisabled?: boolean;
  signOutDisabled?: boolean;
  cancelSignInDisabled?: boolean;
}

const AMR_CANCELED_RESET_MS = 1500;

export function closeAmrActivationWindowBestEffort(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.opener == null) return false;
  try {
    window.close();
    return true;
  } catch {
    return false;
  }
}

function classNames(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export function AmrAccountControl({
  status,
  className,
  compact = false,
  email = '',
  errorMessage,
  profile,
  showProfileBadge = false,
  showSignInAction = true,
  hideSignedOutStatus = false,
  hideSignedInStatus = false,
  signInLabel,
  signInIcon,
  showConsoleAction = false,
  consoleUrl,
  iconOnlySignOut = false,
  showCancelSignInAction = false,
  activationUrl,
  browserOpenFailed = false,
  onSignIn,
  onSignOut,
  onCancelSignIn,
  onConsoleClick,
  signInDisabled = false,
  signOutDisabled = false,
  cancelSignInDisabled = false,
}: AmrAccountControlProps) {
  const { t } = useI18n();
  const isSignedIn = status === 'signed-in';
  const isSigningIn = status === 'signing-in';
  const isCanceled = status === 'canceled';
  const hasError = status === 'error';
  const badgeLabel = showProfileBadge ? amrProfileBadgeLabel(profile) : null;
  const visibleBadgeLabel = isSignedIn ? badgeLabel : null;
  const resolvedConsoleUrl = consoleUrl ?? amrConsoleUrlForProfile(profile);
  const loginErrorText = errorMessage || t('settings.amrLoginErrorCompact');
  const statusText = isSignedIn
    ? hideSignedInStatus
      ? ''
      : email || t('settings.amrSignedIn')
    : isSigningIn
      ? t('settings.amrSigningIn')
      : isCanceled
        ? t('designs.status.canceled')
      : hideSignedOutStatus
        ? ''
        : t('settings.amrNotSignedIn');
  const canSignIn = showSignInAction && (status === 'signed-out' || hasError);
  const signOutLabel = signOutDisabled
    ? t('settings.amrLoggingOut')
    : t('settings.amrLogout');

  return (
    <div
      className={classNames(
        'amr-account-control',
        compact && 'amr-account-control--compact',
        `amr-account-control--${status}`,
        className,
      )}
      role="group"
      aria-label={t('settings.amrAccountStatus')}
    >
      {statusText ? (
        <span className="amr-account-control__status">
          <span className="amr-account-control__status-text">{statusText}</span>
          {visibleBadgeLabel ? (
            <span className="amr-login-pill-badge">{visibleBadgeLabel}</span>
          ) : null}
        </span>
      ) : null}
      {isSignedIn && showConsoleAction ? (
        <a
          className="amr-account-control__action"
          href={resolvedConsoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('settings.amrConsole')}
          onClick={onConsoleClick}
        >
          {t('settings.amrConsole')}
        </a>
      ) : null}
      {isSignedIn && onSignOut ? (
        <button
          type="button"
          className={classNames(
            'amr-account-control__action',
            iconOnlySignOut && 'amr-account-control__action--icon',
            iconOnlySignOut && 'od-tooltip',
          )}
          disabled={signOutDisabled}
          onClick={onSignOut}
          title={iconOnlySignOut ? signOutLabel : email || undefined}
          aria-label={signOutLabel}
          data-tooltip={iconOnlySignOut ? signOutLabel : undefined}
          data-tooltip-placement={iconOnlySignOut ? 'bottom' : undefined}
        >
          {iconOnlySignOut ? (
            <Icon name="log-out" size={15} strokeWidth={1.8} />
          ) : (
            signOutLabel
          )}
        </button>
      ) : null}
      {isSigningIn && showCancelSignInAction && onCancelSignIn ? (
        <button
          type="button"
          className="amr-account-control__action"
          disabled={cancelSignInDisabled}
          onClick={onCancelSignIn}
          aria-label={t('common.cancel')}
        >
          {t('common.cancel')}
        </button>
      ) : null}
      {canSignIn ? (
        <button
          type="button"
          className="amr-account-control__action"
          disabled={signInDisabled}
          onClick={onSignIn}
        >
          {signInIcon ? <Icon name={signInIcon} size={15} aria-hidden /> : null}
          {signInLabel ?? t('settings.amrSignIn')}
        </button>
      ) : null}
      {hasError ? (
        <span className="amr-account-control__error" role="alert">
          {loginErrorText}
        </span>
      ) : null}
      {isSigningIn && activationUrl ? (
        <div className="amr-login-activation" role="group">
          <span className="amr-login-activation__hint">
            {browserOpenFailed
              ? t('settings.amrActivationBrowserFailed')
              : t('settings.amrActivationHint')}
          </span>
          <div className="amr-login-activation__actions">
            <a
              className="amr-login-activation__open"
              href={activationUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('settings.amrActivationOpen')}
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// AMR-specific login pill that lives as a sibling inside the installed
// agent card. The pill polls `/api/integrations/vela/status` after a Sign-in
// click until the daemon reports loggedIn=true.
export function AmrLoginPill({
  className,
  hideSignedOutStatus = false,
  hideSignedInStatus = false,
  initialStatus = null,
  skipInitialRefresh = false,
  signInLabel,
  signInIcon,
  amrEntrySourceDetail,
  metricsConsent = false,
  installationId,
  showActivationDetails = false,
  revealPendingCancelAction = false,
  showConsoleAction = false,
  iconOnlySignOut = false,
  onSignInStarted,
  onStatusChange,
  onSignedOut,
}: AmrLoginPillProps) {
  const { t } = useI18n();
  const analytics = useAnalytics();
  const [status, setStatus] = useState<VelaLoginStatus | null>(initialStatus);
  const [pending, setPending] = useState<null | 'login' | 'logout' | 'cancel'>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canceledVisible, setCanceledVisible] = useState(false);
  const pollRef = useRef<number | null>(null);
  const loginStartedAtRef = useRef<number | null>(null);
  const loginPendingRef = useRef(false);
  const loginStartPendingRef = useRef(false);
  const loginCancelRequestedRef = useRef(false);
  const authAttemptIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const next = await fetchVelaLoginStatus();
    if (next?.authAttemptId) authAttemptIdRef.current = next.authAttemptId;
    const authAttemptId = authAttemptIdRef.current;
    if (next && authAttemptId) {
      observeAmrAuthTracking(analytics.track, next, authAttemptId);
    }
    if (next) {
      setStatus(next);
      onStatusChange?.(next);
    }
    return next;
  }, [analytics.track, onStatusChange]);

  useEffect(() => {
    if (!skipInitialRefresh) void refresh();
    return () => {
      loginPendingRef.current = false;
      loginStartedAtRef.current = null;
      stopPolling();
    };
  }, [refresh, skipInitialRefresh, stopPolling]);

  useEffect(() => {
    setStatus(initialStatus);
    if (initialStatus?.authAttemptId) {
      authAttemptIdRef.current = initialStatus.authAttemptId;
    }
    // A signed-in status pushed in from the host (e.g. the Settings card
    // refetching on window focus after an out-of-band login) is authoritative:
    // clear any stale login error/pending the early-stopped poll left behind so
    // `accountStatus`, which ranks `errorMessage` above `loggedIn`, doesn't keep
    // the pill stuck on Authorize.
    if (isAmrSessionAuthenticated(initialStatus)) {
      stopPolling();
      loginStartedAtRef.current = null;
      loginPendingRef.current = false;
      setErrorMessage(null);
      setPending(null);
      setCanceledVisible(false);
    }
  }, [initialStatus, stopPolling]);

  useEffect(() => {
    if (!canceledVisible) return;
    const timeout = window.setTimeout(() => {
      setCanceledVisible(false);
    }, AMR_CANCELED_RESET_MS);
    return () => window.clearTimeout(timeout);
  }, [canceledVisible]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  const startPolling = useCallback((
    startedAt = Date.now(),
    authAttemptId = authAttemptIdRef.current,
  ) => {
    stopPolling();
    loginStartedAtRef.current = startedAt;
    if (authAttemptId) authAttemptIdRef.current = authAttemptId;
    const tick = async () => {
      const next = await refresh();
      const outcome = amrLoginPollOutcome(next, startedAt);
      if (outcome === 'signed-in') {
        if (authAttemptId) {
          resolveAmrAuthTracking(analytics.track, 'success', undefined, {
            authAttemptId,
            signedInUserId: next?.user?.id ?? null,
          });
        }
        // Wake the app-level status sync so configure_type flips to 'amr'
        // on the very next capture, not on an unrelated later refresh.
        notifyAmrLoginStatusChanged();
        // This pill is a THIRD place AMR sign-in success is detected
        // (CloudSignInTip's finishSignedIn() and EntryShell's
        // pollAmrLoginCompletion() are the other two) and must fire the same
        // workspace-surface nudges they do. Before this, the pill relied on
        // App.tsx's global AMR_LOGIN_STATUS_EVENT listener eventually
        // resetting every open tab back to a fresh Home mount (see
        // deriveTabIdentityScope), whose remount happens to start
        // useWorkspaceContext from a null module cache — a side effect that
        // may not run for a while (or ever, if the user never returns to
        // Home), not a deliberate refresh. Firing these immediately means
        // every mounted workspace surface updates as soon as sign-in
        // actually resolves, regardless of what the tab does afterward.
        // `forceCoalescedGet` (behind these three notifiers) already
        // collapses a later remount's from-scratch fetch into this one when
        // it lands inside the coalescing window.
        notifyWorkspaceContextRefresh();
        notifyWorkspaceBillingRefresh();
        notifyTeamProjectsChanged();
        stopPolling();
        loginStartedAtRef.current = null;
        loginPendingRef.current = false;
        setPending(null);
        return;
      }
      if (outcome === 'stopped' || outcome === 'timed-out') {
        stopPolling();
        if (outcome === 'timed-out') {
          if (authAttemptId) {
            resolveAmrAuthTracking(analytics.track, 'timeout', 'login_timeout', {
              authAttemptId,
            });
            void cancelVelaLogin(authAttemptId).then((result) =>
              notifyAmrLoginStatusChanged(
                result.canceled === true ? 'login-canceled' : 'status-changed',
              ),
            );
          }
        } else {
          if (authAttemptId) {
            resolveAmrAuthTracking(analytics.track, 'failed', 'login_stopped', {
              authAttemptId,
            });
          }
          console.error('[amr-login] poll loop stopped without a terminal status', { outcome });
        }
        loginStartedAtRef.current = null;
        loginPendingRef.current = false;
        setPending(null);
        setErrorMessage(t('settings.amrLoginErrorCompact'));
      }
    };
    pollRef.current = window.setInterval(() => {
      void tick();
    }, AMR_LOGIN_POLL_INTERVAL_MS);
    void tick();
  }, [analytics.track, refresh, stopPolling, t]);

  useEffect(() => {
    const onStatusChange = (event: Event) => {
      const reason = amrLoginStatusEventReason(event);
      if (reason === 'login-started') {
        const startedAt = Date.now();
        loginStartedAtRef.current = startedAt;
        setErrorMessage(null);
        setPending('login');
        startPolling(startedAt);
      } else if (reason === 'login-canceled') {
        loginStartedAtRef.current = null;
        loginPendingRef.current = false;
        stopPolling();
        setPending(null);
        // Skip the daemon refresh below. `cancelVelaLogin()` only sends
        // SIGTERM (escalating to SIGKILL after 2s) and keeps the child
        // in `activeLoginProcs` until it actually exits, so an
        // immediate `/api/integrations/vela/status` read can legally
        // still return `loginInFlight: true`. Falling through to the
        // refresh + restart-polling branch below would bounce the pill
        // back into 'Signing in…' and could surface the timeout/error
        // path even though the user already canceled. Trust the cancel
        // locally on every subscribed pill instance instead — the next
        // explicit refresh (mount, user interaction, or a
        // `status-changed` event) will pick up the daemon's confirmed
        // state once the child has actually exited.
        setStatus((current) => (
          current ? { ...current, loginInFlight: false } : current
        ));
        return;
      }
      void refresh().then((next) => {
        if (!next) return;
        if (next.authAttemptId) authAttemptIdRef.current = next.authAttemptId;
        if (isAmrSessionAuthenticated(next)) {
          stopPolling();
          loginStartedAtRef.current = null;
          loginPendingRef.current = false;
          setPending(null);
          setCanceledVisible(false);
          setErrorMessage(null);
          return;
        }
        if (next.loginInFlight) {
          setErrorMessage(null);
          setPending('login');
          startPolling(
            loginStartedAtRef.current ?? Date.now(),
            next.authAttemptId ?? null,
          );
          return;
        }
        const pendingStartup =
          loginStartedAtRef.current !== null &&
          Date.now() - loginStartedAtRef.current < AMR_LOGIN_STARTUP_SETTLE_MS;
        if (!pendingStartup) {
          loginStartedAtRef.current = null;
          loginPendingRef.current = false;
          setPending(null);
        }
      });
    };
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, onStatusChange);
    return () => {
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, onStatusChange);
    };
  }, [refresh, startPolling, stopPolling]);

  const handleLogin = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (loginPendingRef.current) return;
      loginPendingRef.current = true;
      loginCancelRequestedRef.current = false;
      const startedAt = Date.now();
      loginStartedAtRef.current = startedAt;
      setErrorMessage(null);
      setPending('login');
      onSignInStarted?.();
      const attribution = amrEntrySourceDetail
        ? recordAmrEntry(analytics.track, amrEntrySourceDetail, new Date(), {
            metricsConsent,
            reuseExistingFrom: AMR_LOGIN_REUSE_ENTRY_SOURCES,
          })
        : null;
      const provisionalAuthAttemptId = beginAmrAuthTracking(
        attribution,
        startedAt,
      );
      authAttemptIdRef.current = provisionalAuthAttemptId;
      const odDeviceId = amrHandoffDeviceId({
        metricsConsent,
        resolvedDeviceId: getResolvedDeviceId(),
        installationId,
      });
      loginStartPendingRef.current = true;
      const result = await startVelaLogin(
        attribution,
        odDeviceId,
        provisionalAuthAttemptId,
      ).finally(() => {
        loginStartPendingRef.current = false;
      });
      const authAttemptId = reconcileAmrAuthAttemptId(
        provisionalAuthAttemptId,
        result.authAttemptId,
        { joinedExisting: result.alreadyRunning === true },
      );
      authAttemptIdRef.current = authAttemptId;
      if (result.ok || result.alreadyRunning) {
        confirmAmrAuthTracking(analytics.track, authAttemptId, {
          joinedExisting: result.alreadyRunning === true,
        });
      }
      observeAmrAuthTracking(analytics.track, result, authAttemptId);
      if (loginCancelRequestedRef.current) {
        if (result.ok || result.alreadyRunning) {
          const cancelResult = await cancelVelaLogin(authAttemptId);
          if (!cancelResult.ok) {
            loginCancelRequestedRef.current = false;
            loginStartedAtRef.current = null;
            loginPendingRef.current = false;
            setPending(null);
            setErrorMessage(t('settings.amrLoginErrorCompact'));
            return;
          }
          if (cancelResult.canceled !== true) {
            const next = await refresh();
            loginCancelRequestedRef.current = false;
            if (next?.loginInFlight) {
              loginPendingRef.current = true;
              setPending('login');
              startPolling(startedAt, next.authAttemptId ?? authAttemptId);
            } else {
              loginStartedAtRef.current = null;
              loginPendingRef.current = false;
              setPending(null);
            }
            return;
          }
          resolveAmrAuthTracking(analytics.track, 'cancelled', undefined, {
            authAttemptId,
          });
          closeAmrActivationWindowBestEffort();
          loginCancelRequestedRef.current = false;
          loginStartedAtRef.current = null;
          loginPendingRef.current = false;
          setStatus((current) => (
            current
              ? { ...current, loggedIn: false, loginInFlight: false, user: null }
              : current
          ));
          setPending(null);
          setCanceledVisible(true);
          notifyAmrLoginStatusChanged('login-canceled');
          return;
        }
        resolveAmrAuthTracking(analytics.track, 'cancelled', undefined, {
          authAttemptId,
        });
        loginCancelRequestedRef.current = false;
        loginStartedAtRef.current = null;
        loginPendingRef.current = false;
        setPending(null);
        return;
      }
      if (!result.ok && !result.alreadyRunning) {
        resolveAmrAuthTracking(analytics.track, 'failed', 'spawn_failed', {
          authAttemptId,
        });
        console.error('[amr-login] startVelaLogin failed', result);
        loginStartedAtRef.current = null;
        loginPendingRef.current = false;
        setPending(null);
        setErrorMessage(result.error || t('settings.amrLoginErrorCompact'));
        return;
      }
      // Dispatch only — do not ALSO call `startPolling(startedAt)` directly
      // here. This pill is itself subscribed to AMR_LOGIN_STATUS_EVENT (see
      // the effect above), so the dispatch below already reaches this same
      // instance's 'login-started' branch synchronously and starts polling.
      // Calling `startPolling` a second time here used to race two
      // concurrent `tick()` loops against the same login: `startPolling`'s
      // own `stopPolling()` cancels the OTHER call's `setInterval`, but not
      // its already-in-flight immediate `tick()`, so both loops independently
      // observed the poll landing on signed-in and each fired every
      // sign-in-success notifier (notifyAmrLoginStatusChanged +
      // the three workspace refreshes below) once — a real duplicate network
      // request per notifier, not just a redundant event. Every other
      // mounted pill instance already relies solely on this same broadcast
      // to start its own polling; the initiating instance must too.
      notifyAmrLoginStatusChanged('login-started');
    },
    [
      amrEntrySourceDetail,
      analytics.track,
      installationId,
      metricsConsent,
      onSignInStarted,
      t,
    ],
  );

  const handleCancelLogin = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const loginStartPending = loginStartPendingRef.current;
      const authAttemptId = authAttemptIdRef.current;
      stopPolling();
      setErrorMessage(null);
      setPending('cancel');
      const result = authAttemptId
        ? await cancelVelaLogin(authAttemptId)
        : { ok: false, canceled: false };
      if (!result.ok) {
        console.error('[amr-login] cancelVelaLogin failed', result);
        loginStartedAtRef.current = null;
        loginPendingRef.current = false;
        setPending(null);
        setErrorMessage(t('settings.amrLoginErrorCompact'));
        return;
      }
      if (result.canceled !== true) {
        setPending(null);
        const next = await refresh();
        if (loginStartPending && next?.loginInFlight !== true) {
          loginCancelRequestedRef.current = true;
          setPending('cancel');
          return;
        }
        if (next?.loginInFlight) {
          const startedAt = loginStartedAtRef.current ?? Date.now();
          loginPendingRef.current = true;
          setPending('login');
          startPolling(startedAt, next.authAttemptId ?? null);
        } else {
          loginStartedAtRef.current = null;
          loginPendingRef.current = false;
        }
        return;
      }
      if (authAttemptId) {
        resolveAmrAuthTracking(analytics.track, 'cancelled', undefined, {
          authAttemptId,
        });
      }
      closeAmrActivationWindowBestEffort();
      loginStartedAtRef.current = null;
      loginPendingRef.current = false;
      setStatus((current) => (
        current
          ? { ...current, loggedIn: false, loginInFlight: false, user: null }
          : {
              loggedIn: false,
              loginInFlight: false,
              profile: 'default',
              user: null,
              configPath: '',
            }
      ));
      setPending(null);
      setCanceledVisible(true);
      notifyAmrLoginStatusChanged('login-canceled');
    },
    [analytics.track, refresh, startPolling, stopPolling, t],
  );

  // recvqgMWpJZqhL: the pill's sign-out button only ARMS the confirmation
  // dialog; `performLogout` (the real daemon logout) runs on explicit confirm.
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const handleLogout = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setConfirmingLogout(true);
  }, []);

  const performLogout = useCallback(async () => {
    setErrorMessage(null);
    setPending('logout');
    const result = await velaLogout();
    loginStartedAtRef.current = null;
    loginPendingRef.current = false;
    setPending(null);
    setConfirmingLogout(false);
    if (!result.ok) {
      console.error('[amr-login] velaLogout failed', result);
      setErrorMessage(t('settings.amrLoginErrorCompact'));
      return;
    }
    await refresh();
    notifyAmrLoginStatusChanged('status-changed');
    await onSignedOut?.();
  }, [onSignedOut, refresh, t]);

  // Keep the management link on the same status snapshot that supplies the
  // visible profile badge and account data. The module-level runtime origin is
  // only a compatibility fallback; it can be reset by a dev hot reload while
  // React retains the feature-test status shown on this card.
  const statusConsoleUrl = amrConsoleUrlForProfile(
    status?.profile,
    status?.consoleOrigin,
  );

  const handleConsoleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.stopPropagation();
      event.preventDefault();
      const attribution = recordAmrEntry(analytics.track, 'settings_amr_console', new Date(), {
        metricsConsent,
      });
      const deviceId = amrHandoffDeviceId({
        metricsConsent,
        resolvedDeviceId: getResolvedDeviceId(),
        installationId,
      });
      const url = attributedAmrUrl(
        statusConsoleUrl,
        attribution,
        deviceId,
      );
      event.currentTarget.href = url;
      // This link deliberately stops propagation to avoid re-selecting its
      // agent card, so App's document-level first-party bridge cannot see it.
      // Open the final, attributed URL directly to mint the browser bridge.
      void openExternalUrl(url);
    },
    [analytics.track, installationId, metricsConsent, statusConsoleUrl],
  );

  const loggedIn = isAmrSessionAuthenticated(status);
  const userEmail = status?.user?.email ?? '';
  const loginInFlight =
    pending === 'login' || (!loggedIn && status?.loginInFlight === true);
  const logoutInFlight = pending === 'logout';
  const cancelInFlight = pending === 'cancel';
  const activeLoginActivationStatus =
    showActivationDetails && !loggedIn && status?.loginInFlight === true
      ? status
      : null;
  const accountStatus: AmrAccountControlStatus = errorMessage
    ? 'error'
    : loggedIn
      ? 'signed-in'
      : canceledVisible
        ? 'canceled'
      : loginInFlight
        ? 'signing-in'
        : 'signed-out';

  return (
    <div
      className={'amr-login-pill' + (className ? ' ' + className : '')}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <AmrAccountControl
        status={accountStatus}
        compact
        email={userEmail}
        errorMessage={errorMessage}
        profile={status?.profile}
        showProfileBadge
        hideSignedOutStatus={hideSignedOutStatus}
        hideSignedInStatus={hideSignedInStatus}
        signInLabel={signInLabel}
        signInIcon={signInIcon}
        showConsoleAction={showConsoleAction}
        consoleUrl={statusConsoleUrl}
        iconOnlySignOut={iconOnlySignOut}
        signInDisabled={loginInFlight}
        signOutDisabled={logoutInFlight}
        showCancelSignInAction={revealPendingCancelAction && loginInFlight}
        cancelSignInDisabled={cancelInFlight}
        activationUrl={activeLoginActivationStatus?.activationUrl}
        browserOpenFailed={activeLoginActivationStatus?.browserOpenFailed}
        onSignIn={handleLogin}
        onSignOut={handleLogout}
        onCancelSignIn={handleCancelLogin}
        onConsoleClick={showConsoleAction ? handleConsoleClick : undefined}
        className={loggedIn ? 'amr-login-pill-status' : undefined}
      />
      {confirmingLogout ? (
        <SignOutConfirmDialog
          busy={logoutInFlight}
          onCancel={() => setConfirmingLogout(false)}
          onConfirm={() => void performLogout()}
        />
      ) : null}
    </div>
  );
}
