/**
 * `last_progress_age_ms` must survive the stall it is meant to describe.
 *
 * The analytics contract (packages/contracts/src/analytics/events/result-events.ts)
 * defines the field as "age of the last agent activity at finish. Near the
 * inactivity ceiling on a stall; near zero on a clean finish." It is the one
 * property that answers "how long had the agent been silent when we gave up".
 *
 * On an ACP runtime it reports the opposite. `attachAcpSession`'s own stage
 * watchdog ends a stalled turn by calling `fail()`, which emits an SSE `error`
 * through the daemon's ACP `send` wrapper (server.ts) — and that wrapper stamps
 * `run.lastAgentActivityAt = Date.now()` for every emission, error included. So
 * the daemon's own timeout event resets the progress clock microseconds before
 * the run finalizes, and a run that sat silent for the entire timeout window
 * reports a `last_progress_age_ms` of a few hundred milliseconds.
 *
 * Field evidence: run 14b04dd3-56b0-4d44-926b-db6cee3017ab (2026-07-28, OD
 * 0.16.1, runtime_type=amr_cloud) ran 37.2 minutes, was ended by a watchdog
 * after ~30 minutes of silence, and reported `last_progress_age_ms = 664`. That
 * reading is what made the incident look like "the process was still doing
 * something right up to the kill" and sent triage after the wrong window.
 *
 * This spec pins the contract: after a silent ACP stall, the reported age must
 * cover the silence, not the daemon's own error emission.
 */

import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const posthogCapture = vi.hoisted(() => vi.fn());
const posthogShutdown = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('posthog-node', () => ({
  PostHog: vi.fn(function PostHogMock() {
    return {
      capture: posthogCapture,
      groupIdentify: vi.fn(),
      on: vi.fn(),
      shutdown: posthogShutdown,
    };
  }),
}));

const { startServer } = await import('../../src/server.js');

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  status: string;
  errorCode: string | null;
  terminalTrigger: string | null;
  eventsLogPath: string;
};

const FAKE_VELA = fileURLToPath(new URL('../fixtures/fake-vela.mjs', import.meta.url));

// The ACP stage watchdog is the only clock allowed to end this run: the outer
// chat inactivity watchdog is parked far above it so the terminal event can
// only come from `attachAcpSession`'s own timer, exactly as it did in the
// field incident (AMR sets both to 30 min; the stage timer wins on a silent
// bridge because it is armed from session/prompt).
const ACP_STAGE_TIMEOUT_MS = 2_000;
const OUTER_INACTIVITY_TIMEOUT_MS = 120_000;
// Just above ACP_STAGE_TIMEOUT_MS so the stage watchdog fires first and the
// outer one is still pending when it does.
const LINGER_INACTIVITY_TIMEOUT_MS = 3_000;
// The chatty-linger case needs the outer watchdog to be re-armable AND to have
// time to fire before forced shutdown reaps the child, so the kill grace is
// deliberately longer than the inactivity ceiling here.
const CHATTY_LINGER_KILL_GRACE_MS = 2_500;

