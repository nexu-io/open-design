import { useI18n } from "../../i18n/I18n";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import {
  AUDIO_GAIN_FADER_MIN,
  AUDIO_GAIN_FADER_MAX,
  audioGainToFaderPosition,
  audioFaderPositionToGain,
  audioGainToText,
  formatAudioGain,
} from "@hyperframes/core/audio-gain";
import type { StereoLevel } from "@hyperframes/core/runtime/levelTap";
import { usePlayerStore } from "../../player";
import { clampNumber } from "../../utils/studioHelpers";
import { useAudioMetersVisible } from "../../utils/audioMeterVisibility";
import { EXPORT_PEAK_CEILING } from "../../utils/exportPeakCeiling";
import { useStudioShellContextOptional } from "../../contexts/StudioContext";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";
import {
  METER_DB_MARKS,
  useProjectHasAudio,
  markFraction,
  stepPair,
  type MeterPair as Pair,
} from "../../utils/audioMeterMath";

interface Levels {
  master: StereoLevel;
  groups: Record<string, StereoLevel>;
}
interface AudioMeterHook {
  start(): void;
  stop(): void;
  read(): Levels;
}
interface Strip {
  id: string | null;
  label: string;
  volume: number;
}
type Bars = { mask: HTMLElement | null; peak: HTMLElement | null };
type StripBars = [Bars, Bars];

const MONITOR_LABEL = "Monitor";

/** The CLIP light latches at the export ceiling, stricter than RED_AT. */
export const CLIP_LATCH_PEAK = EXPORT_PEAK_CEILING;

export function stepClipLatch(latched: boolean, master: StereoLevel | undefined): boolean {
  if (latched || !master) return latched;
  return Math.max(master.l, master.r) >= CLIP_LATCH_PEAK;
}

function paintClipLight(el: HTMLElement | null, lit: boolean): void {
  if (!el) return;
  el.dataset.lit = String(lit);
  el.style.setProperty(
    "background-color",
    lit ? "var(--color-red-500)" : "var(--color-neutral-800)",
  );
  el.style.setProperty("color", lit ? "var(--color-white)" : "var(--color-neutral-500)");
}

/** Where the fill turns amber, then red, on the same piecewise dB scale the marks use. */
const AMBER_AT = markFraction(-6);
const RED_AT = markFraction(-3);

function useStrips(): Strip[] {
  const elements = usePlayerStore((s) => s.elements);
  const masterVolume = usePlayerStore((s) => s.audioVolume);
  return useMemo(() => {
    const labels = new Map<string, string>();
    const volumes = new Map<string, number>();
    for (const el of elements) {
      if (el.audioGroup && !labels.has(el.audioGroup)) {
        labels.set(el.audioGroup, el.audioGroupLabel ?? el.audioGroup);
        volumes.set(el.audioGroup, el.audioGroupVolume ?? 1);
      }
    }
    return [
      ...[...labels].map(([id, label]) => ({ id, label, volume: volumes.get(id) ?? 1 })),
      { id: null, label: MONITOR_LABEL, volume: masterVolume },
    ];
  }, [elements, masterVolume]);
}

/** Group volume through the existing `data-volume` write path (live while dragging, one
 *  undo entry on release); monitor volume through the player store's own volume action —
 *  the same one `VolumeControl` in `PlayerControls` already drives. */
function useVolumeHandlers(): {
  onLive: (id: string | null, volume: number) => void;
  onCommit: (id: string | null, volume: number) => void;
} {
  const { onSetAudioGroupAttributeLive, onSetAudioGroupAttributeQuiet } =
    useTimelineEditContextOptional();
  const setAudioVolume = usePlayerStore((s) => s.setAudioVolume);
  const onLive = useCallback(
    (id: string | null, volume: number) => {
      if (id === null) setAudioVolume(volume);
      else onSetAudioGroupAttributeLive?.(id, "data-volume", formatAudioGain(volume));
    },
    [onSetAudioGroupAttributeLive, setAudioVolume],
  );
  const onCommit = useCallback(
    (id: string | null, volume: number) => {
      if (id === null) setAudioVolume(volume);
      else
        void onSetAudioGroupAttributeQuiet?.(
          id,
          "data-volume",
          formatAudioGain(volume),
          "Set volume",
        );
    },
    [onSetAudioGroupAttributeQuiet, setAudioVolume],
  );
  return { onLive, onCommit };
}

