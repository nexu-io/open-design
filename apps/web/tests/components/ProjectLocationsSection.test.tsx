// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProjectLocationsSection } from '../../src/components/ProjectLocationsSection';
import {
  fetchProjectLocations,
  openProjectLocationFolderDialog,
  scanProjectLocations,
  updateProjectLocations,
} from '../../src/state/project-locations';
import {
  createServerDirectory,
  listServerDirectory,
  listServerDirectoryRoots,
} from '../../src/providers/fs-browser';
import type { AppConfig } from '../../src/types';

vi.mock('../../src/state/project-locations', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/project-locations')>(
    '../../src/state/project-locations',
  );
  return {
    ...actual,
    fetchProjectLocations: vi.fn(),
    openProjectLocationFolderDialog: vi.fn(),
    scanProjectLocations: vi.fn(),
    updateProjectLocations: vi.fn(),
  };
});

vi.mock('../../src/providers/fs-browser', () => ({
  createServerDirectory: vi.fn(),
  listServerDirectory: vi.fn(),
  listServerDirectoryRoots: vi.fn(),
}));

const mockedFetchLocations = vi.mocked(fetchProjectLocations);
const mockedOpenDialog = vi.mocked(openProjectLocationFolderDialog);
const mockedScanLocations = vi.mocked(scanProjectLocations);
const mockedUpdateLocations = vi.mocked(updateProjectLocations);
const mockedCreateDirectory = vi.mocked(createServerDirectory);
const mockedListDirectory = vi.mocked(listServerDirectory);
const mockedListRoots = vi.mocked(listServerDirectoryRoots);

describe('ProjectLocationsSection remote folder selection', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('opens the server directory picker for a remote native-dialog response', async () => {
    mockedFetchLocations.mockResolvedValue([
      { id: 'default', name: 'Default', path: '/daemon/projects', builtIn: true },
    ]);
    mockedOpenDialog.mockResolvedValue({
      status: 'fallback',
      reason: 'remote',
    });
    mockedListRoots.mockResolvedValue({
      roots: [{ label: 'Authorized workspace', path: '/home/user', kind: 'configured' }],
    });
    mockedListDirectory.mockResolvedValue({
      path: '/home/user',
      parent: null,
      entries: [],
      truncated: false,
    });
    mockedScanLocations.mockResolvedValue({ scanned: 0, imported: [], existing: [], skipped: [] });
    mockedUpdateLocations.mockResolvedValue([]);
    mockedCreateDirectory.mockResolvedValue({ path: '/home/user/new-folder' });

    render(
      <ProjectLocationsSection
        cfg={{} as AppConfig}
        setCfg={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add folder/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /add folder/i }));

    expect(mockedOpenDialog).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('dialog', { name: /browse server folders/i })).toBeTruthy();
    await waitFor(() => {
      expect(mockedListRoots).toHaveBeenCalledTimes(1);
      expect(mockedListDirectory).toHaveBeenCalledWith('/home/user');
    });
  });
});
