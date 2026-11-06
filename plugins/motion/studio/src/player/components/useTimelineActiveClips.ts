import { useCallback, useLayoutEffect, useRef } from "react";
import { liveTime, type TimelineElement } from "../store/playerStore";
import { useMountEffect } from "../../hooks/useMountEffect";

interface ActiveClipRecord {
  id: string;
  start: number;
  end: number;
  hidden: boolean;
  element: HTMLElement;
}

interface UseTimelineActiveClipsInput {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  currentTime: number;
  clipStateVersion: unknown;
  elementStateVersion: unknown;
}

function isTimelineIntervalActive(
  interval: Pick<ActiveClipRecord, "start" | "end" | "hidden">,
  time: number,
): boolean {
  return (
    Number.isFinite(time) &&
    !interval.hidden &&
    Number.isFinite(interval.start) &&
    Number.isFinite(interval.end) &&
    time >= interval.start &&
    time <= interval.end
  );
}

/** Model-first active state. Rendered nodes receive this on their first mount. */
export function isTimelineClipActive(element: TimelineElement, time: number): boolean {
  return isTimelineIntervalActive(
    {
      start: element.start,
      end: element.start + Math.max(0, element.duration),
      hidden: element.hidden === true,
    },
    time,
  );
}

function readFiniteNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readClipRecord(element: Element): ActiveClipRecord | null {
  if (!(element instanceof HTMLElement)) return null;
  const id = element.dataset.elId;
  const start = readFiniteNumber(element.dataset.clipStart);
  const end = readFiniteNumber(element.dataset.clipEnd);
  if (!id || start === null || end === null) return null;
  return { id, start, end, hidden: element.dataset.clipHidden === "true", element };
}

function collectTimelineClipRecords(container: HTMLElement): ActiveClipRecord[] {
  return [...container.querySelectorAll('[data-clip="true"]')]
    .map(readClipRecord)
    .filter((record): record is ActiveClipRecord => record !== null);
}

function getActiveClipIds(records: ActiveClipRecord[], time: number): Set<string> {
  return new Set(
    records.filter((record) => isTimelineIntervalActive(record, time)).map((record) => record.id),
  );
}

function applyActiveClipDiff(
  records: ActiveClipRecord[],
  previous: Set<string>,
  time: number,
  syncAll = false,
): void {
  const next = getActiveClipIds(records, time);
  for (const record of records) {
    const isActive = next.has(record.id);
    if (syncAll || previous.has(record.id) !== isActive) {
      record.element.toggleAttribute("data-active", isActive);
    }
  }
  previous.clear();
  for (const id of next) previous.add(id);
}

export function updateTimelineActiveClipClasses(
  container: HTMLElement,
  previous: Set<string>,
  time: number,
  syncAll = false,
): void {
  applyActiveClipDiff(collectTimelineClipRecords(container), previous, time, syncAll);
}

/** Keeps the currently mounted clip window synchronized with the RAF playback clock. */
export function useTimelineActiveClips({
  scrollRef,
  currentTime,
  clipStateVersion,
  elementStateVersion,
}: UseTimelineActiveClipsInput): void {
  const recordsRef = useRef<ActiveClipRecord[]>([]);
  const previousActiveIdsRef = useRef(new Set<string>());
  const refreshRecords = useCallback(
    (time: number) => {
      const scroll = scrollRef.current;
      if (!scroll) {
        recordsRef.current = [];
        previousActiveIdsRef.current.clear();
        return;
      }
      recordsRef.current = collectTimelineClipRecords(scroll);
      applyActiveClipDiff(recordsRef.current, previousActiveIdsRef.current, time, true);
    },
    [scrollRef],
  );

  useLayoutEffect(() => {
    refreshRecords(currentTime);
  }, [clipStateVersion, currentTime, elementStateVersion, refreshRecords]);
  useMountEffect(() =>
    liveTime.subscribe((time) => {
      applyActiveClipDiff(recordsRef.current, previousActiveIdsRef.current, time);
    }),
  );
}
