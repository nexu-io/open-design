# Design: Web deployment reliability fixes

**Change:** `fix-working-dir-csp-and-preview-errors`  
**Phase:** SDD design  
**Deployment target:** web-only Docker Compose on a VPS  
**Status:** draft  
**Skill resolution:** fallback-path (`/home/developer/.pi/agent/agents/sdd-design.md`)

## Summary

This change fixes four independent root causes without introducing a desktop dependency:

1. The existing **Choose folder** button will work in web-only deployments and the selected directory will be persisted through `POST /api/projects/:id/working-dir` after project creation.
2. Sandboxed plugin previews will keep isolation but load supported external static resources only through the same-origin `/api/asset-cache` proxy.
3. `GET /api/connectors/composio/config` will be treated as a startup-safe public read route while `PUT` remains protected.
4. The bundled `example-live-artifact` plugin will ship the preview HTML its manifest already declares, with a regression audit for broken bundled preview entries.

The design intentionally does **not** add a raw path text input. It repairs the existing button and picker flows.

---

## Current root causes

### Working directory

- `HomeView.tsx` and `NewProjectPanel.tsx` already keep `workingDir` state and call `openFolderDialog()` on the web-only path.
- `POST /api/projects` correctly rejects direct `metadata.baseDir` writes.
- The durable assignment is `POST /api/projects/:id/working-dir`.
- That endpoint currently conditionally requires desktop HMAC tokens whenever `isDesktopAuthGateActive()` is true, which breaks web-only deployments and any daemon that has ever seen a desktop registration.
- The daemon-side folder picker (`/api/dialog/open-folder`) uses OS GUI tools (`osascript`, `zenity`, PowerShell). In a Docker/VPS deployment this is usually headless, so the existing button can appear wired but cannot actually return a path.

### Plugin previews

- `rewritePluginAssetUrls` only proxies media-like URL extensions.
- External CSS, JS, fonts, and Google Fonts CSS remain direct external URLs and are blocked by the sandbox CSP.
- `/api/asset-cache` already has the important SSRF architecture: `assertSafePublicUrl`, private-address rejection, and connection-time DNS validation through `createValidatingLookup`.

### Composio config

- `GET /api/connectors/composio/config` is secret-safe, but browser-origin requests can hit the `/api` origin guard before `resolvedPort` is known and receive `403 Server initializing`.
- `PUT /api/connectors/composio/config` is correctly protected by `requireLocalDaemonRequest` and must not be relaxed.

### `example-live-artifact` preview

- `plugins/_official/examples/live-artifact/open-design.json` declares `od.preview.entry: ./index.html`.
- No `index.html` is shipped, so `/api/plugins/example-live-artifact/preview` exhausts candidates and returns 404.

---

## Design decisions

### Decision 1: Keep the existing button, replace the headless backend behavior

The UI continues to expose the existing **Choose folder** button. The implementation will make the button work when there is no Electron host and no server GUI.

Design:

- Keep `openFolderDialog()` as the web entrypoint from `HomeView.tsx`, `NewProjectPanel.tsx`, and in-project picker wiring.
- Extend the daemon folder-dialog contract so the web caller can distinguish:
  - native server dialog success: `{ path: string | null, mode: 'native' }`,
  - headless/server picker required: `{ path: null, mode: 'browse', roots: DirectoryRoot[] }`,
  - unavailable: `{ path: null, mode: 'unavailable', reason: string }`.
- Add a small daemon-backed directory browser used only when `/api/dialog/open-folder` reports `mode: 'browse'`. This is still the existing button flow; it is not a new visible capability or text input.
- Directory browsing roots are derived from configured server-side roots, primarily `OD_WORKING_DIR`. In Docker Compose this should point at the mounted workspace root, for example `/workspace/projects`.
- If `OD_WORKING_DIR` is not configured and the server is headless, the button surfaces an actionable error telling the user to configure a mounted working directory root.

