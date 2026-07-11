import { Fragment, useMemo, type MutableRefObject } from 'react';
import type {
  AppliedPluginSnapshot,
  ChatSessionMode,
  WorkspaceContextItem,
} from '@open-design/contracts';
import type { TrackingProjectKind } from '@open-design/contracts/analytics';
import { AssistantMessage, type QuestionFormOpenRequest } from '../../../components/AssistantMessage';
import type { BrandBrowserAssistConfirm } from '../../../components/OdCard';
import type { NextStepActionsVariant } from '../../../components/NextStepActions';
import type { DesignToolboxActionId } from '../../../runtime/design-toolbox';
import type { TodoItem } from '../../../runtime/todos';
import { latestTodoWriteInputForPinnedCard } from '../../../runtime/todos';
import type { Dict } from '../../../i18n/types';
import type {
  ChatAttachment,
  ChatCommentAttachment,
  ChatMessage,
  ChatMessageFeedbackChange,
  DesignSystemSummary,
  ProjectFile,
  ProjectMetadata,
  SkillSummary,
} from '../../../types';
import type { PluginFolderAgentAction } from '../../../components/design-files/pluginFolderActions';
import {
  CHAT_MESSAGE_OVERSCAN_PX,
  CHAT_MESSAGE_VIRTUALIZE_THRESHOLD,
  CHAT_VIRTUAL_INITIAL_TAIL_ROWS,
} from '../constants';
import { useMeasuredVirtualWindow } from '../hooks/useMeasuredVirtualWindow.hooks';
import {
  buildChatRenderItems,
  estimateChatRenderItemHeight,
  firstTodoWriteAssistantMessageId,
  isAssistantMessageStreaming,
} from '../rules';
import type { AssistantCallbacks, ChatRenderItem } from '../types';
import { UserMessage } from './UserMessage';
import { VirtualChatRow } from './VirtualChatRow';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export function ChatRows({
  messages,
  streaming,
  liveToolInput,
  projectId,
  projectKindForTracking,
  activeConversationId,
  activeConversationKey,
  projectFiles,
  projectMetadata,
  projectFileNames,
  onRequestOpenFile,
  onRequestPluginDetails,
  onRequestDesignSystemDetails,
  onRequestPluginFolderAgentAction,
  activePluginActionPaths,
  hiddenPluginActionPaths,
  onShareToOpenDesign,
  shareToOpenDesignBusyMessageId,
  forceStreamingMessageIds,
  lastAssistantId,
  firstUserMessageId,
  activePluginSnapshot,
  activeDesignSystem,
  hasActiveDesignSystem,
  errorCardOwnerId,
  nextUserContentByAssistantId,
  assistantCallbacksRef,
  onContinueRemainingTasks,
  onBrandBrowserAssistConfirm,
  onArtifactShare,
  onToolboxAction,
  onNextStepPromptAction,
  onNextStepAiOptimize,
  nextStepAiOptimizeBusy,
  onNextStepContinueExtraction,
  nextStepContinueExtractionBusy,
  onNextStepContinueAiExtraction,
  nextStepContinueAiExtractionBusy,
  onNextStepCreateDesign,
  nextStepCreateDesignBusy,
  onNextStepCreateDesignSystem,
  nextStepCreateDesignSystemBusy,
  onPickSkill,
  onArtifactDownload,
  nextStepSkills,
  toolboxSkillNames,
  nextStepVariant,
  onForkFromMessage,
  onAssistantFeedback,
  forkingMessageId,
  t,
  onOpenQuestions,
  scrollContainerRef,
  projectRawUrl,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  liveToolInput?: Record<string, { name: string; text: string; seq?: number }>;
  projectId: string | null;
  projectKindForTracking: TrackingProjectKind | null;
  activeConversationId: string | null;
  activeConversationKey: string;
  projectFiles: ProjectFile[];
  projectMetadata?: ProjectMetadata;
  projectFileNames?: Set<string>;
  onRequestOpenFile?: (name: string) => void;
  onRequestPluginDetails?: (pluginId: string) => void;
  onRequestDesignSystemDetails?: (system: DesignSystemSummary) => void;
  onRequestPluginFolderAgentAction?: (relativePath: string, action: PluginFolderAgentAction) => void;
  activePluginActionPaths?: Set<string>;
  hiddenPluginActionPaths?: Set<string>;
  onShareToOpenDesign?: (assistantMessageId: string) => void;
  shareToOpenDesignBusyMessageId?: string | null;
  forceStreamingMessageIds?: Set<string>;
  lastAssistantId: string | undefined;
  firstUserMessageId: string | undefined;
  activePluginSnapshot?: AppliedPluginSnapshot | null;
  activeDesignSystem?: DesignSystemSummary | null;
  hasActiveDesignSystem: boolean;
  errorCardOwnerId: string | null;
  nextUserContentByAssistantId: Map<string, string>;
  assistantCallbacksRef: MutableRefObject<AssistantCallbacks>;
  onContinueRemainingTasks?: (assistantMessage: ChatMessage, todos: TodoItem[]) => void;
  onBrandBrowserAssistConfirm?: BrandBrowserAssistConfirm;
  onArtifactShare?: (fileName: string) => void;
  onToolboxAction?: (id: DesignToolboxActionId) => void;
  onNextStepPromptAction?: (
    prompt: string,
    options?: { sessionMode?: ChatSessionMode },
  ) => void;
  onNextStepAiOptimize?: () => void;
  nextStepAiOptimizeBusy?: boolean;
  onNextStepContinueExtraction?: () => void;
  nextStepContinueExtractionBusy?: boolean;
  onNextStepContinueAiExtraction?: () => void;
  nextStepContinueAiExtractionBusy?: boolean;
  onNextStepCreateDesign?: () => void;
  nextStepCreateDesignBusy?: boolean;
  onNextStepCreateDesignSystem?: () => void;
  nextStepCreateDesignSystemBusy?: boolean;
  onPickSkill?: (skillId: string) => void;
  onArtifactDownload?: (fileName: string) => void;
  nextStepSkills?: SkillSummary[];
  toolboxSkillNames?: Partial<Record<DesignToolboxActionId, string | null>>;
  nextStepVariant?: NextStepActionsVariant;
  onForkFromMessage?: (message: ChatMessage) => void;
  onAssistantFeedback?: (message: ChatMessage, change: ChatMessageFeedbackChange) => void;
  forkingMessageId?: string | null;
  t: TranslateFn;
  onOpenQuestions?: (request?: QuestionFormOpenRequest) => void;
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  // Threaded in rather than imported directly — see `UserMessage.tsx` for
  // why this dumb component doesn't reach into `providers/` itself.
  projectRawUrl: (projectId: string, filePath: string) => string;
}) {
  const conversationTodoInput = useMemo(
    () => latestTodoWriteInputForPinnedCard(messages),
    [messages],
  );
  const conversationTodoAnchorMessageId = useMemo(
    () => firstTodoWriteAssistantMessageId(messages),
    [messages],
  );
  const items = useMemo(
    () => buildChatRenderItems(messages),
    [messages],
  );
  const virtualized = items.length > CHAT_MESSAGE_VIRTUALIZE_THRESHOLD;
  const virtualWindow = useMeasuredVirtualWindow(items, {
    enabled: virtualized,
    containerRef: scrollContainerRef,
    estimateSize: estimateChatRenderItemHeight,
    overscanPx: CHAT_MESSAGE_OVERSCAN_PX,
    resetKey: activeConversationKey,
    initialTailRows: CHAT_VIRTUAL_INITIAL_TAIL_ROWS,
    alwaysIncludeKey:
      conversationTodoInput != null && conversationTodoAnchorMessageId
        ? `message:${conversationTodoAnchorMessageId}`
        : undefined,
  });

  const renderItem = (item: ChatRenderItem) => {
    const m = item.message;
    const messageStreaming = isAssistantMessageStreaming(
      m,
      streaming,
      lastAssistantId,
      forceStreamingMessageIds,
    );
    if (m.role === 'user') {
      return (
        <UserMessage
          message={m}
          projectId={projectId}
          projectFileNames={projectFileNames}
          onRequestOpenFile={onRequestOpenFile}
          onRequestPluginDetails={onRequestPluginDetails}
          onRequestDesignSystemDetails={onRequestDesignSystemDetails}
          t={t}
          activePluginSnapshot={
            m.id === firstUserMessageId
              ? activePluginSnapshot ?? null
              : null
          }
          activeDesignSystem={
            m.id === firstUserMessageId
              ? activeDesignSystem ?? null
              : null
          }
          projectRawUrl={projectRawUrl}
        />
      );
    }
    return (
      <AssistantMessage
        message={m}
        streaming={messageStreaming}
        // Only the streaming row consumes live tool input. Non-streaming rows
        // get a stable `undefined`, so adding `liveToolInput` to the memo
        // comparator re-renders just this row per `tool_input_delta`, not all N.
        liveToolInput={messageStreaming ? liveToolInput : undefined}
        showConversationTodoCard={m.id === conversationTodoAnchorMessageId}
        conversationTodoInput={conversationTodoInput}
        projectId={projectId}
        projectKind={projectKindForTracking}
        conversationId={activeConversationId}
        projectFiles={projectFiles}
        projectMetadata={projectMetadata}
        projectFileNames={projectFileNames}
        onRequestOpenFile={onRequestOpenFile}
        onRequestPluginFolderAgentAction={onRequestPluginFolderAgentAction}
        activePluginActionPaths={activePluginActionPaths}
        hiddenPluginActionPaths={hiddenPluginActionPaths}
        onShareToOpenDesign={
          onShareToOpenDesign
            ? () => assistantCallbacksRef.current.onShareToOpenDesign?.(m.id)
            : undefined
        }
        shareToOpenDesignBusy={shareToOpenDesignBusyMessageId === m.id}
        isLast={m.id === lastAssistantId}
        errorCardOwnerId={errorCardOwnerId}
        nextUserContent={nextUserContentByAssistantId.get(m.id)}
        suppressDirectionForms={hasActiveDesignSystem}
        hasDesignSystemContext={hasActiveDesignSystem || !!activeDesignSystem}
        onOpenQuestions={onOpenQuestions}
        onBrandBrowserAssistConfirm={
          onBrandBrowserAssistConfirm
            ? (card) => assistantCallbacksRef.current.onBrandBrowserAssistConfirm?.(card)
            : undefined
        }
        onContinueRemainingTasks={
          m.id === lastAssistantId && onContinueRemainingTasks
            ? (todos) => assistantCallbacksRef.current.onContinueRemainingTasks?.(m, todos)
            : undefined
        }
        onForkFromMessage={
          onForkFromMessage
            ? () => assistantCallbacksRef.current.onForkFromMessage?.(m)
            : undefined
        }
        forking={forkingMessageId === m.id}
        onFeedback={
          onAssistantFeedback
            ? (rating) => assistantCallbacksRef.current.onAssistantFeedback?.(m, rating)
            : undefined
        }
        onArtifactShare={
          onArtifactShare
            ? (fileName) => assistantCallbacksRef.current.onArtifactShare?.(fileName)
            : undefined
        }
        onToolboxAction={onToolboxAction}
        onNextStepPromptAction={onNextStepPromptAction}
        onNextStepAiOptimize={
          onNextStepAiOptimize
            ? () => assistantCallbacksRef.current.onNextStepAiOptimize?.()
            : undefined
        }
        nextStepAiOptimizeBusy={nextStepAiOptimizeBusy}
        onNextStepContinueExtraction={
          onNextStepContinueExtraction
            ? () => assistantCallbacksRef.current.onNextStepContinueExtraction?.()
            : undefined
        }
        nextStepContinueExtractionBusy={nextStepContinueExtractionBusy}
        onNextStepContinueAiExtraction={
          onNextStepContinueAiExtraction
            ? () => assistantCallbacksRef.current.onNextStepContinueAiExtraction?.()
            : undefined
        }
        nextStepContinueAiExtractionBusy={nextStepContinueAiExtractionBusy}
        onNextStepCreateDesign={
          onNextStepCreateDesign
            ? () => assistantCallbacksRef.current.onNextStepCreateDesign?.()
            : undefined
        }
        nextStepCreateDesignBusy={nextStepCreateDesignBusy}
        onNextStepCreateDesignSystem={
          onNextStepCreateDesignSystem
            ? () => assistantCallbacksRef.current.onNextStepCreateDesignSystem?.()
            : undefined
        }
        nextStepCreateDesignSystemBusy={nextStepCreateDesignSystemBusy}
        onPickSkill={onPickSkill}
        onArtifactDownload={onArtifactDownload}
        nextStepSkills={nextStepSkills}
        toolboxSkillNames={toolboxSkillNames}
        nextStepVariant={nextStepVariant}
      />
    );
  };

  if (items.length === 0) return null;

  if (!virtualized) {
    return (
      <>
        {items.map((item) => (
          <Fragment key={item.key}>{renderItem(item)}</Fragment>
        ))}
      </>
    );
  }

  return (
    <div
      className="chat-virtual-spacer"
      data-testid="chat-virtual-spacer"
      style={{ height: virtualWindow.totalHeight }}
    >
      {virtualWindow.rows.map((row) => (
        <VirtualChatRow
          key={row.item.key}
          itemKey={row.item.key}
          top={row.top}
          onMeasure={virtualWindow.onMeasure}
        >
          {renderItem(row.item)}
        </VirtualChatRow>
      ))}
    </div>
  );
}
