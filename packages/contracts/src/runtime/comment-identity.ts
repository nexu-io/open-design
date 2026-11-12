/** Comment-only identity. Never substitute text, position, or tool IDs for it. */
export const COMMENT_ID_ATTRIBUTE = 'data-od-comment-id';
export const COMMENT_ID_PREFIX = 'cmt:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function isCommentUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
export function commentElementId(uuid: string): string {
  if (!isCommentUuid(uuid)) throw new Error('Invalid comment UUID');
  return `${COMMENT_ID_PREFIX}${uuid}`;
}
export function commentUuidFromElementId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(COMMENT_ID_PREFIX)) return null;
  const uuid = value.slice(COMMENT_ID_PREFIX.length);
  return isCommentUuid(uuid) ? uuid : null;
}
export function commentIdentitySelector(uuid: string): string {
  if (!isCommentUuid(uuid)) throw new Error('Invalid comment UUID');
  return `[${COMMENT_ID_ATTRIBUTE}="${uuid}"]`;
}
/** Check before indexing: a Map alone silently discards duplicate targets. */
export function uniqueCommentIdentity(values: readonly string[], uuid: string): boolean {
  return isCommentUuid(uuid) && values.filter((value) => value === uuid).length === 1;
}
