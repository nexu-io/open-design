import { useCallback, useState } from 'react';
import {
  isOpenDesignHostAvailable,
  pickAndImportHostProject,
  type OpenDesignHostProjectImportSuccess,
} from '@open-design/host';
import { pickLocalFolderPath } from '../state/projects';
import { formatPickAndImportFailure } from '../utils/pickAndImportError';

interface UseOpenFolderImportArgs {
  skillId?: string | null;
  onImportFolder?: (baseDir: string) => Promise<void> | void;
  onImportFolderResponse?: (response: OpenDesignHostProjectImportSuccess) => Promise<void> | void;
}

export function useOpenFolderImport({
  skillId,
  onImportFolder,
  onImportFolderResponse,
}: UseOpenFolderImportArgs) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<{ message: string; details?: string } | null>(null);
  const hasHostPickAndImport = isOpenDesignHostAvailable();
  const available = hasHostPickAndImport ? Boolean(onImportFolderResponse) : Boolean(onImportFolder);

  const openFolder = useCallback(async () => {
    if (hasHostPickAndImport) {
      if (!onImportFolderResponse) return;
      setError(null);
      setImporting(true);
      try {
        const result = await pickAndImportHostProject({
          skillId: skillId ?? null,
        });
        if (!result) return;
        if (result.ok === true) {
          await onImportFolderResponse(result);
          return;
        }
        if ('canceled' in result && result.canceled === true) return;
        setError(formatPickAndImportFailure(result));
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
  }, [hasHostPickAndImport, onImportFolder, onImportFolderResponse, skillId]);

  return {
    available,
    clearError: () => setError(null),
    error,
    importing,
    openFolder,
  };
}
