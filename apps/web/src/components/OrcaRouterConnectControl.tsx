// OrcaRouter connect control — the two authentication entries side by side.
//
// OrcaRouter offers two ways in and this panel shows both, deliberately as two
// distinct controls rather than one button that sometimes prompts for a key and
// sometimes opens a browser:
//
//   * API Key            — paste an existing `sk-orca-…` key.
//   * Connect with OrcaRouter — OAuth 2.0 + PKCE through the daemon's loopback
//                               listener (Flow A), with the shown-code paste-back
//                               (Flow B) as the fallback the consent screen can
//                               put a human on.
//
// Both end at the same stored credential, so the model picker and every
// inference path downstream behave identically whichever one was used.
//
// Lifecycle. Server-side the daemon holds a one-shot listener and a pending
// PKCE state; client-side this component owns a monotonically increasing
// `attemptRef`. Every async continuation re-checks that it still belongs to the
// current attempt before touching state, so a late response from an abandoned
// login cannot overwrite a newer one.
//
// `pagehide` needs its own handling: the page can be restored from the
// back-forward cache with React state intact, and the generation guard would
// correctly refuse to run the stale request's `finally` — leaving the panel
// permanently busy. So the handler clears busy/hint synchronously and fires the
// server-side cancel with `keepalive` instead of relying on that cleanup.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useI18n } from '../i18n';
import styles from './OrcaRouterConnectControl.module.css';

interface OrcaRouterAuthStatus {
  connected: boolean;
  source?: string;
  authState?: 'active' | 'needsReauth';
  needsReauth?: boolean;
  accountId?: string | null;
  scope?: string | null;
  savedAt?: number | null;
  reauthReason?: string | null;
  listening?: boolean;
  authBase?: string;
  apiBase?: string;
}

interface StartResponse {
  authorizeUrl: string;
  state: string;
  callback: { host: string; port: number };
}

type Busy = 'idle' | 'starting' | 'awaiting' | 'submitting' | 'disconnecting';

async function fetchStatus(): Promise<OrcaRouterAuthStatus | null> {
  try {
    const r = await fetch('/api/orcarouter/auth/status', { credentials: 'same-origin' });
    if (!r.ok) return null;
    return (await r.json()) as OrcaRouterAuthStatus;
  } catch {
    return null;
  }
}

async function postJson(
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; message: string }> {
  try {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body ?? {}),
    });
    const payload = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      const message =
        typeof payload.error === 'string' && payload.error
          ? payload.error
          : `daemon returned HTTP ${r.status}`;
      return { ok: false, message };
    }
    return { ok: true, body: payload };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Cancel the in-flight attempt server-side. Best-effort and never awaited. */
function cancelInFlight(keepalive = false): void {
  try {
    void fetch('/api/orcarouter/oauth/cancel', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive,
    });
  } catch {
    // The listener self-closes on its 10-minute timeout; Cancel is an
    // affordance, not a correctness requirement.
  }
}

interface OrcaRouterConnectControlProps {
  /** Called after any credential change so the caller can refetch its catalog. */
  onCredentialChange?: () => void;
  /**
   * The key currently held by the provider form above this control.
   *
   * That field is the first authentication entry. Mirroring it into the shared
   * OrcaRouter credential store keeps daemon-side consumers (media generation,
   * the catalogue route) and the BYOK chat path reading the same credential
   * instead of one of them silently seeing nothing.
   */
  pastedApiKey?: string;
}

