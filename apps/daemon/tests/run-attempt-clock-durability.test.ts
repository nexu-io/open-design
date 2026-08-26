// Durability of the per-attempt clock anchor (#7300 review follow-up).
//
// The PR that introduced the anchor made two client-visible transports agree at
// the moment an attempt is opened: `/api/runs/:id` and the persisted transcript
// row. Both of those writes can fail without anyone noticing, and each hole
// puts the original 171-minute cumulative clock back on screen:
//
//   1. The transcript UPDATE is wrapped in a `console.warn` catch, so a failed
//      write still reports the attempt as persisted. The live stream and the
//      in-memory status move to the new attempt while a refresh reads the old
//      pair, and nothing retries or records it.
//   2. Opening the boundary mutates the run object and writes SQLite, but the
//      durable run state (`state.json`) is only checkpointed on `start`,
//      `error`, and `end`. A daemon that dies inside the retry backoff — the
//      250-1000ms between teardown and respawn — restarts from a snapshot that
//      names the PREVIOUS attempt while the transcript already names the new
//      one.
//
// Both cases are driven through the real daemon on the real retry path.
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import { startCaptureSink, type CaptureSink } from './first-visible-output-harness.js';
import {
  configureFakeClaude,
  fetchConversationMessages,
  fetchRunStatus,
  findFreePort,
  readRunEvents,
  INACTIVITY_TIMEOUT_MS,
  restoreEnv,
  silenceTelemetryEnv,
  snapshotTelemetryEnv,
  startRun,
  waitForRunTerminal,
  writeHangThenSucceedClaude,
  type ConversationMessage,
  type RunStatus,
  type StartedServer,
} from './run-attempt-clock-harness.js';

const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/**
 * How long the RETRIED attempt stays in flight before it replies. Long enough
 * for a test to observe the divergence and act on it (lift the injected fault,
 * kill the daemon) while attempt 1 is genuinely running, and comfortably inside
 * the inactivity watchdog window so the retried attempt is not itself failed
 * for producing no output.
 */
const RETRIED_ATTEMPT_HOLD_MS = 800;

if (RETRIED_ATTEMPT_HOLD_MS >= INACTIVITY_TIMEOUT_MS) {
  throw new Error('the retried attempt must reply before the inactivity watchdog fires');
}

const FAULT_TRIGGER = 'od_test_block_attempt_anchor';

