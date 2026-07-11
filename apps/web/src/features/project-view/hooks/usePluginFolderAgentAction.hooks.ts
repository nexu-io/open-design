// Feature-local hook for the plugin-folder agent-action cluster: installing a
// generated plugin folder into the registry, and the long-poll workflow that
// publishes it to GitHub or opens an Open Design community-plugin PR,
// streaming its progress into the conversation as a synthetic assistant
// message. `pluginWorkflowAgentName` (the agent label attached to that
// synthetic message) is this cluster's only pure derivation; everything else
// is the busy-path `Set` state plus the long-poll action itself.
import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { effectiveAgentModelChoice } from '../../../components/agentModelSelection';
import type { PluginFolderAgentAction } from '../../../components/design-files/pluginFolderActions';
import { agentModelDisplayName } from '../../../utils/agentLabels';
import { apiProtocolModelLabel } from '../../../utils/apiProtocol';
import { randomUUID } from '../../../utils/uuid';
import type { AgentInfo, AppConfig, ChatMessage, Conversation } from '../../../types';
import {
  pluginWorkflowFailureContent,
  pluginWorkflowPlannedEvents,
  pluginWorkflowResultEvents,
  pluginWorkflowStartContent,
  pluginWorkflowSuccessContent,
  pluginWorkflowTitle,
} from '../formatters';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';
import type { SaveMessageOptions } from '../types';

export interface PluginFolderAgentActionController {
  activePluginActionPaths: Set<string>;
  hiddenAssistantPluginActionPaths: Set<string>;
  forceStreamingPluginMessageIds: Set<string>;
  pluginWorkflowAgentName: string | undefined;
  handlePluginFolderAgentAction: (
    relativePath: string,
    action: PluginFolderAgentAction,
  ) => Promise<{ message?: string } | void>;
}

