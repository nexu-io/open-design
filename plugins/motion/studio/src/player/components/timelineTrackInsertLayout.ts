import type { TimelineTrackGroupInfo } from "./useTimelineTrackDerivations";
import { timelineAudioRow, isInsertAllowedForZone } from "./timelineCollision";

export function timelineTrackOrderChanged(
  previous: readonly number[],
  current: readonly number[],
): boolean {
  return current.length !== previous.length || current.some((key, row) => key !== previous[row]);
}

export interface TimelineTrackInsertLayout {
  allowedRows: ReadonlySet<number>;
  trackOrder: number[];
  topologyRows: number[];
  groupTracks: ReadonlyMap<number, readonly number[]>;
}

export function keyboardPickupInsertRow(
  row: number,
  allowed: ReadonlySet<number> | undefined,
): number {
  while (row > 0 && allowed && !allowed.has(row)) row--;
  return row;
}

export function nextKeyboardInsertRow(input: {
  current: number;
  step: -1 | 1;
  order: number[];
  layout: TimelineTrackInsertLayout | undefined;
  audioTracks: ReadonlySet<number>;
  isAudio: boolean;
}): number | null {
  const { current, step, order, layout, audioTracks, isAudio } = input;
  let row = Math.max(0, Math.min(order.length, current + step));
  const allowed = layout?.allowedRows;
  while (allowed?.has(row) === false) {
    row += step;
    if (row < 0 || row > order.length) return null;
  }
  const audioRow = timelineAudioRow(order, audioTracks, layout?.groupTracks);
  return isInsertAllowedForZone(row, audioRow, isAudio, allowed) ? row : null;
}

/** Groups own one contiguous insertion block, including their collapsed members. */
export function buildTimelineTrackInsertLayout(
  order: number[],
  groups: readonly Pick<TimelineTrackGroupInfo, "anchorKey" | "memberTracks">[],
): TimelineTrackInsertLayout {
  const allowedRows = new Set(Array.from({ length: order.length + 1 }, (_, row) => row));
  const anchors = new Map(groups.map((group) => [group.anchorKey, group.memberTracks]));
  const positions = new Map(order.map((key, row) => [key, row]));
  for (const group of groups) {
    const anchor = positions.get(group.anchorKey);
    if (anchor === undefined) continue;
    const end = Math.max(anchor, ...group.memberTracks.map((key) => positions.get(key) ?? anchor));
    for (let row = anchor + 1; row <= end; row++) allowedRows.delete(row);
  }
  const tracks = new Set<number>();
  const topologyRows = [0];
  for (const key of order) {
    for (const track of anchors.get(key) ?? [key]) tracks.add(track);
    topologyRows.push(tracks.size);
  }
  return {
    allowedRows,
    trackOrder: [...tracks],
    topologyRows,
    groupTracks: anchors,
  };
}
