import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { internals } from '../src/index.js';

type OdFrame = {
  type: string;
  content?: string;
  output?: string;
  status?: string;
  input_tokens?: number;
  output_tokens?: number;
};

type SessionEmit = {
  session: (event: unknown) => void;
  stream: (frame: unknown, sessionId?: string | null) => void;
};

const USAGE = { inputTokens: 3, outputTokens: 5 };

function turnEnd(seq: number) {
  return { type: 'turn/end', seq, data: { reason: { kind: 'completed' } } };
}

async function runTurn(emit: (api: SessionEmit) => void): Promise<OdFrame[]> {
  const chunks: string[] = [];
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const handle = {
    agent: {
      session: { seq: 0, id: 'sess-1' },
      whenIdle: async () => {},
      followup: async () => {
        emit({
          session(event) {
            listeners.get('session/event')?.({ id: 'sess-1' }, event);
          },
          stream(frame, sessionId = 'sess-1') {
            listeners.get('agent/assistant-stream')?.(
              sessionId === null
                ? { frame }
                : { agent: { session: { id: sessionId } }, frame },
            );
          },
        });
      },
    },
    dispose: async () => {},
  };
  const ctx = {
    agentDefaultModel: {
      currentSelection: () => ({
        provider: 'deepseek-official',
        model: 'deepseek-chat',
      }),
    },
    agents: {
      resume: async () => handle,
    },
    on: (name: string, fn: (...args: unknown[]) => void) => {
      listeners.set(name, fn);
      return () => listeners.delete(name);
    },
    sessions: { flush: async () => {} },
  };
  await internals.execute(
    ctx as never,
    {
      v: 1,
      type: 'execute',
      request_id: 'run-1',
      cwd: '/project',
      prompt: 'say ok',
      mcp_servers: [],
      resume_session_id: 'sess-1',
    },
    { write: (chunk: string) => chunks.push(chunk) },
    () => {},
    new AbortController().signal,
  );
  return chunks.map((chunk) => JSON.parse(chunk) as OdFrame);
}

function framesOf(frames: OdFrame[], type: string): OdFrame[] {
  return frames.filter((frame) => frame.type === type);
}

