import { describe, expect, it } from 'vitest';

import {
  scanRunEventsForUsageAnalytics,
  summarizeRunTimingAnalytics,
  summarizeToolAnalytics,
} from '../src/run-analytics-observability.js';

describe('scanRunEventsForUsageAnalytics', () => {
  it('extracts provider usage, cache tokens, and estimated context tokens', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: { type: 'status', label: 'initializing', model: 'claude-opus-4' },
        },
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 1000,
              output_tokens: 50,
              cache_read_input_tokens: 250,
              cache_creation_input_tokens: 100,
            },
          },
        },
      ],
      '',
      40,
    );

    expect(result).toMatchObject({
      input_tokens: 1000,
      input_tokens_provider: 1000,
      input_tokens_effective: 1350,
      output_tokens: 50,
      total_tokens: 1400,
      cache_read_input_tokens: 250,
      cache_creation_input_tokens: 100,
      uncached_input_tokens: 1000,
      estimated_context_tokens: 1310,
      cache_token_source: 'anthropic',
      token_count_source: 'provider_usage',
      agent_reported_model: 'claude-opus-4',
    });
    expect(result.cache_hit_ratio).toBeCloseTo(250 / 1350);
  });

  it('reads OpenAI-style cached prompt token details', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              prompt_tokens: 200,
              completion_tokens: 20,
              prompt_tokens_details: { cached_tokens: 80 },
            },
          },
        },
      ],
      'gpt-4o',
      0,
    );

    expect(result.cache_read_input_tokens).toBe(80);
    expect(result.input_tokens_effective).toBe(200);
    expect(result.uncached_input_tokens).toBe(120);
    expect(result.cache_token_source).toBe('openai');
    expect(result.cache_hit_ratio).toBe(0.4);
  });

  it('does not invent cache split fields when provider usage lacks cache data', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 300,
              output_tokens: 30,
            },
          },
        },
      ],
      '',
      10,
    );

    expect(result).toMatchObject({
      input_tokens_provider: 300,
      input_tokens_effective: 300,
      output_tokens: 30,
      total_tokens: 330,
      estimated_context_tokens: 290,
      cache_token_source: 'unavailable',
    });
    expect(result.cache_read_input_tokens).toBeUndefined();
    expect(result.uncached_input_tokens).toBeUndefined();
    expect(result.cache_hit_ratio).toBeUndefined();
  });

  it('uses provider-qualified model attribution from DeepSeek Harness usage', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            provider: 'deepseek-official',
            model: 'deepseek-v4-flash',
            usage: {
              input_tokens: 300,
              output_tokens: 30,
            },
          },
        },
      ],
      'default',
      10,
    );

    expect(result.agent_reported_model).toBe(
      'deepseek-official/deepseek-v4-flash',
    );
    expect(result.token_count_source).toBe('provider_usage');
  });

  it('treats normalized cached_read_tokens / cached_write_tokens aliases as input subsets', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 400,
              output_tokens: 20,
              cached_read_tokens: 120,
              cached_write_tokens: 30,
            },
          },
        },
      ],
      'gpt-5',
      0,
    );

    expect(result).toMatchObject({
      input_tokens_provider: 400,
      input_tokens_effective: 400,
      output_tokens: 20,
      total_tokens: 420,
      cache_read_input_tokens: 120,
      cache_creation_input_tokens: 30,
      uncached_input_tokens: 280,
      cache_token_source: 'openai',
    });
    expect(result.cache_hit_ratio).toBeCloseTo(120 / 400);
  });

  it('preserves ACP provider totals when cache read tokens are already included in input', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 31_711,
              output_tokens: 30,
              cached_read_tokens: 2_560,
              thought_tokens: 20,
              total_tokens: 31_741,
            },
          },
        },
      ],
      '',
      0,
    );

    expect(result).toMatchObject({
      input_tokens_provider: 31_711,
      input_tokens_effective: 31_711,
      output_tokens: 30,
      total_tokens: 31_741,
      thought_tokens: 20,
      cache_read_input_tokens: 2_560,
      uncached_input_tokens: 29_151,
      cache_token_source: 'openai',
      token_count_source: 'provider_usage',
    });
    expect(result.cache_hit_ratio).toBeCloseTo(2_560 / 31_711);
  });

  it('extracts ACP-shaped usage with thought_tokens + cached_read_tokens as provider_usage', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 12_000,
              output_tokens: 400,
              cached_read_tokens: 8_000,
              thought_tokens: 256,
              total_tokens: 12_656,
            },
          },
        },
      ],
      'amr-model',
      0,
    );

    expect(result).toMatchObject({
      input_tokens: 12_000,
      output_tokens: 400,
      thought_tokens: 256,
      total_tokens: 12_656,
      cache_read_input_tokens: 8_000,
      token_count_source: 'provider_usage',
      cache_token_source: 'openai',
    });
  });

  it('marks provider_usage when only thought_tokens are present', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: { thought_tokens: 42 },
          },
        },
      ],
      '',
      0,
    );
    expect(result.thought_tokens).toBe(42);
    expect(result.token_count_source).toBe('provider_usage');
  });

  it('merges a later thought-only usage frame with earlier complete input/output', () => {
    // ACP runtimes can emit a complete usage frame, then a trailing partial
    // frame with only thought_tokens (or cache counters). Reverse-scan must
    // keep the complete fields and layer the later thought tokens on top.
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 12_000,
              output_tokens: 400,
              total_tokens: 12_400,
            },
          },
        },
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: { thought_tokens: 256 },
          },
        },
      ],
      'amr-model',
      0,
    );

    expect(result).toMatchObject({
      input_tokens: 12_000,
      output_tokens: 400,
      total_tokens: 12_400,
      thought_tokens: 256,
      token_count_source: 'provider_usage',
    });
  });

  it('merges a later cache-only usage frame without dropping earlier input/output', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 1000,
              output_tokens: 50,
            },
          },
        },
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              cache_read_input_tokens: 250,
              cache_creation_input_tokens: 100,
            },
          },
        },
      ],
      '',
      0,
    );

    expect(result).toMatchObject({
      input_tokens: 1000,
      output_tokens: 50,
      cache_read_input_tokens: 250,
      cache_creation_input_tokens: 100,
      cache_token_source: 'anthropic',
      token_count_source: 'provider_usage',
    });
  });

  it('merges earlier cache counters when a later frame already has input and output', () => {
    // Inverse of the trailing cache-only case: providers may emit cache on an
    // earlier frame and a complete input/output pair later. Reverse-scan must
    // keep walking after primary is filled so cache_read/cache_creation still merge.
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              cache_read_input_tokens: 250,
              cache_creation_input_tokens: 100,
            },
          },
        },
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 1000,
              output_tokens: 50,
              total_tokens: 1050,
            },
          },
        },
      ],
      '',
      0,
    );

    expect(result).toMatchObject({
      input_tokens: 1000,
      output_tokens: 50,
      total_tokens: 1050,
      cache_read_input_tokens: 250,
      cache_creation_input_tokens: 100,
      cache_token_source: 'anthropic',
      token_count_source: 'provider_usage',
    });
  });

  it('merges a later output-only usage frame with earlier input and cache fields', () => {
    // A trailing frame with only output_tokens must not freeze the reverse
    // scan: earlier input/cache counters still need to merge into run_finished.
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 8_000,
              cache_read_input_tokens: 2_000,
              cache_creation_input_tokens: 500,
            },
          },
        },
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: { output_tokens: 120 },
          },
        },
      ],
      'amr-model',
      0,
    );

    expect(result).toMatchObject({
      input_tokens: 8_000,
      output_tokens: 120,
      cache_read_input_tokens: 2_000,
      cache_creation_input_tokens: 500,
      cache_token_source: 'anthropic',
      token_count_source: 'provider_usage',
    });
  });

  it('merges a later input-only usage frame with earlier output tokens', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: { output_tokens: 90, total_tokens: 4_090 },
          },
        },
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: { input_tokens: 4_000 },
          },
        },
      ],
      '',
      0,
    );

    expect(result).toMatchObject({
      input_tokens: 4_000,
      output_tokens: 90,
      total_tokens: 4_090,
      token_count_source: 'provider_usage',
    });
  });

  it('normalizes additive Responses-API / ACP usage where cache_read exceeds input_tokens', () => {
    // Real AMR/vela follow-up shape: the stream reports input_tokens as the
    // UNCACHED remainder with cached_input_tokens reported separately ON TOP, so
    // cache_read > input. Treating it as inclusive (cache_read ⊆ input) made the
    // denominator far too small and produced cache_hit_ratio ≫ 1 (the corrupt
    // ~78% of AMR follow-up runs). It must resolve to a sane <=1 ratio with the
    // cache-read folded into the effective input.
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 140_187,
              output_tokens: 64,
              cached_input_tokens: 659_456,
            },
          },
        },
      ],
      '',
      0,
    );

    expect(result).toMatchObject({
      input_tokens_provider: 140_187,
      input_tokens_effective: 799_643,
      cache_read_input_tokens: 659_456,
      uncached_input_tokens: 140_187,
      cache_token_source: 'openai',
    });
    expect(result.cache_hit_ratio).toBeCloseTo(659_456 / 799_643);
    expect(result.cache_hit_ratio).toBeLessThanOrEqual(1);
    // The first model call of the turn shares the same denominator definition,
    // so first_call_cache_hit_ratio must be repaired in lockstep.
    expect(result.first_call_input_tokens).toBe(140_187);
    expect(result.first_call_cache_read_input_tokens).toBe(659_456);
    expect(result.first_call_cache_hit_ratio).toBeCloseTo(659_456 / 799_643);
    expect(result.first_call_cache_hit_ratio).toBeLessThanOrEqual(1);
  });

  it('keeps inclusive OpenAI usage (cache_read <= input) byte-identical after the additive fix', () => {
    // Guards the discriminator: an inclusive payload (cached ⊆ input) must stay
    // on the input-as-total path — effective = input, uncached = input - read —
    // exactly as before, so the additive repair cannot regress codex/openai.
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 1_000,
              output_tokens: 20,
              cached_input_tokens: 250,
            },
          },
        },
      ],
      '',
      0,
    );

    expect(result).toMatchObject({
      input_tokens_provider: 1_000,
      input_tokens_effective: 1_000,
      cache_read_input_tokens: 250,
      uncached_input_tokens: 750,
      cache_token_source: 'openai',
    });
    expect(result.cache_hit_ratio).toBeCloseTo(250 / 1_000);
    expect(result.first_call_cache_hit_ratio).toBeCloseTo(250 / 1_000);
  });

  it.each([
    {
      name: 'claude anthropic usage',
      usage: {
        input_tokens: 100,
        output_tokens: 10,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 5,
      },
      expected: {
        input_tokens_provider: 100,
        input_tokens_effective: 125,
        output_tokens: 10,
        total_tokens: 135,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 5,
        cache_token_source: 'anthropic',
        token_count_source: 'provider_usage',
      },
    },
    {
      name: 'codex cached input usage',
      usage: {
        input_tokens: 200,
        output_tokens: 11,
        cached_input_tokens: 40,
      },
      expected: {
        input_tokens_provider: 200,
        input_tokens_effective: 200,
        output_tokens: 11,
        total_tokens: 211,
        cache_read_input_tokens: 40,
        uncached_input_tokens: 160,
        cache_token_source: 'openai',
        token_count_source: 'provider_usage',
      },
    },
    {
      name: 'opencode normalized cache usage',
      usage: {
        input_tokens: 300,
        output_tokens: 12,
        cached_read_tokens: 60,
        cached_write_tokens: 7,
      },
      expected: {
        input_tokens_provider: 300,
        input_tokens_effective: 300,
        output_tokens: 12,
        total_tokens: 312,
        cache_read_input_tokens: 60,
        cache_creation_input_tokens: 7,
        uncached_input_tokens: 240,
        cache_token_source: 'openai',
        token_count_source: 'provider_usage',
      },
    },
    {
      name: 'gemini cached usage',
      usage: {
        input_tokens: 400,
        output_tokens: 13,
        cached_read_tokens: 80,
      },
      expected: {
        input_tokens_provider: 400,
        input_tokens_effective: 400,
        output_tokens: 13,
        total_tokens: 413,
        cache_read_input_tokens: 80,
        uncached_input_tokens: 320,
        cache_token_source: 'openai',
        token_count_source: 'provider_usage',
      },
    },
    {
      name: 'cursor cache usage',
      usage: {
        input_tokens: 500,
        output_tokens: 14,
        cached_read_tokens: 90,
        cached_write_tokens: 8,
      },
      expected: {
        input_tokens_provider: 500,
        input_tokens_effective: 500,
        output_tokens: 14,
        total_tokens: 514,
        cache_read_input_tokens: 90,
        cache_creation_input_tokens: 8,
        uncached_input_tokens: 410,
        cache_token_source: 'openai',
        token_count_source: 'provider_usage',
      },
    },
    {
      name: 'acp hermes cache usage',
      usage: {
        input_tokens: 600,
        output_tokens: 15,
        cached_read_tokens: 120,
        total_tokens: 615,
      },
      expected: {
        input_tokens_provider: 600,
        input_tokens_effective: 600,
        output_tokens: 15,
        total_tokens: 615,
        cache_read_input_tokens: 120,
        uncached_input_tokens: 480,
        cache_token_source: 'openai',
        token_count_source: 'provider_usage',
      },
    },
    {
      name: 'amr vela usage without cache',
      usage: {
        input_tokens: 12,
        output_tokens: 7,
        total_tokens: 19,
      },
      expected: {
        input_tokens_provider: 12,
        input_tokens_effective: 12,
        output_tokens: 7,
        total_tokens: 19,
        cache_token_source: 'unavailable',
        input_accounting_mode: 'unknown',
        token_count_source: 'provider_usage',
      },
    },
    {
      name: 'pi rpc usage with cache and provider total',
      usage: {
        input_tokens: 700,
        output_tokens: 16,
        cached_read_tokens: 140,
        cached_write_tokens: 9,
        total_tokens: 716,
      },
      expected: {
        input_tokens_provider: 700,
        input_tokens_effective: 700,
        output_tokens: 16,
        total_tokens: 716,
        cache_read_input_tokens: 140,
        cache_creation_input_tokens: 9,
        uncached_input_tokens: 560,
        cache_token_source: 'openai',
        token_count_source: 'provider_usage',
      },
    },
    {
      name: 'qoder usage without cache',
      usage: {
        input_tokens: 800,
        output_tokens: 17,
      },
      expected: {
        input_tokens_provider: 800,
        input_tokens_effective: 800,
        output_tokens: 17,
        total_tokens: 817,
        cache_token_source: 'unavailable',
        token_count_source: 'provider_usage',
      },
    },
    {
      name: 'copilot result usage',
      usage: {
        input_tokens: 900,
        output_tokens: 18,
      },
      expected: {
        input_tokens_provider: 900,
        input_tokens_effective: 900,
        output_tokens: 18,
        total_tokens: 918,
        cache_token_source: 'unavailable',
        token_count_source: 'provider_usage',
      },
    },
  ])('normalizes $name for run_finished token analytics', ({ usage, expected }) => {
    const result = scanRunEventsForUsageAnalytics(
      [{ event: 'agent', data: { type: 'usage', usage } }],
      '',
      0,
    );

    expect(result).toMatchObject(expected);
  });

  it('prefers the latest usage event and latest reported model when multiple usage snapshots exist', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'status',
            label: 'initializing',
            model: 'claude-sonnet-4-5',
          },
        },
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 120,
              output_tokens: 12,
              cached_read_tokens: 20,
            },
          },
        },
        {
          event: 'agent',
          data: {
            type: 'status',
            label: 'model',
            detail: 'claude-opus-4-1',
          },
        },
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 240,
              output_tokens: 24,
              cached_read_tokens: 60,
              cached_write_tokens: 5,
            },
          },
        },
      ],
      '',
      20,
    );

    expect(result).toMatchObject({
      input_tokens_provider: 240,
      input_tokens_effective: 240,
      output_tokens: 24,
      total_tokens: 264,
      cache_read_input_tokens: 60,
      cache_creation_input_tokens: 5,
      uncached_input_tokens: 180,
      estimated_context_tokens: 220,
      cache_token_source: 'openai',
      input_accounting_mode: 'inclusive',
      token_count_source: 'provider_usage',
      agent_reported_model: 'claude-opus-4-1',
    });
    expect(result.cache_hit_ratio).toBeCloseTo(60 / 240);
    // The reverse scan above takes the LAST usage event (240 / cache_read 60).
    // The forward first-call scan must instead surface the turn's OPENING call
    // (120 / cache_read 20) — the session-reuse signal that the within-turn
    // aggregate masks.
    expect(result.first_call_input_tokens).toBe(120);
    expect(result.first_call_cache_read_input_tokens).toBe(20);
    expect(result.first_call_cache_hit_ratio).toBeCloseTo(20 / 120);
  });

  it('reports the anthropic first-call cache hit independently of later within-turn calls', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        // Opening call of a resumed turn: tiny uncached delta over a fully
        // cached prefix — the cache-hit signal session reuse produces.
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 100,
              output_tokens: 10,
              cache_read_input_tokens: 8_000,
              cache_creation_input_tokens: 0,
            },
          },
        },
        // A later within-turn call grows the prefix; the reverse scan lands here.
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 300,
              output_tokens: 30,
              cache_read_input_tokens: 8_400,
              cache_creation_input_tokens: 200,
            },
          },
        },
      ],
      '',
      0,
    );

    // Anthropic input_tokens is the UNCACHED portion, so effective = input + cache_read.
    expect(result.first_call_input_tokens).toBe(100);
    expect(result.first_call_cache_read_input_tokens).toBe(8_000);
    expect(result.first_call_cache_hit_ratio).toBeCloseTo(8_000 / 8_100);
    // Last-call aggregate stays distinct from the first-call signal.
    expect(result.cache_read_input_tokens).toBe(8_400);
  });

  it('includes anthropic cache_creation in the first-call denominator (matches last-call)', () => {
    // A cold opening call writes a large cache (cache_creation) while reading
    // little. The first-call denominator must be input + cache_read +
    // cache_creation — identical to the last-call definition — so the two
    // ratios are comparable. A single usage event makes first == last.
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 1_000,
              output_tokens: 20,
              cache_read_input_tokens: 500,
              cache_creation_input_tokens: 8_500,
            },
          },
        },
      ],
      '',
      0,
    );

    // denominator = 1000 + 500 + 8500 = 10000, not 1500.
    expect(result.first_call_input_tokens).toBe(1_000);
    expect(result.first_call_cache_read_input_tokens).toBe(500);
    expect(result.first_call_cache_hit_ratio).toBeCloseTo(500 / 10_000);
    expect(result.first_call_cache_hit_ratio).toBeCloseTo(result.cache_hit_ratio ?? 0);
  });

  it('honors the full cache-creation alias matrix on the first call (nested cache_creation)', () => {
    // A provider that emits cache creation only via the nested
    // `cache_creation.input_tokens` alias (not the flat key) must still land in
    // the first-call denominator — otherwise it overstates the cache hit. This
    // locks the first-call extraction to the same alias matrix the last-call
    // path already supports.
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 1_000,
              output_tokens: 20,
              cache_read_input_tokens: 500,
              cache_creation: { input_tokens: 8_500 },
            },
          },
        },
      ],
      '',
      0,
    );

    expect(result.first_call_cache_hit_ratio).toBeCloseTo(500 / 10_000);
    // Locked to the last-call definition, which also reads the nested alias.
    expect(result.first_call_cache_hit_ratio).toBeCloseTo(result.cache_hit_ratio ?? 0);
  });

  it('mirrors first-call onto last-call for a single-call turn', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 500,
              output_tokens: 50,
              cache_read_input_tokens: 100,
            },
          },
        },
      ],
      '',
      0,
    );

    expect(result.first_call_input_tokens).toBe(500);
    expect(result.first_call_cache_read_input_tokens).toBe(100);
    expect(result.first_call_cache_hit_ratio).toBeCloseTo(result.cache_hit_ratio ?? 0);
  });

  it('falls back to modelUsage and totalTokens aliases when usage is nested under modelUsage', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            modelUsage: {
              prompt_tokens: 150,
              completion_tokens: 30,
              totalTokens: 180,
              prompt_tokens_details: { cached_tokens: 50 },
            },
          },
        },
      ],
      'gpt-5.5',
      25,
    );

    expect(result).toMatchObject({
      input_tokens_provider: 150,
      input_tokens_effective: 150,
      output_tokens: 30,
      total_tokens: 180,
      cache_read_input_tokens: 50,
      uncached_input_tokens: 100,
      estimated_context_tokens: 125,
      cache_token_source: 'openai',
      token_count_source: 'provider_usage',
      agent_reported_model: null,
    });
    expect(result.cache_hit_ratio).toBeCloseTo(50 / 150);
  });


  it('prefers canonical token fields over alias fields instead of double-counting conflicting values', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 220,
              prompt_tokens: 999,
              output_tokens: 22,
              completion_tokens: 777,
              total_tokens: 242,
              totalTokens: 1_776,
              cached_read_tokens: 20,
            },
          },
        },
      ],
      'gpt-5.5',
      20,
    );

    expect(result).toMatchObject({
      input_tokens_provider: 220,
      input_tokens_effective: 220,
      output_tokens: 22,
      total_tokens: 242,
      cache_read_input_tokens: 20,
      uncached_input_tokens: 200,
      estimated_context_tokens: 200,
      cache_token_source: 'openai',
      token_count_source: 'provider_usage',
    });
    expect(result.cache_hit_ratio).toBeCloseTo(20 / 220);
  });

  it('falls back to totalTokens-only payloads without fabricating input/output splits', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              totalTokens: 345,
            },
          },
        },
      ],
      'gpt-4.1',
      0,
    );

    expect(result).toEqual({
      total_tokens: 345,
      cache_token_source: 'unavailable',
      input_accounting_mode: 'unknown',
      // Any real provider token field (including total-only) is provider_usage.
      token_count_source: 'provider_usage',
      agent_reported_model: null,
    });
  });

  it('keeps anthropic cache write tokens additive while leaving uncached_input_tokens on provider input', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              input_tokens: 500,
              output_tokens: 40,
              cache_read_input_tokens: 120,
              cache_creation_input_tokens: 30,
            },
          },
        },
      ],
      'claude-opus-4-1',
      50,
    );

    expect(result).toMatchObject({
      input_tokens_provider: 500,
      input_tokens_effective: 650,
      output_tokens: 40,
      total_tokens: 690,
      cache_read_input_tokens: 120,
      cache_creation_input_tokens: 30,
      uncached_input_tokens: 500,
      estimated_context_tokens: 600,
      cache_token_source: 'anthropic',
      token_count_source: 'provider_usage',
    });
    expect(result.cache_hit_ratio).toBeCloseTo(120 / 650);
  });

  it('marks provider_usage when only cache-adjacent aliases exist without concrete input totals', () => {
    const result = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: {
              cached_read_tokens: 33,
              cached_write_tokens: 7,
            },
          },
        },
      ],
      '',
      0,
    );

    expect(result).toEqual({
      cache_read_input_tokens: 33,
      cache_creation_input_tokens: 7,
      cache_token_source: 'openai',
      input_accounting_mode: 'unknown',
      token_count_source: 'provider_usage',
      agent_reported_model: null,
    });
  });

  it('reports unknown token source for plain mock agents without usage events', () => {
    const result = scanRunEventsForUsageAnalytics(
      [{ event: 'agent', data: { type: 'text_delta', delta: 'plain output' } }],
      '',
      0,
    );

    expect(result).toEqual({
      cache_token_source: 'unavailable',
      input_accounting_mode: 'unknown',
      token_count_source: 'unknown',
      agent_reported_model: null,
    });
  });
});

