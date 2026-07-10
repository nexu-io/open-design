import { describe, expect, it } from 'vitest';

import type { FalMediaRequest } from '../../src/production-generation/fal';
import { buildFalMediaRequest } from '../../src/production-generation/fal';

describe('fal media adapter', () => {
  it('maps a storyboard shot into a FAL.ai media job request', () => {
    const request: FalMediaRequest = buildFalMediaRequest({
      provider: 'fal',
      kind: 'image',
      shotId: 'hook',
      prompt: 'Bold title card with one sample image',
      model: 'fal/flux-pro',
    });

    expect(request.provider).toBe('fal');
    expect(request.kind).toBe('image');
    expect(request.prompt).toContain('Bold title card');
  });
});

