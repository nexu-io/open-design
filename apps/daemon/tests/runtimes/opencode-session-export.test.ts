import { describe, expect, it } from 'vitest';

import { extractOpenCodeSessionReply } from '../../src/runtimes/opencode-session-export.js';

function exportedSession(messages: unknown[]): string {
  return JSON.stringify({
    info: { id: 'ses_test' },
    messages,
  });
}

describe('extractOpenCodeSessionReply', () => {
  it('recovers final text and usage from the latest completed assistant message', () => {
    const reply = extractOpenCodeSessionReply(
      exportedSession([
        {
          info: {
            id: 'msg_user',
            role: 'user',
            time: { created: 1_100 },
          },
          parts: [{ type: 'text', text: 'Build a page.' }],
        },
        {
          info: {
            id: 'msg_assistant',
            role: 'assistant',
            finish: 'stop',
            cost: 0.012,
            time: { created: 1_200, completed: 1_800 },
            tokens: {
              input: 19,
              output: 7,
              reasoning: 11,
              cache: { read: 5, write: 2 },
            },
          },
          parts: [
            { type: 'step-start' },
            { type: 'reasoning', text: 'Internal reasoning must stay private.' },
            { type: 'text', text: 'Recovered ' },
            { type: 'text', text: 'answer.' },
            { type: 'step-finish', reason: 'stop' },
          ],
        },
      ]),
      { since: 1_000 },
    );

    expect(reply).toEqual({
      messageId: 'msg_assistant',
      text: 'Recovered answer.',
      completedAt: 1_800,
      usage: {
        input_tokens: 19,
        output_tokens: 7,
        thought_tokens: 11,
        cached_read_tokens: 5,
        cached_write_tokens: 2,
      },
      costUsd: 0.012,
    });
  });

  it('does not replay an assistant message created before the current process attempt', () => {
    const reply = extractOpenCodeSessionReply(
      exportedSession([
        {
          info: {
            id: 'msg_stale',
            role: 'assistant',
            time: { created: 900, completed: 950 },
          },
          parts: [{ type: 'text', text: 'Previous turn.' }],
        },
      ]),
      { since: 1_000 },
    );

    expect(reply).toBeNull();
  });

  it('does not turn reasoning-only or incomplete messages into successful replies', () => {
    const reasoningOnly = extractOpenCodeSessionReply(
      exportedSession([
        {
          info: {
            id: 'msg_reasoning',
            role: 'assistant',
            time: { created: 1_100, completed: 1_200 },
          },
          parts: [{ type: 'reasoning', text: 'Still thinking.' }],
        },
      ]),
      { since: 1_000 },
    );
    const incomplete = extractOpenCodeSessionReply(
      exportedSession([
        {
          info: {
            id: 'msg_incomplete',
            role: 'assistant',
            time: { created: 1_100 },
          },
          parts: [{ type: 'text', text: 'Partial answer.' }],
        },
      ]),
      { since: 1_000 },
    );

    expect(reasoningOnly).toBeNull();
    expect(incomplete).toBeNull();
  });

  it('does not recover a completed assistant message carrying an error', () => {
    const reply = extractOpenCodeSessionReply(
      exportedSession([
        {
          info: {
            id: 'msg_failed',
            role: 'assistant',
            finish: 'stop',
            error: { name: 'APIError', message: 'stream failed' },
            time: { created: 1_100, completed: 1_200 },
          },
          parts: [{ type: 'text', text: 'Partial text before failure.' }],
        },
      ]),
      { since: 1_000 },
    );

    expect(reply).toBeNull();
  });

  it.each(['tool-calls', 'length'])(
    'does not recover a nonfinal %s assistant message',
    (finish) => {
      const reply = extractOpenCodeSessionReply(
        exportedSession([
          {
            info: {
              id: `msg_${finish}`,
              role: 'assistant',
              finish,
              time: { created: 1_100, completed: 1_200 },
            },
            parts: [{ type: 'text', text: 'Not a complete final answer.' }],
          },
        ]),
        { since: 1_000 },
      );

      expect(reply).toBeNull();
    },
  );
});
