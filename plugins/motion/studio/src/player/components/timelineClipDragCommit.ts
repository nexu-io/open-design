import type { TimelineElement } from "../store/playerStore";
import { clampToHostStart } from "../store/timelineElement";
import type { DraggedClipState } from "./useTimelineClipDrag";
// Type-only: erased at runtime, so the timelineZMirror → timelineClipDragCommit
// value-import edge stays acyclic.
import type { ZMirrorLaneMove } from "./timelineZMirror";
import { classifyZone } from "./timelineZones";
import { layoutAfterTrackInsert } from "./timelineDragLanding";
import type { TimelineTrackInsertLayout } from "./timelineTrackInsertLayout";
import { computeStackingPatches, type StackingPatch } from "./timelineStackingSync";
import {
  canMoveTimelineElement as canMoveElement,
  resolveExpandedHostAlias,
} from "./timelineAuthoredMoveTarget";
import type {
  TimelineMoveOperation,
  TimelineAtomicMoveUpdates,
  TimelineAtomicMoveEdit,
} from "../../hooks/timelineMoveAdapter";
import {
  beginTimelineOptimisticGesture,
  isLatestTimelineOptimisticGesture,
} from "./timelineOptimisticRevision";
import { runLaneZGesture } from "../../components/nle/zLaneGesture";
import { refreshAfterDurableLaneMove } from "./timelineLaneMoveRefresh";
import { authoredTrackForLane } from "./timelineAuthoredTrack";
import { resolveGroupMovers } from "./timelineMultiDragPreview";
import { beginStudioPendingEdit } from "../../utils/studioPendingEdits";
import { batchElementUpdates } from "../store/batchElementUpdates";

type StartTrack = TimelineAtomicMoveUpdates;
export interface TimelineMoveEdit extends TimelineAtomicMoveEdit {
  /**
   * File-space track override for the persist. The store's `updates.track` is a
   * DISPLAY lane; when the source file's numbering is sparse (authored tracks
   * 1,2,... or gaps), the file write must target the lane's AUTHORED track or it
   * silently re-targets the wrong row. Omitted → persist `updates.track` as-is.
   */
  persistTrack?: number;
}

export interface DragCommitDeps {
  elements: TimelineElement[];
  trackOrder: number[];
  trackInsertLayout?: TimelineTrackInsertLayout;
  updateElement: (key: string, updates: Partial<TimelineElement>) => void;
  /** Single-clip, SDK-cutover-aware persist (pure time-moves keep this path). */
  onMoveElement?: (element: TimelineElement, updates: StartTrack) => Promise<void> | void;
  /** Atomic multi-clip persist (single undo) for lane changes + track inserts.
   *  `coalesceKey`, when supplied, tags the resulting "Move timeline clips"
   *  history entry so it merges with the lane change's z-reorder entry (see the
   *  lane-change branch below). */
  onMoveElements?: (
    edits: TimelineMoveEdit[],
    coalesceKey?: string,
    operation?: TimelineMoveOperation,
  ) => Promise<void> | void;
  /**
   * The current multi-selection (store.selectedElementIds). When the dragged
   * clip is part of a multi-selection (size > 1), the WHOLE selection moves by
   * the dragged clip's time delta — the standard NLE gesture. Track changes
   * apply to the dragged clip only; the others keep their lanes.
   */
  selectedKeys?: ReadonlySet<string> | null;
  /**
   * Lane ↔ stacking unification. When a DELIBERATE vertical lane change happens,
   * the edited clip(s) get z-index patches so their canvas stacking matches lane
   * order (higher lane = on top) relative to time-overlapping clips — see
   * timelineStackingSync. Both deps must be supplied to engage; if either is
   * absent the z-sync is skipped (pure time-moves never restack). `readZIndex`
   * returns the clip's current z-index (from the live DOM inline style / computed;
   * "auto" ⇒ 0).
   */
  readZIndex?: (element: TimelineElement) => number;
  /**
   * Apply the computed z-index patches. Wiring (in the drag hook, which owns the
   * DOM/persist plumbing) forwards these to the SAME atomic style-patch persist
   * the canvas z-order commit uses (handleDomZIndexReorderCommit). Documented in
   * research/STAGE3-NEEDED-WIRING.md.
   */
  onStackingPatches?: (patches: StackingPatch[], coalesceKey?: string) => Promise<unknown> | void;
  /** Converge the preview manifest after the complete lane + z transaction. */
  refreshAfterLaneMove?: () => void;
}

