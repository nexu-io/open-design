/**
 * Draw intent recognition — turns a raw POD stroke into one of the
 * supported user gestures. Phase 4 only ships a placeholder classifier
 * (always returns 'comment') so the rest of the pipeline can wire up
 * without taking a dependency on a model that does not yet exist.
 *
 * Future phases will plug in a real recognizer (likely a small on-device
 * model that classifies a normalized stroke into the variants below) and
 * add new intent types. The host dispatches on the returned tag, so
 * adding a new intent is additive — existing call sites keep working.
 */

export type Point2D = { x: number; y: number };

export type DrawIntent =
  /** Open a comment anchored to the enclosed region. Default today. */
  | 'comment'
  /** Paint a transient highlight overlay for review/QA. */
  | 'highlight'
  /** Treat the stroke as a "modify this area" request and route to Edit. */
  | 'modify'
  /** Select a single underlying element by stroke overlap. */
  | 'select';

export interface DrawIntentResult {
  intent: DrawIntent;
  /**
   * Confidence in [0, 1]. Phase 4 always returns 1 since the classifier
   * is hard-coded; downstream code can already gate on this for the
   * future ML-backed recognizer.
   */
  confidence: number;
}

/**
 * Synchronous classifier. Stays sync on purpose so the comment popover
 * can open in the same animation frame as the stroke completion — the
 * real model behind it (when added) can be replaced with a Promise
 * return at the same call site without touching consumers.
 */
export function recognizeDrawIntent(_points: Point2D[]): DrawIntentResult {
  return { intent: 'comment', confidence: 1 };
}
