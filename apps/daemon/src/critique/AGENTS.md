# `apps/daemon/src/critique/` (Critique Theater, daemon side)

Module map agents enter when they need to change anything in the critique
pipeline. The user-facing feature name is **Design Jury**; the directory
keeps the **Critique Theater** internal name so the product label can move
without churning code paths.

## Layout

| File | Responsibility |
|---|---|
| `config.ts` | `CritiqueConfig` defaults + `OD_CRITIQUE_*` env-var parsing. The single source of truth for thresholds, weights, max-rounds, timeouts. |
| `orchestrator.ts` | The state machine. Spawns a CLI session, feeds the panelist prompts in order, awaits each round's SHIP / round_end, and decides whether to continue or terminate. |
| `parser.ts` + `parsers/v1.ts` | Streaming parser that ingests the agent's stdout and yields `PanelEvent`s. Owns the `<CRITIQUE_RUN>`, `<PANELIST>`, `<SHIP>` envelope. |
| `errors.ts` | Typed parser failures: `MalformedBlockError`, `OversizeBlockError`, `MissingArtifactError`. Each maps to a `DegradedReason` so the wire-level `critique.degraded` event carries the right tag. |
| `persistence.ts` | SQLite writes for run rows and per-round summaries (`critique_runs`, `critique_rounds`). |
| `artifact-writer.ts` | Disk persistence for the SHIP artifact body. Owns the byte-budget guard (`ArtifactTooLargeError`) and the `O_NOFOLLOW` path-traversal protections. |
| `artifact-handler.ts` | HTTP read path: `GET /api/projects/:id/critique/:runId/artifact`. |
| `interrupt-handler.ts` | Resolves the kill request from `POST /api/projects/:id/critique/:runId/interrupt`. |
| `adapter-degraded.ts` | In-memory degraded-adapter registry with 24h TTL. The orchestrator + Settings UI consult `isDegraded(adapterId)` before routing a run to it. |
| `conformance.ts` | Conformance harness entry point. The nightly cycle calls `runAdapterConformance` per adapter × per brief template and tallies `shipped / degraded / failed`. |
| `__fixtures__/v1/` | Canonical transcripts the parser tests + conformance harness consume (happy-3-rounds, malformed-unbalanced, missing-artifact, etc.). |
| `__fixtures__/adapters/` | Synthetic adapter stubs that emit the v1 fixtures. The conformance harness wraps them in `AsyncIterable<string>` so the parser path is exercised end-to-end without a real model. |

## Invariants

- **Parser yields one `PanelEvent` at a time** via async generator. The
  orchestrator drives the loop; nothing in this directory collects events
  into an array eagerly.
- **Terminal phases (`shipped`, `degraded`, `interrupted`, `failed`) are
  emitted exactly once** per run. The reducer treats them as sticky;
  duplicate ship events trip `duplicate_ship` in `parser_warning`.
- **Artifact bytes never travel on the wire.** The SHIP event carries an
  `artifactRef: { projectId, artifactId }` only; the byte body is written
  by `artifact-writer.ts` and fetched via the HTTP route.
- **Round bookkeeping is keyed by round number**, not by "always the
  last." A stray late panelist event from round 1 must NOT corrupt
  round 2's bucket. See `withRound` in the web reducer for the parallel.
- **No `apps/daemon/src/agents/registry.ts`.** The plan refers to that
  path historically; the actual adapter registry is `runtimes/registry.ts`
  in this repo. Phase 10 routing extensions land here in
  `adapter-degraded.ts` instead.
- **Designer weight is frozen at 0.0 until v2 cast config lands.**
  `config.ts` exposes the panel weights as `CritiqueConfig.weights`
  but every production deployment uses the v1 distribution
  (designer 0 / critic 0.4 / brand 0.2 / a11y 0.2 / copy 0.2). The
  v2 work is cross-package: the daemon adds per-skill weight
  overrides driven off `od.critique.cast` in `SKILL.md` frontmatter
  (this directory) and the web Settings surface adds a per-project
  weight editor (`apps/web/src/components/Settings/`). Treat the v1
  weights as a wire-shape invariant rather than a tuning knob;
  changing them mid-v1 will break the `composite` numbers persisted
  in `critique_runs`.

## When you change anything here

1. The contracts in `packages/contracts/src/critique.ts` are the single
   source of truth for `PanelEvent`, `DegradedReason`, `FailedCause`,
   `ParserWarningKind`. Update them before changing this directory.
2. The parser is the natural place to enforce schema strictness; do not
   loosen it under pressure. The web `sseToPanelEvent` already runs a
   defence-in-depth variant validator.
3. Add a v1 fixture under `__fixtures__/v1/` for every new failure
   shape, and a corresponding conformance test case.
4. Bump `CRITIQUE_PROTOCOL_VERSION` in the contracts when the wire
   shape changes. Adapter conformance auto-marks `degraded` on
   protocol-version mismatch, so this is load-bearing.

## Related

- Spec: `specs/current/critique-theater.md`
- Plan: `specs/current/critique-theater-plan.md`
- User docs: `docs/critique-theater.md`
- Web counterpart: `apps/web/src/components/Theater/AGENTS.md`