type PreviewWindow = (Window & { __hf?: { audioMeter?: AudioMeterHook } }) | null | undefined;

function readHook(iframe: HTMLIFrameElement | null | undefined): AudioMeterHook | null {
  try {
    return (iframe?.contentWindow as PreviewWindow)?.__hf?.audioMeter ?? null;
  } catch {
    return null;
  }
}

/** 0 dB is bottom 100% plus 1px down, so the tick stays inside overflow-hidden.
 *  A calc() bottom does not stick as an inline style on Windows happy-dom. */
function paintPeak(el: HTMLElement | null, peak: number): void {
  if (!el) return;
  el.style.setProperty("bottom", `${peak * 100}%`);
  el.style.setProperty("transform", peak >= 1 ? "translateY(1px)" : "none");
}

/** The fill is a fixed green/amber/red backdrop; painting only moves the dark mask that covers the unlit top
 *  portion, so a loud peak lights the real red band instead of tinting a flat colour brighter. */
function paint(bars: StripBars | undefined, channels: Pair): void {
  channels.forEach((ch, i) => {
    bars?.[i]?.mask?.style.setProperty("height", `${(1 - ch.level) * 100}%`);
    paintPeak(bars?.[i]?.peak ?? null, ch.peak);
  });
}

/** Attach to the live preview hook. Always returns `live`, even if start/stop throw. */
export function followMeterHook(
  active: AudioMeterHook | null,
  live: AudioMeterHook | null,
): AudioMeterHook | null {
  if (live === active) return active;
  try {
    active?.stop();
  } catch {
    // Preview iframe was torn down; the old hook is uncallable.
  }
  try {
    live?.start();
  } catch {
    // New preview is not ready to attach yet.
  }
  return live;
}

export function evictGoneMeterState(
  state: Map<string | null, Pair>,
  liveIds: ReadonlySet<string | null>,
): void {
  for (const id of [...state.keys()]) {
    if (!liveIds.has(id)) state.delete(id);
  }
}

export function stepAndPaintStrips(
  strips: readonly { id: string | null }[],
  state: Map<string | null, Pair>,
  bars: Map<string | null, StripBars>,
  levels: Levels | undefined,
  now: number,
  dt: number,
): void {
  for (const { id } of strips) {
    const prev = state.get(id);
    const next = stepPair(prev, id === null ? levels?.master : levels?.groups[id], now, dt);
    if (next === prev) continue;
    state.set(id, next);
    paint(bars.get(id), next);
  }
}

/** One rAF loop re-reads the hook off the live preview window, so a reloaded iframe is followed. */
interface ClipLatch {
  lit: boolean;
  light: HTMLElement | null;
}

function useMeterLoop(
  strips: Strip[],
  bars: RefObject<Map<string | null, StripBars>>,
  iframeRef: RefObject<HTMLIFrameElement | null> | undefined,
  clip: RefObject<ClipLatch>,
) {
  const shell = useStudioShellContextOptional();
  const previewIframeRef = iframeRef ?? shell?.previewIframeRef;
  const stripsRef = useRef(strips);
  stripsRef.current = strips;
  useEffect(() => {
    let raf = 0;
    let active: AudioMeterHook | null = null;
    let last = performance.now();
    const state = new Map<string | null, Pair>();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      active = followMeterHook(active, readHook(previewIframeRef?.current));
      const levels = active?.read();
      const dt = now - last;
      last = now;
      evictGoneMeterState(state, new Set(stripsRef.current.map((s) => s.id)));
      stepAndPaintStrips(stripsRef.current, state, bars.current, levels, now, dt);
      const lit = stepClipLatch(clip.current.lit, levels?.master);
      if (lit !== clip.current.lit) {
        clip.current.lit = lit;
        paintClipLight(clip.current.light, lit);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      try {
        active?.stop();
      } catch {
        // Preview iframe already gone.
      }
    };
  }, [previewIframeRef, bars, clip]);
}

