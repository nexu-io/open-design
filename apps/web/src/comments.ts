import type {
  ChatCommentAttachment,
  ChatCommentSelectionKind,
  ChatMessage,
  PreviewAnnotationStyle,
  PreviewCommentAttachment,
  PreviewCommentMember,
  PreviewComment,
  PreviewCommentSelectionKind,
  PreviewCommentTarget,
  PreviewVisualMarkKind,
} from './types';

export interface PreviewCommentSnapshot {
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  text: string;
  position: { x: number; y: number; width: number; height: number };
  hoverPoint?: { x: number; y: number };
  htmlHint: string;
  style?: PreviewAnnotationStyle;
  selectionKind?: PreviewCommentSelectionKind;
  memberCount?: number;
  podMembers?: PreviewCommentMember[];
  slideIndex?: number;
}

export interface CommentOverlayBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface VisualAnnotationTarget {
  filePath: string;
  elementId?: string;
  selector?: string;
  label?: string;
  text?: string;
  position?: { x: number; y: number; width: number; height: number };
  htmlHint?: string;
  style?: PreviewAnnotationStyle;
}

export interface VisualAnnotationAttachmentInput {
  order: number;
  idSeed?: string;
  /** Absent when the preview screenshot could not be captured (#4080); the
   *  attachment then carries only the structured location (file/position/
   *  markKind) so the agent can still find the marked region (#4084). */
  screenshotPath?: string;
  markKind: PreviewVisualMarkKind;
  note: string;
  bounds: { x: number; y: number; width: number; height: number };
  target?: VisualAnnotationTarget | null;
}

export function isInternalCommentTargetName(value: string | undefined | null): boolean {
  const trimmed = String(value ?? '').trim();
  return /^path-\d+(?:-\d+)*$/.test(trimmed);
}

export function commentTargetDisplayName(
  target: {
    elementId?: string | null;
    label?: string | null;
    selectionKind?: ChatCommentSelectionKind | PreviewCommentSelectionKind | null;
  },
  fallback = 'Annotation',
): string {
  if (target.selectionKind === 'visual') return 'Visual mark';
  const label = String(target.label ?? '').trim();
  if (label && !isInternalCommentTargetName(label)) return label;
  const elementId = String(target.elementId ?? '').trim();
  if (elementId && !isInternalCommentTargetName(elementId)) return elementId;
  return fallback;
}

export function targetFromSnapshot(snapshot: PreviewCommentSnapshot): PreviewCommentTarget {
  const podMembers = normalizeMembers(snapshot.podMembers);
  return {
    filePath: snapshot.filePath,
    elementId: snapshot.elementId,
    selector: snapshot.selector,
    label: snapshot.label,
    text: trimContextText(snapshot.text),
    position: normalizePosition(snapshot.position),
    htmlHint: trimHtmlHint(snapshot.htmlHint),
    style: normalizeStyle(snapshot.style),
    selectionKind: snapshot.selectionKind === 'pod' ? 'pod' : 'element',
    memberCount:
      snapshot.selectionKind === 'pod'
        ? (podMembers.length > 0
            ? podMembers.length
            : Number.isFinite(snapshot.memberCount)
              ? Math.round(snapshot.memberCount as number)
              : 0)
        : undefined,
    podMembers: podMembers.length > 0 ? podMembers : undefined,
    ...(snapshot.slideIndex === undefined ? {} : { slideIndex: snapshot.slideIndex }),
  };
}

export function isValidCommentOverlayPosition(
  position: { x: number; y: number; width: number; height: number } | undefined | null,
): boolean {
  if (!position) return false;
  const normalized = normalizePosition(position);
  return (
    Number.isFinite(normalized.x)
    && Number.isFinite(normalized.y)
    && Number.isFinite(normalized.width)
    && Number.isFinite(normalized.height)
    && normalized.width > 0
    && normalized.height > 0
  );
}

export function commentVisibleOnDeckSlide(
  comment: Pick<PreviewComment, 'slideIndex'>,
  activeSlideIndex: number | null | undefined,
): boolean {
  if (activeSlideIndex == null) return true;
  if (typeof comment.slideIndex !== 'number') return true;
  return comment.slideIndex === activeSlideIndex;
}

