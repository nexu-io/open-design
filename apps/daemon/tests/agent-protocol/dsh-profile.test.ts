import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { describe, test } from 'vitest';
import {
  attachDshProfileSession,
  createDshProfileJsonlStream,
  parseDshProfileHostCommand,
  parseDshProfileModelsOutput,
  parseDshProfileProbeOutput,
  parseDshProfileRuntimeFrame,
  type DshProfileRuntimeFrame,
  type DshProfileStreamError,
} from '../../src/agent-protocol/index.js';
import { deepseekHarnessAgentDef } from '../../src/runtimes/defs/deepseek-harness.js';

const requiredCapabilities = {
  session_resume: true,
  session_cancel: true,
  structured_events: true,
} as const;

const readyFrame = {
  v: 1,
  type: 'ready',
  runtime: 'open-design',
  protocol_version: 1,
  plugin_version: 'fixture-1',
  capabilities: requiredCapabilities,
} as const;

describe('DeepSeek Harness profile frame validation', () => {
  test('declares profile-stdio resume instead of CLI-argument resume', () => {
    assert.equal(deepseekHarnessAgentDef.resumesSessionViaProfileStdio, true);
    assert.equal('resumesSessionViaCli' in deepseekHarnessAgentDef, false);
  });

  test('accepts required identity and execute shapes', () => {
    assert.deepEqual(parseDshProfileRuntimeFrame(readyFrame), readyFrame);
    assert.deepEqual(
      parseDshProfileHostCommand({
        v: 1,
        type: 'execute',
        request_id: 'run-1',
        cwd: '/project',
        prompt: 'create a page',
        model: { provider: 'deepseek-official', id: 'model-1' },
        mcp_servers: [],
      }),
      {
        v: 1,
        type: 'execute',
        request_id: 'run-1',
        cwd: '/project',
        prompt: 'create a page',
        model: { provider: 'deepseek-official', id: 'model-1' },
        mcp_servers: [],
      },
    );
  });

  test.each([
    [{ ...readyFrame, runtime: 'other' }, 'runtime must equal open-design'],
    [{ ...readyFrame, protocol_version: 2 }, 'protocol_version must equal 1'],
    [{ ...readyFrame, capabilities: { ...requiredCapabilities, session_resume: false } }, 'capabilities'],
    [{ v: 1, type: 'unknown' }, 'type is not supported'],
    [{ v: 1, type: 'result', request_id: 'r', status: 'failed', session_id: 's', resume_rejected: true }, 'failed result'],
  ] as const)('rejects incompatible runtime frames', (frame, message) => {
    assert.throws(() => parseDshProfileRuntimeFrame(frame), new RegExp(message));
  });

  test('requires exactly one compatible probe frame', () => {
    const probe = { ...readyFrame, type: 'probe' } as const;
    assert.equal(parseDshProfileProbeOutput(`${JSON.stringify(probe)}\n`).plugin_version, 'fixture-1');
    assert.throws(() => parseDshProfileProbeOutput('not json'), /malformed JSON/);
    assert.throws(
      () => parseDshProfileProbeOutput(`${JSON.stringify(probe)}\n${JSON.stringify(probe)}\n`),
      /exactly one frame/,
    );
  });

  test('parses and validates the profile model catalog', () => {
    assert.deepEqual(parseDshProfileModelsOutput(JSON.stringify({
      v: 1,
      type: 'models',
      runtime: 'open-design',
      models: [{
        provider: 'deepseek-official',
        provider_name: 'DeepSeek',
        id: 'deepseek-v4-flash',
        name: 'DeepSeek-V4-Flash',
        reasoning_options: [
          { id: 'low', name: 'Low' },
          { id: 'high', name: 'High', default: true },
        ],
      }],
    })), [{
      provider: 'deepseek-official',
      provider_name: 'DeepSeek',
      id: 'deepseek-v4-flash',
      name: 'DeepSeek-V4-Flash',
      reasoning_options: [
        { id: 'low', name: 'Low' },
        { id: 'high', name: 'High', default: true },
      ],
    }]);
    assert.equal(parseDshProfileModelsOutput('{"type":"models"}'), null);
  });

  test('maps the Harness catalog into provider-qualified model choices', () => {
    assert.deepEqual(deepseekHarnessAgentDef.listModels?.parse(JSON.stringify({
      v: 1,
      type: 'models',
      runtime: 'open-design',
      models: [{
        provider: 'deepseek-official',
        provider_name: 'DeepSeek',
        id: 'deepseek-v4-flash',
        name: 'DeepSeek-V4-Flash',
        reasoning_options: [{ id: 'high', name: 'High', default: true }],
      }],
    })), [
      { id: 'default', label: 'Default (CLI config)' },
      {
        id: 'deepseek-official/deepseek-v4-flash',
        label: 'DeepSeek-V4-Flash · DeepSeek',
        reasoningOptions: [{ id: 'high', label: 'High', default: true }],
      },
    ]);
  });
});

