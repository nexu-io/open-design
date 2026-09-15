import { describe, expect, it } from 'vitest';
import { kimiAgentDef } from '../../src/runtimes/defs/kimi.js';

describe('kimiAgentDef.fallbackModels', () => {
  // Released by Moonshot on 2026-06-12 as the coding-focused successor to
  // kimi-k2-turbo-preview. The Kimi CLI ships the new model id from day one,
  // so this list-side fallback exists only to surface the model in the
  // picker when the live model-discovery call returns nothing.
  it('includes kimi-k2.7-code', () => {
    const ids = kimiAgentDef.fallbackModels.map((m) => m.id);
    expect(ids).toContain('kimi-k2.7-code');
  });

  it('places kimi-k2.7-code before the older kimi-k2-turbo-preview', () => {
    const ids = kimiAgentDef.fallbackModels.map((m) => m.id);
    const k27 = ids.indexOf('kimi-k2.7-code');
    const turbo = ids.indexOf('kimi-k2-turbo-preview');
    expect(k27).toBeGreaterThan(-1);
    expect(turbo).toBeGreaterThan(-1);
    expect(k27).toBeLessThan(turbo);
  });

  it('keeps the legacy moonshot-v1-{8k,32k} entries for users on older Kimi CLIs', () => {
    const ids = kimiAgentDef.fallbackModels.map((m) => m.id);
    expect(ids).toContain('moonshot-v1-8k');
    expect(ids).toContain('moonshot-v1-32k');
  });
});
