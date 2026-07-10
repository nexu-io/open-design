export type FalMediaKind = 'image' | 'video' | '3d';

export interface FalMediaRequest {
  provider: 'fal';
  kind: FalMediaKind;
  shotId: string;
  prompt: string;
  model: string;
  referenceAssetIds?: string[];
}

export function buildFalMediaRequest(input: FalMediaRequest): FalMediaRequest {
  return input;
}

