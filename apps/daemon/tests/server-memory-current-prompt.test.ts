import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from 'prom-client';

// This suite isolates the heuristic request boundary. The actual heuristic,
// extraction records, memory files and HTTP routes are not mocked. Background
// provider inference is a separate pipeline and must not spend provider budget.
vi.mock('../src/memory-llm.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/memory-llm.js')>();
  return { ...actual, extractWithLLM: vi.fn(async () => []), distillAnnotationsToMemory: vi.fn(async () => []) };
});

type Started = { url: string; server: Server; shutdown?: () => Promise<void> | void };
type Extraction = { id: string; kind: string; phase: string; writtenCount?: number; writtenIds?: string[] };
let started: Started | undefined;
let dataDir: string | undefined;
let projectId = '';
let conversationId = '';
const previousDataDir = process.env.OD_DATA_DIR;

async function api<T>(pathname: string, method = 'GET', body?: unknown, status = 200): Promise<T> {
  if (!started) throw new Error('Missing isolated daemon');
  const response = await fetch(`${started.url}${pathname}`, {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const text = await response.text();
  expect(response.status, `${method} ${pathname}: ${text}`).toBe(status);
  return JSON.parse(text) as T;
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'od-memory-current-prompt-'));
  process.env.OD_DATA_DIR = dataDir;
  // Match the existing isolated server suites: module reset does not clear
  // prom-client's process-wide registry. Each case owns new registrations.
  register.clear();
  vi.resetModules();
  const { startServer } = await import('../src/server.js');
  started = await startServer({ port: 0, returnServer: true }) as unknown as Started;
  const cli = join(dataDir, 'controlled-claude.ts');
  await writeFile(cli, `#!/usr/bin/env node
import { writeSync } from 'node:fs';
import { createInterface } from 'node:readline';
if (process.argv.includes('--version')) { console.log('claude 0.0.0-memory-contract'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p --input-format stream-json --output-format stream-json --include-partial-messages'); process.exit(0); }
if (process.argv.includes('auth')) { console.log(JSON.stringify({ loggedIn: true })); process.exit(0); }
if (process.argv.includes('--thinking-display')) { console.error('unknown option --thinking-display'); process.exit(1); }
createInterface({ input: process.stdin }).once('line', () => {
  for (const frame of [
    { type: 'system', subtype: 'init', session_id: 'memory-contract-session', model: 'claude-memory-contract' },
    { type: 'assistant', message: { id: 'memory-contract-reply', role: 'assistant', content: [{ type: 'text', text: 'Lesson prepared.' }], stop_reason: 'end_turn' } },
    { type: 'result', subtype: 'success', is_error: false, result: 'Lesson prepared.', stop_reason: 'end_turn', session_id: 'memory-contract-session' },
  ]) writeSync(1, JSON.stringify(frame) + '\\n');
  process.exit(0);
});
`);
  await chmod(cli, 0o755);
  await api('/api/app-config', 'PUT', {
    agentId: 'claude', agentCliEnv: { claude: { CLAUDE_BIN: cli } }, odNextStrategyMode: 'off',
  });
  await api('/api/memory/config', 'PATCH', { enabled: true, chatExtractionEnabled: true });
  projectId = `memory-current-${randomUUID()}`;
  const created = await api<{ conversationId: string }>('/api/projects', 'POST', {
    id: projectId, name: 'Memory current-turn contract', conversationMode: 'chat', skipDiscoveryBrief: true,
  });
  conversationId = created.conversationId;
  expect(conversationId).toEqual(expect.any(String));
}, 30_000);

afterEach(async () => {
  try {
    await started?.shutdown?.();
    if (started) {
      started.server.closeAllConnections();
      await new Promise<void>(resolve => started!.server.close(() => resolve()));
    }
  } finally {
    started = undefined;
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    dataDir = undefined;
    if (previousDataDir === undefined) delete process.env.OD_DATA_DIR;
    else process.env.OD_DATA_DIR = previousDataDir;
    register.clear();
    vi.resetModules();
  }
}, 30_000);

async function send(message: string, current?: { currentPrompt: string | null }): Promise<void> {
  const created = await api<{ runId: string }>('/api/runs', 'POST', {
    projectId, conversationId, agentId: 'claude', sessionMode: 'chat', message,
    ...current, assistantMessageId: randomUUID(), userMessageId: randomUUID(), clientRequestId: randomUUID(),
  }, 202);
  // Real child completion is the barrier: the pre-spawn heuristic is awaited
  // before this point. Polling observes work completion, not a fixed sleep.
  await vi.waitFor(async () => {
    const run = await api<{ status: string; exitCode: number | null; childExited: boolean }>(`/api/runs/${created.runId}`);
    expect(run).toMatchObject({ status: 'succeeded', exitCode: 0, childExited: true });
  }, { timeout: 10_000, interval: 20 });
}

