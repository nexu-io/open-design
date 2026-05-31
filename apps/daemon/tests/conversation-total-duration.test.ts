import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  insertConversation,
  insertProject,
  listConversations,
  openDatabase,
  upsertMessage,
} from '../src/db.js';

// Regression coverage for #3287. The conversation list previously surfaced
// the latest run's `durationMs` as the only duration signal (via `latestRun`),
// so a session built up over multiple runs displayed the most recent run's
// time only — not the cumulative session time. This spec asserts that
// `listConversations` exposes a `totalDurationMs` aggregated across every
// completed assistant run for the conversation, while `latestRun` is kept
// intact so existing UI code that needs the latest run's status can
// continue to read it.

describe('conversation total duration aggregation (#3287)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-conv-total-duration-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('sums durationMs across all completed assistant runs in the conversation', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();

    insertProject(db, {
      id: 'proj-1',
      name: 'Multi-run project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'multi-run conversation',
      createdAt: now,
      updatedAt: now,
    });

    // Three completed assistant runs, each with explicit start/end:
    // 5s, 12s, 7s → cumulative 24s = 24_000 ms.
    const runs = [
      { id: 'msg-1', runId: 'run-1', startedAt: now,           endedAt: now + 5_000  },
      { id: 'msg-2', runId: 'run-2', startedAt: now + 10_000,  endedAt: now + 22_000 },
      { id: 'msg-3', runId: 'run-3', startedAt: now + 30_000,  endedAt: now + 37_000 },
    ];
    for (const r of runs) {
      upsertMessage(db, 'conv-1', {
        id: r.id,
        role: 'assistant',
        content: '',
        runId: r.runId,
        runStatus: 'succeeded',
        startedAt: r.startedAt,
        endedAt: r.endedAt,
      });
    }

    const list = listConversations(db, 'proj-1');
    expect(list).toHaveLength(1);
    const conv = list[0]!;

    // The latest run still surfaces — existing UI code that wants the
    // most recent run's status continues to read it.
    expect(conv.latestRun?.status).toBe('succeeded');
    expect(conv.latestRun?.durationMs).toBe(7_000);

    // The aggregate covers every completed assistant run.
    expect(conv.totalDurationMs).toBe(24_000);
  });

  it('falls back to per-run usage durationMs when start/end are missing', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();

    insertProject(db, {
      id: 'proj-2',
      name: 'Usage-only project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-2',
      projectId: 'proj-2',
      title: 'usage-only',
      createdAt: now,
      updatedAt: now,
    });

    // Both runs lack startedAt/endedAt but report durationMs via usage events.
    upsertMessage(db, 'conv-2', {
      id: 'msg-a',
      role: 'assistant',
      content: '',
      runId: 'run-a',
      runStatus: 'succeeded',
      events: [{ kind: 'usage', durationMs: 4_500 }],
    });
    upsertMessage(db, 'conv-2', {
      id: 'msg-b',
      role: 'assistant',
      content: '',
      runId: 'run-b',
      runStatus: 'succeeded',
      events: [{ kind: 'usage', durationMs: 8_500 }],
    });

    const list = listConversations(db, 'proj-2');
    expect(list).toHaveLength(1);
    expect(list[0]!.totalDurationMs).toBe(13_000);
  });

  it('omits in-flight runs from the aggregate (status: running)', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();

    insertProject(db, {
      id: 'proj-3',
      name: 'Mixed status project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-3',
      projectId: 'proj-3',
      title: 'mixed status',
      createdAt: now,
      updatedAt: now,
    });

    // Two completed runs (3s + 9s) plus one still-running.
    upsertMessage(db, 'conv-3', {
      id: 'msg-x',
      role: 'assistant',
      content: '',
      runId: 'run-x',
      runStatus: 'succeeded',
      startedAt: now,
      endedAt: now + 3_000,
    });
    upsertMessage(db, 'conv-3', {
      id: 'msg-y',
      role: 'assistant',
      content: '',
      runId: 'run-y',
      runStatus: 'succeeded',
      startedAt: now + 5_000,
      endedAt: now + 14_000,
    });
    upsertMessage(db, 'conv-3', {
      id: 'msg-z',
      role: 'assistant',
      content: '',
      runId: 'run-z',
      runStatus: 'running',
      startedAt: now + 20_000,
      // no endedAt — still in flight
    });

    const list = listConversations(db, 'proj-3');
    expect(list).toHaveLength(1);
    // Only the two completed runs contribute: 3s + 9s = 12s.
    expect(list[0]!.totalDurationMs).toBe(12_000);
  });
});
