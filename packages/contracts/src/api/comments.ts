import type { OkResponse } from '../common';

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

export type PreviewCommentSelectionKind = 'element' | 'pod';

export interface PreviewCommentMember {
  elementId: string;
  selector: string;
  label: string;
  text: string;
  position: PreviewCommentPosition;
  htmlHint: string;
}

export interface PreviewCommentTarget {
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  text: string;
  position: PreviewCommentPosition;
  htmlHint: string;
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
