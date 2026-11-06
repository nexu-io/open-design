import { useI18n } from "../../i18n/I18n";
import { trackPreviewFeatureUsed } from "../../utils/previewFeatureUsage";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { MagnetStraight, GridFour, Path, Ruler, FrameCorners } from "@phosphor-icons/react";
import { usePlayerStore } from "../../player/store/playerStore";
import { usePreviewOverlayContext } from "./PreviewOverlayProvider";
import { ownsPlainKeys } from "../../utils/typingTarget";
import { keyHint, matchesKey, useStudioKeys } from "../../player/components/studioShortcuts";

// fallow-ignore-next-line complexity
export const SnapToolbar = memo(function SnapToolbar() {
  const { t } = useI18n();
  const keys = useStudioKeys();
  const [gridPopoverOpen, setGridPopoverOpen] = useState(false);
  const { state, actions } = usePreviewOverlayContext();
  const { snapPrefs: prefs, rulerVisible, safeMarginsVisible } = state;
  // Motion-path "set destination" toggle — shown only when the selected element
  // can take a path; arms a single canvas click to place it (MotionPathOverlay).
  const motionPathCreateAvailable = usePlayerStore((s) => s.motionPathCreateAvailable);
  const motionPathArmed = usePlayerStore((s) => s.motionPathArmed);
  const setMotionPathArmed = usePlayerStore((s) => s.setMotionPathArmed);
  const popoverRef = useRef<HTMLDivElement>(null);
  const gridButtonRef = useRef<HTMLButtonElement>(null);
  const gridSpacingAtFocus = useRef<number | null>(null);
  const currentGridSpacing = useRef(prefs.gridSpacing);
  currentGridSpacing.current = prefs.gridSpacing;
  const settleGridSpacing = useCallback(() => {
    const previous = gridSpacingAtFocus.current;
    gridSpacingAtFocus.current = null;
    if (previous !== null && previous !== currentGridSpacing.current)
      trackPreviewFeatureUsed("grid_spacing", "field");
  }, []);
  useEffect(() => settleGridSpacing, [settleGridSpacing]);

  const updatePrefs = useCallback(
    (patch: Partial<typeof prefs>) => {
      actions.setSnapPrefs(patch);
    },
    [actions],
  );

  const toggleSnap = useCallback(() => {
    updatePrefs({ snapEnabled: !prefs.snapEnabled });
    trackPreviewFeatureUsed("snapping", "button");
  }, [prefs.snapEnabled, updatePrefs]);

  const toggleGrid = useCallback(() => {
    updatePrefs({ gridVisible: !prefs.gridVisible });
    trackPreviewFeatureUsed("grid", "button");
  }, [prefs.gridVisible, updatePrefs]);

  useEffect(() => {
    // fallow-ignore-next-line complexity
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (ownsPlainKeys(e.target)) return;
      if (e.target instanceof HTMLIFrameElement) return;
      if (matchesKey(e, "snap")) {
        e.preventDefault();
        updatePrefs({ snapEnabled: !prefs.snapEnabled });
        if (!e.repeat) trackPreviewFeatureUsed("snapping", "keyboard");
      }
      if (matchesKey(e, "grid")) {
        e.preventDefault();
        updatePrefs({ gridVisible: !prefs.gridVisible });
        if (!e.repeat) trackPreviewFeatureUsed("grid", "keyboard");
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [prefs.gridVisible, prefs.snapEnabled, updatePrefs]);

  useEffect(() => {
    if (!gridPopoverOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || gridButtonRef.current?.contains(target)) return;
      settleGridSpacing();
      setGridPopoverOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [gridPopoverOpen, settleGridSpacing]);

  return (
    <div
      className="pointer-events-auto absolute top-2 right-2 z-50 flex items-center gap-1"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {motionPathCreateAvailable && (
        <button
          type="button"
          className={`rounded-md p-1.5 transition-colors active:scale-[0.95] ${
            motionPathArmed
              ? "bg-studio-accent/20 text-accent-ink"
              : "bg-black/40 text-white/60 hover:bg-black/60 hover:text-white/80"
          }`}
          onClick={() => setMotionPathArmed(!motionPathArmed)}
          title={
            motionPathArmed ? t("Click the canvas to set the destination") : t("Set motion destination")
          }
          aria-label={t("Set motion destination")}
        >
          <Path size={16} weight={motionPathArmed ? "fill" : "regular"} />
        </button>
      )}
      {(
        [
          ["rulerVisible", "Ruler", Ruler],
          ["safeMarginsVisible", "Safe margins", FrameCorners],
        ] as const
      ).map(([key, label, Icon]) => {
        const visible = key === "rulerVisible" ? rulerVisible : safeMarginsVisible;
        const toggle = key === "rulerVisible" ? actions.toggleRulers : actions.toggleSafeMargins;
        return (
          <button
            key={key}
            type="button"
            className={`rounded-md p-1.5 transition-colors active:scale-[0.95] ${
              visible
                ? "bg-studio-accent/20 text-accent-ink"
                : "bg-black/40 text-white/60 hover:bg-black/60 hover:text-white/80"
            }`}
            onClick={() => {
              toggle();
              trackPreviewFeatureUsed(key === "rulerVisible" ? "ruler" : "safe_margins", "button");
            }}
            title={t("{label} {state}", { label: t(label), state: t(visible ? "on" : "off") })}
            aria-label={t("Toggle {value0}", { value0: t(label.toLowerCase()) })}
            aria-pressed={visible}
          >
            <Icon size={16} weight={visible ? "fill" : "regular"} />
          </button>
        );
      })}
      <button
        type="button"
        className={`rounded-md p-1.5 transition-colors active:scale-[0.95] ${
          prefs.snapEnabled
            ? "bg-studio-accent/20 text-accent-ink"
            : "bg-black/40 text-white/60 hover:bg-black/60 hover:text-white/80"
        }`}
        onClick={toggleSnap}
        title={
          prefs.snapEnabled
            ? t("Snap enabled ({value0})", { value0: keyHint("snap", keys) })
            : t("Snap disabled ({value0})", { value0: keyHint("snap", keys) })
        }
        aria-label={t("Toggle snap")}
      >
        <MagnetStraight size={16} weight={prefs.snapEnabled ? "fill" : "regular"} />
      </button>

      <div className="relative">
        <button
          ref={gridButtonRef}
          type="button"
          className={`rounded-md p-1.5 transition-colors active:scale-[0.95] ${
            prefs.gridVisible
              ? "bg-studio-accent/20 text-accent-ink"
              : "bg-black/40 text-white/60 hover:bg-black/60 hover:text-white/80"
          }`}
          onClick={toggleGrid}
          onContextMenu={(e) => {
            e.preventDefault();
            if (gridPopoverOpen) settleGridSpacing();
            setGridPopoverOpen((v) => !v);
          }}
          title={
            prefs.gridVisible
              ? t("Grid visible ({value0}). Right-click for spacing options", { value0: keyHint("grid", keys) })
              : t("Grid hidden ({value0}). Right-click for spacing options", { value0: keyHint("grid", keys) })
          }
          aria-label={t("Toggle grid")}
        >
          <GridFour size={16} weight={prefs.gridVisible ? "fill" : "regular"} />
        </button>
        <button
          type="button"
          className="absolute -right-0.5 -bottom-0.5 rounded-sm p-0.5 text-white/50 hover:text-white/90 bg-black/50"
          onClick={() => {
            if (gridPopoverOpen) settleGridSpacing();
            setGridPopoverOpen((v) => !v);
          }}
          title={t("Grid options")}
          aria-label={t("Grid options")}
          aria-expanded={gridPopoverOpen}
        >
          <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
            <path d="M1 2.5l3 3 3-3z" />
          </svg>
        </button>

        {gridPopoverOpen && (
          <div
            ref={popoverRef}
            className="absolute right-0 top-full mt-1 rounded-lg bg-raised border border-border p-3 shadow-xl min-w-[180px]"
          >
            <label className="flex items-center justify-between text-xs text-white/80 mb-2">
              <span>{t("Grid spacing")}</span>
              <input
                type="number"
                min={10}
                max={500}
                step={10}
                value={prefs.gridSpacing}
                onFocus={() => {
                  gridSpacingAtFocus.current = prefs.gridSpacing;
                }}
                onBlur={settleGridSpacing}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                onChange={(e) => {
                  const val = Number.parseInt(e.target.value, 10);
                  if (
                    Number.isFinite(val) &&
                    val >= 10 &&
                    val <= 500 &&
                    val !== prefs.gridSpacing
                  ) {
                    updatePrefs({ gridSpacing: val });
                  }
                }}
                className="w-16 rounded-sm bg-neutral-900 border border-neutral-600 px-1.5 py-0.5 text-xs text-white text-right tabular-nums outline-hidden focus:border-studio-accent"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.snapToGrid}
                onChange={() => {
                  updatePrefs({ snapToGrid: !prefs.snapToGrid });
                  trackPreviewFeatureUsed("snap_to_grid", "button");
                }}
                className="accent-studio-accent"
              />
              <span>{t("Snap to grid")}</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
});