Why not a text input:

- The user explicitly does not want a new text-input workflow.
- A daemon-backed browser preserves the existing picker mental model and avoids asking users to know container paths by memory.

Tradeoff:

- A server-side browser is more implementation than a text field, but it is the only way for the existing button to work reliably on a headless VPS without desktop UI tools.

### Decision 2: Remove desktop-auth from the working-dir replacement endpoint only

`POST /api/projects/:id/working-dir` becomes the web-safe privileged endpoint for replacing a project's working directory. It will no longer call `isDesktopAuthGateActive()`, `desktopAuthSecret()`, or `verifyDesktopImportToken()`.

Keep unchanged:

- `POST /api/projects` still rejects `metadata.baseDir`.
- `POST /api/import/folder` keeps its current desktop-auth gate because it is an import/trusted-picker flow outside this web-only fix.
- Existing filesystem validation stays in place.

Endpoint behavior:

1. Read `baseDir` from JSON body.
2. Require an absolute path.
3. Resolve with `fs.promises.realpath()`.
4. Require `lstat().isDirectory()`.
5. Reject filesystem root.
6. Reject `RUNTIME_DATA_DIR_CANONICAL` and its descendants.
7. Detect entry file.
8. Persist `metadata.baseDir`, `metadata.importedFrom = 'folder'`, `metadata.entryFile`.
9. Clear saved tabs with `setTabs(db, projectId, [], null)` as today.

The `fromTrustedPicker` metadata flag should no longer be set by this endpoint unless a legacy desktop token was actually accepted. Since this endpoint will not validate desktop tokens in this web-focused design, omit new `fromTrustedPicker` writes here.

Tradeoff:

- Removing the HMAC gate means the endpoint trusts same-origin web callers. This matches the deployment target and the user's explicit requirement. The remaining protections are origin checks, filesystem validation, and reverse-proxy/VPS auth. The daemon should document that internet-facing Docker deployments must be placed behind authentication or a trusted network boundary.

### Decision 3: Expose runtime working-dir configuration as read-only runtime config

`OD_WORKING_DIR` is environment/runtime state, not user preference. It should not be written through `PUT /api/app-config`.

Design:

- Add a small contract in `packages/contracts/src/api/runtime-config.ts` (or equivalent naming):

```ts
export interface RuntimeWorkingDirectoryConfig {
  defaultPath: string | null;
  exists: boolean;
  roots: Array<{ id: string; label: string; path: string; exists: boolean }>;
  pickerMode: 'native' | 'browse' | 'unavailable';
}

export interface RuntimeConfigResponse {
  workingDirectory: RuntimeWorkingDirectoryConfig;
}
```

- Add `GET /api/runtime-config` in the daemon.
- Resolve `OD_WORKING_DIR` with the same home/relative semantics used by daemon path helpers where practical, then canonicalize if it exists.
- The UI fetches this once at create-surface mount. If `defaultPath` exists, seed `workingDir` from it unless the user has already picked another folder.
- The existing button can browse inside the configured root when the native dialog is unavailable.

Alternative considered: extend `GET /api/app-config`.

- Rejected because app-config is persisted mutable user preferences; env-derived runtime defaults should be read-only and should not be echoed into the writable config file.

Tradeoff:

- Adds one internal HTTP contract, but keeps persisted config clean and gives the UI enough information to explain Docker misconfiguration.

---

## Working-directory data flow

### Create flow

```text
User clicks existing Choose folder
  -> HomeView/NewProjectPanel handlePickWorkingDir()
  -> openFolderDialog()
     -> native result OR daemon-backed browser result
  -> set workingDir state
User creates project
  -> POST /api/projects (without metadata.baseDir)
  -> if workingDir exists:
       POST /api/projects/:id/working-dir { baseDir: workingDir }
       on success: continue uploads/first run/navigation
       on failure: show error, do not upload staged files or auto-send prompt
```

