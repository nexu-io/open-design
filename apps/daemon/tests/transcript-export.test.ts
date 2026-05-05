// @ts-nocheck
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  closeDatabase,
  insertConversation,
  insertProject,
  openDatabase,
  upsertMessage,
} from '../src/db.js';
import { exportProjectTranscript } from '../src/transcript-export.js';

const PROJECT_ID = 'project-1';
const FIXED_NOW = () => new Date('2026-05-04T12:00:00.000Z');

let tempDir: string | null = null;
let projectsRoot: string | null = null;

afterEach(() => {
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
  projectsRoot = null;
});

function setup(): { db: any; projectsRoot: string } {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-tx-'));
  const db = openDatabase(tempDir);
  insertProject(db, {
    id: PROJECT_ID,
    name: 'Project',
    createdAt: 1,
    updatedAt: 1,
  });
  projectsRoot = path.join(tempDir, 'projects');
  fs.mkdirSync(path.join(projectsRoot, PROJECT_ID), { recursive: true });
  return { db, projectsRoot };
}

function readLines(filePath: string): any[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  expect(raw.endsWith('\n')).toBe(true);
  return raw
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

function seedConversation(db: any, opts: { id: string; createdAt: number; updatedAt?: number; title?: string | null }) {
  insertConversation(db, {
    id: opts.id,
    projectId: PROJECT_ID,
    title: opts.title ?? null,
    createdAt: opts.createdAt,
    updatedAt: opts.updatedAt ?? opts.createdAt,
  });
}

function seedMessage(
  db: any,
  conversationId: string,
  m: { id: string; role: 'user' | 'assistant'; content?: string; events?: any[] },
) {
  upsertMessage(db, conversationId, {
    id: m.id,
    role: m.role,
    content: m.content ?? '',
    events: m.events,
  });
}

describe('exportProjectTranscript', () => {
  it('writes a header-only file when the project has no conversations', () => {
    const { db, projectsRoot } = setup();
    const result = exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW });

    expect(result.conversationCount).toBe(0);
    expect(result.messageCount).toBe(0);
    expect(result.bytesWritten).toBeGreaterThan(0);
    expect(result.path).toBe(path.join(projectsRoot, PROJECT_ID, '.transcript.jsonl'));

    const lines = readLines(result.path);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      kind: 'header',
      schemaVersion: 1,
      projectId: PROJECT_ID,
      exportedAt: '2026-05-04T12:00:00.000Z',
      conversationCount: 0,
      messageCount: 0,
    });
  });

  it('emits header, conversation marker, and one message line per message', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100, title: 'Greeting' });
    seedMessage(db, 'c1', {
      id: 'm1',
      role: 'user',
      events: [{ type: 'text_delta', delta: 'hello' }],
    });
    seedMessage(db, 'c1', {
      id: 'm2',
      role: 'assistant',
      events: [{ type: 'text_delta', delta: 'world' }],
    });

    const result = exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW });
    const lines = readLines(result.path);

    expect(lines).toHaveLength(4);
    expect(lines[0].kind).toBe('header');
    expect(lines[0].conversationCount).toBe(1);
    expect(lines[0].messageCount).toBe(2);
    expect(lines[1]).toEqual({
      kind: 'conversation',
      id: 'c1',
      title: 'Greeting',
      createdAt: 100,
      updatedAt: expect.any(Number),
    });
    expect(lines[2].kind).toBe('message');
    expect(lines[2].conversationId).toBe('c1');
    expect(lines[2].id).toBe('m1');
    expect(lines[2].role).toBe('user');
    expect(lines[2].position).toBe(0);
    expect(lines[2].blocks).toEqual([{ type: 'text', text: 'hello' }]);
    expect(lines[3].id).toBe('m2');
    expect(lines[3].position).toBe(1);
    expect(lines[3].blocks).toEqual([{ type: 'text', text: 'world' }]);
  });

  it('coalesces adjacent text_delta chunks into a single text block', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', {
      id: 'm1',
      role: 'assistant',
      events: [
        { type: 'text_delta', delta: 'hel' },
        { type: 'text_delta', delta: 'lo' },
        { type: 'text_delta', delta: ' world' },
      ],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    const msg = lines[2];
    expect(msg.blocks).toEqual([{ type: 'text', text: 'hello world' }]);
  });

  it('preserves tool_use and tool_result ordering interleaved with text', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', {
      id: 'm1',
      role: 'assistant',
      events: [
        { type: 'text_delta', delta: 'I will read.' },
        { type: 'tool_use', id: 'tu_1', name: 'Read', input: { path: '/x' } },
        { type: 'tool_result', toolUseId: 'tu_1', content: 'file contents', isError: false },
        { type: 'text_delta', delta: ' Done.' },
      ],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    expect(lines[2].blocks).toEqual([
      { type: 'text', text: 'I will read.' },
      { type: 'tool_use', id: 'tu_1', name: 'Read', input: { path: '/x' } },
      { type: 'tool_result', toolUseId: 'tu_1', content: 'file contents', isError: false },
      { type: 'text', text: ' Done.' },
    ]);
  });

  it('drops status / usage / raw telemetry events without breaking content', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', {
      id: 'm1',
      role: 'assistant',
      events: [
        { type: 'status', label: 'streaming' },
        { type: 'thinking_delta', delta: 'reasoning' },
        { type: 'usage', usage: { input_tokens: 5 } },
        { type: 'text_delta', delta: 'answer' },
        { type: 'raw', line: '??' },
      ],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    expect(lines[2].blocks).toEqual([
      { type: 'thinking', thinking: 'reasoning' },
      { type: 'text', text: 'answer' },
    ]);
  });

  it('flushes accumulator on type change (thinking → text → tool)', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', {
      id: 'm1',
      role: 'assistant',
      events: [
        { type: 'thinking_delta', delta: 'plan' },
        { type: 'text_delta', delta: 'ok' },
        { type: 'tool_use', id: 't', name: 'X', input: {} },
      ],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    expect(lines[2].blocks).toEqual([
      { type: 'thinking', thinking: 'plan' },
      { type: 'text', text: 'ok' },
      { type: 'tool_use', id: 't', name: 'X', input: {} },
    ]);
  });

  it('emits text → thinking → text as three ordered blocks (arrival order, not heuristic)', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', {
      id: 'm1',
      role: 'assistant',
      events: [
        { type: 'text_delta', delta: 'pre' },
        { type: 'thinking_delta', delta: 'mid' },
        { type: 'text_delta', delta: 'post' },
      ],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    expect(lines[2].blocks).toEqual([
      { type: 'text', text: 'pre' },
      { type: 'thinking', thinking: 'mid' },
      { type: 'text', text: 'post' },
    ]);
  });

  it('treats thinking_start as a flush trigger so multi-block thinking survives', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', {
      id: 'm1',
      role: 'assistant',
      events: [
        { type: 'thinking_start' },
        { type: 'thinking_delta', delta: 'first' },
        { type: 'thinking_start' },
        { type: 'thinking_delta', delta: 'second' },
        { type: 'text_delta', delta: 'visible' },
      ],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    expect(lines[2].blocks).toEqual([
      { type: 'thinking', thinking: 'first' },
      { type: 'thinking', thinking: 'second' },
      { type: 'text', text: 'visible' },
    ]);
  });

  it('orders multiple conversations chronologically by created_at (regardless of updated_at)', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'older', createdAt: 100, updatedAt: 999, title: 'Older' });
    seedConversation(db, { id: 'newer', createdAt: 200, updatedAt: 200, title: 'Newer' });
    seedMessage(db, 'older', { id: 'm-older', role: 'user', events: [{ type: 'text_delta', delta: 'a' }] });
    seedMessage(db, 'newer', { id: 'm-newer', role: 'user', events: [{ type: 'text_delta', delta: 'b' }] });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    const conversationLines = lines.filter((l) => l.kind === 'conversation');
    expect(conversationLines.map((c) => c.id)).toEqual(['older', 'newer']);
  });

  it('atomic write: leaves no .tmp file at success and does not disturb unrelated tmp files', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', { id: 'm1', role: 'user', events: [{ type: 'text_delta', delta: 'x' }] });

    // Pre-existing orphan tmp file from a hypothetical prior failed run.
    const orphan = path.join(projectsRoot, PROJECT_ID, '.transcript.jsonl.tmp.99999.deadbeef');
    fs.writeFileSync(orphan, 'leftover');

    exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW });

    const dirEntries = fs.readdirSync(path.join(projectsRoot, PROJECT_ID));
    const tmps = dirEntries.filter((n) => n.startsWith('.transcript.jsonl.tmp.'));
    // Only the orphan should remain — our run's tmp must have been renamed away.
    expect(tmps).toEqual(['.transcript.jsonl.tmp.99999.deadbeef']);
    expect(fs.readFileSync(orphan, 'utf8')).toBe('leftover');
    expect(dirEntries).toContain('.transcript.jsonl');
  });

  it('falls back to messages.content as a single text block when events_json is null', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    // User-typed messages persist as plain text in `content`; events_json is
    // null because the user input does not flow through the streaming pipeline.
    upsertMessage(db, 'c1', {
      id: 'm-user',
      role: 'user',
      content: 'Make me a landing page.',
      // events deliberately omitted
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    expect(lines[2].id).toBe('m-user');
    expect(lines[2].blocks).toEqual([{ type: 'text', text: 'Make me a landing page.' }]);
  });

  it('prefers event-derived blocks over the content fallback when both are present', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    // Assistant rows in production carry a coalesced `content` AND the full
    // `events` blocks. The event-derived blocks are richer (tool_use,
    // thinking) so they must win.
    upsertMessage(db, 'c1', {
      id: 'm-asst',
      role: 'assistant',
      content: 'final coalesced text',
      events: [
        { type: 'text_delta', delta: 'final ' },
        { type: 'text_delta', delta: 'coalesced text' },
        { type: 'tool_use', id: 'tu_1', name: 'Read', input: { path: '/x' } },
      ],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    expect(lines[2].blocks).toEqual([
      { type: 'text', text: 'final coalesced text' },
      { type: 'tool_use', id: 'tu_1', name: 'Read', input: { path: '/x' } },
    ]);
  });

  it('produces empty blocks (no throw) for messages with malformed events_json', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    // Bypass the helpers so we can inject a deliberately malformed value.
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, events_json, position, created_at)
       VALUES ('mbad', 'c1', 'assistant', '', 'not json', 0, ${Date.now()})`,
    ).run();

    const result = exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW });
    const lines = readLines(result.path);
    expect(lines).toHaveLength(3); // header + conversation + 1 message
    expect(lines[2].id).toBe('mbad');
    expect(lines[2].blocks).toEqual([]);
  });

  it('rejects unsafe project ids (path-traversal guard from projectDir)', () => {
    const { db, projectsRoot } = setup();
    expect(() =>
      exportProjectTranscript(db, projectsRoot, '../etc', { now: FIXED_NOW }),
    ).toThrow(/invalid project id/);
  });
});
