import { describe, expect, it } from 'vitest';

import { de } from '../../src/i18n/locales/de';
import { en } from '../../src/i18n/locales/en';
import { esES } from '../../src/i18n/locales/es-ES';
import { fa } from '../../src/i18n/locales/fa';
import { fr } from '../../src/i18n/locales/fr';
import { id } from '../../src/i18n/locales/id';
import { ja } from '../../src/i18n/locales/ja';
import { ptBR } from '../../src/i18n/locales/pt-BR';
import { ru } from '../../src/i18n/locales/ru';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import { zhTW } from '../../src/i18n/locales/zh-TW';

const LOCALE_DICTS = {
  de,
  en,
  esES,
  fa,
  fr,
  id,
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
