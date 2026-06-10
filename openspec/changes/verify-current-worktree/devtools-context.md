# Code Context: Browser DevTools Console Errors

## Files Retrieved

1. **`apps/web/src/runtime/srcdoc.ts`** (lines 350-410, 745-1300) — Palette bridge (`applyVarTint`), selection/inspect bridge postMessage handlers, CSS `@import`/`cssRules` access across stylesheets. Core of the srcdoc iframe runtime.
2. **`apps/web/src/runtime/exports.ts`** (lines 340-370) — Snapshot request via `win.postMessage`.
3. **`apps/web/src/components/FileViewer.tsx`** (lines 4130-4550, 6370-6530, 2319-2325, 3820-3830, 4267-4452, 5131-5179) — Dual iframe (URL-load + srcDoc) rendering, all postMessage calls to contentWindow, CSP/bridge synchronization, inspect-override replay, scroll restore.
4. **`apps/web/src/components/file-viewer-render-mode.ts`** (lines 1-100) — UrlLoadDecision logic: when to use URL-load vs srcDoc.
5. **`apps/web/src/edit-mode/bridge.ts`** — Edit bridge postMessage calls (od-edit-targets, od-edit-preview-style-applied).
6. **`apps/daemon/src/server.ts`** (lines 2615-2645, 6710-7120) — Three distinct CSP definitions: `setLiveArtifactPreviewHeaders`, `setLiveArtifactCodeHeaders`, and the §9.2 preview/asset CSP with `connect-src 'none'`.
7. **`apps/daemon/src/connectors/routes.ts`** (lines 554-570) — `GET /api/connectors/composio/config` route registration and handler.
8. **`apps/daemon/src/connectors/composio-config.ts`** (lines 1-100) — Composio config read/write to `.od/connectors/composio-config.json`.

---

## Error 1: VariablesStore.putRootVars null cssRules in index.js

### Likely Root Cause

The palette bridge in `srcdoc.ts` (function `applyVarTint`, ~line 384) iterates `document.styleSheets` and accesses `sheet.cssRules` on each stylesheet:

```typescript
// srcdoc.ts ~line 380
try { rules = sheet.cssRules; } catch (_){ continue; }
```

The try/catch handles the **SecurityError** thrown when accessing `cssRules` on a cross-origin stylesheet `<link>`. However, `sheet.cssRules` can be **null** instead of throwing in some browser contexts (e.g., CSSStyleSheet objects that are not fully loaded, or certain shadow-DOM-related sheets). When null is returned (not thrown), the try/catch passes it through unwrapped, and `forEachStyleRule` is called with null.

The guard `if (!rules || !budget.left) return;` at the top of `forEachStyleRule` should catch this. But "VariablesStore.putRootVars" is not a function name visible in srcdoc.ts — it's likely a **minified/mangled name in the production bundle** (`index.js`), or the error originates from a **different bundled module** that wraps the palette logic.

### Key File(s) to Check

- **`apps/web/src/runtime/srcdoc.ts`** — `applyVarTint` / `forEachStyleRule` functions (lines 370-409).
- The built/compiled `index.js` bundle that may have mangled the function name to `VariablesStore`.

### Suggested Fix

Add an explicit null check on `rules` before passing it to `forEachStyleRule`:

```typescript
try { rules = sheet.cssRules; } catch (_) { continue; }
if (!rules) continue;  // ← add this guard
forEachStyleRule(rules, ...);
```

### Test Suggestion

Unit test for `buildSrcdoc` / palette bridge where a stylesheet has `cssRules === null` (simulate with a mock `styleSheets` array containing a CSSStyleSheet that returns null for cssRules). Verify the palette bridge does not throw and skips gracefully.

---

## Error 2: /api/connectors/composio/config 403

### Likely Root Cause

The `GET /api/connectors/composio/config` route in `apps/daemon/src/connectors/routes.ts` (line 554) registers **without** the `requireLocalDaemonRequest` middleware:

```typescript
// routes.ts line 554
app.get('/api/connectors/composio/config', (_req: Request, res: Response) => {
  try {
    res.json(readPublicComposioConfig());
  } catch (err) {
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});
```

Compare with the `PUT` variant (line 561) which **does** use `requireLocalDaemonRequest`:

```typescript
app.put('/api/connectors/composio/config', requireLocalDaemonRequest, (req, res) => { ... });
```

