import { describe, expect, it } from 'vitest';

import { ar } from '../../src/i18n/locales/ar';
import { de } from '../../src/i18n/locales/de';
import { en } from '../../src/i18n/locales/en';
import { esES } from '../../src/i18n/locales/es-ES';
import { fa } from '../../src/i18n/locales/fa';
import { fr } from '../../src/i18n/locales/fr';
import { hu } from '../../src/i18n/locales/hu';
import { id } from '../../src/i18n/locales/id';
import { it as itLocale } from '../../src/i18n/locales/it';
import { ja } from '../../src/i18n/locales/ja';
import { ko } from '../../src/i18n/locales/ko';
import { pl } from '../../src/i18n/locales/pl';
import { ptBR } from '../../src/i18n/locales/pt-BR';
import { ru } from '../../src/i18n/locales/ru';
import { th } from '../../src/i18n/locales/th';
import { tr } from '../../src/i18n/locales/tr';
import { uk } from '../../src/i18n/locales/uk';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import { zhTW } from '../../src/i18n/locales/zh-TW';
import type { Dict, Locale } from '../../src/i18n/types';

const localized: Array<[Exclude<Locale, 'en'>, Dict]> = [
  ['id', id],
  ['de', de],
  ['zh-CN', zhCN],
  ['zh-TW', zhTW],
  ['pt-BR', ptBR],
  ['es-ES', esES],
  ['ru', ru],
  ['fa', fa],
  ['ar', ar],
  ['ja', ja],
  ['ko', ko],
  ['pl', pl],
  ['hu', hu],
  ['fr', fr],
  ['uk', uk],
  ['tr', tr],
  ['th', th],
  ['it', itLocale],
];

describe('server directory picker translations', () => {
  it.each(localized)('%s does not declare the English picker title as localized copy', (_locale, dict) => {
    expect(dict['serverDirectoryPicker.title']).not.toBe(en['serverDirectoryPicker.title']);
  });
});
