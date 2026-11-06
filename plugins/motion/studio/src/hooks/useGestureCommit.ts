/**
 * Manages gesture recording state and commit logic for the Studio.
 * Extracted from App.tsx to keep file sizes under the 600-line limit.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useGestureRecording } from "./useGestureRecording";
import { simplifyGestureSamples } from "../utils/rdpSimplify";
import { fitEasesFromVelocity } from "../utils/velocityEaseFitter";
import { smoothGestureKeyframes } from "../utils/gestureSmoother";
import { usePlayerStore } from "../player";
import { resolveTweenDuration } from "../utils/globalTimeCompiler";
import type { DomEditSelection } from "../components/editor/domEditing";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { CommitMutationOptions } from "./gsapScriptCommitTypes";
import { trackPreviewEditResult } from "../utils/previewFeatureUsage";
import { observeGsapGesture } from "./gsapGestureOutcome";
import { roundTo3 } from "../utils/rounding";
import { classifyPropertyGroup } from "@hyperframes/core/gsap-parser";
import {
  isInstantHold,
  idSelector,
  keyframeEases,
  writeTargetSelector,
  tweenTargetsElement,
} from "./gsapShared";
import { useStableHandlers } from "./useStableHandlers";
import { progressAtTime, runEaseOf, timeAtProgress, warpsTime } from "../utils/gsapKeyframeEases";

type RecordedKeyframe = {
  percentage: number;
  properties: Record<string, number | string>;
  ease?: string;
};

/**
 * Split recorded keyframes into one keyframe-set per property group (position /
 * scale / rotation / …), each keyframe carrying only that group's props.
 *
 * A mixed-prop gesture (e.g. x/y + opacity) emitted as ONE add-with-keyframes
 * mutation parses back as an untagged legacy mixed tween, which breaks the
 * position-only drag intercept (it can't find a pure position tween to edit).
 * Emitting one tween per group keeps the position tween tagged and editable.
 * Keyframes with no prop in a group are dropped from that group's set.
 */
// fallow-ignore-next-line complexity
function partitionKeyframesByGroup(keyframes: RecordedKeyframe[]): RecordedKeyframe[][] {
  // Preserve first-seen group order for deterministic, stable mutation ordering.
  const groupOrder: string[] = [];
  const byGroup = new Map<string, RecordedKeyframe[]>();
  for (const kf of keyframes) {
    const perGroup = new Map<string, Record<string, number | string>>();
    for (const [key, value] of Object.entries(kf.properties)) {
      const group = classifyPropertyGroup(key);
      let props = perGroup.get(group);
      if (!props) {
        props = {};
        perGroup.set(group, props);
      }
      props[key] = value;
    }
    for (const [group, props] of perGroup) {
      let set = byGroup.get(group);
      if (!set) {
        set = [];
        byGroup.set(group, set);
        groupOrder.push(group);
      }
      set.push({
        percentage: kf.percentage,
        properties: props,
        ...(kf.ease ? { ease: kf.ease } : {}),
      });
    }
  }
  return groupOrder.map((group) => byGroup.get(group)!);
}

// Minimal subset of the session used by gesture commit
interface GestureSessionRef {
  domEditSelection: DomEditSelection | null;
  selectedGsapAnimations?: GsapAnimation[];
  commitMutation?: (
    mutation: Record<string, unknown>,
    options: CommitMutationOptions,
    selection?: DomEditSelection,
  ) => Promise<void>;
}

/** Only the LAST group in a per-group commit loop reloads the preview; the
 *  earlier ones skip it, so a multi-group gesture recording is one reload. */
function reloadOnlyLast(index: number, count: number): Partial<CommitMutationOptions> {
  return index === count - 1 ? { softReload: true } : { skipReload: true };
}

function recordingEnd(selection: DomEditSelection): number | undefined {
  const start = Number.parseFloat(selection.dataAttributes?.start ?? "0") || 0;
  const duration = Number.parseFloat(selection.dataAttributes?.duration ?? "0") || 0;
  return duration > 0 ? start + duration : undefined;
}

let gestureRecordingCommitCounter = 0;

interface UseGestureCommitParams {
  projectId?: string | null;
  domEditSessionRef: React.MutableRefObject<GestureSessionRef>;
  previewIframeRef: React.RefObject<HTMLIFrameElement | null>;
  showToast: (message: string, tone?: "error" | "info") => void;
  isGestureRecordingRef: React.MutableRefObject<boolean>;
  readOnlyPreview: boolean;
}