The 403 likely comes from a **global authorization middleware** in `server.ts` that rejects requests from the web frontend to daemon-only API paths. The `GET` endpoint was likely meant to be accessible from the web UI (it returns only public config — a configured boolean and the last 4 chars of the API key) but has been caught by a blanket daemon-only guard.

### Key File(s) to Check

- **`apps/daemon/src/connectors/routes.ts`** (lines 554-559) — Route registration.
- **`apps/daemon/src/server.ts`** — Where `registerConnectorRoutes` is called and what middleware/guard is applied around it.

### Suggested Fix

Either:
1. Add the GET endpoint to a whitelist of web-accessible routes before the daemon-only middleware, or
2. Apply a more permissive middleware to the GET variant that allows both local daemon and web-proxied requests (e.g., only require auth for config writes).

### Test Suggestion

Add an e2e test that fetches `GET /api/connectors/composio/config` from the web context (same origin as the web app) and expects 200 with `{ configured: boolean, apiKeyTail: string }`.

---

## Error 3: CSP blocks stylesheet loads with style-src 'self' 'unsafe-inline'

### Likely Root Cause

Two distinct CSPs serve artifact HTML:

**Live artifact preview** (`setLiveArtifactPreviewHeaders`, server.ts ~line 2617):
```
default-src 'none'; script-src 'none'; connect-src 'none'; style-src 'unsafe-inline'; sandbox allow-same-origin
```
- `style-src 'unsafe-inline'` — **no `'self'`**, so even same-origin `<link rel="stylesheet">` loads are blocked.
- `script-src 'none'` — no JS at all.

**Plugin preview / asset CSP** (server.ts ~line 6840/7099):
```
default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'
```
- `style-src 'self' 'unsafe-inline'` — allows same-origin CSS files and inline styles, but **blocks cross-origin stylesheets** (e.g., Google Fonts, CDN-hosted CSS).

The error "CSP blocks stylesheet loads" occurs when an artifact HTML includes `<link href="..." rel="stylesheet">` pointing to a cross-origin URL (or, in the live-artifact case, **any** URL-based stylesheet). This is common in agent-generated HTML that pulls in fonts or CSS frameworks from CDNs.

### Key File(s) to Check

- **`apps/daemon/src/server.ts`** — `setLiveArtifactPreviewHeaders` (line 2617) and the plugin preview CSP (line 6840/7099).
- **`apps/web/src/runtime/srcdoc.ts`** — The `injectSandboxShim` / `buildSrcdoc` should strip or inline external CSS dependencies.

### Suggested Fix

Two options depending on security posture:

1. **Relax CSP for previews** — Add `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net` (etc.) as needed. Security risk: previews can load arbitrary hosted CSS.

2. **Inline external CSS in buildSrcdoc** — When generating the srcdoc, detect `<link href="..." rel="stylesheet">` tags that point to known cross-origin URLs, fetch and inline their content. This keeps the CSP strict.

3. **For the live-artifact CSP specifically** — Add `style-src 'self'` to `setLiveArtifactPreviewHeaders` so same-origin stylesheets work:
   ```
   style-src 'self' 'unsafe-inline'
   ```

### Test Suggestion

Add CSP header assertion tests for each preview-serving endpoint (`/api/projects/:id/raw/:file`, `/api/plugins/:id/asset/*`, `/api/plugins/:id/preview`) that verify `style-src` allows expected stylesheet sources.

---

## Error 4: Repeated postMessage target origin mismatch — recipient origin is 'null'

### Likely Root Cause

In Chrome, `srcdoc` iframes have origin `'null'`. When the srcdoc bridge code (`srcdoc.ts` bridges) posts messages to `window.parent`, it uses `'*'` as targetOrigin — this should not trigger warnings.

The warnings come from **parent-to-child** postMessage calls where the FileViewer specifies a non-wildcard targetOrigin. **All FileViewer postMessage calls in the code I inspected use `'*'`**:

```typescript
// FileViewer.tsx — all calls use '*' as targetOrigin
win.postMessage({ type: 'od:comment-mode', enabled, mode }, '*');
win.postMessage({ type: 'od-edit-mode', enabled }, '*');
win.postMessage({ type: 'od:srcdoc-transport-activate', html: srcDoc }, '*');
win.postMessage({ type: 'od:palette', palette }, '*');
// ... etc
```