function ClipLight({ clip }: { clip: RefObject<ClipLatch> }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      data-testid="meter-clip-light"
      data-lit="false"
      title={t("Lights when the preview reaches −1 dBFS, the export ceiling. Click to reset.")}
      ref={(el) => {
        clip.current.light = el;
        paintClipLight(el, clip.current.lit);
      }}
      onClick={() => {
        clip.current.lit = false;
        paintClipLight(clip.current.light, false);
      }}
      className="rounded-[2px] px-1 font-mono text-[9px] leading-[14px] font-bold tracking-wide"
    >
      {t("CLIP")}</button>
  );
}

function Bar({ maskRef, peakRef }: { maskRef: Ref<HTMLDivElement>; peakRef: Ref<HTMLDivElement> }) {
  return (
    <div className="scheme-dark relative h-full w-[18px] overflow-hidden rounded-[2px] bg-neutral-900">
      <div
        className="absolute inset-x-0 bottom-0 bg-green-500"
        style={{ height: `${AMBER_AT * 100}%` }}
      />
      <div
        className="absolute inset-x-0 bg-amber-500"
        style={{ bottom: `${AMBER_AT * 100}%`, height: `${(RED_AT - AMBER_AT) * 100}%` }}
      />
      <div
        className="absolute inset-x-0 top-0 bg-red-500"
        style={{ height: `${(1 - RED_AT) * 100}%` }}
      />
      <div
        ref={maskRef}
        data-testid="meter-mask"
        className="absolute inset-x-0 top-0 bg-neutral-900"
        style={{ height: "100%" }}
      />
      <div
        ref={peakRef}
        data-testid="meter-peak"
        className="absolute inset-x-0 bottom-0 h-px bg-text-0"
      />
    </div>
  );
}

/** Uses the authored clip-gain scale; meter readings have a separate scale. */
function Fader({
  label,
  title,
  volume,
  maxPosition,
  onLive,
  onCommit,
}: {
  label: string;
  title: string;
  volume: number;
  maxPosition: number;
  onLive: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<number | null>(null);
  const position = audioGainToFaderPosition(volume);
  const span = maxPosition - AUDIO_GAIN_FADER_MIN;
  const fraction = (position - AUDIO_GAIN_FADER_MIN) / span;
  const readout = audioGainToText(volume);

  const positionAt = useCallback(
    (clientY: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.height === 0) return position;
      return (
        AUDIO_GAIN_FADER_MIN + clampNumber(1 - (clientY - rect.top) / rect.height, 0, 1) * span
      );
    },
    [position, span],
  );

  const moveTo = (clientY: number) => {
    const gain = audioFaderPositionToGain(positionAt(clientY));
    draggingRef.current = gain;
    onLive(gain);
  };
  const finishDrag = () => {
    if (draggingRef.current === null) return;
    const gain = draggingRef.current;
    draggingRef.current = null;
    onCommit(gain);
  };
  const keyPositions = new Map([
    ["ArrowUp", position + span * 0.02],
    ["ArrowDown", position - span * 0.02],
    ["PageUp", position + span * 0.1],
    ["PageDown", position - span * 0.1],
    ["Home", AUDIO_GAIN_FADER_MIN],
    ["End", maxPosition],
  ]);

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      title={`${title}: ${readout}`}
      aria-orientation="vertical"
      aria-valuemin={AUDIO_GAIN_FADER_MIN}
      aria-valuemax={maxPosition}
      aria-valuenow={Math.round(position)}
      aria-valuetext={readout}
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        moveTo(e.clientY);
      }}
      onPointerMove={(e: ReactPointerEvent<HTMLDivElement>) => {
        if (draggingRef.current === null) return;
        moveTo(e.clientY);
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onLostPointerCapture={finishDrag}
      onKeyDown={(e) => {
        const next = keyPositions.get(e.key);
        if (next === undefined) return;
        onCommit(audioFaderPositionToGain(clampNumber(next, AUDIO_GAIN_FADER_MIN, maxPosition)));
        e.preventDefault();
      }}
      className="relative h-full w-2 shrink-0 cursor-ns-resize touch-none rounded-full bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-studio-accent"
    >
      <div
        className="absolute inset-x-[-3px] h-1.5 -translate-y-1/2 rounded-full bg-neutral-200"
        style={{ bottom: `${fraction * 100}%` }}
      />
    </div>
  );
}

