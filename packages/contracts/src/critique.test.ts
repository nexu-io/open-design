import { describe, expect, it } from 'vitest';
import {
  CritiqueConfigSchema,
  PANELIST_ROLES,
  defaultCritiqueConfig,
} from './critique';

describe('CritiqueConfig', () => {
  it('defaults validate against the schema', () => {
    expect(() => CritiqueConfigSchema.parse(defaultCritiqueConfig())).not.toThrow();
  });

  it('weights default to designer=0, critic=0.4, brand=0.2, a11y=0.2, copy=0.2', () => {
    const cfg = defaultCritiqueConfig();
    expect(cfg.weights.designer).toBe(0);
    expect(cfg.weights.critic).toBe(0.4);
    expect(cfg.weights.brand).toBe(0.2);
    expect(cfg.weights.a11y).toBe(0.2);
    expect(cfg.weights.copy).toBe(0.2);
    const sum = Object.values(cfg.weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('cast lists every panelist role exactly once by default', () => {
    expect(defaultCritiqueConfig().cast.sort()).toEqual([...PANELIST_ROLES].sort());
  });

  it('rejects scoreThreshold outside [0, scoreScale]', () => {
    expect(() => CritiqueConfigSchema.parse({
      ...defaultCritiqueConfig(),
      scoreThreshold: -1,
    })).toThrow();
    expect(() => CritiqueConfigSchema.parse({
      ...defaultCritiqueConfig(),
      scoreThreshold: 11,
    })).toThrow();
  });

  it('rejects fallbackPolicy outside the allowed set', () => {
    expect(() => CritiqueConfigSchema.parse({
      ...defaultCritiqueConfig(),
      fallbackPolicy: 'silent_fail',
    })).toThrow();
  });
});
