// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useProjectFolders } from '../../../src/features/file-workspace/hooks/useProjectFolders.hooks';
import type { UseProjectFoldersParams } from '../../../src/features/file-workspace/hooks/useProjectFolders.hooks';
import type { ProjectFoldersPort } from '../../../src/features/file-workspace/ports';
import type { ProjectFolder } from '../../../src/types';

function makeFolder(name: string): ProjectFolder {
  return { name, path: name, type: 'dir', size: 0, mtime: 1000 };
}

function makePort(over: Partial<ProjectFoldersPort> = {}): ProjectFoldersPort {
  return {
    fetchProjectFolders: vi.fn(async () => []),
    ...over,
  };
}

describe('useProjectFolders', () => {
  it('starts with an empty uploadDir and folder list', () => {
    const port = makePort();
    const { result } = renderHook(() => useProjectFolders(port, { projectId: 'proj1' }));
    expect(result.current.uploadDir).toBe('');
    expect(result.current.projectFolders).toEqual([]);
  });

  it('fetches and stores folders for the project on mount', async () => {
    const folders = [makeFolder('assets'), makeFolder('drafts')];
    const port = makePort({ fetchProjectFolders: vi.fn(async () => folders) });
    const { result } = renderHook(() => useProjectFolders(port, { projectId: 'proj1' }));
    await waitFor(() => expect(result.current.projectFolders).toEqual(folders));
    expect(port.fetchProjectFolders).toHaveBeenCalledWith('proj1');
  });

  it('setUploadDir updates uploadDir', () => {
    const port = makePort();
    const { result } = renderHook(() => useProjectFolders(port, { projectId: 'proj1' }));
    act(() => result.current.setUploadDir('assets/icons'));
    expect(result.current.uploadDir).toBe('assets/icons');
  });

  it('refreshProjectFolders re-fetches and returns the latest folders', async () => {
    const folders = [makeFolder('assets')];
    const port = makePort({ fetchProjectFolders: vi.fn(async () => folders) });
    const { result } = renderHook(() => useProjectFolders(port, { projectId: 'proj1' }));
    await waitFor(() => expect(result.current.projectFolders).toEqual(folders));

    const nextFolders = [makeFolder('assets'), makeFolder('exports')];
    (port.fetchProjectFolders as ReturnType<typeof vi.fn>).mockResolvedValueOnce(nextFolders);
    let returned: ProjectFolder[] = [];
    await act(async () => {
      returned = await result.current.refreshProjectFolders();
    });
    expect(returned).toEqual(nextFolders);
    expect(result.current.projectFolders).toEqual(nextFolders);
  });

  it('synchronously clears folders during render when projectId changes, then re-fetches', async () => {
    const port = makePort({
      fetchProjectFolders: vi.fn(async (projectId: string) =>
        projectId === 'proj1' ? [makeFolder('a')] : [makeFolder('b')],
      ),
    });
    const { result, rerender } = renderHook(
      (props: UseProjectFoldersParams) => useProjectFolders(port, props),
      { initialProps: { projectId: 'proj1' } },
    );
    await waitFor(() => expect(result.current.projectFolders).toEqual([makeFolder('a')]));

    rerender({ projectId: 'proj2' });
    // The render-time reset clears folders immediately, before the new
    // project's fetch resolves.
    expect(result.current.projectFolders).toEqual([]);
    await waitFor(() => expect(result.current.projectFolders).toEqual([makeFolder('b')]));
    expect(port.fetchProjectFolders).toHaveBeenCalledWith('proj2');
  });
});
