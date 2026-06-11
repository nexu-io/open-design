# Tasks: Redesign Trusted Proxy & Rename API Token

**Status:** draft
**Parent:** design.md

## Implementation Tasks

### Phase 1: Core Logic

- [x] **T1: Rewrite `resolveAuthMode()` + rename `AuthMode` type**
  - File: `apps/daemon/src/cf-access-middleware.ts`
  - Rename `AuthMode`: `"cf-access"` → `"trusted-proxy"`, `"bearer-token"` → `"access-token"`
  - Implement new priority: `OD_TRUSTED_PROXY=1` → `OD_ACCESS_TOKEN` → `none`
  - Add backward compat: `OD_BEHIND_PROXY=cloudflare` (with deprecation warning), `OD_API_TOKEN` (with deprecation warning)
  - New vars win over old vars when both set
  - `OD_BEHIND_PROXY=cloudflare` preserves strict CF config check (throws if missing)
  - `OD_TRUSTED_PROXY=1` without CF config is valid (no throw)
  - Update JSDoc
  - Acceptance: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7

- [x] **T2: Rewire server.ts middleware branches**
  - File: `apps/daemon/src/server.ts`
  - Rename auth mode branches: `'cf-access'` → `'trusted-proxy'`, `'bearer-token'` → `'access-token'`
  - In `'trusted-proxy'` branch: only enable CF middleware when `resolveCloudflareAccessConfig()` returns valid config
  - In `'access-token'` branch: rename `OD_API_TOKEN` → `OD_ACCESS_TOKEN`, error code `API_TOKEN_REQUIRED` → `ACCESS_TOKEN_REQUIRED`
  - Update startup guard error message to mention new env var names
  - Update all comments referencing old env var names
  - Precedence warning when both `OD_TRUSTED_PROXY=1` and `OD_ACCESS_TOKEN` are set
  - Acceptance: AC-1, AC-3, AC-4, AC-5, AC-8

### Phase 2: Tests

- [x] **T3: Update existing tests for new env var names**
  - File: `apps/daemon/tests/api-token-guard.test.ts`
  - Rename all `OD_API_TOKEN` → `OD_ACCESS_TOKEN`
  - Update error message assertions
  - File: `apps/daemon/tests/project-preview-containment.test.ts`
  - Rename `OD_API_TOKEN` → `OD_ACCESS_TOKEN`
  - Acceptance: AC-10

- [x] **T4: Add new tests for trusted-proxy mode**
  - File: `apps/daemon/tests/api-token-guard.test.ts` (extend)
  - Test: `OD_TRUSTED_PROXY=1` enables trusted-proxy mode without token
  - Test: `OD_TRUSTED_PROXY=1` + CF config enables JWT validation
  - Test: `OD_TRUSTED_PROXY=1` without CF config trusts proxy (no JWT)
  - Test: `OD_ACCESS_TOKEN` enables access-token mode
  - Test: `OD_TRUSTED_PROXY=1` takes precedence over `OD_ACCESS_TOKEN`
  - Test: `OD_BEHIND_PROXY=cloudflare` deprecated but works
  - Test: `OD_API_TOKEN` deprecated but works
  - Test: New var wins over old var when both set
  - Acceptance: AC-1 through AC-8

### Phase 3: Deploy & Docs

- [x] **T5: Update deployment manifests**
  - `deploy/docker-compose.yml`: `OD_API_TOKEN` → `OD_ACCESS_TOKEN`, `OD_BEHIND_PROXY` → `OD_TRUSTED_PROXY`
  - `tools/pack/docker-compose.yml`: same renames
  - `tools/pack/helm/open-design/templates/secret.yaml`: `OD_API_TOKEN` → `OD_ACCESS_TOKEN`
  - `tools/pack/helm/open-design/values.yaml`: `apiToken` → `accessToken`, update comment
  - `deploy/azure/azure-pipelines.yml`: `OD_API_TOKEN` → `OD_ACCESS_TOKEN`
  - `deploy/scripts/install.sh`: `OD_API_TOKEN` → `OD_ACCESS_TOKEN`
  - Acceptance: AC-9

- [x] **T6: Update documentation**
  - `README.md`: update all `OD_API_TOKEN` / `OD_BEHIND_PROXY` references
  - `QUICKSTART.md`: update env var examples and descriptions
  - `deploy/README.md`: update env var references, macOS troubleshooting
  - `CHANGELOG.md`: add entry for this change
  - Acceptance: AC-9

### Phase 4: Verification

- [x] **T7: Run full verification suite**
  - `pnpm guard` — repo boundary checks
  - `pnpm typecheck` — full repo type checking
  - `pnpm --filter @open-design/daemon test` — daemon test suite (focused)
  - Verify no remaining references to old env var names in source (grep audit)
  - Acceptance: AC-10, AC-11

## Execution Order

```
T1 ── T2 ── T3 ── T4 ── T5 ── T6 ── T7
```

Sequential — each phase depends on the previous. T1 and T2 are the core refactor. T3 and T4 verify correctness. T5 and T6 update the periphery. T7 is the final gate.

## Review Workload Estimate

- T1: ~40 lines (core refactor)
- T2: ~30 lines (wiring)
- T3: ~15 lines (renames)
- T4: ~50 lines (new tests)
- T5: ~20 lines (manifests)
- T6: ~20 lines (docs)
- **Total diff: ~175 lines** — under the 600-line review budget. Single PR.

## Verification

After all tasks are complete:
1. `pnpm guard` passes
2. `pnpm typecheck` passes
3. `pnpm --filter @open-design/daemon test` passes (all api-token-guard + project-preview-containment tests)
4. `grep -r "OD_BEHIND_PROXY\|OD_API_TOKEN" apps/daemon/src/` returns only backward-compat references in `resolveAuthMode()` and comments explaining deprecation
5. `grep -r "OD_BEHIND_PROXY\|OD_API_TOKEN" deploy/ tools/pack/` returns zero results (all migrated)
