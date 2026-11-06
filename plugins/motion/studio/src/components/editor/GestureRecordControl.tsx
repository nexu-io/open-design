import { useI18n } from "../../i18n/I18n";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { keyHint, useStudioKeys } from "../../player/components/studioShortcuts";

export type GestureRecordingState = "idle" | "recording" | "preview";

interface GestureRecordIconProps {
  recording: boolean;
}

function GestureRecordIcon({ recording }: GestureRecordIconProps) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      {recording ? (
        <rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" />
      ) : (
        <circle cx="5" cy="5" r="4.5" fill="currentColor" />
      )}
    </svg>
  );
}

interface GestureRecordPanelButtonProps {
  recordingState?: GestureRecordingState;
  recordingDuration?: number;
  onToggleRecording: () => void;
}

export function GestureRecordPanelButton({
  recordingState,
  recordingDuration,
  onToggleRecording,
}: GestureRecordPanelButtonProps) {
  const { t } = useI18n();
  const recordKey = keyHint("record", useStudioKeys());
  const recording = recordingState === "recording";
  const track = useTrackDesignInput();

  return (
    <div className="px-4 pb-3">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          track("button", "Gesture recording");
          onToggleRecording();
        }}
        className={`w-full flex items-center justify-center gap-2 rounded-lg py-2 text-[11px] font-medium transition-colors ${
          recording
            ? "bg-red-500/15 text-danger-ink border border-red-500/30 animate-pulse"
            : "bg-panel-input text-panel-text-2 hover:bg-panel-hover border border-panel-border"
        }`}
      >
        <GestureRecordIcon recording={recording} />
        {recording
          ? t("Stop recording {value0}s -- press {recordKey}", { value0: (recordingDuration ?? 0).toFixed(1), recordKey: recordKey })
          : t("Record gesture ({recordKey}) -- move pointer to capture motion", { recordKey: recordKey })}
      </button>
    </div>
  );
}

interface GestureRecordBadgeProps {
  rect: { left: number; top: number; width: number; height: number };
  recordingState?: GestureRecordingState;
  onToggleRecording: () => void;
}

export function GestureRecordBadge({
  rect,
  recordingState,
  onToggleRecording,
}: GestureRecordBadgeProps) {
  const { t } = useI18n();
  const recordKey = keyHint("record", useStudioKeys());
  const recording = recordingState === "recording";
  const label = recording
    ? t("Stop gesture recording ({recordKey})", { recordKey: recordKey })
    : t("Record gesture ({recordKey})", { recordKey: recordKey });

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`pointer-events-auto absolute z-20 flex h-7 w-7 items-center justify-center rounded-full border shadow-lg transition-colors ${
        recording
          ? "border-danger/60 bg-danger text-on-danger animate-pulse"
          : "border-studio-accent/60 bg-neutral-950 text-accent-ink hover:bg-neutral-900"
      }`}
      style={{
        left: Math.max(0, rect.left + rect.width + 8),
        top: Math.max(0, rect.top - 4),
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleRecording();
      }}
    >
      <GestureRecordIcon recording={recording} />
    </button>
  );
}
