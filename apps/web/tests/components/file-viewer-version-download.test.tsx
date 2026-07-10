// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFile } from '../../src/types';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

const {
  captureHostIframeSnapshotMock,
  downloadImageDataUrlMock,
  exportAsHtmlMock,
  exportAsPdfMock,
  exportAsZipMock,
  exportProjectAsHtmlMock,
  exportProjectImageDataUrlMock,
  exportProjectAsPdfMock,
  exportProjectAsZipMock,
  exportProjectScreenshotPdfMock,
  exportSnapshotAsPdfMock,
  imageDataUrlToBlobMock,
  isOpenDesignHostAvailableMock,
  prepareImageExportTargetMock,
  requestPreviewSnapshotMock,
} = vi.hoisted(() => ({
  captureHostIframeSnapshotMock: vi.fn(),
  downloadImageDataUrlMock: vi.fn(),
  exportAsHtmlMock: vi.fn(),
  exportAsPdfMock: vi.fn(),
  exportAsZipMock: vi.fn(),
  exportProjectAsHtmlMock: vi.fn(),
  exportProjectImageDataUrlMock: vi.fn(),
  exportProjectAsPdfMock: vi.fn(),
  exportProjectAsZipMock: vi.fn(),
  exportProjectScreenshotPdfMock: vi.fn(),
  exportSnapshotAsPdfMock: vi.fn(),
  imageDataUrlToBlobMock: vi.fn(),
  isOpenDesignHostAvailableMock: vi.fn(() => false),
  prepareImageExportTargetMock: vi.fn(),
  requestPreviewSnapshotMock: vi.fn(),
}));

vi.mock('../../src/runtime/exports', async () => {
  const actual = await vi.importActual<typeof import('../../src/runtime/exports')>(
    '../../src/runtime/exports',
  );
  return {
    ...actual,
    captureHostIframeSnapshot: captureHostIframeSnapshotMock,
    downloadImageDataUrl: downloadImageDataUrlMock,
    exportAsHtml: exportAsHtmlMock,
    exportAsPdf: exportAsPdfMock,
    exportAsZip: exportAsZipMock,
    exportProjectAsHtml: exportProjectAsHtmlMock,
    exportProjectImageDataUrl: exportProjectImageDataUrlMock,
    exportProjectAsPdf: exportProjectAsPdfMock,
    exportProjectAsZip: exportProjectAsZipMock,
    exportProjectScreenshotPdf: exportProjectScreenshotPdfMock,
    exportSnapshotAsPdf: exportSnapshotAsPdfMock,
    imageDataUrlToBlob: imageDataUrlToBlobMock,
    isOpenDesignHostAvailable: isOpenDesignHostAvailableMock,
    prepareImageExportTarget: prepareImageExportTargetMock,
    requestPreviewSnapshot: requestPreviewSnapshotMock,
  };
});

import { FileViewer } from '../../src/components/FileViewer';

function htmlFile(): ProjectFile {
  return {
    name: 'index.html',
    path: 'index.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Index',
      entry: 'index.html',
      renderer: 'html',
      exports: ['html'],
    },
  };
}

function cssRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (!match?.[1]) throw new Error(`Missing CSS rule for ${selector}`);
  return match[1];
}

function cssValue(rule: string, property: string): string {
  const match = new RegExp(`${property}\\s*:\\s*([^;]+);`).exec(rule);
  if (!match?.[1]) throw new Error(`Missing CSS property ${property}`);
  return match[1].trim();
}

