/** The base automation envelope plus the heavier segment grab affordance. */

import type { AutomationRange, HfAutomationLane } from "@hyperframes/core/audio-automation";
import { envelopeSegmentPath } from "./automationLaneGeometry";

interface AutomationEnvelopePathsProps {
  path: string;
  lane: HfAutomationLane;
  range: AutomationRange;
  accentColor: string;
  activeSegment: number | null;
  xOf(t: number): number;
  yOf(v: number): number;
}

export function AutomationEnvelopePaths({
  path,
  lane,
  range,
  accentColor,
  activeSegment,
  xOf,
  yOf,
}: AutomationEnvelopePathsProps) {
  const activePath =
    activeSegment === null
      ? null
      : envelopeSegmentPath({ lane, range, index: activeSegment, xOf, yOf });

  return (
    <>
      <path
        data-automation-envelope=""
        d={path}
        fill="none"
        stroke={accentColor}
        strokeWidth={1.5}
        opacity={lane.points.length === 0 ? 0.35 : 0.95}
      />
      {activePath ? (
        <path
          data-automation-segment-active={activeSegment ?? undefined}
          d={activePath}
          fill="none"
          stroke={accentColor}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={1}
          pointerEvents="none"
        />
      ) : null}
    </>
  );
}