describe('per-attempt clock anchor durability (red spec)', () => {
  const originalEnv = snapshotTelemetryEnv();
  let started: StartedServer | null = null;
  let binDir: string | null = null;
  let sink: CaptureSink | null = null;
  let faultDb: Database.Database | null = null;
  let children: ChildProcessWithoutNullStreams[] = [];
  let tempRoots: string[] = [];

  afterEach(async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
      }
    }
    children = [];
    // Drop the injected fault before anything else can inherit it: the daemon
    // suite shares one SQLite file across the whole vitest process, so a leaked
    // trigger would poison unrelated runs.
    if (faultDb) {
      try { faultDb.exec(`DROP TRIGGER IF EXISTS ${FAULT_TRIGGER}`); } catch { /* best effort */ }
      try { faultDb.close(); } catch { /* best effort */ }
      faultDb = null;
    }
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    await sink?.close();
    sink = null;
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
    for (const root of tempRoots) await rm(root, { recursive: true, force: true });
    tempRoots = [];
    restoreEnv(originalEnv);
  });

  // Red spec for review thread PRRT_kwDOSOgY8s6bzYgY.
  //
  // `writeAssistantMessageAttemptAnchor` swallows every database error into a
  // `console.warn`. The retried attempt therefore reports itself as persisted
  // while the transcript row still holds attempt 0's pair, and nothing repairs
  // it or records that it failed — a user who refreshes gets the cumulative
  // clock back with no trace of why.
  //
  // The fault is injected as a SQLite trigger scoped to THIS run's assistant
  // row, so the failure is a real `db.prepare(...).run()` throw on the real
  // write, not a stub. It is lifted the moment the divergence is observed, so
  // the assertion is about what the daemon does with a TRANSIENT failure: the
  // anchor has to land at the next durable boundary.
  it('repairs and records an attempt-clock write the database rejected', async () => {
    sink = await startCaptureSink();
    const url = await startInProcessDaemon('claude-anchor-fault', sink.url);

    const assistantMessageId = `assistant_anchor_fault_${Date.now()}`;
    faultDb = new Database(path.join(requireDataDir(), 'app.sqlite'));
    // Fires only on the anchor write for the RETRIED attempt (0 -> 1) on this
    // one row. `upsertMessage` writes the same columns through COALESCE, so
    // matching on the transition rather than the column keeps unrelated message
    // writes — including this run's own — untouched.
    faultDb.exec(`
      CREATE TRIGGER ${FAULT_TRIGGER}
      BEFORE UPDATE OF attempt_started_at ON messages
      FOR EACH ROW
      WHEN NEW.id = '${assistantMessageId}'
        AND NEW.attempt_index = 1
        AND (OLD.attempt_index IS NULL OR OLD.attempt_index = 0)
      BEGIN
        SELECT RAISE(ABORT, 'attempt anchor write blocked by test');
      END;
    `);

    const run = await startRun(url, { assistantMessageId });
    let divergence: { status: RunStatus; assistant: ConversationMessage | undefined } | null = null;

    const terminal = await waitForRunTerminal(url, run.runId, run, {
      pollIntervalMs: 10,
      onPoll: async (status, ctx) => {
        if (divergence) return;
        if (status.attemptIndex !== 1) return;
        // Wait for the retried attempt's `start` frame before lifting the
        // fault. `start` is the existing anchor writer, and `send` persists the
        // event BEFORE it reaches the log, so a second `start` record proves
        // that write has already been attempted -- and rejected. Lifting the
        // fault any earlier would let the ordinary `start` path repair the row
        // and the spec would pass without any new behaviour.
        const events = await readRunEvents(status.eventsLogPath).catch(() => []);
        if (events.filter((record) => record.event === 'start').length < 2) return;
        const assistant = (await fetchConversationMessages(url, ctx.projectId, ctx.conversationId))
          .find((message) => message.id === ctx.assistantMessageId);
        divergence = { status, assistant };
        // Transient: from here on the database would accept the write, so the
        // only thing left that can carry the anchor to the row is a retry the
        // daemon schedules for itself.
        faultDb?.exec(`DROP TRIGGER IF EXISTS ${FAULT_TRIGGER}`);
      },
    });

    // Premise guard: the injected fault has to have produced the exact
    // divergence the review describes, or the repair assertion is vacuous.
    expect(divergence).not.toBeNull();
    const observed = divergence as unknown as {
      status: RunStatus;
      assistant: ConversationMessage | undefined;
    };
    expect(observed.status.attemptIndex).toBe(1);
    expect(observed.assistant?.attemptIndex ?? 0).toBe(0);

    expect(terminal.status).toBe('succeeded');
    expect(terminal.attemptIndex).toBe(1);

    // The fix: a rejected anchor write is pending work, not a discarded one.
    // Once the database accepts writes again the transcript must carry the
    // attempt the run reports, or a refresh renders attempt 0's start time and
    // the cumulative clock is back.
    const finalAssistant = (
      await fetchConversationMessages(url, run.projectId, run.conversationId)
    ).find((message) => message.id === assistantMessageId);
    expect(finalAssistant?.attemptIndex).toBe(1);
    expect(finalAssistant?.attemptStartedAt).toBe(terminal.attemptStartedAt);

    // ...and the failure must leave a structured trace. `console.warn` is not a
    // signal anything can act on; the run's own persistence counters are.
    const flushed = started;
    const props = await sink.waitForRunFinished(run.runId, async () => {
      await Promise.resolve(flushed?.shutdown?.());
    }) as unknown as Record<string, unknown>;
    expect(props.message_event_attempt_anchor_error_count).toBeTypeOf('number');
    expect(props.message_event_attempt_anchor_error_count as number).toBeGreaterThanOrEqual(1);
  }, 90_000);

  // Red spec for review thread PRRT_kwDOSOgY8s6bzYgb.
  //
  // `openRetryAttemptBoundary` advances the run object and writes SQLite, but
  // nothing checkpoints `state.json` between there and the next `start` frame.
  // A daemon killed inside the backoff therefore restarts from the PREVIOUS
  // attempt's snapshot while the transcript already names the new attempt, so
  // `/api/runs/:id` and the message clock disagree after recovery.
  //
  // SIGKILL models real process loss (OOM, crash, power); a graceful shutdown
  // would run `finish()`, emit `end`, and checkpoint the state on the way out,
  // which is exactly the write this window is missing.
  it('restarting inside the retry backoff hydrates the attempt the transcript names', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-attempt-clock-restart-'));
    tempRoots.push(root);
    const dataDir = path.join(root, 'data');
    const binHome = path.join(root, 'bin');
    await mkdir(dataDir, { recursive: true });
    await mkdir(binHome, { recursive: true });
    const fakeClaude = await writeHangThenSucceedClaude(binHome, 'claude-attempt-restart', {
      retriedAttemptHoldMs: RETRIED_ATTEMPT_HOLD_MS,
    });
    const port = await findFreePort();
    const env = {
      ...process.env,
      OD_BIND_HOST: '127.0.0.1',
      OD_DATA_DIR: dataDir,
      OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS: String(INACTIVITY_TIMEOUT_MS),
      POSTHOG_KEY: '',
      POSTHOG_HOST: '',
      OPEN_DESIGN_VELA_TELEMETRY: 'off',
      OPEN_DESIGN_TELEMETRY_RELAY_URL: '',
      LANGFUSE_PUBLIC_KEY: '',
      LANGFUSE_SECRET_KEY: '',
    };
    const args = ['--import', 'tsx', cliEntry, 'daemon', 'start', '--headless', '--port', String(port)];
    const url = `http://127.0.0.1:${port}`;

    const first = spawnDaemon(args, env);
    await waitForStdoutLine(first, /\[od\] listening on (http:\/\/[^\s]+)/u);
    await configureFakeClaude(url, fakeClaude);

    const run = await startRun(url);
    // The retry backoff is the only stretch where a run that has already
    // executed goes back to `queued`, so it is an unambiguous marker for the
    // window between teardown and respawn.
    const inBackoff = await pollUntil(async () => {
      const status = await fetchRunStatus(url, run.runId);
      return status.status === 'queued' && status.attemptIndex === 1 ? status : null;
    }, 25_000, 5);

    first.kill('SIGKILL');
    await waitForExit(first);

    const second = spawnDaemon(args, env);
    await waitForStdoutLine(second, /\[od\] listening on (http:\/\/[^\s]+)/u);

    const hydrated = await fetchRunStatus(url, run.runId);
    const assistant = (await fetchConversationMessages(url, run.projectId, run.conversationId))
      .find((message) => message.id === run.assistantMessageId);

    // Premise guard: the transcript really did record the retried attempt
    // before the kill, so any disagreement below is the missing checkpoint and
    // not a run that never got that far.
    expect(assistant?.attemptIndex).toBe(1);
    expect(assistant?.attemptStartedAt).toBe(inBackoff.attemptStartedAt);

    // The recovered run has to describe the same attempt as the transcript it
    // is rendered next to. Reading attempt 0's anchor here is the cumulative
    // clock returning through the restart path.
    expect(hydrated.attemptIndex).toBe(1);
    expect(hydrated.attemptStartedAt).toBe(assistant?.attemptStartedAt);

    second.kill('SIGKILL');
    await waitForExit(second);
    // Two cold `--import tsx` daemon boots plus a watchdog-driven retry. ~35s
    // locally; the budget is sized for a loaded CI runner, not for the happy
    // path, so a slow agent does not read as a product regression.
  }, 180_000);

  function requireDataDir(): string {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required (tests/setup.ts sets it)');
    return dataDir;
  }

  async function startInProcessDaemon(binName: string, captureUrl: string): Promise<string> {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-attempt-clock-bin-'));
    const fakeClaude = await writeHangThenSucceedClaude(binDir, binName, {
      retriedAttemptHoldMs: RETRIED_ATTEMPT_HOLD_MS,
    });
    silenceTelemetryEnv();
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = String(INACTIVITY_TIMEOUT_MS);
    process.env.POSTHOG_KEY = 'phc_attempt_clock_test';
    process.env.POSTHOG_HOST = captureUrl;
    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await configureFakeClaude(started.url, fakeClaude);
    return started.url;
  }

  function spawnDaemon(
    args: string[],
    env: NodeJS.ProcessEnv,
  ): ChildProcessWithoutNullStreams {
    const child = spawn(process.execPath, args, { cwd: daemonRoot, env });
    children.push(child);
    return child;
  }
});

async function pollUntil<T>(
  probe: () => Promise<T | null>,
  timeoutMs: number,
  intervalMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== null) return value;
    if (Date.now() >= deadline) throw new Error('timed out waiting for the retry backoff window');
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function waitForStdoutLine(
  child: ChildProcessWithoutNullStreams,
  pattern: RegExp,
  timeoutMs = 60_000,
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let buffered = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`daemon did not print ${pattern} in ${timeoutMs}ms; saw: ${buffered}`));
    }, timeoutMs);
    const onData = (chunk: Buffer) => {
      buffered += chunk.toString('utf8');
      const match = buffered.match(pattern);
      if (!match) return;
      cleanup();
      resolve(match[0]);
    };
    const onExit = () => {
      cleanup();
      reject(new Error(`daemon exited before printing ${pattern}; saw: ${buffered}`));
    };
    function cleanup() {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
    }
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', onExit);
  });
}

async function waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
}
