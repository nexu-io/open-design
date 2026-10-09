import type {
  PreviewAnnotationStyle,
  PreviewComment,
  PreviewCommentAnchorState,
  PreviewCommentMember,
  PreviewCommentSelectionKind,
} from '../types';

/** Portable comment-anchor inputs shared with the share-page implementation. */
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

export interface CommentAnchorResolution {
  state: PreviewCommentAnchorState;
  snapshot: PreviewCommentSnapshot | null;
}

interface CommentOverlayBounds {
  left: number;
  top: number;
  width: number;
  height: number;
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

export function resolveCommentAnchor(
  comment: PreviewComment,
  snapshots: Map<string, PreviewCommentSnapshot>,
  currentVersion?: number,
): CommentAnchorResolution {
  const exact = snapshots.get(comment.elementId);
  if (exact && exact.filePath === comment.filePath && validPosition(exact.position)) {
    return { state: anchoredOrReanchored(comment, currentVersion), snapshot: exact };
  }
  if (comment.elementId.startsWith('pin-') && validPosition(comment.position)) {
    return { state: anchoredOrReanchored(comment, currentVersion), snapshot: ghostSnapshotFromComment(comment) };
  }
  const fuzzy = fuzzyFindSnapshot(comment, snapshots);
  if (fuzzy) return { state: 'stale', snapshot: fuzzy };
  const ghostPos = validPosition(comment.lastGoodPosition) ?? validPosition(comment.position);
  return { state: 'lost', snapshot: ghostPos ? ghostSnapshotFromComment(comment, ghostPos) : null };
}

function anchoredOrReanchored(comment: PreviewComment, currentVersion: number | undefined): PreviewCommentAnchorState {
  return typeof currentVersion === 'number' && typeof comment.anchoredVersion === 'number' && comment.anchoredVersion !== currentVersion
    ? 'reanchored'
    : 'anchored';
}

function fuzzyFindSnapshot(comment: PreviewComment, snapshots: Map<string, PreviewCommentSnapshot>): PreviewCommentSnapshot | null {
  const wantSelector = String(comment.selector || '').trim();
  const wantHint = trimHtmlHint(comment.htmlHint || '');
  const wantText = trimContextText(comment.text || '');
  const wantPos = validPosition(comment.lastGoodPosition) ?? validPosition(comment.position);
  let best: PreviewCommentSnapshot | null = null;
  let bestScore = 0;
  for (const snap of snapshots.values()) {
    if (snap.filePath !== comment.filePath || (snap.slideIndex ?? -1) !== (comment.slideIndex ?? -1) || !validPosition(snap.position)) continue;
    let score = 0;
    if (wantSelector && String(snap.selector || '').trim() === wantSelector) score += 4;
    if (wantHint && trimHtmlHint(snap.htmlHint) === wantHint) score += 3;
    if (wantText && trimContextText(snap.text) === wantText) score += 2;
    if (wantPos) score += positionProximityScore(snap.position, wantPos);
    if (score > bestScore) { bestScore = score; best = snap; }
  }
  return bestScore >= 2 ? best : null;
}

function positionProximityScore(a: PreviewCommentSnapshot['position'], b: PreviewCommentSnapshot['position']): number {
  const na = normalizePosition(a);
  const nb = normalizePosition(b);
  const dist = Math.hypot(na.x + na.width / 2 - (nb.x + nb.width / 2), na.y + na.height / 2 - (nb.y + nb.height / 2));
  return Math.max(0, 1 - dist / 400);
}

function ghostSnapshotFromComment(comment: PreviewComment, position?: PreviewCommentSnapshot['position']): PreviewCommentSnapshot {
  return { filePath: comment.filePath, elementId: comment.elementId, selector: comment.selector, label: comment.label, text: trimContextText(comment.text), position: normalizePosition(position ?? comment.position), htmlHint: trimHtmlHint(comment.htmlHint), style: normalizeStyle(comment.style), selectionKind: comment.selectionKind === 'pod' ? 'pod' : 'element', memberCount: comment.memberCount, podMembers: normalizeMembers(comment.podMembers), slideIndex: comment.slideIndex };
}

function validPosition(position: PreviewComment['position'] | undefined): PreviewCommentSnapshot['position'] | undefined {
  return position && isValidCommentOverlayPosition(position) ? normalizePosition(position) : undefined;
}
function isValidCommentOverlayPosition(position: PreviewComment['position'] | undefined | null): boolean {
  if (!position) return false;
  const normalized = normalizePosition(position);
  return Number.isFinite(normalized.x) && Number.isFinite(normalized.y) && Number.isFinite(normalized.width) && Number.isFinite(normalized.height) && normalized.width > 0 && normalized.height > 0;
}
function normalizePosition(input: PreviewComment['position']): PreviewComment['position'] { return { x: finite(input?.x), y: finite(input?.y), width: finite(input?.width), height: finite(input?.height) }; }
function finite(value: number | undefined): number { return Number.isFinite(value) ? Math.round(value as number) : 0; }
function trimContextText(value: string): string { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160); }
function trimHtmlHint(value: string): string { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180); }
function normalizeMembers(input: PreviewCommentMember[] | undefined): PreviewCommentMember[] { return Array.isArray(input) ? input.map((member) => ({ elementId: String(member.elementId || '').trim(), selector: String(member.selector || '').trim(), label: String(member.label || '').trim(), text: trimContextText(String(member.text || '')), position: normalizePosition(member.position), htmlHint: trimHtmlHint(String(member.htmlHint || '')), style: normalizeStyle(member.style) })).filter((member) => member.elementId && member.selector) : []; }
const ANNOTATION_STYLE_KEYS = ['color','backgroundColor','fontSize','fontWeight','lineHeight','textAlign','fontFamily','paddingTop','paddingRight','paddingBottom','paddingLeft','borderRadius'] as const;
function normalizeStyle(input: unknown): PreviewAnnotationStyle | undefined { if (!input || typeof input !== 'object') return undefined; const raw=input as Record<string,unknown>; const style: PreviewAnnotationStyle={}; for(const key of ANNOTATION_STYLE_KEYS) { const value=raw[key]; if(typeof value === 'string') { const trimmed=value.replace(/\s+/g,' ').trim(); if(trimmed) style[key]=trimmed.slice(0,120); } } return Object.keys(style).length ? style : undefined; }
