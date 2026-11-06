import type { Ref } from "react";
import { cn } from "./ui";

// Framey, the desktop app's cursor mascot, as the app draws it: a rounded triangle with a white rim and one eye,
// framed square around the body and rim.
const BODY = "M77.55 48.44 L122.77 65.85 L99.3 89.41 Z";
const EYE = { cx: 111.6, cy: 68.2, r: 11.5 };
const RIM = 24;
const VIEW_BOX = "65.55 34.315 69.22 69.22";

/** The app's moods: what Framey's eye and body do (styles in components.css, `.hf-framey-mood`). */
export type FrameyMood = "idle" | "thinking" | "found" | "opening" | "error";

const INK = "var(--color-framey-ink)";

function Pupils({ mood }: { mood?: FrameyMood }) {
  const { cx, cy } = EYE;
  if (mood === "found")
    return (
      <g transform={`translate(${cx + 1.7} ${cy - 2.3})`}>
        <circle r={4.6} fill={INK} />
        <circle cx={1.4} cy={-1.6} r={1.3} fill="var(--color-white)" />
      </g>
    );
  if (mood === "thinking")
    return (
      <g transform={`translate(${cx} ${cy})`}>
        <g className="hf-framey-orbit">
          <circle cx={-2.8} r={1.9} fill={INK} />
          <circle cx={2.8} r={1.9} fill={INK} />
        </g>
      </g>
    );
  if (mood === "error")
    return (
      <path
        transform={`translate(${cx} ${cy})`}
        d="M-5 -2 L-1.4 1.6 M-1.4 -2 L-5 1.6 M1.4 -2 L5 1.6 M5 -2 L1.4 1.6"
        stroke={INK}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    );
  return (
    <path
      d={`M${cx - 2.6} ${cy - 2.4} V${cy + 2.4} M${cx + 2.6} ${cy - 2.4} V${cy + 2.4}`}
      stroke={INK}
      strokeWidth={2.4}
      strokeLinecap="round"
    />
  );
}

/** `eyeRef` moves the pupils (a translate of a few px) without re-rendering. Without `mood` Framey holds still. */
export function FrameyGlyph({
  size,
  className,
  eyeRef,
  mood,
}: {
  size: number;
  className?: string;
  eyeRef?: Ref<SVGGElement>;
  mood?: FrameyMood;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      aria-hidden="true"
      overflow="visible"
      className={cn(mood && "hf-framey-mood", className)}
      data-mood={mood}
    >
      <g className="hf-framey-whole">
        <g className="hf-framey-body">
          <path
            d={BODY}
            fill="var(--color-white)"
            stroke="var(--color-white)"
            strokeWidth={RIM}
            strokeLinejoin="round"
          />
          <path
            d={BODY}
            fill="var(--color-framey)"
            stroke="var(--color-framey)"
            strokeWidth={19}
            strokeLinejoin="round"
          />
          <g className="hf-framey-lid">
            <circle cx={EYE.cx} cy={EYE.cy} r={EYE.r} fill="var(--color-white)" />
            <g ref={eyeRef} className="hf-framey-eye">
              <Pupils mood={mood} />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
