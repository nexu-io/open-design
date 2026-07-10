export type GenerationKind = 'draft' | 'voice' | 'storyboard';

export interface ProductionSegment {
  id: string;
  label: string;
  paragraph: string;
  narration: string;
  shot: string;
  assets: string;
  output: string;
  voiceProfileId: string;
}

export interface GeneratedSegmentPatch {
  id?: string;
  label?: string;
  paragraph?: string;
  narration?: string;
  shot?: string;
  assets?: string;
  output?: string;
  voiceProfileId?: string;
}

export interface GeneratedSegmentsPayload {
  segments?: GeneratedSegmentPatch[];
}

export interface VoiceProfileSummary {
  id: string;
  role: string;
  tone?: string;
}

export type MediaJobKind = 'image' | 'video' | '3d';
export type MediaJobStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

export interface ProductionMediaJob {
  id: string;
  segmentId: string;
  kind: MediaJobKind;
  status: MediaJobStatus;
  provider: 'fal';
  model: string;
  prompt: string;
  referenceAssetIds: readonly string[];
  resultAssetIds: readonly string[];
  error?: string;
}
