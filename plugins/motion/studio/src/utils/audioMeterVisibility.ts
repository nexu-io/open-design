import { create } from "zustand";
import { readStudioUiPreferences, writeStudioUiPreferences } from "./studioUiPreferences";

/** Whether the audio meter strip is shown; persisted, off unless the user showed it. */
export const useAudioMetersVisible = create<{
  visible: boolean;
  setVisible: (visible: boolean) => void;
}>((set) => ({
  visible: readStudioUiPreferences().audioMetersVisible ?? false,
  setVisible: (visible) => {
    writeStudioUiPreferences({ audioMetersVisible: visible });
    set({ visible });
  },
}));
