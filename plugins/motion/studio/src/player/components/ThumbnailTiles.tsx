import type { CSSProperties, ReactNode } from "react";
import type { StripSize } from "../../hooks/useThumbnailStripSize";

interface ThumbnailTilesProps {
  strip: StripSize;
  frameW: number;
  frameCount: number;
  watchGap: (gap: HTMLDivElement | null) => void | (() => void);
  style?: CSSProperties;
  children: (index: number) => ReactNode;
}

/** A clip's tile row, mounting only the tiles in the strip's on-screen span, each at its own place. */
export function ThumbnailTiles({
  strip,
  frameW,
  frameCount,
  watchGap,
  style,
  children,
}: ThumbnailTilesProps) {
  const end = Math.min(frameCount, Math.ceil(strip.inViewEnd / frameW));
  const first = Math.min(end, Math.floor(strip.inViewStart / frameW));
  return (
    <div className="absolute inset-0 flex" style={{ ...style, paddingLeft: first * frameW }}>
      <div
        ref={watchGap}
        data-thumbnail-gap="start"
        className="pointer-events-none absolute inset-y-0 left-0"
        style={{ width: first * frameW }}
      />
      {Array.from({ length: end - first }, (_, offset) => children(first + offset))}
      <div
        ref={watchGap}
        data-thumbnail-gap="end"
        className="pointer-events-none absolute inset-y-0 right-0"
        style={{ left: end * frameW }}
      />
    </div>
  );
}
