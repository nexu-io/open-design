import { useCallback, useMemo } from "react";
import { liveTime, usePlayerStore, type TimelineElement } from "../store/playerStore";
import { useNLEContext } from "../../components/nle/NLEContext";

export interface PlayerHandleElement {
  id: string;
  start: number;
  end: number;
  selector?: string;
  sourceFile?: string;
  compositionSrc?: string;
}

export type PlayerHandleListener = () => void;
export type PlayerHandleTimeListener = (time: number) => void;

export interface PlayerHandle {
  ready: boolean;
  playing: boolean;
  seek: (seconds: number) => boolean;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  readonly currentTime: number;
  duration: number;
  elements: PlayerHandleElement[];
  subscribe: (listener: PlayerHandleListener) => () => void;
  subscribeTime: (listener: PlayerHandleTimeListener) => () => void;
}

function toHandleElement(element: TimelineElement): PlayerHandleElement {
  return {
    id: element.id,
    start: element.start,
    end: element.start + element.duration,
    selector: element.selector,
    sourceFile: element.sourceFile,
    compositionSrc: element.compositionSrc,
  };
}

/**
 * Reads and controls the shell player. Call this under EditorShell/NLEProvider;
 * the provider owns the mounted preview iframe and the single player instance.
 */
export function usePlayerHandle(): PlayerHandle {
  const { play, pause, togglePlay, seek: seekPlayer } = useNLEContext();
  const ready = usePlayerStore((state) => state.timelineReady);
  const playing = usePlayerStore((state) => state.isPlaying);
  const duration = usePlayerStore((state) => state.duration);
  const elements = usePlayerStore((state) => state.elements);

  const seek = useCallback(
    (seconds: number) => {
      if (!ready) return false;
      return seekPlayer(seconds);
    },
    [ready, seekPlayer],
  );

  const subscribe = useCallback((listener: PlayerHandleListener) => {
    let previous = usePlayerStore.getState();
    return usePlayerStore.subscribe((state) => {
      const structuralChange =
        state.timelineReady !== previous.timelineReady ||
        state.isPlaying !== previous.isPlaying ||
        state.duration !== previous.duration ||
        state.elements !== previous.elements;
      previous = state;
      if (structuralChange) listener();
    });
  }, []);

  const subscribeTime = useCallback((listener: PlayerHandleTimeListener) => {
    return liveTime.subscribe(listener);
  }, []);
  const handleElements = useMemo(() => elements.map(toHandleElement), [elements]);

  return {
    ready,
    playing,
    seek,
    play,
    pause,
    togglePlay,
    get currentTime() {
      return usePlayerStore.getState().currentTime;
    },
    duration,
    elements: handleElements,
    subscribe,
    subscribeTime,
  };
}
