import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, test, vi } from 'vitest';
import { identityFrame, modelsFrame, parseHostCommand } from '../src/protocol.js';
import { internals } from '../src/index.js';

describe('@open-design/dsh-runtime protocol', () => {
  test('declares a dsh profile bundle patch', () => {
    const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      dsh?: { bundle?: { patch?: string } };
    };
    assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml');
    assert.match(readFileSync(resolve('cordis.patch.yml'), 'utf8'), /@open-design\/dsh-runtime/);
  });

  test('emits the strict probe identity', () => {
    assert.deepEqual(identityFrame('probe', 'test'), {
      v: 1,
      type: 'probe',
      runtime: 'open-design',
      protocol_version: 1,
      plugin_version: 'test',
      capabilities: {
        session_resume: true,
        session_cancel: true,
        structured_events: true,
      },
    });
  });

  test('parses execute and cancel without retaining unknown fields', () => {
    assert.deepEqual(parseHostCommand({
      v: 1,
      type: 'execute',
      request_id: 'run-1',
      cwd: '/project',
      prompt: 'create',
      mcp_servers: [],
      ignored: 'value',
    }), {
      v: 1,
      type: 'execute',
      request_id: 'run-1',
      cwd: '/project',
      prompt: 'create',
      mcp_servers: [],
    });
    assert.deepEqual(parseHostCommand({ v: 1, type: 'cancel', request_id: 'run-1' }), {
      v: 1,
      type: 'cancel',
      request_id: 'run-1',
    });
  });

  test('emits a namespaced Harness model catalog', () => {
    assert.deepEqual(modelsFrame([{
      provider: 'deepseek-official',
      provider_name: 'DeepSeek',
      id: 'deepseek-v4-flash',
      name: 'DeepSeek-V4-Flash',
    }]), {
      v: 1,
      type: 'models',
      runtime: 'open-design',
      models: [{
        provider: 'deepseek-official',
        provider_name: 'DeepSeek',
        id: 'deepseek-v4-flash',
        name: 'DeepSeek-V4-Flash',
      }],
    });
  });

  test('keeps per-model reasoning metadata in the catalog', () => {
    assert.deepEqual(modelsFrame([{
      provider: 'deepseek-official',
      provider_name: 'DeepSeek',
      id: 'deepseek-v4-flash',
      name: 'DeepSeek-V4-Flash',
      reasoning_options: [
        { id: 'low', name: 'Low' },
        { id: 'high', name: 'High', default: true },
      ],
    }]).models[0]?.reasoning_options, [
      { id: 'low', name: 'Low' },
      { id: 'high', name: 'High', default: true },
    ]);
  });

  test('maps terminal reasons and nested tool output', () => {
    assert.equal(internals.resultStatus({ kind: 'completed' }), 'completed');
    assert.equal(internals.resultStatus({ kind: 'aborted', reason: { kind: 'user' } }), 'cancelled');
    assert.equal(internals.resultStatus({ kind: 'blocked' }), 'failed');
    assert.equal(internals.contentText([
      { type: 'text', text: 'one' },
      {
        type: 'tool-result',
        toolCallId: 'call-1' as never,
        content: [{ type: 'text', text: 'two' }],
      },
    ]), 'onetwo');
    assert.deepEqual(internals.terminalOutput(''), {});
    assert.deepEqual(internals.terminalOutput('done'), { output: 'done' });
  });

  test('normalizes every failed terminal reason to a wire error', () => {
    assert.deepEqual(internals.resultError({ kind: 'blocked' }), {
      code: 'DSH_PROFILE_TURN_BLOCKED',
      message: 'DeepSeek Harness blocked the turn before it completed.',
    });
    assert.deepEqual(internals.resultError({
      kind: 'error',
      error: new Error('provider unavailable') as never,
    }), {
      code: 'DSH_PROFILE_TURN_FAILED',
      message: 'provider unavailable',
    });
    assert.deepEqual(internals.resultError(undefined), {
      code: 'DSH_PROFILE_MISSING_TURN_END',
      message: 'DeepSeek Harness became idle without reporting how the turn ended.',
    });
    assert.equal(internals.resultError({ kind: 'completed' }), undefined);
    assert.equal(internals.resultError({ kind: 'aborted', reason: { kind: 'user' } }), undefined);
  });

  test('preserves structured Harness error facts without object coercion', () => {
    assert.deepEqual(internals.errorFacts({
      code: 'MISSING_CREDENTIAL',
      message: 'Configure a DeepSeek API key in Harness.',
    }, 'DSH_PROFILE_TURN_FAILED'), {
      code: 'MISSING_CREDENTIAL',
      message: 'Configure a DeepSeek API key in Harness.',
    });
    assert.deepEqual(internals.errorFacts({ code: 'UNKNOWN', detail: 'private provider data' }, 'fallback'), {
      code: 'UNKNOWN',
      message: 'DeepSeek Harness reported an execution error.',
    });
    assert.doesNotMatch(
      internals.errorFacts({ code: 'UNKNOWN' }, 'fallback').message,
      /\[object Object\]/,
    );
  });

  test('keeps a bounded process-exit fallback after managed profile shutdown', () => {
    const calls: string[] = [];
    let scheduled: (() => void) | undefined;
    internals.requestProfileExit(
      (code) => calls.push(`managed:${code}`),
      () => calls.push('forced'),
      (callback, delayMs) => {
        calls.push(`scheduled:${delayMs}`);
        scheduled = callback;
        return { unref: () => calls.push('unref') };
      },
    );

    assert.deepEqual(calls, ['managed:0', 'scheduled:1000', 'unref']);
    scheduled?.();
    assert.deepEqual(calls, ['managed:0', 'scheduled:1000', 'unref', 'forced']);
  });

  test('replays cancellation received before execute initializes its AbortController', async () => {
    let createSignal: AbortSignal | undefined;
    let disposeCalls = 0;
    const handle = {
      agent: {
        session: { seq: 0 },
        whenIdle: async () => {},
        followup: async () => {},
        cancel: () => {},
      },
      dispose: async () => { disposeCalls += 1; },
    };
    const ctx = {
      agentDefaultModel: {
        currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-chat' }),
      },
      agents: {
        create: async ({ signal }: { signal: AbortSignal }) => {
          createSignal = signal;
          return handle;
        },
      },
      on: () => () => {},
      sessions: { flush: async () => {} },
    };
    const input = new PassThrough();
    const chunks: string[] = [];
    const exitCodes: number[] = [];
    const serving = internals.serve(
      ctx as never,
      { write: (chunk: string) => chunks.push(chunk) },
      (code) => exitCodes.push(code),
      input,
      (exit) => exit(0),
    );

    input.write(`${JSON.stringify({
      v: 1,
      type: 'cancel',
      request_id: 'run-handshake-cancel',
    })}\n`);
    input.write(`${JSON.stringify({
      v: 1,
      type: 'execute',
      request_id: 'run-handshake-cancel',
      cwd: '/project',
      prompt: 'do not start',
      mcp_servers: [],
    })}\n`);
    await serving;

    assert.equal(createSignal?.aborted, true);
    assert.equal(disposeCalls, 1);
    assert.deepEqual(exitCodes, [0]);
    const frames = chunks.map((chunk) => JSON.parse(chunk) as { type: string; status?: string });
    assert.equal(frames.at(-1)?.type, 'result');
    assert.equal(frames.at(-1)?.status, 'cancelled');
  });

  test('cancels a resumed request during restore without starting its follow-up turn', async () => {
    let finishRestore!: () => void;
    const restoring = new Promise<void>((resolveRestore) => { finishRestore = resolveRestore; });
    let followupCalls = 0;
    let disposeCalls = 0;
    const handle = {
      agent: {
        session: { seq: 7 },
        whenIdle: () => restoring,
        followup: async () => { followupCalls += 1; },
      },
      dispose: async () => { disposeCalls += 1; },
    };
    const ctx = {
      agentDefaultModel: {
        currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-chat' }),
      },
      agents: {
        resume: async () => handle,
      },
      on: () => () => {},
      sessions: { flush: async () => {} },
    };
    const chunks: string[] = [];
    const abort = new AbortController();
    const execution = internals.execute(ctx as never, {
      v: 1,
      type: 'execute',
      request_id: 'run-restore-cancel',
      cwd: '/project',
      prompt: 'do not start',
      mcp_servers: [],
      resume_session_id: 'session-1',
    }, { write: (chunk: string) => chunks.push(chunk) }, () => {}, abort.signal);

    await Promise.resolve();
    abort.abort();
    finishRestore();
    await execution;

    assert.equal(followupCalls, 0);
    assert.equal(disposeCalls, 1);
    assert.deepEqual(chunks.map((chunk) => JSON.parse(chunk) as unknown), [
      {
        v: 1,
        type: 'session',
        request_id: 'run-restore-cancel',
        session_id: 'session-1',
        resumed: true,
      },
      {
        v: 1,
        type: 'result',
        request_id: 'run-restore-cancel',
        status: 'cancelled',
        session_id: 'session-1',
        resume_rejected: false,
      },
    ]);
  });

  test('cancellation remains authoritative while the active turn is being flushed', async () => {
    let idleCalls = 0;
    let notifyFlushStarted!: () => void;
    const flushStarted = new Promise<void>((resolveFlush) => { notifyFlushStarted = resolveFlush; });
    let finishFlush!: () => void;
    const flushFinished = new Promise<void>((resolveFlush) => { finishFlush = resolveFlush; });
    let disposeCalls = 0;
    const handle = {
      agent: {
        session: { seq: 0 },
        whenIdle: async () => { idleCalls += 1; },
        followup: async () => {},
      },
      dispose: async () => { disposeCalls += 1; },
    };
    const ctx = {
      agentDefaultModel: {
        currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-chat' }),
      },
      agents: {
        create: async () => handle,
      },
      on: () => () => {},
      sessions: {
        flush: async () => {
          notifyFlushStarted();
          await flushFinished;
        },
      },
    };
    const chunks: string[] = [];
    const abort = new AbortController();
    const execution = internals.execute(ctx as never, {
      v: 1,
      type: 'execute',
      request_id: 'run-active-cancel',
      cwd: '/project',
      prompt: 'keep working',
      mcp_servers: [],
    }, { write: (chunk: string) => chunks.push(chunk) }, () => {}, abort.signal);

    await flushStarted;
    abort.abort();
    finishFlush();
    await execution;

    assert.equal(idleCalls, 2);
    assert.equal(disposeCalls, 1);
    const frames = chunks.map((chunk) => JSON.parse(chunk) as { type: string; status?: string; error?: unknown });
    assert.equal(frames.filter((frame) => frame.type === 'result').length, 1);
    assert.equal(frames.at(-1)?.status, 'cancelled');
    assert.equal(frames.at(-1)?.error, undefined);
  });

  test('emits a failed result frame when model selection derivation throws (no silent exit)', async () => {
    // Model selection (provider/id → resolved selection) is derived before
    // the run itself. If that derivation throws — e.g. the default-model
    // service is unavailable, or a host-supplied value is rejected — the
    // execute must still settle the protocol contract: exactly one result
    // frame, status failed. Before the fix the derivation sat outside the
    // error path, so a throw rejected the task promise with no frame at all
    // and the serve loop exited the process silently, leaving the host
    // waiting on a result that never arrived.
    const chunks: string[] = [];
    const ctx = {
      agentDefaultModel: {
        currentSelection: () => {
          throw new Error('default model unavailable');
        },
      },
    };
    await internals.execute(ctx as never, {
      v: 1,
      type: 'execute',
      request_id: 'run-bad-selection',
      cwd: '/project',
      prompt: 'hi',
      mcp_servers: [],
    }, { write: (chunk: string) => chunks.push(chunk) }, () => {}, new AbortController().signal);

    const frames = chunks.map((chunk) => JSON.parse(chunk) as { type: string; status?: string; error?: { code?: string } });
    assert.equal(frames.filter((frame) => frame.type === 'result').length, 1);
    assert.equal(frames.at(-1)?.status, 'failed');
    assert.equal(frames.at(-1)?.error?.code, 'DSH_PROFILE_INVALID_MODEL_SELECTION');
  });

  test('serve emits exactly one result frame when cleanup throws after a terminal frame', async () => {
    // Regression: `execute`'s finally runs cleanup (disposeEvent / dispose /
    // onHandle) AFTER the terminal result frame has been written. If a
    // disposer throws, `execute` must not reject — otherwise `serve`'s
    // defense-in-depth fallback would synthesize a SECOND result frame,
    // violating the exactly-one-terminal-result protocol contract and being
    // marked fatal by the daemon.
    let disposeCalls = 0;
    const handle = {
      agent: {
        session: { seq: 0 },
        whenIdle: async () => {},
        followup: async () => {},
        cancel: () => {},
      },
      dispose: async () => { disposeCalls += 1; },
    };
    const ctx = {
      agentDefaultModel: {
        currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-chat' }),
      },
      agents: {
        create: async () => handle,
      },
      on: () => () => {
        throw new Error('disposeEvent failed');
      },
      sessions: { flush: async () => {} },
    };
    const input = new PassThrough();
    const chunks: string[] = [];
    const exitCodes: number[] = [];
    const serving = internals.serve(
      ctx as never,
      { write: (chunk: string) => chunks.push(chunk) },
      (code) => exitCodes.push(code),
      input,
      (exit) => exit(0),
    );

    input.write(`${JSON.stringify({
      v: 1,
      type: 'execute',
      request_id: 'run-cleanup-throw',
      cwd: '/project',
      prompt: 'hi',
      mcp_servers: [],
    })}\n`);
    const stderrWrites: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, 'write');
    stderrSpy.mockImplementation((chunk) => {
      stderrWrites.push(String(chunk));
      return true;
    });
    try {
      await serving;
    } finally {
      stderrSpy.mockRestore();
    }

    assert.equal(disposeCalls, 1);
    assert.deepEqual(exitCodes, [0]);
    const frames = chunks.map((chunk) => JSON.parse(chunk) as { type: string; status?: string });
    // The key protocol assertion: exactly ONE terminal result frame despite
    // the cleanup throw — a second frame (from serve's fallback) would be
    // fatal. (Status is 'failed' here only because this mock never delivers a
    // turn/end event; the bug under test is the duplicate frame, not status.)
    assert.equal(frames.filter((frame) => frame.type === 'result').length, 1);
    // Cleanup failures stay non-rejecting but must remain observable: the
    // failed event disposer is reported on stderr, never silently swallowed.
    assert.equal(stderrWrites.some((line) => /disposer failed/.test(line)), true);
  });

  test('reports cancelled, not failed, when selection derivation throws during an active cancel', async () => {
    // Regression: the model-selection error branch must respect cancellation
    // semantics. If currentSelection() throws while the abort signal is
    // already set (e.g. the default-model service is unavailable during an
    // immediate cancel), the execute must emit `cancelled` — a user
    // cancellation reported as a failed run would be wrong on the wire.
    const ctx = {
      agentDefaultModel: {
        currentSelection: () => {
          throw new Error('default model unavailable during cancel');
        },
      },
    };
    const input = new PassThrough();
    const chunks: string[] = [];
    const exitCodes: number[] = [];
    const serving = internals.serve(
      ctx as never,
      { write: (chunk: string) => chunks.push(chunk) },
      (code) => exitCodes.push(code),
      input,
      (exit) => exit(0),
    );

    // Cancel lands before execute initializes its AbortController, exactly
    // like the pre-existing handshake-cancel test — but here the selection
    // derivation ALSO throws, so both conditions collide.
    input.write(`${JSON.stringify({
      v: 1,
      type: 'cancel',
      request_id: 'run-select-cancel',
    })}\n`);
    input.write(`${JSON.stringify({
      v: 1,
      type: 'execute',
      request_id: 'run-select-cancel',
      cwd: '/project',
      prompt: 'hi',
      mcp_servers: [],
    })}\n`);
    await serving;

    assert.deepEqual(exitCodes, [0]);
    const frames = chunks.map((chunk) => JSON.parse(chunk) as { type: string; status?: string; error?: { code?: string } });
    assert.equal(frames.filter((frame) => frame.type === 'result').length, 1);
    assert.equal(frames.at(-1)?.status, 'cancelled');
    assert.equal(frames.at(-1)?.error, undefined);
  });
});