describe('summarizeRunTimingAnalytics', () => {
  it('summarizes main run-path timings and aggregate tool duration', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 8_000,
      analyticsCapturedAt: 8_020,
      telemetry: {
        startRequestedAt: 1_100,
        startChatRunStartedAt: 1_200,
        promptBuildStartAt: 1_220,
        promptBuildEndAt: 1_300,
        launchPreflightStartAt: 1_300,
        launchPreflightEndAt: 1_650,
        processSpawnStartedAt: 1_700,
        processSpawnedAt: 1_760,
        modelCallStartAt: 1_800,
        stdinWriteStartAt: 1_810,
        stdinWriteEndAt: 1_850,
        firstModelEventAt: 2_000,
        firstModelEventType: 'text_delta',
        firstTokenAt: 2_500,
        firstVisibleOutputAt: 2_500,
        firstArtifactWriteAt: 4_250,
        attemptIndex: 1,
        attemptStartedAt: 1_200,
      },
      events: [
        {
          id: 1,
          event: 'agent',
          timestamp: 3_000,
          data: { type: 'tool_use', id: 'tool-1', name: 'Read' },
        },
        {
          id: 2,
          event: 'agent',
          timestamp: 3_400,
          data: { type: 'tool_result', toolUseId: 'tool-1' },
        },
        {
          id: 3,
          event: 'agent',
          timestamp: 4_000,
          data: { type: 'tool_use', id: 'tool-2', name: 'Write' },
        },
        {
          id: 4,
          event: 'agent',
          timestamp: 4_250,
          data: { type: 'tool_result', toolUseId: 'tool-2' },
        },
      ],
    });

    expect(result).toEqual({
      queue_duration_ms: 200,
      pre_spawn_duration_ms: 500,
      prompt_build_duration_ms: 80,
      launch_preflight_duration_ms: 350,
      process_spawn_duration_ms: 60,
      stdin_write_duration_ms: 40,
      time_to_first_model_event_ms: 800,
      first_model_event_type: 'text_delta',
      time_to_first_token_ms: 1300,
      time_to_first_visible_output_ms: 1300,
      runtime_init_to_first_token_ms: 650,
      runtime_init_to_first_model_response_ms: 150,
      spawn_to_first_token_ms: 740,
      time_to_first_artifact_ms: 3050,
      // No subsegment markers were observed, so the whole spawn->first-token
      // span is unattributed and falls into the remainder.
      spawn_to_first_token_remainder_ms: 740,
      generation_duration_ms: 5500,
      model_active_duration_ms: 6000,
      tool_call_count: 2,
      tool_duration_ms: 650,
      artifact_write_duration_ms: 250,
      artifact_write_status: 'completed',
      artifact_write_source: 'write_tool',
      finalize_duration_ms: 20,
      total_duration_ms: 7020,
      bottleneck_phase: 'stream_output',
      phase_schema_version: 2,
      last_observed_phase: 'artifact_write',
      phase_timing_status: 'complete',
      attempt_index: 1,
      attempt_duration_ms: 6800,
      attempt_time_to_first_token_ms: 1300,
      attempt_terminal_phase: 'artifact_write',
    });
  });

  it('splits spawn->first-token into subsegments that sum back exactly', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 8_000,
      analyticsCapturedAt: 8_020,
      telemetry: {
        startChatRunStartedAt: 1_200,
        processSpawnStartedAt: 1_700,
        processSpawnedAt: 1_760,
        // 1760 -> 1900 cli-ready, 1900 -> 2100 session-init, 2100 -> 2500 model.
        cliReadyAt: 1_900,
        sessionInitDoneAt: 2_100,
        firstTokenAt: 2_500,
      },
      events: [],
    });

    expect(result.spawn_to_first_token_ms).toBe(740);
    expect(result.cli_ready_ms).toBe(140);
    expect(result.session_init_ms).toBe(200);
    expect(result.model_first_token_ms).toBe(400);
    expect(result.spawn_to_first_token_remainder_ms).toBe(0);
    // The auditable invariant: the four parts reconstruct the parent span.
    expect(
      (result.cli_ready_ms ?? 0) +
        (result.session_init_ms ?? 0) +
        (result.model_first_token_ms ?? 0) +
        (result.spawn_to_first_token_remainder_ms ?? 0),
    ).toBe(result.spawn_to_first_token_ms);
  });

  it('folds an unobservable session-init boundary into the remainder', () => {
    // Stream/plain families stamp cliReadyAt but never sessionInitDoneAt, so
    // session_init/model_first_token stay undefined and their time rolls into
    // the remainder while the sum invariant still holds.
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 8_000,
      analyticsCapturedAt: 8_020,
      telemetry: {
        startChatRunStartedAt: 1_200,
        processSpawnedAt: 1_760,
        cliReadyAt: 1_900,
        firstTokenAt: 2_500,
      },
      events: [],
    });

    expect(result.spawn_to_first_token_ms).toBe(740);
    expect(result.cli_ready_ms).toBe(140);
    expect(result.session_init_ms).toBeUndefined();
    expect(result.model_first_token_ms).toBeUndefined();
    expect(result.spawn_to_first_token_remainder_ms).toBe(600);
    expect(
      (result.cli_ready_ms ?? 0) +
        (result.session_init_ms ?? 0) +
        (result.model_first_token_ms ?? 0) +
        (result.spawn_to_first_token_remainder_ms ?? 0),
    ).toBe(result.spawn_to_first_token_ms);
  });

  it('drops negative timing segments and ignores orphan tool results', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 5_000,
      runUpdatedAt: 7_500,
      analyticsCapturedAt: 7_450,
      telemetry: {
        startRequestedAt: 4_900,
        startChatRunStartedAt: 5_100,
        processSpawnStartedAt: 5_080,
        processSpawnedAt: 5_070,
        firstTokenAt: 5_060,
      },
      events: [
        {
          id: 1,
          event: 'agent',
          timestamp: 6_000,
          data: { type: 'tool_result', toolUseId: 'orphan-tool' },
        },
      ],
    });

    expect(result).toEqual({
      queue_duration_ms: 100,
      generation_duration_ms: 2440,
      model_active_duration_ms: 2440,
      tool_call_count: 0,
      artifact_write_status: 'none',
      total_duration_ms: 2450,
      first_model_event_type: 'text_delta',
      bottleneck_phase: 'stream_output',
      phase_schema_version: 2,
      last_observed_phase: 'stream_output',
      phase_timing_status: 'partial',
      attempt_duration_ms: 2400,
      attempt_terminal_phase: 'stream_output',
    });
    expect(result.pre_spawn_duration_ms).toBeUndefined();
    expect(result.process_spawn_duration_ms).toBeUndefined();
    expect(result.time_to_first_token_ms).toBeUndefined();
    expect(result.spawn_to_first_token_ms).toBeUndefined();
    expect(result.tool_duration_ms).toBeUndefined();
    expect(result.finalize_duration_ms).toBeUndefined();
  });

  it('records first model event for tool-first runs without inventing first-token timing', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 3_000,
      analyticsCapturedAt: 3_010,
      telemetry: {
        startChatRunStartedAt: 1_100,
        processSpawnStartedAt: 1_200,
        processSpawnedAt: 1_250,
        stdinWriteEndAt: 1_300,
      },
      events: [
        {
          id: 1,
          event: 'agent',
          timestamp: 1_700,
          data: { type: 'tool_use', id: 'tool-1', name: 'Read' },
        },
      ],
    });

    expect(result.time_to_first_model_event_ms).toBe(600);
    expect(result.first_model_event_type).toBe('tool_use');
    expect(result.time_to_first_token_ms).toBeUndefined();
    expect(result.last_observed_phase).toBe('tool_execution');
    expect(result.attempt_terminal_phase).toBe('tool_execution');
  });

  it('counts unique tool_use ids for tool_call_count (duplicate ids do not inflate)', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 5_000,
      analyticsCapturedAt: 5_010,
      telemetry: {
        startChatRunStartedAt: 1_100,
      },
      events: [
        {
          id: 1,
          event: 'agent',
          timestamp: 2_000,
          data: { type: 'tool_use', id: 'dup-1', name: 'Read' },
        },
        {
          id: 2,
          event: 'agent',
          timestamp: 2_100,
          data: {
            type: 'tool_use',
            id: 'dup-1',
            name: 'Read',
            input: { file_path: 'late.html' },
          },
        },
        {
          id: 3,
          event: 'agent',
          timestamp: 2_500,
          data: { type: 'tool_result', toolUseId: 'dup-1' },
        },
        {
          id: 4,
          event: 'agent',
          timestamp: 3_000,
          data: { type: 'tool_use', id: 'other', name: 'Bash' },
        },
        {
          id: 5,
          event: 'agent',
          timestamp: 3_200,
          data: { type: 'tool_result', toolUseId: 'other' },
        },
      ],
    });

    expect(result.tool_call_count).toBe(2);
    // Duration pairs from first tool_use timestamp, not the duplicate.
    expect(result.tool_duration_ms).toBe(500 + 200);
  });

  it('prefers tool_use.startedAt over event timestamp for tool duration', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 10_000,
      analyticsCapturedAt: 10_010,
      telemetry: {
        startChatRunStartedAt: 1_100,
      },
      events: [
        {
          id: 1,
          event: 'agent',
          // Event log time is late (terminal emit); startedAt is first frame.
          timestamp: 5_000,
          data: {
            type: 'tool_use',
            id: 'acp-1',
            name: 'Bash',
            startedAt: 2_000,
          },
        },
        {
          id: 2,
          event: 'agent',
          timestamp: 5_500,
          data: { type: 'tool_result', toolUseId: 'acp-1' },
        },
      ],
    });

    expect(result.tool_call_count).toBe(1);
    // 5500 (result) - 2000 (startedAt) = 3500, not 5500 - 5000 = 500.
    expect(result.tool_duration_ms).toBe(3_500);
  });
});