describe('ACP stall progress age', () => {
  const originalEnv = snapshotEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;
  let descendantPids: number[] = [];

  afterEach(async () => {
    for (const pid of descendantPids) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
    }
    descendantPids = [];
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
    restoreEnv(originalEnv);
    posthogCapture.mockReset();
  });

  it('reports the real silence in last_progress_age_ms when the ACP stage watchdog ends a stalled run', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-stall-age-bin-'));
    const fakeVela = await writeSilentlyStallingVela(binDir, 'vela-silent-stall');

    process.env.POSTHOG_KEY = 'phc_test_acp_stall';
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    process.env.VELA_RUNTIME_KEY = `fake-runtime-key-${randomUUID()}`;
    process.env.VELA_LINK_URL = 'https://amr-link.open-design.ai/v1';
    process.env.OD_ACP_STAGE_TIMEOUT_MS = String(ACP_STAGE_TIMEOUT_MS);
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = String(OUTER_INACTIVITY_TIMEOUT_MS);
    process.env.OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS = '0';

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'amr',
      agentCliEnv: { amr: { VELA_BIN: fakeVela } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForAmrRun(started.url);
    expect(run.status).toBe('failed');

    const finished = await waitForRunFinished(run.id);

    // Sanity: this is the incident's terminal fingerprint — an ACP stage
    // timeout classifies as `timeout`/`timeout` (the outer inactivity watchdog
    // would have produced `timeout`/`inactivity_timeout` instead) and the run
    // carries the CHILD's exit code, not a stall code.
    expect(finished.failure_category).toBe('timeout');
    expect(finished.failure_detail).toBe('timeout');

    // ...which is why the terminal must name the watchdog that fired. Without
    // it an ACP stage timeout is indistinguishable from a user interrupt.
    expect(finished.terminal_trigger).toBe('acp_stage_timeout');

    // The turn streamed its text and then went silent for the whole stage
    // window. The reported progress age must cover that silence.
    expect(typeof finished.last_progress_age_ms).toBe('number');
    expect(
      finished.last_progress_age_ms,
      progressAgeFailureContext(finished, run),
    ).toBeGreaterThanOrEqual(ACP_STAGE_TIMEOUT_MS * 0.8);
  }, 60_000);

  // The stall that matters most is the one WITH a tool in flight — that is the
  // shape of the field incident, and it is the shape that arms the daemon's own
  // synthetic-event path. `attachAcpSession`'s `fail()` calls
  // `flushOpenAcpTools(true)` before `send('error')`, and that helper emits a
  // synthetic `tool_use` + errored `tool_result` pair for every still-open tool
  // through the SAME `send` callback. Those land on the daemon's ACP wrapper as
  // `event === 'agent'`, so suppressing only the terminal `error` still leaves
  // the progress clock stamped microseconds before the run finalizes.
  //
  // Synthetic terminal events are the daemon closing its own books, not the
  // agent producing bytes, so they must not count as progress either.
  it('reports the real silence when the stalled turn had an open tool the failure path flushes', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-stall-tool-bin-'));
    const fakeVela = await writeSilentlyStallingVela(binDir, 'vela-silent-stall-open-tool', {
      openToolBeforeStall: true,
    });

    process.env.POSTHOG_KEY = 'phc_test_acp_stall_tool';
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    process.env.VELA_RUNTIME_KEY = `fake-runtime-key-${randomUUID()}`;
    process.env.VELA_LINK_URL = 'https://amr-link.open-design.ai/v1';
    process.env.OD_ACP_STAGE_TIMEOUT_MS = String(ACP_STAGE_TIMEOUT_MS);
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = String(OUTER_INACTIVITY_TIMEOUT_MS);
    process.env.OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS = '0';

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'amr',
      agentCliEnv: { amr: { VELA_BIN: fakeVela } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForAmrRun(started.url);
    expect(run.status).toBe('failed');

    const finished = await waitForRunFinished(run.id);

    // Non-vacuity guard: the fixture really did leave a concrete tool open, and
    // the failure path really did synthesize its terminal pair. Without this the
    // progress-age assertion below could pass simply because no tool existed.
    expect(finished.tool_call_count).toBeGreaterThanOrEqual(1);

    // Same terminal fingerprint as the tool-free stall: an ACP stage timeout,
    // named as such. Flushing an open tool must not reclassify the failure.
    expect(finished.failure_category).toBe('timeout');
    expect(finished.failure_detail).toBe('timeout');
    expect(finished.terminal_trigger).toBe('acp_stage_timeout');

    // The agent produced its last real byte at the start of the stall window.
    // The synthetic flush pair that the daemon emitted on the way out is not
    // agent progress, so the reported age must still cover the whole silence.
    expect(typeof finished.last_progress_age_ms).toBe('number');
    expect(
      finished.last_progress_age_ms,
      progressAgeFailureContext(finished, run),
    ).toBeGreaterThanOrEqual(ACP_STAGE_TIMEOUT_MS * 0.8);
  }, 60_000);

  // Real CLIs log while they die. The daemon ends an ACP stage timeout by
  // SIGTERMing the child, and the child's shutdown line arrives on stderr a few
  // milliseconds later — where the raw stderr handler stamps the progress clock
  // just like any other agent byte. The run then reports an age measured from
  // OUR teardown instead of from the agent's last real output.
  //
  // This is the same failure as the two above seen from the far side of the
  // verdict, and it is what made these specs pass locally but report ages of 8
  // and 16 milliseconds on CI, where the teardown ordering differs. Once the
  // daemon has given up, nothing the child says counts as progress.
  it('reports the real silence when the agent logs to stderr while shutting down', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-stall-teardown-bin-'));
    const fakeVela = await writeSilentlyStallingVela(binDir, 'vela-silent-stall-teardown-log', {
      stderrOnSigterm: true,
    });

    process.env.POSTHOG_KEY = 'phc_test_acp_stall_teardown';
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    process.env.VELA_RUNTIME_KEY = `fake-runtime-key-${randomUUID()}`;
    process.env.VELA_LINK_URL = 'https://amr-link.open-design.ai/v1';
    process.env.OD_ACP_STAGE_TIMEOUT_MS = String(ACP_STAGE_TIMEOUT_MS);
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = String(OUTER_INACTIVITY_TIMEOUT_MS);
    process.env.OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS = '0';

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'amr',
      agentCliEnv: { amr: { VELA_BIN: fakeVela } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForAmrRun(started.url);
    expect(run.status).toBe('failed');

    const finished = await waitForRunFinished(run.id);

    // Non-vacuity guard: the child really did exit through its SIGTERM handler,
    // so its shutdown line really was written after the daemon's verdict.
    expect(finished.error_code).toBe('AGENT_EXIT_143');

    expect(finished.failure_category).toBe('timeout');
    expect(finished.failure_detail).toBe('timeout');
    expect(finished.terminal_trigger).toBe('acp_stage_timeout');

    expect(typeof finished.last_progress_age_ms).toBe('number');
    expect(
      finished.last_progress_age_ms,
      progressAgeFailureContext(finished, run),
    ).toBeGreaterThanOrEqual(ACP_STAGE_TIMEOUT_MS * 0.8);
  }, 60_000);

  // Attribution has to survive a child that is slow to die. `fail()` issues one
  // direct SIGTERM and nothing escalates it, while the outer chat inactivity
  // watchdog stays armed from the agent's last real output. If the child lingers
  // past that ceiling, `failForInactivity` still sees a non-terminal run, fires,
  // and overwrites `terminal_trigger` with `inactivity_watchdog` — attributing
  // the stall to the wrong clock, which is the exact confusion this PR exists to
  // remove. The ACP verdict owns the attempt: the outer watchdog must be retired
  // and the teardown escalated once it lands.
  it('keeps acp_stage_timeout attribution when the child outlives the first SIGTERM', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-stall-linger-bin-'));
    const fakeVela = await writeSilentlyStallingVela(binDir, 'vela-silent-stall-linger', {
      ignoreSigterm: true,
    });

    process.env.POSTHOG_KEY = 'phc_test_acp_stall_linger';
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    process.env.VELA_RUNTIME_KEY = `fake-runtime-key-${randomUUID()}`;
    process.env.VELA_LINK_URL = 'https://amr-link.open-design.ai/v1';
    process.env.OD_ACP_STAGE_TIMEOUT_MS = String(ACP_STAGE_TIMEOUT_MS);
    // Deliberately just above the stage timeout: the ACP watchdog wins the race,
    // and the outer watchdog is still armed and would fire a beat later.
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = String(LINGER_INACTIVITY_TIMEOUT_MS);
    process.env.OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS = '0';
    process.env.OD_CHAT_RUN_INACTIVITY_KILL_GRACE_MS = '500';

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'amr',
      agentCliEnv: { amr: { VELA_BIN: fakeVela } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForAmrRun(started.url);
    expect(run.status).toBe('failed');

    const finished = await waitForRunFinished(run.id);

    // The ACP stage watchdog reached the verdict first, so it owns the terminal
    // attribution even though the child needed escalation to actually die.
    expect(
      finished.terminal_trigger,
      progressAgeFailureContext(finished, run),
    ).toBe('acp_stage_timeout');
    expect(finished.failure_category).toBe('timeout');
    expect(finished.failure_detail).toBe('timeout');

    // And the age still describes the silence, not the drawn-out teardown.
    expect(
      finished.last_progress_age_ms,
      progressAgeFailureContext(finished, run),
    ).toBeGreaterThanOrEqual(ACP_STAGE_TIMEOUT_MS * 0.8);
  }, 60_000);

  it('publishes run_finished only after the stalled ACP process group is silent', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-terminal-silence-bin-'));
    const activityFile = path.join(binDir, 'descendant-activity.log');
    const descendantPidFile = path.join(binDir, 'descendant.pid');
    const fakeVela = await writeSilentlyStallingVela(binDir, 'vela-terminal-silence', {
      descendantActivityFile: activityFile,
      descendantPidFile,
    });

    process.env.POSTHOG_KEY = 'phc_test_acp_terminal_silence';
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    process.env.VELA_RUNTIME_KEY = `fake-runtime-key-${randomUUID()}`;
    process.env.VELA_LINK_URL = 'https://amr-link.open-design.ai/v1';
    process.env.OD_ACP_STAGE_TIMEOUT_MS = String(ACP_STAGE_TIMEOUT_MS);
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = String(OUTER_INACTIVITY_TIMEOUT_MS);
    process.env.OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS = '0';
    process.env.OD_CHAT_RUN_INACTIVITY_KILL_GRACE_MS = '250';

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'amr',
      agentCliEnv: { amr: { VELA_BIN: fakeVela } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForAmrRun(started.url);
    expect(run.status).toBe('failed');
    await waitForRunFinished(run.id);

    const descendantPid = Number(readFileSync(descendantPidFile, 'utf8').trim());
    expect(Number.isInteger(descendantPid)).toBe(true);
    descendantPids.push(descendantPid);
    expect(processAlive(descendantPid)).toBe(false);

    const activityAtTerminal = activityTickCount(activityFile);
    expect(activityAtTerminal).toBeGreaterThan(0);

    // This real wait protects an OS process-tree boundary: after run_finished
    // there is no application completion signal left to await. A surviving
    // descendant makes the counter advance; a quiescent group leaves it fixed.
    await delay(300);
    expect(activityTickCount(activityFile)).toBe(activityAtTerminal);
  }, 60_000);

  // The worst case is a child that does BOTH: keeps logging on stderr and keeps
  // refusing to die. Retiring the watchdog at the verdict is not enough on its
  // own, because every late stderr byte reaches `noteAgentActivity` through the
  // raw handler — and while the freeze stops the timestamp, the timer block
  // below it re-arms the very watchdog `retireAttemptOnAcpVerdict` just cleared.
  // If that re-armed timer fires before forced shutdown reaps the child, the run
  // terminalizes a second time under `inactivity_watchdog`.
  //
  // Once the attempt has a verdict, nothing the child says may restart any of
  // this attempt's clocks.
  it('keeps acp_stage_timeout attribution when the child keeps logging and refuses to die', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-stall-chatty-bin-'));
    const fakeVela = await writeSilentlyStallingVela(binDir, 'vela-silent-stall-chatty-linger', {
      ignoreSigterm: true,
      stderrOnSigterm: true,
    });

    process.env.POSTHOG_KEY = 'phc_test_acp_stall_chatty';
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    process.env.VELA_RUNTIME_KEY = `fake-runtime-key-${randomUUID()}`;
    process.env.VELA_LINK_URL = 'https://amr-link.open-design.ai/v1';
    process.env.OD_ACP_STAGE_TIMEOUT_MS = String(ACP_STAGE_TIMEOUT_MS);
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = String(LINGER_INACTIVITY_TIMEOUT_MS);
    process.env.OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS = '0';
    process.env.OD_CHAT_RUN_INACTIVITY_KILL_GRACE_MS = String(CHATTY_LINGER_KILL_GRACE_MS);

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'amr',
      agentCliEnv: { amr: { VELA_BIN: fakeVela } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForAmrRun(started.url);
    expect(run.status).toBe('failed');

    const finished = await waitForRunFinished(run.id);

    expect(
      finished.terminal_trigger,
      progressAgeFailureContext(finished, run),
    ).toBe('acp_stage_timeout');
    expect(finished.failure_category).toBe('timeout');
    expect(finished.failure_detail).toBe('timeout');

    // Exactly one terminal failure reached the transcript. A second `error`
    // here is the inactivity watchdog re-terminalizing the attempt.
    expect(
      readRunEventTail(run.eventsLogPath).filter((entry) => entry === 'error').length,
      progressAgeFailureContext(finished, run),
    ).toBe(1);

    expect(
      finished.last_progress_age_ms,
      progressAgeFailureContext(finished, run),
    ).toBeGreaterThanOrEqual(ACP_STAGE_TIMEOUT_MS * 0.8);
  }, 60_000);
});

