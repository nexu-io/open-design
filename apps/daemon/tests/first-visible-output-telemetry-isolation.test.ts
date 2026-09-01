import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RunLifecycleMark } from '../src/run-lifecycle-tracer.js';

// The `first_visible_output` / `first_token` marks are stamped from inside
// `send()` — the single choke point EVERY stream event passes through on its
// way to the user — and from the strategy's close-time tail emission. That
// places pure instrumentation directly on the product's critical path, so the
// failure mode of a bug in it is not "one analytics field is missing", it is
// "the user never receives the reply".
//
// Today nothing in that block realistically throws: the classifier is written
// defensively and `mark` only spreads an object. But "safe because it is
// currently written carefully" is not an invariant — the next line added there
// can break it, and it would break the product, silently, for every run.
//
// So the fault is injected rather than argued about: the marker classifier and
// every mark this change owns are made to throw, and the run must still deliver
// its complete reply and reach `succeeded`. The blast radius of broken
// telemetry has to be the telemetry.
const FAULTED_MARKS = new Set<RunLifecycleMark>([
  'first_token',
  'first_visible_output',
  'first_artifact_write',
]);

vi.mock('../src/run-lifecycle-tracer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/run-lifecycle-tracer.js')>();
  return {
    ...actual,
    runLifecycleMarkersForStreamEvent: () => {
      throw new Error('injected telemetry fault: stream-event marker classification');
    },
    createRunLifecycleTracer: (run: Parameters<typeof actual.createRunLifecycleTracer>[0]) => {
      const tracer = actual.createRunLifecycleTracer(run);
      return {
        ...tracer,
        mark(mark: RunLifecycleMark, timestamp?: number) {
          // Only the marks this change owns. The run-start marks stay real so
          // this case cannot pass by breaking the run before it ever streams.
          if (FAULTED_MARKS.has(mark)) {
            throw new Error(`injected telemetry fault: ${mark}`);
          }
          tracer.mark(mark, timestamp);
        },
        markFirstModelEvent() {
          throw new Error('injected telemetry fault: first model event');
        },
      };
    },
  };
});

const { startServer } = await import('../src/server.js');
const {
  TEST_BUDGET_MS,
  clearTelemetryEnv,
  createChatProject,
  putConfig,
  readAssistantMessage,
  restoreEnv,
  sendRunAndWait,
  snapshotEnv,
  writeFakeOpencode,
} = await import('./first-visible-output-harness.js');
type StartedServer = import('./first-visible-output-harness.js').StartedServer;

const REPLY = 'Here is your answer, in full, exactly as the model produced it.';

describe('lifecycle instrumentation cannot cost the user their reply', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await rm(binDir, { force: true, recursive: true });
    binDir = null;
    restoreEnv(originalEnv);
  });

  it('delivers the whole reply when every lifecycle mark throws', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-fvo-fault-'));
    // Two deltas, so the assertion covers both the first event (which is what
    // carries the marks) and the ones after it.
    const bin = await writeFakeOpencode(binDir, 'opencode-fault', `
  emit({ type: 'text', part: { type: 'text', text: ${JSON.stringify(REPLY.slice(0, 21))} } });
  emit({ type: 'text', part: { type: 'text', text: ${JSON.stringify(REPLY.slice(21))} } });
  finishTurn();`);

    clearTelemetryEnv();
    // No telemetry sink: this case is about the product surface surviving, and
    // a keyless daemon takes the same emission path.
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'off';

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'opencode',
      agentCliEnv: { opencode: { OPENCODE_BIN: bin } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversation = await createChatProject(started.url, 'telemetry-fault');
    const { created, run } = await sendRunAndWait(
      started.url,
      conversation,
      'render telemetry-fault',
    );

    expect(run.status).toBe('succeeded');
    expect(
      await readAssistantMessage(
        started.url,
        conversation,
        created.assistantMessageId as string,
      ),
    ).toBe(REPLY);
  }, TEST_BUDGET_MS);
});
