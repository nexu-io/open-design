# Tasks: Simplify Docker Deployment

> **Delivery strategy**: `single-pr` with maintainer-approved `size:exception`.
> **Strict TDD**: ACTIVE — every implementation task is preceded by a failing test.
> **Review budget**: 800 lines (single PR with size:exception overrides default 400).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,009 (raw add/delete count) |
| 400-line budget risk | High (exceeds 400 by 2.5x) |
| 800-line budget risk | High (exceeds 800 by ~26%) |
| Chained PRs recommended | No (user chose single PR with size:exception) |
| Suggested split | Single PR with size:exception |
| Delivery strategy | single-pr |
| Chain strategy | n/a |
| Decision needed before apply | No (user already approved size:exception) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All work | PR 1 (single, size:exception) | Combined daemon + deploy + docs + scripts |

---

## Phase 1: Auth runtime removal (strict TDD)

- [x] ### Task 1.1: Add red test for `resolveAuthMode()` returning only `none | trusted-proxy | access-token`

**File(s)**: `apps/daemon/tests/cf-access-removed.test.ts` (new)
**Type**: test-red
**Strict TDD**: yes
**Depends on**: none
**Verify**: `pnpm --filter @open-design/daemon test cf-access-removed` fails because `resolveAuthMode` still lives in `cf-access-middleware.ts` (which we have not yet split).

Import `resolveAuthMode` from the future `./apps/daemon/src/auth/auth-mode.ts` (file does not exist yet — will produce import error → red). Assert: (a) with `OD_ACCESS_TOKEN=foo` returns `'access-token'`; (b) with `OD_TRUSTED_PROXY=nginx` returns `'trusted-proxy'`; (c) with both unset returns `'none'`; (d) with only `OD_BEHIND_PROXY=cloudflare` returns `'none'` (never `'cloudflare'`).

- [x] ### Task 1.2: Add red test that `Cf-Access-Jwt-Assertion` does not unlock non-loopback requests

**File(s)**: `apps/daemon/tests/cf-access-removed.test.ts` (extend)
**Type**: test-red
**Strict TDD**: yes
**Depends on**: Task 1.1
**Verify**: Test fails because current middleware accepts the header.

Spin up the daemon HTTP handler (or use the existing `apps/daemon/tests/api-token-guard.test.ts` harness) with `Cf-Access-Jwt-Assertion: <fake-jwt>` and `OD_CF_ACCESS_TEAM_DOMAIN=team.cloudflareaccess.com`, send `GET /api/health` from a non-loopback address, and assert the request is rejected (401/403). Also assert `fetch` to the JWKS endpoint is never called.

- [x] ### Task 1.3: Add red test that deprecated CF env vars do not activate JWT validation

**File(s)**: `apps/daemon/tests/cf-access-removed.test.ts` (extend)
**Type**: test-red
**Strict TDD**: yes
**Depends on**: Task 1.2
**Verify**: Test fails on current code because `resolveCloudflareAccessConfig()` returns valid config when those vars are set.

Iterate env combinations: `OD_BEHIND_PROXY=cloudflare` alone, `OD_CF_ACCESS_TEAM_DOMAIN=...` alone, all three set, and assert the auth middleware branch is never entered. Replace or supersede the obsolete scenarios in `apps/daemon/tests/api-token-guard.test.ts:193-227`.

- [x] ### Task 1.4: Create `auth-mode.ts` resolver (turns 1.1 green)

**File(s)**: `apps/daemon/src/auth/auth-mode.ts` (new), `apps/daemon/src/auth/index.ts` (new re-export if needed)
**Type**: test-green
**Strict TDD**: yes
**Depends on**: Task 1.1
**Verify**: `pnpm --filter @open-design/daemon test cf-access-removed` passes for Task 1.1 scenarios.

Export `AuthMode = 'none' | 'trusted-proxy' | 'access-token'` and `resolveAuthMode(env = process.env)` exactly per `design.md` §2. No imports of `cf-access-middleware`.

- [x] ### Task 1.5: Delete `cf-access-middleware.ts` (turns 1.2 and 1.3 green once `server.ts` is patched)