`App.tsx` already has the right orchestration shape in the current tree: create first, then call `replaceProjectWorkingDir()` before staged uploads. The apply phase should verify this behavior, remove token assumptions from copy/comments, and ensure the same contract is used by every create entrypoint.

### In-project replacement flow

```text
Project view renders WorkingDirPicker
  -> onPickDirectory uses same openFolderDialog()
  -> replaceProjectWorkingDir(projectId, pickedPath)
  -> update local project state from response.project
  -> pushRecentLinkedDir(pickedPath)
  -> show error toast on failure
```

`WorkingDirPicker.tsx` remains presentational. The owner component wires persistence callbacks.

### Error handling

- If picking is cancelled: no state change.
- If picker is unavailable in headless Docker: show a specific error (`Configure OD_WORKING_DIR to a mounted directory in docker-compose.yml`).
- If post-create assignment fails: project remains created, but uploads and auto-send should be skipped and a toast should explain that the selected folder was not applied.
- If in-project replacement fails: preserve the previous `baseDir` and show the existing `workingDirPicker.replaceFailed` copy.

---

## Folder picker backend design

### Native mode

Keep the existing `openNativeFolderDialog()` implementation for environments where it works (macOS `osascript`, Linux `zenity`, Windows PowerShell). This preserves local development behavior.

### Browse mode for Docker/headless

Add daemon endpoints behind same-origin checks:

- `GET /api/dialog/folder-roots` returns configured browse roots.
- `GET /api/dialog/folder-children?path=<absolute>` returns child directories for a path contained in an allowed root.

Containment rules:

- Canonicalize roots with `realpath`.
- Canonicalize requested path.
- Requested path must equal a root or be a descendant of a root.
- Do not follow symlinks outside a root after `realpath`.
- Return directories only; no file names are needed for working-dir selection.
- Skip unreadable directories instead of failing the entire listing.

Root source:

- `OD_WORKING_DIR` is the primary root/default for Docker Compose.
- If absent, native mode may still work locally; if native mode is unavailable, return `mode: 'unavailable'`.

Tradeoff:

- Restricting browse roots means the picker will not expose the entire container filesystem. This is safer and encourages explicit Docker volume mounts. Users who need broader browsing can mount a broader root and set `OD_WORKING_DIR` accordingly.

---

## Plugin preview URL rewriting design

### Resource classification

Rename/extend the asset predicate in `plugin-asset-cache.ts`:

- Replace `CACHEABLE_MEDIA_EXT` with `CACHEABLE_PREVIEW_ASSET_EXT` or add `CACHEABLE_PREVIEW_ASSET_KIND` helpers.
- Supported classes:
  - image/media: current extensions and MIME types,
  - fonts: `.woff`, `.woff2`, `.ttf`, `.otf`,
  - CSS: `.css`, `text/css`, and Google Fonts CSS URLs,
  - JavaScript: `.js`, `.mjs`, `application/javascript`, `text/javascript`.

Do not support arbitrary HTML documents through `/api/asset-cache`.

### HTML rewrite rules

Update `rewritePluginAssetUrls(html, pluginId, baseDir)` in `server.ts`:

- Rewrite external `src`, `href`, and `poster` attributes when the URL is a supported preview asset.
- Remove `integrity` attributes from any `<link>` or `<script>` tag whose URL is rewritten.
- Remove `crossorigin` on rewritten tags unless preserving it is proven harmless; same-origin proxy requests do not need it.
- Specifically include:
  - `<link rel="stylesheet" href="https://...">`,
  - `<script src="https://..."></script>`,
  - `https://fonts.googleapis.com/css...`,
  - existing media attributes,
  - inline CSS `url(...)`,
  - quoted external URL string literals already handled today.

Implementation preference:

- Keep the existing regex-based targeted rewriter for this patch to avoid adding parser dependencies.
- Refactor into small helpers (`rewriteExternalPreviewAssetUrl`, `rewriteTagAttributes`) so tests can cover link/script integrity stripping.

Tradeoff:

- Regex HTML rewriting is imperfect. It is acceptable here because the current code already uses targeted regex rewriting and plugin previews are best-effort static documents. A full HTML parser would be more robust but increases dependency and review surface.

### CSS recursive rewrite rules

Add `rewriteCssAssetUrls(css: string, stylesheetUrl: URL): string` in `plugin-asset-cache.ts`.

It should rewrite:

- `url(https://...)`,
- `url('/relative/font.woff2')` resolved against the stylesheet URL,
- `@import url(...)`,
- `@import "..."`.

Only supported asset URLs are rewritten. Unsupported URLs are left as-is and will remain blocked by CSP.

Google Fonts flow:

```text
HTML link href=https://fonts.googleapis.com/css2?... 
  -> rewritten to /api/asset-cache?url=...
/api/asset-cache fetches CSS
  -> rewriteCssAssetUrls rewrites fonts.gstatic.com URLs to /api/asset-cache?url=...
Browser loads font files from same-origin cache
```

---

## Asset-cache proxy design

### Fetch safety

Preserve existing SSRF protections:

- only `http:` and `https:`,
- reject embedded credentials,
- reject localhost and `.localhost`,
- reject literal private/loopback/link-local IPs,
- keep connection-time DNS validation with `createValidatingLookup`,
- `redirect: 'error'`,
- GET only via the route.

### Type and size limits

Introduce per-kind limits instead of one 64 MiB ceiling for all types:

| Kind | Detection | Suggested limit | Returned content type |
|---|---|---:|---|
| image/audio/video | current extension or MIME | 64 MiB | upstream safe media MIME or extension guess |
| font | font extension or font MIME | 10 MiB | `font/woff2`, `font/woff`, `font/ttf`, `font/otf` |
| CSS | `.css`, `text/css`, Google Fonts URL | 2 MiB before rewrite | `text/css; charset=utf-8` |
| JavaScript | `.js`, `.mjs`, JS MIME | 5 MiB | `application/javascript; charset=utf-8` |

If URL extension and upstream content-type disagree, allow only safe combinations by kind. For example, a `.css` URL returning `text/html` is rejected.

### Cache content

- Store the transformed bytes for CSS (after recursive URL rewriting).
- Store original bytes for media/font/JS.
- Keep existing content-addressed cache key by raw URL. CSS transform is deterministic from raw URL, so the key remains valid.
- Continue writing sidecar metadata with content type.

Tradeoffs:

- Caching transformed CSS means if rewrite logic changes, stale cache entries may persist until cache eviction/manual clear. This is acceptable because the cache is local and immutable; if needed, include a cache version prefix in `assetCacheKey` for this change.
- Supporting JS increases preview fidelity but lets third-party static code execute inside the sandbox. The sandbox already allows scripts; the key boundary is that scripts remain inside the sandboxed iframe and external network remains blocked except same-origin safe routes.

---

## CSP design

Update both plugin preview HTML and plugin asset HTML CSP instances in `server.ts` to a shared constant, for example:

```ts
const PLUGIN_PREVIEW_CSP = [
  "default-src 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
].join('; ');
```

Also update comments that currently say previews have no network. The new invariant is: **no direct external network; same-origin proxy/cache reads only**.

Null-origin API guard update:

- Add `^/api/asset-cache$` to the safe GET allowlist for sandboxed iframe fetches if preview scripts fetch proxied resources programmatically.
- Keep mutating routes blocked for `Origin: null`.

Tradeoff:

- `connect-src 'self'` allows scripts in sandboxed previews to attempt same-origin API calls. The Express origin guard remains the enforcement boundary: sandboxed `Origin: null` requests are allowed only for explicit safe GET routes. This avoids direct internet fetch errors while preserving API protection.

