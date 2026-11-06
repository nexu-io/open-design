import { useI18n } from "../../i18n/I18n";
import { useRef, useEffect, memo } from "react";
import gsap from "gsap";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { formatFrameTime, formatTime } from "../lib/time";
import { liveTime, usePlayerStore } from "../store/playerStore";
import { trackStudioEvent } from "../../utils/studioTelemetry";
import { Tooltip } from "../../components/ui";
import { useMountEffect } from "../../hooks/useMountEffect";
import { useLinkedClipPreferences } from "../../utils/linkedClipPreferences";
import { ShortcutsButton } from "./ShortcutsPanel";
import { keyHint, useStudioKeys, type ShortcutSection } from "./studioShortcuts";
import { SpeedMenu } from "./SpeedMenu";
import { VolumeControl } from "./VolumeControl";
import { PreviewSeekBar } from "./PreviewSeekBar";

/* ── Icon sub-components ─────────────────────────────────────────── */

gsap.registerPlugin(MorphSVGPlugin);

// Play glyph: the right-hand blade from the HyperFrames favicon (points right).
// Pause glyph: two bars centred in the same coordinate space so MorphSVG can
// tween one `d` into the other. Both shapes live in the favicon's 0-100 space
// and the svg viewBox frames the blade's bounding box.
const PLAY_BLADE_D =
  "M87.5129 57.5141L56.9696 73.5433C52.8371 75.7098 48.7046 73.2553 49.6688 69.2104L58.9483 30.1391C59.9125 26.0942 65.2097 23.6397 68.3154 25.8062L91.2447 41.8354C96.4668 45.4796 94.4631 53.8699 87.5129 57.5141Z";
const PAUSE_BARS_D = "M56 28H67V71H56Z M73 28H84V71H73Z";

// Morph the play blade <-> pause bars on toggle via GSAP MorphSVG. Both glyphs
// are one path whose `d` tweens; the initial render matches `playing` with no
// animation, and prefers-reduced-motion snaps instead of tweening.
function PlayPauseMorphIcon({ playing }: { playing: boolean }) {
  const pathRef = useRef<SVGPathElement>(null);
  const isFirstRun = useRef(true);
  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const target = playing ? PAUSE_BARS_D : PLAY_BLADE_D;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (isFirstRun.current || reduceMotion) {
      isFirstRun.current = false;
      gsap.set(el, { morphSVG: target });
      return;
    }
    const tween = gsap.to(el, { duration: 0.28, ease: "power2.inOut", morphSVG: target });
    return () => {
      tween.kill();
    };
  }, [playing]);
  return (
    <span className="relative inline-flex h-3 w-3 items-center justify-center" aria-hidden="true">
      <svg width="12" height="12" viewBox="46 21 54 56" fill="#FAFAFA">
        <path ref={pathRef} d={playing ? PAUSE_BARS_D : PLAY_BLADE_D} />
      </svg>
    </span>
  );
}

/* ── Button sub-components ───────────────────────────────────────── */

const LoopButton = memo(function LoopButton({
  loopEnabled,
  disabled,
  setLoopEnabled,
}: {
  loopEnabled: boolean;
  disabled: boolean;
  setLoopEnabled: (v: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <Tooltip label={t("Loop playback")}>
      <button
        type="button"
        onClick={() => {
          trackStudioEvent("playback", { action: "loop_toggle", enabled: !loopEnabled });
          setLoopEnabled(!loopEnabled);
        }}
        disabled={disabled}
        className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-30 ${
          loopEnabled ? "text-accent-ink" : "text-neutral-500 hover:text-neutral-200"
        }`}
        aria-label={loopEnabled ? t("Disable loop playback") : t("Enable loop playback")}
        aria-pressed={loopEnabled}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M17 2l4 4-4 4" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <path d="M7 22l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      </button>
    </Tooltip>
  );
});

const FullscreenButton = memo(function FullscreenButton({
  isFullscreen,
  onToggleFullscreen,
}: {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const { t } = useI18n();
  const fsKey = keyHint("fullscreen", useStudioKeys());
  return (
    <Tooltip label={isFullscreen ? t("Exit fullscreen ({fsKey})", { fsKey: fsKey }) : t("Enter fullscreen ({fsKey})", { fsKey: fsKey })}>
      <button
        type="button"
        onClick={() => {
          trackStudioEvent("playback", { action: "fullscreen_toggle", active: !isFullscreen });
          onToggleFullscreen();
        }}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
          isFullscreen ? "text-accent-ink" : "text-neutral-500 hover:text-neutral-200"
        }`}
        aria-label={isFullscreen ? t("Exit fullscreen") : t("Enter fullscreen")}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {isFullscreen ? (
            <>
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </>
          ) : (
            <>
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </>
          )}
        </svg>
      </button>
    </Tooltip>
  );
});

/* ── Main component ──────────────────────────────────────────────── */

