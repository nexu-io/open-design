export type GenerationKind = 'draft' | 'voice' | 'storyboard';

export type Production3DEngine = 'blender' | 'plugin' | 'unknown';
export type Production3DShotPurpose = 'establishing' | 'product' | 'character' | 'detail' | 'transition';
export type Production3DCameraAngle = 'front' | 'three-quarter' | 'top' | 'isometric' | 'orbit';
export type Production3DCameraMovement = 'static' | 'push-in' | 'orbit' | 'pan' | 'dolly';
export type Production3DOutputIntent = 'still' | 'turntable' | 'short-animation' | 'composited-shot';
export type Production3DTransitionKind = 'cut' | 'fade' | 'match-cut' | 'camera-blend' | 'push-through' | 'wipe';
export type Production3DGeneratedAssetKind = 'model' | 'texture' | 'rig' | 'lighting' | 'camera-path' | 'render';

export interface Production3DCameraPlan {
  angle: Production3DCameraAngle;
  framing: 'wide' | 'medium' | 'close' | 'macro';
  movement: Production3DCameraMovement;
}

export interface Production3DScenePlan {
  environment: string;
  focus: string;
  lighting: string;
  composition: string;
  animationNotes: readonly string[];
}

export interface Production3DAssetPlan {
  sourceAssetIds: readonly string[];
  generatedAssetKinds: readonly Production3DGeneratedAssetKind[];
  notes: readonly string[];
}

export interface Production3DTransitionPlan {
  kind: Production3DTransitionKind;
  fromBeat: string;
  toBeat: string;
  notes: readonly string[];
}

export interface Production3DPlan {
  engine: Production3DEngine;
  purpose: Production3DShotPurpose;
  sceneSummary: string;
  camera: Production3DCameraPlan;
  scene: Production3DScenePlan;
  assets: Production3DAssetPlan;
  transition: Production3DTransitionPlan;
  styleNotes: readonly string[];
  objectNotes: readonly string[];
  outputIntent: Production3DOutputIntent;
  referenceAssetIds: readonly string[];
  planOnly: true;
}

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
  provider: 'fal' | 'blender' | 'plugin';
  model: string;
  prompt: string;
  referenceAssetIds: readonly string[];
  resultAssetIds: readonly string[];
  progress: readonly string[];
  plan?: Production3DPlan | null;
  planOnly?: boolean;
  taskId?: string;
  startedAt?: number;
  endedAt?: number | null;
  file?: unknown | null;
  error?: string;
}