---

## Composio config 403 design

Create an explicit safe public GET predicate in the `/api` origin middleware:

```ts
const PUBLIC_SAFE_GET_RE = /^\/api\/connectors\/composio\/config$/;
const NULL_ORIGIN_SAFE_GET_RE = /.../;
```

Middleware order:

1. Let live-artifact preview route handle its own stricter middleware.
2. If no `Origin`, allow.
3. If `GET` and `PUBLIC_SAFE_GET_RE.test(req.path)`, allow before `resolvedPort` is required.
4. If `Origin: null`, allow only `NULL_ORIGIN_SAFE_GET_RE` routes.
5. If `resolvedPort` is unavailable, fail closed for all remaining browser-origin API requests.
6. Run the existing allowed-origin checks.

`PUBLIC_SAFE_GET_RE` should initially contain only `GET /api/connectors/composio/config` unless tests prove another route needs the startup-safe behavior.

Do not change:

- `PUT /api/connectors/composio/config`,
- Composio config file storage,
- response shape from `readPublicComposioConfig()`.

Tradeoff:

- This makes one public secret-safe route available during startup to any browser origin. The route reveals only `configured` and `apiKeyTail`, so this is preferable to broad CORS relaxation or waiting on port resolution.

---

## `example-live-artifact` preview design

Add `plugins/_official/examples/live-artifact/index.html`.

Preview constraints:

- Self-contained HTML with inline CSS and inline JS only.
- No external dependencies; this preview should not depend on the new asset proxy to render.
- Show the live artifact concept: refreshable dashboard card, data source status, audit trail, and connector/local data labels.
- Keep `od.preview.entry: ./index.html` unchanged.

Add bundled preview audit test:

- Recursively scan `plugins/_official/**/open-design.json`.
- For each manifest with `od.preview.entry`, normalize and resolve the entry path under the plugin folder.
- Reject traversal and missing files.
- Require `.html` or `.htm` renderable preview asset.

Tradeoff:

- The audit does not generate previews for plugins that lack `od.preview.entry`; it only prevents broken explicit declarations from shipping.

---

## File changes

### Daemon

- `apps/daemon/src/import-export-routes.ts`
  - Remove desktop-auth branch from `POST /api/projects/:id/working-dir`.
  - Update comments to describe web-only direct assignment and retained filesystem validations.
  - Preserve token gate in `POST /api/import/folder`.

- `apps/daemon/src/server.ts`
  - Add runtime config route or register a small runtime config route module.
  - Add/adjust folder dialog browse-mode routes if implemented in the monolith.
  - Extend `rewritePluginAssetUrls`.
  - Use shared `PLUGIN_PREVIEW_CSP` including `font-src` and `connect-src 'self'`.
  - Add `/api/asset-cache` to null-origin safe GET allowlist if needed.
  - Add public safe GET bypass for `GET /api/connectors/composio/config` before `resolvedPort` guard.

- `apps/daemon/src/plugin-asset-cache.ts`
  - Add resource classification helpers.
  - Add font/CSS/JS MIME support.
  - Add CSS recursive URL rewriting.
  - Add per-kind size limits and tests.

- `plugins/_official/examples/live-artifact/index.html`
  - New self-contained preview.

### Contracts

- `packages/contracts/src/api/runtime-config.ts` (new) and `packages/contracts/src/index.ts`
  - Export `RuntimeConfigResponse` and related working-directory config types.

No contract change is needed for `ReplaceProjectWorkingDirRequest`; it already accepts `{ baseDir: string }`.

### Web

- `apps/web/src/providers/registry.ts`
  - Extend `openFolderDialog()` to handle native/browse/unavailable responses.
  - Add `fetchRuntimeConfig()` and folder-browse helpers if using a modal fallback.
  - Keep `replaceProjectWorkingDir(projectId, baseDir, desktopImportToken?)`; token parameter can stay optional for compatibility but web-only callers pass none.

