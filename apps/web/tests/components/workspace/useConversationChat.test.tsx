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

describe('useConversationChat run failures', () => {
  beforeEach(() => {
    mockedListMessages.mockResolvedValue([]);
    mockedSaveMessage.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // Side chat runs through the same failure card, so it needs the same original
  // error under 「view details」 as the main chat panel.
  it('threads the captured stderr tail onto the failed assistant message', async () => {
    const stderrTail =
      'Error: dsh: plugin tree failed to load: credentials-local: the value for "version" in /Users/tester/.dsh/.credentials.yaml must be a string';
    mockedStreamViaDaemon.mockImplementation(async (options: any) => {
      const err = new Error('DeepSeek Harness profile exited without a terminal result.') as Error & {
        code?: string;
        stderrTail?: string;
      };
      err.code = 'DSH_PROFILE_MISSING_RESULT';
      err.stderrTail = stderrTail;
      options.handlers.onError(err);
    });

    const hook = renderHook(() =>
      useConversationChat('project-1', 'conversation-1', {
        config,
        agentsById: new Map(),
        locale: 'en',
        sessionMode: 'design',
      }),
    );

    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    await act(async () => {
      await hook.result.current.onSend('do the thing', [], []);
    });

    await waitFor(() => {
      const failed = hook.result.current.messages.find(
        (m) => m.role === 'assistant' && m.runStatus === 'failed',
      );
      const errorEvent = failed?.events?.find(
        (event) => event.kind === 'status' && event.label === 'error',
      ) as { stderrTail?: string } | undefined;
      expect(errorEvent?.stderrTail).toBe(stderrTail);
    });
  });
});
