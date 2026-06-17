# Exploration: Simplify Docker Deployment

**Status:** complete
**Date:** 2026-06-17

## Goal

Simplify `deploy/docker-compose.yml` by (1) removing Cloudflare Access env vars from defaults, (2) consolidating 20 named CLI volumes into one home-directory mount, and (3) adding a `dokploy-compose.yml` sibling that uses `expose:` instead of `ports:`.

---

## Current State

### Compose env vars (deploy/docker-compose.yml:11-24)

The service declares 10 environment variables. Lines 22-24 are the Cloudflare Access block:

```yaml
OD_TRUSTED_PROXY: ${OD_TRUSTED_PROXY:-}          # line 22
OD_CF_ACCESS_TEAM_DOMAIN: ${OD_CF_ACCESS_TEAM_DOMAIN:-}  # line 23
OD_CF_ACCESS_AUD: ${OD_CF_ACCESS_AUD:-}           # line 24
```

All three default to empty. The CF vars are effectively no-ops unless the operator fills them in `.env`.

### Volume layout (deploy/docker-compose.yml:27-50, 74-97)

20 named volumes for CLI dotfiles + 1 data volume. Each maps a single dotfile directory:

```yaml
- open_design_claude:/home/open-design/.claude
- open_design_codex:/home/open-design/.codex
# ... 18 more
```

The Dockerfile (line 118-139) creates all 20 directories via `mkdir -p` and `chown -R open-design:open-design /home/open-design`.

### `read_only: true` + tmpfs (deploy/docker-compose.yml:51-54)

Root filesystem is read-only. Two tmpfs mounts: `/tmp` and `/home/open-design/.npm:uid=1001,gid=1001`.

### No Dokploy variant

No `dokploy-compose.yml` exists anywhere in the repo. No Dokploy references found.

### Active overlapping change: `redesign-trusted-proxy`

Status: **verified complete** (all tasks checked, 12/12 tests pass). That change:
- Renamed `OD_BEHIND_PROXY` → `OD_TRUSTED_PROXY`, `OD_API_TOKEN` → `OD_ACCESS_TOKEN`
- Already updated `deploy/docker-compose.yml` env var names (but NOT the CF var lines)
- `OD_TRUSTED_PROXY=1` WITHOUT CF config is now valid (trusted proxy, no JWT)
- CF vars (`OD_CF_ACCESS_TEAM_DOMAIN`, `OD_CF_ACCESS_AUD`) remain in compose defaults as empty passthrough

---

## Findings

### Q1: Cloudflare Access Runtime Usage

**Verdict: Safe to remove from compose defaults. Not dead code, but optional.**

Evidence:
- `apps/daemon/src/cf-access-middleware.ts:399-400` — `resolveCloudflareAccessConfig()` reads `OD_CF_ACCESS_TEAM_DOMAIN` and `OD_CF_ACCESS_AUD` from `process.env` (or passed env object). These are real runtime knobs.
- `apps/daemon/src/cf-access-middleware.ts:579-618` — `resolveAuthMode()` checks `OD_TRUSTED_PROXY` first. If `OD_TRUSTED_PROXY=1` AND CF vars are set → JWT validation enabled. If `OD_TRUSTED_PROXY=1` WITHOUT CF vars → trusted proxy, no JWT (valid since redesign-trusted-proxy).
- `apps/daemon/src/server.ts:4700-4701` — Server wiring only enables CF middleware when `resolveCloudflareAccessConfig()` returns valid config.
- `apps/daemon/tests/api-token-guard.test.ts:193-227` — Tests cover both paths: `OD_BEHIND_PROXY=cloudflare` with CF config (deprecated path) and without (throws).

**Why removal is safe:**
1. The compose file defaults them to empty (`${OD_CF_ACCESS_TEAM_DOMAIN:-}`) — they're already no-ops for users who don't set them.
2. The daemon reads from `process.env`, not from compose. Users who need CF JWT validation set them in `.env`.
3. `.env.example` (lines 37-49) documents Option B with the CF vars. That documentation stays.
4. The compose `environment:` block is for DEFAULTS that most users need. CF Access is a niche mode.

**Risk if removed:** Option B users who copy-paste compose without reading `.env.example` won't see CF vars and might miss them. Mitigation: `.env.example` already documents them, and the README auth table mentions them.

### Q2: Volume Consolidation

**Verdict: Single `open_design_home:/home/open-design` mount is viable.**

**Path analysis — all CLI configs live under `/home/open-design/`:**

