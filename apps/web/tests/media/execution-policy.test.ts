import { describe, expect, it } from 'vitest';

import { mediaExecutionPolicyForProjectMetadata } from '../../src/media/execution-policy';

describe('media execution policy for project metadata', () => {
  it('keeps image projects without an explicit model enabled so the agent can ask', () => {
    expect(mediaExecutionPolicyForProjectMetadata({ kind: 'image' })).toEqual({
      mode: 'enabled',
      allowedSurfaces: ['image'],
    });
  });

  it('scopes media projects to their selected model when one is present', () => {
    expect(mediaExecutionPolicyForProjectMetadata({
      kind: 'image',
      imageModel: 'gpt-image-2',
    })).toEqual({
      mode: 'enabled',
      allowedSurfaces: ['image'],
      allowedModels: ['gpt-image-2'],
    });
  });
  it('does not lock the automatic Motion renderer against Query-selected video models', () => {
    expect(mediaExecutionPolicyForProjectMetadata({
      kind: 'video', intent: 'motion-design', videoModel: 'hyperframes-html',
      strategyBinding: { schemaVersion: 1, provenance: 'automatic_default', taskProfile: 'motion-design', boundAt: 1 },
    })).toEqual({ mode: 'enabled' });
  });

  it('retains deliberately selected and historical media model restrictions', () => {
    for (const metadata of [
      { kind: 'video' as const, videoModel: 'hyperframes-html' },
      { kind: 'video' as const, intent: 'motion-design' as const, videoModel: 'grok-video',
        strategyBinding: { schemaVersion: 1 as const, provenance: 'automatic_default' as const, taskProfile: 'motion-design' as const, boundAt: 1 } },
    ]) {
      expect(mediaExecutionPolicyForProjectMetadata(metadata)?.allowedModels).toEqual([metadata.videoModel]);
    }
  });

  it('does not turn an automatic creation type into a cross-medium restriction', () => {
    expect(mediaExecutionPolicyForProjectMetadata({
      kind: 'video', strategyBinding: { schemaVersion: 1, provenance: 'automatic_default', taskProfile: 'prototype', boundAt: 1 },
    })).toEqual({ mode: 'enabled' });
  });

});
