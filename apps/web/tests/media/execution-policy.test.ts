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
});
