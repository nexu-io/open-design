// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';

const seam = vi.hoisted(() => ({ exportHtml: vi.fn(), complete: vi.fn(), begin: vi.fn(), options: vi.fn() }));
vi.mock('../../src/runtime/exports', async () => ({
  ...await vi.importActual('../../src/runtime/exports'),
  exportProjectAsHtml: seam.exportHtml,
}));
// This spec verifies the real FileViewer completion call site only. It does NOT
// replace missing binding history with false or claim visible-guide acceptance.
vi.mock('../../src/components/share/useAfterExportShareGuide', () => ({
  useAfterExportShareGuide: (input: unknown) => {
    seam.options(input);
    return { noticeId: null, beginExport: seam.begin, dismiss: vi.fn(), neverShow: vi.fn() };
  },
}));
const file: ProjectFile = {
  name: 'index.html', path: 'index.html', type: 'file', size: 100, mtime: 1, kind: 'html', mime: 'text/html',
  artifactManifest: { version: 1, kind: 'html', title: 'Page', entry: 'index.html', renderer: 'html', exports: ['html'] },
};
beforeEach(() => {
  vi.clearAllMocks();
  seam.begin.mockReturnValue(seam.complete);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ deployments: [] }), { status: 200 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function exportHtml() {
  render(<FileViewer projectId="project-guide" projectKind="prototype" file={file} liveHtml="<html><body>Hello</body></html>" />);
  fireEvent.click(await screen.findByRole('button', { name: /^Export$/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name: /Export as standalone HTML/i }));
}
describe('FileViewer real HTML export completion seam', () => {
  it('reports success once and preserves the success toast, while history remains unknown', async () => {
    seam.exportHtml.mockResolvedValue(undefined);
    await exportHtml();
    await waitFor(() => expect(seam.complete).toHaveBeenCalledWith('success'));
    expect(seam.complete).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Export complete').length).toBeGreaterThan(0);
    expect(seam.options).toHaveBeenLastCalledWith(expect.objectContaining({ hasEverShared: null, appUserId: null }));
    expect(screen.queryByText('Try sharing')).toBeNull();
  });
  it('reports cancellation without a success toast', async () => {
    seam.exportHtml.mockResolvedValue('cancelled');
    await exportHtml();
    await waitFor(() => expect(seam.complete).toHaveBeenCalledWith('cancelled'));
    expect(screen.queryByText('Export complete')).toBeNull();
  });
  it('reports rejection without a success toast', async () => {
    seam.exportHtml.mockRejectedValue(new Error('export test failure'));
    await exportHtml();
    await waitFor(() => expect(seam.complete).toHaveBeenCalledWith('failed'));
    expect(screen.queryByText('Export complete')).toBeNull();
    expect(screen.getAllByText('export test failure').length).toBeGreaterThan(0);
  });
  it('reports a synchronous exporter throw as failure', async () => {
    seam.exportHtml.mockImplementation(() => { throw new Error('sync export failure'); });
    await exportHtml();
    await waitFor(() => expect(seam.complete).toHaveBeenCalledWith('failed'));
    expect(seam.complete).toHaveBeenCalledTimes(1);
  });
});
