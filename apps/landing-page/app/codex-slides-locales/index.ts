/*
 * Codex Slides page — locale override registry.
 *
 * English is the authoritative base (`CODEX_SLIDES_EN` in
 * `../codex-slides-i18n.ts`). Each non-English locale is a DeepPartial override
 * translated by an Agent and merged over the base at render time. One shard file
 * per locale keeps each translation isolated and well under the 1 MiB
 * changed-file guard.
 */
import type { DeepPartial, CodexSlidesCopy } from '../codex-slides-i18n';
import type { LandingLocaleCode } from '../i18n';

import zh from './zh';
import ja from './ja';
import ko from './ko';
import de from './de';
import fr from './fr';
import ru from './ru';
import es from './es';
import ptBr from './pt-br';
import it from './it';
import tr from './tr';

export const CODEX_SLIDES_OVERRIDES: Partial<
  Record<LandingLocaleCode, DeepPartial<CodexSlidesCopy>>
> = {
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
