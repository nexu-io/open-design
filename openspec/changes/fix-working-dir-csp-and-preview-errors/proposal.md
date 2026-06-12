# Proposal: Fix working directory, CSP, Composio config, and plugin preview errors

**Status:** draft  
**Created:** 2026-06-12  
**Updated:** 2026-06-12 (re-scoped to web-only Docker deployment)  
**Change:** `fix-working-dir-csp-and-preview-errors`  
**Mode:** interactive  
**Artifact store:** OpenSpec  
**PR strategy:** single PR  
**Deployment target:** Web-only (Docker Compose on VPS)

## Problem Statement

Open Design has multiple root-cause failures that make the core project and community-preview workflows feel broken when deployed as a web-only Docker service:

1. **Working directory selection doesn't work.** The UI already has a "Choose folder" button, but the selected directory is never applied to the project. The daemon rejects `metadata.baseDir` on `POST /api/projects`, and the required follow-up `POST /api/projects/:id/working-dir` is gated behind a desktop-auth HMAC token requirement that makes no sense in a web-only deployment with no Electron shell. Additionally, the web-only folder dialog fallback (`POST /api/dialog/open-folder`) may not be properly wired for the create flow.
2. **Browsing community project/plugin previews floods DevTools with CSP violations.** Sandboxed preview HTML blocks external styles, scripts, images, media, fonts, frames, and fetches. The existing rewrite/proxy path only covers media-like URLs, leaving fonts, CSS, JS, Google Fonts CSS, and runtime public data fetches blocked.
3. **`GET /api/connectors/composio/config` returns 403.** Even though it only exposes public connector config (`configured` + `apiKeyTail`), the daemon origin guard rejects browser requests during the `resolvedPort` startup window.
4. **`GET /api/plugins/example-live-artifact/preview` returns 404.** The bundled `example-live-artifact` plugin declares `od.preview.entry: ./index.html` but ships no renderable HTML preview file.

These failures combine into a poor experience: selected folders are silently ignored, previews render incomplete, and expected built-in examples fail outright.

## Deployment context

The target deployment is a **web-only Docker Compose stack on a VPS**. There is no Electron desktop shell, no native folder picker, and no desktop-auth HMAC token infrastructure. The working directory flow must work purely through the web UI and daemon HTTP API.

## Proposal question round

- **CSP strategy:** proxy + rewrite (extend `/api/asset-cache` and URL rewriting). Do not relax sandbox isolation.
- **Working directory UX:** fix the existing "Choose folder" button so it works end-to-end in web-only deployments. Support `OD_WORKING_DIR` env var for pre-configuration in docker-compose.
- **Auth gate:** remove the desktop-auth requirement from the working-dir endpoint. Accept paths directly with security validations.
- **Delivery:** single PR if reviewable.

## Intent

- The existing "Choose folder" button results in the project actually using the selected directory, with no desktop dependency.
- Community previews load their expected static resources through a guarded same-origin cache/proxy rather than failing with CSP errors.
- Public connector configuration reads do not fail due to startup/origin races.
- The built-in live artifact example has a valid preview.

## Scope

### In scope

- **Working directory web-only flow:**
  - Fix the existing "Choose folder" button so it opens a web-based folder dialog and stores the selected path.
  - Wire the project-create flow so the selected path is applied via `POST /api/projects/:id/working-dir` after project creation.
  - Remove the desktop-auth HMAC token requirement from `POST /api/projects/:id/working-dir` — accept paths directly.
  - Keep security validations: path must exist (`realpath`), must not be root (`/`), must not be the daemon data directory.
  - Support `OD_WORKING_DIR` env var as a default path for docker-compose pre-configuration.
  - Wire the in-project `WorkingDirPicker` callbacks to actually persist changes via the API.
- **Plugin preview CSP and asset loading:** extend URL rewriting and `/api/asset-cache` to cover fonts, CSS (with recursive `url()` rewriting), static JS, and Google Fonts pipeline. Update sandbox CSP directives accordingly.
- **Composio config 403:** fix the origin/startup race in the CORS middleware so safe public GET routes work before `resolvedPort` is set.
- **Plugin preview 404:** add a renderable `index.html` preview to `example-live-artifact` and align the manifest.
- **Tests:** focused tests for each root cause.

### Out of scope / non-goals

