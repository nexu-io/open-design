---
id: 20260601-amr-model-loading-cache
name: Amr Model Loading Cache
status: designed
created: '2026-06-01'
---

## Overview

### Problem Statement

AMR model discovery currently rides on the general agent probing path. The
Open Design AMR runtime still calls legacy `vela models`, waits for that
catalog before `/api/agents` can return AMR model data, and parses
production-shaped text ids that the new Vela model discovery contract no
longer wants Open Design to treat as primary.

The Vela CLI now exposes a split contract:

- `vela model preset --format json`: fast local picker seed.
- `vela model list --format json`: authoritative remote AMR catalog.

Open Design should use the fast preset to occupy AMR model pickers while a
background remote catalog refresh fills a loading cache. `/api/agents` can
keep its existing compatibility payload, but AMR UI surfaces should not rely
on `/api/agents` for the AMR model list.

### Goals

- Add an AMR-specific `GET /api/amr/models` endpoint.
- Return Vela `source: "preset" | "remote"` semantics from that endpoint.
- Keep the latest successful remote catalog in daemon memory and refresh it
  in the background without clearing it.
- Warm the remote model cache when AMR login status reports `loggedIn: true`.
- Update AMR model pickers to use `/api/amr/models` with bounded polling.
- Migrate new AMR model discovery from legacy `vela models` to
  `vela model list --format json`.

### Non-Goals

- Do not remove the existing generic `fallback` model mechanism.
- Do not remove `/api/agents` AMR model fields in this change.
- Do not add new glossary terms to `CONTEXT.md`.
- Do not implement a broader generic runtime model endpoint.
- Do not change AMR execution away from `vela agent run --runtime opencode`.

### Success Criteria

- AMR model UI can show preset rows quickly while remote model list loads.
- A successful remote list replaces preset rows and is cached for later loads.
- Remote cache refreshes do not make the UI fall back to preset when stale
  remote data exists.
- AMR run preflight still validates against authoritative remote list data,
  not preset rows.
- Existing non-AMR runtime probing and fallback behavior remains unchanged.

## Research

### Existing System

- AMR runtime discovery currently uses `fetchVelaModelsWithRetry`, which
  executes `vela models`, parses stdout, and retries transient text errors.
  Source: `apps/daemon/src/runtimes/defs/amr.ts:4-5,161-185`.
- The current AMR parser normalizes legacy `public_model_*` and `vela/` ids,
  filters media model prefixes, deduplicates, and orders preferred chat
  models. Source: `apps/daemon/src/runtimes/defs/amr.ts:39-117,120-132`.
- AMR declares `fallbackModels: []`, disables custom model ids, and keeps
  execution on `vela agent run --runtime opencode`. Source:
  `apps/daemon/src/runtimes/defs/amr.ts:188-208`.
- Generic runtime probing calls each runtime's `fetchModels` during
  `detectAgents`, maps successful results to `modelsSource: "live"`, and
  falls back to static fallback models on empty/error results. Source:
  `apps/daemon/src/runtimes/detection.ts:22-60,182-188`.
- `detectAgents` probes all registered agent defs with `Promise.all` and then
  records the surfaced model ids in the run-time validation cache. Source:
  `apps/daemon/src/runtimes/detection.ts:244-256`.
- The shared `AgentInfo` contract currently models agent model provenance as
  `modelsSource?: "live" | "fallback"`. Source:
  `packages/contracts/src/api/registry.ts:1-18`.
- AMR login status is already exposed through
  `GET /api/integrations/vela/status`, and login/logout use separate Vela
  integration endpoints. Source: `apps/daemon/src/server.ts:6156-6214`;
  `apps/web/src/providers/daemon.ts:505-566`.
- Chat-run AMR preflight currently calls `def.fetchModels`, updates remembered
  live models on success, falls back to remembered live models when the fresh
  fetch fails, and blocks when the selected model is absent. Source:
  `apps/daemon/src/server.ts:11328-11414`.
- Onboarding has an AMR-specific hardcoded model list used when the AMR agent
  payload does not include models. Source:
  `apps/web/src/components/EntryShell.tsx:132-137,904-911`.
- Onboarding renders the AMR picker from its selected `amrModels` and
  `amrModelsSource`. Source:
  `apps/web/src/components/EntryShell.tsx:1651-1659,2051-2085`.
- The current fake Vela test fixture only implements `vela models` for model
  listing. Source: `apps/daemon/tests/fixtures/fake-vela.mjs:1-20,68-84`.
- AMR integration tests pin the current behavior: no static fallback, legacy
  normalization, parsing/filtering, `fetchModels` through `vela models`, and
  transient retry. Source:
  `apps/daemon/tests/amr-acp-integration.test.ts:77-155,157-207`.

