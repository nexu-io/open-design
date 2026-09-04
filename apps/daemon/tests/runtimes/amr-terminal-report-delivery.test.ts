import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

import { closeDatabase, openDatabase } from '../../src/db.js';
import {
  createAmrTerminalReportDeliveryService,
  createAmrTerminalReportFinalizer,
  createAmrTerminalReportOutboxStore,
} from '../../src/storage/amr-terminal-report-outbox.js';
import { createChatRunService } from '../../src/runtimes/runs.js';
import type { VelaCommandOptions } from '../../src/integrations/vela-command.js';

const createRuns = (options: Record<string, unknown>): any =>
  createChatRunService(options as never);

let tempDir: string | null = null;

afterEach(() => {
  vi.useRealTimers();
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
  vi.restoreAllMocks();
});

function fixture(now = 1_800_000_000_000) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-amr-terminal-delivery-'));
  const db = openDatabase(tempDir);
  return { db, store: createAmrTerminalReportOutboxStore(db, () => now), now };
}

function rejectedEnvelope(error: unknown, retryable: boolean): Error {
  return Object.assign(new Error('command failed'), {
    stdout: JSON.stringify({ error, retryable }),
  });
}

describe('AMR terminal report delivery', () => {
  it('upgrades the #7392 row and claims it once with a stable timestamp', () => {
    const now = 1_800_000_000_000;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-amr-terminal-delivery-'));
    const dataDir = path.join(tempDir, '.od');
    fs.mkdirSync(dataDir, { recursive: true });
    const legacy = new Database(path.join(dataDir, 'app.sqlite'));
    legacy.exec(`
      CREATE TABLE amr_terminal_report_outbox (
        run_id TEXT PRIMARY KEY,
        outcome TEXT NOT NULL CHECK (outcome IN ('failed', 'canceled')),
        terminal_at INTEGER NOT NULL
      )
    `);
    legacy.prepare(`
      INSERT INTO amr_terminal_report_outbox (run_id, outcome, terminal_at)
      VALUES (?, 'failed', ?)
    `).run('legacy-run', now - 5_000);
    legacy.close();

    const reopened = openDatabase(tempDir);
    const first = createAmrTerminalReportOutboxStore(reopened, () => now);
    const claimed = first.claimDue(now, 10_000);
    const second = createAmrTerminalReportOutboxStore(reopened, () => now);

    expect(claimed).toEqual([expect.objectContaining({
      runId: 'legacy-run',
      attemptCount: 1,
      terminalAtIso: new Date(now - 5_000).toISOString(),
    })]);
    expect(second.claimDue(now, 10_000)).toEqual([]);
    expect(first.diagnostics(now)).toEqual({
      pending: 1,
      delivered: 0,
      unsupported: 0,
      terminalFailed: 0,
      oldestPendingAgeMs: 5_000,
      reports: [{
        runId: 'legacy-run',
        outcome: 'failed',
        state: 'pending',
        attemptCount: 1,
        terminalAt: new Date(now - 5_000).toISOString(),
        errorCode: null,
      }],
    });
  });

  it('contains an initial background claim failure and succeeds on the next poll', async () => {
    vi.useFakeTimers();
    const { db, store, now } = fixture();
    vi.setSystemTime(now);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    store.enqueue({ runId: 'initial-claim-storage-run', outcome: 'failed', terminalAt: now });
    const run = vi.fn(async (args: string[]) => JSON.stringify({
      runId: args[3], outcome: args[5], terminalAt: args[7], recorded: true,
    }));
    const service = createAmrTerminalReportDeliveryService({
      store, run, now: () => now, pollIntervalMs: 1_000,
    });
    db.pragma('busy_timeout = 0');
    const blocker = new Database(db.name);
    blocker.exec('BEGIN IMMEDIATE');
    try {
      service.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(run).not.toHaveBeenCalled();
      expect(warning).toHaveBeenCalledWith(
        '[od] amr_terminal_delivery_storage stage=claim runId=none code=local_storage',
      );
      blocker.exec('ROLLBACK');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(run).toHaveBeenCalledOnce();
      expect(store.diagnostics(now)).toMatchObject({ pending: 0, delivered: 1 });
    } finally {
      if (blocker.inTransaction) blocker.exec('ROLLBACK');
      blocker.close();
      service.stop();
    }
  });

  it('contains a timed background claim failure and keeps polling after recovery', async () => {
    vi.useFakeTimers();
    const { db, store, now } = fixture();
    vi.setSystemTime(now);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const run = vi.fn(async (args: string[]) => JSON.stringify({
      runId: args[3], outcome: args[5], terminalAt: args[7], recorded: true,
    }));
    const service = createAmrTerminalReportDeliveryService({
      store, run, now: () => now, pollIntervalMs: 1_000,
    });
    service.start();
    await vi.advanceTimersByTimeAsync(0);
    store.enqueue({ runId: 'timed-claim-storage-run', outcome: 'failed', terminalAt: now });
    db.pragma('busy_timeout = 0');
    const blocker = new Database(db.name);
    blocker.exec('BEGIN IMMEDIATE');
    try {
      await vi.advanceTimersByTimeAsync(1_000);
      expect(run).not.toHaveBeenCalled();
      expect(warning).toHaveBeenCalledWith(
        '[od] amr_terminal_delivery_storage stage=claim runId=none code=local_storage',
      );
      blocker.exec('ROLLBACK');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(run).toHaveBeenCalledOnce();
      expect(store.diagnostics(now)).toMatchObject({ pending: 0, delivered: 1 });
    } finally {
      if (blocker.inTransaction) blocker.exec('ROLLBACK');
      blocker.close();
      service.stop();
    }
  });

  it('contains receipt persistence failure and idempotently replays after lease expiry', async () => {
    const { db, store, now } = fixture();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let currentTime = now;
    store.enqueue({ runId: 'receipt-storage-run', outcome: 'canceled', terminalAt: now });
    let releaseFirstReceipt!: (receipt: string) => void;
    const firstReceipt = new Promise<string>((resolve) => { releaseFirstReceipt = resolve; });
    const run = vi.fn()
      .mockImplementationOnce(() => firstReceipt)
      .mockImplementationOnce(async (args: string[]) => JSON.stringify({
        runId: args[3], outcome: args[5], terminalAt: args[7], recorded: false,
      }));
    const service = createAmrTerminalReportDeliveryService({
      store,
      run,
      now: () => currentTime,
      leaseMs: 1_000,
    });
    const processing = service.processDue();
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());

    db.pragma('busy_timeout = 0');
    const blocker = new Database(db.name);
    blocker.exec('BEGIN IMMEDIATE');
    try {
      const firstArgs = run.mock.calls[0]?.[0] as string[];
      releaseFirstReceipt(JSON.stringify({
        runId: firstArgs[3],
        outcome: firstArgs[5],
        terminalAt: firstArgs[7],
        recorded: true,
      }));
      await expect(processing).resolves.toBeUndefined();
      expect(warning).toHaveBeenCalledWith(
        '[od] amr_terminal_delivery_storage stage=persist_result runId=receipt-storage-run code=local_storage',
      );
      expect(warning.mock.calls.flat().join(' ')).not.toContain(
        'amr_terminal_delivery runId=receipt-storage-run',
      );
    } finally {
      blocker.exec('ROLLBACK');
      blocker.close();
    }

    currentTime += 1_000;
    await service.processDue();
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1]?.[0]).toEqual(run.mock.calls[0]?.[0]);
    expect(store.diagnostics(currentTime)).toMatchObject({ pending: 0, delivered: 1 });
  });

  it('uses the exact canonical Vela command, source environment, and bounded receipt', async () => {
    const { db, store, now } = fixture();
    store.enqueue({ runId: 'run-1', outcome: 'canceled', terminalAt: now });
    const run = vi.fn(async (args: string[]) => JSON.stringify({
      runId: args[3], outcome: args[5], terminalAt: args[7], recorded: true,
    }));
    const service = createAmrTerminalReportDeliveryService({ store, run, now: () => now });

    await service.processDue();

    expect(run).toHaveBeenCalledWith([
      'run', 'terminal', '--run-id', 'run-1', '--outcome', 'canceled',
      '--terminal-at', new Date(now).toISOString(), '--json',
    ], expect.objectContaining({
      configuredEnv: { VELA_INVOCATION_SOURCE: 'open-design' },
    }));
    expect(store.diagnostics(now)).toMatchObject({ pending: 0, delivered: 1 });
    expect(db.prepare('SELECT receipt FROM amr_terminal_report_outbox WHERE run_id = ?').get('run-1'))
      .toMatchObject({ receipt: expect.stringContaining('"recorded":true') });
  });

  it('persists exponential backoff and resumes unchanged after reconstruction', async () => {
    const { store, now } = fixture();
    const terminalAt = now - 123;
    store.enqueue({ runId: 'retry-run', outcome: 'failed', terminalAt });
    const transient = vi.fn().mockRejectedValue(new Error('network reset'));
    await createAmrTerminalReportDeliveryService({
      store, run: transient, now: () => now, baseBackoffMs: 1_000,
    }).processDue();
    expect(store.claimDue(now + 999, 1_000)).toEqual([]);

    closeDatabase();
    const reopened = openDatabase(tempDir!);
    const recovered = createAmrTerminalReportOutboxStore(reopened, () => now + 1_000);
    const run = vi.fn(async (args: string[], _options?: VelaCommandOptions) => JSON.stringify({
      runId: args[3], outcome: args[5], terminalAt: args[7], recorded: false,
    }));
    await createAmrTerminalReportDeliveryService({
      store: recovered, run, now: () => now + 1_000,
    }).processDue();

    expect(run.mock.calls[0]?.[0]).toEqual([
      'run', 'terminal', '--run-id', 'retry-run', '--outcome', 'failed',
      '--terminal-at', new Date(terminalAt).toISOString(), '--json',
    ]);
    expect(run.mock.calls[0]?.[1]).toMatchObject({
      configuredEnv: { VELA_INVOCATION_SOURCE: 'open-design' },
      maxBuffer: 64 * 1024,
    });
    expect(recovered.diagnostics()).toMatchObject({ pending: 0, delivered: 1 });
  });

  it('never changes the local terminal Run or event when delivery fails', async () => {
    const { store, now } = fixture();
    const runs = createRuns({
      createSseResponse: () => ({ send: vi.fn(), end: vi.fn(), cleanup: vi.fn() }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
      onTerminal: createAmrTerminalReportFinalizer(store),
    });
    const localRun = runs.create({ agentId: 'amr' });
    runs.finish(localRun, 'failed', 1, null);
    const terminalEvent = structuredClone(localRun.events.at(-1));

    await createAmrTerminalReportDeliveryService({
      store,
      run: vi.fn().mockRejectedValue(rejectedEnvelope({ code: 'forbidden' }, false)),
      now: () => now,
    }).processDue();

    expect(localRun.status).toBe('failed');
    expect(localRun.events.at(-1)).toEqual(terminalEvent);
    expect(localRun.events.filter((event: { event: string }) => event.event === 'end')).toHaveLength(1);
    expect(store.diagnostics(now)).toMatchObject({ pending: 0, terminalFailed: 1 });
  });

  it('aborts in-flight runner work and leaves the report pending when stopped', async () => {
    const { store, now } = fixture();
    store.enqueue({ runId: 'stop-run', outcome: 'failed', terminalAt: now });
    let observedSignal: AbortSignal | undefined;
    const run = vi.fn((_args, options) => new Promise<string>((_resolve, reject) => {
      observedSignal = options?.signal;
      observedSignal?.addEventListener('abort', () => reject(observedSignal?.reason), { once: true });
    }));
    const service = createAmrTerminalReportDeliveryService({ store, run, now: () => now });

    service.start();
    await vi.waitFor(() => expect(observedSignal).toBeDefined());
    service.stop();
    await service.processDue();

    expect(observedSignal?.aborted).toBe(true);
    expect(store.diagnostics(now)).toMatchObject({ pending: 1, delivered: 0 });
  });

  it.each([
    ['canonical top-level false', rejectedEnvelope('server declined', false)],
    ['nested false', rejectedEnvelope({ code: 'forbidden', message: 'denied', retryable: false }, true)],
    ['invalid', rejectedEnvelope({ code: 'invalid_input', retryable: false }, true)],
  ])('stops deterministic failure: %s', async (_name, error) => {
    const { store, now } = fixture();
    store.enqueue({ runId: 'terminal-run', outcome: 'failed', terminalAt: now });
    await createAmrTerminalReportDeliveryService({
      store, run: vi.fn().mockRejectedValue(error), now: () => now,
    }).processDue();
    expect(store.diagnostics(now)).toMatchObject({ pending: 0, terminalFailed: 1 });
    expect(store.claimDue(now + 99_999, 100)).toEqual([]);
  });

  it.each([
    rejectedEnvelope('temporary server overload', true),
    rejectedEnvelope({ code: 'rate_limited', retryable: true }, false),
    rejectedEnvelope({ code: 'server_error', retryable: true }, false),
    new Error('spawn uncertainty'),
  ])('retries canonical or nested transient failure %#', async (error) => {
    const { store, now } = fixture();
    store.enqueue({ runId: 'pending-run', outcome: 'failed', terminalAt: now });
    await createAmrTerminalReportDeliveryService({
      store, run: vi.fn().mockRejectedValue(error), now: () => now,
    }).processDue();
    expect(store.diagnostics(now)).toMatchObject({ pending: 1, terminalFailed: 0 });
  });

  it('returns at most 50 deterministic safe per-Run diagnostics', () => {
    const { store, now } = fixture();
    for (let index = 0; index < 55; index += 1) {
      store.enqueue({
        runId: `diagnostic-run-${String(index).padStart(2, '0')}`,
        outcome: index % 2 === 0 ? 'failed' : 'canceled',
        terminalAt: now + index,
      });
    }

    const diagnostics = store.diagnostics(now + 100);

    expect(diagnostics.reports).toHaveLength(50);
    expect(diagnostics.reports[0]).toEqual({
      runId: 'diagnostic-run-00',
      outcome: 'failed',
      state: 'pending',
      attemptCount: 0,
      terminalAt: new Date(now).toISOString(),
      errorCode: null,
    });
    expect(diagnostics.reports.at(-1)?.runId).toBe('diagnostic-run-49');
    expect(Object.keys(diagnostics.reports[0] ?? {}).sort()).toEqual([
      'attemptCount', 'errorCode', 'outcome', 'runId', 'state', 'terminalAt',
    ]);
  });

  it('tracks unsupported separately from other terminal failures', async () => {
    const { db, store, now } = fixture();
    store.enqueue({ runId: 'unsupported-run', outcome: 'failed', terminalAt: now });
    await createAmrTerminalReportDeliveryService({
      store,
      run: vi.fn().mockRejectedValue(rejectedEnvelope('unknown command "terminal"', false)),
      now: () => now,
    }).processDue();

    expect(store.diagnostics(now)).toMatchObject({
      pending: 0,
      unsupported: 1,
      terminalFailed: 0,
    });
    expect(db.prepare(`SELECT last_error_code AS code FROM amr_terminal_report_outbox`).get())
      .toEqual({ code: 'unsupported' });
  });

  it.each([
    'auth_required',
    'authentication required',
    'not authenticated',
    'not logged in',
    'login missing',
    'please sign in again',
    'sign-in-again',
    'token has expired',
    'expired session',
    'invalid session',
  ])('terminal-fails established AMR auth signal: %s', async (message) => {
    const { db, store, now } = fixture();
    store.enqueue({ runId: 'auth-run', outcome: 'failed', terminalAt: now });
    await createAmrTerminalReportDeliveryService({
      store,
      run: vi.fn().mockRejectedValue(new Error(message)),
      now: () => now,
    }).processDue();
    expect(store.diagnostics(now)).toMatchObject({ pending: 0, terminalFailed: 1 });
    expect(db.prepare(`SELECT last_error_code AS code FROM amr_terminal_report_outbox`).get())
      .toEqual({ code: 'auth_required' });
  });

  it('stores only safe codes, redacted errors, and canonical receipt fields', async () => {
    const { db, store, now } = fixture();
    const secret = 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890';
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    store.enqueue({ runId: 'secret-error', outcome: 'failed', terminalAt: now });
    await createAmrTerminalReportDeliveryService({
      store,
      run: vi.fn().mockRejectedValue(rejectedEnvelope({
        code: `arbitrary-${secret}`,
        message: `Authorization: Bearer ${secret}`,
        retryable: false,
      }, true)),
      now: () => now,
    }).processDue();
    const failed = db.prepare(`
      SELECT last_error_code AS code, last_error AS error
        FROM amr_terminal_report_outbox WHERE run_id = 'secret-error'
    `).get() as { code: string; error: string };
    expect(failed.code).toBe('non_retryable');
    expect(failed.error).toContain('[REDACTED:');
    expect(failed.error).not.toContain(secret);
    expect(JSON.stringify(warning.mock.calls)).not.toContain(secret);

    store.enqueue({ runId: 'secret-receipt', outcome: 'canceled', terminalAt: now });
    await createAmrTerminalReportDeliveryService({
      store,
      run: vi.fn().mockResolvedValue(JSON.stringify({
        runId: 'secret-receipt',
        outcome: 'canceled',
        terminalAt: new Date(now).toISOString(),
        recorded: false,
        token: secret,
        raw: { prompt: 'private' },
      })),
      now: () => now,
    }).processDue();
    const delivered = db.prepare(`
      SELECT receipt FROM amr_terminal_report_outbox WHERE run_id = 'secret-receipt'
    `).get() as { receipt: string };
    expect(JSON.parse(delivered.receipt)).toEqual({
      runId: 'secret-receipt',
      outcome: 'canceled',
      terminalAt: new Date(now).toISOString(),
      recorded: false,
    });
    expect(delivered.receipt).not.toContain(secret);
    expect(delivered.receipt).not.toContain('private');
  });

  it.each([
    ['2027-01-15T08:00:00.120Z', '2027-01-15T08:00:00.12Z'],
    ['2027-01-15T08:00:00.100Z', '2027-01-15T08:00:00.1Z'],
    ['2027-01-15T08:00:00.000Z', '2027-01-15T08:00:00Z'],
  ])('accepts equivalent Go RFC3339 timestamps: %s -> %s', async (requested, returned) => {
    const now = Date.parse(requested);
    const { db, store } = fixture(now);
    store.enqueue({ runId: 'equivalent-time', outcome: 'failed', terminalAt: now });
    await createAmrTerminalReportDeliveryService({
      store,
      run: vi.fn().mockResolvedValue(JSON.stringify({
        runId: 'equivalent-time',
        outcome: 'failed',
        terminalAt: returned,
        recorded: true,
      })),
      now: () => now,
    }).processDue();

    expect(store.diagnostics(now)).toMatchObject({ delivered: 1, terminalFailed: 0 });
    const row = db.prepare(`
      SELECT receipt FROM amr_terminal_report_outbox WHERE run_id = 'equivalent-time'
    `).get() as { receipt: string };
    expect(JSON.parse(row.receipt)).toEqual({
      runId: 'equivalent-time',
      outcome: 'failed',
      terminalAt: new Date(now).toISOString(),
      recorded: true,
    });
  });

  it.each([
    ['not json'],
    [JSON.stringify({ runId: 'other', outcome: 'failed', terminalAt: new Date(1_800_000_000_000).toISOString(), recorded: true })],
    [JSON.stringify({ runId: 'receipt-run', outcome: 'canceled', terminalAt: new Date(1_800_000_000_000).toISOString(), recorded: true })],
    [JSON.stringify({ runId: 'receipt-run', outcome: 'failed', terminalAt: new Date(1_800_000_000_000).toISOString() })],
    [JSON.stringify({ runId: 'receipt-run', outcome: 'failed', terminalAt: new Date(1_800_000_000_000).toISOString(), recorded: 'true' })],
    [JSON.stringify({ runId: 'receipt-run', outcome: 'failed', terminalAt: new Date(1_800_000_000_000).toISOString(), recorded: 1 })],
    [JSON.stringify({ runId: 'receipt-run', outcome: 'failed', terminalAt: new Date(1_800_000_000_000).toISOString(), recorded: null })],
  ])('terminal-fails malformed or mismatched receipt %#', async (receipt) => {
    const { store, now } = fixture();
    store.enqueue({ runId: 'receipt-run', outcome: 'failed', terminalAt: now });
    await createAmrTerminalReportDeliveryService({
      store, run: vi.fn().mockResolvedValue(receipt), now: () => now,
    }).processDue();
    expect(store.diagnostics(now)).toMatchObject({ pending: 0, terminalFailed: 1 });
  });
});
