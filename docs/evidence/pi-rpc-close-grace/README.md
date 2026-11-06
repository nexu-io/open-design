# Pi RPC close grace-period evidence

This is a **recorded test-results comparison**, not a product UI or native-terminal screenshot. All test processes and data are synthetic and isolated by the existing daemon test harness.

## Compared conditions

Both sides use the same real child-process fixture with an explicit **80 ms delay** between `agent_end` and natural exit 143. Before uses the old unconditional 10 ms host completion-shutdown deadline; after leaves the natural-nonzero-exit case on the production default grace period (5000 ms), while the other cases retain 10 ms.

The before side is upstream plus the delayed fixture. It deliberately exposes the scenario collision; it is **not an unchanged upstream run**. Separately, the unchanged file reproduced the same intermittent failure on both exact upstream base `9724c4414` and #9062 head `aeeaf4ee4` in one of three fixed runs each. See the [diagnostic comment](https://github.com/nexu-io/open-design/pull/9062#issuecomment-6397854566).

The fix is in commit `ffd7ca711`. Only test setup and the synthetic process fixture change. Every status, exit-code and signal assertion is retained.

## Results

| Same five-case file | Before | After |
| --- | --- | --- |
| Tests passed | 4 | 5 |
| Tests failed | 1 (natural nonzero exit) | 0 |
| Expected natural-exit status | failed | failed |
| Observed natural-exit status | succeeded | failed |
| Natural exit assertions | blocked by status failure | exit 143 and no signal both pass |
| File wall time | 13.19s | 13.02s |

Environment: macOS arm64, Node 24.19.0, pnpm 10.33.2, Vitest 4.1.6; `CI=true`, maxWorkers=2, retry=0. The related three-file group passed all 64 tests. The five-case file passed in three fixed executions (one grouped, two standalone). `pnpm guard`, root `pnpm typecheck`, and diff whitespace checks passed.

The local evidence does not establish hosted CI completion or native Windows/Linux results. No full daemon suite was run locally.

## Reproduce

```sh
CI=true pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts \
  tests/runtimes/pi-rpc-run-close.test.ts --maxWorkers=2 --retry=0
```

To reproduce the before side, keep the delayed child fixture and replace the conditional `PI_GRACEFUL_SHUTDOWN_MS` setup with the original unconditional `process.env.PI_GRACEFUL_SHUTDOWN_MS = '10'`. No assertion needs to change.

Files: [before excerpt](before.txt), [after excerpt](after.txt), [structured results and fixture hashes](results.json), [comparison page](comparison.html), [comparison screenshot](comparison.png). Absolute local checkout paths were omitted from the excerpts.
