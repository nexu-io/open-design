# First-wheel probe counting: browser evidence

Baseline: `9041ca60bc81871f543023926858917a296a58ce`.

The probe's global capture listener discovered a chat log, attached its element
listener, and ingested the discovering wheel itself. The event then reached the
newly attached element listener and was ingested again. The fix leaves intake
to the element listener, including that first dispatch.

## Real-browser comparison

Captured on macOS **27.0.1 / arm64** with headed Google Chrome **155.0.8059.40**, using the real
OpenDesign web/daemon runtime started through `pnpm tools-dev`. The project and
short conversation note were created through the production HTTP APIs. No
agent/model run was started.

The screenshots include an explicitly labeled **read-only diagnostic overlay**.
It counts trusted wheel events in the window's bubble phase and reads the
existing `window.__chatScrollFreeze.snapshot()` handle before the pending
animation frame drains. It does not modify the probe, its geometry, or event
propagation. It is not a new product UI.

| Measurement | Before | After |
| --- | --- | --- |
| Observer initially attached | `false` | `false` |
| Wheel discovery initially armed | `true` | `true` |
| Trusted wheel events delivered | 1 | 1 |
| Browser event `deltaY` | 240 px | 240 px |
| Probe pending wheel count | **2** | **1** |
| Probe pending wheel delta | **480 px** | **240 px** |

The repaired path also passed when the real wheel targeted the conversation's
text descendant rather than the chat log element itself.

### Before

![Baseline: one trusted wheel counted twice](before.png)

### After

![Fix: one trusted wheel counted once](after.png)

The corresponding observations are in [before.json](before.json) and
[after.json](after.json). The browser's reduced user-agent string is preserved
verbatim; the full Chrome version above came from the automation connection.

## Repeat the observation

1. Start an isolated web/daemon runtime through the repository's `tools-dev`
   lifecycle. Open a new project/conversation with content short enough not to
   auto-scroll.
2. Before any wheel or scroll in the transcript, inspect
   `window.__chatScrollFreeze.snapshot()`. Continue only when `attached` is
   `false` and `wheelDiscoveryArmed` is `true`.
3. Register the following diagnostic listener in the browser console, then
   send one real wheel gesture over the transcript. A CDP/Playwright mouse
   wheel also works; the capture above verified `event.isTrusted === true`.

   ```js
   let captured = false;
   window.addEventListener('wheel', (event) => {
     if (captured || !(event.target instanceof Element)
       || !event.target.closest('[data-testid="chat-log"]')) return;
     captured = true;
     const pending = window.__chatScrollFreeze.snapshot().surface.pendingWheel;
     console.table({
       trusted: event.isTrusted,
       nativeEvents: 1,
       inputDeltaY: event.deltaY,
       probeCount: pending.count,
       probeDelta: pending.px,
     });
   }, { passive: true });
   ```

4. Baseline reports twice the count/delta. With the fix, the pending count is
   one and the delta equals the actual event's `deltaY`. Reload before another
   first-discovery measurement; do not reset internal probe state through test
   hooks.

This browser witness establishes duplicate intake. It does **not** reproduce
or claim to repair Chromium's separate compositor scroll-freeze defect.
The two regression cases in
[`chat-scroll-freeze.test.ts`](../../../apps/web/tests/observability/chat-scroll-freeze.test.ts)
use stationary jsdom geometry to verify the consequence: three physical wheel
events must not satisfy the four-event stall threshold; the fourth reports
exactly four events and their actual combined delta. Both cases failed on the
baseline and passed after the fix.

## CI teardown follow-up, 2026-10-28

