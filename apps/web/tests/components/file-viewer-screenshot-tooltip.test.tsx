// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFile } from '../../src/types';

const { captureHostIframeSnapshotMock, copyImageDataUrlToClipboardMock } = vi.hoisted(() => ({
  captureHostIframeSnapshotMock: vi.fn(),
  copyImageDataUrlToClipboardMock: vi.fn(),
}));

vi.mock('../../src/runtime/exports', async () => {
  const actual = await vi.importActual<typeof import('../../src/runtime/exports')>(
    '../../src/runtime/exports',
  );
  return {
    ...actual,
    captureHostIframeSnapshot: captureHostIframeSnapshotMock,
    copyImageDataUrlToClipboard: copyImageDataUrlToClipboardMock,
  };
});

import { FileViewer } from '../../src/components/FileViewer';
import { TooltipLayer } from '../../src/components/TooltipLayer';

function htmlFile(): ProjectFile {
  return {
    name: 'workspace.html',
    path: 'workspace.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Workspace',
      entry: 'workspace.html',
      renderer: 'html',
      exports: ['html'],
    },
  };
}

describe('FileViewer screenshot tooltip guard', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  /*
   * W129 note: this used to assert the tooltip node was GONE from the DOM,
   * because TooltipLayer unmounted its portal on hide. It no longer does —
   * the bubble stays mounted so the design's opacity transition
   * (`729fa43ce7:docs/design/chat-panel/src/components.css:2707`) has something
   * to run on. What actually protects the capture is unchanged in substance and
   * is what this test now pins: by the time the compositor grabs the frame the
   * bubble must PAINT NOTHING. Activation dismissal is deliberately instant
   * (`visibility: hidden`, no fade) precisely because a 100ms fade would still
   * be ~24% opaque two frames in, and that would print into the screenshot.
   */
  it('leaves the hover tooltip unpainted before the host compositor capture grabs the frame', async () => {
    captureHostIframeSnapshotMock.mockResolvedValue({
      dataUrl: 'data:image/png;base64,ok',
      w: 800,
      h: 600,
    });
    copyImageDataUrlToClipboardMock.mockResolvedValue('copied');

    const rafQueue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const flushFrame = async () => {
      const callbacks = rafQueue.splice(0);
      for (const cb of callbacks) cb(0);
      await Promise.resolve();
    };

    // TooltipLayer is an app-level component that portals the active tooltip
    // into <body>; mount it so the capture button's hover tooltip is real.
    render(
      <>
        <TooltipLayer />
        <FileViewer
          projectId="project-1"
          projectKind="prototype"
          file={htmlFile()}
          liveHtml="<html><body><main>Workspace</main></body></html>"
        />
      </>,
    );

    const bubble = () => {
      const node = document.body.querySelector('.od-tooltip-layer');
      if (!(node instanceof HTMLElement)) throw new Error('TooltipLayer never rendered a bubble');
      return node;
    };

    const button = screen.getByTestId('edit-screenshot-to-chat-button');
    fireEvent.pointerOver(button);
    // Probe that the guard can see something: the bubble is genuinely painted
    // while hovered, so the assertion after the capture is not vacuous.
    expect(bubble().style.visibility).toBe('visible');
    expect(bubble().style.opacity).toBe('1');

    fireEvent.click(button);
    await Promise.resolve();

    // The capture must not grab the frame until the dismissed tooltip has had a
    // chance to repaint away — i.e. not before any animation frame has elapsed.
    expect(captureHostIframeSnapshotMock).not.toHaveBeenCalled();

    await flushFrame();
    await flushFrame();

    await waitFor(() => {
      expect(captureHostIframeSnapshotMock).toHaveBeenCalled();
    });
    // By the time the frame is captured, the tooltip paints nothing: hidden
    // outright (not mid-fade) and out of the accessibility tree with it.
    expect(bubble().style.visibility).toBe('hidden');
    expect(bubble().style.opacity).toBe('0');
    expect(bubble().getAttribute('aria-hidden')).toBe('true');
  });
});
