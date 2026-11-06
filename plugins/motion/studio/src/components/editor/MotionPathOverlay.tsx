import { scopedElementKey } from "../../hooks/gsapKeyframeCacheHelpers";
import { memo, useEffect, useRef, useState, type RefObject } from "react";
import type { DomEditSelection } from "./domEditing";
import { useDomEditContext } from "../../contexts/DomEditContext";
import { useStudioShellContextOptional } from "../../contexts/StudioContext";
import { useGsapInteractionFailureTelemetry } from "../../hooks/useGsapInteractionFailureTelemetry";
import { usePlayerStore } from "../../player/store/playerStore";
import { useLivePreviewIframe } from "../../player/store/previewIframeStore";
import { parkPlayheadOnKeyframe } from "../../hooks/gsapDragCommit";
import { nearestPointOnPath, nodeCentre, type MotionNodeRef } from "./motionPathGeometry";
import { editableAnimationId, selectorFor } from "./motionPathSelection";
import { controlForNode, controlUnder, pressControl } from "./motionPathLayerNode";
import { readGsapPositionFromIframe } from "../../hooks/gsapPositionDetection";
import { isHtmlElement } from "@hyperframes/core/runtime/dom-realm";
import { ACCENT, MotionPathLine, MotionPathNode } from "./MotionPathNode";
import {
  KeyframeDiamondContextMenu,
  type KeyframeDiamondContextMenuState,
} from "../../player/components/KeyframeDiamondContextMenu";
import type { TimelineKeyframeTarget } from "../../player/components/timelineKeyframeIdentity";
import {
  commitAddKeyframe,
  commitAddWaypoint,
  commitCreatePath,
  commitNodeDrop,
  commitRemoveWaypoint,
  nodeDropLabel,
} from "./motionPathCommit";
import { elementHome } from "./motionPathHome";
import { hasMotionPathPlugin, transformWDivisor, useMotionPathData } from "./useMotionPathData";

interface MotionPathOverlayProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  selection: DomEditSelection | null;
  compositionSize: { width: number; height: number } | null;
  isPlaying: boolean;
}

type Draft = { index: number; x: number; y: number };
type DragState = {
  index: number;
  startX: number;
  startY: number;
  initX: number;
  initY: number;
  scale: number;
  pScale: number;
  ref: MotionNodeRef;
};

/**
 * Tween-% for a stop inserted at fraction `t` along the segment between two
 * nodes. null when either end is not a keyframe (arc waypoints carry no %).
 */
function interpolatedKeyframePct(
  a: MotionNodeRef | undefined,
  b: MotionNodeRef | undefined,
  t: number,
): number | null {
  if (a?.type !== "keyframe" || b?.type !== "keyframe") return null;
  return Math.round((a.pct + (b.pct - a.pct) * t) * 1000) / 1000;
}

const NODE_PX = 6; // node radius in screen pixels (kept constant across zoom)
// Click-vs-drag cutoff in SCREEN pixels. Below this the pointer-up is a click
// (select the keyframe); at or above it the gesture commits a move. Screen-space
// (not composition px) so it behaves identically at any zoom.
const DRAG_THRESHOLD_PX = 3;
const noToast = () => {};

/**
 * Draws the selected element's GSAP motion path over the canvas — a dashed
 * polyline through its x/y keyframes (or motionPath waypoints) with a draggable
 * node at each. Dragging an x/y node rewrites the keyframe; dragging a waypoint
 * rewrites the motionPath point; both commit to source (undoable). Renders in
 * declared composition coordinates so the path doesn't drift under GSAP
 * transforms. Read-only (no drag) while playing or when the tween isn't
 * statically editable. Nothing renders when the selection has no positional
 * motion.
 */
