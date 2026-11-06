import { useI18n } from "../i18n/I18n";
import { memo, useEffect, useRef, type ReactNode } from "react";
import {
  ArrowsOutLineHorizontal,
  FrameCorners,
  Image,
  Magnet,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
} from "@phosphor-icons/react";
import {
  useEnableKeyframes,
  isPlayheadWithinTween,
  type EnableKeyframesSession,
} from "../hooks/useEnableKeyframes";
import { computeElementPercentage, playsNear } from "../hooks/gsapShared";
import { useKeyframeKeyboard } from "../hooks/useKeyframeKeyboard";
import {
  timelineZoomPercentToSlider,
  timelineSliderToZoomPercent,
} from "../player/components/timelineZoom";
import { useTimelineZoom } from "../player/components/useTimelineZoom";
import {
  canZoomToSelectedClips,
  useShownTimelineZoomPercent,
  zoomTimelineStep,
  zoomTimelineToSelectedClips,
} from "../player/components/timelineZoomInput";
import { usePlayerStore, type TimelineElement } from "../player";
import { Tooltip } from "./ui";
import { AudioMetersIcon } from "./icons/AudioMetersIcon";
import { RippleEditIcon } from "./icons/RippleEditIcon";
import { flatActive, flatBtn, flatDisabled, flatIdle } from "./timelineToolbarStyles";
import { TimelineHistoryButtons, type TimelineHistoryButtonsProps } from "./TimelineHistoryButtons";
import { TimelineToolPicker } from "./TimelineToolPicker";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "./editor/domEditingTypes";
import { canSplitElement } from "../utils/timelineElementSplit";
import { useAudioMetersVisible } from "../utils/audioMeterVisibility";
import { LinkedSelectionToggle } from "./LinkedSelectionToggle";
import { useProjectHasAudio } from "../utils/audioMeterMath";
import { canAddBeatAt, addBeatAtCompositionTime } from "../utils/beatEditActions";
import { isTypingTarget } from "../utils/typingTarget";
import { keyHint, matchesKey, useStudioKeys } from "../player/components/studioShortcuts";
import type { TimelineProps } from "../player/components/TimelineTypes";

interface DomEditSessionSlice extends EnableKeyframesSession {
  domEditSelection: DomEditSelection | null;
  selectedGsapAnimations: GsapAnimation[];
}

export interface TimelineToolbarProps {
  domEditSession?: DomEditSessionSlice;
  onSplitElement?: (element: TimelineElement, splitTime: number) => void;
  splitShortcut?: TimelineProps["splitShortcut"];
  history?: TimelineHistoryButtonsProps;
  showHistory?: boolean;
  showSelectAroundPlayhead?: boolean;
  showAddBeat?: boolean;
  /** Hides Add keyframe and auto-record, and turns off auto-record and the K shortcut with them. */
  showKeyframes?: boolean;
  rightActions?: ReactNode;
}

interface KeyframeToggleState {
  state: "active" | "inactive" | "none";
  isMotionPath: boolean;
  pathEndpoint: boolean;
  willExtend: boolean;
}

const NO_KEYFRAME_TOGGLE: KeyframeToggleState = {
  state: "none",
  isMotionPath: false,
  pathEndpoint: false,
  willExtend: false,
};

function isMotionPathEndpoint(animation: GsapAnimation | undefined, percentage: number): boolean {
  if (!animation?.keyframes) return false;
  const keyframes = animation.keyframes.keyframes;
  return [keyframes[0], keyframes.at(-1)].some(
    (keyframe) => keyframe && playsNear(animation, keyframe.percentage, percentage),
  );
}

function resolveKeyframeToggleState(
  session: DomEditSessionSlice | undefined,
  currentTime: number,
): KeyframeToggleState {
  if (!session?.domEditSelection) return NO_KEYFRAME_TOGGLE;
  const arcAnimation = session.selectedGsapAnimations.find(
    (animation) => animation.arcPath && animation.keyframes,
  );
  const animation =
    arcAnimation ??
    session.selectedGsapAnimations.find((candidate) => candidate.keyframes && !candidate.arcPath);
  if (!animation?.keyframes) return NO_KEYFRAME_TOGGLE;

  const isMotionPath = Boolean(arcAnimation);
  if (!isPlayheadWithinTween(animation, currentTime)) {
    return { state: "inactive", isMotionPath, pathEndpoint: false, willExtend: true };
  }

  const percentage = computeElementPercentage(currentTime, session.domEditSelection, animation);
  const pathEndpoint = isMotionPathEndpoint(arcAnimation, percentage);
  const active = animation.keyframes.keyframes.some((keyframe) =>
    playsNear(animation, keyframe.percentage, percentage),
  );
  return {
    state: pathEndpoint ? "none" : active ? "active" : "inactive",
    isMotionPath,
    pathEndpoint,
    willExtend: false,
  };
}

