// Feature-local hook for the conversation-management cluster: creating,
// selecting, deleting, renaming, changing the session mode of, and forking a
// project's conversations. `conversations`/`activeConversationId` and the
// chat-transcript state they drive (`messages`, `streaming`, preview/attached
// comments, `artifact`) stay owned by the orchestrator — they're read and
// written by many other clusters (message loading, run streaming, brand
// extraction) too — so this hook takes them and their setters as params,
// per the vertical-slice pattern's "one owning cluster" rule for
// cross-cutting state. It owns only what's genuinely local to this cluster:
// the `creatingConversation`/`forkingMessageId` busy flags.
import { useCallback, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatSessionMode } from '@open-design/contracts';
import type { Artifact, ChatMessage, Conversation, PreviewComment } from '../../../types';
import type { useT } from '../../../i18n';
import { navigate } from '../../../router';
import { ensureConversationPresent } from '../rules';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';

export interface ConversationManagementController {
  creatingConversation: boolean;
  forkingMessageId: string | null;
  handleNewConversation: () => Promise<void>;
  handleSelectConversation: (id: string) => void;
  refreshConversationsForProgrammaticBrandRetry: (conversationId: string) => Promise<boolean>;
  handleDeleteConversation: (id: string) => Promise<void>;
  handleRenameConversation: (id: string, title: string) => Promise<void>;
  handleConversationSessionModeChange: (
    id: string,
    sessionMode: ChatSessionMode,
  ) => Promise<void>;
  handleActiveConversationSessionModeChange: (sessionMode: ChatSessionMode) => void;
  handleForkFromMessage: (assistantMessage: ChatMessage) => Promise<void>;
}

