// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectFile } from '@open-design/contracts';

import { useDesignSystemInlinePreview } from '../../../src/features/file-workspace/hooks/useDesignSystemInlinePreview.hooks';
import type { DesignSystemPreviewPort } from '../../../src/features/file-workspace/ports';

function makeFile(over: Partial<ProjectFile> = {}): ProjectFile {
  return { name: 'index.html', size: 10, mtime: 1000, kind: 'html', mime: 'text/html', ...over };
}

function makePort(over: Partial<DesignSystemPreviewPort> = {}): DesignSystemPreviewPort {
  return {
    fetchProjectFileText: vi.fn(async () => null),
    projectFileUrl: (projectId, name) => `/api/projects/${projectId}/file/${name}`,
    projectRawUrl: (projectId, filePath) => `/api/projects/${projectId}/raw/${filePath}`,
    ...over,
  };
}

describe('useDesignSystemInlinePreview', () => {
  it('exposes the direct file URL immediately', () => {
    // A stable port/file reference matters: the hook's effect depends on
    // `port`, so recreating it inline on every render would reset and
    // re-run the effect forever.
    const port = makePort();
    const file = makeFile();
    const { result } = renderHook(() => useDesignSystemInlinePreview(port, 'proj1', file));
    expect(result.current.url).toBe('/api/projects/proj1/file/index.html');
    expect(result.current.srcDoc).toBeNull();
    expect(result.current.srcDocReady).toBe(false);
  });

  it('skips the srcDoc fetch for a non-html file', async () => {
    const fetchProjectFileText = vi.fn(async () => null);
    const port = makePort({ fetchProjectFileText });
    const file = makeFile({ kind: 'image', name: 'logo.png' });
    const { result } = renderHook(() => useDesignSystemInlinePreview(port, 'proj1', file));
    await waitFor(() => expect(result.current.srcDocReady).toBe(false));
    expect(fetchProjectFileText).not.toHaveBeenCalled();
  });

  it('builds a srcDoc for an html file with no relative assets to inline', async () => {
    const fetchProjectFileText = vi.fn(async () => '<html><body>hi</body></html>');
    const port = makePort({ fetchProjectFileText });
    const file = makeFile();
    const { result } = renderHook(() => useDesignSystemInlinePreview(port, 'proj1', file));
    await waitFor(() => expect(result.current.srcDocReady).toBe(true));
    expect(result.current.srcDoc).toContain('hi');
    expect(fetchProjectFileText).toHaveBeenCalledWith('proj1', 'index.html', {
      cache: 'no-store',
      cacheBustKey: 1000,
    });
  });

  it('inlines a relative stylesheet <link> as a <style> block', async () => {
    const fetchProjectFileText = vi.fn(async (_projectId: string, name: string) => {
      if (name === 'index.html') {
        return '<html><head><link rel="stylesheet" href="style.css"></head><body>hi</body></html>';
      }
      if (name === 'style.css') return '.a { color: red; }';
      return null;
    });
    const port = makePort({ fetchProjectFileText });
    const file = makeFile();
    const { result } = renderHook(() => useDesignSystemInlinePreview(port, 'proj1', file));
    await waitFor(() => expect(result.current.srcDocReady).toBe(true));
    expect(result.current.srcDoc).toContain('data-od-inline-asset="style.css"');
    expect(result.current.srcDoc).toContain('.a { color: red; }');
  });

  it('marks srcDoc ready with a null doc when the file text is empty', async () => {
    const port = makePort({ fetchProjectFileText: vi.fn(async () => null) });
    const file = makeFile();
    const { result } = renderHook(() => useDesignSystemInlinePreview(port, 'proj1', file));
    await waitFor(() => expect(result.current.srcDocReady).toBe(true));
    expect(result.current.srcDoc).toBeNull();
  });
});
