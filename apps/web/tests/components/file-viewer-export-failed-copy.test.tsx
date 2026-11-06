// @vitest-environment jsdom

// OPEND-2849 / product copy doc S26a: an export that fails must surface the
// product-approved title AND body ("导出失败" + "本次导出未完成，请重新尝试。"),
// rendered the same way as S26c (Toast message + details).

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileViewer } from '../../src/components/FileViewer';
import { I18nProvider } from '../../src/i18n';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import type { ProjectFile } from '../../src/types';

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

function stubVersionFetchWithFailingContent(file: ProjectFile) {
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
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/projects/project-1/files/index.html/versions' && method === 'GET') {
      return new Response(JSON.stringify({ file, versions: [currentVersion, priorVersion] }), { status: 200 });
    }
    // The historical version's content request fails at the HTTP layer.
    if (url === '/api/projects/project-1/files/index.html/versions/v1' && method === 'GET') {
      return new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('FileViewer export failure copy (OPEND-2849 S26a)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the product title and body when a version export cannot load its content', async () => {
    const file = htmlFile();
    const fetchMock = stubVersionFetchWithFailingContent(file);
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
    fireEvent.click(within(versionDialog).getByRole('option', { name: /Prior prompt/ }));
    const downloadName = `${zhCN['fileViewer.download']} ${zhCN['fileViewer.versions.versionLabel'].replace('{version}', '1')}`;
    const downloadButton = await within(versionDialog).findByRole('button', { name: downloadName });
    fireEvent.click(downloadButton);
    fireEvent.click(within(versionDialog).getByRole('menuitem', { name: zhCN['fileViewer.exportZip'] }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => String(input) === '/api/projects/project-1/files/index.html/versions/v1'),
      ).toBe(true);
    });
    const toastTitle = await screen.findByText(S26A_TITLE);
    const toast = toastTitle.closest('.od-toast') as HTMLElement | null;
    expect(toast).toBeTruthy();
    expect(within(toast as HTMLElement).getByText(S26A_BODY)).toBeTruthy();
    expect(toast?.getAttribute('role')).toBe('alert');
  });
});
