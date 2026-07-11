// Feature-local hook for the conversation & message core: loading a project's
// conversation list (creating one if none exist), keeping the active
// conversation in sync with the routed conversation id, loading a
// conversation's messages, and every message-persistence helper
// (persist/update/append/replace/refresh) built on top of that load.
//
// `conversations`/`activeConversationId`/`messages` and the many pieces of
// cross-cutting UI state their loads reset (`previewComments`,
// `attachedComments`, `streaming`, `artifact`, `error`) stay owned by the
// orchestrator — nearly every other cluster reads or writes them too — so
// this hook takes them and their setters as params, exactly like
// `useConversationManagement` (its sibling cluster) already does. It owns
// only what's genuinely local: the routed-conversation "already reacted to
// this id" tracking ref.
import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Artifact, ChatMessage, Conversation, PreviewComment } from '../../../types';
import { isPhantomDaemonRunMessage, mergeServerMessagesIntoConversation } from '../rules';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';
import type { SaveMessageOptions } from '../types';

export interface ConversationMessagesController {
  persistMessage: (message: ChatMessage, options?: SaveMessageOptions) => void;
  persistMessageById: (messageId: string, options?: SaveMessageOptions) => void;
  updateMessageById: (
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
    persist?: boolean,
    persistOptions?: SaveMessageOptions,
  ) => void;
  appendConversationMessage: (
    conversationId: string,
    message: ChatMessage,
    options?: SaveMessageOptions,
    persist?: boolean,
  ) => void;
  replaceConversationMessage: (
    conversationId: string,
    message: ChatMessage,
    options?: SaveMessageOptions,
    persist?: boolean,
  ) => void;
  refreshConversationMessagesFromServer: (conversationId: string) => Promise<void>;
  scheduleConversationMessageRefresh: (conversationId: string) => void;
}