describe('strict DeepSeek Harness profile JSONL stream', () => {
  test('parses fragmented UTF-8 and coalesced CRLF frames', () => {
    const frames: DshProfileRuntimeFrame[] = [];
    const errors: DshProfileStreamError[] = [];
    const parser = createDshProfileJsonlStream({
      onFrame: (frame) => frames.push(frame),
      onError: (error) => errors.push(error),
    });
    const input = `${JSON.stringify(readyFrame)}\r\n${JSON.stringify({
      v: 1,
      type: 'text',
      request_id: 'run-1',
      content: '你好',
    })}\n`;
    const bytes = Buffer.from(input);
    const splitInsideCharacter = bytes.indexOf(Buffer.from('你')) + 1;
    parser.feed(bytes.subarray(0, splitInsideCharacter));
    parser.feed(bytes.subarray(splitInsideCharacter));
    parser.flush();

    assert.equal(errors.length, 0);
    assert.deepEqual(frames.map((frame) => frame.type), ['ready', 'text']);
    assert.equal(frames[1]?.type === 'text' ? frames[1].content : null, '你好');
  });

  test('fails malformed JSON without including raw secret content', () => {
    const errors: DshProfileStreamError[] = [];
    const parser = createDshProfileJsonlStream({
      onFrame: () => assert.fail('malformed frame must not emit'),
      onError: (error) => errors.push(error),
    });
    parser.feed('{"v":1,"type":"text","content":"SECRET_VALUE"\n');

    assert.deepEqual(errors, [{
      code: 'DSH_PROFILE_MALFORMED_FRAME',
      message: 'DeepSeek Harness profile emitted malformed JSON.',
      line: 1,
    }]);
    assert.equal(JSON.stringify(errors).includes('SECRET_VALUE'), false);
  });

  test('rejects oversized frames before a newline arrives', () => {
    const errors: DshProfileStreamError[] = [];
    const parser = createDshProfileJsonlStream({
      onFrame: () => assert.fail('oversized frame must not emit'),
      onError: (error) => errors.push(error),
      maxFrameBytes: 16,
    });
    parser.feed('{"v":1,"padding":"more than allowed"');
    assert.equal(errors[0]?.code, 'DSH_PROFILE_FRAME_TOO_LARGE');
    assert.equal(errors[0]?.line, 1);
  });
});

