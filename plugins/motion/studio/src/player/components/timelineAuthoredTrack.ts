import type { TimelineElement } from "../store/playerStore";

const keyOf = (element: TimelineElement) => element.key ?? element.id;

/** Authored track numbers only compare within one source file. */
export const sameSourceFile = (a: TimelineElement, b: TimelineElement): boolean =>
  (a.sourceFile ?? null) === (b.sourceFile ?? null);

/** Translate a display lane into the source-file track to persist. */
export function authoredTrackForLane(
  lane: number,
  elements: TimelineElement[],
  dragged: TimelineElement,
): number {
  const dragKey = keyOf(dragged);
  const peers = elements.filter((element) => {
    return keyOf(element) !== dragKey && sameSourceFile(element, dragged);
  });
  const occupant = peers.find((element) => element.track === lane);
  if (occupant) return occupant.authoredTrack ?? occupant.track;

  let nearest: TimelineElement | null = null;
  for (const peer of peers) {
    if (!nearest || Math.abs(peer.track - lane) < Math.abs(nearest.track - lane)) nearest = peer;
  }
  if (!nearest) return lane;
  // Synthetic expanded-child display rows can be fractional; authored tracks cannot.
  return Math.round((nearest.authoredTrack ?? nearest.track) + (lane - nearest.track));
}
