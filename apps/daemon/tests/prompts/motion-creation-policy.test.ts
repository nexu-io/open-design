import { describe, expect, it } from 'vitest';
import { composeSystemPrompt } from '../../src/prompts/system.js';

describe('Motion creation policy outside the OD Next frozen bundle', () => {
  it.each(['classic', 'slim'] as const)('routes new animation source through Motion in %s', (promptCoreVariant) => {
    const prompt = composeSystemPrompt({ promptCoreVariant });
    expect(prompt).toContain('Select motion-design for new motion films and editable timeline-animation source');
    expect(prompt).toContain('does NOT require MP4 production');
    expect(prompt).toContain('Preserve original persisted bindings');
    expect(prompt).toContain('Keep an explicitly required video-generation model');
  });

  it('keeps the bare conversation mode free of production policy', () => {
    expect(composeSystemPrompt({ sessionMode: 'chat' })).not.toContain('## Current motion creation policy');
  });

  it.each(['classic', 'slim'] as const)('preserves the delivery contract for an explicit video model in %s', (promptCoreVariant) => {
    const prompt = composeSystemPrompt({ promptCoreVariant, metadata: { kind: 'video', videoModel: 'sora-2' } });
    expect(prompt.includes('For actual Motion video requests')).toBe(true);
    expect(prompt.includes('Explicit video-generation-model requests keep their existing delivery contract')).toBe(true);
    expect(prompt.includes('Actual video requests still require editable source')).toBe(false);
  });
});
