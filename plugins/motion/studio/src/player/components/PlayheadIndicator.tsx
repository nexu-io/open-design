// fallow-ignore-file dead-code
/**
 * Shared playhead visual used by TimelineCanvas (real playhead) and
 * TimelineEditorNotice (animated illustration).
 *
 * The vertical line + glow span the full track height; the grab-handle HEAD is
 * `position: sticky; top: 0` so it pins to the top of the (vertically) scrolling
 * track area — the ruler is sticky too, so the head stays visible and grabbable
 * no matter how far the tracks are scrolled. The head is OUTLINE-only at rest and
 * FILLED while the playhead is actively held/scrubbed (`scrubbing`).
 */
import { PLAYHEAD_HEAD_W } from "./timelineLayout";

/** Widest part of the playhead, centred on its line. */
export const PLAYHEAD_GLOW_W = 13;

interface PlayheadIndicatorProps {
  /** CSS color, defaults to the HF accent variable */
  color?: string;
  /** Glow shadow color, defaults to translucent accent */
  glowColor?: string;
  /** Whether the playhead is being actively scrubbed — fills the head. */
  scrubbing?: boolean;
  /**
   * When false, the head chip is rendered in normal flow (top:1) instead of the
   * sticky pin — used by the static illustration where there is no scroll area.
   */
  stickyHead?: boolean;
}

export function PlayheadIndicator({
  color = "var(--timeline-accent)",
  glowColor = "var(--timeline-playhead-glow)",
  scrubbing = false,
  stickyHead = true,
}: PlayheadIndicatorProps) {
  // Head chip dimensions — used to compute the centering offset and the
  // point where the vertical line starts (so it begins at the head's bottom
  // edge rather than running through the hollow diamond center). The width is
  // the shared PLAYHEAD_HEAD_W constant: getTimelinePlayheadLeft shifts the
  // wrapper by -PLAYHEAD_HEAD_W/2 so the 1px line (centered at 50% of the
  // wrapper) lands exactly on GUTTER + time * pps — the ruler ticks' center x.
  const HEAD_W = PLAYHEAD_HEAD_W;
  const HEAD_H = 9;
  // marginTop(1) + HEAD_H = where the line should start.
  const HEAD_TOTAL_H = 1 + HEAD_H;

  return (
    <>
      {/* Glow — spans full height, centered on the line. */}
      <div
        aria-hidden="true"
        className="absolute top-0 bottom-0"
        style={{
          left: "50%",
          width: PLAYHEAD_GLOW_W,
          transform: "translateX(-50%)",
          background: `radial-gradient(closest-side, ${glowColor}, transparent)`,
        }}
      />
      {/* Vertical line — starts at the bottom edge of the head chip so nothing
          shows through the hollow diamond center. */}
      <div
        className="absolute bottom-0"
        style={{
          left: "50%",
          top: HEAD_TOTAL_H,
          width: 1,
          marginLeft: -0.5,
          background: color,
          boxShadow: `0 0 6px ${glowColor}`,
        }}
      />
      {/* Head chip — sticky so it pins to the ruler while tracks scroll.
          Centering logic: wrapper width = HEAD_W (chip forces it). The line sits
          at wrapper.left + HEAD_W/2 (left:"50%" of wrapper). The sticky element's
          natural flow position is wrapper.left; so placing it there with no
          horizontal translate puts its LEFT edge at wrapper.left and its CENTER
          at wrapper.left + HEAD_W/2 — exactly on the line. */}
      <div
        className={stickyHead ? "sticky" : "absolute"}
        style={{
          left: 0,
          top: stickyHead ? 0 : 1,
          // Zero height keeps it from covering rows (sticky strip trick).
          height: stickyHead ? 0 : undefined,
        }}
      >
        <div
          style={{
            width: HEAD_W,
            height: HEAD_H,
            borderRadius: 2,
            marginTop: 1,
            // Outline-only at rest, filled while scrubbing.
            background: scrubbing ? color : "transparent",
            border: `1.5px solid ${color}`,
            boxSizing: "border-box",
            boxShadow: `0 1px 3px var(--timeline-playhead-shadow), 0 0 5px ${glowColor}`,
            transform: "rotate(45deg)",
          }}
        />
      </div>
    </>
  );
}