- Disabling CSP for plugin previews.
- Allowing arbitrary direct internet access from sandboxed preview iframes.
- Turning `/api/asset-cache` into an unrestricted open proxy.
- Desktop/Electron integration (native folder picker, HMAC tokens, IPC bridge).
- Designing a full plugin-declared CSP policy system.
- Building a new Composio auth/config UI.
- Creating preview HTML for every plugin that lacks one — only `example-live-artifact`.
- Database migrations or configuration format changes.
- Changing the `POST /api/import/folder` flow (desktop-only concern).

## Affected Areas

- **Web UI:**
  - `apps/web/src/components/HomeView.tsx` — working dir text input + env var support
  - `apps/web/src/components/NewProjectPanel.tsx` — working dir state + create integration
  - `apps/web/src/components/WorkingDirPicker.tsx` — post-create wiring to API
  - Web daemon provider/registry helpers for project create and working-dir update
- **Daemon routes:**
  - `apps/daemon/src/import-export-routes.ts` — `POST /api/projects/:id/working-dir` (remove desktop-auth gate)
  - `apps/daemon/src/project-routes.ts` — `baseDir` privilege gates
  - `apps/daemon/src/projects.ts` — `resolveProjectDir` (already supports `baseDir`)
  - `apps/daemon/src/server.ts` — CORS middleware, CSP headers, `rewritePluginAssetUrls`, `servePluginSandboxedHtml`, preview routes
  - `apps/daemon/src/plugin-asset-cache.ts` — extend cacheable resource types
  - `apps/daemon/src/connectors/routes.ts` — composio config GET (no change needed, but verify)
  - `apps/daemon/src/desktop-auth.ts` — remove gate from working-dir endpoint (preserve for import folder)
- **Bundled plugin content:**
  - `plugins/_official/examples/live-artifact/open-design.json`
  - new `plugins/_official/examples/live-artifact/index.html`
- **Tests:**
  - `apps/daemon/tests/` — working-dir, CSP/rewrite, origin middleware, plugin preview
  - `apps/web/` — create flow tests

## Proposed Approach

### 1. Working-directory selection (web-only)

Remove the desktop dependency entirely from the working directory flow:

- **Daemon:** Remove `verifyDesktopImportToken()` call from `POST /api/projects/:id/working-dir`. Accept the path directly with validations: `realpath()` must succeed, must not be `/`, must not be inside `OD_DATA_DIR`. Set `metadata.baseDir = normalizedPath` directly.
- **Daemon:** Support `OD_WORKING_DIR` env var as a default working directory path.
- **Web UI:** Fix the existing "Choose folder" button's web-only fallback path (`openFolderDialog()` → `POST /api/dialog/open-folder`) so it works without the desktop host. The button already exists in `HomeView.tsx` and `NewProjectPanel.tsx` — fix its wiring, don't replace it.
- **Web UI:** After project creation, call `POST /api/projects/:id/working-dir` with the selected path. Show success/failure clearly.
- **Web UI:** Wire `WorkingDirPicker` callbacks to actually call the API instead of only updating local state.
- Keep `POST /api/projects` rejecting direct `metadata.baseDir` writes to preserve the intentional separation of concerns.
- The `POST /api/import/folder` flow (desktop-only) retains its existing HMAC gate and remains unchanged.

### 2. Plugin preview CSP and asset loading

Keep sandbox isolation, but proxy external resources through same-origin cache:

- Extend `rewritePluginAssetUrls` to handle:
  - `<link rel="stylesheet" href="https://...">` → rewrite to `/api/asset-cache?url=...`
  - `<script src="https://...">` → rewrite to `/api/asset-cache?url=...`
  - Google Fonts CSS URLs (`fonts.googleapis.com/css2?...`) → rewrite to proxy
  - Font files referenced in CSS `@font-face { src: url(...) }` via recursive CSS rewriting
- Extend `/api/asset-cache` to accept and cache:
  - Fonts: `.woff`, `.woff2`, `.ttf`, `.otf`
  - CSS content with recursive `url()` rewriting
  - Static JavaScript (with content-type and size limits)
  - Existing media types unchanged
