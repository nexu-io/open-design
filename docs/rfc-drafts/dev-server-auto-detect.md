# RFC: Auto-detect & launch dev server for folder-imported projects

**Status:** Draft (for nexu-io/open-design Issue, post #597 merge)
**Author:** @infinity-nft
**Related:** #597 (folder import — single mode)

## Summary

When a user imports an existing local folder as a project (#597), the
folder is often a real frontend project (Next.js / Vite / CRA / Astro /
plain `npm run dev`). Currently OD opens such projects as a static file
panel — the user has to launch the dev server themselves in another
terminal and then iframe-load it manually.

This RFC proposes letting OD detect a dev-server config from the
imported folder's `package.json` and offer to launch it inline, so the
preview pane shows the live app instead of static HTML.

## Problem

After landing #597, the user picks `~/projects/marketing-site/` (a
Next.js app). What they see in OD's preview pane:

- File panel with `next.config.js`, `pages/index.tsx`, etc.
- No way to render the app — it needs `next dev` running on port 3000.

What they want:

- Click "Open folder" → OD detects `next dev` script → asks "Launch
  dev server?" → preview pane shows the live app at localhost:3000
  inside the iframe.

This is the bridge that makes folder-import useful for real workflows
(generating components, iterating on UI), not just static HTML.

## Proposed behavior

### Detection (no new endpoint, runs at import time)

The import endpoint scans `<baseDir>/package.json` (and a few common
subdirs: `frontend/`, `client/`, `web/`, `app/`, `packages/web/`) for
a runnable script:

1. `pkg.scripts.dev` if present, else `pkg.scripts.start`
2. Extract a port from `--port N` / `-p N` flags in the script string
3. Fall back to framework defaults: `next` → 3000, `vite` → 5173,
   `react-scripts` → 3000, `astro` → 4321
4. Detect package manager from lockfiles (`pnpm-lock.yaml` → pnpm,
   `yarn.lock` → yarn, default → npm)

If detected, stamp `metadata.devServer = { script, cwd, port }` on the
project at import time. Otherwise no devServer field — project behaves
exactly as a static file panel.

### Launching (lifecycle endpoints)

- `POST /api/projects/:id/dev-server/start` — spawn the configured
  script via `pkg-manager run dev-script` in `<baseDir>/<cwd>`. Track
  the child process in an in-memory map keyed by project id.
- `POST /api/projects/:id/dev-server/stop` — kill the tracked child.
- Daemon `process.on('exit')` / SIGINT / SIGTERM kills all running
  dev servers on shutdown.

The endpoint waits for the configured port to respond (with a 30 s
timeout) before resolving, so the UI can show a clear "starting…" /
"ready" / "failed" state.

### UI

- New project section / Project view: when `metadata.devServer` is
  set, render the preview pane as an iframe pointed at
  `http://localhost:${devServer.port}` (auto-started on project open).
- Toolbar gets `Stop` / `Start` symmetric controls (when stopped, file
  panel + a banner with Start button; when running, iframe + Stop).
- No devServer config detected → behaves like today (file panel only).

## Open questions

1. **Permission model** — running `npm install` + `npm run dev` on a
   user folder is more privileged than reading files. Should OD prompt
   on first launch ("This folder will run `pnpm dev` — proceed?") with
   per-project consent, similar to VS Code's "trust" prompt?
2. **Auto-install missing dependencies** — if `node_modules` is missing,
   should OD offer to run `pnpm install` first? Or fail clearly and let
   the user run it themselves?
3. **Port conflicts** — if 3000 is taken, should OD pick the next free
   port, or refuse and surface the conflict? Vite has its own
   auto-increment; matching that would be least surprising.
4. **Resource cleanup on project close** — kill the dev server when the
   user navigates away, or keep it running until daemon shutdown? VS
   Code keeps tasks alive; closing == background. Mirroring that feels
   right.
5. **Subprocess output streaming** — should the daemon stream the dev
   server's stdout/stderr to the UI (so users see Next/Vite errors
   inline) or just spawn detached?
6. **Non-folder projects** — current OD generates HTML files in
   `.od/projects/<id>/`. Should those projects also get a "launch dev
   server" affordance if they happen to have a `package.json`? Or is
   this strictly a folder-import feature?

## Implementation notes (from working prototype)

I have this implemented in my fork — same single-mode philosophy as
#597 (no two paths, no opinions about git). Detection logic is ~30
lines, lifecycle endpoints + child-process registry ~80 lines, UI
wiring ~100 lines. Happy to adapt to whichever direction the design
discussion lands.

## Out of scope

- HMR support (dev servers handle their own HMR; OD just iframes)
- Production builds (`pnpm build` is the user's concern)
- Custom proxy / rewrites between OD daemon and dev server
- Authenticated dev servers (e.g. behind a login)
