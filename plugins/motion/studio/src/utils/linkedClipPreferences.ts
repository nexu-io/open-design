import { create } from "zustand";
import { STUDIO_PREVIEW_FPS } from "../player/lib/time";
import { readStudioUiPreferences, writeStudioUiPreferences } from "./studioUiPreferences";

interface LinkedClipPreferences {
  /** Premiere's Linked Selection: clicks and edits reach every link partner. */
  linkedSelection: boolean;
  setLinkedSelection: (enabled: boolean) => void;
  /** Red offset badges on a video and audio from one source that drifted apart. */
  syncIndicatorsVisible: boolean;
  setSyncIndicatorsVisible: (visible: boolean) => void;
  compositionFps: number;
  setCompositionFps: (fps: number) => void;
}

export const useLinkedClipPreferences = create<LinkedClipPreferences>((set) => ({
  linkedSelection: readStudioUiPreferences().linkedSelectionEnabled ?? true,
  setLinkedSelection: (enabled) => {
    writeStudioUiPreferences({ linkedSelectionEnabled: enabled });
    set({ linkedSelection: enabled });
  },
  syncIndicatorsVisible: readStudioUiPreferences().syncIndicatorsVisible ?? true,
  setSyncIndicatorsVisible: (visible) => {
    writeStudioUiPreferences({ syncIndicatorsVisible: visible });
    set({ syncIndicatorsVisible: visible });
  },
  compositionFps: STUDIO_PREVIEW_FPS,
  setCompositionFps: (fps) => {
    if (Number.isFinite(fps) && fps > 0) set({ compositionFps: fps });
  },
}));

export const useCompositionFps = (): number => useLinkedClipPreferences((s) => s.compositionFps);

export const isLinkedSelectionOn = (): boolean =>
  useLinkedClipPreferences.getState().linkedSelection;