export function useConversationManagement(
  port: ProjectViewTransportPort,
  projectId: string,
  activeConversationId: string | null,
  setConversations: Dispatch<SetStateAction<Conversation[]>>,
  setActiveConversationId: (id: string) => void,
  failedMessagesConversationId: string | null,
  setFailedMessagesConversationId: (id: string | null) => void,
  messages: ChatMessage[],
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  messagesConversationIdRef: MutableRefObject<string | null>,
  setMessagesConversationId: (id: string | null) => void,
  setStreaming: (streaming: boolean) => void,
  streamingConversationIdRef: MutableRefObject<string | null>,
  setStreamingConversationId: (id: string | null) => void,
  setPreviewComments: Dispatch<SetStateAction<PreviewComment[]>>,
  setAttachedComments: Dispatch<SetStateAction<PreviewComment[]>>,
  setArtifact: (artifact: Artifact | null) => void,
  setConversationLoadError: (message: string | null) => void,
  setError: (message: string | null) => void,
  setMessageLoadRetryNonce: Dispatch<SetStateAction<number>>,
  activeConversationTitle: string | null | undefined,
  activeSessionMode: ChatSessionMode,
  openTabsStateActive: string | null,
  onProjectsRefresh: () => void,
  projectIdRef: MutableRefObject<string>,
  conversationsRefreshTokenRef: MutableRefObject<number>,
  t: ReturnType<typeof useT>,
): ConversationManagementController {
  const creatingConversationRef = useRef(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [forkingMessageId, setForkingMessageId] = useState<string | null>(null);

  const handleNewConversation = useCallback(async () => {
    if (creatingConversationRef.current) return;
    // Only block if we're sure the current conversation is empty:
    // messages must be loaded AND match the active conversation.
    if (messagesConversationIdRef.current === activeConversationId && messages.length === 0) {
      return;
    }
    creatingConversationRef.current = true;
    setCreatingConversation(true);
    setConversationLoadError(null);
    try {
      const fresh = await port.createConversation(projectId);
      if (!fresh) throw new Error('Could not create a conversation for this project.');
      // Eagerly clear messages and update ref so rapid clicks don't create
      // duplicate empty conversations before the effect resolves.
      setMessages([]);
      setStreaming(false);
      streamingConversationIdRef.current = null;
      setStreamingConversationId(null);
      setMessagesConversationId(null);
      messagesConversationIdRef.current = fresh.id;
      setConversations((curr) => [fresh, ...curr]);
      setActiveConversationId(fresh.id);
      // Push the new conversation id into the URL synchronously so the
      // route-sync effect sees a matching `routeConversationId` before
      // it can revert `activeConversationId`. Without this, the route-sync
      // effect can fight the conversation switch, preventing users from
      // switching back to older conversations after creating a new one.
      navigate(
        {
          kind: 'project',
          projectId,
          conversationId: fresh.id,
          fileName: openTabsStateActive ?? null,
        },
        { replace: true },
      );
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not create a conversation for this project.';
      setConversationLoadError(message);
      setError(message);
    } finally {
      creatingConversationRef.current = false;
      setCreatingConversation(false);
    }
  }, [
    port,
    projectId,
    activeConversationId,
    messages.length,
    messagesConversationIdRef,
    openTabsStateActive,
    setActiveConversationId,
    setConversationLoadError,
    setConversations,
    setError,
    setMessages,
    setMessagesConversationId,
    setStreaming,
    setStreamingConversationId,
    streamingConversationIdRef,
  ]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (id === activeConversationId && failedMessagesConversationId !== id) return;
      setMessages([]);
      setPreviewComments([]);
      setAttachedComments([]);
      setArtifact(null);
      setStreaming(false);
      streamingConversationIdRef.current = null;
      setStreamingConversationId(null);
      setMessagesConversationId(null);
      setFailedMessagesConversationId(null);
      setConversationLoadError(null);
      messagesConversationIdRef.current = null;
      setActiveConversationId(id);
      // Push the new conversation id into the URL synchronously so the
      // route-sync effect at L512 sees a matching `routeConversationId`
      // before it can find the previous conversation in the list and
      // revert `activeConversationId` to it. Without this, the same
      // effect that fights handleNewConversation also fights chat
      // switching, ping-ponging until React's nested-update guard fires.
      navigate(
        {
          kind: 'project',
          projectId,
          conversationId: id,
          fileName: openTabsStateActive ?? null,
        },
        { replace: true },
      );
      setMessageLoadRetryNonce((nonce) => nonce + 1);
    },
    [
      activeConversationId,
      failedMessagesConversationId,
      messagesConversationIdRef,
      openTabsStateActive,
      projectId,
      setActiveConversationId,
      setArtifact,
      setAttachedComments,
      setConversationLoadError,
      setFailedMessagesConversationId,
      setMessageLoadRetryNonce,
      setMessages,
      setMessagesConversationId,
      setPreviewComments,
      setStreaming,
      setStreamingConversationId,
      streamingConversationIdRef,
    ],
  );

  const refreshConversationsForProgrammaticBrandRetry = useCallback(
    async (conversationId: string): Promise<boolean> => {
      const capturedProjectId = projectId;
      const myToken = ++conversationsRefreshTokenRef.current;
      try {
        const list = await port.listConversations(capturedProjectId);
        if (projectIdRef.current !== capturedProjectId) return false;
        if (conversationsRefreshTokenRef.current !== myToken) return false;
        setConversations(ensureConversationPresent(list, conversationId, capturedProjectId));
        return true;
      } catch (err) {
        if (projectIdRef.current !== capturedProjectId) return false;
        if (conversationsRefreshTokenRef.current !== myToken) return false;
        console.warn('Failed to refresh conversations after brand extraction retry', err);
        setConversations((curr) => ensureConversationPresent(curr, conversationId, capturedProjectId));
        return true;
      }
    },
    [port, projectId, projectIdRef, conversationsRefreshTokenRef, setConversations],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const ok = await port.deleteConversation(projectId, id);
      if (!ok) return;
      // The deleted conversation may have owned an unanswered
      // `<question-form>`, which the daemon counts toward the project's
      // `needsInput` flag in `/api/projects`. Home cards render that
      // flag from the cached projects payload, so without refreshing
      // it here the `Needs input` badge survives the deletion until
      // the next manual reload.
      onProjectsRefresh();
      setConversations((curr) => {
        const next = curr.filter((c) => c.id !== id);
        if (next.length === 0) {
          // Re-seed so the project always has at least one conversation
          // to write into.
          void port.createConversation(projectId).then((fresh) => {
            if (fresh) {
              setConversations([fresh]);
              setActiveConversationId(fresh.id);
            }
          });
        } else if (id === activeConversationId) {
          setActiveConversationId(next[0]!.id);
        }
        return next;
      });
    },
    [port, projectId, activeConversationId, onProjectsRefresh, setActiveConversationId, setConversations],
  );

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim() || null;
      setConversations((curr) => curr.map((c) => (c.id === id ? { ...c, title: trimmed } : c)));
      await port.patchConversation(projectId, id, { title: trimmed });
    },
    [port, projectId, setConversations],
  );

  const handleConversationSessionModeChange = useCallback(
    async (id: string, sessionMode: ChatSessionMode) => {
      setConversations((curr) =>
        curr.map((conversation) =>
          conversation.id === id ? { ...conversation, sessionMode } : conversation,
        ),
      );
      const updated = await port.patchConversation(projectId, id, { sessionMode });
      if (updated) {
        setConversations((curr) =>
          curr.map((conversation) =>
            conversation.id === id ? { ...conversation, ...updated } : conversation,
          ),
        );
      }
    },
    [port, projectId, setConversations],
  );

  const handleActiveConversationSessionModeChange = useCallback(
    (sessionMode: ChatSessionMode) => {
      if (!activeConversationId) return;
      void handleConversationSessionModeChange(activeConversationId, sessionMode);
    },
    [activeConversationId, handleConversationSessionModeChange],
  );

  const handleForkFromMessage = useCallback(
    async (assistantMessage: ChatMessage) => {
      if (!activeConversationId || forkingMessageId) return;
      setForkingMessageId(assistantMessage.id);
      setConversationLoadError(null);
      try {
        const sourceTitle = activeConversationTitle?.trim();
        const forkTitle = sourceTitle
          ? t('chat.forkedConversationTitle', { title: sourceTitle })
          : undefined;
        // Seed the fork from the messages the user is actually looking at,
        // up to and including the fork point. A run that errored or had its
        // connection reset before its assistant message was persisted leaves
        // that message in memory only; copying from the database by id would
        // 404 and silently drop the fork. Sending the in-memory snapshot makes
        // the fork resilient to that gap.
        const forkIndex = messages.findIndex((m) => m.id === assistantMessage.id);
        const seedMessages =
          forkIndex >= 0 ? messages.slice(0, forkIndex + 1) : [...messages, assistantMessage];
        const fresh = await port.createConversation(projectId, forkTitle, {
          seedFromConversationId: activeConversationId,
          forkAfterMessageId: assistantMessage.id,
          sessionMode: activeSessionMode,
          seedMessages,
        });
        if (!fresh) throw new Error(t('chat.forkConversationFailed'));
        setMessages([]);
        setPreviewComments([]);
        setAttachedComments([]);
        setArtifact(null);
        setStreaming(false);
        streamingConversationIdRef.current = null;
        setStreamingConversationId(null);
        setMessagesConversationId(null);
        messagesConversationIdRef.current = null;
        setFailedMessagesConversationId(null);
        setConversations((curr) => [fresh, ...curr.filter((c) => c.id !== fresh.id)]);
        setActiveConversationId(fresh.id);
        navigate(
          {
            kind: 'project',
            projectId,
            conversationId: fresh.id,
            fileName: openTabsStateActive ?? null,
          },
          { replace: true },
        );
        onProjectsRefresh();
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('chat.forkConversationFailed');
        setConversationLoadError(message);
        setError(message);
      } finally {
        setForkingMessageId(null);
      }
    },
    [
      activeConversationId,
      activeConversationTitle,
      activeSessionMode,
      forkingMessageId,
      messages,
      messagesConversationIdRef,
      onProjectsRefresh,
      openTabsStateActive,
      port,
      projectId,
      setActiveConversationId,
      setArtifact,
      setAttachedComments,
      setConversationLoadError,
      setConversations,
      setError,
      setFailedMessagesConversationId,
      setMessages,
      setMessagesConversationId,
      setPreviewComments,
      setStreaming,
      setStreamingConversationId,
      streamingConversationIdRef,
      t,
    ],
  );

  return {
    creatingConversation,
    forkingMessageId,
    handleNewConversation,
    handleSelectConversation,
    refreshConversationsForProgrammaticBrandRetry,
    handleDeleteConversation,
    handleRenameConversation,
    handleConversationSessionModeChange,
    handleActiveConversationSessionModeChange,
    handleForkFromMessage,
  };
}