// When a queued chat send starts processing, the deck preview should flip to
// the slide its marked element lives on so the user watches the edit land in
// context instead of staring at slide 1. The mark's `slideIndex` is captured
// at queue time and carried on each comment attachment. Return the first
// attachment that names a deck file and a concrete slide; null means there is
// nothing slide-scoped to navigate to (plain prompt, free pin, missing index).
export function queuedSlideNavTarget(
  commentAttachments: readonly ChatCommentAttachment[] | null | undefined,
): { filePath: string; slideIndex: number } | null {
  if (!commentAttachments) return null;
  for (const attachment of commentAttachments) {
    const filePath = attachment.filePath?.trim();
    const slideIndex = attachment.slideIndex;
    if (
      filePath &&
      typeof slideIndex === 'number' &&
      Number.isFinite(slideIndex) &&
      slideIndex >= 0
    ) {
      return { filePath, slideIndex: Math.floor(slideIndex) };
    }
  }
  return null;
}

export function commentSnapshotOverlayEqual(
  a: PreviewCommentSnapshot,
  b: PreviewCommentSnapshot,
): boolean {
  const positionA = normalizePosition(a.position);
  const positionB = normalizePosition(b.position);
  return (
    a.elementId === b.elementId
    && a.filePath === b.filePath
    && positionA.x === positionB.x
    && positionA.y === positionB.y
    && positionA.width === positionB.width
    && positionA.height === positionB.height
    && (a.slideIndex ?? -1) === (b.slideIndex ?? -1)
  );
}

export function commentSnapshotEqual(
  a: PreviewCommentSnapshot,
  b: PreviewCommentSnapshot,
): boolean {
  if (!commentSnapshotOverlayEqual(a, b)) return false;
  return (
    a.selector === b.selector
    && a.label === b.label
    && trimContextText(a.text) === trimContextText(b.text)
    && trimHtmlHint(a.htmlHint) === trimHtmlHint(b.htmlHint)
    && normalizeSelectionKind(a.selectionKind) === normalizeSelectionKind(b.selectionKind)
    && normalizeMemberCount(a.memberCount) === normalizeMemberCount(b.memberCount)
    && JSON.stringify(normalizeStyle(a.style) ?? null) === JSON.stringify(normalizeStyle(b.style) ?? null)
    && JSON.stringify(normalizeMembers(a.podMembers)) === JSON.stringify(normalizeMembers(b.podMembers))
    && normalizeHoverPoint(a.hoverPoint).x === normalizeHoverPoint(b.hoverPoint).x
    && normalizeHoverPoint(a.hoverPoint).y === normalizeHoverPoint(b.hoverPoint).y
  );
}

export function liveCommentTargetMapsEqual(
  current: Map<string, PreviewCommentSnapshot>,
  next: Map<string, PreviewCommentSnapshot>,
): boolean {
  if (current.size !== next.size) return false;
  for (const [elementId, snapshot] of current) {
    const candidate = next.get(elementId);
    if (!candidate || !commentSnapshotEqual(snapshot, candidate)) return false;
  }
  return true;
}

export function overlayBoundsFromSnapshot(
  snapshot: PreviewCommentSnapshot,
  scale: number,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): CommentOverlayBounds {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const position = normalizePosition(snapshot.position);
  return {
    left: offset.x + position.x * safeScale,
    top: offset.y + position.y * safeScale,
    width: Math.max(1, position.width * safeScale),
    height: Math.max(1, position.height * safeScale),
  };
}

