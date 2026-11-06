import type { OverlayRect } from "../components/editor/domEditOverlayGeometry";
import type { DomEditSelection } from "../components/editor/domEditing";
import {
  isElementCropLifted,
  readElementCropInsets,
} from "../components/editor/domEditOverlayCrop";

/** Selection-box crop hug: the outline that makes the selection box hug the
 *  element's committed inset crop. Crop is always-on (no mode) — the draggable
 *  handles live in {@link DomEditCropHandles}; this only shapes the box border.
 *  The box div itself always sits at the FULL element bounds; the hug is purely
 *  visual — the element's inset clip-path scaled into overlay space. */
export function useCropOverlay(params: {
  selection: DomEditSelection | null;
  overlayRect: OverlayRect | null;
}) {
  const { selection, overlayRect } = params;

  const cropInsets =
    selection && !isElementCropLifted(selection.element)
      ? readElementCropInsets(selection.element)
      : null;
  const hasCropInsets = Boolean(
    cropInsets &&
    (cropInsets.top > 0 || cropInsets.right > 0 || cropInsets.bottom > 0 || cropInsets.left > 0),
  );

  // Scaled insets for the crop outline child. The box div stays border-less at
  // full bounds; a child draws the outline ON the crop boundary (a clip on the
  // box would swallow the border everywhere the crop edge doesn't touch the
  // element edge).
  const sx = overlayRect && overlayRect.editScaleX > 0 ? overlayRect.editScaleX : 1;
  const sy = overlayRect && overlayRect.editScaleY > 0 ? overlayRect.editScaleY : 1;
  const cropOutlineInsetPx =
    cropInsets && hasCropInsets
      ? {
          top: cropInsets.top * sy,
          right: cropInsets.right * sx,
          bottom: cropInsets.bottom * sy,
          left: cropInsets.left * sx,
        }
      : undefined;

  return { hasCropInsets, cropOutlineInsetPx };
}
