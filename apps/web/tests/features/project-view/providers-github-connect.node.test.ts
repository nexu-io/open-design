// @vitest-environment node
//
// Companion to the jsdom bridge test: under the node env `window` genuinely
// does not exist, so the SSR guard executes for real (no mock) and returns
// an inert no-op. This is the honest way to cover the
// `typeof window === 'undefined'` branch per ADR 0002's testing strategy.
import { describe, expect, it, vi } from 'vitest';
import { subscribeGithubConnectRefreshTriggers } from '../../../src/providers/project-view/github-connect';

describe('subscribeGithubConnectRefreshTriggers without a window (SSR)', () => {
  it('returns an inert unsubscribe and never invokes the callback', () => {
    const onTrigger = vi.fn();
    const unsubscribe = subscribeGithubConnectRefreshTriggers(onTrigger);
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
    expect(onTrigger).not.toHaveBeenCalled();
  });
});