/**
 * A bare "expected 16 to be >= 1600" cannot say WHICH emission re-stamped the
 * progress clock, and this failure has already proven environment-sensitive
 * (green locally, red on CI). Name the suspects directly: the persisted run
 * event tail identifies the last thing the daemon recorded before finalizing.
 */
function progressAgeFailureContext(
  finished: Record<string, any>,
  run: RunStatus,
): string {
  const summary = {
    last_progress_age_ms: finished.last_progress_age_ms,
    terminal_trigger: finished.terminal_trigger,
    last_observed_phase: finished.last_observed_phase,
    tool_call_count: finished.tool_call_count,
    attempt_index: finished.attempt_index,
    total_duration_ms: finished.total_duration_ms,
    error_code: finished.error_code,
  };
  return [
    `run_finished: ${JSON.stringify(summary)}`,
    `run event tail: ${JSON.stringify(readRunEventTail(run.eventsLogPath))}`,
  ].join('\n');
}

function readRunEventTail(eventsLogPath: string | null | undefined): unknown[] {
  if (!eventsLogPath) return ['<no eventsLogPath>'];
  try {
    return readFileSync(eventsLogPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          const record = JSON.parse(line) as { event?: string; data?: { type?: string } };
          return record?.data?.type
            ? `${record.event}:${record.data.type}`
            : String(record?.event);
        } catch {
          return '<unparsable>';
        }
      })
      .slice(-30);
  } catch (error) {
    return [`<unreadable: ${(error as Error).message}>`];
  }
}

