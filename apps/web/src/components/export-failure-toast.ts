// Export failure copy (product error copy S26a, OPEND-2849).
//
// Invariant: an export failure shows the generic S26a title + body
// ("导出失败" / "本次导出未完成，请重新尝试。") unless the error was explicitly
// raised as a `LocalizedExportError`, i.e. it already carries a localized,
// user-facing reason taken from an i18n key. Raw exporter messages (HTTP status
// lines, renderer/daemon strings, internal exceptions) never reach the toast;
// the original error object is left untouched so callers' logging and
// `exportErrorCode` analytics still see the raw message.

import type { Dict } from '../i18n/types';

type ExportFailureTranslate = (key: keyof Dict) => string;

export type ExportFailureToast = {
  message: string;
  details?: string | null;
  tone: 'error';
};

/**
 * An export error whose message is an already-localized, user-facing reason
 * (built from an i18n key). Only this type may replace the generic S26a copy.
 */
export class LocalizedExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalizedExportError';
  }
}

export function genericExportFailedToast(t: ExportFailureTranslate): ExportFailureToast {
  return {
    message: t('fileViewer.exportFailedTitle'),
    details: t('fileViewer.exportFailedDescription'),
    tone: 'error',
  };
}

export function exportFailureToast(err: unknown, t: ExportFailureTranslate): ExportFailureToast {
  if (err instanceof LocalizedExportError && err.message) {
    return { message: err.message, tone: 'error' };
  }
  return genericExportFailedToast(t);
}
