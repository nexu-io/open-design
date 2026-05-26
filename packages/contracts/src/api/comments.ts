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
  note: string;
  status: PreviewCommentStatus;
  createdAt: number;
  updatedAt: number;
}

export interface PreviewCommentUpsertRequest {
  target: PreviewCommentTarget;
  note: string;
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
