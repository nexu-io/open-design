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

  it('clears the hover tooltip before the host compositor capture grabs the frame', async () => {
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
    // into <body>; mount it so the screenshot button's hover tooltip is real.
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

    const button = screen.getByTestId('screenshot-copy-button');
    fireEvent.pointerOver(button);
    expect(document.body.querySelector('.od-tooltip-layer')).not.toBeNull();

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
    // By the time the frame is captured, the tooltip is gone from the DOM.
    expect(document.body.querySelector('.od-tooltip-layer')).toBeNull();
  });
});
