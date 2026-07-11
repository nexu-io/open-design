// @vitest-environment jsdom
//
// The capture-phase keydown bridge: a thin `window.addEventListener` wrapper.
// See the `.node.test.ts` companion for the SSR-guard branch (no `window`).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeCapturedKeyDown } from '../../../src/providers/project-view/keyboard-shortcuts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('subscribeCapturedKeyDown bridge', () => {
  it('fires onKeyDown for a captured keydown and unsubscribes cleanly', () => {
    const onKeyDown = vi.fn();
    const unsubscribe = subscribeCapturedKeyDown(onKeyDown);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    expect(onKeyDown).toHaveBeenCalledTimes(1);

    unsubscribe();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});