async function waitForRunFinished(runId: string): Promise<Record<string, any>> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const call of posthogCapture.mock.calls) {
      const payload = call[0] as { event?: string; properties?: Record<string, unknown> };
      if (payload?.event === 'run_finished' && payload.properties?.run_id === runId) {
        return payload.properties as Record<string, any>;
      }
    }
    await delay(100);
  }
  throw new Error(`no run_finished analytics event for run ${runId}`);
}

async function writeSilentlyStallingVela(
  dir: string,
  name: string,
  options: {
    openToolBeforeStall?: boolean;
    stderrOnSigterm?: boolean;
    ignoreSigterm?: boolean;
    descendantActivityFile?: string;
    descendantPidFile?: string;
  } = {},
): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/bin/sh
if [ "$1" = "agent" ] && [ "$2" = "run" ]; then
  export FAKE_VELA_STALL_AFTER_PROMPT=1
  export FAKE_VELA_TEXT_BEFORE_STALL=1
  export FAKE_VELA_STALL_HEARTBEAT_MS=0
  export FAKE_VELA_REQUIRE_SET_MODEL=0
${options.openToolBeforeStall ? '  export FAKE_VELA_OPEN_TOOL_BEFORE_STALL=1\n' : ''}${options.stderrOnSigterm ? '  export FAKE_VELA_STDERR_ON_SIGTERM=1\n' : ''}${options.ignoreSigterm ? '  export FAKE_VELA_IGNORE_SIGTERM=1\n' : ''}${options.descendantActivityFile ? `  export FAKE_VELA_DESCENDANT_ACTIVITY_FILE=${JSON.stringify(options.descendantActivityFile)}\n` : ''}${options.descendantPidFile ? `  export FAKE_VELA_DESCENDANT_PID_FILE=${JSON.stringify(options.descendantPidFile)}\n` : ''}fi
exec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_VELA)} "$@"
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

