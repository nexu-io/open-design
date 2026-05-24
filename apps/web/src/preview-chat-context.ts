import type { ChatMessage } from './types';

export interface PreviewChatContext {
  activeFilePath: string;
  visibleFilePath: string;
  hash?: string;
}

export function messageContentWithPreviewContext(
  content: string,
  context: PreviewChatContext | null,
): string {
  if (!context) return content;
  const visibleContent = content.trim() || '(No extra typed instruction.)';
  const lines = [
    '',
    '',
    '<current-preview-context>',
    'The user is asking from the live preview. Treat visibleFile as the page currently shown in the preview iframe.',
    `activeFile: ${context.activeFilePath}`,
    `visibleFile: ${context.visibleFilePath}`,
  ];
  if (context.hash) lines.push(`hash: ${context.hash}`);
  lines.push('</current-preview-context>');
  return `${visibleContent}${lines.join('\n')}`;
}

export function historyWithPreviewContext(
  history: ChatMessage[],
  messageId: string,
  context: PreviewChatContext | null,
): ChatMessage[] {
  if (!context) return history;
  return history.map((message) => {
    if (message.id !== messageId || message.role !== 'user') return message;
    return {
      ...message,
      content: messageContentWithPreviewContext(message.content, context),
    };
  });
}

export function samePreviewChatContext(
  left: PreviewChatContext | null,
  right: PreviewChatContext | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.activeFilePath === right.activeFilePath &&
    left.visibleFilePath === right.visibleFilePath &&
    (left.hash ?? '') === (right.hash ?? '')
  );
}