describe('summarizeToolAnalytics', () => {
  it('counts unique canonical families and unique tool_result errors', () => {
    const result = summarizeToolAnalytics([
      {
        event: 'agent',
        data: { type: 'tool_use', id: 't1', name: 'Read' },
      },
      {
        event: 'agent',
        data: { type: 'tool_result', toolUseId: 't1', isError: false },
      },
      {
        event: 'agent',
        data: { type: 'tool_use', id: 't2', name: 'Bash' },
      },
      {
        event: 'agent',
        data: { type: 'tool_result', toolUseId: 't2', isError: true },
      },
      {
        event: 'agent',
        data: { type: 'tool_use', id: 't3', name: 'Read' },
      },
      {
        event: 'agent',
        data: { type: 'tool_result', toolUseId: 't3', isError: true },
      },
      // Duplicate tool_use id must not inflate unique names.
      {
        event: 'agent',
        data: { type: 'tool_use', id: 't1', name: 'Read' },
      },
      // Duplicate error result frames for the same toolUseId must not inflate.
      {
        event: 'agent',
        data: { type: 'tool_result', toolUseId: 't2', isError: true },
      },
    ]);

    expect(result.tool_error_count).toBe(2);
    expect(result.tool_name_count).toBe(2);
    // Allowlist order: Read before Bash.
    expect(result.tool_names).toEqual(['Read', 'Bash']);
    expect(result.tool_names_csv).toBe('Read,Bash');
  });

  it('canonicalizes arbitrary ACP names and never ships raw free-text', () => {
    const result = summarizeToolAnalytics([
      {
        event: 'agent',
        data: { type: 'tool_use', id: 'a', name: 'MultiEdit' },
      },
      {
        event: 'agent',
        data: { type: 'tool_use', id: 'b', name: 'web_fetch' },
      },
      {
        event: 'agent',
        data: { type: 'tool_use', id: 'c', name: 'Glob' },
      },
      {
        event: 'agent',
        data: { type: 'tool_use', id: 'd', name: 'mcp__custom__do_thing' },
      },
      {
        event: 'agent',
        data: { type: 'tool_use', id: 'e', name: '/Users/secret/path.ts' },
      },
      {
        event: 'agent',
        data: { type: 'tool_use', id: 'f', name: 'https://evil.example/x' },
      },
      {
        event: 'agent',
        data: { type: 'tool_use', id: 'g', name: 'read' },
      },
    ]);

    // MultiEdit→Edit, web_fetch→Fetch, Glob→Search, mcp/path/url → other,
    // read→Read. Allowlist order; other last.
    expect(result.tool_names).toEqual(['Edit', 'Read', 'Search', 'Fetch', 'other']);
    expect(result.tool_name_count).toBe(5);
    expect(result.tool_names_csv).toBe('Edit,Read,Search,Fetch,other');
    expect(result.tool_names.every((n) => !n.includes('/') && !n.includes('://'))).toBe(
      true,
    );
  });

  it('maps unknown raw names to other (bounded family set, not 25 raw names)', () => {
    const events = Array.from({ length: 30 }, (_, i) => ({
      event: 'agent' as const,
      data: { type: 'tool_use', id: `id-${i}`, name: `Tool${i}` },
    }));
    const result = summarizeToolAnalytics(events);
    // All ToolN collapse to `other` (not the Tool family — ToolN ≠ Tool).
    expect(result.tool_name_count).toBe(1);
    expect(result.tool_names).toEqual(['other']);
    expect(result.tool_names_csv).toBe('other');
  });

  it('aliases case-insensitive known families including Tool', () => {
    const result = summarizeToolAnalytics([
      { event: 'agent', data: { type: 'tool_use', id: '1', name: 'WRITE' } },
      { event: 'agent', data: { type: 'tool_use', id: '2', name: 'tool' } },
      { event: 'agent', data: { type: 'tool_use', id: '3', name: 'Shell' } },
      { event: 'agent', data: { type: 'tool_use', id: '4', name: 'WebFetch' } },
    ]);
    expect(result.tool_names).toEqual(['Write', 'Bash', 'Fetch', 'Tool']);
    expect(result.tool_name_count).toBe(4);
  });
});

