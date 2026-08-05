/**
 * Convert a user-facing title into a safe archive filename stem.
 *
 * Path separators, control bytes, and trailing separators are removed while
 * Unicode letters remain intact.
 */
export function sanitizeArchiveFilename(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
