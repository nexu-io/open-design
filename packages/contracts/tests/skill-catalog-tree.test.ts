import { describe, expect, it } from 'vitest';
import {
  buildSkillCatalogTree,
  parseSkillSummaries,
  type SkillSummary,
} from '../src/api/registry.js';

function skill(overrides: Partial<SkillSummary>): SkillSummary {
  return {
    id: 'skill',
    name: 'Skill',
    description: 'A reusable skill.',
    triggers: [],
    mode: 'prototype',
    previewType: 'html',
    designSystemRequired: true,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: '',
    aggregatesExamples: false,
    ...overrides,
  };
}

describe('buildSkillCatalogTree', () => {
  it('groups skills by mode and scenario with deterministic labels', () => {
    const tree = buildSkillCatalogTree([
      skill({ id: 'deck', name: 'Deck', mode: 'deck', scenario: 'product' }),
      skill({ id: 'web', name: 'Web', mode: 'prototype', scenario: 'design' }),
      skill({ id: 'image', name: 'Image', mode: 'image', scenario: null }),
    ]);

    expect(tree.total).toBe(3);
    expect(tree.modes.map((mode) => mode.id)).toEqual([
      'prototype',
      'deck',
      'image',
    ]);
    expect(tree.modes[0]?.scenarios[0]).toMatchObject({
      id: 'design',
      label: 'Design',
      count: 1,
    });
    expect(tree.modes[2]?.scenarios[0]).toMatchObject({
      id: 'general',
      label: 'General',
      count: 1,
    });
  });

  it('sorts default and featured skills before regular skills stably', () => {
    const tree = buildSkillCatalogTree([
      skill({ id: 'regular-b', name: 'Regular B', scenario: 'design' }),
      skill({
        id: 'featured-two',
        name: 'Featured two',
        featured: 2,
        scenario: 'design',
      }),
      skill({
        id: 'default',
        name: 'Default',
        defaultFor: ['prototype'],
        scenario: 'design',
      }),
      skill({
        id: 'featured-one',
        name: 'Featured one',
        featured: 1,
        scenario: 'design',
      }),
      skill({ id: 'regular-a', name: 'Regular A', scenario: 'design' }),
    ]);

    expect(
      tree.modes[0]?.scenarios[0]?.skills.map((treeSkill) => treeSkill.id),
    ).toEqual([
      'default',
      'featured-one',
      'featured-two',
      'regular-a',
      'regular-b',
    ]);
  });

  it('keeps the original skill summary on leaf nodes', () => {
    const source = skill({
      id: 'dashboard',
      name: 'Dashboard',
      scenario: 'operation',
      platform: 'desktop',
      previewType: 'jsx',
      designSystemRequired: false,
      examplePrompt: 'Build an ops dashboard.',
      category: 'ops-tools',
      source: 'built-in',
    });

    const tree = buildSkillCatalogTree([source]);
    const leaf = tree.modes[0]?.scenarios[0]?.skills[0];

    expect(leaf).toMatchObject({
      id: 'dashboard',
      platform: 'desktop',
      previewType: 'jsx',
      designSystemRequired: false,
      examplePrompt: 'Build an ops dashboard.',
      category: 'ops-tools',
      source: 'built-in',
    });
    expect(leaf?.skill).toBe(source);
  });
});

describe('parseSkillSummaries', () => {
  it('accepts valid skill summary arrays', () => {
    const summaries = parseSkillSummaries([
      skill({ id: 'dashboard', name: 'Dashboard' }),
    ]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.id).toBe('dashboard');
  });

  it('rejects malformed skill summary array elements', () => {
    expect(() => parseSkillSummaries([
      skill({ id: 'dashboard', name: 'Dashboard' }),
      { id: 'broken', mode: 'prototype' },
    ])).toThrow();
  });
});