- Add Google Fonts proxy: when the asset cache receives a `fonts.googleapis.com` CSS URL, it fetches the CSS server-side, recursively rewrites `url()` references to `fonts.gstatic.com` through the same cache proxy, and returns rewritten CSS.
- Update sandbox CSP to allow same-origin proxied resources:
  ```
  default-src 'none';
  img-src 'self' data: blob:;
  media-src 'self' data: blob:;
  style-src 'self' 'unsafe-inline';
  script-src 'self' 'unsafe-inline';
  font-src 'self' data:;
  connect-src 'self';
  frame-ancestors 'self'
  ```
- Preserve SSRF protections: reject non-http(s), credentials, localhost/private IPs, DNS rebinding. Enforce per-type size limits. Only GET/HEAD methods. Immutable cache for static resources.

### 3. Composio config 403

Fix the startup race in CORS middleware:

- In the `/api` origin guard middleware (`server.ts`), reorder the `resolvedPort` check to come AFTER the null-origin safe-list check, so safe public GET routes work during daemon startup.
- Alternatively, add public safe routes (like composio config) to a bypass list that skips origin checks entirely.
- Preserve: `PUT /api/connectors/composio/config` remains behind local-daemon request check. Secrets never exposed in public GET response.
- Add a regression test simulating an early request before `resolvedPort` is set.

### 4. `example-live-artifact` preview 404

Add a minimal self-contained HTML preview:

- Create `plugins/_official/examples/live-artifact/index.html` with a static dashboard-like preview demonstrating the live artifact concept (charts, refresh button, etc. using inline CSS/JS only — no external dependencies needed for the demo).
- Keep `od.preview.entry: "./index.html"` in manifest.
- Add a test that verifies the preview resolves for the bundled `example-live-artifact` plugin.
- Optionally: add an audit test that fails when any bundled plugin declares a preview entry pointing to a non-existent file.

## Risks

- **Preview proxy expansion:** Mitigate with strict scheme, host/IP, method, content-type, size, and DNS-rebinding protections. Proxy only serves static resources, not arbitrary web pages.
- **Proxied external JS executes in sandbox:** The iframe sandbox attribute (`allow-scripts`) and CSP `script-src 'self'` already limit script execution. Proxied JS runs as same-origin but has no access to daemon cookies or privileged APIs. Acceptable risk for static preview code.
- **`connect-src 'self'` increases same-origin request surface:** Sandboxed iframes can now make same-origin fetch requests. Combined with the existing null-origin safe-list, this only allows reaching safe cache/config endpoints, not mutating APIs.
- **Working-dir without auth:** Removing the HMAC gate means any localhost request can change `baseDir`. Mitigations: the endpoint already requires the daemon to be local (loopback-only in Docker), validates path existence, rejects root and data dir. For VPS deployments behind a reverse proxy, additional auth should be configured at the proxy level.
- **Env var for working dir:** If `OD_WORKING_DIR` points to a path that doesn't exist in the container, the UI shows an error. Mitigation: document the volume mount requirement in docker-compose examples.
- **Single PR size:** The change spans web, daemon, tests, and bundled plugin assets. If tasks show the diff will exceed ~400 lines, split into two PRs.

## Rollback Plan

- Working-dir changes revert to previous behavior by removing the post-create API call and text input. The desktop-auth gate removal is additive and doesn't affect existing desktop flows.
- CSP/proxy changes revert by restoring previous `rewritePluginAssetUrls`, asset-cache allowlist, and CSP directives.
- Composio origin fix reverts to prior middleware ordering.
- `example-live-artifact` preview HTML can be removed.
- No persistent data migration. Project and connector config files remain compatible.

## Success Criteria

- Clicking "Choose folder", selecting a directory, and creating a project results in that project resolving to the selected directory.
- Changing the working directory after project creation persists via `POST /api/projects/:id/working-dir` without requiring desktop-auth tokens.
- `OD_WORKING_DIR` env var pre-populates the working directory input in the UI.
- Security validations remain: non-existent paths, root (`/`), and data directory are rejected.
- Browsing community/plugin previews no longer floods DevTools with CSP errors. Fonts, CSS, media, images, scripts, and Google Fonts load through same-origin proxy/cache.
- Direct external network access from sandboxed iframes remains blocked unless proxied.
- `GET /api/connectors/composio/config` returns `{ configured, apiKeyTail }` instead of 403 during startup.
- `GET /api/plugins/example-live-artifact/preview` returns valid HTML (200) instead of 404.
- Focused tests cover all four root causes and preserve existing security boundaries.
