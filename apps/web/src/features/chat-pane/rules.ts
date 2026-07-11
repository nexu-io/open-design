import type {
  ChatAttachment,
  ChatMessage,
  Conversation,
  ProjectFile,
  ProjectMetadata,
} from '../../types';
import type { WorkspaceContextItem } from '@open-design/contracts';
import { hasOdCard } from '@open-design/contracts';
import type { IconName } from '../../components/Icon';
import { listDesignArtifactCandidates } from '../../components/design-files/designArtifacts';
import { splitOnQuestionForms } from '../../artifacts/question-form';
import { stripArtifact } from '../../artifacts/strip';
import type { Dict } from '../../i18n/types';
import {
  AUDIO_STARTERS,
  CHAT_VIRTUAL_ROW_GAP_PX,
  DEFAULT_STARTER_KEYS,
  IMAGE_STARTERS,
  VIDEO_HYPERFRAMES_STARTERS,
  VIDEO_SEEDANCE_STARTERS,
  WORKSPACE_DESIGN_FILES_TAB,
  WORKSPACE_DESIGN_SYSTEM_TAB,
} from './constants';
import type {
  ChatRenderItem,
  QueuedSendDropEdge,
  QueuedSendItem,
  RunErrorDiagnosticInput,
  StarterPrompt,
} from './types';
import { isTodoWriteToolName } from '../../runtime/todos';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export function shouldHideEmptyBrandAssistantMessage(message: ChatMessage, metadata?: ProjectMetadata): boolean {
  if (metadata?.importedFrom !== 'brand-extraction' && metadata?.kind !== 'brand') return false;
  if (message.role !== 'assistant') return false;
  if (brandAssistantTextHasVisibleContent(message.content)) return false;
  if ((message.events ?? []).some(hasVisibleBrandAssistantEvent)) return false;
  if ((message.producedFiles?.length ?? 0) > 0) return false;
  return Boolean(message.runStatus || message.endedAt);
}

export function brandAssistantTextHasVisibleContent(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (hasOdCard(trimmed)) return true;
  const withoutArtifacts = stripArtifact(trimmed).trim();
  if (!withoutArtifacts) return false;
  return splitOnQuestionForms(withoutArtifacts).some((segment) => {
    if (segment.kind === 'form') return true;
    return segment.text.trim().length > 0;
  });
}

const HIDDEN_BRAND_ASSISTANT_STATUS_LABELS = new Set([
  'streaming',
  'starting',
  'running',
  'requesting',
  'thinking',
  'empty_response',
  'done',
  'completed',
]);

export function hasVisibleBrandAssistantEvent(event: NonNullable<ChatMessage['events']>[number]): boolean {
  switch (event.kind) {
    case 'text':
      return brandAssistantTextHasVisibleContent(event.text);
    case 'thinking':
      return event.text.trim().length > 0;
    case 'tool_use':
    case 'live_artifact':
    case 'live_artifact_refresh':
    case 'plugin_candidate':
      return true;
    case 'tool_result':
      return false;
    case 'raw':
      return false;
    case 'status':
      return !HIDDEN_BRAND_ASSISTANT_STATUS_LABELS.has(event.label);
    case 'usage':
    case 'diagnostic':
    case 'conversation_title':
      return false;
  }
}

export function pickStarters(
  metadata: ProjectMetadata | undefined,
  t: TranslateFn,
): StarterPrompt[] {
  const kind = metadata?.kind;
  if (kind === 'image') return IMAGE_STARTERS;
  if (kind === 'video') {
    return metadata?.videoModel === 'hyperframes-html'
      ? VIDEO_HYPERFRAMES_STARTERS
      : VIDEO_SEEDANCE_STARTERS;
  }
  if (kind === 'audio') return AUDIO_STARTERS;
  return DEFAULT_STARTER_KEYS.map((entry) => ({
    icon: entry.icon,
    title: t(entry.titleKey),
    tag: t(entry.tagKey),
    prompt: t(entry.promptKey),
  }));
}

export function sortArtifactsByModified(files: ProjectFile[]): ProjectFile[] {
  return [...files].sort(
    (a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name),
  );
}

export function importedFolderArtifactsFor(
  projectFiles: ProjectFile[],
  projectMetadata: ProjectMetadata | undefined,
): ProjectFile[] {
  return projectMetadata?.importedFrom === 'folder'
    ? sortArtifactsByModified(
        listDesignArtifactCandidates(projectFiles, projectMetadata.entryFile),
      )
    : [];
}

