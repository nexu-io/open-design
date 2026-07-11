import type { AppConfig } from '../types';
import type { streamMessage } from '../providers/anthropic';
import type { GenerationKind, MediaJobKind, ProductionMediaJob, ProductionSegment } from './types';
import type {
  CancelFalMediaJobInput,
  FalMediaRequest,
  FalMediaTaskSnapshot,
  SubmitFalMediaJobInput,
  WaitForFalMediaJobInput,
} from './fal';
import type { BuildProduction3DPlanInput, Production3DAdapter, Production3DAdapterBuildInput, Production3DPlan } from './three-d';

export interface TextGenerationAdapterRunInput {
  kind: GenerationKind;
  config: AppConfig;
  segments: ProductionSegment[];
  voiceTone: string;
  defaultVoiceProfileId: string;
  knownVoiceProfileIds: readonly string[];
  resolveVoiceLabel: (voiceProfileId: string) => string;
  timeoutMs?: number;
  streamMessageImpl?: typeof streamMessage;
}

export interface TextGenerationAdapter {
  readonly name: 'openrouter';
  run(input: TextGenerationAdapterRunInput): Promise<{ segments: ProductionSegment[]; notice: string }>;
}

export interface MediaGenerationAdapter {
  readonly name: 'fal';
  buildRequest(input: FalMediaRequest): FalMediaRequest;
  planJobs(input: {
    segments: readonly ProductionSegment[];
    kind?: MediaJobKind;
    model?: string;
    jobPrefix?: string;
  }): ProductionMediaJob[];
  submitJob(input: SubmitFalMediaJobInput): Promise<ProductionMediaJob>;
  waitForJob(input: WaitForFalMediaJobInput): Promise<{ job: ProductionMediaJob; snapshot: FalMediaTaskSnapshot }>;
  cancelJob(input: CancelFalMediaJobInput): Promise<ProductionMediaJob>;
}

export interface Production3DGenerationAdapter {
  readonly name: Production3DAdapter['name'];
  buildPlan(input: BuildProduction3DPlanInput): Production3DPlan;
  buildJob(input: Production3DAdapterBuildInput): ProductionMediaJob;
}
