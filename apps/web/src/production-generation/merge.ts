import { buildAssets, buildNarration, buildOutput, buildShot } from './state';
import type { GeneratedSegmentPatch, GenerationKind, ProductionSegment } from './types';

export function validateGeneratedSegments(
  payload: { segments?: GeneratedSegmentPatch[] },
  knownVoiceProfileIds: readonly string[],
): void {
  const segments = payload.segments ?? [];
  if (segments.length === 0) return;

  const seenIds = new Set<string>();
  for (const [index, segment] of segments.entries()) {
    if (!segment || typeof segment !== 'object') {
      throw new Error(`Generated segment ${index + 1} is not an object.`);
    }

    const id = segment.id?.trim();
    if (id) {
      if (seenIds.has(id)) {
        throw new Error(`Duplicate generated segment id: ${id}`);
      }
      seenIds.add(id);
    }

    const voiceProfileId = segment.voiceProfileId?.trim();
    if (voiceProfileId && !knownVoiceProfileIds.includes(voiceProfileId)) {
      throw new Error(`Unknown voiceProfileId: ${voiceProfileId}`);
    }
  }
}

export function mergeGeneratedSegments(
  current: ProductionSegment[],
  generated: GeneratedSegmentPatch[],
  kind: GenerationKind,
  voiceTone: string,
  defaultVoiceProfileId: string,
  resolveVoiceLabel: (voiceProfileId: string) => string = (voiceProfileId) => voiceProfileId,
): ProductionSegment[] {
  if (generated.length === 0) return current;

  const next = current.map((segment, index) => {
    const patch = generated[index];
    if (!patch) return segment;

    const id = patch.id?.trim() || segment.id;
    const label = patch.label?.trim() || segment.label;
    const nextProfileId = patch.voiceProfileId?.trim() || segment.voiceProfileId || defaultVoiceProfileId;
    const voiceLabel = resolveVoiceLabel(nextProfileId);
    const paragraph = patch.paragraph?.trim() || segment.paragraph;
    const narration =
      kind === 'voice'
        ? patch.narration?.trim() || buildNarration(paragraph, voiceTone, voiceLabel)
        : patch.narration?.trim() || segment.narration || buildNarration(paragraph, voiceTone, voiceLabel);
    const shot =
      kind === 'storyboard'
        ? patch.shot?.trim() || buildShot(paragraph)
        : patch.shot?.trim() || segment.shot || buildShot(paragraph);
    const assets = patch.assets?.trim() || segment.assets || buildAssets(paragraph);
    const output = patch.output?.trim() || segment.output || buildOutput(paragraph);

    return {
      id,
      label,
      paragraph: kind === 'draft' ? paragraph : segment.paragraph,
      narration: kind === 'voice' ? narration : segment.narration,
      shot: kind === 'storyboard' ? shot : segment.shot,
      assets: kind === 'draft' ? assets : segment.assets,
      output: kind === 'draft' ? output : segment.output,
      voiceProfileId: kind === 'voice' && patch.voiceProfileId?.trim()
        ? nextProfileId
        : segment.voiceProfileId,
    };
  });

  if (generated.length > current.length) {
    for (let index = current.length; index < generated.length; index += 1) {
      const patch = generated[index]!;
      const nextProfileId = patch.voiceProfileId?.trim() || defaultVoiceProfileId;
      const voiceLabel = resolveVoiceLabel(nextProfileId);
      const paragraph = patch.paragraph?.trim() || '';
      next.push({
        id: patch.id?.trim() || `generated-${index + 1}`,
        label: patch.label?.trim() || `第 ${index + 1} 段`,
        paragraph: kind === 'draft' ? paragraph : '',
        narration: kind === 'voice'
          ? patch.narration?.trim() || buildNarration(paragraph, voiceTone, voiceLabel)
          : buildNarration(paragraph, voiceTone, voiceLabel),
        shot: kind === 'storyboard' ? patch.shot?.trim() || buildShot(paragraph) : buildShot(paragraph),
        assets: kind === 'draft' ? patch.assets?.trim() || buildAssets(paragraph) : buildAssets(paragraph),
        output: kind === 'draft' ? patch.output?.trim() || buildOutput(paragraph) : buildOutput(paragraph),
        voiceProfileId: kind === 'voice' && patch.voiceProfileId?.trim() ? nextProfileId : defaultVoiceProfileId,
      });
    }
  }

  return next;
}

