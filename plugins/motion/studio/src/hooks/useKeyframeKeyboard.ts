import { useEffect, useCallback } from "react";
import { matchesKey } from "../player/components/studioShortcuts";
import { isTypingTarget } from "../utils/typingTarget";

interface KeyframeKeyboardOptions {
  enabled: boolean;
  onAddKeyframe?: () => void;
}

export function useKeyframeKeyboard({ enabled, onAddKeyframe }: KeyframeKeyboardOptions): void {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled || !onAddKeyframe) return;
      if (isTypingTarget(document.activeElement)) return;
      if (!matchesKey(e, "addKeyframe")) return;
      // K is also playback's stop key: claiming it here keeps playback from also pausing.
      e.preventDefault();
      e.stopImmediatePropagation();
      onAddKeyframe();
    },
    [enabled, onAddKeyframe],
  );

  useEffect(() => {
    if (!enabled) return;
    // Capture phase: run before usePlaybackKeyboard's (bubble-phase) JKL handler
    // so an active keyframe shortcut can claim the key.
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [enabled, handler]);
}
