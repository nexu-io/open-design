// Persisted event shape under test is `PersistedAgentEvent` from
// packages/contracts/src/api/chat.ts (the discriminator is `kind`, the
// thinking field is `text`). The daemon's claude-stream emits a different
// `type:`-shaped wire format — those events are translated to the persisted
// `kind:` shape by the web client before being PUT back for storage.
//
// All seeded events here mirror the canonical persisted shape, exactly as
// they appear in `messages.events_json` in production databases.
//
// Note on fs imports: both this file and `transcript-export.ts` use
// `import fs from 'node:fs'` (default import — the CJS module exports
// object) so that `vi.spyOn(fs, '<fn>')` in the failure-injection tests can
// actually redefine properties. ESM namespace imports of `node:fs` (`import
// * as fs from 'node:fs'`) produce a frozen Module Namespace Object that
// `vi.spyOn` cannot mutate; default-import sidesteps that restriction
// because it returns the underlying CJS `module.exports` object.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';
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
import {
  exportProjectTranscript,
  TranscriptExportLockedError,
} from '../src/transcript-export.js';

const PROJECT_ID = 'project-1';
const FIXED_NOW = () => new Date('2026-05-04T12:00:00.000Z');

let tempDir: string | null = null;
let projectsRoot: string | null = null;

afterEach(() => {
  closeDatabase();
  vi.restoreAllMocks();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
  projectsRoot = null;
});

type TranscriptLine = Record<string, unknown>;
type TranscriptLines = TranscriptLine[];
type PersistedAgentEvent =
  | { kind: 'status'; label: string; detail?: string }
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_use'; id: string; name: string; input: unknown }
  | { kind: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { kind: 'usage'; inputTokens?: number; outputTokens?: number; costUsd?: number; durationMs?: number }
  | { kind: 'raw'; line: string };
type ChatAttachment = { path: string; name: string; kind: string; size?: number };
type ChatCommentAttachment = {
  id: string;
  order: number;
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  comment: string;
  currentText: string;
  pagePosition: { x: number; y: number };
  htmlHint: string;
};

function line(lines: TranscriptLines, index: number): TranscriptLine {
  const item = lines[index];
  if (!item) throw new Error(`missing transcript line ${index}`);
  return item;
}

function setup(opts: { skipMkdir?: boolean } = {}): { db: Database.Database; projectsRoot: string } {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-tx-'));
  const db = openDatabase(tempDir);
  insertProject(db, {
    id: PROJECT_ID,
    name: 'Project',
    createdAt: 1,
    updatedAt: 1,
  });
  projectsRoot = path.join(tempDir, 'projects');
  if (!opts.skipMkdir) {
    fs.mkdirSync(path.join(projectsRoot, PROJECT_ID), { recursive: true });
  }
  return { db, projectsRoot };
}

function readLines(filePath: string): TranscriptLines {
  const raw = fs.readFileSync(filePath, 'utf8');
  expect(raw.endsWith('\n')).toBe(true);
  return raw
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as TranscriptLine) as TranscriptLines;
}

function seedConversation(db: Database.Database, opts: { id: string; createdAt: number; updatedAt?: number; title?: string | null }) {
  insertConversation(db, {
    id: opts.id,
    projectId: PROJECT_ID,
    title: opts.title ?? null,
    createdAt: opts.createdAt,
    updatedAt: opts.updatedAt ?? opts.createdAt,
  });
}

