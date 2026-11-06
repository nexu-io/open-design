import { describe, expect, it } from 'vitest';

import { formatUsage } from '../src/agent-protocol/acp/rpc.js';
import { scanRunEventsForUsageAnalytics } from '../src/run-analytics-observability.js';

describe('formatUsage', () => {
  it('normalizes camelCase ACP usage including thought_tokens', () => {
    expect(
      formatUsage({
        inputTokens: 100,
        outputTokens: 20,
        cachedReadTokens: 40,
        thoughtTokens: 8,
        totalTokens: 128,
      }),
    ).toEqual({
      input_tokens: 100,
      output_tokens: 20,
      cached_read_tokens: 40,
      thought_tokens: 8,
      total_tokens: 128,
    });
  });

  it('normalizes snake_case usage aliases including cache creation', () => {
    expect(
      formatUsage({
        input_tokens: 200,
        output_tokens: 30,
        cached_read_tokens: 50,
        cache_creation_input_tokens: 10,
        thought_tokens: 12,
        total_tokens: 242,
      }),
    ).toEqual({
      input_tokens: 200,
      output_tokens: 30,
      cached_read_tokens: 50,
      // Anthropic-style creation key is preserved (not collapsed to generic).
      cache_creation_input_tokens: 10,
      thought_tokens: 12,
      total_tokens: 242,
    });
  });

  it('preserves anthropic cache_read_input_tokens (does not map to cached_read_tokens)', () => {
    expect(
      formatUsage({
        input_tokens: 10,
        cache_read_input_tokens: 4,
      }),
    ).toEqual({
      input_tokens: 10,
      cache_read_input_tokens: 4,
    });
  });

  it('preserves openai-like cached_read_tokens separately from anthropic keys', () => {
    expect(
      formatUsage({
        input_tokens: 100,
        cached_read_tokens: 40,
        cached_write_tokens: 5,
      }),
    ).toEqual({
      input_tokens: 100,
      cached_read_tokens: 40,
      cached_write_tokens: 5,
    });
  });

  it('returns null for empty or non-object input', () => {
    expect(formatUsage(null)).toBeNull();
    expect(formatUsage(undefined)).toBeNull();
    expect(formatUsage({})).toBeNull();
    expect(formatUsage({ unknown: 1 })).toBeNull();
  });

  it('ignores non-finite numbers', () => {
    expect(
      formatUsage({
        inputTokens: Number.NaN,
        outputTokens: -1,
        thoughtTokens: 3,
      }),
    ).toEqual({ thought_tokens: 3 });
  });

  it('formatUsage anthropic cache fields scan as additive (cache_token_source anthropic)', () => {
    const formatted = formatUsage({
      cache_read_input_tokens: 10,
      input_tokens: 5,
    });
    expect(formatted).toEqual({
      input_tokens: 5,
      cache_read_input_tokens: 10,
    });

    const scanned = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: formatted,
          },
        },
      ],
      'claude-sonnet',
      0,
    );

    expect(scanned).toMatchObject({
      input_tokens_provider: 5,
      // Additive: effective = input + cache_read
      input_tokens_effective: 15,
      cache_read_input_tokens: 10,
      uncached_input_tokens: 5,
      cache_token_source: 'anthropic',
      token_count_source: 'provider_usage',
    });
    expect(scanned.cache_hit_ratio).toBeCloseTo(10 / 15);
  });

  it('formatUsage openai cacheCreationTokens scan as inclusive (not anthropic additive)', () => {
    const formatted = formatUsage({
      inputTokens: 100,
      cachedReadTokens: 40,
      cacheCreationTokens: 5,
    });
    expect(formatted).toEqual({
      input_tokens: 100,
      cached_read_tokens: 40,
      cache_creation_tokens: 5,
    });

    const scanned = scanRunEventsForUsageAnalytics(
      [
        {
          event: 'agent',
          data: {
            type: 'usage',
            usage: formatted,
          },
        },
      ],
      'gpt-4.1',
      0,
    );

    expect(scanned).toMatchObject({
      input_tokens_provider: 100,
      // Inclusive: effective = input (cache read is a subset)
      input_tokens_effective: 100,
      cache_read_input_tokens: 40,
      cache_creation_input_tokens: 5,
      uncached_input_tokens: 60,
      cache_token_source: 'openai',
      token_count_source: 'provider_usage',
    });
    expect(scanned.cache_hit_ratio).toBeCloseTo(40 / 100);
  });
});
