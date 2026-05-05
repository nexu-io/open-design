# Critique Theater

## Naming

- **Internal codename (engineering, code, prompts, env vars, modules, SSE event prefix, telemetry):** `Critique Theater`. Used in `apps/daemon/src/critique/`, `apps/web/src/components/Theater/`, `OD_CRITIQUE_*`, `critique.*` SSE events.
- **User-facing label (UI, settings, docs, README, marketing copy):** `Design Jury`. The string is sourced from a single i18n key `critiqueTheater.userFacingName` so the label can be swapped without touching code.

The split is deliberate. Engineers reason about the system; users hire a jury.

## Purpose

Critique Theater turns Open Design's single-pass artifact generation into a panel-tempered, scored, replayable process. Every artifact is born through a visible five-person Design Jury (Designer, Critic, Brand, A11y, Copy) running inside one CLI session, with auto-converging rounds bounded by a configurable score threshold. By default, no artifact ships under 8.0/10.

This spec is normative for the v1 implementation and protocol. It is the source of truth that the prompt template, the daemon parser, the SSE event schema, the SQLite columns, the Theater UI components, and the adapter conformance suite all derive from.

## Non-goals

- Not a new skill protocol. Existing skills under `skills/` work unchanged.
- Not a new agent runtime. The daemon spawns the same single CLI per artifact it spawns today.
- Not a parallel-process architecture. There is exactly one CLI invocation per artifact lifecycle.
- Not a new transport. SSE on the existing project event stream carries every new event variant.
- Not a configurable cast in v1. The five panelists are fixed. Cast extension is reserved for v2.

### Why each non-goal is excluded

The non-goals above are intentional, not arbitrary. Future readers should know the tradeoff that led to each.

- **No parallel processes.** A single CLI session keeps the agent's full context coherent: the Designer's draft and every later panelist's notes share one model context, so the Critic can see the actual hierarchy values the Designer chose, the Brand panelist can read the same DESIGN.md the Designer was passed, and the Copy panelist can pick at the verbs the Designer wrote. Splitting this across processes would require a cross-process artifact handoff and a way to replay prior-panelist notes into each one's context, which adds an estimated two to three weeks to the v1 timeline and turns a debugging session into a multi-process trace correlation problem.
- **No new agent runtime.** The same on-PATH CLI Open Design already detects (Claude Code, Codex, Cursor Agent, Gemini CLI, etc.) is how this feature reaches users. Building a runtime would replicate work that the existing daemon already does well, would force users onto a model we picked rather than the one they signed up for, and would lose BYOK at every layer.
- **No new SSE transport.** SSE is already plumbed through the daemon, the web app, the Electron shell, and the desktop sidecar IPC. A second transport would force every consumer to learn a second connection lifecycle, which is exactly the kind of accidental complexity that takes a feature out of v1.
- **No configurable cast in v1.** A fixed five-panelist roster lets the composite formula and weight defaults stay constant across every artifact. A configurable cast adds UX surface (per-skill picker, override storage, settings sync) and requires the score formula to redistribute weight on the fly. We commit to v2 once we have data on which roles users actually drop or add.
- **No new skill protocol.** Critique Theater layers on top of the skill loader; it does not change what a skill is. This means the 31 existing skills, the 129 design systems, and any future contributions inherit the panel without per-skill migration work.

## High-level architecture

```
[ apps/web ]                           [ apps/daemon ]                    [ active CLI ]
  brief form         POST brief          spawnAgent(skill, brief, cfg)      role-plays
  Theater stage   ─────────────────►     compose prompt:                     5 panelists
  score badge                              base skill prompt                 across up to
  transcript                              + design system DESIGN.md          3 rounds in
  replay                                  + panel.ts protocol addendum       one session
                                          + critique config                  emits XML-ish
                  ◄─── SSE events ───────  parse stdout incrementally        tagged stream
  reducer +                                emit panelEvent / roundEvent
  selectors                                / shipEvent / degradedEvent
                                           persist transcript ndjson +
                                           critique columns in SQLite
```

There are exactly three new modules in the daemon:

| Module | Responsibility | Inputs | Outputs |
| --- | --- | --- | --- |
| `apps/daemon/src/critique/parser.ts` | Streaming tokenizer for `<PANELIST>`, `<ROUND_END>`, `<SHIP>` blocks. Handles partial chunks, malformed input, recovery. | `AsyncIterable<string>` (CLI stdout) | `AsyncIterable<PanelEvent>` |
| `apps/daemon/src/critique/scoreboard.ts` | Pure state machine. Consumes `PanelEvent`s, buffers per-round, decides ship vs continue using injected config. No I/O. | `PanelEvent`, `CritiqueConfig` | `ScoreboardEvent` (delta-driven) |
| `apps/daemon/src/critique/orchestrator.ts` | Wires parser and scoreboard to the SSE bus and SQLite. Owns interrupt cascade, persistence, and degraded fallback. | spawn handle, project id, artifact id | side effects: SSE + DB writes |

