import { isHtmlElement } from "@hyperframes/core/runtime/dom-realm";
import type { DomEditSelection } from "./domEditing";
import {
  applyStudioPathOffset,
  applyStudioPathOffsetDraft,
  beginStudioManualEditGesture,
  captureStudioPathOffset,
  clearStudioPathOffset,
  endStudioManualEditGesture,
  isStudioManualEditGestureCurrent,
  readAppliedStudioPathOffset,
  restoreStudioPathOffset,
  type StudioPathOffsetSnapshot,
} from "./manualEdits";
import type { EditMoment } from "./manualEditsTypes";
import { computeDraggedGsapPosition } from "../../hooks/draggedGsapPosition";
import { editsPlainCss } from "../../hooks/gsapRuntimeKeyframes";
import { readTranslatePx, UNREADABLE_TRANSLATE, writeTranslatePx } from "./plainTranslate";

interface OffsetDragGsap {
  set: (el: Element, vars: Record<string, number | string>) => void;
  getProperty: (el: Element, prop: string) => number;
}

export function getOffsetDragGsap(element: HTMLElement): OffsetDragGsap | null {
  const win = element.ownerDocument.defaultView as
    | (Window & { gsap?: Partial<OffsetDragGsap> })
    | null;
  const gsap = win?.gsap;
  return gsap?.set && gsap.getProperty ? (gsap as OffsetDragGsap) : null;
}

/**
 * Live drag preview through the GSAP channel — the SAME channel the commit
 * lands in (a `tl.set`/keyframe on the timeline), so what the user sees while
 * dragging equals what gets written (plan R3/R4). Reuses the commit's
 * base+delta+rotation math so preview and commit agree by construction. Returns
 * true when handled via gsap; false when gsap is unavailable (caller falls back
 * to the CSS draft).
 */
function applyOffsetDragDraftViaGsap(
  element: HTMLElement,
  offset: { x: number; y: number },
  baseGsap: { x: number; y: number },
): boolean {
  const gsap = getOffsetDragGsap(element);
  if (!gsap) return false;
  // GSAP owns the transform; neutralize the CSS translate longhand so the two
  // channels can't compose into a doubled position.
  element.style.setProperty("translate", "none");
  // Use the STABLE gesture-start base (captured in JS), NOT `gsap.getProperty`.
  // After `translate: none`, getProperty reads the transform we set last frame,
  // so `base + delta` would integrate frame-over-frame and fling the element.
  const { newX, newY } = computeDraggedGsapPosition(element, offset, baseGsap);
  gsap.set(element, { x: newX, y: newY });
  return true;
}

const DEFAULT_OFFSET_PROBE_PX = 100;
const MIN_PROBE_VECTOR_LENGTH_PX = 0.01;
const MIN_MATRIX_DETERMINANT = 0.000001;

export interface ManualOffsetDragMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface ManualOffsetDragRect {
  left: number;
  top: number;
  width: number;
  height: number;
  editScaleX: number;
  editScaleY: number;
}

export interface ManualOffsetDragMember {
  key: string;
  selection: DomEditSelection;
  element: HTMLElement;
  initialOffset: { x: number; y: number };
  /** The move writes the element's own inline `translate`; offsets are then absolute translate px. */
  plainTranslate: boolean;
  /**
   * The element's GSAP x/y at gesture start, captured in JS so a mid-drag
   * re-render (which reverts inline style + wipes the `data-hf-drag-gsap-base-*`
   * attrs) can't drop the base. Without this the draft falls back to the LIVE
   * transform — i.e. the value it set last frame — and `base + delta` integrates,
   * making the element accelerate away ("flies"). See applyOffsetDragDraftViaGsap.
   */
  baseGsap: { x: number; y: number };
  initialPathOffset: StudioPathOffsetSnapshot;
  gestureToken: string;
  screenToOffset: ManualOffsetDragMatrix;
  originRect: ManualOffsetDragRect;
}

export type ManualOffsetDragMemberResult =
  | { ok: true; member: ManualOffsetDragMember }
  | { ok: false; reason: string; selection: DomEditSelection };

type Point = { x: number; y: number };

function finitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function vectorLength(point: Point): number {
  return Math.hypot(point.x, point.y);
}

function finiteRect(rect: DOMRect): boolean {
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height)
  );
}

