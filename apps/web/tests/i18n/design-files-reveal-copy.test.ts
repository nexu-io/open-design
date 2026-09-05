import { describe, expect, it } from 'vitest';

import { en } from '../../src/i18n/locales/en';
import { zhCN } from '../../src/i18n/locales/zh-CN';

describe('Design Files reveal action copy', () => {
  it('matches the exact platform labels for en and zh-CN', () => {
    expect(en['designFiles.revealInFinder']).toBe('Show in Finder');
    expect(en['designFiles.revealInExplorer']).toBe('Show in Explorer');
    expect(en['designFiles.revealInFileManager']).toBe('Show in File Manager');

    expect(zhCN['designFiles.revealInFinder']).toBe('在访达中显示');
    expect(zhCN['designFiles.revealInExplorer']).toBe('在文件资源管理器中显示');
    expect(zhCN['designFiles.revealInFileManager']).toBe('在文件管理器中显示');
  });
});
