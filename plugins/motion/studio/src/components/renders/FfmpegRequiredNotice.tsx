import { useI18n } from "../../i18n/I18n";
import { memo, useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "../../utils/clipboard";
import type { FfmpegStatus } from "./useFfmpegStatus";

const DOWNLOAD_URL = "https://ffmpeg.org/download.html";
const CUE_MS = 1600;

// Matches the focus treatment every other button in this panel uses. A control
// the keyboard can reach but not see focus on is unusable without a mouse.
const FOCUS_RING =
  "outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-studio-accent";

/**
 * Shown above Export when the dev server reports no usable FFmpeg.
 *
 * This exists because the failure it replaces was the single most reported
 * Studio problem: the user built a composition, pressed Export, and got
 * "Server error (503)". The encoder had never been installed, the server knew
 * that, and nothing said so. Saying it before the work starts, with a command
 * they can paste, is the whole point, so the command is the loudest element
 * here and not the apology.
 */
export const FfmpegRequiredNotice = memo(function FfmpegRequiredNotice({
  status,
  checking,
  onRecheck,
}: {
  status: FfmpegStatus;
  checking: boolean;
  onRecheck: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  // A recheck that finds nothing changes no other pixel on screen, so without
  // this the button reads as broken at the exact moment the user is most
  // unsure. Motion alone would not do: the result has to survive being missed.
  const [recheckFailed, setRecheckFailed] = useState(false);
  const wasChecking = useRef(false);
  const cueTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    // Still mounted after a check finished means the answer was "still no":
    // a success unmounts this card entirely.
    if (wasChecking.current && !checking) setRecheckFailed(true);
    wasChecking.current = checking;
  }, [checking]);

  useEffect(() => {
    if (!recheckFailed) return;
    cueTimer.current = setTimeout(() => setRecheckFailed(false), CUE_MS);
    return () => clearTimeout(cueTimer.current);
  }, [recheckFailed]);

  useEffect(() => () => clearTimeout(cueTimer.current), []);

  const copy = async (command: string) => {
    const ok = await copyTextToClipboard(command);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), CUE_MS);
  };

  // Concentric: outer radius (12) minus padding (10) equals the inner radius
  // (2). Mismatched nesting here is what makes a card look subtly wrong.
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold text-warning-ink">
          {status.title ?? "FFmpeg not found"}
        </span>
        {/* text-2, not the panel's usual text-4 for secondary copy: the amber
            wash lifts the background, and text-4 measures 2.2:1 on it against
            the 4.5:1 minimum. This is the line that explains why Export is
            off, so it has to be readable. text-2 measures 6.6:1. */}
        <span className="text-[10px] leading-snug text-pretty text-panel-text-2">
          {status.detail ?? "FFmpeg is required to encode video."}
        </span>
      </div>

      {status.command ? (
        <div className="flex items-center gap-1.5">
          <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-xs bg-input px-2 py-1 text-[10px] text-panel-text-2">
            {status.command}
          </code>
          {/* Fixed width so swapping the label to "Copied" cannot shift the
              command block sideways under the pointer. */}
          <button
            type="button"
            onClick={() => void copy(status.command ?? "")}
            className={`h-6 w-14 shrink-0 rounded-xs border border-amber-500/30 text-[10px] font-medium text-warning-ink transition-colors hover:bg-amber-500/20 active:scale-[0.98] ${FOCUS_RING}`}
          >
            {copied ? t("Copied") : t("Copy")}
          </button>
        </div>
      ) : (
        status.hint && (
          <span className="text-[10px] leading-snug text-pretty text-panel-text-2">
            {status.hint}
          </span>
        )
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRecheck}
          disabled={checking}
          className={`rounded-xs py-0.5 text-[10px] font-medium text-warning-ink underline-offset-2 transition-colors hover:underline disabled:opacity-50 ${FOCUS_RING}`}
        >
          {checking ? t("Checking…") : t("Recheck")}
        </button>
        <a
          href={DOWNLOAD_URL}
          target="_blank"
          rel="noreferrer"
          className={`rounded-xs py-0.5 text-[10px] text-panel-text-2 underline-offset-2 transition-colors hover:text-panel-text-0 hover:underline ${FOCUS_RING}`}
        >
          {t("Other install options")}</a>
        {/* Last in the row and only ever appended, so appearing and vanishing
            moves nothing that sits before it. */}
        <span
          aria-live="polite"
          className="ml-auto text-[10px] text-panel-text-2 transition-opacity"
        >
          {recheckFailed ? t("Still not found") : ""}
        </span>
      </div>
    </div>
  );
});