function readViewportSize(win: Window): { width: number; height: number } {
  const docEl = win.document.documentElement;
  const width = win.innerWidth || docEl.clientWidth || 1;
  const height = win.innerHeight || docEl.clientHeight || 1;
  return {
    width: width > 0 ? width : 1,
    height: height > 0 ? height : 1,
  };
}

function getFrameElement(win: Window): HTMLElement | null {
  try {
    const frameElement = win.frameElement;
    if (!frameElement) return null;
    return isHtmlElement(frameElement) ? frameElement : null;
  } catch {
    return null;
  }
}

function getRectCenter(element: HTMLElement): Point | null {
  const rect = element.getBoundingClientRect();
  if (!finiteRect(rect) || (rect.width <= 0 && rect.height <= 0)) {
    return null;
  }

  const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  return toTopScreenPoint(element.ownerDocument, point);
}

export function toTopScreenPoint(doc: Document, point: Point): Point | null {
  let win: Window | null = doc.defaultView;
  while (win) {
    const frameElement = getFrameElement(win);
    if (!frameElement) break;

    const frameRect = frameElement.getBoundingClientRect();
    if (!finiteRect(frameRect) || frameRect.width <= 0 || frameRect.height <= 0) return null;

    const viewport = readViewportSize(win);
    point = {
      x: frameRect.left + point.x * (frameRect.width / viewport.width),
      y: frameRect.top + point.y * (frameRect.height / viewport.height),
    };
    win = frameElement.ownerDocument.defaultView;
  }
  return point;
}

export function invertManualOffsetDragMatrix(
  matrix: ManualOffsetDragMatrix,
): ManualOffsetDragMatrix | null {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < MIN_MATRIX_DETERMINANT) {
    return null;
  }

  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
  };
}

export function applyManualOffsetDragMatrix(matrix: ManualOffsetDragMatrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y,
    y: matrix.b * point.x + matrix.d * point.y,
  };
}

/**
 * The perspective w-divisor (matrix3d m44) of the element's current transform.
 * For a plain `translateZ(z)` under `perspective(p)`, m44 = (p - z) / p, so the
 * element renders 1/m44× larger and a translate of `d` composition px moves
 * `d / m44` px on screen. Returns 1 for 2D transforms (no foreshortening). Only
 * the unmeasurable-element fallback needs this — the measured path reads the
 * foreshortening off the element's real movement along with everything else.
 */
function readTransformWDivisor(element: HTMLElement): number {
  const t = element.ownerDocument.defaultView?.getComputedStyle(element).transform;
  if (!t || !t.startsWith("matrix3d(")) return 1;
  const parts = t.slice("matrix3d(".length, -1).split(",");
  const w = Number.parseFloat(parts[15] ?? "");
  return Number.isFinite(w) && w > 0 ? w : 1;
}

/**
 * How far the element actually moves on screen per unit of drag offset, measured
 * rather than assumed.
 *
 * The offset is written on the element, but what reaches the screen is that offset
 * put through every transform above it. A parent carrying a rotation, a mirror, a
 * scale or a perspective changes both the direction and the distance — a card at
 * `rotationY: 180` sends a rightward drag left. Guessing this from the canvas zoom
 * alone was wrong for every such element: the overlay tracked the pointer while the
 * element went somewhere else, and the overlay only jumped to the truth on drop,
 * when it re-measured. Moving the element and watching where it lands costs three
 * layout reads once per gesture and is right for any transform, including ones no
 * closed-form fast path would cover.
 */
