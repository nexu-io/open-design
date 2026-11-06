import type { CSSProperties } from "react";

interface TimelineTransitionBadgeProps {
  centerPx: number;
  top: number;
  widthPx: number;
  outgoingSrc?: string;
  incomingSrc?: string;
}

export function TimelineTransitionBadge({
  centerPx,
  top,
  widthPx,
  outgoingSrc,
  incomingSrc,
}: TimelineTransitionBadgeProps) {
  const style = {
    left: centerPx,
    top,
    "--timeline-transition-zone-width": `${widthPx}px`,
  } as CSSProperties;
  return (
    <div className="timeline-transition" style={style} aria-hidden="true">
      <div className="timeline-transition__zone">
        <div
          className="timeline-transition__image timeline-transition__image--out"
          style={outgoingSrc ? { backgroundImage: `url("${outgoingSrc}")` } : undefined}
        />
        <div
          className="timeline-transition__image timeline-transition__image--in"
          style={incomingSrc ? { backgroundImage: `url("${incomingSrc}")` } : undefined}
        />
      </div>
      <div className="timeline-transition__badge">
        <svg viewBox="0 0 20 20" role="presentation">
          <defs>
            <filter id="timeline-transition-glyph-blur">
              <feGaussianBlur stdDeviation="0.55" />
            </filter>
          </defs>
          <path
            className="timeline-transition__frame timeline-transition__frame--out"
            d="M3 5h8v10H3z"
          />
          <path
            className="timeline-transition__frame timeline-transition__frame--in"
            d="M9 5h8v10H9z"
          />
          <path
            className="timeline-transition__intersection"
            d="M9 5h2v10H9z"
            filter="url(#timeline-transition-glyph-blur)"
          />
        </svg>
      </div>
    </div>
  );
}
