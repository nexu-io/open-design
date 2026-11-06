import {
  useCallback,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { matchesKey } from "./studioShortcuts";
import { clipToTweenPercentage } from "../../components/editor/KeyframeNavigation";
import { progressAtTime, runEaseOf, timeAtProgress } from "../../utils/gsapKeyframeEases";
import {
  KEYFRAME_DRAG_THRESHOLD_PX,
  previewClipPct,
  resolveKeyframeDrag,
} from "../../components/editor/keyframeDrag";
import { trackStudioSegmentEaseEdit } from "../../telemetry/events";
import type { AnimationKeyframeTarget } from "../../hooks/gsapTweenSynth";
import type { TimelineElement, KeyframeCacheEntry } from "../store/playerStore";
import { usePlayerStore } from "../store/playerStore";
import type { KeyframeDiamondContextMenuState } from "./KeyframeDiamondContextMenu";
import {
  applyTimelineHorizontalAutoScrollStep,
  resolveTimelineAutoScrollLoopAction,
} from "./timelineEditing";
import {
  timelineKeyframeSelectionKey,
  type TimelineKeyframeTarget,
} from "./timelineKeyframeIdentity";

interface TimelineRetimeKeyframe {
  percentage: number;
  tweenPercentage?: number;
  propertyGroup?: string;
  animationId?: string;
  collidingAnimationTargets?: AnimationKeyframeTarget[];
}

interface TimelineKeyframeRetimeInput {
  event: ReactPointerEvent<HTMLElement>;
  elementId: string;
  keyframeKey: string;
  target: TimelineKeyframeTarget;
  keyframes: readonly TimelineRetimeKeyframe[];
  clipWidthPx: number;
  draggedIndex: number;
  sortedClipPercentages: readonly number[];
  onMove: (target: TimelineKeyframeTarget, toClipPercentage: number) => Promise<boolean>;
  onSelect: (target: TimelineKeyframeTarget, additive: boolean) => void;
  suppressNextClick: () => void;
  /**
   * Selection key of a cache keyframe, used to retire a pending entry once the
   * authoritative cache reflects THAT keyframe at its destination. Without it a
   * bare "some keyframe is near that %" test retires the entry whenever an
   * unrelated sibling happens to sit there, which is easy to hit on an evenly
   * spaced row.
   */
  keyframeKeyOf: (keyframe: TimelineRetimeKeyframe) => string;
}

interface PendingTimelineKeyframeRetime {
  elementId: string;
  clipPercentage: number;
  tweenPercentage: number;
  destinationKeyframeKey: string;
  sessionEpoch: number;
}

interface TimelineKeyframeRetimePreview {
  keyframeKey: string;
  clipPercentage: number;
}

interface TimelineKeyframeRetimeActor extends TimelineKeyframeRetimeInput {
  phase: "active" | "committing" | "cancelled" | "complete";
  pointerId: number | null;
  pointerDownX: number;
  lastClientX: number;
  lastClientY: number;
  originScrollLeft: number;
  fromClipPercentage: number;
  moved: boolean;
  sessionEpoch: number;
  sourceWasPresent: boolean;
  scrollRaf: number;
  unsubscribeStore: (() => void) | null;
  teardownListeners: (() => void) | null;
}

interface TimelineKeyframeRetimeCoordinator {
  actor: TimelineKeyframeRetimeActor | null;
  pending: Map<string, PendingTimelineKeyframeRetime>;
  preview: TimelineKeyframeRetimePreview | null;
  previewListeners: Set<(preview: TimelineKeyframeRetimePreview | null) => void>;
  /**
   * The most recent retime dispatched through this viewport, whichever diamond
   * it came from. Selection is viewport-wide, so "is my revert still relevant"
   * is a viewport-wide question, not a per-keyframe one.
   */
  latest: PendingTimelineKeyframeRetime | null;
  cancelActive: () => void;
}

type TimelineRetimePointerEvent = Pick<
  PointerEvent,
  "clientX" | "clientY" | "pointerId" | "shiftKey"
>;

const keyframeRetimeCoordinators = new WeakMap<EventTarget, TimelineKeyframeRetimeCoordinator>();

function getRetimeOwner(target: HTMLElement): EventTarget {
  return target.closest<HTMLElement>("[data-timeline-scroll-viewport]") ?? target.ownerDocument;
}

function getRetimeCoordinator(owner: EventTarget): TimelineKeyframeRetimeCoordinator {
  const existing = keyframeRetimeCoordinators.get(owner);
  if (existing) return existing;
  const coordinator: TimelineKeyframeRetimeCoordinator = {
    actor: null,
    pending: new Map(),
    preview: null,
    previewListeners: new Set(),
    latest: null,
    cancelActive: () => {},
  };
  keyframeRetimeCoordinators.set(owner, coordinator);
  return coordinator;
}

function stablePointerId(pointerId: number): number | null {
  return Number.isFinite(pointerId) ? pointerId : null;
}

/**
 * The retime destinations already dispatched from `source`'s viewport but not
 * yet reflected in the keyframe cache. A renderer clamping a drag against its
 * neighbours has to compose these in, or a second drag can cross a neighbour
 * that already moved past it.
 */
export function readPendingTimelineKeyframeRetimes(
  source: HTMLElement | null | undefined,
): ReadonlyMap<string, { clipPercentage: number; tweenPercentage: number }> {
  if (!source) return EMPTY_PENDING_RETIMES;
  return keyframeRetimeCoordinators.get(getRetimeOwner(source))?.pending ?? EMPTY_PENDING_RETIMES;
}

const EMPTY_PENDING_RETIMES: ReadonlyMap<
  string,
  { clipPercentage: number; tweenPercentage: number }
> = new Map();

function publishRetimePreview(
  coordinator: TimelineKeyframeRetimeCoordinator,
  preview: TimelineKeyframeRetimePreview | null,
): void {
  coordinator.preview = preview;
  for (const listener of coordinator.previewListeners) listener(preview);
}

export function subscribeTimelineKeyframeRetimePreview(
  source: HTMLElement,
  listener: (preview: TimelineKeyframeRetimePreview | null) => void,
): () => void {
  const coordinator = getRetimeCoordinator(getRetimeOwner(source));
  coordinator.previewListeners.add(listener);
  listener(coordinator.preview);
  return () => coordinator.previewListeners.delete(listener);
}

function retimedRunEase(actor: TimelineKeyframeRetimeActor): string | undefined {
  const id = actor.target.animationId;
  if (id === undefined) return undefined;
  const { gsapAnimations } = usePlayerStore.getState();
  const animations = gsapAnimations.get(actor.elementId) ?? [...gsapAnimations.values()].flat();
  const animation = animations.find((candidate) => candidate.id === id);
  return animation ? runEaseOf(animation) : undefined;
}

function resolveRetimeTweenPercentage(
  actor: TimelineKeyframeRetimeActor,
  toClipPercentage: number,
): number {
  const animationKeyframes =
    actor.target.animationId === undefined
      ? actor.keyframes
      : actor.keyframes.filter((keyframe) => keyframe.animationId === actor.target.animationId);
  const tweenPercentages = animationKeyframes
    .map((keyframe) => keyframe.tweenPercentage)
    .filter((value): value is number => typeof value === "number");
  const runEase = retimedRunEase(actor);
  const timed = animationKeyframes.map((keyframe) =>
    keyframe.tweenPercentage === undefined
      ? keyframe
      : { ...keyframe, tweenPercentage: timeAtProgress(runEase, keyframe.tweenPercentage) },
  );
  const mapped = progressAtTime(runEase, clipToTweenPercentage(timed, toClipPercentage));
  if (tweenPercentages.length === 0) return mapped;
  return Math.max(Math.min(...tweenPercentages), Math.min(Math.max(...tweenPercentages), mapped));
}

export interface TimelineKeyframeRetimeHandle {
  update: (event: ReactPointerEvent<HTMLElement>) => void;
  commit: (event: ReactPointerEvent<HTMLElement>) => void;
  cancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * Starts a keyframe retime on the stable timeline viewport. The row/button is
 * only an entry point: window listeners own the gesture through virtualization.
 */
export function cancelTimelineKeyframeRetime(viewport: HTMLElement | null): void {
  if (viewport) keyframeRetimeCoordinators.get(viewport)?.cancelActive();
}

export function beginTimelineKeyframeRetime(
  input: TimelineKeyframeRetimeInput,
): TimelineKeyframeRetimeHandle {
  const source = input.event.currentTarget;
  const owner = getRetimeOwner(source);
  const viewport = owner instanceof HTMLElement ? owner : null;
  const coordinator = getRetimeCoordinator(owner);
  const sessionEpoch = usePlayerStore.getState().timelineSessionEpoch;

  const cancel = (actor: TimelineKeyframeRetimeActor) => {
    if (actor.phase !== "active") return;
    actor.phase = "cancelled";
    publishRetimePreview(coordinator, null);
    if (actor.scrollRaf) cancelAnimationFrame(actor.scrollRaf);
    actor.unsubscribeStore?.();
    actor.teardownListeners?.();
    if (viewport && actor.pointerId !== null) {
      try {
        viewport.releasePointerCapture(actor.pointerId);
      } catch {
        // Window listeners remain the native fallback when capture is unavailable.
      }
    }
    if (coordinator.actor === actor) {
      coordinator.actor = null;
    }
    actor.phase = "complete";
  };

  if (coordinator.actor) cancel(coordinator.actor);

  for (const [key, pending] of coordinator.pending) {
    if (pending.sessionEpoch !== sessionEpoch) coordinator.pending.delete(key);
  }

  for (const [key, pending] of coordinator.pending) {
    // Tolerance, not equality: cache writers round clip %s, so an exact check
    // would leak an entry after every successful retime.
    if (
      pending.elementId === input.elementId &&
      input.keyframes.some(
        (keyframe) =>
          input.keyframeKeyOf(keyframe) === pending.destinationKeyframeKey &&
          Math.abs(keyframe.percentage - pending.clipPercentage) < 0.2,
      )
    ) {
      coordinator.pending.delete(key);
    }
  }

  const pending = coordinator.pending.get(input.keyframeKey);
  const actor: TimelineKeyframeRetimeActor = {
    ...input,
    phase: "active",
    pointerId: stablePointerId(input.event.pointerId),
    pointerDownX: input.event.clientX,
    lastClientX: input.event.clientX,
    lastClientY: input.event.clientY,
    originScrollLeft: viewport?.scrollLeft ?? 0,
    fromClipPercentage: pending?.clipPercentage ?? input.target.percentage,
    moved: false,
    sessionEpoch,
    sourceWasPresent: usePlayerStore
      .getState()
      .elements.some((element) => (element.key ?? element.id) === input.elementId),
    scrollRaf: 0,
    unsubscribeStore: null,
    teardownListeners: null,
  };
  coordinator.actor = actor;
  coordinator.cancelActive = () => cancel(actor);

  const matchesPointer = (event: TimelineRetimePointerEvent) =>
    actor.pointerId === null || event.pointerId === actor.pointerId;
  const pointerXWithScroll = () =>
    actor.lastClientX + (viewport?.scrollLeft ?? 0) - actor.originScrollLeft;
  const publishPreview = () => {
    publishRetimePreview(coordinator, {
      keyframeKey: actor.keyframeKey,
      clipPercentage: previewClipPct({
        pointerDownX: actor.pointerDownX,
        pointerMoveX: pointerXWithScroll(),
        clipWidthPx: actor.clipWidthPx,
        draggedClipPct: actor.fromClipPercentage,
        draggedIndex: actor.draggedIndex,
        sortedClipPcts: actor.sortedClipPercentages,
      }),
    });
  };
  const stopAutoScroll = () => {
    if (actor.scrollRaf) cancelAnimationFrame(actor.scrollRaf);
    actor.scrollRaf = 0;
  };
  const stepAutoScroll = () => {
    actor.scrollRaf = 0;
    if (
      actor.phase !== "active" ||
      !viewport ||
      !applyTimelineHorizontalAutoScrollStep(viewport, actor.lastClientX)
    ) {
      return;
    }
    publishPreview();
    actor.scrollRaf = requestAnimationFrame(stepAutoScroll);
  };
  const syncAutoScroll = () => {
    if (!viewport || !actor.moved) return;
    const action = resolveTimelineAutoScrollLoopAction(
      viewport,
      actor.lastClientX,
      actor.lastClientY,
      actor.scrollRaf !== 0,
    );
    if (action === "stop") stopAutoScroll();
    else if (action === "start") actor.scrollRaf = requestAnimationFrame(stepAutoScroll);
  };
  const teardown = () => {
    stopAutoScroll();
    actor.unsubscribeStore?.();
    actor.unsubscribeStore = null;
    actor.teardownListeners?.();
    actor.teardownListeners = null;
  };
  const releaseCapture = () => {
    if (!viewport || actor.pointerId === null) return;
    try {
      viewport.releasePointerCapture(actor.pointerId);
    } catch {
      // Capture may already have been released by the browser.
    }
  };

  const claimActorForCommit = (event: TimelineRetimePointerEvent): boolean => {
    if (actor.phase !== "active" || !matchesPointer(event)) return false;
    if (actor.sessionEpoch !== usePlayerStore.getState().timelineSessionEpoch) {
      cancel(actor);
      return false;
    }
    actor.phase = "committing";
    actor.lastClientX = event.clientX;
    actor.lastClientY = event.clientY;
    teardown();
    releaseCapture();
    publishRetimePreview(coordinator, null);
    if (coordinator.actor === actor) {
      coordinator.actor = null;
    }
    actor.suppressNextClick();
    return true;
  };

  const commitMove = (toClipPercentage: number) => {
    const newTweenPercentage = resolveRetimeTweenPercentage(actor, toClipPercentage);
    const pendingBefore = coordinator.pending.get(actor.keyframeKey);
    const fromTarget = pendingBefore
      ? {
          ...actor.target,
          percentage: pendingBefore.clipPercentage,
          tweenPercentage: pendingBefore.tweenPercentage,
        }
      : actor.target;
    const nextPending = {
      elementId: actor.elementId,
      clipPercentage: toClipPercentage,
      tweenPercentage: newTweenPercentage,
      destinationKeyframeKey: timelineKeyframeSelectionKey(actor.elementId, {
        ...actor.target,
        percentage: toClipPercentage,
        tweenPercentage: newTweenPercentage,
      }),
      sessionEpoch: actor.sessionEpoch,
    };
    coordinator.pending.set(actor.keyframeKey, nextPending);
    coordinator.latest = nextPending;
    const clearPending = () => {
      if (coordinator.pending.get(actor.keyframeKey) === nextPending) {
        coordinator.pending.delete(actor.keyframeKey);
      }
    };
    // A rejected drop (the destination time is already occupied) snaps the
    // diamond back to its source position, so the pending entry AND the
    // selection have to revert with it: parking on the ghost drop position
    // strands the playhead + selection on a keyframe that is not there.
    const revertRetime = () => {
      // Only the newest gesture owns the selection. A rejected first drag
      // whose commit settles after a second one started would otherwise park
      // the selection back on ITS source keyframe, undoing a retime the user
      // has already made and moving the playhead with it.
      const isLatest = coordinator.latest === nextPending;
      clearPending();
      if (isLatest) actor.onSelect(fromTarget, false);
    };
    void actor.onMove(fromTarget, toClipPercentage).then((committed) => {
      if (!committed) revertRetime();
    }, revertRetime);
    actor.onSelect(
      {
        ...actor.target,
        percentage: toClipPercentage,
        tweenPercentage: newTweenPercentage,
      },
      false,
    );
  };

  const finishCommit = (event: TimelineRetimePointerEvent) => {
    if (!claimActorForCommit(event)) return;
    const result = resolveKeyframeDrag({
      pointerDownX: actor.pointerDownX,
      pointerUpX: pointerXWithScroll(),
      clipWidthPx: actor.clipWidthPx,
      draggedClipPct: actor.fromClipPercentage,
      draggedIndex: actor.draggedIndex,
      sortedClipPcts: actor.sortedClipPercentages,
    });
    if (result.kind === "move" && result.toClipPct !== undefined) {
      commitMove(result.toClipPct);
    } else {
      actor.onSelect(actor.target, event.shiftKey);
    }
    actor.phase = "complete";
  };
  const onPointerMove = (event: TimelineRetimePointerEvent) => {
    if (actor.phase !== "active" || !matchesPointer(event)) return;
    actor.lastClientX = event.clientX;
    actor.lastClientY = event.clientY;
    if (
      !actor.moved &&
      Math.abs(pointerXWithScroll() - actor.pointerDownX) >= KEYFRAME_DRAG_THRESHOLD_PX
    ) {
      actor.moved = true;
    }
    if (actor.moved) publishPreview();
    syncAutoScroll();
  };
  const onPointerUp = (event: TimelineRetimePointerEvent) => finishCommit(event);
  const onPointerCancel = (event: TimelineRetimePointerEvent) => {
    if (actor.phase === "active" && matchesPointer(event)) cancel(actor);
  };
  const onLostPointerCapture = (event: PointerEvent) => {
    if (actor.phase === "active" && matchesPointer(event)) cancel(actor);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (matchesKey(event, "cancel")) cancel(actor);
  };

  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerCancel, true);
  window.addEventListener("keydown", onKeyDown);
  viewport?.addEventListener("lostpointercapture", onLostPointerCapture);
  actor.teardownListeners = () => {
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onPointerCancel, true);
    window.removeEventListener("keydown", onKeyDown);
    viewport?.removeEventListener("lostpointercapture", onLostPointerCapture);
  };
  actor.unsubscribeStore = usePlayerStore.subscribe((state) => {
    const sourceStillPresent = state.elements.some(
      (element) => (element.key ?? element.id) === actor.elementId,
    );
    if (state.timelineSessionEpoch !== actor.sessionEpoch) {
      coordinator.pending.clear();
      coordinator.latest = null;
      cancel(actor);
    } else if (actor.sourceWasPresent && !sourceStillPresent) {
      for (const [key, pending] of coordinator.pending) {
        if (pending.elementId === actor.elementId) coordinator.pending.delete(key);
      }
      if (coordinator.latest?.elementId === actor.elementId) coordinator.latest = null;
      cancel(actor);
    }
  });

  if (viewport && actor.pointerId !== null) {
    try {
      viewport.setPointerCapture(actor.pointerId);
    } catch {
      // Window listeners are the native fallback when capture is unavailable.
    }
  }
  return { update: onPointerMove, commit: onPointerUp, cancel: onPointerCancel };
}