### Design Inputs

- Vela's new contract separates model discovery into `vela model preset`,
  `vela model list`, and legacy `vela models`. Source:
  `/private/tmp/open-design-amr-model-catalog-handoff.md:7-21`.
- Vela preset is a fast local picker seed, does not require login/config or
  network, is not authoritative, and must not be used as execution fallback.
  Source: `/private/tmp/open-design-amr-model-catalog-handoff.md:50-61`.
- Vela preset JSON is requested with `vela model preset --format json` and
  returns `source: "preset"` plus `data[].id`. Source:
  `/private/tmp/open-design-amr-model-catalog-handoff.md:77-100`.
- Vela remote list is authoritative, requires a valid profile/control key,
  calls `GET /api/v1/models`, returns requestable model names in `data[].id`,
  and does not fall back to preset. Source:
  `/private/tmp/open-design-amr-model-catalog-handoff.md:102-150`.
- Legacy `vela models` is text-only compatibility output and should not be
  used by new picker/preflight paths. Source:
  `/private/tmp/open-design-amr-model-catalog-handoff.md:152-164`.
- New `vela model list` ids are already requestable AMR model names, so Open
  Design should not apply `public_model_*` normalization to new list results.
  Source: `/private/tmp/open-design-amr-model-catalog-handoff.md:166-180`.
- Recommended picker flow is preset first, remote list in parallel or
  immediately after, then remote replaces preset when it succeeds. Source:
  `/private/tmp/open-design-amr-model-catalog-handoff.md:182-189`.

### Constraints & Dependencies

- Project command boundaries require new user-facing capabilities to have both
  HTTP and CLI surfaces unless genuinely not applicable; this change is an AMR
  UI/daemon support endpoint rather than a new `od` user command. Source:
  `AGENTS.md` "Capability exposure (UI/CLI dual-track)".
- Root validation for regular work is at least `pnpm guard` and
  `pnpm typecheck`, plus package-scoped tests/builds matching touched files.
  Source: `AGENTS.md` "Validation strategy".
- New i18n keys must be added to `apps/web/src/i18n/types.ts` and all 18
  locale files. Source: `AGENTS.md` "i18n keys".

## Design

### Design Summary

Introduce an AMR-only model catalog endpoint backed by a daemon memory
loading cache. The endpoint returns preset rows immediately when no remote
catalog is cached, starts or joins a background remote `vela model list`
refresh, and returns the last successful remote catalog whenever one exists.
Remote refreshes are stale-while-refresh: stale remote data remains visible
while the daemon refreshes in the background.

The frontend AMR pickers call `/api/amr/models` directly. If the endpoint
returns `source: "preset"`, the frontend polls a bounded number of times for
the remote result. If polling reaches the limit, the UI keeps showing preset
rows. `/api/agents` remains compatible and may still include AMR model data,
but AMR picker freshness no longer depends on general agent probing.

### Design Decisions

- Decision: Add `GET /api/amr/models` instead of making `/api/agents` carry
  AMR's staged picker behavior. `/api/agents` currently probes all runtimes
  and awaits model discovery inside `detectAgents`, so an AMR remote catalog
  wait is coupled to all agent detection. Source:
  `apps/daemon/src/runtimes/detection.ts:22-60,244-256`.
- Decision: Use endpoint `source` values `"preset"` and `"remote"`, matching
  Vela's JSON contract, instead of extending generic `modelsSource` for this
  AMR-only endpoint. Source:
  `/private/tmp/open-design-amr-model-catalog-handoff.md:77-100,127-150`;
  `packages/contracts/src/api/registry.ts:15-18`.
- Decision: Keep generic `fallback` behavior unchanged. Non-AMR runtime
  probing uses `"fallback"` for static runtime lists, while Vela preset is a
  CLI-provided local seed, not an Open Design static fallback. Source:
  `apps/daemon/src/runtimes/detection.ts:27-60`;
  `/private/tmp/open-design-amr-model-catalog-handoff.md:50-61`.
- Decision: Parse new Vela JSON by `data[].id` directly and do not apply
  legacy `public_model_*` normalization to `vela model list` results. Source:
  `/private/tmp/open-design-amr-model-catalog-handoff.md:166-180`;
  `apps/daemon/src/runtimes/defs/amr.ts:39-117`.
- Decision: Preserve chat-model filtering and preferred ordering for AMR model
  options after JSON parsing, because AMR currently drives chat completions
  and existing tests pin media filtering/order. Source:
  `apps/daemon/src/runtimes/defs/amr.ts:91-132`;
  `apps/daemon/tests/amr-acp-integration.test.ts:113-155`.