interface PlayerControlsProps {
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  disabled?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** Replaces the shortcuts panel's list, e.g. DEFAULT_SHORTCUT_SECTIONS with entries dropped or relabelled. */
  shortcutSections?: readonly ShortcutSection[];
}

const compositionFps = () => useLinkedClipPreferences.getState().compositionFps;

export const PlayerControls = memo(function PlayerControls({
  onTogglePlay,
  onSeek,
  disabled = false,
  isFullscreen = false,
  onToggleFullscreen,
  shortcutSections,
}: PlayerControlsProps) {
  const { t } = useI18n();
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const duration = usePlayerStore((s) => s.duration);
  const timelineReady = usePlayerStore((s) => s.timelineReady);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const audioMuted = usePlayerStore((s) => s.audioMuted);
  const audioVolume = usePlayerStore((s) => s.audioVolume);
  const loopEnabled = usePlayerStore((s) => s.loopEnabled);
  const setPlaybackRate = usePlayerStore.getState().setPlaybackRate;
  const setAudioMuted = usePlayerStore.getState().setAudioMuted;
  const setAudioVolume = usePlayerStore.getState().setAudioVolume;
  const setLoopEnabled = usePlayerStore.getState().setLoopEnabled;
  const timeDisplayMode = usePlayerStore((s) => s.timeDisplayMode);
  const setTimeDisplayMode = usePlayerStore.getState().setTimeDisplayMode;

  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const currentTimeRef = useRef(0);
  const timeDisplayModeRef = useRef(timeDisplayMode);
  timeDisplayModeRef.current = timeDisplayMode;

  const durationRef = useRef(duration);
  durationRef.current = duration;
  const controlsDisabled = disabled || !timelineReady;

  useEffect(() => {
    if (!timeDisplayRef.current) return;
    const t = currentTimeRef.current;
    timeDisplayRef.current.textContent =
      timeDisplayMode === "frame" ? formatFrameTime(t, duration, compositionFps()) : formatTime(t);
  }, [duration, timeDisplayMode]);

  useMountEffect(() => {
    const updateTime = (time: number) => {
      currentTimeRef.current = time;
      if (!timeDisplayRef.current) return;
      const currentDuration = durationRef.current;
      const text =
        timeDisplayModeRef.current === "frame"
          ? formatFrameTime(time, currentDuration, compositionFps())
          : formatTime(time);
      if (timeDisplayRef.current.textContent !== text) timeDisplayRef.current.textContent = text;
    };
    const unsubscribe = liveTime.subscribe(updateTime);
    updateTime(usePlayerStore.getState().currentTime);
    return unsubscribe;
  });

  return (
    <div className="relative z-20">
      <PreviewSeekBar duration={duration} disabled={controlsDisabled} onSeek={onSeek} />
      <div
        className="grid h-7 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-3"
        aria-disabled={disabled || undefined}
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <Tooltip
          label={timeDisplayMode === "time" ? t("Switch to frame display") : t("Switch to time display")}
        >
          <button
            type="button"
            onClick={() => setTimeDisplayMode(timeDisplayMode === "time" ? "frame" : "time")}
            disabled={disabled}
            className="min-w-0 justify-self-start whitespace-nowrap font-mono text-[11px] tabular-nums text-neutral-400 transition-colors hover:text-neutral-200 disabled:pointer-events-none"
          >
            <span ref={timeDisplayRef}>{formatTime(0)}</span>
            {timeDisplayMode === "time" ? (
              <>
                <span className="mx-0.5 text-text-off">/</span>
                <span className="text-neutral-600">{formatTime(duration)}</span>
              </>
            ) : null}
          </button>
        </Tooltip>

        <Tooltip label={isPlaying ? t("Pause") : t("Play")}>
          <button
            type="button"
            data-studio-control="playback"
            aria-label={isPlaying ? t("Pause") : t("Play")}
            onClick={() => {
              trackStudioEvent("playback", { action: isPlaying ? "pause" : "play" });
              onTogglePlay();
            }}
            disabled={controlsDisabled}
            className="flex h-7 w-8 items-center justify-center justify-self-center rounded-md text-neutral-100 transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <PlayPauseMorphIcon playing={isPlaying} />
          </button>
        </Tooltip>

        <div className="flex min-w-0 items-center justify-self-end">
          <VolumeControl
            audioMuted={audioMuted}
            audioVolume={audioVolume}
            disabled={controlsDisabled}
            setAudioMuted={setAudioMuted}
            setAudioVolume={setAudioVolume}
          />
          <SpeedMenu
            playbackRate={playbackRate}
            setPlaybackRate={setPlaybackRate}
            disabled={disabled}
          />
          <LoopButton
            loopEnabled={loopEnabled}
            disabled={disabled}
            setLoopEnabled={setLoopEnabled}
          />
          {onToggleFullscreen && (
            <FullscreenButton isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} />
          )}
          <ShortcutsButton disabled={disabled} onSeek={onSeek} sections={shortcutSections} />
        </div>
      </div>
    </div>
  );
});