function setupVersionFetch(file = htmlFile()) {
  const currentVersion = {
    id: 'v2',
    fileName: 'index.html',
    version: 2,
    label: 'Current checkpoint',
    createdAt: 1_725_000_000_000,
    source: 'manual',
    prompt: 'Current prompt',
    size: 42,
    mime: 'text/html',
    kind: 'html',
    current: true,
  };
  const priorVersion = {
    ...currentVersion,
    id: 'v1',
    version: 1,
    label: 'Prior checkpoint',
    prompt: 'Prior prompt',
    current: false,
  };
  const priorContent =
    '<html><body><main style="background:#d16646;color:white">Prior colored version</main></body></html>';
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/projects/project-1/files/index.html/versions' && method === 'GET') {
      return new Response(JSON.stringify({ file, versions: [currentVersion, priorVersion] }), { status: 200 });
    }
    if (url === '/api/projects/project-1/files/index.html/versions/v1' && method === 'GET') {
      return new Response(JSON.stringify({ version: priorVersion, content: priorContent }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { currentVersion, fetchMock, file, priorContent, priorVersion };
}

async function renderVersionDialog(file = htmlFile(), selected: 'current' | 'prior' = 'prior') {
  render(
    <FileViewer
      projectId="project-1"
      projectKind="prototype"
      file={file}
      liveHtml="<html><body><h1>Current</h1></body></html>"
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Versions' }));
  const versionDialog = await screen.findByRole('dialog', { name: 'Versions' });
  if (selected === 'prior') {
    fireEvent.click(within(versionDialog).getByRole('option', { name: /Prior prompt/ }));
  }
  const version = selected === 'prior' ? 1 : 2;
  await waitFor(() => {
    expect(within(versionDialog).getByRole('button', { name: `Download Version ${version}` })).toBeTruthy();
  });
  return versionDialog;
}

function openVersionDownloadMenu(versionDialog: HTMLElement, version = 1) {
  fireEvent.click(within(versionDialog).getByRole('button', { name: `Download Version ${version}` }));
}

describe('FileViewer version download actions', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    isOpenDesignHostAvailableMock.mockReturnValue(false);
    vi.unstubAllGlobals();
  });

  it('routes current version PDFs through the main download PDF exporter', async () => {
    isOpenDesignHostAvailableMock.mockReturnValue(true);
    exportProjectScreenshotPdfMock.mockResolvedValueOnce({ ok: true });
    const { file } = setupVersionFetch();
    const versionDialog = await renderVersionDialog(file, 'current');

    openVersionDownloadMenu(versionDialog, 2);
    fireEvent.click(within(versionDialog).getByRole('menuitem', { name: 'Export as PDF' }));

    await waitFor(() => {
      expect(exportProjectScreenshotPdfMock).toHaveBeenCalledWith(expect.objectContaining({
        deck: false,
        fileName: 'index.html',
        projectId: 'project-1',
        title: 'index',
      }));
    });
    expect(exportProjectScreenshotPdfMock.mock.calls[0]?.[0]).not.toHaveProperty('versionId');
    expect(requestPreviewSnapshotMock).not.toHaveBeenCalled();
    expect(exportSnapshotAsPdfMock).not.toHaveBeenCalled();
    expect(exportProjectAsPdfMock).not.toHaveBeenCalled();
    expect(exportAsPdfMock).not.toHaveBeenCalled();
  });

  it('routes historical version PDFs through the main download PDF exporter', async () => {
    isOpenDesignHostAvailableMock.mockReturnValue(true);
    exportProjectScreenshotPdfMock.mockResolvedValueOnce({ ok: true });
    const { file } = setupVersionFetch();
    const versionDialog = await renderVersionDialog(file);

    openVersionDownloadMenu(versionDialog);
    fireEvent.click(within(versionDialog).getByRole('menuitem', { name: 'Export as PDF' }));

    await waitFor(() => {
      expect(exportProjectScreenshotPdfMock).toHaveBeenCalledWith(expect.objectContaining({
        deck: false,
        fileName: 'index.html',
        projectId: 'project-1',
        title: 'index-v1',
        versionId: 'v1',
      }));
    });
    expect(requestPreviewSnapshotMock).not.toHaveBeenCalled();
    expect(captureHostIframeSnapshotMock).not.toHaveBeenCalled();
    expect(exportSnapshotAsPdfMock).not.toHaveBeenCalled();
    expect(exportAsPdfMock).not.toHaveBeenCalled();
  });

  it('shows main export errors for historical version PDFs', async () => {
    isOpenDesignHostAvailableMock.mockReturnValue(true);
    exportProjectScreenshotPdfMock.mockResolvedValueOnce({ ok: false, error: 'version renderer failed' });
    const { file } = setupVersionFetch();
    const versionDialog = await renderVersionDialog(file);

    openVersionDownloadMenu(versionDialog);
    fireEvent.click(within(versionDialog).getByRole('menuitem', { name: 'Export as PDF' }));

    expect(await screen.findByText(/version renderer failed/)).toBeTruthy();
    expect(requestPreviewSnapshotMock).not.toHaveBeenCalled();
    expect(captureHostIframeSnapshotMock).not.toHaveBeenCalled();
    expect(exportSnapshotAsPdfMock).not.toHaveBeenCalled();
    expect(exportAsPdfMock).not.toHaveBeenCalled();
  });

  it('does not show a close button while a version export is still running', async () => {
    isOpenDesignHostAvailableMock.mockReturnValue(true);
    exportProjectScreenshotPdfMock.mockReturnValueOnce(new Promise(() => {}));
    const { file } = setupVersionFetch();
    const versionDialog = await renderVersionDialog(file);

    openVersionDownloadMenu(versionDialog);
    fireEvent.click(within(versionDialog).getByRole('menuitem', { name: 'Export as PDF' }));

    const toastMessage = await screen.findByText(/Exporting/);
    const toast = toastMessage.closest('.od-toast');
    expect(toast).toBeTruthy();
    expect(within(toast as HTMLElement).queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it.each([
    ['Export as standalone HTML', exportProjectAsHtmlMock],
    ['Download as .zip', exportProjectAsZipMock],
  ] as const)('shows a loading toast while running the version %s action', async (menuItemName, exporter) => {
    exporter.mockReturnValueOnce(new Promise(() => {}));
    const { file } = setupVersionFetch();
    const versionDialog = await renderVersionDialog(file);

    openVersionDownloadMenu(versionDialog);
    fireEvent.click(within(versionDialog).getByRole('menuitem', { name: menuItemName }));

    await waitFor(() => {
      expect(exporter).toHaveBeenCalled();
    });
    const toastMessage = await screen.findByText(/Exporting/);
    const toast = toastMessage.closest('.od-toast');
    expect(toast).toBeTruthy();
    expect(within(toast as HTMLElement).queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('exports historical version images through the main image exporter', async () => {
    isOpenDesignHostAvailableMock.mockReturnValue(true);
    exportProjectImageDataUrlMock.mockResolvedValueOnce({
      ok: true,
      snapshot: { dataUrl: 'data:image/png;base64,c25hcHNob3Q=', w: 1, h: 1 },
    });
    imageDataUrlToBlobMock.mockResolvedValueOnce(new Blob(['snapshot'], { type: 'image/png' }));
    prepareImageExportTargetMock.mockResolvedValueOnce({
      filename: 'index-v1.png',
      method: 'download',
      save: vi.fn(),
    });
    const { file } = setupVersionFetch();
    const versionDialog = await renderVersionDialog(file);

    openVersionDownloadMenu(versionDialog);
    fireEvent.click(within(versionDialog).getByRole('menuitem', { name: 'Export as image' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Versions' })).toBeNull();
    });
    const imageDialog = await screen.findByRole('dialog', { name: 'Export as image' });
    fireEvent.click(within(imageDialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(exportProjectImageDataUrlMock).toHaveBeenCalledWith(expect.objectContaining({
        deck: false,
        fileName: 'index.html',
        projectId: 'project-1',
        versionId: 'v1',
      }));
    });
    expect(imageDataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,c25hcHNob3Q=', 'png');
    expect(prepareImageExportTargetMock).toHaveBeenCalledWith('index-v1', 'png', { useNativePicker: false });
    expect(downloadImageDataUrlMock).toHaveBeenCalledWith('data:image/png;base64,c25hcHNob3Q=', 'index-v1.png');
    expect(requestPreviewSnapshotMock).not.toHaveBeenCalled();
  });

  it('opens the main image export dialog for the current version', async () => {
    const { file } = setupVersionFetch();
    const versionDialog = await renderVersionDialog(file, 'current');

    openVersionDownloadMenu(versionDialog, 2);
    fireEvent.click(within(versionDialog).getByRole('menuitem', { name: 'Export as image' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Versions' })).toBeNull();
    });
    expect(await screen.findByRole('dialog', { name: 'Export as image' })).toBeTruthy();
    expect(requestPreviewSnapshotMock).not.toHaveBeenCalled();
  });

  it('routes version HTML and ZIP actions through the selected version content', async () => {
    const { file, priorContent } = setupVersionFetch();
    const versionDialog = await renderVersionDialog(file);

    openVersionDownloadMenu(versionDialog);
    fireEvent.click(within(versionDialog).getByRole('menuitem', { name: 'Export as standalone HTML' }));

    await waitFor(() => {
      expect(exportProjectAsHtmlMock).toHaveBeenCalledWith(expect.objectContaining({
        fallbackHtml: priorContent,
        fallbackTitle: 'index-v1',
        filePath: 'index.html',
        projectId: 'project-1',
        versionId: 'v1',
      }));
    });

    openVersionDownloadMenu(versionDialog);
    fireEvent.click(within(versionDialog).getByRole('menuitem', { name: 'Download as .zip' }));

    await waitFor(() => {
      expect(exportProjectAsZipMock).toHaveBeenCalledWith(expect.objectContaining({
        fallbackHtml: priorContent,
        fallbackTitle: 'index-v1',
        filePath: 'index.html',
        projectId: 'project-1',
        versionId: 'v1',
      }));
    });
    expect(exportAsHtmlMock).not.toHaveBeenCalled();
    expect(exportAsZipMock).not.toHaveBeenCalled();
  });

  it('routes current version HTML and ZIP actions through the main download exporters', async () => {
    const { file } = setupVersionFetch();
    const versionDialog = await renderVersionDialog(file, 'current');

    openVersionDownloadMenu(versionDialog, 2);
    fireEvent.click(within(versionDialog).getByRole('menuitem', { name: 'Export as standalone HTML' }));

    await waitFor(() => {
      expect(exportProjectAsHtmlMock).toHaveBeenCalledWith(expect.objectContaining({
        fallbackHtml: '<html><body><h1>Current</h1></body></html>',
        fallbackTitle: 'index',
        filePath: 'index.html',
        projectId: 'project-1',
      }));
    });
    expect(exportProjectAsHtmlMock.mock.calls[0]?.[0]).not.toHaveProperty('versionId');

    openVersionDownloadMenu(versionDialog, 2);
    fireEvent.click(within(versionDialog).getByRole('menuitem', { name: 'Download as .zip' }));

    await waitFor(() => {
      expect(exportProjectAsZipMock).toHaveBeenCalledWith(expect.objectContaining({
        fallbackHtml: '<html><body><h1>Current</h1></body></html>',
        fallbackTitle: 'index',
        filePath: 'index.html',
        projectId: 'project-1',
      }));
    });
    expect(exportProjectAsZipMock.mock.calls[0]?.[0]).not.toHaveProperty('versionId');
    expect(exportAsHtmlMock).not.toHaveBeenCalled();
    expect(exportAsZipMock).not.toHaveBeenCalled();
  });

  it('keeps version export popovers and feedback above the preview modal layers', () => {
    const css = readExpandedIndexCss();
    expect(Number(cssValue(cssRule(css, '.file-version-head'), 'z-index'))).toBeGreaterThan(10);
    expect(Number(cssValue(cssRule(css, '.file-version-download-menu.share-menu-popover'), 'z-index'))).toBeGreaterThan(
      Number(cssValue(cssRule(css, '.file-version-preview-overlay'), 'z-index')),
    );
    expect(Number(cssValue(cssRule(css, '.viewer-modal-backdrop.file-version-export-backdrop.modal-backdrop'), 'z-index'))).toBeGreaterThan(
      Number(cssValue(cssRule(css, '.file-version-backdrop.modal-backdrop'), 'z-index')),
    );
    expect(Number(cssValue(cssRule(css, '.od-toast.file-version-export-toast.placement-top'), 'z-index'))).toBeGreaterThan(
      Number(cssValue(cssRule(css, '.file-version-backdrop.modal-backdrop'), 'z-index')),
    );
  });
});
