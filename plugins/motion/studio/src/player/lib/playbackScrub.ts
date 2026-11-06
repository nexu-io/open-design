import { usePlayerStore } from "../store/playerStore";
import { scrubPreviewAudio, stopScrubPreviewAudio } from "./timelineIframeHelpers";
import { getTimelineElementIndexes } from "./timelineElementIndexes";

export { stopScrubPreviewAudio };

// Scrub the music track's audio at a seeked composition time (paused-seek only).
// Skipped when audio is muted or the time falls outside the music clip.
export function scrubMusicAtSeek(iframe: HTMLIFrameElement | null, nextTime: number): void {
  const s = usePlayerStore.getState();
  const music = getTimelineElementIndexes(s.elements).musicElement;
  if (!music || s.audioMuted) return;
  const rel = nextTime - music.start;
  const audioFileTime = rel >= 0 && rel <= music.duration ? (music.playbackStart ?? 0) + rel : null;
  scrubPreviewAudio(iframe, audioFileTime, music, s.audioVolume);
}
