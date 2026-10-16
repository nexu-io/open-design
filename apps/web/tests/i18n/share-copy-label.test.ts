import { describe, expect, it } from 'vitest';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import { zhTW } from '../../src/i18n/locales/zh-TW';

describe('Chinese published-link copy label', () => {
  it.each([
    { locale: 'zh-CN', dict: zhCN, label: '复制链接' },
    { locale: 'zh-TW', dict: zhTW, label: '複製連結' },
  ])('$locale uses the concise canvas label', ({ dict, label }) => {
    expect(dict['fileViewer.copyShareLink']).toBe(label);
  });
});
