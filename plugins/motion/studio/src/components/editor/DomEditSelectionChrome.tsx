import type { RefObject } from "react";
import { type DomEditSelection } from "./domEditing";
import {
  type GroupOverlayItem,
  type OverlayRect,
  RESIZE_HANDLE_HIT_PX,
} from "./domEditOverlayGeometry";
import type { ResizeHandle } from "./domEditOverlayGestures";
import type { createDomEditOverlayGestureHandlers } from "./useDomEditOverlayGestures";
import { DomEditCropHandles } from "./DomEditCropHandles";
import { DomEditRotateHandle } from "./DomEditRotateHandle";
import { resolveRotatedResizeCursor } from "./domEditResizeLocal";
import { usePreviewReadOnly } from "./previewReadOnlyContext";

// Corner resize handles, Canva-style: one per corner, diagonal cursors.
// Corners scale about the element center; the translate keeps the center
// planted, so they need the manual-offset capability in addition to manual-size.
const RESIZE_HANDLE_DEFS: Array<{
  handle: ResizeHandle;
  cursor: string;
  x: "left" | "right";
  y: "top" | "bottom";
}> = [
  { handle: "nw", cursor: "nwse-resize", x: "left", y: "top" },
  { handle: "ne", cursor: "nesw-resize", x: "right", y: "top" },
  { handle: "sw", cursor: "nesw-resize", x: "left", y: "bottom" },
  { handle: "se", cursor: "nwse-resize", x: "right", y: "bottom" },
];

type CropInset = { top: number; right: number; bottom: number; left: number };
const NO_CROP_INSET: CropInset = { top: 0, right: 0, bottom: 0, left: 0 };

function resizeHandleLayout(
  def: (typeof RESIZE_HANDLE_DEFS)[number],
  overlayRect: { left: number; top: number; width: number; height: number },
  cropInset?: CropInset,
): { style: React.CSSProperties; anchor: React.CSSProperties } {
  const half = RESIZE_HANDLE_HIT_PX / 2;
  const inset = cropInset ?? NO_CROP_INSET;
  // Position relative to the overlay container (not the selection box).
  // This ensures the dots render as siblings of the box border div — strictly
  // above it — rather than as children where the parent border can visually
  // overlap the dot circle at the corner.
  const cornerX =
    def.x === "left"
      ? overlayRect.left + inset.left
      : overlayRect.left + overlayRect.width - inset.right;
  const cornerY =
    def.y === "top"
      ? overlayRect.top + inset.top
      : overlayRect.top + overlayRect.height - inset.bottom;
  const slideOutToFreeMiddleX =
    (def.x === "left" ? -1 : 1) *
    Math.max(0, half - (overlayRect.width - inset.left - inset.right) / 4);
  const slideOutToFreeMiddleY =
    (def.y === "top" ? -1 : 1) *
    Math.max(0, half - (overlayRect.height - inset.top - inset.bottom) / 4);
  return {
    style: {
      cursor: def.cursor,
      touchAction: "none",
      left: cornerX - half + slideOutToFreeMiddleX,
      top: cornerY - half + slideOutToFreeMiddleY,
    },
    anchor: { left: half - slideOutToFreeMiddleX, top: half - slideOutToFreeMiddleY },
  };
}

type GestureHandlers = ReturnType<typeof createDomEditOverlayGestureHandlers>;

interface DomEditGroupChromeProps {
  groupOverlayItems: GroupOverlayItem[];
  groupBounds: OverlayRect;
  allowCanvasMovement: boolean;
  allowBodyDrag: boolean;
  groupCanMove: boolean;
  gestures: GestureHandlers;
  onBoxClick: (event: React.MouseEvent<HTMLDivElement>) => void;
}

