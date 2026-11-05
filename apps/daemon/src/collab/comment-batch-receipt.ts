import { COMMENT_BATCH_MAX_ITEMS, type CommentBatchPushRequest, type CommentBatchPushResponse } from '@open-design/contracts';

/** Validate the whole receipt before any caller may acknowledge individual rows. */
export function parseCommentBatchReceipt(stdout: string, request: CommentBatchPushRequest): CommentBatchPushResponse {
  let value: unknown;
  try { value = JSON.parse(stdout); } catch { throw new Error('Invalid comment batch receipt'); }
  if (!value || typeof value !== 'object' || !('results' in value) || !Array.isArray(value.results)) throw new Error('Invalid comment batch receipt');
  const remaining = new Set(request.comments.map(item => item.key));
  const results: CommentBatchPushResponse['results'][number][] = [];
  for (const item of value.results) {
    if (!item || typeof item !== 'object' || typeof item.key !== 'string' || !remaining.delete(item.key)
      || typeof item.ok !== 'boolean'
      || (item.error !== undefined && typeof item.error !== 'string')
      || (item.errorCode !== undefined && typeof item.errorCode !== 'string')
      || (item.status !== undefined && (!Number.isInteger(item.status) || item.status < 400 || item.status > 599))
      || (item.ok && (item.error !== undefined || item.errorCode !== undefined || item.status !== undefined))) {
      throw new Error('Invalid comment batch receipt');
    }
    results.push({ key: item.key, ok: item.ok,
      ...(item.error !== undefined ? { error: item.error } : {}),
      ...(item.errorCode !== undefined ? { errorCode: item.errorCode } : {}),
      ...(item.status !== undefined ? { status: item.status } : {}) });
  }
  if (remaining.size) throw new Error('Incomplete comment batch receipt');
  return { results };
}

export function validateCommentBatchRequest(request: CommentBatchPushRequest): void {
  if (!Array.isArray(request.comments) || request.comments.length < 1 || request.comments.length > COMMENT_BATCH_MAX_ITEMS) throw new Error('Invalid comment batch size');
  const keys = new Set<string>();
  for (const item of request.comments) {
    if (!item || typeof item.key !== 'string' || !item.key.trim() || keys.has(item.key)
      || typeof item.idempotencyKey !== 'string' || !item.idempotencyKey.trim()) throw new Error('Invalid comment batch identity');
    keys.add(item.key);
  }
}
