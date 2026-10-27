// @vitest-environment jsdom

// OPEND-2849 / product copy S26: an export failure shows the S26a title + body
// ("导出失败" / "本次导出未完成，请重新尝试。") by default. Only an already
// localized, user-facing reason may replace it; raw technical strings thrown by
// the exporters (HTTP status lines, internal exceptions) must never reach the
// user.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProjectFile } from '../../src/types';

const {
  exportProjectAsHtmlMock,
  exportProjectImageDataUrlMock,
  exportProjectScreenshotPdfMock,
  imageDataUrlToBlobMock,
  isOpenDesignHostAvailableMock,
  prepareImageExportTargetMock,
  requestPreviewSnapshotMock,
  captureHostIframeSnapshotMock,
} = vi.hoisted(() => ({
  exportProjectAsHtmlMock: vi.fn(),
  exportProjectImageDataUrlMock: vi.fn(),
  exportProjectScreenshotPdfMock: vi.fn(),
  imageDataUrlToBlobMock: vi.fn(),
  isOpenDesignHostAvailableMock: vi.fn(() => false),
  prepareImageExportTargetMock: vi.fn(),
  requestPreviewSnapshotMock: vi.fn(),
  captureHostIframeSnapshotMock: vi.fn(),
}));

vi.mock('../../src/runtime/exports', async () => {
  const actual = await vi.importActual<typeof import('../../src/runtime/exports')>(
    '../../src/runtime/exports',
  );
  return {
    ...actual,
    captureHostIframeSnapshot: captureHostIframeSnapshotMock,
    exportProjectAsHtml: exportProjectAsHtmlMock,
    exportProjectImageDataUrl: exportProjectImageDataUrlMock,
    exportProjectScreenshotPdf: exportProjectScreenshotPdfMock,
    imageDataUrlToBlob: imageDataUrlToBlobMock,
    isOpenDesignHostAvailable: isOpenDesignHostAvailableMock,
    prepareImageExportTarget: prepareImageExportTargetMock,
    requestPreviewSnapshot: requestPreviewSnapshotMock,
  };
});

import { FileViewer } from '../../src/components/FileViewer';
import { I18nProvider } from '../../src/i18n';
import { zhCN } from '../../src/i18n/locales/zh-CN';

const S26A_TITLE = '导出失败';
const S26A_BODY = '本次导出未完成，请重新尝试。';

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

function stubVersionFetch(file: ProjectFile) {
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
  const priorVersion = { ...currentVersion, id: 'v1', version: 1, label: 'Prior checkpoint', prompt: 'Prior prompt', current: false };
  const priorContent = '<html><body><main>Prior version</main></body></html>';
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/projects/project-1/files/index.html/versions' && method === 'GET') {
      return new Response(JSON.stringify({ file, versions: [currentVersion, priorVersion] }), { status: 200 });
    }
    if (url === '/api/projects/project-1/files/index.html/versions/v1' && method === 'GET') {
      return new Response(JSON.stringify({ version: priorVersion, content: priorContent }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }));
}

async function openVersionMenu(selected: 'current' | 'prior') {
  const file = htmlFile();
  stubVersionFetch(file);
  render(
    <I18nProvider initial="zh-CN">
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={file}
        liveHtml="<html><body><h1>Current</h1></body></html>"
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: zhCN['fileViewer.versions.entry'] }));
  const versionDialog = await screen.findByRole('dialog', { name: zhCN['fileViewer.versions.title'] });
  if (selected === 'prior') {
    fireEvent.click(within(versionDialog).getByRole('option', { name: /Prior prompt/ }));
  }
  const version = selected === 'prior' ? '1' : '2';
  const downloadName = `${zhCN['fileViewer.download']} ${zhCN['fileViewer.versions.versionLabel'].replace('{version}', version)}`;
  fireEvent.click(await within(versionDialog).findByRole('button', { name: downloadName }));
  return versionDialog;
}

async function expectS26aToast(rawTechnicalText: RegExp) {
  const title = await screen.findByText(S26A_TITLE);
  const toast = title.closest('.od-toast') as HTMLElement | null;
  expect(toast).toBeTruthy();
  expect(within(toast as HTMLElement).getByText(S26A_BODY)).toBeTruthy();
  expect(document.body.textContent ?? '').not.toMatch(rawTechnicalText);
}

describe('FileViewer export failures never leak raw technical errors (OPEND-2849 S26)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    isOpenDesignHostAvailableMock.mockReturnValue(false);
    vi.unstubAllGlobals();
  });

  it('shows S26a instead of an exporter HTTP status error (standalone HTML)', async () => {
    exportProjectAsHtmlMock.mockRejectedValueOnce(new Error('html export request failed (500)'));
    const versionDialog = await openVersionMenu('current');
    fireEvent.click(within(versionDialog).getByRole('menuitem', { name: zhCN['fileViewer.exportHtml'] }));

    await waitFor(() => expect(exportProjectAsHtmlMock).toHaveBeenCalled());
    await expectS26aToast(/html export request failed/i);
  });

  it('shows S26a instead of a raw renderer error string (PDF)', async () => {
    isOpenDesignHostAvailableMock.mockReturnValue(true);
    exportProjectScreenshotPdfMock.mockResolvedValueOnce({ ok: false, error: 'version renderer failed' });
    const versionDialog = await openVersionMenu('prior');
    fireEvent.click(within(versionDialog).getByRole('menuitem', { name: zhCN['fileViewer.exportPdf'] }));

    await waitFor(() => expect(exportProjectScreenshotPdfMock).toHaveBeenCalled());
    await expectS26aToast(/version renderer failed/i);
  });

  it('shows S26a instead of a raw image-encoding exception (image export)', async () => {
    isOpenDesignHostAvailableMock.mockReturnValue(true);
    exportProjectImageDataUrlMock.mockResolvedValueOnce({
      ok: true,
      snapshot: { dataUrl: 'data:image/png;base64,c25hcHNob3Q=', w: 1, h: 1 },
    });
    imageDataUrlToBlobMock.mockRejectedValueOnce(new Error('Could not decode image snapshot'));
    const versionDialog = await openVersionMenu('prior');
    fireEvent.click(within(versionDialog).getByRole('menuitem', { name: zhCN['fileViewer.exportImage'] }));
    const imageDialog = await screen.findByRole('dialog', { name: zhCN['fileViewer.exportImage'] });
    fireEvent.click(within(imageDialog).getByRole('button', { name: zhCN['common.save'] }));

    await waitFor(() => expect(imageDataUrlToBlobMock).toHaveBeenCalled());
    await expectS26aToast(/could not decode image snapshot/i);
  });
});