- Decision: Keep AMR execution preflight authoritative by using remote
  `vela model list --format json`; preset rows must not populate the execution
  allowlist. Source:
  `/private/tmp/open-design-amr-model-catalog-handoff.md:56-60,102-112`;
  `apps/daemon/src/server.ts:11328-11414`.
- Decision: Warm the remote model loading cache when
  `/api/integrations/vela/status` reads `loggedIn: true`, without awaiting the
  refresh before responding. Source:
  `apps/daemon/src/server.ts:6160-6165`;
  `/private/tmp/open-design-amr-model-catalog-handoff.md:106-112`.
- Decision: Keep `/api/agents` AMR payload compatibility for now, and make
  frontend AMR model pickers prefer `/api/amr/models` instead. Source:
  `apps/web/src/components/EntryShell.tsx:904-911,1651-1659`;
  `apps/daemon/src/runtimes/detection.ts:182-188`.

### System Procedure

Flow:

1. Frontend requests `GET /api/amr/models` when an AMR model picker mounts or
   needs refresh.
2. Daemon resolves AMR's Vela launch path and environment using existing agent
   launch/config helpers.
3. Daemon reads or fetches preset rows via
   `vela model preset --format json`.
4. If a remote catalog cache exists, daemon returns it with
   `source: "remote"`, and starts a background refresh when the refresh
   interval says it is stale.
5. If no remote catalog cache exists, daemon returns preset rows with
   `source: "preset"` and starts or joins a background remote refresh.
6. Frontend polls while `source === "preset"` until remote arrives or the
   poll limit is reached.
7. Chat-run preflight fetches the remote list directly, updates remembered
   live models only from remote results, and blocks unavailable selections.

### Interfaces / APIs

`GET /api/amr/models`

```ts
type AmrModelsResponse = {
  source: 'preset' | 'remote';
  models: Array<{ id: string; label: string }>;
  refreshing: boolean;
  stale?: boolean;
  remoteError?: string;
};
```

Response semantics:

- `source: "preset"` means no successful remote catalog is cached yet.
- `source: "remote"` means rows came from the latest successful
  `vela model list --format json`.
- `refreshing: true` means a remote refresh is currently running.
- `stale: true` means the returned remote rows are from a previous successful
  fetch and a later refresh attempt failed or is in progress.
- `remoteError` is diagnostic only; UI can keep showing current rows.

### Change Scope

Impact Areas:

- Daemon AMR runtime model discovery: replace legacy primary `vela models`
  integration for new AMR model flows with JSON preset/list helpers.
- Daemon HTTP routes: add AMR-specific model endpoint and warm cache from Vela
  login status reads.
- Contracts: add AMR model response types without changing generic
  `AgentInfo.modelsSource`.
- Web AMR picker data flow: fetch `/api/amr/models`, poll with an upper bound,
  and keep `/api/agents` as compatibility/fallback input only.
- Tests and fixtures: teach fake Vela about `model preset/list --format json`
  and add coverage for cache, parsing, and UI replacement behavior.

Planned File Changes:

- `packages/contracts/src/api/registry.ts` - add AMR model endpoint response
  type or a nearby exported contract type.
- `apps/daemon/src/runtimes/defs/amr.ts` - add JSON model response parsing,
  preset fetch, remote list fetch, and remote-only preflight helper.
- `apps/daemon/src/runtimes/amr-model-cache.ts` or equivalent - implement
  process-local loading cache with in-flight refresh coalescing.
- `apps/daemon/src/server.ts` - register `GET /api/amr/models` and warm the
  cache from the Vela status endpoint when logged in.
- `apps/daemon/tests/fixtures/fake-vela.mjs` - support
  `model preset --format json` and `model list --format json`.
- `apps/daemon/tests/amr-acp-integration.test.ts` or focused daemon route
  tests - update legacy expectations and add new model cache cases.
- `apps/web/src/providers/daemon.ts` - add `fetchAmrModels`.
- `apps/web/src/components/EntryShell.tsx`,
  `apps/web/src/components/SettingsDialog.tsx`, and
  `apps/web/src/components/InlineModelSwitcher.tsx` - use `/api/amr/models`
  for AMR model options where those surfaces render AMR pickers.
- `apps/web/tests/**` - cover bounded polling and AMR model replacement where
  practical.

### Edge Cases

- If remote cache exists and refresh fails, keep returning the stale remote
  cache rather than falling back to preset.
- If no remote cache exists, return preset and keep attempting remote refresh
  on later requests; frontend stops polling after its upper bound.
- If AMR binary resolution fails, return a clear endpoint failure instead of
  fabricating model rows.
- If Vela JSON is malformed or has the wrong `source`, fail the required
  step visibly in daemon tests and endpoint responses.
- If remote list returns media models, preserve the existing chat-only filter.