const keyOf = (e: TimelineElement) => e.key ?? e.id;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
// One deterministic coalesce key shared by both records in a lane-change gesture.
let laneChangeGestureSeq = 0;

function moveStoreUpdates(edit: TimelineMoveEdit) {
  const writtenTrack =
    edit.persistTrack ??
    (edit.updates.track !== edit.element.track ? edit.updates.track : undefined);
  const { audioGroup, ...timing } = edit.updates;
  return {
    timing: writtenTrack == null ? timing : { ...timing, authoredTrack: writtenTrack },
    detach: audioGroup === null,
  };
}

/**
 * Optimistically apply + persist a batch of moves with rollback on failure.
 *
 * Returns a promise that resolves `true` once the write lands, or `false` after a
 * rejected write has been rolled back. The caller uses this to SERIALIZE the
 * lane→z stacking patch: the z-sync is a separate server style-patch, and firing
 * it before this full-file write resolves let the move (computed from a pre-z
 * snapshot) land after — and clobber — the z change. A failed move resolves
 * `false` so the caller also skips the z-sync (no orphaned z patch).
 *
 * The DOM is updated synchronously up front; the returned promise never rejects.
 *
 * Exported for reuse by non-drag batch time-moves (track gap closing — see
 * timelineGapCommit.ts) so they share the same optimistic-apply, rollback, and
 * atomic single-undo persist semantics as a drag commit.
 */
