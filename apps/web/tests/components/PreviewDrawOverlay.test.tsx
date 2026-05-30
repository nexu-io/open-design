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

describe('PreviewDrawOverlay', () => {
  it('uses the visible primary send action when Enter submits a note', async () => {
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
        action: 'send',
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
      expect(sendButton.disabled).toBe(true);
      expect(sendButton.title).toBe('Task running');
      expect(queueButton.disabled).toBe(false);

      fireEvent.keyDown(input!, { key: 'Enter' });
      fireEvent.click(sendButton);
      expect(annotation).not.toHaveBeenCalled();

      fireEvent.click(queueButton);
      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      expect(annotation.mock.calls[0]?.[0]).toMatchObject({
        detail: expect.objectContaining({ action: 'queue' }),
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
});