// fallow-ignore-next-line complexity
export const MotionPathOverlay = memo(function MotionPathOverlay({
  iframeRef,
  selection,
  compositionSize,
  isPlaying,
}: MotionPathOverlayProps) {
  const {
    commitMutation,
    selectedGsapAnimations,
    handleGsapRemoveKeyframe,
    handleGsapRemoveAllKeyframes,
    handleGsapMoveKeyframeToPlayhead,
  } = useDomEditContext();
  const shell = useStudioShellContextOptional();
  const reportFailure = useGsapInteractionFailureTelemetry(
    shell?.activeCompPath ?? null,
    shell?.showToast ?? noToast,
  );
  const { rect, geometry, geometryResolved, visibleInPreview, home, pScale } = useMotionPathData(
    iframeRef,
    selectorFor(selection),
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; segIndex: number } | null>(null);
  const [lineCursor, setLineCursor] = useState("copy");
  const [hoverNode, setHoverNode] = useState<number | null>(null);
  // Right-click context menu on a path node — same delete actions as the
  // timeline keyframe diamond. The node it was opened on rides along, because
  // which entries apply depends on whether it is a keyframe or a waypoint.
  const [kfMenu, setKfMenu] = useState<{
    state: KeyframeDiamondContextMenuState;
    ref: MotionNodeRef;
  } | null>(null);
  // The keyframe % selected by clicking its node — highlighted, and the next drag
  // modifies it rather than adding a keyframe.
  const activeKeyframePct = usePlayerStore((s) => s.activeKeyframePct);
  const timelineElement = usePlayerStore((state) => {
    if (!selection) return undefined;
    const sourceScopedId = scopedElementKey(selection);
    return state.elements.find(
      (element) => (element.key ?? element.id) === sourceScopedId || element.id === selection.id,
    );
  });
  // Set-destination mode is armed from the preview toolbar (replaces the old
  // double-click-on-canvas UX). See createMode effects below.
  const armed = usePlayerStore((s) => s.motionPathArmed);
  const setMotionPathArmed = usePlayerStore((s) => s.setMotionPathArmed);
  const setMotionPathCreateAvailable = usePlayerStore((s) => s.setMotionPathCreateAvailable);
  const dragRef = useRef<DragState | null>(null);
  // Park-on-click is debounced so a double-click cancels the seek (see onUp).
  const parkTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The animation id whose path is currently editable. Computed at hook level (not
  // just in render, after the early returns) so the park-timer cleanup can key on
  // it: a pending park seek belongs to the OLD animation, so firing it after the
  // active animation changed would jump the playhead onto a stale keyframe.
  const animId = editableAnimationId(
    selectedGsapAnimations ?? [],
    geometry?.kind ?? "linear",
    selection,
  );
  // Clear the debounced park timer on unmount AND whenever the active animation id
  // changes — not unmount-only, or a queued seek from the previous selection still
  // fires against the new one.
  useEffect(() => () => clearTimeout(parkTimerRef.current), [animId]);

  // Create mode: a selected element with no positional motion can be given a new
  // motionPath. Gated on `geometryResolved` so a fresh selection never counts as
  // "no path" before the first runtime read confirms it (see useMotionPathData).
  const createMode = geometryResolved && !geometry && Boolean(selection?.element) && !isPlaying;
  const createSelector = createMode ? selectorFor(selection) : null;
  const compW = compositionSize?.width ?? null;
  // No one-element selector means the path could only be authored onto the
  // element's class siblings, so the toolbar toggle stays hidden instead of
  // arming a press that the effect below would silently drop.
  const livePreviewIframe = useLivePreviewIframe();
  const canCreate = createMode && !!createSelector && hasMotionPathPlugin(livePreviewIframe);

  // Publish whether the selected element can take a path so the preview toolbar
  // shows its "set destination" toggle. Drops to false when this overlay unmounts
  // or the context changes, so the button never lingers for a stale selection.
  useEffect(() => {
    setMotionPathCreateAvailable(Boolean(canCreate));
    return () => setMotionPathCreateAvailable(false);
  }, [canCreate, setMotionPathCreateAvailable]);

  // Disarm when set-destination is no longer possible (element gains a path, gets
  // deselected, or playback starts) so a toggle left on can't fire later.
  useEffect(() => {
    if (armed && !canCreate) setMotionPathArmed(false);
  }, [armed, canCreate, setMotionPathArmed]);

  // While armed, the next canvas press sets the destination (replaces the old
  // double-click). Scoped to the preview pan-surface in the CAPTURE phase, on
  // pointerdown, so it fires before the selection/drag handler underneath — a
  // press on empty canvas would otherwise deselect (and disarm) before a later
  // click could land. stopPropagation keeps that handler from also running.
  // fallow-ignore-next-line complexity
  useEffect(() => {
    if (!armed || !createSelector || !compW) return;
    const surface =
      (iframeRef.current?.ownerDocument?.querySelector(
        "[data-preview-pan-surface]",
      ) as HTMLElement | null) ?? null;
    if (!surface) return;
    const prevCursor = surface.style.cursor;
    surface.style.cursor = "crosshair";
    // fallow-ignore-next-line complexity
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // primary press only
      const frame = iframeRef.current;
      if (!frame || !hasMotionPathPlugin(frame)) return;
      const r = frame.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        return;
      }
      // Resolve the element LIVE from the current iframe document — the selected
      // node may be detached after a soft-reload, which would skew home.
      const live = frame.contentDocument?.querySelector(createSelector);
      if (!isHtmlElement(live)) return;
      e.stopPropagation();
      e.preventDefault();
      const sc = r.width / compW;
      const elHome = elementHome(live);
      // De-magnify: the click lands on the projected (1/m44-magnified) path, so
      // divide the home-relative offset by the perspective factor to recover the
      // stored composition offset (inverse of the `* pScale` applied at draw).
      const ps = 1 / transformWDivisor(live);
      const px = Math.round(((e.clientX - r.left) / sc - elHome.x) / ps);
      const py = Math.round(((e.clientY - r.top) / sc - elHome.y) / ps);
      const t = Math.round(usePlayerStore.getState().currentTime * 100) / 100;
      void commitCreatePath(createSelector, t, px, py, commitMutation);
      setMotionPathArmed(false);
    };
    surface.addEventListener("pointerdown", onDown, true);
    return () => {
      surface.removeEventListener("pointerdown", onDown, true);
      surface.style.cursor = prevCursor;
    };
  }, [armed, createSelector, compW, iframeRef, commitMutation, setMotionPathArmed]);

  if (!rect || rect.width <= 0 || !compositionSize || compositionSize.width <= 0) return null;
  // Hide the whole overlay (path + create hint) when the element isn't painted —
  // same "what you see in the preview" rule as the selection box.
  if (!visibleInPreview) return null;
  // No live anchor (element not in the current document) → can't place the path.
  if (!home) return null;

  if (!geometry) {
    // Create mode draws nothing by default — the destination is set via the
    // preview toolbar's "set destination" toggle (no text sprawled over the
    // canvas). Only while armed do we show a faint ring at the element as a
    // "click to place" cue (the surface cursor is also crosshair, set above).
    if (!armed || !canCreate) return null;
    const sc = rect.width / compositionSize.width;
    const hr = (NODE_PX / sc) * 1.6;
    return (
      <svg
        className="pointer-events-none absolute z-40"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          // Don't clip the ring that extends past the canvas into the gray margin
          // — only the preview viewport (`[data-preview-pan-surface]`,
          // overflow-hidden) clips, so overlays reach the edge but never the panels.
          overflow: "visible",
        }}
        viewBox={`0 0 ${compositionSize.width} ${compositionSize.height}`}
      >
        <circle
          cx={home.x}
          cy={home.y}
          r={hr}
          fill="none"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
          style={{ stroke: ACCENT }}
          opacity={0.85}
        />
      </svg>
    );
  }

  const scale = rect.width / compositionSize.width;
  const nodeR = NODE_PX / scale;
  const interactive = Boolean(animId) && !isPlaying;
  // The × "quick remove" badge applies to non-cubic motionPath arcs only (cubic
  // anchors carry control points we don't synthesize; keyframe paths remove via
  // the right-click menu instead).
  const structural = geometry.kind === "arc" && interactive;
  const removable = structural && geometry.nodes.length > 2;
  // Click-on-path to insert a node works for both kinds: a motionPath waypoint
  // (arc paths, including cubic — GSAP recomputes curves around the new point),
  // or an x/y keyframe (linear paths) at the projected tween-%.
  const addable = interactive;

  const nodes = draft
    ? geometry.nodes.map((n, i) => (i === draft.index ? { ...n, x: draft.x, y: draft.y } : n))
    : geometry.nodes;
  // ax/ay = absolute composition position (home + offset) for drawing; n.x/n.y
  // stay offsets so the drag commit writes the right tween values.
  // Magnify the animated offsets by the element's perspective factor (1/m44, via
  // pScale) so the path tracks the *projected* element. `home` is the projection
  // pivot (transform-origin), so it stays put; only the offsets foreshorten. 2D
  // elements have pScale = 1 (no change). Inverse (de-magnify) applied wherever a
  // pointer position is mapped back to a stored offset (create + node drag).
  const abs = nodes.map((n) => {
    const c = nodeCentre(n, home, pScale);
    return { ...n, ax: c.x, ay: c.y };
  });
  const points = abs.map((p) => `${p.ax},${p.ay}`).join(" ");
  const startAt = geometry.start && nodeCentre(geometry.start, home, pScale);
  // Map a VIEWPORT pointer to composition space. Use the iframe's LIVE viewport
  // rect, not `rect` — `rect.left/top` are stored pan-surface-relative (for the
  // absolute-positioned SVG), so subtracting them from a viewport clientX/Y would
  // offset the projection by the surface's gutter (panel/toolbar), and the add-
  // ghost wouldn't track the cursor. `scale` is unaffected (width is stored raw).
  const clientToComp = (e: React.PointerEvent) => {
    const vr = iframeRef.current?.getBoundingClientRect();
    const left = vr ? vr.left : rect.left;
    const top = vr ? vr.top : rect.top;
    return { x: (e.clientX - left) / scale, y: (e.clientY - top) / scale };
  };

  const onDown = (
    e: React.PointerEvent,
    index: number,
    x: number,
    y: number,
    ref: MotionNodeRef,
  ) => {
    if (!interactive) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    const live = readGsapPositionFromIframe(iframeRef.current, selectorFor(selection) ?? "");
    if (pressControl(e, controlForNode(e, abs[index]!, live))) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      index,
      startX: e.clientX,
      startY: e.clientY,
      initX: x,
      initY: y,
      scale,
      pScale,
      ref,
    };
    setDraft({ index, x, y });
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setDraft({
      index: d.index,
      x: d.initX + (e.clientX - d.startX) / d.scale / d.pScale,
      y: d.initY + (e.clientY - d.startY) / d.scale / d.pScale,
    });
  };
  // fallow-ignore-next-line complexity
  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDraft(null);
    if (!animId) return;
    const screenDx = e.clientX - d.startX;
    const screenDy = e.clientY - d.startY;
    const x = Math.round(d.initX + screenDx / d.scale / d.pScale);
    const y = Math.round(d.initY + screenDy / d.scale / d.pScale);
    // Click-vs-drag is decided in SCREEN space, not composition px: the old guard
    // compared rounded comp-px, which at high zoom (scale ≫ 1) swallowed real
    // multi-px screen drags whose sub-comp-px delta rounds to 0 → the node would
    // never move. A screen-distance threshold registers any genuine pointer drag
    // at any zoom; below it the gesture is a click (select + park the playhead).
    const movedScreenPx = Math.hypot(screenDx, screenDy);
    if (movedScreenPx < DRAG_THRESHOLD_PX) {
      // No drag → treat as a click: select this keyframe and park the playhead on
      // it. Selecting it makes the next drag MODIFY this keyframe (honored via
      // activeKeyframePct) instead of creating a new one.
      if (d.ref.type === "keyframe") {
        usePlayerStore.getState().setActiveKeyframePct(d.ref.pct);
        const ref = d.ref;
        // Debounce the playhead seek: a double-click cancels it (e.detail >= 2),
        // so only a lone single-click parks the playhead on the keyframe.
        clearTimeout(parkTimerRef.current);
        if (e.detail < 2) {
          parkTimerRef.current = setTimeout(() => {
            const anim = selectedGsapAnimations?.find((a) => a.id === animId);
            if (anim) parkPlayheadOnKeyframe(anim, ref.pct);
          }, 250);
        }
      }
      return; // no commit
    }
    // A real drag that still rounds to the same integer comp-px (sub-px move at
    // high zoom) would commit an identical value — a no-op undo entry. Skip the
    // commit, but don't treat it as a click either (the user did drag).
    if (x === Math.round(d.initX) && y === Math.round(d.initY)) return;
    const anim =
      d.ref.type === "keyframe" ? selectedGsapAnimations?.find((a) => a.id === animId) : undefined;
    const label = nodeDropLabel(d.ref);
    commitNodeDrop({
      ref: d.ref,
      at: { x, y },
      animId,
      anim,
      selection,
      iframe: iframeRef.current,
      commitMutation,
    }).catch((error: unknown) => reportFailure(error, selection, "drag", label));
    // Park on the edited keyframe, or a playhead before the tween hides the edit.
    if (d.ref.type === "keyframe" && anim) {
      parkPlayheadOnKeyframe(anim, d.ref.pct);
    }
  };

  // Ghost "add" affordance: project the cursor onto the path; click inserts.
  const onPathHover = (e: React.PointerEvent) => {
    const control = controlUnder(e);
    setLineCursor(control ? getComputedStyle(control).cursor : "copy");
    const c = clientToComp(e);
    const np = nearestPointOnPath(
      c.x,
      c.y,
      abs.map((p) => ({ x: p.ax, y: p.ay })),
    );
    setGhost(np && !control ? { x: np.x, y: np.y, segIndex: np.segIndex } : null);
  };
  const onPathDown = (e: React.PointerEvent) => {
    if (pressControl(e, controlUnder(e))) {
      e.stopPropagation();
      return;
    }
    if (!animId) return;
    // Compute the insertion point from the event directly so a click works
    // without (or faster than) a preceding hover.
    const c = clientToComp(e);
    const np = nearestPointOnPath(
      c.x,
      c.y,
      abs.map((p) => ({ x: p.ax, y: p.ay })),
    );
    if (!np) return;
    const [a, b] = [abs[np.segIndex]!, abs[np.segIndex + 1]!];
    const x = Math.round(a.x + np.t * (b.x - a.x));
    const y = Math.round(a.y + np.t * (b.y - a.y));
    if (geometry.kind === "arc") {
      e.stopPropagation();
      void commitAddWaypoint(animId, np.segIndex + 1, x, y, commitMutation);
    } else {
      // Linear keyframe path: interpolate the new stop's tween-% from the two
      // keyframes bounding the clicked segment, then insert it. Lands ON the
      // current line, so the dot doesn't jump — drag it after to bend the path.
      const pct = interpolatedKeyframePct(abs[np.segIndex]?.ref, abs[np.segIndex + 1]?.ref, np.t);
      if (pct === null) return;
      e.stopPropagation();
      void commitAddKeyframe(animId, pct, x, y, commitMutation);
    }
    setGhost(null);
  };
  const onRemove = (e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    if (!animId) return;
    setHoverNode(null);
    void commitRemoveWaypoint(animId, index, commitMutation);
  };

  const elementId = selection?.id ?? null;
  // Right-click any path node → the timeline's keyframe menu. Waypoints too, or the
  // browser's own context menu opens over the editor.
  const onNodeContextMenu = (e: React.MouseEvent, ref: MotionNodeRef) => {
    if (!animId || !elementId || !timelineElement) return;
    e.preventDefault();
    e.stopPropagation();
    setKfMenu({
      ref,
      state: {
        x: e.clientX,
        y: e.clientY,
        element: timelineElement,
        elementId,
        // A waypoint carries no percentage of its own: one tween-level ease owns
        // every segment, and its index is the identity the delete acts on. The
        // menu never reads this for a waypoint, because the only entry that
        // would (Move to Playhead) is hidden below.
        percentage: ref.type === "keyframe" ? ref.pct : 0,
        tweenPercentage: ref.type === "keyframe" ? ref.pct : 0,
      },
    });
  };
  const menuRef = kfMenu?.ref;
  // Deleting one node: by tween-% for a keyframe, by path index for a waypoint.
  // A waypoint delete is offered on the same condition as the hover x badge,
  // because removeMotionPathPointInScript refuses to drop an arc below two
  // anchors and the entry would silently do nothing.
  const onMenuDelete =
    menuRef === undefined || !animId
      ? undefined
      : menuRef.type === "keyframe"
        ? (_elId: string, keyframe: TimelineKeyframeTarget) => {
            handleGsapRemoveKeyframe(animId, keyframe.percentage);
          }
        : removable
          ? () => {
              void commitRemoveWaypoint(animId, menuRef.index, commitMutation);
            }
          : undefined;

  return (
    <>
      <svg
        className="pointer-events-none absolute z-40"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          // Don't clip nodes/path past the canvas into the gray margin — only the
          // preview viewport (overflow-hidden) clips, so overlays reach the edge
          // but never the side panels.
          overflow: "visible",
        }}
        viewBox={`0 0 ${compositionSize.width} ${compositionSize.height}`}
      >
        {/* Wide transparent hit path drives the add-ghost; drawn under the nodes.
            Renders for keyframe paths and non-cubic arcs (see `addable`). */}
        {addable && (
          <polyline
            points={points}
            fill="none"
            stroke="transparent"
            strokeWidth={14 / scale}
            className="pointer-events-auto"
            style={{ cursor: lineCursor }}
            onPointerMove={onPathHover}
            onPointerLeave={() => setGhost(null)}
            onPointerDown={onPathDown}
          />
        )}
        <MotionPathLine points={points} start={startAt} ghost={ghost} r={nodeR} />
        {abs.map((p, i) => (
          <MotionPathNode
            key={i}
            cx={p.ax}
            cy={p.ay}
            r={nodeR}
            interactive={interactive}
            removable={removable && hoverNode === i}
            grabbing={draft?.index === i}
            selected={p.ref.type === "keyframe" && p.ref.pct === activeKeyframePct}
            onEnter={() => setHoverNode(i)}
            onLeave={() => setHoverNode((h) => (h === i ? null : h))}
            onPointerDown={(e) => onDown(e, i, p.x, p.y, p.ref)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onRemove={(e) => onRemove(e, i)}
            onContextMenu={(e) => onNodeContextMenu(e, p.ref)}
          />
        ))}
      </svg>
      {kfMenu && (
        <KeyframeDiamondContextMenu
          state={kfMenu.state}
          onClose={() => setKfMenu(null)}
          onDelete={onMenuDelete}
          onDeleteAll={() => animId && handleGsapRemoveAllKeyframes(animId)}
          // Retiming needs a percentage of this node's own, which a waypoint
          // does not have.
          onMoveToPlayhead={
            kfMenu.ref.type === "keyframe"
              ? (_element, keyframe) =>
                  animId && handleGsapMoveKeyframeToPlayhead(animId, keyframe.percentage)
              : undefined
          }
        />
      )}
    </>
  );
});
