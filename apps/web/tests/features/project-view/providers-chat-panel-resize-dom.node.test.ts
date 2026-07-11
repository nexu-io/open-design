// @vitest-environment node
//
// Companion to the jsdom bridge test: under the node env `window` genuinely
// does not exist, so the SSR guards execute for real (no mock) and return
// inert no-ops. This is the honest way to cover the
// `typeof window === 'undefined'` branches per ADR 0002's testing strategy.
import { describe, expect, it, vi } from 'vitest';
import {
  getSplitIsRtl,
  subscribeChatPanelPointerDrag,
  subscribeSplitResize,
} from '../../../src/providers/project-view/chat-panel-resize-dom';

describe('chat-panel-resize-dom without a window (SSR)', () => {
  it('returns inert unsubscribes and safe defaults, never invoking callbacks', () => {
    const onResize = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const onCancel = vi.fn();

    const stopResize = subscribeSplitResize({} as HTMLDivElement, onResize);
    const stopDrag = subscribeChatPanelPointerDrag({ onMove, onEnd, onCancel });

    expect(typeof stopResize).toBe('function');
    expect(typeof stopDrag).toBe('function');
    expect(() => {
      stopResize();
      stopDrag();
    }).not.toThrow();
    expect(onResize).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    expect(getSplitIsRtl({} as HTMLDivElement)).toBe(false);
  });
});
