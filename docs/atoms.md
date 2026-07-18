# First-party atom catalog

> The atomic capabilities Open Design exposes to plugins.
> Spec: [`docs/plugins-spec.md`](plugins-spec.md) §10.
> Source of truth: [`apps/daemon/src/plugins/atoms.ts`](../apps/daemon/src/plugins/atoms.ts).
> Live discovery: `GET /api/atoms`, `od atoms list --json`, and
> `od atoms info <id>` for the bundled `SKILL.md` body.

A **plugin** assembles atoms into ordered stages (`od.pipeline.stages[].atoms[]`).
The Open Design daemon is responsible for resolving each atom into a system-prompt
fragment, tool gating, and (when applicable) GenUI surface declarations. Plugins
never own the atom implementations; they only reference them by id.

## Reading this document

- **id** — what you write inside `od.pipeline.stages[*].atoms[]` and
  `od.context.atoms[]`. Stable across daemon versions.
- **status** — `implemented` or `planned`. Every entry in the current catalog is
  implemented; the type remains available so a future reserved id can be
  discovered before promotion.
- **task kinds** — which of the four product scenarios (`new-generation`,
  `code-migration`, `figma-migration`, `tune-collab`) the atom is intended for.
  Plugins may reference an atom outside its declared task kinds, but doctor
  flags this as suspicious.

## Implemented atoms

| id | label | task kinds |
| --- | --- | --- |
| `discovery-question-form` | Discovery question form — turn-1 question form for ambiguous briefs. | `new-generation`, `tune-collab` |
| `direction-picker` | Direction picker — 3–5 direction picker before the final commit. | `new-generation`, `tune-collab` |
| `todo-write` | Todo write — TodoWrite-driven plan. | all |
| `file-read` / `file-write` / `file-edit` | File ops on the project cwd. | all |
| `research-search` | Research search — Tavily-backed shallow research. | `new-generation` |
| `media-image` / `media-video` / `media-audio` | Media generation through configured providers. | `new-generation`, `tune-collab` |
| `live-artifact` | Create / refresh live artifacts. | `new-generation`, `tune-collab` |
| `connector` | Composio connector tool calls. | `new-generation`, `tune-collab` |
| `critique-theater` | 5-dimension panel critique; emits the `critique.score` signal that drives devloop convergence. | all |
| `code-import` | Clone / read existing repo. | `code-migration` |
| `design-extract` | Extract design tokens from source code / Figma / screenshots. | `code-migration`, `figma-migration` |
| `figma-extract` | Extract Figma node tree + tokens + assets. | `figma-migration` |
| `token-map` | Map extracted tokens onto the active design system. | `code-migration`, `figma-migration` |
| `rewrite-plan` | Long-running multi-file rewrite plan. | `code-migration`, `tune-collab` |
| `patch-edit` | Small-step file patches. | `code-migration`, `tune-collab` |
| `build-test` | Run build/typecheck/tests and produce build/test convergence signals. | `code-migration` |
| `diff-review` | Render rewrite as a reviewable diff. | `code-migration`, `tune-collab` |
| `handoff` | Push artifact to downstream surfaces (cli / cloud / desktop). | `tune-collab` |

## How the daemon resolves an atom

1. The plugin manifest's `od.pipeline.stages[*].atoms[]` is parsed into a
   `PipelineStage[]` by `apps/daemon/src/plugins/pipeline.ts`.
2. Before the run starts, the daemon resolves bundled atom instruction bodies
   through `apps/daemon/src/plugins/atom-bodies.ts` and renders the available
   bodies into `## Active stage` prompt blocks. Those bodies live under
   `plugins/_official/atoms/<atom>/SKILL.md`.
3. At run time, `apps/daemon/src/plugins/pipeline-runner.ts` walks the stages.
   For each stage entry it:
   - emits a `pipeline_stage_started` SSE event,
   - asks the atom-worker registry in `apps/daemon/src/plugins/atoms/registry.ts`
     for daemon-observable signals (the built-in registry has a worker for
     every catalog entry and reads real Critique Theater scores when present),
   - persists one row into `run_devloop_iterations` for audit,
   - emits a `pipeline_stage_completed` event with the resulting signals.

Atoms whose work happens inside the selected agent CLI may use the registry's
permissive compatibility signals because the daemon has no independent
observation for that tool action. This is distinct from the old global stub;
`OD_PIPELINE_RUNNER=stub` exists only as a diagnostic/replay escape hatch.

## Atom signals + the `until` vocabulary

The current `until` vocabulary is:

- `critique.score` — emitted by `critique-theater`.
- `iterations` — built-in per-stage counter.
- `user.confirmed` — emitted when a `confirmation` GenUI surface resolves.
- `preview.ok` — emitted by the live-artifact preview pipeline.
- `build.passing` — emitted by the build-test flow for the build/typecheck gate.
- `tests.passing` — emitted by the build-test flow for the test gate.

The evaluator is deliberately closed and is not arbitrary JavaScript. Unknown
signals fail parsing and `od plugin doctor` reports them.

## Adding a new atom

1. Author the atom out-of-tree as a plugin (per spec §22.5 promotion path).
2. Once the `SKILL.md` / MCP tool / pipeline shape stabilises, add the bundled
   atom under `plugins/_official/atoms/<id>/`, append the matching row to
   `FIRST_PARTY_ATOMS`, and register a worker when the daemon has a real signal
   it can observe.
3. Update this document and the spec §10 / §21 / §23 tables in the same PR.
4. The atom is now reachable via:
   - `od.pipeline.stages[*].atoms[]` references in any plugin,
   - `GET /api/atoms` discovery,
   - `od atoms list/show/info`,
   - `od plugin doctor` validation.
