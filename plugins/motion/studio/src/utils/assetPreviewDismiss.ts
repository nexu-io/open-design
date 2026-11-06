/**
 * Dismissal rule for the sidebar asset preview overlay (AssetPreviewOverlay):
 * the preview is a transient "look at this asset" state, so any playhead
 * activity — starting playback, or seeking/scrubbing away from where the
 * playhead sat when the preview opened — hands focus back to the canvas and
 * closes it.
 *
 * Pure — unit-tested. The overlay captures `openedTime` when the preview
 * opens and feeds every subsequent player-store snapshot through this.
 */

export interface AssetPreviewDismissSnapshot {
  isPlaying: boolean;
  currentTime: number;
  /** Pending out-of-loop seek request (playerStore.requestedSeekTime). */
  requestedSeekTime: number | null;
}

/** Tolerance for float noise in currentTime echoes (well under one frame). */
const TIME_EPSILON_S = 1e-6;

export function shouldDismissAssetPreview(
  openedTime: number,
  snapshot: AssetPreviewDismissSnapshot,
): boolean {
  if (snapshot.isPlaying) return true;
  if (snapshot.requestedSeekTime !== null) return true;
  return Math.abs(snapshot.currentTime - openedTime) > TIME_EPSILON_S;
}