export function persistMoveEdits(
  edits: TimelineMoveEdit[],
  deps: DragCommitDeps,
  coalesceKey?: string,
  operation: TimelineMoveOperation = "timing",
): Promise<boolean> {
  if (edits.length === 0) return Promise.resolve(true);
  edits = edits.map((e) => {
    const start = clampToHostStart(e.element, e.updates.start);
    return start === e.updates.start ? e : { ...e, updates: { ...e.updates, start } };
  });
  const { updateElement, onMoveElement, onMoveElements } = deps;
  if (!onMoveElements) {
    console.warn(
      onMoveElement
        ? `[Timeline] persistMoveEdits: only single-clip onMoveElement wired, so this ${edits.length}-clip move degrades to a per-clip persist race (no atomic single-undo)`
        : `[Timeline] persistMoveEdits: no move persist handler wired, so ${edits.length} edit(s) applied to the store only, not saved`,
    );
  }
  const prev = edits.map((e) => ({
    key: keyOf(e.element),
    updates: {
      start: e.element.start,
      track: e.element.track,
      authoredTrack: e.element.authoredTrack,
      ...(e.updates.audioGroup === null ? { audioGroup: e.element.audioGroup } : {}),
    },
  }));
  const revision = beginTimelineOptimisticGesture(
    updateElement,
    edits.map((edit) => keyOf(edit.element)),
  );
  const membershipRevision = beginTimelineOptimisticGesture(
    updateElement,
    edits.filter((edit) => edit.updates.audioGroup === null).map((edit) => keyOf(edit.element)),
    "membership",
  );
  // The file write below targets `persistTrack` (authored space) when supplied,
  // or `updates.track` on a genuine lane write (track insert renumber). Mirror
  // that written value into the store's `authoredTrack` so a SECOND drag before
  // any reload resolves authored tracks from what the file now says, not stale
  // pre-edit data. Pure time-moves leave authoredTrack untouched.
  const applyEdit = (e: TimelineMoveEdit, reassert = false) => {
    const { timing, detach } = moveStoreUpdates(e);
    const key = keyOf(e.element);
    const updates: Partial<TimelineElement> = {};
    if (!reassert || isLatestTimelineOptimisticGesture(updateElement, revision, key)) {
      Object.assign(updates, timing);
    }
    if (
      detach &&
      (!reassert ||
        isLatestTimelineOptimisticGesture(updateElement, membershipRevision, key, "membership"))
    ) {
      updates.audioGroup = undefined;
    }
    if (Object.keys(updates).length) updateElement(key, updates);
  };
  const applyEdits = (reassert = false) =>
    batchElementUpdates(() => edits.forEach((e) => applyEdit(e, reassert)));
  applyEdits();
  // The store above gets DISPLAY lanes; the file below gets the authored-space
  // track when one was resolved (see TimelineMoveEdit.persistTrack).
  const persistEdits = edits.map((e) =>
    e.persistTrack == null || e.persistTrack === e.updates.track
      ? e
      : { element: e.element, updates: { ...e.updates, track: e.persistTrack } },
  );
  const restorePrev = () =>
    batchElementUpdates(() => {
      for (const p of prev) {
        const { audioGroup, ...timing } = p.updates;
        const updates: Partial<TimelineElement> = {};
        if (isLatestTimelineOptimisticGesture(updateElement, revision, p.key)) {
          Object.assign(updates, timing);
        }
        if (
          isLatestTimelineOptimisticGesture(updateElement, membershipRevision, p.key, "membership")
        )
          updates.audioGroup = audioGroup;
        if (Object.keys(updates).length) updateElement(p.key, updates);
      }
    });
  // Cmd+Z while the save is in flight shows the old lanes at once; the returned fn re-applies the move.
  const saving = onMoveElements
    ? beginStudioPendingEdit(() => {
        restorePrev();
        return () => applyEdits(true);
      })
    : null;
  const start = () =>
    onMoveElements
      ? onMoveElements(persistEdits, coalesceKey, operation)
      : Promise.all(
          persistEdits.map((e) => Promise.resolve(onMoveElement?.(e.element, e.updates))),
        );
  const persisted = saving ? saving.adopt(start) : start();
  const done = Promise.resolve(persisted).then(
    () => {
      // Runtime timeline messages can arrive while the save is in flight and
      // restore the preview manifest's pre-gesture lane. Reassert the durable
      // result after persistence, but only while this remains the latest
      // optimistic gesture so an older save can never clobber a newer drag.
      if (!saving?.reverted()) applyEdits(true);
      return true;
    },
    (error) => {
      if (!saving?.reverted()) restorePrev();
      console.error("[Timeline] Failed to persist clip edits", error);
      return false;
    },
  );
  saving?.settle(done);
  return done;
}

/**
 * Build the time-shift resolver for a multi-selection drag: every member of the
 * selection moves by the dragged clip's delta (clamped ≥ 0); non-members are
 * untouched. Returns null when this is not a multi-selection drag. A locked
 * member is dropped from the moving set (a marquee can sweep one in).
 */
function resolveMultiSelection(
  drag: DraggedClipState,
  deps: DragCommitDeps,
): {
  keys: ReadonlySet<string>;
  movedStart: (e: TimelineElement) => number;
} | null {
  const dragKey = keyOf(drag.element);
  const movers = resolveGroupMovers(deps.elements, deps.selectedKeys, dragKey);
  if (!movers) return null;
  const keys = new Set(movers.map(keyOf));
  const delta = drag.previewStart - drag.element.start;
  const movedStart = (e: TimelineElement): number =>
    keyOf(e) === dragKey ? drag.previewStart : Math.max(0, round3(e.start + delta));
  return { keys, movedStart };
}