export function chatArtifactIcon(kind: ProjectFile['kind']): IconName {
  if (kind === 'html' || kind === 'code') return 'file-code';
  if (kind === 'image' || kind === 'sketch') return 'image';
  if (kind === 'video' || kind === 'audio') return 'play';
  if (kind === 'presentation') return 'present';
  return 'file';
}

export function chatArtifactShortKind(kind: ProjectFile['kind']): string {
  if (kind === 'html') return 'HTML';
  if (kind === 'image') return 'IMG';
  if (kind === 'sketch') return 'SKETCH';
  if (kind === 'video') return 'VIDEO';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'presentation') return 'PPT';
  if (kind === 'document') return 'DOC';
  return 'FILE';
}

export function chatArtifactKindLabel(kind: ProjectFile['kind'], t: TranslateFn): string {
  if (kind === 'html') return t('designFiles.kindHtml');
  if (kind === 'image') return t('designFiles.kindImage');
  if (kind === 'sketch') return t('designFiles.kindSketch');
  if (kind === 'video') return 'Video';
  if (kind === 'audio') return 'Audio';
  if (kind === 'pdf') return t('designFiles.kindPdf');
  if (kind === 'document') return t('designFiles.kindDocument');
  if (kind === 'presentation') return t('designFiles.kindPresentation');
  if (kind === 'spreadsheet') return t('designFiles.kindSpreadsheet');
  return t('designFiles.kindBinary');
}

export function buildChatRenderItems(messages: ChatMessage[]): ChatRenderItem[] {
  const items: ChatRenderItem[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i]!;
    items.push({
      kind: 'message',
      key: `message:${message.id}`,
      message,
    });
  }
  return items;
}

export function firstTodoWriteAssistantMessageId(messages: ChatMessage[]): string | null {
  const message = messages.find(
    (candidate) =>
      candidate.role === 'assistant' &&
      candidate.events?.some(
        (event) => event.kind === 'tool_use' && isTodoWriteToolName(event.name),
      ),
  );
  return message?.id ?? null;
}

export function estimateChatRenderItemHeight(item: ChatRenderItem): number {
  const message = item.message;
  const contentLength = message.content?.length ?? 0;
  const attachmentCount = (message.attachments?.length ?? 0) + (message.commentAttachments?.length ?? 0);
  const eventCount = message.events?.length ?? 0;
  const fileCount = message.producedFiles?.length ?? 0;
  const base = message.role === 'user' ? 82 : 118;
  const contentRows = Math.min(18, Math.ceil(contentLength / 120));
  return (
    base
    + contentRows * 18
    + attachmentCount * 34
    + eventCount * 28
    + fileCount * 32
    + CHAT_VIRTUAL_ROW_GAP_PX
  );
}

export function includeVirtualRowByKey<T extends { key: string }>(
  rows: Array<{ item: T; index: number; top: number }>,
  items: T[],
  offsets: number[],
  key: string | undefined,
): Array<{ item: T; index: number; top: number }> {
  if (!key || rows.some((row) => row.item.key === key)) return rows;
  const index = items.findIndex((item) => item.key === key);
  if (index === -1) return rows;
  return [
    ...rows,
    {
      item: items[index]!,
      index,
      top: offsets[index] ?? 0,
    },
  ].sort((a, b) => a.index - b.index);
}

export function isActiveRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'queued' || status === 'running';
}

export function isTerminalRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

export function retryableAssistantMessage(
  messages: ChatMessage[],
  lastAssistantId: string | null | undefined,
  paneStreaming: boolean,
): ChatMessage | null {
  if (paneStreaming) return null;
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return null;
  if (last.id !== lastAssistantId) return null;
  return last.runStatus === 'failed' ? last : null;
}

export function isAssistantMessageStreaming(
  message: ChatMessage,
  paneStreaming: boolean,
  lastAssistantId: string | null | undefined,
  forceStreamingMessageIds?: Set<string>,
): boolean {
  if (message.role !== 'assistant') return false;
  if (forceStreamingMessageIds?.has(message.id)) return true;
  if (isActiveRunStatus(message.runStatus)) return true;
  if (message.id !== lastAssistantId) return false;
  if (!paneStreaming) return false;
  if (message.endedAt !== undefined) return false;
  if (isTerminalRunStatus(message.runStatus)) return false;
  return true;
}

