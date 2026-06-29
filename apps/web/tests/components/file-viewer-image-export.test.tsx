// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFile } from '../../src/types';

const {
  captureHostIframeSnapshotMock,
  downloadImageDataUrlMock,
  exportProjectImageDataUrlMock,
  imageDataUrlToBlobMock,
  isOpenDesignHostAvailableMock,
  prepareImageExportTargetMock,
  requestPreviewSnapshotMock,
  saveImageBlobMock,
} = vi.hoisted(() => ({
  captureHostIframeSnapshotMock: vi.fn(),
  downloadImageDataUrlMock: vi.fn(),
  exportProjectImageDataUrlMock: vi.fn(),
  imageDataUrlToBlobMock: vi.fn(),
  // Default: no desktop host, so existing tests exercise the host-snapshot
  // fallback path exactly as before. The runtime-deck test flips this on.
  isOpenDesignHostAvailableMock: vi.fn(() => false),
  prepareImageExportTargetMock: vi.fn(),
  requestPreviewSnapshotMock: vi.fn(),
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
    exportProjectImageDataUrl: exportProjectImageDataUrlMock,
    imageDataUrlToBlob: imageDataUrlToBlobMock,
    isOpenDesignHostAvailable: isOpenDesignHostAvailableMock,
    prepareImageExportTarget: prepareImageExportTargetMock,
    requestPreviewSnapshot: requestPreviewSnapshotMock,
  };
});

import { FileViewer } from '../../src/components/FileViewer';

const CAPTURE_FAILED_TEXT =
  "Image capture failed. Please try again or use your browser's screenshot tool.";

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

// The modal no longer renders eagerly on open: the user picks a format, then
// Save closes the modal and runs the capture → download/save behind the portaled
// export toast (unified with the PPTX/PDF flow). Each test drives Save explicitly.
async function clickSave() {
  fireEvent.click(await waitForSaveButton());
}