// A move writes the dragged clip's start (each moving clip's, in a group); a lane change also writes its lane and
// re-lanes no other clip; only a new track renumbers the rows below it.
// fallow-ignore-next-line complexity
export function commitDraggedClipMove(drag: DraggedClipState, deps: DragCommitDeps): void {
  const hostAlias = resolveExpandedHostAlias(drag, deps);
  if (hostAlias) {
    commitDraggedClipMove(hostAlias.drag, { ...deps, selectedKeys: hostAlias.selectedKeys });
    return;
  }

  const { elements, updateElement, onMoveElement } = deps;
  const dragKey = keyOf(drag.element);
  const isInsert = drag.insertRow != null;
  const laneChanged = drag.previewTrack !== drag.element.track;
  // Deliberate VERTICAL gesture: the pointer aimed at a different lane, or at the
  // empty space outside the rows (insert). Anything else never touches z.
  const aimTrack = drag.desiredTrack ?? drag.previewTrack;
  const isVertical = isInsert || aimTrack !== drag.element.track;
  const multi = resolveMultiSelection(drag, deps);

  // ── Pure time-move (dragged clip keeps its lane, no insert) ─────────────────
  if (!isInsert && !laneChanged) {
    const delta = drag.previewStart - drag.element.start;
    if (delta === 0) return;
    if (multi) {
      const edits: TimelineMoveEdit[] = elements
        .filter((e) => multi.keys.has(keyOf(e)))
        .map((e) => ({
          element: e,
          updates: { start: multi.movedStart(e), track: e.track },
        }))
        .filter((e) => e.updates.start !== e.element.start);
      void persistMoveEdits(edits, deps);
      return;
    }
    const updates = { start: drag.previewStart, track: drag.element.track };
    const prev = { start: drag.element.start, track: drag.element.track };
    const revision = beginTimelineOptimisticGesture(updateElement, [dragKey]);
    updateElement(dragKey, updates);
    Promise.resolve(onMoveElement?.(drag.element, updates)).catch((error) => {
      if (isLatestTimelineOptimisticGesture(updateElement, revision, dragKey)) {
        updateElement(dragKey, prev);
      }
      console.error("[Timeline] Failed to persist clip edit", error);
    });
    return;
  }

  // ── Track insert: renumber the at/below clips by +1 (the one multi-clip write) ─
  if (isInsert) {
    commitTrackInsert(drag, deps, multi);
    return;
  }

  // ── Lane change: persist ONLY the dragged clip ──────────────────────────────
  // CapCut invariant — one edit never re-lanes another clip. The dragged clip
  // takes its new lane (previewTrack); the rest of any selection shifts in time
  // only. Nothing else is written.
  const dragEdit: TimelineMoveEdit = {
    element: drag.element,
    updates: { start: drag.previewStart, track: drag.previewTrack },
    persistTrack: authoredTrackForLane(drag.previewTrack, elements, drag.element),
  };
  const coalesceKey = isVertical ? `clip-lane-move:${laneChangeGestureSeq++}` : undefined;

  const edits: TimelineMoveEdit[] = [dragEdit];
  if (multi) {
    for (const e of elements) {
      if (keyOf(e) === dragKey || !multi.keys.has(keyOf(e))) continue;
      const start = multi.movedStart(e);
      if (start !== e.start) edits.push({ element: e, updates: { start, track: e.track } });
    }
  }
  // The drop-intent set for the z-sync: the dragged clip at its new lane, others
  // as-is. Reasoning on this (not a re-normalize) keeps the sync seeing the user's
  // move; computeStackingPatches only compares lanes relatively.
  const candidate = elements.map((e) => {
    if (keyOf(e) === dragKey) return { ...e, start: drag.previewStart, track: drag.previewTrack };
    // Selection members shift in time with the drag — the z-sync must reason on
    // their POST-move overlap sets, same as the insert branch's candidate.
    if (multi?.keys.has(keyOf(e))) return { ...e, start: multi.movedStart(e) };
    return e;
  });
  if (!isVertical || !deps.readZIndex || !deps.onStackingPatches) {
    void refreshAfterDurableLaneMove(
      persistMoveEdits(edits, deps, coalesceKey, "lane-reorder"),
      deps,
    );
    return;
  }
  void refreshAfterDurableLaneMove(
    runLaneZGesture({
      commitLane: () => persistMoveEdits(edits, deps, coalesceKey, "lane-reorder"),
      commitZ: () =>
        syncStackingForEdit(
          candidate,
          dragKey,
          drag.element.track,
          drag.previewTrack,
          deps,
          coalesceKey,
        ),
    }),
    deps,
  ).catch(() => undefined);
}

