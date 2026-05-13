# Architecture

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`skills-protocol.md`](skills-protocol.md) · [`agent-adapters.md`](agent-adapters.md) · [`modes.md`](modes.md)

This doc describes the system topology, runtime modes, data flow, and file layout. Design rationale lives in [`spec.md`](spec.md); protocol details for skills and agent adapters live in their own docs.

[ocod]: https://github.com/OpenCoworkAI/open-codesign
[acd]: https://github.com/VoltAgent/awesome-claude-design
[piai]: https://github.com/badlogic/pi-mono/tree/main/packages/ai
[guizang]: https://github.com/op7418/guizang-ppt-skill

---

## 1. Three deployment topologies

OD is a web app plus a local daemon. The split means the same UI can run in three shapes:

### Topology A — Fully local (the default)

```
┌────────────────── user's machine ──────────────────┐
│                                                    │
│   browser ──► Next.js dev server (localhost:3000)  │
│                       │                            │
│                       │ http://localhost:7456      │
│                       ▼                            │
│            od daemon (Node, long-running)         │
│                       │                            │
│                       ▼                            │
│            spawns: claude / codex / cursor / …     │
└────────────────────────────────────────────────────┘
```

One `pnpm tools-dev run web` starts both the Next.js app and the daemon. `pnpm tools-dev` adds the desktop shell. Zero config. No accounts.

### Topology B — Web on Vercel + daemon on user's machine

```
browser ──► od.yourdomain.com (Vercel)
              │
              │ ws(s):// user-provided URL (e.g. cloudflared tunnel)
              ▼
        od daemon on user's laptop
              │
              ▼
        spawns: claude / codex / …
```

The user runs `od daemon --expose` which prints a tunnel URL; they paste the URL into the deployed web app's "Connect daemon" screen. Daemon holds secrets; Vercel holds nothing sensitive.

### Topology C — Web on Vercel + direct API (no daemon)

```
browser ──► od.yourdomain.com (Vercel serverless)
                       │
                       ▼
              Anthropic Messages API (BYOK stored in browser)
```

No local CLI, no daemon. Degraded experience — no Claude Code skills, no filesystem artifacts (stored in IndexedDB), no PPTX export. But it's the "just try it" path. Keys stored `localStorage` with explicit warning.

The three topologies share the same web bundle; the difference is which transports are enabled.

## 2. Component diagram (logical)

```
┌─────────────────────────────── Web App ─────────────────────────────┐
│                                                                     │
│  ┌──────────┐  ┌─────────────┐  ┌───────────┐  ┌────────────────┐  │
│  │ chat pane│  │ artifact    │  │ preview   │  │ comment /      │  │
│  │          │  │ tree        │  │ iframe    │  │ slider overlay │  │
│  └────┬─────┘  └──────┬──────┘  └─────┬─────┘  └────────┬───────┘  │
│       │               │               │                  │           │
│       └─────────── session bus (in-memory) ──────────────┘           │
│                        │                                             │
│                        ▼                                             │
│              Transport layer (daemon SSE | api-direct | browser)      │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
  ┌───────────────────────┴────────────────────────────────┐
  │                                                        │
  ▼ (topology A/B)                                         ▼ (topology C)
┌─────────────────────── Daemon ───────────────────────┐  ┌────────────┐
│                                                      │  │ browser-   │
│  session manager      skill registry                 │  │ only       │
│  agent adapter pool   design-system resolver         │  │ runtime    │
│  artifact store       preview compile pipeline       │  │ (limited)  │
│  export pipeline      detection service              │  └────────────┘
│                                                      │
└─┬────────────────────────────────────────────────┬───┘
  │                                                │
  ▼                                                ▼
┌─ agent CLIs ─┐                           ┌─ filesystem ─┐
│ claude       │                           │ ./.od/      │
│ codex        │                           │ ~/.od/      │
│ cursor-agent │                           │ skills/      │
│ gemini       │                           │ DESIGN.md    │
│ opencode     │                           └──────────────┘
│ qwen         │
└──────────────┘
```

## 3. Key components

### 3.1 Web app (Next.js 16, App Router)

