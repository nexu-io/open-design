// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@open-design/electron-contract', () => ({
  isOpenDesignElectronAvailable: () => true,
  pickAndImportElectronProject: vi.fn(),
}));

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({
    context: null,
    failure: 'unavailable',
    loading: false,
  }),
}));

import { pickAndImportElectronProject } from '@open-design/electron-contract';
import { useOpenFolderImport } from '../../src/components/useOpenFolderImport';

afterEach(() => {
  cleanup();
  vi.mocked(pickAndImportElectronProject).mockReset();
});

describe('useOpenFolderImport', () => {
  it('surfaces an unavailable workspace authority through the existing import error state', async () => {
    const hook = renderHook(() => useOpenFolderImport({
      onImportFolderResponse: vi.fn(),
    }));

    await act(async () => {
      await hook.result.current.openFolder();
    });

    expect(pickAndImportElectronProject).not.toHaveBeenCalled();
    expect(hook.result.current.error).toEqual({
      message: 'Workspace context is unavailable. Try again when workspace sync finishes.',
    });
    expect(hook.result.current.importing).toBe(false);
  });
});
