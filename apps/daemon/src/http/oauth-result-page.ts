export interface OAuthResultPageOptions {
  ok: boolean;
  serverId?: string | null;
  message?: string | null;
  providerLabel?: string | null;
  returnUrl?: string | null;
}

export function renderOAuthResultPage(opts: OAuthResultPageOptions): string {
  const ok = Boolean(opts.ok);
  const title = ok ? 'Connected' : 'Authorization failed';
  const heading = ok ? '✅ Connected' : '⚠️ Authorization failed';
  const body = ok
    ? (opts.providerLabel
      ? `${escapeHtml(opts.providerLabel)} is now connected.`
      : `Your MCP server <code>${escapeHtml(opts.serverId ?? '')}</code> is now connected. You can close this tab and return to OpenDesign.`)
    : escapeHtml(opts.message ?? 'Authorization could not be completed.');
  const accent = ok ? '#1a7f37' : '#cf222e';
  const payload = ok
    ? { type: 'mcp-oauth', ok: true, serverId: opts.serverId ?? null }
    : { type: 'mcp-oauth', ok: false, message: opts.message ?? null };
  // Where the flow was started from, when the caller knows: an absolute http(s)
  // URL is the one thing this page will link to. Anything else — no value, a
  // relative path, a `javascript:` URL a future caller passes by mistake — is
  // not a way back, and falls through to the button below.
  const returnUrl = safeReturnUrl(opts.returnUrl);
  // The one affordance this page offers. The callback tab is often opened as a
  // `_blank` fallback the browser does not let script close, so when there is a
  // URL to go back to the honest control is a link, not a button that may do
  // nothing; the button stays for a tab with nowhere to return to.
  const action = returnUrl
    ? `<a class="action-link" href="${escapeHtml(returnUrl)}">Return to OpenDesign</a>`
    : '<button type="button" onclick="window.close()">Close this tab</button>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} — OpenDesign</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif;
    background: #f6f7f9; color: #1f2328; padding: 24px;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0d1117; color: #e6edf3; }
    .card { background: #161b22; border-color: #30363d; }
    code { background: #1f242c; }
  }
  .card {
    max-width: 420px; width: 100%; padding: 28px 28px 22px; border-radius: 12px;
    background: white; border: 1px solid #d0d7de; box-shadow: 0 8px 24px rgba(0,0,0,.06);
    text-align: left;
  }
  h1 { margin: 0 0 8px; font-size: 18px; color: ${accent}; }
  p  { margin: 0 0 16px; font-size: 14px; line-height: 1.55; }
  code { background: #f3f4f6; padding: 1px 6px; border-radius: 4px; font-size: 12.5px; }
  button, .action-link {
    appearance: none; border: 1px solid #d0d7de; background: white;
    border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer;
  }
  .action-link { display: inline-block; color: inherit; text-decoration: none; }
  button:hover, .action-link:hover { background: #f6f8fa; }
  @media (prefers-color-scheme: dark) {
    button, .action-link { background: #21262d; border-color: #30363d; color: #e6edf3; }
    button:hover, .action-link:hover { background: #30363d; }
  }
</style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(heading)}</h1>
    <p>${body}</p>
    ${action}
  </div>
  <script>
    try {
      var payload = ${JSON.stringify(payload).replace(/</g, '\\u003c')};
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, '*');
      }
      if (window.BroadcastChannel) {
        var bc = new BroadcastChannel('open-design-mcp-oauth');
        bc.postMessage(payload);
        bc.close();
      }
    } catch (e) { /* ignore postMessage failures */ }
    ${returnUrl ? `if (window.opener) { setTimeout(function () { try { window.close(); } catch (e) {} }, 1200); }` : ''}
  </script>
</body>
</html>`;
}

/** The `returnUrl` this page may render as a link: the caller's value back,
 * verbatim (the caller escapes it into the attribute), when it is an absolute
 * http(s) URL — and null otherwise, so an unusable or unexpectedly-schemed value
 * can never reach an `href`. Null also means there is nowhere to return to, and
 * the tab offers the close button instead. */
function safeReturnUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const { protocol } = new URL(raw);
    return protocol === 'http:' || protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
}

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
