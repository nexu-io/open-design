// Canvas drag diagnostics — grep [hf-drag]. Off by default; opt in per session
// with `localStorage.setItem("hf-drag-debug", "1")` (then reload).
//
// A drag that "jumps" is a position that changed without the pointer asking. The
// pointer delta, what snapping did to it, what each member was told to move, and
// where each member actually ended up are logged at every stage, so the frame the
// position diverges from the pointer is visible rather than inferred.
import { makeStudioDebugLogger } from "./studioDebug";

export const logDrag = makeStudioDebugLogger("drag");

let moveN = 0;

/** Per-pointermove logging, throttled: the first move then every 8th. */
export function logDragMove(data: Record<string, unknown>): void {
  logDrag("move", () => {
    moveN += 1;
    return moveN % 8 === 1 ? { n: moveN, ...data } : null;
  });
}

export function resetDragMoveLog(): void {
  moveN = 0;
}

/** Where these elements are rendered right now, in preview-document pixels. */
export function readDragPositions(
  elements: Array<{ key: string; element: HTMLElement }>,
): Record<string, string> {
  const positions: Record<string, string> = {};
  for (const { key, element } of elements) {
    const rect = element.getBoundingClientRect();
    positions[key] = `${Math.round(rect.left)},${Math.round(rect.top)}`;
  }
  return positions;
}

/**
 * Members whose screen movement disagrees with the rest of the group this frame.
 *
 * A group moves as one object, so every member travels the same distance; one
 * that does not is the whole bug, and averaged-looking samples hide it. Compares
 * each member's movement against the group's median and names the outliers, so a
 * single element drifting shows up as itself rather than as "the group jumped".
 */
export function findNonRigidMembers(
  before: Record<string, string>,
  after: Record<string, string>,
): string[] {
  const moves = new Map<string, string>();
  for (const key of Object.keys(after)) {
    const from = before[key]?.split(",").map(Number);
    const to = after[key]?.split(",").map(Number);
    if (!from || !to || from.length !== 2 || to.length !== 2) continue;
    moves.set(key, `${Math.round(to[0]! - from[0]!)},${Math.round(to[1]! - from[1]!)}`);
  }
  const counts = new Map<string, number>();
  for (const move of moves.values()) counts.set(move, (counts.get(move) ?? 0) + 1);
  let common = "";
  let best = 0;
  for (const [move, count] of counts) {
    if (count > best) [common, best] = [move, count];
  }
  return [...moves]
    .filter(([, move]) => move !== common)
    .map(([key, move]) => `${key.split("|")[2] ?? key} moved ${move}, group moved ${common}`);
}

/**
 * Sample the group now and again after the commit has had time to land. The drop
 * is the one moment a jump can hide: the source write, the preview reload and the
 * timeline resume all happen within a few frames of each other, and any of them
 * can put the elements back where they started before the new position arrives.
 */
export function logDragSettle(
  stage: string,
  elements: Array<{ key: string; element: HTMLElement }>,
): void {
  logDrag(stage, () => {
    const at = readDragPositions(elements);
    const win = elements[0]?.element.ownerDocument.defaultView;
    if (win) {
      win.setTimeout(
        () => logDrag(`${stage}+120ms`, () => ({ at: readDragPositions(elements) })),
        120,
      );
      win.setTimeout(
        () => logDrag(`${stage}+400ms`, () => ({ at: readDragPositions(elements) })),
        400,
      );
      win.setTimeout(
        () => logDrag(`${stage}+900ms`, () => ({ at: readDragPositions(elements) })),
        900,
      );
    }
    return { at };
  });
}