However, the **edit mode bridge** (`edit-mode/bridge.ts` line 186, 236, etc.) calls `window.parent.postMessage(...)` from inside the iframe. If the parent page has a message listener that programmatically replies to the iframe using `ev.source.postMessage(...)` **without** `'*'`, this would trigger the warning because `ev.source` is a Window with origin `'null'`.

Also: the **OAuth callback page** (`routes.ts` renderConnectorConnectedHtml) posts `window.opener.postMessage(message, '*')` from the popup. If `window.opener` has a non-null origin but the popup page's origin is null (served from a `data:` or `blob:` URL, or from a sandboxed opener context), the warning could also occur there.

The most likely culprit is the **FileViewer's message event handler** that receives bridge messages and then calls `iframeRef.current?.contentWindow?.postMessage(someMsg, someOrigin)`. If `someOrigin` is ever not `'*'`, it would trigger the warning for srcdoc iframes (origin: null).

### Key File(s) to Check

- **`apps/web/src/components/FileViewer.tsx** — All `contentWindow.postMessage` call sites (around lines 4270, 4330, 4364, 4405, 4415, 4422, 4429, 4435-4451, 4461, 4468, 4534-4535, 5134, 5140, 5149, 5178, 6432, 6491). Ensure every one uses `'*'`.
- **`apps/web/src/runtime/srcdoc.ts`** — All bridge `window.parent.postMessage` call sites.
- **`apps/web/src/edit-mode/bridge.ts`** — All `window.parent.postMessage` call sites.

### Suggested Fix

Verify every `contentWindow.postMessage(_, targetOrigin)` call uses `'*'` as the target origin. If any caller passes a specific origin (e.g., to undo the security implications of `'*'`), wrap it in a helper that uses `'*'` when the target window's origin could be `'null'`:

```typescript
function safePostMessage(win: Window | null, msg: unknown): void {
  if (!win) return;
  win.postMessage(msg, '*');
}
```

### Test Suggestion

Add a lint rule or unit test that asserts all `postMessage` calls in these files use `'*'` as the second argument. Audit each call site.

---

## Error 5: connect-src 'none' blocks GitHub API fetches from preview:2632

### Likely Root Cause

**This is by design**, not a bug. The §9.2 preview CSP explicitly includes `connect-src 'none'` to prevent preview artifacts from making network requests:

```typescript
// server.ts ~line 6840/7099
"default-src 'none'; ...; connect-src 'none'; ..."
```

The server.ts comments (lines 6938-6941) state:
> "The §9.2 CSP keeps the preview from reaching back into /api/* even if its scripts try to fetch."

The error occurs when preview artifact JavaScript (running inside the sandboxed iframe) calls `fetch()` or `XMLHttpRequest` to any URL, including `https://api.github.com/...`. This is a **security boundary** — preview artifacts are not trusted to make external network calls.

If a preview artifact legitimately needs GitHub API data, it must be proxied through the daemon (add a daemon endpoint that the artifact can call before the `connect-src 'none'` CSP restriction is applied, or pass data as initial srcdoc content).

**Note:** "preview:2632" likely refers to the preview artifact number/ID, not a line number. The GitHub API URL `https://api.github.com/repos/nexu-io/open-design` is configured as a server-side constant at line 2642 (`OPEN_DESIGN_GITHUB_REPO_API`), used only by the daemon for server-side star counts / release checks — never intentionally exposed to browser-side preview code.

### Key File(s) to Check

- **`apps/daemon/src/server.ts`** — Lines 2642-2645 (GitHub API constants), lines 6840/7099 (CSP definitions).
- The preview artifact templates that include GitHub API fetch calls.

### Suggested Fix

This is a **design decision**, not a code fix:

1. **Accept the CSP boundary** — Remove any GitHub API fetch calls from preview artifact HTML templates. Blocked fetches are expected and safe.
2. **If preview artifacts need live data** — Add a daemon proxy endpoint (e.g., `/api/preview/github-proxy`) that the preview iframe can call, and relax `connect-src` to include `'self'`. This is a major security decision.

### Test Suggestion

Assert that CSP headers for preview endpoints always include `connect-src 'none'`. Verify that preview artifacts do not contain `fetch` or `XMLHttpRequest` calls to external URLs.

---

## Error 6: Unsafe cross-origin frame URL load

### Likely Root Cause

