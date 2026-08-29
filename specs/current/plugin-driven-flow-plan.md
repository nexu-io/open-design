# Plugin-driven flow plan

**Parent:** [`spec.md`](../../docs/spec.md) · **Siblings:** [`architecture-boundaries.md`](architecture-boundaries.md) · [`maintainability-roadmap.md`](maintainability-roadmap.md) · [`run.md`](run.md)

## Purpose

Make plugins 1:1 drive a complete run, give bare query input a deterministic fallback, and align Home entry with the NewProject taxonomy plus migration shortcuts. The shipped baseline now injects plugin-local `SKILL.md`, binds unselected Home submissions through a shared default-scenario resolver, and runs pipeline stages through the atom registry by default. The remaining orchestration gap is narrower: only `critique-theater` has a daemon-observable worker today, while the other built-in atoms still use permissive signals.

## Goals / non-goals

- Goals
  - Every plugin reaches the agent prompt with its own SKILL.md body and pipeline contract intact, so the same `Use plugin` action yields the same artifact across runs.
  - "Naked" Home query input gets auto-bound to a default scenario plugin keyed off the project `kind` so there is no zero-plugin path.
  - Home input card surfaces an intent rail for the main creation kinds plus Figma, template, and plugin-authoring shortcuts. Folder linking lives in the composer Tools → Import surface, and the generic Other path remains the free-form prompt.
- Non-goals
  - Marketplace / third-party plugin distribution changes.
  - Transport changes between web and daemon.
  - Replacing the agent CLI loop. We keep the LLM as the primary worker; we only formalise stage orchestration around it.

## Shipped baseline and remaining gaps (referenced to code)

| # | Status | Where | Current state |
|---|---|---|---|
| G1 | partial | `apps/daemon/src/server.ts#firePipelineForRun` and `apps/daemon/src/plugins/atoms/{registry,built-ins}.ts` | The registry runner is the default and `OD_PIPELINE_RUNNER=stub` is only a diagnostic fallback. `critique-theater` has the sole daemon-observable worker; other first-party atoms still return permissive signals. |
| G2 | resolved | `apps/daemon/src/plugins/apply.ts` | Local `./SKILL.md` bindings are read into the applied snapshot and reach `composeDaemonSystemPrompt`. |
| G3 | resolved | `apps/daemon/src/routes/project/index.ts`, `apps/daemon/src/routes/runs.ts`, and `apps/web/src/components/HomeView.tsx` | A submission without an explicit plugin resolves and applies the shared default scenario instead of taking a zero-plugin path. |
| G4 | resolved | `packages/contracts/src/plugins/scenario-defaults.ts` | Web and daemon share one kind/task-kind/intent resolver, including specialised prototype, deck, media, migration, live-artifact, and web-clone defaults. |
| G5 | partial | `apps/web/src/components/home-hero/chips.ts` and `apps/web/src/components/HomeHero.tsx` | The primary intent rail shipped and has since expanded. Dedicated secondary rail rows and an inline Figma URL field remain follow-ups; folder linking moved to composer Tools → Import. |

## Target architecture

```
plugin manifest (od.pipeline.stages[])
  └─ daemon stage runner          (registry by default; stub is diagnostic only)
       └─ atom executor registry  (per-atom handler)
            └─ agent CLI process  (LLM + tool calls, prompt carries plugin skill + active stage)
```

- The agent stays the primary "worker"; the new layer is the daemon-side enforcement of stage order, atom-prompt fragments, and exit signals.
- Plugin-local SKILL.md flows into the same `## Active skill` slot as global skills, just sourced from `plugin.fsPath/<path>` instead of `SKILLS_DIR`.
- The default-scenario binding moves to a single resolver shared by `/api/projects`, `/api/runs`, and `EntryShell` so the client and daemon never disagree.

### Kind → default scenario plugin

| `metadata.kind` / taskKind | Bundled scenario |
|---|---|
| `prototype` | `example-web-prototype` |
| `deck` | `example-simple-deck` |
| `template`, `brand`, `other` | `od-new-generation` |
| `image`, `video`, `audio` | `od-media-generation` |
| `metadata.intent: live-artifact` | `example-live-artifact` |
| `metadata.intent: web-clone` | `example-web-clone` |
| `figma-migration` taskKind | `od-figma-migration` |
| `code-migration` taskKind | `od-code-migration` |
| `tune-collab` taskKind | `od-tune-collab` |

## Stages

| Stage | Status | Notes |
|---|---|---|
| A | shipped | Plugin-local SKILL.md reaches `## Active skill`; Home query auto-binds default scenario per kind. |
| B | shipped (MVP) | Chip rail mirrors the creation taxonomy and adds Figma / template / plugin-authoring shortcuts. Folder linking subsequently moved to composer Tools → Import. Dedicated secondary rail rows and an inline `figmaUrl` input remain deferred. |
| C | shipped (MVP) | Bundled `od-media-generation` scenario for image/video/audio; uses existing `media-image` / `media-video` / `media-audio` atoms rather than a new wrapper atom. |
| D | shipped (MVP) | `apps/daemon/src/plugins/atoms/registry.ts` + `built-ins.ts` introduce an atom worker registry; `firePipelineForRun` now drives stages through `runStageWithRegistry`. Set `OD_PIPELINE_RUNNER=stub` to fall back to the v1 canned-signal runner. Real workers only ship for `critique-theater` today (reads `run_devloop_iterations.critique_summary` for the latest parseable score); every other FIRST_PARTY_ATOM registers a permissive worker so happy-path convergence matches v1. |
| E | shipped (MVP) | The original package gates landed. The repository now has tools-dev-backed Playwright coverage for the Home rail and a real-daemon authoring run; focused event-level assertions for every fallback/chip path remain a follow-up rather than a limitation of the harness. |

