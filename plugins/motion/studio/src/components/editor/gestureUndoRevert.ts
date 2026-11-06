import {
  captureStudioPathOffset,
  restoreStudioPathOffset,
  type StudioPathOffsetSnapshot,
} from "./manualEdits";
import {
  getOffsetDragGsap,
  stampGestureBase,
  type ManualOffsetDragMember,
} from "./manualOffsetDrag";
import type { StudioEditRevert } from "../../utils/studioPendingEdits";

interface MemberPosition {
  offset: StudioPathOffsetSnapshot;
  gsap: { x: number; y: number } | null;
  placement: string[];
}

// Where an element-offset move draws the element when no transform channel can take it.
const PLACEMENT = ["position", "left", "top"];
const placementOf = (element: HTMLElement) =>
  PLACEMENT.map((prop) => element.style.getPropertyValue(prop));

function showPlacement(element: HTMLElement, placement: string[]): void {
  PLACEMENT.forEach((prop, i) => {
    if (placement[i]) element.style.setProperty(prop, placement[i]!);
    else element.style.removeProperty(prop);
  });
}

function readMemberPosition(member: ManualOffsetDragMember): MemberPosition {
  const gsap = member.plainTranslate ? null : getOffsetDragGsap(member.element);
  return {
    offset: captureStudioPathOffset(member.element),
    gsap: gsap && {
      x: Number(gsap.getProperty(member.element, "x")),
      y: Number(gsap.getProperty(member.element, "y")),
    },
    placement: placementOf(member.element),
  };
}

function showMemberPosition(member: ManualOffsetDragMember, position: MemberPosition): void {
  restoreStudioPathOffset(member.element, position.offset);
  showPlacement(member.element, position.placement);
  if (position.gsap) getOffsetDragGsap(member.element)?.set(member.element, { ...position.gsap });
  // The restore drops the gesture's base stamps; its save still reads them.
  if (!member.plainTranslate)
    stampGestureBase(member.element, member.initialOffset, member.baseGsap);
}

/** Undo's live revert of a move: its members at gesture start. */
export function manualOffsetMoveRevert(members: ManualOffsetDragMember[]): StudioEditRevert {
  const startPlacement = members.map((member) => placementOf(member.element));
  return () => {
    const shown = members.map(readMemberPosition);
    members.forEach((member, i) =>
      showMemberPosition(member, {
        offset: member.initialPathOffset,
        gsap: member.plainTranslate ? null : member.baseGsap,
        placement: startPlacement[i]!,
      }),
    );
    return () => members.forEach((member, i) => showMemberPosition(member, shown[i]!));
  };
}

export interface StudioElementLook {
  style: string | null;
  gsap: Record<string, number> | null;
}

const GSAP_LOOK_PROPS = ["x", "y", "rotation", "scaleX", "scaleY"];

/** Reads GSAP only for an element it owns: reading a plain one makes GSAP bake its CSS into a transform. */
export function readElementLook(element: HTMLElement, gsapOwned: boolean): StudioElementLook {
  const gsap = gsapOwned ? getOffsetDragGsap(element) : null;
  return {
    style: element.getAttribute("style"),
    gsap:
      gsap &&
      Object.fromEntries(
        GSAP_LOOK_PROPS.map((prop) => [prop, Number(gsap.getProperty(element, prop))]),
      ),
  };
}

function showElementLook(element: HTMLElement, look: StudioElementLook): void {
  if (look.style === null) element.removeAttribute("style");
  else element.setAttribute("style", look.style);
  if (look.gsap) getOffsetDragGsap(element)?.set(element, { ...look.gsap });
}

/** Undo's live revert of a resize or rotate: the element as it looked at press. */
export function elementLookRevert(
  element: HTMLElement,
  start: StudioElementLook,
): StudioEditRevert {
  return () => {
    const shown = readElementLook(element, start.gsap !== null);
    showElementLook(element, start);
    return () => showElementLook(element, shown);
  };
}
