import { describe, expect, it } from 'vitest';
import {
  CritiqueConfigSchema,
  PANELIST_ROLES,
  defaultCritiqueConfig,
  isPanelEvent,
  type PanelEvent,
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

describe('PanelEvent', () => {
  it('isPanelEvent recognises every variant', () => {
    const samples: PanelEvent[] = [
      { type: 'run_started', runId: 'r1', protocolVersion: 1, cast: ['designer','critic','brand','a11y','copy'], maxRounds: 3, threshold: 8, scale: 10 },
      { type: 'panelist_open',     runId: 'r1', round: 1, role: 'designer' },
      { type: 'panelist_dim',      runId: 'r1', round: 1, role: 'critic', dimName: 'contrast', dimScore: 4, dimNote: 'fails AA' },
      { type: 'panelist_must_fix', runId: 'r1', round: 1, role: 'a11y',   text: 'restore focus ring' },
      { type: 'panelist_close',    runId: 'r1', round: 1, role: 'critic', score: 6.4 },
      { type: 'round_end',         runId: 'r1', round: 1, composite: 6.18, mustFix: 7, decision: 'continue', reason: 'below threshold' },
      { type: 'ship',              runId: 'r1', round: 3, composite: 8.6, status: 'shipped', artifactRef: { projectId: 'p1', artifactId: 'a1' }, summary: 'shipped after 3 rounds' },
      { type: 'degraded',          runId: 'r1', reason: 'malformed_block', adapter: 'pi-rpc' },
      { type: 'interrupted',       runId: 'r1', bestRound: 2, composite: 7.86 },
      { type: 'failed',            runId: 'r1', cause: 'cli_exit_nonzero' },
      { type: 'parser_warning',    runId: 'r1', kind: 'weak_debate', position: 1024 },
    ];
    for (const s of samples) expect(isPanelEvent(s)).toBe(true);
  });

  it('isPanelEvent rejects non-event objects', () => {
    expect(isPanelEvent({})).toBe(false);
    expect(isPanelEvent({ type: 'unknown', runId: 'r1' })).toBe(false);
    expect(isPanelEvent(null)).toBe(false);
    expect(isPanelEvent(undefined)).toBe(false);
    expect(isPanelEvent('string')).toBe(false);
    expect(isPanelEvent(42)).toBe(false);
    // New: type valid but runId missing -> reject
    expect(isPanelEvent({ type: 'failed' })).toBe(false);
    expect(isPanelEvent({ type: 'failed', runId: '' })).toBe(false);
  });
});
