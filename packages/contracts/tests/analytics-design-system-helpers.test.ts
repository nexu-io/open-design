import { describe, expect, it } from 'vitest';

import type { ChatAnalyticsHints } from '../src/api/chat.js';
import {
  designSystemFolderCountBucket,
  designSystemLengthBucket,
  designSystemModuleSlug,
  designSystemModuleType,
  designSystemRepoHostFromUrl,
  designSystemTotalSizeBucket,
} from '../src/analytics/events.js';

describe('designSystemLengthBucket', () => {
  it('returns 0 for empty / whitespace input', () => {
    expect(designSystemLengthBucket('')).toBe('0');
    expect(designSystemLengthBucket('   ')).toBe('0');
    expect(designSystemLengthBucket(null)).toBe('0');
    expect(designSystemLengthBucket(undefined)).toBe('0');
  });

  it('buckets character counts inclusive of the upper bound', () => {
    expect(designSystemLengthBucket('a')).toBe('1_50');
    expect(designSystemLengthBucket('a'.repeat(50))).toBe('1_50');
    expect(designSystemLengthBucket('a'.repeat(51))).toBe('51_200');
    expect(designSystemLengthBucket('a'.repeat(200))).toBe('51_200');
    expect(designSystemLengthBucket('a'.repeat(201))).toBe('201_500');
    expect(designSystemLengthBucket('a'.repeat(500))).toBe('201_500');
    expect(designSystemLengthBucket('a'.repeat(501))).toBe('500_plus');
  });
});

describe('designSystemFolderCountBucket', () => {
  it('returns unknown for non-finite input', () => {
    expect(designSystemFolderCountBucket(null)).toBe('unknown');
    expect(designSystemFolderCountBucket(undefined)).toBe('unknown');
    expect(designSystemFolderCountBucket(Number.NaN)).toBe('unknown');
    expect(designSystemFolderCountBucket(Number.POSITIVE_INFINITY)).toBe('unknown');
  });

  it('buckets counts inclusive of the upper bound', () => {
    expect(designSystemFolderCountBucket(0)).toBe('0');
    expect(designSystemFolderCountBucket(1)).toBe('1_10');
    expect(designSystemFolderCountBucket(10)).toBe('1_10');
    expect(designSystemFolderCountBucket(11)).toBe('11_50');
    expect(designSystemFolderCountBucket(50)).toBe('11_50');
    expect(designSystemFolderCountBucket(51)).toBe('51_200');
    expect(designSystemFolderCountBucket(200)).toBe('51_200');
    expect(designSystemFolderCountBucket(201)).toBe('200_plus');
    expect(designSystemFolderCountBucket(10000)).toBe('200_plus');
  });
});

describe('designSystemTotalSizeBucket', () => {
  it('returns unknown for non-finite input', () => {
    expect(designSystemTotalSizeBucket(null)).toBe('unknown');
    expect(designSystemTotalSizeBucket(Number.NaN)).toBe('unknown');
  });

  it('buckets bytes by megabyte thresholds', () => {
    expect(designSystemTotalSizeBucket(0)).toBe('0_1mb');
    expect(designSystemTotalSizeBucket(500 * 1024)).toBe('0_1mb');
    expect(designSystemTotalSizeBucket(1024 * 1024)).toBe('1_10mb');
    expect(designSystemTotalSizeBucket(9 * 1024 * 1024)).toBe('1_10mb');
    expect(designSystemTotalSizeBucket(10 * 1024 * 1024)).toBe('10_50mb');
    expect(designSystemTotalSizeBucket(49 * 1024 * 1024)).toBe('10_50mb');
    expect(designSystemTotalSizeBucket(50 * 1024 * 1024)).toBe('50mb_plus');
    expect(designSystemTotalSizeBucket(500 * 1024 * 1024)).toBe('50mb_plus');
  });
});

