// Feature-local hook for the working-directory status: the recent-dirs list
// (fetched once on mount) and the live existence check for the project's
// current working dir. Transport is INJECTED as the slice port so the hook
// holds no import to a provider.
//
// The mount-fetch effect below is internal state management (a bounded
// one-shot promise with a cancellation guard, not an accumulating
// subscription) so it stays in the hook. The focus/visibilitychange re-check
// subscription is different — it's an external `window`/`document` listener
// pair — and stays in the orchestrator (a guaranteed single instance) per
// the accumulating-subscription rule; this hook only exposes
// `checkWorkingDir` for that orchestrator effect to call.
import { useCallback, useEffect, useState } from 'react';
import { workingDirPort } from '../dependencies';
import type { WorkingDirPort } from '../ports';

export interface WorkingDirStatusController {
  recentDirs: string[];
  workingDirMissing: boolean;
  rememberRecentDir: (dir: string) => Promise<void>;
  checkWorkingDir: (workingDir: string | null) => Promise<void>;
}

export function useWorkingDirStatus(port: WorkingDirPort): WorkingDirStatusController {
  const [recentDirs, setRecentDirs] = useState<string[]>([]);
  const [workingDirMissing, setWorkingDirMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void port.fetchRecentLinkedDirs().then((dirs) => {
      if (!cancelled) setRecentDirs(dirs);
    });
    return () => {
      cancelled = true;
    };
  }, [port]);

  const rememberRecentDir = useCallback(
    async (dir: string) => {
      setRecentDirs((prev) => [dir, ...prev.filter((d) => d !== dir)].slice(0, 5));
      const persisted = await port.pushRecentLinkedDir(dir);
      setRecentDirs(persisted);
    },
    [port],
  );

  // Live-checks whether the selected working directory still exists, so a
  // folder deleted from disk turns the picker red without a page reload.
  const checkWorkingDir = useCallback(
    async (workingDir: string | null) => {
      if (!workingDir) {
        setWorkingDirMissing(false);
        return;
      }
      const ok = await port.dirExists(workingDir);
      setWorkingDirMissing(!ok);
    },
    [port],
  );

  return { recentDirs, workingDirMissing, rememberRecentDir, checkWorkingDir };
}

/**
 * Wirer: binds the real registry provider. This is the default the
 * orchestrator injects; tests call `useWorkingDirStatus` directly with a
 * hand-written fake port instead.
 */
export function useWiredWorkingDirStatus(): WorkingDirStatusController {
  return useWorkingDirStatus(workingDirPort);
}
