# SDD Init: Fix working directory, CSP, and preview errors

**SDD Change**: `fix-working-dir-csp-and-preview-errors`  
**Created**: 2026-06-12  
**Mode**: interactive  
**Artifact store**: OpenSpec  
**PR strategy**: single-pr  
**Status**: initialized

## Requested problem set

Fix the root causes for four user-visible failures in Open Design:

1. The working-directory selection UI exists but does not work reliably: the input/button is unresponsive or the selection does not persist.
2. Browsing community projects produces massive browser DevTools errors because sandboxed plugin preview CSP blocks external stylesheets, images, media, scripts, fonts, frames, and fetch/connect requests.
3. `GET /api/connectors/composio/config` returns 403 in the affected browsing flow.
4. `GET /api/plugins/example-live-artifact/preview` returns 404.

## Project context confirmed

- Monorepo workspace from `pnpm-workspace.yaml`: `apps/*`, `packages/*`, `tools/*`, and `e2e`.
- Runtime baseline from root `package.json`: Node `~24`, `pnpm@10.33.2`, TypeScript ESM.
- Primary apps in scope:
  - `apps/web`: Next.js 16 + React 18 client runtime.
  - `apps/daemon`: Express 5 + SQLite daemon that owns `/api/*`, plugin preview routes, connector routes, import/working-dir routes, and `od` CLI.
  - `apps/desktop`: Electron shell providing native folder picker and desktop-auth token bridge for working-directory flows.
- Repository conventions in scope:
  - Tests live under app/package `tests/` directories, not under `src/`.
  - Web/daemon shared DTO changes belong in `packages/contracts` if request/response shapes change.
  - User-facing capabilities generally require both web UI and `od` CLI reachability, but these issues appear to be fixes to existing surfaces rather than new capabilities.

## SDD/testing configuration confirmed

`openspec/config.yaml` already exists and was left intact.

Current SDD config summary:

- `strict_tdd: true`.
- Proposal phase requires a problem statement.
- Spec phase requires acceptance criteria.
- Design phase requires tradeoffs.
- Tasks phase protects review workload.
- Apply/verify test command configured as `pnpm run vitest`.
- Detected test layers include Vitest, Testing Library, Playwright, and package/app typecheck commands.
- Root quality commands from repository guidance remain important before readiness: `pnpm guard`, `pnpm typecheck`, plus package-scoped tests matching touched files.

## Initial affected areas to investigate in the proposal/spec phases

### Working-directory selection

Likely surfaces and trust boundary:

- `apps/web/src/components/HomeView.tsx` — home working-dir picker state and host-vs-browser picker branch.
- `apps/web/src/components/NewProjectPanel.tsx` — new project working-dir button and token threading.
- `apps/web/src/components/WorkingDirPicker.tsx` — reusable picker menu trigger/actions.
- `apps/web/src/providers/registry.ts` — `POST /api/projects/:id/working-dir` caller.
- `apps/daemon/src/import-export-routes.ts` — `POST /api/projects/:id/working-dir`, desktop-auth token validation, `metadata.baseDir` update.
- `apps/desktop/src/main/runtime.ts` and `apps/desktop/src/main/preload.cts` — native folder picker IPC, token minting, and renderer bridge.

Important root-cause constraint: desktop-auth is intentionally HMAC-gated. A fix must not bypass the trusted picker/token model just to make selection appear to work.

### Sandboxed plugin preview CSP and asset loading

Likely surfaces:

- `apps/daemon/src/server.ts`:
  - Plugin HTML preview route: `GET /api/plugins/:id/preview`.
  - Plugin asset route CSP currently includes `default-src 'none'`, `connect-src 'none'`, and same-origin-only resource directives.
  - `/api/asset-cache` exists as a same-origin cache/proxy for external media referenced by preview HTML.
- Existing daemon plugin-preview tests under `apps/daemon/tests/` should be extended before relaxing or redesigning CSP behavior.

Root-cause direction for later phases: avoid a superficial blanket CSP disable. The design should preserve iframe isolation and SSRF protections while deciding which preview resources should be proxied, rewritten, allowed, or blocked intentionally.

### Composio config 403

Likely surfaces:

- `apps/daemon/src/connectors/routes.ts`: `GET /api/connectors/composio/config` returns public config (`configured`, `apiKeyTail`) and should not expose secrets.
- `apps/daemon/src/server.ts`: `/api` origin guard has a null-origin safe GET allowlist that includes `/api/connectors/composio/config`.

Root-cause direction for later phases: determine whether the 403 comes from Origin handling, desktop/web port mismatch, sandbox iframe `Origin: null`, auth gate interaction, route ordering, or a different caller/context. Preserve the no-secret public shape.

### Plugin preview 404

Likely surfaces:

- `apps/daemon/src/server.ts`: `GET /api/plugins/:id/preview` uses installed plugin lookup and candidate discovery.
- `apps/daemon/tests/plugins-preview-route.test.ts`, `plugins-preview-fallback.test.ts`, and related plugin asset tests.

Root-cause direction for later phases: determine whether `example-live-artifact` is missing from the installed/bundled plugin registry, candidate discovery misses its preview entrypoint, or the UI should not request a preview for that plugin ID.

## Next phase recommendation

Proceed to `sdd-proposal` for this change only. In interactive mode, ask a short proposal question round before writing the proposal if product/security tradeoffs remain unclear, especially around CSP posture for community previews.
