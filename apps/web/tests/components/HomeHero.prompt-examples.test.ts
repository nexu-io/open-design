import { describe, expect, it } from 'vitest';
import {
  HOME_PROMPT_EXAMPLE_CHIP_IDS,
  homeHeroChipPromptExamplesForLocale,
} from '../../src/components/HomeHero';
import { LOCALES } from '../../src/i18n/types';

describe('home hero prompt examples localization', () => {
  it('resolves four example prompts for every chip in every supported locale', () => {
    for (const locale of LOCALES) {
      for (const chipId of HOME_PROMPT_EXAMPLE_CHIP_IDS) {
        const examples = homeHeroChipPromptExamplesForLocale(chipId, locale);
        expect(examples, `${locale}/${chipId}`).toHaveLength(4);
        for (const example of examples) {
          expect(example.trim().length, `${locale}/${chipId} non-empty`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('does not fall back to the English example strings for any non-English locale', () => {
    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      for (const chipId of HOME_PROMPT_EXAMPLE_CHIP_IDS) {
        const localized = homeHeroChipPromptExamplesForLocale(chipId, locale);
        const english = homeHeroChipPromptExamplesForLocale(chipId, 'en');
        expect(
          localized,
          `${locale}/${chipId} must be localized, not the English fallback`,
        ).not.toEqual(english);
      }
    }
  });
});
