import { useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  isHydratedFromUrlState,
  readStudioUrlStateFromWindow,
  type StudioUrlState,
} from "../utils/studioUrlState";

/**
 * Resets selection when `projectId` switches in-session. Runs during render, not an
 * effect, so the caller never sees a stale activeCompPath in the same commit.
 */
export function useResetSelectionOnProjectSwitch({
  projectId,
  initialUrlStateRef,
  setActiveCompPath,
  setActiveCompPathHydrated,
}: {
  projectId: string | null;
  initialUrlStateRef: MutableRefObject<StudioUrlState>;
  setActiveCompPath: Dispatch<SetStateAction<string | null>>;
  setActiveCompPathHydrated: Dispatch<SetStateAction<boolean>>;
}): void {
  const previousProjectIdRef = useRef(projectId);

  if (previousProjectIdRef.current !== projectId) {
    const isSwitch = previousProjectIdRef.current !== null;
    previousProjectIdRef.current = projectId;
    if (isSwitch) {
      initialUrlStateRef.current = readStudioUrlStateFromWindow();
      setActiveCompPath(null);
      setActiveCompPathHydrated(isHydratedFromUrlState(initialUrlStateRef.current));
    }
  }
}