| Compose mount | Dockerfile mkdir (line) | Notes |
|---|---|---|
| `.claude` | 119 | Direct dotfile |
| `.codex` | 120 | Direct dotfile |
| `.config/gemini` | 121 | Nested under `.config/` |
| `.config/devin` | 122 | Nested under `.config/` |
| `.copilot` | 123 | Direct dotfile |
| `.cursor` | 124 | Direct dotfile |
| `.opencode` | 125 | Direct dotfile |
| `.openclaw` | 126 | Direct dotfile |
| `.deepseek` | 127 | Direct dotfile |
| `.qoder` | 128 | Direct dotfile |
| `.pi/agent` | 129 | Nested — see discrepancy below |
| `.config/kiro` | 130 | Nested under `.config/` |
| `.config/kilo` | 131 | Nested under `.config/` |
| `.vibe` | 132 | Direct dotfile |
| `.trae` | 133 | Direct dotfile |
| `.kimi` | 134 | Direct dotfile |
| `.qwen` | 135 | Direct dotfile |
| `.aider` | 136 | Direct dotfile |
| `.grok` | 137 | Direct dotfile |
| `.reasonix` | 138 | Direct dotfile |
| `.hermes` | 139 | Direct dotfile |

**`.pi` path discrepancy:** Compose mounts `open_design_pi:/home/open-design/.pi` (line 40) but Dockerfile creates `/home/open-design/.pi/agent` (line 129). The volume mount covers `.pi/` and the `agent/` subdir lives inside it. This works but is inconsistent with `install-clis.sh` (line 213) which documents `~/.pi/agent/`. Not a bug, just a naming mismatch.

**`read_only: true` interaction:**
- The compose declares `read_only: true` (line 51). Individual named volumes are writable mount points that override the read-only rootfs.
- A single `/home/open-design` volume would serve the same purpose — it's a writable mount overriding the read-only rootfs at that path.
- The `tmpfs` on `/home/open-design/.npm` (line 54) would be nested inside the volume mount. Docker tmpfs mounts take precedence over bind/volume mounts at the same path, so `.npm` would still be ephemeral. This is correct behavior.

**`install-clis.sh` credential paths:**
- Grep for credentials stored outside `/home/open-design/`: none found. All CLIs store config in dotfiles under `$HOME` (which is `/home/open-design` for the `open-design` user).
- System-level installs go to `/usr/local/lib/open-design-clis/` (line 18-20), which is in the image, not in a volume.

**Migration story:**
- Existing users with 20 named volumes will have orphaned volumes after switching. Docker does NOT auto-prune named volumes.
- `docker volume ls --filter "name=open_design_" --filter "dangling=true"` finds them.
- `docker compose down` with the old compose removes the old volumes if they're declared in the compose file. With the new compose, they become orphaned.
- Recommendation: document a one-liner cleanup in the PR description / CHANGELOG. Accept orphaned volumes as a known migration cost.

**Backward compatibility:**
- Hard-cut is cleaner. The old volumes are a maintenance burden (add a new CLI → update 3 places: Dockerfile mkdir, compose volumes, compose volume declarations).
- Keep the old volume list as a comment block for users who want to revert.

### Q3: Dokploy Compose Semantics

**Verdict: Straightforward `ports:` → `expose:` swap.**

Dokploy conventions (from user request and general knowledge):
- `expose:` makes ports available on the container's network but does NOT publish them to the host. Dokploy's Traefik reverse proxy connects to the container network directly.
- `ports:` publishes to the host, which conflicts with Traefik and causes port-mapping duplicates.

**Healthcheck:** Runs inside the container's network namespace. `fetch('http://127.0.0.1:7456/api/health')` works regardless of `expose:` vs `ports:`. No change needed.

**`127.0.0.1:` binding:** The original compose binds to `127.0.0.1:${OPEN_DESIGN_PORT:-7456}:7456` (line 26). This is a compose-only security measure. Dokploy needs the container reachable from its proxy network, so the dokploy variant must NOT bind to localhost. The `OD_BIND_HOST: 0.0.0.0` (line 14) already handles this — the daemon listens on all interfaces inside the container.

**Structural mirror:** The user wants the dokploy variant to be structurally identical to the original except for the port change. Same image, env vars, volumes, container_name, healthcheck, restart policy, security options, mem_limit, pids_limit.

**Naming:** User specified `dokploy-compose.yml`. This is the Dokploy convention filename.

**README:** Needs a section explaining the difference and when to use which.

### Q4: Scope Overlap with `redesign-trusted-proxy`

