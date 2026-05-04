import type { ChatMessage } from './types';

export interface ConversationCompactionResult {
  history: ChatMessage[];
  compacted: boolean;
  originalChars: number;
  compactedChars: number;
  originalMessages: number;
  compactedMessages: number;
}

type LooseRecord = Record<string, unknown>;

const COMPACTION_TRIGGER_CHARS = 32000;
const RECENT_MESSAGE_COUNT = 8;
const MAX_SUMMARY_CHARS = 12000;
const MAX_OLDER_CONTENT_CHARS = 1200;
const MAX_RECENT_CONTENT_CHARS = 10000;
const MAX_EVENT_CONTENT_CHARS = 900;
const MAX_EVENT_LINES = 16;

export function compactChatHistoryForPrompt(history: ChatMessage[]): ConversationCompactionResult {
  const safeHistory = normalizeChatHistory(history);
  const originalChars = safeHistory.reduce((sum, message) => sum + estimateMessageChars(message), 0);

  if (originalChars <= COMPACTION_TRIGGER_CHARS || safeHistory.length <= RECENT_MESSAGE_COUNT + 2) {
    return {
      history: safeHistory,
      compacted: false,
      originalChars,
      compactedChars: originalChars,
      originalMessages: safeHistory.length,
      compactedMessages: safeHistory.length,
    };
  }

  const splitAt = Math.max(1, safeHistory.length - RECENT_MESSAGE_COUNT);
  const older = safeHistory.slice(0, splitAt);
  const recent = safeHistory.slice(splitAt).map((message, index, messages) =>
    index === messages.length - 1 ? message : trimMessageContent(message, MAX_RECENT_CONTENT_CHARS),
  );
  const summaryMessage: ChatMessage = {
    id: `open-design-compacted-${safeMessageId(older[0]) || 'history'}-${older.length}`,
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
    originalMessages: safeHistory.length,
    compactedMessages: compactedHistory.length,
  };
}

export function formatCompactionStatusDetail(result: ConversationCompactionResult): string {
  const savedChars = Math.max(0, result.originalChars - result.compactedChars);
  return `${result.originalMessages} mensagens viraram ${result.compactedMessages}; ${formatChars(savedChars)} removidos do prompt.`;
}

function normalizeChatHistory(history: ChatMessage[]): ChatMessage[] {
  if (!Array.isArray(history)) return [];
  return history
    .map((message, index) => normalizeChatMessage(message, index))
    .filter((message): message is ChatMessage => Boolean(message));
}

function normalizeChatMessage(message: unknown, index: number): ChatMessage | null {
  if (!isRecord(message)) return null;
  const role = message.role === 'assistant' ? 'assistant' : 'user';
  const id = safeString(message.id) || `message-${index + 1}`;
  return {
    ...(message as ChatMessage),
    id,
    role,
    content: safeString(message.content),
  };
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
    const content = safeString(message.content).trim();

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
  const content = safeString(message.content);
  if (content.length <= maxChars) return message;
  return {
    ...message,
    content: limitText(content, maxChars),
  };
}

function summarizeAttachments(message: ChatMessage): string[] {
  const record = message as unknown as LooseRecord;
  const attachments = safeArray(record.attachments).map((attachment) => {
    const item = asRecord(attachment);
    return safeString(item?.name) || safeString(item?.path);
  });
  const comments = safeArray(record.commentAttachments).map((attachment) => {
    const item = asRecord(attachment);
    if (!item) return '';
    return [
      safeString(item.label),
      safeString(item.selector),
      limitText(safeString(item.comment), 220),
    ].filter(Boolean).join(' em ');
  });
  const files = safeArray(record.producedFiles).map((file) => {
    const item = asRecord(file);
    return safeString(item?.path) || safeString(item?.name) || 'arquivo';
  });

  return [...attachments, ...comments, ...files].filter(Boolean).slice(0, 12);
}

function summarizeEvents(message: ChatMessage): string[] {
  const lines: string[] = [];
  const events = safeArray((message as unknown as LooseRecord).events);

  for (const rawEvent of events) {
    if (lines.length >= MAX_EVENT_LINES) break;
    const event = asRecord(rawEvent);
    if (!event) continue;
    const kind = safeString(event.kind);

    if (kind === 'status') {
      lines.push([safeString(event.label), safeString(event.detail)].filter(Boolean).join(': '));
      continue;
    }

    if (kind === 'tool_use') {
      lines.push(`tool ${safeString(event.name) || 'tool'}: ${limitText(safeJson(event.input), MAX_EVENT_CONTENT_CHARS)}`);
      continue;
    }

    if (kind === 'tool_result' && Boolean(event.isError)) {
      lines.push(`erro de tool: ${limitText(safeString(event.content) || safeJson(event.content), MAX_EVENT_CONTENT_CHARS)}`);
      continue;
    }

    if (kind === 'text') {
      const text = safeString(event.text).trim();
      if (text) lines.push(limitText(text, MAX_EVENT_CONTENT_CHARS));
    }
  }

  return lines;
}

function estimateMessageChars(message: ChatMessage): number {
  const record = message as unknown as LooseRecord;
  return (
    safeString(record.content).length +
    safeArray(record.attachments).reduce((sum, attachment) => {
      const item = asRecord(attachment);
      return sum + safeString(item?.name).length + safeString(item?.path).length;
    }, 0) +
    safeArray(record.commentAttachments).reduce((sum, attachment) => {
      const item = asRecord(attachment);
      return sum +
        safeString(item?.label).length +
        safeString(item?.selector).length +
        safeString(item?.comment).length +
        safeString(item?.filePath).length;
    }, 0) +
    safeArray(record.events).reduce((sum, event) => sum + safeJson(event).length, 0)
  );
}

function safeMessageId(message: ChatMessage | undefined): string {
  return safeString((message as unknown as LooseRecord | undefined)?.id);
}

function safeJson(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return typeof json === 'string' ? json : '';
  } catch {
    return safeString(value);
  }
}

function safeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): LooseRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is LooseRecord {
  return Boolean(value) && typeof value === 'object';
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function formatChars(chars: number): string {
  if (chars < 1000) return `${chars} caracteres`;
  return `${Math.round(chars / 100) / 10} mil caracteres`;
}

function limitText(text: string, maxChars: number): string {
  const clean = safeString(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}