describe('summarizeRunTimingAnalytics phase anchoring', () => {
  // A tool-first run: the model starts working at 4s (a tool_use) but stays
  // silent until 24s, then emits one short closing sentence before the run
  // ends at 25s. This is the dominant shape for OpenCode/OpenAI runs.
  //
  // Phase boundaries must follow when the model STARTED RESPONDING, not when
  // it first emitted text. Anchoring phases on `firstTokenAt` charges the
  // whole 20s tool loop to `runtime_init` and leaves the generation phase
  // holding only the closing sentence.
  const toolFirstRun = {
    runCreatedAt: 1_000,
    runUpdatedAt: 25_000,
    analyticsCapturedAt: 25_200,
    telemetry: {
      startRequestedAt: 1_100,
      startChatRunStartedAt: 2_000,
      processSpawnStartedAt: 2_500,
      processSpawnedAt: 3_000,
      modelCallStartAt: 3_100,
      stdinWriteStartAt: 3_100,
      stdinWriteEndAt: 3_200,
      firstModelEventAt: 4_000,
      firstModelEventType: 'tool_use' as const,
      firstTokenAt: 24_000,
      firstVisibleOutputAt: 24_000,
      attemptIndex: 1,
      attemptStartedAt: 2_000,
    },
    events: [
      { id: 1, event: 'agent', timestamp: 4_000, data: { type: 'tool_use', id: 't1', name: 'Read' } },
      { id: 2, event: 'agent', timestamp: 9_000, data: { type: 'tool_result', toolUseId: 't1' } },
      { id: 3, event: 'agent', timestamp: 10_000, data: { type: 'tool_use', id: 't2', name: 'Bash' } },
      { id: 4, event: 'agent', timestamp: 16_000, data: { type: 'tool_result', toolUseId: 't2' } },
      { id: 5, event: 'agent', timestamp: 17_000, data: { type: 'tool_use', id: 't3', name: 'Write' } },
      { id: 6, event: 'agent', timestamp: 22_000, data: { type: 'tool_result', toolUseId: 't3' } },
    ],
  };

  it('measures runtime init up to the first model event, not the first token', () => {
    const result = summarizeRunTimingAnalytics(toolFirstRun);

    // stdin closed at 3.2s and the model responded at 4s.
    expect(result.runtime_init_to_first_model_response_ms).toBe(800);
  });

  it('counts the whole tool loop as model-active time', () => {
    const result = summarizeRunTimingAnalytics(toolFirstRun);

    // The model responded at 4s and the run ended at 25s.
    expect(result.model_active_duration_ms).toBe(21_000);
  });

  it('blames the tool loop rather than startup for a tool-first run', () => {
    const result = summarizeRunTimingAnalytics(toolFirstRun);

    // Tool execution is 16s of the 21s model-active window; the re-anchored
    // runtime_init phase is 0.8s. Anchoring on firstTokenAt reports a 20.8s
    // `runtime_init` phase and wins the bottleneck with pure startup.
    expect(result.tool_duration_ms).toBe(16_000);
    expect(result.bottleneck_phase).toBe('tool_execution');
  });

  it('stamps the phase schema version so old and new rows are separable', () => {
    const result = summarizeRunTimingAnalytics(toolFirstRun);

    expect(result.phase_schema_version).toBe(2);
  });

  it('leaves every first-token metric at its published meaning', () => {
    const result = summarizeRunTimingAnalytics(toolFirstRun);

    // These four are consumed by existing dashboards. Re-anchoring phases
    // must not silently redefine them.
    expect(result.time_to_first_token_ms).toBe(22_000);
    expect(result.runtime_init_to_first_token_ms).toBe(20_800);
    expect(result.spawn_to_first_token_ms).toBe(21_000);
    expect(result.generation_duration_ms).toBe(1_000);
  });

  it('reports identical old and new values when the model leads with text', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 8_000,
      analyticsCapturedAt: 8_020,
      telemetry: {
        startRequestedAt: 1_100,
        startChatRunStartedAt: 2_000,
        processSpawnStartedAt: 2_500,
        processSpawnedAt: 3_000,
        stdinWriteStartAt: 3_100,
        stdinWriteEndAt: 3_200,
        firstModelEventAt: 4_000,
        firstModelEventType: 'text_delta' as const,
        firstTokenAt: 4_000,
        firstVisibleOutputAt: 4_000,
        attemptIndex: 1,
        attemptStartedAt: 2_000,
      },
      events: [
        { id: 1, event: 'agent', timestamp: 5_000, data: { type: 'tool_use', id: 't1', name: 'Read' } },
        { id: 2, event: 'agent', timestamp: 5_500, data: { type: 'tool_result', toolUseId: 't1' } },
      ],
    });

    // Text-first runs already had a truthful anchor, so the new fields must
    // land on exactly the old numbers -- no drift for Claude Code-shaped runs.
    expect(result.runtime_init_to_first_model_response_ms).toBe(result.runtime_init_to_first_token_ms);
    expect(result.model_active_duration_ms).toBe(result.generation_duration_ms);
  });

  it('falls back to the first token when the client reported no model event', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 25_000,
      analyticsCapturedAt: 25_100,
      telemetry: {
        startRequestedAt: 1_100,
        startChatRunStartedAt: 2_000,
        processSpawnedAt: 3_000,
        stdinWriteEndAt: 3_200,
        firstTokenAt: 24_000,
        attemptIndex: 1,
        attemptStartedAt: 2_000,
      },
      events: [
        { id: 1, event: 'agent', timestamp: 4_000, data: { type: 'tool_use', id: 't1', name: 'Read' } },
        { id: 2, event: 'agent', timestamp: 9_000, data: { type: 'tool_result', toolUseId: 't1' } },
      ],
    });

    // Older clients send no `firstModelEventAt`. The phase anchor falls back
    // to the first token rather than to the scanned `tool_use` timestamp:
    // event records carry the daemon's clock, not the lifecycle tracer's, and
    // are not reset per retry attempt. `time_to_first_model_event_ms` keeps
    // its existing scan-based fallback and is unaffected.
    expect(result.time_to_first_model_event_ms).toBe(2_000);
    expect(result.runtime_init_to_first_model_response_ms).toBe(20_800);
    expect(result.model_active_duration_ms).toBe(1_000);
  });
});

