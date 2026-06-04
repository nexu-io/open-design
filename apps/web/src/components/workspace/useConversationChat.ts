import { useCallback, useEffect, useRef, useState } from 'react';
import { streamViaDaemon } from '../../providers/daemon';
import { listMessages, saveMessage } from '../../state/projects';
import { appendErrorStatusEvent } from '../../runtime/chat-events';
import { agentModelDisplayName } from '../../utils/agentLabels';
import { randomUUID } from '../../utils/uuid';
import { effectiveAgentModelChoice } from '../agentModelSelection';
import {
  createBufferedTextUpdates,
  finalizeActiveAssistantMessagesOnStop,
  resolveRetryTarget,
  resolveSucceededRunStatus,
} from '../ProjectView';
import type {
  AgentEvent,
  AgentInfo,
  AppConfig,
  ChatAttachment,
  ChatCommentAttachment,
  ChatMessage,
} from '../../types';
import type { ChatSessionMode } from '@open-design/contracts';

// ---------------------------------------------------------------------------
// useConversationChat — drives a secondary ChatPane bound to a single
// conversation (the Side Chat workspace tab).
//
// ProjectView owns the primary conversation's send/stream loop. That loop is
// deeply entangled with queueing, plugin snapshots, live-artifact parsing,
// design-system auditing, notifications, and route sync — extracting it wholesale
// would gut ProjectView. Instead this hook reuses the SAME daemon primitive the
// primary loop runs on (`streamViaDaemon`) plus the SAME persistence helpers
// (`listMessages` / `saveMessage`), so a side chat behaves like the main chat
// ("chat 和我们已有的 chat 对齐即可"): create a run against the conversation, stream
// deltas into the live assistant message, push tool/status events, persist, and
// finalize on done / error / stop. It deliberately omits the primary loop's
// extras (no live-artifact viewer wiring, no queueing) because a side chat is a
// lightweight scratch conversation.
// ---------------------------------------------------------------------------

function isTerminalRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

function isActiveRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'queued' || status === 'running';
}

export interface ConversationChatContext {
  /** Live app config — selects daemon-vs-api mode and the active agent. */
  config: AppConfig;
  /** Agent metadata map (id → AgentInfo), used to resolve model labels. */
  agentsById: Map<string, AgentInfo>;
  /** UI locale forwarded to the daemon so prompts compose in-language. */
  locale: string;
  sessionMode: ChatSessionMode;
}

export interface UseConversationChatResult {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  /** True until the initial message load resolves. */
  loading: boolean;
  onSend: (
    prompt: string,
    attachments: ChatAttachment[],
    commentAttachments: ChatCommentAttachment[],
  ) => void;
  onRetry: (assistantMessage: ChatMessage) => void;
  onStop: () => void;
}

