# Tasks: Fix CLI Detection in Web UI

**Status:** draft
**Parent:** design.md

## Implementation Tasks

- [x] **T1: Open `/api/agents` in auth middleware**
  - File: `apps/daemon/src/server.ts`
  - Add `'/api/agents'` to the `openProbePaths` Set (~line 4701)
  - Rationale: `req.path` excludes query strings, so one entry covers both `GET /api/agents` and `GET /api/agents?stream=1`
  - Acceptance: AC-1, AC-2, AC-3

- [x] **T2: Remove broken npm packages from `install-clis.sh`**
  - File: `deploy/scripts/install-clis.sh`
  - Remove 6 `install_npm_cli` calls in Tier 2:
    - `"Trae CLI" "@trae/cli@latest"`
    - `"Kimi CLI" "@anthropic-ai/kimi-cli@latest"`
    - `"Pi Agent" "@badlogic/pi-agent@latest"`
    - `"Mistral Vibe CLI" "@mistralai/mistral-vibe@latest"`
    - `"Hermes Agent" "@nousresearch/hermes-agent@latest"`
    - `"Grok Build CLI" "@xai/grok-cli@latest"`
  - Acceptance: AC-4, AC-5

- [x] **T3: Document removed CLIs as "Not auto-installable"**
  - File: `deploy/scripts/install-clis.sh`
  - Add 6 entries to the existing "Not auto-installable" section, each with:
    - `⊘` symbol (matching existing convention)
    - CLI name
    - Reason: "no public npm package"
    - Manual install URL or instructions
  - Acceptance: AC-4

- [x] **T4: Write auth bypass test for `/api/agents`**
  - New test file or addition to existing: `apps/daemon/tests/runtimes/` or `apps/daemon/tests/`
  - Test 1: `GET /api/agents` returns 200 without `Authorization` header when `OD_API_TOKEN` is set
  - Test 2: `GET /api/agents?stream=1` returns 200 SSE stream without auth
  - Test 3 (regression): `GET /api/projects` returns 401 without auth (prove other endpoints still protected)
  - Acceptance: AC-1, AC-2, AC-3

- [x] **T5: Run existing test suites — no regressions**
  - `pnpm --filter @open-design/daemon test` — daemon unit tests
  - `pnpm typecheck` — full repo type checking
  - `pnpm guard` — repo boundary checks
  - Acceptance: AC-7

- [x] **T6: Verify Docker build (smoke test)**
  - Run `docker build -f deploy/Dockerfile .` to confirm the script completes
  - Check the build output for the corrected install summary
  - Acceptance: AC-6

## Execution Order

```
T1 ──┬── T4 ── T5 ── T6
     │
T2 ──┴── T3
```

T1 and T2/T3 are independent and can be done in any order. T4 depends on T1 (test needs the code change). T5 runs after all code changes. T6 is the final integration gate.

## Review Workload Estimate

- T1: 1 line added
- T2: 6 lines removed
- T3: ~6 lines added
- T4: ~40 lines (new test)
- **Total diff: ~55 lines** — well under the 600-line review budget. Single PR.

## Verification

After all tasks are complete:
1. `pnpm guard` passes
2. `pnpm typecheck` passes  
3. `pnpm --filter @open-design/daemon test` passes
4. Docker build completes without install-clis.sh failures
5. In a running container with `OD_API_TOKEN` set, `curl -s http://localhost:7456/api/agents | jq '.agents | length'` returns > 0
