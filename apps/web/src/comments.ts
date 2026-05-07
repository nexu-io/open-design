import type {
  ChatCommentAttachment,
  ChatMessage,
  PreviewComment,
  PreviewCommentTarget,
} from './types';

export interface PreviewCommentSnapshot {
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  text: string;
  position: { x: number; y: number; width: number; height: number };
  htmlHint: string;
}

export interface CommentOverlayBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function targetFromSnapshot(snapshot: PreviewCommentSnapshot): PreviewCommentTarget {
  return {
    filePath: snapshot.filePath,
    elementId: snapshot.elementId,
    selector: snapshot.selector,
    label: snapshot.label,
    text: trimContextText(snapshot.text),
    position: normalizePosition(snapshot.position),
    htmlHint: trimHtmlHint(snapshot.htmlHint),
  };
}

export function overlayBoundsFromSnapshot(
  snapshot: PreviewCommentSnapshot,
  scale: number,
): CommentOverlayBounds {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const position = normalizePosition(snapshot.position);
  return {
    left: position.x * safeScale,
    top: position.y * safeScale,
    width: Math.max(1, position.width * safeScale),
    height: Math.max(1, position.height * safeScale),
  };
}

export function liveSnapshotForComment(
  comment: PreviewComment,
  snapshots: Map<string, PreviewCommentSnapshot>,
): PreviewCommentSnapshot | null {
  const snapshot = snapshots.get(comment.elementId);
  if (!snapshot || snapshot.filePath !== comment.filePath) return null;
  return snapshot;
}

export function commentToAttachment(
  comment: PreviewComment,
  order: number,
): ChatCommentAttachment {
  return {
    id: comment.id,
    order,
    filePath: comment.filePath,
    elementId: comment.elementId,
    selector: comment.selector,
    label: comment.label,
    comment: comment.note,
    currentText: trimContextText(comment.text),
    pagePosition: normalizePosition(comment.position),
    htmlHint: trimHtmlHint(comment.htmlHint),
  };
}

export function commentsToAttachments(comments: PreviewComment[]): ChatCommentAttachment[] {
  return comments.map((comment, index) => commentToAttachment(comment, index + 1));
}

export function messageContentWithCommentAttachments(
  content: string,
  commentAttachments: ChatCommentAttachment[],
): string {
  if (commentAttachments.length === 0) return content;
  const visibleContent = content.trim() || '(No extra typed instruction.)';
  return `${visibleContent}${renderCommentAttachmentContext(commentAttachments)}`;
}

export function historyWithCommentAttachmentContext(
  history: ChatMessage[],
  messageId: string,
): ChatMessage[] {
  return history.map((message) => {
    const commentAttachments = message.commentAttachments ?? [];
    if (message.id !== messageId || message.role !== 'user' || commentAttachments.length === 0) return message;
    return {
      ...message,
      content: messageContentWithCommentAttachments(message.content, commentAttachments),
    };
  });
}

export function mergeAttachedComments(
  current: PreviewComment[],
  next: PreviewComment,
): PreviewComment[] {
  const byId = new Map(current.map((comment) => [comment.id, comment]));
  byId.set(next.id, next);
  return Array.from(byId.values());
}

export function removeAttachedComment(
  current: PreviewComment[],
  commentId: string,
): PreviewComment[] {
  return current.filter((comment) => comment.id !== commentId);
}

export function simplePositionLabel(position: PreviewComment['position']): string {
  const normalized = normalizePosition(position);
  return `x${normalized.x} y${normalized.y}`;
}

export function trimContextText(value: string): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

export function trimHtmlHint(value: string): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function renderCommentAttachmentContext(commentAttachments: ChatCommentAttachment[]): string {
  const lines = [
    '',
    '',
    '<attached-preview-comments>',
    'Scope: apply the user request to the attached preview target by default. Preserve unrelated elements.',
  ];
  commentAttachments.forEach((item) => {
    const position = normalizePosition(item.pagePosition);
    lines.push(
      '',
      `${item.order}. ${item.elementId}`,
      `file: ${item.filePath}`,
      `selector: ${item.selector}`,
      `label: ${item.label || '(unlabeled)'}`,
      `position: x${position.x} y${position.y} ${position.width}x${position.height}`,
      `currentText: ${trimContextText(item.currentText || '') || '(empty)'}`,
      `htmlHint: ${trimHtmlHint(item.htmlHint || '') || '(none)'}`,
      `comment: ${item.comment}`,
    );
  });
  lines.push('</attached-preview-comments>');
  return lines.join('\n');
}

function normalizePosition(input: PreviewComment['position']): PreviewComment['position'] {
  return {
    x: finite(input?.x),
    y: finite(input?.y),
    width: finite(input?.width),
    height: finite(input?.height),
  };
}

function finite(value: number | undefined): number {
  return Number.isFinite(value) ? Math.round(value as number) : 0;
}
