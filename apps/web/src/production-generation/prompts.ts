import type { GenerationKind, GeneratedSegmentsPayload, ProductionSegment } from './types';

export function extractJsonPayload(text: string): GeneratedSegmentsPayload | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as GeneratedSegmentsPayload;
    if (record.segments && Array.isArray(record.segments)) {
      return { segments: record.segments };
    }
    return null;
  } catch {
    return null;
  }
}

export function buildGenerationSystemPrompt(kind: GenerationKind): string {
  const focus =
    kind === 'draft'
      ? 'Rewrite every field to make this a better production draft.'
      : kind === 'voice'
        ? 'Only improve narration and voiceProfileId. Keep paragraph, shot, assets, and output unchanged if possible.'
        : 'Only improve shot. Keep other fields unchanged if possible.';

  return [
    'You are a production assistant for a short-form video workflow.',
    'Return strict JSON only. No markdown, no commentary.',
    'Schema: {"segments":[{"id":"...","label":"...","paragraph":"...","narration":"...","shot":"...","assets":"...","output":"...","voiceProfileId":"..."}]}',
    'Keep the same segment order when possible.',
    'Use concise Traditional Chinese friendly production copy.',
    focus,
  ].join('\n');
}

export function buildGenerationUserPrompt(
  kind: GenerationKind,
  segments: ProductionSegment[],
  voiceTone: string,
): string {
  const current = segments.map((segment) => ({
    id: segment.id,
    label: segment.label,
    paragraph: segment.paragraph,
    narration: segment.narration,
    shot: segment.shot,
    assets: segment.assets,
    output: segment.output,
    voiceProfileId: segment.voiceProfileId,
  }));

  const focus =
    kind === 'draft'
      ? 'Rewrite every field to make this a better production draft.'
      : kind === 'voice'
        ? 'Only improve narration and voiceProfileId. Keep paragraph, shot, assets, and output unchanged if possible.'
        : 'Only improve shot. Keep other fields unchanged if possible.';

  return JSON.stringify(
    {
      task: kind,
      voiceTone,
      focus,
      segments: current,
    },
    null,
    2,
  );
}