Two new web component groups:

| Component group | Responsibility |
| --- | --- |
| `apps/web/src/components/Theater/` | Live theater stage, collapsed score badge, transcript replay, interrupted state, degraded banner, interrupt button. Driven entirely by a pure reducer over the SSE event stream. |
| `apps/web/src/prompts/panel.ts` | The protocol addendum injected into every artifact-generating prompt. Exports `PROTOCOL_VERSION`. |

One new contract package extension:

| File | Purpose |
| --- | --- |
| `packages/contracts/src/critique.ts` | `CritiqueConfig` zod schema, `PANELIST_ROLES` constants, `PanelEvent` discriminated union, `CritiqueSseEvent` extension to the existing SSE event union. |

## Configuration

All thresholds, timeouts, and policies are config-driven. There are no magic numbers in business logic. Defaults live in a single `defaults.ts` next to the schema and are overridable via environment variables read by the existing daemon env layer.

```ts
// packages/contracts/src/critique.ts
export const PANELIST_ROLES = ['designer', 'critic', 'brand', 'a11y', 'copy'] as const;
export type PanelistRole = typeof PANELIST_ROLES[number];

export interface CritiqueConfig {
  enabled: boolean;
  cast: PanelistRole[];
  maxRounds: number;
  scoreThreshold: number;
  scoreScale: number;
  weights: Record<PanelistRole, number>;
  perRoundTimeoutMs: number;
  totalTimeoutMs: number;
  parserMaxBlockBytes: number;
  fallbackPolicy: 'ship_best' | 'ship_last' | 'fail';
  protocolVersion: number;
  maxConcurrentRuns: number;
}
```

| Env var | Default | Notes |
| --- | --- | --- |
| `OD_CRITIQUE_ENABLED` | `false` at M0, `true` from M3 | Master switch. False = legacy generation. |
| `OD_CRITIQUE_MAX_ROUNDS` | `3` | Hard upper bound on rounds. |
| `OD_CRITIQUE_SCORE_THRESHOLD` | `8.0` | Ship gate. Composite below this continues. |
| `OD_CRITIQUE_SCORE_SCALE` | `10` | Score range upper bound. Lower bound is always 0. |
| `OD_CRITIQUE_ROUND_TIMEOUT_MS` | `90000` | Per-round wall clock cap. |
| `OD_CRITIQUE_TOTAL_TIMEOUT_MS` | `240000` | Total run wall clock cap. |
| `OD_CRITIQUE_PARSER_MAX_BLOCK_BYTES` | `262144` | Hard cap on bytes between matched tags. Prevents unbounded buffering. |
| `OD_CRITIQUE_FALLBACK_POLICY` | `ship_best` | When threshold never met, which round to keep. |
| `OD_CRITIQUE_MAX_CONCURRENT_RUNS` | `os.cpus().length` | Daemon-wide cap. Excess requests queue per project FIFO. |

The default weights for composite score are `{ designer: 0, critic: 0.40, brand: 0.20, a11y: 0.20, copy: 0.20 }`. Designer is omitted from the composite because Designer drafts; Designer does not score. If a panelist's score is missing in a round, weight redistributes proportionally across present panelists. The weights object is a single source of truth; the formula lives only in `scoreboard.ts`.

## Wire protocol (`PROTOCOL_VERSION = 1`)

The format is XML-ish tagged regions, not JSON. Tagged regions tolerate streaming, partial chunks, and model variability where JSON does not. Existing OD prompt files (`directions.ts`, `discovery.ts`) already use this style.

```
<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">

  <ROUND n="1">
    <PANELIST role="designer">
      <NOTES>One sentence stating the design intent for v1.</NOTES>
      <ARTIFACT mime="text/html"><![CDATA[
        ... self-contained artifact for round 1 ...
      ]]></ARTIFACT>
    </PANELIST>

    <PANELIST role="critic" score="6.4" must_fix="3">
      <DIM name="hierarchy" score="6">CTA competes with logo at top-left.</DIM>
      <DIM name="type"      score="7">H1 64px reads as poster, not landing.</DIM>
      <DIM name="contrast"  score="4">CTA 3.9:1, fails AA.</DIM>
      <DIM name="rhythm"    score="6">Vertical gaps 12/16/24/40, no system.</DIM>
      <DIM name="space"     score="5">Hero padding asymmetric L vs R.</DIM>
      <MUST_FIX>Push CTA background L by 8% to clear AA.</MUST_FIX>
      <MUST_FIX>Pick a 4px or 8px vertical rhythm.</MUST_FIX>
      <MUST_FIX>Symmetrize hero horizontal padding.</MUST_FIX>
    </PANELIST>

    <PANELIST role="brand" score="7.5"> ... </PANELIST>
    <PANELIST role="a11y" score="5.0"> ... </PANELIST>
    <PANELIST role="copy" score="6.0"> ... </PANELIST>

    <ROUND_END n="1" composite="6.18" must_fix="7" decision="continue">
      <REASON>Composite below threshold 8.0; 7 must-fix open.</REASON>
    </ROUND_END>
  </ROUND>

  <ROUND n="2"> ... </ROUND>
  <ROUND n="3"> ... </ROUND>

  <SHIP round="3" composite="8.62" status="shipped">
    <ARTIFACT mime="text/html"><![CDATA[
      ... final shipped artifact ...
    ]]></ARTIFACT>
    <SUMMARY>One paragraph describing what changed across rounds and why.</SUMMARY>
  </SHIP>

</CRITIQUE_RUN>
```

