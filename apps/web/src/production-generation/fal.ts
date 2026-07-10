import type { MediaJobKind, ProductionMediaJob } from './types';

export interface FalMediaRequest {
  provider: 'fal';
  kind: MediaJobKind;
  shotId: string;
  prompt: string;
  model: string;
  referenceAssetIds?: string[];
}

export function buildFalMediaRequest(input: FalMediaRequest): FalMediaRequest {
  return input;
}

export function createFalMediaJob(input: {
  id: string;
  segmentId: string;
  kind: MediaJobKind;
  model: string;
  prompt: string;
  referenceAssetIds?: readonly string[];
}): ProductionMediaJob {
  return {
    id: input.id,
    segmentId: input.segmentId,
    kind: input.kind,
    status: 'idle',
    provider: 'fal',
    model: input.model,
    prompt: input.prompt,
    referenceAssetIds: input.referenceAssetIds ?? [],
    resultAssetIds: [],
  };
}