**Verdict: Complementary, not duplicating. No dependency.**

The `redesign-trusted-proxy` change:
- Renamed env vars in the daemon code and compose defaults
- Changed auth mode resolution semantics
- Already shipped (verified complete)

This `simplify-docker-deployment` change:
- Removes CF vars from compose defaults (lines 23-24) — these were NOT touched by redesign-trusted-proxy
- Consolidates volumes — unrelated to auth
- Adds dokploy variant — unrelated to auth

The two changes are independent. This change targets compose/VOLUME/PORT layer only. The daemon code is untouched.

### Q5: Test Surface

**No tests reference compose files, volume names, or the specific env var lines being removed.**

- `grep -r "open_design_claude\|open_design_codex\|open_design_" --include="*.test.*"` → zero matches for volume names in tests.
- `grep -r "docker-compose" --include="*.test.*"` → zero matches.
- `deploy/tests/install.test.ts` exists but tests the install script, not the compose file directly.
- `apps/daemon/tests/api-token-guard.test.ts` tests auth modes via `process.env`, not compose file contents.

**Impact:** This change has zero test breakage risk. The compose file is a deployment artifact, not a tested code path.

### Q6: Adjacent Risks (Out of Scope but Flagged)

1. **`uninstall.sh` only removes `open_design_data` volume** (line 108, 202-204). It does NOT remove the 20 CLI volumes. After consolidation to one home volume, the uninstall script should optionally remove that too. Not in scope but worth noting.

2. **`install-clis.sh` output (lines 204-216) lists dotfile paths that don't match compose volume names exactly.** For example, it says `~/.kiro/` but the compose mounts `.config/kiro`. The install script's output is informational only, not functional.

3. **`tools/pack/docker-compose.yml` uses a completely different volume layout** (lines 55-57: `od-data:/data/od`, `od-config:/data/config`). It has NO CLI volumes. This is a hosted/deployment compose, not a local-dev compose. No action needed.

4. **`NODE_OPTIONS` default (line 13):** `--max-old-space-size=192` is a tuning knob. Not broken, just adjacent.

5. **`OPEN_DESIGN_MEM_LIMIT=384m` (line 57):** Container memory limit. Already well-documented in README.

6. **`OPEN_DESIGN_ALLOWED_ORIGINS` empty default (line 15):** Correct for localhost-only deployments. Users behind a proxy must set it.

---

## Scope Overlap Decision

This change **complements** `redesign-trusted-proxy`. It does NOT supersede or depend on it.

- `redesign-trusted-proxy` owns: daemon auth logic, env var renames, middleware wiring, test updates
- `simplify-docker-deployment` owns: compose defaults cleanup, volume consolidation, dokploy variant

The CF var removal (lines 23-24 of docker-compose.yml) is a compose-layer decision that `redesign-trusted-proxy` intentionally left alone (its T5 updated var names but kept the CF block). This change completes the cleanup.

---

## Risks and Unknowns

| Risk | Severity | Mitigation |
|---|---|---|
| Orphaned volumes after migration | Low | Document cleanup one-liner in CHANGELOG |
| CF Access users miss the vars after compose update | Low | `.env.example` documents them; README auth table unchanged |
| `tmpfs` on `.npm` might not work inside volume mount | Low | Docker tmpfs overrides bind/volume at same path — verified behavior |
| `dokploy-compose.yml` becomes stale if compose changes | Medium | Add a comment linking the two files; consider CI diff check |
| `.pi` vs `.pi/agent` path inconsistency | Low | Not a bug; volume covers `.pi/` and `agent/` is inside |

---

## Summary

```yaml
status: complete
executive_summary: >
  Three focused changes to deploy/: (1) remove empty CF Access env var defaults
  from docker-compose.yml (safe — daemon reads from process.env, .env.example
  documents them), (2) replace 20 named CLI volumes with one
  open_design_home:/home/open-design mount (all CLI configs live there, tmpfs
  override works, orphaned volumes are acceptable migration cost), (3) add
  dokploy-compose.yml that mirrors the original with ports→expose swap. No
  daemon code changes. No test breakage. Complements redesign-trusted-proxy
  without overlap.
artifacts:
  - openspec/changes/simplify-docker-deployment/explore.md
next_recommended: sdd-propose
risks:
  - Orphaned Docker volumes after migration (low, documented)
  - dokploy-compose.yml can drift from main compose (medium, mitigated by comments)
  - CF Access users must read .env.example (low, existing behavior)
skill_resolution: none
```