### Parser invariants

| Invariant | Enforcement |
| --- | --- |
| Tags well-formed and balanced | Streaming parser. Malformed input raises `MalformedBlockError`. |
| `role` value is in `PANELIST_ROLES` | Unknown role drops the block, emits warning, run continues. |
| `score` is `0 <= n <= scoreScale` with one decimal | Out of range clamps to bounds and emits warning. |
| `composite` matches recomputed mean within ±0.05 | Mismatch logs warning; daemon's recomputed value wins. |
| Each round contains every cast role exactly once | Missing role contributes score `0` for that role; must-fix counter advances. |
| Designer round 1 contains exactly one `<ARTIFACT>` | Missing artifact raises `MissingArtifactError` and triggers degraded fallback. |
| `<SHIP>` appears exactly once or never | Duplicates: first wins, rest dropped, warning emitted. |
| `decision` is `continue` or `ship` | Unknown defaults to `continue` (safe). |
| Total bytes between matched open and close tags ≤ `parserMaxBlockBytes` | Excess raises `OversizeBlockError` and triggers degraded fallback. |
| CDATA appears only inside `<ARTIFACT>` and `<NOTES>` | Lexer state machine enforces. |

### Composite score formula

```ts
// Pure function in apps/daemon/src/critique/scoreboard.ts.
// weights come from CritiqueConfig.weights, never hardcoded in business logic.
const present = roles.filter(r => panelistScore[r] != null);
const totalWeight = present.reduce((s, r) => s + weights[r], 0);
const composite = present.reduce((s, r) => s + (weights[r] / totalWeight) * panelistScore[r], 0);
```

### Protocol versioning

- `<CRITIQUE_RUN version="1">` is canonical for v1.
- Parser dispatches to `parsers/v1.ts`. Future v2 lands in `parsers/v2.ts` alongside v1; the daemon supports both indefinitely.
- Each artifact row stores `critique_protocol_version`. Old artifacts replay through their original parser, never the new one.
- The prompt template exports `PROTOCOL_VERSION` as a TypeScript constant; CI fails if this constant is bumped without a new `parsers/v{n}.ts` file.

### Disagreement requirement

Every non-final round must contain at least two panelists with diverging `MUST_FIX` directives. The Critic and at least one of {Brand, A11y, Copy} must each emit at least one `MUST_FIX` whose target subsystem differs from the others. The protocol enforces this in the prompt template; the parser emits a `WeakDebate` warning if the round closes without disagreement, which the orchestrator counts toward `parser_errors_total{kind="weak_debate"}` for observability but does not fail the run on.

### Convergence rule

A round closes with `decision="ship"` when both:

- `composite >= scoreThreshold`
- Sum of open `must_fix` counts across panelists is `0`

Otherwise the round closes with `decision="continue"` and the next round begins. After `maxRounds`, the orchestrator applies `fallbackPolicy`:

- `ship_best`: choose the round with highest composite. Default.
- `ship_last`: choose the last completed round.
- `fail`: persist the run as `below_threshold` with no shipped artifact; UI shows recovery actions.

### Self-bound budget

Round `n+1` transcript bytes must be less than round `n` transcript bytes. Final shipped artifact must be production-ready: no `TODO` comments, no Lorem Ipsum, no broken links. The prompt template enforces; the orchestrator runs a final lint pass before persisting the artifact.

## SSE event protocol

The existing `/api/projects/:id/events` SSE stream carries new event variants. All event names live in `packages/contracts/src/sse.ts` as a discriminated union extension, never as string literals in handlers.

| Event name | Payload fields | Meaning |
| --- | --- | --- |
| `critique.run_started` | `runId`, `protocolVersion`, `cast`, `maxRounds`, `threshold`, `scale` | Theater handshake. UI initializes lanes from `cast`, lays out rounds from `maxRounds`. |
| `critique.panelist_open` | `runId`, `round`, `role` | Tag opened in the stream. UI activates lane caret. |
| `critique.panelist_dim` | `runId`, `round`, `role`, `dimName`, `dimScore`, `dimNote` | Per-dim score line. UI animates the corresponding bar. |
| `critique.panelist_must_fix` | `runId`, `round`, `role`, `text` | Must-fix directive. UI appends to the lane. |
| `critique.panelist_close` | `runId`, `round`, `role`, `score` | Tag closed. UI deactivates caret, locks score. |
| `critique.round_end` | `runId`, `round`, `composite`, `mustFix`, `decision`, `reason` | Round closed. UI advances ScoreTicker, RoundDivider increments. |
| `critique.ship` | `runId`, `round`, `composite`, `status`, `artifactRef`, `summary` | Run shipped. UI collapses theater into score badge. |
| `critique.degraded` | `runId`, `reason`, `adapter` | Parser fallback fired. UI replaces theater with banner. |
| `critique.interrupted` | `runId`, `bestRound`, `composite` | User interrupt. UI shows interrupted state. |
| `critique.failed` | `runId`, `cause` | Unrecoverable error. UI shows failed state with retry. |
| `critique.parser_warning` | `runId`, `kind`, `position` | Non-fatal parser recovery. UI surfaces to log only, never to user, unless `kind == "weak_debate"`. |