/** Build the one sanctioned multi-clip write: atomically insert and compact a
 * source-file zone, then let the caller sync the deliberate vertical stacking. */
// fallow-ignore-next-line complexity
function buildTrackInsertEdits(
  element: TimelineElement,
  previewStart: number,
  insertRow: number,
  multi: {
    keys: ReadonlySet<string>;
    movedStart: (e: TimelineElement) => number;
  } | null,
  deps: DragCommitDeps,
): { candidate: TimelineElement[]; edits: TimelineMoveEdit[] } | null {
  const { elements } = deps;
  const editKey = keyOf(element);
  const layout = layoutAfterTrackInsert(element, previewStart, insertRow, multi, deps);
  if (!layout) return null;
  const { normalized, targetTrack, writable } = layout;
  const bySrc = new Map(elements.map((e) => [keyOf(e), e]));
  // A partial zone renumber creates collisions; refuse a shifted locked row.
  for (const norm of normalized) {
    const src = bySrc.get(keyOf(norm));
    if (
      src &&
      writable(src) &&
      !canMoveElement(src) &&
      norm.track !== (src.authoredTrack ?? src.track)
    ) {
      console.warn(
        `[Timeline] Track insert refused: locked clip ${keyOf(src)} would need renumbering`,
      );
      return null;
    }
  }
  const candidate = elements.map((e) => {
    if (keyOf(e) === editKey) return { ...e, start: previewStart, track: targetTrack };
    if (multi?.keys.has(keyOf(e))) return { ...e, start: multi.movedStart(e) };
    return e;
  });
  const edits: TimelineMoveEdit[] = [];
  if (multi) {
    for (const src of elements) {
      const srcKey = keyOf(src);
      if (srcKey !== editKey && multi.keys.has(srcKey) && !writable(src) && canMoveElement(src)) {
        edits.push({
          element: src,
          updates: { start: multi.movedStart(src), track: src.track },
          persistTrack: src.authoredTrack,
        });
      }
    }
  }
  for (const norm of normalized) {
    const src = bySrc.get(keyOf(norm));
    if (!src || !canMoveElement(src)) continue;
    const normKey = keyOf(norm);
    let start = src.start;
    if (normKey === editKey) start = previewStart;
    else if (multi?.keys.has(normKey)) start = multi.movedStart(src);
    edits.push({
      element: src,
      updates: {
        start,
        track: norm.track,
        ...(normKey === editKey && src.audioGroup ? { audioGroup: null } : {}),
      },
    });
  }
  return { candidate, edits };
}

function commitTrackInsert(
  drag: DraggedClipState,
  deps: DragCommitDeps,
  multi: {
    keys: ReadonlySet<string>;
    movedStart: (e: TimelineElement) => number;
  } | null,
): void {
  const dragKey = keyOf(drag.element);
  const built = buildTrackInsertEdits(
    drag.element,
    drag.previewStart,
    drag.insertRow!,
    multi,
    deps,
  );
  if (!built) return;
  const { candidate, edits } = built;
  if (edits.length === 0) return;

  const coalesceKey = `clip-lane-move:${laneChangeGestureSeq++}`;
  if (!deps.readZIndex || !deps.onStackingPatches) {
    void refreshAfterDurableLaneMove(
      persistMoveEdits(edits, deps, coalesceKey, "track-insert"),
      deps,
    );
    return;
  }
  void refreshAfterDurableLaneMove(
    runLaneZGesture({
      commitLane: () => persistMoveEdits(edits, deps, coalesceKey, "track-insert"),
      commitZ: () =>
        // Sync from the fractional drop intent, not the normalized persisted lanes.
        syncStackingForEdit(
          candidate,
          dragKey,
          drag.element.track,
          drag.insertRow!,
          deps,
          coalesceKey,
        ),
    }),
    deps,
  ).catch(() => undefined);
}