- **Why Next.js, not Vite SPA?** We want SSR for the marketing landing page + serverless routes for Topology C's direct-API path + Vercel deployment as a first-class citizen. An SPA would need a separate server for any of that.
- **State:** React/browser state for UI config, with projects/conversations/files hydrated from the daemon APIs.
- **Iframe preview:** Vendored React 18 + Babel standalone for JSX artifacts, following [Open CoDesign][ocod]'s approach. HTML artifacts load raw. See [§5](#5-preview-renderer).
- **Comment mode:** Click captures `[data-od-id]` on preview DOM, opens a popover, sends `{artifact_id, element_id, note}` to daemon → agent gets a surgical edit instruction.
- **Slider UI:** When an agent emits a "tweak parameter" tool call (see [`skills-protocol.md`](skills-protocol.md) §4.2), the web app renders a live-update control that re-sends parameterized prompts without round-tripping the chat.

### 3.2 Local daemon (`od daemon`)

Single binary via `pkg` or a thin Node script distributed over npm. Responsibilities:

- Listen on `http://localhost:7456` by default. Accept REST/SSE routes under `/api/*`.
- Maintain a **session** per web tab. Sessions hold: active agent, active skill, active artifact, in-flight tool calls, design-system reference.
- Operate the **agent adapter pool**: one detected CLI = one adapter instance, reused across sessions.
- Scan and index **skills** from `~/.claude/skills/`, `./skills/`, `./.claude/skills/` on startup and on FS-watch events.
- Own the **artifact store** — writes files to disk, never in memory.
- Run the **preview compile pipeline** (Babel transform for JSX, CSS inliner for HTML exports).
- Provide export hooks for HTML/PDF/ZIP and skill-defined deck outputs.

### 3.3 Agent adapter pool

See [`agent-adapters.md`](agent-adapters.md) for the full interface. Each adapter:

1. **Detects** its target CLI (PATH lookup + config-dir probe).
2. **Spawns** the CLI with a standardized wrapper prompt + skill context + design-system context + CWD set to the project's artifact root.
3. **Streams** stdout/stderr as structured events (JSON Lines if the CLI supports it; line-based parser otherwise).
4. **Reports capabilities** — does it support multi-turn? Surgical edits? Native skill loading? Tool use?

### 3.4 Skill registry

See [`skills-protocol.md`](skills-protocol.md). Scans three locations and merges:

| Source | Priority | Purpose |
|---|---|---|
| `./.claude/skills/` | highest | project-private skills |
| `./skills/` | medium | project-declared skills |
| `~/.claude/skills/` | lowest | user-global skills |

Conflicts resolve by priority (higher wins). Each skill parsed once; watched for changes in dev.

### 3.5 Design-system resolver

- Looks for `./DESIGN.md` first, then `./design-system/DESIGN.md`, then user-configured path.
- Parses the 9-section format (see [awesome-claude-design][acd] schema).
- Injects as a prepended system message on every agent run, plus as a `{{ design_system }}` template variable skills can reference.
- Hot-reloads on file change in dev.

### 3.6 Artifact store

Plain files on disk. Conventional layout per project:

```
./.od/
├── config.json                  # project-level daemon config
├── artifacts/
│   ├── 2026-04-24T10-03-12-landing/
│   │   ├── artifact.json        # metadata (skill, mode, prompt, parent)
│   │   ├── index.html           # primary output (or .jsx, .md, .pptx.json)
│   │   └── assets/              # skill-generated images, fonts, etc.
│   └── …
├── history.jsonl                # append-only action log (generations, edits, comments)
└── sessions/
    └── <session-id>.json        # transient; garbage-collected after 24h
```

Rationale:
- **Plain files** → users can `git add ./.od/artifacts/` and review designs in PRs.
- **`artifact.json` metadata** → OD can reconstruct the artifact tree without a DB.
- **`history.jsonl` not SQLite** → append-only, git-friendly, greppable. [Open CoDesign][ocod] uses SQLite; we deliberately don't.
- **Sessions separate from artifacts** → sessions are ephemeral UI state; artifacts are durable.

### 3.7 Export pipeline

| Format | How |
|---|---|
| HTML (self-contained) | Inline all CSS, rewrite asset URLs to data: URIs |
| PDF | `puppeteer` → `page.pdf()` on the rendered HTML |
| PPTX | `deck-skill` outputs a JSON intermediate (`slides.json`); `pptxgenjs` generates the `.pptx` |
| ZIP | `archiver` over `artifacts/<id>/` |
| Markdown | direct copy if artifact is `.md`, otherwise skill-defined render |

## 4. Data flow — a typical "generate prototype" turn

