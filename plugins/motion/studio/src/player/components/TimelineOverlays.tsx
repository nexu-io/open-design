import { TimelineAudioGainOverlay } from "./AudioGainDialog";
import { useEffect, useMemo } from "react";
import type { TimelineElement } from "../store/playerStore";
import { EditPopover } from "./EditModal";
import { useArtifactViewActive } from "../../motion/ArtifactViewState";
import { KeyframeDiamondContextMenu } from "./KeyframeDiamondContextMenu";
import { ClipContextMenu } from "./ClipContextMenu";
import { TrackGapContextMenu } from "./TrackGapContextMenu";
import { TimelineShortcutHint as TimelineShortcutHintImpl } from "./TimelineShortcutHint";
import { copyTextToClipboard } from "../../utils/clipboard";
import { trackStudioSegmentEaseEdit } from "../../telemetry/events";
import { useTimelineContext } from "./TimelineProvider";
import { useMediaGateway } from '../../motion/MediaGatewayContext';

interface TimelineContextTargetInput {
  capturedElement: TimelineElement;
  targetSessionEpoch: number | undefined;
  sessionEpoch: number;
  selectedElementId: string | null;
  elements: readonly TimelineElement[];
}

export function resolveTimelineContextElement({
  capturedElement,
  targetSessionEpoch,
  sessionEpoch,
  selectedElementId,
  elements,
}: TimelineContextTargetInput): TimelineElement | null {
  const identity = capturedElement.key ?? capturedElement.id;
  if (targetSessionEpoch !== sessionEpoch) return null;
  if (selectedElementId !== identity) return null;
  return elements.find((element) => (element.key ?? element.id) === identity) ?? null;
}

export function TimelineShortcutHintOverlay() {
  const { state } = useTimelineContext();
  const { showShortcutHint, showPopover, rangeSelection, theme } = state.overlays;
  if (!showShortcutHint || showPopover || rangeSelection) return null;
  return <TimelineShortcutHintImpl theme={theme} />;
}

export function TimelineEditPopoverOverlay() {
  const { state } = useTimelineContext();
  const gateway = useMediaGateway();
  const { showPopover, rangeSelection, setShowPopover, setRangeSelection } = state.overlays;
  if (gateway || !showPopover || !rangeSelection) return null;
  return (
    <EditPopover
      rangeStart={rangeSelection.start}
      rangeEnd={rangeSelection.end}
      anchorX={rangeSelection.anchorX}
      anchorY={rangeSelection.anchorY}
      onClose={() => {
        setShowPopover(false);
        setRangeSelection(null);
      }}
    />
  );
}

export function TimelineKeyframeMenuOverlay() {
  const { state, actions } = useTimelineContext();
  const overlay = state.overlays;
  const { kfContextMenu, setKfContextMenu } = overlay;
  const { selectedElementId, sessionEpoch, keyframeCache } = state;
  const targetEpoch = kfContextMenu?.sessionEpoch;
  const element = kfContextMenu
    ? resolveTimelineContextElement({
        capturedElement: kfContextMenu.element,
        targetSessionEpoch: targetEpoch,
        sessionEpoch,
        selectedElementId,
        elements: overlay.elements,
      })
    : null;
  useEffect(() => {
    if (kfContextMenu && !element) setKfContextMenu(null);
  }, [element, kfContextMenu, setKfContextMenu]);
  if (!kfContextMenu || !element) return null;
  const readCurrentElement = () =>
    resolveTimelineContextElement({
      capturedElement: element,
      targetSessionEpoch: targetEpoch,
      sessionEpoch,
      selectedElementId,
      elements: overlay.elementsRef.current,
    });
  const menu = kfContextMenu;
  return (
    <KeyframeDiamondContextMenu
      state={{ ...menu, element }}
      onClose={() => setKfContextMenu(null)}
      onDelete={(...args) => {
        if (readCurrentElement()) overlay.onDeleteKeyframe?.(...args);
      }}
      onDeleteAll={(_element, animationId) => {
        const current = readCurrentElement();
        if (current) overlay.onDeleteAllKeyframes?.(current, animationId);
      }}
      onMoveToPlayhead={
        overlay.onMoveKeyframeToPlayhead
          ? (_element, ...args) => {
              const current = readCurrentElement();
              if (current) overlay.onMoveKeyframeToPlayhead?.(current, ...args);
            }
          : undefined
      }
      onEditEase={
        // Routed to the same focused-ease-segment path a segment click takes,
        // so the menu advertises the editor that exists rather than growing a
        // second one. Offered only for a keyframe that names a tween to focus.
        menu.animationId !== undefined && menu.tweenPercentage !== undefined
          ? (elementId, keyframe) => {
              if (keyframe.animationId === undefined || keyframe.tweenPercentage === undefined)
                return;
              actions.setFocusedEaseSegment({
                animationId: keyframe.animationId,
                collidingAnimationTargets: keyframe.collidingAnimationTargets,
                tweenPercentage: keyframe.tweenPercentage,
                elementId,
              });
              trackStudioSegmentEaseEdit({ action: "open" });
            }
          : undefined
      }
      onCopyProperties={(elementId, keyframe) => {
        const entry = keyframeCache.get(elementId);
        // Match the existing keyframe lookup tolerance so copied properties
        // follow the same nearby-keyframe selection as the editor.
        const keyframeValue = entry?.keyframes.find(
          (item) => Math.abs(item.percentage - keyframe.percentage) < 0.5,
        );
        if (!keyframeValue) return false;
        return copyTextToClipboard(JSON.stringify(keyframeValue.properties, null, 2));
      }}
    />
  );
}

