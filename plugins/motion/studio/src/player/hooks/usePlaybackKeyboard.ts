/**
 * Keyboard shortcut handler for playback (Space/JKL/Arrow keys) and
 * iframe shortcut listener setup.
 *
 * Accepts stable playback callbacks and returns the keyboard event handlers
 * and iframe listener setup function. Has no side effects of its own.
 */

import { useRef, useCallback } from "react";
import { useCaptionStore } from "../../captions/store";
import {
  razorClaimsKey,
  shouldIgnorePlaybackShortcutEvent,
  SHUTTLE_SPEEDS,
} from "../lib/playbackShortcuts";
import { canvasNudgeKeysClaimed } from "../../utils/canvasNudgeGate";
import { usePlayerStore } from "../store/playerStore";
import { matchesKey, type StudioKeyAction } from "../components/studioShortcuts";
import { resolveCanvasNudgeDelta } from "../../components/editor/domEditNudge";
import { stepFrameTime } from "../lib/time";
import { useLinkedClipPreferences } from "../../utils/linkedClipPreferences";
import type { PlaybackAdapter } from "../lib/playbackTypes";

interface UsePlaybackKeyboardParams {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  shuttleDirectionRef: React.MutableRefObject<"forward" | "backward" | null>;
  shuttleSpeedIndexRef: React.MutableRefObject<number>;
  iframeShortcutCleanupRef: React.MutableRefObject<(() => void) | null>;
  getAdapter: () => PlaybackAdapter | null;
  play: () => void;
  playBackward: (rate: number) => void;
  pause: () => void;
  seek: (time: number, options?: { keepPlaying?: boolean }) => void;
}

const FRAME_STEPS = {
  frameBack: -1,
  frameForward: 1,
  frameBackTen: -10,
  frameForwardTen: 10,
} as const;
const PLAYBACK_ACTIONS = [
  "playPause",
  ...(Object.keys(FRAME_STEPS) as Array<keyof typeof FRAME_STEPS>),
  "mute",
  "loop",
  "pause",
  "shuttleBack",
  "shuttleForward",
  "inPoint",
  "clearInPoint",
  "outPoint",
  "clearOutPoint",
  "seekToIn",
  "seekToOut",
] as const satisfies readonly StudioKeyAction[];
type PlaybackAction = (typeof PLAYBACK_ACTIONS)[number];

const playbackActionOf = (e: KeyboardEvent): PlaybackAction | undefined =>
  PLAYBACK_ACTIONS.find((action) => matchesKey(e, action));

function ignoresPlaybackKey(e: KeyboardEvent): boolean {
  const captionState = useCaptionStore.getState();
  return shouldIgnorePlaybackShortcutEvent(e, {
    isCaptionEditMode: captionState.isEditMode,
    selectedCaptionSegmentCount: captionState.selectedSegmentIds.size,
  });
}

function handleWorkAreaKey(
  e: KeyboardEvent,
  action: PlaybackAction,
  getAdapter: () => PlaybackAdapter | null,
  seek: UsePlaybackKeyboardParams["seek"],
): boolean {
  const store = usePlayerStore.getState();
  const time = () => getAdapter()?.getTime() ?? store.currentTime;
  const end = () => store.outPoint ?? getAdapter()?.getDuration() ?? store.duration;
  const actions: Partial<Record<PlaybackAction, () => void>> = {
    inPoint: () => store.setInPoint(time()),
    clearInPoint: () => store.setInPoint(null),
    outPoint: () => store.setOutPoint(time()),
    clearOutPoint: () => store.setOutPoint(null),
    seekToIn: () => seek(store.inPoint ?? 0, { keepPlaying: true }),
    seekToOut: () => seek(end(), { keepPlaying: true }),
  };
  const run = actions[action];
  if (!run || razorClaimsKey(e)) return false;
  e.preventDefault();
  run();
  return true;
}

