import { memo, type RefObject } from "react";
import { useSettledScrollLeft } from "./useSettledScrollLeft";
import type { TimelineTheme } from "./timelineTheme";
import { RULER_H, getTimelineBeatEntries } from "./timelineLayout";
import { rulerTickText } from "./timelineRulerGeometry";
import type { MusicBeatAnalysis } from "@hyperframes/core/beats";
import type { TimelineTimeRange } from "../lib/timelineClipIndex";

interface TimelineRulerProps {
  major: number[];
  minor: number[];
  pps: number;
  trackContentWidth: number;
  totalH: number;
  effectiveDuration: number;
  majorTickInterval: number;
  tickFrameRate?: number;
  theme: TimelineTheme;
  beatAnalysis?: MusicBeatAnalysis | null;
  contentOrigin: number;
  renderTimeRange?: TimelineTimeRange;
  scrollRef?: RefObject<HTMLDivElement | null>;
}

const TICK_LABEL_INSET_PX = 5;

// Index of the major tick whose label starts under the track-header corner, which
// covers ruler x < scrollLeft; -1 when none does.
function tickIndexUnderHeader(major: number[], pps: number, scrollLeft: number): number {
  let lo = 0;
  let hi = major.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (major[mid]! * pps - 0.5 + TICK_LABEL_INSET_PX < scrollLeft) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

// Paints over the one label the header corner would slice, once a scroll settles; mid-scroll a
// fragment can still show.
const HeaderSlicedLabelMask = memo(function HeaderSlicedLabelMask({
  scrollRef,
  major,
  pps,
  background,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  major: number[];
  pps: number;
  background: string;
}) {
  const settledScrollLeft = useSettledScrollLeft(scrollRef);
  const index =
    settledScrollLeft === null ? -1 : tickIndexUnderHeader(major, pps, settledScrollLeft);
  if (index < 0) return null;
  const labelLeft = major[index]! * pps - 0.5 + TICK_LABEL_INSET_PX;
  const next = major[index + 1];
  return (
    <div
      data-timeline-ruler-label-mask=""
      className="absolute pointer-events-none"
      style={{
        left: labelLeft,
        top: 4,
        height: 12,
        // Up to the next label, so only this label's text band is covered.
        width: next === undefined ? 80 : (next - major[index]!) * pps - TICK_LABEL_INSET_PX,
        background,
      }}
    />
  );
});

export const TimelineRuler = memo(function TimelineRuler({
  major,
  minor,
  pps,
  trackContentWidth,
  totalH,
  effectiveDuration,
  majorTickInterval,
  tickFrameRate,
  theme,
  beatAnalysis,
  contentOrigin,
  renderTimeRange,
  scrollRef,
}: TimelineRulerProps) {
  const beatTimes = beatAnalysis?.beatTimes ?? [];
  const beatStrengths = beatAnalysis?.beatStrengths ?? [];
  const beatEntries = getTimelineBeatEntries(beatTimes, beatStrengths, renderTimeRange);

  // Only draw beat lines when they'd be at least 5px apart
  const avgBeatInterval =
    beatTimes.length > 1
      ? (beatTimes[beatTimes.length - 1]! - beatTimes[0]!) / (beatTimes.length - 1)
      : null;
  const showBeats = avgBeatInterval !== null && avgBeatInterval * pps >= 5;

  return (
    <>
      {/* Background SVG — beat lines only; major-tick gridlines removed so only
          the ruler's own small ticks mark intervals (no full-height lines). */}
      <svg
        data-timeline-zoom-scale=""
        className="absolute pointer-events-none"
        style={{ left: contentOrigin, width: trackContentWidth, zIndex: 0 }}
        height={totalH}
      >
        {showBeats &&
          beatEntries.map(({ time: t, index: i, strength: beatStrength }) => {
            const x = t * pps;
            // Louder beats → brighter line. Gamma curve widens the contrast.
            const strength = Math.pow(Math.min(1, beatStrength ?? 0.5), 2.2);
            const opacity = 0.08 + strength * 0.62;
            return (
              <line
                data-timeline-grid-cell="beat"
                key={`b-${t}-${i}`}
                x1={x}
                y1={0}
                x2={x}
                y2={totalH}
                stroke="var(--timeline-beat)"
                strokeOpacity={opacity}
                strokeWidth="1"
              />
            );
          })}
      </svg>

      {/* Ruler — sticky so the timestamps stay visible while the tracks scroll
          vertically. Opaque background (plus the label-column corner block) so clips
          scrolling underneath don't bleed through; z-index sits above the track
          rows and drag overlays but below the playhead (z 100). */}
      <div
        className="sticky top-0 flex"
        style={{ height: RULER_H, width: contentOrigin + trackContentWidth, zIndex: 70 }}
      >
        <div
          className="sticky left-0 z-12 shrink-0"
          style={{
            width: contentOrigin,
            // Ruler corner uses the panel surface — same as the ruler strip itself.
            background: theme.shellBackground,
          }}
        />
        {/* Breathing pad before 00:00 is folded into contentOrigin (see
            Timeline.tsx: GUTTER + TRACKS_LEFT_PAD), so no separate pad div. */}
        <div
          data-timeline-zoom-scale=""
          className="relative overflow-hidden"
          style={{
            height: RULER_H,
            width: trackContentWidth,
            // Ruler background = the panel surface token — no bottom border,
            // no tick lines (CapCut-style clean ruler, labels only).
            background: theme.shellBackground,
          }}
        >
          {/* Each 1px tick line is shifted -0.5px so its CENTER sits exactly on
              t * pps — matching the playhead line, which is also centered on
              contentOrigin + t * pps (see getTimelinePlayheadLeft). Without the shift
              a tick spans [x, x+1) and its center is half a pixel right. */}
          {minor.map((t) => (
            <div
              key={`m-${t}`}
              data-timeline-grid-cell="minor"
              className="absolute bottom-0"
              style={{ left: t * pps - 0.5 }}
            >
              <div className="w-px h-2" style={{ background: theme.tickMinor }} />
            </div>
          ))}

          {major.map((t) => (
            <div
              key={`M-${t}`}
              data-timeline-grid-cell="major"
              className="absolute top-0"
              style={{ left: t * pps - 0.5 }}
            >
              <span
                className="absolute font-mono tabular-nums leading-none whitespace-nowrap"
                style={{
                  color: theme.tickText,
                  left: TICK_LABEL_INSET_PX,
                  top: 5,
                  fontSize: 10,
                }}
              >
                {rulerTickText(t, tickFrameRate, effectiveDuration, majorTickInterval)}
              </span>
              <div className="w-px" style={{ height: RULER_H, background: theme.tickMajor }} />
            </div>
          ))}
          {scrollRef && (
            <HeaderSlicedLabelMask
              scrollRef={scrollRef}
              major={major}
              pps={pps}
              background={theme.shellBackground}
            />
          )}
        </div>
      </div>
    </>
  );
});
