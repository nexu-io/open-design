import { appendResourceQuery } from '../collab/workspace-identity';

/**
 * A background cover iframe must never make sound.
 *
 * Persisted motion sources embed the motion player, which plays the timeline
 * and its soundtrack on load unless the document URL says it is a thumbnail.
 * `odMotionThumbnail=1` keeps the animation running but forces every audio
 * track muted and paused; sound belongs to the project preview the user opens.
 * Ordinary HTML ignores the parameter, so covers need no motion detection.
 *
 * Hosted mode (`odMotionPreview=1`) is deliberately not set: it waits for a
 * host activity binding these covers do not install, freezing the animation.
 */
export function mutedMotionCoverUrl(src: string): string {
  return appendResourceQuery(src, 'odMotionThumbnail=1');
}
