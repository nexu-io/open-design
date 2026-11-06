import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/locales/en';
import { LOCALES, type Dict } from '../../src/i18n/types';

const keys = [
  'fileViewer.publishFileTooLarge',
  'fileViewer.publishFileContentUnavailable',
  'fileViewer.publishFileConflict',
  'fileViewer.publishFileWorkspaceLocked',
] as const;

describe('sharing failure translations', () => {
  it.each(LOCALES)('%s provides localized failure messages', async locale => {
    const module = await import(`../../src/i18n/locales/${locale}.ts`);
    const dict = Object.values(module).find((value): value is Dict => Boolean(value) && typeof value === 'object');
    expect(dict).toBeDefined();
    for (const key of keys) {
      expect(dict?.[key]).toMatch(/\S/);
      if (locale !== 'en') {
        expect(dict?.[key]).not.toBe(en[key]);
        expect(dict?.[key]).not.toMatch(/Content exceeds the server sharing limit/);
      }
    }
  });
});
