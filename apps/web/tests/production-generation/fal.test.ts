import { describe, expect, it } from 'vitest';

import type { FalMediaRequest } from '../../src/production-generation/fal';
import { buildFalMediaRequest, createFalMediaJob } from '../../src/production-generation/fal';
import { updateProductionMediaJobStatus } from '../../src/production-generation/state';

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

  it('creates and updates a media job without touching the segment graph', () => {
    const job = createFalMediaJob({
      id: 'job-1',
      segmentId: 'hook',
      kind: 'video',
      model: 'fal/kling-pro',
      prompt: 'Hook shot to short video',
      referenceAssetIds: ['asset-1'],
    });

    expect(job.status).toBe('idle');
    expect(job.provider).toBe('fal');
    expect(job.referenceAssetIds).toEqual(['asset-1']);

    const running = updateProductionMediaJobStatus(job, 'running', {});
    expect(running.status).toBe('running');

    const completed = updateProductionMediaJobStatus(running, 'completed', {
      resultAssetIds: ['asset-output-1'],
    });
    expect(completed.status).toBe('completed');
    expect(completed.resultAssetIds).toEqual(['asset-output-1']);
  });
});
