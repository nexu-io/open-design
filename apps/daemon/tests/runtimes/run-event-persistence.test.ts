import { describe, expect, it, vi } from 'vitest';
import { persistRunEventToAssistantMessage } from '../../src/runtimes/run-event-persistence.js';

describe('persistRunEventToAssistantMessage', () => {
  it('maps and appends persisted agent events', () => {
    const appendEvent = vi.fn();

    persistRunEventToAssistantMessage(appendEvent, { assistantMessageId: 'message-1' }, 'stdout', { chunk: 'hello' });

    expect(appendEvent).toHaveBeenCalledWith('message-1', { kind: 'text', text: 'hello' });
  });

  it('skips absent messages and unmappable events', () => {
    const appendEvent = vi.fn();

    persistRunEventToAssistantMessage(appendEvent, {}, 'stdout', { chunk: 'hello' });
    persistRunEventToAssistantMessage(appendEvent, { assistantMessageId: 'message-1' }, 'unknown', {});

    expect(appendEvent).not.toHaveBeenCalled();
  });

  it('contains writer failures and reports them', () => {
    const failure = new Error('db unavailable');
    const warn = vi.fn();

    persistRunEventToAssistantMessage(() => { throw failure; }, { assistantMessageId: 'message-1' }, 'stdout', { chunk: 'hello' }, warn);

    expect(warn).toHaveBeenCalledWith('[runs] message event persistence failed', failure);
  });
});