describe('summarizeRunTimingAnalytics tool phase occupancy', () => {
  // Phase durations have to partition elapsed time. `tool_duration_ms` sums
  // each paired tool_use -> tool_result span, which is the right definition
  // for a published "how much tool work happened" metric but the wrong one for
  // a phase: parallel calls, a retried run's earlier attempt, and a
  // producer-supplied `startedAt` from another clock all push the sum past the
  // wall clock it is supposed to occupy.

  it('uses wall-clock occupancy, not summed tool work, for the tool phase', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 16_000,
      analyticsCapturedAt: 16_050,
      telemetry: {
        startRequestedAt: 1_100,
        startChatRunStartedAt: 8_000,
        processSpawnedAt: 8_500,
        stdinWriteEndAt: 9_000,
        firstModelEventAt: 10_000,
        firstModelEventType: 'tool_use' as const,
        firstTokenAt: 15_800,
        attemptIndex: 1,
        attemptStartedAt: 8_000,
      },
      events: [
        // Two overlapping tools: 4s and 5s of work, but only 5.5s of wall
        // clock (10.0s -> 15.5s).
        { id: 1, event: 'agent', timestamp: 10_000, data: { type: 'tool_use', id: 't1', name: 'Read' } },
        { id: 2, event: 'agent', timestamp: 10_500, data: { type: 'tool_use', id: 't2', name: 'Bash' } },
        { id: 3, event: 'agent', timestamp: 14_000, data: { type: 'tool_result', toolUseId: 't1' } },
        { id: 4, event: 'agent', timestamp: 15_500, data: { type: 'tool_result', toolUseId: 't2' } },
      ],
    });

    // The model was active for 6s total, so no phase inside that window can
    // exceed 6s. Summing gives 9s, which would beat the genuine 7s queue wait
    // and report the wrong bottleneck.
    expect(result.model_active_duration_ms).toBe(6_000);
    expect(result.bottleneck_phase).toBe('queued');
    // The published metric keeps summing paired spans.
    expect(result.tool_duration_ms).toBe(9_000);
  });

  it('ignores a previous attempt\'s tool work when the anchor is from this attempt', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 25_000,
      analyticsCapturedAt: 25_100,
      telemetry: {
        // A retry clears lifecycle telemetry down to `startRequestedAt`, so
        // every mark here belongs to attempt 2.
        startRequestedAt: 1_100,
        stdinWriteEndAt: 19_000,
        firstModelEventAt: 20_000,
        firstModelEventType: 'tool_use' as const,
        firstTokenAt: 24_000,
        attemptIndex: 2,
        attemptStartedAt: 18_000,
      },
      events: [
        // `run.events` is never cleared between attempts, so attempt 1's 10s
        // tool is still in the list even though the anchor is at 20s.
        { id: 1, event: 'agent', timestamp: 3_000, data: { type: 'tool_use', id: 'a1', name: 'Bash' } },
        { id: 2, event: 'agent', timestamp: 13_000, data: { type: 'tool_result', toolUseId: 'a1' } },
        { id: 3, event: 'agent', timestamp: 21_000, data: { type: 'tool_use', id: 'a2', name: 'Read' } },
        { id: 4, event: 'agent', timestamp: 22_000, data: { type: 'tool_result', toolUseId: 'a2' } },
      ],
    });

    // Attempt 2 was active for 5s and spent 1s of it in a tool. Counting
    // attempt 1's 10s tool here reports 11s of tool execution inside a 5s
    // window and blames tooling for work that predates the anchor.
    expect(result.model_active_duration_ms).toBe(5_000);
    expect(result.bottleneck_phase).toBe('stream_output');
    // Whole-run tool work is unchanged: the published metric is not
    // attempt-scoped.
    expect(result.tool_duration_ms).toBe(11_000);
  });

  it('clips a producer-supplied tool start that predates the anchor', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 10_000,
      analyticsCapturedAt: 10_050,
      telemetry: {
        startRequestedAt: 1_050,
        startChatRunStartedAt: 1_100,
        stdinWriteEndAt: 1_200,
        firstModelEventAt: 5_000,
        firstModelEventType: 'tool_use' as const,
        firstTokenAt: 9_000,
        attemptIndex: 1,
        attemptStartedAt: 1_100,
      },
      events: [
        // ACP producers supply their own `startedAt`; here it is 4s earlier
        // than the anchor, which cannot be time this run spent in a tool.
        { id: 1, event: 'agent', timestamp: 6_000, data: { type: 'tool_use', id: 't1', name: 'Read', startedAt: 1_000 } },
        { id: 2, event: 'agent', timestamp: 8_000, data: { type: 'tool_result', toolUseId: 't1' } },
      ],
    });

    // Only 5.0s -> 8.0s falls inside the model-active window, so runtime init
    // (3.8s) is the real bottleneck. The unclipped 7s span would outrank it.
    expect(result.model_active_duration_ms).toBe(5_000);
    expect(result.bottleneck_phase).toBe('runtime_init');
    expect(result.tool_duration_ms).toBe(7_000);
  });
});