/**
 * Commit the timeline lane move that MIRRORS a canvas z-order menu action
 * (resolveZMirrorLaneMove's non-null result). Same machinery as a lane drag:
 *
 * - kind "move": persistMoveEdits with `{start: element.start, track: displayTrack}`
 *   + `persistTrack` — identical shape to commitDraggedClipMove's lane-change
 *   branch (optimistic store update, authoredTrack mirror, rollback on failure).
 * - kind "insert": buildTrackInsertEdits — the SAME renumber core commitTrackInsert
 *   uses — then the same atomic persist.
 *
 * Deliberately NO syncStackingForEdit here: the z values were just set by the
 * user's menu action, and the lane→z sync would recompute (and fight) them. The
 * mirror caller also omits `readZIndex`/`onStackingPatches` from `deps`, so even
 * a future call into the sync would no-op (double protection; see
 * useCanvasZOrderTimelineMirror).
 *
 * `coalesceKey` MUST be the z persist's key (`z-reorder:<action>:<ids>:g<seq>`)
 * so editHistory folds the z write and this track write into ONE undo entry.
 *
 * Resolves `true` once the move persisted, `false` on rollback / refused insert.
 */
export function commitZMirrorLaneMove(
  element: TimelineElement,
  move: NonNullable<ZMirrorLaneMove>,
  deps: DragCommitDeps,
  coalesceKey: string,
): Promise<boolean> {
  if (move.kind === "move") {
    const edit: TimelineMoveEdit = {
      element,
      updates: { start: element.start, track: move.displayTrack },
      persistTrack: move.persistTrack,
    };
    return refreshAfterDurableLaneMove(
      persistMoveEdits([edit], deps, coalesceKey, "lane-reorder"),
      deps,
    );
  }
  const built = buildTrackInsertEdits(element, element.start, move.insertRow, null, deps);
  if (!built || built.edits.length === 0) return Promise.resolve(false);
  return refreshAfterDurableLaneMove(
    persistMoveEdits(built.edits, deps, coalesceKey, "track-insert"),
    deps,
  );
}

/**
 * Compute + apply z-index patches for the edited clip(s) after a DELIBERATE
 * vertical lane change. Projects the drop-intent element set (`candidate`: the
 * dragged clip at its new / fractional-insert lane, others at their current tracks)
 * onto StackingElement using the caller-supplied live z-index reader, then
 * delegates to computeStackingPatches — the moved clip alone rises (moved up) or
 * sinks (moved down) past the clips it time-overlaps. No-op unless both z-sync
 * deps are present, and never when the gesture aimed at the clip's OWN current
 * lane (`aimedLane === currentLane` — not a relocation).
 */
function syncStackingForEdit(
  candidate: TimelineElement[],
  dragKey: string,
  currentLane: number,
  aimedLane: number,
  deps: DragCommitDeps,
  coalesceKey?: string,
): Promise<void> {
  const { readZIndex, onStackingPatches } = deps;
  if (!readZIndex || !onStackingPatches) return Promise.resolve();

  // Aiming at the clip's OWN current display lane is not a relocation — never
  // touch z (guards the pure-time-move invariant even if a spurious topology call
  // slips through). Every real lane-realization drop aims at a DIFFERENT lane.
  if (aimedLane === currentLane) return Promise.resolve();

  // Discovery order is DOM order, which breaks equal-z ties.
  const stackingEls = candidate.map((el, domIndex) => ({
    key: keyOf(el),
    start: el.start,
    duration: el.duration,
    track: el.track,
    zIndex: readZIndex(el),
    isAudio: classifyZone(el) === "audio",
    sourceFile: el.sourceFile,
    domIndex,
    stackingContextId: el.stackingContextId ?? null,
  }));

  const patches = computeStackingPatches(
    stackingEls,
    [dragKey],
    aimedLane < currentLane ? "up" : "down",
  );
  if (patches.length === 0) return Promise.resolve();
  return Promise.resolve(onStackingPatches(patches, coalesceKey)).then(() => undefined);
}
