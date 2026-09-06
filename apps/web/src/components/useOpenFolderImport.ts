import { useCallback, useState } from 'react';
import {
  isOpenDesignElectronAvailable,
  pickAndImportElectronProject,
  type OpenDesignElectronProjectImportSuccess,
} from '@open-design/electron-contract';
import { pickLocalFolderPath } from '../state/projects';
import { resolvedWorkspaceContextForWrite } from '../state/projects';
import { useWorkspaceContext } from '../collab/useWorkspaceContext';
import { formatPickAndImportFailure } from '../utils/pickAndImportError';

interface UseOpenFolderImportArgs {
  skillId?: string | null;
  onImportFolder?: (baseDir: string) => Promise<void> | void;
  onImportFolderResponse?: (response: OpenDesignElectronProjectImportSuccess) => Promise<void> | void;
}

export function useOpenFolderImport({
  skillId,
  onImportFolder,
  onImportFolderResponse,
}: UseOpenFolderImportArgs) {
  const workspaceContextState = useWorkspaceContext();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<{ message: string; details?: string } | null>(null);
  const hasHostPickAndImport = isOpenDesignElectronAvailable();
  const available = hasHostPickAndImport ? Boolean(onImportFolderResponse) : Boolean(onImportFolder);

  const openFolder = useCallback(async () => {
    if (hasHostPickAndImport) {
      if (!onImportFolderResponse) return;
      setError(null);
      setImporting(true);
      try {
        const result = await pickAndImportElectronProject({
          skillId: skillId ?? null,
          workspaceContext: resolvedWorkspaceContextForWrite(workspaceContextState),
        });
        if (!result) return;
        if (result.ok === true) {
          await onImportFolderResponse(result);
          return;
        }
        if ('canceled' in result && result.canceled === true) return;
        setError(formatPickAndImportFailure(result));
      } catch (err) {
        setError({
          message: err instanceof Error ? err.message : 'Failed to import folder',
        });
      } finally {
        setImporting(false);
      }
      return;
    }

    if (!onImportFolder) return;
    setError(null);
    setImporting(true);
    try {
      const selectedPath = await pickLocalFolderPath();
      if (!selectedPath) return;
      await onImportFolder(selectedPath);
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'Failed to import folder',
      });
    } finally {
      setImporting(false);
    }
  }, [
    hasHostPickAndImport,
    onImportFolder,
    onImportFolderResponse,
    skillId,
    workspaceContextState,
  ]);

  return {
    available,
    clearError: () => setError(null),
    error,
    importing,
    openFolder,
  };
}
