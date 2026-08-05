import { describe, expect, it, vi } from 'vitest';
import { pinAssistantMessageOnRunCreate } from '../../src/runtimes/run-message-pinning.js';

const run = {
  id: 'run-1',
  conversationId: 'conversation-1',
  assistantMessageId: 'message-1',
  status: 'queued',
  createdAt: 123,
  agentId: 'codex',
};

describe('pinAssistantMessageOnRunCreate', () => {
  it('updates an existing message without downgrading terminal state', () => {
    const update = vi.fn();
    const db = { prepare: vi.fn(() => ({ get: () => ({ id: 'message-1' }), run: update })) };

    pinAssistantMessageOnRunCreate(db, run, vi.fn());

    expect(update).toHaveBeenCalledWith('run-1', 'queued', 123, 'message-1');
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('run_status IN'));
  });

  it('creates the assistant message when no row exists', () => {
    const upsert = vi.fn();
    const db = { prepare: vi.fn(() => ({ get: () => undefined, run: vi.fn() })) };

    pinAssistantMessageOnRunCreate(db, run, upsert);

    expect(upsert).toHaveBeenCalledWith(db, 'conversation-1', {
      id: 'message-1',
      role: 'assistant',
      content: '',
      agentId: 'codex',
      events: [],
      runId: 'run-1',
      runStatus: 'queued',
      startedAt: 123,
    });
  });

  it('does nothing without the conversation or assistant message identity', () => {
    const db = { prepare: vi.fn() };
    const upsert = vi.fn();

    pinAssistantMessageOnRunCreate(db, { ...run, conversationId: null }, upsert);
    pinAssistantMessageOnRunCreate(db, { ...run, assistantMessageId: null }, upsert);

    expect(db.prepare).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
