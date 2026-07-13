import { describe, it, expect } from 'vitest';
import { defaultCritiqueConfig } from '@open-design/contracts/critique';
import { loadCritiqueConfigFromEnv } from '../src/critique/config.js';

describe('loadCritiqueConfigFromEnv', () => {
  it('returns defaults when env is empty', () => {
    const cfg = loadCritiqueConfigFromEnv({});
    const defaults = defaultCritiqueConfig();
    expect(cfg).toEqual(defaults);
  });

  it('OD_CRITIQUE_ENABLED=true enables the feature', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_ENABLED: 'true' });
    expect(cfg.enabled).toBe(true);
  });

  it('OD_CRITIQUE_ENABLED=1 enables the feature', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_ENABLED: '1' });
    expect(cfg.enabled).toBe(true);
  });

  it('OD_CRITIQUE_ENABLED=yes enables the feature', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_ENABLED: 'yes' });
    expect(cfg.enabled).toBe(true);
  });

  it('OD_CRITIQUE_ENABLED=false keeps feature disabled', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_ENABLED: 'false' });
    expect(cfg.enabled).toBe(false);
  });

  it('OD_CRITIQUE_ENABLED=0 keeps feature disabled', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_ENABLED: '0' });
    expect(cfg.enabled).toBe(false);
  });

  it('OD_CRITIQUE_ENABLED=anything-else keeps feature disabled', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_ENABLED: 'enabled' });
    expect(cfg.enabled).toBe(false);
  });

  it('OD_CRITIQUE_MAX_ROUNDS maps correctly', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_MAX_ROUNDS: '5' });
    expect(cfg.maxRounds).toBe(5);
  });

  it('OD_CRITIQUE_SCORE_THRESHOLD maps correctly', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_SCORE_THRESHOLD: '7.5' });
    expect(cfg.scoreThreshold).toBeCloseTo(7.5);
  });

  it('OD_CRITIQUE_SCORE_SCALE maps correctly', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_SCORE_SCALE: '20' });
    expect(cfg.scoreScale).toBe(20);
  });

  it('OD_CRITIQUE_PER_ROUND_TIMEOUT_MS maps correctly', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_PER_ROUND_TIMEOUT_MS: '60000' });
    expect(cfg.perRoundTimeoutMs).toBe(60000);
  });

  it('OD_CRITIQUE_TOTAL_TIMEOUT_MS maps correctly', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_TOTAL_TIMEOUT_MS: '300000' });
    expect(cfg.totalTimeoutMs).toBe(300000);
  });

  it('OD_CRITIQUE_PARSER_MAX_BLOCK_BYTES maps correctly', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_PARSER_MAX_BLOCK_BYTES: '131072' });
    expect(cfg.parserMaxBlockBytes).toBe(131072);
  });

  it('OD_CRITIQUE_FALLBACK_POLICY=ship_last maps correctly', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_FALLBACK_POLICY: 'ship_last' });
    expect(cfg.fallbackPolicy).toBe('ship_last');
  });

  it('OD_CRITIQUE_FALLBACK_POLICY=fail maps correctly', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_FALLBACK_POLICY: 'fail' });
    expect(cfg.fallbackPolicy).toBe('fail');
  });

  it('OD_CRITIQUE_FALLBACK_POLICY=ship_best maps correctly', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_FALLBACK_POLICY: 'ship_best' });
    expect(cfg.fallbackPolicy).toBe('ship_best');
  });

  // Invalid values throw RangeError at boot.
  it('non-numeric OD_CRITIQUE_MAX_ROUNDS throws RangeError', () => {
    expect(() => loadCritiqueConfigFromEnv({ OD_CRITIQUE_MAX_ROUNDS: 'abc' })).toThrow(RangeError);
  });

  it('negative OD_CRITIQUE_MAX_ROUNDS throws RangeError', () => {
    expect(() => loadCritiqueConfigFromEnv({ OD_CRITIQUE_MAX_ROUNDS: '-1' })).toThrow(RangeError);
  });

  it('zero OD_CRITIQUE_MAX_ROUNDS throws RangeError', () => {
    expect(() => loadCritiqueConfigFromEnv({ OD_CRITIQUE_MAX_ROUNDS: '0' })).toThrow(RangeError);
  });

  it('non-numeric OD_CRITIQUE_SCORE_THRESHOLD throws RangeError', () => {
    expect(() => loadCritiqueConfigFromEnv({ OD_CRITIQUE_SCORE_THRESHOLD: 'high' })).toThrow(RangeError);
  });

  it('negative OD_CRITIQUE_SCORE_THRESHOLD throws RangeError', () => {
    expect(() => loadCritiqueConfigFromEnv({ OD_CRITIQUE_SCORE_THRESHOLD: '-1' })).toThrow(RangeError);
  });

  it('non-numeric OD_CRITIQUE_PER_ROUND_TIMEOUT_MS throws RangeError', () => {
    expect(() => loadCritiqueConfigFromEnv({ OD_CRITIQUE_PER_ROUND_TIMEOUT_MS: 'fast' })).toThrow(RangeError);
  });

  it('invalid OD_CRITIQUE_FALLBACK_POLICY throws RangeError', () => {
    expect(() => loadCritiqueConfigFromEnv({ OD_CRITIQUE_FALLBACK_POLICY: 'maybe' })).toThrow(RangeError);
  });

  it('threshold exceeding scale throws RangeError', () => {
    expect(() =>
      loadCritiqueConfigFromEnv({
        OD_CRITIQUE_SCORE_THRESHOLD: '15',
        OD_CRITIQUE_SCORE_SCALE: '10',
      }),
    ).toThrow(RangeError);
  });

  it('valid threshold equal to scale passes', () => {
    const cfg = loadCritiqueConfigFromEnv({
      OD_CRITIQUE_SCORE_THRESHOLD: '10',
      OD_CRITIQUE_SCORE_SCALE: '10',
    });
    expect(cfg.scoreThreshold).toBe(10);
    expect(cfg.scoreScale).toBe(10);
  });

  it('all valid OD_CRITIQUE_* values map correctly together', () => {
    const cfg = loadCritiqueConfigFromEnv({
      OD_CRITIQUE_ENABLED: '1',
      OD_CRITIQUE_MAX_ROUNDS: '4',
      OD_CRITIQUE_SCORE_THRESHOLD: '7',
      OD_CRITIQUE_SCORE_SCALE: '10',
      OD_CRITIQUE_PER_ROUND_TIMEOUT_MS: '45000',
      OD_CRITIQUE_TOTAL_TIMEOUT_MS: '180000',
      OD_CRITIQUE_PARSER_MAX_BLOCK_BYTES: '524288',
      OD_CRITIQUE_FALLBACK_POLICY: 'ship_last',
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.maxRounds).toBe(4);
    expect(cfg.scoreThreshold).toBeCloseTo(7);
    expect(cfg.scoreScale).toBe(10);
    expect(cfg.perRoundTimeoutMs).toBe(45000);
    expect(cfg.totalTimeoutMs).toBe(180000);
    expect(cfg.parserMaxBlockBytes).toBe(524288);
    expect(cfg.fallbackPolicy).toBe('ship_last');
  });
});
