import { clampPlaybackRate } from "@hyperframes/parsers/media-duration";
import { roundToCenti } from "../../utils/rounding";
import type { TimelineElement } from "../store/playerStore";
import { clampToHostStart } from "../store/timelineElement";
import { getTimelineEditCapabilities } from "./timelineEditCapabilities";

const DEFAULT_TIMELINE_MIN_DURATION = 0.1;
const ABSOLUTE_TIMELINE_MIN_DURATION = 0.05;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundTimelineTime(value: number): number {
  return roundToCenti(value);
}

const SAVED_MEDIA_OFFSET_TOLERANCE = 1e-5;

function ceilTimelineTime(value: number): number {
  return Math.ceil((value - SAVED_MEDIA_OFFSET_TOLERANCE) * 100) / 100;
}

function floorTimelineTime(value: number): number {
  return Math.floor((value + SAVED_MEDIA_OFFSET_TOLERANCE) * 100) / 100;
}

export function resolveTimelineMinDuration(minDuration?: number): number {
  return Math.max(ABSOLUTE_TIMELINE_MIN_DURATION, minDuration ?? DEFAULT_TIMELINE_MIN_DURATION);
}

/** Playback rate never drops to zero (would make media-in-point math divide by ~0). */
export function resolveTimelinePlaybackRate(rate?: number): number {
  return clampPlaybackRate(rate ?? 1);
}

interface TimelineStartTrimClip {
  start: number;
  duration: number;
  playbackStart?: number;
  playbackRate?: number;
}

/**
 * Delta bounds for trimming a clip's START edge (shared by single-clip and group
 * resize). Left-bounded by how far the start can move toward `minStart` and by the
 * media in-point (`playbackStart / playbackRate`); right-bounded by `minDuration`, the start
 * floored onto the centisecond grid. Otherwise unrounded; applyClipStartTrimDelta rounds.
 */
export function clipStartTrimDeltaBounds(
  clip: TimelineStartTrimClip,
  minStart: number,
  minDuration: number,
): { minDelta: number; maxDelta: number } {
  const playbackRate = resolveTimelinePlaybackRate(clip.playbackRate);
  const maxLeftExtensionFromMedia =
    clip.playbackStart != null ? clip.playbackStart / playbackRate : Number.POSITIVE_INFINITY;
  return {
    minDelta: -Math.min(clip.start - minStart, maxLeftExtensionFromMedia),
    maxDelta: floorTimelineTime(clip.start + clip.duration - minDuration) - clip.start,
  };
}

/**
 * Apply a start-edge delta to one clip: rounds the start once, keeps the end fixed,
 * and derives the media in-point from the rounded start (clamped at 0), so the media
 * clock `start - playbackStart / playbackRate` survives any number of head trims.
 */
export function applyClipStartTrimDelta(
  clip: TimelineStartTrimClip,
  delta: number,
): { start: number; duration: number; playbackStart?: number } {
  const playbackRate = resolveTimelinePlaybackRate(clip.playbackRate);
  const mediaZero =
    clip.playbackStart != null ? clip.start - clip.playbackStart / playbackRate : -Infinity;
  const start = Math.max(roundTimelineTime(clip.start + delta), ceilTimelineTime(mediaZero));
  return {
    start,
    duration: roundTimelineTime(clip.start + clip.duration - start),
    playbackStart:
      clip.playbackStart != null
        ? Math.max(0, clip.playbackStart + (start - clip.start) * playbackRate)
        : undefined,
  };
}

export interface TimelineGroupTimingMember {
  start: number;
  duration: number;
  playbackStart?: number;
  playbackRate?: number;
  minStart?: number;
}

export type TimelineGroupResizeEdge = "start" | "end";

export interface TimelineGroupMoveResult {
  delta: number;
  members: Array<Pick<TimelineGroupTimingMember, "start" | "duration">>;
}

export interface TimelineGroupResizeResult {
  delta: number;
  members: Array<Pick<TimelineGroupTimingMember, "start" | "duration" | "playbackStart">>;
}

