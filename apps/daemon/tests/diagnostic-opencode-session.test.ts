import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import JSZip from 'jszip';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { buildAutomaticDiagnostics } from '@open-design/diagnostics';
import { buildAutomaticDiagnosticSources, createDiagnosticsExportHandler } from '../src/diagnostics-export.js';
import { DiagnosticConsentFence } from '../src/services/diagnostic-consent.js';

// OpenCode 1.x keeps sessions (and the child sessions its task tool spawns) in
// one SQLite database, opencode.db, not in per-session files. A run's bundle
// has to export that session's rows, limited to the run and to what was
// written after the user agreed to automatic uploads.

let root: string;
const savedXdg = process.env.XDG_DATA_HOME;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'opencode-session-'));
  process.env.XDG_DATA_HOME = join(root, 'xdg');
});
afterEach(async () => {
  if (savedXdg === undefined) delete process.env.XDG_DATA_HOME; else process.env.XDG_DATA_HOME = savedXdg;
  await rm(root, { recursive: true, force: true });
});

const RUN_START = Date.parse('2026-10-01T10:00:00.000Z');
const RUN_END = Date.parse('2026-10-01T10:05:00.000Z');
const SESSION = 'ses_2a1f0c3d4e5f6a7b8c9d';
const CHILD = 'ses_child00000000000001';
const OTHER = 'ses_other00000000000002';

async function writeRun(runId: string): Promise<void> {
  await mkdir(join(root, 'runs', runId), { recursive: true });
  await writeFile(join(root, 'runs', runId, 'events.jsonl'), [
    { id: 1, event: 'start', data: {}, timestamp: RUN_START },
    { id: 2, event: 'agent', data: { type: 'status', label: 'running', sessionId: SESSION }, timestamp: RUN_START + 500 },
    { id: 3, event: 'end', data: { status: 'failed' }, timestamp: RUN_END },
  ].map((record) => JSON.stringify(record)).join('\n') + '\n');
}

async function writeOpenCodeDb(): Promise<void> {
  const dir = join(root, 'xdg', 'opencode');
  await mkdir(dir, { recursive: true });
  const db = new Database(join(dir, 'opencode.db'));
  db.exec(`
    CREATE TABLE session (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, time_created INTEGER, time_updated INTEGER);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
    CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, time_updated INTEGER, data TEXT);
  `);
  const session = db.prepare('INSERT INTO session VALUES (?, ?, ?, ?, ?)');
  session.run(SESSION, null, 'main', RUN_START - 86_400_000, RUN_END);
  session.run(CHILD, SESSION, 'explore subagent', RUN_START + 30_000, RUN_END);
  session.run(OTHER, null, 'unrelated', RUN_START, RUN_END);
  const message = db.prepare('INSERT INTO message VALUES (?, ?, ?, ?, ?)');
  message.run('msg_old', SESSION, RUN_START - 3_600_000, RUN_START - 3_600_000, JSON.stringify({ role: 'user', text: 'earlier turn' }));
  message.run('msg_new', SESSION, RUN_START + 1_000, RUN_START + 1_000, JSON.stringify({ role: 'user', text: 'this turn' }));
  message.run('msg_child', CHILD, RUN_START + 40_000, RUN_START + 40_000, JSON.stringify({ role: 'assistant', text: 'child agent output' }));
  message.run('msg_other', OTHER, RUN_START + 2_000, RUN_START + 2_000, JSON.stringify({ role: 'user', text: 'not this run' }));
  const part = db.prepare('INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)');
  part.run('prt_err', 'msg_new', SESSION, RUN_START + 90_000, RUN_START + 90_000, JSON.stringify({ type: 'tool', state: { status: 'error', error: 'APIError: Provider returned error' } }));
  db.close();
}

const options = () => ({ runtime: null, projectRoot: root, runsDir: join(root, 'runs'), dataDir: join(root, 'data') });

async function bundleText(sources: Awaited<ReturnType<typeof buildAutomaticDiagnosticSources>>): Promise<string> {
  const { gunzipSync } = await import('node:zlib');
  const { readFile } = await import('node:fs/promises');
  const directory = join(root, 'bundle', String(Math.random()).slice(2));
  const result = await buildAutomaticDiagnostics({ directory, incidentId: 'inc', summary: {}, sources });
  const chunks = await Promise.all(result.manifest.chunks.map((c) => readFile(join(directory, String(c.index)))));
  return gunzipSync(Buffer.concat(chunks)).toString();
}

it('exports the run\'s OpenCode session and its child sessions from opencode.db, limited to the run', async () => {
  await writeRun('run-oc');
  await writeOpenCodeDb();
  const sources = await buildAutomaticDiagnosticSources(options(), { runId: 'run-oc', agentId: 'opencode' });
  const session = sources.find((s) => s.name === `agent-sessions/opencode/${SESSION}.jsonl`);
  expect(session?.omitReason).toBeUndefined();
  const text = await bundleText(sources.filter((s) => s.name.startsWith('agent-sessions/opencode')));
  expect(text).toContain('this turn');
  expect(text).toContain('child agent output');
  expect(text).toContain('Provider returned error');
  expect(text).not.toContain('earlier turn');
  expect(text).not.toContain('not this run');
});

it('leaves out OpenCode rows written before the user agreed to automatic uploads', async () => {
  await writeRun('run-oc');
  await writeOpenCodeDb();
  const sources = await buildAutomaticDiagnosticSources(options(), { runId: 'run-oc', agentId: 'opencode' });
  const fenceDir = join(root, 'fence');
  await mkdir(fenceDir, { recursive: true });
  // Consent given 30 s into the run: only rows from then on may leave the machine.
  await writeFile(join(fenceDir, 'consent.json'), JSON.stringify({ enabled: true, since: RUN_START + 30_000, offsets: {} }));
  const fenced = await new DiagnosticConsentFence(fenceDir, true).apply(sources.filter((s) => !s.omitReason));
  const text = await bundleText(fenced);
  expect(text).toContain('child agent output');
  expect(text).not.toContain('this turn');
});

