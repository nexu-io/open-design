# Plugin-driven flow plan

**Parent:** [`spec.md`](../../docs/spec.md) · **Siblings:** [`architecture-boundaries.md`](architecture-boundaries.md) · [`maintainability-roadmap.md`](maintainability-roadmap.md) · [`run.md`](run.md)

## Purpose

Make plugins 1:1 drive a complete run, give bare query input a deterministic fallback, and align Home entry with the NewProject taxonomy plus migration shortcuts (Figma / folder / repo). The current shape lets users pick a plugin in the rail but the actual run still falls back to a generic agent loop because (a) plugin-local SKILL.md is never injected, (b) Home direct-query never pins a plugin, and (c) the daemon stage runner is still a stub.

## Goals / non-goals

- Goals
  - Every plugin reaches the agent prompt with its own SKILL.md body and pipeline contract intact, so the same `Use plugin` action yields the same artifact across runs.
  - "Naked" Home query input gets auto-bound to a default scenario plugin keyed off the project `kind` so there is no zero-plugin path.
  - Home input card surfaces an intent rail (Prototype / Slide deck / Image / Video / Audio / From Figma / From folder / Template / Other) modelled on the Lovart entry pattern.
- Non-goals
  - Marketplace / third-party plugin distribution changes.
  - Transport changes between web and daemon.
  - Replacing the agent CLI loop. We keep the LLM as the primary worker; we only formalise stage orchestration around it.

## Current gaps (referenced to code)

| # | Where | Symptom |
|---|---|---|
| G1 | `apps/daemon/src/server.ts#firePipelineForRun` | `runStage` stub returns synthetic `critique.score: 4`; pipeline events are emitted but no real per-atom work runs. |
| G2 | `apps/daemon/src/plugins/apply.ts#pickFirstSkillId` | `./SKILL.md` is treated as a global skill id and never matches the registry, so a plugin's own SKILL.md is silently dropped from `composeSystemPrompt`. |
| G3 | `apps/web/src/components/HomeView.tsx#submit` | When no plugin is active, `pluginId` is `null`; `resolvePluginSnapshot` then returns `null` and the run goes through the legacy non-plugin code path. |
| G4 | `apps/web/src/components/EntryShell.tsx#DEFAULT_SCENARIO_PLUGIN_BY_KIND` | Every kind maps to `od-new-generation`, so image/video/audio and migration kinds never reach their bundled scenarios (`od-figma-migration`, `od-code-migration`). |
| G5 | `apps/web/src/components/HomeHero.tsx` | No category / model chips below the input card; first-touch users have to know which plugin they want. |

## Target architecture

```
plugin manifest (od.pipeline.stages[])
  └─ daemon stage runner          (real workers; replaces stub in G1)
       └─ atom executor registry  (per-atom handler)
            └─ agent CLI process  (LLM + tool calls, prompt carries plugin skill + active stage)
```

- The agent stays the primary "worker"; the new layer is the daemon-side enforcement of stage order, atom-prompt fragments, and exit signals.
- Plugin-local SKILL.md flows into the same `## Active skill` slot as global skills, just sourced from `plugin.fsPath/<path>` instead of `SKILLS_DIR`.
- The default-scenario binding moves to a single resolver shared by `/api/projects`, `/api/runs`, and `EntryShell` so the client and daemon never disagree.

### Kind → default scenario plugin

| `metadata.kind` / taskKind | Bundled scenario |
|---|---|
| `prototype`, `other`, `template` | `od-new-generation` |
| `deck` | `od-new-generation` (until a deck-specialised scenario lands) |
| `image`, `video`, `audio` | `od-media-generation` (Stage C) |
| `figma-migration` taskKind | `od-figma-migration` |
| `code-migration` taskKind | `od-code-migration` |
| `tune-collab` taskKind | `od-tune-collab` |

## Stages

