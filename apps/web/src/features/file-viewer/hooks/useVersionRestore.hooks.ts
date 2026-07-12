// Feature-local hook for the file-viewer's "restore this version" write-
// through (Cluster G of the FileViewer.tsx decomposition plan): after the
// version-history modal (`FileVersionManagerModal`) restores a version, it
// re-hydrates the orchestrator's live source state and surfaces a transient
// success toast. The version-history modal's OWN open state already lives in
// Cluster C's `useWiredViewerToolbarMenus` (`versionModalOpen`), so this
// cluster's remaining scope is just the write-through + its toast. The
// source/reload state it writes into (`setSource`/`sourceRef`/
// `setInlinedSource`/`setReloadKey`) belongs to the not-yet-extracted srcDoc/
// URL-load transport engine (Cluster L), so those come in as injected deps
// rather than being owned here.
//
// No transport of its own (no fetch/port), so there is no real substitution
// for `useWiredVersionRestore` to perform today — it exists anyway to match
// the slice's `useX(deps)` / `useWiredX(deps)` shape, so the orchestrator can
// inject a fake in tests the same way it does for every other feature hook.
import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { TranslateFn, VersionRestoredToast } from '../types';

export interface VersionRestoreDeps {
  setSource: Dispatch<SetStateAction<string | null>>;
  sourceRef: MutableRefObject<string | null>;
  setInlinedSource: Dispatch<SetStateAction<string | null>>;
  setReloadKey: Dispatch<SetStateAction<number>>;
  onFileSaved?: () => Promise<void> | void;
  t: TranslateFn;
}

export interface VersionRestoreController {
  versionRestoredToast: VersionRestoredToast | null;
  dismissVersionRestoredToast: () => void;
  handleVersionRestored: (content: string) => Promise<void>;
}

export function useVersionRestore(deps: VersionRestoreDeps): VersionRestoreController {
  const { setSource, sourceRef, setInlinedSource, setReloadKey, onFileSaved, t } = deps;
  const [versionRestoredToast, setVersionRestoredToast] = useState<VersionRestoredToast | null>(null);
  const versionRestoredToastIdRef = useRef(0);

  const handleVersionRestored = async (content: string) => {
    setSource(content);
    sourceRef.current = content;
    setInlinedSource(null);
    setReloadKey((key) => key + 1);
    await onFileSaved?.();
    setVersionRestoredToast({
      id: (versionRestoredToastIdRef.current += 1),
      message: t('fileViewer.versions.restoreSuccess'),
    });
  };

  return {
    versionRestoredToast,
    dismissVersionRestoredToast: () => setVersionRestoredToast(null),
    handleVersionRestored,
  };
}

export function useWiredVersionRestore(deps: VersionRestoreDeps): VersionRestoreController {
  return useVersionRestore(deps);
}
