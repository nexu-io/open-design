/*
 * Copy for the Solution → Use case and Role landing pages
 * (`/solutions/<slug>/` and `/roles/<slug>/`).
 *
 * These pages are image + text + table surfaces that explain how a given
 * workflow or role uses Open Design. They are kept OUT of the large
 * `InfoPageCopy` shape in `info-page-i18n.ts` on purpose: that interface is
 * mirrored field-by-field inside `compactInfoPageCopy()` for all 18 locales,
 * so adding rich page bodies there would force a hand-written entry per
 * locale. English is the source of truth; every other locale falls back to
 * English via `getSolutionPageCopy()` until it is translated.
 *
 * Each page shares one shape (`SolutionPageCopy`) so the Astro template is
 * identical across all 11 pages — only the data differs.
 *
 * The per-locale copy lives in `solution-pages-i18n/<code>.ts` (one file per
 * locale) and the shared shapes in `solution-pages-i18n/types.ts`. They are
 * split out so no single tracked source file exceeds the repository's
 * changed-file size guard; this module is the thin index that re-exports the
 * public type API, assembles the `BY_LOCALE` map, and resolves copy with an
 * English fallback. The public API is unchanged.
 */
import { DEFAULT_LOCALE, type LandingLocaleCode } from './i18n';
import type { SolutionLocaleCopy } from './solution-pages-i18n/types';
import { EN } from './solution-pages-i18n/en';
import { ZH } from './solution-pages-i18n/zh';
import { ZH_TW } from './solution-pages-i18n/zh-tw';
import { JA } from './solution-pages-i18n/ja';
import { KO } from './solution-pages-i18n/ko';
import { DE } from './solution-pages-i18n/de';
import { FR } from './solution-pages-i18n/fr';
import { RU } from './solution-pages-i18n/ru';
import { ES } from './solution-pages-i18n/es';
import { PT_BR } from './solution-pages-i18n/pt-br';
import { IT } from './solution-pages-i18n/it';
import { VI } from './solution-pages-i18n/vi';
import { PL } from './solution-pages-i18n/pl';
import { ID } from './solution-pages-i18n/id';
import { NL } from './solution-pages-i18n/nl';
import { AR } from './solution-pages-i18n/ar';
import { TR } from './solution-pages-i18n/tr';
import { UK } from './solution-pages-i18n/uk';

export type {
  SolutionStep,
  SolutionFeature,
  SolutionTableRow,
  SolutionFaq,
  SolutionGalleryItem,
  SolutionPageCopy,
  SolutionPageKey,
  SolutionLocaleCopy,
} from './solution-pages-i18n/types';

import type { SolutionPageCopy, SolutionPageKey } from './solution-pages-i18n/types';

const BY_LOCALE: Partial<Record<LandingLocaleCode, SolutionLocaleCopy>> = {
  en: EN,
  zh: ZH,
  'zh-tw': ZH_TW,
  ja: JA,
  ko: KO,
  de: DE,
  fr: FR,
  ru: RU,
  es: ES,
  'pt-br': PT_BR,
  it: IT,
  vi: VI,
  pl: PL,
  id: ID,
  nl: NL,
  ar: AR,
  tr: TR,
  uk: UK,
};

/**
 * Resolve a Solution page's copy for a locale, falling back to English for
 * any locale not yet translated. Returns `undefined` only if the page key
 * itself does not exist in English (a programming error).
 */
export function getSolutionPageCopy(
  locale: LandingLocaleCode,
  key: SolutionPageKey,
): SolutionPageCopy {
  const localized = BY_LOCALE[locale]?.[key];
  if (localized) return localized;
  return BY_LOCALE[DEFAULT_LOCALE]![key]!;
}