// Multi-selection chrome: per-member outlines plus a single draggable bounding
// box spanning the union of the members.
export function DomEditGroupChrome({
  groupOverlayItems,
  groupBounds,
  allowCanvasMovement,
  allowBodyDrag,
  groupCanMove,
  gestures,
  onBoxClick,
}: DomEditGroupChromeProps) {
  const canManipulate = allowCanvasMovement && !usePreviewReadOnly();
  return (
    <>
      {groupOverlayItems.map((item) => (
        <div
          key={item.key}
          aria-hidden="true"
          className="pointer-events-none absolute rounded-xl border border-studio-accent/70"
          style={{
            left: item.rect.left,
            top: item.rect.top,
            width: item.rect.width,
            height: item.rect.height,
          }}
        />
      ))}
      <div
        data-dom-edit-selection-box="true"
        className="pointer-events-auto absolute rounded-xl border border-studio-accent shadow-[0_0_0_1px_rgba(60,230,172,0.3)]"
        style={{
          left: groupBounds.left,
          top: groupBounds.top,
          width: groupBounds.width,
          height: groupBounds.height,
          cursor: !allowBodyDrag ? undefined : canManipulate && groupCanMove ? "move" : "default",
        }}
        onPointerDown={(e) => {
          if (!canManipulate || !allowBodyDrag || (e.shiftKey && !groupCanMove)) return;
          gestures.startGroupDrag(e);
        }}
        onClick={onBoxClick}
      />
    </>
  );
}

interface DomEditSelectionChromeProps {
  selection: DomEditSelection;
  overlayRect: OverlayRect;
  allowCanvasMovement: boolean;
  allowBodyDrag: boolean;
  cropOutlineInsetPx?: { top: number; right: number; bottom: number; left: number };
  boxRef: RefObject<HTMLDivElement | null>;
  boxChromeClass: string;
  boxClipPath: string | undefined;
  selectionKey: string;
  groupSelectionCount: number;
  gestures: GestureHandlers;
  onStyleCommit?: (property: string, value: string) => Promise<unknown> | void;
  onBoxClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  /** The canvas' text-editing session: what opens one, and whether one is open. */
  inlineText?: {
    editing: boolean;
    /** Every press on the box. Returns true when it opened a text edit. */
    startFromPress: (event: React.PointerEvent) => boolean;
  };
}