The `artifactRef` payload is a logical reference (`{ projectId, artifactId }`), not the artifact body. The UI fetches the body through the existing artifact endpoint and renders in the existing sandboxed iframe.

## Persistence

A new SQLite migration adds critique columns to the existing `artifacts` table. The migration is additive and reversible.

```sql
-- 00XX_critique_rounds.up.sql
ALTER TABLE artifacts ADD COLUMN critique_score REAL;
ALTER TABLE artifacts ADD COLUMN critique_rounds_json TEXT;
ALTER TABLE artifacts ADD COLUMN critique_transcript_path TEXT;
ALTER TABLE artifacts ADD COLUMN critique_status TEXT
  CHECK (critique_status IN ('shipped','below_threshold','timed_out','interrupted','degraded','failed','legacy'));
ALTER TABLE artifacts ADD COLUMN critique_protocol_version INTEGER;
CREATE INDEX IF NOT EXISTS idx_artifacts_critique_status ON artifacts(critique_status);
```

```sql
-- 00XX_critique_rounds.down.sql
DROP INDEX IF EXISTS idx_artifacts_critique_status;
ALTER TABLE artifacts DROP COLUMN critique_protocol_version;
ALTER TABLE artifacts DROP COLUMN critique_status;
ALTER TABLE artifacts DROP COLUMN critique_transcript_path;
ALTER TABLE artifacts DROP COLUMN critique_rounds_json;
ALTER TABLE artifacts DROP COLUMN critique_score;
```

| Column | Format | Notes |
| --- | --- | --- |
| `critique_score` | `REAL` | Final composite. `NULL` for legacy artifacts. |
| `critique_rounds_json` | `TEXT` | Compact summary per round: `[{n, composite, mustFix, decision}]`. Bounded; full transcript on disk. |
| `critique_transcript_path` | `TEXT` | Relative path under `.od/artifacts/<artifactId>/`. The stored value is the relative path; absolute resolution is daemon-side only. |
| `critique_status` | `TEXT` | Constrained by `CHECK` clause. `legacy` marks artifacts produced before the feature shipped. |
| `critique_protocol_version` | `INTEGER` | Pin which `parsers/v{n}.ts` to use for replay. |

Transcripts are written to `.od/artifacts/<artifactId>/transcript.ndjson` (one `PanelEvent` per line). Files larger than 256 KiB are gzipped to `transcript.ndjson.gz`. The orchestrator chooses the format at write time; the replay path detects the format by extension.

## UI surface

All Theater components live under `apps/web/src/components/Theater/`. Each file is under 200 lines.

```
Theater/
  index.ts
  TheaterStage.tsx
  PanelistLane.tsx
  ScoreTicker.tsx
  RoundDivider.tsx
  TheaterCollapsed.tsx
  TheaterTranscript.tsx
  TheaterDegraded.tsx
  InterruptButton.tsx
  hooks/
    useCritiqueStream.ts
    useCritiqueReplay.ts
  state/
    reducer.ts
    selectors.ts
  __tests__/
    reducer.test.ts
    TheaterStage.test.tsx
```

### State machine

```ts
type CritiqueState =
  | { phase: 'idle' }
  | { phase: 'running'; runId: string; rounds: Round[]; activeRound: number; activePanelist: PanelistRole | null }
  | { phase: 'shipped'; runId: string; rounds: Round[]; final: ShipPayload }
  | { phase: 'degraded'; reason: DegradedReason }
  | { phase: 'interrupted'; runId: string; rounds: Round[]; bestRound: number }
  | { phase: 'failed'; runId: string; cause: FailedCause };
```

The reducer is pure. Every transition is covered by a vitest case backed by golden-file SSE replays from the adapter conformance suite. No state lives outside the reducer except UI-only ephemera (lane scroll position, badge expanded vs collapsed).

### Visual specification

- Lanes stack vertically inside the right rail with `gap: 12px`. At viewport widths under 720 px the rail itself becomes a full-width drawer.
- Per-dim scores render as horizontal bars whose width animates from 0 to `(score / scaleMax) * 100%` with `transition: width 600ms cubic-bezier(.2,.8,.2,1)`.
- Animation respects `prefers-reduced-motion: reduce`; bars snap to final width and the score-ticker stops easing.
- Lane colors come from CSS custom properties keyed by role. The five role inks are themed against the active design system's OKLch token palette. No hex literals in TSX.
- Score badge in collapsed mode renders four colored dots labeled `C` `B` `A` `W` (Critic, Brand, A11y, copy/Word) plus the composite number.

