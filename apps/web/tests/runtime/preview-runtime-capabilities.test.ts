import { describe, expect, it } from 'vitest';
import { previewRuntimeCapabilitiesForViewer } from '../../src/runtime/preview-runtime-capabilities';

describe('previewRuntimeCapabilitiesForViewer', () => {
  it('keeps passive and dormant instant-toggle bridges stable', () => {
    expect(previewRuntimeCapabilitiesForViewer({
      deck: false,
      comment: false,
      inspect: false,
      draw: false,
      edit: false,
    })).toEqual([
      'content_measurement',
      'scroll',
      'snapshot',
      'observability',
      'selection',
      'tweaks',
      'palette',
    ]);
  });

  it('adds interaction modules in canonical protocol order without changing transport', () => {
    expect(previewRuntimeCapabilitiesForViewer({
      deck: true,
      comment: true,
      inspect: true,
      draw: true,
      edit: true,
    })).toEqual([
      'content_measurement',
      'scroll',
      'snapshot',
      'observability',
      'selection',
      'comment',
      'inspect',
      'draw',
      'tweaks',
      'palette',
      'deck',
      'edit',
    ]);
  });
});