export function buildRunErrorDiagnosticText(input: RunErrorDiagnosticInput): string {
  const lines: string[] = [];
  const sourceText = input.rawMessage?.trim() || input.message.trim();
  if (sourceText) {
    lines.push(sourceText, '');
  }

  lines.push(
    'Open Design run error diagnostics',
    `trace_id: ${input.traceId ?? 'n/a'}`,
    `run_id: ${input.traceId ?? 'n/a'}`,
    `error_code: ${input.errorCode ?? 'n/a'}`,
    `project_id: ${input.projectId ?? 'n/a'}`,
    `conversation_id: ${input.conversationId ?? 'n/a'}`,
    `assistant_message_id: ${input.assistantMessageId ?? 'n/a'}`,
    `agent_id: ${input.agentId ?? 'n/a'}`,
  );

  return lines.join('\n');
}

export function filterConversations(
  conversations: Conversation[],
  query: string,
  t: TranslateFn,
): Conversation[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return conversations;
  return conversations.filter((conversation) => {
    const title = conversation.title || t('chat.untitledConversation');
    const meta = conversationMetaLabel(conversation, t);
    return `${title} ${conversation.id} ${meta}`.toLocaleLowerCase().includes(normalized);
  });
}

export function conversationMessageCount(
  conversation: Conversation,
  activeConversationId: string | null,
  messagesConversationId: string | null,
  activeMessageCount: number,
): number | null {
  // The live `messages` array is authoritative for the active conversation —
  // it stays fresh as a run streams new turns in — but ONLY once it has
  // actually loaded for that conversation. While a switch is mid-flight (or a
  // load failed) `messages` is reset to [] and `messagesConversationId` no
  // longer matches the active id; trusting `messages.length` there renders a
  // phantom "0 msg". Fall back to the persisted server count until the live
  // array catches up.
  if (
    conversation.id === activeConversationId &&
    messagesConversationId === activeConversationId
  ) {
    return activeMessageCount;
  }
  return typeof conversation.messageCount === 'number' ? conversation.messageCount : null;
}

export function compactCount(value: number): string {
  if (value < 1000) return String(value);
  const compact = Math.floor(value / 100) / 10;
  return `${compact}k`;
}

export function workspaceContextOpenTarget(item: WorkspaceContextItem): string | null {
  if (item.tabId) return item.tabId;
  if (item.kind === 'design-files') return WORKSPACE_DESIGN_FILES_TAB;
  if (item.kind === 'design-system') return WORKSPACE_DESIGN_SYSTEM_TAB;
  if (item.kind === 'file' || item.kind === 'live-artifact') {
    return item.path ?? item.label;
  }
  return null;
}

export function workspaceContextIcon(item: WorkspaceContextItem): IconName {
  if (item.kind === 'browser') return 'globe';
  if (item.kind === 'folder' || item.kind === 'design-files') return 'folder';
  if (item.kind === 'project') return 'folder';
  if (item.kind === 'local-code') return 'terminal';
  if (item.kind === 'terminal') return 'terminal';
  if (item.kind === 'side-chat') return 'comment';
  if (item.kind === 'design-system') return 'blocks';
  return 'file';
}

export function workspaceContextTitle(item: WorkspaceContextItem): string {
  return [
    workspaceContextKindLabel(item.kind),
    item.path ? `path: ${item.path}` : null,
    item.absolutePath ? `absolute: ${item.absolutePath}` : null,
    item.url ? `url: ${item.url}` : null,
    item.title ? `title: ${item.title}` : null,
  ].filter(Boolean).join(' | ');
}

export function workspaceContextKindLabel(kind: WorkspaceContextItem['kind']): string {
  switch (kind) {
    case 'browser':
      return 'Browser';
    case 'design-files':
      return 'Design files';
    case 'design-system':
      return 'Design system';
    case 'folder':
      return 'Folder';
    case 'project':
      return 'Project';
    case 'local-code':
      return 'Local code';
    case 'terminal':
      return 'Terminal';
    case 'side-chat':
      return 'Side chat';
    case 'live-artifact':
      return 'Live artifact';
    case 'file':
    default:
      return 'File';
  }
}