export function liveSnapshotForComment(
  comment: PreviewComment,
  snapshots: Map<string, PreviewCommentSnapshot>,
): PreviewCommentSnapshot | null {
  const snapshot = snapshots.get(comment.elementId);
  if (snapshot && snapshot.filePath === comment.filePath && isValidCommentOverlayPosition(snapshot.position)) {
    return snapshot;
  }
  if (!comment.elementId.startsWith('pin-')) return null;
  if (!isValidCommentOverlayPosition(comment.position)) return null;
  return {
    filePath: comment.filePath,
    elementId: comment.elementId,
    selector: comment.selector,
    label: comment.label,
    text: trimContextText(comment.text),
    position: normalizePosition(comment.position),
    htmlHint: trimHtmlHint(comment.htmlHint),
    style: normalizeStyle(comment.style),
    selectionKind: comment.selectionKind === 'pod' ? 'pod' : 'element',
    memberCount: comment.memberCount,
    podMembers: normalizeMembers(comment.podMembers),
    slideIndex: comment.slideIndex,
  };
}

export function commentToAttachment(
  comment: PreviewComment,
  order: number,
): ChatCommentAttachment {
  const podMembers = normalizeMembers(comment.podMembers);
  const imageAttachments = mergePreviewCommentAttachments(undefined, comment.attachments);
  return {
    id: comment.id,
    order,
    filePath: comment.filePath,
    elementId: comment.elementId,
    selector: comment.selector,
    label: comment.label,
    comment: comment.note.trim() || imageOnlyCommentFallback(imageAttachments.length),
    currentText: trimContextText(comment.text),
    pagePosition: normalizePosition(comment.position),
    htmlHint: trimHtmlHint(comment.htmlHint),
    style: normalizeStyle(comment.style),
    selectionKind: comment.selectionKind === 'pod' ? 'pod' : 'element',
    memberCount:
      comment.selectionKind === 'pod'
        ? (podMembers.length > 0
            ? podMembers.length
            : typeof comment.memberCount === 'number'
              ? Math.round(comment.memberCount)
              : 0)
        : undefined,
    podMembers: podMembers.length > 0 ? podMembers : undefined,
    ...(typeof comment.slideIndex === 'number' ? { slideIndex: comment.slideIndex } : {}),
    imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined,
    source: 'saved-comment',
  };
}

export function commentsToAttachments(comments: PreviewComment[]): ChatCommentAttachment[] {
  return comments.map((comment, index) => commentToAttachment(comment, index + 1));
}

export function buildBoardCommentAttachments(input: {
  target: PreviewCommentTarget;
  notes: string[];
  includeImageOnly?: boolean;
  imageAttachmentCount?: number;
}): ChatCommentAttachment[] {
  const podMembers = normalizeMembers(input.target.podMembers);
  const selectionKind = input.target.selectionKind === 'pod' ? 'pod' : 'element';
  const memberCount =
    selectionKind === 'pod'
      ? (podMembers.length > 0
          ? podMembers.length
          : typeof input.target.memberCount === 'number'
            ? Math.round(input.target.memberCount)
            : 0)
      : undefined;
  const notes = input.notes
    .map((note) => note.trim())
    .filter(Boolean);
  const comments = notes.length > 0
    ? notes
    : input.includeImageOnly
      ? [imageOnlyCommentFallback(input.imageAttachmentCount ?? 0)]
      : [];
  return comments
    .filter(Boolean)
    .map((note, index) => ({
      id: `${input.target.elementId}-board-${index + 1}`,
      order: index + 1,
      filePath: input.target.filePath,
      elementId: input.target.elementId,
      selector: input.target.selector,
      label: input.target.label,
      comment: note,
      currentText: trimContextText(input.target.text),
      pagePosition: normalizePosition(input.target.position),
      htmlHint: trimHtmlHint(input.target.htmlHint),
      style: normalizeStyle(input.target.style),
      selectionKind,
      memberCount,
      podMembers: podMembers.length > 0 ? podMembers : undefined,
      ...(typeof input.target.slideIndex === 'number' ? { slideIndex: input.target.slideIndex } : {}),
      source: 'board-batch',
    }));
}

