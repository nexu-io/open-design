import { useI18n } from "../../i18n/I18n";
import { trackPreviewEditResult, type PreviewMethod } from "../../utils/previewFeatureUsage";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DomEditSelection } from "./domEditing";
import { type OverlayRect, RESIZE_HANDLE_HIT_PX } from "./domEditOverlayGeometry";
import {
  type CropEdge,
  cropRectFromInsets,
  dropElementCropLift,
  hasCropInsets,
  liftElementCrop,
  readElementCropFrame,
  readElementCropInsets,
  resolveCropInsetFromEdgeDrag,
  resolveCropInsetFromMoveDrag,
  rotateDeltaIntoFrame,
} from "./domEditOverlayCrop";
import { buildInsetClipPathSides, type ClipPathInsetSides } from "./clipPathHelpers";
import { readCropFollowingResize } from "./cropResize";
import { isCropBarTarget, useCropPresetBarStore } from "./cropPresetStore";
import { CropPresetBar } from "./CropPresetBar";
import { movesGesture } from "./domEditOverlayGestures";

interface CropGestureState {
  edge: CropEdge | "move";
  pointerId: number;
  startX: number;
  startY: number;
  startInsets: ClipPathInsetSides;
  insets: ClipPathInsetSides;
  radius: number;
  /** Element frame captured at gesture start: pointer deltas rotate into it. */
  angleDeg: number;
  scaleX: number;
  scaleY: number;
}

interface DomEditCropHandlesProps {
  selection: DomEditSelection;
  overlayRect: OverlayRect;
  onStyleCommit?: (property: string, value: string) => Promise<unknown> | void;
}

// Hit-strip size (px) for an edge crop handle: THICKNESS extends outward from
// the crop edge (flush against it, never over the element body, so a body
// drag always MOVES), LENGTH runs along the edge. The visible pill is smaller
// and centered inside the strip.
const EDGE_HIT_THICKNESS = 12;
const EDGE_HIT_LENGTH = 32;
const EDGE_PILL_LENGTH = 24;
const REPOSITION_HANDLE_PX = 22;

type Rect = { left: number; top: number; width: number; height: number };

/** An edge handle's hit strip, just OUTSIDE the crop edge so the body stays free
 *  for moving, and short of the corner squares the resize dots own, with its
 *  cursor and pill. Null when the edge is too short to leave any room. */
function edgeHandleLayout(edge: CropEdge, rect: Rect) {
  const vertical = edge === "left" || edge === "right";
  const length = Math.min(
    EDGE_HIT_LENGTH,
    (vertical ? rect.height : rect.width) - RESIZE_HANDLE_HIT_PX,
  );
  if (length <= 0) return null;
  const pill = Math.min(EDGE_PILL_LENGTH, length);
  if (vertical) {
    return {
      hit: {
        left: edge === "left" ? rect.left - EDGE_HIT_THICKNESS : rect.left + rect.width,
        top: rect.top + (rect.height - length) / 2,
        width: EDGE_HIT_THICKNESS,
        height: length,
      },
      cursor: "ew-resize",
      pill: { width: 4, height: pill },
    };
  }
  return {
    hit: {
      left: rect.left + (rect.width - length) / 2,
      top: edge === "top" ? rect.top - EDGE_HIT_THICKNESS : rect.top + rect.height,
      width: length,
      height: EDGE_HIT_THICKNESS,
    },
    cursor: "ns-resize",
    pill: { width: pill, height: 4 },
  };
}

/** The reposition handle's size: shrunk until its box clears the corner squares. */
function repositionHandleSize(rect: Rect): number {
  return Math.min(REPOSITION_HANDLE_PX, Math.max(rect.width, rect.height) - RESIZE_HANDLE_HIT_PX);
}

const EDGES: CropEdge[] = ["top", "right", "bottom", "left"];
const NO_CROP = { top: 0, right: 0, bottom: 0, left: 0, radius: 0 };

/**
 * Always-on crop, integrated with the selection (no crop "mode"): while a
 * croppable element is selected its clip is lifted so the FULL content shows and
 * the cropped-away area is dimmed, with a dashed outline + an edge handle per
 * side on the crop boundary. Dragging an edge crops that side (a rule-of-thirds
 * grid guides framing); release commits `clip-path: inset(...)` through the
 * normal style-commit path (one undo step per drag). When cropped, a center
 * handle pans the crop window. Corners stay free for the selection's own resize
 * handle. Leaving the selection drops the lift. The element's clip-path
 * is the source of truth — nothing here mutates layout.
 */
