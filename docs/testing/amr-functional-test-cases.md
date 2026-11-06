# AMR Functional Test Cases

## Summary

This document covers manual functional verification for the AMR (vela) runtime on the `feat/amr-runtime-acp` branch.

It is written against the current implementation shape:

- AMR is exposed as a daemon agent with `agentId = amr`
- AMR availability depends on resolving a runnable `vela` binary
- AMR sign-in state is derived from `~/.vela/config.json`
- AMR onboarding, settings, inline switcher, and chat-run behavior are all gated by daemon-reported runtime and login status

Use this as a manual regression checklist in local dev, QA, or pre-release validation.

## Test Environments

### Env A: Fake Vela (recommended for routine UI verification)

Use this when verifying entry visibility, login UI, onboarding flow, and basic AMR selection without requiring a real AMR backend.

Expected setup:

- `agentCliEnv.amr.VELA_BIN` points to `apps/daemon/tests/fixtures/fake-vela.mjs`
- `/api/agents` returns `amr.available = true`
- `/api/integrations/vela/status` can be driven to signed-in / signed-out states through the fake login route

### Env B: Real Vela (recommended for release validation)

Use this when verifying real `vela` installation, actual AMR account login, and real chat-run behavior.

Expected setup:

- `vela` is installed on PATH or `VELA_BIN` is configured
- `vela login` succeeds for the active AMR profile
- `~/.vela/config.json` contains the expected profile entry with a `runtimeKey`

## Coverage Areas

- Runtime availability and discovery
- AMR sign-in / sign-out state
- Onboarding entry behavior
- Settings / execution panel behavior
- Inline switcher behavior
- Chat-run behavior
- Profile handling (`prod`, `test`, `local`)
- Failure and recovery flows

## Manual Test Cases

| ID | Area | Preconditions | Steps | Expected Result |
| --- | --- | --- | --- | --- |
| AMR-001 | Runtime discovery | No `vela` on PATH and no `VELA_BIN` configured | Open app, fetch `/api/agents`, inspect execution UI | `amr` exists in agent list but `available=false`; AMR is not presented as an active selectable runtime entry |
| AMR-002 | Runtime discovery | `VELA_BIN` points to a runnable fake or real `vela` | Open app, fetch `/api/agents` | `amr.available=true`; AMR model list is present; agent path resolves to configured binary |
| AMR-003 | Runtime discovery | `VELA_BIN` points to a missing file | Restart daemon or refresh agents | `amr.available=false`; app does not crash; runtime is safely hidden/degraded |
| AMR-004 | Login status | No AMR profile in `~/.vela/config.json` | Call `/api/integrations/vela/status` | Returns `loggedIn=false`, correct `profile`, `user=null` |
| AMR-005 | Login status | Profile exists but lacks `runtimeKey` | Call `/api/integrations/vela/status` | Returns `loggedIn=false`; missing `runtimeKey` does not count as signed in |
| AMR-006 | Login status | Valid AMR profile exists with `runtimeKey` | Call `/api/integrations/vela/status` | Returns `loggedIn=true`; user info is projected; secrets are not exposed |
| AMR-007 | Login action | AMR available, signed out | Trigger AMR login from Settings or onboarding | Backend returns accepted login response; UI enters signing-in state |
| AMR-008 | Login completion | Fake or real login succeeds | Wait for polling to complete | UI flips from `Signing in…` to signed-in state without manual refresh |
| AMR-009 | Login error | Force `vela login` immediate failure | Trigger login | UI exits signing-in state and shows AMR-labeled error feedback |
| AMR-010 | Login concurrency | One AMR login already in flight | Trigger login twice quickly | Only one login request is effectively active; duplicate login is blocked or safely ignored |
| AMR-011 | Logout | Signed-in AMR profile exists | Trigger sign-out | Current AMR profile is removed; next status read returns `loggedIn=false`; other profiles remain untouched |
| AMR-012 | Settings visibility | AMR available, onboarding already completed | Open Settings → Execution | AMR appears as a selectable runtime/agent path in execution UI |
| AMR-013 | Settings visibility | AMR unavailable | Open Settings → Execution | AMR is not promoted as usable; no broken entry point or unusable CTA is shown |
| AMR-014 | Login pill signed-out | AMR available, signed out | Open Settings | AMR login pill shows signed-out state and Sign in action |
| AMR-015 | Login pill signed-in | AMR available, signed in | Open Settings | AMR login pill shows signed-in state, user email, and Sign out action |
| AMR-016 | Login pill profile badge | Active AMR profile is `test` | Open Settings | `TEST` badge is visible |
| AMR-017 | Login pill profile badge | Active AMR profile is `local` | Open Settings | `LOCAL` badge is visible |
| AMR-018 | Login pill profile badge | Active AMR profile is `prod` | Open Settings | No debug-style profile badge is shown |
| AMR-019 | Login pill event isolation | AMR card is rendered inside settings agent card | Click Sign in / Sign out | Login pill action does not accidentally trigger parent card selection click handler |
| AMR-020 | Login recovery | AMR login polling sees transient `/status` failure | Trigger login and simulate one failed status fetch | UI remains recoverable and flips to signed-in when later polling succeeds |
| AMR-021 | Onboarding default recommendation | AMR available | Open onboarding on a fresh config | AMR Cloud is the featured default runtime choice |
| AMR-022 | Onboarding signed-out flow | AMR available, signed out | Open onboarding and keep AMR Cloud selected | User sees sign-in requirement to continue |
| AMR-023 | Onboarding signed-in flow | AMR available, signed in | Open onboarding and continue | User can continue through onboarding without AMR login blocker |
| AMR-024 | Onboarding login completion | AMR available, signed out | Start login from onboarding and wait for polling | Onboarding advances after login completion |
| AMR-025 | Onboarding skip | AMR available, signed out | Click Skip | Onboarding exits cleanly without forcing AMR login |
| AMR-026 | Onboarding fallback | AMR unavailable | Open onboarding | AMR Cloud is not selected as a usable path; Local CLI remains usable and non-broken |
| AMR-027 | Local CLI segregation | AMR available | In onboarding, switch to Local coding agent view | AMR does not appear inside the Local CLI agent list |
| AMR-028 | Inline switcher visibility | AMR available | Open inline model switcher | AMR appears as a runtime row labeled `AMR`, not `AMR (vela)` |
| AMR-029 | Inline switcher signed-out state | AMR available, signed out | Open inline model switcher | Row shows compact sign-in status without leaking full account metadata |
| AMR-030 | Inline switcher signed-in state | AMR available, signed in | Open inline model switcher | Row shows compact signed-in status icon/label; no stale signed-out copy remains |
| AMR-031 | Inline switcher model list | AMR available | Open inline switcher and inspect AMR model selector | AMR model options come from AMR runtime model list; labels are stable |
| AMR-032 | Chat-run happy path | AMR available and signed in; real or fake vela can run | Select AMR and send one prompt | Assistant message completes successfully; run does not hang |
| AMR-033 | Default model substitution | AMR selected; config model is `default` | Send a prompt | Backend substitutes a concrete AMR fallback model before `session/prompt`; run succeeds |
| AMR-034 | Explicit AMR model | AMR selected; choose a concrete AMR model | Send a prompt | Selected AMR model is honored; run succeeds |
| AMR-035 | Prompt-before-model regression | Force backend to skip model selection or use a stub that rejects prompt-before-model | Send a prompt | Run fails with actionable error; no silent success |
| AMR-036 | Session/new failure | Use a stub or environment that forces `session/new` error | Send a prompt | User-visible run failure occurs; daemon does not hang |
| AMR-037 | Session/set_model failure | Use a stub or environment that forces `session/set_model` error | Send a prompt | User-visible run failure occurs; no partial success |
| AMR-038 | Session/prompt failure | Use a stub or environment that forces `session/prompt` error | Send a prompt | User-visible run failure occurs; run finalizes cleanly |
| AMR-039 | Silent child timeout | Use a stub that accepts spawn but never responds | Send a prompt | Run fails by timeout instead of hanging indefinitely |
| AMR-040 | Profile precedence | Set `OPEN_DESIGN_AMR_PROFILE=test` and `VELA_PROFILE=local` | Check status and login | AMR resolves `test`; lower-priority `VELA_PROFILE` does not win |
| AMR-041 | Profile isolation | Multiple profiles exist in `~/.vela/config.json` | Login, status, logout against one profile | Actions only affect resolved profile; unrelated profiles remain intact |
| AMR-042 | Packaged env propagation | Packaged build with AMR profile configured | Launch packaged app and inspect daemon env behavior | `OPEN_DESIGN_AMR_PROFILE` is forwarded into daemon spawn env |
| AMR-043 | Vela bundling | Beta mac arm64 packaging path | Build package in strict mode | Vela binary is bundled into packaged resources; build fails clearly when required binary is unavailable |
| AMR-044 | Non-strict packaging | Non-strict platform or build path | Build package without available Vela binary | Build does not fail solely due to missing Vela binary |

