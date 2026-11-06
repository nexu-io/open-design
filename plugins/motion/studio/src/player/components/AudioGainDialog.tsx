import { useI18n } from "../../i18n/I18n";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { audioGainToDb } from "@hyperframes/core/audio-gain";
import type { TimelineElement } from "../store/timelineElement";
import { usePlayerStore } from "../store/playerStore";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";
import { useStudioShellContextOptional } from "../../contexts/StudioContext";
import { measureClipSourcePeak } from "./clipPeakMap";
import { AUDIO_GAIN_LABEL, normalizeClipsLoudness, writeClipGains } from "./audioGainApply";
import { useAudioGainDialogStore } from "./audioGainDialogStore";
import {
  peakAmplitudeDb,
  planAudioGain,
  type AudioGainClip,
  type AudioGainMode,
} from "./audioGainPlan";

type DialogMode = AudioGainMode | "loudness";

const PEAK_MODES: ReadonlySet<DialogMode> = new Set(["normalize-max", "normalize-all"]);

const ROWS: ReadonlyArray<{ mode: AudioGainMode; label: string }> = [
  { mode: "set", label: "Set Gain to" },
  { mode: "adjust", label: "Adjust Gain by" },
  { mode: "normalize-max", label: "Normalize Max Peak to" },
  { mode: "normalize-all", label: "Normalize All Peaks to" },
];

const keyOf = (el: TimelineElement) => el.key ?? el.id;
const currentGainDb = (el: TimelineElement | undefined) => {
  const gain = el?.volume ?? 1;
  return gain > 0 ? Math.round(audioGainToDb(gain) * 10) / 10 : -60;
};
const dbText = (db: number) => `${db < 0 ? "−" : ""}${Math.abs(db).toFixed(1)} dB`;

function useSourcePeaks(elements: readonly TimelineElement[], projectId: string | null) {
  const [peaks, setPeaks] = useState<Map<string, number | null> | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let live = true;
    void Promise.all(elements.map((el) => measureClipSourcePeak(el, projectId))).then((found) => {
      if (live) setPeaks(new Map(elements.map((el, i) => [keyOf(el), found[i] ?? null])));
    });
    return () => {
      live = false;
    };
  }, [elements, projectId]);
  return peaks;
}

function Row({
  checked,
  disabled,
  label,
  onSelect,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onSelect: () => void;
  children?: ReactNode;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-3 py-1 ${disabled ? "opacity-40" : ""}`}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name="audio-gain-mode"
          checked={checked}
          disabled={disabled}
          onChange={onSelect}
        />
        {label}
      </span>
      {children}
    </label>
  );
}

/** Premiere's Audio Gain dialog for the clips the store names. */
export function AudioGainDialog({
  elements,
  onClose,
}: {
  elements: readonly TimelineElement[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const shell = useStudioShellContextOptional();
  const edit = useTimelineEditContextOptional();
  const sessionProjectId = usePlayerStore((s) => s.timelineProjectId);
  const projectId = shell?.projectId ?? sessionProjectId;
  const showToast = shell?.showToast ?? edit.onNotice;
  const peaks = useSourcePeaks(elements, projectId);
  const [mode, setMode] = useState<DialogMode>("adjust");
  const [values, setValues] = useState<Record<AudioGainMode, number>>(() => ({
    set: currentGainDb(elements[0]),
    adjust: 0,
    "normalize-max": 0,
    "normalize-all": 0,
  }));
  const clips: AudioGainClip[] = elements.map((el) => ({
    key: keyOf(el),
    gain: el.volume ?? 1,
    sourcePeak: peaks?.get(keyOf(el)) ?? null,
  }));
  const peakDb = peakAmplitudeDb(clips);
  const outOfRange = PEAK_MODES.has(mode) && mode !== "loudness" && values[mode] > 0;
  const canApply = !outOfRange && !(PEAK_MODES.has(mode) && peakDb === null);

  const apply = async () => {
    if (!canApply) return;
    onClose();
    try {
      if (mode === "loudness") {
        if (!projectId) return;
        showToast?.(await normalizeClipsLoudness(projectId, elements, edit), "info");
        return;
      }
      const byKey = new Map(elements.map((el) => [keyOf(el), el]));
      const plan = planAudioGain(clips, { mode, db: values[mode] });
      const edits = plan.flatMap(({ key, gain }) => {
        const element = byKey.get(key);
        return element ? [{ element, gain }] : [];
      });
      await writeClipGains(edits, edit, AUDIO_GAIN_LABEL);
    } catch (error) {
      showToast?.(error instanceof Error ? error.message : String(error), "error");
    }
  };

  const field = (rowMode: AudioGainMode) => (
    <span className="flex items-center gap-1">
      <input
        type="number"
        step={0.1}
        max={PEAK_MODES.has(rowMode) ? 0 : undefined}
        aria-label={`${ROWS.find((row) => row.mode === rowMode)?.label ?? ""} dB`}
        value={values[rowMode]}
        disabled={mode !== rowMode}
        className="w-16 rounded border border-neutral-700 bg-neutral-950 px-1 text-right disabled:opacity-50"
        onChange={(event) =>
          setValues((prev) => ({ ...prev, [rowMode]: Number(event.target.value) || 0 }))
        }
      />
      dB
    </span>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50"
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={AUDIO_GAIN_LABEL}
        className="w-[340px] rounded-md border border-neutral-700 bg-neutral-900 p-4 text-xs text-neutral-200 shadow-xl"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") onClose();
          if (event.key !== "Enter") return;
          event.preventDefault();
          void apply();
        }}
      >
        <div className="mb-3 text-sm font-medium">{AUDIO_GAIN_LABEL}</div>
        {ROWS.map((row) => (
          <Row
            key={row.mode}
            label={row.label}
            checked={mode === row.mode}
            disabled={PEAK_MODES.has(row.mode) && peaks !== null && peakDb === null}
            onSelect={() => setMode(row.mode)}
          >
            {field(row.mode)}
          </Row>
        ))}
        <Row
          label={t("Normalize loudness to −16 LUFS")}
          checked={mode === "loudness"}
          onSelect={() => setMode("loudness")}
        />
        <div className="mt-3 text-neutral-400" data-testid="audio-gain-peak">
          {t("Peak Amplitude:")}{" "}
          {peaks === null ? t("measuring…") : peakDb === null ? t("Unavailable") : dbText(peakDb)}
        </div>
        {outOfRange && <div className="mt-1 text-red-400">{t("Peak targets must be 0 dB or lower.")}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1 text-neutral-300 hover:bg-neutral-800"
            onClick={onClose}
          >
            {t("Cancel")}</button>
          <button
            type="button"
            disabled={!canApply}
            autoFocus
            className="rounded bg-blue-500 px-3 py-1 text-white disabled:opacity-40"
            onClick={() => void apply()}
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Mounted in the timeline's overlays so Studio and embedders that mount the Timeline both get it. */
export function TimelineAudioGainOverlay() {
  const targetKeys = useAudioGainDialogStore((s) => s.targetKeys);
  const close = useAudioGainDialogStore((s) => s.close);
  const elements = usePlayerStore((s) => s.elements);
  const targets = useMemo(() => {
    const wanted = new Set(targetKeys ?? []);
    return elements.filter((el) => wanted.has(keyOf(el)));
  }, [elements, targetKeys]);
  if (!targetKeys || targets.length === 0) return null;
  return <AudioGainDialog key={targetKeys.join("\n")} elements={targets} onClose={close} />;
}
