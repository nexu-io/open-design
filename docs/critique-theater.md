# Design Jury (Critique Theater)

A built-in design panel that reviews every generation before it ships. Five
specialists (Designer, Critic, Brand, Accessibility, Copy) score the artifact
across each round, and the run keeps iterating until the composite clears the
threshold or the orchestrator gives up.

The product label is **Design Jury**. The internal feature name (code paths,
metrics, env vars) stays **Critique Theater**: `apps/daemon/src/critique/`,
`apps/web/src/components/Theater/`, SSE channels `critique.*`, env vars
`OD_CRITIQUE_*`. The user-facing label is sourced from a single i18n key,
`critiqueTheater.userFacingName`, so the product name can be renamed without
touching code.

## 1. What is Design Jury

When an agent emits an `<artifact>` block, the Critique Theater wraps the
artifact in a structured review cycle. Five panelists vote on independent
dimensions, the orchestrator composites their scores, and the run either
ships (composite ≥ threshold) or runs another round. The user sees:

- A **live panel** while the run is in flight: one lane per panelist with
  the current round's score, the cumulative must-fix count, and a sparkline
  of per-dim scores.
- A **score ticker** showing the composite trajectory across rounds, with a
  horizontal threshold marker so it is obvious whether the latest round
  cleared the bar.
- A **collapsed badge** once the run settles: "Shipped at round 2, composite
  8.6" for the happy path, with status variants for `below_threshold`,
  `timed_out`, and `interrupted`.

The Theater runs inside the same CLI session the agent already uses (no
second process, no second transport). All five panelists are turns in the
same conversation, which keeps the model context coherent and prevents the
"panelist disagrees with itself across processes" failure mode.

### Why an in-CLI panel and not a third-party design lint

People reading this section before they touch the feature often ask
"why not Figma's design lint plugin, or Adobe's accessibility checker,
or a Material You conformance tool?". Three differences matter:

- **Lint bots check what they were told to look for.** They are rule
  engines: a finite set of "rectangle missing alt text", "contrast
  below 4.5:1", "spacing off a 4 px grid". Design Jury panelists are
  generative: each lens (Critic, Brand, Accessibility, Copy) reads
  the artifact in context and writes a per-dimension narrative with
  must-fix entries the next round responds to. The output is closer
  to a structured PR review than to a lint report.
- **Lint bots fire after design exists.** Design Jury fires *inside*
  the generation loop, so the next round can act on the critique
  before a human sees the artifact at all. The user gets the
  composited score; they do not have to triage 50 individual rule
  failures.
- **Lint bots are external services.** Design Jury runs as turns in
  the same CLI session the agent is already using, so it inherits
  the project's auth, the brand's design tokens, and the skill's
  brief without a separate API integration. The conformance harness
  (`apps/daemon/src/critique/conformance.ts`) is what keeps panelist
  output protocol-clean; no third party is in the loop.

Where a Figma lint or accessibility checker is the right tool, plug it
in alongside Design Jury (the design system's `DESIGN.md` is where
that integration lives). The two are complementary, not redundant.

## 2. How it works

### The five panelists

| Role | What it scores |
|---|---|
| **Designer** | Layout, composition, hierarchy. The "is this beautiful and balanced" lens. |
| **Critic** | Whether the artifact actually meets the brief. Contrast, weight, readability. |
| **Brand** | Token compliance, voice, on-brand color use. |
| **Accessibility** | WCAG conformance, focus rings, semantic structure, alt text. |
| **Copy** | Voice, tone, terseness, error message quality. |

The cast is fixed in v1. Per-skill cast configuration is reserved for v2
(see roadmap).

### Auto-converging rounds

The orchestrator runs **up to 3 rounds** by default. A run stops when
the first of these conditions is met:

1. **Threshold reached.** Composite ≥ `threshold` (8.0 / 10 in v1) at
   the end of any round. The run ships immediately with that round's
   artifact.
