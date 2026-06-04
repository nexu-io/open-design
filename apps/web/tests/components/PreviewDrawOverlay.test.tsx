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
    const toolbar = container.querySelector<HTMLElement>('.preview-draw-toolbar');
    const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input');

    expect(canvas?.style.zIndex).toBe('80');
    expect(toolbar?.style.zIndex).toBe('91');
    expect(toolbar?.style.flexWrap).toBe('wrap');
    expect(toolbar?.style.left).toBe('calc(50% - 52px)');
    expect(toolbar?.style.maxWidth).toContain('100% - 144px');
    expect(input?.style.flexGrow).toBe('1');
    expect(input?.style.flexShrink).toBe('1');
    expect(input?.style.flexBasis).toBe('280px');
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

      const sendButton = getByRole('button', { name: 'Send' }) as HTMLButtonElement;
      const queueButton = getByRole('button', { name: 'Queue' }) as HTMLButtonElement;
      const addToInputButton = getByRole('button', { name: 'Add to input' }) as HTMLButtonElement;
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

      fireEvent.change(input!, { target: { value: 'Queue another note.' } });
      fireEvent.click(queueButton);
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

      fireEvent.click(getByRole('button', { name: 'Add to input' }));

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
