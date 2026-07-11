// @vitest-environment jsdom
//
// Unit tests for the read-only document (pdf/doc/ppt/xlsx) preview hook: the
// fetch-on-mount lifecycle and its loading/preview state transitions, pinned
// through a fake port.
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDocumentPreview } from '../../../src/features/file-viewer/hooks/useDocumentPreview.hooks';
import type { DocumentPreviewPort } from '../../../src/features/file-viewer/ports';
import type { DocumentPreview } from '../../../src/features/file-viewer/types';

function makePort(over: Partial<DocumentPreviewPort> = {}): DocumentPreviewPort {
  return {
    fetchProjectFilePreview: vi.fn(async () => null as DocumentPreview | null),
    ...over,
  };
}

describe('useDocumentPreview', () => {
  it('starts loading and resolves the fetched preview', async () => {
    const preview: DocumentPreview = {
      kind: 'pdf',
      title: 'Report',
      sections: [{ title: 'Intro', lines: ['line 1'] }],
    };
    const port = makePort({ fetchProjectFilePreview: vi.fn(async () => preview) });
    const { result } = renderHook(() => useDocumentPreview(port, 'proj-1', 'report.pdf', 1000));

    expect(result.current.loading).toBe(true);
    expect(result.current.preview).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.preview).toEqual(preview);
    expect(port.fetchProjectFilePreview).toHaveBeenCalledWith('proj-1', 'report.pdf');
  });

  it('resolves preview null and loading false when the fetch reports unavailable', async () => {
    const port = makePort({ fetchProjectFilePreview: vi.fn(async () => null) });
    const { result } = renderHook(() => useDocumentPreview(port, 'proj-1', 'note.docx', 1000));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.preview).toBeNull();
  });

  it('re-fetches and resets to a loading state when the file identity changes', async () => {
    const previewA: DocumentPreview = { kind: 'document', title: 'A', sections: [] };
    const previewB: DocumentPreview = { kind: 'document', title: 'B', sections: [] };
    const fetchProjectFilePreview = vi.fn(async (_projectId: string, name: string) =>
      name === 'a.docx' ? previewA : previewB,
    );
    const port = makePort({ fetchProjectFilePreview });
    const { result, rerender } = renderHook(
      ({ name, mtime }: { name: string; mtime: number }) =>
        useDocumentPreview(port, 'proj-1', name, mtime),
      { initialProps: { name: 'a.docx', mtime: 1000 } },
    );

    await waitFor(() => expect(result.current.preview).toEqual(previewA));

    rerender({ name: 'b.docx', mtime: 2000 });
    expect(result.current.loading).toBe(true);
    expect(result.current.preview).toBeNull();

    await waitFor(() => expect(result.current.preview).toEqual(previewB));
    expect(fetchProjectFilePreview).toHaveBeenCalledTimes(2);
  });
});
