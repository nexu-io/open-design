import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { useHydrateActiveCompPathFromUrl } from "./useHydrateActiveCompPathFromUrl";
import { useAutoOpenRootComposition } from "./useAutoOpenRootComposition";
import { useCompositionContentLoader } from "./useCompositionContentLoader";
import { useResetSelectionOnProjectSwitch } from "./useResetSelectionOnProjectSwitch";
import { isHydratedFromUrlState, type StudioUrlState } from "../utils/studioUrlState";
import type { AppToast, EditingFile } from "../utils/studioHelpers";

/** Owns which composition is open: state, URL hydration, auto-open and content loading. */
export function useActiveComposition({
  projectId,
  initialUrlStateRef,
  fileTree,
  fileTreeLoaded,
  masterCompPath,
  setEditingFile,
  showToast,
}: {
  projectId: string | null;
  initialUrlStateRef: MutableRefObject<StudioUrlState>;
  fileTree: string[];
  fileTreeLoaded: boolean;
  masterCompPath: string | null;
  setEditingFile: (file: EditingFile) => void;
  showToast: (message: string, tone?: AppToast["tone"]) => void;
}): {
  activeCompPath: string | null;
  activeCompPathHydrated: boolean;
  setActiveCompPath: Dispatch<SetStateAction<string | null>>;
  handleSelectComposition: (comp: string) => void;
} {
  const [activeCompPath, setActiveCompPath] = useState<string | null>(null);
  const [activeCompPathHydrated, setActiveCompPathHydrated] = useState(() =>
    isHydratedFromUrlState(initialUrlStateRef.current),
  );

  useResetSelectionOnProjectSwitch({
    projectId,
    initialUrlStateRef,
    setActiveCompPath,
    setActiveCompPathHydrated,
  });

  useHydrateActiveCompPathFromUrl({
    hydrated: activeCompPathHydrated,
    fileTreeLoaded,
    fileTree,
    initialUrlStateRef,
    setActiveCompPath,
    setHydrated: setActiveCompPathHydrated,
  });

  const handleSelectComposition = useCompositionContentLoader({
    projectId,
    setEditingFile,
    setActiveCompPath,
    showToast,
  });

  useAutoOpenRootComposition({
    projectId,
    activeCompPath,
    activeCompPathHydrated,
    masterCompPath,
    onSelectComposition: handleSelectComposition,
  });

  return { activeCompPath, activeCompPathHydrated, setActiveCompPath, handleSelectComposition };
}
