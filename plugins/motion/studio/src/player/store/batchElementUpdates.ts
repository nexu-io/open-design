import { collectElementPatches, patchElements } from "./elementPatchQueue";
import { usePlayerStore } from "./playerStore";

/** `updateElement` calls inside `run` land as one store update: one pass over the list, one notification. */
export function batchElementUpdates(run: () => void): void {
  const patches = collectElementPatches(run);
  if (!patches || patches.size === 0) return;
  usePlayerStore.setState((state) => ({ elements: patchElements(state.elements, patches) }));
}
