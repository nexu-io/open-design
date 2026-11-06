/**
 * Shared memory for ONE synchronous pass that measures many elements.
 *
 * The off-canvas indicator overlay re-measures every element in the preview
 * several times a second, and almost all of that work is per-ANCESTOR, not
 * per-element: a visibility read for every node up to the root, a transform
 * composed over the same nodes, and a walk for the source-file boundary. Two
 * siblings share their entire chain above themselves, so a preview of a
 * thousand elements asked the platform the same questions about the same
 * ancestors a thousand times.
 *
 * WHY THIS IS A PASS AND NOT A CACHE. A cache has to answer "what could have
 * changed since last time", and for a MEASUREMENT the honest answer is
 * "anything": an `<img>` finishing decode, a web font swapping in, a CSS
 * transition frame, a container query, a `CSSStyleSheet.insertRule` — each one
 * moves an element's box with nothing written to the DOM, so no mutation
 * record exists to invalidate on and no observer reports all of them. A pass
 * sidesteps the question instead of answering it wrong: it lives inside one
 * synchronous measurement that only READS, so nothing can move under it, and
 * it is dropped when the pass ends. Every rebuild still measures every
 * element, exactly as it did before; it just stops asking the same question
 * about the same ancestor once per descendant.
 *
 * Never store one of these across a rebuild, an await, or a frame.
 */

/** The composed transform type the overlay's corner math uses. */
type OverlayTransform = DOMMatrix;

export interface OverlayMeasurePass {
  /** Does this node render, given everything above it? */
  visible: Map<HTMLElement, boolean>;
  /** This node's transform composed with every ancestor's, up to the
   *  composition root. `null` is an answer: some node's transform is
   *  unusable. */
  transform: Map<HTMLElement, OverlayTransform | null>;
  /** The nearest ancestor carrying a source-file boundary, or null. */
  sourceBoundary: Map<HTMLElement, HTMLElement | null>;
  /** That boundary's client rect, which is shared by everything inside it. */
  sourceBoundaryRect: Map<HTMLElement, DOMRect>;
}

export function createOverlayMeasurePass(): OverlayMeasurePass {
  return {
    visible: new Map(),
    transform: new Map(),
    sourceBoundary: new Map(),
    sourceBoundaryRect: new Map(),
  };
}

/** Read through a pass's map, filling it on the way. `undefined` is the only
 *  miss, so a memoized `null` stays an answer. */
export function readThroughPass<K, V>(memo: Map<K, V>, key: K, compute: () => V): V {
  const answered = memo.get(key);
  if (answered !== undefined) return answered;
  const value = compute();
  memo.set(key, value);
  return value;
}
