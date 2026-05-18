// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PreviewDrawOverlay } from '../../src/components/PreviewDrawOverlay';

describe('PreviewDrawOverlay', () => {
  it('clears transient ink when draw mode exits', async () => {
    const { container, rerender } = render(
      <PreviewDrawOverlay active>
        <div style={{ width: 320, height: 200 }} />
      </PreviewDrawOverlay>,
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).toBeTruthy();

    fireEvent.pointerDown(canvas!, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(canvas!, { clientX: 40, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(canvas!, { pointerId: 1 });

    rerender(
      <PreviewDrawOverlay active={false}>
        <div style={{ width: 320, height: 200 }} />
      </PreviewDrawOverlay>,
    );

    await waitFor(() => expect(container.querySelector('canvas')).toBeNull());
  });

  it('forwards wheel scrolling to the preview iframe while drawing', () => {
    const { container } = render(
      <PreviewDrawOverlay active>
        <iframe title="preview" />
      </PreviewDrawOverlay>,
    );

    const canvas = container.querySelector('canvas');
    const iframe = container.querySelector('iframe');
    expect(canvas).toBeTruthy();
    expect(iframe?.contentWindow).toBeTruthy();

    const scrollBy = vi.fn();
    Object.defineProperty(iframe!.contentWindow!, 'scrollBy', {
      value: scrollBy,
      configurable: true,
    });

    fireEvent.wheel(canvas!, {
      deltaX: 12,
      deltaY: 180,
    });

    expect(scrollBy).toHaveBeenCalledWith({ left: 12, top: 180, behavior: 'auto' });
  });
});