The FileViewer renders a **URL-load iframe** (`<iframe src="/api/projects/:id/raw/:file">`) in parallel with the srcdoc iframe. The URL points to the daemon's raw file serving endpoint.

In the local dev flow, `apps/web/next.config.ts` rewrites `/api/*` to the daemon port (`OD_PORT`), making the URL same-origin from the browser's perspective. **However**, in two scenarios the URL becomes cross-origin:

1. **Packaged runtime** — The web app and daemon may serve from different ports/origins without a proxy rewrite.
2. **Direct daemon serving** — If the web app loads the iframe with an absolute URL pointing to the daemon's origin (different port = different origin).

The `sandbox="allow-scripts allow-downloads"` attribute on the iframe (line 6397) does not include `allow-same-origin`, which means **even same-origin URLs get a unique null origin when sandboxed**. This is intentional — the sandbox removes same-origin status. But Chrome warns "Unsafe cross-origin frame URL load" when navigating a sandboxed iframe to a URL that would otherwise be same-origin if not for the sandbox.

### Key File(s) to Check

- **`apps/web/src/components/FileViewer.tsx`** — Iframe rendering (lines ~6397-6437). The `sandbox` attribute and `src` URL.
- **`apps/web/src/components/GenUISurfaceRenderer.tsx`** — Lines 854-859, uses `sandbox="allow-scripts"` for plugin surfaces.
- **`apps/web/next.config.ts`** — The rewrite configuration for `/api/*`.

### Suggested Fix

1. **For the URL-load iframe** — Include `allow-same-origin` in the sandbox attribute when the iframe src is same-origin. This tells the browser the iframe should retain its parent's origin.
   ```tsx
   <iframe
     sandbox="allow-scripts allow-downloads allow-same-origin"
     src={urlTransportSrc}
   />
   ```
   Security implication: this gives the artifact access to `localStorage`, cookies, and other same-origin resources. Only safe when the artifact content is trusted.

2. **Use srcdoc exclusively** — When the artifact cannot be trusted, force the srcdoc path (already the default for most preview modes). The URL-load path is only used when `shouldUrlLoadHtmlPreview()` returns true, which requires specific conditions.

3. **Suppress the DevTools warning** — The warning is cosmetic and does not block functionality. If sandbox security is more important than DevTools cleanliness, leave the sandbox as-is and accept the warning.

### Test Suggestion

Add a unit test for `shouldUrlLoadHtmlPreview` that confirms cross-origin sandbox warnings are acceptable for the specific `UrlLoadDecision` combinations that use URL-load. Add an e2e test that verifies the URL-load iframe loads and renders correctly despite the cross-origin sandbox.

---

## Architecture Summary

```
Web App (Next.js, port 17573)
  │
  ├── FileViewer.tsx
  │     ├── <iframe sandbox="allow-scripts allow-downloads" src="/api/...">
  │     │     → URL-load path: daemon raw file endpoint
  │     │     → CSP: setLiveArtifactPreviewHeaders (strict, no scripts)
  │     │     → Sandbox removes same-origin → cross-origin warnings
  │     │
  │     └── <iframe sandbox="allow-scripts allow-downloads" srcDoc={...}>
  │           → srcDoc path: bridges injected (palette, selection, edit, tweaks)
  │           → Origin: null → postMessage target origin mismatch potential
  │           → Bridges use '*' target origin for all postMessage calls
  │
  ├── ConnectorsBrowser.tsx
  │     └── GET /api/connectors/composio/config → 403 (global middleware)
  │
  └── (Preview artifacts)
        └── CSP: connect-src 'none' → blocks GitHub API fetches
```

## Start Here

**`apps/web/src/runtime/srcdoc.ts`** — This file is the single most important entry point. It contains the palette bridge (`applyVarTint` / `forEachStyleRule`) that's crashing on null cssRules, all the bridge postMessage handlers causing origin mismatch warnings, and the srcdoc generation that controls what CSP/security model the artifact iframe uses. Fixes for errors 1, 3, 4, and 6 all touch this file.

## Engram Note

No memory save tool was available. Key discoveries: the `applyVarTint` function needs a null guard on `sheet.cssRules`; the GET composio config route lacks local-daemon-only middleware that its PUT counterpart has; all postMessage calls use `'*'` so warnings are from either replies or third-party code; the `connect-src 'none'` CSP blocking GitHub API is intentional per §9.2 spec; the cross-origin frame warning is from sandboxed iframes without `allow-same-origin`.