```
1. User types prompt in web chat.
2. Web sends { method: "session.generate", params: {
        sessionId, prompt, modeHint: "prototype"
   }} to daemon via WS.

3. Daemon:
     a. picks active skill (prototype-skill)
     b. loads design-system (DESIGN.md)
     c. materializes a new artifact dir under ./.od/artifacts/<slug>/
     d. invokes agent adapter with:
          - system: skill's SKILL.md contents + DESIGN.md
          - user: original prompt
          - cwd: the new artifact dir
     e. streams agent events back to web as they arrive:
          - "tool_call" (edit file, write file, read file)
          - "text_delta"
          - "thinking" (if supported)

4. Web shows:
     - running tool-call feed in the side panel
     - artifact tree updates as files materialize
     - preview iframe loads the primary output file when agent signals "done"
     - slider/comment overlay activates once preview loads

5. On completion, daemon appends:
     { ts, sessionId, artifactId, action: "generate", skill, promptHash }
   to history.jsonl.

6. User comments on an element → web sends { method: "session.refine", params: {
        sessionId, artifactId, elementId, note }}

7. Daemon re-invokes agent with surgical-edit instruction + the note.
   Adapter translates based on capabilities:
     - Claude Code → native tool loop, edits that region only
     - Codex → regenerates the file with "only change element X" constraint
     - API fallback → same as Codex path
```

## 5. Preview renderer

**Constraints:**
- Must isolate artifact code from the host app (no access to window, cookies, parent DOM).
- Must hot-reload as the agent streams writes.
- Must support both static HTML and JSX artifacts.

**Design:**
- Always an `<iframe sandbox="allow-scripts">` — no `allow-same-origin`.
- Static HTML: `srcdoc` load of the inlined artifact.
- JSX: inject a small bootstrap that imports vendored React 18 + Babel standalone, then dynamically evals the JSX as Babel-transformed code. (This is what [Open CoDesign][ocod] does, and it works; no reason to reinvent.)
- Agent writes trigger a debounced rebuild + iframe `srcdoc` replace. Full reload each time — React state loss is acceptable at this scope.

## 6. Config files

| File | Purpose |
|---|---|
| `~/.open-design/config.toml` | daemon-global: default agent preference, keys (optional, BYOK), telemetry opt-in (default off) |
| `~/.open-design/agents.json` | cached agent detection results |
| `./.od/config.json` | project-local: active design system, preferred skills, preferred mode |
| `./skills/<skill>/SKILL.md` | skill manifest (standard Claude Code format) |
| `./DESIGN.md` | active design system ([awesome-claude-design][acd] format) |

All config is plain text / TOML / JSON — no binary formats, no sqlite. Reviewable in PRs.

## 7. Protocol between web and daemon

The shipped daemon uses HTTP routes plus Server-Sent Events for streaming chat output. This keeps the browser on the same `/api/*` surface in dev and production while still allowing incremental agent output.

Representative API surface:

```
GET  /api/health
GET  /api/agents
GET  /api/skills
GET  /api/design-systems
GET  /api/projects
POST /api/projects
POST /api/import/folder                    # see Folder import
GET  /api/projects/:id/files
POST /api/projects/:id/upload
POST /api/chat              -> text/event-stream
POST /api/artifacts/save
```

### Folder import

`POST /api/import/folder` creates a project rooted at an existing local
folder instead of the default `.od/projects/<id>/`. The submitted
`baseDir` is stored on `metadata.baseDir` and OD reads / writes directly
inside it — there is no copy or shadow tree. The user owns the workspace
and is responsible for their own version control (git, time machine,
etc.), mirroring how Cursor / Claude Code / Aider behave.

Safety:

- The submitted `baseDir` is canonicalized via `realpath()` before
  storage, so user-controlled symlinks cannot redirect later writes.
- Standard `resolveSafe` / `sanitizePath` checks apply on every write —
  `metadata.baseDir` only changes the project root, not the bounds check.
