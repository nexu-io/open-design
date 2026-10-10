import { appendFile, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { buildAutomaticDiagnosticSources, selectAmrRuntimeRunLines } from '../src/diagnostics-export.js';
import { DiagnosticConsentFence } from '../src/services/diagnostic-consent.js';

const line = (record: Record<string, unknown>) => JSON.stringify({ ts: '2026-09-28T00:00:00Z', ...record });

it('selects the run and the OpenCode sessions it owns until another run takes one over', () => {
  const lines = [
    line({ event: 'opencode_session_created', opencodeSessionId: 'ses_other', openDesignRunId: 'run-b' }),
    line({ event: 'opencode_session_created', opencodeSessionId: 'ses_1', openDesignRunId: 'run-a' }),
    line({ event: 'opencode_event_stream_failure', opencodeSessionId: 'ses_1', errorMessage: 'stream reset' }),
    line({ event: 'opencode_event_stream_failure', opencodeSessionId: 'ses_other', errorMessage: 'not mine' }),
    line({ event: 'opencode_session_created', opencodeSessionId: 'ses_1', openDesignRunId: 'run-c' }),
    line({ event: 'opencode_event_stream_failure', opencodeSessionId: 'ses_1', errorMessage: 'later run' }),
    'not json',
  ];
  const selected = selectAmrRuntimeRunLines('run-a')(lines).join('\n');
  expect(selected).toContain('stream reset');
  expect(selected).not.toContain('not mine');
  expect(selected).not.toContain('later run');
  expect(selected).not.toContain('run-b');
});

let root: string;
const priorAmrHome = process.env.AMR_HOME;
beforeEach(async () => { root = await realpath(await mkdtemp(join(tmpdir(), 'amr-runtime-'))); process.env.AMR_HOME = join(root, 'amr'); });
afterEach(async () => {
  if (priorAmrHome === undefined) delete process.env.AMR_HOME; else process.env.AMR_HOME = priorAmrHome;
  await rm(root, { recursive: true, force: true });
});

it('collects the AMR runtime log for a run and reports AMR sources it cannot find', async () => {
  const options = { runtime: null, projectRoot: root, runsDir: join(root, 'runs'), dataDir: join(root, 'data') };
  const missing = await buildAutomaticDiagnosticSources(options, { runId: 'run-a', agentId: 'amr' });
  expect(missing.filter((s) => s.name.startsWith('agent-cli-logs/amr/')).map((s) => [s.name, s.omitReason])).toEqual([
    ['agent-cli-logs/amr/agent-runtime.jsonl', 'source_not_found'],
    ['agent-cli-logs/amr/opencode', 'source_not_located'],
  ]);
  await mkdir(join(root, 'amr', 'logs'), { recursive: true });
  await writeFile(join(root, 'amr', 'logs', 'agent-runtime.jsonl'), `${line({ event: 'opencode_session_created', opencodeSessionId: 'ses_1', openDesignRunId: 'run-a' })}\n`);
  const found = await buildAutomaticDiagnosticSources(options, { runId: 'run-a', agentId: 'amr' });
  const runtime = found.find((s) => s.name === 'agent-cli-logs/amr/agent-runtime.jsonl')!;
  expect(runtime.omitReason).toBeUndefined();
  expect(runtime.selectLines).toBeTypeOf('function');
  const baseline = await buildAutomaticDiagnosticSources(options, { agentId: '*' });
  expect(baseline.find((s) => s.name === 'agent-cli-logs/amr/agent-runtime.jsonl')).toMatchObject({ kind: 'text' });
  expect(baseline.some((s) => s.omitReason)).toBe(false);
});

it('gives a source added after opting in a boundary instead of omitting it forever', async () => {
  const fence = new DiagnosticConsentFence(root, true);
  await fence.baseline([]);
  const log = join(root, 'agent-runtime.jsonl');
  await writeFile(log, 'written before this source was known\n');
  const size = (await stat(log)).size;
  // Pretend the file predates the consent boundary, as a shared runtime log does after an upgrade.
  const reopened = new DiagnosticConsentFence(root, true);
  (reopened as unknown as { state: { since: number } }).state.since = Date.now() + 60_000;
  const source = { name: 'agent-cli-logs/amr/agent-runtime.jsonl', absolutePath: log, kind: 'text' as const };
  expect((await reopened.apply([source]))[0]).toMatchObject({ omitReason: 'pre_consent_source' });
  await reopened.extend([source]);
  expect((await reopened.apply([source]))[0]).toMatchObject({ startOffset: size });
});

it('does not move the boundary of a rotated log that is already baselined under its old path', async () => {
  const latest = join(root, 'latest.log'); const previous = join(root, 'previous.log');
  await writeFile(latest, 'before the boundary\n');
  const fence = new DiagnosticConsentFence(root, true);
  await fence.baseline([{ name: 'logs/daemon/latest.log', absolutePath: latest, kind: 'text' }]);
  await appendFile(latest, 'after the boundary\n');
  await rename(latest, previous);
  const restarted = new DiagnosticConsentFence(root, true);
  (restarted as unknown as { state: { since: number } }).state.since = Date.now() + 60_000;
  const source = { name: 'logs/daemon/previous.log', absolutePath: previous, kind: 'text' as const };
  await restarted.extend([source]);
  const persisted = JSON.parse(await readFile(join(root, 'consent.json'), 'utf8')) as { offsets: Record<string, unknown> };
  expect(persisted.offsets[previous]).toBeUndefined();
});

// OpenCode's own log lives under a per-conversation home the daemon cannot
// derive; Vela's session records name it (opencodeLogPath), for a new and a
// resumed session alike. The bundle takes the incident run's part of it.
async function writeRuntimeLog(records: Record<string, unknown>[]): Promise<void> {
  await mkdir(join(root, 'amr', 'logs'), { recursive: true });
  await writeFile(join(root, 'amr', 'logs', 'agent-runtime.jsonl'), `${records.map(line).join('\n')}\n`);
}
const conversationLog = (name: string) => join(root, 'amr', 'opencode-sessions', name, 'data', 'opencode', 'log', 'opencode.log');
async function writeConversationLog(name: string, text = 'timestamp=2026-09-30T00:00:00.000Z level=INFO message=x\n'): Promise<void> {
  await mkdir(join(root, 'amr', 'opencode-sessions', name, 'data', 'opencode', 'log'), { recursive: true });
  await writeFile(conversationLog(name), text);
}

it('collects the OpenCode log the run\'s session record names, instead of reporting it unlocated', async () => {
  const options = { runtime: null, projectRoot: root, runsDir: join(root, 'runs'), dataDir: join(root, 'data') };
  await writeRuntimeLog([
    { event: 'opencode_session_created', opencodeSessionId: 'ses_b', openDesignRunId: 'run-b', opencodeLogPath: conversationLog('other') },
    { event: 'opencode_session_loaded', opencodeSessionId: 'ses_a', openDesignRunId: 'run-a', opencodeLogPath: conversationLog('mine'), ts: '2026-09-30T01:00:00.000Z' },
  ]);
  await writeConversationLog('mine');
  await writeConversationLog('other');
  const sources = await buildAutomaticDiagnosticSources(options, { runId: 'run-a', agentId: 'amr' });
  const amr = sources.filter((s) => s.name.startsWith('agent-cli-logs/amr/'));
  expect(amr.map((s) => s.name)).toEqual(['agent-cli-logs/amr/agent-runtime.jsonl', 'agent-cli-logs/amr/opencode.log']);
  const opencode = amr.find((s) => s.name === 'agent-cli-logs/amr/opencode.log')!;
  expect(opencode.absolutePath).toBe(conversationLog('mine'));
  expect(opencode.selectLines).toBeTypeOf('function');
});

it('keeps only the lines of the run\'s window from a conversation\'s shared OpenCode log', async () => {
  const options = { runtime: null, projectRoot: root, runsDir: join(root, 'runs'), dataDir: join(root, 'data') };
  await writeRuntimeLog([
    { event: 'opencode_session_loaded', opencodeSessionId: 'ses_a', openDesignRunId: 'run-a', opencodeLogPath: conversationLog('mine'), ts: '2026-09-30T01:00:00.000Z' },
  ]);
  await writeConversationLog('mine');
  const source = (await buildAutomaticDiagnosticSources(options, { runId: 'run-a', agentId: 'amr' }))
    .find((s) => s.name === 'agent-cli-logs/amr/opencode.log')!;
  const selected = source.selectLines!([
    'timestamp=2026-09-30T00:10:00.000Z level=INFO message="earlier turn"',
    '  earlier continuation',
    'timestamp=2026-09-30T01:00:03.000Z level=INFO message="this turn"',
    '  this continuation',
    'timestamp=2026-09-30T01:02:00.000Z level=ERROR message="stream error"',
  ]).join('\n');
  expect(selected).not.toContain('earlier');
  expect(selected).toContain('this turn');
  expect(selected).toContain('this continuation');
  expect(selected).toContain('stream error');
});

it('lists the OpenCode logs the runtime log names in the consent baseline', async () => {
  const options = { runtime: null, projectRoot: root, runsDir: join(root, 'runs'), dataDir: join(root, 'data') };
  await writeRuntimeLog([
    { event: 'opencode_session_created', opencodeSessionId: 'ses_a', openDesignRunId: 'run-a', opencodeLogPath: conversationLog('mine') },
    { event: 'opencode_session_loaded', opencodeSessionId: 'ses_a', openDesignRunId: 'run-c', opencodeLogPath: conversationLog('mine') },
    { event: 'opencode_session_created', opencodeSessionId: 'ses_b', openDesignRunId: 'run-b', opencodeLogPath: conversationLog('other') },
  ]);
  await mkdir(join(root, 'amr', 'opencode-sessions', 'mine', 'data', 'opencode', 'log'), { recursive: true });
  await writeFile(conversationLog('mine'), 'timestamp=2026-09-30T00:00:00.000Z level=INFO message=x\n');
  const baseline = await buildAutomaticDiagnosticSources(options, { agentId: '*' });
  expect(baseline.filter((s) => s.name.startsWith('agent-cli-logs/amr/opencode')).map((s) => s.absolutePath))
    .toEqual([conversationLog('mine')]);
});

it('puts the run\'s part of its OpenCode log into the uploaded bundle', async () => {
  const { AutomaticDiagnostics } = await import('../src/services/automatic-diagnostics.js');
  const { readdirSync, readFileSync } = await import('node:fs');
  const { gunzipSync } = await import('node:zlib');
  const options = { runtime: null, projectRoot: root, runsDir: join(root, 'runs'), dataDir: join(root, 'data') };
  const service = new AutomaticDiagnostics({ dataRoot: join(root, 'data'), relayOrigin: null, consent: () => true,
    sources: (evidence) => buildAutomaticDiagnosticSources(options, evidence),
    baselineSources: () => buildAutomaticDiagnosticSources(options, { agentId: '*' }) });
  try {
    await service.tick(); // consent baseline before any AMR file exists
    const boundAt = new Date(Date.now() - 60_000).toISOString();
    await writeRuntimeLog([{ event: 'opencode_session_loaded', opencodeSessionId: 'ses_a', openDesignRunId: 'run-a',
      opencodeLogPath: conversationLog('mine'), ts: boundAt }]);
    await mkdir(join(root, 'amr', 'opencode-sessions', 'mine', 'data', 'opencode', 'log'), { recursive: true });
    await writeFile(conversationLog('mine'), [
      `timestamp=${new Date(Date.now() - 3_600_000).toISOString()} level=INFO message="previous turn"`,
      `timestamp=${new Date().toISOString()} level=ERROR message="stream error" providerID=amr`,
    ].join('\n') + '\n');

    const id = service.record({ sourceId: 'run:a', at: Date.now(), kind: 'terminal_failure', runId: 'run-a', agentId: 'amr' })!;
    await service.tick();
    const dir = join(service.outbox.directory, id);
    const archive = Buffer.concat(readdirSync(dir).filter((n) => /^\d+$/.test(n)).sort((a, b) => +a - +b).map((n) => readFileSync(join(dir, n))));
    const records = gunzipSync(archive).toString().trim().split('\n').map((l) => JSON.parse(l));
    const file = records.find((r) => r.type === 'file' && r.name === 'agent-cli-logs/amr/opencode.log');
    expect(file?.content).toContain('stream error');
    expect(file?.content).not.toContain('previous turn');
  } finally { await service.stop(); }
});

// A runtime record can only name OpenCode's log inside the AMR home. The check
// has to hold for the file actually read, so an in-tree symlink that points
// elsewhere must not make that target collectable.
// File symlinks need elevated rights on Windows, as in run-deliverable-validation.
it.skipIf(process.platform === 'win32')('does not collect an in-tree OpenCode log symlink whose target is outside the AMR home', async () => {
  const { symlink } = await import('node:fs/promises');
  const options = { runtime: null, projectRoot: root, runsDir: join(root, 'runs'), dataDir: join(root, 'data') };
  const outside = join(root, 'outside', 'secret.txt');
  await mkdir(join(root, 'outside'), { recursive: true });
  await writeFile(outside, 'timestamp=2026-09-30T01:00:01.000Z level=INFO message="not an amr file"\n');
  await mkdir(join(root, 'amr', 'opencode-sessions', 'mine', 'data', 'opencode', 'log'), { recursive: true });
  await symlink(outside, conversationLog('mine'));
  await writeRuntimeLog([
    { event: 'opencode_session_loaded', opencodeSessionId: 'ses_a', openDesignRunId: 'run-a', opencodeLogPath: conversationLog('mine'), ts: '2026-09-30T01:00:00.000Z' },
  ]);
  const incident = await buildAutomaticDiagnosticSources(options, { runId: 'run-a', agentId: 'amr' });
  const baseline = await buildAutomaticDiagnosticSources(options, { agentId: '*' });
  expect([...incident, ...baseline].filter((s) => s.name.startsWith('agent-cli-logs/amr/opencode')
    && !s.omitReason).map((s) => s.absolutePath)).toEqual([]);
  expect(incident.find((s) => s.name === 'agent-cli-logs/amr/opencode')?.omitReason).toBe('source_not_located');
});

// Without a valid bound time the run's window in a conversation's shared log is
// unknown; exporting from epoch zero would take earlier turns too.
it.each([
  ['missing', undefined],
  ['malformed', 'not-a-time'],
])('does not export a shared OpenCode log when the session record\'s timestamp is %s', async (_label, ts) => {
  const options = { runtime: null, projectRoot: root, runsDir: join(root, 'runs'), dataDir: join(root, 'data') };
  await mkdir(join(root, 'amr', 'opencode-sessions', 'mine', 'data', 'opencode', 'log'), { recursive: true });
  await writeFile(conversationLog('mine'), 'timestamp=2026-09-30T00:10:00.000Z level=INFO message="earlier turn"\n');
  await writeRuntimeLog([
    { event: 'opencode_session_loaded', opencodeSessionId: 'ses_a', openDesignRunId: 'run-a', opencodeLogPath: conversationLog('mine'), ts }, // ts: undefined drops the key
  ]);
  const sources = await buildAutomaticDiagnosticSources(options, { runId: 'run-a', agentId: 'amr' });
  expect(sources.find((s) => s.name === 'agent-cli-logs/amr/opencode.log')).toBeUndefined();
  expect(sources.find((s) => s.name === 'agent-cli-logs/amr/opencode')?.omitReason).toBe('source_not_located');
});
