/**
 * Per-key task serializer. Tasks sharing a key run strictly in order: a new
 * task for a key awaits the prior task for that key before starting, so their
 * effects (e.g. overlapping read-modify-write POSTs to one file) can't
 * interleave. Tasks under different keys are independent and never block each
 * other.
 *
 * Used to serialize GSAP meta-update commits per animationId so the shadow
 * fidelity diff always pairs an op with the server result that includes it —
 * without globally serializing unrelated commits.
 */
export function createKeyedSerializer() {
  const inFlight = new Map<string, Promise<unknown>>();

  return function run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prior = inFlight.get(key) ?? Promise.resolve();
    // Chain onto the prior task regardless of how it settled; a rejected prior
    // commit must not wedge the key forever.
    const next = prior.then(task, task);
    inFlight.set(key, next);
    // Once this task settles, drop it from the map if nothing newer replaced it,
    // so completed keys don't leak.
    void next.then(
      () => {
        if (inFlight.get(key) === next) inFlight.delete(key);
      },
      () => {
        if (inFlight.get(key) === next) inFlight.delete(key);
      },
    );
    return next;
  };
}