it('says why an OpenCode session is missing instead of dropping it silently', async () => {
  await writeRun('run-oc');
  const sources = await buildAutomaticDiagnosticSources(options(), { runId: 'run-oc', agentId: 'opencode' });
  expect(sources.filter((s) => s.name.startsWith('agent-sessions/opencode')).map((s) => [s.name, s.omitReason]))
    .toEqual([['agent-sessions/opencode', 'source_not_located']]);
});

it('puts the OpenCode session of an exported run into the manual diagnostics ZIP', async () => {
  await writeRun('run-oc');
  await writeOpenCodeDb();
  const handler = createDiagnosticsExportHandler({ ...options() });
  const res: { capturedStatus?: number; capturedPayload?: Buffer } & Record<string, unknown> = {};
  Object.assign(res, {
    status(code: number) { res.capturedStatus = code; return res; },
    setHeader() { return res; },
    end(payload: Buffer) { res.capturedPayload = payload; },
    json() { return res; },
  });
  await handler({} as never, res as never, () => undefined);
  expect(res.capturedStatus).toBe(200);
  const zip = await JSZip.loadAsync(res.capturedPayload!);
  const entry = zip.file(`agent-sessions/opencode/${SESSION}.jsonl`);
  expect(entry).not.toBeNull();
  const text = await entry!.async('string');
  expect(text).toContain('child agent output');
  expect(text).not.toContain('not this run');
});

it('keeps an OpenCode failure that comes after 16 MiB of run events', async () => {
  // A large tool result can push events.jsonl past the old 16 MiB scan; the
  // run's end, and the session rows written near it, must still count.
  const lateEnd = RUN_START + 20 * 60_000;
  const runDir = join(root, 'runs', 'run-big');
  await mkdir(runDir, { recursive: true });
  const events = join(runDir, 'events.jsonl');
  await writeFile(events, [
    { id: 1, event: 'start', data: {}, timestamp: RUN_START },
    { id: 2, event: 'agent', data: { type: 'status', label: 'running', sessionId: SESSION }, timestamp: RUN_START + 500 },
  ].map((record) => JSON.stringify(record)).join('\n') + '\n');
  for (let i = 0; i < 17; i++) {
    await appendFile(events, JSON.stringify({ id: 10 + i, event: 'agent', data: { type: 'text_delta', delta: 'x'.repeat(1024 * 1024) }, timestamp: RUN_START + 1_000 + i }) + '\n');
  }
  await appendFile(events, JSON.stringify({ id: 99, event: 'end', data: { status: 'failed' }, timestamp: lateEnd }) + '\n');
  await writeOpenCodeDb();
  const db = new Database(join(root, 'xdg', 'opencode', 'opencode.db'));
  db.prepare('INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)').run('prt_late', 'msg_new', SESSION, lateEnd - 60_000, lateEnd - 60_000,
    JSON.stringify({ type: 'tool', state: { status: 'error', error: 'late provider failure' } }));
  db.close();

  const sources = await buildAutomaticDiagnosticSources(options(), { runId: 'run-big', agentId: 'opencode' });
  const text = await bundleText(sources.filter((s) => s.name.startsWith('agent-sessions/opencode')));
  expect(text).toContain('late provider failure');
});

it('keeps every exported run\'s rows when the runs resume the same OpenCode session', async () => {
  const later = RUN_START + 2 * 3_600_000;
  await writeRun('run-oc');
  await mkdir(join(root, 'runs', 'run-oc-later'), { recursive: true });
  await writeFile(join(root, 'runs', 'run-oc-later', 'events.jsonl'), [
    { id: 1, event: 'start', data: {}, timestamp: later },
    { id: 2, event: 'agent', data: { type: 'status', label: 'running', sessionId: SESSION }, timestamp: later + 500 },
    { id: 3, event: 'end', data: { status: 'failed' }, timestamp: later + 300_000 },
  ].map((record) => JSON.stringify(record)).join('\n') + '\n');
  await writeOpenCodeDb();
  const db = new Database(join(root, 'xdg', 'opencode', 'opencode.db'));
  db.prepare('INSERT INTO message VALUES (?, ?, ?, ?, ?)').run('msg_between', SESSION, RUN_START + 3_600_000, RUN_START + 3_600_000,
    JSON.stringify({ role: 'user', text: 'between the runs' }));
  db.prepare('INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)').run('prt_later', 'msg_new', SESSION, later + 60_000, later + 60_000,
    JSON.stringify({ type: 'tool', state: { status: 'error', error: 'later run failure' } }));
  db.close();

  const handler = createDiagnosticsExportHandler({ ...options() });
  const res: { capturedStatus?: number; capturedPayload?: Buffer } & Record<string, unknown> = {};
  Object.assign(res, {
    status(code: number) { res.capturedStatus = code; return res; },
    setHeader() { return res; },
    end(payload: Buffer) { res.capturedPayload = payload; },
    json() { return res; },
  });
  await handler({} as never, res as never, () => undefined);
  expect(res.capturedStatus).toBe(200);
  const zip = await JSZip.loadAsync(res.capturedPayload!);
  const text = await zip.file(`agent-sessions/opencode/${SESSION}.jsonl`)!.async('string');
  expect(text).toContain('Provider returned error');
  expect(text).toContain('later run failure');
  expect(text).not.toContain('between the runs');
});