export function TimelineClipMenuOverlay() {
  const { state } = useTimelineContext();
  const overlay = state.overlays;
  const { clipContextMenu, setClipContextMenu } = overlay;
  const { selectedElementId, sessionEpoch } = state;
  const targetEpoch = clipContextMenu?.sessionEpoch;
  const element = clipContextMenu
    ? resolveTimelineContextElement({
        capturedElement: clipContextMenu.element,
        targetSessionEpoch: targetEpoch,
        sessionEpoch,
        selectedElementId,
        elements: overlay.elements,
      })
    : null;
  useEffect(() => {
    if (clipContextMenu && !element) setClipContextMenu(null);
  }, [element, clipContextMenu, setClipContextMenu]);
  const { clipMenuItems } = overlay;
  const hostItems = useMemo(
    () => (element ? clipMenuItems?.(element) : undefined),
    [clipMenuItems, element],
  );
  if (!clipContextMenu || !element) return null;
  const readCurrentElement = () =>
    resolveTimelineContextElement({
      capturedElement: element,
      targetSessionEpoch: targetEpoch,
      sessionEpoch,
      selectedElementId,
      elements: overlay.elementsRef.current,
    });
  const menu = clipContextMenu;
  return (
    <ClipContextMenu
      x={menu.x}
      y={menu.y}
      element={element}
      currentTime={overlay.currentTime}
      onClose={() => setClipContextMenu(null)}
      onSplit={(_element, time) => {
        const current = readCurrentElement();
        if (current) overlay.onSplitElement?.(current, time);
      }}
      onDelete={() => {
        const current = readCurrentElement();
        if (!current) return;
        overlay.pinZoomBeforeEdit();
        overlay.onDeleteElement?.(current);
      }}
      onCopy={overlay.onCopyClip}
      onPaste={overlay.onPasteClip}
      onDuplicate={overlay.onDuplicateClip}
      canPaste={overlay.canPasteClip?.() ?? false}
      hostItems={hostItems}
      splitShortcut={overlay.splitShortcut}
    />
  );
}

export function TimelineGapMenuOverlay() {
  const { state } = useTimelineContext();
  const menu = state.overlays.gapContextMenu;
  const overlay = state.overlays;
  if (!menu) return null;
  return (
    <TrackGapContextMenu
      x={menu.x}
      y={menu.y}
      gapWidth={menu.gapWidth}
      canCloseGap={menu.canCloseGap}
      canCloseAllGaps={menu.canCloseAllGaps}
      hasAnyGaps={menu.hasAnyGaps}
      onClose={overlay.onDismissGapContextMenu}
      onCloseGap={overlay.onCloseTrackGap}
      onCloseAllGaps={overlay.onCloseAllTrackGaps}
      onHoverAction={overlay.onHoverGapAction}
    />
  );
}

export function TimelineOverlays() {
  const active = useArtifactViewActive();
  if (!active) return null;
  return (
    <>
      <TimelineShortcutHintOverlay />
      <TimelineEditPopoverOverlay />
      <TimelineKeyframeMenuOverlay />
      <TimelineClipMenuOverlay />
      <TimelineGapMenuOverlay />
      <TimelineAudioGainOverlay />
    </>
  );
}
