// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useConversationChat } from '../../../src/components/workspace/useConversationChat';
import { streamViaDaemon } from '../../../src/providers/daemon';
import { listMessages, saveMessage } from '../../../src/state/projects';
import type { AppConfig } from '../../../src/types';

vi.mock('../../../src/providers/daemon', async () => {
  const actual = await vi.importActual<typeof import('../../../src/providers/daemon')>(
    '../../../src/providers/daemon',
  );
  return { ...actual, streamViaDaemon: vi.fn() };
});

vi.mock('../../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../../src/state/projects')>(
    '../../../src/state/projects',
  );
  return {
    ...actual,
    listMessages: vi.fn(),
    saveMessage: vi.fn(),
  };
});

const mockedListMessages = vi.mocked(listMessages);
const mockedSaveMessage = vi.mocked(saveMessage);
const mockedStreamViaDaemon = vi.mocked(streamViaDaemon);

const config = {
  mode: 'daemon',
  agentId: 'codex',
  agentModels: {},
} as AppConfig;

describe('useConversationChat authoritative message loading', () => {
  beforeEach(() => {
    mockedListMessages.mockRejectedValue(new Error('workspace directory unavailable'));
    mockedSaveMessage.mockResolvedValue(null);
    mockedStreamViaDaemon.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps send and retry disabled when the persisted transcript cannot be loaded', async () => {
    const hook = renderHook(() =>
      useConversationChat('project-1', 'conversation-1', {
        config,
        agentsById: new Map(),
        locale: 'en',
        sessionMode: 'design',
      }),
    );

    await waitFor(() => {
      expect(hook.result.current.loading).toBe(false);
      expect(hook.result.current.error).toBe('workspace directory unavailable');
      expect(hook.result.current.sendDisabled).toBe(true);
    });

    act(() => {
      hook.result.current.onSend('must not send without history', [], []);
      hook.result.current.onRetry({
        id: 'failed-assistant',
        role: 'assistant',
        content: '',
        createdAt: 1,
        runStatus: 'failed',
      });
    });

    expect(mockedStreamViaDaemon).not.toHaveBeenCalled();
    expect(mockedSaveMessage).not.toHaveBeenCalled();
  });
});
