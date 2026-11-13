import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { buildAutomaticDiagnostics } from '@open-design/diagnostics';
import { buildAutomaticDiagnosticSources, createDiagnosticsExportHandler } from '../src/diagnostics-export.js';

// Claude Code and Codex keep their own record of a session (main agent and
// subagents) as JSONL next to their config, not as `*.log` files. A run's
// bundle has to carry that record, or a failure inside the CLI leaves only the
// daemon's view of the stream.

let root: string;
const saved = { claude: process.env.CLAUDE_CONFIG_DIR, codex: process.env.CODEX_HOME };
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'agent-sessions-'));
  process.env.CLAUDE_CONFIG_DIR = join(root, 'claude');
  process.env.CODEX_HOME = join(root, 'codex');
});
afterEach(async () => {
  for (const [key, value] of [['CLAUDE_CONFIG_DIR', saved.claude], ['CODEX_HOME', saved.codex]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await rm(root, { recursive: true, force: true });
});

const RUN_START = Date.parse('2026-10-01T10:00:00.000Z');
const RUN_END = Date.parse('2026-10-01T10:05:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const jsonl = (records: unknown[]) => `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;

async function write(path: string, text: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, text);
}

async function writeRun(runId: string, sessionId: string): Promise<void> {
  await write(join(root, 'runs', runId, 'events.jsonl'), jsonl([
    { id: 1, event: 'start', data: {}, timestamp: RUN_START },
    { id: 2, event: 'agent', data: { type: 'status', label: 'initializing', sessionId }, timestamp: RUN_START + 1_000 },
    { id: 3, event: 'end', data: { status: 'failed' }, timestamp: RUN_END },
  ]));
}

const options = () => ({ runtime: null, projectRoot: root, runsDir: join(root, 'runs'), dataDir: join(root, 'data') });

const CLAUDE_SESSION = '88e40a8b-b929-4fd5-a245-24f45b1ecffc';
async function writeClaudeSession(): Promise<void> {
  const project = join(root, 'claude', 'projects', '-Users-me-project');
  await write(join(project, `${CLAUDE_SESSION}.jsonl`), jsonl([
    { type: 'user', sessionId: CLAUDE_SESSION, timestamp: iso(RUN_START - 3_600_000), message: { content: 'earlier turn' } },
    { type: 'user', sessionId: CLAUDE_SESSION, timestamp: iso(RUN_START + 2_000), message: { content: 'this turn' } },
    { type: 'assistant', sessionId: CLAUDE_SESSION, timestamp: iso(RUN_START + 60_000), message: { content: 'API Error: overloaded' } },
  ]));
  await write(join(project, CLAUDE_SESSION, 'subagents', 'agent-a1.jsonl'), jsonl([
    { isSidechain: true, agentId: 'a1', type: 'user', message: { content: 'subagent prompt' } },
    { isSidechain: true, agentId: 'a1', type: 'assistant', timestamp: iso(RUN_START + 30_000), message: { content: 'subagent stalled' } },
  ]));
  await write(join(root, 'claude', 'projects', '-Users-me-other', 'unrelated.jsonl'), jsonl([{ type: 'user', timestamp: iso(RUN_START), message: { content: 'not this run' } }]));
}

const CODEX_THREAD = '01a0e7ac-3212-7962-bb84-b42c6648cf73';
const CODEX_CHILD = '01a0e850-eee0-7760-9848-67822ef2c860';
async function writeCodexSession(): Promise<void> {
  const day = join(root, 'codex', 'sessions', '2026', '10', '01');
  await write(join(day, `rollout-2026-10-01T10-00-01-${CODEX_THREAD}.jsonl`), jsonl([
    { timestamp: iso(RUN_START + 1_000), type: 'session_meta', payload: { id: CODEX_THREAD, session_id: CODEX_THREAD } },
    { timestamp: iso(RUN_START + 90_000), type: 'event_msg', payload: { type: 'error', message: 'stream disconnected before completion' } },
  ]));
  await write(join(day, `rollout-2026-10-01T10-01-00-${CODEX_CHILD}.jsonl`), jsonl([
    { timestamp: iso(RUN_START + 60_000), type: 'session_meta', payload: { id: CODEX_CHILD, session_id: CODEX_THREAD, parent_thread_id: CODEX_THREAD, thread_source: 'subagent' } },
    { timestamp: iso(RUN_START + 70_000), type: 'event_msg', payload: { type: 'agent_message', message: 'child agent output' } },
  ]));
  await write(join(day, 'rollout-2026-10-01T10-02-00-01a0eeee-0000-7000-8000-000000000000.jsonl'), jsonl([
    { timestamp: iso(RUN_START + 120_000), type: 'session_meta', payload: { id: '01a0eeee-0000-7000-8000-000000000000', session_id: '01a0eeee-0000-7000-8000-000000000000' } },
  ]));
}

it('collects the run\'s Claude Code session and its subagents, limited to the run', async () => {
  await writeRun('run-claude', CLAUDE_SESSION);
  await writeClaudeSession();
  const sources = await buildAutomaticDiagnosticSources(options(), { runId: 'run-claude', agentId: 'claude' });
  const sessions = sources.filter((s) => s.name.startsWith('agent-sessions/claude/'));
  expect(sessions.map((s) => s.name).sort()).toEqual([
    `agent-sessions/claude/${CLAUDE_SESSION}.jsonl`,
    `agent-sessions/claude/${CLAUDE_SESSION}/subagents/agent-a1.jsonl`,
  ]);
  const main = sessions.find((s) => s.name.endsWith(`${CLAUDE_SESSION}.jsonl`))!;
  const kept = await main.render!(null);
  expect(kept).toContain('this turn');
  expect(kept).toContain('API Error: overloaded');
  expect(kept).not.toContain('earlier turn');
  const sub = sessions.find((s) => s.name.includes('subagents'))!;
  const subKept = await sub.render!(null);
  expect(subKept).toContain('subagent prompt');
  expect(subKept).toContain('subagent stalled');
});

it('collects the run\'s Codex rollout and the subagent threads it spawned', async () => {
  await writeRun('run-codex', CODEX_THREAD);
  await writeCodexSession();
  const sources = await buildAutomaticDiagnosticSources(options(), { runId: 'run-codex', agentId: 'codex' });
  expect(sources.filter((s) => s.name.startsWith('agent-sessions/codex/')).map((s) => s.name).sort()).toEqual([
    `agent-sessions/codex/rollout-2026-10-01T10-00-01-${CODEX_THREAD}.jsonl`,
    `agent-sessions/codex/rollout-2026-10-01T10-01-00-${CODEX_CHILD}.jsonl`,
  ]);
});

it('says why a run\'s agent session is missing instead of dropping it silently', async () => {
  await writeRun('run-gone', CLAUDE_SESSION);
  const sources = await buildAutomaticDiagnosticSources(options(), { runId: 'run-gone', agentId: 'claude' });
  expect(sources.filter((s) => s.name.startsWith('agent-sessions/claude')).map((s) => [s.name, s.omitReason]))
    .toEqual([['agent-sessions/claude', 'source_not_located']]);
});

it('puts the native sessions of exported runs into the manual diagnostics ZIP', async () => {
  await writeRun('run-claude', CLAUDE_SESSION);
  await writeClaudeSession();
  await writeRun('run-codex', CODEX_THREAD);
  await writeCodexSession();
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
  const names = Object.keys(zip.files);
  expect(names).toContain(`agent-sessions/claude/${CLAUDE_SESSION}.jsonl`);
  expect(names).toContain(`agent-sessions/claude/${CLAUDE_SESSION}/subagents/agent-a1.jsonl`);
  expect(names).toContain(`agent-sessions/codex/rollout-2026-10-01T10-01-00-${CODEX_CHILD}.jsonl`);
  expect(names.some((name) => name.includes('unrelated'))).toBe(false);
});

// A session file is read through a byte cap. Select the run's records first,
// then cap: a run that writes more than the cap after its first failure, or
// ends with one huge tool result, must still carry that failure and a stub.
async function writeBigClaudeSession(): Promise<void> {
  const project = join(root, 'claude', 'projects', '-Users-me-project');
  const records: unknown[] = [
    { type: 'user', sessionId: CLAUDE_SESSION, timestamp: iso(RUN_START - 3_600_000), message: { content: 'earlier turn' } },
    { type: 'assistant', sessionId: CLAUDE_SESSION, timestamp: iso(RUN_START + 2_000), message: { content: 'EARLY FAILURE: overloaded' } },
  ];
  for (let i = 0; i < 50; i++) {
    records.push({ type: 'assistant', sessionId: CLAUDE_SESSION, timestamp: iso(RUN_START + 3_000 + i), message: { content: 'y'.repeat(100 * 1024) } });
  }
  records.push({ type: 'user', sessionId: CLAUDE_SESSION, timestamp: iso(RUN_START + 100_000), toolUseResult: 'z'.repeat(5 * 1024 * 1024) });
  await write(join(project, `${CLAUDE_SESSION}.jsonl`), jsonl(records));
}

async function bundleText(sources: Awaited<ReturnType<typeof buildAutomaticDiagnosticSources>>): Promise<string> {
  const { gunzipSync } = await import('node:zlib');
  const { readFile } = await import('node:fs/promises');
  const directory = join(root, 'bundle', String(Math.random()).slice(2));
  const result = await buildAutomaticDiagnostics({ directory, incidentId: 'inc', summary: {}, sources });
  const chunks = await Promise.all(result.manifest.chunks.map((c) => readFile(join(directory, String(c.index)))));
  return gunzipSync(Buffer.concat(chunks)).toString();
}

it('keeps an early failure and stubs a huge line when a session outgrows the cap (automatic)', async () => {
  await writeRun('run-big', CLAUDE_SESSION);
  await writeBigClaudeSession();
  const sources = await buildAutomaticDiagnosticSources(options(), { runId: 'run-big', agentId: 'claude' });
  const text = await bundleText(sources.filter((s) => s.name === `agent-sessions/claude/${CLAUDE_SESSION}.jsonl`));
  expect(text).toContain('EARLY FAILURE: overloaded');
  expect(text).toMatch(/\\"truncated\\":\s*true/);
  expect(text).not.toContain('earlier turn');
});

it('keeps an early failure and stubs a huge line when a session outgrows the cap (manual ZIP)', async () => {
  await writeRun('run-big', CLAUDE_SESSION);
  await writeBigClaudeSession();
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
  const entry = await zip.file(`agent-sessions/claude/${CLAUDE_SESSION}.jsonl`)!.async('string');
  expect(entry).toContain('EARLY FAILURE: overloaded');
  expect(entry).toContain('"truncated":true');
  expect(entry).not.toContain('earlier turn');
});

// A resumed conversation is one native session file shared by several runs.
// Exporting those runs must keep each run's records, not only the newest one's.
it('keeps every exported run\'s records when the runs resume the same native session', async () => {
  const LATER = RUN_START + 2 * 3_600_000;
  await writeRun('run-first', CLAUDE_SESSION);
  await write(join(root, 'runs', 'run-later', 'events.jsonl'), jsonl([
    { id: 1, event: 'start', data: {}, timestamp: LATER },
    { id: 2, event: 'agent', data: { type: 'status', label: 'initializing', sessionId: CLAUDE_SESSION }, timestamp: LATER + 1_000 },
    { id: 3, event: 'end', data: { status: 'failed' }, timestamp: LATER + 300_000 },
  ]));
  await write(join(root, 'claude', 'projects', '-Users-me-project', `${CLAUDE_SESSION}.jsonl`), jsonl([
    { type: 'assistant', sessionId: CLAUDE_SESSION, timestamp: iso(RUN_START + 60_000), message: { content: 'FIRST RUN FAILURE' } },
    { type: 'user', sessionId: CLAUDE_SESSION, timestamp: iso(RUN_START + 3_600_000), message: { content: 'between the runs' } },
    { type: 'assistant', sessionId: CLAUDE_SESSION, timestamp: iso(LATER + 60_000), message: { content: 'LATER RUN FAILURE' } },
  ]));
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
  const entries = Object.keys(zip.files).filter((name) => name.startsWith(`agent-sessions/claude/${CLAUDE_SESSION}`));
  expect(entries).toEqual([`agent-sessions/claude/${CLAUDE_SESSION}.jsonl`]);
  const entry = await zip.file(entries[0]!)!.async('string');
  expect(entry).toContain('FIRST RUN FAILURE');
  expect(entry).toContain('LATER RUN FAILURE');
  expect(entry).not.toContain('between the runs');
  expect(entry.indexOf('FIRST RUN FAILURE')).toBeLessThan(entry.indexOf('LATER RUN FAILURE'));
});
