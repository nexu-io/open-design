import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  cancelVelaLogin,
  fetchVelaLoginStatus,
  startVelaLogin,
  velaLogout,
  type VelaLoginStatus,
} from '../providers/daemon';
import { useAnalytics } from '../analytics/provider';
import {
  recordAmrEntry,
  type TrackingAmrEntrySource,
} from '../analytics/amr-attribution';
import { useI18n } from '../i18n';
import {
  AMR_LOGIN_STATUS_EVENT,
  AMR_LOGIN_POLL_INTERVAL_MS,
  AMR_LOGIN_STARTUP_SETTLE_MS,
  amrLoginPollOutcome,
  amrLoginStatusEventReason,
  notifyAmrLoginStatusChanged,
} from './amrLoginPolling';
import { AMR_CONSOLE_URL } from '../runtime/amr-guidance';

interface AmrLoginPillProps {
  className?: string;
  hideSignedOutStatus?: boolean;
  hideSignedInStatus?: boolean;
  initialStatus?: VelaLoginStatus | null;
  skipInitialRefresh?: boolean;
  signInLabel?: string;
  amrEntrySourceDetail?: TrackingAmrEntrySource;
  revealPendingCancelAction?: boolean;
  showConsoleAction?: boolean;
  onStatusChange?: (status: VelaLoginStatus | null) => void;
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
  showConsoleAction?: boolean;
  consoleUrl?: string;
  showCancelSignInAction?: boolean;
  onSignIn?: (event: MouseEvent<HTMLButtonElement>) => void;
  onSignOut?: (event: MouseEvent<HTMLButtonElement>) => void;
  onCancelSignIn?: (event: MouseEvent<HTMLButtonElement>) => void;
  signInDisabled?: boolean;
  signOutDisabled?: boolean;
  cancelSignInDisabled?: boolean;
}

const AMR_CANCELED_RESET_MS = 1500;

function closeAmrActivationWindowBestEffort(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.opener == null) return false;
  try {
    window.close();
    return true;
  } catch {
    return false;
  }
}

function profileBadgeLabel(profile: string | undefined): string | null {
  if (profile === 'test') return 'TEST';
  if (profile === 'local') return 'LOCAL';
  return null;
}