### Lane density (compact-by-default, expand-on-demand)

The right rail is dense by nature (5 panelists, multiple dims each, must-fix lists, round dividers). To keep it readable for normal users without losing detail for power users, the panel ships three explicit modes, switchable by a segmented control above the lanes.

| Mode | Default? | Behavior |
| --- | --- | --- |
| `Smart` | yes | The active panelist (whichever lane is currently streaming, or, post-ship, the panelist with the lowest score) is expanded. All others are collapsed: head + 1-line summary only. |
| `Active only` | no | Only the active panelist is rendered; others are head-only with no summary, used for the most compact view (e.g., embedded in a small workspace tile). |
| `Expand all` | no | Every lane is fully expanded. Power users who want to see every dim and every must-fix at once. Persisted as a per-user preference once chosen explicitly. |

Lane heads are clickable to toggle that single lane's collapsed state, independent of the segmented control. The segmented control is the bulk operation; the lane head is the per-lane override.

The collapsed-lane summary is **derived**, not authored: it is the most prominent must-fix on that panelist, falling back to the highest-impact dim note if there are no must-fixes (panelist already happy). Truncation at one line with ellipsis. Selectors are pure and unit-tested.

### "Why this matters" explainer

Immediately under the composite score card, a single rule line states the ship contract in plain terms:

> Ships when composite score ≥ `scoreThreshold` and open must-fix == 0. Otherwise refine, up to `maxRounds` rounds.

Three rendering variants:

| Phase | Variant |
| --- | --- |
| `running` | "Ships when composite score &ge; 8.0 and open must-fix == 0. Otherwise refine, up to 3 rounds." |
| `shipped` | "Shipped: composite 8.6 &ge; threshold 8.0 with 0 open must-fix. Consensus N of 5 panelists." |
| `interrupted` | "Did not meet ship rule (8.0 + 0 must-fix), but you stopped early. Best-of-N was kept, transcript stays available." |

Numeric values come from `CritiqueConfig`, never hardcoded. The rule line uses a soft dashed border to read as explanatory chrome, not as actionable UI.

### Label sizing (production, not mockup)

| Element | Production size | Notes |
| --- | --- | --- |
| Composite score (big) | 36px / mono / 700 | the headline number |
| Per-panelist score | 14px / mono / 700 | colored to match lane ink |
| Dim names | 13px / mono | left column, secondary fg color |
| Dim numeric scores | 13px / mono / 600 | right column, primary fg color |
| Dim notes (sentence) | 13px / sans / 1.55 line-height | sentence-level explanation |
| Must-fix body | 13px / sans / 1.5 line-height | red ink on tinted background |
| Lane summary (collapsed) | 12px / sans / 1.4 line-height | derived single line, ellipsis at width |
| Lane name | 14px / sans / 600 | role label inside the head |
| Role tag | 11px / mono / uppercase | colored badge, fixed-width pill |
| Round divider | 11px / mono / uppercase / letter-spacing 0.1em | thin separator |
| Ship rule explainer | 12px / mono / 1.55 line-height | dashed-border explanatory block |

Label sizes ≤ 11px are reserved for tags, badges, and uppercase chrome only. **Body text is never below 12px in production.** This rule is enforced by a CI lint that grep-fails any new `font-size: <= 11px` rule outside the explicit chrome class allowlist (`role-tag`, `dim-dot`, `round-divider`, `meta-pill`).

### Demo-only chrome (must not ship)

The visual companion mockup includes affordances that are **not part of the product**:

- The "demo states" tab strip at the top of the rail.
- Any footer pill labeled "demo · click tabs to walk every state".
- The state-walking keyboard shortcut.

These exist purely to let reviewers walk every state in one page. The production Theater renders exactly one phase at a time, driven by the SSE stream. CI fails if any string matching `data-demo` or class `demo-tabs` appears in production bundles. The mockup HTML lives under `.superpowers/brainstorm/` (gitignored) and never ships.

### Accessibility

- Each lane has `role="region"` with `aria-labelledby` referencing its title.
- A single offscreen status node carries `aria-live="polite"`. It announces only `round_end` and `ship` events, never per-dim.
- Keyboard map: `Tab` cycles lanes, `Enter` toggles dim detail, `Esc` triggers Interrupt with confirm, `[` / `]` step through rounds in collapsed and replay mode.
- Color is never the only signal: must-fix counts use both color and a numeric badge; dim bars carry both color and width; scores always show as text.
- The Theater UI is itself audited by a CI test that pipes its rendered DOM through the same WCAG AA rule set the A11y panelist applies.

### Performance budget

