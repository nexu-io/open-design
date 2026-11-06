import { memo } from "react";
import { usePreviewOverlayContext } from "./PreviewOverlayProvider";

export const GridOverlay = memo(function GridOverlay() {
  const { state } = usePreviewOverlayContext();
  const { gridVisible: visible, gridSpacing: spacing } = state.snapPrefs;
  const {
    scaleX,
    scaleY,
    left: compositionLeft,
    top: compositionTop,
    width: compositionWidth,
    height: compositionHeight,
  } = state.compositionRect;
  if (!visible || spacing <= 0) return null;

  const overlaySpacingX = spacing * scaleX;
  const overlaySpacingY = spacing * scaleY;

  if (overlaySpacingX < 4 || overlaySpacingY < 4) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{
        left: compositionLeft,
        top: compositionTop,
        width: compositionWidth,
        height: compositionHeight,
        backgroundImage: [
          `repeating-linear-gradient(90deg, rgba(255,255,255,0.12) 0px, rgba(255,255,255,0.12) 1px, transparent 1px, transparent ${overlaySpacingX}px)`,
          `repeating-linear-gradient(0deg, rgba(255,255,255,0.12) 0px, rgba(255,255,255,0.12) 1px, transparent 1px, transparent ${overlaySpacingY}px)`,
        ].join(", "),
        backgroundSize: `${overlaySpacingX}px ${overlaySpacingY}px`,
      }}
    />
  );
});