/** Wirer: binds the real project-view transport port; swap in tests. */
export function useWiredConversationManagement(
  projectId: string,
  activeConversationId: string | null,
  setConversations: Dispatch<SetStateAction<Conversation[]>>,
  setActiveConversationId: (id: string) => void,
  failedMessagesConversationId: string | null,
  setFailedMessagesConversationId: (id: string | null) => void,
  messages: ChatMessage[],
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  messagesConversationIdRef: MutableRefObject<string | null>,
  setMessagesConversationId: (id: string | null) => void,
  setStreaming: (streaming: boolean) => void,
  streamingConversationIdRef: MutableRefObject<string | null>,
  setStreamingConversationId: (id: string | null) => void,
  setPreviewComments: Dispatch<SetStateAction<PreviewComment[]>>,
  setAttachedComments: Dispatch<SetStateAction<PreviewComment[]>>,
  setArtifact: (artifact: Artifact | null) => void,
  setConversationLoadError: (message: string | null) => void,
  setError: (message: string | null) => void,
  setMessageLoadRetryNonce: Dispatch<SetStateAction<number>>,
  activeConversationTitle: string | null | undefined,
  activeSessionMode: ChatSessionMode,
  openTabsStateActive: string | null,
  onProjectsRefresh: () => void,
  projectIdRef: MutableRefObject<string>,
  conversationsRefreshTokenRef: MutableRefObject<number>,
  t: ReturnType<typeof useT>,
): ConversationManagementController {
  return useConversationManagement(
    projectViewTransportPort,
    projectId,
    activeConversationId,
    setConversations,
    setActiveConversationId,
    failedMessagesConversationId,
    setFailedMessagesConversationId,
    messages,
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
    activeConversationTitle,
    activeSessionMode,
    openTabsStateActive,
    onProjectsRefresh,
    projectIdRef,
    conversationsRefreshTokenRef,
    t,
  );
}
