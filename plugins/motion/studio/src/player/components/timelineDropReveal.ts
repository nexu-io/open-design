import { usePlayerStore } from "../store/playerStore";
import { timelineClipFocusId } from "./timelineNavigationIdentity";

/**
 * Select a newly-created clip and scroll the timeline to it, the same pair of
 * calls AssetCard/AudioRow use to reveal an existing clip on activation.
 */
export function selectAndRevealTimelineElement(key: string): void {
  const store = usePlayerStore.getState();
  store.setSelectedElementId(key);
  store.requestTimelineFocus(timelineClipFocusId(key));
}
