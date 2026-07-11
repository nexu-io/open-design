// @vitest-environment jsdom
//
// The conversation & message core: loading a project's conversation list
// (creating one if none exist), syncing the active conversation with the
// routed conversation id, loading a conversation's messages, and every
// message-persistence helper built on top of that load — against a fake
// `ProjectViewTransportPort`. `conversations`/`activeConversationId`/`messages`
// and the cross-cutting UI state their loads reset stay owned by the caller
// (mirrors the orchestrator), so the harness below holds real `useState` for
// the reactive values the hook's own effects write back into, with every spy
// pinned via `useRef` so its identity (and call history) survives the
// re-renders those effects trigger — a plain `vi.fn()` declared inline would
// otherwise be silently replaced with a fresh, uncalled mock on every render.
import { act, renderHook } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useConversationMessages } from '../../../src/features/project-view/hooks/useConversationMessages.hooks';
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
    ...overrides,
  };
}

/** Harness mirroring the orchestrator's cross-cutting state. `routeConversationId`
 *  is a plain passthrough prop (so `rerender` can change it, exactly like the
 *  router does in production); `activeConversationId`/`conversations`/
 *  `messageLoadRetryNonce` are real `useState` the hook's own effects write
 *  into, exactly like the orchestrator's `useState` declarations. */
function useHarness(port: ProjectViewTransportPort, props: { routeConversationId: string | null }) {
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  const [conversations, setConversationsState] = useState<Conversation[]>([]);
  const [messageLoadRetryNonce, setMessageLoadRetryNonceState] = useState(0);
  const setActiveConversationId = useRef(
    vi.fn((id: string | null) => setActiveConversationIdState(id)),
  ).current;
  const setConversations = useRef(
    vi.fn((next: Conversation[] | ((curr: Conversation[]) => Conversation[])) =>
      setConversationsState(next),
    ),
  ).current;
  const setMessageLoadRetryNonce = useRef(
    vi.fn((next: number | ((curr: number) => number)) => setMessageLoadRetryNonceState(next)),
  ).current;
  const messagesConversationIdRef = useRef<string | null>(null);
  const streamingConversationIdRef = useRef<string | null>(null);
  const savedArtifactRef = useRef<string | null>(null);
  const lastSyncedConversationIdRef = useRef<string | null>(null);
  const setMessagesConversationId = useRef(vi.fn()).current;
  const setFailedMessagesConversationId = useRef(vi.fn()).current;
  const setConversationLoadError = useRef(vi.fn()).current;
  const setMessages = useRef(vi.fn()).current;
  const setMessagesInitialized = useRef(vi.fn()).current;
  const setPreviewComments = useRef(vi.fn()).current;
  const setAttachedComments = useRef(vi.fn()).current;
  const setStreaming = useRef(vi.fn()).current;
  const setStreamingConversationId = useRef(vi.fn()).current;
  const setError = useRef(vi.fn()).current;
  const setArtifact = useRef(vi.fn()).current;
  const scheduleProjectTimeout = useRef(
    vi.fn((callback: () => void) => {
      callback();
      return null;
    }),
  ).current;

  const controller = useConversationMessages(
    port,
    'p1',
    props.routeConversationId,
    conversations,
    activeConversationId,
    setActiveConversationId,
    setConversations,
    setMessagesConversationId,
    setFailedMessagesConversationId,
    messageLoadRetryNonce,
    setMessageLoadRetryNonce,
    setConversationLoadError,
    setMessages,
    messagesConversationIdRef,
    setMessagesInitialized,
    setPreviewComments,
    setAttachedComments,
    setStreaming,
    streamingConversationIdRef,
    setStreamingConversationId,
    setError,
    setArtifact,
    savedArtifactRef,
    lastSyncedConversationIdRef,
    scheduleProjectTimeout,
  );

  return {
    controller,
    activeConversationId,
    conversations,
    messagesConversationIdRef,
    lastSyncedConversationIdRef,
    setActiveConversationId,
    setConversations,
    setMessagesConversationId,
    setFailedMessagesConversationId,
    setConversationLoadError,
    setMessages,
    setMessagesInitialized,
    setPreviewComments,
    setAttachedComments,
    setStreaming,
    setStreamingConversationId,
    setError,
    setArtifact,
    scheduleProjectTimeout,
  };
}

/** Mounts the harness and flushes the project-switch effect's async work
 *  (two microtask ticks: the `await port.listConversations(...)` and the
 *  branch it takes) so tests that only care about a later effect, or the
 *  hook's manual functions, start from a settled, known state. */
