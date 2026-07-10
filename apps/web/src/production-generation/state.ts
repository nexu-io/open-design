import type { ProductionSegment } from './types';

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

