// @vitest-environment jsdom

import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PreviewDrawOverlay } from '../../src/components/PreviewDrawOverlay';

// In a scaled tablet/phone device frame the overlay lives inside a
// `transform: scale()` shell: getBoundingClientRect() reports the on-screen
// (scaled) size while offsetWidth/Height keep the untransformed layout size.
// The structured annotation bounds must be layout-space — the same space the
// composited screenshot uses — or the agent receives a rect shrunk by the fit
// scale while the painted mark stays artifact-local (#6361).
describe('PreviewDrawOverlay scaled device frame bounds', () => {
  function installImageCompositeMocks() {
    const originalImage = globalThis.Image;
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        window.setTimeout(() => this.onload?.(), 0);
      }
    }
    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      value: MockImage,
      writable: true,
    });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      lineCap: 'round',
      lineJoin: 'round',
      lineTo: vi.fn(),
      lineWidth: 1,
      measureText: vi.fn(() => ({ width: 10 })),
      moveTo: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      scale: vi.fn(),
      setLineDash: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      font: '',
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' })));
    return () => {
      Object.defineProperty(globalThis, 'Image', {
        configurable: true,
        value: originalImage,
        writable: true,
      });
      getContext.mockRestore();
      toBlob.mockRestore();
    };
  }

  it('sends layout-space bounds when the frame is fit-to-window scaled', async () => {
    const restoreCompositeMocks = installImageCompositeMocks();
    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (result: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole } = render(
        <PreviewDrawOverlay
          active
          captureViewport
          captureSnapshot={async () => ({ dataUrl: 'data:image/png;base64,cG5n', w: 820, h: 1180 })}
        >
          <div style={{ width: 320, height: 200 }} />
        </PreviewDrawOverlay>,
      );

      const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
      // Layout box: full 820×1180 device frame. On-screen rect: scaled to 42%.
      Object.defineProperty(canvas, 'offsetWidth', { configurable: true, get: () => 820 });
      Object.defineProperty(canvas, 'offsetHeight', { configurable: true, get: () => 1180 });
      canvas.getBoundingClientRect = () =>
        ({
          x: 0, y: 0, left: 0, top: 0,
          right: 820 * 0.42, bottom: 1180 * 0.42,
          width: 820 * 0.42, height: 1180 * 0.42,
          toJSON: () => ({}),
        }) as DOMRect;

      // Draw a box over the middle of the *on-screen* frame: client px are
      // scaled, so the normalized fractions are what a real pointer produces.
      fireEvent.pointerDown(canvas, { clientX: 0.42 * 100, clientY: 0.42 * 300, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 0.42 * 500, clientY: 0.42 * 400, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 0.42 * 500, clientY: 0.42 * 400, pointerId: 1 });

      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      const detail = (annotation.mock.calls[0]?.[0] as CustomEvent).detail as {
        bounds?: { x: number; y: number; width: number; height: number };
      };
      // Layout-space expectation: fractions × layout size (not × scaled rect).
      expect(detail.bounds).toBeDefined();
      expect(detail.bounds!.x).toBeCloseTo(100, 0);
      expect(detail.bounds!.y).toBeCloseTo(300, 0);
      expect(detail.bounds!.width).toBeCloseTo(400, 0);
      expect(detail.bounds!.height).toBeCloseTo(100, 0);
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
      restoreCompositeMocks();
    }
  });
});
