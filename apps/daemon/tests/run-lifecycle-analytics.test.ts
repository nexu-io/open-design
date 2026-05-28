import { describe, expect, it } from 'vitest';
import { __forTestResolveRunProjectKindForAnalytics } from '../src/server.js';

describe('run lifecycle analytics', () => {
  it('falls back to stored project metadata when analytics hints omit project kind', () => {
    expect(
      __forTestResolveRunProjectKindForAnalytics({
        hintProjectKind: null,
        projectMetadata: { kind: 'prototype' },
      }),
    ).toBe('prototype');
  });

  it('maps project metadata kind to the analytics project_kind enum', () => {
    expect(
      __forTestResolveRunProjectKindForAnalytics({
        hintProjectKind: null,
        projectMetadata: { kind: 'deck' },
      }),
    ).toBe('slide_deck');
  });

  it('preserves explicit analytics hints over project metadata', () => {
    expect(
      __forTestResolveRunProjectKindForAnalytics({
        hintProjectKind: 'design_system',
        projectMetadata: { kind: 'other' },
      }),
    ).toBe('design_system');
  });

  it('classifies design-system workspace projects when hints are absent', () => {
    expect(
      __forTestResolveRunProjectKindForAnalytics({
        hintProjectKind: null,
        projectMetadata: { kind: 'other', importedFrom: 'design-system' },
      }),
    ).toBe('design_system');
  });
});
