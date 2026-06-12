# Tasks: Web deployment reliability fixes

**Change:** `fix-working-dir-csp-and-preview-errors`  
**Phase:** SDD tasks  
**Strict TDD:** true  
**Deployment target:** web-only Docker Compose on VPS

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900–1150 |
| 400-line budget risk | **High** |
| Chained PRs recommended | **Yes** |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

```
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

### Split rationale

| PR | Areas | Est. lines | Scope |
|----|-------|-----------|-------|
| **PR 1** | Working dir (daemon endpoint, runtime config, folder browse, web UI wiring) | 380–440 | Self-contained: daemon tests pass independently. UI wires to daemon APIs that PR 1 builds. |
| **PR 2** | CSP/asset-cache rewrite extension (resource classification, CSS recursive rewrite, HTML rewrite rules, CSP headers) | 380–450 | Depends on PR 1 only for the shared CSP constant location in server.ts. Stack on PR 1. |
| **PR 3** | Composio 403 + `example-live-artifact` preview 404 + bundled audit | 140–200 | Independent of PR 1/PR 2. Can land in any order but listed last due to size. |

---

## PR 1: Working directory (web-only)

### Task 1.1 — RED: Working-dir endpoint rejects invalid paths (daemon test)

**Files:** `apps/daemon/tests/working-dir-route.test.ts` (new)

**What:** Write Vitest tests for `POST /api/projects/:id/working-dir` that exercise the endpoint's filesystem validations. All tests start RED because the endpoint currently requires a desktop-auth token that this test won't provide, or the tests explicitly target the no-token path after the implementation.

Test scenarios:
- Missing `baseDir` → 400 BAD_REQUEST
- `baseDir` not a string → 400
- Path does not exist → 400 "folder not found"
- Path is a file, not a directory → 400 "path must be a directory"
- Path is filesystem root (`/`) → 400 "cannot point at the filesystem root"
- Path is inside daemon data directory → 400 "cannot point at the data directory"

**Dependencies:** none  
**Review impact:** ~60 lines

### Task 1.2 — GREEN: Remove desktop-auth gate from working-dir endpoint

**Files:** `apps/daemon/src/import-export-routes.ts` (lines 106–215)

**What:** Remove the `isDesktopAuthGateActive()` / `desktopAuthSecret()` / `verifyDesktopImportToken()` block from `POST /api/projects/:id/working-dir`. The endpoint should accept `{ baseDir }` directly with filesystem validations only.

Keep unchanged:
- `POST /api/projects` still rejects direct `metadata.baseDir` writes
- `POST /api/import/folder` retains full desktop-auth gate
- All filesystem validations (`realpath`, `lstat`, root check, data-dir check)
- `metadata.importedFrom = 'folder'`, entry file detection, tab clearing

Remove: `fromTrustedPicker` flag set (only set when token was validated, which no longer happens).

**Dependencies:** Task 1.1 (RED test exists first)  
**Review impact:** ~50 lines removed, ~10 lines changed

### Task 1.3 — GREEN: Verify working-dir assignment succeeds without token

**Files:** `apps/daemon/tests/working-dir-route.test.ts`

**What:** Add test case: `POST /api/projects/:id/working-dir` with a valid `baseDir` succeeds without any `x-od-desktop-import-token` header, and the project metadata reflects the assigned directory.

Also add regression test: `POST /api/projects` still rejects direct `metadata.baseDir` in the creation payload.

**Dependencies:** Task 1.2  
**Review impact:** ~40 lines

### Task 1.4 — RED: Runtime config endpoint contract (contracts + daemon test)

**Files:**
- `packages/contracts/src/api/runtime-config.ts` (new)
- `packages/contracts/src/index.ts` (add export)
- `apps/daemon/tests/runtime-config-route.test.ts` (new)

**What:** Define the `RuntimeWorkingDirectoryConfig` and `RuntimeConfigResponse` types. Write a daemon test that asserts `GET /api/runtime-config` returns the expected shape when `OD_WORKING_DIR` is set vs unset.

**Dependencies:** none  
**Review impact:** ~40 lines

### Task 1.5 — GREEN: Implement GET /api/runtime-config

**Files:** `apps/daemon/src/server.ts` (add route near other config routes)

**What:** Add `GET /api/runtime-config` endpoint that:
- Reads `OD_WORKING_DIR` from `process.env`
- Resolves with `expandHomePrefix` and `fs.promises.realpath()` if the path exists
- Returns `{ workingDirectory: { defaultPath, exists, roots, pickerMode } }`
- `pickerMode` is `'native'` when OS GUI tools are available, `'browse'` when headless but `OD_WORKING_DIR` is configured, `'unavailable'` when neither

**Dependencies:** Task 1.4  
**Review impact:** ~50 lines

### Task 1.6 — RED: Folder browse endpoints test (daemon)

**Files:** `apps/daemon/tests/folder-dialog-route.test.ts` (new)

**What:** Write tests for the daemon-backed directory browser:
- `GET /api/dialog/folder-roots` returns roots from `OD_WORKING_DIR`
- `GET /api/dialog/folder-children?path=<root>` returns child directories
- Path outside roots → rejected with 403
- Symlink escaping root → rejected
- Unreadable directories → skipped gracefully

**Dependencies:** none (tests with supertest against Express app)  
**Review impact:** ~60 lines

### Task 1.7 — GREEN: Implement folder browse endpoints

**Files:** `apps/daemon/src/server.ts`

**What:** Add two routes behind same-origin checks:
- `GET /api/dialog/folder-roots` — returns roots derived from `OD_WORKING_DIR`
- `GET /api/dialog/folder-children?path=<absolute>` — lists subdirectories within the root, with containment checks using `realpath`

Containment rules per design: canonicalize both root and requested path, reject if requested path is not equal to root or a descendant, reject symlinks that escape outside root, return directories only.

**Dependencies:** Task 1.6  
**Review impact:** ~70 lines

### Task 1.8 — RED: Web UI create flow orchestration test

**Files:** `apps/web/tests/create-flow.test.ts` or existing create-flow test file

**What:** Write test asserting that when `workingDir` state is set before `createProject()`, the create flow calls `replaceProjectWorkingDir()` after project creation succeeds. And on failure, surfaces error and does not proceed with staged uploads/auto-send.

**Dependencies:** none (can mock daemon API)  
**Review impact:** ~50 lines

### Task 1.9 — GREEN: Wire UI create flow to call POST working-dir post-create

**Files:**
- `apps/web/src/components/HomeView.tsx` — seed `workingDir` from runtime config default
- `apps/web/src/components/NewProjectPanel.tsx` — same seeding
- `apps/web/src/providers/registry.ts` — extend `openFolderDialog()` to handle `browse`/`unavailable` modes; ensure `replaceProjectWorkingDir()` passes no token

**What:** 
- Fetch `GET /api/runtime-config` on mount; seed `workingDir` from `defaultPath` if user hasn't picked a different folder
- After `createProject()` returns, call `replaceProjectWorkingDir(projectId, baseDir)` (no token)
- On failure: show error toast, skip staged uploads and auto-send
- `openFolderDialog()` must handle native/browse/unavailable, falling back to daemon-backed browser modal when needed
- Remove desktop token assumptions from error copy

**Dependencies:** Tasks 1.5, 1.7  
**Review impact:** ~80 lines

### Task 1.10 — GREEN: Wire in-project WorkingDirPicker to API

**Files:**
- `apps/web/src/components/WorkingDirPicker.tsx` — unchanged (presentational)
- Caller component (in-project view that renders WorkingDirPicker) — wire `onPickDirectory` and `onSelectRecent` callbacks

**What:** The owner component that renders `WorkingDirPicker` must:
- `onPickDirectory` → `replaceProjectWorkingDir(projectId, pickedPath)` → update local project state from response → `pushRecentLinkedDir(pickedPath)`
- `onSelectRecent` → same as above
- Show error toast on failure

**Dependencies:** Task 1.9  
**Review impact:** ~30 lines

---

## PR 2: Plugin preview CSP and asset loading

### Task 2.1 — RED: Asset classification tests (daemon)

**Files:** `apps/daemon/tests/plugin-asset-cache.test.ts` (extend existing)

**What:** Test the new asset classification helpers:
- Font extensions (`.woff`, `.woff2`, `.ttf`, `.otf`) are recognized as cacheable
- CSS extension (`.css`) is recognized as cacheable
- JS extension (`.js`, `.mjs`) is recognized as cacheable
- Google Fonts CSS URLs (`fonts.googleapis.com/css2?...`) are recognized as cacheable
- `.html` files are NOT cacheable
- Non-http(s) URLs are rejected
- Private/localhost IPs are rejected (existing SSRF tests continue passing)

**Dependencies:** none (unit tests on pure predicate functions)  
**Review impact:** ~70 lines

### Task 2.2 — GREEN: Extend resource classification in plugin-asset-cache.ts

**Files:** `apps/daemon/src/plugin-asset-cache.ts`

**What:**
- Rename `CACHEABLE_MEDIA_EXT` to `CACHEABLE_PREVIEW_ASSET_EXT` (keep old as alias) and extend regex to include `.woff`, `.woff2`, `.ttf`, `.otf`, `.css`, `.js`, `.mjs`
- Add `classifyAssetKind(url: string): 'image' | 'media' | 'font' | 'css' | 'js' | null` helper
- Add `MAX_ASSET_SIZE_BY_KIND` map: images/media 64 MiB, fonts 10 MiB, CSS 2 MiB, JS 5 MiB
- Add `resolveContentTypeByKind(kind, upstreamContentType, ext): string` for font/CSS/JS content-type resolution
- Extend `EXT_TO_MIME` with font entries: `.woff`→`font/woff`, `.woff2`→`font/woff2`, `.ttf`→`font/ttf`, `.otf`→`font/otf`
- `isCacheableExternalUrl()` must also match Google Fonts CSS URLs

**Dependencies:** Task 2.1  
**Review impact:** ~80 lines

### Task 2.3 — RED: CSS recursive rewrite tests

**Files:** `apps/daemon/tests/plugin-asset-cache.test.ts` (extend)

**What:** Test `rewriteCssAssetUrls(css, stylesheetUrl)`:
- `url(https://cdn.example.com/font.woff2)` → `url(/api/asset-cache?url=...)`
- `url('/relative/font.woff2')` → resolved against stylesheet base and rewritten
- `@import url(https://...)` → rewritten
- `@import "https://..."` → rewritten
- Non-cacheable URLs left untouched
- Multiple `url()` references in one CSS all rewritten
- CSS without any external URLs returned as-is

**Dependencies:** none (unit test on exported function)  
**Review impact:** ~60 lines

### Task 2.4 — GREEN: Implement CSS recursive URL rewriting

**Files:** `apps/daemon/src/plugin-asset-cache.ts`

**What:** Add `rewriteCssAssetUrls(css: string, stylesheetBaseUrl: URL): string` exported function:
- Match `url(...)` with optional quotes
- Resolve relative URLs against `stylesheetBaseUrl`
- Rewrite cacheable URLs to `/api/asset-cache?url=...`
- Match `@import url(...)` and `@import "..."` 
- Leave non-cacheable URLs untouched
- Return rewritten CSS string

**Dependencies:** Tasks 2.1, 2.2, 2.3  
**Review impact:** ~50 lines

### Task 2.5 — GREEN: Apply per-kind limits in asset cache fetch

**Files:** `apps/daemon/src/plugin-asset-cache.ts`

**What:** In `fetchAndStore()`:
- Classify the URL kind before fetching
- Use `MAX_ASSET_SIZE_BY_KIND[kind]` instead of single `maxBytes`
- For CSS: after fetching, call `rewriteCssAssetUrls()` to rewrite nested URLs, then store the transformed bytes
- For media/font/JS: store original bytes
- Add content-type mismatch rejection: if URL extension says `.css` but upstream returns `text/html`, reject with 400
- Update comment in `get()` about the guard (currently "url is not a cacheable external media url" → "url is not a cacheable preview asset")

**Dependencies:** Tasks 2.2, 2.4  
**Review impact:** ~50 lines

### Task 2.6 — RED: HTML rewrite extension tests (daemon)

**Files:** `apps/daemon/tests/plugins-preview-route.test.ts` (extend existing)

**What:** Test `rewritePluginAssetUrls` behavior:
- `<link rel="stylesheet" href="https://cdn.example.com/site.css">` → rewritten to `/api/asset-cache?url=...`
- `<script src="https://cdn.example.com/app.js">` → rewritten to `/api/asset-cache?url=...`
- `<link href="https://fonts.googleapis.com/css2?...">` → rewritten
- `integrity` attribute stripped from rewritten `<link>` and `<script>` tags
- Existing media (`src`, `poster`) rewrites still work
- Inline CSS `url(...)` rewrites still work
- JS string literal rewrites still work
- Direct unsupported external URLs remain untouched (and will be blocked by CSP)

**Dependencies:** none (can test the exported function directly)  
**Review impact:** ~80 lines

### Task 2.7 — GREEN: Extend rewritePluginAssetUrls for CSS, JS, fonts

**Files:** `apps/daemon/src/server.ts` (function `rewritePluginAssetUrls`, lines 8036–8111)

**What:** Extend the three replace passes in `rewritePluginAssetUrls`:
1. **Attribute pass:** Remove the `!/\bhref\b/i.test(String(attr))` guard so external `href` values are rewritten when cacheable. This covers `<link href="https://...">` for CSS and Google Fonts.
2. **Quoted string pass:** Already rewrites cacheable URLs. No change needed (new `isCacheableExternalUrl` already covers fonts/CSS/JS).
3. **CSS `url()` pass:** Already rewrites cacheable URLs. No change needed.

Additionally:
- Strip `integrity` attribute from any `<link>` or `<script>` tag whose `href`/`src` was rewritten to an asset-cache URL
- Strip `crossorigin` attribute from rewritten tags

Refactor into small helpers: `rewriteExternalPreviewAssetUrl`, `stripIntegrityFromRewrittenTags` so they can be unit-tested.

**Dependencies:** Task 2.6  
**Review impact:** ~60 lines

### Task 2.8 — RED: CSP header update test

**Files:** `apps/daemon/tests/plugins-preview-route.test.ts` (extend)

**What:** Test that the CSP header on plugin preview HTML responses includes:
- `font-src 'self' data:` (NEW)
- `connect-src 'self'` (was `connect-src 'none'`)
- All existing directives preserved

Test both the preview route (`servePluginSandboxedHtml`) and the asset route (`/api/plugins/:id/asset/*`).

**Dependencies:** none  
**Review impact:** ~30 lines

### Task 2.9 — GREEN: Update CSP headers in server.ts

**Files:** `apps/daemon/src/server.ts`

**What:**
- Define a shared `PLUGIN_PREVIEW_CSP` constant near the top of the file (or near the preview functions):
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
- Replace both CSP string literals (in `servePluginSandboxedHtml` around line 7982 AND in the asset route around line 8309) with `PLUGIN_PREVIEW_CSP`
- Update comments from "no network" to "no direct external network; same-origin proxy/cache reads only"
- Add `/api/asset-cache` to `_NULL_ORIGIN_SAFE_GET_RE` regex so sandboxed iframes can fetch proxied resources

**Dependencies:** Task 2.8  
**Review impact:** ~20 lines

---

## PR 3: Composio config 403 + example-live-artifact preview

### Task 3.1 — RED: Composio origin guard test (daemon)

**Files:** `apps/daemon/tests/connectors-origin-guard.test.ts` (new or extend existing)

**What:** Test that `GET /api/connectors/composio/config`:
- Returns 200 with `{ configured, apiKeyTail }` when `resolvedPort` is NOT set but a browser origin is present (simulate startup race)
- Returns 200 when `Origin: null` (sandboxed iframe)
- Does NOT expose the full API key
- `PUT /api/connectors/composio/config` still requires local-daemon protection (existing behavior, regression test)

**Dependencies:** none  
**Review impact:** ~50 lines

### Task 3.2 — GREEN: Fix composio config 403 in origin middleware

**Files:** `apps/daemon/src/server.ts` (CORS/origin middleware, lines 5058–5093)

**What:** Reorder the middleware checks:
1. Live-artifact preview bypass (unchanged)
2. No `Origin` → allow (unchanged)
3. **NEW:** If `GET` and `PUBLIC_SAFE_GET_RE.test(req.path)` → allow (before `resolvedPort` check). Define `PUBLIC_SAFE_GET_RE = /^\/api\/connectors\/composio\/config$/`.
4. `Origin: null` → allow only `_NULL_ORIGIN_SAFE_GET_RE` routes (unchanged)
5. If `!resolvedPort` → 403 for remaining routes (unchanged)
6. Allowed origin checks (unchanged)

Do NOT change:
- `PUT /api/connectors/composio/config` (still behind `requireLocalDaemonRequest`)
- Composio config storage or response shape

**Dependencies:** Task 3.1  
**Review impact:** ~15 lines

### Task 3.3 — RED: Bundled plugin preview audit test

**Files:** `apps/daemon/tests/plugins-bundled-preview-audit.test.ts` (new)

**What:** Write an audit test that:
- Recursively scans `plugins/_official/**/open-design.json`
- For each manifest with `od.preview.entry`, resolves the path under the plugin folder
- Asserts the file exists, is a regular file, and has `.html` or `.htm` extension
- Specifically asserts `example-live-artifact` has a valid preview entry that resolves

**Dependencies:** none (runs against filesystem)  
**Review impact:** ~40 lines

### Task 3.4 — GREEN: Add example-live-artifact preview HTML

**Files:**
- `plugins/_official/examples/live-artifact/index.html` (new)
- `plugins/_official/examples/live-artifact/open-design.json` (unchanged if `od.preview.entry` is already correct)

**What:** Create a self-contained `index.html` with:
- Inline CSS and inline JS only (no external dependencies)
- Demonstrates the live artifact concept: a refreshable dashboard card mockup showing data source status, audit trail entries, and connector/local data labels
- Semantic HTML, clean layout using CSS Grid or Flexbox
- Includes a visual refresh button (non-functional, just demonstrates the concept)
- No dependencies on the new asset proxy (works standalone)

**Dependencies:** Task 3.3 (test goes RED first)  
**Review impact:** ~80 lines

---

## Cross-cutting tasks (apply to any PR)

### Task X.1 — Typecheck and guard

After each PR:
```bash
pnpm guard
pnpm typecheck
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/web test
pnpm --filter @open-design/web typecheck
```

### Task X.2 — Integration manual verification

For PR 1 (working dir):
- Mount a host directory into the Docker container
- Set `OD_WORKING_DIR` to that mounted path
- Create a project via the existing "Choose folder" button
- Confirm project `resolvedDir` points at the mounted path

For PR 2 (CSP):
- Browse community plugin previews
- Confirm no repeated CSP console flood for fonts, CSS, media, images, scripts
- Confirm Google Fonts previews render correctly
- Confirm SSRF protections still work (reject private IPs)

For PR 3 (composio + plugin):
- Confirm composio config GET returns 200 during any daemon lifecycle state
- Confirm `example-live-artifact` preview renders HTML in the marketplace detail view

---

## Task dependency graph

```
PR 1:
  1.1 (test) ──► 1.2 (impl) ──► 1.3 (test)
  1.4 (test+contract) ──► 1.5 (impl)
  1.6 (test) ──► 1.7 (impl)
  1.8 (web test) ──► 1.9 (web impl) ──► 1.10 (picker wiring)
                         ▲
  1.5, 1.7 ──────────────┘

PR 2:
  2.1 (test) ──► 2.2 (impl) ──► 2.5 (per-kind limits)
  2.3 (test) ──► 2.4 (impl) ──┘
  2.6 (test) ──► 2.7 (impl)
  2.8 (test) ──► 2.9 (impl)
  (2.2, 2.4 needed for 2.5, 2.7)

PR 3:
  3.1 (test) ──► 3.2 (impl)
  3.3 (test) ──► 3.4 (impl)
```

---

## Rollback per PR

| PR | Rollback |
|----|----------|
| PR 1 | Revert the desktop-auth removal in `POST /api/projects/:id/working-dir`. Remove runtime config route and folder browse endpoints. Remove web post-create wiring. |
| PR 2 | Revert `rewritePluginAssetUrls` changes, `PLUGIN_PREVIEW_CSP` constant, asset-cache extension. Restore old `CACHEABLE_MEDIA_EXT`. |
| PR 3 | Revert origin middleware reorder. Remove `example-live-artifact/index.html`. |