function seedMessage(
  db: Database.Database,
  conversationId: string,
  m: {
    id: string;
    role: 'user' | 'assistant';
    content?: string;
    events?: PersistedAgentEvent[];
    attachments?: ChatAttachment[];
    commentAttachments?: ChatCommentAttachment[];
  },
) {
  upsertMessage(db, conversationId, {
    id: m.id,
    role: m.role,
    content: m.content ?? '',
    events: m.events,
    attachments: m.attachments,
    commentAttachments: m.commentAttachments,
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
    expect(line(lines, 0)).toEqual({
      kind: 'header',
      schemaVersion: 2,
      projectId: PROJECT_ID,
      exportedAt: '2026-05-04T12:00:00.000Z',
      conversationCount: 0,
      messageCount: 0,
      attachmentCount: 0,
      commentAttachmentCount: 0,
      attachmentsInlined: false,
    });
  });

  it('emits header, conversation marker, and one message line per message', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100, title: 'Greeting' });
    seedMessage(db, 'c1', {
      id: 'm1',
      role: 'user',
      events: [{ kind: 'text', text: 'hello' }],
    });
    seedMessage(db, 'c1', {
      id: 'm2',
      role: 'assistant',
      events: [{ kind: 'text', text: 'world' }],
    });

    const result = exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW });
    const lines = readLines(result.path);

    expect(lines).toHaveLength(4);
    expect(line(lines, 0).kind).toBe('header');
    expect(line(lines, 0).schemaVersion).toBe(2);
    expect(line(lines, 0).conversationCount).toBe(1);
    expect(line(lines, 0).messageCount).toBe(2);
    expect(line(lines, 1)).toEqual({
      kind: 'conversation',
      id: 'c1',
      title: 'Greeting',
      createdAt: 100,
      updatedAt: expect.any(Number),
    });
    expect(line(lines, 2).kind).toBe('message');
    expect(line(lines, 2).conversationId).toBe('c1');
    expect(line(lines, 2).id).toBe('m1');
    expect(line(lines, 2).role).toBe('user');
    expect(line(lines, 2).position).toBe(0);
    expect(line(lines, 2).blocks).toEqual([{ type: 'text', text: 'hello' }]);
    expect(line(lines, 3).id).toBe('m2');
    expect(line(lines, 3).position).toBe(1);
    expect(line(lines, 3).blocks).toEqual([{ type: 'text', text: 'world' }]);
  });

  it('coalesces adjacent text events into a single text block', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', {
      id: 'm1',
      role: 'assistant',
      events: [
        { kind: 'text', text: 'hel' },
        { kind: 'text', text: 'lo' },
        { kind: 'text', text: ' world' },
      ],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    const msg = line(lines, 2);
    expect(msg.blocks).toEqual([{ type: 'text', text: 'hello world' }]);
  });

  it('preserves tool_use and tool_result ordering interleaved with text', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', {
      id: 'm1',
      role: 'assistant',
      events: [
        { kind: 'text', text: 'I will read.' },
        { kind: 'tool_use', id: 'tu_1', name: 'Read', input: { path: '/x' } },
        { kind: 'tool_result', toolUseId: 'tu_1', content: 'file contents', isError: false },
        { kind: 'text', text: ' Done.' },
      ],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    expect(line(lines, 2).blocks).toEqual([
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
        { kind: 'status', label: 'streaming' },
        { kind: 'thinking', text: 'reasoning' },
        { kind: 'usage', inputTokens: 5 },
        { kind: 'text', text: 'answer' },
        { kind: 'raw', line: '??' },
      ],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    expect(line(lines, 2).blocks).toEqual([
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
        { kind: 'thinking', text: 'plan' },
        { kind: 'text', text: 'ok' },
        { kind: 'tool_use', id: 't', name: 'X', input: {} },
      ],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    expect(line(lines, 2).blocks).toEqual([
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
        { kind: 'text', text: 'pre' },
        { kind: 'thinking', text: 'mid' },
        { kind: 'text', text: 'post' },
      ],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    expect(line(lines, 2).blocks).toEqual([
      { type: 'text', text: 'pre' },
      { type: 'thinking', thinking: 'mid' },
      { type: 'text', text: 'post' },
    ]);
  });

  it('coalesces consecutive thinking events into one thinking block', () => {
    // A continuous thinking run with no intervening boundary marker
    // produces one block. Boundary-preservation across thinking-start
    // markers is exercised in test #25 below.
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', {
      id: 'm1',
      role: 'assistant',
      events: [
        { kind: 'thinking', text: 'first ' },
        { kind: 'thinking', text: 'second ' },
        { kind: 'thinking', text: 'third' },
        { kind: 'text', text: 'visible' },
      ],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    expect(line(lines, 2).blocks).toEqual([
      { type: 'thinking', thinking: 'first second third' },
      { type: 'text', text: 'visible' },
    ]);
  });

  it('orders multiple conversations chronologically by created_at (regardless of updated_at)', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'older', createdAt: 100, updatedAt: 999, title: 'Older' });
    seedConversation(db, { id: 'newer', createdAt: 200, updatedAt: 200, title: 'Newer' });
    seedMessage(db, 'older', { id: 'm-older', role: 'user', events: [{ kind: 'text', text: 'a' }] });
    seedMessage(db, 'newer', { id: 'm-newer', role: 'user', events: [{ kind: 'text', text: 'b' }] });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    const conversationLines = lines.filter((l) => l.kind === 'conversation');
    expect(conversationLines.map((c) => c.id)).toEqual(['older', 'newer']);
  });

  it('atomic write: leaves no .tmp file at success and does not disturb unrelated tmp files', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', { id: 'm1', role: 'user', events: [{ kind: 'text', text: 'x' }] });

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
    expect(line(lines, 2).id).toBe('m-user');
    expect(line(lines, 2).blocks).toEqual([{ type: 'text', text: 'Make me a landing page.' }]);
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
        { kind: 'text', text: 'final ' },
        { kind: 'text', text: 'coalesced text' },
        { kind: 'tool_use', id: 'tu_1', name: 'Read', input: { path: '/x' } },
      ],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    expect(line(lines, 2).blocks).toEqual([
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

    // Suppress the now-emitted warning so test output stays clean.
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW });
    const lines = readLines(result.path);
    expect(lines).toHaveLength(3); // header + conversation + 1 message
    expect(line(lines, 2).id).toBe('mbad');
    expect(line(lines, 2).blocks).toEqual([]);
  });

  it('rejects unsafe project ids (path-traversal guard from projectDir)', () => {
    const { db, projectsRoot } = setup();
    expect(() =>
      exportProjectTranscript(db, projectsRoot, '../etc', { now: FIXED_NOW }),
    ).toThrow(/invalid project id/);
  });

  // ---------- §1.8 atomic-write failure injection (tests #15-#17) ----------

  it('cleans up tmp file when writeFileSync throws', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', { id: 'm1', role: 'user', events: [{ kind: 'text', text: 'x' }] });

    const realWrite = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementation((p: any, ...rest: any[]) => {
      // Fail only on the transcript tmp write. Other writes (e.g. test
      // fixtures) must continue to work.
      if (typeof p === 'string' && p.includes('.transcript.jsonl.tmp.')) {
        throw new Error('disk full');
      }
      return (realWrite as any)(p, ...rest);
    });

    expect(() =>
      exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }),
    ).toThrow(/disk full/);

    const dirEntries = fs.readdirSync(path.join(projectsRoot, PROJECT_ID));
    expect(dirEntries.filter((n) => n.startsWith('.transcript.jsonl.tmp.'))).toEqual([]);
    expect(dirEntries).not.toContain('.transcript.jsonl');
    // Lock should also have been released.
    expect(dirEntries).not.toContain('.transcript.lock');
  });

  it('cleans up tmp file when fsyncSync throws', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', { id: 'm1', role: 'user', events: [{ kind: 'text', text: 'x' }] });

    vi.spyOn(fs, 'fsyncSync').mockImplementation(() => {
      throw new Error('fsync failed');
    });

    expect(() =>
      exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }),
    ).toThrow(/fsync failed/);

    const dirEntries = fs.readdirSync(path.join(projectsRoot, PROJECT_ID));
    expect(dirEntries.filter((n) => n.startsWith('.transcript.jsonl.tmp.'))).toEqual([]);
    expect(dirEntries).not.toContain('.transcript.jsonl');
    expect(dirEntries).not.toContain('.transcript.lock');
  });

  it('cleans up tmp file when renameSync throws', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', { id: 'm1', role: 'user', events: [{ kind: 'text', text: 'x' }] });

    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename failed');
    });

    expect(() =>
      exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }),
    ).toThrow(/rename failed/);

    const dirEntries = fs.readdirSync(path.join(projectsRoot, PROJECT_ID));
    expect(dirEntries.filter((n) => n.startsWith('.transcript.jsonl.tmp.'))).toEqual([]);
    expect(dirEntries).not.toContain('.transcript.jsonl');
    expect(dirEntries).not.toContain('.transcript.lock');
  });

  // ---------- §1.8 existing-file replacement (test #18) ----------

  it('replaces existing transcript file on second export', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', { id: 'm1', role: 'user', events: [{ kind: 'text', text: 'x' }] });

    // First export.
    const result1 = exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW });
    const finalPath = result1.path;

    // Inject a sentinel — a downstream consumer / older transcript.
    fs.writeFileSync(finalPath, '{"sentinel":true}\n');
    expect(fs.readFileSync(finalPath, 'utf8')).toContain('sentinel');

    // Second export should atomically replace the sentinel.
    exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW });

    const after = fs.readFileSync(finalPath, 'utf8');
    expect(after).not.toContain('sentinel');
    const lines = after.split('\n').filter((l) => l.length > 0).map((l) => JSON.parse(l));
    expect(line(lines, 0).kind).toBe('header');
    expect(line(lines, 2).id).toBe('m1');
  });

  // ---------- §1.5 lock contention (test #19, advisor-redesigned) ----------

  it('throws TranscriptExportLockedError when lock held; succeeds after unlink', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', { id: 'm1', role: 'user', events: [{ kind: 'text', text: 'x' }] });

    const lockPath = path.join(projectsRoot, PROJECT_ID, '.transcript.lock');
    const finalPath = path.join(projectsRoot, PROJECT_ID, '.transcript.jsonl');

    // Pre-create the lock to simulate a concurrent export in flight.
    fs.writeFileSync(lockPath, '');

    expect(() =>
      exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }),
    ).toThrow(TranscriptExportLockedError);
    // No transcript should have been written while the lock was held.
    expect(fs.existsSync(finalPath)).toBe(false);

    // Release the lock — a subsequent export must succeed.
    fs.unlinkSync(lockPath);

    const result = exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW });
    expect(result.path).toBe(finalPath);
    expect(fs.existsSync(finalPath)).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  // ---------- §1.3 parse-warning surface (tests #20-#21) ----------

  it('warns when events_json is malformed JSON and falls back to content', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, events_json, position, created_at)
       VALUES ('mmal', 'c1', 'assistant', 'fallback content', '{not valid', 0, ${Date.now()})`,
    ).run();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW });
    expect(warn).toHaveBeenCalledTimes(1);
    const warning = warn.mock.calls[0]?.[0];
    expect(warning).toContain('mmal');
    expect(warning).toContain(PROJECT_ID);
    expect(warning).toContain('malformed');

    const lines = readLines(result.path);
    expect(line(lines, 2).id).toBe('mmal');
    expect(line(lines, 2).blocks).toEqual([{ type: 'text', text: 'fallback content' }]);
  });

  it('warns when events_json is JSON but not an array', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, events_json, position, created_at)
       VALUES ('mobj', 'c1', 'assistant', 'fallback content', '{"foo":1}', 0, ${Date.now()})`,
    ).run();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW });
    expect(warn).toHaveBeenCalledTimes(1);
    const warning = warn.mock.calls[0]?.[0];
    expect(warning).toContain('mobj');
    expect(warning).toContain('not_array');

    const lines = readLines(result.path);
    expect(line(lines, 2).blocks).toEqual([{ type: 'text', text: 'fallback content' }]);
  });

  // ---------- §1.6 attachments (tests #22-#23) ----------

  it('header carries attachmentCount + commentAttachmentCount totals', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', {
      id: 'm1',
      role: 'user',
      events: [{ kind: 'text', text: 'a' }],
      attachments: [
        { path: 'a.png', name: 'a.png', kind: 'image', size: 100 },
        { path: 'b.png', name: 'b.png', kind: 'image', size: 200 },
      ],
      commentAttachments: [
        {
          id: 'ca1',
          order: 0,
          filePath: 'p.html',
          elementId: 'e1',
          selector: '#x',
          label: 'L',
          comment: 'C',
          currentText: '',
          pagePosition: { x: 0, y: 0 },
          htmlHint: '',
        },
      ],
    });
    seedMessage(db, 'c1', {
      id: 'm2',
      role: 'user',
      events: [{ kind: 'text', text: 'b' }],
      attachments: [{ path: 'c.png', name: 'c.png', kind: 'image' }],
    });

    const result = exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW });
    const lines = readLines(result.path);
    expect(line(lines, 0).attachmentCount).toBe(3);
    expect(line(lines, 0).commentAttachmentCount).toBe(1);
    expect(line(lines, 0).attachmentsInlined).toBe(false);
  });

  it('per-message line carries attachments / commentAttachments only when present', () => {
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', {
      id: 'm-with',
      role: 'user',
      events: [{ kind: 'text', text: 'q' }],
      attachments: [{ path: 'a.png', name: 'a.png', kind: 'image', size: 99 }],
      commentAttachments: [
        {
          id: 'ca1',
          order: 0,
          filePath: 'p.html',
          elementId: 'e1',
          selector: '#x',
          label: 'Lab',
          comment: 'Cmt',
          currentText: '',
          pagePosition: { x: 1, y: 2 },
          htmlHint: '',
        },
      ],
    });
    seedMessage(db, 'c1', {
      id: 'm-bare',
      role: 'user',
      events: [{ kind: 'text', text: 'r' }],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    const withAtt = lines.find((l) => l.id === 'm-with');
    const bare = lines.find((l) => l.id === 'm-bare');
    if (!withAtt) throw new Error('m-with transcript line not found');
    if (!bare) throw new Error('m-bare transcript line not found');

    expect(withAtt.attachments).toEqual([
      { path: 'a.png', name: 'a.png', kind: 'image', size: 99 },
    ]);
    expect(withAtt.commentAttachments).toEqual([
      { id: 'ca1', filePath: 'p.html', label: 'Lab', comment: 'Cmt' },
    ]);
    expect(bare.attachments).toBeUndefined();
    expect(bare.commentAttachments).toBeUndefined();
  });

  // ---------- §1.7 missing project directory (test #24) ----------

  it('creates project directory if it does not exist on disk', () => {
    const { db, projectsRoot } = setup({ skipMkdir: true });
    expect(fs.existsSync(path.join(projectsRoot, PROJECT_ID))).toBe(false);

    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', { id: 'm1', role: 'user', events: [{ kind: 'text', text: 'x' }] });

    const result = exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW });
    expect(fs.existsSync(result.path)).toBe(true);
    const lines = readLines(result.path);
    expect(line(lines, 0).kind).toBe('header');
    expect(line(lines, 2).id).toBe('m1');
  });

  // ---------- Codex P2 (3188524878): thinking-start boundary preservation ----------

  it('flushes thinking accumulator on status thinking-start marker so adjacent segments stay separate', () => {
    // The web translator emits `{ kind: 'status', label: 'thinking' }` at
    // every thinking_start (apps/web/src/providers/daemon.ts:367-369).
    // Two thinking segments separated only by that marker must stay as two
    // blocks; merging them would lose the original boundary and make the
    // transcript non-lossless for synthesis.
    const { db, projectsRoot } = setup();
    seedConversation(db, { id: 'c1', createdAt: 100 });
    seedMessage(db, 'c1', {
      id: 'm1',
      role: 'assistant',
      events: [
        { kind: 'thinking', text: 'a' },
        { kind: 'thinking', text: 'b' },
        { kind: 'status', label: 'thinking' },
        { kind: 'thinking', text: 'c' },
        { kind: 'thinking', text: 'd' },
      ],
    });

    const lines = readLines(exportProjectTranscript(db, projectsRoot, PROJECT_ID, { now: FIXED_NOW }).path);
    expect(line(lines, 2).blocks).toEqual([
      { type: 'thinking', thinking: 'ab' },
      { type: 'thinking', thinking: 'cd' },
    ]);
  });
});
