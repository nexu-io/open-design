import { create } from "zustand";
import type { PlaybackAdapter } from "../lib/playbackTypes";
import { clampToDuration } from "../lib/time";
import { usePlayerStore } from "./playerStore";

/** A frame the preview shows without moving the playhead (a trim's dragged edge); null shows the playhead's. */
export const usePreviewFrameStore = create<{ time: number | null }>(() => ({ time: null }));

export const setPreviewFrame = (time: number | null) => usePreviewFrameStore.setState({ time });

// A trim's edge frame is on screen, not the transport's time: pause, play and a reload's
// hand-over read the playhead's time, and play starts from it unless the caller seeked first.
function showingPreviewFrame(adapter: PlaybackAdapter): PlaybackAdapter {
  let seeked = false;
  const time = () => (seeked ? adapter.getTime() : usePlayerStore.getState().currentTime);
  return {
    play: () => {
      adapter.seek(time());
      adapter.play();
    },
    pause: () => adapter.pause(),
    seek: (t, options) => {
      seeked = true;
      adapter.seek(t, options);
    },
    getTime: time,
    getDuration: () => adapter.getDuration(),
    isPlaying: () => adapter.isPlaying(),
  };
}

/** The adapter as the transport must see it while a paused preview frame is on screen. */
export function transportAdapter(adapter: PlaybackAdapter | null): PlaybackAdapter | null {
  const showing = usePreviewFrameStore.getState().time !== null;
  return adapter && showing && !usePlayerStore.getState().isPlaying
    ? showingPreviewFrame(adapter)
    : adapter;
}

/** Puts each preview frame on screen while paused, and the playhead's frame back when it clears. */
export function subscribePreviewFrame(getAdapter: () => PlaybackAdapter | null): () => void {
  return usePreviewFrameStore.subscribe((state, prev) => {
    if (state.time === prev.time || usePlayerStore.getState().isPlaying) return;
    const adapter = getAdapter();
    const time = state.time ?? usePlayerStore.getState().currentTime;
    adapter?.seek(clampToDuration(time, adapter.getDuration()));
  });
}