export function usePlaybackKeyboard({
  iframeRef,
  shuttleDirectionRef,
  shuttleSpeedIndexRef,
  iframeShortcutCleanupRef,
  getAdapter,
  play,
  playBackward,
  pause,
  seek,
}: UsePlaybackKeyboardParams) {
  const heldPauseRef = useRef(new Set<string>());
  const playbackKeyDownRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const playbackKeyUpRef = useRef<(e: KeyboardEvent) => void>(() => {});

  const stepFrames = useCallback(
    (deltaFrames: number) => {
      const adapter = getAdapter();
      const currentTime = adapter?.getTime() ?? usePlayerStore.getState().currentTime;
      seek(
        stepFrameTime(currentTime, deltaFrames, useLinkedClipPreferences.getState().compositionFps),
      );
    },
    [getAdapter, seek],
  );

  const shuttle = useCallback(
    (direction: "forward" | "backward") => {
      if (usePlayerStore.getState().playLocked) return;
      if (shuttleDirectionRef.current === direction) {
        shuttleSpeedIndexRef.current = Math.min(
          shuttleSpeedIndexRef.current + 1,
          SHUTTLE_SPEEDS.length - 1,
        );
      } else {
        shuttleSpeedIndexRef.current = 0;
      }
      const speed = SHUTTLE_SPEEDS[shuttleSpeedIndexRef.current];
      usePlayerStore.getState().setPlaybackRate(speed);
      if (direction === "forward") {
        play();
      } else {
        playBackward(speed);
      }
    },
    [play, playBackward, shuttleDirectionRef, shuttleSpeedIndexRef],
  );

  const togglePlay = useCallback(() => {
    if (usePlayerStore.getState().isPlaying) {
      pause();
    } else {
      play();
    }
  }, [play, pause]);

  const handlePlaybackKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.defaultPrevented || ignoresPlaybackKey(e)) return;
      const action = playbackActionOf(e);
      if (action === "pause") heldPauseRef.current.add(e.code || e.key);
      if (!action) return;
      const isFrameStep = action in FRAME_STEPS;
      // A nudgeable canvas selection owns the arrow keys (DomEditOverlay moves
      // the element); frame-stepping would double-handle the same keystroke.
      if (isFrameStep && canvasNudgeKeysClaimed() && resolveCanvasNudgeDelta(e)) return;
      if (e.repeat && action !== "playPause" && !isFrameStep) return;
      const shuttleOrStep = (direction: -1 | 1) =>
        heldPauseRef.current.size > 0
          ? stepFrames(direction)
          : shuttle(direction < 0 ? "backward" : "forward");
      const player = usePlayerStore.getState();
      const run: Partial<Record<PlaybackAction, () => void>> = {
        playPause: togglePlay,
        frameBack: () => stepFrames(FRAME_STEPS.frameBack),
        frameForward: () => stepFrames(FRAME_STEPS.frameForward),
        frameBackTen: () => stepFrames(FRAME_STEPS.frameBackTen),
        frameForwardTen: () => stepFrames(FRAME_STEPS.frameForwardTen),
        mute: () => player.setAudioMuted(!player.audioMuted),
        loop: () => player.setLoopEnabled(!player.loopEnabled),
        pause,
        shuttleBack: () => shuttleOrStep(-1),
        shuttleForward: () => shuttleOrStep(1),
      };
      const act = run[action];
      if (!act) {
        handleWorkAreaKey(e, action, getAdapter, seek);
        return;
      }
      e.preventDefault();
      act();
    },
    [pause, shuttle, stepFrames, togglePlay, getAdapter, seek],
  );

  const handlePlaybackKeyUp = useCallback((e: KeyboardEvent) => {
    heldPauseRef.current.delete(e.code || e.key);
  }, []);

  playbackKeyDownRef.current = handlePlaybackKeyDown;
  playbackKeyUpRef.current = handlePlaybackKeyUp;

  // fallow-ignore-next-line complexity
  const attachIframeShortcutListeners = useCallback(() => {
    iframeShortcutCleanupRef.current?.();
    iframeShortcutCleanupRef.current = null;

    let iframeWin: Window | null = null;
    let iframeDoc: Document | null = null;
    try {
      iframeWin = iframeRef.current?.contentWindow ?? null;
      iframeDoc = iframeRef.current?.contentDocument ?? null;
    } catch {
      return;
    }
    if (!iframeWin && !iframeDoc) return;

    const handleIframeKeyDown = (e: KeyboardEvent) => playbackKeyDownRef.current(e);
    const handleIframeKeyUp = (e: KeyboardEvent) => playbackKeyUpRef.current(e);
    try {
      iframeWin?.addEventListener("keydown", handleIframeKeyDown, true);
      iframeWin?.addEventListener("keyup", handleIframeKeyUp, true);
    } catch {
      /* cross-origin iframe */
    }
    iframeDoc?.addEventListener("keydown", handleIframeKeyDown, true);
    iframeDoc?.addEventListener("keyup", handleIframeKeyUp, true);
    iframeShortcutCleanupRef.current = () => {
      try {
        iframeWin?.removeEventListener("keydown", handleIframeKeyDown, true);
        iframeWin?.removeEventListener("keyup", handleIframeKeyUp, true);
      } catch {
        /* cross-origin iframe */
      }
      iframeDoc?.removeEventListener("keydown", handleIframeKeyDown, true);
      iframeDoc?.removeEventListener("keyup", handleIframeKeyUp, true);
    };
  }, [iframeRef, iframeShortcutCleanupRef]);

  return {
    playbackKeyDownRef,
    playbackKeyUpRef,
    attachIframeShortcutListeners,
    togglePlay,
  };
}
