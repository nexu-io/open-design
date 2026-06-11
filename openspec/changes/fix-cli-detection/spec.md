# Spec: Fix CLI Detection in Web UI

**Status:** draft
**Parent:** proposal.md

## Acceptance Criteria

### AC-1: `/api/agents` accessible without auth

**Given** the daemon is running with `OD_API_TOKEN` set AND `OD_BIND_HOST=0.0.0.0`
**When** an HTTP client (browser, curl) sends `GET /api/agents` without an `Authorization` header
**Then** the daemon returns 200 with a JSON body `{ "agents": [...] }`
**And** the response includes every agent from `AGENT_DEFS` with correct `available` / `unavailable` status

**Non-loopback enforcement:** The same request from a non-loopback remote address (e.g., Docker bridge `172.x.x.x`) also returns 200.

### AC-2: SSE stream also open

**Given** the daemon is running with `OD_API_TOKEN` set
**When** an HTTP client sends `GET /api/agents?stream=1` without an `Authorization` header
**Then** the daemon returns 200 with `Content-Type: text/event-stream`
**And** emits `event: agent` frames as detection completes
**And** terminates with `event: done`

### AC-3: Other `/api/*` endpoints remain protected

**Given** the daemon is running with `OD_API_TOKEN` set
**When** an HTTP client sends `GET /api/projects` (or any non-probe, non-agents endpoint) without an `Authorization` header
**Then** the daemon returns 401 with `{ "error": { "code": "API_TOKEN_REQUIRED", ... } }`

### AC-4: `install-clis.sh` removes non-existent npm packages

**Given** the `install-clis.sh` script is executed in the Docker build
**When** it reaches the npm install section
**Then** it does NOT attempt to install: `@trae/cli`, `@anthropic-ai/kimi-cli`, `@badlogic/pi-agent`, `@nousresearch/hermes-agent`, `@xai/grok-cli`, `@mistralai/mistral-vibe`
**And** each of these CLIs appears in the "Not auto-installable" summary section with:
  - The CLI name
  - A brief reason (e.g., "no public npm package")
  - A URL or instructions for manual installation

### AC-5: Existing installable CLIs still install

**Given** the `install-clis.sh` script is executed
**When** it reaches the npm install section for known-good packages (`@anthropic-ai/claude-code`, `@openai/codex`, `@google/gemini-cli`, `cursor-agent`, `deepseek-cli`, `qwen-cli`, `@qoder/cli`, `@opencode-ai/cli`, `kiro-cli`, `kilo`, `reasonix`)
**Then** each is attempted and the success/failure is reported in the summary
**And** the script does not abort on individual failures

### AC-6: Docker build succeeds with corrected script

**Given** the Dockerfile `deploy/Dockerfile` with the corrected `install-clis.sh`
**When** `docker build -f deploy/Dockerfile .` runs
**Then** the `install-clis.sh` step completes without aborting the build
**And** the summary shows zero "failed" CLIs from npm package-not-found errors (network failures are acceptable)

### AC-7: Existing tests pass

**Given** the code changes are applied
**When** `pnpm run vitest` runs at the repository root (or scoped to affected packages)
**Then** all existing tests pass with no regressions

## Non-Functional Requirements

- **NFR-1:** Adding `/api/agents` to open probe paths must be a single-line change (adding the path to the existing `openProbePaths` set).
- **NFR-2:** The `install-clis.sh` changes must preserve the existing `set -o pipefail` and resilient error-handling pattern.
- **NFR-3:** No new dependencies or packages introduced.

## Out of Scope

- Token bridge (login form, cookie auth, 401 redirect UI)
- Installing CLIs from non-npm sources beyond existing Aider/Devin
- Adding new agent definitions to `AGENT_DEFS`
- Changing agent detection probe logic or timing