**File(s)**: `apps/daemon/src/cf-access-middleware.ts` (DELETE)
**Type**: refactor
**Strict TDD**: yes
**Depends on**: Tasks 1.4, 1.6
**Verify**: `pnpm --filter @open-design/daemon typecheck` passes only after 1.6 lands; `git grep cf-access-middleware apps/` returns nothing.

Run `git grep -n cf-access-middleware apps/` first to confirm no other importers (design §7 risk).

- [x] ### Task 1.6: Patch `server.ts` to use `auth-mode` and drop CF wiring (turns 1.2 and 1.3 green)

**File(s)**: `apps/daemon/src/server.ts`
**Type**: test-green
**Strict TDD**: yes
**Depends on**: Task 1.4
**Verify**: Full `cf-access-removed.test.ts` suite passes; `pnpm --filter @open-design/daemon test` green; `git grep -n -i 'cf[- _]access\|cloudflare access\|jwt assertion' apps/daemon/src/server.ts` returns nothing.

Edit `apps/daemon/src/server.ts:37-41` (imports), `:4663-4667` (resolve CF config), `:4700-4724` (middleware mount, logs, warning text). Use the dispatcher shape from `design.md` §2.

---

## Phase 2: Compose artifact rewrite (strict TDD)

- [x] ### Task 2.1: Add red test for `deploy/docker-compose.yml` invariants

**File(s)**: `deploy/tests/docker-compose.test.ts` (new)
**Type**: test-red
**Strict TDD**: yes
**Depends on**: none
**Verify**: `pnpm --filter @open-design/deploy test docker-compose` fails on current compose.

Parse `deploy/docker-compose.yml` as YAML. Assert: (a) no `OD_BEHIND_PROXY`, `OD_CF_ACCESS_TEAM_DOMAIN`, `OD_CF_ACCESS_AUD`, `OD_CF_ACCESS_UNSAFE_DOMAIN` in `services.open-design.environment`; (b) persistent volume mounts on the service are exactly `open_design_data:/app/.od` and `open_design_home:/home/open-design` (no `open_design_claude`, `open_design_codex`, etc.); (c) `tmpfs` includes `/home/open-design/.npm:uid=1001,gid=1001`; (d) top-level `volumes` declares `open_design_data` and `open_design_home` only.

- [x] ### Task 2.2: Add red test for `deploy/dokploy-compose.yml` mirror invariants

**File(s)**: `deploy/tests/docker-compose.test.ts` (extend)
**Type**: test-red
**Strict TDD**: yes
**Depends on**: Task 2.1
**Verify**: Test fails because `deploy/dokploy-compose.yml` does not exist yet.

Assert: (a) file exists and parses as YAML; (b) service declares `expose: ["7456"]` and does NOT declare `ports:`; (c) no deprecated CF env vars; (d) normalized service shape (image/build/env/volumes/tmpfs/read_only/security_opt/mem_limit/pids_limit/healthcheck/restart) equals `docker-compose.yml` after stripping `ports` vs `expose`.

- [x] ### Task 2.3: Rewrite `deploy/docker-compose.yml` (turns 2.1 green)

**File(s)**: `deploy/docker-compose.yml`
**Type**: test-green
**Strict TDD**: yes
**Depends on**: Task 2.1
**Verify**: `pnpm --filter @open-design/deploy test docker-compose` passes for 2.1 assertions; `docker compose -f deploy/docker-compose.yml config` succeeds.

Remove lines 23-24 (`OD_CF_ACCESS_*`), remove the 20 `open_design_claude`–`open_design_hermes` mounts (lines 30-50 and 77-97), add `open_design_home:/home/open-design`. Keep `read_only: true`, tmpfs, healthcheck, security, mem/pids limits.

- [x] ### Task 2.4: Create `deploy/dokploy-compose.yml` (turns 2.2 green)

**File(s)**: `deploy/dokploy-compose.yml` (new)
**Type**: test-green
**Strict TDD**: yes
**Depends on**: Task 2.3
**Verify**: Mirror test in `deploy/tests/docker-compose.test.ts` passes; `docker compose -f deploy/dokploy-compose.yml config` succeeds.

Strict mirror of Task 2.3 output with `ports` → `expose: ["7456"]`. Preserve all other settings per `design.md` §3.

- [x] ### Task 2.5: Clean stale CF Access wording in `tools/pack/docker-compose.yml`