function clampTimelineGroupMoveDelta(
  rawDelta: number,
  members: readonly TimelineGroupTimingMember[],
): number {
  if (members.length === 0) return 0;
  const minDelta = Math.max(...members.map((member) => -(member.start - (member.minStart ?? 0))));
  return roundTimelineTime(Math.max(rawDelta, minDelta));
}

export function resolveTimelineGroupMove(
  members: readonly TimelineGroupTimingMember[],
  rawDelta: number,
): TimelineGroupMoveResult {
  const delta = clampTimelineGroupMoveDelta(rawDelta, members);
  return {
    delta,
    members: members.map((member) => ({
      start: roundTimelineTime(member.start + delta),
      duration: member.duration,
    })),
  };
}

export function clampTimelineGroupResizeDelta(
  rawDelta: number,
  members: readonly TimelineGroupTimingMember[],
  edge: TimelineGroupResizeEdge,
  minDuration = resolveTimelineMinDuration(),
): number {
  if (members.length === 0) return 0;

  if (edge === "end") {
    const minDelta = Math.max(...members.map((member) => minDuration - member.duration));
    return roundTimelineTime(Math.max(rawDelta, minDelta));
  }

  // Rigid group: the applied delta is bounded by the most-constrained member.
  const bounds = members.map((member) =>
    clipStartTrimDeltaBounds(member, member.minStart ?? 0, minDuration),
  );
  const minDelta = ceilTimelineTime(Math.max(...bounds.map((b) => b.minDelta)));
  const maxDelta = Math.min(...bounds.map((b) => b.maxDelta));
  const delta = roundTimelineTime(clamp(rawDelta, minDelta, maxDelta));
  const roundedPastTightestMember = delta > maxDelta + SAVED_MEDIA_OFFSET_TOLERANCE;
  return roundedPastTightestMember ? maxDelta - SAVED_MEDIA_OFFSET_TOLERANCE : delta;
}

export function resolveTimelineGroupResize(
  members: readonly TimelineGroupTimingMember[],
  edge: TimelineGroupResizeEdge,
  rawDelta: number,
  minDuration = resolveTimelineMinDuration(),
): TimelineGroupResizeResult {
  const delta = clampTimelineGroupResizeDelta(rawDelta, members, edge, minDuration);
  return {
    delta,
    members: members.map((member) => {
      if (edge === "end") {
        return {
          start: member.start,
          duration: roundTimelineTime(member.duration + delta),
          playbackStart: member.playbackStart,
        };
      }

      return applyClipStartTrimDelta(member, delta);
    }),
  };
}

/* ── Multi-select group resize wiring (restored from main 36413da7f) ───────── */

/** A selected clip snapshot captured at group-resize gesture start. */
export interface TimelineGroupResizeMember extends TimelineGroupTimingMember {
  element: TimelineElement;
  key: string;
}

/** Per-member timing patch produced by a group resize (grabbed clip included). */
export interface TimelineGroupResizeChange {
  element: TimelineElement;
  key: string;
  start: number;
  duration: number;
  playbackStart?: number;
}

function elementKey(element: TimelineElement): string {
  return element.key ?? element.id;
}

function hasSourcePlaybackOffset(element: TimelineElement): boolean {
  const tag = element.tag.toLowerCase();
  return element.kind === "composition" || tag === "audio" || tag === "video";
}

function canTrimEdge(element: TimelineElement, edge: TimelineGroupResizeEdge): boolean {
  const caps = getTimelineEditCapabilities({
    tag: element.tag,
    kind: element.kind,
    duration: element.duration,
    domId: element.domId,
    hfId: element.hfId,
    selector: element.selector,
    compositionSrc: element.compositionSrc,
    playbackStart: element.playbackStart,
    playbackStartAttr: element.playbackStartAttr,
    sourceDuration: element.sourceDuration,
    timelineLocked: element.timelineLocked,
  });
  return edge === "start" ? caps.canTrimStart : caps.canTrimEnd;
}

