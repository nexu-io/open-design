// @vitest-environment jsdom
//
// The conversation-management cluster (create/select/delete/rename/change
// session mode/fork a project's conversations) against a fake
// `ProjectViewTransportPort`. `conversations`/`activeConversationId` and the
// chat-transcript state they drive stay owned by the caller (mirrors the
// orchestrator), so every test supplies its own setter spies and asserts on
// what they were called with, exactly like the hook's real caller does.
import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useConversationManagement } from '../../../src/features/project-view/hooks/useConversationManagement.hooks';
import type { ProjectViewTransportPort } from '../../../src/features/project-view/ports';
import type { ChatMessage, Conversation } from '../../../src/types';

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    projectId: 'p1',
    title: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'user',
    content: 'hi',
    ...overrides,
  };
}

function makePort(overrides: Partial<ProjectViewTransportPort> = {}): ProjectViewTransportPort {
  return {
    readProjectRawText: vi.fn(async () => null),
    extractMemory: vi.fn(async () => {}),
    loadQueuedChatSends: vi.fn(() => []),
    saveQueuedChatSends: vi.fn(),
    readSavedChatPanelWidth: vi.fn(() => 460),
    saveChatPanelWidth: vi.fn(),
    readAutoSendAttachments: vi.fn(() => []),
    readAutoSendContext: vi.fn(() => null),
    clearAutoSendSession: vi.fn(),
    markDesignSystemAuditAutoRepairEligible: vi.fn(),
    consumeDesignSystemAuditAutoRepair: vi.fn(() => false),
    clearDesignSystemAuditAutoRepair: vi.fn(),
    subscribeSplitResize: vi.fn(() => () => {}),
    getSplitIsRtl: vi.fn(() => false),
    subscribeChatPanelPointerDrag: vi.fn(() => () => {}),
    checkGithubConnected: vi.fn(async () => false),
    subscribeGithubConnectRefreshTriggers: vi.fn(() => () => {}),
    fetchAppliedPluginSnapshot: vi.fn(async () => null),
    listPlugins: vi.fn(async () => []),
    duplicatePluginAsProject: vi.fn(async () => {
      throw new Error('not implemented in this fake');
    }),
    copyTextToClipboard: vi.fn(async () => true),
    subscribeCapturedKeyDown: vi.fn(() => () => {}),
    patchProjectMetadata: vi.fn(async () => {}),
    patchProjectName: vi.fn(async () => {}),
    listConversations: vi.fn(async () => []),
    createConversation: vi.fn(async () => null),
    patchConversation: vi.fn(async () => null),
    deleteConversation: vi.fn(async () => true),
    fetchRunStatus: vi.fn(async () => null),
    subscribeBufferedTextFlushTriggers: vi.fn(() => () => {}),
    isDocumentHidden: vi.fn(() => false),
    isDocumentFocused: vi.fn(() => true),
    focusWindow: vi.fn(),
    listMessages: vi.fn(async () => []),
    saveMessage: vi.fn(async () => {}),
    fetchPreviewComments: vi.fn(async () => []),
    uploadPreviewCommentImages: vi.fn(async () => []),
    savePreviewComment: vi.fn(async () => null),
    patchPreviewCommentStatus: vi.fn(async () => null),
    deletePreviewComment: vi.fn(async () => true),
    loadOpenTabs: vi.fn(async () => ({ tabs: [], active: null })),
    cacheOpenTabsLocally: vi.fn((_projectId, state) => state),
    persistOpenTabsToDaemon: vi.fn(async () => {}),
    fetchProjectFiles: vi.fn(async () => []),
    fetchLiveArtifacts: vi.fn(async () => []),
    writeProjectTextFile: vi.fn(async () => null),
    subscribeProjectFileEvents: vi.fn(() => () => {}),
    hasAutoSendFirstMessageFlag: vi.fn(() => false),
    readAmrGateOkFlag: vi.fn(() => false),
    fetchProjectFileText: vi.fn(async () => null),
    installGeneratedPluginFolder: vi.fn(async () => ({ ok: true, message: 'installed', warnings: [], log: [] })),
    startGeneratedPluginShareTask: vi.fn(async () => {
      throw new Error('not implemented in this fake');
    }),
    waitGeneratedPluginShareTask: vi.fn(async () => {
      throw new Error('not implemented in this fake');
    }),
    finalizeBrandProject: vi.fn(async () => ({ ok: true as const, result: {} as never })),
    fetchDesignSystemPackageAudit: vi.fn(async () => null),
    patchProjectDesignSystemId: vi.fn(async () => {}),
    fetchAmrLoginStatus: vi.fn(async () => ({ loggedIn: false })),
    ...overrides,
  };
}