export function useConversationChat(
  projectId: string,
  conversationId: string,
  ctx: ConversationChatContext,
): UseConversationChatResult {
  const { config, agentsById, locale } = ctx;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep the latest config/agent map in refs so the stable `onSend` callback
  // always reads the current agent selection without re-subscribing the SSE.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  const abortRef = useRef<AbortController | null>(null);
  const cancelRef = useRef<AbortController | null>(null);
  // Coalesces streamed deltas into ~one React update per animation frame
  // (same primitive the primary chat loop uses) so a side chat doesn't rebuild
  // the whole messages array on every SSE token.
  const textBufferRef = useRef<ReturnType<typeof createBufferedTextUpdates> | null>(null);

  // Load the conversation's persisted messages on mount / conversation switch.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setError(null);
    void (async () => {
      const list = await listMessages(projectId, conversationId);
      if (cancelled) return;
      setMessages(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, conversationId]);

  // Tear down the live subscription when the tab unmounts. The daemon run
  // keeps going; we only stop the browser-side SSE.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      cancelRef.current = null;
      textBufferRef.current?.cancel();
      textBufferRef.current = null;
    };
  }, []);

  const persist = useCallback(
    (message: ChatMessage) => {
      void saveMessage(projectId, conversationId, message);
    },
    [projectId, conversationId],
  );

  const updateAssistant = useCallback(
    (assistantId: string, updater: (prev: ChatMessage) => ChatMessage) => {
      setMessages((curr) => curr.map((m) => (m.id === assistantId ? updater(m) : m)));
    },
    [],
  );

  const runSend = useCallback(
    (
      prompt: string,
      attachments: ChatAttachment[],
      commentAttachments: ChatCommentAttachment[],
      retryOfAssistantId?: string,
    ) => {
      const {
        config: cfg,
        agentsById: agents,
        locale: loc,
        sessionMode,
      } = ctxRef.current;
      if (cfg.mode !== 'daemon') {
        setError('Side Chat needs a local agent. Pick one in the top bar.');
        return;
      }
      if (!cfg.agentId) {
        setError('Pick a local agent first (top bar).');
        return;
      }

      const retryTarget = retryOfAssistantId
        ? resolveRetryTarget(messagesRef.current, retryOfAssistantId)
        : null;
      if (retryOfAssistantId && !retryTarget) return;

      const startedAt = Date.now();
      const selectedAgent = agents.get(cfg.agentId) ?? null;
      const choice = effectiveAgentModelChoice(selectedAgent, cfg.agentModels?.[cfg.agentId]);
      const assistantAgentName = agentModelDisplayName(
        cfg.agentId,
        selectedAgent?.name,
        choice?.model,
      );

      const userMsg: ChatMessage = retryTarget
        ? retryTarget.userMsg
        : {
            id: randomUUID(),
            role: 'user',
            content: prompt,
            createdAt: startedAt,
            ...(attachments.length > 0 ? { attachments } : {}),
            ...(commentAttachments.length > 0 ? { commentAttachments } : {}),
          };
      const assistantId = retryTarget?.failedAssistant.id ?? randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        agentId: cfg.agentId,
        agentName: assistantAgentName,
        events: [],
        createdAt: retryTarget?.failedAssistant.createdAt ?? startedAt,
        runStatus: 'running',
        startedAt,
      };

      const history = retryTarget
        ? [...retryTarget.priorMessages, userMsg]
        : [...messagesRef.current, userMsg];
      setMessages([...history, assistantMsg]);
      setStreaming(true);
      setError(null);
      if (!retryTarget) persist(userMsg);

      const controller = new AbortController();
      const cancelController = new AbortController();
      abortRef.current = controller;
      cancelRef.current = cancelController;

      // Frame-batch this run's text deltas. flush() applies any pending content
      // before cancel() tears down, so a terminal status that races onDone
      // can't drop the tail of the answer.
      textBufferRef.current?.cancel();
      const textBuffer = createBufferedTextUpdates({
        updateMessage: (updater) => updateAssistant(assistantId, updater),
        // Side chat persists at done/error (+ onRunCreated), not mid-stream.
        persistSoon: () => {},
      });
      textBufferRef.current = textBuffer;

      const clearRefs = () => {
        if (abortRef.current === controller) abortRef.current = null;
        if (cancelRef.current === cancelController) cancelRef.current = null;
        textBufferRef.current?.flush();
        textBufferRef.current?.cancel();
        textBufferRef.current = null;
        setStreaming(false);
      };

      const handlers = {
        onDelta: (delta: string) => {
          textBuffer.appendContent(delta);
        },
        onAgentEvent: (ev: AgentEvent) => {
          textBuffer.appendEvent(ev);
        },
        onDone: () => {
          textBuffer.flush();
          const endedAt = Date.now();
          setMessages((curr) => {
            const next = curr.map((m) =>
              m.id === assistantId
                ? { ...m, endedAt, runStatus: resolveSucceededRunStatus(m.runStatus) }
                : m,
            );
            const finalized = next.find((m) => m.id === assistantId);
            if (finalized) persist(finalized);
            return next;
          });
          clearRefs();
        },
        onError: (err: Error) => {
          textBuffer.flush();
          const endedAt = Date.now();
          const code = (err as Error & { code?: string }).code;
          setError(err.message);
          setMessages((curr) => {
            const next = curr.map((m) => {
              if (m.id !== assistantId) return m;
              const withError = appendErrorStatusEvent(m, err.message, code);
              return {
                ...withError,
                endedAt,
                runStatus: 'failed' as const,
              };
            });
            const finalized = next.find((m) => m.id === assistantId);
            if (finalized) persist(finalized);
            return next;
          });
          clearRefs();
        },
      };

      void streamViaDaemon({
        agentId: cfg.agentId,
        history,
        signal: controller.signal,
        cancelSignal: cancelController.signal,
        handlers,
        projectId,
        conversationId,
        assistantMessageId: assistantId,
        clientRequestId: randomUUID(),
        skillId: null,
        skillIds: [],
        designSystemId: cfg.designSystemId ?? null,
        attachments: (userMsg.attachments ?? []).map((a) => a.path),
        commentAttachments: userMsg.commentAttachments ?? [],
        model: choice?.model ?? null,
        reasoning: choice?.reasoning ?? null,
        locale: loc,
        sessionMode,
        onRunCreated: (runId) => {
          updateAssistant(assistantId, (prev) => ({
            ...prev,
            runId,
            runStatus: 'queued',
          }));
          setMessages((curr) => {
            const pinned = curr.find((m) => m.id === assistantId);
            if (pinned) persist(pinned);
            return curr;
          });
        },
        onRunStatus: (runStatus) => {
          updateAssistant(assistantId, (prev) => ({
            ...prev,
            runStatus,
            endedAt: isTerminalRunStatus(runStatus) ? prev.endedAt ?? Date.now() : prev.endedAt,
          }));
          if (isTerminalRunStatus(runStatus)) clearRefs();
        },
        onRunEventId: (lastRunEventId) => {
          updateAssistant(assistantId, (prev) => ({ ...prev, lastRunEventId }));
        },
      });
    },
    [projectId, conversationId, persist, updateAssistant],
  );

  const onSend = useCallback(
    (prompt: string, attachments: ChatAttachment[], commentAttachments: ChatCommentAttachment[]) => {
      runSend(prompt, attachments, commentAttachments);
    },
    [runSend],
  );

  const onRetry = useCallback(
    (assistantMessage: ChatMessage) => {
      runSend('', [], [], assistantMessage.id);
    },
    [runSend],
  );

  const onStop = useCallback(() => {
    const stoppedAt = Date.now();
    // Abort the cancel signal first so the daemon stops the run (POST cancel),
    // then drop the browser-side SSE subscription.
    cancelRef.current?.abort();
    cancelRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    textBufferRef.current?.flush();
    textBufferRef.current?.cancel();
    textBufferRef.current = null;
    setStreaming(false);
    setMessages((curr) => {
      const { messages: next, finalized } = finalizeActiveAssistantMessagesOnStop(curr, stoppedAt);
      for (const message of finalized) persist(message);
      return next;
    });
  }, [persist]);

  return { messages, streaming, error, loading, onSend, onRetry, onStop };
}
