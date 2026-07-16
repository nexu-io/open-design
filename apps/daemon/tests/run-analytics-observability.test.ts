import { describe, expect, it } from 'vitest';

import {
  scanRunEventsForUsageAnalytics,
  summarizeRunTimingAnalytics,
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
      cache_read_input_tokens: 2_560,
      uncached_input_tokens: 29_151,
      cache_token_source: 'openai',
    });
    expect(result.cache_hit_ratio).toBeCloseTo(2_560 / 31_711);
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
      token_count_source: 'unknown',
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

  it('preserves unknown token source when only cache-adjacent aliases exist without concrete input totals', () => {
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
      token_count_source: 'unknown',
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
      spawn_to_first_token_ms: 740,
      time_to_first_artifact_ms: 3050,
      // No subsegment markers were observed, so the whole spawn->first-token
      // span is unattributed and falls into the remainder.
      spawn_to_first_token_remainder_ms: 740,
      generation_duration_ms: 5500,
      tool_call_count: 2,
      tool_duration_ms: 650,
      artifact_write_duration_ms: 250,
      artifact_write_status: 'completed',
      artifact_write_source: 'write_tool',
      finalize_duration_ms: 20,
      total_duration_ms: 7020,
      bottleneck_phase: 'stream_output',
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
      tool_call_count: 0,
      artifact_write_status: 'none',
      total_duration_ms: 2450,
      first_model_event_type: 'text_delta',
      bottleneck_phase: 'stream_output',
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
});
