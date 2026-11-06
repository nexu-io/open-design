export type CommentSendResult =
  | { status: 'accepted' | 'queued'; commentIds: string[] }
  | { status: 'rejected'; commentIds: string[] };

export function commentSendSucceeded(result: CommentSendResult): boolean {
  return result.status !== 'rejected';
}

export function commentSendCompleted(
  result: CommentSendResult,
  commentId: string,
): boolean {
  return result.commentIds.includes(commentId);
}
