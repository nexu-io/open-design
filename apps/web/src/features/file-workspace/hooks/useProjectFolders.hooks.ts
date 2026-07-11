// Feature-local hook for the file-workspace project-folders cluster: the
// folder tree backing the Design Files panel's create-under-folder
// behavior and the design-files-empty check. Reset synchronously DURING
// RENDER (not in an effect) when `projectId` changes — DesignFilesPanel is
// keyed by `projectId`, so an effect-based reset would let the new panel
// mount once with the previous project's folders and briefly suppress the
// new project's empty state.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectFolder } from '../../../types';
import { projectFoldersPort } from '../dependencies';
import type { ProjectFoldersPort } from '../ports';
import { EMPTY_PROJECT_FOLDERS } from '../constants';

export interface UseProjectFoldersParams {
  projectId: string;
}

export interface ProjectFoldersController {
  uploadDir: string;
  setUploadDir: (dir: string) => void;
  projectFolders: ProjectFolder[];
  refreshProjectFolders: () => Promise<ProjectFolder[]>;
}

export function useProjectFolders(
  port: ProjectFoldersPort,
  params: UseProjectFoldersParams,
): ProjectFoldersController {
  const { projectId } = params;
  // The folder the Design Files panel is currently viewing (synced via
  // onCurrentDirChange). New files — uploads, pastes, sketches, dropped
  // files — are created under this folder instead of the project root.
  const [uploadDir, setUploadDir] = useState<string>('');
  const [projectFolders, setProjectFolders] = useState<ProjectFolder[]>(EMPTY_PROJECT_FOLDERS);
  const projectFoldersProjectIdRef = useRef(projectId);
  if (projectFoldersProjectIdRef.current !== projectId) {
    projectFoldersProjectIdRef.current = projectId;
    setProjectFolders(EMPTY_PROJECT_FOLDERS);
  }

  const refreshProjectFolders = useCallback(async (): Promise<ProjectFolder[]> => {
    const next = await port.fetchProjectFolders(projectId);
    setProjectFolders(next);
    return next;
  }, [port, projectId]);

  useEffect(() => {
    let cancelled = false;
    // The synchronous clear happens during render (see
    // projectFoldersProjectIdRef above); here we only fetch the new
    // project's folders.
    void port.fetchProjectFolders(projectId).then((next) => {
      if (!cancelled) setProjectFolders(next);
    });
    return () => {
      cancelled = true;
    };
  }, [port, projectId]);

  return { uploadDir, setUploadDir, projectFolders, refreshProjectFolders };
}

/**
 * Wirer: binds the real project-folders transport and returns a
 * ready-to-call hook. This is the default the orchestrator injects; swap it
 * via the component prop in tests.
 */
export function useWiredProjectFolders(
  params: UseProjectFoldersParams,
): ProjectFoldersController {
  return useProjectFolders(projectFoldersPort, params);
}
