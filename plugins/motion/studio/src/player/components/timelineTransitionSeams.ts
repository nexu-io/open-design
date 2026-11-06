import type { TimelineElement } from "../store/playerStore";

export interface TimelineTransitionSeam {
  outgoing: TimelineElement;
  incoming: TimelineElement;
  centerTime: number;
  duration: number;
}

export function isTransitionPair(a: TimelineElement, b: TimelineElement): boolean {
  return Boolean(a.transitionLabel && a.transitionLabel === b.transitionLabel);
}

export function deriveTimelineTransitionSeams(
  elements: readonly TimelineElement[],
): TimelineTransitionSeam[] {
  const sorted = [...elements].sort((left, right) => left.start - right.start);
  const seams: TimelineTransitionSeam[] = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const outgoing = sorted[index]!;
    const incoming = sorted[index + 1]!;
    if (outgoing.track !== incoming.track || !isTransitionPair(outgoing, incoming)) continue;
    const outgoingEnd = outgoing.start + outgoing.duration;
    const overlapStart = Math.max(outgoing.start, incoming.start);
    const overlapEnd = Math.min(outgoingEnd, incoming.start + incoming.duration);
    const duration = overlapEnd - overlapStart;
    if (duration <= 0) continue;
    seams.push({
      outgoing,
      incoming,
      centerTime: overlapStart + duration / 2,
      duration,
    });
  }
  return seams;
}

/**
 * Transition seams keyed by track, derived once for every row. Pairs are found within a track, so a clip on
 * another track that starts between a transition's two clips cannot hide it.
 */
export function deriveTimelineTransitionSeamsByTrack(
  elements: readonly TimelineElement[],
): ReadonlyMap<number, readonly TimelineTransitionSeam[]> {
  const tracks = new Map<number, TimelineElement[]>();
  for (const element of elements) {
    const track = tracks.get(element.track);
    if (track) track.push(element);
    else tracks.set(element.track, [element]);
  }
  const byTrack = new Map<number, readonly TimelineTransitionSeam[]>();
  for (const [track, trackElements] of tracks) {
    const seams = deriveTimelineTransitionSeams(trackElements);
    if (seams.length > 0) byTrack.set(track, seams);
  }
  return byTrack;
}