- Imports inside `RUNTIME_DATA_DIR` (the daemon's own data directory) are
  refused after symlink resolution.
- The file panel hides the conventional build / install dirs
  (`node_modules .git dist build .next .nuxt .turbo .cache .output out
  coverage __pycache__ .venv vendor target .od .tmp`) so the listing
  stays focused on design content.

Request / response types: `ImportFolderRequest`, `ImportFolderResponse`
in `@open-design/contracts`.

#### Desktop folder-import auth (PR #974)

The desktop build adds a privileged `shell.openPath` IPC bridge so the
"Continue in CLI" / "Finalize design package" buttons can reveal a
project's working directory in Finder/Explorer. To prevent a
compromised renderer from abusing that bridge to open arbitrary local
paths via project-creation laundering, `POST /api/import/folder` is
fronted by an HMAC gate when the daemon is paired with a desktop:

- **Trust handshake.** At desktop main-process startup, before the
  `BrowserWindow` is created, desktop generates a fresh 32-byte secret
  (`randomBytes(32)`) and registers it with the daemon over the
  daemon's sidecar IPC (`SIDECAR_MESSAGES.REGISTER_DESKTOP_AUTH`).
- **Token shape.** When the user picks a folder via the
  `dialog:pick-and-import` IPC, the desktop main process mints an HMAC
  token `${nonce}~${expISO}~${signatureB64url}` where
  `signature = HMAC-SHA256(secret, baseDir + "\n" + nonce + "\n" + exp)`.
  The token is sent in `X-OD-Desktop-Import-Token` alongside the
  `POST /api/import/folder` body. Field separator is `~` (not `.`)
  because ISO 8601 expiries embed `.` and would split the token into
  four parts.
- **TTL & replay.** Tokens are single-use: the daemon rejects nonces
  it has already consumed and prunes them on expiry. TTL is 60s;
  expiries beyond 2× TTL are also rejected so a compromised desktop
  cannot mint long-lived tokens against a small TTL contract.
- **Fail-closed.** Two coordinated mechanisms prevent the gate from
  silently relaxing when the desktop's registration is in flight or
  has been lost (daemon restart mid-session, IPC race at startup):
  - A **sticky in-process flag**: once a secret has ever been
    registered with this daemon process, the gate stays active for
    the rest of the process lifetime (a `setDesktopAuthSecret(null)`
    call from tests does not relax it).
  - An **orchestrator-pinned mode** via the `OD_REQUIRE_DESKTOP_AUTH=1`
    env var, set by `tools-dev` / `tools-pack` / `apps/packaged` when
    the daemon is spawned in a desktop-bundled flow. With the env set,
    the gate is active from request 0 — a renderer that races to call
    `/api/import/folder` before the desktop has registered gets a 503
    `DESKTOP_AUTH_PENDING` (transient, retry).
- **Web-only deployments are unaffected.** When neither mechanism
  fires (standalone daemon spawn, no env var, no desktop ever paired),
  the gate stays dormant and `/api/import/folder` behaves as before.
  Browser-only builds have no `shell.openPath` surface, so a
  renderer-named path cannot escalate.
- **Trusted-picker marker on `openPath`.** Every import that passes
  the HMAC gate is stamped with `metadata.fromTrustedPicker: true`.
  The desktop main process's `shell:open-path` IPC refuses
  folder-imported projects whose metadata lacks this marker — even if
  a future codepath inadvertently sets `metadata.baseDir` outside the
  trusted flow, the open-path surface stays closed. `POST /api/projects`
  and `PATCH /api/projects/:id` reject any client-supplied
  `fromTrustedPicker` so the marker cannot be smuggled or stripped.
- **Legacy migration.** Folder-imported projects created before this
  gate landed have no `fromTrustedPicker` flag. The "Continue in CLI"
  button will return an error toast for those projects; the user
  re-imports the same folder via the picker to restore the button.
- **Daemon restart edge.** If the daemon is restarted while desktop
  keeps running, the new daemon process will be in `OD_REQUIRE_DESKTOP_AUTH`
  mode (orchestrator env survives restart) but has no secret registered
  yet, so the first import after the restart returns `503
  DESKTOP_AUTH_PENDING`. The desktop runtime catches that response in
  `dialog:pick-and-import`, re-invokes its registration callback to
  re-handshake with the new daemon, mints a fresh token (new nonce + new
  exp — replay protection still works), and retries once. A persistent
  failure (daemon truly down, IPC socket missing) surfaces in the
  renderer toast instead of silently dropping. No desktop restart needed.
- **Headless packaged mode.** The headless entrypoint
  (`apps/packaged/src/headless.ts`) starts daemon + web only — no
  Electron, no `shell.openPath` surface, no desktop main process to
  register a secret. It calls `startPackagedSidecars(...)` with
  `requireDesktopAuth: false`, which keeps the daemon's gate dormant
  for that deployment. The Electron entry
  (`apps/packaged/src/index.ts`) passes `true` because it does start
  desktop main alongside the daemon.
- **tools-dev split-start hardening.** `tools-dev start desktop`
  introspects the running daemon's STATUS over IPC before launching
  desktop main. The split-start dev sequence
  `tools-dev start daemon` → `tools-dev start desktop` would
  otherwise leave the daemon running without
  `OD_REQUIRE_DESKTOP_AUTH=1` (the env var is only injected when
  daemon and desktop spawn in the same orchestrator invocation, or
  when a desktop is already alive at daemon spawn time). When
  `start desktop` finds an ungated daemon
  (`desktopAuthGateActive: false` on the new STATUS field), tools-dev
  stops the daemon (and web, if running), respawns the daemon with
  the env var pinned, restarts web, and only then launches desktop
  main. The user sees a single `[tools-dev] daemon is running
  without desktop-auth gate; restarting daemon (and web, if running)
  before desktop start` line; in-flight daemon work is interrupted
  but the gate is guaranteed armed before the BrowserWindow loads.
  The bundled-targets path (`pnpm tools-dev`) is unaffected — its
  daemon was already spawned gated by the same-invocation trigger,
  so the helper is a single STATUS roundtrip with no side effects.
  Packaged Electron and packaged headless modes are unaffected
  because their gate state is fixed at packaged-runtime startup.

Shared API contract types live in [`packages/contracts/src`](../packages/contracts/src).

## 8. Deployment

### Local
```sh
pnpm install
pnpm tools-dev run web       # starts daemon + web foreground loop
```

When a reverse proxy sits in front of the daemon, `/api/*` includes SSE streams and must stay unbuffered. The daemon sends `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`, and also emits SSE comment keepalives, but nginx can still break chunked streams if gzip is enabled. For nginx, set `proxy_buffering off;`, `gzip off;`, and long `proxy_read_timeout` / `proxy_send_timeout` values on the API location. Otherwise browsers can report `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)` on long generations.

### Docker
```yaml
# docker-compose.yml
services:
  daemon:
    image: openclaudedesign/daemon
    volumes: [ "~/.open-design:/root/.open-design", "./:/workspace" ]
    ports: ["7456:7456"]
  web:
    image: openclaudedesign/web
    ports: ["3000:3000"]
    environment: [ "OD_DAEMON_URL=http://daemon:7456" ]
```

### Vercel + local daemon (Topology B)
```sh
vercel deploy                     # web only
od daemon --expose               # user runs locally; prints tunnel URL
# user pastes URL into /connect UI
```

### Vercel direct (Topology C)
```sh
vercel deploy                     # same bundle
# flip VERCEL env flag OD_MODE=direct to hide daemon-connect UI
```

## 9. Security model

| Surface | Threat | Mitigation |
|---|---|---|
| Daemon HTTP/SSE API | Arbitrary local process talks to daemon | Bind to localhost by default; add auth/tunnel hardening before exposing beyond the machine |
| Artifact code in preview | XSS/cookie theft from host | `<iframe sandbox="allow-scripts">`, no `allow-same-origin` |
| Agent running on user's machine | Agent reads/writes outside project | Adapter sets `cwd` to artifact dir; relies on agent's own permission system (Claude Code's `--allowed-tools` etc.) |
| User secrets | Leak to cloud | BYOK stored only in daemon's `config.toml` (mode 0600) or browser `localStorage` in Topology C, never sent to OD's own servers (we don't have any) |
| Skill from untrusted source | Malicious skill in `~/.claude/skills/` | Install-time warning; skills run under the agent's permission model, not ours |
| Vercel web bundle | Compromised build | Standard Vercel integrity; bundle has zero secrets |

We inherit the agent's permission model on purpose — we don't invent our own sandbox, because Claude Code's `--permission-mode` / Codex's sandboxing / Cursor's containment already exist and are maintained.

## 10. Performance notes

- Daemon startup: < 500 ms (lazy adapter init).
- Agent detection: < 200 ms (parallel PATH probes).
- First generation latency: dominated by agent model time; OD overhead should be < 50 ms.
- Preview reload: debounced 100 ms on artifact file writes.
- Skill index: cold scan < 100 ms for ~50 skills; watched with `chokidar`.

## 11. What's explicitly out of scope for MVP

- Multi-user / RBAC / orgs
- Hosted skill marketplace (git URLs only in v1)
- Figma export (post-1.0, same as [Open CoDesign][ocod])
- Collaborative editing
- Mobile web support (desktop only in MVP)
- Offline mode (beyond "the agent is local" — we don't cache model responses)
