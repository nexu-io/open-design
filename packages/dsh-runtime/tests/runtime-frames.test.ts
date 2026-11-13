import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { internals } from '../src/index.js';

/**
 * These specs pin the two profile-channel invariants that a real Harness run
 * broke: stdout stays machine-only, and a step's prose reaches the host even
 * when the adapter never streamed deltas for it.
 */

type Frame = Record<string, unknown>;

function capture(): { output: { write(chunk: string): unknown }; frames: Frame[] } {
  const frames: Frame[] = [];
  return {
    frames,
    output: {
      write(chunk: string) {
        frames.push(JSON.parse(chunk) as Frame);
        return true;
      },
    },
  };
}

const executeRequest = {
  v: 1 as const,
  type: 'execute' as const,
  request_id: 'run-1',
  cwd: '/project',
  prompt: 'make a poster',
  mcp_servers: [],
};

function assistantMessageEvent(turn: number, step: number, text: string, usage?: unknown) {
  return {
    seq: turn * 10 + step,
    type: 'assistant/message',
    data: {
      turn,
      step,
      message: {
        id: 'msg-1',
        role: 'assistant',
        source: { kind: 'model' },
        content: [{ type: 'text', text }],
      },
      ...(usage === undefined ? {} : { usage }),
    },
  } as never;
}

function textDeltaEvent(turn: number, step: number, text: string) {
  return {
    seq: turn * 10 + step,
    type: 'assistant/chunk',
    data: { turn, step, chunk: { type: 'text-delta', text } },
  } as never;
}

describe('dsh-runtime frame emission', () => {
  test('delivers assembled assistant prose when the build streams no deltas', () => {
    const { output, frames } = capture();
    const state = internals.createFrameState();

    const delivered = internals.emitSessionEvent(
      output,
      executeRequest,
      'deepseek-account',
      'deepseek-flash',
      assistantMessageEvent(1, 1, '页面已生成。'),
      state,
    );

    assert.equal(delivered, '页面已生成。');
    assert.deepEqual(frames, [
      { v: 1, type: 'text', request_id: 'run-1', content: '页面已生成。' },
    ]);
  });

  test('does not repeat prose that already streamed as deltas', () => {
    const { output, frames } = capture();
    const state = internals.createFrameState();

    internals.emitSessionEvent(output, executeRequest, 'p', 'm', textDeltaEvent(1, 1, '页面'), state);
    const delivered = internals.emitSessionEvent(
      output,
      executeRequest,
      'p',
      'm',
      assistantMessageEvent(1, 1, '页面已生成。'),
      state,
    );

    assert.equal(delivered, '');
    assert.deepEqual(frames, [
      { v: 1, type: 'text', request_id: 'run-1', content: '页面' },
    ]);
  });

  test('keeps usage accounting when it rides on the assembled message', () => {
    const { output, frames } = capture();
    const state = internals.createFrameState();

    internals.emitSessionEvent(
      output,
      executeRequest,
      'deepseek-account',
      'deepseek-flash',
      assistantMessageEvent(1, 1, 'done', {
        inputTokens: 10,
        outputTokens: 4,
        cacheReadTokens: 2,
        cacheWriteTokens: 0,
      }),
      state,
    );

    assert.deepEqual(frames.map((frame) => frame.type), ['usage', 'text']);
    assert.equal(frames[0]?.input_tokens, 10);
    assert.equal(frames[0]?.cache_read_tokens, 2);
  });
});

describe('dsh-runtime stdout ownership', () => {
  // `console` is intercepted by the test runner before this patch runs, so the
  // console route cannot be observed here; it is covered by the real
  // `dsh --profile open-design --models` integration check instead. What this
  // spec pins is the stream-level invariant the patch installs.
  test('demotes non-protocol stdout writes to stderr and keeps the protocol writer', () => {
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    const stdout: string[] = [];
    const stderr: string[] = [];
    process.stdout.write = ((chunk: unknown) => { stdout.push(String(chunk)); return true; }) as never;
    process.stderr.write = ((chunk: unknown) => { stderr.push(String(chunk)); return true; }) as never;

    try {
      const output = internals.claimStdoutForProtocol();
      // A neighbour plugin logging a model listing, exactly as it did in the
      // failing run.
      process.stdout.write('[llm-deepseek-account] model listing loaded 2 model(s)\n');
      output.write('{"v":1,"type":"probe"}\n');

      assert.deepEqual(stdout, ['{"v":1,"type":"probe"}\n']);
      assert.equal(stderr.length, 1);
      assert.match(stderr[0] ?? '', /model listing/);
    } finally {
      process.stdout.write = stdoutWrite;
      process.stderr.write = stderrWrite;
    }
  });
});
