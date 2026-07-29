import { describe, expect, it } from 'vitest';

import {
  buildOpenCodeByokProviderConfig,
  byokOpenCodeGapErrorCode,
  resolveOpenCodeByokProviderConfig,
} from '../src/runtimes/byok-opencode.js';
import { classifyRunFailure } from '../src/run-failure-classification.js';

/**
 * `agent_config_invalid` is the top engineering failure in the daily report:
 * 703 runs / 277 users in 24h (+140% over baseline), of which 702 are BYOK and
 * 1 is CLI. Nothing tells us WHICH part of the config was rejected.
 *
 * The cause is structural, not missing instrumentation.
 * `buildOpenCodeByokProviderConfig` rejects a config from six separate guards
 * and returns a bare `null` from every one, and the caller
 * (apps/daemon/src/server.ts) then fails the run with a fixed constant string.
 * So the discriminating information is destroyed before anything is recorded —
 * it is absent from `run_finished` AND from Langfuse, because the error text is
 * a constant.
 *
 * These pin that every rejection reason survives as a distinct error code, and
 * that widening the codes does not knock the run out of the
 * `agent_config_invalid` bucket the dashboards already track.
 */
describe('resolveOpenCodeByokProviderConfig', () => {
  const validProvider = {
    protocol: 'openai' as const,
    apiKey: 'sk-test',
    baseUrl: 'https://api.openai.com/v1',
  };

  it('resolves a complete config', () => {
    const r = resolveOpenCodeByokProviderConfig(validProvider, 'gpt-4o');
    expect(r.ok).toBe(true);
  });

  it('names a missing provider', () => {
    expect(resolveOpenCodeByokProviderConfig(null, 'gpt-4o')).toMatchObject({
      ok: false,
      gap: 'provider_missing',
    });
  });

  it('names an unsupported protocol', () => {
    expect(
      resolveOpenCodeByokProviderConfig(
        { ...validProvider, protocol: 'not-a-protocol' as never },
        'gpt-4o',
      ),
    ).toMatchObject({ ok: false, gap: 'protocol_unsupported' });
  });

  it('names a missing API key separately from a missing model', () => {
    expect(
      resolveOpenCodeByokProviderConfig({ ...validProvider, apiKey: '' }, 'gpt-4o'),
    ).toMatchObject({ ok: false, gap: 'api_key_required' });
    expect(resolveOpenCodeByokProviderConfig(validProvider, '')).toMatchObject({
      ok: false,
      gap: 'model_required',
    });
  });

  it('separates the literal "default" model from an absent one', () => {
    // A distinct population: the user never picked a model, rather than having
    // cleared one. They need different UI, so they must be countable apart.
    expect(resolveOpenCodeByokProviderConfig(validProvider, 'default')).toMatchObject({
      ok: false,
      gap: 'model_default',
    });
  });

  it('names a missing base URL (azure has no default to fall back on)', () => {
    expect(
      resolveOpenCodeByokProviderConfig(
        { protocol: 'azure' as const, apiKey: 'k', baseUrl: '' },
        'gpt-4o',
      ),
    ).toMatchObject({ ok: false, gap: 'base_url_required' });
  });

  it('keeps buildOpenCodeByokProviderConfig behaviour identical for callers', () => {
    // The wrapper is what the existing `!== null` call sites use; it must stay
    // a pure projection of the resolver so the two cannot drift.
    expect(buildOpenCodeByokProviderConfig(null, 'gpt-4o')).toBeNull();
    expect(buildOpenCodeByokProviderConfig(validProvider, '')).toBeNull();
    expect(buildOpenCodeByokProviderConfig(validProvider, 'gpt-4o')).not.toBeNull();
  });
});

describe('byokOpenCodeGapErrorCode', () => {
  it('gives every gap its own code', () => {
    const codes = (
      [
        'provider_missing',
        'protocol_unsupported',
        'api_key_required',
        'model_required',
        'model_default',
        'base_url_required',
        'model_id_invalid',
      ] as const
    ).map(byokOpenCodeGapErrorCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('keeps every code inside the agent_config_invalid bucket', () => {
    // Widening the codes must not silently reclassify these runs: the daily
    // report tracks `agent_config_invalid`, and a run that fell out of it would
    // look like the regression had been fixed when it had only been renamed.
    for (const gap of [
      'provider_missing',
      'protocol_unsupported',
      'api_key_required',
      'model_required',
      'model_default',
      'base_url_required',
      'model_id_invalid',
    ] as const) {
      const code = byokOpenCodeGapErrorCode(gap);
      const classified = classifyRunFailure({
        result: 'failed',
        agentId: 'byok-opencode',
        errorCode: code,
        status: { status: 'failed', errorCode: code, error: code },
        events: [],
      });
      expect(classified?.failure_detail, `gap ${gap} (${code})`).toBe('agent_config_invalid');
    }
  });
});
