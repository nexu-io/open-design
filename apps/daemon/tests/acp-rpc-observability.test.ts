import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { sendRpc } from '../src/agent-protocol/acp/rpc.js';

describe('ACP RPC send observability', () => {
  it('measures the exact newline-terminated UTF-8 frame written to stdin', () => {
    let written = '';
    const observations: Array<{ method: string; frameBytes: number }> = [];
    const writable = new PassThrough();
    writable.on('data', (chunk) => {
      written += String(chunk);
    });
    const params = {
      prompt: [{ type: 'text', text: '多字节\n"escaped"\\tail' }],
    };

    sendRpc(writable, 7, 'session/prompt', params, (observation) => {
      observations.push(observation);
    });

    const expectedFrame = `${JSON.stringify({
      jsonrpc: '2.0',
      id: 7,
      method: 'session/prompt',
      params,
    })}\n`;
    expect(written).toBe(expectedFrame);
    expect(observations).toEqual([
      {
        method: 'session/prompt',
        frameBytes: Buffer.byteLength(expectedFrame, 'utf8'),
      },
    ]);
    expect(observations[0]?.frameBytes).not.toBe(expectedFrame.length);
  });

  it('never lets an observability callback failure block the write', () => {
    let written = '';
    const writable = new PassThrough();
    writable.on('data', (chunk) => {
      written += String(chunk);
    });

    expect(() => {
      sendRpc(writable, 9, 'session/prompt', { prompt: [] }, () => {
        throw new Error('diagnostic sink unavailable');
      });
    }).not.toThrow();
    expect(written).toBe(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 9,
      method: 'session/prompt',
      params: { prompt: [] },
    })}\n`);
  });
});
