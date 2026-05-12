import { describe, expect, it } from 'vitest';
import type { DesignSystemSummary, PromptTemplateSummary, SkillSummary } from '../../src/types';
import {
  FRENCH_CONTENT_IDS,
  localizeDesignSystemSummary,
  localizePromptTemplateSummary,
  localizeSkillDescription,
  localizeSkillPrompt,
} from '../../src/i18n/content';

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
    } as SkillSummary;

    expect(localizeSkillPrompt('fr', partiallyLocalizedSkill)).toBe(
      'Un article long-form / blog post — masthead, placeholder d’image hero, corps d’article avec figures et pull quotes, ligne auteur, articles associés.',
    );
    expect(localizeSkillDescription('fr', partiallyLocalizedSkill)).toBe(
      'English description from source.',
    );
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
});