describe('fake DeepSeek Harness profile runtime', () => {
  test('probes, creates, then resumes the same persisted session in another process', async () => {
    const sessionRoot = mkdtempSync(path.join(tmpdir(), 'od-dsh-profile-'));
    try {
      const probe = await runFake(['--profile', 'open-design', '--probe'], sessionRoot);
      assert.equal(probe.code, 0);
      const probeFrame = parseDshProfileRuntimeFrame(JSON.parse(probe.stdout.trim()) as unknown);
      assert.equal(probeFrame.type, 'probe');

      const first = await runFake(
        ['--profile', 'open-design', '--stdio'],
        sessionRoot,
        executeCommand('run-1', 'bootstrap and create'),
      );
      const firstFrames = parseOutput(first.stdout);
      const firstSession = firstFrames.find((frame) => frame.type === 'session');
      assert.ok(firstSession?.type === 'session');
      assert.equal(firstSession.resumed, false);
      assert.equal(firstFrames.at(-1)?.type, 'result');

      const second = await runFake(
        ['--profile', 'open-design', '--stdio'],
        sessionRoot,
        executeCommand('run-2', 'latest turn only', firstSession.session_id),
      );
      const secondFrames = parseOutput(second.stdout);
      const secondSession = secondFrames.find((frame) => frame.type === 'session');
      assert.ok(secondSession?.type === 'session');
      assert.equal(secondSession.session_id, firstSession.session_id);
      assert.equal(secondSession.resumed, true);
      assert.notEqual(first.pid, second.pid);
    } finally {
      rmSync(sessionRoot, { recursive: true, force: true });
    }
  });

  test('returns explicit resume rejection instead of creating a session', async () => {
    const sessionRoot = mkdtempSync(path.join(tmpdir(), 'od-dsh-profile-'));
    try {
      const result = await runFake(
        ['--profile', 'open-design', '--stdio'],
        sessionRoot,
        executeCommand('run-missing', 'latest only', 'missing-session'),
      );
      const terminal = parseOutput(result.stdout).at(-1);
      assert.ok(terminal?.type === 'result');
      assert.equal(terminal.status, 'failed');
      assert.equal(terminal.resume_rejected, true);
    } finally {
      rmSync(sessionRoot, { recursive: true, force: true });
    }
  });

  test('accepts protocol cancellation and emits one cancelled terminal result', async () => {
    const sessionRoot = mkdtempSync(path.join(tmpdir(), 'od-dsh-profile-'));
    try {
      const result = await runFake(
        ['--profile', 'open-design', '--stdio'],
        sessionRoot,
        [
          executeCommand('run-cancel', 'wait'),
          JSON.stringify({ v: 1, type: 'cancel', request_id: 'run-cancel' }),
        ].join('\n') + '\n',
        'wait-cancel',
      );
      const terminals = parseOutput(result.stdout).filter((frame) => frame.type === 'result');
      assert.equal(terminals.length, 1);
      assert.equal(terminals[0]?.type === 'result' ? terminals[0].status : null, 'cancelled');
    } finally {
      rmSync(sessionRoot, { recursive: true, force: true });
    }
  });
});

