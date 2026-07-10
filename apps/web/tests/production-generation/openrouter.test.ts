import { describe, expect, it, vi } from 'vitest';

import { runProductionGeneration, type RunProductionGenerationInput } from '../../src/production-generation';
import { DEFAULT_CONFIG } from '../../src/state/config';

const baseConfig = {
  ...DEFAULT_CONFIG,
  mode: 'api' as const,
  apiKey: 'test-openrouter-key',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-3.7-sonnet',
  apiProtocol: 'openai' as const,
};

const segments: RunProductionGenerationInput['segments'] = [
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

describe('runProductionGeneration', () => {
  it('returns the generated segments and notice from a successful stream', async () => {
    const streamMessageImpl = vi.fn(async (_cfg, _system, _history, _signal, handlers) => {
      handlers.onDelta('{"segments":[{"id":"hook","label":"Hook","paragraph":"Open with the question the viewer cares about.","voiceProfileId":"young-voice"}]}');
      handlers.onDone('{"segments":[{"id":"hook","label":"Hook","paragraph":"Open with the question the viewer cares about.","voiceProfileId":"young-voice"}]}');
    });

    const result = await runProductionGeneration({
      kind: 'draft',
      config: baseConfig,
      segments,
      voiceTone: 'professional',
      defaultVoiceProfileId: 'guide-host',
      knownVoiceProfileIds: ['guide-host', 'young-voice'],
      resolveVoiceLabel: (voiceProfileId) => (voiceProfileId === 'young-voice' ? '年輕聲線' : '專業講解者'),
      streamMessageImpl,
      timeoutMs: 1000,
    });

    expect(streamMessageImpl).toHaveBeenCalledTimes(1);
    expect(result.notice).toBe('Draft updated from OpenRouter.');
    expect(result.segments[0]?.paragraph).toBe('Open with the question the viewer cares about.');
    expect(result.segments[0]?.voiceProfileId).toBe('guide-host');
  });

  it('returns the original segments when the stream output is not valid JSON', async () => {
    const streamMessageImpl = vi.fn(async (_cfg, _system, _history, _signal, handlers) => {
      handlers.onDelta('not json');
      handlers.onDone('not json');
    });

    const result = await runProductionGeneration({
      kind: 'voice',
      config: baseConfig,
      segments,
      voiceTone: 'professional',
      defaultVoiceProfileId: 'guide-host',
      knownVoiceProfileIds: ['guide-host', 'young-voice'],
      resolveVoiceLabel: (voiceProfileId) => (voiceProfileId === 'young-voice' ? '年輕聲線' : '專業講解者'),
      streamMessageImpl,
      timeoutMs: 1000,
    });

    expect(result.notice).toBe('Generation finished, but the response was not valid JSON.');
    expect(result.segments).toBe(segments);
  });
});