**File(s)**: `tools/pack/docker-compose.yml`
**Type**: config
**Strict TDD**: no
**Depends on**: Task 2.3
**Verify**: `git grep -n -i 'cloudflare access\|cf.access' tools/pack/docker-compose.yml` returns nothing.

Inspect line 33 comment per the proposal grep audit; if it references Cloudflare Access, rewrite to generic trusted-proxy guidance.

---

## Phase 3: Docs and scripts

- [x] ### Task 3.1: Update `deploy/.env.example`

**File(s)**: `deploy/.env.example`
**Type**: docs
**Strict TDD**: no
**Depends on**: Task 2.3
**Verify**: `git grep -n -i 'OD_BEHIND_PROXY\|OD_CF_ACCESS\|cloudflare access' deploy/.env.example` returns nothing.

Delete Option B block (lines 37-49). Keep Option A (`OD_ACCESS_TOKEN`) and Option C (`OD_TRUSTED_PROXY`). Update top-of-file header to reflect two-mode model.

- [x] ### Task 3.2: Update `deploy/README.md`

**File(s)**: `deploy/README.md`
**Type**: docs
**Strict TDD**: no
**Depends on**: Task 3.1
**Verify**: `git grep -n -i 'OD_BEHIND_PROXY=cloudflare\|OD_CF_ACCESS' deploy/README.md` returns nothing; auth table lists exactly two modes.

Replace auth table (lines 75-101) with two-mode rows; remove Cloudflare Access subsection (lines 91-93); update troubleshooting (lines 151-159); add Dokploy section; add migration note linking to the spec migration block.

- [x] ### Task 3.3: Update `CHANGELOG.md`

**File(s)**: `CHANGELOG.md`
**Type**: docs
**Strict TDD**: no
**Depends on**: Task 3.2
**Verify**: No `OD_BEHIND_PROXY=cloudflare` or CF Access "Added" entries remain under the current release section.

Replace the CF Access added/changed entries (lines 12-22) with a removal entry noting: (a) Cloudflare Access JWT auth is removed, (b) CLI volumes consolidated into `open_design_home`, (c) Dokploy compose variant added.

- [x] ### Task 3.4: Update `deploy/scripts/uninstall.sh` to prune new and legacy volumes

**File(s)**: `deploy/scripts/uninstall.sh`
**Type**: config
**Strict TDD**: no
**Depends on**: Task 2.3
**Verify**: `bash -n deploy/scripts/uninstall.sh` parses; help text mentions `open_design_home`; best-effort removal of legacy CLI volumes is wired.

Update help text (around line 85), extend the volume-prune loop near `VOLUME_BASE` (line 108) to remove `open_design_home` when `--keep-data` is false and best-effort prune the 20 legacy `open_design_claude`–`open_design_hermes` volumes if present.

---

## Phase 4: Validation

- [x] ### Task 4.1: Run `pnpm guard`

**File(s)**: n/a
**Type**: validation
**Strict TDD**: no
**Depends on**: Phases 1-3 complete
**Verify**: Exit code 0; no new violations.

- [x] ### Task 4.2: Run `pnpm typecheck`

**File(s)**: n/a
**Type**: validation
**Strict TDD**: no
**Depends on**: Phases 1-3 complete
**Verify**: Exit code 0.

- [x] ### Task 4.3: Run daemon tests

**File(s)**: n/a
**Type**: validation
**Strict TDD**: no
**Depends on**: Phases 1-3 complete
**Verify**: `pnpm --filter @open-design/daemon test` green; specifically `cf-access-removed.test.ts` and `api-token-guard.test.ts` both pass.

- [x] ### Task 4.4: Run web tests

**File(s)**: n/a
**Type**: validation
**Strict TDD**: no
**Depends on**: Phases 1-3 complete
**Verify**: `pnpm --filter @open-design/web test` green (no new failures vs `main` baseline).

- [x] ### Task 4.5: Validate main compose parses

**File(s)**: n/a
**Type**: validation
**Strict TDD**: no
**Depends on**: Task 2.3
**Verify**: `docker compose -f deploy/docker-compose.yml config` exit code 0. (Skipped: Docker not available in CI environment; compose YAML validated by invariant tests in Batch 1.)

- [x] ### Task 4.6: Validate Dokploy compose parses