describe('summarizeRunTimingAnalytics anchor and completeness edges', () => {
  it('does not let a late daemon-persisted artifact push the anchor past the first token', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 20_000,
      analyticsCapturedAt: 20_050,
      telemetry: {
        startRequestedAt: 1_100,
        startChatRunStartedAt: 2_000,
        processSpawnedAt: 2_500,
        stdinWriteEndAt: 3_000,
        // Plain-stream runs stamp first-token from the first buffered stdout
        // chunk, then the daemon persists stdout artifacts at close time and
        // emits an `artifact` agent event. That event is a daemon action, not
        // a model response, and it arrives near the end of the run.
        firstTokenAt: 5_000,
        firstVisibleOutputAt: 5_000,
        firstModelEventAt: 19_000,
        firstModelEventType: 'artifact' as const,
        attemptIndex: 1,
        attemptStartedAt: 2_000,
      },
      events: [],
    });

    // The model had produced output by 5s. Anchoring on the 19s artifact
    // reports a 1s active window and a 16s runtime init for a run that was
    // streaming the whole time.
    expect(result.model_active_duration_ms).toBe(15_000);
    expect(result.runtime_init_to_first_model_response_ms).toBe(2_000);
    expect(result.bottleneck_phase).toBe('stream_output');
  });

  it('reports complete phase timing for a fully instrumented run with no text token', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 12_000,
      analyticsCapturedAt: 12_050,
      telemetry: {
        startRequestedAt: 1_100,
        startChatRunStartedAt: 2_000,
        promptBuildStartAt: 2_100,
        promptBuildEndAt: 2_200,
        processSpawnStartedAt: 2_300,
        processSpawnedAt: 2_400,
        modelCallStartAt: 2_500,
        stdinWriteEndAt: 2_600,
        // A tool-only turn: the model worked and finished without ever
        // emitting text.
        firstModelEventAt: 3_000,
        firstModelEventType: 'tool_use' as const,
        attemptIndex: 1,
        attemptStartedAt: 2_000,
      },
      events: [
        { id: 1, event: 'agent', timestamp: 3_000, data: { type: 'tool_use', id: 't1', name: 'Bash' } },
        { id: 2, event: 'agent', timestamp: 8_000, data: { type: 'tool_result', toolUseId: 't1' } },
      ],
    });

    // Every boundary the phases are actually measured from is present, so
    // this run is fully measured. Requiring a text token here marks it
    // partial and drops it from dashboards that filter on complete timings.
    expect(result.time_to_first_token_ms).toBeUndefined();
    expect(result.phase_timing_status).toBe('complete');
  });

  it('counts a tool still running at run end as tool occupancy', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 15_000,
      analyticsCapturedAt: 15_050,
      telemetry: {
        startRequestedAt: 1_100,
        startChatRunStartedAt: 2_000,
        processSpawnedAt: 3_000,
        stdinWriteEndAt: 3_500,
        firstModelEventAt: 4_000,
        firstModelEventType: 'tool_use' as const,
        attemptIndex: 1,
        attemptStartedAt: 2_000,
      },
      events: [
        // The run died while this tool was still outstanding, so there is no
        // tool_result to pair with.
        { id: 1, event: 'agent', timestamp: 5_000, data: { type: 'tool_use', id: 't1', name: 'Bash' } },
      ],
    });

    // 10s of the 11s active window was spent inside that tool. Treating the
    // unpaired span as zero occupancy hands the whole window to stream_output
    // and contradicts last_observed_phase.
    expect(result.model_active_duration_ms).toBe(11_000);
    expect(result.bottleneck_phase).toBe('tool_execution');
    expect(result.last_observed_phase).toBe('tool_execution');
    // The published metric only ever sums completed pairs.
    expect(result.tool_duration_ms).toBe(0);
  });
});