export function measureManualOffsetDragScreenToOffsetMatrix(
  element: HTMLElement,
  initialOffset: { x: number; y: number },
  options: { probeSize?: number; scaleX?: number; scaleY?: number; plainTranslate?: boolean } = {},
): { ok: true; matrix: ManualOffsetDragMatrix } | { ok: false; reason: string } {
  const probeSize = options.probeSize ?? DEFAULT_OFFSET_PROBE_PX;
  if (!Number.isFinite(probeSize) || probeSize <= 0) {
    return { ok: false, reason: "Invalid movement probe size." };
  }

  const draw = options.plainTranslate ? writeTranslatePx : applyStudioPathOffsetDraft;
  const snapshot = captureStudioPathOffset(element);
  try {
    draw(element, initialOffset);
    const origin = getRectCenter(element);
    if (!origin) {
      return { ok: false, reason: "Element has no measurable box." };
    }

    draw(element, {
      x: initialOffset.x + probeSize,
      y: initialOffset.y,
    });
    const probeX = getRectCenter(element);
    if (!probeX) {
      return { ok: false, reason: "Element X movement could not be measured." };
    }

    draw(element, {
      x: initialOffset.x,
      y: initialOffset.y + probeSize,
    });
    const probeY = getRectCenter(element);
    if (!probeY) {
      return { ok: false, reason: "Element Y movement could not be measured." };
    }

    const xColumn = {
      x: (probeX.x - origin.x) / probeSize,
      y: (probeX.y - origin.y) / probeSize,
    };
    const yColumn = {
      x: (probeY.x - origin.x) / probeSize,
      y: (probeY.y - origin.y) / probeSize,
    };
    if (
      !finitePoint(xColumn) ||
      !finitePoint(yColumn) ||
      vectorLength(xColumn) < MIN_PROBE_VECTOR_LENGTH_PX ||
      vectorLength(yColumn) < MIN_PROBE_VECTOR_LENGTH_PX
    ) {
      return { ok: false, reason: "Element movement response is too small to measure." };
    }

    const offsetToScreen = {
      a: xColumn.x,
      b: xColumn.y,
      c: yColumn.x,
      d: yColumn.y,
    };
    const screenToOffset = invertManualOffsetDragMatrix(offsetToScreen);
    if (!screenToOffset) {
      return { ok: false, reason: "Element movement response is not invertible." };
    }

    return { ok: true, matrix: screenToOffset };
  } finally {
    restoreStudioPathOffset(element, snapshot);
  }
}

export function resolveManualOffsetForPointerDelta(input: {
  initialOffset: { x: number; y: number };
  screenToOffset: ManualOffsetDragMatrix;
  dx: number;
  dy: number;
}): { x: number; y: number } {
  const offsetDelta = applyManualOffsetDragMatrix(input.screenToOffset, {
    x: input.dx,
    y: input.dy,
  });
  return {
    x: input.initialOffset.x + offsetDelta.x,
    y: input.initialOffset.y + offsetDelta.y,
  };
}

// Pre-existing complexity — surfaced by this branch touching the file, not by new logic.
// fallow-ignore-next-line complexity
export function createManualOffsetDragMember(input: {
  key: string;
  selection: DomEditSelection;
  element: HTMLElement;
  rect: ManualOffsetDragRect;
  gesture?: "drag" | "nudge" | "resize"; // resize: the anchor that keeps its centre planted
  at?: EditMoment;
}): ManualOffsetDragMemberResult {
  const plainTranslate =
    !!input.gesture && editsPlainCss(input.element, input.gesture === "resize" ? "resize" : "move");
  // The APPLIED offset, never a dormant var, so a stale one can't fling the element off-screen.
  const initialOffset = plainTranslate
    ? readTranslatePx(input.element)
    : readAppliedStudioPathOffset(input.element);
  if (!finitePoint(initialOffset))
    return { ok: false, reason: UNREADABLE_TRANSLATE, selection: input.selection };
  const win = input.element.ownerDocument.defaultView as
    | (Window & {
        gsap?: { getProperty?: (el: Element, prop: string) => number };
        __timelines?: Record<string, { pause?: () => void; paused?: () => boolean }>;
      })
    | null;
  // getProperty makes GSAP bake the CSS translate into its transform, so a plain move never reads it.
  const gsapX = (!plainTranslate && win?.gsap?.getProperty?.(input.element, "x")) || 0;
  const gsapY = (!plainTranslate && win?.gsap?.getProperty?.(input.element, "y")) || 0;
  const baseGsap = { x: gsapX, y: gsapY };
  if (!plainTranslate) stampGestureBase(input.element, initialOffset, baseGsap);

  if (win?.__timelines) {
    const paused: string[] = [];
    for (const [id, tl] of Object.entries(win.__timelines)) {
      try {
        if (tl?.pause && !tl.paused?.()) {
          tl.pause();
          paused.push(id);
        }
      } catch {
        /* cross-origin guard */
      }
    }
    if (paused.length > 0) {
      input.element.setAttribute("data-hf-drag-paused-timelines", paused.join(","));
    }
  }

  const initialPathOffset = captureStudioPathOffset(input.element);
  const gestureToken = beginStudioManualEditGesture(
    input.element,
    input.gesture === "resize" ? "resize" : "move",
    input.at,
  );
  const measured = measureManualOffsetDragScreenToOffsetMatrix(input.element, initialOffset, {
    scaleX: input.rect.editScaleX,
    scaleY: input.rect.editScaleY,
    plainTranslate,
  });
  if (!measured.ok) {
    // GSAP transforms can defeat the probe: approximate with the preview scale. The commit
    // reads GSAP's real position, so only the drag preview is imprecise.
    const scaleX = input.rect.editScaleX || 1;
    const scaleY = input.rect.editScaleY || 1;
    const w = readTransformWDivisor(input.element);
    return {
      ok: true,
      member: {
        key: input.key,
        selection: input.selection,
        element: input.element,
        initialOffset,
        plainTranslate,
        baseGsap,
        initialPathOffset,
        gestureToken,
        screenToOffset: { a: w / scaleX, b: 0, c: 0, d: w / scaleY },
        originRect: input.rect,
      },
    };
  }

  return {
    ok: true,
    member: {
      key: input.key,
      selection: input.selection,
      element: input.element,
      initialOffset,
      plainTranslate,
      baseGsap,
      initialPathOffset,
      gestureToken,
      screenToOffset: measured.matrix,
      originRect: input.rect,
    },
  };
}

