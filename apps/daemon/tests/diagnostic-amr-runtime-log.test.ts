import { appendFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
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
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'amr-runtime-')); process.env.AMR_HOME = join(root, 'amr'); });
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
