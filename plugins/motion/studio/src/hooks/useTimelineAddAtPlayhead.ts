import { useCallback } from "react";
import { usePlayerStore } from "../player";
import { useStableHandlers } from "./useStableHandlers";

type AddAtPlacement = (path: string, placement: { start: number; track: number }) => unknown;

export function useTimelineAddAtPlayhead(
  addAsset: AddAtPlacement,
  addComposition: AddAtPlacement,
  projectId: string | null,
) {
  const placement = () => ({ start: usePlayerStore.getState().currentTime, track: 0 });
  return useStableHandlers(
    {
      addAssetAtPlayhead: useCallback((path: string) => addAsset(path, placement()), [addAsset]),
      addCompositionAtPlayhead: useCallback(
        (path: string) => addComposition(path, placement()),
        [addComposition],
      ),
    },
    projectId,
  );
}
