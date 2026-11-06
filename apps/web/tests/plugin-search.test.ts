import { describe, expect, it } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';

import {
  pluginMatchesQuery,
  pluginMatchTier,
  rankPluginMatches,
} from '../src/components/plugins-home/plugin-search';

interface FixtureInput {
  id: string;
  title: string;
  tags?: string[];
  titleI18n?: Record<string, unknown>;
  description?: string;
  descriptionI18n?: Record<string, unknown>;
}

function plugin(input: FixtureInput): InstalledPluginRecord {
  return {
    id: input.id,
    title: input.title,
    version: '0.1.0',
    sourceKind: 'local',
    source: './plugins/x',
    trust: 'trusted',
    capabilitiesGranted: [],
    manifest: {
      version: '0.1.0',
      name: input.id,
      title: input.title,
      ...(input.tags ? { tags: input.tags } : {}),
      ...(input.titleI18n ? { title_i18n: input.titleI18n } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.descriptionI18n ? { description_i18n: input.descriptionI18n } : {}),
    },
    fsPath: '/tmp/x',
    installedAt: 0,
    updatedAt: 0,
  } as unknown as InstalledPluginRecord;
}

// Two rows model the real catalog: a late-alphabet plugin whose NAME is what
// the user types, and an early-alphabet plugin that merely carries the generic
// `prototype` tag every web example ships with.
const TAGGED_WEB_EXAMPLE = plugin({
  id: 'blog-post',
  title: 'Blog Post',
  tags: ['example', 'prototype', 'web'],
});

const ANNOTATION_PLUGIN = plugin({
  id: 'od-prototype-annotation',
  title: 'Prototype annotation (AI-generated specs)',
  tags: ['scenario', 'annotation', 'prototype'],
  titleI18n: { 'zh-CN': '原型标注（AI 生成规格）', en: 'Prototype annotation' },
  description: 'AI-generates prototype annotations',
  descriptionI18n: { 'zh-CN': '让 AI 自动生成原型标注' },
});

const CATALOG = [TAGGED_WEB_EXAMPLE, ANNOTATION_PLUGIN];

describe('plugin search index', () => {
  it('indexes every locale of title_i18n, not just the active one', () => {
    // Before: the index held only raw English fields, so the UI displayed
    // 原型标注（AI 生成规格） while searching that name returned nothing.
    expect(pluginMatchesQuery(ANNOTATION_PLUGIN, '原型标注')).toBe(true);
    expect(pluginMatchesQuery(ANNOTATION_PLUGIN, 'prototype')).toBe(true);
  });

  it('indexes localized descriptions too', () => {
    expect(pluginMatchesQuery(ANNOTATION_PLUGIN, '自动生成')).toBe(true);
  });

  it('does not match unrelated plugins', () => {
    expect(pluginMatchesQuery(TAGGED_WEB_EXAMPLE, '原型标注')).toBe(false);
  });

  it('ranks a name hit above an incidental tag hit', () => {
    expect(pluginMatchTier(ANNOTATION_PLUGIN, 'prototype')).toBeLessThan(
      pluginMatchTier(TAGGED_WEB_EXAMPLE, 'prototype'),
    );
  });

  it('ranks a prefix hit above a mid-string hit', () => {
    expect(pluginMatchTier(ANNOTATION_PLUGIN, 'proto')).toBe(0);
  });

  it('surfaces the named plugin even when catalog order works against it', () => {
    // Before: filter-then-slice in catalog order returned the tag-only hit
    // first and cut the named plugin off entirely.
    expect(rankPluginMatches(CATALOG, 'prototype', 1).map((p) => p.id))
      .toEqual(['od-prototype-annotation']);
  });

  it('caps results at the limit and keeps catalog order within a tier', () => {
    const sameTier = [
      plugin({ id: 'a-prototype-one', title: 'prototype one' }),
      plugin({ id: 'b-prototype-two', title: 'prototype two' }),
      plugin({ id: 'c-prototype-three', title: 'prototype three' }),
    ];
    expect(rankPluginMatches(sameTier, 'prototype', 2).map((p) => p.id))
      .toEqual(['a-prototype-one', 'b-prototype-two']);
  });

  it('returns the leading plugins when the query is empty', () => {
    expect(rankPluginMatches(CATALOG, '', 1).map((p) => p.id)).toEqual(['blog-post']);
  });

  it('ignores malformed i18n values instead of throwing', () => {
    const malformed = plugin({
      id: 'malformed',
      title: 'Malformed',
      titleI18n: { 'zh-CN': 42, en: null },
    });
    expect(pluginMatchesQuery(malformed, 'malformed')).toBe(true);
    expect(pluginMatchesQuery(malformed, '42')).toBe(false);
  });
});
