import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { ChatMessage } from '@open-design/contracts';
import { describe, expect, it, vi } from 'vitest';
import { streamMessages } from '../../src/http/message-stream.js';

const message: ChatMessage = { id: 'message', role: 'assistant', content: 'Complete answer' };

function makeResponse() {
  return Object.assign(new EventEmitter(), {
    destroyed: false,
    type: vi.fn(),
    setHeader: vi.fn(),
    write: vi.fn(() => true),
    end: vi.fn(),
  });
}

describe('message stream writer', () => {
  it('waits for each drain before serializing another message or completing', async () => {
    const response = makeResponse();
    let secondWrite!: () => void;
    const secondWritten = new Promise<void>((resolve) => { secondWrite = resolve; });
    response.write.mockImplementationOnce(() => false).mockImplementationOnce(() => {
      secondWrite();
      return false;
    });
    const pending = streamMessages(response as unknown as Response, [message, message]);
    expect(response.write).toHaveBeenCalledTimes(1);
    expect(response.end).not.toHaveBeenCalled();
    response.emit('drain');
    await secondWritten;
    expect(response.write).toHaveBeenCalledTimes(2);
    expect(response.end).not.toHaveBeenCalled();
    response.emit('drain');
    await pending;
    expect(response.end).toHaveBeenCalledWith('{"type":"end","count":2}\n');
    expect(response.listenerCount('close')).toBe(0);
  });

  it('releases a drain wait on disconnect without a completion record', async () => {
    const response = makeResponse();
    response.write.mockReturnValue(false);
    const pending = streamMessages(response as unknown as Response, [message, message]);
    response.destroyed = true;
    response.emit('close');
    await pending;
    expect(response.write).toHaveBeenCalledOnce();
    expect(response.end).not.toHaveBeenCalled();
    expect(response.listenerCount('drain')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('does not emit any message for a previously disconnected client', async () => {
    const response = makeResponse();
    response.destroyed = true;
    await streamMessages(response as unknown as Response, [message]);
    expect(response.write).not.toHaveBeenCalled();
    expect(response.end).not.toHaveBeenCalled();
  });

  it('propagates serialization failure without a successful completion record', async () => {
    const response = makeResponse();
    const error = new RangeError('Invalid string length');
    const invalidMessage = { ...message, toJSON() { throw error; } };
    await expect(streamMessages(response as unknown as Response, [invalidMessage])).rejects.toBe(error);
    expect(response.end).not.toHaveBeenCalled();
    expect(response.listenerCount('close')).toBe(0);
  });
});
