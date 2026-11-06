import type { DomEditSelection } from "./domEditing";
import type { DomEditGroupPathOffsetCommit } from "./domEditOverlayGestures";
import { canCanvasNudgeTargets } from "./domEditNudge";
import { isStudioManualEditGestureCurrent, restoreStudioPathOffset } from "./manualEdits";
import { countStudioManualEditSave } from "./manualEditsDom";
import {
  applyManualOffsetDragCommit,
  createManualOffsetDragMember,
  endManualOffsetDragMembers,
  restoreManualOffsetDragMembers,
  toTopScreenPoint,
  type ManualOffsetDragMember,
} from "./manualOffsetDrag";

export interface DomGroupMove {
  selection: DomEditSelection;
  /** Composition px: the element's box moves by exactly this in the film. */
  delta: { x: number; y: number };
}

/** Composition px to the top page's px; the preview frames only scale and shift. */
function toScreen(doc: Document, delta: { x: number; y: number }) {
  const origin = toTopScreenPoint(doc, { x: 0, y: 0 });
  const moved = toTopScreenPoint(doc, delta);
  if (!origin || !moved) throw new Error("The preview has no measurable size.");
  return { x: moved.x - origin.x, y: moved.y - origin.y };
}

function memberFor(
  selection: DomEditSelection,
  scale: { x: number; y: number },
): ManualOffsetDragMember {
  const { element } = selection;
  const box = element.getBoundingClientRect();
  const result = createManualOffsetDragMember({
    key: selection.id ?? selection.selector ?? selection.label,
    selection,
    element,
    rect: {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      editScaleX: scale.x,
      editScaleY: scale.y,
    },
    gesture: "drag",
  });
  if (!result.ok) throw new Error(result.reason);
  return result.member;
}

/**
 * Moves each element by its delta as one group drag would drop it: one save, one undo entry.
 * Any member that can't move refuses the whole call before anything is drawn or written.
 */
export async function moveDomGroupBy(
  moves: DomGroupMove[],
  commitGroup: (updates: DomEditGroupPathOffsetCommit[]) => Promise<unknown>,
): Promise<void> {
  const moving = moves.filter(({ delta }) => delta.x !== 0 || delta.y !== 0);
  if (moving.length === 0) return;
  const selections = moving.map(({ selection }) => selection);
  if (!canCanvasNudgeTargets(selections)) {
    const blocked = selections.find((s) => !s.capabilities.canApplyManualOffset);
    throw new Error(blocked?.capabilities.reasonIfDisabled ?? `${blocked?.label} can't be moved.`);
  }
  const screens = moving.map(({ selection, delta }) =>
    toScreen(selection.element.ownerDocument, delta),
  );
  const members: ManualOffsetDragMember[] = [];
  try {
    for (const selection of selections)
      members.push(memberFor(selection, toScreen(selection.element.ownerDocument, { x: 1, y: 1 })));
  } catch (error) {
    restoreManualOffsetDragMembers(members);
    throw error;
  }
  const updates = members.map((member, index) => ({
    selection: member.selection,
    next: applyManualOffsetDragCommit(member, screens[index]!.x, screens[index]!.y),
    plainTranslate: member.plainTranslate,
  }));
  try {
    await countStudioManualEditSave(members[0]!.element, () => commitGroup(updates));
  } catch (error) {
    for (const member of members) {
      if (isStudioManualEditGestureCurrent(member.element, member.gestureToken))
        restoreStudioPathOffset(member.element, member.initialPathOffset);
    }
    throw error;
  } finally {
    endManualOffsetDragMembers(members);
  }
}