describe('summarizeRunTimingAnalytics outstanding tools across a retry', () => {
  it('does not carry a killed attempt\'s unfinished tool into the new attempt', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 25_000,
      analyticsCapturedAt: 25_100,
      telemetry: {
        // Post-retry telemetry: attempt 2 only, and it never called a tool.
        startRequestedAt: 1_100,
        attemptStartedAt: 18_000,
        attemptIndex: 2,
        stdinWriteEndAt: 19_000,
        firstModelEventAt: 20_000,
        firstModelEventType: 'text_delta' as const,
        firstTokenAt: 20_000,
      },
      events: [
        // Attempt 1's child was killed mid-tool, so this tool_use never got a
        // result and stays open. `run.events` survives the retry.
        { id: 1, event: 'agent', timestamp: 3_000, data: { type: 'tool_use', id: 'a1', name: 'Bash' } },
      ],
    });

    // Closing that span at run end stretches it across the retry boundary, so
    // clipping to the attempt-2 window hands 5s of "tool execution" to an
    // attempt that made no tool call at all.
    expect(result.model_active_duration_ms).toBe(5_000);
    expect(result.bottleneck_phase).toBe('stream_output');
    expect(result.tool_duration_ms).toBe(0);
  });

  it('still closes an outstanding tool whose producer start predates the anchor', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 15_000,
      analyticsCapturedAt: 15_050,
      telemetry: {
        startRequestedAt: 1_050,
        startChatRunStartedAt: 1_100,
        stdinWriteEndAt: 3_500,
        firstModelEventAt: 4_000,
        firstModelEventType: 'tool_use' as const,
      },
      events: [
        // Observed after the anchor, so this tool really is running in this
        // attempt; only its producer-supplied start is skewed early.
        { id: 1, event: 'agent', timestamp: 5_000, data: { type: 'tool_use', id: 't1', name: 'Bash', startedAt: 1_000 } },
      ],
    });

    // The skewed start is clipped to the anchor, not discarded: 4s -> 15s.
    expect(result.model_active_duration_ms).toBe(11_000);
    expect(result.bottleneck_phase).toBe('tool_execution');
  });
});

describe('summarizeRunTimingAnalytics outstanding tools without a model-event mark', () => {
  it('keeps a current-attempt outstanding tool when the anchor fell back to the first token', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 30_000,
      analyticsCapturedAt: 30_050,
      telemetry: {
        // Legacy or recovery telemetry: no `firstModelEventAt`, so the phase
        // anchor falls back to the first token at 10s.
        startRequestedAt: 1_100,
        startChatRunStartedAt: 2_000,
        stdinWriteEndAt: 3_000,
        firstTokenAt: 10_000,
        attemptStartedAt: 2_000,
        attemptIndex: 1,
      },
      events: [
        // Issued by THIS attempt at 4s and never completed. It was observed
        // before the first token, which is exactly the tool-first shape this
        // change exists to measure.
        { id: 1, event: 'agent', timestamp: 4_000, data: { type: 'tool_use', id: 't1', name: 'Bash' } },
      ],
    });

    // The tool held the whole 10s-30s active window. Gating the close on the
    // phase anchor rather than the attempt boundary discards it and hands the
    // window to stream_output.
    expect(result.model_active_duration_ms).toBe(20_000);
    expect(result.bottleneck_phase).toBe('tool_execution');
  });
});

