// Feature-local hook for one HTTP/SSE server's daemon-owned OAuth flow. The
// daemon owns the OAuth dance end-to-end; this hook only kicks it off, tracks
// status, and disconnects. Every browser side-effect (popup-callback message,
// status poll, opening the authorize tab) is reached through the injected
// `McpOAuthPort`, so the hook stays DOM-free and unit-tests against a fake.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { McpOAuthStatusResponse } from '@open-design/contracts';
import type { McpOAuthPort } from '../ports';
import { mcpOAuthPort } from '../dependencies';
import type { McpOAuthBusy } from '../types';

/** Everything the OAuth control view needs from the hook. */
export interface McpOAuthController {
  status: McpOAuthStatusResponse | null;
  busy: McpOAuthBusy;
  error: string | null;
  /** Authorize URL surfaced as a fallback link while we wait on the user. */
  pendingAuthUrl: string | null;
  connected: boolean;
  isAwaiting: boolean;
  /** Human-readable token expiry, or `null` for a non-expiring / absent token. */
  expiresLabel: string | null;
  onConnect: () => Promise<void>;
  onRefreshStatus: () => Promise<void>;
  onCancelPending: () => void;
  onDisconnect: () => Promise<void>;
}

export function useMcpOAuth(
  serverId: string,
  port: McpOAuthPort,
): McpOAuthController {
  const [status, setStatus] = useState<McpOAuthStatusResponse | null>(null);
  const [busy, setBusy] = useState<McpOAuthBusy>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pendingAuthUrl, setPendingAuthUrl] = useState<string | null>(null);
  // Holds the active poll's unsubscribe so any settle-path can tear it down.
  const stopPollRef = useRef<(() => void) | null>(null);

  const stopPoll = useCallback(() => {
    stopPollRef.current?.();
    stopPollRef.current = null;
  }, []);

  const refresh = useCallback(async (): Promise<McpOAuthStatusResponse | null> => {
    const data = await port.fetchStatus(serverId);
    if (data) setStatus(data);
    return data;
  }, [port, serverId]);

  const startPoll = useCallback(() => {
    stopPoll();
    stopPollRef.current = port.subscribeStatusPolling(() => {
      void (async () => {
        const data = await refresh();
        // Auto-stop when the daemon reports connected — handles the Electron /
        // system-browser case where postMessage can never reach back across
        // processes, so polling IS the delivery channel for "auth completed".
        if (data?.connected) {
          setBusy('idle');
          setError(null);
          setPendingAuthUrl(null);
          stopPoll();
        }
      })();
    });
  }, [port, refresh, stopPoll]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Listen for the callback page's completion signal. The bridge validates the
  // message shape/origin and hands us a normalized result; any result settles
  // the flow (busy -> idle, poll torn down), success refreshes status.
  useEffect(() => {
    const unsubscribe = port.subscribeCallback(serverId, (result) => {
      if (result.ok) {
        setError(null);
        setPendingAuthUrl(null);
        void refresh();
      } else if (result.message) {
        setError(result.message);
      }
      setBusy('idle');
      stopPoll();
    });
    return () => {
      unsubscribe();
      stopPoll();
    };
  }, [serverId, port, refresh, stopPoll]);

  const onConnect = useCallback(async () => {
    setError(null);
    setPendingAuthUrl(null);
    setBusy('starting');
    const result = await port.start(serverId);
    if (!result.ok) {
      setBusy('idle');
      setError(result.message);
      return;
    }
    setBusy('awaiting');
    setPendingAuthUrl(result.response.authorizeUrl);
    startPoll();
    port.openAuthorizeUrl(result.response.authorizeUrl);
  }, [port, serverId, startPoll]);

  const onRefreshStatus = useCallback(async () => {
    setBusy('refreshing');
    const data = await refresh();
    setBusy('idle');
    if (data?.connected) {
      setError(null);
      setPendingAuthUrl(null);
      stopPoll();
    } else if (busy === 'awaiting' || pendingAuthUrl) {
      // Still pending — keep the awaiting indicator visible so the user knows
      // we're still listening for the callback.
      setBusy('awaiting');
    }
  }, [refresh, stopPoll, busy, pendingAuthUrl]);

  const onCancelPending = useCallback(() => {
    setPendingAuthUrl(null);
    setBusy('idle');
    setError(null);
    stopPoll();
  }, [stopPoll]);

  const onDisconnect = useCallback(async () => {
    setBusy('disconnecting');
    const ok = await port.disconnect(serverId);
    setBusy('idle');
    if (ok) {
      setError(null);
      setPendingAuthUrl(null);
      setStatus({ connected: false });
    } else {
      setError('Disconnect failed. Check daemon logs.');
    }
  }, [port, serverId]);

  const connected = Boolean(status?.connected);
  const expiresLabel =
    status?.expiresAt && status.expiresAt > 0
      ? new Date(status.expiresAt).toLocaleString()
      : null;
  const isAwaiting = busy === 'awaiting' || (Boolean(pendingAuthUrl) && !connected);

  return {
    status,
    busy,
    error,
    pendingAuthUrl,
    connected,
    isAwaiting,
    expiresLabel,
    onConnect,
    onRefreshStatus,
    onCancelPending,
    onDisconnect,
  };
}

/** Wirer: binds the real OAuth provider port for a server; swap in tests. */
export function useWiredMcpOAuth(serverId: string): McpOAuthController {
  return useMcpOAuth(serverId, mcpOAuthPort);
}
