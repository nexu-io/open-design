import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

import { closeDatabase, openDatabase } from "../../src/db.js";
import {
  createAmrTerminalReportDeliveryService,
  createAmrTerminalReportFinalizer,
  createAmrTerminalReportOutboxStore,
} from "../../src/storage/amr-terminal-report-outbox.js";
import { createChatRunService } from "../../src/runtimes/runs.js";
import { reconcileDurableRunTerminals } from "../../src/runtimes/run-terminal-reconciliation.js";

// runs.ts is intentionally @ts-nocheck and its inferred public factory type is
// narrower than its runtime options/records. Keep this test adapter local.
const createRuns = (options: Record<string, unknown>): any =>
  createChatRunService(options as never);

let tempDir: string | null = null;

afterEach(() => {
  vi.useRealTimers();
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

function createFixture() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "od-amr-terminal-reports-"));
  const db = openDatabase(tempDir);
  const outbox = createAmrTerminalReportOutboxStore(db);
  const runs = createRuns({
    createSseResponse: () => ({
      send: vi.fn(),
      end: vi.fn(),
      cleanup: vi.fn(),
    }),
    createSseErrorPayload: (code: string, message: string) => ({
      error: { code, message },
    }),
    onTerminal: createAmrTerminalReportFinalizer(outbox),
    runsLogDir: path.join(tempDir, "runs"),
  });
  return { db, outbox, runs };
}