describe('summarizeRunTimingAnalytics tool id reuse across a retry', () => {
  it('does not pair a dead attempt\'s open tool with a same-id retry tool', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 25_000,
      analyticsCapturedAt: 25_050,
      telemetry: {
        startRequestedAt: 1_100,
        attemptStartedAt: 20_000,
        attemptIndex: 2,
        stdinWriteEndAt: 20_200,
        firstModelEventAt: 20_500,
        firstModelEventType: 'text_delta' as const,
        firstTokenAt: 20_500,
      },
      events: [
        // Attempt 1's child was killed mid-tool, leaving `call_0` open.
        { id: 1, event: 'agent', timestamp: 3_000, data: { type: 'tool_use', id: 'call_0', name: 'Bash' } },
        // Sequential ids restart at `call_0` in the retry's fresh session, so
        // the id collides with the corpse above.
        { id: 2, event: 'agent', timestamp: 21_500, data: { type: 'tool_use', id: 'call_0', name: 'Read' } },
        { id: 3, event: 'agent', timestamp: 22_000, data: { type: 'tool_result', toolUseId: 'call_0' } },
      ],
    });

    // The retry tool ran 21.5s -> 22.0s. Keeping the stale start pairs
    // attempt 1's 3s opening with attempt 2's 22s close and reports a 19s
    // tool that never existed.
    expect(result.tool_duration_ms).toBe(500);
    expect(result.model_active_duration_ms).toBe(4_500);
  });
});

describe('summarizeRunTimingAnalytics with a truncated event stream', () => {
  const truncatedRun = {
    runCreatedAt: 1_000,
    runUpdatedAt: 60_000,
    analyticsCapturedAt: 60_050,
    telemetry: {
      startRequestedAt: 1_100,
      startChatRunStartedAt: 2_000,
      promptBuildStartAt: 2_100,
      promptBuildEndAt: 2_200,
      processSpawnStartedAt: 2_300,
      processSpawnedAt: 2_400,
      modelCallStartAt: 2_500,
      stdinWriteEndAt: 2_600,
      firstModelEventAt: 3_000,
      firstModelEventType: 'tool_use' as const,
      firstTokenAt: 25_000,
      attemptStartedAt: 2_000,
      attemptIndex: 1,
    },
    // The run's event ring buffer evicted everything before id 2001, which is
    // where the opening tool_use lived. Every lifecycle mark still survives,
    // because those live on the run rather than in the event list.
    events: [
      { id: 2_001, event: 'agent', timestamp: 55_000, data: { type: 'text_delta', text: 'done' } },
    ],
  };

  it('does not claim complete phase timing when tool intervals may be missing', () => {
    const result = summarizeRunTimingAnalytics(truncatedRun);

    expect(result.phase_timing_status).toBe('partial');
  });

  it('withholds the bottleneck rather than blaming the phase that survived', () => {
    const result = summarizeRunTimingAnalytics(truncatedRun);

    // With the tool events evicted, occupancy reconstructs as zero and the
    // whole active window lands on stream_output. That is not a measurement,
    // it is an artefact of what the buffer happened to keep.
    expect(result.bottleneck_phase).toBeUndefined();
  });

  it('still reports timings that come from lifecycle marks', () => {
    const result = summarizeRunTimingAnalytics(truncatedRun);

    // These never depended on the event list, so truncation does not touch
    // them.
    expect(result.model_active_duration_ms).toBe(57_000);
    expect(result.time_to_first_token_ms).toBe(23_000);
    expect(result.total_duration_ms).toBe(59_050);
  });
});

describe('summarizeRunTimingAnalytics late tool results from a dead attempt', () => {
  it('does not charge the current attempt for a tool opened before it started', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 30_000,
      analyticsCapturedAt: 30_050,
      telemetry: {
        startRequestedAt: 1_100,
        attemptStartedAt: 20_000,
        attemptIndex: 2,
        stdinWriteEndAt: 20_500,
        firstModelEventAt: 21_000,
        firstModelEventType: 'text_delta' as const,
        firstTokenAt: 21_000,
      },
      events: [
        // Opened by attempt 1.
        { id: 1, event: 'agent', timestamp: 3_000, data: { type: 'tool_use', id: 'call_0', name: 'Bash' } },
        // Its result lands long after attempt 2 is under way -- a buffered
        // stdout flush racing the abort, which the ACP session code already
        // documents as a real sequence. Attempt 2 issued no tool of its own.
        { id: 2, event: 'agent', timestamp: 29_900, data: { type: 'tool_result', toolUseId: 'call_0' } },
      ],
    });

    // Pairing this into an interval spans the retry boundary; clipping then
    // reports 8.9s of tool execution inside a 9s window for an attempt that
    // never called a tool.
    expect(result.model_active_duration_ms).toBe(9_000);
    expect(result.bottleneck_phase).toBe('stream_output');
    // The published metric keeps its whole-run paired-sum definition.
    expect(result.tool_duration_ms).toBe(26_900);
  });
});

describe('summarizeRunTimingAnalytics separates the response anchor from the event mark', () => {
  it('anchors phases on the response while the published metric keeps arrival', () => {
    const result = summarizeRunTimingAnalytics({
      runCreatedAt: 1_000,
      runUpdatedAt: 30_000,
      analyticsCapturedAt: 30_050,
      telemetry: {
        startRequestedAt: 1_100,
        startChatRunStartedAt: 2_000,
        stdinWriteEndAt: 3_000,
        // ACP: the canonical tool_use arrived at 20s, but the tool began at 4s.
        firstModelEventAt: 20_000,
        firstModelResponseAt: 4_000,
        firstModelEventType: 'tool_use' as const,
        attemptStartedAt: 2_000,
        attemptIndex: 1,
      },
      events: [],
    });

    // Already published, and this PR promised not to move it.
    expect(result.time_to_first_model_event_ms).toBe(18_000);
    // New, and measured from when the model actually started working.
    expect(result.runtime_init_to_first_model_response_ms).toBe(1_000);
    expect(result.model_active_duration_ms).toBe(26_000);
  });
});

describe('summarizeRunTimingAnalytics with an unattributable tool ledger', () => {
  const ambiguousRun = {
    runCreatedAt: 1_000,
    runUpdatedAt: 30_000,
    analyticsCapturedAt: 30_050,
    telemetry: {
      startRequestedAt: 1_100,
      attemptStartedAt: 20_000,
      attemptIndex: 2,
      stdinWriteEndAt: 20_500,
      firstModelEventAt: 21_000,
      firstModelResponseAt: 21_000,
      firstModelEventType: 'text_delta' as const,
      firstTokenAt: 21_000,
    },
    events: [
      // Attempt 1 opened `call_0` and was killed before it returned.
      { id: 1, event: 'agent', timestamp: 3_000, data: { type: 'tool_use', id: 'call_0', name: 'Bash' } },
      // Attempt 2's fresh session restarts sequential ids and opens the same
      // one for a different call.
      { id: 2, event: 'agent', timestamp: 21_500, data: { type: 'tool_use', id: 'call_0', name: 'Read' } },
      // A result arrives. Nothing in the event log says which of the two it
      // belongs to, and the two readings differ by 8s of occupancy.
      { id: 3, event: 'agent', timestamp: 22_000, data: { type: 'tool_result', toolUseId: 'call_0' } },
    ],
  };

  it('withholds the bottleneck when a result cannot be attributed to an attempt', () => {
    const result = summarizeRunTimingAnalytics(ambiguousRun);

    expect(result.bottleneck_phase).toBeUndefined();
  });

  it('marks phase timing partial rather than complete', () => {
    const result = summarizeRunTimingAnalytics(ambiguousRun);

    expect(result.phase_timing_status).toBe('partial');
  });

  it('still reports mark-derived timings', () => {
    const result = summarizeRunTimingAnalytics(ambiguousRun);

    expect(result.model_active_duration_ms).toBe(9_000);
  });
});
