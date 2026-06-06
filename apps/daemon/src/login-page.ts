function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderLoginPage(error?: string, next?: string, isLocal?: boolean): string {
  const errorHtml = error
    ? `<div class="error">${escapeHtml(error)}</div>`
    : "";
  const nextInput = next
    ? `<input type="hidden" name="next" value="${escapeHtml(next)}" />`
    : "";
  const resetSection = isLocal ? `
    <div class="reset-section">
      <button type="button" class="reset-toggle" onclick="document.getElementById('reset-confirm').open=true">Lost all keys?</button>
      <dialog id="reset-confirm" class="reset-dialog">
        <form method="POST" action="/api/auth/reset-keys">
          <p class="reset-warn">This will delete <strong>all</strong> API keys and MCP keys. Anyone with existing keys will lose access.</p>
          <div class="reset-actions">
            <button type="submit" name="confirm" value="reset" class="reset-btn">Yes, reset all keys</button>
            <button type="button" class="reset-cancel" onclick="document.getElementById('reset-confirm').open=false">Cancel</button>
          </div>
        </form>
      </dialog>
    </div>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Login — Open Design</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" type="image/svg+xml" href="/app-icon.svg" />
<style>
  :root {
    --bg: #faf9f7;
    --bg-panel: #ffffff;
    --border: #ebe8e1;
    --border-strong: #d8d4cb;
    --text: #1a1916;
    --text-strong: #0d0c0a;
    --text-muted: #74716b;
    --text-soft: #989590;
    --accent: #c96442;
    --accent-hover: #b45a3b;
    --accent-tint: #fbeee5;
    --red: #9c2a25;
    --red-bg: #fdecea;
    --red-border: #f5c6c2;
    --shadow-md: 0 6px 24px rgba(28, 27, 26, 0.07), 0 2px 6px rgba(28, 27, 26, 0.04);
    --radius: 10px;
    --radius-sm: 6px;
    --sans: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    --mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1a1917;
      --bg-panel: #222120;
      --border: #333128;
      --border-strong: #46433c;
      --text: #e8e4dc;
      --text-strong: #f2ede4;
      --text-muted: #9a9690;
      --text-soft: #6e6b65;
      --accent: #d97a56;
      --accent-hover: #e8896a;
      --accent-tint: #2e1a12;
      --red: #e06b65;
      --red-bg: #3d1114;
      --red-border: #6e1014;
      --shadow-md: 0 6px 24px rgba(0, 0, 0, 0.2), 0 2px 6px rgba(0, 0, 0, 0.12);
    }
  }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center;
    font-family: var(--sans);
    background: var(--bg);
    color: var(--text);
    padding: 24px;
  }
  .card {
    max-width: 400px; width: 100%; padding: 36px 32px 28px;
    border-radius: var(--radius);
    background: var(--bg-panel);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-md);
  }
  .logo {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 8px;
  }
  .logo img { width: 32px; height: 32px; }
  .logo-text {
    font-size: 18px; font-weight: 600; color: var(--text-strong);
    letter-spacing: -0.01em;
  }
  .subtitle {
    margin: 0 0 24px; font-size: 14px; line-height: 1.5;
    color: var(--text-muted);
  }
  .error {
    margin: 0 0 16px; padding: 10px 14px;
    border-radius: var(--radius-sm);
    background: var(--red-bg); color: var(--red);
    font-size: 13px; border: 1px solid var(--red-border);
    line-height: 1.4;
  }
  label {
    display: block; font-size: 13px; font-weight: 500;
    color: var(--text-muted); margin-bottom: 6px;
  }
  .input-wrapper {
    position: relative; margin-bottom: 16px;
  }
  input[type="password"] {
    width: 100%; padding: 10px 14px; font-size: 14px;
    font-family: var(--mono);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: transparent; color: inherit;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  input[type="password"]::placeholder {
    color: var(--text-soft);
    font-family: var(--sans);
  }
  input[type="password"]:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-tint);
  }
  button {
    width: 100%; appearance: none; border: none;
    border-radius: var(--radius-sm);
    padding: 10px 14px; font-size: 14px; font-weight: 500;
    font-family: var(--sans);
    cursor: pointer;
    background: var(--accent); color: #fff;
    transition: background 0.15s;
  }
  button:hover { background: var(--accent-hover); }
  button:active { transform: scale(0.99); }
  .hint {
    margin: 14px 0 0; font-size: 12px;
    color: var(--text-soft); line-height: 1.5;
  }
  .hint code {
    font-family: var(--mono); font-size: 11px;
    background: var(--accent-tint);
    padding: 1px 5px; border-radius: 3px;
    color: var(--accent);
  }
  .reset-section {
    margin-top: 16px; padding-top: 14px;
    border-top: 1px solid var(--border);
    text-align: center;
  }
  .reset-toggle {
    width: auto; background: none; color: var(--text-soft);
    font-size: 12px; padding: 4px 8px;
    text-decoration: underline; text-underline-offset: 2px;
  }
  .reset-toggle:hover { color: var(--text-muted); background: none; }
  .reset-dialog {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--bg-panel);
    padding: 24px;
    max-width: 360px;
    box-shadow: var(--shadow-md);
    color: var(--text);
  }
  .reset-dialog::backdrop { background: rgba(0,0,0,0.3); }
  .reset-warn {
    margin: 0 0 18px; font-size: 14px; line-height: 1.5;
    color: var(--text);
  }
  .reset-actions { display: flex; flex-direction: column; gap: 8px; }
  .reset-btn {
    background: var(--red); color: #fff;
  }
  .reset-btn:hover { opacity: 0.9; }
  .reset-cancel {
    background: transparent; color: var(--text-muted);
    border: 1px solid var(--border-strong);
  }
  .reset-cancel:hover { background: var(--bg); }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <img src="/app-icon.svg" alt="" draggable="false" />
      <span class="logo-text">Open Design</span>
    </div>
    <p class="subtitle">Open Design, Anywhere, Everywhere.</p>
    ${errorHtml}
    <form method="POST" action="/api/auth/login">
      <label for="key">API key</label>
      <div class="input-wrapper">
        <input type="password" id="key" name="key" placeholder="od_... or od_mcp_..." autocomplete="off" required autofocus />
      </div>
      ${nextInput}
      <button type="submit">Sign in</button>
    </form>
    <p class="hint">
      Generate a key from <code>Settings &rarr; Security</code> or use <code>od auth gen</code>.
    </p>
    ${resetSection}
  </div>
</body>
</html>`;
}
