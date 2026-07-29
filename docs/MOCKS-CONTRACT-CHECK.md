# Real-CLI contract check

The replay mocks under `mocks/` impersonate real agent CLIs by emitting
recorded traces in each CLI's native protocol. They're great for parser
regression coverage but they can silently drift away from the real CLI
when:

- An agent CLI ships a new event `type` that the mock doesn't know about.
- A field gets renamed (`sessionID` → `sessionId`) and the mock keeps
  emitting the old name. OD's parser may have been updated to accept
  both, so smoke tests stay green, but new fields aren't surfaced.
- A protocol version bump changes the shape of `usage` / tool calls /
  init blocks.

The contract check is the periodic ritual that catches that drift.

## Scope

It is **not** a CI gate. The check:

- Costs real LLM tokens (a few cents per agent per run).
- Requires the real CLI installed + authenticated locally or on a
  maintainer-controlled runner.
- Wants a human to eyeball the output, not a regex.

Treat it like a maintenance task — monthly is fine, ad-hoc whenever a
relevant CLI publishes a release note about output-format changes.

## How to run

```bash
bash mocks/scripts/contract-check.sh claude
bash mocks/scripts/contract-check.sh codex
bash mocks/scripts/contract-check.sh opencode
```

The script:

1. Resolves the real CLI binary (ignoring the `mocks/bin/` PATH overlay).
2. Sends a fixed deterministic prompt: *"List the entries of the current
   working directory and tell me how many JSON files are present."*
3. Runs the same prompt through the mock CLI.
4. Prints a side-by-side distribution of top-level event `type`
   values from both.
5. Leaves both raw JSONL outputs in `/tmp` for you to `diff`.

## What to look for

Compare the two `type` distributions. Acceptable differences:

- Counts vary slightly (mock plays a single recorded trace, real CLI
  may take a different number of turns for the same prompt).
- Mock emits a superset of the real CLI's event types — the recordings
  span historical CLI versions.

**Red flags**:

- Real CLI emits a `type` value the mock never produces → the mock
  needs a new event handler in `mocks/lib/format-<agent>.mjs`.
- Real CLI's event uses different field names than the mock → either
  the real CLI changed and the parser may already be out of sync, or
  the mock is drifting toward an internal convention.
- Mock crashes / emits nothing → the agent's `--no-delay` path is
  broken.

## Suggested cadence

No fixed schedule, no automated cron — the check is human-driven:

- **On real-CLI release**: when Anthropic / OpenAI / OpenCode publishes
  a release whose notes mention "output format" / "JSON" / "stream" /
  "events" / "API", run the affected agent's check. This is the
  highest-signal trigger.
- **Before a parser refactor**: lock the contract before touching
  `apps/daemon/src/claude-stream.ts` / `json-event-stream.ts`, so a
  post-refactor failure means "I broke the parser" rather than "the
  real CLI already drifted and the parser had silently caught it".
- **Ad-hoc**: if something feels off — UI suddenly missing a tool call,
  duplicate events, unfamiliar field names in logs — a contract check
  is the fast first step.

Putting this on a cron would burn LLM tokens every run with no human
review of the output, defeating the point. The check is an artifact a
maintainer reads, not a CI gate.

## Future improvements

The current script only compares top-level `type` distributions
because a deeper structural diff is hard to do without a schema.
Possible follow-ups:

1. **JSON-shape schema per agent** — generate a JSON Schema from the
   mock formatters' output, run a validator against real-CLI output,
   report violations with field paths.
2. **Recorded-then-replayed delta** — capture the real CLI's output
   for the fixed prompt, save under `mocks/contracts/<agent>.golden.jsonl`,
   then in CI replay that golden through the daemon parser and assert
   no parser errors. Cheaper than calling the LLM every CI run but
   only catches *parser* drift, not *CLI* drift.

Neither is implemented today.

## Related

- `mocks/scripts/contract-check.sh` — the script itself.
- `apps/daemon/tests/mocks-golden.test.ts` — daemon-event golden
  snapshots (catches parser regressions against the mocks, complementary
  to this check which catches mock-vs-real drift).
