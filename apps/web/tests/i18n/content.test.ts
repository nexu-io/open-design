import { describe, expect, it } from 'vitest';
import type { DesignSystemSummary, PromptTemplateSummary, SkillSummary } from '../../src/types';
import {
  FRENCH_CONTENT_IDS,
  localizeDesignSystemSummary,
  localizePromptTemplateSummary,
  localizeSkillDescription,
  localizeSkillName,
  localizeSkillPrompt,
  hasLocalizedContent,
} from '../../src/i18n/content';
import { LOCALES } from '../../src/i18n/types';

describe('localized resource content', () => {
  it('derives localized ids only from localized dictionaries', () => {
    expect(FRENCH_CONTENT_IDS.skills).toContain('blog-post');
    expect(FRENCH_CONTENT_IDS.skills).not.toContain('ib-pitch-book');
    expect(FRENCH_CONTENT_IDS.designSystems).toContain('airbnb');
    expect(FRENCH_CONTENT_IDS.designSystems).not.toContain('agentic');
    expect(FRENCH_CONTENT_IDS.promptTemplates).toContain('3d-stone-staircase-evolution-infographic');
    expect(FRENCH_CONTENT_IDS.promptTemplates).not.toContain('notion-team-dashboard-live-artifact');
  });

  it('prefers localized skill copy and falls back to english field-by-field', () => {
    const partiallyLocalizedSkill = {
      id: 'blog-post',
      examplePrompt: '  English prompt from source.  ',
      description: '  English description from source.  ',
    } as unknown as SkillSummary;

    expect(localizeSkillPrompt('fr', partiallyLocalizedSkill)).toBe(
      'Un article long-form / blog post — masthead, placeholder d’image hero, corps d’article avec figures et pull quotes, ligne auteur, articles associés.',
    );
    expect(localizeSkillDescription('fr', partiallyLocalizedSkill)).toBe(
      'English description from source.',
    );
  });

  it('uses inline skill display metadata before falling back to source fields', () => {
    const inlineSkill = {
      id: 'inline-skill',
      name: 'inline-skill',
      displayName: {
        en: 'Inline Skill',
        'zh-CN': '内联技能',
      },
      description: ' English description from source. ',
      descriptionI18n: {
        en: 'English inline description.',
        'zh-CN': '中文内联描述。',
      },
      examplePrompt: ' English prompt from source. ',
      examplePromptI18n: {
        en: 'English inline prompt.',
        'zh-CN': '中文内联 prompt。',
      },
    } as unknown as SkillSummary;

    expect(localizeSkillName('zh-CN', inlineSkill)).toBe('内联技能');
    expect(localizeSkillName('zh-TW', inlineSkill)).toBe('内联技能');
    expect(localizeSkillName('fr', inlineSkill)).toBe('Inline Skill');
    expect(localizeSkillDescription('zh-CN', inlineSkill)).toBe('中文内联描述。');
    expect(localizeSkillDescription('fr', inlineSkill)).toBe('English inline description.');
    expect(localizeSkillPrompt('zh-CN', inlineSkill)).toBe('中文内联 prompt。');
    expect(localizeSkillPrompt('fr', inlineSkill)).toBe('English inline prompt.');
  });

  it('falls back to english design system summaries when localized copy is missing', () => {
    const englishOnlySystem = {
      id: 'agentic',
      summary: ' English summary from source. ',
      category: 'English category',
    } as DesignSystemSummary;

    expect(localizeDesignSystemSummary('fr', englishOnlySystem)).toBe(' English summary from source. ');
  });

  it('prefers localized prompt template fields and falls back to english fields and tags', () => {
    const translatedTemplate = {
      id: '3d-stone-staircase-evolution-infographic',
      surface: 'image',
      title: 'English title',
      summary: 'English summary',
      category: 'Infographic',
      tags: ['3d', 'unknown-tag'],
      source: { repo: 'repo', license: 'MIT' },
    } satisfies PromptTemplateSummary;

    const localized = localizePromptTemplateSummary('fr', translatedTemplate);
    expect(localized.title).toBe('Infographie 3D d’une évolution en escalier de pierre');
    expect(localized.summary).toBe(
      'Transforme une timeline d’évolution plate en infographie 3D réaliste en escalier de pierre, avec rendus détaillés d’organismes et panneaux latéraux structurés.',
    );
    expect(localized.category).toBe('Infographie');
    expect(localized.tags).toEqual(['3D', 'unknown-tag']);
    expect(
      localizePromptTemplateSummary('fr', { ...translatedTemplate, category: 'Unknown category' }).category,
    ).toBe('Unknown category');

    const englishOnlyTemplate = {
      ...translatedTemplate,
      id: 'notion-team-dashboard-live-artifact',
      title: ' English title from source ',
      summary: ' English summary from source ',
      category: 'General',
      tags: ['unknown-tag'],
    } satisfies PromptTemplateSummary;

    expect(localizePromptTemplateSummary('fr', englishOnlyTemplate)).toMatchObject({
      title: ' English title from source ',
      summary: ' English summary from source ',
      category: 'Général',
      tags: ['unknown-tag'],
    });
  });

  // Coverage lock (PR #3755 review): every supported non-English locale must
  // resolve a built-in-content bundle — either its own `content.<locale>.ts`
  // (or inline `XX_*` tables) registered in LOCALIZED_CONTENT, or an
  // intentional script fallback (zh-TW -> zh-CN via getLocalizedContent).
  // When a locale has no bundle, built-in skill / design-system /
  // prompt-template copy silently renders English for that locale — the exact
  // gap this PR fixes (it was missing for `it`). This locks every non-English
  // locale to a resolvable bundle so a future locale addition can't regress.
  it('resolves a built-in-content bundle for every supported non-English locale', () => {
    const missing = LOCALES.filter(
      (locale) => locale !== 'en' && !hasLocalizedContent(locale),
    );
    expect(
      missing,
      `These locales have no built-in-content bundle (add content.<locale>.ts and ` +
        `register it in LOCALIZED_CONTENT, or add an intentional fallback): ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