### Verification Strategy

- Daemon parser tests: validate preset/remote JSON parsing, source checks,
  direct `data[].id` use, media filtering, de-dupe, and ordering. Source:
  `apps/daemon/tests/amr-acp-integration.test.ts:88-155`.
- Daemon cache tests: validate first preset response starts refresh, concurrent
  requests coalesce one remote call, remote replaces preset, stale remote
  survives failed refresh, and login status warm starts refresh. Source:
  `apps/daemon/src/server.ts:6160-6165`.
- Chat preflight tests: validate AMR execution allowlist is populated only
  from remote list results, not preset. Source:
  `apps/daemon/src/server.ts:11328-11414`.
- Web tests: validate AMR pickers call `/api/amr/models`, poll only while
  `source === "preset"`, stop after remote or after the poll cap, and keep
  existing `/api/agents` compatibility. Source:
  `apps/web/src/components/EntryShell.tsx:904-911,1651-1659`.
- Final validation: run `pnpm guard`, `pnpm typecheck`,
  `pnpm --filter @open-design/daemon test -- amr-acp-integration`, and
  focused web tests touched by the implementation. Source:
  `AGENTS.md` "Validation strategy".

## Plan

- [x] Step 1: Daemon AMR model contract and cache
  - [x] Substep 1.1 Implement: Add AMR preset/remote JSON parsers and fetch
    helpers in the AMR runtime area.
  - [x] Substep 1.2 Implement: Add process-local loading cache with in-flight
    remote refresh coalescing and stale-while-refresh behavior.
  - [x] Substep 1.3 Implement: Add `GET /api/amr/models` and Vela status warm
    trigger.
  - [x] Substep 1.4 Verify: Add fake Vela support for new commands.
  - [x] Substep 1.5 Verify: Add daemon tests for parser, endpoint/cache, and
    remote-only execution preflight.
- [x] Step 2: Frontend AMR picker integration
  - [x] Substep 2.1 Implement: Add web provider helper for `/api/amr/models`.
  - [x] Substep 2.2 Implement: Wire AMR model pickers to endpoint results while
    preserving `/api/agents` compatibility.
  - [x] Substep 2.3 Implement: Add bounded polling while `source === "preset"`.
  - [x] Substep 2.4 Verify: Add focused web tests for preset-to-remote
    replacement and polling cap.
- [ ] Step 3: Regression validation
  - [x] Substep 3.1 Verify: Run daemon AMR tests.
  - [x] Substep 3.2 Verify: Run focused web tests.
  - [ ] Substep 3.3 Verify: Run `pnpm guard` and `pnpm typecheck`.

## Notes

<!-- Optional sections — add what's relevant. -->

### Implementation

- `packages/contracts/src/api/registry.ts` - added `AmrModelsResponse` and
  `source: "preset" | "remote"` contract types.
- `apps/daemon/src/runtimes/defs/amr.ts` - added Vela preset/list JSON parsing
  and fetch helpers; AMR authoritative `fetchModels` now uses
  `vela model list --format json`.
- `apps/daemon/src/runtimes/amr-model-cache.ts` - added process-local AMR
  loading cache with in-flight remote coalescing and stale-while-refresh
  behavior.
- `apps/daemon/src/server.ts` - added `GET /api/amr/models` and status-route
  remote cache warming when Vela reports `loggedIn: true`.
- `apps/daemon/tests/fixtures/fake-vela.mjs` - added `model preset/list
  --format json` fixture support.
- `apps/web/src/providers/daemon.ts` and `apps/web/src/App.tsx` - added
  `/api/amr/models` fetching and app-level bounded polling that updates AMR
  models for onboarding, Settings, and inline switcher surfaces while keeping
  `/api/agents` compatibility.
- Deviation: focused web coverage verifies the provider helper. The polling is
  implemented at the app-level merge point so all AMR picker surfaces share it.

### Verification

- Passed: `pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/amr-acp-integration.test.ts`.
- Passed after log-check import fix: `pnpm --filter @open-design/daemon typecheck`.
- Passed: `pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts tests/chat-route.test.ts -t "retries transient AMR Link catalog failures"`.
- Passed: `pnpm --filter @open-design/web exec vitest run -c vitest.config.ts tests/providers/daemon-amr-models.test.ts`.
- Passed: `pnpm --filter @open-design/daemon typecheck && pnpm --filter @open-design/web typecheck && pnpm --filter @open-design/contracts typecheck`.
- Passed: `pnpm typecheck`.
- Failed: `pnpm guard` due an existing tools layout violation:
  `tools/pr/ -> tools/ top-level entries are allowlisted; expected only
  AGENTS.md, dev/, pack/, and serve/`.