describe('FileViewer image export', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('portals the image export dialog above fixed chat composer layers', async () => {
    requestPreviewSnapshotMock.mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,ok',
      w: 800,
      h: 600,
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));

    const { container } = renderHtmlPreview();
    await openImageExportDialog();

    const backdrop = document.body.querySelector('.viewer-modal-backdrop');
    expect(backdrop).toBeTruthy();
    expect(backdrop?.classList.contains('image-export-backdrop')).toBe(true);
    expect(backdrop?.parentElement).toBe(document.body);
    expect(container.querySelector('.viewer-modal-backdrop')).toBeNull();

    // Capture runs on Save (not eagerly on open).
    await clickSave();
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
    // Opening the dialog must not capture; capture is deferred until Save.
    expect(captureHostIframeSnapshotMock).not.toHaveBeenCalled();

    expect(await screen.findByRole('dialog', { name: /export as image/i })).toBeTruthy();
    await clickSave();
    await waitFor(() => {
      expect(captureHostIframeSnapshotMock).toHaveBeenCalledTimes(1);
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,host', 'png');
    });
  });

  it('lets users choose an image format before saving URL-loaded HTML previews', async () => {
    const pngBlob = new Blob(['png'], { type: 'image/png' });
    const imageBlob = new Blob(['jpeg'], { type: 'image/jpeg' });
    requestPreviewSnapshotMock.mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,ok',
      w: 800,
      h: 600,
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

    // Pick the format BEFORE saving — the chosen format drives the single capture.
    fireEvent.click(screen.getByRole('radio', { name: 'JPEG' }));
    await clickSave();

    await waitFor(() => {
      expect(requestPreviewSnapshotMock).toHaveBeenCalledWith(activeFrame, 1500);
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,ok', 'jpeg');
      expect(prepareImageExportTargetMock).toHaveBeenCalledWith('workspace', 'jpeg', { useNativePicker: false });
    });
    // Captured exactly once — no eager capture on open or on format change.
    expect(requestPreviewSnapshotMock).toHaveBeenCalledTimes(1);
    expect(saveImageBlobMock).toHaveBeenCalledWith(imageBlob);
    expect(await screen.findByText('Image saved')).toBeTruthy();
  });

  it('does not capture eagerly on open or on format change', async () => {
    // The old modal captured a preview on open and re-rendered it on every format
    // switch (a "preparing" state that disabled Save). The new modal defers all
    // capture work to Save, so switching format is free and Save stays ready.
    renderHtmlPreview();
    await openImageExportDialog();

    const save = await waitForSaveButton();
    expect((save as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('radio', { name: 'JPEG' }));

    expect(requestPreviewSnapshotMock).not.toHaveBeenCalled();
    expect(captureHostIframeSnapshotMock).not.toHaveBeenCalled();
    expect(imageDataUrlToBlobMock).not.toHaveBeenCalled();

    const saveAfter = screen.getByRole('button', { name: /^save$/i });
    expect((saveAfter as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /saving image/i })).toBeNull();
  });

  it('retries the srcDoc snapshot bridge before giving up on URL-loaded previews', async () => {
    const pngBlob = new Blob(['png'], { type: 'image/png' });
    let srcDocAttempts = 0;
    requestPreviewSnapshotMock.mockImplementation(async (iframe: HTMLIFrameElement) => {
      if (iframe.getAttribute('data-od-render-mode') === 'url-load') return null;
      srcDocAttempts += 1;
      if (srcDocAttempts === 1) return null;
      return {
        dataUrl: 'data:image/png;base64,recovered',
        w: 800,
        h: 600,
      };
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(pngBlob);

    const { srcDocFrame } = renderHtmlPreview();
    await openImageExportDialog();
    await clickSave();

    await waitFor(() => {
      expect(requestPreviewSnapshotMock).toHaveBeenCalledWith(srcDocFrame, 1500);
      expect(requestPreviewSnapshotMock).toHaveBeenCalledWith(srcDocFrame, 3000);
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,recovered', 'png');
    }, { timeout: 4000 });
  });

  it('captures the visible URL-loaded preview before falling back to the hidden srcDoc transport', async () => {
    const pngBlob = new Blob(['png'], { type: 'image/png' });
    requestPreviewSnapshotMock.mockImplementation(async (iframe: HTMLIFrameElement) => {
      if (iframe.getAttribute('data-od-render-mode') === 'url-load') {
        return {
          dataUrl: 'data:image/png;base64,visible',
          w: 800,
          h: 600,
        };
      }
      return null;
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(pngBlob);

    const { activeFrame, srcDocFrame } = renderHtmlPreview();
    await openImageExportDialog();
    await clickSave();

    await waitFor(() => {
      expect(requestPreviewSnapshotMock).toHaveBeenCalledWith(activeFrame, 1500);
      expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,visible', 'png');
    });
    expect(requestPreviewSnapshotMock).not.toHaveBeenCalledWith(srcDocFrame, 1500);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('uses the prepared PNG data URL for fallback downloads', async () => {
    const imageBlob = new Blob(['png'], { type: 'image/png' });
    requestPreviewSnapshotMock.mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,ok',
      w: 800,
      h: 600,
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(imageBlob);
    prepareImageExportTargetMock.mockResolvedValueOnce({
      filename: 'workspace.png',
      method: 'download',
      save: saveImageBlobMock,
    });

    renderHtmlPreview();
    await openImageExportDialog();
    await clickSave();

    await waitFor(() => {
      expect(prepareImageExportTargetMock).toHaveBeenCalledWith('workspace', 'png', { useNativePicker: false });
      expect(downloadImageDataUrlMock).toHaveBeenCalledWith('data:image/png;base64,ok', 'workspace.png');
    });
    expect(saveImageBlobMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Download started')).toBeTruthy();
  });

  it('does not create a save target when snapshot capture fails', async () => {
    requestPreviewSnapshotMock.mockResolvedValue(null);
    prepareImageExportTargetMock.mockResolvedValueOnce({
      filename: 'workspace.png',
      method: 'picker',
      save: saveImageBlobMock,
    });

    renderHtmlPreview();
    await openImageExportDialog();
    await clickSave();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(CAPTURE_FAILED_TEXT);
    }, { timeout: 4000 });
    expect(prepareImageExportTargetMock).not.toHaveBeenCalled();
    expect(imageDataUrlToBlobMock).not.toHaveBeenCalled();
    expect(saveImageBlobMock).not.toHaveBeenCalled();
  });

  it('does not write the save target when the captured image is empty', async () => {
    requestPreviewSnapshotMock.mockResolvedValueOnce({
      dataUrl: 'data:image/png;base64,ok',
      w: 800,
      h: 600,
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(new Blob([]));
    prepareImageExportTargetMock.mockResolvedValueOnce({
      filename: 'workspace.png',
      method: 'picker',
      save: saveImageBlobMock,
    });

    renderHtmlPreview();
    await openImageExportDialog();
    await clickSave();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(CAPTURE_FAILED_TEXT);
    }, { timeout: 4000 });
    expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,ok', 'png');
    expect(prepareImageExportTargetMock).not.toHaveBeenCalled();
    expect(saveImageBlobMock).not.toHaveBeenCalled();
  });

  it('Copy screenshot of a runtime-managed deck uses the visible snapshot, not off-screen slide 0', async () => {
    // A `<deck-stage>` / `data-screen-label` deck is exportable, but the viewer
    // doesn't track its active slide (no `class="slide"` → no slide-state
    // bridge). A current-slide capture must therefore use the visible host
    // snapshot (= the slide on screen), NOT off-screen-render slide 0 — otherwise
    // Copy screenshot always returns the cover regardless of where the user is.
    isOpenDesignHostAvailableMock.mockReturnValue(true);
    captureHostIframeSnapshotMock.mockResolvedValue({ dataUrl: 'data:image/png;base64,host', w: 1280, h: 720 });

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlFile()}
        liveHtml={
          '<deck-stage><section data-screen-label="01 Cover">A</section>' +
          '<section data-screen-label="02 Next">B</section></deck-stage>'
        }
      />,
    );

    fireEvent.click(await screen.findByTestId('screenshot-copy-button'));

    await waitFor(() => {
      expect(captureHostIframeSnapshotMock).toHaveBeenCalled();
    });
    // The untracked deck must NOT be off-screen-rendered (which would grab slide 0).
    expect(exportProjectImageDataUrlMock).not.toHaveBeenCalled();
  });
});