function resolveManualOffsetDragMemberOffset(
  member: ManualOffsetDragMember,
  dx: number,
  dy: number,
): { x: number; y: number } {
  return resolveManualOffsetForPointerDelta({
    initialOffset: member.initialOffset,
    screenToOffset: member.screenToOffset,
    dx,
    dy,
  });
}

/** Draws the offset where the commit writes it: the inline translate, else GSAP, else the legacy var. */
function drawMemberOffset(
  member: ManualOffsetDragMember,
  offset: { x: number; y: number },
  commit: boolean,
): void {
  if (member.plainTranslate) writeTranslatePx(member.element, offset);
  else if (applyOffsetDragDraftViaGsap(member.element, offset, member.baseGsap)) return;
  else if (commit) applyStudioPathOffset(member.element, offset);
  else applyStudioPathOffsetDraft(member.element, offset);
}

export function applyManualOffsetDragDraft(
  member: ManualOffsetDragMember,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const offset = resolveManualOffsetDragMemberOffset(member, dx, dy);
  drawMemberOffset(member, offset, false);
  return offset;
}

/**
 * Re-stamp the STABLE gesture-start base/offset before the source commit reads
 * them. A mid-gesture re-render can wipe these attrs; the commit converts the
 * drop offset → gsap x/y via computeDraggedGsapPosition, which without the base
 * falls back to the live (already-dragged) transform and re-adds the delta — so
 * the element flies off-screen the instant you drop it. The member holds the
 * true gesture-start values in JS, immune to the re-render.
 */
export function stampGestureBase(el: HTMLElement, initialOffset: Point, baseGsap: Point): void {
  el.setAttribute("data-hf-drag-gsap-base-x", String(baseGsap.x));
  el.setAttribute("data-hf-drag-gsap-base-y", String(baseGsap.y));
  el.setAttribute("data-hf-drag-initial-offset-x", String(initialOffset.x));
  el.setAttribute("data-hf-drag-initial-offset-y", String(initialOffset.y));
}

function applyManualOffsetCommitValue(
  member: ManualOffsetDragMember,
  offset: { x: number; y: number },
): { x: number; y: number } {
  if (!member.plainTranslate)
    stampGestureBase(member.element, member.initialOffset, member.baseGsap);
  drawMemberOffset(member, offset, true);
  return offset;
}

export function applyManualOffsetDragCommit(
  member: ManualOffsetDragMember,
  dx: number,
  dy: number,
): { x: number; y: number } {
  return applyManualOffsetCommitValue(member, resolveManualOffsetDragMemberOffset(member, dx, dy));
}

/**
 * Arrow-key nudge, in OFFSET units (composition px), not screen px — "nudge
 * 1px" means one composition pixel regardless of canvas zoom, so the delta
 * adds to the gesture-start offset directly instead of going through the
 * screen→offset matrix. Draft/commit land in the same GSAP channel (with the
 * same CSS fallback) as the drag equivalents above.
 */
export function applyManualOffsetNudgeDraft(
  member: ManualOffsetDragMember,
  delta: { x: number; y: number },
): { x: number; y: number } {
  const offset = {
    x: member.initialOffset.x + delta.x,
    y: member.initialOffset.y + delta.y,
  };
  drawMemberOffset(member, offset, false);
  return offset;
}