/**
 * Snapshot the members for a group resize, or `null` when the gesture must stay a
 * single-clip resize. Legacy semantics (main 36413da7f): a group forms only when
 * the grabbed clip is part of a multi-selection (> 1) AND EVERY selected member
 * can take THIS edge's trim. It is all-or-nothing — if any member is locked or
 * implicitly-timed the group does not form, so a locked member is never patched
 * (the grabbed clip then resizes on its own). Start-edge media members seed
 * `playbackStart` to 0 so the in-point trim math has a base, mirroring the legacy
 * `resizeMember`.
 */
export function buildTimelineGroupResizeMembers(
  elements: readonly TimelineElement[],
  selectedKeys: ReadonlySet<string>,
  grabbedKey: string,
  edge: TimelineGroupResizeEdge,
): TimelineGroupResizeMember[] | null {
  if (selectedKeys.size <= 1 || !selectedKeys.has(grabbedKey)) return null;
  const selected = elements.filter((element) => selectedKeys.has(elementKey(element)));
  if (selected.length <= 1) return null;
  if (!selected.every((element) => canTrimEdge(element, edge))) return null;
  return selected.map((element) => ({
    element,
    key: elementKey(element),
    start: element.start,
    duration: element.duration,
    playbackStart:
      edge === "start" && hasSourcePlaybackOffset(element)
        ? (element.playbackStart ?? 0)
        : element.playbackStart,
    playbackRate: element.playbackRate,
    minStart: clampToHostStart(element, 0),
  }));
}

/**
 * Resolve the per-member timing patches for a group resize from the grabbed
 * clip's raw edge delta. Rigid group: one shared delta, clamped by the most
 * constrained member (see resolveTimelineGroupResize), applied to every member.
 */
export function resolveTimelineGroupResizeChanges(
  members: readonly TimelineGroupResizeMember[],
  edge: TimelineGroupResizeEdge,
  rawDelta: number,
  minDuration = resolveTimelineMinDuration(),
): TimelineGroupResizeChange[] {
  const result = resolveTimelineGroupResize(members, edge, rawDelta, minDuration);
  return result.members.map((member, index) => ({
    element: members[index]!.element,
    key: members[index]!.key,
    start: member.start,
    duration: member.duration,
    playbackStart: member.playbackStart,
  }));
}

/** In-flight multi-select group-resize gesture (owned by the drag hook). */
export interface TimelineGroupResizeSession {
  grabbedKey: string;
  edge: TimelineGroupResizeEdge;
  members: TimelineGroupResizeMember[];
  changes: TimelineGroupResizeChange[];
  hasChanged: boolean;
}

/**
 * Fold the grabbed clip's single-clip preview into the group: derive the raw
 * edge delta from it, resolve the rigid per-member changes onto the session
 * (updating `changes` + `hasChanged`), and return the grabbed clip's own change
 * so the caller can render it from the resize state.
 */
export function applyTimelineGroupResizePreview(
  session: TimelineGroupResizeSession,
  grabbedPreview: { previewStart: number; previewDuration: number },
): TimelineGroupResizeChange | undefined {
  const grabbed = session.members.find((m) => m.key === session.grabbedKey);
  const rawDelta =
    session.edge === "start"
      ? grabbedPreview.previewStart - (grabbed?.start ?? grabbedPreview.previewStart)
      : grabbedPreview.previewDuration - (grabbed?.duration ?? grabbedPreview.previewDuration);
  const changes = resolveTimelineGroupResizeChanges(session.members, session.edge, rawDelta);
  session.changes = changes;
  session.hasChanged = changes.some(
    (c, i) =>
      c.start !== session.members[i]!.start ||
      c.duration !== session.members[i]!.duration ||
      c.playbackStart !== session.members[i]!.playbackStart,
  );
  return changes.find((c) => c.key === session.grabbedKey);
}