| Stage | Status | Notes |
|---|---|---|
| A | shipped | Plugin-local SKILL.md reaches `## Active skill`; Home query auto-binds default scenario per kind. |
| B | shipped (MVP) | Chip rail mirrors NewProject taxonomy + adds Figma / folder / template shortcuts. Secondary chip rows (model picker for image, inline figmaUrl input) deferred. |
| C | shipped (MVP) | Bundled `od-media-generation` scenario for image/video/audio; uses existing `media-image` / `media-video` / `media-audio` atoms rather than a new wrapper atom. |
| D | shipped (MVP) | `apps/daemon/src/plugins/atoms/registry.ts` + `built-ins.ts` introduce an atom worker registry; `firePipelineForRun` now drives stages through `runStageWithRegistry`. Set `OD_PIPELINE_RUNNER=stub` to fall back to the v1 canned-signal runner. Real workers only ship for `critique-theater` today (reads `run_devloop_iterations.critique_summary` for the latest parseable score); every other FIRST_PARTY_ATOM registers a permissive worker so happy-path convergence matches v1. |
| E | shipped (MVP) | `pnpm guard` + `pnpm typecheck` green; daemon plugin suites (atom-registry, pipeline-runner, local-skill, apply, bundled-scenarios, headless-run, bundled, pipeline, simulate) all green; web 720/720 green; full daemon suite 1847/1852 with the remaining 5 failures all reproduced on `HEAD` without these changes (3× `finalize-design` macOS-tmpdir symlink issue; 2× chat-route/origin-validation order-dependent flakes that pass in isolation). Cross-app browser e2e covering the bare-query / chip-click flows is deferred to a follow-up since the existing Playwright harness only ships packaged-app smoke. |

### Stage A — Plugin actually injects, Home never runs naked

Smallest change with the largest stability win.

| # | File | Change |
|---|---|---|
| A1 | `apps/daemon/src/plugins/apply.ts` | Replace `pickFirstSkillId` with `pickFirstSkillBinding` returning `{ kind: 'global', id } | { kind: 'local', path }`. Local bindings read the plugin SKILL.md body during apply and put it on the snapshot. |
| A2 | `apps/daemon/src/plugins/snapshots.ts` + contracts `AppliedPluginSnapshot` | Add optional `pluginSkillBody`. Persist alongside other JSON fields. |
| A3 | `apps/daemon/src/server.ts#composeDaemonSystemPrompt` | When snapshot carries `pluginSkillBody`, prefer it over the global skill body for the `## Active skill` block. |
| A4 | `apps/web/src/components/EntryShell.tsx` | Split `DEFAULT_SCENARIO_PLUGIN_BY_KIND` to map per kind; add migration kinds. |
| A5 | `apps/daemon/src/server.ts` (`/api/projects`, `/api/runs`) | When the body carries no `pluginId`/`appliedPluginSnapshotId` and no project pin exists, look up the bundled scenario for `taskKind` and apply it. |
| A6 | `apps/daemon/tests` | New tests cover local skill injection + default-by-kind binding. |

Exit criteria
- Picking a plugin → run logs show `## Active skill — <plugin>` block with the plugin's SKILL.md contents.
- Submitting a Home query with no plugin → snapshot row exists and `pluginId` matches the kind mapping.
- Existing plugin / non-plugin tests still pass.

### Stage B — Home intent rail (Lovart-style)

- `HomeHero` adds a `home-hero__rail` row.
- Primary chips: Prototype · Slide deck · Image · Video · Audio · From template · From Figma · From folder · Other.
- Secondary row appears after primary selection where it makes sense (e.g. Image surfaces a model chip: GPT Image 2 / Nano Banana Pro / Seedance 2.0).
- Selecting a chip pre-applies the matching scenario plugin via `applyPlugin()` so Enter behaves the same as the explicit `Use plugin` path.

### Stage C — Media + migration scenario fill-in

- Add bundled scenario `od-media-generation`. The pipeline reuses the already-shipped `media-image` / `media-video` / `media-audio` atoms; no dedicated `media-generate` wrapper is needed and the original plan's mention of a separate atom is superseded by this note.
- The scenario shares `taskKind: 'new-generation'` with `od-new-generation`. The daemon's `collectBundledScenarios` dedupes by `taskKind`, preferring the canonical `od-<taskKind>` id so the pipeline-fallback stays deterministic.
- Surface "From Figma" / "From folder" chips on the Home rail.
  - "From Figma" applies the `od-figma-migration` plugin (which carries the `figmaUrl` input). A dedicated inline `figmaUrl` field is deferred to a follow-up; the chip's prompt-template substitution still surfaces `{{figmaUrl}}` so the user can edit before submit.
  - "From folder" prefers the Electron native picker (when available) and falls back to opening the existing modal-based import form.

