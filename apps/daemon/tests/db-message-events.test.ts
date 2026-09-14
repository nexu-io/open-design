import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appendMessageAgentEvent,
  appendMessageStatusEvent,
  closeDatabase,
  finalizeMessageAgentEvents,
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

  it('persists task analytics lineage across message reloads and updates', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, {
      id: 'proj-1',
      name: 'Task lineage project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'Task lineage run',
      createdAt: now,
      updatedAt: now,
    });

    upsertMessage(db, 'conv-1', {
      id: 'assistant-task-1',
      role: 'assistant',
      content: '',
      taskAnalytics: {
        taskExecutionId: 'task-1',
        taskRunIndex: 0,
      },
    });
    upsertMessage(db, 'conv-1', {
      id: 'assistant-task-1',
      role: 'assistant',
      content: 'failed',
      runId: 'run-1',
      taskAnalytics: {
        taskExecutionId: 'task-1',
        initialRunId: 'run-1',
        taskRunIndex: 0,
      },
    });

    expect(listMessages(db, 'conv-1')[0]?.taskAnalytics).toEqual({
      taskExecutionId: 'task-1',
      initialRunId: 'run-1',
      taskRunIndex: 0,
    });
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

    const storedDuringRun = db.prepare(
      `SELECT content, events_json AS eventsJson FROM messages WHERE id = ?`,
    ).get('assistant-1') as { content: string; eventsJson: string };
    const batchCount = db.prepare(
      `SELECT COUNT(*) AS count FROM message_event_batches WHERE message_id = ?`,
    ).get('assistant-1') as { count: number };

    expect(storedDuringRun.eventsJson).toBe('[]');
    expect(storedDuringRun.content).toBe('');
    expect(batchCount.count).toBe(3);

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

    // The browser periodically PUTs its live snapshot while the daemon owns
    // the run. That snapshot must not be copied into events_json alongside
    // the append-only batches, or the next read/finalize would double every
    // event in the transcript.
    upsertMessage(db, 'conv-1', {
      ...message,
      id: 'assistant-1',
      role: 'assistant',
      runId: 'agent-run-1',
      runStatus: 'running',
    });
    expect(listMessages(db, 'conv-1')[0]?.events).toEqual(message?.events);
    expect((db.prepare(
      `SELECT events_json AS eventsJson FROM messages WHERE id = ?`,
    ).get('assistant-1') as { eventsJson: string }).eventsJson).toBe('[]');

    expect(finalizeMessageAgentEvents(db, 'assistant-1')).toEqual(message?.events);
    expect(db.prepare(
      `SELECT COUNT(*) AS count FROM message_event_batches WHERE message_id = ?`,
    ).get('assistant-1')).toEqual({ count: 0 });
    expect(JSON.parse((db.prepare(
      `SELECT events_json AS eventsJson FROM messages WHERE id = ?`,
    ).get('assistant-1') as { eventsJson: string }).eventsJson)).toEqual(message?.events);
  });

  it('lazily compacts a legacy terminal event snapshot after it is read', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, {
      id: 'proj-legacy',
      name: 'Legacy stream project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-legacy',
      projectId: 'proj-legacy',
      title: 'Legacy stream run',
      createdAt: now,
      updatedAt: now,
    });
    upsertMessage(db, 'conv-legacy', {
      id: 'assistant-legacy',
      role: 'assistant',
      content: 'x'.repeat(20_000),
      runId: 'legacy-run',
      runStatus: 'succeeded',
      events: [],
      startedAt: now,
      endedAt: now,
    });
    const legacyEvents = Array.from({ length: 20_000 }, () => ({
      kind: 'thinking',
      text: 'legacy-delta;',
    }));
    db.prepare(`UPDATE messages SET events_json = ? WHERE id = ?`).run(
      JSON.stringify(legacyEvents),
      'assistant-legacy',
    );
    closeDatabase();
    const reopenedDb = openDatabase(tempDir, { dataDir: tempDir });
    const beforeRead = reopenedDb.prepare(
      `SELECT events_json AS eventsJson FROM messages WHERE id = ?`,
    ).get('assistant-legacy') as { eventsJson: string };
    expect(JSON.parse(beforeRead.eventsJson)).toHaveLength(20_000);

    expect(listMessages(reopenedDb, 'conv-legacy')[0]?.events).toEqual([
      { kind: 'thinking', text: 'legacy-delta;'.repeat(20_000) },
    ]);

    await new Promise<void>((resolve) => setImmediate(resolve));
    const stored = reopenedDb.prepare(`SELECT events_json AS eventsJson FROM messages WHERE id = ?`)
      .get('assistant-legacy') as { eventsJson: string };
    expect(JSON.parse(stored.eventsJson)).toEqual([
      { kind: 'thinking', text: 'legacy-delta;'.repeat(20_000) },
    ]);
  });

  it('lazily finalizes append-only batches left behind by a terminal crash', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, {
      id: 'proj-recovery',
      name: 'Recovered stream project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-recovery',
      projectId: 'proj-recovery',
      title: 'Recovered stream run',
      createdAt: now,
      updatedAt: now,
    });
    upsertMessage(db, 'conv-recovery', {
      id: 'assistant-recovery',
      role: 'assistant',
      content: '',
      runId: 'recovery-run',
      runStatus: 'running',
      events: [],
      startedAt: now,
    });
    appendMessageAgentEvent(db, 'assistant-recovery', {
      kind: 'thinking',
      text: 'Recovered reasoning',
    });
    db.prepare(`UPDATE messages SET run_status = 'failed', ended_at = ? WHERE id = ?`)
      .run(now, 'assistant-recovery');

    expect(listMessages(db, 'conv-recovery')[0]?.events).toEqual([
      { kind: 'thinking', text: 'Recovered reasoning' },
    ]);

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(db.prepare(
      `SELECT COUNT(*) AS count FROM message_event_batches WHERE message_id = ?`,
    ).get('assistant-recovery')).toEqual({ count: 0 });
    const stored = db.prepare(`SELECT events_json AS eventsJson FROM messages WHERE id = ?`)
      .get('assistant-recovery') as { eventsJson: string };
    expect(JSON.parse(stored.eventsJson)).toEqual([
      { kind: 'thinking', text: 'Recovered reasoning' },
    ]);
  });

  it('compacts adjacent streamed deltas from whole-message client snapshots', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, {
      id: 'proj-1',
      name: 'Streaming snapshot project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'Streaming snapshot run',
      createdAt: now,
      updatedAt: now,
    });

    upsertMessage(db, 'conv-1', {
      id: 'assistant-stream-1',
      role: 'assistant',
      content: '',
      runId: 'agent-run-1',
      runStatus: 'running',
      events: [
        { kind: 'status', label: 'thinking' },
        ...Array.from({ length: 1_500 }, () => ({ kind: 'thinking', text: 'x' })),
        ...Array.from({ length: 1_500 }, () => ({ kind: 'text', text: 'y' })),
      ],
      startedAt: now,
    });

    expect(listMessages(db, 'conv-1')[0]?.events).toEqual([
      { kind: 'status', label: 'thinking' },
      { kind: 'thinking', text: 'x'.repeat(1_500) },
      { kind: 'text', text: 'y'.repeat(1_500) },
    ]);
  });

  it('scrubs historical DSML protocol tails from loaded content and text events', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    const protocolTail = [
      '</｜｜DSML｜｜parameter>',
      '</｜｜DSML｜｜invoke>',
      '</｜｜DSML｜｜tool_calls>',
    ].join('\n');
    insertProject(db, {
      id: 'proj-dsml',
      name: 'DSML history project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-dsml',
      projectId: 'proj-dsml',
      title: 'DSML history',
      createdAt: now,
      updatedAt: now,
    });
    upsertMessage(db, 'conv-dsml', {
      id: 'assistant-dsml',
      role: 'assistant',
      content: `保留这段建议${protocolTail}`,
      runId: 'agent-run-dsml',
      runStatus: 'succeeded',
      events: [
        { kind: 'text', text: '保留这段建议</｜｜DSML｜｜para' },
        { kind: 'status', label: 'streaming' },
        { kind: 'text', text: 'meter>\n</｜｜DSML｜｜invoke>\n' },
        { kind: 'tool_result', id: 'followups', name: 'suggest_followups' },
        { kind: 'text', text: '</｜｜DSML｜｜tool_calls>' },
      ],
      startedAt: now,
      endedAt: now,
    });

    const [message] = listMessages(db, 'conv-dsml');
    expect(message?.content).toBe('保留这段建议');
    expect(message?.events).toEqual([
      { kind: 'text', text: '保留这段建议' },
      { kind: 'status', label: 'streaming' },
      { kind: 'tool_result', id: 'followups', name: 'suggest_followups' },
    ]);

    const stored = db.prepare(
      `SELECT content, events_json AS eventsJson FROM messages WHERE id = ?`,
    ).get('assistant-dsml') as { content: string; eventsJson: string };
    expect(stored.content).toContain('</｜｜DSML｜｜parameter>');
    expect(stored.eventsJson).toContain('</｜｜DSML｜｜tool_calls>');
  });

  it('scrubs spaced ASCII-pipe DSML protocol tails from historical playback', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    const protocolTail = [
      '</| | DSML | | parameter>',
      '</| | DSML | | invoke>',
      '</| | DSML | | tool_calls>',
    ].join('\n');
    insertProject(db, {
      id: 'proj-spaced-dsml',
      name: 'Spaced DSML history project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-spaced-dsml',
      projectId: 'proj-spaced-dsml',
      title: 'Spaced DSML history',
      createdAt: now,
      updatedAt: now,
    });
    upsertMessage(db, 'conv-spaced-dsml', {
      id: 'assistant-spaced-dsml',
      role: 'assistant',
      content: `保留这段建议\n${protocolTail}`,
      runId: 'agent-run-spaced-dsml',
      runStatus: 'succeeded',
      events: [
        { kind: 'text', text: '保留这段建议\n</| | DS' },
        { kind: 'status', label: 'streaming' },
        { kind: 'text', text: 'ML | | parameter>\n</| | DSML | | invoke>\n' },
        { kind: 'tool_result', id: 'followups', name: 'suggest_followups' },
        { kind: 'text', text: '</| | DSML | | tool_calls>' },
      ],
      startedAt: now,
      endedAt: now,
    });

    const [message] = listMessages(db, 'conv-spaced-dsml');
    expect(message?.content).toBe('保留这段建议\n');
    expect(message?.events).toEqual([
      { kind: 'text', text: '保留这段建议\n' },
      { kind: 'status', label: 'streaming' },
      { kind: 'tool_result', id: 'followups', name: 'suggest_followups' },
    ]);
  });

  it('preserves historical DSML-looking code across text events', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    const markdown = [
      '```xml',
      '</｜｜DSML｜｜parameter>',
      '</｜｜DSML｜｜invoke>',
      '</｜｜DSML｜｜tool_calls>',
      '```',
    ].join('\n');
    insertProject(db, {
      id: 'proj-dsml-code',
      name: 'DSML code project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-dsml-code',
      projectId: 'proj-dsml-code',
      title: 'DSML code history',
      createdAt: now,
      updatedAt: now,
    });
    upsertMessage(db, 'conv-dsml-code', {
      id: 'assistant-dsml-code',
      role: 'assistant',
      content: markdown,
      runStatus: 'succeeded',
      events: [
        { kind: 'text', text: '```xml\n</｜｜DSML｜｜parameter>\n' },
        { kind: 'status', label: 'streaming' },
        { kind: 'text', text: '</｜｜DSML｜｜invoke>\n</｜｜DSML｜｜tool_calls>\n```' },
      ],
      startedAt: now,
      endedAt: now,
    });

    const [message] = listMessages(db, 'conv-dsml-code');
    expect(message?.content).toBe(markdown);
    expect(message?.events).toEqual([
      { kind: 'text', text: '```xml\n</｜｜DSML｜｜parameter>\n' },
      { kind: 'status', label: 'streaming' },
      { kind: 'text', text: '</｜｜DSML｜｜invoke>\n</｜｜DSML｜｜tool_calls>\n```' },
    ]);
  });

  it('compacts identical adjacent snapshots without dropping later state changes', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, {
      id: 'proj-snapshot',
      name: 'Snapshot compaction project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-snapshot',
      projectId: 'proj-snapshot',
      title: 'Snapshot compaction run',
      createdAt: now,
      updatedAt: now,
    });

    const pendingTodo = {
      kind: 'tool_use',
      id: 'todo-1',
      name: 'TodoWrite',
      input: { todos: [{ content: 'Audit old conversation', status: 'pending' }] },
    };
    const completedTodo = {
      ...pendingTodo,
      input: { todos: [{ content: 'Audit old conversation', status: 'completed' }] },
    };
    const pendingTodoCopy = () => ({
      ...pendingTodo,
      input: { todos: [{ content: 'Audit old conversation', status: 'pending' }] },
    });
    const questionForm = {
      kind: 'text',
      text: '<question-form>{"questions":[]}</question-form>',
    };

    upsertMessage(db, 'conv-snapshot', {
      id: 'assistant-snapshot',
      role: 'assistant',
      content: questionForm.text,
      runId: 'snapshot-run',
      runStatus: 'succeeded',
      events: [
        { kind: 'status', label: 'thinking' },
        ...Array.from({ length: 2_000 }, pendingTodoCopy),
        questionForm,
        // The intervening text is a semantic boundary, so an otherwise equal
        // snapshot on its other side must remain in the historical stream.
        ...Array.from({ length: 2_000 }, pendingTodoCopy),
        completedTodo,
        { kind: 'tool_use', id: 'bash-1', name: 'Bash', input: { command: 'pwd' } },
        { kind: 'tool_use', id: 'bash-1', name: 'Bash', input: { command: 'pwd' } },
        { kind: 'next_steps', suggestions: ['Open the result', 'Adjust the copy'] },
      ],
      startedAt: now,
      endedAt: now,
    });

    expect(listMessages(db, 'conv-snapshot')[0]?.events).toEqual([
      { kind: 'status', label: 'thinking' },
      pendingTodo,
      questionForm,
      pendingTodo,
      completedTodo,
      { kind: 'tool_use', id: 'bash-1', name: 'Bash', input: { command: 'pwd' } },
      { kind: 'tool_use', id: 'bash-1', name: 'Bash', input: { command: 'pwd' } },
      { kind: 'next_steps', suggestions: ['Open the result', 'Adjust the copy'] },
    ]);
  });
});