export function buildVisualAnnotationAttachment(input: VisualAnnotationAttachmentInput): ChatCommentAttachment {
  const target = input.target ?? null;
  const intent = input.screenshotPath
    ? visualAnnotationIntent(input.markKind)
    : visualAnnotationIntentWithoutScreenshot();
  const visualId = sanitizeVisualAttachmentId(input.idSeed || input.screenshotPath || String(input.order));
  const elementId = target?.elementId?.trim() || `visual-mark-${visualId}`;
  const label = target?.label?.trim() || (input.screenshotPath ? 'Marked screenshot region' : 'Marked preview region');
  const comment = input.note.trim() || intent;
  return {
    id: `${elementId}-visual-${visualId}`,
    order: input.order,
    filePath: target?.filePath?.trim() || input.screenshotPath || '',
    elementId,
    selector: target?.selector?.trim() || '',
    label,
    comment,
    currentText: trimContextText(target?.text || ''),
    pagePosition: normalizePosition(target?.position ?? input.bounds),
    htmlHint: trimHtmlHint(target?.htmlHint || ''),
    style: normalizeStyle(target?.style),
    selectionKind: 'visual',
    screenshotPath: input.screenshotPath,
    markKind: input.markKind,
    intent,
    source: 'board-batch',
  };
}

function sanitizeVisualAttachmentId(value: string): string {
  const id = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return id || 'mark';
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

export function mergePreviewCommentAttachments(
  existing: PreviewCommentAttachment[] | undefined,
  incoming: PreviewCommentAttachment[] | undefined,
): PreviewCommentAttachment[] {
  const merged: PreviewCommentAttachment[] = [];
  const seen = new Set<string>();
  for (const item of [...(existing ?? []), ...(incoming ?? [])]) {
    const path = String(item.path || '').trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const name = String(item.name || '').trim() || path.split('/').pop() || path;
    merged.push({ path, name });
  }
  return merged;
}

export function simplePositionLabel(position: PreviewComment['position']): string {
  const normalized = normalizePosition(position);
  return `x${normalized.x} y${normalized.y}`;
}

export function selectionKindLabel(
  selectionKind: ChatCommentSelectionKind | undefined,
  memberCount?: number,
): string {
  if (selectionKind === 'visual') return 'Visual mark';
  if (selectionKind === 'pod') {
    return memberCount && memberCount > 0 ? `Pod · ${memberCount} items` : 'Pod';
  }
  return 'Element';
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
    "Hard scope: change ONLY the elements identified below by selector / position / pod members. Do NOT modify sibling sub-pages, parent layout, global CSS, design tokens, or unrelated rules even if you notice issues there — surface those as a follow-up note in your reply instead of editing them. If the user's request cannot be satisfied without touching outside this scope, ask the user before proceeding. For visual marks, inspect the screenshot when one is provided (otherwise locate the region from the structured fields) and modify the marked region first.",
  ];
  commentAttachments.forEach((item) => {
    const position = normalizePosition(item.pagePosition);
    const selectionKind =
      item.selectionKind === 'visual' ? 'visual' : item.selectionKind === 'pod' ? 'pod' : 'element';
    lines.push(
      '',
      `${item.order}. ${item.elementId}`,
      `targetKind: ${selectionKind}`,
      `file: ${item.filePath}`,
      `label: ${item.label || '(unlabeled)'}`,
      `position: x${position.x} y${position.y} ${position.width}x${position.height}`,
      `currentText: ${trimContextText(item.currentText || '') || '(empty)'}`,
      `htmlHint: ${trimHtmlHint(item.htmlHint || '') || '(none)'}`,
      `computedStyle: ${formatAnnotationStyle(item.style) || '(none)'}`,
    );
    if (item.comment && item.commentContext !== 'query') {
      lines.push(`comment: ${item.comment}`);
    }
    if (selectionKind === 'visual') {
      if (item.screenshotPath) {
        lines.push(
          `screenshot: ${item.screenshotPath}`,
          `markKind: ${item.markKind || 'stroke'}`,
          `intent: ${item.intent || visualAnnotationIntent(item.markKind || 'stroke')}`,
        );
      } else {
        lines.push(
          `markKind: ${item.markKind || 'stroke'}`,
          `intent: ${item.intent || visualAnnotationIntentWithoutScreenshot()}`,
        );
      }
      if (item.selector) lines.push(`selector: ${item.selector}`);
    } else {
      lines.splice(lines.length - 4, 0, `selector: ${item.selector}`);
    }
    if (selectionKind === 'pod') {
      lines.push(`memberCount: ${item.memberCount || item.podMembers?.length || 0}`);
      (item.podMembers ?? []).slice(0, 8).forEach((member, memberIndex) => {
        lines.push(
          `member.${memberIndex + 1}: ${member.elementId} | ${member.label || '(unlabeled)'} | ${member.selector}`,
        );
        const memberStyle = formatAnnotationStyle(member.style);
        if (memberStyle) lines.push(`member.${memberIndex + 1}.computedStyle: ${memberStyle}`);
      });
    }
    const imageAttachments = mergePreviewCommentAttachments(undefined, item.imageAttachments);
    if (imageAttachments.length > 0) {
      lines.push(`imageAttachments: ${imageAttachments.length}`);
      imageAttachments.forEach((attachment, attachmentIndex) => {
        lines.push(`image.${attachmentIndex + 1}: ${attachment.path} | ${attachment.name}`);
      });
    }
  });
  lines.push('</attached-preview-comments>');
  return lines.join('\n');
}

