import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test, vi } from 'vitest';
import { detectAgent } from '../../src/runtimes/detection.js';
import { kiloAgentDef } from '../../src/runtimes/defs/kilo.js';
import { attachAcpSession } from '../../src/agent-protocol/index.js';

const execFileAsync = promisify(execFile);
const mockBin = fileURLToPath(new URL('../../../../mocks/bin/kilo', import.meta.url));
const posixTest = process.platform === 'win32' ? test.skip : test;

afterEach(() => vi.unstubAllEnvs());

posixTest('Kilo mock reports a supported version without recordings or ACP input', async () => {
  const emptyRecordings = await mkdtemp(path.join(tmpdir(), 'od-kilo-mock-version-'));
  try {
    const { stdout, stderr } = await execFileAsync(mockBin, ['--version'], {
      env: {
        ...process.env,
        OD_MOCKS_RECORDINGS_DIR: emptyRecordings,
        OD_MOCKS_TRACE: 'missing-recording',
      },
      timeout: 3_000,
    });
    const version = kiloAgentDef.versionPolicy.parse(stdout);
    expect(version).toBe('7.4.23');
    expect(kiloAgentDef.versionPolicy.supportedVersions).toContain(version);
    expect(stderr).toBe('');
  } finally {
    await rm(emptyRecordings, { recursive: true, force: true });
  }
});

posixTest('PATH-overlay Kilo mock passes discovery and reaches the ACP model probe', async () => {
  const recordings = await mkdtemp(path.join(tmpdir(), 'od-kilo-mock-detection-'));
  const trace = 'kilo-discovery-fixture';
  try {
    await writeFile(path.join(recordings, `${trace}.jsonl`), [
      JSON.stringify({ type: 'meta', model: 'default' }),
      JSON.stringify({ type: 'report', content: 'Mock Kilo response.' }),
      '',
    ].join('\n'));
    vi.stubEnv('PATH', [path.dirname(mockBin), path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter));
    vi.stubEnv('OD_AGENT_HOME', recordings);
    vi.stubEnv('OD_MOCKS_RECORDINGS_DIR', recordings);
    vi.stubEnv('OD_MOCKS_TRACE', trace);
    vi.stubEnv('OD_MOCKS_NO_DELAY', '1');

    const agent = await detectAgent(kiloAgentDef);
    expect(agent.path).toBe(mockBin);
    expect(agent.available).toBe(true);
    expect(agent.version).toBe('7.4.23');
    expect(agent.diagnostics).toBeUndefined();
    // A fallback list would hide a broken ACP handshake after the version gate.
    expect(agent.modelsSource).toBe('live');
    expect(agent.models).toEqual(kiloAgentDef.fallbackModels);
  } finally {
    await rm(recordings, { recursive: true, force: true });
  }
});

posixTest.each([false, true])('Kilo mock replay preserves only the current turn (resume=%s)', async (resume) => {
  const recordings = await mkdtemp(path.join(tmpdir(), 'od-kilo-mock-history-'));
  const trace = 'kilo-history-fixture';
  let stopChild: (() => Promise<void>) | undefined;
  try {
    await writeFile(path.join(recordings, `${trace}.jsonl`), [
      JSON.stringify({ type: 'meta', model: 'default' }),
      JSON.stringify({ type: 'tool_call', obs_id: 'old-write', name: 'Write', input: { file_path: 'old.html' } }),
      JSON.stringify({ type: 'tool_result', obs_id: 'old-write', name: 'Write', output: 'Previous write', status: 'ok' }),
      JSON.stringify({ type: 'report', content: 'Recorded answer.' }),
      '',
    ].join('\n'));
    const child = spawn(mockBin, ['acp'], {
      env: { ...process.env, OD_MOCKS_RECORDINGS_DIR: recordings, OD_MOCKS_TRACE: trace, OD_MOCKS_NO_DELAY: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const closed = once(child, 'close');
    stopChild = async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      await closed;
    };
    const frames: Array<Record<string, any>> = [];
    let buffered = '';
    child.stdout.on('data', (chunk) => {
      buffered += String(chunk);
      let newline: number;
      while ((newline = buffered.indexOf('\n')) !== -1) {
        frames.push(JSON.parse(buffered.slice(0, newline)));
        buffered = buffered.slice(newline + 1);
      }
    });
    const events: Array<{ event: string; payload: any }> = [];
    const session = attachAcpSession({
      child, prompt: 'continue', captureSessionIdAsDurable: true,
      ...(resume ? { resumeSessionId: 'ses_kilo_persisted' } : {}),
      send: (event, payload) => events.push({ event, payload }),
    });
    const [code] = await closed;
    assert.equal(code, 0);
    const setupResponse = frames.findIndex((frame) => frame.id === 2 && frame.result);
    assert.ok(setupResponse >= 0);
    const historyKinds = frames.slice(0, setupResponse)
      .filter((frame) => frame.method === 'session/update')
      .map((frame) => frame.params.update.sessionUpdate);
    assert.deepEqual(historyKinds, resume ? ['tool_call', 'tool_call_update', 'agent_message_chunk'] : []);
    assert.deepEqual(events.filter((entry) => entry.payload.type === 'text_delta').map((entry) => entry.payload.delta), ['Recorded answer.']);
    assert.equal(events.some((entry) => ['tool_use', 'tool_result', 'artifact'].includes(entry.payload.type)), false);
    assert.equal(session.completedSuccessfully(), true);
    assert.equal(session.hasFatalError(), false);
    if (resume) assert.equal(session.getDurableSessionId(), 'ses_kilo_persisted');
  } finally {
    await stopChild?.();
    await rm(recordings, { recursive: true, force: true });
  }
});