export function DomEditCropHandles({
  selection,
  overlayRect,
  onStyleCommit,
}: DomEditCropHandlesProps) {
  const { t } = useI18n();
  const gestureRef = useRef<CropGestureState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hotEdge, setHotEdge] = useState<CropEdge | null>(null);
  // readElementCropInsets returns null for a clip this tool can't represent
  // (circle/polygon/non-px inset): the crop UI must fully stand down for that
  // element — no lift, no handles — or select+deselect replaces the authored
  // clip with an inset (or deletes it).
  const cropStateFor = (element: HTMLElement) => {
    const parsed = readElementCropInsets(element);
    const { top, right, bottom, left } = parsed ?? NO_CROP;
    return { element, croppable: parsed !== null, insets: { top, right, bottom, left } };
  };
  const [state, setState] = useState(() => cropStateFor(selection.element));
  const presetBarTarget = useCropPresetBarStore((s) => s.openFor);
  const closePresetBar = useCropPresetBarStore((s) => s.close);
  const showPresetBar = isCropBarTarget(selection.element, presetBarTarget);

  // Re-sync when the selection targets a different element (reselect, or an
  // undo/redo that re-keys the node).
  if (state.element !== selection.element) {
    setState(cropStateFor(selection.element));
  }

  // The element's clip-path is the crop; state only holds a crop drag's draft.
  const committed = readCropFollowingResize(selection.element) ?? NO_CROP;
  const insets = dragging ? state.insets : committed;
  const hasCrop = hasCropInsets(insets);

  // Lift the clip while the element is selected so the full content shows and the
  // cropped-away area can be dimmed. Keyed on the element so a direct A→B switch drops A's lift.
  useEffect(() => {
    const el = selection.element;
    if (readElementCropInsets(el) === null) return;
    liftElementCrop(el);
    return () => dropElementCropLift(el);
  }, [selection.element]);

  // The crop applies in the element's LOCAL frame (clip-path precedes the
  // transform), so all crop UI is drawn inside a container rotated with the
  // element — on a rotated element an axis-aligned dim visually "straightens"
  // it by masking the rotated corners.
  const frame = readElementCropFrame(selection.element, overlayRect);
  const width = frame.width / frame.scaleX; // element CSS px
  const height = frame.height / frame.scaleY;
  // Crop rect in FRAME-LOCAL coordinates (origin = frame top-left).
  const cropRect = cropRectFromInsets(
    { left: 0, top: 0, width: frame.width, height: frame.height },
    insets,
    frame.scaleX,
    frame.scaleY,
  );
  const repositionSize = repositionHandleSize(cropRect);

  const startCropGesture = (edge: CropEdge | "move", event: ReactPointerEvent<HTMLElement>) => {
    if (!onStyleCommit) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    // Read at press: a resize may have rescaled the crop since the last render.
    const pressed = readCropFollowingResize(selection.element) ?? NO_CROP;
    gestureRef.current = {
      edge,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startInsets: pressed,
      insets: pressed,
      radius: pressed.radius,
      angleDeg: frame.angleDeg,
      scaleX: frame.scaleX,
      scaleY: frame.scaleY,
    };
    // Clip is already lifted by the selection effect; just flag the drag so the
    // rule-of-thirds grid shows.
    setState((prev) => ({ ...prev, insets: pressed }));
    setDragging(true);
  };

  const updateCropGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || !movesGesture(gesture, event)) return;
    event.preventDefault();
    event.stopPropagation();
    const local = rotateDeltaIntoFrame(
      event.clientX - gesture.startX,
      event.clientY - gesture.startY,
      gesture.angleDeg,
    );
    const drag = {
      startInsets: gesture.startInsets,
      deltaX: local.deltaX,
      deltaY: local.deltaY,
      scaleX: gesture.scaleX,
      scaleY: gesture.scaleY,
    };
    const nextInsets =
      gesture.edge === "move"
        ? resolveCropInsetFromMoveDrag(drag)
        : resolveCropInsetFromEdgeDrag({ ...drag, edge: gesture.edge, width, height });
    gesture.insets = nextInsets;
    setState((prev) => ({ ...prev, insets: nextInsets }));
  };

  const endCropGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return null;
    event.preventDefault();
    event.stopPropagation();
    gestureRef.current = null;
    setDragging(false);
    return gesture;
  };

  const finishCropGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = endCropGesture(event);
    if (!gesture) return;
    // The commit writes the element's clip-path (and puts it back if the save fails);
    // the lift keeps it hidden while selected. A drag that ends where it started saves nothing.
    const value = buildInsetClipPathSides(gesture.insets, gesture.radius);
    if (value === buildInsetClipPathSides(gesture.startInsets, gesture.radius)) return;
    commitClipPath(value, "drag");
  };

  const commitClipPath = (value: string, method: PreviewMethod) => {
    const commit = onStyleCommit?.("clip-path", value);
    void Promise.resolve(commit)
      .then((result) => trackPreviewEditResult("crop", method, result))
      .catch(() => undefined);
  };

  const applyPresetInsets = (insets: ClipPathInsetSides | null) => {
    const next = insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
    setState((prev) => ({ ...prev, insets: next }));
    const radius = readCropFollowingResize(selection.element)?.radius ?? 0;
    commitClipPath(insets === null ? "" : buildInsetClipPathSides(next, radius), "button");
  };

  const cancelCropGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = endCropGesture(event);
    if (!gesture) return;
    // Clip stays lifted; the dim follows the reset insets.
    setState((prev) => ({ ...prev, insets: gesture.startInsets }));
  };

  // Uneditable clip (circle/polygon/non-px inset): the element renders exactly
  // as authored and the crop tool shows nothing. All hooks above stay mounted.
  if (!state.croppable) return null;

  return (
    <>
      {showPresetBar && onStyleCommit && (
        <CropPresetBar
          left={frame.left + frame.width / 2}
          top={frame.top}
          elementWidth={width}
          elementHeight={height}
          onApply={applyPresetInsets}
          onDone={closePresetBar}
        />
      )}
      <div
        data-dom-edit-crop-frame="true"
        className="pointer-events-none absolute"
        style={{
          left: frame.left,
          top: frame.top,
          width: frame.width,
          height: frame.height,
          transform: frame.angleDeg !== 0 ? `rotate(${frame.angleDeg}deg)` : undefined,
        }}
      >
        {/* Dim the cropped-away area whenever the element is cropped and selected,
            so the hidden content is visible (ghosted) without dragging. Clipped to
            the element's own (rotated) box. */}
        {hasCrop && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute"
              style={{
                left: cropRect.left,
                top: cropRect.top,
                width: cropRect.width,
                height: cropRect.height,
                boxShadow: "0 0 0 100000px rgba(8, 8, 12, 0.6)",
              }}
            />
          </div>
        )}
        {/* Dashed clip outline on the crop boundary, with a rule-of-thirds grid
            shown while dragging. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute border border-dashed border-studio-accent"
          style={{
            left: cropRect.left,
            top: cropRect.top,
            width: cropRect.width,
            height: cropRect.height,
          }}
        >
          {dragging && (
            <>
              <div className="absolute inset-y-0 left-1/3 w-px bg-studio-accent/40" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-studio-accent/40" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-studio-accent/40" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-studio-accent/40" />
            </>
          )}
        </div>
        {/* Reposition handle — a center circle shown only once cropped. Drag it to
            pan the crop window (which part of the element shows) without resizing
            the crop. It's a small, discrete target, so a body drag still MOVES. */}
        {hasCrop && repositionSize > 0 && (
          <button
            type="button"
            aria-label={t("Reposition crop")}
            title={t("Reposition crop")}
            data-dom-edit-crop-handle="true"
            className="pointer-events-auto absolute rounded-full border-2 border-studio-accent bg-studio-accent/30 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
            style={{
              left: cropRect.left + (cropRect.width - repositionSize) / 2,
              top: cropRect.top + (cropRect.height - repositionSize) / 2,
              width: repositionSize,
              height: repositionSize,
              cursor: "move",
              touchAction: "none",
            }}
            onPointerDown={(event) => startCropGesture("move", event)}
            onPointerMove={updateCropGesture}
            onPointerUp={finishCropGesture}
            onPointerCancel={cancelCropGesture}
          />
        )}
        {/* Edge handles — drag a side to crop it. Positioned just OUTSIDE the crop
            edge (via edgeHandleLayout) so they never overlap the element body:
            dragging the body always MOVES, only a handle crops. The pill is
            hover-revealed (or shown while dragging / once a crop exists) so the
            resting selection chrome stays uncluttered; the hit strip is always
            live, and the title names the affordance. */}
        {EDGES.map((edge) => {
          const layout = edgeHandleLayout(edge, cropRect);
          if (!layout) return null;
          const revealed = dragging || hasCrop || hotEdge === edge;
          return (
            <button
              key={edge}
              type="button"
              aria-label={t("Crop {edge}", { edge: edge })}
              title={t("Crop")}
              data-dom-edit-crop-handle="true"
              className="pointer-events-auto absolute flex items-center justify-center border-0 bg-transparent p-0"
              style={{
                ...layout.hit,
                cursor: layout.cursor,
                touchAction: "none",
              }}
              onPointerEnter={() => setHotEdge(edge)}
              onPointerLeave={() => setHotEdge((prev) => (prev === edge ? null : prev))}
              onPointerDown={(event) => startCropGesture(edge, event)}
              onPointerMove={updateCropGesture}
              onPointerUp={finishCropGesture}
              onPointerCancel={cancelCropGesture}
            >
              <span
                className="pointer-events-none rounded-full bg-studio-accent/90 shadow-[0_0_0_1px_rgba(0,0,0,0.4)] transition-opacity duration-100"
                style={{
                  ...layout.pill,
                  opacity: revealed ? 1 : 0,
                }}
              />
            </button>
          );
        })}
      </div>
    </>
  );
}
