import { describe, expect, it } from 'vitest';

import {
  buildGenerationSystemPrompt,
  buildGenerationUserPrompt,
  extractJsonPayload,
  type ProductionSegment,
} from '../../src/production-generation';

const segments: ProductionSegment[] = [
  {
    id: 'hook',
    label: 'Hook',
    paragraph: 'Hook paragraph',
    narration: '專業講解者 (professional) 旁白：Hook paragraph',
    shot: '鏡頭：Hook paragraph',
    assets: '素材：Hook paragraph',
    output: '成片：Hook paragraph',
    voiceProfileId: 'guide-host',
  },
];

describe('production generation prompts', () => {
  it('builds a strict JSON system prompt for draft generation', () => {
    const prompt = buildGenerationSystemPrompt('draft');

    expect(prompt).toContain('Return strict JSON only.');
    expect(prompt).toContain('"segments"');
    expect(prompt).toContain('Rewrite every field');
  });

  it('builds a user prompt that carries the segment graph', () => {
    const prompt = buildGenerationUserPrompt('voice', segments, 'professional');

    expect(prompt).toContain('"task": "voice"');
    expect(prompt).toContain('"voiceTone": "professional"');
    expect(prompt).toContain('"voiceProfileId": "guide-host"');
  });

  it('extracts JSON from either raw or fenced model output', () => {
    const raw = extractJsonPayload('{"segments":[{"id":"hook"}]}');
    const fenced = extractJsonPayload('```json\n{"segments":[{"id":"hook"}]}\n```');

    expect(raw?.segments?.[0]?.id).toBe('hook');
    expect(fenced?.segments?.[0]?.id).toBe('hook');
  });
});