| Metric | Budget | Enforcement |
| --- | --- | --- |
| Stage component bundle | ≤ 18 KiB gzipped | `size-limit` in CI |
| Reducer hot path | p99 ≤ 2 ms per event | vitest bench in CI |
| First lane visible from first SSE event | ≤ 200 ms | Playwright trace in `e2e/critique-theater.spec.ts` |
| Transcript scrub at 1 MiB transcript | 60 fps, no dropped frames | Playwright `Page.metrics` |

### Interrupt semantics

Pressing the Interrupt button or `Esc` while `phase === 'running'`:

1. Reducer transitions optimistically to a transient interrupting state. The button disables and labels itself "Interrupting…".
2. Web posts `POST /api/projects/:id/critique/:runId/interrupt`.
3. Daemon cascades `SIGTERM` to the spawned CLI. Orchestrator drains the parser, flushes the scoreboard, applies `fallbackPolicy` to the rounds completed so far, persists, and emits `critique.interrupted`.
4. Reducer advances to `phase: 'interrupted'`. UI shows the best-completed round's artifact plus a tag indicating which round shipped and the score.

If interrupt fires before any round closes, daemon ships nothing and persists the artifact row as `interrupted` with no `final`. The UI shows an empty state offering one-click retry with the original brief.

### Replay

Reopening an artifact loads the badge from SQLite columns. Clicking expand triggers `useCritiqueReplay`, which streams `transcript.ndjson` (or `.gz`) line by line into the same reducer. The same component code path renders both live and replay. Replay supports 1×, 4×, and instant playback speeds and a click-to-scrub timeline.

## Failure modes

| Failure | Detection | Behavior |
| --- | --- | --- |
| Model emits malformed block | parser sees opening tag with no close after `parserMaxBlockBytes` or before close tag | parser raises `MalformedBlockError`, orchestrator falls back to `legacy_generation` mode for this run, emits `critique.degraded` with reason. Artifact still ships through the legacy path. |
| Score never crosses threshold | scoreboard reaches `maxRounds` without consensus | apply `fallbackPolicy`. Score badge tagged `below_threshold`. |
| Per-round timeout | round wall clock exceeds `perRoundTimeoutMs` | abort current round, scoreboard ships best-so-far, badge tagged `timed_out`. |
| Total timeout | total wall clock exceeds `totalTimeoutMs` | `SIGTERM` CLI, ship best-so-far, transcript marked partial. |
| User Interrupt | `POST /api/projects/:id/critique/:runId/interrupt` | cascade `SIGTERM`, persist partial state, ship best-so-far if any round closed, otherwise mark `interrupted` with no final. |
| CLI process crash | spawn handle exits non-zero before `<SHIP>` | persist partial transcript, mark `failed` with `rounds_json.cause`, emit `critique.failed`, never silently retry. |
| Daemon restart mid-run | next boot scans SQLite for rows in state `running` older than `totalTimeoutMs` | mark `interrupted` with `rounds_json.recoveryReason = "daemon_restart"`. Never auto-resume. |
| Adapter unsupported | adapter fails conformance test in nightly CI | adapter marked `critique:degraded` in adapter registry with 24h TTL. UI shows the degraded banner once per session per adapter. |

### Failure-mode rate targets and recovery

Each failure mode above has an empirical rate target, a deterministic recovery path, and a Prometheus signal so the Phase 12 dashboard and the Phase 11 e2e suite can both pin sane thresholds. Targets are starting values; we tune them with the first 1000 production runs.

| Failure | Target rate | Recovery | Prometheus signal | Alert threshold |
| --- | --- | --- | --- | --- |
| `malformed_block` | < 0.5% of runs per adapter | emit `critique.degraded`, fall through to legacy single-pass generation. No retry. | `open_design_critique_degraded_total{reason="malformed_block",adapter="..."}` | sustained > 2% over 1h on any single adapter |
| `oversize_block` | < 0.1% of runs | same as `malformed_block` plus the parser's position is logged for postmortem | `open_design_critique_degraded_total{reason="oversize_block"}` | any non-zero sustained rate is treated as a model regression and pages |
| `missing_artifact` | < 0.2% of runs | degraded fallback, prompt template flagged for review (it should make this impossible) | `open_design_critique_degraded_total{reason="missing_artifact"}` | > 1% over 24h |
| Score never crosses threshold | < 5% of runs at M3 default | apply `fallbackPolicy` (default `ship_best`); badge tagged `below_threshold`; user can re-run | `open_design_critique_runs_total{status="below_threshold"}` | > 15% sustained over 24h is a quality regression |
| Per-round timeout | < 1% of runs | abort current round, ship best-so-far, badge tagged `timed_out` | `open_design_critique_runs_total{status="timed_out"}` | > 3% over 1h on any adapter |
| Total timeout | < 0.5% of runs | `SIGTERM` CLI, ship best-so-far, transcript marked partial | same series, distinguished by lifecycle attribute | shares the per-round timeout alert |
| User Interrupt | not an error; signal of latency or unwanted direction | preserve transcript, ship best-so-far if any round closed | `open_design_critique_interrupted_total{adapter="..."}` | > 10% over 24h is a UX problem worth investigating |
| CLI process crash | < 0.05% of runs | fail loud with `critique.failed`, no silent retry, daemon process surfaces the cause | `open_design_critique_runs_total{status="failed",cause="cli_exit_nonzero"}` | any non-zero sustained rate pages |
| Daemon restart mid-run | unbounded (depends on operator action) | persist `interrupted` with `recoveryReason="daemon_restart"`, never auto-resume | `open_design_critique_runs_total{status="interrupted",cause="daemon_restart"}` | informational, no alert |
| Adapter unsupported | adapter-specific; surfaces during conformance | adapter marked `critique:degraded` in registry with 24h TTL; degraded banner once per session | `open_design_critique_degraded_total{reason="adapter_unsupported",adapter="..."}` | one alert per adapter on first hit, suppressed during TTL |