function activityTickCount(file: string): number {
  try {
    return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function createAndWaitForAmrRun(url: string): Promise<RunStatus> {
  const projectId = `acp_stall_age_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'ACP stall progress age',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = await projectResponse.json() as { conversationId: string };

  // AMR Cloud runs are workspace-scoped; adopt the project into a personal
  // workspace first so the run carries an explicit scope (same shape as
  // tests/run-retry-runtime.test.ts).
  const personalWorkspaceId = `acp_stall_personal_${projectId}`;
  const workspaceHeaders: Record<string, string> = {
    'x-od-workspace-id': personalWorkspaceId,
    'x-od-workspace-type': 'personal',
    'x-od-workspace-member-id': 'acp-stall-personal-owner',
    'x-od-workspace-role': 'owner',
  };
  const adoptionResponse = await fetch(
    `${url}/api/workspaces/${encodeURIComponent(personalWorkspaceId)}/projects?view=all`,
    { headers: workspaceHeaders },
  );
  expect(adoptionResponse.status).toBe(200);

  const prompt = 'refine this design system from the uploaded screenshots';
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'acp-stall-age-device',
      'x-od-analytics-session-id': 'acp-stall-age-session',
      'x-od-analytics-client-type': 'web',
      ...workspaceHeaders,
    },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId: `assistant_acp_stall_${randomUUID()}`,
      clientRequestId: `client_acp_stall_${randomUUID()}`,
      agentId: 'amr',
      message: prompt,
      currentPrompt: prompt,
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = await runResponse.json() as { runId: string };

  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    const response = await fetch(
      `${url}/api/runs/${encodeURIComponent(body.runId)}`,
      { headers: workspaceHeaders },
    );
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await delay(100);
  }
  throw new Error(`run ${body.runId} did not finish`);
}

function snapshotEnv(): Record<string, string | undefined> {
  return {
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
    OD_ACP_STAGE_TIMEOUT_MS: process.env.OD_ACP_STAGE_TIMEOUT_MS,
    OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS: process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS,
    OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS: process.env.OD_CHAT_RUN_FIRST_OUTPUT_TIMEOUT_MS,
    OD_CHAT_RUN_INACTIVITY_KILL_GRACE_MS: process.env.OD_CHAT_RUN_INACTIVITY_KILL_GRACE_MS,
    VELA_RUNTIME_KEY: process.env.VELA_RUNTIME_KEY,
    VELA_LINK_URL: process.env.VELA_LINK_URL,
  };
}

function restoreEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
