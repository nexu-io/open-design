// @vitest-environment jsdom

// Issue #4064: the srcDoc foreignObject snapshot bridge legitimately fails on
// real-world artifacts (Chromium often refuses to rasterize <foreignObject>
// HTML loaded via <img>). A failed screenshot must not dead-end an annotation
// that carries its own meaning without pixels (typed note / attached images) —
// the retry warning is a dead end because retrying the same pipeline fails the
// same way. Ink/box-only annotations still block: without the bitmap there is
// nothing to send.

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PreviewDrawOverlay } from '../../src/components/PreviewDrawOverlay';
import { requestPreviewSnapshot } from '../../src/runtime/exports';

vi.mock('../../src/runtime/exports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/exports')>();
  return {
    ...actual,
    // The snapshot bridge fails — the shape every foreignObject failure mode
    // (empty-render, snapshot image failed, timeout) collapses into.
    requestPreviewSnapshot: vi.fn(async () => null),
  };
});

let restoreRect: (() => void) | null = null;

beforeEach(() => {
  // jsdom reports 0x0 client rects, which would collapse the drawn selection
  // box into nothing. Give the ink canvas a real-looking rect so pointer
  // events produce a valid normalized box, like in a browser.
  const rectSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 320,
      height: 200,
      right: 320,
      bottom: 200,
      toJSON: () => ({}),
    } as DOMRect);
  restoreRect = () => rectSpy.mockRestore();
});

afterEach(() => {
  cleanup();
  restoreRect?.();
  restoreRect = null;
  vi.mocked(requestPreviewSnapshot).mockClear();
});

function drawSelectionBox(canvas: HTMLCanvasElement) {
  fireEvent.pointerDown(canvas, { clientX: 40, clientY: 30, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 220, clientY: 150, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 220, clientY: 150, pointerId: 1 });
}

describe('PreviewDrawOverlay capture fallback (issue #4064)', () => {
  it('sends a box annotation with a typed note even when the snapshot fails', async () => {
    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (result: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole, getByText } = render(
        <PreviewDrawOverlay active>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" />
        </PreviewDrawOverlay>,
      );

      const canvas = container.querySelector<HTMLCanvasElement>('canvas');
      expect(canvas).toBeTruthy();
      drawSelectionBox(canvas!);

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input');
      expect(input).toBeTruthy();
      fireEvent.change(input!, { target: { value: 'This section is missing its bar chart.' } });

      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      expect(annotation.mock.calls[0]?.[0]).toMatchObject({
        detail: expect.objectContaining({
          action: 'send',
          note: 'This section is missing its bar chart.',
          file: null,
        }),
      });
      // The user is told the annotation went out without its screenshot.
      await waitFor(() =>
        expect(
          getByText('Could not capture the preview. The annotation was sent without a screenshot.'),
        ).toBeTruthy(),
      );
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
    }
  });

  it('still blocks a box-only annotation with no note when the snapshot fails', async () => {
    const annotation = vi.fn();
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole, getByText } = render(
        <PreviewDrawOverlay active>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" />
        </PreviewDrawOverlay>,
      );

      const canvas = container.querySelector<HTMLCanvasElement>('canvas');
      expect(canvas).toBeTruthy();
      drawSelectionBox(canvas!);

      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() =>
        expect(
          getByText('Could not capture the preview. Try again to avoid sending only ink.'),
        ).toBeTruthy(),
      );
      expect(annotation).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
    }
  });
});
