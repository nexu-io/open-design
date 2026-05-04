import type { ChatMessage } from './types';

export interface ConversationCompactionResult {
  history: ChatMessage[];
  compacted: boolean;
  originalChars: number;
  compactedChars: number;
  originalMessages: number;
  compactedMessages: number;
}

const COMPACTION_TRIGGER_CHARS = 32000;
const RECENT_MESSAGE_COUNT = 8;
const MAX_SUMMARY_CHARS = 12000;
const MAX_OLDER_CONTENT_CHARS = 1200;
const MAX_RECENT_CONTENT_CHARS = 10000;
const MAX_EVENT_CONTENT_CHARS = 900;
const MAX_EVENT_LINES = 16;

export function compactChatHistoryForPrompt(history: ChatMessage[]): ConversationCompactionResult {
  const originalChars = history.reduce((sum, message) => sum + estimateMessageChars(message), 0);

  if (originalChars <= COMPACTION_TRIGGER_CHARS || history.length <= RECENT_MESSAGE_COUNT + 2) {
    return {
      history,
      compacted: false,
      originalChars,
      compactedChars: originalChars,
      originalMessages: history.length,
      compactedMessages: history.length,
    };
  }

  const splitAt = Math.max(1, history.length - RECENT_MESSAGE_COUNT);
  const older = history.slice(0, splitAt);
  const recent = history.slice(splitAt).map((message, index, messages) =>
    index === messages.length - 1 ? message : trimMessageContent(message, MAX_RECENT_CONTENT_CHARS),
  );
  const summaryMessage: ChatMessage = {
    id: `open-design-compacted-${older[0]?.id ?? 'history'}-${older.length}`,
    role: 'user',
    content: buildCompactedSummary(older),
    createdAt: older[0]?.createdAt,
  };
  const compactedHistory = [summaryMessage, ...recent];
  const compactedChars = compactedHistory.reduce((sum, message) => sum + estimateMessageChars(message), 0);

  return {
    history: compactedHistory,
    compacted: true,
    originalChars,
    compactedChars,
    originalMessages: history.length,
    compactedMessages: compactedHistory.length,
  };
}

export function formatCompactionStatusDetail(result: ConversationCompactionResult): string {
  const savedChars = Math.max(0, result.originalChars - result.compactedChars);
  return `${result.originalMessages} mensagens viraram ${result.compactedMessages}; ${formatChars(savedChars)} removidos do prompt.`;
}

function buildCompactedSummary(messages: ChatMessage[]): string {
  const lines = [
    'Contexto anterior compactado automaticamente pelo Open Design.',
    'Use este resumo para manter continuidade. As mensagens recentes abaixo têm prioridade.',
    `Mensagens compactadas: ${messages.length}.`,
    '',
  ];

  for (const message of messages) {
    const parts = [`${message.role === 'user' ? 'Usuário' : 'Assistente'}:`];
    const content = message.content.trim();

    if (content) {
      parts.push(limitText(content, MAX_OLDER_CONTENT_CHARS));
    }

    const attachments = summarizeAttachments(message);

    if (attachments.length > 0) {
      parts.push(`Anexos: ${attachments.join(', ')}`);
    }

    const events = summarizeEvents(message);

    if (events.length > 0) {
      parts.push(`Eventos: ${events.join(' | ')}`);
    }

    if (parts.length > 1) {
      lines.push(parts.join('\n'));
      lines.push('');
    }
  }

  return limitText(lines.join('\n').trim(), MAX_SUMMARY_CHARS);
}

function trimMessageContent(message: ChatMessage, maxChars: number): ChatMessage {
  if (message.content.length <= maxChars) return message;
  return {
    ...message,
    content: limitText(message.content, maxChars),
  };
}

function summarizeAttachments(message: ChatMessage): string[] {
  const attachments = message.attachments?.map((attachment) => attachment.name || attachment.path) ?? [];
  const comments =
    message.commentAttachments?.map((attachment) =>
      [attachment.label, attachment.selector, limitText(attachment.comment, 220)].filter(Boolean).join(' em '),
    ) ?? [];
  const files =
    message.producedFiles?.map((file) => {
      const producedFile = file as { path?: string; name?: string };
      return producedFile.path || producedFile.name || 'arquivo';
    }) ?? [];

  return [...attachments, ...comments, ...files].filter(Boolean).slice(0, 12);
}

function summarizeEvents(message: ChatMessage): string[] {
  const lines: string[] = [];

  for (const event of message.events ?? []) {
    if (lines.length >= MAX_EVENT_LINES) break;

    if (event.kind === 'status') {
      lines.push([event.label, event.detail].filter(Boolean).join(': '));
      continue;
    }

    if (event.kind === 'tool_use') {
      lines.push(`tool ${event.name}: ${limitText(safeJson(event.input), MAX_EVENT_CONTENT_CHARS)}`);
      continue;
    }

    if (event.kind === 'tool_result' && event.isError) {
      lines.push(`erro de tool: ${limitText(event.content, MAX_EVENT_CONTENT_CHARS)}`);
      continue;
    }

    if (event.kind === 'text' && event.text.trim()) {
      lines.push(limitText(event.text, MAX_EVENT_CONTENT_CHARS));
    }
  }

  return lines;
}

function estimateMessageChars(message: ChatMessage): number {
  return (
    message.content.length +
    (message.attachments?.reduce((sum, attachment) => sum + attachment.name.length + attachment.path.length, 0) ?? 0) +
    (message.commentAttachments?.reduce(
      (sum, attachment) =>
        sum +
        attachment.label.length +
        attachment.selector.length +
        attachment.comment.length +
        attachment.filePath.length,
      0,
    ) ?? 0) +
    (message.events?.reduce((sum, event) => sum + safeJson(event).length, 0) ?? 0)
  );
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatChars(chars: number): string {
  if (chars < 1000) return `${chars} caracteres`;
  return `${Math.round(chars / 100) / 10} mil caracteres`;
}

function limitText(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}