/**
 * Can this element be keyframed at all?
 *
 * An audio clip cannot. It has no box on the canvas, so there is nothing to move,
 * scale or fade — and "add a keyframe" on one seeds a tween from the position
 * properties, which produced a position lane on a track that has no position. Audio
 * is automated instead: volume and effect parameters, on their own lanes.
 */
function isKeyframeable(element: TimelineElement | undefined): boolean {
  return element?.tag !== "audio";
}

function useKeyframeToggle(session?: DomEditSessionSlice) {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const selectedElementId = usePlayerStore((s) => s.selectedElementId);
  const elements = usePlayerStore((s) => s.elements);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const onToggle = useEnableKeyframes(
    sessionRef as React.RefObject<EnableKeyframesSession | undefined>,
  );

  const selected = elements.find((element) => (element.key ?? element.id) === selectedElementId);
  if (!isKeyframeable(selected)) return { ...NO_KEYFRAME_TOGGLE, onToggle: undefined };

  const toggleState = resolveKeyframeToggleState(session, currentTime);

  return {
    ...toggleState,
    onToggle: session?.domEditSelection && !toggleState.pathEndpoint ? onToggle : undefined,
  };
}

// fallow-ignore-next-line complexity
export const TimelineToolbar = memo(function TimelineToolbar({
  domEditSession,
  onSplitElement,
  splitShortcut,
  history,
  showHistory = true,
  showSelectAroundPlayhead = true,
  showAddBeat = true,
  showKeyframes = true,
  rightActions,
}: TimelineToolbarProps) {
  const { t } = useI18n();
  const keys = useStudioKeys();
  const kf = keyHint("addKeyframe", keys);
  const timelineSnapEnabled = usePlayerStore((s) => s.timelineSnapEnabled);
  const setTimelineSnapEnabled = usePlayerStore((s) => s.setTimelineSnapEnabled);
  const rippleEditEnabled = usePlayerStore((s) => s.rippleEditEnabled);
  const setRippleEditEnabled = usePlayerStore((s) => s.setRippleEditEnabled);
  const autoKeyframeEnabled = usePlayerStore((s) => s.autoKeyframeEnabled);
  const setAutoKeyframeEnabled = usePlayerStore((s) => s.setAutoKeyframeEnabled);
  const thumbnailMode = usePlayerStore((s) => s.thumbnailMode);
  const setThumbnailMode = usePlayerStore((s) => s.setThumbnailMode);
  const thumbnailsVisible = thumbnailMode === "adaptive";
  const audioMetersVisible = useAudioMetersVisible((s) => s.visible);
  const setAudioMetersVisible = useAudioMetersVisible((s) => s.setVisible);
  const projectHasAudio = useProjectHasAudio();
  // Subscribe so the add-beat button reacts to playhead movement and analysis load.
  const currentTime = usePlayerStore((s) => s.currentTime);
  const beatAnalysisReady = usePlayerStore((s) => s.beatAnalysis !== null);
  // Subscribed, so the split button follows the selection, not only playhead ticks.
  const selectedElementId = usePlayerStore((s) => s.selectedElementId);
  const selectedElementIds = usePlayerStore((s) => s.selectedElementIds);
  const elements = usePlayerStore((s) => s.elements);
  const canZoomSelection = canZoomToSelectedClips({
    elements,
    selectedElementId,
    selectedElementIds,
  });
  const timelineFitPps = usePlayerStore((s) => s.timelineFitPps);
  const { zoomMode, setZoomMode, setManualZoomPercent } = useTimelineZoom();
  const displayedTimelineZoomPercent = useShownTimelineZoomPercent();
  const showsFit = zoomMode === "fit" && displayedTimelineZoomPercent === 100;
  const {
    state: keyframeState,
    isMotionPath: keyframeIsMotionPath,
    pathEndpoint: keyframePathEndpoint,
    willExtend: keyframeWillExtend,
    onToggle: onToggleKeyframe,
  } = useKeyframeToggle(domEditSession);

  // Wire the Add keyframe shortcut the toolbar advertises. Active only when
  // there's a keyframeable selection; otherwise K stays JKL-pause in playback.
  useKeyframeKeyboard({
    enabled: showKeyframes && Boolean(onToggleKeyframe),
    onAddKeyframe: onToggleKeyframe,
  });

  useEffect(() => {
    if (!showKeyframes) setAutoKeyframeEnabled(false);
  }, [showKeyframes, setAutoKeyframeEnabled]);

  // "N" toggles timeline snapping (industry convention: Resolve/FCP).
  // Skip when typing in an input/contenteditable.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!matchesKey(e, "timelineSnap")) return;
      if (isTypingTarget(e.target)) return;
      const store = usePlayerStore.getState();
      store.setTimelineSnapEnabled(!store.timelineSnapEnabled);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="border-b border-neutral-800/60">
      <div className="flex items-center justify-between px-2 py-0.5">
        <div className="flex items-center gap-0.5">
          {showHistory && <TimelineHistoryButtons {...history} />}
          <TimelineToolPicker showSelectAroundPlayhead={showSelectAroundPlayhead} />
          {/* Divider: tool-mode | editing-actions */}
          <div aria-hidden="true" className="mx-1 h-4 w-px bg-neutral-800" />
          <LinkedSelectionToggle />
          <Tooltip
            label={
              timelineSnapEnabled
                ? t("Snapping on ({value0})", { value0: keyHint("timelineSnap", keys) })
                : t("Snapping off ({value0})", { value0: keyHint("timelineSnap", keys) })
            }
          >
            <button
              type="button"
              onClick={() => setTimelineSnapEnabled(!timelineSnapEnabled)}
              aria-label={t("Toggle timeline snapping")}
              aria-pressed={timelineSnapEnabled}
              className={timelineSnapEnabled ? flatActive : flatIdle}
            >
              <Magnet size={16} weight="bold" aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip
            label={
              rippleEditEnabled
                ? t("Ripple on: keeps the main track gapless")
                : t("Ripple off: deleting a main-track clip leaves a gap")
            }
          >
            <button
              type="button"
              onClick={() => setRippleEditEnabled(!rippleEditEnabled)}
              aria-label={t("Toggle ripple edit")}
              aria-pressed={rippleEditEnabled}
              className={rippleEditEnabled ? flatActive : flatIdle}
            >
              <RippleEditIcon size={16} />
            </button>
          </Tooltip>
          {projectHasAudio && (
            <Tooltip label={audioMetersVisible ? t("Hide audio meters") : t("Show audio meters")}>
              <button
                type="button"
                onClick={() => setAudioMetersVisible(!audioMetersVisible)}
                aria-label={t("Toggle audio meters")}
                aria-pressed={audioMetersVisible}
                className={audioMetersVisible ? flatActive : flatIdle}
              >
                <AudioMetersIcon size={16} />
              </button>
            </Tooltip>
          )}
          {showKeyframes && (
            <>
              {/* With no keyframeable selection the button fades to disabled instead of
              unmounting, so the toolbar layout never shifts (CapCut-style). */}
              <Tooltip
                label={
                  keyframePathEndpoint
                    ? t("Motion path endpoints cannot be removed")
                    : !onToggleKeyframe
                      ? t("Select an animated element to add keyframes")
                      : keyframeIsMotionPath
                        ? keyframeWillExtend
                          ? t("Extend motion path to playhead ({kf})", { kf: kf })
                          : keyframeState === "active"
                            ? t("Remove waypoint from motion path ({kf})", { kf: kf })
                            : t("Add waypoint to motion path ({kf})", { kf: kf })
                        : keyframeState === "active"
                          ? t("Remove keyframe at playhead ({kf})", { kf: kf })
                          : keyframeState === "inactive"
                            ? keyframeWillExtend
                              ? t("Add keyframe at playhead, extends animation ({kf})", { kf: kf })
                              : t("Add keyframe at playhead ({kf})", { kf: kf })
                            : t("Add keyframe ({kf})", { kf: kf })
                }
              >
                <button
                  type="button"
                  disabled={!onToggleKeyframe}
                  onClick={onToggleKeyframe}
                  aria-label={
                    keyframePathEndpoint
                      ? t("Motion path endpoint")
                      : keyframeIsMotionPath
                        ? keyframeState === "active"
                          ? t("Remove motion path waypoint")
                          : keyframeWillExtend
                            ? t("Extend motion path to playhead")
                            : t("Add motion path waypoint")
                        : keyframeState === "active"
                          ? t("Remove keyframe at playhead")
                          : t("Add keyframe at playhead")
                  }
                  className={
                    !onToggleKeyframe
                      ? flatDisabled
                      : `${flatBtn} active:scale-[0.98] hover:bg-hover ${
                          keyframeState === "active"
                            ? "text-accent-ink"
                            : keyframeState === "inactive"
                              ? "text-neutral-400 hover:text-accent-ink"
                              : "text-neutral-600 hover:text-neutral-400"
                        }`
                  }
                >
                  <svg width="16" height="16" viewBox="0 0 10 10" fill="currentColor">
                    {keyframeState === "active" ? (
                      <path d="M5 0.5L9.5 5L5 9.5L0.5 5Z" />
                    ) : (
                      <path
                        d="M5 1.2L8.8 5L5 8.8L1.2 5Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                    )}
                  </svg>
                </button>
              </Tooltip>
              <Tooltip
                label={
                  autoKeyframeEnabled
                    ? t("Auto-record manual edits as keyframes (click to turn off)")
                    : t("Manual edits will not be recorded as keyframes (click to turn on)")
                }
              >
                <button
                  type="button"
                  onClick={() => setAutoKeyframeEnabled(!autoKeyframeEnabled)}
                  aria-label={t("Auto-record manual edits as keyframes")}
                  aria-pressed={autoKeyframeEnabled}
                  className={`${flatBtn} active:scale-[0.98] hover:bg-hover ${
                    autoKeyframeEnabled
                      ? "text-danger-ink"
                      : "text-neutral-600 hover:text-neutral-400"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 10 10" fill="none">
                    {/* Same diamond outline as the Add-keyframe icon, with a
                      record-style dot inside: filled = auto-recording,
                      hollow = manual edits won't be keyframed. */}
                    <path d="M5 0.7L9.3 5L5 9.3L0.7 5Z" stroke="currentColor" strokeWidth="1" />
                    <circle
                      cx="5"
                      cy="5"
                      r="1.8"
                      fill={autoKeyframeEnabled ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="1"
                    />
                  </svg>
                </button>
              </Tooltip>
            </>
          )}
          {onSplitElement &&
            (() => {
              // Render the button unconditionally (disabled when unusable):
              // mounting/unmounting mid-task shifts the neighboring controls.
              // Mirrors the S-key gate: selected clip + playhead strictly inside it.
              const el = selectedElementId
                ? elements.find((e) => (e.key ?? e.id) === selectedElementId)
                : null;
              const splittable = el != null && canSplitElement(el);
              const canSplit =
                splittable && currentTime > el.start && currentTime < el.start + el.duration;
              return (
                <Tooltip
                  label={
                    canSplit
                      ? t("Split at playhead ({value0})", { value0: splitShortcut ?? keyHint("split", keys) })
                      : splittable
                        ? t("Move the playhead inside the clip to split")
                        : t("Select a clip to split")
                  }
                >
                  <button
                    type="button"
                    disabled={!canSplit}
                    aria-label={t("Split at playhead")}
                    onClick={() => {
                      if (canSplit && el) onSplitElement(el, currentTime);
                    }}
                    className={canSplit ? flatIdle : flatDisabled}
                  >
                    {/* "][" split glyph: two outward-facing brackets with a center gap */}
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {/* Right bracket of left half: ] */}
                      <path d="M5 3 L7 3 L7 13 L5 13" />
                      {/* Left bracket of right half: [ */}
                      <path d="M11 3 L9 3 L9 13 L11 13" />
                    </svg>
                  </button>
                </Tooltip>
              );
            })()}
          {(() => {
            if (!showAddBeat) return null;
            // Rendered whenever shown (CapCut-style): before beat analysis loads (or when
            // the project has no analyzed music) the button fades to a disabled
            // state instead of unmounting, so the toolbar layout never shifts.
            const canAdd = beatAnalysisReady && canAddBeatAt(currentTime);
            return (
              <Tooltip
                label={
                  !beatAnalysisReady
                    ? t("Add a music track with beat analysis to place beats")
                    : canAdd
                      ? t("Add beat at playhead")
                      : t("A beat already exists at the playhead")
                }
              >
                <button
                  type="button"
                  disabled={!canAdd}
                  aria-label={t("Add beat at playhead")}
                  onClick={() => {
                    if (canAdd) addBeatAtCompositionTime(currentTime);
                  }}
                  className={
                    canAdd
                      ? `${flatBtn} text-text-2 hover:bg-hover hover:text-accent-ink active:scale-[0.98]`
                      : flatDisabled
                  }
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M21 10C21 12.2091 16.9706 14 12 14M21 10C21 7.79086 16.9706 6 12 6C7.02944 6 3 7.79086 3 10M21 10V16C21 18.2091 16.9706 20 12 20M12 14C7.02944 14 3 12.2091 3 10M12 14V20M3 10V16C3 18.2091 7.02944 20 12 20M7 19.3264V13.3264M17 19.3264V13.3264M12 10L20 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </Tooltip>
            );
          })()}
        </div>
        <div className="flex items-center gap-0.5">
          {rightActions}
          <Tooltip
            label={
              thumbnailsVisible
                ? t("Hide thumbnails: labels only")
                : t("Show thumbnails: posters stay visible; richer previews appear on interaction")
            }
          >
            <button
              type="button"
              aria-label={
                thumbnailsVisible
                  ? t("Hide thumbnails: labels only")
                  : t("Show thumbnails: posters stay visible; richer previews appear on interaction")
              }
              aria-pressed={thumbnailsVisible}
              onClick={() => setThumbnailMode(thumbnailsVisible ? "hidden" : "adaptive")}
              className={`h-7 px-2 rounded-md text-[11px] font-medium transition-colors ${
                thumbnailsVisible
                  ? "bg-studio-accent/10 text-accent-ink"
                  : "text-neutral-400 hover:bg-hover hover:text-neutral-200"
              }`}
            >
              <Image size={16} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip
            label={
              canZoomSelection
                ? t("Zoom to selected clips ({value0})", { value0: keyHint("zoomSelection", keys) })
                : t("Select a clip to zoom the timeline")
            }
          >
            <button
              type="button"
              disabled={!canZoomSelection}
              aria-label={
                canZoomSelection ? t("Zoom to selected clips") : t("Select a clip to zoom the timeline")
              }
              onClick={() => zoomTimelineToSelectedClips()}
              className={canZoomSelection ? flatIdle : flatDisabled}
            >
              <FrameCorners size={16} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip label={t("Fit timeline to width")}>
            <button
              type="button"
              onClick={() => setZoomMode("fit")}
              aria-label={t("Fit timeline to width")}
              aria-pressed={zoomMode === "fit"}
              className={`h-7 px-2 rounded-md text-[11px] font-medium transition-colors ${
                zoomMode === "fit"
                  ? "bg-studio-accent/10 text-accent-ink"
                  : "text-neutral-400 hover:bg-hover hover:text-neutral-200"
              }`}
            >
              <ArrowsOutLineHorizontal size={16} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip label={t("Zoom out")}>
            <button
              type="button"
              aria-label={t("Zoom out")}
              onClick={() => zoomTimelineStep("out")}
              className={flatIdle}
            >
              <MagnifyingGlassMinus size={16} aria-hidden="true" />
            </button>
          </Tooltip>
          <input
            type="range"
            min="0"
            max="100"
            value={timelineZoomPercentToSlider(displayedTimelineZoomPercent, timelineFitPps)}
            title={`${displayedTimelineZoomPercent}%`}
            data-studio-control="timeline-zoom"
        aria-label={t("Timeline zoom")}
            onChange={(e) =>
              setManualZoomPercent(
                timelineSliderToZoomPercent(Number(e.target.value), timelineFitPps),
              )
            }
            // h-6 on the input is the 24x24 WCAG 2.2 (2.5.8) target: the visible
            // track stays 2px and the thumb 10px, only the pointer box grows.
            className="mx-1 h-6 w-[96px] cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-[2px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-neutral-700 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[10px] [&::-webkit-slider-thumb]:h-[10px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-text-0 [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_#0a0a0a,0_1px_3px_rgba(0,0,0,0.5)] [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb:active]:cursor-grabbing"
          />
          <Tooltip label={t("Zoom in")}>
            <button
              type="button"
              aria-label={t("Zoom in")}
              onClick={() => zoomTimelineStep("in")}
              className={flatIdle}
            >
              <MagnifyingGlassPlus size={16} aria-hidden="true" />
            </button>
          </Tooltip>
          {/* Numeric zoom readout (main-parity): "Fit" in fit mode, N% in manual. */}
          <span
            className="ml-1 w-[38px] text-right font-mono text-[11px] tabular-nums text-neutral-500 select-none"
            aria-label={t("Timeline zoom level")}
          >
            {showsFit ? t("Fit") : `${displayedTimelineZoomPercent}%`}
          </span>
        </div>
      </div>
    </div>
  );
});
