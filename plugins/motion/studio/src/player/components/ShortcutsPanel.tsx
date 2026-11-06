import { useI18n } from "../../i18n/I18n";
import { useState, useCallback, useRef, memo } from "react";
import { formatTime, frameToSeconds } from "../lib/time";
import { Popover, Tooltip } from "../../components/ui";
import { flatActive, flatIdle } from "../../components/timelineToolbarStyles";
import { usePlayerStore } from "../store/playerStore";
import { useCompositionFps } from "../../utils/linkedClipPreferences";
import { useShortcutSections, type ShortcutSection } from "./studioShortcuts";

interface ShortcutsPanelProps {
  disabled: boolean;
  duration: number;
  inPoint: number | null;
  outPoint: number | null;
  setInPoint: (v: number | null) => void;
  setOutPoint: (v: number | null) => void;
  onSeek: (time: number) => void;
  sections?: readonly ShortcutSection[];
}

/** Stays above its button, shrinking to the room there, rather than flipping down over the timeline. */
const STAY_ABOVE = { side: "none", align: "shift", fallbackAxisSide: "none" } as const;

export const ShortcutsPanel = memo(function ShortcutsPanel({
  disabled,
  duration,
  inPoint,
  outPoint,
  setInPoint,
  setOutPoint,
  onSeek,
  sections: hostSections,
}: ShortcutsPanelProps) {
  const { t } = useI18n();
  const sections = useShortcutSections(hostSections);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [jumpFrame, setJumpFrame] = useState("");
  const compositionFps = useCompositionFps();
  // Focus lands on the scrolling body, not the frame input, so keyboard users can scroll and read it.
  const panelBodyRef = useRef<HTMLDivElement>(null);

  const commitJumpFrame = useCallback(() => {
    if (disabled) return;
    const frame = Number.parseInt(jumpFrame, 10);
    if (!Number.isFinite(frame) || duration <= 0) return;
    onSeek(Math.min(duration, frameToSeconds(Math.max(0, frame), compositionFps)));
  }, [compositionFps, disabled, duration, jumpFrame, onSeek]);

  const handleJumpSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      commitJumpFrame();
    },
    [commitJumpFrame],
  );

  const handleJumpKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      commitJumpFrame();
    },
    [commitJumpFrame],
  );

  return (
    <Tooltip label={t("Shortcuts and tools")}>
      <Popover
        open={showShortcuts}
        onOpenChange={setShowShortcuts}
        side="top"
        align="end"
        collisionAvoidance={STAY_ABOVE}
        aria-label={t("Keyboard shortcuts and tools")}
        initialFocus={panelBodyRef}
        className="flex max-h-[min(280px,var(--available-height))] min-w-[220px] flex-col border-border bg-raised p-0"
        trigger={
          <button
            type="button"
            className={`${showShortcuts ? flatActive : flatIdle} shrink-0`}
            aria-label={t("Shortcuts and tools")}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" />
            </svg>
          </button>
        }
      >
        <div ref={panelBodyRef} tabIndex={-1} className="min-h-0 overflow-y-auto outline-hidden">
          <div className="px-3 pt-3 pb-2.5">
            <p className="text-[9px] font-medium text-neutral-500 uppercase tracking-wider mb-1.5">
              {t("Jump to frame")}</p>
            <form onSubmit={handleJumpSubmit} className="flex items-center gap-1.5">
              <input
                value={jumpFrame}
                onChange={(e) => setJumpFrame(e.target.value)}
                disabled={disabled}
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={t("Jump to frame")}
                placeholder={t("frame number")}
                className="h-6 flex-1 rounded-sm border border-neutral-700 bg-neutral-900 px-2 text-[10px] font-mono tabular-nums text-neutral-200 outline-hidden transition-colors placeholder:text-neutral-600 focus:border-studio-accent/60"
                onKeyDown={handleJumpKeyDown}
                onBlur={commitJumpFrame}
              />
              <Tooltip label={t("Jump to frame")}>
                <button
                  type="submit"
                  disabled={disabled}
                  className="h-6 px-2 rounded-sm border border-neutral-700 text-[10px] text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-800 disabled:opacity-40"
                >
                  {t("Go")}</button>
              </Tooltip>
            </form>
          </div>
          <div className="border-t border-border" />
          <div className="px-3 pt-2.5 pb-2">
            <p className="text-[9px] font-medium text-neutral-500 uppercase tracking-wider mb-1.5">
              {t("Work area")}</p>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] rounded-sm border border-neutral-700 px-1.5 py-0.5 text-neutral-300 min-w-[20px] text-center bg-hover">
                    I
                  </span>
                  <span className="text-[10px] text-neutral-400">{t("In-point")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {inPoint !== null ? (
                    <>
                      <span className="font-mono text-[10px] text-neutral-300">
                        {formatTime(inPoint)}
                      </span>
                      <Tooltip label={t("Clear in-point")}>
                        <button
                          type="button"
                          onClick={() => setInPoint(null)}
                          className="w-4 h-4 flex items-center justify-center rounded-sm text-neutral-500 hover:text-neutral-200 transition-colors"
                          aria-label={t("Clear in-point")}
                        >
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </Tooltip>
                    </>
                  ) : (
                    <span className="text-[10px] text-neutral-600">{t("Not set")}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] rounded-sm border border-neutral-700 px-1.5 py-0.5 text-neutral-300 min-w-[20px] text-center bg-hover">
                    O
                  </span>
                  <span className="text-[10px] text-neutral-400">{t("Out-point")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {outPoint !== null ? (
                    <>
                      <span className="font-mono text-[10px] text-neutral-300">
                        {formatTime(outPoint)}
                      </span>
                      <Tooltip label={t("Clear out-point")}>
                        <button
                          type="button"
                          onClick={() => setOutPoint(null)}
                          className="w-4 h-4 flex items-center justify-center rounded-sm text-neutral-500 hover:text-neutral-200 transition-colors"
                          aria-label={t("Clear out-point")}
                        >
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </Tooltip>
                    </>
                  ) : (
                    <span className="text-[10px] text-neutral-600">{t("Not set")}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-border" />
          <div className="px-3 pt-2.5 pb-3 flex flex-col gap-3">
            {sections.map((section, sectionIndex) => (
              <div key={sectionIndex}>
                <p className="text-[9px] font-medium text-neutral-500 uppercase tracking-wider mb-1.5">
                  {t(section.title)}
                </p>
                <div className="flex flex-col gap-1">
                  {section.hints.map((hint, hintIndex) => (
                    <div key={hintIndex} className="flex items-center gap-3">
                      <span className="font-mono text-[10px] rounded-sm border border-neutral-700 px-1.5 py-0.5 text-neutral-300 min-w-[36px] text-center bg-hover">
                        {hint.key}
                      </span>
                      <span className="text-[10px] text-neutral-400">{t(hint.label)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Popover>
    </Tooltip>
  );
});

export interface ShortcutsButtonProps {
  sections?: readonly ShortcutSection[];
  disabled?: boolean;
  onSeek?: (time: number) => void;
}

export function ShortcutsButton({ sections, disabled = false, onSeek }: ShortcutsButtonProps) {
  const duration = usePlayerStore((s) => s.duration);
  const inPoint = usePlayerStore((s) => s.inPoint);
  const outPoint = usePlayerStore((s) => s.outPoint);
  const { setInPoint, setOutPoint, requestSeek } = usePlayerStore.getState();
  return (
    <ShortcutsPanel
      disabled={disabled}
      duration={duration}
      inPoint={inPoint}
      outPoint={outPoint}
      setInPoint={setInPoint}
      setOutPoint={setOutPoint}
      onSeek={onSeek ?? requestSeek}
      sections={sections}
    />
  );
}
