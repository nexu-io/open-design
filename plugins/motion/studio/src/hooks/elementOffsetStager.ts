import type { DomEditPersistOutcome } from "./domEditCommitTypes";
import { getDomEditTargetKey, type DomEditSelection } from "../components/editor/domEditing";
import {
  applyElementPositionOffset,
  type ElementOffsetRefusal,
} from "../components/editor/elementPositionOffset";
import { LAYER_REVEAL_PRIOR_POSITION_ATTR } from "../player/lib/timelineElementHelpers";
import type { PatchOperation } from "../utils/sourcePatcher";
import { writePlainMove } from "../components/editor/plainTranslate";
import { captureStudioPathOffset, restoreStudioPathOffset } from "../components/editor/manualEdits";
import { gsapHoldsTranslate } from "./gsapRuntimeKeyframes";
import { markStudioSaveErrorAlreadyToasted } from "../utils/studioSaveDiagnostics";

const GSAP_TOOK_OVER =
  "The animation took over this layer's position during the move, so it was not saved.";

const ELEMENT_OFFSET_REFUSED: Record<ElementOffsetRefusal, string> = {
  anchored: "This layer is anchored from its right or bottom edge. Move it in the Code tab.",
  percent: "This layer's position is set in percent. Move it in the Code tab.",
};

export interface ElementOffsetStagerDeps {
  commitPositionPatchToHtml: (
    selection: DomEditSelection,
    patches: PatchOperation[],
    options: { label: string; coalesceKey: string; coalesceMs?: number },
  ) => Promise<DomEditPersistOutcome | undefined>;
  showToast: (message: string, tone?: "error" | "info") => void;
  readOnlyPreview?: boolean;
}

function gsapOf(el: HTMLElement): { set: (t: Element, v: object) => void } | undefined {
  return (el.ownerDocument.defaultView as { gsap?: { set: (t: Element, v: object) => void } })
    ?.gsap;
}

/** The drag draft moved GSAP's x/y; left/top carries the move now, so put them back. */
function settleGsapDraftAtGestureStart(el: HTMLElement): void {
  const gsap = gsapOf(el);
  const x = Number.parseFloat(el.getAttribute("data-hf-drag-gsap-base-x") ?? "");
  const y = Number.parseFloat(el.getAttribute("data-hf-drag-gsap-base-y") ?? "");
  if (gsap && Number.isFinite(x) && Number.isFinite(y)) gsap.set(el, { x, y });
}

export function refuseGsapTakeover(
  el: HTMLElement,
  showToast: ElementOffsetStagerDeps["showToast"],
) {
  if (!gsapHoldsTranslate(el)) return;
  gsapOf(el)?.set(el, { x: 0, y: 0, xPercent: 0, yPercent: 0 });
  showToast(GSAP_TOOK_OVER, "error");
  throw markStudioSaveErrorAlreadyToasted(new Error(GSAP_TOOK_OVER));
}

let plainMoveCounter = 0;

/** GSAP does not position the element: `next` is its whole translate, live now and saved as drawn. */
function stagePlainTranslate(
  commitPositionPatchToHtml: ElementOffsetStagerDeps["commitPositionPatchToHtml"],
  selection: DomEditSelection,
  next: { x: number; y: number },
  coalesceKey?: string,
): { save: () => Promise<DomEditPersistOutcome | undefined>; rollback: () => void } {
  const el = selection.element;
  const before = captureStudioPathOffset(el);
  const patches = writePlainMove(el, next);
  const written = el.style.getPropertyValue("translate");
  const rollback = () => {
    if (el.style.getPropertyValue("translate") === written) restoreStudioPathOffset(el, before);
  };
  const key = coalesceKey ?? `move:${++plainMoveCounter}`;
  const options = { label: "Move layer", coalesceKey: key, coalesceMs: Number.POSITIVE_INFINITY };
  const save = () =>
    commitPositionPatchToHtml(selection, patches, options).catch((error) => {
      rollback();
      throw error;
    });
  return { save, rollback };
}

/** Applies a move on the element itself live now: its translate on the plain route, else
 *  left/top for a shared-tween element. Throws, after a toast, when it cannot. */
export function stageElementOffset(
  { commitPositionPatchToHtml, showToast, readOnlyPreview }: ElementOffsetStagerDeps,
  selection: DomEditSelection,
  next: { x: number; y: number },
  plainTranslate: boolean,
  coalesceKey?: string,
): { save: () => Promise<DomEditPersistOutcome | undefined>; rollback: () => void } {
  const el = selection.element;
  if (readOnlyPreview) return { save: () => Promise.resolve(undefined), rollback: () => undefined };
  if (plainTranslate) {
    refuseGsapTakeover(el, showToast);
    return stagePlainTranslate(commitPositionPatchToHtml, selection, next, coalesceKey);
  }
  const previous = { position: el.style.position, left: el.style.left, top: el.style.top };
  const liftMarker = el.getAttribute(LAYER_REVEAL_PRIOR_POSITION_ATTR);
  const result = applyElementPositionOffset(el, next);
  if (!Array.isArray(result)) {
    showToast(ELEMENT_OFFSET_REFUSED[result], "error");
    throw new Error(ELEMENT_OFFSET_REFUSED[result]);
  }
  settleGsapDraftAtGestureStart(el);
  const rollback = () => {
    Object.assign(el.style, previous);
    if (liftMarker !== null) el.setAttribute(LAYER_REVEAL_PRIOR_POSITION_ATTR, liftMarker);
  };
  const save = () =>
    commitPositionPatchToHtml(selection, result, {
      label: "Move layer",
      coalesceKey: coalesceKey ?? `element-offset:${getDomEditTargetKey(selection)}`,
      ...(coalesceKey && { coalesceMs: Number.POSITIVE_INFINITY }),
    }).catch((error) => {
      rollback();
      throw error;
    });
  return { save, rollback };
}
