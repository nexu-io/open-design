# Proposal: Fix CLI Detection in Web UI

**Status:** draft
**Created:** 2026-06-11

## Problem Statement

The Open Design web UI fails to detect installed coding-agent CLIs in the Docker deployment. Users access the containerized daemon through their browser, but the agent picker shows no available agents — even though the CLIs are pre-installed in the Docker image. This renders the entire Docker deployment unusable for agent-based coding work.

Three root causes have been identified:

1. **Auth gate blocks `/api/agents`** (critical): When `OD_API_TOKEN` is set (required for `OD_BIND_HOST=0.0.0.0`), the daemon's bearer-token middleware requires `Authorization: Bearer <token>` on all `/api/*` requests except probe paths. The web UI's `fetchAgents()` call does not send this header, so the daemon returns 401. The fetch wrapper silently catches the error and returns `[]`, making it look like zero agents are installed. The daemon itself is healthy and can detect CLIs — the detection pipeline never runs because the HTTP layer rejects the request first.

2. **Uninstallable npm packages in `install-clis.sh`** (high): The install script attempts to install packages that do not exist on the public npm registry (e.g. `@anthropic-ai/kimi-cli`, `@nousresearch/hermes-agent`, `@xai/grok-cli`, `@mistralai/mistral-vibe`, `@trae/cli`, `@badlogic/pi-agent`). These fail silently during the Docker build. The script has a resilient error handler, so the build succeeds — but 6+ CLIs are missing at runtime. Users see these agents as unavailable in the UI and get no guidance on how to install them manually.

3. **No API token bridge from server to web client** (medium): Even when auth is configured, there is no mechanism for the web UI to obtain the token. The token is server-side only (set via env var or docker-compose). The web client has no login form, no token prompt on 401, and no cookie-based auth alternative. A deployment operator must manually append `?token=...` to the URL or configure a reverse proxy that injects the header — neither is documented.

## Proposed Solution

### P1: Open `/api/agents` to unauthenticated access

Add `/api/agents` and `/api/agents?stream=1` to the daemon's open probe paths. Agent detection is a **read-only, non-mutating discovery operation** — it reveals only what CLIs happen to be on the server's PATH, with no credentials, no project data, no user data. Keeping it behind auth means the web UI silently breaks while the daemon is healthy.

The `/api/agents` response already omits sensitive fields (`buildArgs`, `env`, `fetchModels`, `listModels` — stripped by `stripFns()`). The only marginally sensitive field is `authStatus` (whether a CLI is signed in), which is already publicly inferable from the fact that a binary exists on PATH.

### P2: Fix `install-clis.sh` package names

Replace non-existent npm packages with the correct package names or, where the CLI has no public npm distribution, document the manual install path clearly in the build summary. Specifically:

| Current (broken) | Replacement |
|---|---|
| `@trae/cli@latest` | Remove — Trae CLI has no public npm package. Document manual install. |
| `@anthropic-ai/kimi-cli@latest` | Remove — Kimi CLI has no public npm package. Document manual install. |
| `@badlogic/pi-agent@latest` | Remove — Pi Agent has no public npm package. Document manual install. |
| `@nousresearch/hermes-agent@latest` | Remove — Hermes Agent has no public npm package. Document manual install. |
| `@xai/grok-cli@latest` | Remove — Grok CLI has no public npm package. Document manual install. |
| `@mistralai/mistral-vibe@latest` | Remove — Vibe CLI has no public npm package. Document manual install. |

Add explicit "not auto-installable" entries for each with links to their download pages, matching the pattern already used for Antigravity, OpenClaw, and Cline.

### P3: Token bridge (deferred to follow-up)

Designing a full server→client token bridge (login form, token cookie, 401 redirect) is a separate feature spanning auth middleware, web UI, and deployment docs. This proposal defers it to a follow-up change. P1 unblocks the immediate "can't detect CLIs" issue.

## Scope

**In scope:**
- Daemon: add `/api/agents` and `/api/agents?stream=1` to open probe paths
- Deploy: fix `install-clis.sh` to remove non-existent npm packages and add manual-install documentation
- Tests: verify `/api/agents` returns 200 without auth when `OD_API_TOKEN` is set; verify install script handles missing packages correctly

**Out of scope:**
- Full token bridge (login form, cookie auth, 401 UX)
- Installing CLIs from non-npm sources (curl, GitHub releases, pip) beyond the existing Aider and Devin entries
- Adding new agent definitions for CLIs not already in `AGENT_DEFS`
- Changing the agent detection probe logic

## Risks

- **Open `/api/agents` exposes `authStatus`**: Low risk. The field only reveals whether a CLI binary on the server is authenticated, which is observable by anyone who can `docker exec` into the container. No credentials or tokens are exposed.
- **Install script changes may miss edge cases**: Low risk. The script already has resilient error handling; we're only removing entries that always fail and adding clearer documentation for manual installs.
- **Future `/api/agents` additions**: If `/api/agents` later includes sensitive data, the open-probe-path list must be revisited. This is unlikely given the current `stripFns()` filter.

## Non-Goals

- Making all `/api/*` endpoints public
- Adding auth UI to the web client
- Replacing npm-based CLI installation with alternative package managers
- Supporting CLIs not in the `AGENT_DEFS` registry
