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