export function applyManualOffsetNudgeCommit(
  member: ManualOffsetDragMember,
  delta: { x: number; y: number },
): { x: number; y: number } {
  return applyManualOffsetCommitValue(member, {
    x: member.initialOffset.x + delta.x,
    y: member.initialOffset.y + delta.y,
  });
}

function restoreManualOffsetDragMember(member: ManualOffsetDragMember): void {
  restoreStudioPathOffset(member.element, member.initialPathOffset);
  if (!member.plainTranslate) {
    getOffsetDragGsap(member.element)?.set(member.element, { ...member.baseGsap });
  }
  endStudioManualEditGesture(member.element, member.gestureToken);
}

/** Roll back a FAILED drag to the exact gesture-start state. */
export function restoreManualOffsetDragMembers(members: ManualOffsetDragMember[]): void {
  for (const member of members) {
    restoreManualOffsetDragMember(member);
    resumeGsapTimelines(member.element);
  }
}

// Drop the draft's `translate: none` so the soft reload starts clean (#1673). When GSAP owns
// the position it folded any translate into its transform, so one still showing applies twice.
function settleDraftTranslate(element: HTMLElement, gsapOwnsPosition: boolean): void {
  if (element.style.getPropertyValue("translate") === "none") {
    element.style.removeProperty("translate");
  }
  if (!gsapOwnsPosition) return;
  const view = element.ownerDocument.defaultView;
  const underneath = view?.getComputedStyle(element).getPropertyValue("translate");
  if (underneath && underneath !== "none") element.style.setProperty("translate", "none");
}

/** Teardown after a COMMITTED drag. */
export function endManualOffsetDragMembers(members: ManualOffsetDragMember[]): void {
  for (const member of members) {
    if (!isStudioManualEditGestureCurrent(member.element, member.gestureToken)) continue;
    endStudioManualEditGesture(member.element, member.gestureToken);
    member.element.removeAttribute("data-hf-drag-initial-offset-x");
    member.element.removeAttribute("data-hf-drag-initial-offset-y");
    member.element.removeAttribute("data-hf-drag-gsap-base-x");
    member.element.removeAttribute("data-hf-drag-gsap-base-y");
    // Do NOT clearProps:"transform" — that nukes the committed GSAP position
    // and causes a visual snap-back before the soft reload re-applies it.
    const gsapOwnsPosition = !member.plainTranslate && Boolean(getOffsetDragGsap(member.element));
    // Migration: when GSAP owns the position (the committed value lives in the
    // GSAP transform), the legacy `--hf-studio-offset` CSS channel is obsolete.
    // Clear it on the LIVE element — otherwise the leftover `translate:
    // var(--hf-studio-offset)` composes with the GSAP transform and the element
    // renders offset by the stale value until a full page reload (the source is
    // already stripped). clearStudioPathOffset leaves `transform` untouched.
    if (gsapOwnsPosition) clearStudioPathOffset(member.element);
    settleDraftTranslate(member.element, gsapOwnsPosition);
    resumeGsapTimelines(member.element);
  }
}

/** Shared timeline teardown for either the committed or restored path. */
export function resumeGsapTimelines(element: HTMLElement): void {
  const ids = element.getAttribute("data-hf-drag-paused-timelines");
  element.removeAttribute("data-hf-drag-paused-timelines");
  if (!ids) return;
  const win = element.ownerDocument.defaultView as
    | (Window & {
        __timelines?: Record<string, { paused?: (value?: boolean) => boolean }>;
        __player?: { seek?: (t: number) => void; getTime?: () => number };
      })
    | null;
  if (!win) return;
  // Unpause exactly the timelines the drag start paused. The player seek below
  // repositions them, but a seek alone leaves play-state-driven sub-composition
  // timelines paused forever — the "selecting a piece kills its animation" bug:
  // main survives (seek-driven every frame) while every scene timeline freezes,
  // and deselecting can't recover because nothing else ever resumes them.
  for (const id of ids.split(",")) {
    try {
      win.__timelines?.[id]?.paused?.(false);
    } catch {
      /* cross-origin guard */
    }
  }
  const t = win.__player?.getTime?.() ?? 0;
  win.__player?.seek?.(t);
}
