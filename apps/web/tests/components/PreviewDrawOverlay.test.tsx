// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PreviewDrawOverlay } from '../../src/components/PreviewDrawOverlay';
import { requestPreviewSnapshot } from '../../src/runtime/exports';

vi.mock('../../src/runtime/exports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/exports')>();
  return {
    ...actual,
    requestPreviewSnapshot: vi.fn(async () => ({ dataUrl: 'data:image/png;base64,AAAA', w: 10, h: 10 })),
  };
});

afterEach(() => {
  cleanup();
  vi.mocked(requestPreviewSnapshot).mockClear();
});

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
    measureText: vi.fn(() => ({ width: 0 })),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: '',
    font: '',
    strokeStyle: '',
  }) as unknown as CanvasRenderingContext2D) as unknown as HTMLCanvasElement['getContext']);
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) => {
    callback(new Blob(['png'], { type: 'image/png' }));
  });

  return () => {
    getContext.mockRestore();
    toBlob.mockRestore();
    if (originalImage) {
      Object.defineProperty(globalThis, 'Image', {
        configurable: true,
        value: originalImage,
        writable: true,
      });
    } else {
      delete (globalThis as { Image?: unknown }).Image;
    }
  };
}

describe('PreviewDrawOverlay', () => {
  it('keeps the draw toolbar responsive inside narrow preview surfaces', () => {
    const { container } = render(
      <PreviewDrawOverlay active>
        <div style={{ width: 320, height: 200 }} />
      </PreviewDrawOverlay>,
    );

    const canvas = container.querySelector<HTMLCanvasElement>('canvas');
    // The warning / attached-image strip / toolbar now share one bottom-anchored
    // dock, so the responsive positioning lives on the dock and they never
    // overlap regardless of how tall the toolbar wraps.
    const dock = container.querySelector<HTMLElement>('.preview-draw-dock');
    const toolbar = container.querySelector<HTMLElement>('.preview-draw-toolbar');
    const toolCluster = container.querySelector<HTMLElement>('.preview-draw-tool-cluster');
    const noteActions = container.querySelector<HTMLElement>('.preview-draw-note-actions');
    const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input');

    expect(canvas?.style.zIndex).toBe('80');
    expect(dock?.style.zIndex).toBe('91');
    expect(dock?.style.flexDirection).toBe('column');
    expect(dock?.style.left).toBe('calc(50% - 52px)');
    expect(dock?.style.maxWidth).toContain('100% - 144px');
    expect(toolbar?.style.flexWrap).toBe('wrap');
    expect(toolCluster?.style.flex).toBe('0 0 auto');
    expect(noteActions?.style.flex).toBe('1 1 360px');
    expect(noteActions?.style.minWidth).toBe('0px');
    expect(noteActions?.style.maxWidth).toBe('412px');
    expect(input?.style.flexGrow).toBe('1');
    expect(input?.style.flexShrink).toBe('1');
    expect(input?.style.flexBasis).toBe('220px');
    expect(input?.style.minWidth).toBe('0px');
    expect(input?.style.maxWidth).toBe('100%');
  });

  it('queues a note when Enter submits from the draw input', async () => {
    const annotation = vi.fn();
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container } = render(
        <PreviewDrawOverlay active>
          <div style={{ width: 320, height: 200 }} />
        </PreviewDrawOverlay>,
      );

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input');
      expect(input).toBeTruthy();

      fireEvent.change(input!, { target: { value: 'Please inspect this panel.' } });
      fireEvent.keyDown(input!, { key: 'Enter' });

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      expect(annotation.mock.calls[0]?.[0].detail).toMatchObject({
        action: 'queue',
        note: 'Please inspect this panel.',
      });
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
    }
  });

  it('does not submit a note when Enter confirms IME composition', () => {
    const annotation = vi.fn();
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container } = render(
        <PreviewDrawOverlay active>
          <div style={{ width: 320, height: 200 }} />
        </PreviewDrawOverlay>,
      );

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input');
      expect(input).toBeTruthy();

      fireEvent.change(input!, { target: { value: '检查这个面板' } });
      fireEvent.compositionStart(input!);
      fireEvent.keyDown(input!, { key: 'Enter', keyCode: 229 });

      expect(annotation).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
    }
  });

  it('disables only the primary send action when sending is blocked', async () => {
    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (result: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole } = render(
        <PreviewDrawOverlay active sendDisabled sendDisabledReason="Task running">
          <div style={{ width: 320, height: 200 }} />
        </PreviewDrawOverlay>,
      );

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input');
      expect(input).toBeTruthy();
      fireEvent.change(input!, { target: { value: 'Please queue this note.' } });

      // Send is the split button's default action; Queue and Add-to-input now
      // live in its dropdown, opened via the chevron.
      const sendButton = getByRole('button', { name: 'Send' }) as HTMLButtonElement;
      fireEvent.click(getByRole('button', { name: 'Submit options' }));
      const queueButton = getByRole('menuitemradio', { name: 'Queue' }) as HTMLButtonElement;
      const addToInputButton = getByRole('menuitemradio', { name: 'Add to input' }) as HTMLButtonElement;
      expect(sendButton.disabled).toBe(true);
      expect(sendButton.title).toBe('Task running');
      expect(queueButton.disabled).toBe(false);
      expect(addToInputButton.disabled).toBe(false);

      fireEvent.keyDown(input!, { key: 'Enter' });
      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      expect(annotation.mock.calls[0]?.[0]).toMatchObject({
        detail: expect.objectContaining({ action: 'queue' }),
      });

      fireEvent.click(sendButton);
      expect(annotation).toHaveBeenCalledTimes(1);

      // The dropdown stays open through this flow, so click the Queue item
      // directly (re-clicking the chevron would just toggle it shut).
      fireEvent.change(input!, { target: { value: 'Queue another note.' } });
      fireEvent.click(getByRole('menuitemradio', { name: 'Queue' }));
      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(2));
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
    }
  });

  it('can append a note to the composer input instead of queueing or sending it', async () => {
    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (result: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole } = render(
        <PreviewDrawOverlay active>
          <div style={{ width: 320, height: 200 }} />
        </PreviewDrawOverlay>,
      );

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input');
      expect(input).toBeTruthy();
      fireEvent.change(input!, { target: { value: 'Keep this in the input.' } });

      // Add-to-input is now a choice in the submit dropdown.
      fireEvent.click(getByRole('button', { name: 'Submit options' }));
      fireEvent.click(getByRole('menuitemradio', { name: 'Add to input' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      expect(annotation.mock.calls[0]?.[0]).toMatchObject({
        detail: expect.objectContaining({
          action: 'draft',
          note: 'Keep this in the input.',
        }),
      });
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
    }
  });

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

  it('accumulates multiple box selections and undoes them one at a time', () => {
    const { container, getByRole } = render(
      <PreviewDrawOverlay active>
        <div style={{ width: 320, height: 200 }} />
      </PreviewDrawOverlay>,
    );

    const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
    // jsdom reports a zero-size rect; give the canvas real geometry so pointer
    // fractions resolve to committable (non-degenerate) normalized boxes.
    canvas.getBoundingClientRect = () =>
      ({
        x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200,
        toJSON: () => ({}),
      }) as DOMRect;

    const undo = getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
    expect(undo.disabled).toBe(true);

    // Box-select is the default tool. Draw the first region.
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 60, clientY: 60, pointerId: 1 });
    expect(undo.disabled).toBe(false);

    // A second region must accumulate, not replace the first.
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 120, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 170, clientY: 170, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 170, clientY: 170, pointerId: 1 });

    // First undo removes only the latest box; one still remains.
    fireEvent.click(undo);
    expect(undo.disabled).toBe(false);
    // Second undo clears the remaining box.
    fireEvent.click(undo);
    expect(undo.disabled).toBe(true);
  });

  it('remembers the submit action chosen from the dropdown', async () => {
    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (result: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole } = render(
        <PreviewDrawOverlay active>
          <div style={{ width: 320, height: 200 }} />
        </PreviewDrawOverlay>,
      );

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input');
      fireEvent.change(input!, { target: { value: 'ship it' } });

      // Default main action is Send.
      expect(getByRole('button', { name: 'Send' })).toBeTruthy();

      // Pick Queue from the dropdown: it runs the action and becomes the new default.
      fireEvent.click(getByRole('button', { name: 'Submit options' }));
      fireEvent.click(getByRole('menuitemradio', { name: 'Queue' }));
      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      expect(annotation.mock.calls[0]?.[0]).toMatchObject({
        detail: expect.objectContaining({ action: 'queue' }),
      });

      // The split button's default action is now Queue.
      await waitFor(() => expect(getByRole('button', { name: 'Queue' })).toBeTruthy());
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
    }
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

  it('uses the postMessage scroll bridge for sandboxed preview iframes', () => {
    const { container } = render(
      <PreviewDrawOverlay active>
        <iframe title="preview" sandbox="allow-scripts allow-downloads" />
      </PreviewDrawOverlay>,
    );

    const canvas = container.querySelector('canvas');
    const iframe = container.querySelector('iframe');
    expect(canvas).toBeTruthy();
    expect(iframe?.contentWindow).toBeTruthy();

    const postMessage = vi.fn();
    Object.defineProperty(iframe!.contentWindow!, 'postMessage', {
      value: postMessage,
      configurable: true,
    });

    fireEvent.wheel(canvas!, {
      deltaX: 8,
      deltaY: 96,
    });

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'od:preview-scroll-by', left: 8, top: 96 },
      '*',
    );
  });

  it('falls back to the scroll bridge when direct frame scroll is cross-origin blocked', () => {
    const { container } = render(
      <PreviewDrawOverlay active>
        <iframe title="preview" />
      </PreviewDrawOverlay>,
    );

    const canvas = container.querySelector('canvas');
    const iframe = container.querySelector('iframe');
    expect(canvas).toBeTruthy();
    expect(iframe?.contentWindow).toBeTruthy();

    const postMessage = vi.fn();
    Object.defineProperty(iframe!.contentWindow!, 'postMessage', {
      value: postMessage,
      configurable: true,
    });
    Object.defineProperty(iframe!.contentWindow!, 'scrollBy', {
      get() {
        throw new DOMException('Blocked a frame from accessing a cross-origin frame.', 'SecurityError');
      },
      configurable: true,
    });

    fireEvent.wheel(canvas!, {
      deltaX: 4,
      deltaY: 72,
    });

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'od:preview-scroll-by', left: 4, top: 72 },
      '*',
    );
  });

  it('closes the draw toolbar from an explicit close button', async () => {
    const onActiveChange = vi.fn();
    const { getByRole } = render(
      <PreviewDrawOverlay active onActiveChange={onActiveChange}>
        <div style={{ width: 320, height: 200 }} />
      </PreviewDrawOverlay>,
    );

    fireEvent.click(getByRole('button', { name: 'Close' }));

    expect(onActiveChange).toHaveBeenCalledWith(false);
  });

  it('snapshots the srcDoc bridge iframe, not the visible URL-load frame', async () => {
    const snapshot = vi.mocked(requestPreviewSnapshot);
    const { getByRole } = render(
      <PreviewDrawOverlay active captureViewport>
        {/* URL-load frame is the visible/active one (e.g. a deck) but has no bridge */}
        <iframe title="url" data-od-active="true" />
        {/* srcDoc frame is mounted but hidden; it hosts the snapshot bridge */}
        <iframe title="srcdoc" data-od-render-mode="srcdoc" data-od-active="false" />
      </PreviewDrawOverlay>,
    );

    fireEvent.click(getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(snapshot).toHaveBeenCalled());
    const usedIframe = snapshot.mock.calls[0]?.[0] as HTMLIFrameElement;
    expect(usedIframe.getAttribute('data-od-render-mode')).toBe('srcdoc');
  });

  it('portals the draw toolbar out of the scaled/clipped device frame to the preview body', async () => {
    const { container } = render(
      <div className="viewer-body">
        <div className="comment-preview-layer">
          <div className="comment-frame-clip">
            <PreviewDrawOverlay active>
              <iframe title="preview" />
            </PreviewDrawOverlay>
          </div>
        </div>
      </div>,
    );

    const body = container.querySelector('.viewer-body')!;
    const iframe = body.querySelector('iframe')!;
    // The overlay wrap (and its ink canvas) stays inside the clipped device frame…
    const wrap = iframe.parentElement!;

    await waitFor(() => {
      const input = body.querySelector<HTMLInputElement>('.preview-draw-note-input');
      expect(input).toBeTruthy();
      // …but the toolbar is portaled out to the non-scrolling preview body, escaping
      // the clip so it can never be cut off by the device frame (issue #3455).
      expect(wrap.contains(input!)).toBe(false);
      expect(body.contains(input!)).toBe(true);
    });
  });

  it('hides draw chrome before a compositor annotation snapshot', async () => {
    const restoreCompositeMocks = installImageCompositeMocks();
    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (result: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    let host: HTMLElement | null = null;
    const captureSnapshot = vi.fn(async () => {
      expect(host?.querySelector('canvas')?.style.visibility).toBe('hidden');
      expect(host?.querySelector<HTMLElement>('.preview-draw-toolbar')?.style.visibility).toBe('hidden');
      return { dataUrl: 'data:image/png;base64,cG5n', w: 10, h: 10 };
    });

    try {
      const { container, getByRole } = render(
        <PreviewDrawOverlay active captureViewport captureSnapshot={captureSnapshot}>
          <div style={{ width: 320, height: 200 }} />
        </PreviewDrawOverlay>,
      );
      host = container;

      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(captureSnapshot).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      expect(container.querySelector<HTMLElement>('.preview-draw-toolbar')?.style.visibility).toBe('');
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
      restoreCompositeMocks();
    }
  });
});
