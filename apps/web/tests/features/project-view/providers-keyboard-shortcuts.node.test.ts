// @vitest-environment node
//
// Companion to the jsdom bridge test: under the node env `window` genuinely
// does not exist, so the SSR guard executes for real (no mock) and returns
// an inert no-op.
import { describe, expect, it, vi } from 'vitest';
import { subscribeCapturedKeyDown } from '../../../src/providers/project-view/keyboard-shortcuts';

describe('subscribeCapturedKeyDown without a window (SSR)', () => {
  it('returns an inert unsubscribe and never invokes the callback', () => {
    const onKeyDown = vi.fn();
    const unsubscribe = subscribeCapturedKeyDown(onKeyDown);
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});
