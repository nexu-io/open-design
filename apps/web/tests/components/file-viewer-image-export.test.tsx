// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFile } from '../../src/types';

const {
  captureHostIframeSnapshotMock,
  downloadImageDataUrlMock,
  imageDataUrlToBlobMock,
  prepareImageExportTargetMock,
  requestPreviewSnapshotResultMock,
  saveImageBlobMock,
} = vi.hoisted(() => ({
  captureHostIframeSnapshotMock: vi.fn(),
  downloadImageDataUrlMock: vi.fn(),
  imageDataUrlToBlobMock: vi.fn(),
  prepareImageExportTargetMock: vi.fn(),
  requestPreviewSnapshotResultMock: vi.fn(),
  saveImageBlobMock: vi.fn(),
}));

vi.mock('../../src/runtime/exports', async () => {
  const actual = await vi.importActual<typeof import('../../src/runtime/exports')>(
    '../../src/runtime/exports',
  );
  return {
    ...actual,
    captureHostIframeSnapshot: captureHostIframeSnapshotMock,
    downloadImageDataUrl: downloadImageDataUrlMock,
    imageDataUrlToBlob: imageDataUrlToBlobMock,
    prepareImageExportTarget: prepareImageExportTargetMock,
    requestPreviewSnapshotResult: requestPreviewSnapshotResultMock,
  };
});

import { FileViewer } from '../../src/components/FileViewer';

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

function renderHtmlPreview() {
  const view = render(
    <FileViewer
      projectId="project-1"
      projectKind="prototype"
      file={htmlFile()}
      liveHtml="<html><body><main>Workspace</main></body></html>"
    />,
  );
  const { container } = view;
  const activeFrame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  expect(activeFrame.getAttribute('data-od-render-mode')).toBe('url-load');
  const srcDocFrame = container.querySelector<HTMLIFrameElement>('iframe[data-od-render-mode="srcdoc"]');
  expect(srcDocFrame).toBeTruthy();
  fireEvent.load(srcDocFrame as HTMLIFrameElement);
  return { ...view, activeFrame, srcDocFrame: srcDocFrame as HTMLIFrameElement };
}

async function openImageExportDialog() {
  fireEvent.click(screen.getByRole('button', { name: /download/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: /export as image/i }));
  expect(await screen.findByRole('dialog', { name: /export as image/i })).toBeTruthy();
}

