# `apps/web/src/components/Theater/` (Critique Theater, web side)

Module map agents enter when they need to change the visual surface of
the Design Jury feature. The directory keeps the internal **Theater**
name; the user-facing label "Design Jury" comes from a single i18n key,
`critiqueTheater.userFacingName`, so the product name can be renamed
without code churn.

## Layout

| File | Responsibility |
|---|---|
| `state/reducer.ts` | Pure state machine. Driven by `PanelEvent` from the contracts package plus a synthetic `__reset__` action the hooks dispatch on context changes. |
| `state/sse.ts` | SSE channel manager + `sseToPanelEvent` which lifts the wire shape back to a `PanelEvent`. Runs per-variant validation so a malformed frame cannot reach the reducer. |
| `hooks/useCritiqueStream.ts` | Subscribes to the project SSE stream and feeds the reducer. Tears down on `enabled=false` and on `projectId` change, dispatching `__reset__` so a prior project's state cannot bleed in. |
| `hooks/useCritiqueReplay.ts` | Drives the same reducer from a recorded `.ndjson(.gz)` transcript. Parse + pace are split into two effects so pause / resume preserves the cursor. |
| `CritiqueTheaterMount.tsx` | Drop-in mount the project view uses. Owns the kill-request handshake (`POST /api/projects/:id/critique/:runId/interrupt`) and the phase-aware swap from live stage to collapsed badge. |
| `TheaterStage.tsx` | Live-debate container. Mounts five `PanelistLane`s + `ScoreTicker` + `RoundDivider` rail + `InterruptButton`. |
| `PanelistLane.tsx` | One row per panelist. Keyed by `data-role` for CSS tinting; no hex literals in source. |
| `ScoreTicker.tsx` | Composite trajectory with a threshold marker. |
| `RoundDivider.tsx` | Round-by-round separator carrying composite vs threshold. |
| `InterruptButton.tsx` | Click + Esc binding. Esc scopes itself to non-text-input focus so the prompt textarea is safe. |
| `TheaterDegraded.tsx` | Single chip surface for runs the orchestrator could not score. `useId()` for the heading id so multiple chips on one page do not collide. |
| `TheaterCollapsed.tsx` | Post-run summary: shipped, interrupted, failed. The interrupted branch uses `interruptedSummary`, not `shippedSummary`. |
| `TheaterTranscript.tsx` | Read-only replay surface bound to `useCritiqueReplay`. |
| `hooks/useCritiqueTheaterEnabled.ts` | Reads the Settings toggle from `open-design:config` localStorage and stays in sync with cross-tab `storage` events plus the same-tab `open-design:critique-theater-toggle` CustomEvent. Pairs with the `setCritiqueTheaterEnabled` setter so a Settings save reflects in every mounted hook without a reload. |
| `index.ts` | Public barrel. Exports the mount, the four surface components plus the `InterruptButton`, the three hooks (`useCritiqueStream`, `useCritiqueReplay`, `useCritiqueTheaterEnabled`), the imperative setter (`setCritiqueTheaterEnabled`), and the reducer-derived contract types. Everything else stays internal. |

## Invariants

- **Reducer is pure.** All state lives in `useReducer`; no `useState`
  for run state inside the components. The reducer's actions are the
  contract-level `PanelEvent` union plus the host-synthesized
  `{ type: '__reset__' }`.
- **Role-keyed tinting via `data-role`.** Components carry the role as
  a data attribute; CSS picks the right hue via `color-mix` over an
  existing semantic token (`var(--accent)`, `var(--amber)`,
  `var(--purple)`, `var(--green)`, `var(--blue)`). No hex literals
  inside this directory.
- **All strings go through the i18n registry.** Every visible string is
  a `t(...)` call against the `critiqueTheater.*` key namespace.
  Hardcoded English will fail review; the locale alignment test
  enforces every locale carries the same keyset.
- **Terminal phases are sticky.** Once the reducer is in `shipped`,
  `degraded`, `interrupted`, or `failed`, only a `run_started` for a
  new runId or a host-dispatched `__reset__` can leave that phase.
  Late `parser_warning` events are accepted because they are
  informational, not lifecycle.
- **Interrupt is double-action.** Click or Esc dispatches the
  optimistic local `interrupted` action AND issues `POST
  /api/projects/:id/critique/:runId/interrupt`. A failed fetch is
  swallowed with a dev-mode warning so the UI still moves to the
  collapsed badge.
- **Designer weight is frozen at 0.0 until v2 cast config lands.**
  Mirror of the same invariant in
  [`apps/daemon/src/critique/AGENTS.md`](../../../../daemon/src/critique/AGENTS.md):
  the v1 weight distribution (designer 0 / critic 0.4 / brand 0.2 /
  a11y 0.2 / copy 0.2) is wire-shape, not a tuning knob. The web
  side reflects that by treating composite weights as read-only:
  `ScoreTicker` and `TheaterCollapsed` read `composite` straight off
  the wire and never recompute it from per-panelist scores. V2
  lands per-skill cast configuration as a Settings surface
  (`apps/web/src/components/Settings/`) that writes to the project's
  settings row; the daemon resolver reads that row and feeds the
  per-run weight map into the composite computation, so the web
  layer continues to render whatever number the daemon produces. Do
  not add a `weights` prop to any component in this directory and
  do not recompute the composite client-side until the contracts
  package carries the v2 cast type.

## When you change anything here

1. Update `packages/contracts/src/critique.ts` first if the wire shape
   changes. The web reducer keys off `PanelEvent`; the SSE manager
   keys off `CRITIQUE_SSE_EVENT_NAMES`. Both live in that one file.
2. Add an i18n key to `apps/web/src/i18n/types.ts` and seed the en +
   zh-CN value (the other 16 locales pick up English via `...en`
   spread). Native translations for de, ja, ko, zh-TW land in the
   same PR for the six-locale set the spec mandates.
3. Run `pnpm --filter @open-design/web exec vitest run tests/components/Theater`
   before pushing. The suite has 100+ cases pinning the reducer
   shape, SSE validation, host lifecycle, and component renders.
4. Visual regression: run `pnpm --filter @open-design/e2e test:ui:extended`
   with `--update-snapshots` after any CSS change in
   `apps/web/src/index.css`'s `.theater-*` block.

## Related

- Spec: `specs/current/critique-theater.md`
- Plan: `specs/current/critique-theater-plan.md`
- User docs: `docs/critique-theater.md`
- Daemon counterpart: `apps/daemon/src/critique/AGENTS.md`