The original [Web 2/2 run](https://github.com/nexu-io/open-design/actions/runs/38350354212/job/115141256161)
passed 6,546 assertions but failed on an uncaught `window is not defined` from
the workspace-context retry callback. Vitest attributed it to
`ProjectView.reattach-retry-storm.test.tsx`. That suite unmounted React but left
the module-level retry schedule alive. The shared setup reset the schedule
before the next test, which does not cover the final test's environment teardown.

The follow-up calls the existing `resetWorkspaceContextCache()` after React
cleanup in that suite. Unmounting first prevents pending context reads from
scheduling another retry. The reset then cancels retries already scheduled.
Production retry behavior, the three reattachment assertions, their timeouts,
and the scroll-probe implementation are unchanged.

### Controlled teardown witness

On Node 24.19.0 and pnpm 10.33.2, a temporary setup returned HTTP 503 from the
workspace read, pinned its retry delay to three seconds, and removed the
usable window after the suite's own cleanup. This deliberately exercises the
late callback boundary. It does not reproduce the hosted runner's exact timing.
The original suite passed all three assertions but produced three uncaught
`Cannot read properties of undefined (reading 'dispatchEvent')` errors at the
same callback. With the cleanup fix, the same witness passed all three cases
with no unhandled errors.

For reproduction, place this temporary setup in
`apps/web/.tmp/8705-ci/teardown-witness.ts`:

```ts
import { afterEach, beforeEach, vi } from 'vitest';
import { __setWorkspaceContextRetryBackoffForTests } from '../../src/collab/useWorkspaceContext';

beforeEach(() => {
  __setWorkspaceContextRetryBackoffForTests({ initialMs: 3000, maxMs: 3000, factor: 2, jitter: false });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
});

afterEach(async () => {
  vi.stubGlobal('window', undefined);
  try {
    await new Promise((resolve) => setTimeout(resolve, 3500));
  } finally {
    vi.unstubAllGlobals();
    __setWorkspaceContextRetryBackoffForTests(null);
  }
});
```

Place the following adjacent `vitest.config.ts`. Vitest's normal reverse
`afterEach` order runs the suite's React/cache cleanup before the witness
invalidates the window. The real wait observes the native timer crossing this
boundary, so fake timers would not exercise the hosted failure mechanism.

```ts
import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vitest.config';

export default mergeConfig(base, defineConfig({
  root: resolve(import.meta.dirname, '../..'),
  test: { setupFiles: [resolve(import.meta.dirname, 'teardown-witness.ts')] },
}));
```

```sh
CI=true pnpm --filter @open-design/web exec vitest run \
  -c .tmp/8705-ci/vitest.config.ts \
  tests/components/ProjectView.reattach-retry-storm.test.tsx \
  --maxWorkers=2 --retry=0
```

The ordinary configuration also passes the reattachment suite together with
`tests/observability/chat-scroll-freeze.test.ts`, 68 tests in total. The temporary
setup above is diagnostic only and is not loaded by normal tests or CI.

Before syncing the later upstream changes, the complete previously failing
shard at `1591ddcaf` also passed locally with
`CI=true pnpm --filter @open-design/web exec vitest run -c vitest.config.ts --maxWorkers=2 --shard=2/2 --retry=0`.
It reported 632 files and 6,546 passing tests, one existing expected failure,
seven existing skips, and no unhandled errors in 435.02 seconds. Root
`pnpm guard`, root `pnpm typecheck`, and `git diff --check` passed as well.
These are macOS ARM64 results; hosted CI and manual product QA remain separate
validation surfaces.

### Integration with upstream compositor recovery

The [first follow-up's hosted run](https://github.com/nexu-io/open-design/actions/runs/40549338229/job/122348911745)
reported no unhandled errors, but its current-main merge exposed a different
failure in `chat-scroll-takeover-selfheal.test.ts`. The test introduced by
upstream #8251 explicitly counted the first discovery wheel twice. It expected
a fresh surface to freeze after only three physical wheels, conflicting with
this PR's one-event intake contract.

The branch now includes main `b7c5dd6d350bf54587a76bef1899bcbc183ea59d`.
The release test first asserts that three physical wheels leave the new surface
idle with no additional frozen report. A fourth wheel must produce its own
probe ID, exactly `FREEZE_WHEEL_COUNT` events and the matching requested delta,
then enter the existing compositor kick phase.

The old upstream test reproduces the hosted missing-report assertion on the
integrated branch. Conversely, the strengthened test fails at the below-threshold
assertion when only the probe source is temporarily restored from upstream main,
then passes with the PR implementation. This verifies both sides of the threshold
without changing the detector or weakening the takeover assertions.

The reattachment, probe, takeover and self-heal files pass 126 tests with two
workers and no retries on the integrated tree. Full web-suite coverage is left
to PR CI, following main's current local-validation policy.
The controlled teardown witness also passes on this tree, as do root
`pnpm guard`, root `pnpm typecheck`, and the PR diff whitespace check against
upstream main.
