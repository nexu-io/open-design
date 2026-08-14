import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'vitest';
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
});
