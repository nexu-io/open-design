import type { RoutineScheduleSummaryParts } from '../formatters';

/** Renders the automation pill's compact schedule summary from its
 * pre-computed parts (`describeRoutineScheduleParts`). */
export function ScheduleSummary({ parts }: { parts: RoutineScheduleSummaryParts }) {
  if (parts.kind === 'hourly') {
    return (
      <span className="automation-pill__segments">
        <span className="automation-pill__freq">{parts.kindLabel}</span>
        <span className="automation-pill__sep">·</span>
        <span className="automation-pill__time">:{parts.minute}</span>
      </span>
    );
  }

  if (parts.kind === 'weekly') {
    return (
      <span className="automation-pill__segments">
        <span className="automation-pill__freq">{parts.dayLabel}</span>
        <span className="automation-pill__sep">·</span>
        <span className="automation-pill__time">{parts.time}</span>
        <span className="automation-pill__sep">·</span>
        <span className="automation-pill__tz">{parts.tz}</span>
      </span>
    );
  }

  return (
    <span className="automation-pill__segments">
      <span className="automation-pill__freq">{parts.kindLabel}</span>
      <span className="automation-pill__sep">·</span>
      <span className="automation-pill__time">{parts.time}</span>
      <span className="automation-pill__sep">·</span>
      <span className="automation-pill__tz">{parts.tz}</span>
    </span>
  );
}
