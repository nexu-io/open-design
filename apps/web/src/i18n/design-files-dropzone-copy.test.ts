import { describe, expect, it } from 'vitest';

import { en } from './locales/en';
import { ja } from './locales/ja';
import { zhCN } from './locales/zh-CN';

const LOCALE_DICTS = {
  en,
  ja,
  zhCN,
};

describe('Design Files dropzone copy', () => {
  it('does not advertise unsupported Figma link drops', () => {
    for (const [locale, dict] of Object.entries(LOCALE_DICTS)) {
      expect(dict['designFiles.dropDesc'], locale).not.toMatch(/figma/i);
    }
  });
});