function MeterStrip({
  strip,
  register,
  onLive,
  onCommit,
  clipLight,
}: {
  strip: Strip;
  register: (id: string | null, bars: StripBars | null) => void;
  onLive: (id: string | null, volume: number) => void;
  onCommit: (id: string | null, volume: number) => void;
  clipLight?: ReactNode;
}) {
  const { t } = useI18n();
  const refs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ] as const;
  useEffect(() => {
    register(strip.id, [
      { mask: refs[0].current, peak: refs[1].current },
      { mask: refs[2].current, peak: refs[3].current },
    ]);
    return () => register(strip.id, null);
    // refs are stable objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strip.id, register]);
  return (
    <div className="flex w-[104px] shrink-0 flex-col items-center gap-1 px-1.5 pt-2 pb-1">
      {clipLight}
      <div
        className="flex min-h-0 flex-1 items-stretch gap-1.5"
        aria-label={t("{value0} level", { value0: strip.label })}
      >
        <Fader
          label={t("{value0} volume", { value0: strip.label })}
          title={strip.id === null ? t("Preview monitor volume") : t("{value0} volume", { value0: strip.label })}
          volume={strip.volume}
          maxPosition={strip.id === null ? audioGainToFaderPosition(1) : AUDIO_GAIN_FADER_MAX}
          onLive={(v) => onLive(strip.id, v)}
          onCommit={(v) => onCommit(strip.id, v)}
        />
        <div className="relative w-5 font-mono text-[9px] leading-none text-neutral-500">
          {METER_DB_MARKS.map((db) => (
            <span
              key={db}
              className="absolute right-0 translate-y-1/2"
              style={{ bottom: `${markFraction(db) * 100}%` }}
            >
              {db}
            </span>
          ))}
        </div>
        <div className="flex items-stretch gap-0.5">
          <Bar maskRef={refs[0]} peakRef={refs[1]} />
          <Bar maskRef={refs[2]} peakRef={refs[3]} />
        </div>
      </div>
      <span className="max-w-full truncate text-[10px] text-neutral-400" title={strip.label}>
        {strip.label}
      </span>
    </div>
  );
}

export interface AudioMeterStripProps {
  /** Pass a stable ref (useRef): a new object each render restarts the meter loop. */
  previewIframeRef?: RefObject<HTMLIFrameElement | null>;
}

export const AudioMeterStrip = memo(function AudioMeterStrip({
  previewIframeRef,
}: AudioMeterStripProps) {
  const visible = useAudioMetersVisible((s) => s.visible);
  const projectHasAudio = useProjectHasAudio();
  if (!visible || !projectHasAudio) return null;
  return <MeterStripBody previewIframeRef={previewIframeRef} />;
});

function MeterStripBody({ previewIframeRef }: AudioMeterStripProps) {
  const strips = useStrips();
  const bars = useRef(new Map<string | null, StripBars>());
  const register = useRef((id: string | null, b: StripBars | null) => {
    if (b) bars.current.set(id, b);
    else bars.current.delete(id);
  }).current;
  const { onLive, onCommit } = useVolumeHandlers();
  const clip = useRef<ClipLatch>({ lit: false, light: null });
  useMeterLoop(strips, bars, previewIframeRef, clip);
  return (
    <div
      data-testid="audio-meter-strip"
      className="flex shrink-0 overflow-x-auto border-l border-neutral-800/50 bg-neutral-950"
    >
      {strips.map((strip) => (
        <MeterStrip
          key={strip.id ?? "master"}
          strip={strip}
          register={register}
          onLive={onLive}
          onCommit={onCommit}
          clipLight={strip.id === null ? <ClipLight clip={clip} /> : undefined}
        />
      ))}
    </div>
  );
}