- `apps/web/src/components/HomeView.tsx`
  - Keep the existing button.
  - Seed `workingDir` from runtime config when `OD_WORKING_DIR` exists and user has not picked a different folder.
  - Update comments/error copy away from desktop token assumptions for web-only path.

- `apps/web/src/components/NewProjectPanel.tsx`
  - Keep the existing button.
  - Use the same picker helper and runtime default.
  - Continue passing `metadata.userWorkingDir` so `App.tsx` can perform the post-create handoff.

- In-project owner of `WorkingDirPicker.tsx`
  - Wire `onPickDirectory` and `onSelectRecent` to `replaceProjectWorkingDir()` and update project state from the response.
  - `WorkingDirPicker.tsx` itself remains presentational.

### Tests

- `apps/daemon/tests/working-dir-route.test.ts` (new or existing suitable file)
  - Valid web-only replacement without token succeeds.
  - Missing path, non-directory, root, and data-dir descendants are rejected without mutating metadata.
  - `POST /api/projects` still rejects direct `metadata.baseDir`.
  - `POST /api/import/folder` still enforces existing desktop-auth behavior.

- `apps/daemon/tests/plugin-asset-cache.test.ts`
  - Predicate accepts fonts/CSS/JS/Google Fonts CSS and still rejects HTML/non-http/private URLs.
  - CSS responses recursively rewrite `url(...)` to `/api/asset-cache`.
  - Per-kind limits and content-type mismatches reject.
  - SSRF tests continue passing.

- `apps/daemon/tests/plugins-preview-route.test.ts`
  - Preview CSP includes `font-src 'self' data:` and `connect-src 'self'`.
  - External stylesheet/script/font URLs are rewritten.
  - Rewritten link/script tags have `integrity` stripped.
  - Direct unsupported external URLs remain direct and blocked by CSP.

- `apps/daemon/tests/connectors-origin-guard.test.ts` (or existing connector route test)
  - Simulate `resolvedPort` unset and browser-origin GET to `/api/connectors/composio/config`; expect 200 and public shape.
  - Verify PUT remains protected.

- `apps/daemon/tests/plugins-bundled-preview-audit.test.ts`
  - Bundled preview entries exist and are renderable HTML.
  - `example-live-artifact` preview route returns 200 after install/registry setup or audit validates the file directly.

- `apps/web` tests
  - Create flow calls `replaceProjectWorkingDir()` after `createProject()` when workingDir is set.
  - Assignment failure displays error and skips staged upload/auto-send.
  - Existing button path handles browse/unavailable states without adding a text input.

---

## Rollout and validation

1. Land daemon route/security tests first (red/green where practical).
2. Implement working-dir endpoint and UI wiring.
3. Extend asset cache and CSP tests.
4. Add live artifact preview and bundled audit.
5. Validate with:
   - `pnpm --filter @open-design/daemon test`
   - `pnpm --filter @open-design/web test`
   - `pnpm --filter @open-design/web typecheck`
   - final readiness: `pnpm guard` and `pnpm typecheck`
6. For Docker manual verification:
   - mount a host directory into the container,
   - set `OD_WORKING_DIR` to that mounted path,
   - create a project via the existing Choose folder button,
   - confirm project `resolvedDir`/Design Files point at the mounted path,
   - browse community previews and confirm no repeated CSP console flood for supported static assets.

---

## Open implementation notes

- The current tree already shows create-then-working-dir handoff logic in `App.tsx`. Apply should verify whether this is committed/current or a partial prior change, then align tests and copy with the final web-only design.
- `server.ts` and `media-routes.ts` both contain `/api/dialog/open-folder` style code paths in the current tree. Apply should update the active registered path(s) consistently or consolidate to one route owner to avoid behavior drift.
- Memory persistence was not available to this subagent; the design is persisted as this OpenSpec artifact only.
