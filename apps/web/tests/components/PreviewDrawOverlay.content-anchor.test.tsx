// @vitest-environment jsdom

// Issue #6361, the half the frame-geometry fix cannot reach: the artifact
// *reflows*. Narrowing the preview frame rewraps the header text and pushes
// every band down 19.5px, so a mark held at any frame-relative position lands
// between bands. The mark therefore anchors to the element it was drawn on and
// is re-projected from that element's current box before the annotation is read.
//
// Measured on the reported artifact: BAND 05 sits at y=342 in a 692x666 frame
// and at y=322.5 in a 804x744 frame.

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PreviewDrawOverlay } from '../../src/components/PreviewDrawOverlay';
import { requestPreviewAnchorTargets } from '../../src/runtime/exports';

vi.mock('../../src/runtime/exports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/exports')>();
  return {
    ...actual,
    requestPreviewSnapshot: vi.fn(async () => null),
    requestPreviewAnchorTargets: vi.fn(async () => []),
  };
});

afterEach(() => cleanup());

const frame = { w: 692, h: 666 };

/** Bands are 40px tall on a 50px pitch under a header whose height reflows. */
function targetsFor(headerH: number, frameW: number) {
  return [
    { elementId: 'header', selector: '#h', position: { x: 0, y: 0, width: frameW, height: headerH } },
    ...Array.from({ length: 10 }, (_, i) => ({
      elementId: `band-${i + 1}`,
      selector: `#b${i + 1}`,
      position: { x: 32, y: headerH + 28 + i * 50, width: frameW - 64, height: 40 },
    })),
  ];
}
const ZOOMED = targetsFor(114, 692); // BAND 05 at 342
const RESTORED = targetsFor(94.5, 804); // BAND 05 at 322.5

function installFrameGeometry() {
  const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: frame.w,
        height: frame.h,
        right: frame.w,
        bottom: frame.h,
        toJSON: () => ({}),
      }) as DOMRect,
  );
  return () => spy.mockRestore();
}

function installResizeObserver() {
  let cb: ResizeObserverCallback | null = null;
  class RO {
    constructor(c: ResizeObserverCallback) {
      cb = c;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const prev = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: RO as unknown as typeof ResizeObserver,
  });
  return {
    trigger: () => cb?.([], {} as ResizeObserver),
    restore: () => {
      if (prev) {
        Object.defineProperty(globalThis, 'ResizeObserver', {
          configurable: true,
          writable: true,
          value: prev,
        });
      } else {
        delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
      }
    },
  };
}

describe('PreviewDrawOverlay content anchoring (issue #6361)', () => {
  it('follows the marked element when the artifact reflows', async () => {
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    anchors.mockImplementation(async () => ZOOMED as never);

    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (r: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole } = render(
        <PreviewDrawOverlay active>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" />
        </PreviewDrawOverlay>,
      );
      const wrap = container.querySelector<HTMLElement>('.preview-draw-overlay')!;
      const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
      Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
      Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
      observer.trigger();

      // Mark BAND 05 where it sits while zoomed: 342..382.
      fireEvent.pointerDown(canvas, { clientX: 40, clientY: 342, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      await waitFor(() => expect(anchors).toHaveBeenCalled());

      // Cmd 0: the frame grows back and the header un-wraps, so every band
      // moves UP by 19.5px — the opposite direction from the frame growth.
      frame.w = 804;
      frame.h = 744;
      anchors.mockImplementation(async () => RESTORED as never);
      observer.trigger();

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input')!;
      fireEvent.change(input, { target: { value: 'This band is missing its label.' } });
      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      const detail = (annotation.mock.calls[0]?.[0] as CustomEvent<{
        bounds?: { x: number; y: number; width: number; height: number };
      }>).detail;

      // BAND 05's new home, not the 342 a frame-relative rule would preserve
      // and not the 382 the original bug produced.
      expect(detail.bounds!.y).toBeCloseTo(322.5, 0);
      expect(detail.bounds!.height).toBeCloseTo(40, 0);
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
      observer.restore();
      restoreRect();
    }
  });
});
