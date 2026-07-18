import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appendMessageAgentEvent,
  appendMessageStatusEvent,
  closeDatabase,
  insertConversation,
  insertProject,
  listMessages,
  openDatabase,
  upsertMessage,
} from '../src/db.js';

describe('message event persistence', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-db-message-events-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('appends deduplicated failure status events to assistant messages', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, {
      id: 'proj-1',
      name: 'Routine project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'Routine run',
      createdAt: now,
      updatedAt: now,
    });
    upsertMessage(db, 'conv-1', {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      runId: 'agent-run-1',
      runStatus: 'running',
      resultDeliveryState: 'delivery_failed',
      events: [{ kind: 'status', label: 'starting', detail: 'Codex' }],
      startedAt: now,
    });

    appendMessageStatusEvent(db, 'assistant-1', {
      label: 'error',
      detail: 'Agent stalled without emitting any new output for 1s.',
    });
    appendMessageStatusEvent(db, 'assistant-1', {
      label: 'error',
      detail: 'Agent stalled without emitting any new output for 1s.',
    });

    expect(listMessages(db, 'conv-1')[0]?.events).toEqual([
      { kind: 'status', label: 'starting', detail: 'Codex' },
      {
        kind: 'status',
        label: 'error',
        detail: 'Agent stalled without emitting any new output for 1s.',
      },
    ]);
    expect(listMessages(db, 'conv-1')[0]?.resultDeliveryState).toBe('delivery_failed');
  });

  it('persists explicit message createdAt values on insert', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    const createdAt = now - 5_000;
    insertProject(db, {
      id: 'proj-1',
      name: 'Timestamp project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'Timestamp run',
      createdAt: now,
      updatedAt: now,
    });

    upsertMessage(db, 'conv-1', {
      id: 'message-1',
      role: 'user',
      content: 'started earlier',
      createdAt,
    });

    expect(listMessages(db, 'conv-1')[0]?.createdAt).toBe(createdAt);
  });

  it('appends agent events and mirrors text deltas into message content', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, {
      id: 'proj-1',
      name: 'Video project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'HyperFrames run',
      createdAt: now,
      updatedAt: now,
    });
    upsertMessage(db, 'conv-1', {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      runId: 'agent-run-1',
      runStatus: 'running',
      events: [],
      startedAt: now,
    });

    appendMessageAgentEvent(db, 'assistant-1', { kind: 'text', text: 'Rendering ' });
    appendMessageAgentEvent(db, 'assistant-1', {
      kind: 'tool_use',
      id: 'tool-1',
      name: 'Bash',
      input: { command: 'od media generate' },
    });
    appendMessageAgentEvent(db, 'assistant-1', { kind: 'text', text: 'done.' });

    const message = listMessages(db, 'conv-1')[0];
    expect(message?.content).toBe('Rendering done.');
    expect(message?.events).toEqual([
      { kind: 'text', text: 'Rendering ' },
      {
        kind: 'tool_use',
        id: 'tool-1',
        name: 'Bash',
        input: { command: 'od media generate' },
      },
      { kind: 'text', text: 'done.' },
    ]);
  });
});