export function OrcaRouterConnectControl({
  onCredentialChange,
  pastedApiKey,
}: OrcaRouterConnectControlProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<OrcaRouterAuthStatus | null>(null);
  const [busy, setBusy] = useState<Busy>('idle');
  const [error, setError] = useState<string | null>(null);
  // Kept as a fallback link for browsers that refuse window.open.
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  const [pendingState, setPendingState] = useState<string | null>(null);
  const [pasteCode, setPasteCode] = useState('');
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptRef = useRef(0);
  // Mirrors `busy` for the pagehide handler, which cannot read fresh state.
  const busyRef = useRef<Busy>('idle');

  const setBusyState = useCallback((next: Busy) => {
    busyRef.current = next;
    setBusy(next);
  }, []);

  const stopPoll = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const clearPending = useCallback(() => {
    setPendingAuthUrl(null);
    setPendingState(null);
    setPasteCode('');
  }, []);

  const refresh = useCallback(async () => {
    const data = await fetchStatus();
    if (data) setStatus(data);
    return data;
  }, []);

  const startPoll = useCallback(
    (attempt: number) => {
      stopPoll();
      let elapsed = 0;
      pollTimer.current = setInterval(() => {
        elapsed += 2000;
        void (async () => {
          const data = await fetchStatus();
          // A response that belongs to a superseded attempt must not touch
          // state — this is the whole point of the generation counter.
          if (attempt !== attemptRef.current) return;
          if (data) setStatus(data);
          if (data?.connected) {
            setBusyState('idle');
            setError(null);
            clearPending();
            stopPoll();
            onCredentialChange?.();
          }
        })();
        if (elapsed >= 10 * 60 * 1000) stopPoll();
      }, 2000);
    },
    [clearPending, onCredentialChange, setBusyState, stopPoll],
  );

  // Invalidate on unmount so no in-flight continuation writes into a dead tree.
  useEffect(() => {
    void refresh();
    return () => {
      attemptRef.current += 1;
      stopPoll();
    };
  }, [refresh, stopPoll]);

  // Back-forward-cache safety. Clear the busy flag and the authorization hint
  // synchronously — the guarded `finally` of the invalidated request will
  // correctly refuse to run, so nothing else will. Then ask the daemon to drop
  // the listener. Registered in the capture phase so it runs before the page is
  // frozen.
  useEffect(() => {
    const onPageHide = () => {
      attemptRef.current += 1;
      stopPoll();
      busyRef.current = 'idle';
      setBusy('idle');
      setError(null);
      setPendingAuthUrl(null);
      setPendingState(null);
      setPasteCode('');
      cancelInFlight(true);
    };
    window.addEventListener('pagehide', onPageHide, true);
    return () => window.removeEventListener('pagehide', onPageHide, true);
  }, [stopPoll]);

  const onConnect = useCallback(async () => {
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    setError(null);
    clearPending();
    setBusyState('starting');
    const result = await postJson('/api/orcarouter/oauth/start');
    if (attempt !== attemptRef.current) return;
    if (!result.ok) {
      setBusyState('idle');
      setError(result.message);
      return;
    }
    const started = result.body as unknown as StartResponse;
    setBusyState('awaiting');
    setPendingAuthUrl(started.authorizeUrl);
    setPendingState(started.state);
    startPoll(attempt);
    try {
      window.open(started.authorizeUrl, '_blank', 'noopener,noreferrer');
    } catch {
      // The fallback anchor below is always rendered while pending.
    }
  }, [clearPending, setBusyState, startPoll]);

  const onPasteSubmit = useCallback(async () => {
    const trimmed = pasteCode.trim();
    if (!pendingState || !trimmed) return;
    const attempt = attemptRef.current;
    setBusyState('submitting');
    setError(null);
    const result = await postJson('/api/orcarouter/oauth/complete', {
      state: pendingState,
      code: trimmed,
    });
    if (attempt !== attemptRef.current) return;
    if (!result.ok) {
      setBusyState('awaiting');
      setError(result.message);
      return;
    }
    setBusyState('idle');
    clearPending();
    stopPoll();
    await refresh();
    onCredentialChange?.();
  }, [clearPending, onCredentialChange, pasteCode, pendingState, refresh, setBusyState, stopPoll]);

  const onCancel = useCallback(() => {
    attemptRef.current += 1;
    cancelInFlight();
    clearPending();
    setBusyState('idle');
    setError(null);
    stopPoll();
  }, [clearPending, setBusyState, stopPoll]);

  const onDisconnect = useCallback(async () => {
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    setBusyState('disconnecting');
    const result = await postJson('/api/orcarouter/oauth/disconnect');
    if (attempt !== attemptRef.current) return;
    setBusyState('idle');
    if (result.ok) {
      setError(null);
      clearPending();
      setStatus({ connected: false });
      onCredentialChange?.();
    } else {
      setError(result.message);
    }
  }, [clearPending, onCredentialChange, setBusyState]);

  // Adopt the provider form's key into the shared credential store. Debounced
  // by the form's own commit (it calls this on blur), so typing does not write
  // on every keystroke.
  useEffect(() => {
    const key = (pastedApiKey ?? '').trim();
    if (!key) return;
    const attempt = attemptRef.current;
    void (async () => {
      const result = await postJson('/api/orcarouter/credentials', { apiKey: key });
      if (attempt !== attemptRef.current || !result.ok) return;
      await refresh();
    })();
  }, [pastedApiKey, refresh]);

  const connected = Boolean(status?.connected);
  const needsReauth = Boolean(status?.needsReauth);
  const isAwaiting =
    busy === 'awaiting' || busy === 'submitting'
    || (Boolean(pendingState) && !connected)
    || (Boolean(pendingAuthUrl) && !connected);

  return (
    <div
      className={`mcp-oauth-control${connected ? ' connected' : ''}`}
      data-testid="orcarouter-connect-control"
    >
      <div className="mcp-oauth-status" aria-live="polite">
        {needsReauth ? (
          <>
            <span className={styles.dotError} aria-hidden />
            <span>
              <strong>{t('settings.orcaRouterNeedsReauthTitle')}</strong>{' '}
              <span className="hint">
                {status?.reauthReason ?? t('settings.orcaRouterNeedsReauth')}
              </span>
            </span>
          </>
        ) : connected ? (
          <>
            <span className="mcp-oauth-dot mcp-oauth-dot-ok" aria-hidden />
            <span>
              <strong>{t('settings.orcaRouterConnected')}</strong>{' '}
              {status?.scope ? (
                <span className="hint">
                  {t('settings.orcaRouterScopeGranted')} <code>{status.scope}</code>
                </span>
              ) : null}
            </span>
          </>
        ) : isAwaiting ? (
          <>
            <span className="mcp-oauth-dot mcp-oauth-dot-pending" aria-hidden />
            <span>
              <strong>{t('settings.orcaRouterWaiting')}</strong>{' '}
              <span className="hint">{t('settings.orcaRouterWaitingHint')}</span>
            </span>
          </>
        ) : (
          <>
            <span className="mcp-oauth-dot" aria-hidden />
            <span>
              <strong>{t('settings.orcaRouterNotConnected')}</strong>{' '}
              <span className="hint">{t('settings.orcaRouterConnectIntro')}</span>
            </span>
          </>
        )}
      </div>

      {/* Entry 2 — account login. OAuth 2.0 + PKCE, no client secret. */}
      <div className={styles.oauthEntry} data-testid="orcarouter-oauth-entry">
        <div className="mcp-oauth-actions">
          {connected ? (
            <>
              <button
                type="button"
                className="primary"
                data-testid="orcarouter-connect"
                disabled={busy !== 'idle'}
                title={t('settings.orcaRouterReconnectHint')}
                onClick={() => void onConnect()}
              >
                {busy === 'starting' || busy === 'awaiting'
                  ? t('settings.orcaRouterConnecting')
                  : t('settings.orcaRouterReconnect')}
              </button>
              <button
                type="button"
                data-testid="orcarouter-disconnect"
                disabled={busy !== 'idle'}
                onClick={() => void onDisconnect()}
              >
                {busy === 'disconnecting'
                  ? t('settings.orcaRouterDisconnecting')
                  : t('settings.orcaRouterDisconnect')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="primary"
                data-testid="orcarouter-connect"
                disabled={busy !== 'idle'}
                onClick={() => void onConnect()}
              >
                {busy === 'starting'
                  ? t('settings.orcaRouterOpeningBrowser')
                  : t('settings.orcaRouterConnect')}
              </button>
              {isAwaiting ? (
                <button
                  type="button"
                  data-testid="orcarouter-cancel"
                  onClick={onCancel}
                >
                  {t('settings.orcaRouterCancel')}
                </button>
              ) : null}
            </>
          )}
        </div>

        {pendingAuthUrl && !connected ? (
          <div className="mcp-oauth-fallback hint">
            {t('settings.orcaRouterOpenManually')}{' '}
            <a
              href={pendingAuthUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="orcarouter-authorize-link"
            >
              {t('settings.orcaRouterOpenManuallyLink')}
            </a>
          </div>
        ) : null}

        {isAwaiting && pendingState ? (
          <div className={styles.pasteBlock}>
            <p className="hint">{t('settings.orcaRouterPasteHint')}</p>
            <div className={styles.pasteRow}>
              <input
                type="text"
                data-testid="orcarouter-paste-code"
                value={pasteCode}
                placeholder={t('settings.orcaRouterPastePlaceholder')}
                aria-label={t('settings.orcaRouterPastePlaceholder')}
                onChange={(e) => setPasteCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pasteCode.trim()) void onPasteSubmit();
                }}
                disabled={busy === 'submitting'}
              />
              <button
                type="button"
                data-testid="orcarouter-paste-submit"
                onClick={() => void onPasteSubmit()}
                disabled={!pasteCode.trim() || busy === 'submitting'}
              >
                {busy === 'submitting'
                  ? t('settings.orcaRouterSubmitting')
                  : t('settings.orcaRouterSubmitCode')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mcp-oauth-error" role="alert" data-testid="orcarouter-error">
          {error}
        </div>
      ) : null}
    </div>
  );
}
