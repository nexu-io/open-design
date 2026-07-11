// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDesignSystemCardManifest } from '../../../src/features/file-workspace/hooks/useDesignSystemCardManifest.hooks';
import type { DesignSystemPreviewPort } from '../../../src/features/file-workspace/ports';

function makePort(over: Partial<DesignSystemPreviewPort> = {}): DesignSystemPreviewPort {
  return {
    fetchProjectFileText: vi.fn(async () => null),
    projectFileUrl: (projectId, name) => `/api/projects/${projectId}/file/${name}`,
    projectRawUrl: (projectId, filePath) => `/api/projects/${projectId}/raw/${filePath}`,
    ...over,
  };
}

describe('useDesignSystemCardManifest', () => {
  it('starts empty and does not fetch when there is no manifest file', () => {
    const fetchProjectFileText = vi.fn(async () => null);
    const port = makePort({ fetchProjectFileText });
    const { result } = renderHook(() =>
      useDesignSystemCardManifest(port, 'proj1', 'sys1', null, null, 'failed'),
    );
    expect(result.current.cardManifest.size).toBe(0);
    expect(result.current.cardManifestError).toBeNull();
    expect(fetchProjectFileText).not.toHaveBeenCalled();
  });

  it('does not fetch when the system has no id yet', () => {
    const fetchProjectFileText = vi.fn(async () => null);
    const port = makePort({ fetchProjectFileText });
    renderHook(() =>
      useDesignSystemCardManifest(port, 'proj1', '', '_ds_manifest.json', 1000, 'failed'),
    );
    expect(fetchProjectFileText).not.toHaveBeenCalled();
  });

  it('fetches and parses the manifest when the file/cache-bust key is present', async () => {
    const manifestJson = JSON.stringify({ cards: [{ path: 'sections/a.html', name: 'A' }] });
    const port = makePort({ fetchProjectFileText: vi.fn(async () => manifestJson) });
    const { result } = renderHook(() =>
      useDesignSystemCardManifest(port, 'proj1', 'sys1', '_ds_manifest.json', 1000, 'failed'),
    );
    await waitFor(() => expect(result.current.cardManifest.size).toBeGreaterThan(0));
    expect(result.current.cardManifest.get('sections/a.html')?.name).toBe('A');
    expect(result.current.cardManifestError).toBeNull();
  });

  it('surfaces a thrown error message and clears the manifest', async () => {
    const port = makePort({
      fetchProjectFileText: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const { result } = renderHook(() =>
      useDesignSystemCardManifest(port, 'proj1', 'sys1', '_ds_manifest.json', 1000, 'failed'),
    );
    await waitFor(() => expect(result.current.cardManifestError).toBe('boom'));
    expect(result.current.cardManifest.size).toBe(0);
  });

  it('falls back to the provided label for a non-Error rejection', async () => {
    const port = makePort({
      fetchProjectFileText: vi.fn(async () => {
        throw 'not an error object';
      }),
    });
    const { result } = renderHook(() =>
      useDesignSystemCardManifest(port, 'proj1', 'sys1', '_ds_manifest.json', 1000, 'read failed'),
    );
    await waitFor(() => expect(result.current.cardManifestError).toBe('read failed'));
  });
});