export function useConversationMessages(
  port: ProjectViewTransportPort,
  projectId: string,
  routeConversationId: string | null | undefined,
  conversations: Conversation[],
  activeConversationId: string | null,
  setActiveConversationId: (id: string | null) => void,
  setConversations: Dispatch<SetStateAction<Conversation[]>>,
  setMessagesConversationId: (id: string | null) => void,
  setFailedMessagesConversationId: (id: string | null) => void,
  messageLoadRetryNonce: number,
  setMessageLoadRetryNonce: Dispatch<SetStateAction<number>>,
  setConversationLoadError: (message: string | null) => void,
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  messagesConversationIdRef: MutableRefObject<string | null>,
  setMessagesInitialized: (initialized: boolean) => void,
  setPreviewComments: Dispatch<SetStateAction<PreviewComment[]>>,
  setAttachedComments: Dispatch<SetStateAction<PreviewComment[]>>,
  setStreaming: (streaming: boolean) => void,
  streamingConversationIdRef: MutableRefObject<string | null>,
  setStreamingConversationId: (id: string | null) => void,
  setError: (message: string | null) => void,
  setArtifact: (artifact: Artifact | null) => void,
  savedArtifactRef: MutableRefObject<string | null>,
  lastSyncedConversationIdRef: MutableRefObject<string | null>,
  scheduleProjectTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout> | null,
): ConversationMessagesController {
  // Load conversations on project switch. If none exist (older projects
  // pre-conversations, or a freshly created one whose default seed got
  // dropped), create one on the fly.
  useEffect(() => {
    let cancelled = false;
    setConversations([]);
    setActiveConversationId(null);
    setMessagesConversationId(null);
    setFailedMessagesConversationId(null);
    setMessageLoadRetryNonce(0);
    setConversationLoadError(null);
    setMessages([]);
    setPreviewComments([]);
    setAttachedComments([]);
    setStreaming(false);
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
    setError(null);
    setArtifact(null);
    savedArtifactRef.current = null;
    (async () => {
      try {
        const list = await port.listConversations(projectId);
        if (cancelled) return;
        if (list.length === 0) {
          const fresh = await port.createConversation(projectId);
          if (cancelled) return;
          if (fresh) {
            setConversations([fresh]);
            setActiveConversationId(fresh.id);
          } else {
            throw new Error('Could not create a conversation for this project.');
          }
        } else {
          setConversations(list);
          // Issue #1505: when the URL deep-links to a specific
          // conversation, prefer that one. Falls through to list[0]
          // when the routed id is null or no longer present (the
          // routine row may have been deleted between the route
          // landing and the conversation list loading).
          const routedMatch = routeConversationId
            ? list.find((c) => c.id === routeConversationId) ?? null
            : null;
          setActiveConversationId(routedMatch ? routedMatch.id : list[0]!.id);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not load conversations for this project.';
        setConversations([]);
        setActiveConversationId(null);
        setConversationLoadError(message);
        setError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Issue #1505: when the URL changes the routed conversation id while
  // we are already inside the project (e.g. the user clicks "Open
  // project" on a different routine history row in the same project),
  // switch the active conversation without re-fetching the list.
  // Guards: only acts when the routed id is non-null AND present in
  // the already-loaded list, and only when it differs from the current
  // active id. Falls through to a no-op for stale / missing routes so
  // the default picker above keeps its result.
  const lastSeenRouteConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!routeConversationId) {
      lastSeenRouteConversationIdRef.current = null;
      return;
    }
    if (conversations.length === 0) return;
    if (routeConversationId === activeConversationId) return;
    // When the route still points at the conversation this view last
    // pushed to the URL, the mismatch means a local switch (new
    // conversation, history pick) moved activeConversationId ahead and
    // the URL sync below has not caught up yet. Following the stale
    // route here would fight that sync and remount ChatPane in a loop,
    // so only react to a genuinely external navigation.
    if (routeConversationId === lastSyncedConversationIdRef.current) return;
    if (lastSeenRouteConversationIdRef.current === routeConversationId) return;
    lastSeenRouteConversationIdRef.current = routeConversationId;
    const match = conversations.find((c) => c.id === routeConversationId);
    if (!match) return;
    setActiveConversationId(routeConversationId);
  }, [routeConversationId, conversations, activeConversationId, lastSyncedConversationIdRef, setActiveConversationId]);

  // Load messages whenever the active conversation changes. This happens
  // on project mount (after conversations load) and on user-triggered
  // conversation switches.
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      setMessagesInitialized(false);
      setPreviewComments([]);
      setAttachedComments([]);
      setMessagesConversationId(null);
      setFailedMessagesConversationId(null);
      messagesConversationIdRef.current = null;
      setStreaming(false);
      streamingConversationIdRef.current = null;
      setStreamingConversationId(null);
      return;
    }
    // Reset the initialized flag so auto-send waits for the new
    // conversation's DB read to settle before checking messages.length.
    setMessagesInitialized(false);
    let cancelled = false;
    setMessages([]);
    setPreviewComments([]);
    setAttachedComments([]);
    setArtifact(null);
    setMessagesConversationId(null);
    setFailedMessagesConversationId(null);
    setStreaming(false);
    streamingConversationIdRef.current = null;
    setStreamingConversationId(null);
    savedArtifactRef.current = null;
    if (messagesConversationIdRef.current !== activeConversationId) {
      messagesConversationIdRef.current = null;
    }
    (async () => {
      try {
        const [list, comments] = await Promise.all([
          port.listMessages(projectId, activeConversationId),
          port.fetchPreviewComments(projectId, activeConversationId),
        ]);
        if (cancelled) return;
        setMessages(list);
        setMessagesInitialized(true);
        setPreviewComments(comments);
        setAttachedComments([]);
        setArtifact(null);
        setError(null);
        savedArtifactRef.current = null;
        messagesConversationIdRef.current = activeConversationId;
        setMessagesConversationId(activeConversationId);
        setFailedMessagesConversationId(null);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not load messages for this conversation.';
        setMessages([]);
        setPreviewComments([]);
        setAttachedComments([]);
        setArtifact(null);
        setError(message);
        savedArtifactRef.current = null;
        messagesConversationIdRef.current = null;
        setMessagesConversationId(null);
        setFailedMessagesConversationId(activeConversationId);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeConversationId, messageLoadRetryNonce]);

  const persistMessage = useCallback(
    (m: ChatMessage, options?: SaveMessageOptions) => {
      if (!activeConversationId) return;
      // Source-level guard against the "Working 24m+ / Waiting for first
      // output" UI: never write a daemon assistant row that is still
      // queued/running but has no runId. Until POST /api/runs returns the
      // runId, the message is purely in-flight on the client; persisting it
      // here creates a row that nothing can ever reattach to (daemon never
      // saw the runId, client lost the response). Once onRunCreated assigns
      // a runId — or the run finishes terminally — this guard lets the row
      // through normally.
      if (isPhantomDaemonRunMessage(m)) return;
      void port.saveMessage(projectId, activeConversationId, m, options);
    },
    [port, projectId, activeConversationId],
  );

  const persistMessageById = useCallback(
    (messageId: string, options?: SaveMessageOptions) => {
      if (!activeConversationId) return;
      setMessages((curr) => {
        const found = curr.find((m) => m.id === messageId);
        if (found && !isPhantomDaemonRunMessage(found)) {
          void port.saveMessage(projectId, activeConversationId, found, options);
        }
        return curr;
      });
    },
    [port, projectId, activeConversationId, setMessages],
  );

  const updateMessageById = useCallback(
    (
      messageId: string,
      updater: (message: ChatMessage) => ChatMessage,
      persist = false,
      persistOptions?: SaveMessageOptions,
    ) => {
      setMessages((curr) => {
        let saved: ChatMessage | null = null;
        const next = curr.map((m) => {
          if (m.id !== messageId) return m;
          const updated = updater(m);
          saved = updated;
          return updated;
        });
        // Same phantom guard as persistMessage: skip writes for a daemon
        // assistant row that is still in-flight (active runStatus, no runId).
        // The runId-arriving update from onRunCreated passes through because
        // the updater sets runId before this check runs.
        if (persist && saved && activeConversationId && !isPhantomDaemonRunMessage(saved)) {
          void port.saveMessage(projectId, activeConversationId, saved, persistOptions);
        }
        return next;
      });
    },
    [port, projectId, activeConversationId, setMessages],
  );

  const appendConversationMessage = useCallback(
    (
      conversationId: string,
      message: ChatMessage,
      options?: SaveMessageOptions,
      persist = true,
    ) => {
      if (
        activeConversationId === conversationId
        || messagesConversationIdRef.current === conversationId
      ) {
        setMessages((curr) => [...curr, message]);
      }
      if (persist) void port.saveMessage(projectId, conversationId, message, options);
    },
    [port, activeConversationId, messagesConversationIdRef, projectId, setMessages],
  );

  const replaceConversationMessage = useCallback(
    (
      conversationId: string,
      message: ChatMessage,
      options?: SaveMessageOptions,
      persist = true,
    ) => {
      if (
        activeConversationId === conversationId
        || messagesConversationIdRef.current === conversationId
      ) {
        setMessages((curr) => curr.map((item) => (item.id === message.id ? message : item)));
      }
      if (persist) void port.saveMessage(projectId, conversationId, message, options);
    },
    [port, activeConversationId, messagesConversationIdRef, projectId, setMessages],
  );

  const refreshConversationMessagesFromServer = useCallback(
    async (conversationId: string) => {
      if (messagesConversationIdRef.current !== conversationId) return;
      try {
        const serverMessages = await port.listMessages(projectId, conversationId);
        if (messagesConversationIdRef.current !== conversationId) return;
        setMessages((current) => mergeServerMessagesIntoConversation(current, serverMessages));
        setMessagesInitialized(true);
        setMessagesConversationId(conversationId);
        setFailedMessagesConversationId(null);
      } catch (err) {
        console.warn('Failed to refresh conversation messages after run completion', err);
      }
    },
    [port, projectId, messagesConversationIdRef, setMessages, setMessagesInitialized, setMessagesConversationId, setFailedMessagesConversationId],
  );

  const scheduleConversationMessageRefresh = useCallback(
    (conversationId: string) => {
      scheduleProjectTimeout(() => {
        void refreshConversationMessagesFromServer(conversationId);
      }, 150);
    },
    [refreshConversationMessagesFromServer, scheduleProjectTimeout],
  );

  return {
    persistMessage,
    persistMessageById,
    updateMessageById,
    appendConversationMessage,
    replaceConversationMessage,
    refreshConversationMessagesFromServer,
    scheduleConversationMessageRefresh,
  };
}

/** Wirer: binds the real project-view transport port; swap in tests. */
export function useWiredConversationMessages(
  projectId: string,
  routeConversationId: string | null | undefined,
  conversations: Conversation[],
  activeConversationId: string | null,
  setActiveConversationId: (id: string | null) => void,
  setConversations: Dispatch<SetStateAction<Conversation[]>>,
  setMessagesConversationId: (id: string | null) => void,
  setFailedMessagesConversationId: (id: string | null) => void,
  messageLoadRetryNonce: number,
  setMessageLoadRetryNonce: Dispatch<SetStateAction<number>>,
  setConversationLoadError: (message: string | null) => void,
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  messagesConversationIdRef: MutableRefObject<string | null>,
  setMessagesInitialized: (initialized: boolean) => void,
  setPreviewComments: Dispatch<SetStateAction<PreviewComment[]>>,
  setAttachedComments: Dispatch<SetStateAction<PreviewComment[]>>,
  setStreaming: (streaming: boolean) => void,
  streamingConversationIdRef: MutableRefObject<string | null>,
  setStreamingConversationId: (id: string | null) => void,
  setError: (message: string | null) => void,
  setArtifact: (artifact: Artifact | null) => void,
  savedArtifactRef: MutableRefObject<string | null>,
  lastSyncedConversationIdRef: MutableRefObject<string | null>,
  scheduleProjectTimeout: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout> | null,
): ConversationMessagesController {
  return useConversationMessages(
    projectViewTransportPort,
    projectId,
    routeConversationId,
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
}