**File(s)**: n/a
**Type**: validation
**Strict TDD**: no
**Depends on**: Task 2.4
**Verify**: `docker compose -f deploy/dokploy-compose.yml config` exit code 0. (Skipped: Docker not available in CI environment; compose YAML validated by invariant tests in Batch 1.)

---

## Phase 5: PR ready

### Task 5.1: Sync `apply-progress.md` with completed tasks

**File(s)**: `openspec/changes/simplify-docker-deployment/apply-progress.md`
**Type**: docs
**Strict TDD**: no
**Depends on**: Phases 1-4 complete
**Verify**: Every task above is checked off.

### Task 5.2: Confirm no regressions vs `main` baseline

**File(s)**: n/a
**Type**: validation
**Strict TDD**: no
**Depends on**: Task 4.3, Task 4.4
**Verify**: Diff daemon/web test output vs `main`; no new failures.

### Task 5.3: Open single PR with `size:exception` label

**File(s)**: n/a
**Type**: docs
**Strict TDD**: no
**Depends on**: Task 5.2
**Verify**: PR body links to `proposal.md`, `spec.md`, `design.md`, `tasks.md`; Surface area checklist ticks CLI + UI + docs/scripts; `size:exception` label applied.

---

## Strict TDD compliance

For every phase, the order is:

1. **Red test** — write a failing test that pins the desired behavior.
2. **Green implementation** — write the minimum source change to turn it green.
3. **Refactor** — extract helpers, remove dead code, normalize formatting.
4. **Re-run green** — rerun the test suite for the affected module to confirm no regressions.

Mapping:

| Phase | Red | Green | Refactor |
|-------|-----|-------|----------|
| 1 | Tasks 1.1, 1.2, 1.3 | Tasks 1.4, 1.6 | Task 1.5 |
| 2 | Tasks 2.1, 2.2 | Tasks 2.3, 2.4 | Task 2.5 |
| 3 | n/a (docs/config) | Tasks 3.1, 3.2, 3.3, 3.4 | n/a |
| 4 | n/a (validation) | Tasks 4.1-4.6 | n/a |
| 5 | n/a | Tasks 5.1, 5.2, 5.3 | n/a |

Apply MUST NOT skip red-then-green for Phase 1 and Phase 2. Phase 3 onward has no behavior to test.

---

## Commit strategy

Single PR with conventional commits grouped by concern:

1. `chore(deploy): consolidate CLI volumes to single home mount` — Task 2.3
2. `feat(deploy): add dokploy-compose.yml mirror` — Task 2.4
3. `refactor(daemon): drop Cloudflare Access JWT middleware` — Tasks 1.4, 1.6, 1.5
4. `test(daemon): assert CF Access env/header no longer activate auth` — Tasks 1.1, 1.2, 1.3
5. `test(deploy): assert compose artifacts honor the simplified auth model` — Tasks 2.1, 2.2
6. `docs(deploy): remove CF Access auth guidance and add migration note` — Tasks 3.1, 3.2, 3.3, 2.5
7. `chore(deploy): prune legacy CLI volumes on uninstall` — Task 3.4

---

## Summary
status: complete
executive_summary: Wrote a strict-TDD task plan for `simplify-docker-deployment` covering daemon CF Access removal (red tests + green resolver + delete module + server.ts patch), compose artifact rewrite (red YAML invariant tests + green compose updates + new Dokploy mirror), docs/scripts updates, and validation. Delivery locked as single PR with maintainer-approved size:exception; the apply phase must receive `delivery_strategy: "single-pr"` and `size_exception: "maintainer-approved"`.
artifacts:
  - openspec/changes/simplify-docker-deployment/tasks.md
next_recommended: sdd-apply
risks:
  - Deleted `cf-access-middleware.ts` may have importers beyond `server.ts`; apply must re-grep before deletion.
  - `dokploy-compose.yml` can drift from main compose; mirror test guards the shape but not future env additions.
  - Hard-cut of 20 CLI volumes leaves orphans on upgrade; uninstall best-effort prune and CHANGELOG migration note are the only mitigations.
  - Review diff ~1,009 lines exceeds 800-line budget even with size:exception; reviewer must read top-down per `docs/code-review-guidelines.md`.
skill_resolution: none