const noopT = ((key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key) as never;

/** Harness mirroring the orchestrator's cross-cutting state, so hook calls
 *  can be inspected as spies while still exercising a real `useRef`. */
function useHarness(port: ProjectViewTransportPort, overrides: Partial<{
  activeConversationId: string | null;
  failedMessagesConversationId: string | null;
  messages: ChatMessage[];
  activeConversationTitle: string | null;
  activeSessionMode: 'design' | 'plan';
}> = {}) {
  const messagesConversationIdRef = useRef<string | null>(null);
  const streamingConversationIdRef = useRef<string | null>(null);
  const projectIdRef = useRef('p1');
  const conversationsRefreshTokenRef = useRef(0);
  const setConversations = vi.fn();
  const setActiveConversationId = vi.fn();
  const setFailedMessagesConversationId = vi.fn();
  const setMessages = vi.fn();
  const setMessagesConversationId = vi.fn();
  const setStreaming = vi.fn();
  const setStreamingConversationId = vi.fn();
  const setPreviewComments = vi.fn();
  const setAttachedComments = vi.fn();
  const setArtifact = vi.fn();
  const setConversationLoadError = vi.fn();
  const setError = vi.fn();
  const setMessageLoadRetryNonce = vi.fn();
  const onProjectsRefresh = vi.fn();

  const controller = useConversationManagement(
    port,
    'p1',
    overrides.activeConversationId ?? null,
    setConversations,
    setActiveConversationId,
    overrides.failedMessagesConversationId ?? null,
    setFailedMessagesConversationId,
    overrides.messages ?? [],
    setMessages,
    messagesConversationIdRef,
    setMessagesConversationId,
    setStreaming,
    streamingConversationIdRef,
    setStreamingConversationId,
    setPreviewComments,
    setAttachedComments,
    setArtifact,
    setConversationLoadError,
    setError,
    setMessageLoadRetryNonce,
    overrides.activeConversationTitle ?? null,
    overrides.activeSessionMode ?? 'design',
    null,
    onProjectsRefresh,
    projectIdRef,
    conversationsRefreshTokenRef,
    noopT,
  );

  return {
    controller,
    messagesConversationIdRef,
    streamingConversationIdRef,
    projectIdRef,
    setConversations,
    setActiveConversationId,
    setFailedMessagesConversationId,
    setMessages,
    setMessagesConversationId,
    setStreaming,
    setStreamingConversationId,
    setPreviewComments,
    setAttachedComments,
    setArtifact,
    setConversationLoadError,
    setError,
    setMessageLoadRetryNonce,
    onProjectsRefresh,
  };
}

describe('useConversationManagement', () => {
  describe('handleNewConversation', () => {
    it('is a no-op when the active conversation is already loaded and empty', async () => {
      const port = makePort();
      const { result } = renderHook(() =>
        useHarness(port, { activeConversationId: 'c1', messages: [] }),
      );
      // Simulate the ref already pointing at the active (empty) conversation.
      result.current.messagesConversationIdRef.current = 'c1';
      await act(async () => {
        await result.current.controller.handleNewConversation();
      });
      expect(port.createConversation).not.toHaveBeenCalled();
    });

    it('creates a conversation, resets chat state, and navigates', async () => {
      const fresh = makeConversation({ id: 'new1' });
      const port = makePort({ createConversation: vi.fn(async () => fresh) });
      const { result } = renderHook(() => useHarness(port, { activeConversationId: 'c1' }));
      await act(async () => {
        await result.current.controller.handleNewConversation();
      });
      expect(port.createConversation).toHaveBeenCalledWith('p1');
      expect(result.current.setMessages).toHaveBeenCalledWith([]);
      expect(result.current.setStreaming).toHaveBeenCalledWith(false);
      expect(result.current.setActiveConversationId).toHaveBeenCalledWith('new1');
      expect(result.current.messagesConversationIdRef.current).toBe('new1');
      expect(window.location.pathname).toBe('/projects/p1/conversations/new1');
      expect(result.current.controller.creatingConversation).toBe(false);
    });

    it('surfaces an error when creation fails', async () => {
      const port = makePort({ createConversation: vi.fn(async () => null) });
      const { result } = renderHook(() => useHarness(port, { activeConversationId: 'c1' }));
      await act(async () => {
        await result.current.controller.handleNewConversation();
      });
      expect(result.current.setError).toHaveBeenCalledWith(
        'Could not create a conversation for this project.',
      );
    });
  });

  describe('handleSelectConversation', () => {
    it('is a no-op when re-selecting the active, non-failed conversation', () => {
      const port = makePort();
      const { result } = renderHook(() =>
        useHarness(port, { activeConversationId: 'c1', failedMessagesConversationId: null }),
      );
      act(() => result.current.controller.handleSelectConversation('c1'));
      expect(result.current.setActiveConversationId).not.toHaveBeenCalled();
    });

    it('resets chat state and navigates when selecting a different conversation', () => {
      const port = makePort();
      const { result } = renderHook(() => useHarness(port, { activeConversationId: 'c1' }));
      act(() => result.current.controller.handleSelectConversation('c2'));
      expect(result.current.setActiveConversationId).toHaveBeenCalledWith('c2');
      expect(result.current.setMessages).toHaveBeenCalledWith([]);
      expect(result.current.setArtifact).toHaveBeenCalledWith(null);
      expect(result.current.messagesConversationIdRef.current).toBeNull();
      expect(window.location.pathname).toBe('/projects/p1/conversations/c2');
    });

    it('re-selects the active conversation to retry a failed load', () => {
      const port = makePort();
      const { result } = renderHook(() =>
        useHarness(port, { activeConversationId: 'c1', failedMessagesConversationId: 'c1' }),
      );
      act(() => result.current.controller.handleSelectConversation('c1'));
      expect(result.current.setActiveConversationId).toHaveBeenCalledWith('c1');
      expect(result.current.setMessageLoadRetryNonce).toHaveBeenCalled();
    });
  });

  describe('refreshConversationsForProgrammaticBrandRetry', () => {
    it('applies the refreshed list when the project id is still current', async () => {
      const list = [makeConversation({ id: 'c1' })];
      const port = makePort({ listConversations: vi.fn(async () => list) });
      const { result } = renderHook(() => useHarness(port));
      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.controller.refreshConversationsForProgrammaticBrandRetry('c1');
      });
      expect(ok).toBe(true);
      expect(result.current.setConversations).toHaveBeenCalledWith(list);
    });

    it('bails without applying the list when the project changed mid-flight', async () => {
      const port = makePort({ listConversations: vi.fn(async () => [makeConversation()]) });
      const { result } = renderHook(() => useHarness(port));
      result.current.projectIdRef.current = 'other-project';
      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.controller.refreshConversationsForProgrammaticBrandRetry('c1');
      });
      expect(ok).toBe(false);
      expect(result.current.setConversations).not.toHaveBeenCalled();
    });
  });

  describe('handleDeleteConversation', () => {
    it('does nothing when the delete request fails', async () => {
      const port = makePort({ deleteConversation: vi.fn(async () => false) });
      const { result } = renderHook(() => useHarness(port));
      await act(async () => {
        await result.current.controller.handleDeleteConversation('c1');
      });
      expect(result.current.onProjectsRefresh).not.toHaveBeenCalled();
      expect(result.current.setConversations).not.toHaveBeenCalled();
    });

    it('deletes, refreshes projects, and re-derives the active conversation', async () => {
      const port = makePort({ deleteConversation: vi.fn(async () => true) });
      const { result } = renderHook(() => useHarness(port, { activeConversationId: 'c1' }));
      await act(async () => {
        await result.current.controller.handleDeleteConversation('c1');
      });
      expect(port.deleteConversation).toHaveBeenCalledWith('p1', 'c1');
      expect(result.current.onProjectsRefresh).toHaveBeenCalled();
      const updater = result.current.setConversations.mock.calls[0]![0] as (
        curr: Conversation[],
      ) => Conversation[];
      const next = updater([makeConversation({ id: 'c1' }), makeConversation({ id: 'c2' })]);
      expect(next.map((c) => c.id)).toEqual(['c2']);
      expect(result.current.setActiveConversationId).toHaveBeenCalledWith('c2');
    });

    it('re-seeds a fresh conversation when the last one is deleted', async () => {
      const fresh = makeConversation({ id: 'seed1' });
      const port = makePort({
        deleteConversation: vi.fn(async () => true),
        createConversation: vi.fn(async () => fresh),
      });
      const { result } = renderHook(() => useHarness(port, { activeConversationId: 'c1' }));
      await act(async () => {
        await result.current.controller.handleDeleteConversation('c1');
        const updater = result.current.setConversations.mock.calls[0]![0] as (
          curr: Conversation[],
        ) => Conversation[];
        updater([makeConversation({ id: 'c1' })]);
        await Promise.resolve();
      });
      expect(port.createConversation).toHaveBeenCalledWith('p1');
      expect(result.current.setConversations).toHaveBeenLastCalledWith([fresh]);
      expect(result.current.setActiveConversationId).toHaveBeenLastCalledWith('seed1');
    });
  });

  describe('handleRenameConversation', () => {
    it('optimistically updates the title and persists it', async () => {
      const port = makePort();
      const { result } = renderHook(() => useHarness(port));
      await act(async () => {
        await result.current.controller.handleRenameConversation('c1', '  New Title  ');
      });
      const updater = result.current.setConversations.mock.calls[0]![0] as (
        curr: Conversation[],
      ) => Conversation[];
      const next = updater([makeConversation({ id: 'c1', title: 'Old' })]);
      expect(next[0]!.title).toBe('New Title');
      expect(port.patchConversation).toHaveBeenCalledWith('p1', 'c1', { title: 'New Title' });
    });

    it('clears the title when given a blank string', async () => {
      const port = makePort();
      const { result } = renderHook(() => useHarness(port));
      await act(async () => {
        await result.current.controller.handleRenameConversation('c1', '   ');
      });
      expect(port.patchConversation).toHaveBeenCalledWith('p1', 'c1', { title: null });
    });
  });

  describe('handleConversationSessionModeChange / handleActiveConversationSessionModeChange', () => {
    it('optimistically applies the mode then merges the server response', async () => {
      const updated = makeConversation({ id: 'c1', sessionMode: 'plan' });
      const port = makePort({ patchConversation: vi.fn(async () => updated) });
      const { result } = renderHook(() => useHarness(port));
      await act(async () => {
        await result.current.controller.handleConversationSessionModeChange('c1', 'plan');
      });
      expect(port.patchConversation).toHaveBeenCalledWith('p1', 'c1', { sessionMode: 'plan' });
      expect(result.current.setConversations).toHaveBeenCalledTimes(2);
    });

    it('is a no-op with no active conversation', () => {
      const port = makePort();
      const { result } = renderHook(() => useHarness(port, { activeConversationId: null }));
      act(() => result.current.controller.handleActiveConversationSessionModeChange('plan'));
      expect(port.patchConversation).not.toHaveBeenCalled();
    });

    it('delegates to the active conversation when one is set', async () => {
      const port = makePort();
      const { result } = renderHook(() => useHarness(port, { activeConversationId: 'c1' }));
      await act(async () => {
        result.current.controller.handleActiveConversationSessionModeChange('plan');
        await Promise.resolve();
      });
      expect(port.patchConversation).toHaveBeenCalledWith('p1', 'c1', { sessionMode: 'plan' });
    });
  });

  describe('handleForkFromMessage', () => {
    it('is a no-op with no active conversation', async () => {
      const port = makePort();
      const { result } = renderHook(() => useHarness(port, { activeConversationId: null }));
      await act(async () => {
        await result.current.controller.handleForkFromMessage(makeMessage());
      });
      expect(port.createConversation).not.toHaveBeenCalled();
    });

    it('seeds the fork from messages up to the fork point and navigates', async () => {
      const fresh = makeConversation({ id: 'fork1' });
      const port = makePort({ createConversation: vi.fn(async () => fresh) });
      const seedMessage = makeMessage({ id: 'm1' });
      const trailingMessage = makeMessage({ id: 'm2' });
      const { result } = renderHook(() =>
        useHarness(port, {
          activeConversationId: 'c1',
          messages: [seedMessage, trailingMessage],
          activeConversationTitle: 'Source Chat',
          activeSessionMode: 'design',
        }),
      );
      await act(async () => {
        await result.current.controller.handleForkFromMessage(seedMessage);
      });
      expect(port.createConversation).toHaveBeenCalledWith(
        'p1',
        expect.stringContaining('Source Chat'),
        expect.objectContaining({
          seedFromConversationId: 'c1',
          forkAfterMessageId: 'm1',
          sessionMode: 'design',
          seedMessages: [seedMessage],
        }),
      );
      expect(result.current.setActiveConversationId).toHaveBeenCalledWith('fork1');
      expect(result.current.onProjectsRefresh).toHaveBeenCalled();
      expect(window.location.pathname).toBe('/projects/p1/conversations/fork1');
    });

    it('surfaces a translated error when the fork request fails', async () => {
      const port = makePort({ createConversation: vi.fn(async () => null) });
      const { result } = renderHook(() =>
        useHarness(port, { activeConversationId: 'c1', messages: [makeMessage()] }),
      );
      await act(async () => {
        await result.current.controller.handleForkFromMessage(makeMessage());
      });
      expect(result.current.setError).toHaveBeenCalledWith('chat.forkConversationFailed');
      expect(result.current.controller.forkingMessageId).toBeNull();
    });
  });
});
