// Browser-side bridge for the MCP server OAuth flow. Owns the three browser
// side-effects the flow needs — the popup-callback message (window `message`
// event + the `open-design-mcp-oauth` BroadcastChannel), the mid-authorization
// status poll timer, and opening the provider's authorize tab. This lives in
// providers/ rather than a feature file because it touches `window` /
// `BroadcastChannel` / `setInterval`; the slice reaches every one of these
// through an injected port, so its hooks stay DOM-free and unit-testable with a
// fake.

/** The `open-design-mcp-oauth` BroadcastChannel the callback page also posts on. */
const MCP_OAUTH_BROADCAST_CHANNEL = 'open-design-mcp-oauth';

/** How often to re-poll OAuth status while an authorization is in flight. */
const MCP_OAUTH_POLL_INTERVAL_MS = 2_000;

/** Stop polling after this long — matches the daemon-side state cache TTL. */
const MCP_OAUTH_POLL_TIMEOUT_MS = 5 * 60 * 1_000;

/** Normalized result the callback bridge hands the slice, decoupled from the
 * raw `postMessage` payload shape. */
export interface McpOAuthCallbackResult {
  ok: boolean;
  message?: string;
}

/**
 * Subscribe to the OAuth callback page's completion signal for one server. The
 * callback page both `postMessage`s its opener and broadcasts on a channel; we
 * accept a message only when it is the expected `mcp-oauth` type and either
 * carries no server id or matches this server. Returns an unsubscribe that
 * tears both listeners down.
 */
export function subscribeMcpOAuthCallback(
  serverId: string,
  onResult: (result: McpOAuthCallbackResult) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const onMessage = (event: MessageEvent): void => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if ((data as { type?: unknown }).type !== 'mcp-oauth') return;
    const sid = (data as { serverId?: unknown }).serverId;
    // Error payloads carry no serverId, so an absent id always passes; an
    // explicit id must match the server this control is watching.
    if (sid && sid !== serverId) return;
    const message = (data as { message?: unknown }).message;
    onResult({
      ok: Boolean((data as { ok?: unknown }).ok),
      message: typeof message === 'string' ? message : undefined,
    });
  };
  window.addEventListener('message', onMessage);
  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(MCP_OAUTH_BROADCAST_CHANNEL);
    channel.onmessage = (event) => onMessage(event as MessageEvent);
  }
  return () => {
    window.removeEventListener('message', onMessage);
    if (channel) channel.close();
  };
}

/**
 * Poll on a fixed interval while an authorization is mid-flight. This is the
 * delivery channel for the Electron / system-browser case where the callback
 * page's `postMessage` can never reach back across processes. Self-stops after
 * the timeout; the caller also stops it once the daemon reports connected.
 * Returns an unsubscribe.
 */
export function subscribeMcpOAuthStatusPolling(onTick: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  let elapsed = 0;
  const interval = window.setInterval(() => {
    elapsed += MCP_OAUTH_POLL_INTERVAL_MS;
    onTick();
    if (elapsed >= MCP_OAUTH_POLL_TIMEOUT_MS) window.clearInterval(interval);
  }, MCP_OAUTH_POLL_INTERVAL_MS);
  return () => window.clearInterval(interval);
}

/**
 * Best-effort open of the provider's authorize page in a new tab. We do NOT
 * treat a null return as failure — Electron's `setWindowOpenHandler` always
 * returns deny (so `window.open` returns null) but actually invokes
 * `shell.openExternal`, so the URL DID open in the system browser. The slice's
 * fallback link covers the rare case where neither path opens a tab.
 */
export function openMcpAuthorizeUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.open(url, '_blank', 'noopener=no,noreferrer=no');
  } catch {
    // ignore — the fallback anchor is always rendered while pending
  }
}