async function mountAndSettle(port: ProjectViewTransportPort, routeConversationId: string | null = null) {
  const view = renderHook(
    ({ routeConversationId: rid }) => useHarness(port, { routeConversationId: rid }),
    { initialProps: { routeConversationId } },
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return view;
}

describe('useConversationMessages', () => {
  describe('project-switch effect', () => {
    it('picks the first conversation when no route id matches', async () => {
      const list = [makeConversation({ id: 'c1' }), makeConversation({ id: 'c2' })];
      const port = makePort({ listConversations: vi.fn(async () => list) });
      const { result } = await mountAndSettle(port);
      expect(port.listConversations).toHaveBeenCalledWith('p1');
      expect(result.current.setConversations).toHaveBeenCalledWith(list);
      expect(result.current.setActiveConversationId).toHaveBeenCalledWith('c1');
      expect(result.current.activeConversationId).toBe('c1');
    });

    it('prefers the routed conversation id when present in the loaded list', async () => {
      const list = [makeConversation({ id: 'c1' }), makeConversation({ id: 'c2' })];
      const port = makePort({ listConversations: vi.fn(async () => list) });
      const { result } = await mountAndSettle(port, 'c2');
      expect(result.current.setActiveConversationId).toHaveBeenCalledWith('c2');
      expect(result.current.activeConversationId).toBe('c2');
    });

    it('creates a conversation when none exist', async () => {
      const fresh = makeConversation({ id: 'new1' });
      const port = makePort({
        listConversations: vi.fn(async () => []),
        createConversation: vi.fn(async () => fresh),
      });
      const { result } = await mountAndSettle(port);
      expect(port.createConversation).toHaveBeenCalledWith('p1');
      expect(result.current.setConversations).toHaveBeenCalledWith([fresh]);
      expect(result.current.setActiveConversationId).toHaveBeenCalledWith('new1');
    });

    it('surfaces an error when the conversation list fails to load and creation also fails', async () => {
      const port = makePort({
        listConversations: vi.fn(async () => {
          throw new Error('boom');
        }),
      });
      const { result } = await mountAndSettle(port);
      expect(result.current.setConversationLoadError).toHaveBeenCalledWith('boom');
      expect(result.current.setError).toHaveBeenCalledWith('boom');
      expect(result.current.activeConversationId).toBeNull();
    });
  });

  describe('routed-conversation-id sync effect', () => {
    it('switches the active conversation when the route points at an already-loaded id', async () => {
      const list = [makeConversation({ id: 'c1' }), makeConversation({ id: 'c2' })];
      const port = makePort({ listConversations: vi.fn(async () => list) });
      const { result, rerender } = await mountAndSettle(port);
      expect(result.current.activeConversationId).toBe('c1');
      result.current.setActiveConversationId.mockClear();
      rerender({ routeConversationId: 'c2' });
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.setActiveConversationId).toHaveBeenCalledWith('c2');
    });

    it('is a no-op when the routed id matches the conversation this view last pushed to the URL', async () => {
      const list = [makeConversation({ id: 'c1' }), makeConversation({ id: 'c2' })];
      const port = makePort({ listConversations: vi.fn(async () => list) });
      const { result, rerender } = await mountAndSettle(port);
      result.current.lastSyncedConversationIdRef.current = 'c2';
      result.current.setActiveConversationId.mockClear();
      rerender({ routeConversationId: 'c2' });
      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.setActiveConversationId).not.toHaveBeenCalled();
    });
  });

  describe('message-load effect', () => {
    it('resets chat state when there is no active conversation', () => {
      const port = makePort();
      const { result } = renderHook(() => useHarness(port, { routeConversationId: null }));
      expect(result.current.setMessages).toHaveBeenCalledWith([]);
      expect(result.current.setMessagesInitialized).toHaveBeenCalledWith(false);
      expect(port.listMessages).not.toHaveBeenCalled();
    });

    it('loads messages and preview comments for the active conversation', async () => {
      const messages = [makeMessage({ id: 'm1' })];
      const comments = [{ id: 'pc1' }] as never;
      const port = makePort({
        listConversations: vi.fn(async () => [makeConversation({ id: 'c1' })]),
        listMessages: vi.fn(async () => messages),
        fetchPreviewComments: vi.fn(async () => comments),
      });
      const { result } = await mountAndSettle(port);
      expect(port.listMessages).toHaveBeenCalledWith('p1', 'c1');
      expect(port.fetchPreviewComments).toHaveBeenCalledWith('p1', 'c1');
      expect(result.current.setMessages).toHaveBeenCalledWith(messages);
      expect(result.current.setPreviewComments).toHaveBeenCalledWith(comments);
      expect(result.current.setMessagesInitialized).toHaveBeenCalledWith(true);
      expect(result.current.messagesConversationIdRef.current).toBe('c1');
    });

    it('surfaces an error when the message load fails', async () => {
      const port = makePort({
        listConversations: vi.fn(async () => [makeConversation({ id: 'c1' })]),
        listMessages: vi.fn(async () => {
          throw new Error('load failed');
        }),
      });
      const { result } = await mountAndSettle(port);
      expect(result.current.setError).toHaveBeenCalledWith('load failed');
      expect(result.current.setFailedMessagesConversationId).toHaveBeenCalledWith('c1');
    });
  });

  describe('persistMessage', () => {
    it('is a no-op with no active conversation', () => {
      const port = makePort();
      const { result } = renderHook(() => useHarness(port, { routeConversationId: null }));
      act(() => result.current.controller.persistMessage(makeMessage()));
      expect(port.saveMessage).not.toHaveBeenCalled();
    });

    it('skips a phantom daemon run message', async () => {
      const port = makePort({ listConversations: vi.fn(async () => [makeConversation({ id: 'c1' })]) });
      const { result } = await mountAndSettle(port);
      const phantom = makeMessage({ role: 'assistant', runStatus: 'running', runId: undefined });
      act(() => result.current.controller.persistMessage(phantom));
      expect(port.saveMessage).not.toHaveBeenCalled();
    });

    it('persists a normal message', async () => {
      const port = makePort({ listConversations: vi.fn(async () => [makeConversation({ id: 'c1' })]) });
      const { result } = await mountAndSettle(port);
      const message = makeMessage();
      act(() => result.current.controller.persistMessage(message));
      expect(port.saveMessage).toHaveBeenCalledWith('p1', 'c1', message, undefined);
    });
  });

  describe('appendConversationMessage / replaceConversationMessage', () => {
    it('appends when the conversation matches the active one and persists', async () => {
      const port = makePort({ listConversations: vi.fn(async () => [makeConversation({ id: 'c1' })]) });
      const { result } = await mountAndSettle(port);
      result.current.setMessages.mockClear();
      const message = makeMessage();
      act(() => result.current.controller.appendConversationMessage('c1', message));
      expect(result.current.setMessages).toHaveBeenCalled();
      expect(port.saveMessage).toHaveBeenCalledWith('p1', 'c1', message, undefined);
    });

    it('replaces without touching message state when the conversation does not match, still persists', async () => {
      const port = makePort({ listConversations: vi.fn(async () => [makeConversation({ id: 'c1' })]) });
      const { result } = await mountAndSettle(port);
      result.current.setMessages.mockClear();
      const message = makeMessage();
      act(() => result.current.controller.replaceConversationMessage('other', message));
      expect(result.current.setMessages).not.toHaveBeenCalled();
      expect(port.saveMessage).toHaveBeenCalledWith('p1', 'other', message, undefined);
    });
  });

  describe('refreshConversationMessagesFromServer / scheduleConversationMessageRefresh', () => {
    it('bails when the conversation-id ref no longer matches', async () => {
      const port = makePort({ listConversations: vi.fn(async () => [makeConversation({ id: 'c1' })]) });
      const { result } = await mountAndSettle(port);
      result.current.messagesConversationIdRef.current = 'other';
      (port.listMessages as ReturnType<typeof vi.fn>).mockClear();
      await act(async () => {
        await result.current.controller.refreshConversationMessagesFromServer('c1');
      });
      expect(port.listMessages).not.toHaveBeenCalled();
    });

    it('merges freshly-fetched server messages when the ref still matches', async () => {
      const serverMessages = [makeMessage({ id: 'm2' })];
      const port = makePort({
        listConversations: vi.fn(async () => [makeConversation({ id: 'c1' })]),
        listMessages: vi.fn(async () => serverMessages),
      });
      const { result } = await mountAndSettle(port);
      result.current.setMessages.mockClear();
      result.current.setMessagesInitialized.mockClear();
      await act(async () => {
        await result.current.controller.refreshConversationMessagesFromServer('c1');
      });
      expect(result.current.setMessages).toHaveBeenCalled();
      expect(result.current.setMessagesInitialized).toHaveBeenCalledWith(true);
      expect(result.current.setMessagesConversationId).toHaveBeenCalledWith('c1');
    });

    it('schedules a refresh via the injected timeout', async () => {
      const port = makePort({ listConversations: vi.fn(async () => [makeConversation({ id: 'c1' })]) });
      const { result } = await mountAndSettle(port);
      (port.listMessages as ReturnType<typeof vi.fn>).mockClear();
      act(() => result.current.controller.scheduleConversationMessageRefresh('c1'));
      expect(result.current.scheduleProjectTimeout).toHaveBeenCalled();
      await act(async () => {
        await Promise.resolve();
      });
      expect(port.listMessages).toHaveBeenCalledWith('p1', 'c1');
    });
  });
});
