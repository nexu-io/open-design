// Seed contract for the Home example-prompt cards and the plugin detail
// modal's prompt-loading "Use" action (issue: the composer was seeded with
// the en query's leading paragraph, which for many example plugins is a
// generator-facing build spec — stack/file-layout instructions, raw HTML, or a
// dangling "as described below" — instead of the curated natural-language
// description).

import { describe, expect, it } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { examplePresetSeedPrompt } from '../../src/components/plugins-home/presetSeedPrompt';

function fixture(overrides: {
  id: string;
  description?: string;
  query?: string | Record<string, string>;
  inputs?: Array<Record<string, unknown>>;
}): InstalledPluginRecord {
  return {
    id: overrides.id,
    title: overrides.id,
    version: '0.1.0',
    sourceKind: 'bundled',
    source: '/tmp',
    trust: 'bundled',
    capabilitiesGranted: ['prompt:inject'],
    manifest: {
      name: overrides.id,
      version: '0.1.0',
      ...(overrides.description ? { description: overrides.description } : {}),
      od: {
        ...(overrides.query ? { useCase: { query: overrides.query } } : {}),
        ...(overrides.inputs ? { inputs: overrides.inputs } : {}),
      },
    },
    fsPath: '/tmp',
    installedAt: 0,
    updatedAt: 0,
  } as InstalledPluginRecord;
}

const fallback = () => 'fallback seed';

describe('examplePresetSeedPrompt', () => {
  it('prefers the curated description over a generator-facing build-spec query head (en)', () => {
    const record = fixture({
      id: 'build-spec-example',
      description:
        'Immersive single-page parallax landing: a sticky viewport zooms a portal image toward you on scroll.',
      query: {
        en: 'Build a single-page immersive parallax landing page in React + TypeScript + Tailwind CSS using Vite. Everything lives in a single `src/App.tsx` file.\n\nScene one: ...',
      },
    });
    const seed = examplePresetSeedPrompt(record, 'en', fallback);
    expect(seed.text).toBe(record.manifest.description);
    expect(seed.fromRenderedQuery).toBe(false);
  });

  it('prefers the curated description over a raw-HTML query head (en)', () => {
    const record = fixture({
      id: 'raw-html-example',
      description: 'Premium scroll-cinematic aerospace propulsion marketing site.',
      query: {
        en: '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n</head>\n\n<body>...</body>',
      },
    });
    const seed = examplePresetSeedPrompt(record, 'en', fallback);
    expect(seed.text).toBe(record.manifest.description);
    expect(seed.fromRenderedQuery).toBe(false);
  });

  it('prefers the curated description over a query head that dangles "as described below" (en)', () => {
    const record = fixture({
      id: 'dangling-spec-example',
      description: 'Dark space-themed NFT collection landing page with a liquid-glass UI.',
      query: {
        en: 'Create an NFT landing page called "Orbis.Nft" with 4 sections. Recreate it exactly as described below.\n\n## Sections\n...',
      },
    });
    const seed = examplePresetSeedPrompt(record, 'en', fallback);
    expect(seed.text).toBe(record.manifest.description);
    expect(seed.fromRenderedQuery).toBe(false);
  });

  it('keeps the rendered query head for input-templated queries so placeholder write-back survives', () => {
    const record = fixture({
      id: 'web-prototype',
      description: 'General-purpose desktop web prototype.',
      query: {
        en: 'Create a premium product-studio {{fidelity}} {{artifactKind}} for {{audience}}: sharp information architecture.\n\nDetails below.',
      },
      inputs: [
        { name: 'fidelity', default: 'high-fidelity' },
        { name: 'artifactKind', default: 'prototype' },
        { name: 'audience', default: 'designers' },
      ],
    });
    const seed = examplePresetSeedPrompt(record, 'en', fallback);
    expect(seed.text).toBe(
      'Create a premium product-studio high-fidelity prototype for designers: sharp information architecture.',
    );
    expect(seed.fromRenderedQuery).toBe(true);
  });

  it('keeps the zh description-first behavior', () => {
    const record = fixture({
      id: 'localized-description-example',
      description: '沉浸式视差落地页。',
      query: { 'zh-CN': '构建梦核风格的沉浸式视差落地页（详见 en 字段的完整规格说明，以 en 为准）。' },
    });
    const seed = examplePresetSeedPrompt(record, 'zh-CN', fallback);
    expect(seed.text).toBe('沉浸式视差落地页。');
    expect(seed.fromRenderedQuery).toBe(false);
  });

  it('falls back to the query head when there is no description', () => {
    const record = fixture({
      id: 'no-description',
      query: { en: 'Create a moody portfolio landing page.\n\nDetails.' },
    });
    const seed = examplePresetSeedPrompt(record, 'en', fallback);
    expect(seed.text).toBe('Create a moody portfolio landing page.');
    expect(seed.fromRenderedQuery).toBe(true);
  });

  it('falls back to the caller fallback when the query is a meta-instruction and there is no description', () => {
    const record = fixture({
      id: 'meta-only',
      query: { en: 'Follow the en field verbatim; start from example.html.' },
    });
    const seed = examplePresetSeedPrompt(record, 'en', fallback);
    expect(seed.text).toBe('fallback seed');
    expect(seed.fromRenderedQuery).toBe(false);
  });
});