A run can satisfy multiple labels (a `timed_out` run that also `below_threshold`s, for instance). The `status` label is a single canonical value derived by the orchestrator at run end; downstream histograms attach `cause` and `decision` as separate labels.

The Phase 11 e2e suite synthesizes each row above against a stub adapter and asserts the recovery actually fires. Phase 12 imports the alert thresholds into the Grafana dashboard JSON committed at `tools/dev/dashboards/critique.json` so an operator never has to guess.

## Concurrency and scalability

- Orchestrator instances are per-project. Daemon-wide concurrency cap via `OD_CRITIQUE_MAX_CONCURRENT_RUNS`. Excess requests queue with project-level FIFO.
- Streaming backpressure: parser is `AsyncIterable`-based. When the SSE consumer is slow, daemon's bounded mailbox (256 events) applies backpressure to the parser, which applies it to CLI stdout via the existing sidecar transport. No unbounded buffers anywhere.
- Transcripts larger than 1 MiB stream to disk only; the SQLite row stores a path, never a blob.
- Cross-skill reuse: every existing skill receives the panel for free; no per-skill code change is required.
- Adapter neutrality: the panel prompt is plain text with no CLI-specific tokens. Every adapter is tested via the conformance harness.

## Skills protocol extension

Skills opt out via a new optional frontmatter field in `SKILL.md`:

```yaml
od:
  critique:
    policy: always | on-demand | off
```

Default is `always` once `OD_CRITIQUE_ENABLED` flips global at M3. Per-skill overrides ship in the same PR as M2.

## Adapter conformance

For each of the 12 CLI adapters and the BYOK proxy, the conformance suite runs a deterministic mini-brief at `temperature=0` (where supported) and asserts:

- The parser consumes the stream without `MalformedBlockError`.
- All required tags appear in the canonical order.
- Composite score matches recomputed mean within ±0.05.
- `<SHIP>` artifact body parses as well-formed HTML.

Adapters that fail are marked `critique:degraded` in the adapter registry. The daemon falls back to legacy generation for that adapter and shows the degraded banner once per session. We never pretend feature parity that does not exist.

## Observability

| Metric | Type | Labels | Purpose |
| --- | --- | --- | --- |
| `open_design_critique_runs_total` | counter | `status`, `adapter`, `skill` | Run volume by terminal state. |
| `open_design_critique_rounds_total` | counter | `adapter`, `skill` | Average rounds per artifact. |
| `open_design_critique_round_duration_ms` | histogram | `quantile`, `adapter`, `skill`, `round` | Round latency distribution. |
| `open_design_critique_composite_score` | histogram | `quantile`, `adapter`, `skill` | Output quality distribution. |
| `open_design_critique_must_fix_total` | counter | `panelist`, `dim`, `adapter`, `skill` | Where the panel finds problems most often. |
| `open_design_critique_degraded_total` | counter | `reason`, `adapter` | Adapter health proxy. |
| `open_design_critique_interrupted_total` | counter | `adapter` | User abandonment signal. |
| `open_design_critique_parser_errors_total` | counter | `kind`, `adapter` | Parser robustness. |
| `open_design_critique_protocol_version` | gauge | `version` | Active protocol versions in use. |

Structured logs use the existing daemon logger with namespace `critique`. Required events: `run_started`, `round_closed`, `run_shipped`, `degraded`, `parser_recover`, `run_failed`. OpenTelemetry traces wrap each run with spans `critique.run`, `critique.round.<n>`, `critique.parse_chunk`, `critique.scoreboard_eval`, `critique.persist_round`, `critique.ship.persist`.

A Grafana dashboard ships in `tools/dev/dashboards/critique.json` with three default views: fleet quality (composite p50/p90/p99 over time per adapter), adapter health (degraded ratio plus parser-error rate), and brief throughput (runs per hour, rounds per run, time-to-ship).

## Security

