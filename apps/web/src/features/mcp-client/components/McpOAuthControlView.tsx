// Presentational "Connect / Disconnect" panel for an HTTP/SSE MCP server. Takes
// the OAuth controller (from `useMcpOAuth`) as props and renders it — no state,
// no transport, no DOM. Tests render it with a hand-built controller.
import type { McpOAuthController } from '../hooks/useMcpOAuth.hooks';

export function McpOAuthControlView({
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
}: McpOAuthController) {
  return (
    <div className={`mcp-oauth-control${connected ? ' connected' : ''}`}>
      <div className="mcp-oauth-status" aria-live="polite">
        {connected ? (
          <>
            <span className="mcp-oauth-dot mcp-oauth-dot-ok" aria-hidden />
            <span>
              <strong>Connected.</strong>{' '}
              {expiresLabel ? (
                <span className="hint">Token expires {expiresLabel}.</span>
              ) : (
                <span className="hint">Non-expiring token.</span>
              )}
            </span>
          </>
        ) : isAwaiting ? (
          <>
            <span className="mcp-oauth-dot mcp-oauth-dot-pending" aria-hidden />
            <span>
              <strong>Waiting for authorization…</strong>{' '}
              <span className="hint">
                Approve in the browser tab that opened. We'll catch the callback
                automatically — or click Refresh below if you completed it
                already.
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="mcp-oauth-dot" aria-hidden />
            <span>
              <strong>Not connected.</strong>{' '}
              <span className="hint">
                Click Connect to grant Open Design access via the provider's OAuth flow.
              </span>
            </span>
          </>
        )}
      </div>

      <div className="mcp-oauth-actions">
        {connected ? (
          <>
            <button
              type="button"
              className="primary"
              onClick={onConnect}
              disabled={busy !== 'idle' && busy !== 'refreshing'}
              title="Reauthenticate (replaces the existing token)"
            >
              {busy === 'starting' || busy === 'awaiting' ? 'Connecting…' : 'Reconnect'}
            </button>
            <button
              type="button"
              onClick={onRefreshStatus}
              disabled={busy !== 'idle' && busy !== 'refreshing'}
              title="Re-check token status against the daemon"
            >
              {busy === 'refreshing' ? 'Checking…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={onDisconnect}
              disabled={busy !== 'idle' && busy !== 'refreshing'}
            >
              {busy === 'disconnecting' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        ) : isAwaiting ? (
          <>
            <button
              type="button"
              className="primary"
              onClick={onRefreshStatus}
              disabled={busy === 'refreshing'}
              title="I've completed authorization — check connection status now"
            >
              {busy === 'refreshing' ? 'Checking…' : 'I’ve approved — Refresh'}
            </button>
            <button type="button" onClick={onCancelPending}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={onConnect}
            disabled={busy !== 'idle'}
          >
            {busy === 'starting' ? 'Starting…' : 'Connect'}
          </button>
        )}
      </div>

      {pendingAuthUrl && !connected ? (
        <div className="mcp-oauth-fallback">
          <span className="hint">
            Browser didn't open?{' '}
            <a
              href={pendingAuthUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="md-link"
            >
              Open authorization page
            </a>
            .
          </span>
        </div>
      ) : null}

      {error ? <div className="mcp-oauth-error">{error}</div> : null}
    </div>
  );
}
