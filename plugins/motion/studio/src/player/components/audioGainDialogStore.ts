import { create } from "zustand";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { clipHasSound } from "./clipMenuNormalize";

interface AudioGainDialogState {
  targetKeys: readonly string[] | null;
  open: (keys: readonly string[]) => void;
  close: () => void;
}

/** Which clips the Audio Gain dialog (G) is open for. */
export const useAudioGainDialogStore = create<AudioGainDialogState>((set) => ({
  targetKeys: null,
  open: (keys) => set({ targetKeys: keys }),
  close: () => set({ targetKeys: null }),
}));

const keyOf = (el: TimelineElement) => el.key ?? el.id;

/** The selected clips with sound, or just `clicked` when it is outside the selection. */
function audioGainTargetKeys(clicked?: TimelineElement): string[] {
  const { elements, selectedElementId, selectedElementIds } = usePlayerStore.getState();
  const selected = new Set(selectedElementIds);
  if (selectedElementId) selected.add(selectedElementId);
  if (clicked && !selected.has(keyOf(clicked)))
    return clipHasSound(clicked) ? [keyOf(clicked)] : [];
  return elements.filter((el) => selected.has(keyOf(el)) && clipHasSound(el)).map(keyOf);
}

/** Open Audio Gain for the selection (or the clicked clip); false when none of it has sound. */
export function openAudioGainDialog(clicked?: TimelineElement): boolean {
  const keys = audioGainTargetKeys(clicked);
  if (keys.length === 0) return false;
  useAudioGainDialogStore.getState().open(keys);
  return true;
}