describe('DeepSeek Harness profile session controller', () => {
  test('reports an explicit resume rejection before a session is established', () => {
    const child = new FakeDshChild();
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const controller = attachDshProfileSession({
      child: child as never,
      requestId: 'run-resume',
      prompt: 'continue',
      cwd: '/project',
      resumeSessionId: 'missing-session',
      send: (event, payload) => events.push({ event, payload: payload as Record<string, unknown> }),
    });

    child.emitFrame(readyFrame);
    child.emitFrame({
      v: 1,
      type: 'result',
      request_id: 'run-resume',
      status: 'failed',
      session_id: 'missing-session',
      resume_rejected: true,
      error: { code: 'DSH_PROFILE_RESUME_REJECTED', message: 'not found' },
    });

    assert.equal(controller.hasFatalError(), true);
    assert.equal(events.at(-1)?.event, 'error');
    assert.match(String(events.at(-1)?.payload.message), /could not resume/);
  });

  test('surfaces an upstream create failure before a session is established', () => {
    const child = new FakeDshChild();
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const controller = attachDshProfileSession({
      child: child as never,
      requestId: 'run-create',
      prompt: 'create',
      cwd: '/project',
      send: (event, payload) => events.push({ event, payload: payload as Record<string, unknown> }),
    });

    child.emitFrame(readyFrame);
    child.emitFrame({
      v: 1,
      type: 'result',
      request_id: 'run-create',
      status: 'failed',
      session_id: 'pending-run-create',
      resume_rejected: false,
      error: { code: 'DSH_PROVIDER_AUTH_FAILED', message: 'DeepSeek credentials are not configured.' },
    });

    assert.equal(controller.hasFatalError(), true);
    assert.equal(events.at(-1)?.event, 'error');
    assert.equal(events.at(-1)?.payload.message, 'DeepSeek credentials are not configured.');
  });

  test('waits for ready, maps events, and completes only on a matching result', () => {
    const child = new FakeDshChild();
    const writes: Array<Record<string, unknown>> = [];
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    child.stdin.on('data', (chunk) => {
      for (const line of String(chunk).trim().split('\n')) {
        if (line) writes.push(JSON.parse(line) as Record<string, unknown>);
      }
    });
    const controller = attachDshProfileSession({
      child: child as never,
      requestId: 'run-1',
      prompt: 'create',
      cwd: '/project',
      model: 'deepseek-official/model-1',
      send: (event, payload) => events.push({ event, payload: payload as Record<string, unknown> }),
    });

    child.emitFrame(readyFrame);
    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.type, 'execute');
    assert.equal(controller.completedSuccessfully(), false);
    child.emitFrame({ v: 1, type: 'session', request_id: 'run-1', session_id: 'session-1', resumed: false });
    child.emitFrame({ v: 1, type: 'thinking', request_id: 'run-1', content: 'checking' });
    child.emitFrame({ v: 1, type: 'text', request_id: 'run-1', content: 'done' });
    child.emitFrame({
      v: 1,
      type: 'tool_call',
      request_id: 'run-1',
      call_id: 'call-1',
      name: 'Write',
      arguments: '{"file_path":"index.html"}',
    });
    child.emitFrame({
      v: 1,
      type: 'tool_result',
      request_id: 'run-1',
      call_id: 'call-1',
      name: 'Write',
      output: 'ok',
      is_error: false,
    });
    child.emitFrame({
      v: 1,
      type: 'usage',
      request_id: 'run-1',
      provider: 'deepseek-official',
      model: 'model-1',
      input_tokens: 10,
      output_tokens: 2,
    });
    child.emitFrame({
      v: 1,
      type: 'result',
      request_id: 'run-1',
      status: 'completed',
      session_id: 'session-1',
      resume_rejected: false,
    });

    assert.equal(controller.completedSuccessfully(), true);
    assert.equal(controller.getDurableSessionId(), 'session-1');
    assert.deepEqual(events.map(({ payload }) => payload.type), [
      'status',
      'thinking_start',
      'thinking_delta',
      'text_delta',
      'tool_use',
      'tool_result',
      'usage',
      'thinking_end',
    ]);
    assert.deepEqual(events.find(({ payload }) => payload.type === 'usage')?.payload, {
      type: 'usage',
      provider: 'deepseek-official',
      model: 'model-1',
      usage: {
        input_tokens: 10,
        output_tokens: 2,
        cached_read_tokens: 0,
        cached_write_tokens: 0,
        total_tokens: 12,
      },
    });
  });

  test('ignores other requests and rejects a changed resumed session id', () => {
    const child = new FakeDshChild();
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const controller = attachDshProfileSession({
      child: child as never,
      requestId: 'run-2',
      prompt: 'latest only',
      cwd: '/project',
      resumeSessionId: 'saved-session',
      send: (event, payload) => events.push({ event, payload: payload as Record<string, unknown> }),
    });
    child.emitFrame(readyFrame);
    child.emitFrame({ v: 1, type: 'text', request_id: 'other-run', content: 'must ignore' });
    child.emitFrame({ v: 1, type: 'session', request_id: 'run-2', session_id: 'changed-session', resumed: true });

    assert.equal(controller.ignoredRequestFrameCount(), 1);
    assert.equal(controller.hasFatalError(), true);
    assert.equal(events.some(({ payload }) => payload.type === 'text_delta'), false);
    assert.equal(events.at(-1)?.event, 'error');
  });

  test('abort writes a request-scoped cancel command', () => {
    const child = new FakeDshChild();
    const writes: Array<Record<string, unknown>> = [];
    child.stdin.on('data', (chunk) => {
      for (const line of String(chunk).trim().split('\n')) {
        if (line) writes.push(JSON.parse(line) as Record<string, unknown>);
      }
    });
    const controller = attachDshProfileSession({
      child: child as never,
      requestId: 'run-cancel',
      prompt: 'wait',
      cwd: '/project',
      send: () => {},
    });
    child.emitFrame(readyFrame);
    child.emitFrame({ v: 1, type: 'session', request_id: 'run-cancel', session_id: 'session-1', resumed: false });
    controller.abort();
    assert.deepEqual(writes.at(-1), { v: 1, type: 'cancel', request_id: 'run-cancel' });
  });

  test('abort before ready cancels without sending execute', () => {
    const child = new FakeDshChild();
    const writes: Array<Record<string, unknown>> = [];
    child.stdin.on('data', (chunk) => {
      for (const line of String(chunk).trim().split('\n')) {
        if (line) writes.push(JSON.parse(line) as Record<string, unknown>);
      }
    });
    const controller = attachDshProfileSession({
      child: child as never,
      requestId: 'run-cancel-startup',
      prompt: 'must not start',
      cwd: '/project',
      send: () => {},
    });

    controller.abort();
    child.emitFrame(readyFrame);

    assert.equal(controller.executeWasSent(), false);
    assert.equal(writes.some(({ type }) => type === 'execute'), false);
    assert.equal(controller.getTerminalStatus(), 'cancelled');
  });

  test('EOF without a terminal result is a fatal failure', () => {
    const child = new FakeDshChild();
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const controller = attachDshProfileSession({
      child: child as never,
      requestId: 'run-eof',
      prompt: 'wait',
      cwd: '/project',
      send: (event, payload) => events.push({ event, payload: payload as Record<string, unknown> }),
    });
    child.emitFrame(readyFrame);
    child.emitFrame({ v: 1, type: 'session', request_id: 'run-eof', session_id: 'session-1', resumed: false });
    child.stdout.emit('end');
    assert.equal(controller.hasFatalError(), true);
    assert.equal(events.at(-1)?.event, 'error');
  });
});

