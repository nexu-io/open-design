import { describe, expect, it } from 'vitest';
import { codexAgentDef, parseCodexDebugModels } from '../../src/runtimes/defs/codex.js';
import { mergeFallbackModelMetadata } from '../../src/runtimes/models.js';
import { validateModelReasoning } from '../../src/runtimes/reasoning.js';

describe('Codex model-owned reasoning', () => {
  it('validates known models, including future efforts, without degrading a choice', () => {
    const models = [{ id: 'future', label: 'Future', reasoningOptions: [{ id: 'deep-v2', label: 'Deep' }] }];
    expect(validateModelReasoning(codexAgentDef, models, 'future', 'deep-v2')).toBe('deep-v2');
    expect(() => validateModelReasoning(codexAgentDef, models, 'future', 'ultra')).toThrow('not supported');
    expect(() => validateModelReasoning(codexAgentDef, models, 'future', 'bad"value')).toThrow('Invalid');
    expect(validateModelReasoning(codexAgentDef, models, 'future', 'default')).toBeNull();
    expect(validateModelReasoning(codexAgentDef, models, 'custom', 'xhigh')).toBe('xhigh');
    expect(validateModelReasoning(codexAgentDef, models, 'custom', 'unknown')).toBeNull();
    expect(() => validateModelReasoning(codexAgentDef,
      [{ id: 'empty', label: 'Empty', reasoningOptions: [] }], 'empty', 'low')).toThrow('not supported');
  });
  it('keeps explicit empty live capabilities authoritative over static hints', () => {
    const def = { ...codexAgentDef, fallbackModels: [{
      id: 'empty', label: 'Empty', reasoningOptions: [{ id: 'low', label: 'Low' }],
    }] };
    const models = mergeFallbackModelMetadata(def, [{ id: 'empty', label: 'Empty', reasoningOptions: [] }]);
    expect(models[0]?.reasoningOptions).toEqual([]);
    expect(() => validateModelReasoning(def, models, 'empty', 'low')).toThrow('not supported');
  });

  it('preserves model-specific defaults and future options in catalogue order', () => {
    const catalogue = [
      ['gpt-5.5', 'medium', ['low', 'medium', 'high', 'xhigh']],
      ['gpt-5.6-sol', 'low', ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']],
      ['gpt-5.6-terra', 'medium', ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']],
      ['gpt-5.6-luna', 'medium', ['low', 'medium', 'high', 'xhigh', 'max']],
      ['gpt-6-astra', 'medium', ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']],
      ['gpt-future', 'deep-v2', ['low', 'deep-v2']],
    ] as const;
    const models = parseCodexDebugModels(JSON.stringify({ models: catalogue.map(
      ([slug, default_reasoning_level, supported_reasoning_levels]) => ({
        slug, default_reasoning_level, supported_reasoning_levels,
      }),
    ) }));
    for (const [id, defaultReasoning, efforts] of catalogue) {
      expect(models?.find((m) => m.id === id)).toMatchObject({
        defaultReasoning, reasoningOptions: efforts.map((id) => ({ id })),
      });
    }
  });

  it('accepts object options, deduplicates and ignores malformed entries', () => {
    expect(parseCodexDebugModels(JSON.stringify({ models: [{
      slug: 'gpt-future', default_reasoning_level: ' deep-v2 ',
      supported_reasoning_levels: [null, 42, {}, ' ', 'low',
        { effort: ' deep-v2 ', description: 'A deeper mode' },
        { effort: 'low' }, 'bad"value', 'bad\nvalue'],
    }] }))?.[1]).toEqual({
      id: 'gpt-future', label: 'gpt-future', defaultReasoning: 'deep-v2',
      reasoningOptions: [
        { id: 'low', label: 'Low' },
        { id: 'deep-v2', label: 'deep-v2', description: 'A deeper mode' },
      ],
    });
  });

  it('distinguishes explicit empty options from missing or malformed metadata', () => {
    const models = parseCodexDebugModels(JSON.stringify({ models: [
      { slug: 'legacy' },
      { slug: 'broken', supported_reasoning_levels: [null, {}], default_reasoning_level: 'oops' },
      { slug: 'empty', supported_reasoning_levels: [] },
    ] }));
    expect(models?.[1]).toEqual({ id: 'legacy', label: 'legacy' });
    expect(models?.[2]).toEqual({ id: 'broken', label: 'broken' });
    expect(models?.[3]).toEqual({ id: 'empty', label: 'empty', reasoningOptions: [] });
  });

  it('forwards future reasoning and defensively clamps stale GPT-5.6 minimal', () => {
    for (const model of ['gpt-5.6-sol', 'gpt-6-astra']) {
      for (const reasoning of ['xhigh', 'max', 'ultra', 'deep-v2']) {
        expect(codexAgentDef.buildArgs('', [], [], { model, reasoning }))
          .toContain(`model_reasoning_effort="${reasoning}"`);
      }
    }
    expect(codexAgentDef.buildArgs('', [], [], { model: 'gpt-5.6-sol', reasoning: 'minimal' }))
      .toContain('model_reasoning_effort="low"');
    expect(codexAgentDef.buildArgs('', [], [], { model: 'gpt-6-astra', reasoning: 'default' })
      .some((arg) => arg.startsWith('model_reasoning_effort='))).toBe(false);
  });
});