2. **Round budget exhausted.** Three rounds completed without crossing
   the threshold. The run takes the `fallbackPolicy` path (default
   `ship_best`: re-ship whichever round's artifact had the highest
   composite).
3. **Per-round timeout.** A single round exceeded `perRoundTimeoutMs`
   (60 s default). The run flips to `failed` with
   `cause: 'per_round_timeout'`.
4. **Total timeout.** The full run exceeded `totalTimeoutMs` (180 s
   default). The run flips to `failed` with `cause: 'total_timeout'`.
5. **User interrupt.** The user pressed Esc or clicked Interrupt
   mid-run. The run flips to `interrupted` with the best round so far.

A run that hits #2 emits the score badge as `Below threshold` (not
`Shipped`) so the user can tell convergence failed.

After each round the composite is computed from the per-panelist
weights:

```
composite = designer × 0.0
          + critic × 0.4
          + brand × 0.2
          + a11y × 0.2
          + copy × 0.2
```

**Why these weights:** Critic carries the highest weight (0.4) because
it directly gates whether the artifact meets the brief: a beautiful
poster that does not say what it was supposed to say is the failure
mode this lens is built to catch. Brand, Accessibility, and Copy are
weighted equally (0.2 each) as secondary quality dimensions that no
production artifact is allowed to drop. Designer is weighted at 0.0 in
v1 because their dimensions are aesthetic preferences rather than ship
gates; the slot stays in the schema so Designer's qualitative notes
still travel into the transcript and a future config release can bump
the weight without a wire-shape change. The roadmap targets per-skill
cast configuration in v2 (see [`apps/daemon/src/critique/AGENTS.md`](../apps/daemon/src/critique/AGENTS.md) and [`apps/web/src/components/Theater/AGENTS.md`](../apps/web/src/components/Theater/AGENTS.md) for the cross-package work that lands the change).

If the composite meets the **threshold (8.0 / 10)** the run ships. Otherwise
the orchestrator emits the round summary, the agent revises, and the next
round begins. After 3 rounds without convergence the run takes the
`fallbackPolicy` path (`ship_best` by default, falling back to whichever
round had the highest composite).

### One CLI session, one transport

The orchestrator does not spawn extra processes per panelist. Each panelist
is a turn in the same agent session, separated by `<PANELIST role="...">`
tags in the protocol stream. The parser converts those into `panelist_*`
events that the web reducer consumes via SSE. This keeps the operational
contract identical to a normal generation: same auth, same env, same logs.

## 3. Settings reference

### Enable / disable

The feature is gated behind the `OD_CRITIQUE_ENABLED` env var and, after
Phase 15 lands, the **Settings → Critique Theater (beta)** toggle. The web
toggle persists into the daemon's settings store; both surfaces flip the
same flag.

Defaults: **disabled** during M0 dark-launch and M1 settings-toggle phases.
Enabled by default per skill during M2, then globally during M3 after
≥ 90% of production adapters maintain conformance for 14 consecutive days
(see `docs/agent-adapters.md`).

### Per-skill override

A skill can opt in or out via `od.critique.policy` in its `SKILL.md`
frontmatter:

```yaml
od:
  critique:
    policy: required  # or 'opt-in', 'opt-out'
```

Skills that publish a deterministic artifact (e.g. `od-export-pdf`) usually
set `opt-out`; skills that generate net-new design output (`magazine-poster`,
`saas-landing`) set `required`.

### Score threshold and weights

The threshold (8.0) and per-role weights (designer 0 / critic 0.4 / brand
0.2 / a11y 0.2 / copy 0.2) are read-only in v1. v2 will expose them in the
Settings panel.

## 4. Reading the score badge

After a run settles the Theater collapses to a single chip. The chip
displays:

