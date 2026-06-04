import type { OkResponse } from '../common.js';

export type PreviewCommentStatus =
  | 'open'
  | 'attached'
  | 'applying'
  | 'needs_review'
  | 'resolved'
  | 'failed';

export interface PreviewCommentPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreviewAnnotationStyle {
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  textAlign?: string;
  fontFamily?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  borderRadius?: string;
}

export type PreviewCommentSelectionKind = 'element' | 'pod';
export type PreviewVisualMarkKind = 'click' | 'stroke' | 'click+stroke';

/**
 * An image attached to a preview comment. `path` is the project-relative file
 * path (uploaded via the normal file API) that the web app resolves to a raw
 * URL for display; `name` is the original filename for labels/alt text.
 */
export interface PreviewCommentAttachment {
  path: string;
  name: string;
}

export interface PreviewCommentMember {
  elementId: string;
  selector: string;
  label: string;
  text: string;
  position: PreviewCommentPosition;
  htmlHint: string;
  style?: PreviewAnnotationStyle;
}

export interface PreviewCommentTarget {
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  text: string;
  position: PreviewCommentPosition;
  htmlHint: string;
  style?: PreviewAnnotationStyle;
  selectionKind?: PreviewCommentSelectionKind;
  memberCount?: number;
  podMembers?: PreviewCommentMember[];
  /** Zero-based deck slide index when the comment was placed. */
  slideIndex?: number;
}

export interface PreviewComment {
  id: string;
  projectId: string;
  conversationId: string;
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  text: string;
  position: PreviewCommentPosition;
  htmlHint: string;
  style?: PreviewAnnotationStyle;
  selectionKind?: PreviewCommentSelectionKind;
  memberCount?: number;
  podMembers?: PreviewCommentMember[];
  /** Zero-based deck slide index when the comment was placed. */
  slideIndex?: number;
  note: string;
  attachments?: PreviewCommentAttachment[];
  status: PreviewCommentStatus;
  createdAt: number;
  updatedAt: number;
}

export interface PreviewCommentUpsertRequest {
  target: PreviewCommentTarget;
  note: string;
  attachments?: PreviewCommentAttachment[];
}

export interface PreviewCommentStatusRequest {
  status: PreviewCommentStatus;
}

export interface PreviewCommentResponse {
  comment: PreviewComment;
}

export interface PreviewCommentsResponse {
  comments: PreviewComment[];
}

export interface PreviewCommentDeleteResponse extends OkResponse {}