interface UseTimelineKeyframeHandlersInput {
  expandedElements: TimelineElement[];
  keyframeCache: Map<string, KeyframeCacheEntry>;
  onSelectElement?: (element: TimelineElement | null) => void;
  onSeek?: (time: number) => void;
  setSelectedElementId: (id: string | null) => void;
  setKfContextMenu: (state: KeyframeDiamondContextMenuState | null) => void;
  toggleSelectedKeyframe: (key: string) => void;
}

export function useTimelineKeyframeHandlers({
  expandedElements,
  keyframeCache,
  onSelectElement,
  onSeek,
  setSelectedElementId,
  setKfContextMenu,
  toggleSelectedKeyframe,
}: UseTimelineKeyframeHandlersInput) {
  const onClickKeyframe = useCallback(
    (el: TimelineElement, target: TimelineKeyframeTarget, options?: { seek?: boolean }) => {
      usePlayerStore.getState().clearSelectedKeyframes();
      const elKey = el.key ?? el.id;
      setSelectedElementId(elKey);
      onSelectElement?.(el);
      toggleSelectedKeyframe(timelineKeyframeSelectionKey(elKey, target));
      // Clicking a diamond seeks the playhead to it; selecting a segment to edit
      // its ease (options.seek === false) must NOT move the playhead.
      if (options?.seek !== false) {
        onSeek?.(el.start + (target.percentage / 100) * el.duration);
      }
      const kfData = keyframeCache.get(elKey);
      const kf = kfData?.keyframes.find(
        (item) => Math.abs(item.percentage - target.percentage) < 0.5,
      );
      usePlayerStore
        .getState()
        .setActiveKeyframePct(target.tweenPercentage ?? kf?.tweenPercentage ?? null);
    },
    [keyframeCache, onSeek, onSelectElement, setSelectedElementId, toggleSelectedKeyframe],
  );

  const onShiftClickKeyframe = useCallback(
    (elId: string, target: TimelineKeyframeTarget) => {
      toggleSelectedKeyframe(timelineKeyframeSelectionKey(elId, target));
    },
    [toggleSelectedKeyframe],
  );

  const onSelectSegment = useCallback(
    (elId: string, target: TimelineKeyframeTarget) => {
      const el = expandedElements.find((item) => (item.key ?? item.id) === elId);
      if (!el) return;
      onClickKeyframe(el, target, { seek: false });
      if (target.animationId !== undefined && target.tweenPercentage !== undefined) {
        usePlayerStore.getState().setFocusedEaseSegment({
          animationId: target.animationId,
          collidingAnimationTargets: target.collidingAnimationTargets,
          tweenPercentage: target.tweenPercentage,
          elementId: elId,
        });
        trackStudioSegmentEaseEdit({ action: "open" });
      }
    },
    [expandedElements, onClickKeyframe],
  );

  const onContextMenuKeyframe = useCallback(
    (e: ReactMouseEvent, elId: string, target: TimelineKeyframeTarget) => {
      const el = expandedElements.find((item) => (item.key ?? item.id) === elId);
      if (!el) return;
      setSelectedElementId(elId);
      onSelectElement?.(el);
      const kfData = keyframeCache.get(elId);
      const kf = kfData?.keyframes.find(
        (item) => Math.abs(item.percentage - target.percentage) < 0.2,
      );
      setKfContextMenu({
        x: e.clientX + 4,
        y: e.clientY + 2,
        sessionEpoch: usePlayerStore.getState().timelineSessionEpoch,
        element: el,
        elementId: elId,
        percentage: target.percentage,
        tweenPercentage: target.tweenPercentage ?? kf?.tweenPercentage,
        propertyGroup: target.propertyGroup,
        animationId: target.animationId,
        currentEase: kf?.ease ?? kfData?.ease,
      });
    },
    [expandedElements, keyframeCache, onSelectElement, setKfContextMenu, setSelectedElementId],
  );

  return {
    onClickKeyframe,
    onSelectSegment,
    onShiftClickKeyframe,
    onContextMenuKeyframe,
  };
}
