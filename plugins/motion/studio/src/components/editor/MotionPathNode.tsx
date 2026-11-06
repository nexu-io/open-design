import type React from "react";
import { dotRadius } from "./motionPathLayerNode";

// Editor primary color (themeable via --hf-accent). Applied through inline
// style because CSS var() isn't valid in SVG presentation attributes.
export const ACCENT = "var(--hf-accent, #3CE6AC)";

/** One path node: a diamond (matching the timeline keyframe), a wider transparent
 *  grab target (when editable), and a hover-revealed × delete badge (when removable). */
export function MotionPathNode(props: {
  cx: number;
  cy: number;
  r: number;
  interactive: boolean;
  removable: boolean;
  grabbing: boolean;
  selected: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onRemove: (e: React.PointerEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const { cx, cy, r, interactive, removable, grabbing, selected } = props;
  const bx = cx + r * 1.8;
  const by = cy - r * 1.8;
  const k = r * 0.55;
  // Diamond matching the timeline keyframe (a 45°-rotated rounded square).
  // `side` is chosen so the diamond's points reach ~`r` from center, matching the
  // old dot's footprint; selection is shown by enlarging it (no extra shape).
  const side = dotRadius(r, selected) * 1.414;
  return (
    <g onPointerEnter={props.onEnter} onPointerLeave={props.onLeave}>
      <rect
        x={cx - side / 2}
        y={cy - side / 2}
        width={side}
        height={side}
        rx={side * 0.17}
        transform={`rotate(45 ${cx} ${cy})`}
        stroke="#0b0f1a"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        style={{ fill: ACCENT }}
      />
      {interactive && (
        <circle
          cx={cx}
          cy={cy}
          r={r * 2.4}
          fill="transparent"
          className="pointer-events-auto"
          style={{ cursor: grabbing ? "grabbing" : "grab" }}
          onPointerDown={props.onPointerDown}
          onPointerMove={props.onPointerMove}
          onPointerUp={props.onPointerUp}
          onPointerCancel={props.onPointerUp}
          onContextMenu={props.onContextMenu}
        />
      )}
      {removable && (
        <g
          className="pointer-events-auto"
          style={{ cursor: "pointer" }}
          onPointerDown={props.onRemove}
        >
          <circle
            cx={bx}
            cy={by}
            r={r * 1.3}
            stroke="#0b0f1a"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            style={{ fill: ACCENT }}
          />
          <line
            x1={bx - k}
            y1={by - k}
            x2={bx + k}
            y2={by + k}
            stroke="#0b0f1a"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={bx + k}
            y1={by - k}
            x2={bx - k}
            y2={by + k}
            stroke="#0b0f1a"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
    </g>
  );
}

type Point = { x: number; y: number };

/** The drawn path from GSAP's start (a passive mark) through the nodes, and the add-on-line ghost. */
export function MotionPathLine(props: {
  points: string;
  start?: Point;
  ghost: Point | null;
  r: number;
}) {
  const { points, start, ghost, r: nodeR } = props;
  return (
    <>
      <polyline
        points={start ? `${start.x},${start.y} ${points}` : points}
        fill="none"
        style={{ stroke: ACCENT }}
        strokeWidth={1.5}
        strokeDasharray="5 5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        opacity={0.85}
      />
      {start && (
        <circle
          data-motion-path-start
          cx={start.x}
          cy={start.y}
          r={nodeR * 0.6}
          fill="none"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          className="pointer-events-none"
          style={{ stroke: ACCENT }}
        />
      )}
      {ghost && (
        <rect
          x={ghost.x - nodeR * 0.707}
          y={ghost.y - nodeR * 0.707}
          width={nodeR * 1.414}
          height={nodeR * 1.414}
          rx={nodeR * 0.24}
          transform={`rotate(45 ${ghost.x} ${ghost.y})`}
          fill="none"
          strokeWidth={1.5}
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
          className="pointer-events-none"
          style={{ stroke: ACCENT }}
        />
      )}
    </>
  );
}
