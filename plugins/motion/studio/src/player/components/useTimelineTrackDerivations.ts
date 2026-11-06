import { useMemo } from "react";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { getTrackStyle, type TrackVisualStyle } from "./timelineIcons";

/** One resolved audio group, positioned in the row order. */
export interface TimelineTrackGroupInfo {
  id: string;
  label: string;
  /**
   * Synthetic sort key for the group's own row — the same fractional-key
   * convention sub-composition expansion already uses (see
   * timelineTrackDisplay.ts): the first (lowest) member track's number minus
   * 0.5, so it slots in immediately above that member.
   */
  anchorKey: number;
  /** Member track numbers, ascending. */
  memberTracks: number[];
  /**
   * Every clip under this group, in member-track order — INDEPENDENT of whether
   * the group is expanded.
   *
   * Collapsing a group stops emitting its member rows into `tracks`, so anything
   * that recovered member elements by looking them up there got an empty list in
   * the default (collapsed) state — silently disabling the
   * automation-lane count, and the bus strip's member labels. Membership is not
   * a display concern, so it does not travel through the display list.
   */
  memberElements: TimelineElement[];
  /** The group element's `data-volume`, mirrored from a member's parse (B7's slider). */
  volume: number;
  /** The group element's `data-hidden`, mirrored from a member's parse (B5's group mute). */
  hidden: boolean;
  /** The group element's serialized `data-fx-chain`, mirrored from a member's parse (C1's FX entry). */
  fxChain?: string;
  /** The group element's serialized `data-automation` — the group's OWN lanes,
   *  which are what its `∿` discloses (groups doc §5). */
  automation?: string;
}

interface GroupMembership {
  trackToGroupId: Map<number, string>;
  memberTracksByGroup: Map<string, number[]>;
  labelByGroup: Map<string, string>;
  volumeByGroup: Map<string, number>;
  hiddenByGroup: Map<string, boolean>;
  fxChainByGroup: Map<string, string | undefined>;
  automationByGroup: Map<string, string | undefined>;
}

/** Which track belongs to which group, and each group's label/volume/hidden/fxChain — one pass over raw tracks. */
function resolveGroupMembership(rawTracks: [number, TimelineElement[]][]): GroupMembership {
  const trackToGroupId = new Map<number, string>();
  const memberTracksByGroup = new Map<string, number[]>();
  const labelByGroup = new Map<string, string>();
  const volumeByGroup = new Map<string, number>();
  const hiddenByGroup = new Map<string, boolean>();
  const fxChainByGroup = new Map<string, string | undefined>();
  const automationByGroup = new Map<string, string | undefined>();
  for (const [trackNum, elements] of rawTracks) {
    const owner = elements.find((el) => el.audioGroup);
    if (!owner?.audioGroup) continue;
    trackToGroupId.set(trackNum, owner.audioGroup);
    if (!labelByGroup.has(owner.audioGroup)) {
      labelByGroup.set(owner.audioGroup, owner.audioGroupLabel ?? owner.audioGroup);
      volumeByGroup.set(owner.audioGroup, owner.audioGroupVolume ?? 1);
      hiddenByGroup.set(owner.audioGroup, owner.audioGroupHidden ?? false);
      fxChainByGroup.set(owner.audioGroup, owner.audioGroupFxChain);
      automationByGroup.set(owner.audioGroup, owner.audioGroupAutomation);
    }
    const members = memberTracksByGroup.get(owner.audioGroup) ?? [];
    members.push(trackNum);
    memberTracksByGroup.set(owner.audioGroup, members);
  }
  return {
    trackToGroupId,
    memberTracksByGroup,
    labelByGroup,
    volumeByGroup,
    hiddenByGroup,
    fxChainByGroup,
    automationByGroup,
  };
}

/** One group's resolved row info, built once the first time its id is seen. */
function buildGroupInfo(
  groupId: string,
  fallbackTrackNum: number,
  membership: GroupMembership,
  rawByTrack: ReadonlyMap<number, TimelineElement[]>,
): TimelineTrackGroupInfo {
  const memberTracks = [...(membership.memberTracksByGroup.get(groupId) ?? [])].sort(
    (a, b) => a - b,
  );
  const fxChain = membership.fxChainByGroup.get(groupId);
  const automation = membership.automationByGroup.get(groupId);
  return {
    id: groupId,
    label: membership.labelByGroup.get(groupId) ?? groupId,
    // Exactly x.5, which sub-composition child rows are now kept strictly below
    // the timeline row source — they used to be able to land here and collide,
    // duplicating the group header.
    anchorKey: (memberTracks[0] ?? fallbackTrackNum) - 0.5,
    memberTracks,
    memberElements: memberTracks.flatMap((track) => rawByTrack.get(track) ?? []),
    volume: membership.volumeByGroup.get(groupId) ?? 1,
    hidden: membership.hiddenByGroup.get(groupId) ?? false,
    ...(fxChain ? { fxChain } : {}),
    ...(automation ? { automation } : {}),
  };
}