- **composite** — the final score on the 0 / 10 scale.
- **round** — which round closed the run.
- **status badge** — colored token explaining how the run ended:
  - `Shipped`: composite ≥ threshold (the happy path, accent-tinted).
  - `Below threshold`: composite < threshold after all rounds (amber-tinted).
  - `Timed out`: total run exceeded `totalTimeoutMs` (amber-tinted).
  - `Interrupted`: user pressed Esc or clicked Interrupt mid-run.
  - `Degraded`: the panel was offline this run (adapter could not produce
    a valid critique). See troubleshooting below.

The `interrupted` chip uses a distinct copy ("Interrupted at round N, best
composite X.X") so the user is not told the run shipped when it did not.

## 5. Replay

Every run writes a structured transcript (`.ndjson`, optionally `.gz`).
Opening the chip's **Replay** button mounts a read-only Theater that plays
the transcript at the chosen speed:

- `Instant`: flushes every event synchronously. Useful when reopening a
  finished run.
- `Live`: paces events at the original cadence (Phase 7+ follow-up; v1
  treats this the same as a 0-ms `intervalMs`).
- `{ intervalMs: N }`: fixed N-ms delay between events.
- `Paused`: holds the cursor in place. Resuming picks up exactly where the
  pause landed (no re-flush of prior events).

The replay surface is keyboard-scrubbable: `J` / `K` jump round-by-round,
`Esc` exits the replay.

## 6. Troubleshooting

### "Panel offline this run"

The orchestrator emits a `degraded` event when one of these happens:

| Reason | Cause | Remediation |
|---|---|---|
| `malformed_block` | The adapter emitted a `<CRITIQUE>` block the parser rejects. | Re-run the conformance harness locally (`pnpm --filter @open-design/daemon vitest run tests/critique-conformance.test.ts`) to confirm the adapter's transcript shape; once Phase 12 lands the dashboard surfaces this status as a series, but until then the harness is the authoritative source. |
| `oversize_block` | The block exceeded `parserMaxBlockBytes`. | Usually a runaway model; retry once or raise the budget. |
| `adapter_unsupported` | The adapter is marked `critique:degraded` for the 24h TTL window. | Wait for the TTL or run `od adapters clear-degraded <id>`. |
| `protocol_version_mismatch` | The adapter is on an older protocol. | Update the adapter or pin protocol negotiation. |
| `missing_artifact` | The run finished but no `<artifact>` body landed. | Almost always a prompt bug; check the skill template. |

### "Below threshold after 3 rounds"

The run shipped under the bar with `fallbackPolicy: ship_best`. Tune the
brief (more specific guidance, tighter token constraints), switch to a
skill whose DESIGN.md aligns better with the brief, or raise `maxRounds`.

### "Interrupted at round N"

The user pressed Esc or clicked Interrupt. The chip surfaces the best
composite seen so far. You can resume by re-issuing the brief.

## 7. FAQ

**Why five panelists, why fixed?** The five-role cast is the smallest set
that covers the lenses every artifact reviewer uses in practice
(composition, intent, brand, accessibility, voice). Locking the set keeps
the SSE wire shape, the SQLite schema, and the metrics dashboard stable.
Per-skill cast configuration is reserved for v2.

**Why is my adapter marked degraded for 24h?** The conformance harness
runs every adapter nightly against 10 brief templates. If an adapter
drops under the 90% shipped or 95% clean-parse thresholds for two
consecutive cycles, it gets marked `critique:degraded` for 24h. The mark
auto-clears on the next clean cycle.

**Can I add my own panelist?** Not in v1. v2 plans a panelist plug-in
contract; see `docs/roadmap.md` for the timeline.

## Related

- `docs/spec.md` — protocol v1 wire format.
- `docs/architecture.md` — orchestrator + parser layout.
- `docs/skills-protocol.md` — `od.critique.policy` frontmatter contract.
- `docs/agent-adapters.md` — conformance contract and adapter responsibilities.
- `docs/roadmap.md` — v2 panelist extensions.
- `apps/daemon/src/critique/AGENTS.md` — daemon-side module map.
- `apps/web/src/components/Theater/AGENTS.md` — web-side module map.
