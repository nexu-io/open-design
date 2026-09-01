/*
 * Registry of translated DeepSeek-Harness-design copy. One module per landing
 * locale; English is the baseline and lives in `../deepseek-i18n.ts`.
 *
 * Each override is `Partial`, so `getDeepseekCopy` fills any missing key from
 * English rather than rendering an empty string.
 */
import type { LandingLocaleCode } from '../../i18n';
import type { DeepseekCopy } from '../deepseek-i18n';
import type { CuratedCopyOverrideOf } from '../curated-collection';

export type DeepseekCopyOverride = CuratedCopyOverrideOf<DeepseekCopy>;

import { zh } from './zh';
import { ja } from './ja';
import { ko } from './ko';
import { de } from './de';
import { fr } from './fr';
import { ru } from './ru';
import { es } from './es';
import { ptBr } from './pt-br';
import { it } from './it';
import { tr } from './tr';

export const DEEPSEEK_COPY_OVERRIDES: Partial<Record<LandingLocaleCode, DeepseekCopyOverride>> = {
  zh,
  ja,
  ko,
  de,
  fr,
  ru,
  es,
  'pt-br': ptBr,
  it,
  tr,
};
