import { describe, expect, it } from 'vitest';

import { de } from './locales/de';
import { en } from './locales/en';
import { esES } from './locales/es-ES';
import { fa } from './locales/fa';
import { fr } from './locales/fr';
import { ja } from './locales/ja';
import { ptBR } from './locales/pt-BR';
import { ru } from './locales/ru';
import { zhCN } from './locales/zh-CN';
import { zhTW } from './locales/zh-TW';

const LOCALE_DICTS = {
  de,
  en,
  esES,
  fa,
  fr,
  ja,
  ptBR,
  ru,
  zhCN,
  zhTW,
};

describe('Design Files dropzone copy', () => {
  it('does not advertise unsupported Figma link drops', () => {
    for (const [locale, dict] of Object.entries(LOCALE_DICTS)) {
      expect(dict['designFiles.dropDesc'], locale).not.toMatch(/figma/i);
    }
  });
});