describe('@open-design/dsh-runtime 0.1.5 event contract', () => {
  test('advertises plugin 0.1.1 as the compatibility generation', () => {
    assert.equal(internals.pluginVersion, '0.1.1');
  });

  test('F1 legacy assistant/chunk still fills text and result.output', async () => {
    const frames = await runTurn(({ session }) => {
      session({
        type: 'assistant/chunk',
        seq: 1,
        data: { chunk: { type: 'text-delta', text: 'ok' } },
      });
      session(turnEnd(2));
    });
    assert.deepEqual(
      framesOf(frames, 'text').map((frame) => frame.content),
      ['ok'],
    );
    const result = frames.at(-1);
    assert.equal(result?.type, 'result');
    assert.equal(result?.status, 'completed');
    assert.equal(result?.output, 'ok');
  });

  test('F2 settlement-only assistant/message fills text, usage, and result.output', async () => {
    const frames = await runTurn(({ session }) => {
      session({
        type: 'assistant/message',
        seq: 1,
        data: {
          usage: USAGE,
          message: { content: [{ type: 'text', text: 'ok' }] },
        },
      });
      session(turnEnd(2));
    });
    assert.deepEqual(
      framesOf(frames, 'text').map((frame) => frame.content),
      ['ok'],
    );
    assert.deepEqual(
      framesOf(frames, 'usage').map((frame) => ({
        input_tokens: frame.input_tokens,
        output_tokens: frame.output_tokens,
      })),
      [{ input_tokens: 3, output_tokens: 5 }],
    );
    assert.equal(frames.at(-1)?.output, 'ok');
  });

  test('F3 live stream then settlement emits text once', async () => {
    const frames = await runTurn(({ session, stream }) => {
      stream({ type: 'start', turn: 1, step: 1 });
      stream({ type: 'chunk', chunk: { type: 'text-delta', text: 'ok' } });
      stream({
        type: 'end',
        outcome: { kind: 'committed', eventType: 'assistant/message' },
      });
      session({
        type: 'assistant/message',
        seq: 1,
        data: {
          usage: USAGE,
          message: { content: [{ type: 'text', text: 'ok' }] },
        },
      });
      session(turnEnd(2));
    });
    assert.deepEqual(
      framesOf(frames, 'text').map((frame) => frame.content),
      ['ok'],
    );
    assert.equal(framesOf(frames, 'usage').length, 1);
    assert.equal(frames.at(-1)?.output, 'ok');
  });

  test('F4 reasoning stays out of result.output', async () => {
    const frames = await runTurn(({ session, stream }) => {
      stream({
        type: 'chunk',
        chunk: { type: 'reasoning-delta', text: 'hmm' },
      });
      stream({ type: 'chunk', chunk: { type: 'text-delta', text: 'ok' } });
      session(turnEnd(1));
    });
    assert.deepEqual(
      framesOf(frames, 'thinking').map((frame) => frame.content),
      ['hmm'],
    );
    assert.deepEqual(
      framesOf(frames, 'text').map((frame) => frame.content),
      ['ok'],
    );
    assert.equal(frames.at(-1)?.output, 'ok');
  });

  test('F5 assistant/attempt is not user-visible text', async () => {
    const frames = await runTurn(({ session }) => {
      session({
        type: 'assistant/attempt',
        seq: 1,
        data: {
          message: { content: [{ type: 'text', text: 'retry' }] },
          stream: [{ type: 'text-chunks', texts: ['retry'] }],
        },
      });
      session(turnEnd(2));
    });
    assert.deepEqual(framesOf(frames, 'text'), []);
    assert.equal(frames.at(-1)?.output, undefined);
  });

  test('F6 empty assistant/message keeps usage and omits output', async () => {
    const frames = await runTurn(({ session }) => {
      session({
        type: 'assistant/message',
        seq: 1,
        data: {
          usage: USAGE,
          message: { content: [] },
        },
      });
      session(turnEnd(2));
    });
    assert.deepEqual(framesOf(frames, 'text'), []);
    assert.equal(framesOf(frames, 'usage').length, 1);
    assert.equal(frames.at(-1)?.output, undefined);
  });

  test('settlement fallback uses text blocks only, not reasoning', async () => {
    assert.equal(
      internals.assistantVisibleText([
        { type: 'reasoning', text: 'hmm' },
        { type: 'text', text: 'ok' },
      ]),
      'ok',
    );
    const frames = await runTurn(({ session }) => {
      session({
        type: 'assistant/message',
        seq: 1,
        data: {
          message: {
            content: [
              { type: 'reasoning', text: 'hmm' },
              { type: 'text', text: 'ok' },
            ],
          },
        },
      });
      session(turnEnd(2));
    });
    assert.deepEqual(
      framesOf(frames, 'text').map((frame) => frame.content),
      ['ok'],
    );
    assert.equal(frames.at(-1)?.output, 'ok');
  });

  test('legacy chunk wins over a later live stream duplicate', async () => {
    const frames = await runTurn(({ session, stream }) => {
      session({
        type: 'assistant/chunk',
        seq: 1,
        data: { chunk: { type: 'text-delta', text: 'ok' } },
      });
      stream({ type: 'chunk', chunk: { type: 'text-delta', text: 'ok' } });
      session(turnEnd(2));
    });
    assert.deepEqual(
      framesOf(frames, 'text').map((frame) => frame.content),
      ['ok'],
    );
    assert.equal(frames.at(-1)?.output, 'ok');
  });

  test('live stream without injected agent still fills text', async () => {
    const frames = await runTurn(({ session, stream }) => {
      stream({ type: 'chunk', chunk: { type: 'text-delta', text: 'ok' } }, null);
      session(turnEnd(1));
    });
    assert.deepEqual(
      framesOf(frames, 'text').map((frame) => frame.content),
      ['ok'],
    );
    assert.equal(frames.at(-1)?.output, 'ok');
  });

  test('live stream from another session is ignored', async () => {
    const frames = await runTurn(({ session, stream }) => {
      stream({ type: 'chunk', chunk: { type: 'text-delta', text: 'nope' } }, 'other');
      session(turnEnd(1));
    });
    assert.deepEqual(framesOf(frames, 'text'), []);
    assert.equal(frames.at(-1)?.output, undefined);
  });
});
