import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  insertConversation,
  insertProject,
  listLatestProjectRunStatuses,
  openDatabase,
  upsertMessage,
} from '../src/db.js';

// #1247 / #1060 — the project-status projection must read a terminal `succeeded`
// run that ended with unfinished declared work as `incomplete`, never as
// `succeeded`, and it must survive reload because it derives the verdict from the
// persisted `events_json` (the same TodoWrite snapshots the chat footer reads).

function todoWriteEvent(todos: Array<{ content: string; status: string }>) {
  return [{ kind: 'tool_use', id: 'tw-1', name: 'TodoWrite', input: { todos } }];
}

describe('listLatestProjectRunStatuses incomplete derivation (#1247)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-project-status-incomplete-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function seed(
    db: ReturnType<typeof openDatabase>,
    projectId: string,
    runStatus: string,
    events: unknown[],
  ) {
    const now = Date.now();
    insertProject(db, { id: projectId, name: projectId, createdAt: now, updatedAt: now });
    insertConversation(db, {
      id: `${projectId}-conv`,
      projectId,
      title: projectId,
      createdAt: now,
      updatedAt: now,
    });
    upsertMessage(db, `${projectId}-conv`, {
      id: `${projectId}-assistant`,
      role: 'assistant',
      content: '',
      runId: `${projectId}-run`,
      runStatus,
      events,
      startedAt: now,
      endedAt: now,
    });
  }

  it('projects a succeeded run with a pending TodoWrite as incomplete', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    seed(db, 'unfinished', 'succeeded', todoWriteEvent([
      { content: 'Draft layout', status: 'completed' },
      { content: 'Build components', status: 'pending' },
    ]));

    expect(listLatestProjectRunStatuses(db).get('unfinished')?.value).toBe('incomplete');
  });

  it('projects a succeeded run whose only task is stopped as incomplete', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    seed(db, 'stopped-only', 'succeeded', todoWriteEvent([
      { content: 'Build components', status: 'stopped' },
    ]));

    expect(listLatestProjectRunStatuses(db).get('stopped-only')?.value).toBe('incomplete');
  });

  it('leaves an all-completed TodoWrite run as succeeded', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    seed(db, 'finished', 'succeeded', todoWriteEvent([
      { content: 'Draft layout', status: 'completed' },
      { content: 'Build components', status: 'completed' },
    ]));

    expect(listLatestProjectRunStatuses(db).get('finished')?.value).toBe('succeeded');
  });

  it('leaves a text-only succeeded run (no TodoWrite) as succeeded', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    seed(db, 'text-only', 'succeeded', [{ kind: 'text', text: 'Here is your answer.' }]);

    expect(listLatestProjectRunStatuses(db).get('text-only')?.value).toBe('succeeded');
  });

  it('does not reclassify a failed run with unfinished todos (stays failed)', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    seed(db, 'failed', 'failed', todoWriteEvent([
      { content: 'Build components', status: 'in_progress' },
    ]));

    expect(listLatestProjectRunStatuses(db).get('failed')?.value).toBe('failed');
  });

  it('survives reload: re-opening the database still derives incomplete', () => {
    const first = openDatabase(tempDir, { dataDir: tempDir });
    seed(first, 'reload', 'succeeded', todoWriteEvent([
      { content: 'Build components', status: 'in_progress' },
    ]));
    closeDatabase();

    const reopened = openDatabase(tempDir, { dataDir: tempDir });
    expect(listLatestProjectRunStatuses(reopened).get('reload')?.value).toBe('incomplete');
  });
});