// Oriented selection chrome: a rotation wrapper spanning the overlay, rotated by
// the element's live angle about the selection box CENTER. Its children (border
// box, corner dots, and rotate handle) keep their existing
// overlay-absolute positions — rotating the whole plane about the box center
// lands them on the element's real transformed corners for free. At angle 0 the
// transform is a no-op, so the chrome is pixel-identical.
export function DomEditSelectionChrome({
  selection,
  overlayRect,
  allowCanvasMovement,
  allowBodyDrag,
  cropOutlineInsetPx,
  boxRef,
  boxChromeClass,
  boxClipPath,
  selectionKey,
  groupSelectionCount,
  gestures,
  onStyleCommit,
  onBoxClick,
  inlineText,
}: DomEditSelectionChromeProps) {
  // While the text is being edited the chrome is a mark, not a control. The
  // overlay above the preview already stands aside for the caret, but
  // `pointer-events: none` on a parent does not disable a child that asks for
  // them back, and the box is positioned to cover exactly the text being typed
  // into: left interactive, it swallows every press, so the caret can never be
  // moved and characters can never be selected by dragging.
  const editing = inlineText?.editing ?? false;
  const readOnly = usePreviewReadOnly();
  const canManipulate = allowCanvasMovement && !readOnly;

  return (
    <>
      <div
        data-dom-edit-chrome="true"
        className="pointer-events-none absolute inset-0"
        style={{
          transformOrigin: `${overlayRect.left + overlayRect.width / 2}px ${overlayRect.top + overlayRect.height / 2}px`,
          transform: overlayRect.angle ? `rotate(${overlayRect.angle}deg)` : undefined,
        }}
      >
        {canManipulate && !editing && selection.capabilities.canApplyManualRotation && (
          <DomEditRotateHandle
            overlayRect={overlayRect}
            cropOutlineInsetPx={cropOutlineInsetPx}
            onStartRotate={(e) => {
              e.stopPropagation();
              gestures.startGesture("rotate", e);
            }}
          />
        )}
        <div
          key={selectionKey}
          ref={boxRef}
          data-dom-edit-selection-box="true"
          className={`${editing ? "pointer-events-none" : "pointer-events-auto"} absolute rounded-md ${boxChromeClass}`}
          style={{
            left: overlayRect.left,
            top: overlayRect.top,
            width: overlayRect.width,
            height: overlayRect.height,
            clipPath: boxClipPath,
            cursor: !allowBodyDrag
              ? undefined
              : canManipulate && selection.capabilities.canApplyManualOffset
                ? "move"
                : "default",
          }}
          onPointerDown={(e) => {
            // A second press opens the element's text for editing, and must be
            // caught here rather than on the canvas: this handler prevents the
            // default on the first press, which suppresses the compatibility
            // mousedown the canvas would otherwise see, and the pointer capture
            // it takes stops the browser pairing the presses into a dblclick.
            if (inlineText?.startFromPress(e)) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            if (!allowBodyDrag || !canManipulate) return;
            if (selection.capabilities.canApplyManualOffset) {
              gestures.startGesture("drag", e);
              return;
            }
            if (!e.shiftKey) gestures.startBlockedMove(e, selection);
          }}
          onClick={onBoxClick}
        >
          {cropOutlineInsetPx && (
            <div
              className="pointer-events-none absolute rounded-md border border-studio-accent/80 shadow-[0_0_0_1px_rgba(60,230,172,0.25)]"
              style={{
                left: cropOutlineInsetPx.left,
                top: cropOutlineInsetPx.top,
                right: cropOutlineInsetPx.right,
                bottom: cropOutlineInsetPx.bottom,
              }}
            />
          )}
        </div>
        {/* Resize-handle dots rendered as siblings of the selection box, not
          children, so they paint strictly above the box border. Each handle
          is positioned relative to the overlay container using the
          overlayRect origin, matching the old child-relative offsets. */}
        {canManipulate &&
          !editing &&
          selection.capabilities.canApplyManualSize &&
          RESIZE_HANDLE_DEFS.map((def) => {
            if (def.handle !== "se" && !selection.capabilities.canApplyManualOffset) return null;
            const layout = resizeHandleLayout(def, overlayRect, cropOutlineInsetPx ?? undefined);
            return (
              <div
                key={def.handle}
                className="pointer-events-auto absolute flex h-4 w-4 items-center justify-center"
                style={{
                  ...layout.style,
                  // Cursor rotates with the object: bucket the corner's base
                  // diagonal + element rotation into the 8 CSS resize cursors.
                  cursor: resolveRotatedResizeCursor(def.handle, overlayRect.angle ?? 0),
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const corner = e.currentTarget
                    .querySelector("[data-resize-corner]")
                    ?.getBoundingClientRect();
                  gestures.startGesture("resize", e, {
                    resizeHandle: def.handle,
                    resizeCorner: corner && { x: corner.left, y: corner.top },
                  });
                }}
              >
                <span
                  data-resize-corner
                  className="pointer-events-none absolute"
                  style={layout.anchor}
                />
                <div className="pointer-events-none h-[12px] w-[12px] rounded-full border-[1.5px] border-studio-accent bg-white shadow-[0_0_3px_rgba(0,0,0,0.45)]" />
              </div>
            );
          })}
      </div>
      {/* Crop owns its element-local oriented frame. Keep it outside the chrome's
          rotated plane or a rotated selection applies the angle twice. */}
      {selection.capabilities.canCrop && !editing && !readOnly && groupSelectionCount <= 1 && (
        <DomEditCropHandles
          selection={selection}
          overlayRect={overlayRect}
          onStyleCommit={onStyleCommit}
        />
      )}
    </>
  );
}