function imageOnlyCommentFallback(count: number): string {
  if (count <= 0) return '';
  return count > 1
    ? `Use the ${count} attached images as the comment reference.`
    : 'Use the attached image as the comment reference.';
}

function visualAnnotationIntent(markKind: PreviewVisualMarkKind): string {
  if (markKind === 'click') {
    return 'The screenshot has a blue focus box around the picked element; modify that picked part first.';
  }
  if (markKind === 'click+stroke') {
    return 'The screenshot has a blue focus box and red strokes; together they identify the part the user wants changed.';
  }
  return 'The screenshot has red strokes that identify the visual region the user wants changed.';
}

// Screenshot-less variant (#4084): the capture failed (#4080), so pointing the
// agent at a screenshot would point at nothing. The structured fields are the
// only anchor.
function visualAnnotationIntentWithoutScreenshot(): string {
  return 'The user marked a region of the live preview; no screenshot was captured, so locate the region using file, position, and currentText.';
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

function normalizeSelectionKind(
  selectionKind: PreviewCommentSnapshot['selectionKind'],
): PreviewCommentSelectionKind {
  return selectionKind === 'pod' ? 'pod' : 'element';
}

function normalizeMemberCount(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? Math.round(value as number) : undefined;
}

function normalizeHoverPoint(
  input: PreviewCommentSnapshot['hoverPoint'],
): { x: number | undefined; y: number | undefined } {
  if (!input) return { x: undefined, y: undefined };
  return {
    x: Number.isFinite(input.x) ? Math.round(input.x) : undefined,
    y: Number.isFinite(input.y) ? Math.round(input.y) : undefined,
  };
}

function normalizeMembers(input: PreviewCommentMember[] | undefined): PreviewCommentMember[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((member) => ({
      elementId: String(member.elementId || '').trim(),
      selector: String(member.selector || '').trim(),
      label: String(member.label || '').trim(),
      text: trimContextText(String(member.text || '')),
      position: normalizePosition(member.position),
      htmlHint: trimHtmlHint(String(member.htmlHint || '')),
      style: normalizeStyle(member.style),
    }))
    .filter((member) => member.elementId && member.selector);
}

function normalizeStyle(input: unknown): PreviewAnnotationStyle | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const raw = input as Record<string, unknown>;
  const style: PreviewAnnotationStyle = {};
  for (const key of ANNOTATION_STYLE_KEYS) {
    const value = raw[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed) style[key] = trimmed.slice(0, 120);
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

function formatAnnotationStyle(style: PreviewAnnotationStyle | undefined): string {
  if (!style) return '';
  return ANNOTATION_STYLE_KEYS
    .map((key) => {
      const value = style[key];
      return value ? `${key}: ${value}` : null;
    })
    .filter((item): item is string => Boolean(item))
    .join('; ');
}

const ANNOTATION_STYLE_KEYS = [
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
  'fontFamily',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderRadius',
] as const;