| Surface | Threat | Mitigation |
| --- | --- | --- |
| `<ARTIFACT>` body | XSS in shipped HTML | Existing sandboxed iframe pattern with `sandbox` and CSP headers. No new surface. |
| Transcript on disk | Path traversal via stored path | The SQLite column stores a relative path; the daemon resolves under `.od/artifacts/<artifactId>/`; no user-supplied component reaches the resolver. |
| Brand `DESIGN.md` content in prompt | Prompt injection from a malicious system | DESIGN.md is wrapped in a `<BRAND_SOURCE>` block whose framing instructs the agent to treat it as data. Same defence as the existing skill loader. |
| Score and must-fix from agent stdout | Log injection (newlines, ANSI) | Parser strips ANSI; logs JSON-encode every value; UI renders as text only. |
| Pathological agent output | DoS via unbounded buffers | `parserMaxBlockBytes`, `perRoundTimeoutMs`, `totalTimeoutMs` are bounded and config-driven. Orchestrator enforces hard kill. |
| BYOK proxy invocation | SSRF / internal-IP exfil | Existing `/api/proxy/stream` blocks internal IPs at the daemon edge. Unchanged. |

A separate security review pass runs through the `code-reviewer` agent before merge.

## Testing

| Layer | Tool | Gate |
| --- | --- | --- |
| Pure unit | vitest | 95% line and 100% branch on `critique/parser.ts`, `scoreboard.ts`, `reducer.ts`. |
| Golden-file fixtures | vitest with `__fixtures__/critique/v1/*.txt` | Each adapter has at least one happy and two malformed transcripts on disk. |
| Component | RTL + jsdom | Every reducer phase rendered at least once. |
| Integration | vitest + sqlite memory + http mock | End-to-end happy path plus five failure modes. |
| Adapter conformance | nightly e2e against live adapters | Each of 12 CLIs plus BYOK proxy must pass canonical brief. |
| Playwright e2e | `e2e/critique-theater.spec.ts` | Theater renders within 200 ms, Esc triggers Interrupt, replay scrub at 60 fps. |
| Visual regression | Playwright `toHaveScreenshot()` | Each Theater state captured at 375 / 768 / 1280 viewports. |
| A11y self-test | axe-playwright | Theater UI passes WCAG AA. |
| Performance | size-limit + vitest bench | Bundle ≤ 18 KiB gz; reducer p99 ≤ 2 ms. |
| Dead-code | `ts-prune` scoped to `critique/` and `Theater/` | Zero unreferenced exports. |
| i18n | existing duplicate-key check plus new missing-key check | All 6 locales present for every Theater string. |
| Coverage walker | new `pnpm check:critique-coverage` | Each `CritiqueConfig` field, `PanelEvent` variant, SSE event, SQLite column, protocol grammar element, and i18n key has at least one production reference and one test. |

## Rollout

| Milestone | Scope | Default | Reversibility |
| --- | --- | --- | --- |
| M0 | Code lands behind `OD_CRITIQUE_ENABLED=false`. All tests run. No user-visible change. | off | flip env var |
| M1 | Settings UI toggle "Critique Theater (beta)". Adapter conformance grades published in README. 24h TTL on degraded markings. | off | flip toggle |
| M2 | Default-on for skills that benefit most: `magazine-poster`, `saas-landing`, `dashboard`, `finance-report`, `hr-onboarding`, `kanban-board`. Lightweight skills (`weekly-update`, `simple-deck`) remain opt-in. Per-skill `od.critique.policy` introduced in `SKILL.md`. | per-skill | per-skill flag |
| M3 | After 14 consecutive days at ≥ 90% adapter conformance across the fleet, flip the global default to true. Opt-out remains per-run and per-skill. | on | env var or per-skill |

Rollback at any milestone flips the master env var. SQLite columns are additive, never required for reads. Existing artifacts keep their badge; new artifacts go through legacy generation. No data migration is needed in either direction.

## Documentation deliverables

Every item is a CI gate. Missing documentation fails the build.

- `docs/critique-theater.md`, user-facing how-it-works with screenshots of all five states and an adapter compatibility table.
- `docs/spec.md`, adds a "Critique Theater protocol v1" section with the full wire grammar.
- `docs/architecture.md`, adds the `apps/daemon/src/critique/` module diagram.
- `docs/skills-protocol.md`, adds `od.critique.policy` field documentation and extension points.
- `docs/agent-adapters.md`, adds the conformance test contract every adapter must satisfy.
- `docs/roadmap.md`, adds future panelist extensions (Perf, i18n, Motion, Cost) as future work, not committed scope.
- `apps/daemon/src/critique/AGENTS.md`, module-level guide per the existing `AGENTS.md` convention.
- `apps/web/src/components/Theater/AGENTS.md`, same.
- `README.md`, single line in the "What you get" table: Critique Theater, every artifact panel-tempered, scored, replayable.
- All six locales (DE, JA, KO, zh-CN, zh-TW, EN) gain new strings in the same PR. Existing duplicate-key i18n CI gate covers consistency.

## Open questions

None. All foundational decisions are locked in this spec. Future work is reserved for v2 (configurable cast, additional panelist roles, multi-CLI parallel debate, score-driven prompt-stack feedback loop) and is out of v1 scope.
