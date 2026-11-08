// OPEND-2849 / product copy S26: which export errors may replace the generic
// S26a "导出失败 / 本次导出未完成，请重新尝试。" copy. Only errors explicitly
// marked as carrying a localized, user-facing reason pass through.

import { describe, expect, it } from 'vitest';

import {
  LocalizedExportError,
  exportFailureToast,
  genericExportFailedToast,
} from '../../src/components/export-failure-toast';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import type { Dict } from '../../src/i18n/types';

const t = (key: keyof Dict) => zhCN[key];
const S26A = { message: '导出失败', details: '本次导出未完成，请重新尝试。', tone: 'error' };

describe('exportFailureToast', () => {
  it('uses the S26a title + body for the generic case', () => {
    expect(genericExportFailedToast(t)).toEqual(S26A);
  });

  it.each([
    ['an HTTP status line', new Error('html export request failed (500)')],
    ['an archive failure', new Error('archive request failed (502)')],
    ['an internal exception', new Error('Canvas is not available')],
    ['a desktop renderer failure', new Error('desktop PDF export unavailable (404)')],
    ['an error without a message', new Error('')],
    ['a non-Error rejection', 'boom'],
    ['undefined', undefined],
  ])('hides %s behind S26a', (_label, err) => {
    expect(exportFailureToast(err, t)).toEqual(S26A);
  });

  it('passes through an already-localized, user-facing reason', () => {
    const reason = zhCN['fileViewer.exportDaemonUnreachable'];
    expect(exportFailureToast(new LocalizedExportError(reason), t)).toEqual({ message: reason, tone: 'error' });
  });

  it('keeps the original error object intact for diagnostics', () => {
    const err = new LocalizedExportError(zhCN['fileViewer.exportPptxNa']);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(zhCN['fileViewer.exportPptxNa']);
  });
});
