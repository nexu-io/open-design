// @vitest-environment jsdom

// Issue #6361: a mark made inside the preview must keep identifying the same
// artifact pixels when the preview frame's layout box changes size between the
// mark and the send — the reported trigger is UI zoom (Cmd +, mark, Cmd 0,
// send), but a window resize or sidebar toggle is the same event.
//
// Marks are stored as a fraction of the frame. The artifact inside the iframe
// does not scale with the frame, it re-lays-out: block content keeps its CSS
// pixel offset from the top while the frame's height changes underneath it. So
// a mark pinned to a fraction slides across the artifact.
//
// The numbers below are the measured repro: the preview frame was 692×666 while
// the user marked a 40px band, and 744 tall again by the time they sent. The
// stored fraction 322/666 replayed against 744 put the mark at y≈360 — one full
// band lower than the one the user drew on, which is what the downstream agent
// then edited.

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PreviewDrawOverlay } from '../../src/components/PreviewDrawOverlay';
import { requestPreviewSnapshot } from '../../src/runtime/exports';

vi.mock('../../src/runtime/exports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/exports')>();
  return {
    ...actual,
    // The bounds this test asserts are computed independently of the bitmap, so
    // failing the snapshot keeps the test off the compositing path entirely.
    requestPreviewSnapshot: vi.fn(async () => null),
    // No content anchors available: this file covers the frame-geometry
    // fallback that has to hold when the preview cannot report element boxes.
    requestPreviewAnchorTargets: vi.fn(async () => []),
  };
});

afterEach(() => {
  cleanup();
  vi.mocked(requestPreviewSnapshot).mockClear();
});

/** The frame geometry both the wrap's layout box and the canvas rect report. */
const frame = { w: 692, h: 666 };

function installFrameGeometry() {
  const rectSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect')
    .mockImplementation(
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
  return () => rectSpy.mockRestore();
}

// Capture the ResizeObserver callback so the test can replay the overlay's
// canvas-sizing pass after the frame's layout box changes.
function installResizeObserver() {
  let callback: ResizeObserverCallback | null = null;
  class MockResizeObserver {
    constructor(cb: ResizeObserverCallback) {
      callback = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const previous = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: MockResizeObserver as unknown as typeof ResizeObserver,
  });
  return {
    trigger: () => callback?.([], {} as ResizeObserver),
    restore: () => {
      if (previous) {
        Object.defineProperty(globalThis, 'ResizeObserver', {
          configurable: true,
          writable: true,
          value: previous,
        });
      } else {
        delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
      }
    },
  };
}

function bindWrapLayoutBox(wrap: HTMLElement) {
  Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
  Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
}

function markBand(canvas: HTMLCanvasElement, top: number, bottom: number) {
  fireEvent.pointerDown(canvas, { clientX: 40, clientY: top, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 600, clientY: bottom, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 600, clientY: bottom, pointerId: 1 });
}

describe('PreviewDrawOverlay frame resize (issue #6361)', () => {
  it('keeps a mark on the artifact pixels it was drawn on after the frame is resized', async () => {
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (result: { ok: boolean }) => void }>).detail;
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
      bindWrapLayoutBox(wrap);
      observer.trigger();

      // The user zooms in, then marks the band that sits at 322..362 CSS px
      // from the top of the preview frame.
      markBand(canvas, 322, 362);

      // Cmd 0 restores the zoom: the frame's layout box grows back, and the
      // artifact re-lays-out — the band stays at 322..362 from the frame's top.
      frame.w = 804;
      frame.h = 744;
      observer.trigger();

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input')!;
      fireEvent.change(input, { target: { value: 'This band is missing its label.' } });
      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));

      const detail = (annotation.mock.calls[0]?.[0] as CustomEvent<{
        bounds?: { x: number; y: number; width: number; height: number };
      }>).detail;
      expect(detail.bounds).toBeTruthy();
      // Still the band the user drew on, not the one below it.
      expect(detail.bounds!.y).toBeCloseTo(322, 0);
      expect(detail.bounds!.height).toBeCloseTo(40, 0);
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
      observer.restore();
      restoreRect();
    }
  });

  it('leaves marks untouched when the frame keeps its layout height', async () => {
    // A device-frame `transform: scale()` shell changes the rendered size while
    // the layout box stays put. Fractions are already correct there, so nothing
    // must be re-anchored — this is the case the normalized storage was chosen
    // for, and the #6361 fix must not regress it.
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (result: { ok: boolean }) => void }>).detail;
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
      bindWrapLayoutBox(wrap);
      observer.trigger();

      markBand(canvas, 322, 362);
      observer.trigger();

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input')!;
      fireEvent.change(input, { target: { value: 'Same frame, same pixels.' } });
      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));

      const detail = (annotation.mock.calls[0]?.[0] as CustomEvent<{
        bounds?: { x: number; y: number; width: number; height: number };
      }>).detail;
      expect(detail.bounds!.y).toBeCloseTo(322, 0);
      expect(detail.bounds!.height).toBeCloseTo(40, 0);
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
      observer.restore();
      restoreRect();
    }
  });
});