describe('designSystemModuleSlug', () => {
  it('strips header markers and lowercases', () => {
    expect(designSystemModuleSlug('## Typography')).toBe('typography');
    expect(designSystemModuleSlug('### Brand Assets')).toBe('brand-assets');
  });

  it('collapses punctuation and spaces', () => {
    expect(designSystemModuleSlug('Typography & Type Scale')).toBe(
      'typography-type-scale',
    );
    expect(designSystemModuleSlug('  Colors / Palette  ')).toBe('colors-palette');
  });

  it('returns unknown for empty input', () => {
    expect(designSystemModuleSlug('')).toBe('unknown');
    expect(designSystemModuleSlug('   ')).toBe('unknown');
    expect(designSystemModuleSlug('!!!')).toBe('unknown');
    expect(designSystemModuleSlug(null)).toBe('unknown');
  });
});

describe('designSystemModuleType', () => {
  it('maps typography keywords', () => {
    expect(designSystemModuleType('typography')).toBe('typography');
    expect(designSystemModuleType('type-scale')).toBe('typography');
    expect(designSystemModuleType('font-stack')).toBe('typography');
  });

  it('maps colors keywords', () => {
    expect(designSystemModuleType('colors')).toBe('colors');
    expect(designSystemModuleType('color-palette')).toBe('colors');
  });

  it('maps spacing-style keywords', () => {
    expect(designSystemModuleType('spacing-grid')).toBe('spacing');
    expect(designSystemModuleType('layout')).toBe('spacing');
    expect(designSystemModuleType('radius')).toBe('spacing');
    expect(designSystemModuleType('shadow-elevation')).toBe('spacing');
  });

  it('maps component keywords', () => {
    expect(designSystemModuleType('components')).toBe('components');
    expect(designSystemModuleType('buttons')).toBe('components');
    expect(designSystemModuleType('form-inputs')).toBe('components');
  });

  it('maps brand asset keywords', () => {
    expect(designSystemModuleType('brand-assets')).toBe('brand_assets');
    expect(designSystemModuleType('logo-marks')).toBe('brand_assets');
    expect(designSystemModuleType('illustrations')).toBe('brand_assets');
  });

  it('falls back to other for unknown slugs', () => {
    expect(designSystemModuleType('motion')).toBe('other');
    expect(designSystemModuleType('')).toBe('other');
    expect(designSystemModuleType(null)).toBe('other');
  });
});

describe('ChatAnalyticsHints.dsEnrichment (AI-optimize request shape)', () => {
  it('declares the analytics-only enrichment marker the daemon gates on', () => {
    // The web AI-optimize path stamps `dsEnrichment: true`; the daemon reads it
    // with a strict `=== true` gate (routes/runs.ts) to emit
    // design_system_enrich_result and stamp the `ai_refined` DS metadata. The
    // shared contract MUST declare the field so typed ChatRequest callers can
    // discover/type-check it — this test compile-fails if the field is dropped,
    // guarding against the web/daemon-ahead-of-contract drift.
    const enrichHint: ChatAnalyticsHints = { dsEnrichment: true };
    expect(enrichHint.dsEnrichment === true).toBe(true);

    // A run with no enrichment marker reads as a normal (non-enrich) run.
    const plainHint: ChatAnalyticsHints = {};
    expect(plainHint.dsEnrichment === true).toBe(false);

    // The field is optional and analytics-only: an explicit false is still
    // "not an enrichment pass" under the daemon's strict gate.
    const falseHint: ChatAnalyticsHints = { dsEnrichment: false };
    expect(falseHint.dsEnrichment === true).toBe(false);
  });
});

describe('designSystemRepoHostFromUrl', () => {
  it('detects github / gitlab hosts', () => {
    expect(
      designSystemRepoHostFromUrl('https://github.com/owner/repo'),
    ).toBe('github');
    expect(
      designSystemRepoHostFromUrl('https://gitlab.com/group/repo'),
    ).toBe('gitlab');
  });

  it('returns other for non-github/gitlab hosts', () => {
    expect(
      designSystemRepoHostFromUrl('https://bitbucket.org/x/y'),
    ).toBe('other');
  });

  it('returns unknown for unparseable input', () => {
    expect(designSystemRepoHostFromUrl('not a url')).toBe('unknown');
    expect(designSystemRepoHostFromUrl('')).toBe('unknown');
    expect(designSystemRepoHostFromUrl(null)).toBe('unknown');
  });
});