async function waitForSaveButton() {
  const button = await screen.findByRole('button', { name: /^save$/i });
  await waitFor(() => {
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
  return button;
}

describe('FileViewer image export', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('portals the image export dialog above fixed chat composer layers', async () => {
    requestPreviewSnapshotResultMock.mockResolvedValueOnce({
      ok: true,
      snapshot: { dataUrl: 'data:image/png;base64,ok', w: 800, h: 600 },
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));

    const { container } = renderHtmlPreview();
    await openImageExportDialog();

    const backdrop = document.body.querySelector('.viewer-modal-backdrop');
    expect(backdrop).toBeTruthy();
    expect(backdrop?.classList.contains('image-export-backdrop')).toBe(true);
    expect(backdrop?.parentElement).toBe(document.body);
    expect(container.querySelector('.viewer-modal-backdrop')).toBeNull();
    await waitFor(() => {
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,ok', 'png');
    });
  });

  it('waits for the download menu to close before capturing host pixels', async () => {
    captureHostIframeSnapshotMock.mockImplementationOnce(async () => {
      expect(screen.queryByRole('menu')).toBeNull();
      return {
        dataUrl: 'data:image/png;base64,host',
        w: 800,
        h: 600,
      };
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));

    renderHtmlPreview();
    fireEvent.click(screen.getByRole('button', { name: /download/i }));
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: /export as image/i }));

    expect(screen.queryByRole('menu')).toBeNull();
    expect(captureHostIframeSnapshotMock).not.toHaveBeenCalled();

    expect(await screen.findByRole('dialog', { name: /export as image/i })).toBeTruthy();
    await waitFor(() => {
      expect(captureHostIframeSnapshotMock).toHaveBeenCalledTimes(1);
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,host', 'png');
    });
  });

  it('lets users choose an image format before saving URL-loaded HTML previews', async () => {
    const pngBlob = new Blob(['png'], { type: 'image/png' });
    const imageBlob = new Blob(['jpeg'], { type: 'image/jpeg' });
    requestPreviewSnapshotResultMock.mockResolvedValueOnce({
      ok: true,
      snapshot: { dataUrl: 'data:image/png;base64,ok', w: 800, h: 600 },
    });
    imageDataUrlToBlobMock.mockImplementation(async (_dataUrl: string, format: 'png' | 'jpeg' | 'webp') => {
      if (format === 'jpeg') return imageBlob;
      return pngBlob;
    });
    prepareImageExportTargetMock.mockResolvedValueOnce({
      filename: 'workspace.jpg',
      method: 'picker',
      save: saveImageBlobMock,
    });

    const { activeFrame } = renderHtmlPreview();
    await openImageExportDialog();
    expect(screen.getByRole('radio', { name: 'PNG' })).toBeTruthy();

    await waitFor(() => {
      expect(requestPreviewSnapshotResultMock).toHaveBeenCalledWith(activeFrame, 1500);
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,ok', 'png');
    });
    await waitForSaveButton();

    fireEvent.click(screen.getByRole('radio', { name: 'JPEG' }));
    await waitFor(() => {
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,ok', 'jpeg');
    });

    fireEvent.click(await waitForSaveButton());
    fireEvent.load(activeFrame as HTMLIFrameElement);

    await waitFor(() => {
      expect(prepareImageExportTargetMock).toHaveBeenCalledWith('workspace', 'jpeg', { useNativePicker: false });
    });
    expect(requestPreviewSnapshotResultMock).toHaveBeenCalledTimes(1);
    expect(saveImageBlobMock).toHaveBeenCalledWith(imageBlob);
    expect(screen.getByText('workspace.jpg')).toBeTruthy();
  });

  it('keeps the Save label stable while a format change prepares the next image', async () => {
    const pngBlob = new Blob(['png'], { type: 'image/png' });
    let resolveJpegBlob: ((blob: Blob) => void) | undefined;
    requestPreviewSnapshotResultMock.mockResolvedValueOnce({
      ok: true,
      snapshot: { dataUrl: 'data:image/png;base64,ok', w: 800, h: 600 },
    });
    imageDataUrlToBlobMock
      .mockResolvedValueOnce(pngBlob)
      .mockImplementationOnce(async () => new Promise<Blob>((resolve) => {
        resolveJpegBlob = resolve;
      }));

    renderHtmlPreview();
    await openImageExportDialog();

    await waitForSaveButton();

    fireEvent.click(screen.getByRole('radio', { name: 'JPEG' }));
    await waitFor(() => {
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,ok', 'jpeg');
    });

    expect(screen.getByRole('button', { name: /^save$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /saving image/i })).toBeNull();
    expect((screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement).disabled).toBe(true);

    resolveJpegBlob?.(new Blob(['jpeg'], { type: 'image/jpeg' }));
    await waitForSaveButton();
  });

  it('retries the srcDoc snapshot bridge before giving up on URL-loaded previews', async () => {
    const pngBlob = new Blob(['png'], { type: 'image/png' });
    let srcDocAttempts = 0;
    requestPreviewSnapshotResultMock.mockImplementation(async (iframe: HTMLIFrameElement) => {
      if (iframe.getAttribute('data-od-render-mode') === 'url-load') return { ok: false, reason: 'render-error' };
      srcDocAttempts += 1;
      if (srcDocAttempts === 1) return { ok: false, reason: 'render-error' };
      return {
        ok: true,
        snapshot: { dataUrl: 'data:image/png;base64,recovered', w: 800, h: 600 },
      };
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(pngBlob);

    const { srcDocFrame } = renderHtmlPreview();
    await openImageExportDialog();

    await waitFor(() => {
      expect(requestPreviewSnapshotResultMock).toHaveBeenCalledWith(srcDocFrame, 1500);
      expect(requestPreviewSnapshotResultMock).toHaveBeenCalledWith(srcDocFrame, 3000);
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,recovered', 'png');
    }, { timeout: 4000 });
  });

  it('captures the visible URL-loaded preview before falling back to the hidden srcDoc transport', async () => {
    const pngBlob = new Blob(['png'], { type: 'image/png' });
    requestPreviewSnapshotResultMock.mockImplementation(async (iframe: HTMLIFrameElement) => {
      if (iframe.getAttribute('data-od-render-mode') === 'url-load') {
        return {
          ok: true,
          snapshot: { dataUrl: 'data:image/png;base64,visible', w: 800, h: 600 },
        };
      }
      return { ok: false, reason: 'render-error' };
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(pngBlob);

    const { activeFrame, srcDocFrame } = renderHtmlPreview();
    await openImageExportDialog();

    await waitFor(() => {
      expect(requestPreviewSnapshotResultMock).toHaveBeenCalledWith(activeFrame, 1500);
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,visible', 'png');
    });
    expect(requestPreviewSnapshotResultMock).not.toHaveBeenCalledWith(srcDocFrame, 1500);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('uses the prepared PNG data URL for fallback downloads', async () => {
    const imageBlob = new Blob(['png'], { type: 'image/png' });
    requestPreviewSnapshotResultMock.mockResolvedValueOnce({
      ok: true,
      snapshot: { dataUrl: 'data:image/png;base64,ok', w: 800, h: 600 },
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(imageBlob);
    prepareImageExportTargetMock.mockResolvedValueOnce({
      filename: 'workspace.png',
      method: 'download',
      save: saveImageBlobMock,
    });

    renderHtmlPreview();
    await openImageExportDialog();
    fireEvent.click(await waitForSaveButton());

    await waitFor(() => {
      expect(prepareImageExportTargetMock).toHaveBeenCalledWith('workspace', 'png', { useNativePicker: false });
      expect(downloadImageDataUrlMock).toHaveBeenCalledWith('data:image/png;base64,ok', 'workspace.png');
    });
    expect(saveImageBlobMock).not.toHaveBeenCalled();
    expect(screen.getByText(/workspace\.png/)).toBeTruthy();
  });

  it('shows a "preview still loading" hint when the iframe is not ready yet', async () => {
    // Red spec for #3605: when the snapshot bridge hasn't booted yet
    // (e.g. user clicks "Export as image" before the preview iframe
    // finishes loading), surface an actionable retry message instead
    // of the generic capture-failed copy. Pre-fix, every failure
    // collapsed to the same alert and users couldn't tell wait-and-retry
    // apart from a fatal render error.
    requestPreviewSnapshotResultMock.mockResolvedValue({
      ok: false,
      reason: 'loading',
    });
    prepareImageExportTargetMock.mockResolvedValueOnce({
      filename: 'workspace.png',
      method: 'picker',
      save: saveImageBlobMock,
    });

    renderHtmlPreview();
    await openImageExportDialog();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        'Preview is still loading. Please wait a moment and try again.',
      );
    }, { timeout: 4000 });
    expect((screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(prepareImageExportTargetMock).not.toHaveBeenCalled();
    expect(imageDataUrlToBlobMock).not.toHaveBeenCalled();
    expect(saveImageBlobMock).not.toHaveBeenCalled();
  });

  it('keeps the generic capture-failed copy for fatal snapshot failures', async () => {
    // Three reasons share the generic copy (timeout / render-error /
    // post-message-error) because the user's recovery path is the same
    // for all of them. We assert just one here and let the pure helper
    // unit tests in `runtime/exports.test.ts` lock the per-reason
    // routing to keep this integration test focused on UI wiring.
    requestPreviewSnapshotResultMock.mockResolvedValue({
      ok: false,
      reason: 'render-error',
      error: 'canvas tainted by cross-origin image',
    });
    prepareImageExportTargetMock.mockResolvedValueOnce({
      filename: 'workspace.png',
      method: 'picker',
      save: saveImageBlobMock,
    });

    renderHtmlPreview();
    await openImageExportDialog();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        "Image capture failed. Please try again or use your browser's screenshot tool.",
      );
    }, { timeout: 4000 });
    expect((screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(prepareImageExportTargetMock).not.toHaveBeenCalled();
    expect(imageDataUrlToBlobMock).not.toHaveBeenCalled();
    expect(saveImageBlobMock).not.toHaveBeenCalled();
  });

  it('does not write the save target when the captured image is empty', async () => {
    requestPreviewSnapshotResultMock.mockResolvedValueOnce({
      ok: true,
      snapshot: { dataUrl: 'data:image/png;base64,ok', w: 800, h: 600 },
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(new Blob([]));
    prepareImageExportTargetMock.mockResolvedValueOnce({
      filename: 'workspace.png',
      method: 'picker',
      save: saveImageBlobMock,
    });

    renderHtmlPreview();
    await openImageExportDialog();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        "Image capture failed. Please try again or use your browser's screenshot tool.",
      );
    }, { timeout: 4000 });
    expect((screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,ok', 'png');
    expect(prepareImageExportTargetMock).not.toHaveBeenCalled();
    expect(saveImageBlobMock).not.toHaveBeenCalled();
  });
});
