import { describe, expect, it, vi } from 'vitest';

import {
  falMediaAdapter,
  openRouterTextGenerationAdapter,
  runProductionGeneration,
} from '../../src/production-generation';
import type { TextGenerationAdapter } from '../../src/production-generation/adapters';

describe('production-generation adapters', () => {
  it('exposes an OpenRouter text-generation adapter boundary', () => {
    expect(openRouterTextGenerationAdapter.name).toBe('openrouter');
    expect(typeof openRouterTextGenerationAdapter.run).toBe('function');
  });

  it('exposes a FAL media adapter boundary', () => {
    expect(falMediaAdapter.name).toBe('fal');
    expect(typeof falMediaAdapter.planJobs).toBe('function');
    expect(typeof falMediaAdapter.submitJob).toBe('function');
  });

  it('can run production generation through an injected text adapter', async () => {
    const adapter: TextGenerationAdapter = {
      name: 'openrouter',
      run: vi.fn(async (input) => ({
        segments: input.segments.map((segment) => ({
          ...segment,
          paragraph: `${segment.paragraph} (adapter)`,
        })),
        notice: 'adapter used',
      })),
    };

    const result = await runProductionGeneration({
      kind: 'draft',
      adapter,
      config: {
        mode: 'api',
        apiProtocol: 'openai',
        apiKey: 'key',
        baseUrl: 'https://example.com',
        model: 'anthropic/claude',
      } as never,
      segments: [
        {
          id: 'hook',
          label: 'Hook',
          paragraph: 'Hello',
          narration: 'Narration',
          shot: 'Shot',
          assets: 'Assets',
          output: 'Output',
          voiceProfileId: 'guide-host',
        },
      ],
      voiceTone: 'professional',
      defaultVoiceProfileId: 'guide-host',
      knownVoiceProfileIds: ['guide-host'],
      resolveVoiceLabel: () => '專業講解者',
    });

    expect(result.notice).toBe('adapter used');
    expect(result.segments[0]?.paragraph).toBe('Hello (adapter)');
  });
});
