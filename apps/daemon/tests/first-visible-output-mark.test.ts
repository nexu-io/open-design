import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import {
  type CaptureSink,
  type Conversation,
  type RunTiming,
  type StartedServer,
  TEST_BUDGET_MS,
  clearTelemetryEnv,
  createChatProject,
  createOdNextDesignProject,
  expectVisibleOutputNotBeforeFirstToken,
  putConfig,
  restoreEnv,
  sendRunAndWait,
  snapshotEnv,
  startCaptureSink,
  writeFakeOpencode,
} from './first-visible-output-harness.js';

// `time_to_first_visible_output_ms` is supposed to answer "once the model
// started producing, how long until the user could actually SEE something?".
// It was published for months as a copy of `time_to_first_token_ms`, because
// `noteFirstTokenAt()` stamped BOTH `first_token` and `first_visible_output`
// from the same call with the same timestamp — so the difference was 0 for
// every run ever recorded (205,795 `run_finished` events over 7 days, p50 =
// p90 = p99 = max = 0).
//
// The daemon does NOT emit every token it decodes. Between "this is a token"
// and "these bytes left the daemon" sit filters that can withhold output: the
// `<od-title>` marker stripper, the fabricated-role-marker safety guard
// (#3247), and — when the OD Next strategy is running the turn — the machine
// protocol, which withholds any text that might still turn out to be a
// reserved `<open-design-…>` block.
//
// These tests drive the REAL wiring (`startServer` + a fake opencode CLI) and
// read the two fields off the real PostHog `run_finished` payload, because the
// bug was never in a helper — it was in which call site owns the mark.
//
// Every case names the OD Next rollout mode it runs under. Neither the
// strategy-off nor the strategy-active coverage may rest on whatever
// `OD_NEXT_STRATEGY_ROLLOUT` happens to default to: that default has already
// been `active`, is expected to flip to disabled after 0.21.0, and is a
// user-facing switch besides. A suite that inherited it would silently stop
// covering the path it was written for the day the default moved.
describe('first_visible_output is stamped at emission, not at first token', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;
  let posthog: CaptureSink | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (posthog) await posthog.close();
    posthog = null;
    if (binDir) await rm(binDir, { force: true, recursive: true });
    binDir = null;
    restoreEnv(originalEnv);
  });

  it('reports a real gap when the safety guard withholds the first bytes', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-fvo-withheld-'));
    // The model opens a markdown heading whose keyword lands exactly on a
    // chunk boundary. The role-marker guard cannot classify `## user` until it
    // sees the next character, so it withholds the whole chunk. The daemon has
    // its first token; the user still has nothing on screen.
    const bin = await writeFakeOpencode(binDir, 'opencode-withheld', `
  emit({ type: 'text', part: { type: 'text', text: '## user' } });
  setTimeout(() => {
    emit({ type: 'text', part: { type: 'text', text: 'names are listed below.' } });
    finishTurn();
  }, ${WITHHOLD_MS});`);

    const timing = await runOnceAndReadTiming({
      bin,
      label: 'guard-withheld',
      strategyRollout: 'off',
    });

    expectVisibleOutputNotBeforeFirstToken(timing);
    const gap =
      timing.time_to_first_visible_output_ms! - timing.time_to_first_token_ms!;
    // The withheld window is the whole point of the metric. Allow generous
    // slack under load; the pre-fix value is exactly 0.
    expect(gap).toBeGreaterThanOrEqual(WITHHOLD_MS - 100);
  }, TEST_BUDGET_MS);

  it('does not manufacture a gap when the first token is emitted straight through', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-fvo-direct-'));
    const bin = await writeFakeOpencode(binDir, 'opencode-direct', `
  emit({ type: 'text', part: { type: 'text', text: 'Here is your answer.' } });
  finishTurn();`);

    const timing = await runOnceAndReadTiming({
      bin,
      label: 'direct-text',
      strategyRollout: 'off',
    });

    // Never negative: the daemon cannot show bytes before it has the token they
    // are made of. This held only by accident while both marks shared one
    // timestamp; now that they are stamped independently it is enforced by
    // reading the decode clock BEFORE the emit at every text_delta site.
    expectVisibleOutputNotBeforeFirstToken(timing);
    const gap =
      timing.time_to_first_visible_output_ms! - timing.time_to_first_token_ms!;
    // And no manufactured gap. The residue is the daemon's own SSE fan-out for
    // one delta — sub-millisecond when idle, a few ms on a loaded box — which is
    // an order of magnitude below the withheld window the metric reports.
    expect(gap).toBeLessThan(100);
  }, TEST_BUDGET_MS);

  it('keeps the first-token fallback when the run never emits visible output', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-fvo-never-'));
    // The guard withholds `## user` and the CLI exits before the next chunk
    // could release it, so nothing visible ever reaches the client. There is
    // no measurement to report, and the documented fallback keeps the field
    // pinned to the first token rather than dropping it.
    const bin = await writeFakeOpencode(binDir, 'opencode-never', `
  emit({ type: 'text', part: { type: 'text', text: '## user' } });
  finishTurn();`);

    const timing = await runOnceAndReadTiming({
      bin,
      label: 'never-visible',
      strategyRollout: 'off',
    });

    expect(timing.time_to_first_token_ms).toBeTypeOf('number');
    expect(timing.time_to_first_visible_output_ms).toBe(
      timing.time_to_first_token_ms,
    );
  }, TEST_BUDGET_MS);

  // The OD Next machine protocol is a THIRD thing that can withhold visible
  // bytes, and unlike the other two it can hold them past the end of the
  // stream: text that might still turn out to be a reserved `<open-design-…>`
  // block is only released when `finish()` proves it was prose, at child
  // close. That release does not go through the daemon's ordinary emission
  // choke point — it persists and broadcasts the tail directly — so the mark
  // has to be applied there too. Without it the run reports no visible output
  // at all and the analytics fallback collapses a real close-time wait back to
  // `firstTokenAt`, which is precisely the dead-field failure this whole
  // change exists to end.
  it('reports the close-time wait when the strategy releases the reply at finish', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-fvo-strategy-'));
    // Every visible byte of this reply is withheld until close. The machine
    // block is suppressed by design (it is protocol, not prose) and the only
    // remaining text is `<o` — a prefix of a reserved opening tag, which the
    // protocol must hold because the next chunk could complete
    // `<open-design-plan-contract`. The next chunk never comes, so `finish()`
    // is what finally rules it out and releases it.
    const bin = await writeFakeOpencode(binDir, 'opencode-strategy-tail', `
  emit({ type: 'text', part: { type: 'text', text: [
    '<open-design-runtime-state>',
    '{"schemaVersion":2}',
    '</open-design-runtime-state>',
  ].join('\\n') + '<o' } });
  setTimeout(finishTurn, ${WITHHOLD_MS});`);

    const timing = await runOnceAndReadTiming({
      bin,
      label: 'strategy-tail',
      strategyRollout: 'active',
    });

    expectVisibleOutputNotBeforeFirstToken(timing);
    const gap =
      timing.time_to_first_visible_output_ms! - timing.time_to_first_token_ms!;
    expect(gap).toBeGreaterThanOrEqual(WITHHOLD_MS - 100);
  }, TEST_BUDGET_MS);

  async function runOnceAndReadTiming(options: {
    bin: string;
    label: string;
    /**
     * Required, never inherited. `off` exercises the daemon's generic emission
     * choke point; `active` additionally puts the OD Next machine protocol in
     * front of it, which is the only way the close-time release path exists at
     * all.
     */
    strategyRollout: 'off' | 'active';
  }): Promise<RunTiming> {
    posthog = await startCaptureSink();
    clearTelemetryEnv();
    process.env.POSTHOG_KEY = 'phc_first_visible_output_test';
    process.env.POSTHOG_HOST = posthog.url;
    process.env.OD_NEXT_STRATEGY_ROLLOUT = options.strategyRollout;
    if (options.strategyRollout === 'active') {
      // Local-only escape hatch for the runtime-capability fixture gate, which
      // a fake CLI cannot satisfy. It does not weaken anything this case
      // asserts: admission still has to resolve a real bundled strategy
      // package, task type and agent, which is what the `strategyTask`
      // assertion below checks.
      process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    }

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
    await putConfig(started.url, {
      agentId: 'opencode',
      agentCliEnv: { opencode: { OPENCODE_BIN: options.bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const conversation: Conversation = options.strategyRollout === 'active'
      ? await createOdNextDesignProject(started.url, options.label)
      : await createChatProject(started.url, options.label);
    const { created, run } = await sendRunAndWait(
      started.url,
      conversation,
      `render ${options.label}`,
    );
    // Prove the mode the case claims to be in. Without this the strategy case
    // could quietly degrade into an ordinary run — admission has many gates —
    // and keep passing for the wrong reason.
    if (options.strategyRollout === 'active') {
      expect(created.pluginId).toBe('od-next-strategy');
      expect(created.strategyTask).toBeDefined();
    } else {
      expect(created.strategyTask).toBeUndefined();
    }
    expect(run.status).toBe('succeeded');
    const flush = async () => {
      await Promise.resolve(started?.shutdown?.());
    };
    return await posthog.waitForRunFinished(run.id, flush);
  }
});

const WITHHOLD_MS = 400;
