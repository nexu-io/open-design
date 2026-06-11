# Design: Fix CLI Detection in Web UI

**Status:** draft
**Parent:** spec.md

## Architecture Overview

The fix touches two independent layers with no coupling between them:

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: Daemon auth middleware (server.ts)         │
│  Change: Add /api/agents to openProbePaths Set       │
│  Impact: 1 line added, 0 lines changed               │
├─────────────────────────────────────────────────────┤
│  Layer 2: Docker CLI install (install-clis.sh)       │
│  Change: Remove 6 broken npm installs + document     │
│  Impact: ~6 lines removed, ~10 lines added           │
└─────────────────────────────────────────────────────┘
```

No new files. No new dependencies. No API contract changes.

---

## Layer 1: Auth Middleware — Opening `/api/agents`

### Current State

```typescript
// server.ts ~L4694
const openProbePaths = new Set([
  '/health',
  '/api/health',
  '/ready',
  '/api/ready',
  '/version',
  '/api/version',
]);
app.use('/api', (req, res, next) => {
  if (openProbePaths.has(req.path)) return next();
  // ... bearer-token check for everything else
});
```

### Proposed Change

Add two entries to the `openProbePaths` set:

```typescript
const openProbePaths = new Set([
  '/health',
  '/api/health',
  '/ready',
  '/api/ready',
  '/version',
  '/api/version',
  '/api/agents',        // ← new
]);
```

**Why one entry covers both variants:** Express's `req.path` excludes the query string (`?stream=1`), so `req.path` is `/api/agents` for both `GET /api/agents` and `GET /api/agents?stream=1`. No separate entry needed for the SSE variant.

### Tradeoffs

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **Add to `openProbePaths`** (chosen) | Minimal change (1 line). Same mechanism as health/version probes. Auditable in one place. | `/api/agents` response is larger than health probes (~10KB vs ~50B). Not a security concern. | ✅ |
| Separate allowlist for "read-only" endpoints | Cleaner separation of concerns. | Over-engineering for 1 endpoint. Adds a second list to audit. Premature abstraction. | ❌ |
| Client-side token injection (P3) | Full auth coverage. No server change. | Requires new web UI components, cookie management, deployment docs. ~300+ lines. Delays the fix. | ❌ (deferred) |
| Keep `/api/agents` behind auth, improve error UX | No auth bypass. | Web UI still gets empty agent list. The user still can't work. Doesn't solve the problem. | ❌ |

### Security Analysis

**What `/api/agents` exposes today:**

| Field | Sensitivity | Notes |
|---|---|---|
| `id`, `name`, `bin` | None | Static from `AGENT_DEFS`, shipped in source code |
| `available` | Low | Reveals whether a CLI binary exists on the server's PATH |
| `path` | Low | Absolute filesystem path to the binary (e.g. `/usr/local/bin/claude`) |
| `version` | Low | CLI version string |
| `authStatus` | Low | `'ok'`, `'missing'`, or `'unknown'` — reveals whether a CLI is signed in |
| `models` | Low | Model list from CLI or static fallback |
| `diagnostics` | Low | Human-readable reasons a CLI is unavailable |
| `installUrl`, `docsUrl` | None | Public URLs to vendor sites |

**Fields stripped before response** (via `stripFns()` in `detection.ts`):
- `buildArgs` — spawn arguments (could reveal filesystem paths)
- `listModels`, `fetchModels` — function references
- `env` — per-agent environment overrides
- `helpArgs`, `capabilityFlags` — probe metadata
- `authProbe` — auth probe configuration
- `fallbackBins`, `fallbackModels` — detection internals

**Threat model:** An attacker with network access to the daemon can:
- Before: See nothing (401 on `/api/agents`). Must guess or port-scan.
- After: See which CLIs are installed and whether they're authenticated.

**Risk assessment:** Low. The same information is visible to anyone with `docker exec` access. It does not expose credentials, tokens, project data, or user data. The daemon's binding to `0.0.0.0:7456` is already gated by `OD_API_TOKEN` at startup — if the attacker can reach the port, they're already inside the network boundary.

**Defense in depth:** The `openProbePaths` mechanism already has precedent (`/api/health` returns daemon version and uptime). Adding `/api/agents` is consistent with the "operational read-only probes are open" pattern.

### Implementation Detail

The change is a single-line addition to the `Set` initializer. No control flow changes, no conditionals, no new functions. The existing `req.path` check handles routing automatically.

**File:** `apps/daemon/src/server.ts`
**Line:** After `/api/version` in the `openProbePaths` set (currently line ~4701)
**Change:** Add `'/api/agents',`

---

## Layer 2: `install-clis.sh` — Removing Broken Packages

### Current State

The Tier 2 section of `install-clis.sh` attempts to install 10 npm packages. Based on npm registry research:

| Package | Exists on npm? | Evidence |
|---|---|---|
| `@opencode-ai/cli` | ✅ Yes | Public npm package |
| `@trae/cli` | ❌ No | No public package found |
| `@anthropic-ai/kimi-cli` | ❌ No | No such package; Kimi CLI is distributed differently |
| `@badlogic/pi-agent` | ❌ No | No public npm package |
| `@mistralai/mistral-vibe` | ❌ No | No public npm package |
| `@nousresearch/hermes-agent` | ❌ No | No public npm package |
| `@xai/grok-cli` | ❌ No | No public npm package |
| `kiro-cli` | ✅ Yes | Public npm package |
| `kilo` | ✅ Yes | Public npm package |
| `reasonix` | ✅ Yes | Public npm package |

6 out of 10 Tier 2 packages are uninstallable.

### Proposed Change

**Remove** the 6 `install_npm_cli` calls for non-existent packages. **Add** each to the existing "Not auto-installable" section with a clear reason and manual install instructions (when known).

### Tradeoffs

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **Remove + document** (chosen) | Clean summary. Users see exactly what's missing and how to fix it. | Slightly more text in the summary. | ✅ |
| Keep + let them fail | No code change. Script already handles failures gracefully. | Misleading: summary shows "6 failed" which looks like a build problem. Users don't know these CLIs have no npm package at all. | ❌ |
| Try alternative install methods | More CLIs available out of the box. | Each CLI needs research: does it have a curl script? GitHub release binary? pip package? Fragile — install URLs change. Bloats the Docker image with per-CLI logic. | ❌ |
| Remove the entire Tier 2 | Simplest. | Loses `kiro-cli`, `kilo`, `reasonix` which are valid, useful CLIs. | ❌ |

### Implementation Detail

**File:** `deploy/scripts/install-clis.sh`

**Lines to remove** (6 `install_npm_cli` calls):
```sh
install_npm_cli "Trae CLI" "@trae/cli@latest"
install_npm_cli "Kimi CLI" "@anthropic-ai/kimi-cli@latest"
install_npm_cli "Pi Agent" "@badlogic/pi-agent@latest"
install_npm_cli "Mistral Vibe CLI" "@mistralai/mistral-vibe@latest"
install_npm_cli "Hermes Agent" "@nousresearch/hermes-agent@latest"
install_npm_cli "Grok Build CLI" "@xai/grok-cli@latest"
```

**Lines to add** to the "Not auto-installable" section (before the existing entries):
```sh
echo "  ⊘ Trae CLI — no public npm package; install from https://www.trae.ai/download"
echo "  ⊘ Kimi CLI — no public npm package; see https://github.com/moonshotai/kimi-cli"
echo "  ⊘ Pi Agent — no public npm package; install from https://github.com/badlogic/pi-agent"
echo "  ⊘ Mistral Vibe — no public npm package; see https://github.com/mistralai/mistral-vibe"
echo "  ⊘ Hermes Agent — no public npm package; see https://github.com/nousresearch/hermes-agent"
echo "  ⊘ Grok Build CLI — no public npm package; see https://github.com/xai/grok-cli"
```

**Structural note:** The "Not auto-installable" section currently prints after all installs but before the PATH linking and summary. The new entries should be added to this section, grouped with the existing entries (Antigravity, OpenClaw, Cline, Copilot).

### Why Not Remove Tier 2 Entirely

`kiro-cli`, `kilo`, and `reasonix` are valid public npm packages. They should continue to be installed. The Tier 2 header "Available but less common" remains accurate for the surviving 4 packages (`@opencode-ai/cli`, `kiro-cli`, `kilo`, `reasonix`).

---

## Files Changed

| File | Change | Lines |
|---|---|---|
| `apps/daemon/src/server.ts` | Add `'/api/agents'` to `openProbePaths` | +1 |
| `deploy/scripts/install-clis.sh` | Remove 6 `install_npm_cli` calls, add 6 documentation entries | −6, +6 |
| `openspec/changes/fix-cli-detection/tasks.md` | Task breakdown (next phase) | new file |

**Estimated total diff:** ~15 lines changed across 2 files. Well under the 600-line review budget.

---

## Test Strategy

### Existing Tests (must pass)

- `apps/daemon/tests/runtimes/detection-diagnostics.test.ts` — agent detection and diagnostic emission
- `apps/daemon/tests/runtimes/executables.test.ts` — PATH resolution
- `apps/daemon/tests/runtimes/registry-and-args.test.ts` — agent definitions
- `apps/daemon/tests/headless-runs.test.ts` — end-to-end chat runs (may touch agent resolution)

### New Test: Auth bypass for `/api/agents`

Add to `apps/daemon/tests/`:
- **Test:** `GET /api/agents` returns 200 when `OD_API_TOKEN` is set and request has no `Authorization` header
- **Test:** `GET /api/agents?stream=1` returns 200 SSE stream under same conditions
- **Test:** `GET /api/projects` returns 401 under same conditions (regression guard)

### New Test: install-clis.sh behavior

This is a shell script tested indirectly through Docker build. The Docker CI workflow (`docker-image.yml`) builds on every push to `main` and PR touching `deploy/**`. The build serves as the integration test.

A unit test for the script is possible by running it in a controlled environment, but the cost (Docker-in-Docker CI setup) outweighs the benefit for a 6-line removal change. The existing Docker build workflow provides sufficient coverage.

---

## Rollback Plan

Both changes are independently reversible:

1. **Auth bypass:** Remove `'/api/agents'` from the `Set`. `/api/agents` returns to auth-gated behavior. Zero data migration.
2. **install-clis.sh:** Revert the file. The removed packages were already failing silently — reinstating them restores the previous (noisy but functional) behavior.

No database migrations. No API version bumps. No client-side cache invalidation needed.