export function sortChatAttachmentsForDisplay(attachments: ChatAttachment[]): ChatAttachment[] {
  return attachments
    .map((attachment, index) => ({ attachment, index }))
    .sort((a, b) => {
      const aOrder = typeof a.attachment.order === 'number' && Number.isFinite(a.attachment.order)
        ? a.attachment.order
        : a.index;
      const bOrder = typeof b.attachment.order === 'number' && Number.isFinite(b.attachment.order)
        ? b.attachment.order
        : b.index;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map((entry) => entry.attachment);
}

export function isDesignSystemNextStepProject(metadata: ProjectMetadata | undefined): boolean {
  if (!metadata) return false;
  return (
    metadata.kind === 'brand' ||
    metadata.importedFrom === 'design-system' ||
    metadata.importedFrom === 'brand-extraction' ||
    Boolean(metadata.brandDesignSystemId)
  );
}

export function isBrandExtractionNextStepProject(metadata: ProjectMetadata | undefined): boolean {
  if (!metadata) return false;
  return (
    metadata.kind === 'brand' ||
    metadata.importedFrom === 'brand-extraction' ||
    Boolean(metadata.brandId) ||
    Boolean(metadata.brandDesignSystemId)
  );
}

export function isProgrammaticBrandAssistantMessage(message: ChatMessage | null | undefined): boolean {
  if (!message || message.role !== 'assistant') return false;
  const content = message.content || '';
  return (
    content.includes('<od-card type="brand-browser-assist"') ||
    /programmatic (design-system )?extraction|automatic pass needs a hand|extraction stopped/i.test(content) ||
    /程序化.*抽取|程式化.*抽取|抽取已停止/.test(content)
  );
}

export function relTime(ts: number, t: TranslateFn): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('common.now');
  if (diff < hr) return t('common.minutesShort', { n: Math.floor(diff / min) });
  if (diff < day) return t('common.hoursShort', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('common.daysShort', { n: Math.floor(diff / day) });
  return new Date(ts).toLocaleDateString();
}

export function conversationMetaLabel(
  conversation: Conversation,
  t: TranslateFn,
): string {
  const latestRun = conversation.latestRun;
  if (
    latestRun &&
    (latestRun.status === 'succeeded' ||
      latestRun.status === 'failed' ||
      latestRun.status === 'canceled') &&
    typeof conversation.totalDurationMs === 'number' &&
    Number.isFinite(conversation.totalDurationMs)
  ) {
    return formatDurationShort(conversation.totalDurationMs);
  }
  if (
    latestRun &&
    (latestRun.status === 'succeeded' ||
      latestRun.status === 'failed' ||
      latestRun.status === 'canceled') &&
    typeof latestRun.durationMs === 'number' &&
    Number.isFinite(latestRun.durationMs)
  ) {
    return formatDurationShort(latestRun.durationMs);
  }
  return relTime(conversation.updatedAt, t);
}

// Maps each assistant message id to the user message that follows it (if
// any) so the chat-side Questions banner can reopen that exact answered form
// in the right-hand panel later.
export function nextUserContentByAssistantIdFor(displayMessages: ChatMessage[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < displayMessages.length - 1; i++) {
    const m = displayMessages[i]!;
    const next = displayMessages[i + 1]!;
    if (m.role === 'assistant' && next.role === 'user') {
      map.set(m.id, next.content);
    }
  }
  return map;
}

export function latestAssistantForBrandStateFor(displayMessages: ChatMessage[]): ChatMessage | null {
  for (let i = displayMessages.length - 1; i >= 0; i -= 1) {
    const message = displayMessages[i]!;
    if (message.role === 'assistant') return message;
  }
  return null;
}

// Takes plain numbers (not a DOM/React drag event) so this stays testable
// with zero doubles — the caller reads `event.clientY` and
// `event.currentTarget.getBoundingClientRect()` before calling in.
export function queuedDropEdgeForPosition(clientY: number, rectTop: number, rectHeight: number): QueuedSendDropEdge {
  return clientY < rectTop + rectHeight / 2 ? 'before' : 'after';
}

export function reorderQueuedSendIds(
  items: QueuedSendItem[],
  draggingId: string,
  targetId: string,
  edge: QueuedSendDropEdge,
): string[] {
  const ids = items.map((item) => item.id);
  const from = ids.indexOf(draggingId);
  if (from < 0) return ids;
  const [draggedId] = ids.splice(from, 1);
  const targetIndex = ids.indexOf(targetId);
  if (targetIndex < 0 || !draggedId) return items.map((item) => item.id);
  ids.splice(edge === 'after' ? targetIndex + 1 : targetIndex, 0, draggedId);
  return ids;
}

export function summarizeQueuedPrompt(item: QueuedSendItem, t: TranslateFn): string {
  const normalized = item.prompt.replace(/\s+/g, ' ').trim();
  const text = normalized || t('chat.queuedFollowUpFallback');
  return text.length > 58 ? `${text.slice(0, 57)}...` : text;
}

export function formatDurationShort(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s - m * 60);
  return `${m}m ${rem.toString().padStart(2, '0')}s`;
}