describe("AMR terminal report outbox", () => {
  it("records failed and stopped AMR Runs once with durable state and terminal event timestamp parity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T01:02:03.456Z"));
    const { outbox, runs } = createFixture();
    const failed = runs.create({ agentId: "amr" });

    runs.finish(failed, "failed", 1, null);

    const failedAt = Date.now();
    expect(failed.updatedAt).toBe(failedAt);
    expect(failed.terminalAt).toBe(failedAt);
    expect(failed.events.at(-1)).toMatchObject({
      event: "end",
      timestamp: failedAt,
      data: { status: "failed", terminalAt: failedAt },
    });
    expect(JSON.parse(fs.readFileSync(failed.statePath, "utf8"))).toMatchObject(
      {
        status: "failed",
        updatedAt: failedAt,
        terminalAt: failedAt,
      },
    );
    expect(outbox.listPending()).toEqual([
      { runId: failed.id, outcome: "failed", terminalAt: failedAt },
    ]);

    vi.setSystemTime(new Date("2026-08-05T01:02:04.567Z"));
    const stopped = runs.create({ agentId: "amr" });
    await runs.cancel(stopped, "user_stop");
    const stoppedAt = Date.now();

    expect(stopped.events.at(-1)).toMatchObject({
      event: "end",
      timestamp: stoppedAt,
      data: { status: "canceled", terminalAt: stoppedAt },
    });
    expect(outbox.listPending()).toEqual([
      { runId: failed.id, outcome: "failed", terminalAt: failedAt },
      { runId: stopped.id, outcome: "canceled", terminalAt: stoppedAt },
    ]);
  });

  it("keeps the first AMR terminal report when late terminal callbacks arrive", () => {
    vi.useFakeTimers();
    const { outbox, runs } = createFixture();
    const run = runs.create({ agentId: "amr" });
    vi.setSystemTime(new Date("2026-08-05T02:00:00.000Z"));
    runs.finish(run, "failed", 1, null);
    vi.setSystemTime(new Date("2026-08-05T02:01:00.000Z"));
    runs.finish(run, "canceled", null, "SIGTERM");

    expect(outbox.listPending()).toEqual([
      {
        runId: run.id,
        outcome: "failed",
        terminalAt: Date.parse("2026-08-05T02:00:00.000Z"),
      },
    ]);
    expect(
      run.events.filter((event: { event: string }) => event.event === "end"),
    ).toHaveLength(1);
  });

  it("retains pending reports across SQLite store reconstruction", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T03:00:00.000Z"));
    const { outbox, runs } = createFixture();
    const run = runs.create({ agentId: "amr" });
    runs.finish(run, "failed", 1, null);
    const expected = [
      { runId: run.id, outcome: "failed", terminalAt: Date.now() },
    ];
    expect(outbox.listPending()).toEqual(expected);

    closeDatabase();
    const reopened = openDatabase(tempDir!);
    const reopenedOutbox = createAmrTerminalReportOutboxStore(reopened);
    reopenedOutbox.enqueue({
      runId: run.id,
      outcome: 'canceled',
      terminalAt: Date.now() + 1,
    });
    expect(reopenedOutbox.listPending()).toEqual(expected);
  });

  it("does not enqueue succeeded, non-AMR/BYOK, or SSE-disconnect-only Runs", () => {
    const { outbox, runs } = createFixture();
    const succeeded = runs.create({ agentId: "amr" });
    const nonAmr = runs.create({ agentId: "codex" });
    const byok = runs.create({ agentId: "byok-opencode" });
    const disconnected = runs.create({ agentId: "amr" });

    runs.finish(succeeded, "succeeded", 0, null);
    runs.finish(nonAmr, "failed", 1, null);
    runs.finish(byok, "canceled", null, "SIGTERM");
    runs.stream(
      disconnected,
      { get: () => null, query: {} } as never,
      { on: (_event: string, listener: () => void) => listener() } as never,
    );

    expect(disconnected.status).toBe("queued");
    expect(outbox.listPending()).toEqual([]);
  });

  it.each([
    { field: 'failureAction', value: 'recharge' },
    { field: 'errorCode', value: 'AMR_INSUFFICIENT_BALANCE' },
  ] as const)('keeps AMR %s recharge recovery eligible for same-Run continuation', ({ field, value }) => {
    const { outbox, runs } = createFixture();
    const run = runs.create({ agentId: 'amr' });
    run[field] = value;
    runs.finish(run, 'failed', 1, null);

    expect(outbox.listPending()).toEqual([]);
    expect(runs.prepareRestart(run)).toBe(run);
  });

  it('reports ordinary AMR failures and cancellation even with stale recharge classification', () => {
    const { outbox, runs } = createFixture();
    const ordinary = runs.create({ agentId: 'amr' });
    const canceled = runs.create({ agentId: 'amr' });
    canceled.failureAction = 'recharge';
    canceled.errorCode = 'AMR_INSUFFICIENT_BALANCE';

    runs.finish(ordinary, 'failed', 1, null);
    runs.finish(canceled, 'canceled', null, 'SIGTERM');

    expect(outbox.listPending().map(({ outcome }) => outcome).sort()).toEqual(['canceled', 'failed']);
  });

  it('finishes local terminal cleanup when the bounded outbox callback throws', async () => {
    const finalizer = vi.fn(() => { throw new Error('SQLite unavailable'); });
    const runs = createRuns({
      createSseResponse: () => ({ send: vi.fn(), end: vi.fn(), cleanup: vi.fn() }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
      onTerminal: finalizer,
    });
    const run = runs.create({ agentId: 'amr' });
    const finalized = vi.fn();
    run.onFinalize = finalized;
    const wait = runs.wait(run);

    runs.finish(run, 'failed', 1, null);

    expect(finalizer).toHaveBeenCalledOnce();
    expect(finalized).toHaveBeenCalledOnce();
    expect(run.events.filter((event: { event: string }) => event.event === 'end')).toHaveLength(1);
    await expect(wait).resolves.toMatchObject({ status: 'failed' });
  });

  it('automatically delivers after a transient SQLite enqueue failure', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T04:00:00.000Z'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { db, outbox, runs } = createFixture();
    const send = vi.fn(async (args: string[]) => JSON.stringify({
      runId: args[3],
      outcome: args[5],
      terminalAt: args[7],
      recorded: true,
    }));
    const delivery = createAmrTerminalReportDeliveryService({
      store: outbox,
      run: send,
      now: Date.now,
      pollIntervalMs: 1_000,
    });
    delivery.start();

    db.pragma('busy_timeout = 0');
    const blocker = new Database(db.name);
    blocker.exec('BEGIN IMMEDIATE');
    const run = runs.create({ agentId: 'amr' });
    try {
      runs.finish(run, 'failed', 1, null);
      expect(outbox.listPending()).toEqual([]);
      expect(run.events.at(-1)).toMatchObject({
        event: 'end',
        data: { status: 'failed', terminalAt: run.terminalAt },
      });

      blocker.exec('ROLLBACK');
      await vi.advanceTimersByTimeAsync(2_000);

      expect(send).toHaveBeenCalledOnce();
      expect(outbox.diagnostics(Date.now())).toMatchObject({
        pending: 0,
        delivered: 1,
      });
    } finally {
      if (blocker.inTransaction) blocker.exec('ROLLBACK');
      blocker.close();
      delivery.stop();
      warning.mockRestore();
    }
  });

  it('persists artifact metadata added by the terminal finalizer before publishing end', () => {
    const { runs } = createFixture();
    const run = runs.create({ agentId: 'amr' });
    run.onFinalize = () => {
      run.artifactCount = 2;
      run.artifactPaths = ['artifacts/index.html', 'artifacts/preview.png'];
    };

    runs.finish(run, 'failed', 1, null);

    expect(run.events.at(-1)).toMatchObject({
      event: 'end',
      data: {
        artifactCount: 2,
        artifactPaths: ['artifacts/index.html', 'artifacts/preview.png'],
      },
    });
    expect(JSON.parse(fs.readFileSync(run.statePath, 'utf8'))).toMatchObject({
      status: 'failed',
      artifactCount: 2,
      artifactPaths: ['artifacts/index.html', 'artifacts/preview.png'],
    });
  });

  it('stamps and backfills an AMR Run interrupted by restart with one terminal instant', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T04:00:00.000Z'));
    const { outbox, runs } = createFixture();
    const active = runs.create({ agentId: 'amr' });
    active.status = 'running';
    runs.persistState(active);

    const restarted = createRuns({
      createSseResponse: () => ({ send: vi.fn(), end: vi.fn(), cleanup: vi.fn() }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
      onTerminal: createAmrTerminalReportFinalizer(outbox),
      runsLogDir: path.join(tempDir!, 'runs'),
    });
    const recovered = restarted.get(active.id);
    const terminalAt = Date.now();

    expect(recovered).toMatchObject({ status: 'failed', terminalAt });
    expect(recovered.events.at(-1)).toMatchObject({
      event: 'end',
      timestamp: terminalAt,
      data: { status: 'failed', terminalAt },
    });
    expect(JSON.parse(fs.readFileSync(active.statePath, 'utf8'))).toMatchObject({
      status: 'failed',
      updatedAt: terminalAt,
      terminalAt,
    });
    expect(outbox.listPending()).toEqual([{ runId: active.id, outcome: 'failed', terminalAt }]);
  });

  it("backfills an existing terminal AMR state that has no outbox row during startup reconciliation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T05:00:00.000Z"));
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "od-amr-terminal-reports-"));
    const db = openDatabase(tempDir);
    const outbox = createAmrTerminalReportOutboxStore(db);
    const runsLogDir = path.join(tempDir, "runs");
    const bareRuns = createRuns({
      createSseResponse: () => ({ send: vi.fn(), end: vi.fn(), cleanup: vi.fn() }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
      runsLogDir,
    });
    const run = bareRuns.create({ agentId: "amr" });
    bareRuns.finish(run, "failed", 1, null);
    const expected = { runId: run.id, outcome: "failed", terminalAt: run.terminalAt };
    expect(outbox.listPending()).toEqual([]);

    await reconcileDurableRunTerminals({
      analytics: { capture: vi.fn() },
      appVersion: "0.20.3",
      db,
      finalizeTerminalLocally: createAmrTerminalReportFinalizer(outbox),
      reportLangfuse: vi.fn(),
      runsLogDir,
    });

    expect(outbox.listPending()).toEqual([expected]);
  });

  it("backfills a terminal AMR state only when lazy get hydrates it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T06:00:00.000Z"));
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "od-amr-terminal-reports-"));
    const db = openDatabase(tempDir);
    const outbox = createAmrTerminalReportOutboxStore(db);
    const runsLogDir = path.join(tempDir, "runs");
    const recoveringRuns = createRuns({
      createSseResponse: () => ({ send: vi.fn(), end: vi.fn(), cleanup: vi.fn() }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
      onTerminal: createAmrTerminalReportFinalizer(outbox),
      runsLogDir,
    });
    const bareRuns = createRuns({
      createSseResponse: () => ({ send: vi.fn(), end: vi.fn(), cleanup: vi.fn() }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
      runsLogDir,
    });
    const run = bareRuns.create({ agentId: "amr" });
    bareRuns.finish(run, "failed", 1, null);
    const expected = { runId: run.id, outcome: "failed", terminalAt: run.terminalAt };
    expect(outbox.listPending()).toEqual([]);

    expect(recoveringRuns.get(run.id)).toMatchObject({ id: run.id, status: "failed" });
    expect(outbox.listPending()).toEqual([expected]);
  });
});
