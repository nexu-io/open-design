# mcp

The MCP (Model Context Protocol) domain of the daemon, organized as a
machine-enforced **capability barrel**: a `core/` foundation kernel plus three
independent concern subdirectories, each behind a barrel, with a single public
root barrel (`index.ts`). External daemon code imports MCP capabilities only
from `./mcp/index.js` — never from a subdirectory — and the
`scripts/check-barrel-imports.ts` guard enforces that boundary in `pnpm guard`.

## What changed (refactor history)

Previously eight flat files under `apps/daemon/src` — `mcp.ts` (~1.9k LOC),
`mcp-config.ts`, `mcp-oauth.ts`, `mcp-tokens.ts`, `mcp-install-info.ts`,
`mcp-agent-install.ts`, `mcp-live-artifacts-server.ts`, and the HTTP registrar
`mcp-routes.ts` — with no enforced import boundary. Any daemon module could
reach into any of them directly.

This refactor:

- Grouped the four shared kernel files into `core/` (`config`, `oauth`,
  `tokens`, `install-info`).
- Split the three distinct concerns into their own subdirectories: `client/`
  (the `od mcp` stdio server), `agent-install/` (`od mcp install <agent>`), and
  `live-artifacts/` (the per-run artifact MCP surface).
- Moved the HTTP registrar `mcp-routes.ts` to `routes/mcp.ts` (it is a route
  registrar, not a domain capability) — it now imports the `mcp/` barrel.
- Added a root barrel (`index.ts`) with explicit named re-exports reproducing
  the exact prior public surface, and registered the `mcp` domain in
  `CAPABILITY_BARREL_DOMAINS`.

Function bodies were moved byte-for-byte; the only code change is import-path
rewrites. No runtime behavior changed.

## Why this shape (architecture reasoning)

MCP has one obvious shared kernel — the server config/store, the OAuth flow, the
token store, and the install-payload builder — that many surfaces need
(`server.ts`, `routes/`, `run-tool-bundle.ts`, the CLI). That kernel is `core/`.

The three consumers of MCP are genuinely independent workloads:

- `client/` runs a stdio server that proxies tool calls to the daemon.
- `agent-install/` plans and writes MCP registrations into other agents' configs.
- `live-artifacts/` exposes a per-run artifact tool surface.

None of them import each other, and each leans only on `core/`. That makes the
domain a **pure star**: `foundation: 'core'`, `allowedEdges: []`. There are no
cross-sibling couplings to declare — if one ever appears, that is the signal to
stop and reconsider the boundary rather than add an edge.

## Import conventions

- **External code** (anything outside `mcp/`) imports only from the root barrel:
  `import { readMcpConfig, PendingAuthCache } from './mcp/index.js';`
- **A sibling subdir** may import `core/` directly (`../core/index.js`). Siblings
  do not import each other (there are no `allowedEdges`).
- **A subdir never imports the root barrel** (`../index.js`) — that would invite
  a cycle. Reach shared code through `core/`.
- The root barrel uses **explicit named re-exports** (no `export *`); subdir
  barrels may use `export *`.
- Name collision guard: this domain (`src/mcp/`) is distinct from the unrelated
  `src/runtimes/mcp.ts` and the CLI's `src/cli/mcp/`. Keep imports pointed at the
  right one.

## Known limitations & staged migration

- The `_`-prefixed test seams in `client/` (`_createMcpIdleExitController`,
  `_resetWebBaseUrlCache`) are intentionally **not** on the root barrel; tests
  white-box them through the `client/` subdir barrel. This mirrors the
  design-systems precedent (external *runtime* code imports only the root
  barrel; tests may reach internal helpers via deeper paths).
- Tests were repointed in place (kept flat under `apps/daemon/tests/`), matching
  the automation/memory/library domain precedent — not moved into a mirrored
  test subtree.

## Directory structure

```
mcp/
  index.ts            root barrel — explicit named re-exports (the public surface)
  core/               foundation kernel (config / oauth / tokens / install-info)
  client/             od mcp stdio server + tool handlers
  agent-install/      od mcp install <agent> planners
  live-artifacts/     per-run artifact MCP tool surface
```

### `core/`

The dependency-light kernel every other concern builds on. `config` owns the
external-server schema, on-disk store, and the per-agent config builders (Claude
`.mcp.json`, ACP `mcpServers`, OpenCode). `oauth` owns the daemon-side OAuth 2.1
/ PKCE flow for remote MCP servers. `tokens` owns the 0600-guarded token store.
`install-info` is the pure `/api/mcp/install-info` payload builder. `core`
imports no sibling.

### `client/`

The stdio MCP server behind `od mcp`. Proxies project tool calls
(`get_artifact`, `get_file`, `create_artifact`, project/context resolution, …)
to the running daemon's HTTP API so an agent in another repo can reach a local
Open Design project. Holds no state; depends only on the daemon HTTP API and
`core`.

### `agent-install/`

Plans and applies registration of Open Design's MCP server into external coding
agents' own configs (`od mcp install <agent>`): the agent-slug registry, the
CLI/JSON/manual install-plan shapes, and the JSON apply/remove primitives.

### `live-artifacts/`

The live-artifacts MCP tool surface an agent run exposes back to itself: builds
the tool schema, handles JSON-RPC requests, and runs the standalone stdio server.

## Types

Domain types live beside the code that owns them and are re-exported through the
root barrel: config/template types and the OAuth metadata/flow types from
`core`, the token-file types from `core`, the install-plan shapes from
`agent-install`, and the install-payload types from `core`. Import them from
`./mcp/index.js` like any other export.
