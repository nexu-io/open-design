// @vitest-environment node
//
// Companion to the jsdom bridge test: under the node env `window` genuinely does
// not exist, so the SSR guards execute for real (no mock) and return inert
// no-ops. This is the honest way to cover the `typeof window === 'undefined'`
// branches per ADR 0002's testing strategy.
import { describe, expect, it, vi } from 'vitest';
import {
  openMcpAuthorizeUrl,
  subscribeMcpOAuthCallback,
  subscribeMcpOAuthStatusPolling,
} from '../../../src/providers/mcp/oauth-bridge';

describe('oauth bridge without a window (SSR)', () => {
  it('returns inert unsubscribes and never invokes callbacks', () => {
    const onResult = vi.fn();
    const onTick = vi.fn();
    const stopCallback = subscribeMcpOAuthCallback('srv', onResult);
    const stopPolling = subscribeMcpOAuthStatusPolling(onTick);
    expect(typeof stopCallback).toBe('function');
    expect(typeof stopPolling).toBe('function');
    expect(() => {
      stopCallback();
      stopPolling();
      openMcpAuthorizeUrl('https://auth');
    }).not.toThrow();
    expect(onResult).not.toHaveBeenCalled();
    expect(onTick).not.toHaveBeenCalled();
  });
});
