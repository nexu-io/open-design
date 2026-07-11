import type { ProductionSegment } from './types';
import type { MediaJobStatus, ProductionMediaJob, MediaJobKind } from './types';
import type { Production3DPlan } from './types';

export function buildNarration(paragraph: string, voiceTone: string, voiceLabel: string) {
  const trimmedParagraph = paragraph.trim();
  return trimmedParagraph
    ? `${voiceLabel} (${voiceTone}) 旁白：${paragraph}`
    : `${voiceLabel} (${voiceTone}) 旁白：請輸入段落`;
}

export function buildShot(paragraph: string) {
  return paragraph.trim() ? `鏡頭：${paragraph}` : '鏡頭：請輸入段落';
}

export function buildAssets(paragraph: string) {
  return paragraph.trim() ? `素材：${paragraph}` : '素材：請輸入段落';
}

export function buildOutput(paragraph: string) {
  return paragraph.trim() ? `成片：${paragraph}` : '成片：請輸入段落';
}

export function createVoicePreview(
  segments: ProductionSegment[],
  voiceTone: string,
  resolveVoiceLabel: (voiceProfileId: string) => string,
) {
  if (segments.length === 0) {
    return 'Add a script line to generate a voice preview.';
  }

  const profileLabels = segments
    .map((segment) => resolveVoiceLabel(segment.voiceProfileId))
    .filter((role, index, array) => array.indexOf(role) === index);

  return `Voice flow (${voiceTone}) uses ${profileLabels.join(', ')} across ${segments.length} beats.`;
}

export function createStoryboardShots(segments: ProductionSegment[]) {
  if (segments.length === 0) {
    return ['Add a script line to create storyboard shots.'];
  }

  return segments.map((segment) => `${segment.label}: ${segment.shot}`);
}

export function createProductionMediaJob(input: {
  id: string;
  segmentId: string;
  kind: MediaJobKind;
  model: string;
  prompt: string;
  referenceAssetIds?: readonly string[];
  plan?: Production3DPlan | null;
  planOnly?: boolean;
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
    progress: [],
    plan: input.plan ?? null,
    planOnly: input.planOnly ?? false,
    file: null,
  };
}

export function updateProductionMediaJobStatus(
  job: ProductionMediaJob,
  status: MediaJobStatus,
  patch: Partial<
    Pick<
      ProductionMediaJob,
      | 'resultAssetIds'
      | 'error'
      | 'progress'
      | 'taskId'
      | 'startedAt'
      | 'endedAt'
      | 'file'
    >
  >,
): ProductionMediaJob {
  return {
    ...job,
    status,
    resultAssetIds: patch.resultAssetIds ?? job.resultAssetIds,
    progress: patch.progress ?? job.progress,
    taskId: patch.taskId ?? job.taskId,
    startedAt: patch.startedAt ?? job.startedAt,
    endedAt: patch.endedAt ?? job.endedAt,
    file: patch.file ?? job.file,
    error: patch.error,
  };
}