function executeCommand(requestId: string, prompt: string, resumeSessionId?: string): string {
  return `${JSON.stringify({
    v: 1,
    type: 'execute',
    request_id: requestId,
    cwd: '/fixture-project',
    prompt,
    ...(resumeSessionId ? { resume_session_id: resumeSessionId } : {}),
    mcp_servers: [],
  })}\n`;
}

function parseOutput(stdout: string): DshProfileRuntimeFrame[] {
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => parseDshProfileRuntimeFrame(JSON.parse(line) as unknown));
}

async function runFake(
  args: string[],
  sessionRoot: string,
  input = '',
  mode = 'normal',
): Promise<{ code: number | null; stdout: string; stderr: string; pid: number }> {
  const fixture = path.resolve('tests/fixtures/dsh-profile/fake-dsh.ts');
  const child = spawn(process.execPath, ['--import', 'tsx', fixture, ...args], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      OD_DSH_FAKE_MODE: mode,
      OD_DSH_FAKE_SESSION_ROOT: sessionRoot,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pid = child.pid ?? -1;
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += String(chunk); });
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  if (input) child.stdin.end(input);
  else child.stdin.end();
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  return { code, stdout, stderr, pid };
}

class FakeDshChild {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();

  emitFrame(frame: unknown): void {
    this.stdout.write(`${JSON.stringify(frame)}\n`);
  }
}
