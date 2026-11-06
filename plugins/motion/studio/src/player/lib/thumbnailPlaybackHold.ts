import type { ThumbnailScheduler } from "./thumbnailScheduler";

interface PlaybackStore {
  getState(): { isPlaying: boolean };
  subscribe(listener: (state: { isPlaying: boolean }) => void): () => void;
}

/** Subscribed to the state, not to setIsPlaying, so a reset that writes isPlaying: false also lets go. */
export function bindThumbnailPlaybackHold(
  store: PlaybackStore,
  scheduler: Pick<ThumbnailScheduler, "setPlaybackActive">,
): () => void {
  scheduler.setPlaybackActive(store.getState().isPlaying);
  return store.subscribe((state) => scheduler.setPlaybackActive(state.isPlaying));
}
