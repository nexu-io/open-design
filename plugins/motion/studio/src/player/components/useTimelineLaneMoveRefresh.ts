import { useCallback } from "react";
import { useStudioPlaybackContextOptional } from "../../contexts/StudioContext";

export function useTimelineLaneMoveRefresh(): () => void {
  const setRefreshKey = useStudioPlaybackContextOptional()?.setRefreshKey;
  return useCallback(() => setRefreshKey?.((key) => key + 1), [setRefreshKey]);
}