async function successfulWrites(): Promise<Extraction[]> {
  const { extractions } = await api<{ extractions: Extraction[] }>('/api/memory/extractions');
  return extractions.filter(item => item.kind === 'heuristic' && item.phase === 'success' && (item.writtenCount ?? 0) > 0);
}

async function memoryState(): Promise<unknown> {
  const { entries } = await api<{ entries: unknown[] }>('/api/memory');
  return entries;
}

describe('heuristic memory extraction uses the current user turn, not replayed transcript', () => {
  it.each(['Prepare the next lesson.', ''])('does not rewrite or offer a second notification for old Remember when currentPrompt is %j', async currentPrompt => {
    const first = 'Remember: use forest green for lesson headings';
    await send(first, { currentPrompt: first });
    const initialRecords = await successfulWrites();
    expect(initialRecords).toHaveLength(1);
    expect(initialRecords[0]?.writtenIds).toHaveLength(1);
    const before = await memoryState();
    const transcript = `## user\n${first}\n\n## assistant\nLesson prepared.\n\n## user\n${currentPrompt}`;
    await send(transcript, { currentPrompt });
    // These are the exact successful/written records the notification hook
    // consumes. No additional record may reannounce the old preference.
    expect(await successfulWrites()).toEqual(initialRecords);
    expect(await memoryState()).toEqual(before);
  });

  it('keeps the legacy message-only client extraction contract', async () => {
    await send('Remember: use ocean blue for report headings');
    expect(await successfulWrites()).toEqual([
      expect.objectContaining({ kind: 'heuristic', phase: 'success', writtenCount: 1, writtenIds: [expect.any(String)] }),
    ]);
  });

  it('extracts a new explicit current preference instead of the first Remember in history', async () => {
    const oldPreference = 'Remember: use forest green for lesson headings';
    await send(oldPreference, { currentPrompt: oldPreference });
    const initial = await successfulWrites();
    expect(initial).toHaveLength(1);
    const currentPrompt = 'Remember: use ocean blue for report headings';
    await send(`## user\n${oldPreference}\n\n## assistant\nNoted.\n\n## user\n${currentPrompt}`, { currentPrompt });
    const records = await successfulWrites();
    expect(records).toHaveLength(2);
    const newRecord = records.find(record => record.id !== initial[0]?.id);
    expect(newRecord?.writtenCount).toBe(1);
    expect(newRecord?.writtenIds).toHaveLength(1);
    expect(newRecord?.writtenIds?.[0]).not.toBe(initial[0]?.writtenIds?.[0]);
    const { entries } = await api<{ entries: Array<{ id: string }> }>('/api/memory');
    expect(entries.map(entry => entry.id)).toEqual(expect.arrayContaining([
      initial[0]?.writtenIds?.[0], newRecord?.writtenIds?.[0],
    ]));
  });
});


describe('explicit absent-text HTTP input boundary', () => {
  it('does not recover historical Remember from message when currentPrompt is explicitly null', async () => {
    // ChatRequest's typed caller surface uses optional string, but the public
    // JSON route accepts null without deleting the key. Existing exact-input
    // resolution treats any explicitly present non-string as absent text.
    const first = 'Remember: use forest green for lesson headings';
    await send(first, { currentPrompt: first });
    const initialRecords = await successfulWrites();
    expect(initialRecords).toHaveLength(1);
    const before = await memoryState();
    await send(`## user\n${first}\n\n## assistant\nLesson prepared.`, { currentPrompt: null });
    expect(await successfulWrites()).toEqual(initialRecords);
    expect(await memoryState()).toEqual(before);
  });
});

describe('background memory extraction current-turn request contract', () => {
  it('passes only the latest user prompt to the background extractor after a prior Remember turn', async () => {
    const { extractWithLLM } = await import('../src/memory-llm.js');
    const background = vi.mocked(extractWithLLM);
    background.mockClear();
    const first = 'Remember: use forest green for lesson headings';
    await send(first, { currentPrompt: first });
    await vi.waitFor(() => expect(background).toHaveBeenCalledTimes(1));
    background.mockClear();

    const currentPrompt = 'Prepare the next lesson.';
    const message = `## user\n${first}\n\n## assistant\nLesson prepared.\n\n## user\n${currentPrompt}`;
    await send(message, { currentPrompt });
    // Observe the actual server child-close consumer boundary, not a duplicated
    // prompt selector. Provider inference alone is mocked in this suite.
    await vi.waitFor(() => expect(background).toHaveBeenCalledTimes(1));
    expect(background).toHaveBeenLastCalledWith(
      expect.any(String),
      { userMessage: currentPrompt, assistantMessage: 'Lesson prepared.' },
      expect.objectContaining({ conversationId }),
    );
  });
});