### Stage A — Plugin actually injects, Home never runs naked

Smallest change with the largest stability win.

| # | File | Change |
|---|---|---|
| A1 | `apps/daemon/src/plugins/apply.ts` | Replace `pickFirstSkillId` with `pickFirstSkillBinding` returning `{ kind: 'global', id } | { kind: 'local', path }`. Local bindings read the plugin SKILL.md body during apply and put it on the snapshot. |
| A2 | `apps/daemon/src/plugins/snapshots.ts` + contracts `AppliedPluginSnapshot` | Add optional `pluginSkillBody`. Persist alongside other JSON fields. |
| A3 | `apps/daemon/src/server.ts#composeDaemonSystemPrompt` | When snapshot carries `pluginSkillBody`, prefer it over the global skill body for the `## Active skill` block. |
| A4 | `packages/contracts/src/plugins/scenario-defaults.ts` plus web/daemon consumers | Keep `DEFAULT_SCENARIO_PLUGIN_BY_KIND` and task/intent resolution in one shared mapping. |
| A5 | `apps/daemon/src/routes/project/index.ts` and `apps/daemon/src/routes/runs.ts` | When the body carries no `pluginId`/`appliedPluginSnapshotId` and no project pin exists, look up the bundled scenario for the project metadata/task kind and apply it. |
| A6 | `apps/daemon/tests` | New tests cover local skill injection + default-by-kind binding. |

Exit criteria
- Picking a plugin → run logs show `## Active skill — <plugin>` block with the plugin's SKILL.md contents.
- Submitting a Home query with no plugin → snapshot row exists and `pluginId` matches the kind mapping.
- Existing plugin / non-plugin tests still pass.

### Stage B — Home intent rail (Lovart-style)

- `HomeHero` adds a `home-hero__rail` row.
- The original primary slice shipped Prototype · Slide deck · Image · Video · Audio plus From template and From Figma; the rail has since expanded with more creation intents and plugin authoring.
- Other remains the free-form fallback. Folder linking is available from composer Tools → Import instead of a rail chip.
- Dedicated secondary rail rows remain a follow-up. Selecting a creation chip records the matching scenario and applies it on submit so Enter follows the same plugin-bound run path as explicit `Use plugin`.

### Stage C — Media + migration scenario fill-in

- Add bundled scenario `od-media-generation`. The pipeline reuses the already-shipped `media-image` / `media-video` / `media-audio` atoms; no dedicated `media-generate` wrapper is needed and the original plan's mention of a separate atom is superseded by this note.
- The scenario shares `taskKind: 'new-generation'` with `od-new-generation`. The daemon's `collectBundledScenarios` dedupes by `taskKind`, preferring the canonical `od-<taskKind>` id so the pipeline-fallback stays deterministic.
- Surface "From Figma" on the Home rail and keep folder linking in the composer import tools.
  - "From Figma" applies the `od-figma-migration` plugin (which carries the `figmaUrl` input). A dedicated inline `figmaUrl` field is deferred to a follow-up; the chip's prompt-template substitution still surfaces `{{figmaUrl}}` so the user can edit before submit.
  - "Link code folder" opens the existing folder picker from composer Tools → Import and persists the selected path in project `linkedDirs`; it is no longer represented as a Home rail scenario.

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
- `e2e/ui/home-hero-rail.test.ts` covers the rail interactions, and `e2e/ui/real-daemon-run.test.ts` covers a daemon-backed plugin-authoring run that produces the expected folder and action cards.
- Remaining event-level follow-up: assert that a bare query, explicit plugin pick, and Figma chip each end with `pipeline_stage_completed`. There is no folder-chip case after folder linking moved out of the rail.

## File map

**Added by the shipped stages**
- `plugins/_official/scenarios/od-media-generation/{open-design.json,SKILL.md}`
- `apps/daemon/src/plugins/atoms/registry.ts`
- `apps/web/src/components/home-hero/chips.ts`
- `packages/contracts/src/plugins/scenario-defaults.ts`
- `apps/web/tests/components/HomeHero.rail.test.tsx`
- `packages/contracts/tests/scenario-defaults.test.ts`
- `apps/daemon/tests/plugins-scenario-fallback.test.ts`
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
- R3 — Stage D changes runtime behaviour. Retain `OD_BUNDLED_ATOM_PROMPTS=0` and `OD_PIPELINE_RUNNER=stub` as explicit diagnostic escape hatches while the remaining workers gain observable contracts.

## Open questions

- Q1 — Persist the Home secondary chip selection (model picker) to user config or keep session-only? Session-only for v1.
- Q2 — Resolved after the first release: folder linking moved out of the rail and now lives under composer Tools → Import.

## Verification commands

```bash
pnpm guard
pnpm typecheck
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/web test
```