/**
 * Push a group's synthetic anchor row plus its members' rows, contiguously.
 *
 * A collapsed group emits its anchor and nothing else. `buildTimelineLogicalRows`
 * already stops at the anchor when collapsed, so leaving the member rows in
 * `tracks` left row geometry reserving a full row each for rows that then
 * rendered as `null` — a header trailed by its members' worth of blank,
 * unreachable dead space. Membership still lands in `trackGroupOf`: a collapsed
 * member is hidden, not ungrouped.
 */
function emitGroupRows(
  info: TimelineTrackGroupInfo,
  rawByTrack: ReadonlyMap<number, TimelineElement[]>,
  trackGroupOf: Map<number, TimelineTrackGroupInfo>,
  tracks: [number, TimelineElement[]][],
  expanded: boolean,
): void {
  tracks.push([info.anchorKey, []]);
  for (const member of info.memberTracks) {
    trackGroupOf.set(member, info);
    if (expanded) tracks.push([member, rawByTrack.get(member) ?? []]);
  }
}

/**
 * Pull each group's members out of raw ascending track order and re-emit them
 * contiguously, directly beneath a synthetic anchor row. Ungrouped tracks keep
 * their position; a group's members move up to sit under its anchor even when
 * other (ungrouped) tracks were interleaved between them.
 */
function groupTimelineTracks(
  rawTracks: [number, TimelineElement[]][],
  collapsedGroupIds: ReadonlySet<string>,
): {
  tracks: [number, TimelineElement[]][];
  groups: TimelineTrackGroupInfo[];
  trackGroupOf: Map<number, TimelineTrackGroupInfo>;
} {
  const membership = resolveGroupMembership(rawTracks);
  const rawByTrack = new Map(rawTracks);
  const groups: TimelineTrackGroupInfo[] = [];
  const trackGroupOf = new Map<number, TimelineTrackGroupInfo>();
  const emitted = new Set<string>();
  const tracks: [number, TimelineElement[]][] = [];

  for (const [trackNum, elements] of rawTracks) {
    const groupId = membership.trackToGroupId.get(trackNum);
    if (!groupId) {
      tracks.push([trackNum, elements]);
      continue;
    }
    if (emitted.has(groupId)) continue;
    emitted.add(groupId);
    const info = buildGroupInfo(groupId, trackNum, membership, rawByTrack);
    groups.push(info);
    emitGroupRows(info, rawByTrack, trackGroupOf, tracks, !collapsedGroupIds.has(groupId));
  }
  return { tracks, groups, trackGroupOf };
}

/** The timeline's rows top to bottom, as drawn: tracks by number, each audio group's anchor
 *  row with its members under it. */
function timelineDisplayTracks(
  elements: readonly TimelineElement[],
  collapsedGroupIds: ReadonlySet<string>,
) {
  const byTrack = new Map<number, TimelineElement[]>();
  for (const el of elements) {
    const list = byTrack.get(el.track) ?? [];
    list.push(el);
    byTrack.set(el.track, list);
  }
  const rawTracks = Array.from(byTrack.entries()).sort(([a], [b]) => a - b);
  const grouped = groupTimelineTracks(rawTracks, collapsedGroupIds);
  return { ...grouped, trackOrder: grouped.tracks.map(([trackNum]) => trackNum) };
}

/**
 * The track number of each timeline row, top to bottom: pass the player store's `elements` and
 * `collapsedGroupIds`. A group's anchor row is its first member's track minus 0.5.
 */
export function displayTrackOrder(
  elements: readonly TimelineElement[],
  collapsedGroupIds: ReadonlySet<string>,
): number[] {
  return timelineDisplayTracks(elements, collapsedGroupIds).trackOrder;
}

/**
 * Per-render track derivations Timeline.tsx feeds the canvas/lanes: the lane →
 * clip grouping (`tracks`, group-aware order), per-lane visual styles, the
 * matching `trackOrder`, and audio-group membership.
 */
export function useTimelineTrackDerivations(expandedElements: TimelineElement[]): {
  tracks: [number, TimelineElement[]][];
  trackStyles: Map<number, TrackVisualStyle>;
  trackOrder: number[];
  groups: TimelineTrackGroupInfo[];
  trackGroupOf: Map<number, TimelineTrackGroupInfo>;
} {
  const collapsedGroupIds = usePlayerStore((s) => s.collapsedGroupIds);
  const { tracks, groups, trackGroupOf, trackOrder } = useMemo(
    () => timelineDisplayTracks(expandedElements, collapsedGroupIds),
    [expandedElements, collapsedGroupIds],
  );

  const trackStyles = useMemo(() => {
    const map = new Map<number, TrackVisualStyle>();
    for (const [trackNum, els] of tracks) {
      map.set(trackNum, getTrackStyle(els[0]?.tag ?? ""));
    }
    return map;
  }, [tracks]);

  return { tracks, trackStyles, trackOrder, groups, trackGroupOf };
}
