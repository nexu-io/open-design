import { create } from "zustand";
import { readStudioUiPreferences, writeStudioUiPreferences } from "../../utils/studioUiPreferences";

/** Space the preview fit reserves above and left of the frame while the ruler is on. */
export const RULER_GUTTER_PX = 16;

type GuideKey = "rulerVisible" | "safeMarginsVisible";

interface PreviewGuidesState {
  rulerVisible: boolean;
  safeMarginsVisible: boolean;
  toggle: (key: GuideKey) => void;
}

export const usePreviewGuidesStore = create<PreviewGuidesState>((set, get) => {
  const stored = readStudioUiPreferences();
  return {
    rulerVisible: stored.rulerVisible ?? false,
    safeMarginsVisible: stored.safeMarginsVisible ?? false,
    toggle: (key) => {
      const next = !get()[key];
      writeStudioUiPreferences({ [key]: next });
      set({ [key]: next });
    },
  };
});
