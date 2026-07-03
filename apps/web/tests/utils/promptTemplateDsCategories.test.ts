import { describe, expect, it } from 'vitest';

import { inferPromptTemplateCategoriesForDs } from '../../src/utils/promptTemplateDsCategories';
import type { DesignSystemSummary } from '../../src/types';

const ds = (partial: Partial<DesignSystemSummary> = {}): DesignSystemSummary => ({
  id: 'ds1',
  title: '',
  category: '',
  summary: '',
  ...partial,
});

describe('inferPromptTemplateCategoriesForDs', () => {
  it('returns null when no keyword in title/category/summary matches', () => {
    expect(inferPromptTemplateCategoriesForDs(ds({ title: 'plain', category: 'misc', summary: 'nothing here' }))).toBeNull();
  });

  it('maps anime/illustration keywords to the illustration bucket', () => {
    const cats = inferPromptTemplateCategoriesForDs(ds({ category: 'Anime', title: 'Slice of life' }));
    expect(cats).toEqual(expect.arrayContaining(['Anime', 'Illustration', 'Profile / Avatar']));
  });

  it('maps gaming/UI keywords to Game UI and App/Web Design', () => {
    expect(
      inferPromptTemplateCategoriesForDs(ds({ summary: 'cozy game UI inspired by retro consoles' })),
    ).toEqual(expect.arrayContaining(['Game UI', 'App / Web Design']));
  });

  it('maps fintech keywords to data and branding categories', () => {
    const cats = inferPromptTemplateCategoriesForDs(ds({ title: 'Crypto', summary: 'payment dashboards' }));
    expect(cats).toEqual(expect.arrayContaining(['App / Web Design', 'Data', 'Marketing', 'Branding']));
  });

  it('deduplicates overlapping buckets when multiple rules fire', () => {
    const cats = inferPromptTemplateCategoriesForDs(
      ds({ category: 'product', title: 'automotive', summary: 'cinematic brand work' }),
    )!;
    expect(new Set(cats).size).toBe(cats.length);
    expect(cats).toEqual(expect.arrayContaining(['Product', 'Cinematic', 'Branding']));
  });
});