export interface UseGestureCommitResult {
  gestureState: "idle" | "recording";
  gestureRecording: ReturnType<typeof useGestureRecording>;
  handleToggleRecording: (method?: "button" | "keyboard") => void;
}

// fallow-ignore-next-line complexity
export function useGestureCommit({
  projectId,
  domEditSessionRef,
  previewIframeRef,
  showToast,
  isGestureRecordingRef,
  readOnlyPreview,
}: UseGestureCommitParams): UseGestureCommitResult {
  const gestureRecording = useGestureRecording();
  const [gestureState, setGestureState] = useState<"idle" | "recording">("idle");
  const gestureStateRef = useRef<"idle" | "recording">("idle");
  const recordingAutoStopRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const recordingMethodRef = useRef<"button" | "keyboard">("button");
  const recordingStartTimeRef = useRef(0);
  const commitInFlightRef = useRef(false);
  // Capture selection at recording start so commit always targets the recorded element,
  // even if the user's selection changes mid-recording.
  const capturedSelectionRef = useRef<DomEditSelection | null>(null);
  const capturedAnimationsRef = useRef<GsapAnimation[]>([]);

  // Unmount: clear auto-stop interval
  useEffect(() => () => clearInterval(recordingAutoStopRef.current), []);

  const cancelRecording = useCallback(() => {
    clearInterval(recordingAutoStopRef.current);
    gestureRecording.stopRecording();
    gestureRecording.clearSamples();
    gestureStateRef.current = "idle";
    isGestureRecordingRef.current = false;
    capturedSelectionRef.current = null;
    setGestureState("idle");
  }, [gestureRecording, isGestureRecordingRef]);

  useEffect(() => {
    if (readOnlyPreview && gestureStateRef.current === "recording") cancelRecording();
  }, [cancelRecording, readOnlyPreview]);

  // fallow-ignore-next-line complexity
  const stopAndCommitRecording = useCallback(async () => {
    clearInterval(recordingAutoStopRef.current);
    if (commitInFlightRef.current) {
      return;
    }
    commitInFlightRef.current = true;
    const coalesceOptions = {
      coalesceKey: `gesture-recording:${++gestureRecordingCommitCounter}`,
      coalesceMs: Number.POSITIVE_INFINITY,
    };
    gestureStateRef.current = "idle";
    isGestureRecordingRef.current = false;
    const frozenSamples = gestureRecording.stopRecording();
    const store = usePlayerStore.getState();
    store.setIsPlaying(false);
    try {
      const liveSession = domEditSessionRef.current;
      const sel = capturedSelectionRef.current;
      if (!sel) {
        if (frozenSamples.length > 2) {
          showToast("Selection lost during recording", "error");
        }
        return;
      }
      const duration =
        frozenSamples.length > 0 ? (frozenSamples[frozenSamples.length - 1]?.time ?? 0) : 0;

      if (frozenSamples.length <= 2) {
        showToast("No gesture detected. Move the pointer while recording", "error");
        return;
      }
      if (duration <= 0) {
        showToast("Recording too short. Try again", "error");
        return;
      }

      // Per-property epsilon: small-range properties (opacity 0–1, scale ~0.01–10)
      // need a much tighter tolerance than positional properties (x/y in px).
      // fallow-ignore-next-line complexity
      const simplified = simplifyGestureSamples(frozenSamples, duration, (key) => {
        if (key === "opacity") return 0.01;
        if (key === "scale" || key === "scaleX" || key === "scaleY") return 0.01;
        return 5;
      });
      const sortedPcts = Array.from(simplified.keys()).sort((a, b) => a - b);

      // Ensure a 0% keyframe exists with the element's start-of-recording position
      if (!simplified.has(0) && frozenSamples.length > 0) {
        simplified.set(0, frozenSamples[0]!.properties);
        if (!sortedPcts.includes(0)) sortedPcts.unshift(0);
      }

      // Two different jobs, two different selectors. `selector` is the string an
      // ALREADY-AUTHORED tween is matched against (and retargeted with, so a
      // tween aimed at a whole group stays aimed at it). `writeSelector` is what
      // a NEW tween is authored with: the bare class the id-less case yields here
      // would record the gesture onto every sibling sharing it.
      const selector = sel.id ? idSelector(sel.id) : sel.selector;
      if (!selector) {
        showToast("Cannot save: element has no selector", "error");
        return;
      }
      // A recorded gesture becomes a NEW tween, so its target must address one
      // element; the selection's own selector would record the motion onto
      // every sibling sharing its class (see writeTargetSelector).
      const writeSelector = writeTargetSelector(sel);
      if (!writeSelector) {
        showToast("Cannot save: element has no unique selector", "error");
        return;
      }
      if (liveSession.commitMutation) {
        const writer = liveSession.commitMutation;
        const outcome = observeGsapGesture((_selection, mutation, options) =>
          writer(mutation, options, sel),
        );
        const commit = (mutation: Record<string, unknown>, options: CommitMutationOptions) =>
          outcome.commit!(sel, mutation, options);
        const recStart = recordingStartTimeRef.current;
        const rawKeyframes = sortedPcts.map((pct) => ({
          percentage: pct,
          properties: simplified.get(pct) as Record<string, number | string>,
        }));
        const smoothed = smoothGestureKeyframes(rawKeyframes, 3);
        const keyframes = fitEasesFromVelocity(smoothed, frozenSamples, duration);
        const hasPositionProps = keyframes.some((kf) =>
          Object.keys(kf.properties).some((k) => classifyPropertyGroup(k) === "position"),
        );
        const allAnims = capturedAnimationsRef.current;
        const existingPositionTween = hasPositionProps
          ? allAnims.find(
              (a) =>
                a.propertyGroup === "position" &&
                tweenTargetsElement(a.targetSelector, selector, sel.element),
            )
          : undefined;
        if (existingPositionTween) {
          if (isInstantHold(existingPositionTween)) {
            // An instant hold is not a tween to merge into — replace it with the
            // recorded motion (which already starts from the held position).
            await commit(
              {
                type: "replace-with-keyframes",
                animationId: existingPositionTween.id,
                targetSelector: selector,
                position: roundTo3(recStart),
                duration: roundTo3(duration),
                keyframes,
              },
              { label: "Gesture recording (replace set)", softReload: true, keyframeAction: "add" },
            );
          } else {
            const tweenStart = existingPositionTween.resolvedStart ?? 0;
            const tweenDur = resolveTweenDuration(existingPositionTween);
            const tweenEnd = tweenStart + tweenDur;
            const recEnd = recStart + duration;

            // Only merge if the recording overlaps the existing tween's time range.
            // No overlap → fall through to add-with-keyframes (creates a separate tween).
            const overlaps = recStart < tweenEnd + 0.05 && recEnd > tweenStart - 0.05;

            if (overlaps) {
              const existingKfs = existingPositionTween.keyframes?.keyframes ?? [];
              const startTimePct =
                tweenDur > 0 ? Math.max(0, ((recStart - tweenStart) / tweenDur) * 100) : 0;
              const endTimePct =
                tweenDur > 0 ? Math.min(100, ((recEnd - tweenStart) / tweenDur) * 100) : 100;
              const runEase = runEaseOf(existingPositionTween);
              const roundPct = warpsTime(runEase) ? (pct: number) => pct : roundTo3;

              const preserved = existingKfs
                .filter((kf) => {
                  const playsAt = timeAtProgress(runEase, kf.percentage);
                  return playsAt < startTimePct - 0.5 || playsAt > endTimePct + 0.5;
                })
                .map((kf) => ({
                  percentage: kf.percentage,
                  properties: kf.properties,
                  ...(kf.ease ? { ease: kf.ease } : {}),
                }));

              const constantSpeed = { ease: "none" };
              const mapped = keyframes.map((kf, index) => ({
                percentage: roundPct(
                  progressAtTime(
                    runEase,
                    startTimePct + (kf.percentage / 100) * (endTimePct - startTimePct),
                  ),
                ),
                properties: kf.properties,
                ...(kf.ease ? { ease: kf.ease } : index > 0 ? constantSpeed : {}),
              }));

              const merged = [...preserved, ...mapped].sort((a, b) => a.percentage - b.percentage);

              await commit(
                {
                  type: "replace-with-keyframes",
                  animationId: existingPositionTween.id,
                  targetSelector: selector,
                  position:
                    typeof existingPositionTween.position === "number"
                      ? existingPositionTween.position
                      : tweenStart,
                  duration: tweenDur,
                  keyframes: merged,
                  ...keyframeEases(existingPositionTween),
                },
                { label: "Gesture recording (merge)", softReload: true, keyframeAction: "add" },
              );
            } else {
              // Emit one tween per property group so a mixed-prop gesture (e.g.
              // x/y + opacity) doesn't collapse into an untagged legacy mixed
              // tween that the position-only drag intercept can't edit.
              const keyframeGroups = partitionKeyframesByGroup(keyframes);
              for (const [index, groupKfs] of keyframeGroups.entries()) {
                await commit(
                  {
                    type: "add-with-keyframes",
                    targetSelector: writeSelector,
                    position: roundTo3(recStart),
                    duration: roundTo3(duration),
                    keyframes: groupKfs,
                    // Linear fallback: the velocity fitter assigns a per-keyframe
                    // ease to non-constant segments and intentionally leaves
                    // constant-speed segments undefined → they must stay linear,
                    // not inherit a sigmoid.
                    easeEach: "none",
                  },
                  {
                    label: "Gesture recording (new range)",
                    ...coalesceOptions,
                    ...reloadOnlyLast(index, keyframeGroups.length),
                  },
                );
              }
            }
          }
        } else {
          // No existing tween — same per-group split as the new-range branch above.
          const keyframeGroups = partitionKeyframesByGroup(keyframes);
          for (const [index, groupKfs] of keyframeGroups.entries()) {
            await commit(
              {
                type: "add-with-keyframes",
                targetSelector: writeSelector,
                position: roundTo3(recStart),
                duration: roundTo3(duration),
                keyframes: groupKfs,
                // Linear fallback (see above) — constant-speed segments stay linear.
                easeEach: "none",
              },
              {
                label: "Gesture recording",
                ...coalesceOptions,
                ...reloadOnlyLast(index, keyframeGroups.length),
              },
            );
          }
        }
        trackPreviewEditResult("gesture_recording", recordingMethodRef.current, outcome.finish());
      }
      showToast(`Recorded ${sortedPcts.length} keyframes`, "info");
    } catch (err) {
      console.error("[GR:error]", err);
      showToast(`Gesture commit failed: ${err}`, "error");
    } finally {
      store.requestSeek(recordingStartTimeRef.current);
      gestureRecording.clearSamples();
      setGestureState("idle");
      commitInFlightRef.current = false;
    }
  }, [gestureRecording, showToast, isGestureRecordingRef, domEditSessionRef]);

  const armAutoStop = useCallback(
    (elementEnd: number | undefined) => {
      clearInterval(recordingAutoStopRef.current);
      const autoStopAt = elementEnd ?? Infinity;
      recordingAutoStopRef.current = setInterval(() => {
        const { currentTime: t, duration: d } = usePlayerStore.getState();
        const limit = Math.min(autoStopAt, d);
        if (limit > 0 && t >= limit - 0.05) {
          void stopAndCommitRecording();
        }
      }, 100);
    },
    [stopAndCommitRecording],
  );

  const startRecording = useCallback(
    (method: "button" | "keyboard") => {
      if (readOnlyPreview) return;
      const sel = domEditSessionRef.current.domEditSelection;
      if (!sel) {
        showToast("Select an element first", "error");
        return;
      }
      const iframe = previewIframeRef.current;
      if (!iframe) {
        showToast("Preview not ready. Try again", "error");
        return;
      }

      const store = usePlayerStore.getState();
      recordingMethodRef.current = method;
      recordingStartTimeRef.current = store.currentTime;
      const elementEnd = recordingEnd(sel);
      capturedSelectionRef.current = sel;
      capturedAnimationsRef.current = domEditSessionRef.current.selectedGsapAnimations ?? [];
      gestureRecording.startRecording(sel.element, iframe, elementEnd);
      gestureStateRef.current = "recording";
      isGestureRecordingRef.current = true;
      setGestureState("recording");

      armAutoStop(elementEnd);
    },
    [
      gestureRecording,
      showToast,
      previewIframeRef,
      domEditSessionRef,
      isGestureRecordingRef,
      readOnlyPreview,
      armAutoStop,
    ],
  );

  const handleToggleRecording = useCallback(
    (method: "button" | "keyboard" = "button") => {
      if (commitInFlightRef.current) return;
      if (gestureStateRef.current === "recording") {
        if (readOnlyPreview) cancelRecording();
        else void stopAndCommitRecording();
        return;
      }
      startRecording(method);
    },
    [cancelRecording, readOnlyPreview, startRecording, stopAndCommitRecording],
  );

  return useStableHandlers({ gestureState, gestureRecording, handleToggleRecording }, projectId);
}