function classNames(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export function AmrAccountControl({
  status,
  className,
  compact = false,
  email = '',
  profile,
  showProfileBadge = false,
  showSignInAction = true,
  hideSignedOutStatus = false,
  hideSignedInStatus = false,
  signInLabel,
  showConsoleAction = false,
  consoleUrl = AMR_CONSOLE_URL,
  showCancelSignInAction = false,
  onSignIn,
  onSignOut,
  onCancelSignIn,
  signInDisabled = false,
  signOutDisabled = false,
  cancelSignInDisabled = false,
}: AmrAccountControlProps) {
  const { t } = useI18n();
  const badgeLabel = showProfileBadge ? profileBadgeLabel(profile) : null;
  const isSignedIn = status === 'signed-in';
  const isSigningIn = status === 'signing-in';
  const isCanceled = status === 'canceled';
  const hasError = status === 'error';
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
        <span className="amr-account-control__status">{statusText}</span>
      ) : null}
      {isSignedIn && showConsoleAction ? (
        <a
          className="amr-account-control__action"
          href={consoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('settings.amrConsole')}
        >
          {t('settings.amrConsole')}
        </a>
      ) : null}
      {isSignedIn && onSignOut ? (
        <button
          type="button"
          className="amr-account-control__action"
          disabled={signOutDisabled}
          onClick={onSignOut}
          title={email || undefined}
          aria-label={t('settings.amrLogout')}
        >
          {signOutDisabled ? t('settings.amrLoggingOut') : t('settings.amrLogout')}
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
          {signInLabel ?? t('settings.amrSignIn')}
        </button>
      ) : null}
      {badgeLabel ? (
        <span className="amr-login-pill-badge">{badgeLabel}</span>
      ) : null}
      {hasError ? (
        <span className="amr-account-control__error" role="alert">
          {t('settings.amrLoginErrorCompact')}
        </span>
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
  amrEntrySourceDetail,
  revealPendingCancelAction = false,
  showConsoleAction = false,
  onStatusChange,
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

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const next = await fetchVelaLoginStatus();
    if (next) setStatus(next);
    return next;
  }, []);

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
    // A signed-in status pushed in from the host (e.g. the Settings card
    // refetching on window focus after an out-of-band login) is authoritative:
    // clear any stale login error/pending the early-stopped poll left behind so
    // `accountStatus`, which ranks `errorMessage` above `loggedIn`, doesn't keep
    // the pill stuck on Authorize.
    if (initialStatus?.loggedIn) {
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

  const startPolling = useCallback((startedAt = Date.now()) => {
    stopPolling();
    loginStartedAtRef.current = startedAt;
    const tick = async () => {
      const next = await refresh();
      const outcome = amrLoginPollOutcome(next, startedAt);
      if (outcome === 'signed-in') {
        stopPolling();
        loginStartedAtRef.current = null;
        loginPendingRef.current = false;
        setPending(null);
        return;
      }
      if (outcome === 'stopped' || outcome === 'timed-out') {
        stopPolling();
        if (outcome === 'timed-out') {
          void cancelVelaLogin().then(() =>
            notifyAmrLoginStatusChanged('login-canceled'),
          );
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
  }, [refresh, stopPolling, t]);

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
        if (next.loggedIn) {
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
          startPolling();
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
      const startedAt = Date.now();
      loginStartedAtRef.current = startedAt;
      setErrorMessage(null);
      setPending('login');
      const attribution = amrEntrySourceDetail
        ? recordAmrEntry(analytics.track, amrEntrySourceDetail, new Date(), {
            reuseExistingFrom: AMR_LOGIN_REUSE_ENTRY_SOURCES,
          })
        : null;
      const result = await startVelaLogin(attribution);
      if (!result.ok && !result.alreadyRunning) {
        loginStartedAtRef.current = null;
        loginPendingRef.current = false;
        setPending(null);
        setErrorMessage(result.error || t('settings.amrLoginErrorCompact'));
        return;
      }
      notifyAmrLoginStatusChanged('login-started');
      startPolling(startedAt);
    },
    [amrEntrySourceDetail, analytics.track, startPolling, t],
  );

  const handleCancelLogin = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      stopPolling();
      setErrorMessage(null);
      setPending('cancel');
      const result = await cancelVelaLogin();
      closeAmrActivationWindowBestEffort();
      loginStartedAtRef.current = null;
      loginPendingRef.current = false;
      if (!result.ok) {
        setPending(null);
        setErrorMessage(t('settings.amrLoginErrorCompact'));
        return;
      }
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
    [stopPolling, t],
  );

  const handleLogout = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      setErrorMessage(null);
      setPending('logout');
      const result = await velaLogout();
      loginStartedAtRef.current = null;
      loginPendingRef.current = false;
      setPending(null);
      if (!result.ok) {
        setErrorMessage(t('settings.amrLoginErrorCompact'));
        return;
      }
      await refresh();
      notifyAmrLoginStatusChanged('status-changed');
    },
    [refresh, t],
  );

  const loggedIn = status?.loggedIn === true;
  const userEmail = status?.user?.email ?? '';
  const loginInFlight =
    pending === 'login' || (status?.loggedIn !== true && status?.loginInFlight === true);
  const logoutInFlight = pending === 'logout';
  const cancelInFlight = pending === 'cancel';
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
        profile={status?.profile}
        showProfileBadge
        hideSignedOutStatus={hideSignedOutStatus}
        hideSignedInStatus={hideSignedInStatus}
        signInLabel={signInLabel}
        showConsoleAction={showConsoleAction}
        signInDisabled={loginInFlight}
        signOutDisabled={logoutInFlight}
        showCancelSignInAction={revealPendingCancelAction && loginInFlight}
        cancelSignInDisabled={cancelInFlight}
        onSignIn={handleLogin}
        onSignOut={handleLogout}
        onCancelSignIn={handleCancelLogin}
        className={loggedIn ? 'amr-login-pill-status' : undefined}
      />
    </div>
  );
}
