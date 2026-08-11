/*
 * Registry of translated Codex-design copy. One module per landing locale;
 * English is the baseline and lives in `../codex-i18n.ts`.
 *
 * Each override is `Partial`, so `getCodexCopy` fills any missing key from
 * English rather than rendering an empty string.
 */
import type { LandingLocaleCode } from '../../i18n';
import type { CodexCopy, CodexSkillCopy } from '../codex-i18n';

export type CodexCopyOverride = Partial<Omit<CodexCopy, 'skills'>> & {
  readonly skills?: Readonly<Record<string, Partial<CodexSkillCopy>>>;
};

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

export const CODEX_COPY_OVERRIDES: Partial<Record<LandingLocaleCode, CodexCopyOverride>> = {
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
