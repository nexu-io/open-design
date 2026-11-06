import type { TimelineElement, TimelineElementPatch } from "./timelineElement";

let queued: Map<string, TimelineElementPatch> | null = null;

/** Queues `updates` while a batch is collecting; false means the caller applies it now. */
export function queueElementPatch(key: string, updates: TimelineElementPatch): boolean {
  if (!queued) return false;
  queued.set(key, { ...queued.get(key), ...updates });
  return true;
}

/** Runs `run`, returning the patches it queued; null when an outer batch already collects them. */
export function collectElementPatches(run: () => void): Map<string, TimelineElementPatch> | null {
  if (queued) {
    run();
    return null;
  }
  const patches = (queued = new Map());
  try {
    run();
  } finally {
    queued = null;
  }
  return patches;
}

export function patchElements(
  elements: TimelineElement[],
  patches: ReadonlyMap<string, TimelineElementPatch>,
): TimelineElement[] {
  return elements.map((el) => {
    const patch = patches.get(el.key ?? el.id);
    return patch ? { ...el, ...patch } : el;
  });
}
