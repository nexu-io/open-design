import { useI18n } from "../../i18n/I18n";
import { memo } from "react";
import { Tooltip } from "../../components/ui";
import { trackStudioEvent } from "../../utils/studioTelemetry";

interface VolumeControlProps {
  audioMuted: boolean;
  audioVolume: number;
  disabled: boolean;
  setAudioMuted: (muted: boolean) => void;
  setAudioVolume: (volume: number) => void;
}

function VolumeIcon({ muted, volume }: { muted: boolean; volume: number }) {
  const silent = muted || volume === 0;
  return (
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
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      {silent ? (
        <>
          <path d="m19 9-6 6" />
          <path d="m13 9 6 6" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          {volume >= 0.5 ? <path d="M18.5 5.5a9 9 0 0 1 0 13" /> : null}
        </>
      )}
    </svg>
  );
}

export const VolumeControl = memo(function VolumeControl({
  audioMuted,
  audioVolume,
  disabled,
  setAudioMuted,
  setAudioVolume,
}: VolumeControlProps) {
  const { t } = useI18n();
  const percentage = Math.round(audioVolume * 100);
  const silent = audioMuted || audioVolume === 0;
  const muteLabel = t(silent ? "Unmute audio" : "Mute audio");

  return (
    <div className="group flex shrink-0 items-center">
      <div className="w-0 overflow-hidden opacity-0 transition-[width,opacity] duration-150 ease-out group-hover:w-14 group-hover:opacity-100 group-focus-within:w-14 group-focus-within:opacity-100">
        <div className="relative mx-1 flex h-6 w-12 items-center">
          <div className="absolute inset-x-0 h-0.5 overflow-hidden rounded-full bg-neutral-700">
            <div
              className="h-full rounded-full bg-neutral-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={percentage}
            disabled={disabled}
            aria-label={t("Preview volume")}
            aria-valuetext={`${percentage}%`}
            title={t("Preview volume: {percentage}%", { percentage: percentage })}
            onChange={(event) => {
              const volume = Number(event.currentTarget.value) / 100;
              setAudioVolume(volume);
              if (audioMuted && volume > 0) setAudioMuted(false);
            }}
            className="hf-preview-volume-range absolute inset-0 w-full disabled:pointer-events-none"
          />
        </div>
      </div>

      <Tooltip label={muteLabel}>
        <button
          type="button"
          onClick={() => {
            trackStudioEvent("playback", { action: "mute_toggle", muted: !silent });
            if (silent && audioVolume === 0) setAudioVolume(1);
            setAudioMuted(!silent);
          }}
          disabled={disabled}
          aria-label={muteLabel}
          aria-pressed={silent}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-30 ${
            silent ? "text-accent-ink" : "text-neutral-500 hover:text-neutral-200"
          }`}
        >
          <VolumeIcon muted={audioMuted} volume={audioVolume} />
        </button>
      </Tooltip>
    </div>
  );
});
