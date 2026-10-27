/**
 * The run's UI locale, as prompt text.
 *
 * One rule, three readers. `# UI locale override` (the cache-stable prompt
 * head, mirrored in `apps/daemon/src/prompts/system.ts` and
 * `packages/contracts/src/prompts/system.ts`) states it for the conversation;
 * the per-turn follow-up-suggestion protocol restates it because the head is
 * deliberately dropped on resume turns. Those readers had three private copies
 * of the same `zh-CN`/`zh-TW` mapping before OPEND-2765, which is how one of
 * them could drift out of sync with the others without anything failing.
 */

/**
 * Trimmed locale tag, or `null` when the run has no locale worth stating.
 *
 * English is `null` on purpose rather than `'en'`: the prompts this feeds are
 * written in English, so naming it adds a rule that says nothing and moves
 * every affected prompt's bytes for no behavioural gain.
 */
export function normalizePromptLocale(locale: string | undefined | null): string | null {
  const normalized = typeof locale === 'string' ? locale.trim() : '';
  if (!normalized || normalized.toLowerCase() === 'en') return null;
  return normalized;
}

/**
 * How to name the locale to a model.
 *
 * Only the two Chinese tags are spelled out, because those are the two the
 * product ships copy for and the two a bare tag reads worst for. Every other
 * locale falls back to its own tag, which models resolve reliably and which
 * cannot go stale against `apps/web/src/i18n/locales/`.
 */
export function promptLanguageName(normalizedLocale: string): string {
  if (normalizedLocale === 'zh-CN') return 'Simplified Chinese';
  if (normalizedLocale === 'zh-TW') return 'Traditional Chinese';
  return normalizedLocale;
}

/**
 * The exception every locale rule in this repository carries: a localized
 * sentence still keeps the words that are names or code.
 *
 * OPEND-2765 asks for exactly this — the reported English suggestions are
 * wrong, but `localStorage` and `CTA` inside them were right. Kept as one
 * exported constant so the follow-up-suggestion rule and the `# UI locale
 * override` section cannot disagree about what survives translation.
 */
export const PROMPT_LOCALE_EXEMPT_TERMS_SENTENCE =
  'Keep brand names, code, and technical identifiers as-is, and honor an explicit'
  + ' user request for a different output language.';
