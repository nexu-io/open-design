import { useI18n } from "../../i18n/I18n";
import { memo, useEffect, useRef } from "react";
import { formatTime } from "../lib/time";
import { liveTime, usePlayerStore } from "../store/playerStore";

export const PreviewSeekBar = memo(function PreviewSeekBar({
  duration,
  disabled,
  onSeek,
}: {
  duration: number;
  disabled: boolean;
  onSeek: (time: number) => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const updateTime = (time: number) => {
      input.value = String(time);
      const text = t("{value0} of {value1}", { value0: formatTime(time), value1: formatTime(duration) });
      if (input.getAttribute("aria-valuetext") !== text) input.setAttribute("aria-valuetext", text);
    };
    updateTime(usePlayerStore.getState().currentTime);
    const unsubscribe = liveTime.subscribe(updateTime);
    return () => {
      unsubscribe();
    };
  }, [duration]);

  return (
    <div className="flex h-3 items-center px-3">
      <input
        ref={inputRef}
        type="range"
        min="0"
        max={duration}
        step="any"
        defaultValue={0}
        disabled={disabled || duration <= 0}
        data-studio-control="seek-preview"
        aria-label={t("Seek preview")}
        onChange={(event) => onSeek(event.currentTarget.valueAsNumber)}
        className="h-6 w-full cursor-pointer accent-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:cursor-default disabled:opacity-30"
      />
    </div>
  );
});
