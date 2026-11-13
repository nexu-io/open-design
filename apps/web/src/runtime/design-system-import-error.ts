/**
 * Maps a daemon design-system-import error code to its i18n key.
 *
 * The daemon returns `{ error: { code, message } }` where `message` is
 * always English. This helper lets the UI show a localized summary for
 * known codes while keeping the raw detail (paths, URLs) under a
 * <details> disclosure.
 *
 * Returns `null` for unknown or missing codes — the caller should fall
 * back to the raw `error.message` (pre-#2686 behavior).
 */
export function designSystemImportErrorKey(
  error: { code?: string },
): 'settings.designSystemsImportErrorInvalid' | 'settings.designSystemsImportErrorInternal' | null {
  if (error.code === 'INTERNAL_ERROR') return 'settings.designSystemsImportErrorInternal';
  if (error.code === 'BAD_REQUEST') return 'settings.designSystemsImportErrorInvalid';
  return null;
}