export function usePluginFolderAgentAction(
  port: ProjectViewTransportPort,
  projectId: string,
  config: AppConfig,
  agentsById: Map<string, AgentInfo>,
  activeConversationId: string | null,
  currentConversationActionDisabled: boolean,
  appendConversationMessage: (
    conversationId: string,
    message: ChatMessage,
    options?: SaveMessageOptions,
    persist?: boolean,
  ) => void,
  replaceConversationMessage: (
    conversationId: string,
    message: ChatMessage,
    options?: SaveMessageOptions,
    persist?: boolean,
  ) => void,
  setConversations: Dispatch<SetStateAction<Conversation[]>>,
): PluginFolderAgentActionController {
  const [activePluginActionPaths, setActivePluginActionPaths] = useState<Set<string>>(() => new Set());
  const [hiddenAssistantPluginActionPaths, setHiddenAssistantPluginActionPaths] =
    useState<Set<string>>(() => new Set());
  const [forceStreamingPluginMessageIds, setForceStreamingPluginMessageIds] =
    useState<Set<string>>(() => new Set());

  const selectedPluginActionAgent =
    config.mode === 'daemon' && config.agentId
      ? agentsById.get(config.agentId)
      : null;
  const selectedPluginActionChoice =
    config.mode === 'daemon' && config.agentId
      ? config.agentModels?.[config.agentId]
      : undefined;
  const effectiveSelectedPluginActionChoice = effectiveAgentModelChoice(
    selectedPluginActionAgent,
    selectedPluginActionChoice,
  );
  const pluginWorkflowAgentName =
    config.mode === 'daemon'
      ? agentModelDisplayName(
          config.agentId,
          selectedPluginActionAgent?.name,
          effectiveSelectedPluginActionChoice?.model,
        )
      : apiProtocolModelLabel(config.apiProtocol, config.model);

  const handlePluginFolderAgentAction = useCallback(
    async (relativePath: string, action: PluginFolderAgentAction) => {
      if (currentConversationActionDisabled || !activeConversationId) return;
      setHiddenAssistantPluginActionPaths((prev) => new Set(prev).add(relativePath));
      if (action === 'install') {
        setActivePluginActionPaths((prev) => new Set(prev).add(relativePath));
        let outcome;
        try {
          outcome = await port.installGeneratedPluginFolder(projectId, relativePath);
        } finally {
          setActivePluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
          setHiddenAssistantPluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
        }
        if (!outcome.ok) throw new Error(outcome.message);
        return { message: outcome.message };
      }
      const conversationId = activeConversationId;
      const shareAction = action === 'publish' ? 'publish-github' : 'contribute-open-design';
      setActivePluginActionPaths((prev) => new Set(prev).add(relativePath));
      let taskStart;
      try {
        taskStart = await port.startGeneratedPluginShareTask(projectId, relativePath, shareAction);
      } catch (error) {
        setActivePluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        setHiddenAssistantPluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        throw error;
      }
      const startedAt = taskStart.startedAt;
      const messageId = randomUUID();
      const updateConversationLatestRun = (
        status: NonNullable<ChatMessage['runStatus']>,
        endedAt?: number,
      ) => {
        setConversations((curr) =>
          curr.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  updatedAt: endedAt ?? startedAt,
                  latestRun: {
                    status,
                    startedAt,
                    ...(endedAt === undefined
                      ? {}
                      : {
                          endedAt,
                          durationMs: Math.max(0, endedAt - startedAt),
                        }),
                  },
                }
              : conversation,
          ),
        );
      };
      const progressMessage: ChatMessage = {
        id: messageId,
        role: 'assistant',
        content: pluginWorkflowStartContent(action, relativePath),
        agentName: pluginWorkflowAgentName,
        events: pluginWorkflowPlannedEvents(action, relativePath),
        createdAt: startedAt,
        startedAt,
        runStatus: 'running',
      };
      setForceStreamingPluginMessageIds((prev) => new Set(prev).add(messageId));
      appendConversationMessage(conversationId, progressMessage, undefined, false);
      updateConversationLatestRun('running');
      void (async () => {
        let since = 0;
        let liveEvents = [...pluginWorkflowPlannedEvents(action, relativePath)];
        let liveContent = pluginWorkflowStartContent(action, relativePath);
        while (true) {
          const snapshot = await port.waitGeneratedPluginShareTask(taskStart.taskId, since, 25_000);
          since = snapshot.nextSince;
          if (snapshot.progress.length > 0) {
            const newTextEvents = snapshot.progress
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => ({ kind: 'text' as const, text: `${line}\n` }));
            liveEvents = [
              ...liveEvents.filter((event, index) => !(index === liveEvents.length - 1 && event.kind === 'status' && event.label === 'working')),
              ...newTextEvents,
              { kind: 'status', label: 'working', detail: pluginWorkflowTitle(action) },
            ];
            liveContent = `${liveContent}\n\n${snapshot.progress.map((line) => line.trim()).filter(Boolean).join('\n')}`.trim();
            replaceConversationMessage(
              conversationId,
              {
                ...progressMessage,
                content: liveContent,
                events: liveEvents,
                runStatus: 'running',
              },
              undefined,
              false,
            );
          }
          if (snapshot.status === 'running' || snapshot.status === 'queued') continue;
          const endedAt = snapshot.endedAt ?? Date.now();
          setActivePluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
          setHiddenAssistantPluginActionPaths((prev) => {
            const next = new Set(prev);
            next.delete(relativePath);
            return next;
          });
          if (snapshot.status === 'done' && snapshot.result) {
            setForceStreamingPluginMessageIds((prev) => {
              const next = new Set(prev);
              next.delete(messageId);
              return next;
            });
            replaceConversationMessage(
              conversationId,
              {
                ...progressMessage,
                content: pluginWorkflowSuccessContent(
                  action,
                  relativePath,
                  snapshot.result.message,
                  snapshot.result.url,
                  snapshot.result.log,
                ),
                events: pluginWorkflowResultEvents(
                  action,
                  relativePath,
                  snapshot.result.message,
                  snapshot.result.url,
                  snapshot.result.log,
                  true,
                  liveEvents,
                ),
                endedAt,
                runStatus: 'succeeded',
              },
              { telemetryFinalized: true },
            );
            updateConversationLatestRun('succeeded', endedAt);
            return;
          }
          const errorMessage = snapshot.error?.message || `${pluginWorkflowTitle(action)} failed.`;
          setForceStreamingPluginMessageIds((prev) => {
            const next = new Set(prev);
            next.delete(messageId);
            return next;
          });
          replaceConversationMessage(
            conversationId,
            {
              ...progressMessage,
              content: pluginWorkflowFailureContent(
                action,
                relativePath,
                errorMessage,
                snapshot.error?.log,
              ),
              events: pluginWorkflowResultEvents(
                action,
                relativePath,
                errorMessage,
                undefined,
                snapshot.error?.log,
                false,
                liveEvents,
              ),
              endedAt,
              runStatus: 'failed',
            },
            { telemetryFinalized: true },
          );
          updateConversationLatestRun('failed', endedAt);
          return;
        }
      })().catch((err) => {
        const endedAt = Date.now();
        setForceStreamingPluginMessageIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
        setActivePluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        setHiddenAssistantPluginActionPaths((prev) => {
          const next = new Set(prev);
          next.delete(relativePath);
          return next;
        });
        replaceConversationMessage(
          conversationId,
          {
            ...progressMessage,
            content: pluginWorkflowFailureContent(
              action,
              relativePath,
              err instanceof Error ? err.message : String(err),
            ),
            events: pluginWorkflowResultEvents(
              action,
              relativePath,
              err instanceof Error ? err.message : String(err),
              undefined,
              [],
              false,
            ),
            endedAt,
            runStatus: 'failed',
          },
          { telemetryFinalized: true },
        );
        updateConversationLatestRun('failed', endedAt);
      });
      return;
    },
    [
      activeConversationId,
      appendConversationMessage,
      currentConversationActionDisabled,
      pluginWorkflowAgentName,
      port,
      projectId,
      replaceConversationMessage,
      setConversations,
    ],
  );

  return {
    activePluginActionPaths,
    hiddenAssistantPluginActionPaths,
    forceStreamingPluginMessageIds,
    pluginWorkflowAgentName,
    handlePluginFolderAgentAction,
  };
}

/** Wirer: binds the real project-view transport port; swap in tests. */
export function useWiredPluginFolderAgentAction(
  projectId: string,
  config: AppConfig,
  agentsById: Map<string, AgentInfo>,
  activeConversationId: string | null,
  currentConversationActionDisabled: boolean,
  appendConversationMessage: (
    conversationId: string,
    message: ChatMessage,
    options?: SaveMessageOptions,
    persist?: boolean,
  ) => void,
  replaceConversationMessage: (
    conversationId: string,
    message: ChatMessage,
    options?: SaveMessageOptions,
    persist?: boolean,
  ) => void,
  setConversations: Dispatch<SetStateAction<Conversation[]>>,
): PluginFolderAgentActionController {
  return usePluginFolderAgentAction(
    projectViewTransportPort,
    projectId,
    config,
    agentsById,
    activeConversationId,
    currentConversationActionDisabled,
    appendConversationMessage,
    replaceConversationMessage,
    setConversations,
  );
}
