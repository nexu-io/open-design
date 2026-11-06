import { describe, expect, it } from 'vitest';
import type { Dict } from '../src/i18n/types';
import { ar } from '../src/i18n/locales/ar';
import { de } from '../src/i18n/locales/de';
import { en } from '../src/i18n/locales/en';
import { esES } from '../src/i18n/locales/es-ES';
import { fa } from '../src/i18n/locales/fa';
import { fr } from '../src/i18n/locales/fr';
import { hu } from '../src/i18n/locales/hu';
import { id } from '../src/i18n/locales/id';
import { it as itDict } from '../src/i18n/locales/it';
import { ja } from '../src/i18n/locales/ja';
import { ko } from '../src/i18n/locales/ko';
import { pl } from '../src/i18n/locales/pl';
import { ptBR } from '../src/i18n/locales/pt-BR';
import { ru } from '../src/i18n/locales/ru';
import { th } from '../src/i18n/locales/th';
import { tr } from '../src/i18n/locales/tr';
import { uk } from '../src/i18n/locales/uk';
import { zhCN } from '../src/i18n/locales/zh-CN';
import { zhTW } from '../src/i18n/locales/zh-TW';

const dictionaries: Dict[] = [
  en,
  id,
  de,
  zhCN,
  zhTW,
  ptBR,
  esES,
  ru,
  fa,
  ar,
  ja,
  ko,
  pl,
  hu,
  fr,
  uk,
  tr,
  th,
  itDict,
];

describe('Home creation hierarchy i18n', () => {
  it('localizes Prototype in every supported locale and keeps WebGL as the product label', () => {
    expect(dictionaries).toHaveLength(19);
    for (const dict of dictionaries) {
      expect(dict['homeHero.chip.prototype'].trim()).not.toBe('');
      expect(dict['homeHero.chip.prototype']).not.toBe('UI Mockup');
      expect(dict['homeHero.chip.webgl']).toBe('WebGL');
    }
  });

  it('uses the requested Simplified and Traditional Chinese hierarchy labels', () => {
    expect(zhCN['homeHero.chip.prototype']).toBe('原型');
    expect(zhCN['homeHero.chip.liveArtifact']).toBe('实时产物');
    expect(zhTW['homeHero.chip.prototype']).toBe('原型');
    expect(zhTW['homeHero.chip.liveArtifact']).toBe('即時產物');
  });
});