### Stage D — Real stage / atom workers (replaces the stub)

As shipped (MVP):

- `apps/daemon/src/plugins/atoms/registry.ts` owns the atom worker registry: `registerAtomWorker`, `runStageWithRegistry`, and the frozen `PERMISSIVE_DEFAULT_SIGNALS` table. Real-worker outputs replace permissive defaults wholesale so a real score of 5 never gets clipped to 4; cross-worker conflicts inside a single stage still pessimistically merge (false-wins / lowest-number-wins).
- `apps/daemon/src/plugins/atoms/built-ins.ts` registers a worker for every `FIRST_PARTY_ATOMS` entry on first use. Only `critique-theater` ships a real watcher today — it reads `run_devloop_iterations.critique_summary` for the latest parseable `score=N` token. Every other atom registers a permissive worker that returns no signals (so the defaults flow through) — that keeps backwards-compat with the v1 stub while documenting the worker surface for future migrations.
- `apps/daemon/src/server.ts#firePipelineForRun` now branches on `OD_PIPELINE_RUNNER`: default (`registry`) drives stages through `runStageWithRegistry`; `OD_PIPELINE_RUNNER=stub` falls back to the canned signal pump for diagnostic bisection.

Deferred to a follow-up:

- Real watchers for `file-write`, `live-artifact`, `direction-picker`, `discovery-question-form`, `todo-write`, etc. These require either an agent-write protocol that touches DB rows the daemon can observe, or a side-channel (artifacts table / genui surface responses) wired into worker reads. The registry shape is ready; only the workers themselves remain.
- Strengthen `## Active stage` block so the agent has to acknowledge each atom's outputs. (Today the contracts-side `renderActiveStageBlock` already exists; we still need to gate stage progression on the agent's structured acknowledgement.)

### Stage E — Verification gate

- `pnpm guard` + `pnpm typecheck` green.
- Daemon + web package tests green.
- New e2e covering: bare query, plugin pick, Figma chip, folder chip — all four end with a `pipeline_stage_completed` SSE.

## File map

**New (planned across stages)**
- `plugins/_official/scenarios/od-media-generation/{open-design.json,SKILL.md}`
- `plugins/_official/atoms/media-generate/{open-design.json,SKILL.md}`
- `apps/daemon/src/plugins/atoms/media-generate.ts`
- `apps/daemon/src/plugins/atoms/registry.ts`
- `apps/web/src/components/home-hero/chips.ts`
- `apps/web/tests/components/home-hero-chips.test.tsx`
- `apps/daemon/tests/plugins-default-binding.test.ts`
- `apps/daemon/tests/plugins-local-skill.test.ts`

**Modified**
- `apps/daemon/src/plugins/apply.ts`
- `apps/daemon/src/plugins/snapshots.ts`
- `apps/daemon/src/server.ts`
- `apps/daemon/src/plugins/pipeline.ts`
- `apps/daemon/src/prompts/system.ts`
- `apps/web/src/components/EntryShell.tsx`
- `apps/web/src/components/HomeHero.tsx`
- `apps/web/src/components/HomeView.tsx`
- `apps/web/src/styles/home/index.css`
- `packages/contracts/src/plugins/apply.ts` (AppliedPluginSnapshot adds optional `pluginSkillBody`)

## Risks

- R1 — Plugin SKILL.md may conflict with a project-pinned skill. Resolution order: plugin > project skill > kind default.
- R2 — Media surface already drives prompts through the `media generate` CLI; `od-media-generation` must not double-inject.
- R3 — Stage D changes runtime behaviour. Keep `OD_BUNDLED_ATOM_PROMPTS=0` and an explicit `OD_PIPELINE_RUNNER=stub` escape hatch until e2e stabilises.

## Open questions

- Q1 — Persist the Home secondary chip selection (model picker) to user config or keep session-only? Session-only for v1.
- Q2 — Should "From folder" be a top-level chip or live behind a "More" submenu? Top-level for first release; revisit after telemetry.

## Verification commands

```bash
pnpm guard
pnpm typecheck
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/web test
```