## Focused Smoke Runs

Use these smaller smoke passes during active development.

### Smoke A: Entry + Login UI

- Verify `amr.available=true`
- Open Settings
- Confirm AMR login pill is visible
- Trigger login
- Confirm state flips to signed in
- Confirm sign-out works

### Smoke B: Onboarding

- Reset config so onboarding is visible
- Confirm AMR Cloud is featured when AMR is available
- Confirm signed-out state blocks Continue but not Skip
- Complete login and verify onboarding can advance

### Smoke C: Chat Run

- Select AMR as active agent
- Keep model at `default`
- Send a prompt
- Confirm assistant reply completes
- Confirm no `session/set_model must be called before session/prompt` regression

## Failure Cases Worth Manual Attention

- `amr.available=false` even though a binary is expected
- login accepted but status never flips to signed in
- UI stuck in `Signing in…`
- signed-in state shown with wrong profile badge
- onboarding still prefers AMR when AMR is unavailable
- AMR appears inside Local CLI list
- AMR run hangs after prompt submission
- AMR run silently fails when `model=default`
- packaged build succeeds but runtime cannot find bundled `vela`

## Suggested Evidence To Capture

When filing bugs, capture:

- `/api/agents` response
- `/api/integrations/vela/status` response
- current `agentCliEnv.amr` config
- relevant daemon log lines
- relevant desktop or renderer log lines
- active `OPEN_DESIGN_AMR_PROFILE` value
- whether fake or real `vela` was used

## Notes

- Automated tests already cover many contract-level cases. This document is for manual functional verification, especially UI state, environment setup, and packaged/runtime behavior.
- Onboarding visibility depends on config state. If `onboardingCompleted=true`, AMR onboarding entry behavior will not be visible until onboarding is reset.
- Runtime availability depends on binary resolution. If AMR is missing from UI, always inspect `/api/agents` first before assuming a front-end rendering bug.
